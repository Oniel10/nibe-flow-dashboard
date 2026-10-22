// Real UI, synthetic HA: never connects to a heat pump.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=process.env.PLAYWRIGHT_MODULE?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE)):await import('playwright');
const asset=await readFile(new URL('../'+(process.env.BOOST_ASSET||'dist/nibe-flow-card.js'),import.meta.url));
const html=`<script type="module">
import '/card.js';
window.calls=[];window.fail=false;window.hold=false;window.noFeedback=false;
window.config={enable_controls:true,boost_start_value:2,boost_stop_value:0,entities:{more_hot_water_40698:'number.demo_boost',nibe_ww_anzeige_nullpunkt:'input_number.demo_zero'}};
window.fixture={states:{'number.demo_boost':{state:'0',attributes:{min:-128,max:127,step:1}},'input_number.demo_zero':{state:'40',attributes:{min:20,max:60,step:1}}},themes:{},callApi:async()=>[],callWS:async()=>({}),callService:async(...args)=>{
 calls.push(args);if(fail)throw Error('Test connection failed');if(hold)await new Promise(resolve=>window.release=resolve);
 if(!noFeedback)fixture.states['number.demo_boost'].state=String(args[2].value);card.hass=fixture;
}};
window.card=document.createElement('${process.env.BOOST_TAG||'nibe-flow-card'}');card.setConfig(config);card.hass=fixture;document.body.append(card);
</script>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/card.js'?'text/javascript':'text/html');res.end(req.url==='/card.js'?asset:html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:900});await page.goto('http://127.0.0.1:'+server.address().port);
 const frame=page.frameLocator('iframe'),desktop=frame.locator('.flow-desktop .new-boost'),mobile=frame.locator('.flow-mobile .new-boost');
 await desktop.waitFor();assert.equal(await page.evaluate(()=>calls.length),0);
 assert.equal(await desktop.isEnabled(),true,'Configured desktop boost must be clickable');
 await frame.locator('#t3').click();await frame.locator('#c_wwZero').evaluate(input=>{input.value='44';input.dispatchEvent(new Event('input'));});await frame.locator('#t1').click();
 await page.evaluate(()=>hold=true);await desktop.click();await page.waitForFunction(()=>calls.length===1);
 assert(await desktop.isDisabled());assert(await mobile.isDisabled());assert(await frame.locator('#boost').isDisabled());
 assert.deepEqual(await page.evaluate(()=>calls[0]),['number','set_value',{value:2},{entity_id:'number.demo_boost'}]);
 await page.evaluate(()=>{hold=false;release();});await desktop.filter({hasText:'beenden'}).waitFor();
 await page.setViewportSize({width:390,height:844});await mobile.click();await page.waitForFunction(()=>calls.length===2);
 assert.deepEqual(await page.evaluate(()=>calls[1]),['number','set_value',{value:0},{entity_id:'number.demo_boost'}]);
 await mobile.filter({hasText:'WW-Boost'}).waitFor();
 await frame.locator('#t3').click();assert(await frame.locator('#boost').isEnabled());
 assert(await frame.locator('#actions_wwZero').isVisible());assert.equal(await frame.locator('#c_wwZero').inputValue(),'44');
 await page.evaluate(()=>fail=true);await frame.locator('#boost').click();await frame.locator('#toast').filter({hasText:'Test connection failed'}).waitFor();
 assert.equal(await page.evaluate(()=>fixture.states['number.demo_boost'].state),'0');
 await page.clock.install();await page.evaluate(()=>{fail=false;noFeedback=true;});await frame.locator('#boost').click();
 await page.clock.runFor(13000);await frame.locator('#toast').filter({hasText:'Rückmeldung steht noch aus'}).waitFor();
 assert.equal(await frame.locator('#boost').getAttribute('aria-pressed'),'false');assert(await frame.locator('#boost').isEnabled());
 await page.evaluate(()=>{card.setConfig({...config,enable_controls:false});card.hass=fixture;});
 assert(await mobile.isDisabled());
 await page.evaluate(()=>{card.setConfig({...config,boost_start_value:null});card.hass=fixture;});
 assert(await mobile.isDisabled());assert.match(await mobile.getAttribute('title'),/Boost.*konfigurieren/);
 await page.evaluate(()=>{fixture.states['number.demo_boost'].state='4';card.setConfig(config);card.hass=fixture;});
 assert(await mobile.isDisabled());
 await page.evaluate(()=>{fixture.states['number.demo_boost'].state='unavailable';card.setConfig(config);card.hass=fixture;});
 assert(await mobile.isDisabled());
 assert.equal(await page.evaluate(()=>calls.length),4);assert.deepEqual(errors,[]);
 console.log('PASS WW boost: desktop/mobile/settings, exact isolated writes, pending lock, errors, read-only, missing mapping and unavailable entity.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
