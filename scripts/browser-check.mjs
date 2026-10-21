// Optional integration check. Requires Playwright and its Chromium browser.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.PLAYWRIGHT_MODULE;
const { chromium } = moduleName ? await import(pathToFileURL(moduleName)) : await import('playwright');
const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const asset = await readFile(process.env.CARD_ASSET ? resolve(process.env.CARD_ASSET) : new URL('../dist/nibe-flow-card.js', import.meta.url));
const map = JSON.parse(await readFile(new URL('../examples/entities.s1155.json', import.meta.url)));
map.pv_panel_affects_heating_eme_41070='switch.demo_pv_heating';
for (const role of ['battery_state_of_charge','brine_volume_flow','calculated_supply_temperature','wp_pv_power','wp_battery_power','wp_grid_power','wp_co2_intensity','wp_grid_co2_intensity','site_solar_ac_power','site_hybrid_ac_power','site_hybrid_pv_dc_power','site_battery_discharge_dc_power','site_grid_signed_power']) map[role]='sensor.demo_'+role;
const states = Object.fromEntries(Object.entries(map).map(([role, id]) => [id, { entity_id: id, state: '0', attributes: { min: 0, max: 100, step: 0.1 } }]));
const set = (role, state, attributes = {}) => { states[map[role]] = { entity_id: map[role], state: String(state), attributes }; };
for (const [role, value] of Object.entries({ brine_in_bt10_30011: 8.2, brine_out_bt11_30012: 5.4, condenser_eb100_bt2_31524: 32.5, return_line_bt3_30008: 28.1, hot_water_charging_bt6_30010: 55, condenser_bt12_30013: 32.5, current_outdoor_temperature_bt1_30002: 10.2, compressor_frequency_31066: 43, instantaneous_used_power_32167: 1180, power_internal_additional_heat_31028: 0, brine_pump_speed_gp2_31105: 56, flow_sensor_bf1_30041: 12, nibe_warmeleistung_2: 3.68, nibe_cop_2: 3.12, nibe_kuehlleistung: 0, degree_minutes_40012: -85 })) set(role, value);
set('priority_31029', 'HEAT'); set('reversing_valve_hot_water_qn10_32197', 'off');
set('battery_state_of_charge',88.6,{unit_of_measurement:'%'});
set('nibe_leistungsberechnung_status', 'Demo · aus Beispieldaten');
set('hot_water_demand_mode_40057', 'MEDIUM', { options: ['SMALL', 'MEDIUM', 'LARGE', 'SMART CONTROL'] });
set('pv_panel_affects_hot_water_eme_41071', 'on');
set('pv_panel_affects_heating_eme_41070','on');
set('nibe_ww_anzeige_nullpunkt', 40, { min: 20, max: 60, step: 0.5, unit_of_measurement: '°C' });
for(const [role,value,min,max,step,unit] of [
 ['degree_minutes_40012',-120.1,-3000,3000,.1,'DM'],
 ['heating_offset_climate_system_1_40031',2,-10,10,1,''],
 ['cooling_offset_climate_system_1_40976',-9,-10,10,1,''],
 ['stop_temperature_hw_periodic_increase_40062',55,40,70,.5,'°C'],
 ['acs_thermostat_hysteresis_between_compressors_41029',2,0,10,1,'°C'],
 ['cooling_degree_minutes_40021',0,-3000,3000,.1,'DM'],
 ['power_kw_required_for_dimensioned_outdoor_temperature_44200',6,0,30,.1,'kW']
])set(role,value,{min,max,step,unit_of_measurement:unit});
for (const [start, stop, a, b] of [['low', 'low', 35, 41], ['normal', 'normal', 42, 48], ['high', 'high', 55, 60]]) {
  const startRole = Object.keys(map).find(role => role.startsWith('start_temperature_hw_' + start));
  const stopRole = Object.keys(map).find(role => role.startsWith('stop_temperature_hw_' + stop));
  set(startRole, a, { min: 5, max: 70, step: 0.1, unit_of_measurement: '°C' });
  set(stopRole, b, { min: 5, max: 70, step: 0.1, unit_of_measurement: '°C' });
}
const demoHistory=['condenser_eb100_bt2_31524','brine_in_bt10_30011','brine_out_bt11_30012','current_outdoor_temperature_bt1_30002'].map((role,i)=>Array.from({length:49},(_,n)=>({entity_id:map[role],last_changed:new Date(Date.now()-86400000+n*1800000).toISOString(),state:n>=9&&n<24?'unavailable':String(([28,13,8,12][i])+Math.sin(n/7+i)*(i===0?1.2:1.8)+(i===0&&n===37?14:0))})));
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e9eff1}</style><script type="module">
import '/nibe-flow-card.js';
window.calls=[];window.refreshCalls=[];
window.fixture={themes:{darkMode:false},states:${JSON.stringify(states)},callApi:async()=>${JSON.stringify(demoHistory)},callWS:async()=>({${JSON.stringify(map.energy_used_total_kwh)}:[{change:5}],${JSON.stringify(map.energy_produced_total_kwh)}:[{change:35.1}]}),callService:async(domain,service,data,target)=>{
 if(domain==='homeassistant'&&service==='update_entity'){window.refreshCalls.push({domain,service,data,target});return;}
 window.calls.push({domain,service,data,target});
 const s=fixture.states[target.entity_id];s.state=String(data.value??data.option??(service==='turn_on'?'on':'off'));
 card.hass=fixture;
}};
window.card=document.createElement('nibe-flow-card');window.config={title:'Wärmepumpe',model:'NIBE S1155-6 · Sole/Wasser',entities:${JSON.stringify(map)},enable_controls:false};
card.setConfig(config);card.hass=fixture;document.body.appendChild(card);
</script>`;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/nibe-flow-card.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/nibe-flow-card.js' ? asset : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage(); const errors = [];
  await page.clock.install();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const frame = page.frameLocator('iframe');
  if(!await frame.locator('#live_c_pvh').isDisabled()||!await frame.locator('#live_c_pvw').isDisabled())throw new Error('Live-PV ist im Lesemodus bedienbar.');
  await frame.locator('.flow-desktop [data-bind="batterySoc"]').filter({hasText:'88,6 %'}).waitFor();
  const socFill=await frame.locator('.flow-desktop .battery-fill').getAttribute('width');
  if(Math.abs(Number(socFill)-40*.886)>1e-8)throw new Error('Batteriefüllung entspricht nicht dem echten SoC.');
  const aligned=await frame.locator('.flow-desktop').evaluate(svg=>['.electric-origin','.thermal-origin'].every(selector=>{
   const panel=svg.querySelector(selector),names=[...panel.querySelectorAll('.source-name')],values=[...panel.querySelectorAll('.source-detail')];
   return names.every((n,i)=>n.getAttribute('x')===values[i].getAttribute('x'))&&new Set(names.map(n=>n.getAttribute('x'))).size===1;
  }));if(!aligned)throw new Error('Herkunftsbezeichnungen und Werte sind nicht einheitlich eingerückt.');
  const socFits=await frame.locator('.flow-desktop .battery-soc').evaluate(node=>{const text=node.querySelector('text').getBBox(),shell=node.querySelector('.battery-shell').getBBox();return text.x>=shell.x&&text.x+text.width<=shell.x+shell.width;});
  if(!socFits)throw new Error('Ladezustand passt nicht ins Batteriesymbol.');
  if(!(await frame.locator('.flow-desktop [data-bind="thermalEnvironmentDetail"]').textContent()).includes('2,50 kW'))throw new Error('Umweltenergie nicht als Wärme minus Strom berechnet.');
  if(await frame.locator('.flow-desktop .thermal-origin .ring-label').textContent()!=='kW Wärme')throw new Error('Wärmering falsch beschriftet.');
  await page.evaluate(()=>{fixture.states[config.entities.priority_31029].state='COOLING';card.hass=fixture;});
  if(await frame.locator('.flow-desktop [data-bind="thermalPower"]').textContent()!=='–')throw new Error('Passive Kühlung wird als Heizwärmemix angezeigt.');
  await page.evaluate(()=>{fixture.states[config.entities.priority_31029].state='HEAT';fixture.states[config.entities.battery_state_of_charge].state='unavailable';card.hass=fixture;});
  if(await frame.locator('.flow-desktop [data-bind="batterySoc"]').textContent()!=='–')throw new Error('Fehlender SoC wird erfunden.');
  await page.evaluate(()=>{fixture.states[config.entities.battery_state_of_charge].state='88.6';card.hass=fixture;});
  await frame.locator('#tkMin').filter({ hasText: '55,0' }).waitFor({state:'attached'});
  if (await frame.locator('#hWwPct').textContent() !== '75 %') throw new Error('Falscher Temperaturstand.');
  const checkAnimation=async (selector,mobile,ww=false)=>frame.locator(selector).evaluate((svg,{mobile,ww})=>{
    const cold=svg.querySelector('.new-flow.cold.sole'),start=cold.getPointAtLength(0),end=cold.getPointAtLength(cold.getTotalLength());
    if(!(start.x>end.x)||getComputedStyle(cold).animationDirection!=='normal')throw Error('Sole-Rücklauf bewegt sich nicht zum Quelleneintritt.');
    const returnPath=svg.querySelector('.new-flow.cold.heating'),a=returnPath.getPointAtLength(0),b=returnPath.getPointAtLength(returnPath.getTotalLength());
    if(mobile?!(b.y<a.y):!(b.x<a.x))throw Error('Heizungs-Rücklauf führt nicht zur Wärmepumpe.');
    if(mobile){
      const wwReturn=svg.querySelector('.new-flow.cold.ww'),wwStart=wwReturn.getPointAtLength(0),wwEnd=wwReturn.getPointAtLength(wwReturn.getTotalLength());
      if(wwStart.x!==553||wwStart.y!==658||wwEnd.x!==553||wwEnd.y!==605)throw Error('WW-Rücklauf kommt nicht direkt aus dem Speicherfeld.');
      if(ww&&getComputedStyle(returnPath).opacity!=='0')throw Error('Heizkreis-Rücklauf erscheint während WW-Ladung aktiv.');
      if(!ww&&getComputedStyle(wwReturn).opacity!=='0')throw Error('WW-Rücklauf erscheint während Heizen aktiv.');
      const supply=svg.querySelector('.new-flow.warm.ww'),length=supply.getTotalLength();
      const start=supply.getPointAtLength(0),end=supply.getPointAtLength(length);
      if(start.x!==411||start.y!==544||end.x!==411||end.y!==659||Math.abs(length-115)>.01)throw Error('Mobiler WW-Vorlauf ist nicht gerade am Ventil angeschlossen.');
      for(const t of [0,.25,.5,.75,1])if(Math.abs(supply.getPointAtLength(t*length).x-411)>.01)throw Error('Knick im mobilen WW-Vorlauf.');
      const inlet=svg.querySelector('.inlet-port'),heat=svg.querySelector('.heat-port'),water=svg.querySelector('.ww-port');
      const returnValue=svg.querySelector('[data-bind="hRl"]'),returnBox=returnValue.getBBox();
      if(returnBox.x<411+29+8)throw Error('Rücklauftemperatur überlagert Vorlauf oder Ventil.');
      if(inlet.getBBox().y+inlet.getBBox().height>=0||(!ww&&heat.getBBox().x+heat.getBBox().width>=0)||(ww&&water.getBBox().y<=0))throw Error('Ventilanschlüsse zeigen nicht zum aktiven Anschluss.');
      if(getComputedStyle(ww?heat:water).display!=='none'||getComputedStyle(ww?water:heat).display==='none')throw Error('Falscher mobiler Ventilausgang ist offen.');
    }
    svg.pauseAnimations();
    const valve=svg.querySelector('.new-valve'),dot=valve.querySelector('.valve-stream.'+(ww?'ww':'heating')+' .valve-dot');
    if(getComputedStyle(dot.parentNode).display==='none')throw Error('Aktiver Ventilstrom ist unsichtbar.');
    const point=()=>new DOMPoint(0,0).matrixTransform(dot.getCTM()).matrixTransform(valve.getCTM().inverse());
    svg.setCurrentTime(.2);const p=point();svg.setCurrentTime(1.1);const q=point();
    if(Math.hypot(q.x-p.x,q.y-p.y)<10)throw Error('Ventilkugel bewegt sich nicht.');
    if(mobile?!(q.y>p.y):!(q.x>p.x))throw Error('Ventilkugel fließt entgegen der Zuleitung.');
    svg.unpauseAnimations();
  },{mobile,ww});
  await checkAnimation('.flow-desktop',false);
  await page.setViewportSize({width:390,height:844});await checkAnimation('.flow-mobile',true);
  await page.evaluate(()=>{fixture.states[config.entities.reversing_valve_hot_water_qn10_32197].state='on';card.hass=fixture;});
  await checkAnimation('.flow-mobile',true,true);
  await mkdir(new URL('../docs/images', import.meta.url), { recursive: true });
  await frame.locator('.flow-mobile').screenshot({path:root+'/docs/images/mobile-flow-ww.png'});
  await page.setViewportSize({width:1280,height:900});await checkAnimation('.flow-desktop',false,true);
  await page.evaluate(()=>{fixture.states[config.entities.reversing_valve_hot_water_qn10_32197].state='off';card.hass=fixture;});
  await page.evaluate(()=>{
    for(const [role,value] of Object.entries({site_solar_ac_power:2800,site_hybrid_ac_power:2900,site_hybrid_pv_dc_power:3000,site_battery_discharge_dc_power:0,site_grid_signed_power:-4300})){
      fixture.states[config.entities[role]].state=String(value);fixture.states[config.entities[role]].attributes.unit_of_measurement='W';
    }
    fixture.states[config.entities.wp_grid_co2_intensity].state='218';
    fixture.states[config.entities.wp_co2_intensity].state='unavailable';
    card.setConfig({...config,source_allocation:'site_proportional'});card.hass=fixture;
  });
  await frame.locator('.flow-desktop [data-bind="pvDetail"]').filter({hasText:'100 %'}).waitFor();
  const powerSegments=()=>frame.locator('.power-connection').evaluate(node=>['pv','battery','grid'].map(key=>Number(node.querySelector('.source-'+key).getAttribute('width'))));
  if(JSON.stringify(await powerSegments())!==JSON.stringify([20,0,0]))throw new Error('PV-Verbindung zeigt falschen Strommix.');
  if(!await frame.locator('.flow-desktop [data-bind="co2Line"]').textContent().then(s=>s.includes('CO₂ ≈ 54 g/kWh')))throw new Error('PV-Mix-CO₂ wird nicht berechnet.');
  await page.evaluate(()=>{fixture.states[config.entities.site_grid_signed_power].state='-8000';card.hass=fixture;});
  if(await frame.locator('.flow-desktop [data-bind="pvDetail"]').textContent()!=='–')throw new Error('Ungültige Bilanz wird als Messwert angezeigt.');
  if((await powerSegments()).some(v=>v!==0))throw new Error('Unbekannte Herkunft zeigt erfundene Farbanteile.');
  await page.evaluate(()=>{card.setConfig(config);card.hass=fixture;});
  await mkdir(new URL('../docs/images', import.meta.url), { recursive: true });
  await page.evaluate(() => {
    for(const [role,value] of Object.entries({brine_in_bt10_30011:13.2,brine_out_bt11_30012:8,condenser_eb100_bt2_31524:27.1,return_line_bt3_30008:25.5,hot_water_charging_bt6_30010:47.5,current_outdoor_temperature_bt1_30002:12,compressor_frequency_31066:20,instantaneous_used_power_32167:220,nibe_warmeleistung_2:1.66,nibe_cop_2:7.55,flow_sensor_bf1_30041:14.8,degree_minutes_40012:-120.1,brine_volume_flow:18.5,calculated_supply_temperature:28.4,wp_pv_power:.15,wp_battery_power:.05,wp_grid_power:.02,wp_co2_intensity:68,wp_grid_co2_intensity:130})){
      fixture.states[config.entities[role]].state=String(value);
      if(['wp_pv_power','wp_battery_power','wp_grid_power'].includes(role))fixture.states[config.entities[role]].attributes.unit_of_measurement='kW';
      if(role==='brine_volume_flow')fixture.states[config.entities[role]].attributes.unit_of_measurement='l/min';
    }
    fixture.callWS=async()=>({[config.entities.energy_used_total_kwh]:[{change:5}],[config.entities.energy_produced_total_kwh]:[{change:35.1}]});
    card.hass=fixture;
  });
  for (const [size,width,height] of [['desktop',1568,1000],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    for(const dark of [false,true]) {
      await page.evaluate(dark=>{fixture.themes.darkMode=dark;card.hass=fixture;},dark);
      await frame.locator('body').filter({has:frame.locator('#v1')}).waitFor();
      await page.waitForTimeout(850);
      if(await frame.locator('body').getAttribute('data-color-mode')!==(dark?'dark':'light'))throw new Error('HA-Farbmodus wurde nicht übernommen.');
      if(await frame.locator('main').evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth))throw new Error('Horizontaler Überlauf: '+size);
      const clipped = await frame.locator('header').evaluate(node=>[...node.querySelectorAll('.state span,h1,#liveBadge')].some(el=>{const r=el.getBoundingClientRect();return r.right>document.documentElement.clientWidth+1||r.left<0;}));
      if(clipped)throw new Error('Kopfzeile abgeschnitten: '+size);
      await frame.locator('#dataBadge').evaluate(node=>node.textContent='Beispielwerte');
      await frame.locator('.source-label').evaluate(node=>node.textContent='Demo-Werte · simulierte Entitäten');
      await page.screenshot({path:root+'/docs/images/'+size+'-'+(dark?'dark':'light')+'.png',fullPage:true});
      if(size==='mobile')await frame.locator('.flow-mobile').screenshot({path:root+'/docs/images/mobile-flow-'+(dark?'dark':'light')+'.png'});
    }
  }
  const mixedWidths=await powerSegments();
  if(mixedWidths.some((value,i)=>Math.abs(value-[.15,.05,.02][i]/.22*20)>1e-8))throw new Error('Verbindungsbreiten passen nicht zum Herkunftsdiagramm.');
  await page.evaluate(()=>{fixture.states[config.entities.hot_water_charging_bt6_30010].state='55';card.hass=fixture;});
  await frame.locator('#t3').click();
  if(await frame.locator('.row-actions:not([hidden])').count())throw new Error('Speichern ist vor einer Änderung sichtbar.');
  if(await frame.locator('.previous-value:not([hidden])').count())throw new Error('Vorher ist ohne Änderung sichtbar.');
  if (!await frame.locator('#c_wwZero').isDisabled()) throw new Error('Read-only-Regler ist aktiv.');
  await page.evaluate(() => { card.setConfig({ ...config, enable_controls: true, default_view: 'controls' }); });
  await frame.locator('#c_wwZero').waitFor();
  await frame.locator('#c_wwZero').evaluate(input => { input.value = '42'; input.dispatchEvent(new Event('input')); });
  await frame.locator('#save_wwZero').click();
  await page.waitForFunction(() => calls.length === 1 && calls[0].domain === 'input_number' && calls[0].data.value === 42);
  await frame.locator('#toast').filter({ hasText: 'bestätigt' }).waitFor();
  if(await frame.locator('#before_wwZero').isVisible())throw new Error('Vorher bleibt nach Speichern sichtbar.');
  await frame.locator('#c_wwb').selectOption('SMALL');
  await frame.locator('#save_wwb').click();
  await page.waitForFunction(() => calls.length === 2 && calls[1].domain === 'select' && calls[1].data.option === 'SMALL');
  await frame.locator('#toast').filter({ hasText: 'bestätigt' }).waitFor();
  // Two independent drafts: save only zero, leave WW stop staged.
  await frame.locator('#c_wwZero').evaluate(input=>{input.value='43';input.dispatchEvent(new Event('input'));});
  await frame.locator('#c_wwMediumStop').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input'));});
  await frame.locator('#save_wwZero').click();await frame.locator('#toast').filter({hasText:'bestätigt'}).waitFor();
  if(await page.evaluate(()=>calls.length)!==3)throw new Error('Einzelnes Speichern schreibt andere Änderungen.');
  if(!await frame.locator('#actions_wwMediumStop').isVisible())throw new Error('Andere Änderung verloren.');
  await frame.locator('#c_wwMediumStop').evaluate(input=>{input.value='48';input.dispatchEvent(new Event('input'));});
  if(await frame.locator('#actions_wwMediumStop').isVisible())throw new Error('Speichern bleibt nach Rückkehr zum Istwert sichtbar.');
  if(await frame.locator('#before_wwMediumStop').isVisible())throw new Error('Vorher bleibt nach Rückkehr zum Istwert sichtbar.');
  if(!(await frame.locator('#before_wwZero').textContent()).includes('42'))throw new Error('Vorheriger Wert nach Speichern verloren.');
  // The individual write must be valid against the actual counterpart, not another draft.
  await frame.locator('#c_wwMediumStop').evaluate(input=>{input.value='56';input.dispatchEvent(new Event('input'));});
  await frame.locator('#c_wwMediumStart').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input'));});
  await frame.locator('#save_wwMediumStart').click();
  if(await page.evaluate(()=>calls.length)!==3)throw new Error('WW Start ignoriert gespeicherte Stoppgrenze.');
  await frame.locator('#r_wwMediumStart .row-actions button').first().click();
  await frame.locator('#r_wwMediumStop .row-actions button').first().click();
  // External updates reject stale drafts without any write.
  await frame.locator('#c_wwZero').evaluate(input=>{input.value='44';input.dispatchEvent(new Event('input'));});
  await page.evaluate(()=>{fixture.states[config.entities.nibe_ww_anzeige_nullpunkt].state='41';card.hass=fixture;});
  await frame.locator('#save_wwZero').click();
  if(await page.evaluate(()=>calls.length)!==3)throw new Error('Externe Änderung überschrieben.');
  await frame.locator('#r_wwZero .row-actions button').first().click();
  await page.evaluate(()=>{card.setConfig({...config,enable_controls:true,default_view:'controls'});card.hass=fixture;});
  if(!(await frame.locator('#before_wwZero').textContent()).includes('42'))throw new Error('Vorheriger Wert überlebt Neuaufbau nicht.');
  await page.evaluate(()=>{window.normalService=fixture.callService;fixture.callService=async()=>{throw new Error('Simulierter Verbindungsfehler');};card.hass=fixture;});
  await frame.locator('#c_wwZero').evaluate(input=>{input.value='44';input.dispatchEvent(new Event('input'));});
  await frame.locator('#save_wwZero').click();
  await frame.locator('#toast').filter({hasText:'Simulierter Verbindungsfehler'}).waitFor();
  if(!await frame.locator('#actions_wwZero').isVisible()||!(await frame.locator('#before_wwZero').textContent()).includes('41'))throw new Error('Fehlgeschlagener Entwurf ging verloren.');
  await frame.locator('#r_wwZero .row-actions button').first().click();
  await page.evaluate(()=>{fixture.callService=normalService;card.hass=fixture;});
  if(!await frame.locator('#boost').isDisabled())throw new Error('Ungeprüfter Boost ist aktiv.');
  await page.evaluate(()=>{fixture.states[config.entities.hot_water_charging_bt6_30010].state='47.5';fixture.states[config.entities.hot_water_demand_mode_40057].state='MEDIUM';card.hass=fixture;});
  for(const [size,width,height] of [['desktop',1280,900],['mobile',390,844],['small-mobile',320,700]]){
   await page.setViewportSize({width,height});
   for(const dark of [false,true]){
    await page.evaluate(dark=>{fixture.themes.darkMode=dark;card.hass=fixture;},dark);
    await frame.locator('#c_wwMediumStop').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input'));});
    await frame.locator('#c_shift').evaluate(input=>{input.value='3';input.dispatchEvent(new Event('input'));});
    if(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth))throw new Error('Steuerung läuft über: '+size);
    const clipped=await frame.locator('.settings-card').evaluateAll(cards=>cards.some(card=>[...card.querySelectorAll('button,input,strong,.val')].some(node=>{const r=node.getBoundingClientRect(),c=card.getBoundingClientRect();return r.width>1&&(r.left<c.left-1||r.right>c.right+1);})));if(clipped)throw new Error('Steuerelement außerhalb der Karte: '+size);
    const heights=await frame.locator('.row-actions:not([hidden]) button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    if(heights.some(h=>h<44))throw new Error('Speicherbutton zu klein.');
    await frame.locator('#toast').evaluate(node=>node.hidden=true);
    await frame.locator('#dataBadge').evaluate(node=>node.textContent='Beispielwerte');
    await page.screenshot({path:root+'/docs/images/controls-'+size+'-'+(dark?'dark':'light')+'.png',fullPage:true});
    await frame.locator('#r_wwMediumStop .row-actions button').first().click();
    await frame.locator('#r_shift .row-actions button').first().click();
   }
  }
  await frame.locator('#t1').click();
  await page.evaluate(()=>{window.infoEvents=[];card.addEventListener('hass-more-info',event=>infoEvents.push(event.detail));});
  await frame.locator('.flow-mobile [data-bind="liveHeat"]').click();
  if(await page.evaluate(()=>infoEvents[0]?.entityId!==config.entities.nibe_warmeleistung_2))throw new Error('Falsche Verlauf-Entität.');
  await frame.locator('.flow-mobile [data-bind="liveHz"]').focus();await page.keyboard.press('Enter');
  if(await page.evaluate(()=>infoEvents[1]?.entityId!==config.entities.compressor_frequency_31066))throw new Error('Tastatur öffnet keinen Verlauf.');
  await page.evaluate(() => { fixture.states[config.entities.pv_panel_affects_hot_water_eme_41071].state='off';card.hass=fixture; });
  await frame.locator('.flow-mobile [data-bind="wwLimits"]').filter({ hasText: '48,0' }).waitFor();
  if (await page.evaluate(() => calls.length) !== 3) throw new Error('Unerwartete Schreibaktion.');
  for(const [button,panel] of [['#t2','#v2'],['#t4','#v4'],['#t3','#v3']]){
    await frame.locator(button).click();await frame.locator(panel).waitFor();
    if(await frame.locator('body').evaluate(node=>node.classList.contains('overview')))throw new Error('Übersichtsstil greift auf andere Seite über.');
  }
  await frame.locator('#t1').click();
  const overflow = await frame.locator('main').evaluate(node => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error('Mobiler horizontaler Überlauf.');
  await frame.locator('#live_c_pvh').uncheck();
  await frame.locator('#live_c_pvw').check();
  if(await page.evaluate(()=>calls.length)!==3)throw new Error('Live-PV schreibt vor Speichern.');
  await frame.locator('#live_save_pvh').click();await frame.locator('#toast').filter({hasText:'bestätigt'}).waitFor();
  if(await page.evaluate(()=>calls.length!==4||calls[3].service!=='turn_off'||calls[3].target.entity_id!==config.entities.pv_panel_affects_heating_eme_41070))throw new Error('Live-Heizungs-PV schreibt falsches Ziel.');
  if(!await frame.locator('#live_actions_pvw').isVisible())throw new Error('Live-WW-PV-Entwurf geht verloren.');
  await frame.locator('#live_save_pvw').click();await frame.locator('#toast').filter({hasText:'bestätigt'}).waitFor();
  if(await page.evaluate(()=>calls.length!==5||calls[4].service!=='turn_on'||calls[4].target.entity_id!==config.entities.pv_panel_affects_hot_water_eme_41071))throw new Error('Live-WW-PV schreibt falsches Ziel.');
  if(await frame.locator('#live_before_pvh').isVisible()||await frame.locator('#live_before_pvw').isVisible())throw new Error('Vorher bleibt nach Live-Speichern sichtbar.');
  if (errors.length) throw new Error(errors.join('\n'));
  // Native WP reads: immediate on entry, then every 30 s while visible.
  if(!await page.evaluate(()=>refreshCalls.length))throw new Error('Keine WP-Abfrage beim Öffnen.');
  if(await page.evaluate(()=>refreshCalls.some(c=>c.target.entity_id!==config.entities.compressor_frequency_31066)))throw new Error('Falsches WP-Aktualisierungsziel.');
  const reads=await page.evaluate(()=>refreshCalls.length);
  await page.clock.runFor(31000);
  if(await page.evaluate(()=>refreshCalls.length)!==reads+1)throw new Error('WP wird nicht nach 30 Sekunden abgefragt.');
  await frame.locator('#t3').click();
  if(await page.evaluate(()=>refreshCalls.length)!==reads+2)throw new Error('Seitenwechsel fragt WP nicht erneut ab.');
  await frame.locator('#c_shift').evaluate(input=>{input.value='4';input.dispatchEvent(new Event('input'));});
  await page.clock.runFor(30000);
  if(await frame.locator('#c_shift').inputValue()!=='4'||!await frame.locator('#before_shift').isVisible())throw new Error('WP-Aktualisierung verwirft Entwurf.');
  await page.evaluate(()=>card.style.display='none');const hiddenReads=await page.evaluate(()=>refreshCalls.length);
  await page.clock.runFor(61000);
  if(await page.evaluate(()=>refreshCalls.length)!==hiddenReads)throw new Error('Unsichtbare Karte fragt WP ab.');
  await page.evaluate(()=>card.style.display='block');await page.clock.runFor(1000);
  if(await page.evaluate(()=>refreshCalls.length)!==hiddenReads+1)throw new Error('Rückkehr aktualisiert WP nicht.');
  await page.evaluate(()=>card.remove());const disposedReads=await page.evaluate(()=>refreshCalls.length);
  await page.clock.runFor(31000);
  if(await page.evaluate(()=>refreshCalls.length)!==disposedReads)throw new Error('Entfernte Karte fragt WP ab.');
  console.log('Browser checks passed: desktop/mobile, PV rule, read-only, helper write, mode write, confirmed feedback. All data and writes were simulated.');
} finally { await browser?.close(); server.close(); }
