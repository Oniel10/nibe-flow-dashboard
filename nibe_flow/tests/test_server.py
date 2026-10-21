import importlib.util
import unittest
from pathlib import Path
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

spec=importlib.util.spec_from_file_location("nibe_server",Path(__file__).parents[1]/"app/server.py")
server=importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
CONFIG={"entities":{"degree_minutes_40012":"number.dm","compressor_frequency_31066":"sensor.hz","mode":"select.mode","flag":"switch.flag"},"enable_controls":True}
STATES={"number.dm":{"state":"-30","attributes":{"min":-1000,"max":1000,"step":1}},"sensor.hz":{"state":"30","attributes":{}},"select.mode":{"state":"AUTO","attributes":{"options":["AUTO","MANUAL"]}},"switch.flag":{"state":"off","attributes":{}}}


class Validation(unittest.TestCase):
    def call(self,value,config=CONFIG):
        return server.validate_service({"domain":"number","service":"set_value","data":{"value":value},"target":{"entity_id":"number.dm"}},config,STATES)

    def test_degree_minutes_bounds(self):
        for value in [-400,0,100]:self.assertEqual(self.call(value)[2]["value"],value)
        for value in [-401,101,0.5,True,float("nan"),float("inf"),"20"]:
            with self.assertRaises(web.HTTPException):self.call(value)

    def test_locked_and_missing_state(self):
        with self.assertRaises(web.HTTPForbidden):self.call(10,{**CONFIG,"enable_controls":False})
        with self.assertRaises(web.HTTPConflict):server.validate_service({"domain":"number","service":"set_value","data":{"value":10},"target":{"entity_id":"number.dm"}},CONFIG,{"number.dm":{"state":"unavailable"}})

    def test_no_generic_service_proxy(self):
        for domain,service,target in [("homeassistant","restart","number.dm"),("number","set_value","number.other"),("switch","turn_on","number.dm")]:
            with self.assertRaises(web.HTTPException):server.validate_service({"domain":domain,"service":service,"data":{},"target":{"entity_id":target}},CONFIG,STATES)

    def test_native_selection_and_refresh(self):
        server.validate_service({"domain":"select","service":"select_option","data":{"option":"MANUAL"},"target":{"entity_id":"select.mode"}},CONFIG,STATES)
        with self.assertRaises(web.HTTPBadRequest):server.validate_service({"domain":"select","service":"select_option","data":{"option":"BOGUS"},"target":{"entity_id":"select.mode"}},CONFIG,STATES)
        server.validate_service({"domain":"homeassistant","service":"update_entity","data":{},"target":{"entity_id":"sensor.hz"}},{**CONFIG,"enable_controls":False},STATES)

    def test_bounded_timestamps(self):
        server.bounded_dates("2026-01-01T00:00:00Z","2027-01-01T00:00:00Z")
        for a,b in [("bad","bad"),("2026-01-01","2026-01-02"),("2026-01-01T00:00:00Z","2025-01-01T00:00:00Z"),("2024-01-01T00:00:00Z","2026-01-01T00:00:00Z")]:
            with self.assertRaises(web.HTTPBadRequest):server.bounded_dates(a,b)


class FakeBackend:
    def __init__(self):self.calls=[]
    async def admin(self,user):
        if user!="admin":raise web.HTTPForbidden(text="admin required")
    async def config(self):return CONFIG
    async def states(self):return STATES
    async def ws(self,q):self.calls.append(q);return {}
    async def rest(self,*args,**kwargs):self.calls.append(args);return STATES.get(args[1].removeprefix("states/"),[])


class Transport(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend=FakeBackend()
        app=server.make_app(self.backend)
        @web.middleware
        async def ingress_fixture(request,handler):
            if request.headers.get("Fixture-Ingress")=="yes":request=request.clone(remote="172.30.32.2")
            return await handler(request)
        app.middlewares.insert(0,ingress_fixture)
        self.client=TestClient(TestServer(app));await self.client.start_server()
        self.headers={"Fixture-Ingress":"yes","X-Remote-User-Id":"admin","X-Nibe-App":"1"}
    async def asyncTearDown(self):await self.client.close()

    async def test_headers_cannot_spoof_ingress_peer(self):
        response=await self.client.get("/api/config",headers={"X-Remote-User-Id":"admin"})
        self.assertEqual(response.status,403)

    async def test_missing_and_nonadmin_users_rejected(self):
        for user in ["", "reader"]:
            response=await self.client.get("/api/config",headers={**self.headers,"X-Remote-User-Id":user})
            self.assertEqual(response.status,403)
        self.assertEqual(self.backend.calls,[])

    async def test_no_generic_ws_or_external_history_proxy(self):
        for command in [{"type":"call_service"},{"type":"config/auth/list"}]:
            response=await self.client.post("/api/ws",json=command,headers=self.headers);self.assertEqual(response.status,403)
        response=await self.client.get("/api/history",params={"path":"https://evil.example/api/config"},headers=self.headers);self.assertEqual(response.status,403)
        self.assertEqual(self.backend.calls,[])

    async def test_statistics_and_csrf(self):
        q={"type":"recorder/statistics_during_period","statistic_ids":["number.dm"],"start_time":"2026-10-20T00:00:00Z","end_time":"2026-10-21T00:00:00Z","period":"day","types":["change"]}
        response=await self.client.post("/api/ws",json=q,headers={**self.headers,"Sec-Fetch-Site":"cross-site"});self.assertEqual(response.status,403)
        response=await self.client.post("/api/ws",json=q,headers=self.headers);self.assertEqual(response.status,200);self.assertEqual(self.backend.calls,[q])
        q["statistic_ids"]=["sensor.not_configured"]
        response=await self.client.post("/api/ws",json=q,headers=self.headers);self.assertEqual(response.status,403)

    async def test_real_control_guard_before_any_write(self):
        response=await self.client.post("/api/service",json={"domain":"number","service":"set_value","data":{"value":101},"target":{"entity_id":"number.dm"}},headers=self.headers)
        self.assertEqual(response.status,400);self.assertTrue(all(call[0]!="POST" for call in self.backend.calls))

    async def test_static_no_token_and_path_traversal(self):
        response=await self.client.get("/",headers=self.headers);self.assertEqual(response.status,200);self.assertNotIn("SUPERVISOR_TOKEN",await response.text())
        response=await self.client.get("/server.py",headers=self.headers);self.assertEqual(response.status,404)


if __name__=="__main__":unittest.main()
