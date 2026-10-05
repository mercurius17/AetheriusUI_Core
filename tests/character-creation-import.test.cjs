'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
test('pinned character creation snapshot preserves every upstream byte', () => {
  const base = path.join(root, 'integrations/character-creation');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json')));
  assert.equal(manifest.commit, 'b7b8584a84b113ac4f7b1799d4d944648ba7ff50');
  assert.equal(manifest.files.length, 10);
  for (const entry of manifest.files) {
    assert.ok(!entry.path.includes('..'));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(base, 'upstream', entry.path))).digest('hex'), entry.sha256, entry.path);
  }
});
test('adapted native creator contains no local gameplay write callbacks', () => {
  const source = fs.readFileSync(path.join(root, 'native/src/chargen.cpp'), 'utf8');
  assert.doesNotMatch(source, /ChangeName|ChangeRace|fxDelegate->Callback|FocusMode::PauseGame/);
  assert.match(source, /IsPresentationCommand\(type\)/);
});
test('character module stays within center route and local package assets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'integrations/modules.local-test.json')));
  const module = manifest.modules.find(row => row.id === 'character');
  assert.equal(module.slot, 0); assert.equal(module.route, '/character');
  for (const asset of [...module.scripts, ...module.styles]) {
    assert.ok(asset.startsWith('modules/character/'));
    assert.ok(fs.existsSync(path.join(root, 'frontend/Data/MeridianUI/aetheriusui', asset)));
  }
});
