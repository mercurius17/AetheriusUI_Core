'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const core = path.resolve(__dirname, '..');
const testRoot = path.resolve(process.argv[2] || 'C:/Code/Aetherius-MP-Teste');
const gameplay = path.resolve(process.argv[3] || path.join(core, '../referencias/AetheriusGameplayCore'));
const repos = [
  ['aetherius-server', 'https://github.com/AetheriusRP/aetherius-server.git', path.join(testRoot, 'repos/aetherius-server')],
  ['aetherius-client', 'https://github.com/AetheriusRP/aetherius-client.git', path.join(testRoot, 'repos/aetherius-client')],
  ['MeridianUI', 'https://github.com/heathbrownkeyworks/MeridianUI.git', path.join(core, 'referencias/repositories/MeridianUI')]
];
const output = path.join(core, 'integrations/runtime-changes');
const mirror = path.join(gameplay, 'integrations/ui-runtime-changes');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = { schemaVersion: 1, date: '2026-10-04', format: 'git binary patch plus complete changed source files', repositories: {} };
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(core, 'tmp'), { recursive: true });
for (const [name, url, repo] of repos) {
  const git = (args, options = {}) => execFileSync('git', ['-c', 'safe.directory=' + repo.replaceAll('\\', '/'), '-c', 'core.autocrlf=false', '-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const changed = git(['diff', '--name-only', '-z', 'HEAD']).toString().split('\0').filter(Boolean);
  const added = git(['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
  const chunks = [git(['diff', '--binary', '--no-ext-diff', 'HEAD', '--'])];
  const folder = path.join(output, name), files = [];
  fs.mkdirSync(folder, { recursive: true });
  for (const relative of [...new Set([...changed, ...added])].sort()) {
    if (path.isAbsolute(relative) || relative.split('/').some(p => p === '..' || p === '.git')) throw Error('Unsafe relative source path');
    if (/(^|\/)(node_modules|build|dist|\.vscode|\.agents|\.codex)(\/|$)|(^|\/)\.env($|\.)|\.(dll|pdb|node|log|pem|key)$/i.test(relative)) throw Error('Unexpected generated/private file: ' + relative);
    const source = path.join(repo, relative);
    if (!fs.existsSync(source)) { files.push({ path: relative, deleted: true }); continue; }
    const bytes = fs.readFileSync(source);
    const destination = path.join(folder, 'files', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
    files.push({ path: relative, added: added.includes(relative), size: bytes.length, sha256: digest(bytes) });
    if (added.includes(relative)) {
      try { chunks.push(git(['diff', '--binary', '--no-index', '--', '/dev/null', relative])); }
      catch (error) { if (error.status !== 1 || !error.stdout) throw error; chunks.push(error.stdout); }
    }
  }
  const patch = Buffer.concat(chunks), patchFile = path.join(folder, 'changes.patch');
  fs.writeFileSync(patchFile, patch);
  // Check against the exact baseline in an isolated index. The working checkout
  // and its real index are not reset, staged or committed by this exporter.
  const checkDir = fs.mkdtempSync(path.join(core, 'tmp/snapshot-check-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(checkDir, 'index') };
    git(['read-tree', baseline], { env });
    git(['apply', '--cached', '--check', '--whitespace=nowarn', patchFile], { env });
  } finally {
    if (!path.resolve(checkDir).startsWith(path.resolve(core, 'tmp') + path.sep)) throw Error('Unsafe temporary cleanup');
    fs.rmSync(checkDir, { recursive: true });
  }
  const license = path.join(repo, 'LICENSE');
  if (fs.existsSync(license)) fs.copyFileSync(license, path.join(folder, 'UPSTREAM_LICENSE'));
  manifest.repositories[name] = { url, baseline, patch: name + '/changes.patch', patchSha256: digest(patch), files };
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.mkdirSync(mirror, { recursive: true });
fs.cpSync(output, mirror, { recursive: true });
console.log(JSON.stringify({ output, mirror, repositories: Object.keys(manifest.repositories), files: Object.values(manifest.repositories).reduce((n, r) => n + r.files.length, 0), baselineApplyChecks: 'passed' }));
