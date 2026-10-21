
(function(){
'use strict';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const f=(x,d=1)=>Number.isFinite(x)?x.toLocaleString('de-AT',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
const put=(id,s)=>{if($(id))$(id).textContent=s;if(id==='readout'&&$('overviewReadout'))$('overviewReadout').textContent=s;};
const ids=window.WP_CONFIG.entities;
const E=s=>ids['energy_'+s];
const M={si:ids.brine_in_bt10_30011,sa:ids.brine_out_bt11_30012,vl:ids.condenser_eb100_bt2_31524,rl:ids.return_line_bt3_30008,ww:ids.hot_water_charging_bt6_30010,wwvl:ids.condenser_bt12_30013,out:ids.current_outdoor_temperature_bt1_30002,freq:ids.compressor_frequency_31066,power:ids.instantaneous_used_power_32167,aux:ids.power_internal_additional_heat_31028,sole:ids.brine_pump_speed_gp2_31105,flow:ids.flow_sensor_bf1_30041,valve:ids.reversing_valve_hot_water_qn10_32197,dm:ids.degree_minutes_40012,heat:ids.nibe_warmeleistung_2,cop:ids.nibe_cop_2,cool:ids.nibe_kuehlleistung,thermalStatus:ids.nibe_leistungsberechnung_status,priority:ids.priority_31029};
const historyRoles={batterySoc:ids.battery_state_of_charge,thermalPower:M.heat,thermalPowerLive:M.heat,hSi:M.si,hSa:M.sa,hVl:M.vl,hRl:M.rl,hWw:M.ww,liveHz:M.freq,livePower:M.power,powerLive:M.power,liveHeat:M.heat,liveDm:M.dm,liveCop:M.cop,copBadge:M.cop,kOut:M.out,kHeat:M.heat,kCool:M.cool,flowLitres:M.flow,supplyFlow:M.flow,soleFlow:ids.brine_volume_flow,calculatedFlow:ids.calculated_supply_temperature,liveMade:E('produced_total_kwh'),liveUsed:E('used_total_kwh'),...(window.WP_CONFIG.source_allocation==='direct'?{pvDetail:ids.wp_pv_power,batteryDetail:ids.wp_battery_power,gridDetail:ids.wp_grid_power}:{})};
let hass,stats={},hist={},busy=false,energySeq=0,tab='v1',dirty={},pending=false,today={used:null,made:null},histStart=null;
let pumpRefreshDue=true,lastPumpRefresh=0,pumpRefreshBusy=false,pumpRefreshError='',disposed=false,lastFetch=0,wasPumpVisible=false;
function entity(id){return hass?.states[id];}
function num(id){const s=entity(id)?.state;return s!==undefined&&s!==''&&!['unavailable','unknown'].includes(s)&&Number.isFinite(Number(s))?Number(s):null;}
function add(xs){return xs.every(Number.isFinite)?xs.reduce((a,b)=>a+b,0):null;}
function ratio(q,e){return Number.isFinite(q)&&Number.isFinite(e)&&e>0?q/e:null;}
function textState(id,unit='',dec=1){const n=num(id);return f(n,dec)+(n===null?'':unit);}
function autoHeight(){if(window.frameElement)window.frameElement.style.height=Math.ceil(document.querySelector('main').getBoundingClientRect().height+6)+'px';}
new ResizeObserver(()=>{autoHeight();if(histStart)drawHistory(histStart);}).observe(document.querySelector('main'));
function select(v){tab=v;pumpRefreshDue=true;lastFetch=0;document.body.classList.toggle('overview',v==='v1');document.body.classList.toggle('settings',v==='v3');document.body.classList.toggle('analytics',v==='v2'||v==='v4');document.body.classList.toggle('energy-page',v==='v2');document.body.classList.toggle('forecast-page',v==='v4');put('pageTitle',({v2:'Energie',v3:'Einstellungen',v4:'Prognose'})[v]||window.WP_CONFIG.title);[['t1','v1'],['t2','v2'],['t4','v4'],['t3','v3']].forEach(([t,p])=>{$(t).setAttribute('aria-selected',String(v===p));$(p).hidden=v!==p;});autoHeight();if(window.__NIBE_TICK)tick();}
[['t1','v1'],['t2','v2'],['t4','v4'],['t3','v3']].forEach(([t,v])=>$(t).onclick=()=>select(v));
document.querySelector('.tabs').hidden=window.WP_CONFIG.show_navigation===false;
const query=new URLSearchParams();select({energie:'v2',prognose:'v4',steuerung:'v3'}[query.get('wp-tab')]||({overview:'v1',energy:'v2',forecast:'v4',controls:'v3'}[window.WP_CONFIG.default_view]||'v1'));
const hsvg=document.querySelector('.hero svg');
['pSole','pHeiz','vValve'].forEach(id=>{$(id).removeAttribute('tabindex');$(id).removeAttribute('role');$(id).style.cursor='default';});

function renderMobile(){
 const mobile=$('mobileSvg');if(mobile){mobile.setAttribute('class','mobile-svg '+(hsvg.getAttribute('class')||''));$('mobileSolePump').setAttribute('class',$('pSole').getAttribute('class'));$('mobileHeatPump').setAttribute('class',$('pHeiz').getAttribute('class'));}

 for(const [id,source] of [['mSi','hSi'],['mSa','hSa'],['mVl','hVl'],['mRl','hRl'],['mWw','hWw'],['mWwVl','hWwVl'],['mHz','liveHz'],['mPower','livePower'],['mHeat','liveHeat'],['mFlow','hHeatFlow'],['mWwState','hWwState']])put(id,$(source)?.textContent||'–');
 const sole=num(M.sole),valve=entity(M.valve)?.state;
 put('mSole',sole===null?'–':f(sole,0)+' %');
 put('mValve',valve==='on'?'Ventil → Warmwasser':valve==='off'?'Ventil → Heizen':'Ventilstatus unbekannt');
}

function render(){
 if(!hass)return;
 [['hSi',M.si],['hSa',M.sa],['hVl',M.vl],['hRl',M.rl],['hWw',M.ww],['hWwVl',M.wwvl]].forEach(([id,e])=>put(id,textState(e,' °C')));
 put('kOut',textState(M.out,' °C'));put('kWw',textState(M.ww,' °C'));put('liveHz',textState(M.freq,' Hz',0));put('livePower',num(M.power)===null?'–':f(num(M.power)/1000,2)+' kW');const estimated=entity(M.heat)?.attributes?.berechnungsart==='Heizstab geschätzt';const heatValue=textState(M.heat,' kW',2);put('liveHeat',(estimated&&num(M.heat)!==null?'≈ ':'')+heatValue);put('kHeat',(estimated&&num(M.heat)!==null?'≈ ':'')+heatValue);put('kCool',textState(M.cool,' kW',2));const calculation=entity(M.thermalStatus)?.state;put('thermalNote',!calculation||['unknown','unavailable'].includes(calculation)?'Wärmeberechnung derzeit nicht verfügbar.':calculation+(estimated?' · ≈ kennzeichnet eine Schätzung.':''));put('liveDm',textState(M.dm,'',1));
 put('liveCop',textState(M.cop,'',2));
 const freq=num(M.freq),sole=num(M.sole),flow=num(M.flow),aux=num(M.aux),vs=entity(M.valve)?.state;
 const ww=vs==='on',knownValve=['on','off'].includes(vs),heating=flow!==null&&flow>0;
 const spans=document.querySelectorAll('.state span');
 const priority=entity(M.priority)?.state;const modeLabels={'HOT WATER':'Warmwasser','HEAT':'Heizbetrieb','COOLING':'Passive Kühlung','POOL':'Poolbetrieb','OFF':'Standby'};
 spans[0].textContent=modeLabels[priority]||'Betriebszustand unbekannt';
 spans[0].classList.toggle('on',['HOT WATER','HEAT','COOLING','POOL'].includes(priority));
 spans[0].classList.toggle('standby',priority==='OFF');
 spans[1].textContent=freq===null?'Kompressor unbekannt':freq>0?'Kompressor läuft':'Kompressor aus';spans[1].classList.toggle('on',freq>0);
 spans[2].textContent=aux===null?'Zusatzheizung unbekannt':aux>0?'Zusatzheizung ein':'Zusatzheizung aus';spans[2].classList.toggle('on',aux>0);
 $('pSole').setAttribute('class','pump '+(sole>0?'on':'off'));
 $('pSole').setAttribute('aria-label','Solepumpe: '+(sole===null?'unbekannt':sole>0?'ein':'aus'));
 $('pHeiz').setAttribute('class','pump '+(heating?'on':'off'));
 $('pHeiz').setAttribute('aria-label','Heizkreis: '+(flow===null?'Volumenstrom unbekannt':heating?'Durchfluss vorhanden':'kein gemessener Durchfluss'));
 hsvg.classList.toggle('sole-off',!(sole>0));hsvg.classList.toggle('heat-off',!heating);hsvg.classList.toggle('v-ww',knownValve&&ww);hsvg.classList.toggle('v-heat',knownValve&&!ww);hsvg.classList.toggle('charging',knownValve&&ww&&heating);
 put('hSoleFlow','–');put('hHeatFlow',flow===null?'–':f(flow*0.06,2)+' m³/h');
 renderWwSettings();
 put('hWwState',knownValve&&ww&&heating?'lädt':num(M.ww)===null?'unbekannt':'bereit');
 renderMobile();renderOverview();renderControls();renderForecast();autoHeight();
}
function optionalPower(role){
 const id=ids[role],value=num(id),unit=entity(id)?.attributes?.unit_of_measurement;
 return value===null?null:unit==='W'?value/1000:unit==='kW'?value:null;
}
function optionalBrineFlow(){
 const value=num(ids.brine_volume_flow),unit=entity(ids.brine_volume_flow)?.attributes?.unit_of_measurement;
 if(value===null)return null;
 return ['l/min','L/min'].includes(unit)?value:['m³/h','m3/h'].includes(unit)?value/0.06:null;
}
function allocateSitePower(wp,solarAC,hybridAC,hybridPVDC,batteryDC,gridSigned){
 // Display estimate: split hybrid AC by its DC inputs, then distribute the
 // remaining local supply and grid import proportionally over house loads.
 if(![wp,solarAC,hybridAC,hybridPVDC,batteryDC,gridSigned].every(Number.isFinite))return null;
 if([wp,solarAC,hybridAC,hybridPVDC,batteryDC].some(v=>v<0))return null;
 const hybridInput=hybridPVDC+batteryDC;
 if(hybridAC>0&&hybridInput<=0)return null;
 const batteryAC=hybridInput>0?hybridAC*batteryDC/hybridInput:0;
 const solar=solarAC+hybridAC-batteryAC,local=solar+batteryAC,exported=Math.max(0,-gridSigned);
 if(exported>local+0.05)return null;
 const retained=Math.max(0,local-exported),imported=Math.max(0,gridSigned),load=retained+imported;
 if(wp===0)return {pv:0,battery:0,grid:0,shares:null};
 if(load<=0||wp>load+0.05)return null;
 const pvShare=local>0?retained*(solar/local)/load:0,batteryShare=local>0?retained*(batteryAC/local)/load:0,gridShare=imported/load;
 return {pv:wp*pvShare,battery:wp*batteryShare,grid:wp*gridShare,shares:[pvShare,batteryShare,gridShare]};
}
// Per-interval energy allocation: all other loads get local supply first.
function allocatePriorityEnergy(wp,imported,exported,solar,hybrid,pvDC,batteryDC){
 if(![wp,imported].every(Number.isFinite)||wp<0||imported<0)return null;
 const grid=Math.min(wp,imported),self=wp-grid;
 if(self<=1e-9)return {pv:0,battery:0,grid,unknown:0};
 if(![exported,solar,hybrid,pvDC,batteryDC].every(Number.isFinite)||[exported,solar,hybrid,pvDC,batteryDC].some(x=>x<0))return {pv:0,battery:0,grid,unknown:self};
 const dc=pvDC+batteryDC;if(hybrid>0&&dc<=0)return {pv:0,battery:0,grid,unknown:self};
 const battery=dc>0?hybrid*batteryDC/dc:0,pv=solar+hybrid-battery,local=pv+battery;
 // Tolerance is only for independent meter rounding, never for covering a deficit.
 const retained=local-exported;
 if(local<=0||retained+0.005<self)return {pv:0,battery:0,grid,unknown:self};
 return {pv:self*pv/local,battery:self*battery/local,grid,unknown:0};
}
function summarizeOrigin(data,roleIds,factors,start,end){
 const maps=Object.fromEntries(Object.entries(roleIds).map(([role,id])=>[role,new Map((data[id]||[]).map(row=>[Number(row.start),row]))]));
 const result={pv:0,battery:0,grid:0,unknown:0,observed:0,covered:0,expected:Math.max(0,Math.floor(end/300000)-Math.ceil(start/300000))};
 for(const [time,row] of maps.wp){
  if(time<start||time+300000>end)continue;
  const get=role=>{const v=maps[role]?.get(time)?.change;return Number.isFinite(v)&&v>=0&&Number.isFinite(factors[role])?v*factors[role]:null;};
  const wp=get('wp');if(wp===null)continue;result.observed+=wp;
  const allocation=allocatePriorityEnergy(wp,get('imported'),get('exported'),get('solar'),get('hybrid'),get('pv0')===null||get('pv1')===null?null:get('pv0')+get('pv1'),get('battery'));
  if(allocation){for(const key of ['pv','battery','grid','unknown'])result[key]+=allocation[key];if(allocation.unknown===0)result.covered++;}else result.unknown+=wp;
 }
 return result;
}
function mixCO2(pv,battery,grid,pvFactor,batteryFactor,gridFactor){
 const powers=[pv,battery,grid],factors=[pvFactor,batteryFactor,gridFactor];
 if(powers.some(v=>!Number.isFinite(v)||v<0))return null;
 if(powers.some((v,i)=>v>0&&(!Number.isFinite(factors[i])||factors[i]<0)))return null;
 const total=powers.reduce((a,b)=>a+b,0),rate=powers.reduce((sum,power,i)=>sum+(power>0?power*factors[i]:0),0);
 return {intensity:total>0?rate/total:null,rate,total};
}

function bindHistory(){
 for(const node of document.querySelectorAll('#v1 [data-bind]')){
  const id=historyRoles[node.dataset.bind];if(!id||!entity(id))continue;
  node.setAttribute('role','button');node.setAttribute('tabindex','0');node.classList.add('history-value');
  node.setAttribute('aria-label',(entity(id).attributes?.friendly_name||id)+' · Verlauf öffnen');
  node.onclick=()=>hass.moreInfo?.(id);
  node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hass.moreInfo?.(id);}};
 }
}
function thermalMix(heat,power,mode,blocked=false){
 if(blocked||mode==='COOLING'||![heat,power].every(Number.isFinite)||heat<0||power<0||power>heat)return null;
 if(!['HEAT','HOT WATER'].includes(mode)&&!(mode==='OFF'&&heat===0&&power===0))return null;
 return {total:heat,electricity:power,environment:heat-power,shares:heat>0?[power/heat,(heat-power)/heat]:null};
}
function renderOverview(){
 const dark=typeof hass.darkMode==='boolean'?hass.darkMode:matchMedia('(prefers-color-scheme:dark)').matches;
 document.body.dataset.colorMode=dark?'dark':'light';
 const values={};
 for(const id of ['hSi','hSa','hVl','hRl','hWw','liveHz','livePower','liveHeat','liveDm','liveCop','kOut','kHeat','kCool','hWwPct','hWwState','tkMin','tkMax','wwModeLive','liveMade','liveUsed'])values[id]=$(id)?.textContent||'–';
 const flow=num(M.flow),si=num(M.si),sa=num(M.sa),vl=num(M.vl),rl=num(M.rl),cop=num(M.cop),sole=num(M.sole),pair=wwPairs[currentWwMode()],stop=pair?num(pair[1]):null,t=num(M.ww);
 const zero=ids.nibe_ww_anzeige_nullpunkt?num(ids.nibe_ww_anzeige_nullpunkt):window.WP_CONFIG.zero_temperature;
 const level=temperatureLevel(t,zero,stop),delta=vl!==null&&rl!==null?vl-rl:null;
 values.flowLitres=flow===null?'–':f(flow,1)+' l/min';
 values.supplyFlow='Vorlauf · '+values.flowLitres;
 values.heatDelta=delta===null?'–':f(delta,1)+' K';
 values.heatFlowDelta=values.flowLitres+' · ΔT '+values.heatDelta;
 values.soleDelta=si!==null&&sa!==null?f(si-sa,1)+' K':'–';
 values.soleFlow=optionalBrineFlow()===null?'–':f(optionalBrineFlow(),1)+' l/min';
 values.soleFlowDelta=values.soleFlow+' · '+values.soleDelta;
 values.calculatedFlow=textState(ids.calculated_supply_temperature,' °C',1);
 values.copBadge='COP '+values.liveCop;
 values.powerLive=values.livePower+' · live';
 values.startCaption='– Start '+values.tkMin;values.stopCaption='– Stopp '+values.tkMax;
 values.wwLimits='Start '+values.tkMin+' · Stopp '+values.tkMax;
 values.untilStop=stop!==null&&t!==null?f(Math.max(0,stop-t),1)+' K':'–';
 values.soleState=sole===null?'–':sole>0?'ein':'aus';
 values.heatState=flow===null?'–':flow>0?'ein':'aus';
 const valveState=entity(M.valve)?.state;
 values.heatActive=valveState==='off'&&flow>0?'aktiv':valveState==='on'?'inaktiv':flow===null?'–':'bereit';
 values.todayCop=f(ratio(today.made,today.used),1);
 values.todayGround=Number.isFinite(today.made)&&Number.isFinite(today.used)&&today.made>=today.used?'≈ '+f(today.made-today.used,1)+' kWh':'–';
 values.dataLabel=Object.keys(hass.states).length?'Live-Daten':'Keine Entitäten zugeordnet';
 const estimatedSources=window.WP_CONFIG.source_allocation==='site_proportional';
 const allocation=estimatedSources?allocateSitePower(num(M.power)===null?null:num(M.power)/1000,optionalPower('site_solar_ac_power'),optionalPower('site_hybrid_ac_power'),optionalPower('site_hybrid_pv_dc_power'),optionalPower('site_battery_discharge_dc_power'),optionalPower('site_grid_signed_power')):null;
 const pv=estimatedSources?(allocation?.pv??null):optionalPower('wp_pv_power'),battery=estimatedSources?(allocation?.battery??null):optionalPower('wp_battery_power'),grid=estimatedSources?(allocation?.grid??null):optionalPower('wp_grid_power');
 const valid=[pv,battery,grid].every(v=>v!==null&&v>=0),total=valid?pv+battery+grid:null;
 const shares=valid&&total>0?[pv/total,battery/total,grid/total]:null;
 for(const [key,value,i] of [['pvDetail',pv,0],['batteryDetail',battery,1],['gridDetail',grid,2]])values[key]=value===null?'–':(estimatedSources&&value>0?'≈ ':'')+f(value,2)+' kW'+(shares?' · '+f(shares[i]*100,0)+' %':'');
 values.sourceCenter=shares?f((shares[0]+shares[1])*100,0)+' %':'–';
 const socValue=num(ids.battery_state_of_charge),socUnit=entity(ids.battery_state_of_charge)?.attributes?.unit_of_measurement;
 const soc=socUnit==='%'&&socValue!==null&&socValue>=0&&socValue<=100?socValue:null;
 values.batterySoc=soc===null?'–':f(soc,1)+' %';
 document.querySelectorAll('.battery-soc').forEach(node=>{const fill=node.querySelector('.battery-fill');fill.setAttribute('width',soc===null?0:Number(fill.dataset.socWidth)*soc/100);node.setAttribute('aria-label','Batterie-Ladezustand '+values.batterySoc);});
 const thermal=thermalMix(num(M.heat),num(M.power)===null?null:num(M.power)/1000,entity(M.priority)?.state,entity(M.heat)?.attributes?.umschaltsperre===true);
 values.thermalPower=thermal?(entity(M.heat)?.attributes?.berechnungsart==='Heizstab geschätzt'?'≈ ':'')+f(thermal.total,2):'–';values.thermalPowerLive=values.thermalPower+(thermal?' kW · Wärme':'');
 values.thermalElectricDetail=thermal?f(thermal.electricity,2)+' kW'+(thermal.shares?' · '+f(thermal.shares[0]*100,0)+' %':''):'–';
 values.thermalEnvironmentDetail=thermal?'≈ '+f(thermal.environment,2)+' kW'+(thermal.shares?' · '+f(thermal.shares[1]*100,0)+' %':''):'–';
 values.thermalMixNote=entity(M.priority)?.state==='COOLING'?'Passive Kühlung · keine Wärmebilanz':entity(M.heat)?.attributes?.umschaltsperre===true?'Umschaltung · Bilanz pausiert':!thermal?'Wärmebilanz derzeit nicht verfügbar':thermal.total===0?'Keine Wärmeabgabe':'Umweltenergie = Wärme − Strom';
 document.querySelectorAll('.thermal-ring').forEach(node=>{let offset=0;['electric','environment'].forEach((key,i)=>{const part=node.querySelector('.thermal-'+key),length=thermal?.shares?thermal.shares[i]*295.31:0;part.style.strokeDasharray=length+' 295.31';part.style.strokeDashoffset=-offset;offset+=length;});node.setAttribute('aria-label',values.thermalElectricDetail+' Strom; '+values.thermalEnvironmentDetail+' Umweltenergie');});
 document.querySelectorAll('.thermal-connection').forEach(node=>{let offset=0;['electric','environment'].forEach((key,i)=>{const part=node.querySelector('.thermal-'+key),width=thermal?.shares?thermal.shares[i]*20:0;part.setAttribute('x',offset);part.setAttribute('width',width);offset+=width;});node.setAttribute('aria-label',values.thermalElectricDetail+' Strom; '+values.thermalEnvironmentDetail+' Umweltenergie');});
 const gridIntensity=num(ids.wp_grid_co2_intensity),mix=mixCO2(pv,battery,grid,window.WP_CONFIG.co2_pv_g_per_kwh,window.WP_CONFIG.co2_battery_g_per_kwh,gridIntensity);
 values.co2Line=!mix?'CO₂ –':mix.total===0?'CO₂ 0 g/h':'CO₂ ≈ '+f(mix.intensity,0)+' g/kWh · '+f(mix.rate,0)+' g/h'+(gridIntensity>0?' · '+f((mix.intensity/gridIntensity-1)*100,0)+' % vs. Netz':'');
 document.querySelectorAll('[data-bind]').forEach(node=>{node.textContent=values[node.dataset.bind]??'–';});
 document.querySelectorAll('[data-bind="co2Line"]').forEach(node=>node.setAttribute('title','Geschätzter WP-Strommix: PV '+f(window.WP_CONFIG.co2_pv_g_per_kwh,0)+', Batterie '+f(window.WP_CONFIG.co2_battery_g_per_kwh,0)+', Netz '+f(gridIntensity,0)+' g CO₂e/kWh, jeweils mit dem aktuellen Leistungsanteil gewichtet. Batteriefaktor nimmt PV-Ladung an; keine historische Ladebilanz. g/h ist die aktuelle Emissionsrate, keine aufsummierte Emissionsmenge.'));
 document.querySelectorAll('.source-ring').forEach(node=>{const label=node.nextElementSibling?.nextElementSibling;if(label?.classList.contains('ring-label'))label.textContent=estimatedSources?'Eigenstrom ≈':'Eigenstrom';});
 document.querySelectorAll('.source-detail[data-bind$="Detail"],.source-ring').forEach(node=>{node.setAttribute('title',estimatedSources?'Rechnerischer WP-Anteil am aktuellen Hausstrommix. Hybrid-Wechselrichter: AC-Aufteilung nach PV-/Batterie-DC-Eingängen; Einspeisung anteilig abgezogen. Keine separate Herkunftsmessung.':'Zugeordnete Leistungswerte der Wärmepumpe.');});
 document.querySelectorAll('.ov-kpi>strong').forEach(node=>{const match=node.textContent.match(/^(.*) (kW|°C)$/);if(match){const unit=document.createElement('span');unit.className='metric-unit';unit.textContent=match[2];node.textContent=match[1]+' ';node.appendChild(unit);}});
 document.querySelectorAll('.source-ring').forEach(node=>{let offset=0;['pv','battery','grid'].forEach((key,i)=>{const circle=node.querySelector('.source-'+key),length=shares?shares[i]*295.31:0;circle.style.strokeDasharray=length+' 295.31';circle.style.strokeDashoffset=-offset;offset+=length;});});
 document.querySelectorAll('.power-connection').forEach(node=>{
  let offset=0;['pv','battery','grid'].forEach((key,i)=>{const segment=node.querySelector('.source-'+key),width=shares?shares[i]*20:0;segment.setAttribute('x',offset);segment.setAttribute('width',width);offset+=width;});
  node.setAttribute('aria-label',shares?['PV','Batterie','Netz'].map((name,i)=>name+' '+f(shares[i]*100,0)+' %').join(' · '):total===0?'Kein Stromverbrauch':'Stromherkunft nicht verfügbar');
 });
 document.querySelectorAll('[data-ring]').forEach(node=>{
  const ww=node.dataset.ring==='hWwPct';
  node.style.setProperty('--ring',ww&&level!==null?'conic-gradient(#f4511e '+level+'%, var(--line) 0)':!ww&&today.used!==null&&today.made>0?'conic-gradient(#348df0 '+Math.max(0,Math.min(100,(1-today.used/today.made)*100))+'%, #7947e8 0)':'var(--line)');
  node.title=ww?$('wwSettingsNote').textContent:'Tages-COP aus erzeugter Wärme und verbrauchtem Strom. Erdwärme ist die rechnerische Differenz, keine separate Messung.';
 });
 document.querySelectorAll('[data-tank]').forEach(node=>{node.setAttribute('y',level===null?100:100-level);});
 document.querySelectorAll('[data-tank-wave]').forEach(node=>{node.style.opacity=level===null?'0':'1';node.setAttribute('transform','translate(0 '+(level===null?100:100-level)+')');});
 document.querySelectorAll('[data-column]').forEach(node=>{const n=node.dataset.column==='hVl'?vl:rl;node.style.height=n===null?'0%':Math.max(0,Math.min(100,n/60*100))+'%';});
 const scene=document.querySelector('.flow-scene');scene.classList.toggle('sole-off',!(sole>0));scene.classList.toggle('heat-off',!(flow>0));scene.classList.toggle('v-ww',valveState==='on');scene.classList.toggle('v-heat',valveState==='off');
 scene.querySelectorAll(':scope>svg').forEach(svg=>{if(flow>0)svg.unpauseAnimations();else svg.pauseAnimations();});
 document.querySelectorAll('[data-pump]').forEach(node=>{node.classList.toggle('off',node.dataset.pump==='sole'?!(sole>0):!(flow>0));});
 document.querySelector('.gauge-level').style.strokeDasharray=(cop===null?0:Math.max(0,Math.min(100,cop/10*100)))+' 100';
 const mode=document.querySelector('.state span')?.textContent||'Betriebszustand unbekannt';
 put('overviewStatus',mode==='Standby'?'Anlage in Standby':mode==='Betriebszustand unbekannt'?mode:'Anlage läuft im '+mode);
 put('overviewStatusDetail',[...document.querySelectorAll('.state span')].slice(1).map(n=>n.textContent).join(' · ')+' · Solepumpe '+values.soleState+' · Ladepumpe '+values.heatState);
 put('overviewClock',new Date().toLocaleString('de-AT',{timeZone:'Europe/Vienna',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}));
 put('liveBadge',Object.keys(hass.states).length?'● LIVE':'● OFFLINE');bindHistory();
}
const controls=[
 {group:'Heizen',key:'shift',label:'Heizkurve verschieben',id:ids.heating_offset_climate_system_1_40031,kind:'number'},
 {key:'dm',label:'Gradminuten',id:ids.degree_minutes_40012,kind:'number'},
 {key:'mode',label:'Betriebsmodus',display:ids.operating_mode_42744,reason:'Modus-Zuordnung noch nicht geprüft'},
 {key:'add',label:'Zusatzheizung erlauben',reason:'Keine geprüfte Steuerentität'},
 {group:'Kühlen',key:'coolshift',label:'Kühlkurve verschieben',id:ids.cooling_offset_climate_system_1_40976,kind:'number'},
 {group:'Speicheranzeige',key:'wwZero',label:'Temperatur für 0 %',id:ids.nibe_ww_anzeige_nullpunkt,kind:'number',domain:'input_number',note:'Nur Anzeige · verändert keine Warmwasser-Solltemperatur'},
 {group:'Warmwasser',key:'wwb',label:'Warmwassermodus',id:ids.hot_water_demand_mode_40057,kind:'select'},
 {key:'more',label:'Mehr Warmwasser',display:ids.more_hot_water_40698,reason:'Dauer-Codes noch nicht geprüft'},
 {group:'Warmwasser · Klein',key:'wwSmallStart',label:'Starttemperatur',id:ids.start_temperature_hw_low_temperature_40061,kind:'number'},
 {key:'wwSmallStop',label:'Stopptemperatur',id:ids.stop_temperature_hw_low_temperature_40065,kind:'number'},
 {group:'Warmwasser · Mittel',key:'wwMediumStart',label:'Starttemperatur',id:ids.start_temperature_hw_normal_temperature_40060,kind:'number'},
 {key:'wwMediumStop',label:'Stopptemperatur',id:ids.stop_temperature_hw_normal_temperature_40064,kind:'number'},
 {group:'Warmwasser · Groß',key:'wwLargeStart',label:'Starttemperatur',id:ids.start_temperature_hw_high_temperature_40059,kind:'number'},
 {key:'wwLargeStop',label:'Stopptemperatur',id:ids.stop_temperature_hw_high_temperature_40063,kind:'number'},
 {group:'Warmwasser · Periodische Erhöhung',key:'wwPeriodicStop',label:'Zieltemperatur',id:ids.stop_temperature_hw_periodic_increase_40062,kind:'number'},
 {group:'PV-Überschuss',key:'pvw',label:'PV-Überschuss für Warmwasser',id:ids.pv_panel_affects_hot_water_eme_41071,kind:'switch'},
 {key:'pvh',label:'PV-Überschuss für Heizen',id:ids.pv_panel_affects_heating_eme_41070,kind:'switch'},
 {group:'Betrieb',key:'urlaub',label:'Urlaubsmodus',reason:'Entität nicht aktiv'},
 {group:'Erweitert',key:'hyst',label:'ACS · Hysterese zwischen Verdichtern',id:ids.acs_thermostat_hysteresis_between_compressors_41029,kind:'number'},
 {key:'kdm',label:'Kühl-Gradminuten',id:ids.cooling_degree_minutes_40021,kind:'number'},
 {key:'pdim',label:'Leistung bei Auslegungstemperatur',id:ids.power_kw_required_for_dimensioned_outdoor_temperature_44200,kind:'number',unit:'kW'}
];
const wwPairs={
 SMALL:[ids.start_temperature_hw_low_temperature_40061,ids.stop_temperature_hw_low_temperature_40065],
 MEDIUM:[ids.start_temperature_hw_normal_temperature_40060,ids.stop_temperature_hw_normal_temperature_40064],
 LARGE:[ids.start_temperature_hw_high_temperature_40059,ids.stop_temperature_hw_high_temperature_40063]
};
function wwDisplayMode(base,pv,t,mediumStop){
 if(pv&&Number.isFinite(t)&&Number.isFinite(mediumStop)&&t>mediumStop)return 'LARGE';
 return ['SMALL','MEDIUM','LARGE','SMART CONTROL'].includes(base)?base:null;
}
function currentWwMode(){
 return wwDisplayMode(entity(ids.hot_water_demand_mode_40057)?.state,entity(ids.pv_panel_affects_hot_water_eme_41071)?.state==='on',num(M.ww),num(ids.stop_temperature_hw_normal_temperature_40064));
}
function temperatureLevel(t,start,stop){
 return [t,start,stop].every(Number.isFinite)&&stop>start?Math.max(0,Math.min(100,(t-start)/(stop-start)*100)):null;
}
function renderWwSettings(){
 const base=entity(ids.hot_water_demand_mode_40057)?.state,mode=currentWwMode(),pair=wwPairs[mode];
 const start=pair?textState(pair[0],' °C',1):'–',stop=pair?textState(pair[1],' °C',1):'–';
 const zero=ids.nibe_ww_anzeige_nullpunkt?num(ids.nibe_ww_anzeige_nullpunkt):window.WP_CONFIG.zero_temperature;
 const level=pair?temperatureLevel(num(M.ww),zero,num(pair[1])):null;
 put('tkMin',start);put('tkMax',stop);put('wwModeLive',mode==='LARGE'?'Groß / High':mode?modeName(mode):'Unbekannt');
 put('wwBaseLive',modeName(base));put('wwStartLive',start);put('wwStopLive',stop);
 const pv=entity(ids.pv_panel_affects_hot_water_eme_41071)?.state==='on';
 const description=mode==='SMART CONTROL'?'Smart Control passt den Bedarf automatisch an.':!mode?'Warmwassermodus ist nicht verfügbar.':'Für die Anzeige gilt High, wenn PV-Überschuss eingeschaltet ist und die Speichertemperatur über der Mittel-Stopptemperatur liegt. Sonst gilt der gewählte Grundmodus.';
 put('wwSettingsNote',description+' Grundmodus: '+modeName(base)+'.'+(pv?' PV-Einfluss auf Warmwasser ist freigegeben.':'')+' Der Balken zeigt das Temperaturniveau zwischen '+f(zero,1)+' °C (0 %) und Stopp (100 %), keinen gemessenen Energieinhalt.'+(pair&&zero!==null&&num(pair[1])!==null&&zero>=num(pair[1])?' Die 0-%-Temperatur muss unter der Stopptemperatur liegen.':''));
 put('mWwStart',pair?'Start '+start:mode==='SMART CONTROL'?'Smart Control':'Grenzen unbekannt');put('mWwStop',pair?'Stopp '+stop:'');
 put('hWwPct',level===null?'–':f(level,0)+' %');
 $('tankLevel').style.transform='translateY('+(level===null?118:118*(1-level/100))+'px)';
 $('mobileTankLevel').style.transform='translateY('+(level===null?68:68*(1-level/100))+'px)';
 $('tankLevel').style.opacity=level===null?'0':'1';$('mobileTankLevel').style.opacity=level===null?'0':'1';
}
function allowedModes(state){const list=state?.attributes?.options;return Array.isArray(list)?list.filter(x=>typeof x==='string'&&x.length):[];}
function modeName(mode){return ({SMALL:'Klein',MEDIUM:'Mittel',LARGE:'Groß','SMART CONTROL':'Smart Control',AUTO:'Automatik',MANUAL:'Manuell','ADD. HEAT ONLY':'Nur Zusatzheizung'})[String(mode).toUpperCase()]||mode||'–';}
function controlState(c){return entity(c.id)?.state;}
let controlsMade=false;
const previousKey='nibe-flow-previous:'+JSON.stringify(Object.entries(ids).sort());
let previous={};try{const saved=JSON.parse(localStorage.getItem(previousKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))previous=saved;}catch{}
function rememberPrevious(c,value){previous[c.key]=value;try{localStorage.setItem(previousKey,JSON.stringify(previous));}catch{}}
function controlValue(c,value){
 if(value===undefined||value===null||['unknown','unavailable'].includes(value))return '–';
 if(c.kind==='switch')return value==='on'||value===true?'ein':'aus';
 if(c.kind==='select')return modeName(value);
 return f(Number(value),Number(entity(c.id)?.attributes?.step)<1?1:0)+' '+(c.unit||entity(c.id)?.attributes?.unit_of_measurement||'');
}
function equalControl(c,value,state){return c.kind==='switch'?(value?'on':'off')===state:c.kind==='number'?Number(value)===Number(state):value===state;}
function stageControl(c,value){
 const baseline=dirty[c.key]?.baseline??controlState(c);
 if(equalControl(c,value,baseline))delete dirty[c.key];else dirty[c.key]={value,baseline};
 renderControls();
}
function makeControls(){
 const box=$('ctl');box.replaceChildren();const stack=document.createElement('div');stack.className='settings-left';box.appendChild(stack);
 const groups=[['Heizen','♨',['dm','shift','mode','add']],['Kühlen','❄',['coolshift']],['Speicheranzeige','▣',['wwZero']],['Warmwasser','♨',['wwb','wwSmallStart','wwSmallStop','wwMediumStart','wwMediumStop','wwLargeStart','wwLargeStop','wwPeriodicStop','more']],['PV-Überschuss','☀',['pvw','pvh']],['Betrieb','✈',['urlaub']],['Erweitert','◴',['hyst','kdm','pdim']]];
 for(const [name,icon,keys] of groups){
  const section=document.createElement('section');section.className='settings-card';section.dataset.group=name;
  const heading=document.createElement('h2');const mark=document.createElement('span');mark.className='settings-icon';mark.textContent=icon;heading.append(mark,document.createTextNode(name));section.appendChild(heading);(['Heizen','Kühlen','Speicheranzeige'].includes(name)?stack:box).appendChild(section);
  for(const key of keys){
   if(key==='wwSmallStart'||key==='wwMediumStart'||key==='wwLargeStart'){const h=document.createElement('h3');h.textContent=key==='wwSmallStart'?'Klein':key==='wwMediumStart'?'Mittel':'Groß';section.appendChild(h);}
   if(key==='wwPeriodicStop'){const h=document.createElement('h3');h.textContent='Periodische Erhöhung';section.appendChild(h);}
   const c=controls.find(c=>c.key===key),row=document.createElement('div');row.className='row';row.id='r_'+key;
   const left=document.createElement('div'),lbl=document.createElement('label'),status=document.createElement('span');lbl.className='lbl';lbl.textContent=c.label;lbl.htmlFor='c_'+key;status.className='eid';status.id='status_'+key;left.append(lbl,status);row.appendChild(left);
   const right=document.createElement('div');right.className='ctl';
   if(c.id){
    const input=document.createElement(c.kind==='select'?'select':'input');input.id='c_'+key;input.setAttribute('aria-label',c.label);
    if(c.kind==='switch'){input.type='checkbox';input.className='sw';input.setAttribute('role','switch');}else if(c.kind==='number')input.type='range';
    input.oninput=()=>stageControl(c,c.kind==='switch'?input.checked:c.kind==='select'?input.value:Number(input.value));
    right.appendChild(input);
    if(c.kind==='select'){input.className='mode-native';const modes=document.createElement('div');modes.className='mode-buttons';modes.id='modes_'+key;right.appendChild(modes);}
   }
   const value=document.createElement('span');value.className='val';value.id='value_'+key;right.appendChild(value);row.appendChild(right);
   if(c.id){
    const before=document.createElement('small');before.className='previous-value';before.id='before_'+key;row.appendChild(before);
    const actions=document.createElement('div');actions.className='row-actions';actions.id='actions_'+key;actions.hidden=true;
    const reset=document.createElement('button');reset.className='btn';reset.textContent='↶ Zurück';reset.onclick=()=>{delete dirty[key];renderControls();};
    const save=document.createElement('button');save.className='btn primary';save.id='save_'+key;save.textContent='✓ Speichern';save.onclick=()=>saveControl(key);actions.append(reset,save);row.appendChild(actions);
   }
   section.appendChild(row);
   if(key==='wwb'){
    const boost=document.createElement('div');boost.className='settings-boost';
    const caption=document.createElement('div');caption.textContent='♨ WW-Boost';const note=document.createElement('small');note.textContent='Speicher zusätzlich aufheizen';caption.appendChild(note);
    boost.append(caption,$('boost'));section.appendChild(boost);
    const storage=document.createElement('div');storage.className='settings-storage';
    for(const [label,bind] of [['Speichertemperatur','hWw'],['Temperaturniveau','hWwPct'],['Start','tkMin'],['Stopp','tkMax']]){const item=document.createElement('div');const title=document.createElement('small');title.textContent=label;const value=document.createElement('strong');value.dataset.bind=bind;item.append(title,value);storage.appendChild(item);}
    const tank=document.createElementNS(NS,'svg');tank.setAttribute('viewBox','0 0 50 100');tank.setAttribute('aria-hidden','true');tank.classList.add('settings-tank');tank.innerHTML='<defs><clipPath id="settings-tank-clip"><rect width="50" height="100" rx="25"/></clipPath><linearGradient id="settings-tank-fill" x2="0" y2="1"><stop stop-color="#ff5b1d"/><stop offset="1" stop-color="#ffb742"/></linearGradient></defs><rect width="50" height="100" rx="25" fill="var(--diagram-line)"/><g clip-path="url(#settings-tank-clip)"><rect data-tank="true" width="50" height="100" fill="url(#settings-tank-fill)"/></g>';storage.appendChild(tank);section.appendChild(storage);
   }
  }
 }
 const live=$('livePv');live.replaceChildren();
 for(const key of ['pvh','pvw']){
  const c=controls.find(c=>c.key===key),card=document.createElement('article');card.className='live-pv-card';
  const head=document.createElement('div');head.className='live-pv-head';const icon=document.createElement('span');icon.className='live-pv-icon';icon.textContent='☀';const title=document.createElement('label');title.htmlFor='live_c_'+key;title.textContent=key==='pvh'?'PV-Überschuss · Heizen':'PV-Überschuss · Warmwasser';head.append(icon,title);card.appendChild(head);
  const line=document.createElement('div');line.className='live-pv-line';const state=document.createElement('strong');state.id='live_state_'+key;const input=document.createElement('input');input.type='checkbox';input.className='sw';input.id='live_c_'+key;input.setAttribute('role','switch');input.setAttribute('aria-label',c.label);input.oninput=()=>stageControl(c,input.checked);line.append(state,input);card.appendChild(line);
  const before=document.createElement('small');before.className='previous-value';before.id='live_before_'+key;before.hidden=true;card.appendChild(before);
  const actions=document.createElement('div');actions.className='row-actions';actions.id='live_actions_'+key;actions.hidden=true;
  const reset=document.createElement('button');reset.className='btn';reset.textContent='↶ Zurück';reset.onclick=()=>{delete dirty[key];renderControls();};const save=document.createElement('button');save.className='btn primary';save.textContent='✓ Speichern';save.id='live_save_'+key;save.onclick=()=>saveControl(key);actions.append(reset,save);card.appendChild(actions);live.appendChild(card);
 }
 controlsMade=true;
}
function syncNumberSteppers(){
 for(const c of controls){
  if(c.kind!=='number'||!c.id)continue;
  const input=$('c_'+c.key);if(!input)continue;
  for(const direction of [-1,1]){
   const id=(direction<0?'minus_':'plus_')+c.key;let button=$(id);
   if(!button){
    button=document.createElement('button');button.type='button';button.id=id;button.className='range-step';button.textContent=direction<0?'−':'+';
    button.setAttribute('aria-label',c.label+(direction<0?' verringern':' erhöhen'));
    button.onclick=()=>{
     if(button.disabled||input.disabled)return;
     const step=Number(input.step),min=Number(input.min),max=Number(input.max);
     const current=dirty[c.key]?.value??num(c.id);
     if(![current,step,min,max].every(Number.isFinite)||step<=0)return;
     const next=Number(Math.max(min,Math.min(max,current+direction*step)).toFixed(10));
     if(next!==current)stageControl(c,next);
    };
    input.insertAdjacentElement(direction<0?'beforebegin':'afterend',button);
   }
   const current=dirty[c.key]?.value??num(c.id),min=Number(input.min),max=Number(input.max);
   button.disabled=input.disabled||!Number.isFinite(current)||(direction<0?current<=min:current>=max);
  }
 }
}
function renderControls(){
 queueMicrotask(syncNumberSteppers);
 if(!controlsMade)makeControls();
 for(const c of controls){
  const state=c.id?entity(c.id):null,input=$('c_'+c.key),draft=dirty[c.key],value=draft?.value,valid=state&&!['unknown','unavailable'].includes(state.state);
  if(['pvh','pvw'].includes(c.key)){
   const liveInput=$('live_c_'+c.key);liveInput.checked=value??(state?.state==='on');liveInput.disabled=!window.WP_CONFIG.enable_controls||!valid||pending;
   put('live_state_'+c.key,!valid?'Nicht verfügbar':draft?(value?'Ein · ungespeichert':'Aus · ungespeichert'):state.state==='on'?'Ein':'Aus');
   const before=$('live_before_'+c.key);before.hidden=!draft;before.textContent='Vorher: '+controlValue(c,draft?.baseline);
   const actions=$('live_actions_'+c.key);actions.hidden=!draft;actions.querySelectorAll('button').forEach(button=>button.disabled=liveInput.disabled);
  }
  $('r_'+c.key).classList.toggle('chg',!!draft);
  if(!c.id){put('status_'+c.key,c.reason);put('value_'+c.key,'gesperrt');continue;}
  put('before_'+c.key,'↶ Vorher: '+controlValue(c,draft?.baseline??previous[c.key]??state?.state));
  $('before_'+c.key).hidden=!draft;
  const actions=$('actions_'+c.key);actions.hidden=!draft;actions.querySelectorAll('button').forEach(button=>button.disabled=pending||!valid||!window.WP_CONFIG.enable_controls);
  input.disabled=!window.WP_CONFIG.enable_controls||!valid||pending;
  if(c.kind==='select'){
   const modes=allowedModes(state),options=modes.length?modes:(state?[state.state]:[]);
   if(JSON.stringify([...input.options].map(o=>o.value))!==JSON.stringify(options)){input.replaceChildren();for(const mode of options){const opt=document.createElement('option');opt.value=mode;opt.textContent=modeName(mode);input.appendChild(opt);}}
   input.value=value??state?.state;input.disabled||=!modes.length;put('value_'+c.key,'');
   const buttons=$('modes_'+c.key);buttons.replaceChildren();for(const mode of modes){const button=document.createElement('button');button.className='mode-option';button.textContent=modeName(mode);button.setAttribute('aria-pressed',String(input.value===mode));button.disabled=input.disabled;button.onclick=()=>stageControl(c,mode);buttons.appendChild(button);}
  }else if(c.kind==='number'){
   const attrs=state?.attributes||{};input.min=attrs.min;input.max=attrs.max;input.step=attrs.step;input.value=value??state?.state;input.style.setProperty('--fill',Math.max(0,Math.min(100,(Number(input.value)-attrs.min)/(attrs.max-attrs.min)*100))+'%');
   input.disabled||=![attrs.min,attrs.max,attrs.step].every(Number.isFinite)||attrs.step<=0;
   put('value_'+c.key,controlValue(c,value??state?.state));
  }else{input.checked=value??(state?.state==='on');put('value_'+c.key,input.checked?'ein':'aus');}
  put('status_'+c.key,!valid?'Derzeit nicht verfügbar':draft&&state.state!==draft.baseline?'In Home Assistant geändert. Zurücksetzen und erneut wählen.':c.note||'');
 }
}
let toastTimer;function toast(s){put('toast',s);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
$('boost').disabled=true;$('boost').title='Die Dauer-Codes sind noch nicht geprüft';
async function saveControl(key){
 if(pending||!hass||!window.WP_CONFIG.enable_controls)return;
 const c=controls.find(c=>c.key===key),draft=dirty[key];if(!c?.id||!draft)return;
 const state=entity(c.id),value=draft.value,baseline=draft.baseline;
 if(!state||['unknown','unavailable'].includes(state.state)||controlState(c)!==baseline){toast('Wert wurde inzwischen aktualisiert. Bitte zurücksetzen und erneut wählen.');return;}
 if(c.kind==='select'&&!allowedModes(state).includes(value)){toast('Dieser Warmwassermodus wird nicht freigegeben.');return;}
 if(c.kind==='number'){const {min,max,step}=state.attributes;if(![value,min,max,step].every(Number.isFinite)||step<=0||value<min||value>max||Math.abs((value-min)/step-Math.round((value-min)/step))>0.00001){toast('Wert außerhalb des zulässigen Bereichs');return;}}
 // Validate only this write against device values, never against other unsaved drafts.
 for(const [startKey,stopKey] of [['wwSmallStart','wwSmallStop'],['wwMediumStart','wwMediumStop'],['wwLargeStart','wwLargeStop']]){
  if(![startKey,stopKey].includes(key))continue;
  const start=controls.find(c=>c.key===startKey),stop=controls.find(c=>c.key===stopKey);
  const a=key===startKey?value:num(start.id),b=key===stopKey?value:num(stop.id);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b){toast('Warmwasser: Die Starttemperatur muss unter der gespeicherten Stopptemperatur liegen.');return;}
 }
 if(key==='wwZero'){
  const pair=wwPairs[currentWwMode()],stop=pair?num(pair[1]):null;
  if(stop!==null&&value>=stop){toast('Die Temperatur für 0 % muss unter der angezeigten Stopptemperatur liegen.');return;}
 }
 pending=true;renderControls();
 try{
  if(c.kind==='select')await hass.callService('select','select_option',{option:value},{entity_id:c.id});
  else await hass.callService(c.domain||(c.kind==='switch'?'switch':'number'),c.kind==='switch'?(value?'turn_on':'turn_off'):'set_value',c.kind==='switch'?{}:{value},{entity_id:c.id});
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){hass=window.__NIBE_HASS||hass;if(equalControl(c,value,controlState(c)))break;await new Promise(r=>setTimeout(r,400));}
  if(!equalControl(c,value,controlState(c)))throw new Error(c.label+': Rückmeldung steht noch aus. Bitte Istwert prüfen.');
  rememberPrevious(c,baseline);delete dirty[key];toast(c.label+': Änderung von Home Assistant bestätigt');
 }catch(e){toast(e.message||'Änderung fehlgeschlagen');}finally{pending=false;renderControls();}
}
function svgEl(svg,n,a,t){const e=document.createElementNS(NS,n);for(const [k,v]of Object.entries(a))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;svg.appendChild(e);return e;}
function chartMessage(svg,msg){svg.replaceChildren();svgEl(svg,'text',{x:300,y:100,'text-anchor':'middle'},msg);}

