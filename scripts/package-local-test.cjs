'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const core = path.resolve(__dirname, '..');
const test = path.resolve(process.argv[2] || 'C:/Code/Aetherius-MP-Teste');
const gameplay = path.resolve(process.argv[3] || 'C:/Code/Aetherius - SkyMP/referencias/AetheriusGameplayCore/modules/class-system');
const target = path.join(test, 'packages', 'Aetherius UI - Core Test');
const data = path.join(target, 'Data');
const frontend = path.join(data, 'MeridianUI', 'aetheriusui');
const bridge = path.join(test, 'build', 'ui-bridge-msvc2026', 'dist', 'RelWithDebInfo', 'Data', 'SKSE', 'Plugins', 'AetheriusUIBridge.dll');
const meridian = path.join(test, 'build', 'meridian-movement-native', 'dist', 'Release', 'Data');
const copy = (source, destination) => { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.cpSync(source, destination, { recursive: true }); };
if (!fs.existsSync(bridge)) throw new Error('Build the bridge first.');
fs.mkdirSync(data, { recursive: true });
// Rebuild only this script's exact staging Data directory, so removed demo
// assets cannot survive a subsequent package generation.
if (path.resolve(data) !== path.join(test, 'packages', 'Aetherius UI - Core Test', 'Data')) throw new Error('Unsafe package staging path');
fs.rmSync(data, { recursive: true });
fs.mkdirSync(data, { recursive: true });
fs.cpSync(path.join(core, 'frontend', 'Data'), data, { recursive: true, filter: source => path.basename(source) !== 'preview' });
copy(bridge, path.join(data, 'SKSE', 'Plugins', 'AetheriusUIBridge.dll'));
const pdb = bridge.replace(/\.dll$/i, '.pdb');
if (!fs.existsSync(pdb)) throw new Error('Bridge debug symbols missing.');
copy(pdb, path.join(target, 'symbols', 'AetheriusUIBridge.pdb'));
const meridianSymbols = path.join(test, 'build', 'meridian-movement-native', 'symbols', 'Release');
if (fs.existsSync(meridianSymbols)) copy(meridianSymbols, path.join(target, 'symbols', 'meridian'));
// Require a complete Meridian release tree; never mix its CEF with the installed
// older renderer or with the server's unrelated CEF 108 dependency.
for (const asset of ['SKSE/Plugins/MeridianUIPlugin.dll', 'MeridianUI/MeridianUI.dll', 'MeridianUI/libcef.dll', 'MeridianUI/MeridianCEFSubProcess.exe']) {
  if (!fs.existsSync(path.join(meridian, asset))) throw new Error('Incomplete Meridian release: ' + asset);
}
copy(meridian, data);
copy(path.join(test, 'repos', 'aetherius-client', 'build', 'dist', 'client', 'Data', 'Platform', 'Plugins', 'skymp5-client.js'), path.join(data, 'Platform', 'Plugins', 'skymp5-client.js'));
fs.writeFileSync(path.join(data, 'Platform', 'Plugins', 'skymp5-client-settings.txt'), JSON.stringify({ 'aetherius-local-test': true, 'aetherius-ui-diagnostics': path.join(test, 'runtime', 'client-ui.log'), 'server-ip': '127.0.0.1', 'server-port': 7777, 'server-info-ignore': true, master: 'http://127.0.0.1:1', gameData: { profileId: 900001 } }, null, 2));
const classDir = path.join(frontend, 'modules', 'class');
for (const name of ['class-module.js', 'class-module.css']) copy(path.join(gameplay, 'ui', name), path.join(classDir, name));
copy(path.join(gameplay, 'ui', 'js', 'embedded-data.js'), path.join(classDir, 'data.js'));
copy(path.join(gameplay, 'ui', 'assets'), path.join(classDir, 'assets'));
for (const name of ['party-module.js', 'party-module.css']) copy(path.join(gameplay, 'ui', name), path.join(frontend, 'modules', 'party', name));
copy(path.join(core, 'ui-inventory', 'ui', 'map-module.js'), path.join(frontend, 'modules', 'map', 'map-module.js'));
for (const name of ['inventory-module.js', 'inventory-module.css', 'sketch-icons.js', 'momentum-scroll.js', 'preview-controller.js']) copy(path.join(core, 'ui-inventory', 'ui', name), path.join(frontend, 'modules', 'inventory', name));
copy(path.join(core, 'ui-inventory', 'ui', 'spells-module.js'), path.join(frontend, 'modules', 'spells', 'spells-module.js'));
const modulesConfig = JSON.parse(fs.readFileSync(path.join(core, 'integrations', 'modules.local-test.json'), 'utf8'));
for (const entry of modulesConfig.modules) for (const asset of [...entry.styles, ...entry.scripts]) {
  if (!asset.startsWith('modules/' + entry.id + '/') || asset.includes('..') || !fs.existsSync(path.join(frontend, asset))) throw new Error('Invalid installed module asset: ' + asset);
}
fs.writeFileSync(path.join(frontend, 'modules-config.js'), 'window.AetheriusUIInstalledModules=Object.freeze(' + JSON.stringify(modulesConfig) + ');\n');
const files = [];
function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) walk(file);
    else files.push({ path: path.relative(target, file).replaceAll('\\', '/'), size: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  }
}
walk(data);
walk(path.join(target, 'symbols'));
fs.writeFileSync(path.join(target, 'artifact-manifest.json'), JSON.stringify({ schemaVersion: 1, generated: new Date().toISOString(), runtime: '1.6.1170.0', testOnly: true, movementExtension: 'Aetherius.KeyboardMovement/1', gameplayMutations: false, files }, null, 2) + '\n');
console.log(JSON.stringify({ target, files: files.length }));
