import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => true };
globalThis.window = {};
const { normalizeConfig, createBridge, documentFor } = await import('../dist/nibe-flow-card.js');
const source = await readFile(new URL('../src/dashboard.js', import.meta.url), 'utf8');
const definitions = source.slice(source.indexOf('function wwDisplayMode'), source.indexOf('function renderWwSettings'));
const context = vm.createContext({}); vm.runInContext(definitions, context);

test('configuration starts read-only and maps no site-specific entities', () => {
  const config = normalizeConfig({});
  assert.equal(config.enable_controls, false);
  assert.equal(config.zero_temperature, 40);
  assert.deepEqual(config.entities, {});
});
test('configuration rejects invalid views, ids, roles and types', () => {
  for (const config of [{ default_view: 'invalid' }, { enable_controls: 'yes' },
    { zero_temperature: NaN }, { entities: { missing_role: 'sensor.x' } },
    { entities: { hot_water_charging_bt6_30010: '<script>' } }]) {
    assert.throws(() => normalizeConfig(config));
  }
});
test('configuration cannot break out of the boot script', () => {
  const html = documentFor(normalizeConfig({ title: '</script><script>bad()</script>' }));
  assert.equal(html.includes('</script><script>bad()'), false);
  assert.equal((html.match(/<script>/g) || []).length, 1);
});

