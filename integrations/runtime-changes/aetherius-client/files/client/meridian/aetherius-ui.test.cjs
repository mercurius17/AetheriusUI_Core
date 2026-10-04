const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function create() {
  const sent = [], forwarded = [], events = new Map(), nativeEvents = new Map(), taps = [];
  class ClientListener {}
  class NetworkingService {}
  const platform = {
    Game: { getPlayer: () => ({ sendModEvent: (name, json) => sent.push([name, JSON.parse(json)]), is3DLoaded: () => true }), isMenuControlsEnabled: () => true },
    Ui: { isMenuOpen: () => false }, Input: { getMappedKey: name => name === 'Quick Map' ? 50 : 15, tapKey: key => taps.push(key) }, settings: {},
  };
  const context = vm.createContext({ TextEncoder: undefined, Date });
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const fn = vm.runInContext('(function(exports,require){' + js + '\n})', context);
    fn(exports, name => {
      if (name === 'skyrimPlatform') return platform;
      if (name === 'node:fs') return {};
      if (name === './clientListener') return { ClientListener };
      if (name === './networkingService') return { NetworkingService };
      if (name === '../../logging') return { logTrace: () => {} };
      return load(path.resolve(path.dirname(file), name + '.ts'));
    });
    return exports;
  }
  const controller = { on: (name, fn) => { const previous = nativeEvents.get(name); nativeEvents.set(name, previous ? event => { previous(event); fn(event); } : fn); }, emitter: { on: (name, fn) => events.set(name, fn), emit: (name, data) => forwarded.push([name, data]) }, lookupListener: () => ({ isConnected: () => true }) };
  const { AetheriusUiService } = load(path.resolve(__dirname, '../src/services/services/aetheriusUiService.ts'));
  new AetheriusUiService(platform, controller);
  const deliver = content => events.get('customPacketMessage')({ message: { t: 1, contentJsonDump: JSON.stringify(content) } });
  return { sent, forwarded, events, nativeEvents, deliver, taps };
}

test('server session and navigation reach the native bridge without TextEncoder; ready replays them', () => {
  const c = create();
  c.deliver({ customPacketType: 'aetherius-ui:v1:session', protocolVersion: 1, sessionId: 'session-1' });
  const envelope = { protocolVersion: 1, kind: 'snapshot', messageId: 'm1', correlationId: 'c1', sessionId: 'session-1', moduleId: 'core', revision: 0, payload: { navigation: [{ id: 'map', available: true }] } };
  c.deliver({ customPacketType: 'aetherius-ui:v1:message', envelope });
  assert.equal(c.sent.length, 0, 'network tick must not call Papyrus');
  c.nativeEvents.get('update')();
  assert.equal(c.sent[0][1].type, 'session');
  assert.equal(c.sent[1][1].envelope.payload.navigation[0].id, 'map');
  c.nativeEvents.get('modEvent')({ eventName: 'AetheriusUI.Ready', strArg: '1', numArg: 0 });
  c.nativeEvents.get('update')();
  assert.equal(c.sent.length, 4);
  assert.deepEqual(c.sent[2], c.sent[0]);
  assert.deepEqual(c.sent[3], c.sent[1]);
});

test('late native focus refresh permits map and repeated refresh does not cancel committed opening', () => {
  const c = create();
  c.deliver({ customPacketType: 'aetherius-ui:v1:session', protocolVersion: 1, sessionId: 'session-1' });
  const focus = value => c.nativeEvents.get('modEvent')({ eventName: 'AetheriusUI.FocusState', strArg: String(value) });
  const request = (action, payload) => c.nativeEvents.get('modEvent')({ eventName: 'AetheriusUI.FromView', strArg: JSON.stringify({ protocolVersion: 1, kind: 'request', messageId: action, correlationId: action, sessionId: 'session-1', moduleId: 'map', action, payload }) });
  focus(true); request('prepareNative', {}); c.nativeEvents.get('update')();
  assert.equal(c.sent.at(-1)[1].envelope.payload.status, 'prepared');
  focus(true); request('openNative', { ticket: 'prepareNative' }); c.nativeEvents.get('update')();
  assert.equal(c.sent.at(-1)[1].envelope.payload.status, 'releaseFocus');
  focus(true); c.nativeEvents.get('update')(); assert.equal(c.taps.length, 0);
  focus(false); c.nativeEvents.get('update')(); assert.deepEqual(c.taps, [50]);
  c.nativeEvents.get('update')(); assert.equal(c.taps.length, 1);
  assert.equal(c.forwarded.filter(([name]) => name === 'sendMessage').length, 0);
});

test('stale sessions and oversized packets are dropped; disconnect clears bootstrap', () => {
  const c = create();
  c.deliver({ customPacketType: 'aetherius-ui:v1:session', protocolVersion: 1, sessionId: 'session-1' });
  c.nativeEvents.get('update')();
  c.deliver({ customPacketType: 'aetherius-ui:v1:message', envelope: { protocolVersion: 1, kind: 'event', moduleId: 'core', messageId: 'm1', correlationId: 'c1', sessionId: 'old', payload: {} } });
  c.deliver({ junk: '😀'.repeat(20_000) });
  assert.equal(c.sent.length, 1);
  c.events.get('connectionDisconnect')();
  c.nativeEvents.get('modEvent')({ eventName: 'AetheriusUI.Ready', strArg: '1', numArg: 0 });
  c.nativeEvents.get('update')();
  assert.equal(c.sent.length, 2);
  assert.equal(c.sent[1][1].type, 'disconnect');
});