const histIds=[M.vl,M.si,M.sa,M.out].filter(Boolean);
async function history(){
 if(!histIds.length){chartMessage($('chart'),'Keine Verlaufsentitäten zugeordnet');return;}
 const end=new Date(),start=new Date(end-86400000);
 try{
 const rows=await hass.callApi('GET','history/period/'+encodeURIComponent(start.toISOString())+'?filter_entity_id='+histIds.join(',')+'&end_time='+encodeURIComponent(end.toISOString())+'&minimal_response&no_attributes');
 hist={};for(let i=0;i<rows.length;i++){const series=rows[i];const id=series.find(x=>x.entity_id)?.entity_id;if(id)hist[id]=series.map(p=>({t:new Date(p.last_changed||p.last_updated).getTime(),v:['unknown','unavailable'].includes(p.state)?null:Number(p.state)}));}
 histStart=start;drawHistory(start);
 put('readout','Live-Verlauf · letzte 24 Stunden');
 }catch(e){chartMessage($('chart'),'Verlauf derzeit nicht verfügbar');put('readout','Verlaufsdaten konnten nicht geladen werden.');}
}
function drawHistory(start){
 const svg=$('chart');svg.replaceChildren();const width=Math.max(300,svg.clientWidth),height=svg.clientHeight||260;svg.setAttribute('viewBox','0 0 '+width+' '+height);
 const all=Object.values(hist).flat().filter(p=>Number.isFinite(p.v));if(!all.length){chartMessage(svg,'Noch keine Verlaufsdaten');return;}
 const low=Math.floor(Math.min(...all.map(p=>p.v))/10)*10,high=Math.max(low+10,Math.ceil(Math.max(...all.map(p=>p.v))/10)*10),X=t=>40+(t-start)/86400000*(width-65),Y=v=>height-30-(v-low)/(high-low)*(height-50);
 for(let v=low;v<=high;v+=10){svgEl(svg,'line',{x1:40,x2:width-25,y1:Y(v),y2:Y(v),stroke:'var(--line)'});svgEl(svg,'text',{x:34,y:Y(v)+4,'text-anchor':'end'},f(v,0));}
 [0,6,12,18,24].forEach(h=>svgEl(svg,'text',{x:40+h/24*(width-65),y:height-8,'text-anchor':'middle'},h===24?'jetzt':'vor '+(24-h)+' h'));
 const definitions=svgEl(svg,'defs',{}),gradient=svgEl(definitions,'linearGradient',{id:'history-area',x1:0,y1:0,x2:0,y2:1});svgEl(gradient,'stop',{offset:0,'stop-color':'var(--warm)','stop-opacity':'.25'});svgEl(gradient,'stop',{offset:1,'stop-color':'var(--warm)','stop-opacity':'.02'});
 const supply=hist[M.vl]||[];let gapStart=null;
 for(const p of supply){if(!Number.isFinite(p.v)&&gapStart===null)gapStart=p.t;else if(Number.isFinite(p.v)&&gapStart!==null){svgEl(svg,'rect',{x:X(gapStart),y:15,width:Math.max(0,X(p.t)-X(gapStart)),height:height-50,fill:'var(--bg)'});svgEl(svg,'text',{x:(X(gapStart)+X(p.t))/2,y:height/2,'text-anchor':'middle'},'keine Daten');gapStart=null;}}
 histIds.forEach((id,i)=>{let paths=[],active=[];for(const p of hist[id]||[]){if(!Number.isFinite(p.v)){if(active.length)paths.push(active);active=[];}else active.push(p);}if(active.length)paths.push(active);
 for(const segment of paths){if(i===0&&segment.length>1)svgEl(svg,'polygon',{points:X(segment[0].t)+','+(height-30)+' '+segment.map(p=>X(p.t)+','+Y(p.v)).join(' ')+' '+X(segment.at(-1).t)+','+(height-30),fill:'url(#history-area)'});svgEl(svg,'polyline',{points:segment.map(p=>X(p.t)+','+Y(p.v)).join(' '),fill:'none',stroke:['var(--warm)','#d9981b','var(--cool)','var(--muted)'][i],'stroke-width':i===0?2:1.5,'stroke-dasharray':i===1||i===2?'4 3':'none'});}
 });
 svg.onpointermove=ev=>{const r=svg.getBoundingClientRect(),t=start.getTime()+Math.max(0,Math.min(1,((ev.clientX-r.left)/r.width*width-40)/(width-65)))*86400000;
 put('readout',new Date(t).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})+' · '+histIds.map((id,i)=>{const p=(hist[id]||[]).filter(p=>p.t<=t).at(-1);return ['Vorlauf','Sole ein','Sole aus','Außen'][i]+' '+f(p?.v)+' °C';}).join(' · '));};
}
const energyIds=['used_total_kwh','produced_total_kwh','used_heating_kwh','produced_heating_kwh','used_hot_water_kwh','produced_hot_water_kwh','auxiliary_heating_kwh','auxiliary_hot_water_kwh'].map(E).filter(Boolean);
function viennaParts(date=new Date()){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function midnightUTC(y,m,d){let guess=Date.UTC(y,m-1,d);for(let i=0;i<2;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));guess+=Date.UTC(y,m-1,d)-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}return new Date(guess);}
function periodStart(key){const {year,month,day}=viennaParts();let local=new Date(Date.UTC(year,month-1,day));if(key==='yesterday')local.setUTCDate(local.getUTCDate()-1);if(key==='week')local.setUTCDate(local.getUTCDate()-(local.getUTCDay()+6)%7);if(key==='month')local.setUTCDate(1);if(key==='year')local=new Date(Date.UTC(year,0,1));return midnightUTC(local.getUTCFullYear(),local.getUTCMonth()+1,local.getUTCDate());}
function sumSeries(data,id){const a=data[id];return a?.length&&a.every(p=>Number.isFinite(p.change))?a.reduce((s,p)=>s+p.change,0):null;}
function energyPeriodRange(kind,offset=0,now=new Date()){
 const p=viennaParts(now);let base=new Date(Date.UTC(p.year,p.month-1,p.day));
 if(kind==='week')base.setUTCDate(base.getUTCDate()-(base.getUTCDay()+6)%7);
 if(kind==='month'){base.setUTCDate(1);base.setUTCMonth(base.getUTCMonth()+offset);}
 else if(kind==='year'){base=new Date(Date.UTC(p.year+offset,0,1));}
 else base.setUTCDate(base.getUTCDate()+offset*(kind==='week'?7:1));
 const next=new Date(base);if(kind==='year')next.setUTCFullYear(next.getUTCFullYear()+1);else if(kind==='month')next.setUTCMonth(next.getUTCMonth()+1);else next.setUTCDate(next.getUTCDate()+(kind==='week'?7:1));
 const convert=d=>midnightUTC(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
 const start=convert(base),boundary=convert(next),end=new Date(Math.min(now.getTime(),boundary.getTime()));
 return {start,end,boundary};
}
function energyPeriodLabel(kind,start,boundary){
 const opts={timeZone:'Europe/Vienna'},fmt=(date,extra)=>date.toLocaleDateString('de-AT',{...opts,...extra});
 if(kind==='day')return fmt(start,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 if(kind==='month')return fmt(start,{month:'long',year:'numeric'});
 if(kind==='year')return fmt(start,{year:'numeric'});
 const p=viennaParts(start),thursday=new Date(Date.UTC(p.year,p.month-1,p.day+3)),year=thursday.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));
 const week=Math.ceil((((thursday-first)/86400000)+1)/7);
 return 'KW '+week+' · '+fmt(start,{day:'numeric',month:'numeric'})+' – '+fmt(new Date(boundary-1),{day:'numeric',month:'numeric',year:'numeric'});
}
function renderEnergyPeriod(range){
 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===currentPeriod)));
 put('energyPeriodLabel',energyPeriodLabel(currentPeriod,range.start,range.boundary));
 $('energyPeriodLabel').dataset.start=range.start.toISOString();$('energyPeriodLabel').dataset.end=range.end.toISOString();
 $('energyNext').disabled=energyOffset>=0;$('energyNow').disabled=energyOffset===0;
 $('energyPrevious').setAttribute('aria-label',({day:'Vorheriger Tag',week:'Vorherige Woche',month:'Vorheriger Monat',year:'Vorheriges Jahr'})[currentPeriod]);
 $('energyNext').setAttribute('aria-label',({day:'Nächster Tag',week:'Nächste Woche',month:'Nächster Monat',year:'Nächstes Jahr'})[currentPeriod]);
 put('energyNow',({day:'Heute',week:'Diese Woche',month:'Dieser Monat',year:'Dieses Jahr'})[currentPeriod]);
}
const originRoleNames={wp:'energy_used_total_kwh',imported:'site_grid_import_energy',exported:'site_grid_export_energy',solar:'site_solar_ac_energy',hybrid:'site_hybrid_ac_energy',pv0:'site_hybrid_pv0_energy',pv1:'site_hybrid_pv1_energy',battery:'site_battery_discharge_energy'};
const originCache=new Map();
function originUnavailable(message){['originPv','originBattery','originGrid','originSelf','originUnknown'].forEach(id=>put(id,'–'));$('energyOriginRing').style.background='var(--diagram-line)';put('originNote',message);}
async function loadEnergyOrigin(start,end,seq,totalUsed){
 const roles=Object.fromEntries(Object.entries(originRoleNames).map(([role,name])=>[role,ids[name]]));
 if(Object.values(roles).some(id=>!id)){if(seq===energySeq)originUnavailable('Die Energiezähler für die Stromherkunft sind noch nicht vollständig zugeordnet.');return;}
 const factors=Object.fromEntries(Object.entries(roles).map(([role,id])=>[role,({Wh:0.001,kWh:1,MWh:1000})[entity(id)?.attributes?.unit_of_measurement]]));
 const endMs=Math.floor(end.getTime()/300000)*300000,startMs=start.getTime(),key=startMs+':'+endMs;
 try{
  let data=originCache.get(key);
  if(!data){data=await hass.callWS({type:'recorder/statistics_during_period',start_time:start.toISOString(),end_time:new Date(endMs).toISOString(),statistic_ids:[...new Set(Object.values(roles))],period:'5minute',types:['change']});originCache.clear();originCache.set(key,data);}
  if(seq!==energySeq)return;
  const result=summarizeOrigin(data,roles,factors,startMs,endMs),known=result.pv+result.battery+result.grid;
  if(totalUsed===null||known>totalUsed+0.02){originUnavailable('Die Stromherkunft kann für diesen Zeitraum noch nicht mit der WP-Energiebilanz abgeglichen werden.');return;}
  const unknown=Math.max(0,totalUsed-known),full=result.covered===result.expected&&result.expected>0&&unknown<0.005;
  for(const [id,value] of [['originPv',result.pv],['originBattery',result.battery],['originGrid',result.grid],['originUnknown',unknown]])put(id,f(value,2)+' kWh');
  put('originSelf',full&&totalUsed>0?f((result.pv+result.battery)/totalUsed*100,0)+' %':'–');
  const a=totalUsed>0?result.pv/totalUsed*100:0,b=totalUsed>0?(result.pv+result.battery)/totalUsed*100:0,c=totalUsed>0?known/totalUsed*100:0;
  $('energyOriginRing').style.background=totalUsed>0?'conic-gradient(#e8aa19 '+a+'%,#19b56c '+a+'% '+b+'%,#78859a '+b+'% '+c+'%,var(--diagram-line) '+c+'%)':'var(--diagram-line)';
  const coverage=result.expected>0?Math.min(100,result.covered/result.expected*100):0;
  put('originNote','Andere Verbraucher haben Vorrang. Zuordnung je 5 Minuten, danach summiert; innerhalb eines Intervalls rechnerisch. PV/Akku werden im verbleibenden Eigenstrommix aufgeteilt. '+(full?'Alle abgeschlossenen Intervalle sind abgedeckt.':'Datenabdeckung '+f(coverage,0)+' %; fehlende oder unplausible Abschnitte bleiben nicht zugeordnet.')+' Laufende 5 Minuten sind noch nicht enthalten.');
 }catch(e){if(seq===energySeq)originUnavailable('Die Verlaufsdaten für die Stromherkunft sind derzeit nicht verfügbar.');}
 autoHeight();
}
let currentPeriod='day',energyOffset=0;
async function loadEnergy(key=currentPeriod){
 currentPeriod=key;const seq=++energySeq;
 const range=energyPeriodRange(key,energyOffset);renderEnergyPeriod(range);
 const scopes=['total','heat','ww'];if(tab==='v2')originUnavailable('Stromherkunft wird berechnet …');
 scopes.forEach(s=>{put(s+'Used','…');put(s+'Made','…');put(s+'Cop','–');});
 try{
 if(!energyIds.length)throw new Error('Keine Energieentitäten zugeordnet');
 const {start,end}=range,data=await hass.callWS({type:'recorder/statistics_during_period',start_time:start.toISOString(),end_time:end.toISOString(),statistic_ids:energyIds,period:'day',types:['change']});
 if(seq!==energySeq)return;
 const val=s=>sumSeries(data,E(s));
 const heat=add([val('used_heating_kwh'),val('auxiliary_heating_kwh')]),ww=add([val('used_hot_water_kwh'),val('auxiliary_hot_water_kwh')]);
 const values={total:[val('used_total_kwh'),val('produced_total_kwh')],heat:[heat,val('produced_heating_kwh')],ww:[ww,val('produced_hot_water_kwh')]};
 for(const s of scopes){const [e,q]=values[s];put(s+'Used',f(e)+(e===null?'':' kWh'));put(s+'Made',f(q)+(q===null?'':' kWh'));put(s+'Cop',f(ratio(q,e)));}
 const total=add([heat,ww]);$('shareBars').replaceChildren();put('energyMixLabel',total>0?f(heat/total*100,0)+' %':'–');$('energyMixRing').style.setProperty('--mix',total>0?heat/total*100+'%':'0%');$('energyMixRing').classList.toggle('missing',!(total>0));
 if(total>0){for(const [label,value,cls]of [['Heizen',heat,''],['Warmwasser',ww,'ww']]){const row=document.createElement('div');row.className='energy-row '+cls;const span=document.createElement('span');span.textContent=label;const bar=document.createElement('div');bar.className='energy-bar';const i=document.createElement('i');i.style.width=value/total*100+'%';bar.appendChild(i);const b=document.createElement('b');b.textContent=f(value/total*100,0)+' %';row.append(span,bar,b);$('shareBars').appendChild(row);}}
 else $('shareBars').textContent=total===0?'Noch kein Verbrauch im Zeitraum.':'Keine vollständigen Verbrauchsdaten.';
 const first=Math.min(...Object.values(data).flat().map(p=>p.start));
 $('energyNote').textContent=energyPeriodLabel(key,start,range.boundary)+'. Zusatzheizung im Verbrauch enthalten. Gesamt enthält gegebenenfalls Kühlung. '+(first>start.getTime()+86400000?'Es sind nur Daten ab '+new Date(first).toLocaleDateString('de-AT',{timeZone:'Europe/Vienna'})+' vorhanden.':'Werte bis zum letzten abgeschlossenen Statistikintervall.');
 if(tab==='v2')await loadEnergyOrigin(start,end,seq,values.total[0]);
 }catch(e){if(seq!==energySeq)return;scopes.forEach(s=>{put(s+'Used','–');put(s+'Made','–');put(s+'Cop','–');});$('shareBars').textContent='Statistiken derzeit nicht verfügbar.';put('energyMixLabel','–');$('energyMixRing').classList.add('missing');put('energyNote','Statistikdaten konnten nicht geladen werden.');}
 autoHeight();
}
document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{energyOffset=0;loadEnergy(b.dataset.period);});
$('energyPrevious').onclick=()=>{energyOffset--;loadEnergy();};$('energyNext').onclick=()=>{if(energyOffset<0){energyOffset++;loadEnergy();}};$('energyNow').onclick=()=>{energyOffset=0;loadEnergy();};
async function loadToday(){
 if(!E('used_total_kwh')||!E('produced_total_kwh'))return;
 try{const data=await hass.callWS({type:'recorder/statistics_during_period',start_time:periodStart('today').toISOString(),end_time:new Date().toISOString(),statistic_ids:[E('used_total_kwh'),E('produced_total_kwh')],period:'day',types:['change']});const u=sumSeries(data,E('used_total_kwh')),q=sumSeries(data,E('produced_total_kwh'));today={used:u,made:q};put('liveUsed',u===null?'–':f(u)+' kWh');put('liveMade',q===null?'–':f(q)+' kWh');renderOverview();}
 catch(e){today={used:null,made:null};put('liveUsed','–');put('liveMade','–');renderOverview();}
}
function forecastCalendar(offset=1,now=new Date()){
 const p=viennaParts(now),d=new Date(Date.UTC(p.year,p.month-1,p.day));d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);
}
function forecastSampleDays(rows,target,today){
 const groups=new Map();for(const r of rows){if(r.datum>=today)continue;if(!groups.has(r.datum))groups.set(r.datum,[]);groups.get(r.datum).push(r);}
 const days=[...groups].filter(([,hours])=>hours.length===24&&new Set(hours.map(r=>r.stunde)).size===24&&hours.every(r=>Number.isFinite(r.waermepumpe_kw)&&r.waermepumpe_kw>=0)).map(([datum,stunden])=>({datum,stunden}));
 const wd=d=>new Date(d+'T12:00:00Z').getUTCDay(),weekend=d=>[0,6].includes(wd(d));
 const same=days.filter(d=>wd(d.datum)===wd(target)),type=days.filter(d=>weekend(d.datum)===weekend(target));
 return same.length>=3?{days:same,basis:'gleicher Wochentag'}:type.length>=5?{days:type,basis:'Werktag / Wochenende'}:{days,basis:'alle Tage'};
}
function forecastWpPattern(samples,target){
 // Independent WP estimate from EEDC's raw END-hour history. The public
 // display API may shift to BEGIN-hour rows and must not be mixed with it.
 if(samples.length<3)return null;
 const wp=[],targetMs=Date.parse(target+'T12:00:00Z');
 for(let h=0;h<24;h++){
  let sum=0,weight=0,count=0;
  for(const day of samples){
   const matches=day.stunden.filter(x=>x.stunde===h);if(matches.length>1)return null;if(!matches.length)continue;
   const row=matches[0];
   if(!Number.isFinite(row.waermepumpe_kw)||row.waermepumpe_kw<0)return null;
   const w=0.5**((targetMs-Date.parse(day.datum+'T12:00:00Z'))/86400000/14);
   sum+=row.waermepumpe_kw*w;weight+=w;count++;
  }
  if(count<3)return null;
  wp.push(sum/weight);
 }
 return wp;
}
function forecastSources(rows,wp){
 if(!wp||wp.length!==24||rows.length!==24)return null;
 const result=[];
 for(let h=0;h<24;h++){
  const matches=rows.filter(r=>r.stunde===h);if(matches.length!==1)return null;const r=matches[0],demand=wp[h];
  if(![demand,r.pv_kw,r.verbrauch_kw,r.netzbezug_kw,r.einspeisung_kw].every(v=>Number.isFinite(v)&&v>=0)||demand>r.verbrauch_kw+0.005||r.netzbezug_kw>r.verbrauch_kw+0.005||r.einspeisung_kw>Math.max(0,r.pv_kw-r.verbrauch_kw)+0.005)return null;
  const other=Math.max(0,r.verbrauch_kw-demand),pv=Math.min(demand,Math.max(0,r.pv_kw-other));
  const batteryPool=Math.max(0,r.verbrauch_kw-r.pv_kw-r.netzbezug_kw);
  const battery=Math.min(demand-pv,Math.max(0,batteryPool-Math.max(0,other-r.pv_kw)));
  const grid=Math.max(0,demand-pv-battery);
  if(Math.abs(grid-Math.min(demand,r.netzbezug_kw))>0.006)return null;
  result.push({stunde:h,pv,battery,grid,total:demand});
 }
 const sum=key=>result.reduce((s,r)=>s+r[key],0);
 return {hours:result,pv:sum('pv'),battery:sum('battery'),grid:sum('grid'),total:sum('total')};
}
let forecastOffset=1,forecastSeq=0,forecastData=null,forecastError='',forecastLoading=false,forecastActive='',forecastLoadedAt=0;
const forecastCache=new Map();let forecastHistoryCache=null;
function forecastTravel(offset){forecastOffset=Math.max(0,Math.min(14,offset));forecastData=null;forecastError='';forecastActive='';forecastLoadedAt=0;forecastSeq++;renderForecast();loadForecast();}
$('forecastPrevious').onclick=()=>forecastTravel(forecastOffset-1);$('forecastNext').onclick=()=>forecastTravel(forecastOffset+1);$('forecastTomorrow').onclick=()=>forecastTravel(1);
async function forecastHistory(){
 if(!forecastHistoryCache||forecastHistoryCache.date!==forecastCalendar(0)||Date.now()-forecastHistoryCache.loadedAt>=600000){
  const item={date:forecastCalendar(0),loadedAt:Date.now()};item.task=hass.eedcRead('/api/energie-profil/'+window.WP_CONFIG.eedc.anlage_id+'/debug-rohdaten?tage=30').then(data=>data.zeilen||[]).catch(e=>{if(forecastHistoryCache===item)forecastHistoryCache=null;throw e;});forecastHistoryCache=item;
 }
 return forecastHistoryCache.task;
}
async function loadForecast(){
 if(tab!=='v4'||!hass||disposed)return;
 const target=forecastCalendar(forecastOffset),seq=forecastSeq;
 if(forecastActive===target||forecastData?.datum===target&&Date.now()-forecastLoadedAt<600000)return;
 forecastActive=target;forecastLoading=true;forecastError='';forecastData=null;renderForecast();
 try{
  if(!window.WP_CONFIG.eedc)throw new Error('EEDC ist für diese Karte noch nicht verbunden.');
  const id=window.WP_CONFIG.eedc.anlage_id;let data=forecastCache.get(target);
  if(!data||Date.now()-data.loadedAt>=600000){
   const day=await hass.eedcRead('/api/energie-profil/'+id+'/tagesprognose?datum='+target);
   if(day.datum!==target||!Array.isArray(day.stunden))throw new Error('EEDC hat keinen passenden Prognosetag geliefert.');
   let wp=null,wpError='',wpDays=0,wpBasis='';
   if(Number.isFinite(day.verbrauch_summe_kwh))try{
    const selected=forecastSampleDays(await forecastHistory(),target,forecastCalendar(0));wpDays=selected.days.length;wpBasis=selected.basis;
    wp=forecastWpPattern(selected.days,target);
    if(!wp)wpError='WP-Muster nicht belastbar: fehlende Stunden oder widersprüchliche Verbrauchswerte.';
   }catch(e){wpError='WP-Muster nicht verfügbar: '+(e.message||'Historie fehlt.');}
   data={...day,wp,wpDays,wpBasis,wpError,sources:forecastSources(day.stunden,wp),loadedAt:Date.now()};forecastCache.set(target,data);
  }
  if(seq!==forecastSeq||disposed)return;forecastData=data;forecastLoadedAt=data.loadedAt;
 }catch(e){if(seq===forecastSeq&&!disposed){forecastError=e.message||'EEDC nicht erreichbar.';forecastLoadedAt=Date.now();}}
 finally{if(seq===forecastSeq&&!disposed){forecastActive='';forecastLoading=false;renderForecast();autoHeight();}}
}
function renderForecast(){
 const target=forecastCalendar(forecastOffset),d=forecastData?.datum===target?forecastData:null,s=d?.sources;
 put('forecastDate',new Date(target+'T12:00:00Z').toLocaleDateString('de-AT',{timeZone:'Europe/Vienna',weekday:'long',day:'numeric',month:'long',year:'numeric'}));
 $('forecastPrevious').disabled=forecastOffset===0;$('forecastNext').disabled=forecastOffset===14;$('forecastTomorrow').disabled=forecastOffset===1;
 put('fcSub',forecastLoading?'EEDC-Prognose wird geladen …':forecastError||'EEDC · Tagesvorschau von 00:00 bis 24:00');
 const wp=d?.wp?.reduce((a,b)=>a+b,0);put('fcE',Number.isFinite(wp)?'≈ '+f(wp)+' kWh':'–');put('fcQ',Number.isFinite(d?.verbrauch_summe_kwh)?f(d.verbrauch_summe_kwh)+' kWh':'–');put('fcC',Number.isFinite(d?.pv_summe_kwh)?f(d.pv_summe_kwh)+' kWh':'–');put('fcH',s?'≈ '+f(s.grid)+' kWh':'–');
 put('fcEs','Gewichtetes WP-Stundenmuster');put('fcQs','EEDC · alle Verbraucher zusammen');put('fcCs','EEDC · '+(d?.pv_quelle||'PV-Prognose'));put('fcHs','Übrige Verbraucher haben Vorrang');
 const self=s&&s.total>0?100*(s.pv+s.battery)/s.total:null;put('fcPv',self===null?'–':'≈ '+f(self,0)+' %');
 const ring=$('forecastMixRing');ring.classList.toggle('missing',!s||s.total<=0);ring.style.background=s&&s.total>0?'conic-gradient(#e8aa19 '+s.pv/s.total*100+'%,#19b56c 0 '+(s.pv+s.battery)/s.total*100+'%,#78859a 0)':'var(--diagram-line)';
 $('fcModel').replaceChildren();for(const [label,key]of [['PV-Anlage','pv'],['Akku','battery'],['Netz','grid']]){const row=document.createElement('div');row.className='row';const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=s?'≈ '+f(s[key],2)+' kWh · '+f(s.total>0?s[key]/s.total*100:0,0)+' %':'–';row.append(dt,dd);$('fcModel').appendChild(row);}
 put('forecastNote',d?.wpError||(!s&&d?'Stromherkunft nicht berechenbar.':'Stündliche Schätzung: erst übriger Hausverbrauch, dann WP; PV vor Akku, Rest aus dem Netz. Späterer Überschuss gleicht früheren Netzbezug nicht aus.'));
 const soc=d?.stunden?.find(r=>r.stunde===23)?.soc_prozent;put('fcTemp',Number.isFinite(soc)?f(soc,0)+' %':'–');
 put('fcBatteryNote',d?'EEDC simuliert den ganzen Tag mit einem Start-Ladestand aus vergangenen Mitternachtswerten (sonst 50 %). Kein fortgeschriebener Live-Ladestand. Kapazität '+f(d.speicher_kapazitaet_kwh)+' kWh'+(d.speicher_leer_um?' · leer um '+d.speicher_leer_um:'')+(d.speicher_voll_um?' · voll um '+d.speicher_voll_um:'')+'.':'Speicherprognose wird mit EEDC geladen.');
 put('accRead',d?('WP: '+d.wpDays+' Vergleichstage · '+d.wpBasis+' · Haus: '+d.daten_tage+' Vergleichstage'):'–');
 put('fcUpdated',d?new Date(d.loadedAt).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})+' · Abruf alle 10 Minuten bei sichtbarer Prognose':'–');
 put('fcAcc','Haus/PV/Akku direkt aus EEDC. WP-Muster aus maximal 30 Tagen EEDC-Rohhistorie mit 14 Tagen Halbwertszeit, ohne zusätzliche Wetterkorrektur. Beide Verbrauchsmodelle sind verschieden; übersteigt der WP-Bedarf das Hausprofil, bleibt die Stromzuordnung offen. ≈ kennzeichnet eine Schätzung. '+(d?.hinweise||[]).join(' '));
 put('fcRead',s?'24 Stunden · Summe entspricht der WP-Tagesprognose. Stundenmittel zeigen keine kurzfristigen Lastspitzen.':d?.wpError||forecastError||'Stundenprognose wird geladen …');drawForecast(s);
}
function drawForecast(s){
 const svg=$('fcChart');svg.replaceChildren();const width=Math.max(280,svg.clientWidth||720);svg.setAttribute('viewBox','0 0 '+width+' 240');
 if(!s){chartMessage(svg,forecastLoading?'Prognose wird geladen …':'Kein belastbares WP-Stundenprofil');return;}
 const max=Math.max(.2,...s.hours.map(h=>h.total))*1.15,base=210,top=20,left=36,step=(width-58)/24;
 for(let i=0;i<=4;i++){const value=max*i/4,y=base-(base-top)*i/4;svgEl(svg,'line',{x1:left,x2:width-14,y1:y,y2:y,stroke:'var(--line)'});svgEl(svg,'text',{x:30,y:y+4,'text-anchor':'end'},f(value,1));}
 for(const h of s.hours){let y=base;for(const [key,color]of [['pv','#e8aa19'],['battery','#19b56c'],['grid','#78859a']]){const height=h[key]/max*(base-top),rect=svgEl(svg,'rect',{x:left+h.stunde*step+step*.12,y:y-height,width:step*.76,height,rx:2,fill:color});svgEl(rect,'title',{},String(h.stunde).padStart(2,'0')+':00 · '+({pv:'PV',battery:'Akku',grid:'Netz'})[key]+' '+f(h[key],3)+' kWh');y-=height;}}
 for(const h of [0,6,12,18,24])svgEl(svg,'text',{x:left+h*step,y:233,'text-anchor':'middle'},String(h).padStart(2,'0')+':00');
}