test('boost rejects ambiguous or non-integer register configuration', () => {
  for(const config of [{boost_start_value:0},{boost_start_value:2.5},{boost_start_value:'2'},{boost_start_value:128},{boost_stop_value:true}]) assert.throws(()=>normalizeConfig(config));
  assert.equal(normalizeConfig({boost_start_value:null}).boost_start_value,null);
});
test('bridge blocks physical writes when read-only', async () => {
  let calls = 0;
  const bridge = createBridge({ states: {}, callService() { calls++; } }, normalizeConfig({ entities: { hot_water_demand_mode_40057: 'select.ww' } }));
  await assert.rejects(bridge.callService('select', 'select_option', { option: 'LARGE' }, { entity_id: 'select.ww' }));
  assert.equal(calls, 0);
});
test('bridge forwards only configured targets and approved services', async () => {
  const calls = [];
  const bridge = createBridge({ states: {}, callService: (...args) => calls.push(args) }, normalizeConfig({ enable_controls: true, entities: { nibe_ww_anzeige_nullpunkt: 'input_number.zero' } }));
  await assert.rejects(bridge.callService('homeassistant', 'restart', {}, { entity_id: 'input_number.zero' }));
  await assert.rejects(bridge.callService('input_number', 'set_value', { value: 40 }, { entity_id: 'input_number.other' }));
  await bridge.callService('input_number', 'set_value', { value: 40 }, { entity_id: 'input_number.zero' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'input_number');
});
test('bridge preserves hass method receiver for history and statistics', () => {
  const hass = { states: {}, callApi() { return this; }, callWS() { return this; } };
  const bridge = createBridge(hass, normalizeConfig({}));
  assert.equal(bridge.callApi(), hass); assert.equal(bridge.callWS(), hass);
});
for (const [pv, temperature, expected] of [[true, 48, 'MEDIUM'], [true, 48.1, 'LARGE'], [false, 60, 'MEDIUM'], [true, 47, 'MEDIUM'], [true, null, 'MEDIUM']]) {
  test('PV rule: pv=' + pv + ' temp=' + temperature, () => {
    assert.equal(context.wwDisplayMode('MEDIUM', pv, temperature, 48), expected);
  });
}
for (const [temperature, zero, stop, expected] of [[40, 40, 60, 0], [50, 40, 60, 50], [60.3, 40, 60, 100], [30, 40, 60, 0], [44, 40, 48, 50], [47, 42, 52, 50], [null, 40, 60, null], [45, 60, 60, null]]) {
  test('temperature level ' + [temperature, zero, stop].join('/'), () => {
    assert.equal(context.temperatureLevel(temperature, zero, stop), expected);
  });
}
test('start temperature is still displayed independently of zero threshold', () => {
  assert.ok(source.includes("put('tkMin',start)"));
  assert.ok(source.includes("put('mWwStart',pair?'Start '+start"));
  assert.ok(source.includes('window.WP_CONFIG.zero_temperature'));
});
test('no dependency on user browser DOM or third-party fonts', () => {
  const html = documentFor(normalizeConfig({}));
  assert.equal(html.includes("parent.document.querySelector('home-assistant')"), false);
  assert.equal(html.includes('fonts.googleapis.com'), false);
});
test('Home Assistant theme mode is forwarded without changing the state map', () => {
  const states = {};
  assert.equal(createBridge({ states, themes: { darkMode: true } }, normalizeConfig({})).darkMode, true);
  assert.equal(createBridge({ states, themes: { darkMode: false } }, normalizeConfig({})).darkMode, false);
  assert.equal(createBridge({ states }, normalizeConfig({})).darkMode, undefined);
});
test('overview includes dedicated desktop and mobile schemas and optional sources', () => {
  const html = documentFor(normalizeConfig({ entities: { wp_pv_power: '', brine_volume_flow: '' } }));
  assert.ok(html.includes('class="flow-desktop"'));
  assert.ok(html.includes('class="flow-mobile"'));
  assert.ok(html.includes('body:is(.overview,.settings,.analytics)[data-color-mode="dark"]'));
  assert.ok(html.includes('prefers-reduced-motion'));
});
const allocationContext=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function allocateSitePower'),source.indexOf('function renderOverview')),allocationContext);
for(const [name,args,expected] of [
 ['heating',[4,1,'HEAT'],[1,3]],
 ['hot water',[3,1,'HOT WATER'],[1,2]],
 ['heater',[3,3,'HEAT'],[3,0]],
 ['off',[0,0,'OFF'],[0,0]],
])test('thermal mix '+name,()=>{const mix=allocationContext.thermalMix(...args);assert.ok(mix);assert.deepEqual([mix.electricity,mix.environment],expected);assert.equal(mix.electricity+mix.environment,mix.total);});
for(const args of [[0,1,'HEAT'],[2,3,'HEAT'],[4,1,'COOLING'],[4,1,'HEAT',true],[null,1,'HEAT'],[4,-1,'HEAT'],[4,1,'OFF']])test('thermal mix rejects '+args,()=>assert.equal(allocationContext.thermalMix(...args),null));
for(const [name,inputs,expected] of [
 ['PV export',[.27,2.8,2.9,3,0,-4.3],[.27,0,0]],
 ['grid only',[1,0,0,0,0,2],[0,0,1]],
 ['battery and grid',[1,0,1,0,1,1],[0,.5,.5]],
 ['PV battery export',[1,2,2,1,1,-1],[.75,.25,0]],
 ['mixed sources',[1,1,1,1,1,2],[.375,.125,.5]],
 ['off',[0,0,0,0,0,0],[0,0,0]],
])test('site allocation: '+name,()=>{
 const result=allocationContext.allocateSitePower(...inputs);assert.ok(result);
 [result.pv,result.battery,result.grid].forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<1e-9));
 assert.ok(Math.abs(result.pv+result.battery+result.grid-inputs[0])<1e-9);
});
for(const inputs of [[1,NaN,1,1,0,1],[1,1,1,0,0,1],[1,1,0,1,0,-2],[2,0,0,0,0,1],[1,1,1,1,-1,1]])test('site allocation rejects invalid balance '+inputs,()=>{
 assert.equal(allocationContext.allocateSitePower(...inputs),null);
});
for(const [name,powers,gridFactor,intensity,rate] of [
 ['PV only',[1,0,0],218,54,54],
 ['battery only',[0,1,0],218,115,115],
 ['grid only',[0,0,1],218,218,218],
 ['mixed',[.5,.3,.2],218,105.1,105.1],
 ['lower WP power',[.1,.06,.04],218,105.1,21.02],
 ['PV without grid factor',[.2,0,0],null,54,10.8],
 ['off',[0,0,0],null,null,0],
])test('weighted WP CO2: '+name,()=>{
 const result=allocationContext.mixCO2(...powers,54,115,gridFactor);assert.ok(result);
 if(intensity===null)assert.equal(result.intensity,null);else assert.ok(Math.abs(result.intensity-intensity)<1e-9);
 assert.ok(Math.abs(result.rate-rate)<1e-9);
});
test('weighted WP CO2 rejects missing active factors and power',()=>{
 assert.equal(allocationContext.mixCO2(.5,0,.5,54,115,null),null);
 assert.equal(allocationContext.mixCO2(null,0,0,54,115,218),null);
 assert.equal(allocationContext.mixCO2(-1,0,0,54,115,218),null);
 assert.throws(()=>normalizeConfig({co2_pv_g_per_kwh:-1}));
 assert.throws(()=>normalizeConfig({co2_battery_g_per_kwh:NaN}));
});

test('history bridge forwards only configured existing entities',()=>{
 const calls=[],config=normalizeConfig({entities:{compressor_frequency_31066:'sensor.frequency'}});
 const bridge=createBridge({states:{'sensor.frequency':{state:'20'}}},config,id=>calls.push(id));
 bridge.moreInfo('sensor.other');bridge.moreInfo('sensor.frequency');
 assert.deepEqual(calls,['sensor.frequency']);
});
test('pump refresh uses only configured existing coordinator entity in read-only mode',async()=>{
 const calls=[],hass={states:{'sensor.frequency':{state:'20'}},callService:(...args)=>calls.push(args)};
 const bridge=createBridge(hass,normalizeConfig({entities:{compressor_frequency_31066:'sensor.frequency'}}));
 assert.equal(await bridge.refreshPump(),true);
 assert.deepEqual(calls,[['homeassistant','update_entity',{}, {entity_id:'sensor.frequency'}]]);
 assert.equal(await createBridge(hass,normalizeConfig({})).refreshPump(),false);
 assert.equal(await createBridge(hass,normalizeConfig({entities:{compressor_frequency_31066:'sensor.missing'}})).refreshPump(),false);
 assert.equal(calls.length,1);
});
