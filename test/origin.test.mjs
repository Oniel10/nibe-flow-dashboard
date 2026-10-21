import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../src/dashboard.js',import.meta.url),'utf8');const ctx=vm.createContext({});vm.runInContext(src.slice(src.indexOf('function allocatePriorityEnergy'),src.indexOf('function mixCO2')),ctx);
for(const [name,args,expected] of [
 ['other loads first',[2,1,0,4,0,0,0],[1,0,1,0]],
 ['grid exceeds WP',[2,4,0,4,0,0,0],[0,0,2,0]],
 ['PV covers everything',[2,0,1,5,0,0,0],[2,0,0,0]],
 ['battery night',[2,0,0,0,5,0,6],[0,2,0,0]],
 ['hybrid conversion and no double count',[2,1,0,0,4,3,1],[.75,.25,1,0]],
 ['no local data',[2,1,null,null,null,null,null],[0,0,1,1]],
 ['insufficient local source',[2,0,0,1,0,0,0],[0,0,0,2]],
 ['zero WP',[0,1,0,0,0,0,0],[0,0,0,0]],
])test(name,()=>{const r=ctx.allocatePriorityEnergy(...args);assert.deepEqual([r.pv,r.battery,r.grid,r.unknown],expected);});
test('missing import never becomes zero grid',()=>assert.equal(ctx.allocatePriorityEnergy(2,null,0,5,0,0,0),null));
test('500 conservation/priority cases',()=>{for(let n=0;n<500;n++){const wp=(n%23)/10,imp=(n%17)/10,solar=(n%11)+3,hybrid=(n%7)+3,pvdc=5,batdc=2;const r=ctx.allocatePriorityEnergy(wp,imp,0,solar,hybrid,pvdc,batdc);assert(Math.abs(r.pv+r.battery+r.grid+r.unknown-wp)<1e-9);assert.equal(r.grid,Math.min(wp,imp));}});
test('no daily netting; sunny later interval does not erase earlier grid',()=>{const ids={wp:'w',imported:'g',exported:'e',solar:'s',hybrid:'h',pv0:'p0',pv1:'p1',battery:'b'},factors=Object.fromEntries(Object.keys(ids).map(k=>[k,1]));const series={w:[1,1],g:[2,0],e:[0,2],s:[0,4],h:[0,0],p0:[0,0],p1:[0,0],b:[0,0]},data=Object.fromEntries(Object.entries(series).map(([id,values])=>[id,values.map((change,i)=>({start:i*300000,change}))]));const r=ctx.summarizeOrigin(data,ids,factors,0,600000);assert.equal(r.grid,1);assert.equal(r.pv,1);assert.equal(r.covered,2);data.g.pop();const missing=ctx.summarizeOrigin(data,ids,factors,0,600000);assert.equal(missing.unknown,1);assert.equal(missing.grid,1);});

