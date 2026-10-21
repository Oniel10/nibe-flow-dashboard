"""NIBE Flow: HA Ingress app, with a narrow server-side HA transport."""
import asyncio
import json
import logging
import math
import os
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from aiohttp import ClientError, ClientSession, ClientTimeout, web

STATIC = Path(__file__).parent / "static"
LOG = logging.getLogger("nibe_flow")
ENTITY = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
SERVICES = {"number.set_value", "input_number.set_value", "select.select_option", "switch.turn_on", "switch.turn_off"}


def bounded_dates(start, end, max_days=370):
    try:
        a, b = [datetime.fromisoformat(str(v).replace("Z", "+00:00")) for v in (start, end)]
        if a.tzinfo is None or b.tzinfo is None or not 0 < (b-a).total_seconds() <= max_days*86400:
            raise ValueError()
    except (ValueError, TypeError):
        raise web.HTTPBadRequest(text="Ungültiger Zeitraum.") from None


def validate_service(payload, config, states):
    if not isinstance(payload, dict) or set(payload) - {"domain", "service", "data", "target"}:
        raise web.HTTPBadRequest(text="Ungültige Aktion.")
    domain, service = payload.get("domain"), payload.get("service")
    target, data = payload.get("target"), payload.get("data", {})
    if not isinstance(target, dict) or set(target) != {"entity_id"} or not isinstance(data, dict):
        raise web.HTTPBadRequest(text="Genau eine konfigurierte Entität ist erforderlich.")
    entity_id = target["entity_id"]
    if not isinstance(entity_id, str) or entity_id not in config["entities"].values() or entity_id not in states:
        raise web.HTTPForbidden(text="Entität ist nicht freigegeben.")
    action = f"{domain}.{service}"
    if action == "homeassistant.update_entity":
        if entity_id != config["entities"].get("compressor_frequency_31066") or data:
            raise web.HTTPForbidden(text="Diese Aktualisierung ist nicht freigegeben.")
        return domain, service, data, target
    if not config.get("enable_controls") or action not in SERVICES or entity_id.split(".")[0] != domain:
        raise web.HTTPForbidden(text="Steuerung ist nicht freigegeben.")
    entity = states[entity_id]
    if entity.get("state") in ("unknown", "unavailable", None):
        raise web.HTTPConflict(text="Aktueller Anlagenwert fehlt.")
    attrs = entity.get("attributes", {})
    if service == "set_value":
        value = data.get("value")
        if set(data) != {"value"} or isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
            raise web.HTTPBadRequest(text="Ungültiger Zahlenwert.")
        low, high, step = [attrs.get(key) for key in ("min", "max", "step")]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (low, high, step)) or step <= 0:
            raise web.HTTPConflict(text="Grenzen der Entität sind nicht verfügbar.")
        if entity_id == config["entities"].get("degree_minutes_40012"):
            low, high = max(low, -400), min(high, 100)
        if not low <= value <= high or not math.isclose((value-attrs["min"])/step, round((value-attrs["min"])/step), abs_tol=1e-7):
            raise web.HTTPBadRequest(text="Wert liegt außerhalb der Grenzen oder Schrittweite.")
    elif service == "select_option":
        if set(data) != {"option"} or data["option"] not in attrs.get("options", []):
            raise web.HTTPBadRequest(text="Unbekannte Auswahl.")
    elif data:
        raise web.HTTPBadRequest(text="Unerwartete Steuerdaten.")
    return domain, service, data, target


