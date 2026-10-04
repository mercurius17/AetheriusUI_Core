'use strict';
// Read-only MO2 discovery export -> isolated, byte-identical plugin staging.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { argv } = process;
const testRoot = path.resolve(argv[2] || 'C:/Code/Aetherius-MP-Teste');
const mo2 = path.resolve(argv[3] || 'C:/modOrganizer');
const gameData = path.resolve(argv[4] || 'C:/Games/Steam/steamapps/common/Skyrim Special Edition/Data');
const report = JSON.parse(fs.readFileSync(path.join(testRoot, 'load-order-vfs.json'), 'utf8'));
if (report.read_incomplete || report.results.length !== 424) throw new Error('Re-export the complete current profile with houseCARL (expected audited 424 plugins).');
const profileOrder = fs.readFileSync(path.join(mo2, 'profiles', report.profile, 'loadorder.txt'), 'utf8').split(/\r?\n/).map(n => n.trim()).filter(n => n && !n.startsWith('#'));
const modPriority = fs.readFileSync(path.join(mo2, 'profiles', report.profile, 'modlist.txt'), 'utf8').split(/\r?\n/).filter(n => n.startsWith('+')).map(n => n.slice(1).toLowerCase());
const priority = name => name.toLowerCase() === 'overwrite' ? -1 : name === 'Data' ? Number.MAX_SAFE_INTEGER : modPriority.indexOf(name.toLowerCase());
if (JSON.stringify(profileOrder.map(n => n.toLowerCase())) !== JSON.stringify(report.results.map(r => r.path.toLowerCase()))) throw new Error('Profile changed since VFS discovery. Re-export before staging.');
const runtime = path.join(testRoot, 'runtime');
const dataDir = path.join(runtime, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'scripts'), { recursive: true });
const plugins = [];
const earlier = new Set();
let regular = 0, light = 0;
for (const result of report.results) {
  if (!result.exists || result.error || result.winner.kind !== 'loose' || path.basename(result.path) !== result.path || !/\.es[mpl]$/i.test(result.path)) throw new Error('Unresolved VFS winner: ' + result.path);
  if (result.winner.name !== 'Data' && result.winner.name.toLowerCase() !== 'overwrite' && priority(result.winner.name) < 0) throw new Error('Disabled VFS winner: ' + result.path);
  if (result.providers.some(p => priority(p.name) < priority(result.winner.name))) throw new Error('VFS export disagrees with MO2 precedence: ' + result.path);
  const base = result.winner.name === 'Data' ? gameData : result.winner.name.toLowerCase() === 'overwrite' ? path.join(mo2, 'overwrite') : path.join(mo2, 'mods', result.winner.name);
  const source = path.resolve(base, result.path);
  if (!source.toLowerCase().startsWith(path.resolve(base).toLowerCase() + path.sep)) throw new Error('Unsafe source path');
  const bytes = fs.readFileSync(source);
  if (bytes.subarray(0, 4).toString() !== 'TES4' || bytes.length < 24) throw new Error('Invalid TES4: ' + result.path);
  const flags = bytes.readUInt32LE(8), headerSize = bytes.readUInt32LE(4);
  if (headerSize > bytes.length - 24 || headerSize > 16 * 1024 * 1024) throw new Error('Invalid TES4 size');
  const masters = [];
  for (let offset = 24; offset < 24 + headerSize;) {
    const type = bytes.subarray(offset, offset + 4).toString();
    let size = bytes.readUInt16LE(offset + 4); offset += 6;
    if (type === 'XXXX') { const extended = bytes.readUInt32LE(offset); offset += size; size = extended; offset += 6; }
    if (offset + size > 24 + headerSize) throw new Error('Invalid TES4 field');
    if (type === 'MAST') masters.push(bytes.subarray(offset, offset + size).toString('utf8').replace(/\0.*$/, ''));
    offset += size;
  }
  for (const master of masters) if (!earlier.has(master.toLowerCase())) throw new Error(result.path + ': missing or late master ' + master);
  const small = Boolean(flags & 0x200);
  const index = small ? `FE:${(light++).toString(16).padStart(3, '0')}` : (regular++).toString(16).padStart(2, '0');
  if (regular > 254 || light > 4096) throw new Error('Engine plugin index capacity exceeded');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const destination = path.join(dataDir, result.path);
  if (!fs.existsSync(destination) || crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') !== sha256) fs.writeFileSync(destination, bytes);
  plugins.push({ filename: result.path, source, winner: result.winner.name, size: bytes.length, sha256, flags, type: small ? 'ESL' : flags & 1 ? 'ESM' : 'ESP', index, masters });
  earlier.add(result.path.toLowerCase());
}
const loadOrder = plugins.map(p => p.filename);
const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), clientProfile: report.profile, regular, light, warnings: report.warnings, loadOrder, plugins };
fs.writeFileSync(path.join(dataDir, 'aetherius-loadorder.json'), JSON.stringify(manifest, null, 2) + '\n');
// Local-only settings: no .env copying, remote settings, webhook or database.
const settings = { dataDir: 'data', loadOrder, listenHost: '127.0.0.1', uiListenHost: '127.0.0.1', port: 7777, maxPlayers: 4, name: 'Aetherius UI local test', offlineMode: true, master: 'http://127.0.0.1:1', additionalServerSettings: [], enableConsoleCommandsForAll: false, npcEnabled: false, npcSettings: {}, gamemodePath: 'local-gamemode.js', aetheriusCombatSettings: { enabled: false }, aetheriusUiGameplayRoot: path.resolve(argv[5] || 'C:/Code/Aetherius - SkyMP/referencias/AetheriusGameplayCore/modules/class-system'), startPoints: [{ pos: [-66260.90, 94442.18, -13655.73], worldOrCell: '0x3c', angleZ: 207.69 }] };
fs.writeFileSync(path.join(runtime, 'server-settings.json'), JSON.stringify(settings, null, 2) + '\n');
// Client-world Papyrus requires a separate host compatibility audit. Keep every
// winning PEX staged, but execute no unaudited script in this UI test runtime.
settings.papyrusScriptAllowlist = [];
fs.writeFileSync(path.join(runtime, 'server-settings.json'), JSON.stringify(settings, null, 2) + '\n');
fs.writeFileSync(path.join(runtime, 'local-gamemode.js'), '// Intentionally isolated: no production gamemode imports or external services.\nif (!globalThis.mp.getServerSettings().offlineMode) throw new Error("Local gamemode requires offlineMode");\n');
console.log(JSON.stringify({ runtime, plugins: plugins.length, regular, light, manifest: path.join(dataDir, 'aetherius-loadorder.json') }));
