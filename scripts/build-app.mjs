import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import vm from 'node:vm';
const root=new URL('../',import.meta.url),dest=new URL('nibe_flow/app/static/',root);await mkdir(dest,{recursive:true});
let source=await readFile(new URL('dist/nibe-flow-card.js',root),'utf8');
const extension=await readFile(new URL('src/controls-v2.js',root),'utf8'),ctx=vm.createContext({});vm.runInContext(extension.slice(0,extension.indexOf('const waitHass'))+';globalThis.ops=OPS;',ctx);
for(const [before,after]of ctx.ops){if(source.split(before).length!==2)throw Error('App build: v2 patch no longer matches '+before.slice(0,60));source=source.replace(before,()=>after);}
// App transport is same-origin. No Supervisor token, parent-HA DOM access,
// Lovelace resource lookup, or EEDC session cookie enters this frontend.
const start=source.indexOf('export async function readEedc('),end=source.indexOf('export function createBridge(',start);
source=source.slice(0,start)+`export async function readEedc(hass,config,path){return hass.eedcRead(path);}\n\n`+source.slice(end);
await writeFile(new URL('card.js',dest),source);
await copyFile(new URL('LICENSE',root),new URL('nibe_flow/LICENSE',root));
console.log('Built standalone HA App frontend with all v2 controls ('+Buffer.byteLength(source)+' bytes)');
