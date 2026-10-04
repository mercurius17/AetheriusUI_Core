'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function fixture() {
  const events = {}, sent = [];
  const window = { addEventListener: (name, listener) => events[name] = listener, aetheriusUiVisual: text => sent.push(JSON.parse(text)) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../frontend/Data/MeridianUI/aetheriusui/native-presentation.js'), 'utf8'), { window, Date, setTimeout, clearTimeout, Promise, Map, Object, JSON, Error });
  function result(request, status, ok = true) { events['aetherius-native-visual']({ detail: { requestId: request.requestId, status, ok } }); }
  return { window, sent, result };
}
test('native map waits for actual MapMenu confirmation and survives committed radial focus release', async () => {
  const h = fixture(), abort = new AbortController();
  const opening = h.window.AetheriusNativePresentation.openMap(abort.signal), request = h.sent[0];
  let done = false; opening.then(() => done = true);
  h.result(request, 'committed'); abort.abort(); await new Promise(setImmediate);
  assert.equal(done, false); assert.equal(h.sent.length, 1);
  h.result(request, 'opened'); assert.equal((await opening).status, 'opened');
  assert.equal(h.sent[0].action, 'mapOpen');
});
test('uncommitted native map is cancelled on navigation abort and missing native API fails clearly', async () => {
  const h = fixture(), abort = new AbortController();
  const opening = h.window.AetheriusNativePresentation.openMap(abort.signal); abort.abort();
  await assert.rejects(opening, /cancelada/); assert.equal(h.sent[1].action, 'mapCancel');
  delete h.window.aetheriusUiVisual;
  await assert.rejects(h.window.AetheriusNativePresentation.openMap(), /fora do Skyrim/);
});
test('3D readiness follows renderer status, and selection changes stop a pending model load', async () => {
  const h = fixture(); let showing = h.window.AetheriusInventoryPreview.show('native-preview:12eb7');
  h.result(h.sent[0], 'ready'); assert.equal((await showing).ready, true);
  showing = h.window.AetheriusInventoryPreview.show('native-preview:12e46');
  h.result(h.sent.at(-1), 'loading'); h.window.AetheriusInventoryPreview.hide();
  assert.equal((await showing).ready, false); assert.equal(h.sent.at(-1).action, 'previewHide');
});
test('unsupported model never claims ready and rect/camera stay on the local visual bridge', async () => {
  const h = fixture(), preview = h.window.AetheriusInventoryPreview;
  const showing = preview.show('native-preview:f'); h.result(h.sent[0], 'unsupported');
  assert.equal((await showing).ready, false);
  preview.rect({ x: 1, y: 2, width: 100, height: 100 }); preview.camera({ yawDegrees: 20, pitchDegrees: 0, distanceScale: 1 });
  assert.deepEqual(h.sent.slice(1).map(row => row.action), ['previewRect', 'previewCamera']);
});

test('renderer failure is distinct from unsupported geometry', async () => {
  const h = fixture(), showing = h.window.AetheriusInventoryPreview.show('native-preview:12e46');
  h.result(h.sent[0], 'failed');
  const result = await showing;
  assert.equal(result.ready, false);
  assert.match(result.reason, /renderizar/);
  assert.doesNotMatch(result.reason, /suportado/);
});
