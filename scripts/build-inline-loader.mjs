// Self-contained installation resource for HA's 128 KiB inline-resource limit.
// The ordinary HACS release remains dist/nibe-flow-card.js.
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const source=await readFile(new URL('../dist/nibe-flow-card.js',import.meta.url));
const compressed=gzipSync(source,{level:9}).toString('base64');
const loader=`const payload=Uint8Array.from(atob(${JSON.stringify(compressed)}),c=>c.charCodeAt(0));\nconst source=await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).text();\nconst moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));\ntry{await import(moduleUrl);}finally{URL.revokeObjectURL(moduleUrl);}\n`;
await writeFile(new URL('../dist/nibe-flow-card-inline.js',import.meta.url),loader);
console.log('Self-contained inline loader: '+Buffer.byteLength(loader)+' bytes; original: '+source.length+' bytes.');
