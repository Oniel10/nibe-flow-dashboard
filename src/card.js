const VERSION = '__VERSION__';
const TEMPLATE = __TEMPLATE__;
const STYLE = __STYLE__;
const DRIVER = __DRIVER__;
const ROLES = __ROLES__;

export function normalizeConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Kartenkonfiguration fehlt.');
  const result = {
    title: 'Wärmepumpe', model: 'NIBE S1155-6 PC', default_view: 'overview',
    zero_temperature: 40, enable_controls: false, boost_start_value: 2, boost_stop_value: 0, show_navigation: true, source_allocation: 'direct', co2_pv_g_per_kwh: 54, co2_battery_g_per_kwh: 115, ...config,
    entities: { ...(config.entities || {}) },
  };
  if (!['overview', 'controls', 'energy', 'forecast'].includes(result.default_view)) {
    throw new Error('default_view muss overview, controls, energy oder forecast sein.');
  }
  if (typeof result.enable_controls !== 'boolean') throw new Error('enable_controls muss true oder false sein.');
  for (const key of ['boost_start_value', 'boost_stop_value']) {
    if (result[key] !== null && (!Number.isInteger(result[key]) || result[key] < -128 || result[key] > 127)) throw new Error(key + ' muss ein ganzzahliger s8-Registerwert oder null sein.');
  }
  if (result.boost_start_value !== null && result.boost_start_value === result.boost_stop_value) throw new Error('Boost-Start und -Stopp müssen verschieden sein.');
  if (typeof result.show_navigation !== 'boolean') throw new Error('show_navigation muss true oder false sein.');
  if (result.eedc != null && (!/^[a-z0-9_]+$/.test(result.eedc.addon_slug || '') || !Number.isSafeInteger(result.eedc.anlage_id) || result.eedc.anlage_id < 1)) {
    throw new Error('EEDC benötigt addon_slug und eine positive anlage_id.');
  }
  if (!['direct','site_proportional'].includes(result.source_allocation)) throw new Error('source_allocation muss direct oder site_proportional sein.');
  for(const key of ['co2_pv_g_per_kwh','co2_battery_g_per_kwh']){
    if(!Number.isFinite(result[key])||result[key]<0||result[key]>2000)throw new Error(key+' muss zwischen 0 und 2000 g CO₂e/kWh liegen.');
  }
  if (!Number.isFinite(result.zero_temperature) || result.zero_temperature < 0 || result.zero_temperature > 70) {
    throw new Error('zero_temperature muss zwischen 0 und 70 °C liegen.');
  }
  for (const [role, id] of Object.entries(result.entities)) {
    if (!ROLES.includes(role)) throw new Error('Unbekannte Entitätenrolle: ' + role);
    if (id !== '' && (typeof id !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(id))) {
      throw new Error('Ungültige Entity-ID für ' + role);
    }
  }
  result.title = String(result.title);
  result.model = String(result.model);
  return result;
}

