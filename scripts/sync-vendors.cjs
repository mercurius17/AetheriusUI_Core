'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const core = path.resolve(__dirname, '..');
const test = path.resolve(process.argv[2] || 'C:/Code/Aetherius-MP-Teste');
const gameplay = path.resolve(process.argv[3] || 'C:/Code/Aetherius - SkyMP/referencias/AetheriusGameplayCore/modules/class-system');
const destinations = [path.join(test, 'repos', 'aetherius-client', 'client', 'vendor', 'aetherius-ui-core'), path.join(test, 'repos', 'aetherius-server', 'server', 'vendor', 'aetherius-ui-core'), path.join(gameplay, 'vendor', 'ui-core')];
const hashes = [];
function walk(directory) { for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, item.name); if (item.isDirectory()) walk(file); else hashes.push({ path: path.relative(core, file).replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }); } }
for (const name of ['shared', 'sdk']) walk(path.join(core, name));
for (const destination of destinations) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['shared', 'sdk']) fs.cpSync(path.join(core, name), path.join(destination, name), { recursive: true });
  fs.writeFileSync(path.join(destination, 'PROVENANCE.json'), JSON.stringify({ source: 'https://github.com/mercurius17/AetheriusUI_Core', baseline: '065c7468b4e439289d55f9c4c03b8b0b8e293778', localChanges: true, files: hashes }, null, 2) + '\n');
}
console.log('Core SDK synchronized into 3 portable vendor trees; provenance recorded.');
