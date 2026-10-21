import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const [base, markup, css, driver, entityText, packageText] = await Promise.all([
  read('src/card.js'), read('src/dashboard.html'), read('src/dashboard.css'),
  read('src/dashboard.js'), read('examples/entities.s1155.json'), read('package.json'),
]);
new vm.Script(driver);
const roles = Object.keys(JSON.parse(entityText));
const version = JSON.parse(packageText).version;
const result = base.replace('__VERSION__', version)
  .replace('__TEMPLATE__', () => JSON.stringify(markup))
  .replace('__STYLE__', () => JSON.stringify(css))
  .replace('__DRIVER__', () => JSON.stringify(driver))
  .replace('__ROLES__', () => JSON.stringify(roles));
if (/__(?:TEMPLATE|STYLE|DRIVER|ROLES|VERSION)__/.test(result)) throw new Error('Build-Platzhalter nicht ersetzt.');
if (/https?:\/\/fonts\./.test(result)) throw new Error('Externe Schriftressource gefunden.');
await mkdir(new URL('../dist', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/nibe-flow-card.js', import.meta.url), result);
console.log('Built nibe-flow-card.js (' + Buffer.byteLength(result) + ' bytes)');