class Backend:
    def __init__(self, token, options, session):
        self.token, self.options, self.session = token, options, session
        self.core = "http://supervisor/core/api/"
        self.ws_url = "ws://supervisor/core/websocket"
        self.supervisor = "http://supervisor/"
        self._config, self._config_time = None, 0
        self._admins, self._admins_time = set(), 0
        self._refresh_time = 0
        self._refresh_lock = asyncio.Lock()

    @property
    def headers(self):
        return {"Authorization": "Bearer " + self.token}

    async def rest(self, method, path, data=None, supervisor=False):
        base = self.supervisor if supervisor else self.core
        async with self.session.request(method, base+path, headers=self.headers, json=data, allow_redirects=False) as response:
            if response.status >= 300:
                raise web.HTTPBadGateway(text="Home Assistant hat die Abfrage abgelehnt.")
            return await response.json()

    async def ws(self, command):
        async with self.session.ws_connect(self.ws_url, heartbeat=20) as socket:
            hello = await asyncio.wait_for(socket.receive_json(), 30)
            if hello.get("type") != "auth_required":
                raise web.HTTPBadGateway(text="HA-WebSocket nicht verfügbar.")
            await socket.send_json({"type": "auth", "access_token": self.token})
            if (await asyncio.wait_for(socket.receive_json(), 30)).get("type") != "auth_ok":
                raise web.HTTPBadGateway(text="HA-Anmeldung fehlgeschlagen.")
            await socket.send_json({**command, "id": 1})
            while True:
                result = await asyncio.wait_for(socket.receive_json(), 40)
                if result.get("id") == 1:
                    if not result.get("success"):
                        raise web.HTTPBadGateway(text="HA-Abfrage nicht verfügbar.")
                    return result.get("result")

    async def admin(self, user_id):
        if not user_id:
            raise web.HTTPForbidden(text="Keine HA-Benutzerkennung. Bitte die App erneut über Home Assistant öffnen.")
        if time.monotonic()-self._admins_time > 30:
            users = await self.ws({"type": "config/auth/list"})
            self._admins = {u["id"] for u in users if u.get("is_active") and (u.get("is_owner") or "system-admin" in u.get("group_ids", []))}
            self._admins_time = time.monotonic()
        if user_id not in self._admins:
            raise web.HTTPForbidden(text="Diese App benötigt einen HA-Administrator.")

    async def config(self):
        if self._config is not None and time.monotonic()-self._config_time < 30:
            return self._config
        board = await self.ws({"type": "lovelace/config", "url_path": self.options["dashboard"]})
        configs = []
        def visit(value):
            if isinstance(value, dict):
                if value.get("type") in ("custom:nibe-flow-card", "custom:nibe-flow-card-v2"):
                    configs.append(value)
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)
        visit(board)
        if not configs:
            raise web.HTTPConflict(text="Keine NIBE-Flow-Karte im gewählten Dashboard gefunden.")
        entities = {}
        for c in configs:
            entities.update({k:v for k,v in c.get("entities", {}).items() if isinstance(v, str) and ENTITY.fullmatch(v)})
        keys = ("title", "model", "zero_temperature", "source_allocation", "co2_pv_g_per_kwh", "co2_battery_g_per_kwh")
        config = {k:v for k,v in configs[0].items() if k in keys}
        config.update(entities=entities, enable_controls=self.options["enable_controls"], show_navigation=True, default_view="overview")
        if self.options.get("eedc_slug"):
            config["eedc"] = {"addon_slug": self.options["eedc_slug"], "anlage_id": self.options["eedc_anlage_id"]}
        self._config, self._config_time = config, time.monotonic()
        return config

    async def states(self):
        config = await self.config()
        return {s["entity_id"]:s for s in await self.rest("GET", "states") if s["entity_id"] in config["entities"].values()}


@web.middleware
async def guard(request, handler):
    try:
        if request.remote != "172.30.32.2":
            raise web.HTTPForbidden(text="Nur Home Assistant Ingress ist zugelassen.")
        if request.path.startswith("/api/"):
            await request.app["backend"].admin(request.headers.get("X-Remote-User-Id"))
        if request.method == "POST" and (request.headers.get("X-Nibe-App") != "1" or request.content_type != "application/json" or request.headers.get("Sec-Fetch-Site") == "cross-site"):
            raise web.HTTPForbidden(text="Anfrageherkunft nicht freigegeben.")
        response = await handler(request)
    except web.HTTPException as error:
        response = web.json_response({"error": error.text}, status=error.status)
    except (TimeoutError, OSError, ValueError, KeyError, ClientError):
        response = web.json_response({"error": "HA-Verbindung oder Konfiguration nicht verfügbar."}, status=502)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


async def config_handler(request):
    return web.json_response(await request.app["backend"].config())


async def states_handler(request):
    return web.json_response(await request.app["backend"].states())


async def ws_handler(request):
    backend = request.app["backend"]
    q = await request.json()
    if not isinstance(q, dict) or q.get("type") != "recorder/statistics_during_period" or set(q)-{"type", "start_time", "end_time", "statistic_ids", "period", "types"}:
        raise web.HTTPForbidden(text="Nur Energie-Statistiken sind freigegeben.")
    ids = q.get("statistic_ids")
    allowed = set((await backend.config())["entities"].values())
    if not isinstance(ids, list) or not ids or len(ids)>30 or any(not isinstance(i, str) or i not in allowed for i in ids) or q.get("period") not in ("5minute", "day") or q.get("types") != ["change"]:
        raise web.HTTPForbidden(text="Statistikabfrage nicht freigegeben.")
    bounded_dates(q.get("start_time"), q.get("end_time"))
    return web.json_response(await backend.ws(q))