const ingressClients = new WeakMap();
export async function readEedc(hass, config, path) {
  const id = config.eedc?.anlage_id;
  const allowed = typeof path === 'string' && (
    new RegExp('^/api/energie-profil/'+id+'/tagesprognose\\?datum=\\d{4}-\\d{2}-\\d{2}$').test(path) ||
    path==='/api/energie-profil/'+id+'/debug-rohdaten?tage=30');
  if (!config.eedc || !allowed) throw new Error('EEDC-Leseabfrage ist nicht freigegeben.');
  let client = ingressClients.get(config);
  if (!client || Date.now() - client.created > 180000) {
    // Same session/cookie flow as Home Assistant's native Ingress panel.
    client = {created: Date.now(), ready: (async () => {
      const info = await hass.callWS({type:'supervisor/api', endpoint:'/addons/'+config.eedc.addon_slug+'/info', method:'get'});
      const base = info.ingress_url;
      if (!/^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/?$/.test(base || '')) throw new Error('EEDC-Ingress ist nicht verfügbar.');
      const session = await hass.callWS({type:'supervisor/api', endpoint:'/ingress/session', method:'post'});
      if (!/^[A-Za-z0-9_-]+$/.test(session.session || '')) throw new Error('EEDC-Sitzung konnte nicht geöffnet werden.');
      document.cookie = 'ingress_session='+session.session+';path=/api/hassio_ingress/;SameSite=Strict'+(location.protocol==='https:'?';Secure':'');
      return base.replace(/\/$/,'');
    })()};
    ingressClients.set(config, client);
  }
  try {
    const base = await client.ready;
    const response = await fetch(base+path, {credentials:'same-origin', redirect:'error', signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error('EEDC-Abfrage fehlgeschlagen ('+response.status+').');
    if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('EEDC hat keine Prognosedaten geliefert.');
    return await response.json();
  } catch (error) { ingressClients.delete(config); throw error; }
}

export function createBridge(hass, config, moreInfo = () => {}) {
  const targets = new Set(Object.values(config.entities));
  const services = new Set(['number.set_value', 'input_number.set_value', 'select.select_option', 'switch.turn_on', 'switch.turn_off']);
  return {
    states: hass.states,
    darkMode: hass.themes?.darkMode,
    eedcRead: path => readEedc(hass, config, path),
    moreInfo: id => { if (targets.has(id) && hass.states[id]) moreInfo(id); },
    refreshPump: async () => {
      // One native NIBE coordinator refresh reads its enabled registers together.
      // Kept separate from physical writes; also available on read-only cards.
      const id = config.entities.compressor_frequency_31066;
      if (!id || !hass.states[id]) return false;
      await hass.callService('homeassistant', 'update_entity', {}, { entity_id: id });
      return true;
    },
    callApi: (...args) => hass.callApi(...args),
    callWS: (...args) => hass.callWS(...args),
    callService: (domain, service, data, target) => {
      if (!config.enable_controls) return Promise.reject(new Error('Steuerung ist ausgeschaltet.'));
      if (!services.has(domain + '.' + service)) return Promise.reject(new Error('Aktion ist nicht freigegeben.'));
      if (!target || typeof target.entity_id !== 'string' || !targets.has(target.entity_id)) {
        return Promise.reject(new Error('Ziel ist nicht in der Karte konfiguriert.'));
      }
      return hass.callService(domain, service, data, target);
    },
  };
}

export function documentFor(config) {
  // Escape config inside the script context; names never become markup.
  const settings = JSON.stringify(config).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>' + STYLE + '</style></head><body>' + TEMPLATE +
    '<script>window.WP_CONFIG=' + settings + ';' + DRIVER + '</script></body></html>';
}

export class NibeFlowCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  setConfig(config) { this._config = normalizeConfig(config); this._render(); }
  set hass(hass) { this._hass = hass; this._sync(); }
  connectedCallback() { if (this._config && !this._frame) this._render(); }
  disconnectedCallback() { this._dispose(); }
  _dispose() {
    this._frame?.contentWindow?.__NIBE_DISPOSE?.();
    this._frame?.remove(); this._frame = null;
  }
  _render() {
    this._dispose();
    const style = document.createElement('style');
    style.textContent = ':host{display:block;min-width:0}iframe{display:block;width:100%;height:900px;border:0;border-radius:var(--ha-card-border-radius,12px)}';
    const frame = document.createElement('iframe');
    frame.title = this._config.title; frame.setAttribute('scrolling', 'no');
    frame.onload = () => this._sync();
    frame.srcdoc = documentFor(this._config);
    this.shadowRoot.replaceChildren(style, frame); this._frame = frame;
  }
  _sync() {
    if (!this._frame?.contentWindow || !this._hass) return;
    this._frame.contentWindow.__NIBE_HASS = createBridge(this._hass, this._config, id => {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true }));
    });
    this._frame.contentWindow.__NIBE_TICK?.();
  }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', rows: 'auto', min_columns: 12 }; }
  static getConfigElement() { return document.createElement('nibe-flow-card-editor'); }
  static getStubConfig() { return { type: 'custom:nibe-flow-card', entities: {}, enable_controls: false }; }
}

class NibeFlowEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = hass; });
  }
  setConfig(config) { this._config = normalizeConfig(config); this._render(); }
  _change(key, value) {
    this._config = { ...this._config, [key]: value };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _render() {
    this.shadowRoot.replaceChildren();
    const style = document.createElement('style');
    style.textContent = 'label{display:block;margin:12px 0}input,select{display:block;box-sizing:border-box;width:100%;padding:10px;font:inherit}input[type=checkbox]{display:inline;width:auto}ha-entity-picker{display:block;margin:10px 0}summary{cursor:pointer;padding:14px 0}small{color:var(--secondary-text-color)}';
    this.shadowRoot.appendChild(style);
    const field = (label, key, type = 'text') => {
      const wrap = document.createElement('label'); wrap.textContent = label;
      const input = document.createElement('input'); input.type = type;
      if (type === 'checkbox') input.checked = this._config[key]; else input.value = this._config[key];
      if (type === 'number') { input.min = '0'; input.max = key==='zero_temperature'?'70':'2000'; input.step = '0.5'; }
      input.onchange = () => this._change(key, type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value);
      wrap.appendChild(input); this.shadowRoot.appendChild(wrap);
    };
    field('Titel', 'title'); field('Anlagenbezeichnung', 'model');
    field('Temperatur für 0 % ohne Zahlenhelfer (°C)', 'zero_temperature', 'number');
    field('Steuerung erlauben', 'enable_controls', 'checkbox');
    field('CO₂-Faktor PV (g CO₂e/kWh)', 'co2_pv_g_per_kwh', 'number');
    field('CO₂-Faktor Batteriestrom (g CO₂e/kWh)', 'co2_battery_g_per_kwh', 'number');
    const label = document.createElement('label'); label.textContent = 'Startansicht';
    const select = document.createElement('select');
    for (const [value, title] of [['overview', 'Übersicht'], ['controls', 'Steuerung'], ['energy', 'Energie'], ['forecast', 'Prognose']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = title; select.appendChild(option);
    }
    select.value = this._config.default_view; select.onchange = () => this._change('default_view', select.value);
    label.appendChild(select); this.shadowRoot.appendChild(label);
    const sourceLabel=document.createElement('label');sourceLabel.textContent='Stromherkunft';
    const sourceSelect=document.createElement('select');
    for(const [value,title] of [['direct','Direkt zugeordnete WP-Leistungen'],['site_proportional','Rechnerischer Anteil am Hausstrommix']]){
      const option=document.createElement('option');option.value=value;option.textContent=title;sourceSelect.appendChild(option);
    }
    sourceSelect.value=this._config.source_allocation;sourceSelect.onchange=()=>this._change('source_allocation',sourceSelect.value);
    sourceLabel.appendChild(sourceSelect);this.shadowRoot.appendChild(sourceLabel);
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = 'Entitäten zuordnen'; details.appendChild(summary);
    const note = document.createElement('small'); note.textContent = 'Leere Zuordnungen bleiben nicht verfügbar. Register-Entitäten anhand der eigenen Anlage prüfen.';
    details.appendChild(note);
    for (const role of ROLES) {
      const picker = document.createElement('ha-entity-picker'); picker.label = role.replaceAll('_', ' ');
      picker.hass = this._hass; picker.value = this._config.entities[role] || '';
      picker.addEventListener('value-changed', event => {
        event.stopPropagation();
        this._change('entities', { ...this._config.entities, [role]: event.detail.value || '' });
      }); details.appendChild(picker);
    }
    this.shadowRoot.appendChild(details);
  }
}

if (!customElements.get('nibe-flow-card')) customElements.define('nibe-flow-card', NibeFlowCard);
if (!customElements.get('nibe-flow-card-editor')) customElements.define('nibe-flow-card-editor', NibeFlowEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'nibe-flow-card')) window.customCards.push({
  type: 'nibe-flow-card', name: 'NIBE Flow Card', preview: true,
  description: 'Animierte Wärmepumpenübersicht mit Heizen, passiver Kühlung und Warmwasser.',
});
console.info('NIBE Flow Card ' + VERSION);