document.querySelector('#v3 .note').textContent=(window.WP_CONFIG.enable_controls?'':'Nur Anzeige. Steuerung ist in der Kartenkonfiguration ausgeschaltet. ')+'„Vorher“ und „Speichern“ erscheinen nur bei einer offenen Änderung. Speichern schreibt nur diesen Wert. WP-Abfrage beim Öffnen und alle 30 Sekunden bei sichtbarer Seite. Nicht geprüfte Funktionen bleiben gesperrt.';
document.querySelector('footer').textContent='Live-Daten aus Home Assistant. „–“ bedeutet: nicht verfügbar oder noch nicht geprüft. ≈ kennzeichnet geschätzte Heizstabwärme. Wärme und COP können bei Umschaltung oder ungültigen Messwerten nicht verfügbar sein. Sole-Volumenstrom und gemessener Speicher-Ladegrad fehlen weiterhin. Der Speicherbalken zeigt ausschließlich das Temperaturniveau zwischen der unter Steuerung eingestellten 0-%-Temperatur und der Stopptemperatur des angezeigten WW-Modus. Die Starttemperatur bleibt als Ladegrenze sichtbar.';
put('readout','Verlaufsdaten werden geladen …');chartMessage($('chart'),'Verlaufsdaten werden geladen …');
async function tick(){
 if(disposed)return;
 hass=window.__NIBE_HASS;
 if(!hass){put('stMode','Verbindung wird hergestellt …');return;}
 render();
 const visible=document.visibilityState!=='hidden'&&(!window.frameElement||window.frameElement.getClientRects().length>0);
 if(visible&&!wasPumpVisible){pumpRefreshDue=true;lastFetch=0;}
 wasPumpVisible=visible;
 if(visible&&!pending&&!pumpRefreshBusy&&(pumpRefreshDue||Date.now()-lastPumpRefresh>=30000)){
  pumpRefreshBusy=true;pumpRefreshDue=false;lastPumpRefresh=Date.now();
  try{await hass.refreshPump?.();pumpRefreshError='';}
  catch(e){pumpRefreshError=e.message||'WP-Abfrage fehlgeschlagen';}
  finally{pumpRefreshBusy=false;}
  if(disposed)return;
  hass=window.__NIBE_HASS||hass;render();
 }
 $('liveBadge').title=pumpRefreshError?'WP-Aktualisierung fehlgeschlagen: '+pumpRefreshError:'WP-Abfrage beim Öffnen und alle 30 Sekunden bei sichtbarer Seite';
 put('dataBadge',pumpRefreshError?'Abfrage fehlgeschlagen':'Home Assistant');
 if(visible&&!busy&&Date.now()-lastFetch>=30000){busy=true;lastFetch=Date.now();try{await Promise.allSettled([history(),loadEnergy(currentPeriod),loadToday(),loadForecast()]);}finally{busy=false;}}
}
document.querySelector('h1').textContent=({v2:'Energie',v3:'Einstellungen',v4:'Prognose'})[tab]||window.WP_CONFIG.title;
document.querySelector('.model').textContent=window.WP_CONFIG.model;
function pageVisible(){if(document.visibilityState!=='hidden'){pumpRefreshDue=true;tick();}}
document.addEventListener('visibilitychange',pageVisible);
window.__NIBE_TICK=tick;tick();const timer=setInterval(tick,1000);window.__NIBE_DISPOSE=()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',pageVisible);};window.addEventListener('pagehide',window.__NIBE_DISPOSE);
})();