async def history_handler(request):
    backend = request.app["backend"]
    path = request.query.get("path", "")
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("history/period/"):
        raise web.HTTPForbidden(text="Nur konfigurierte Verläufe sind freigegeben.")
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query)-{"filter_entity_id", "end_time", "minimal_response", "no_attributes"}:
        raise web.HTTPBadRequest(text="Ungültige Verlaufsabfrage.")
    ids = query.get("filter_entity_id", [""])[0].split(",")
    allowed = set((await backend.config())["entities"].values())
    if not ids or len(ids)>30 or any(i not in allowed for i in ids):
        raise web.HTTPForbidden(text="Verlaufsentität ist nicht freigegeben.")
    bounded_dates(unquote(parsed.path[len("history/period/"):]), query.get("end_time", [None])[0], 31)
    return web.json_response(await backend.rest("GET", path))


async def service_handler(request):
    backend = request.app["backend"]
    config, payload = await backend.config(), await request.json()
    entity_id = payload.get("target", {}).get("entity_id") if isinstance(payload, dict) and isinstance(payload.get("target", {}), dict) else None
    state = await backend.rest("GET", "states/"+entity_id) if isinstance(entity_id, str) and ENTITY.fullmatch(entity_id) and entity_id in config["entities"].values() else None
    domain, service, data, target = validate_service(payload, config, {entity_id:state} if state else {})
    if domain == "homeassistant":
        async with backend._refresh_lock:
            if time.monotonic()-backend._refresh_time < 25:
                return web.json_response([])
            backend._refresh_time = time.monotonic()
            result = await backend.rest("POST", f"services/{domain}/{service}", {**data, **target})
    else:
        result = await backend.rest("POST", f"services/{domain}/{service}", {**data, **target})
    return web.json_response(result)


async def eedc_handler(request):
    backend = request.app["backend"]
    config = await backend.config()
    eedc = config.get("eedc")
    if not eedc:
        raise web.HTTPConflict(text="EEDC ist nicht konfiguriert.")
    path = request.query.get("path", "")
    prefix = "/api/energie-profil/"+str(eedc["anlage_id"])
    if not (re.fullmatch(re.escape(prefix)+r"/tagesprognose\?datum=\d{4}-\d{2}-\d{2}", path) or path==prefix+"/debug-rohdaten?tage=30"):
        raise web.HTTPForbidden(text="EEDC-Abfrage ist nicht freigegeben.")
    slug = eedc["addon_slug"]
    info = (await backend.rest("GET", "addons/"+slug+"/info", supervisor=True))["data"]
    port = info.get("ingress_port")
    if info.get("state") != "started" or not isinstance(port, int) or not 1<=port<=65535:
        raise web.HTTPBadGateway(text="EEDC läuft nicht oder hat keinen Ingress-Port.")
    # HA's documented internal app DNS; never accept arbitrary frontend hosts.
    url = "http://"+slug.replace("_", "-")+":"+str(port)+path
    async with backend.session.get(url, allow_redirects=False) as response:
        if response.status != 200:
            raise web.HTTPBadGateway(text="EEDC-Abfrage fehlgeschlagen.")
        return web.json_response(await response.json())


async def static_handler(request):
    name = request.match_info.get("name") or "index.html"
    if name not in {"index.html", "app.js", "card.js"}:
        raise web.HTTPNotFound()
    return web.FileResponse(STATIC/name)


def make_app(backend):
    app = web.Application(middlewares=[guard], client_max_size=65536)
    app["backend"] = backend
    app.router.add_get("/api/config", config_handler)
    app.router.add_get("/api/states", states_handler)
    app.router.add_post("/api/ws", ws_handler)
    app.router.add_get("/api/history", history_handler)
    app.router.add_post("/api/service", service_handler)
    app.router.add_get("/api/eedc", eedc_handler)
    app.router.add_get("/", static_handler)
    app.router.add_get("/{name}", static_handler)
    return app


async def main():
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        raise RuntimeError("Start requires Home Assistant Supervisor.")
    options = json.loads(Path("/data/options.json").read_text())
    if not re.fullmatch(r"[a-z0-9_-]+", options.get("dashboard", "")) or not re.fullmatch(r"[a-z0-9_]*", options.get("eedc_slug", "")) or not isinstance(options.get("enable_controls"), bool) or type(options.get("eedc_anlage_id")) is not int or options["eedc_anlage_id"]<1:
        raise RuntimeError("Invalid app options.")
    async with ClientSession(timeout=ClientTimeout(total=45)) as session:
        app = make_app(Backend(token, options, session))
        runner = web.AppRunner(app, access_log=None)
        await runner.setup()
        await web.TCPSite(runner, "0.0.0.0", 8099).start()
        LOG.info("NIBE Flow is ready through Home Assistant Ingress.")
        try:
            await asyncio.Event().wait()
        finally:
            await runner.cleanup()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
