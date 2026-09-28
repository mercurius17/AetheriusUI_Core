import { test } from "node:test";
import assert from "node:assert/strict";
import { NAVIGATION_CATALOG, RADIAL_CATALOG, calculateRadialLayout } from "../shared/catalog";
import { INITIAL_NAVIGATION_STATE, reduceNavigation } from "../shared/navigation";
import { MAX_ENVELOPE_BYTES, decodeEnvelope, encodeEnvelope, validateEnvelope } from "../shared/protocol";
import { RequestDeduplicator, RevisionStore } from "../shared/revisionStore";
import { UiModuleRegistry } from "../shared/moduleRegistry";
import { UiServerRouter } from "../sdk/server/router";
import { createUiEvent, createUiPatch, createUiSnapshot } from "../sdk/server/envelopes";
import { decodeLocalBridgeMessage, encodeLocalBridgeMessage } from "../sdk/client/localBridge";
import { AetheriusUiClient } from "../sdk/frontend/client";
import { readFileSync } from "node:fs";

const validRequest = (overrides: Record<string, unknown> = {}) => ({
  protocolVersion: 1,
  kind: "request",
  messageId: "request-001",
  correlationId: "correlation-001",
  sessionId: "session-001",
  moduleId: "core",
  action: "echo",
  payload: { text: "hello" },
  ...overrides,
});

test("catalog fixes character center plus eleven external slots", () => {
  assert.equal(NAVIGATION_CATALOG.length, 12);
  assert.equal(RADIAL_CATALOG.length, 11);
  assert.deepEqual(RADIAL_CATALOG.map((item) => item.radialSlot), Array.from({ length: 11 }, (_, index) => index + 1));
  assert.equal(NAVIGATION_CATALOG[0].id, "character");
  assert.equal(NAVIGATION_CATALOG[11].id, "shop");
});

test("radial layout derives eleven distinct angles and a 1.15 center ratio", () => {
  for (const [width, height] of [[1920, 1080], [2560, 1080], [3440, 1440], [1280, 1024]]) {
    const layout = calculateRadialLayout(RADIAL_CATALOG.length, width, height);
    assert.equal(layout.length, 11);
    assert.equal(new Set(layout.map((slot) => slot.angle.toFixed(8))).size, 11);
    assert.ok(Math.abs(layout[0].centerDiameter / layout[0].outerDiameter - 1.15) < 1e-10);
    for (const slot of layout) {
      assert.ok(slot.x >= slot.outerDiameter / 2 && slot.x <= width - slot.outerDiameter / 2);
      assert.ok(slot.y >= slot.outerDiameter / 2 && slot.y <= height - slot.outerDiameter / 2);
    }
  }
  assert.throws(() => calculateRadialLayout(0, 100, 100), RangeError);
});

test("navigation reducer covers radial, workspace, back stack, and safe routes", () => {
  let state = reduceNavigation(INITIAL_NAVIGATION_STATE, { type: "TAB" });
  assert.equal(state.kind, "radial");
  state = reduceNavigation(state, { type: "OPEN", moduleId: "class", available: true });
  assert.equal(state.kind, "workspace");
  state = reduceNavigation(state, { type: "NAVIGATE", route: "/class/subroute" });
  assert.equal(state.kind, "workspace");
  const before = state;
  state = reduceNavigation(state, { type: "NAVIGATE", route: "//outside" });
  assert.deepEqual(state, before);
  state = reduceNavigation(state, { type: "NAVIGATE", route: "/shop" });
  assert.deepEqual(state, before);
  state = reduceNavigation(state, { type: "BACK" });
  assert.equal(state.kind, "workspace");
  state = reduceNavigation(state, { type: "BACK" });
  assert.deepEqual(state, { kind: "radial", selectedId: "class" });
  state = reduceNavigation(state, { type: "OPEN", moduleId: "shop", available: false });
  assert.deepEqual(state, { kind: "radial", selectedId: "class" });
});

test("protocol validates schema, sessions, unsafe keys and the 16 KiB limit", () => {
  assert.equal(decodeEnvelope(encodeEnvelope(validRequest()), { requireSession: true }).action, "echo");
  assert.throws(() => validateEnvelope(validRequest({ action: undefined })), /Requests require an action/);
  assert.throws(() => validateEnvelope(validRequest({ unexpected: true })), /Unexpected envelope field/);
  assert.throws(() => validateEnvelope(validRequest({ sessionId: undefined }), { requireSession: true }));
  const unsafe = JSON.parse('{"protocolVersion":1,"kind":"event","messageId":"m1","correlationId":"c1","moduleId":"core","payload":{"constructor":{"prototype":{}}}}');
  assert.throws(() => validateEnvelope(unsafe), /reserved object key/);
  assert.throws(() => encodeEnvelope(validRequest({ payload: "x".repeat(MAX_ENVELOPE_BYTES) })), /16 KiB/);
});

test("revision snapshots, patches and duplicate requests remain bounded and ordered", () => {
  const store = new RevisionStore<{ count: number }>();
  assert.equal(store.applyPatch({ baseRevision: 0, revision: 1, patch: 1 }, (current, value) => ({ count: current.count + value })), "gap");
  assert.equal(store.replace({ revision: 3, value: { count: 4 } }), true);
  assert.equal(store.replace({ revision: 2, value: { count: 0 } }), false);
  assert.equal(store.applyPatch({ baseRevision: 3, revision: 4, patch: 2 }, (current, value) => ({ count: current.count + value })), "applied");
  assert.equal(store.snapshot?.value.count, 6);
  assert.equal(store.applyPatch({ baseRevision: 3, revision: 5, patch: 1 }, (current, value) => ({ count: current.count + value })), "gap");

  const dedupe = new RequestDeduplicator<string>(2, 20);
  assert.equal(dedupe.remember("a", "cached", 10), true);
  assert.equal(dedupe.read("a", 11), "cached");
  assert.equal(dedupe.remember("b", "b", 11), true);
  assert.equal(dedupe.remember("c", "c", 12), true);
  assert.equal(dedupe.read("a", 12), undefined);
  assert.equal(dedupe.read("b", 40), undefined);
});

test("module registry isolates missing, unavailable, incompatible and failing adapters", async () => {
  const registry = new UiModuleRegistry("1.0.0");
  assert.equal(registry.get("shop"), null);
  assert.throws(() => registry.register({ id: "shop", version: "1.0.0", sdk: { min: "2.0.0" }, label: "Shop", rootRoute: "/shop", radialSlot: 11, loader: async () => ({ mount() {} }) }), /incompatible/);

  let mounted = 0;
  let unmounted = 0;
  const containerState = { cleared: false };
  const container = { replaceChildren() { containerState.cleared = true; } } as unknown as HTMLElement;
  registry.register({ id: "shop", version: "1.0.0", sdk: { min: "1.0.0" }, label: "Loja externa", rootRoute: "/shop", radialSlot: 11, loader: async () => ({ mount() { mounted += 1; }, unmount() { unmounted += 1; } }) });
  assert.throws(() => registry.register({ id: "shop", version: "1.0.1", sdk: { min: "1.0.0" }, label: "Duplicado", rootRoute: "/shop", radialSlot: 11, loader: async () => ({ mount() {} }) }), /already registered/);
  await assert.rejects(() => registry.mount("shop", container, "/class"), /Route is outside/);
  await registry.mount("shop", container, "/shop");
  assert.equal(mounted, 1);
  assert.equal(await registry.unmount("shop"), true);
  assert.equal(unmounted, 1);
  assert.equal(registry.get("shop")?.availability.available, true);
  await registry.mount("shop", container, "/shop/subroute");
  assert.equal(await registry.unregister("shop"), true);
  assert.equal(registry.get("shop"), null);
  assert.equal(unmounted, 2);

  registry.register({ id: "class", version: "1.0.0", sdk: { min: "1.0.0" }, label: "Classe", rootRoute: "/class", radialSlot: 1, availability: () => ({ available: false, reason: "Módulo ainda ausente." }), loader: async () => ({ mount() {} }) });
  assert.equal(registry.listNavigation().find((item) => item.id === "class")?.available, false);
  await assert.rejects(() => registry.mount("class", container, "/class"), /Módulo ainda ausente/);
  await registry.unregister("class");

  assert.throws(() => registry.register({ id: "shop", version: "1.0.0", sdk: { min: "1.0.0" }, label: "Loja", rootRoute: "/shop", radialSlot: 11, assets: ["../../private.json"], loader: async () => ({ mount() {} }) }), /relative local paths/);

  registry.register({ id: "class", version: "1.0.0", sdk: { min: "1.0.0" }, label: "Classe", rootRoute: "/class", radialSlot: 1, loader: async () => ({ mount() { throw new Error("secret internal detail"); } }) });
  await assert.rejects(() => registry.mount("class", container, "/class"), /failed to mount/);
  assert.equal(containerState.cleared, true);
});

test("module registry aborts an in-flight mount and runs adapter cleanup once", async () => {
  const registry = new UiModuleRegistry("1.0.0");
  let releaseMount: (() => void) | undefined;
  let unmounted = 0;
  const container = { replaceChildren() {} } as unknown as HTMLElement;
  registry.register({
    id: "class", version: "1.0.0", sdk: { min: "1.0.0" }, label: "Classe",
    rootRoute: "/class", radialSlot: 1,
    loader: async () => ({
      mount: () => new Promise<void>((resolve) => { releaseMount = resolve; }),
      unmount: () => { unmounted += 1; },
    }),
  });

  const mounting = registry.mount("class", container, "/class");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(typeof releaseMount, "function");
  await registry.unregister("class");
  releaseMount?.();
  await assert.rejects(mounting, /failed to mount/);
  assert.equal(unmounted, 1);
});

test("module registry waits for cleanup before allowing a remount", async () => {
  const registry = new UiModuleRegistry("1.0.0");
  let releaseCleanup: (() => void) | undefined;
  let cleanupStarted: (() => void) | undefined;
  let unmountCalls = 0;
  const started = new Promise<void>((resolve) => { cleanupStarted = resolve; });
  const container = { replaceChildren() {} } as unknown as HTMLElement;
  registry.register({
    id: "class", version: "1.0.0", sdk: { min: "1.0.0" }, label: "Classe",
    rootRoute: "/class", radialSlot: 1,
    loader: async () => ({
      mount() {},
      unmount: () => {
        unmountCalls += 1;
        return unmountCalls === 1 ? new Promise<void>((resolve) => { releaseCleanup = resolve; cleanupStarted?.(); }) : undefined;
      },
    }),
  });
  await registry.mount("class", container, "/class");
  const unmounting = registry.unmount("class");
  await started;
  await assert.rejects(() => registry.mount("class", container, "/class"), /unmounting/);
  releaseCleanup?.();
  assert.equal(await unmounting, true);
  await registry.mount("class", container, "/class");
  await registry.unmount("class");
});

test("server router binds identity to server context and deduplicates request replay", async () => {
  const router = new UiServerRouter();
  let calls = 0;
  router.register("core", "echo", (context, payload) => {
    calls += 1;
    assert.equal(context.userId, 42);
    assert.equal(context.actorId, 9001);
    return { echoed: payload };
  });
  const context = { userId: 42, actorId: 9001, expectedSessionId: "session-001" };
  const first = await router.dispatch(validRequest(), context);
  const replay = await router.dispatch(validRequest(), context);
  assert.equal(first.kind, "response");
  assert.deepEqual(replay, first);
  assert.equal(calls, 1);
  const mismatch = await router.dispatch(validRequest({ sessionId: "other-session" }), context);
  assert.equal(mismatch.kind, "error");
  assert.equal(mismatch.error?.code, "SESSION_MISMATCH");

  router.register("core", "failure", () => { throw new Error("private backend detail"); });
  const failed = await router.dispatch(validRequest({ messageId: "request-002", correlationId: "correlation-002", action: "failure" }), context);
  assert.equal(failed.kind, "error");
  assert.equal(failed.error?.message.includes("private backend detail"), false);

  let protectedCalls = 0;
  router.register("core", "protected", () => { protectedCalls += 1; return "allowed"; }, {
    requiredCapabilities: ["inventory.write"],
    authorize: (_context, capability) => capability === "inventory.write" && false,
  });
  const forbidden = await router.dispatch(validRequest({ messageId: "request-003", correlationId: "correlation-003", action: "protected" }), context);
  assert.equal(forbidden.kind, "error");
  assert.equal(forbidden.error?.code, "FORBIDDEN");
  assert.equal(protectedCalls, 0);
});

test("server SDK builds validated event, snapshot and patch envelopes", () => {
  assert.equal(createUiEvent("session-001", "core", "status", {}).kind, "event");
  assert.equal(createUiSnapshot("session-001", "core", 4, {}).revision, 4);
  assert.equal(createUiPatch("session-001", "core", 4, 5, {}).baseRevision, 4);
  assert.throws(() => createUiPatch("session-001", "core", 5, 4, {}));
});

test("frontend SDK correlates a request and discards messages from an old session", async () => {
  let bridgeListener: ((encoded: string) => void) | undefined;
  let sent: string | undefined;
  let currentSession: string | null = "session-001";
  const client = new AetheriusUiClient({
    bridge: {
      send(encoded) { sent = encoded; },
      subscribe(listener) { bridgeListener = listener; return () => { bridgeListener = undefined; }; },
    },
    sessionId: () => currentSession,
  });
  const pending = client.request<{ accepted: boolean }>("core", "echo", { fixture: true });
  const request = decodeEnvelope(sent || "", { requireSession: true });
  assert.equal(request.kind, "request");
  bridgeListener?.(encodeEnvelope({
    protocolVersion: 1, kind: "response", messageId: "response-001", correlationId: request.correlationId,
    sessionId: request.sessionId, moduleId: "core", payload: { accepted: true },
  }, { requireSession: true }));
  assert.deepEqual(await pending, { accepted: true });

  const stale = client.request("core", "echo", {});
  const staleRequest = decodeEnvelope(sent || "", { requireSession: true });
  currentSession = "session-002";
  bridgeListener?.(encodeEnvelope({
    protocolVersion: 1, kind: "response", messageId: "response-002", correlationId: staleRequest.correlationId,
    sessionId: staleRequest.sessionId, moduleId: "core", payload: {},
  }, { requireSession: true }));
  await assert.rejects(stale, /sessão do servidor mudou/);
  client.close();
});

test("local bridge preserves UTF-8 and rejects malformed base64", () => {
  const source = JSON.stringify({ message: "Aetherius — ação e sessão" });
  assert.equal(decodeLocalBridgeMessage(encodeLocalBridgeMessage(source)), source);
  assert.throws(() => decodeLocalBridgeMessage("%%%"));
});

test("HUD remains passive and shop test adapter contains no commercial actions", () => {
  const hud = readFileSync("frontend/Data/MeridianUI/aetheriusui/hud.html", "utf8");
  const hudScript = readFileSync("frontend/Data/MeridianUI/aetheriusui/hud.js", "utf8");
  const shopFixture = readFileSync("frontend/test-fixtures/shop-slot-module.js", "utf8");
  assert.match(hud, /pointer-events:none/);
  assert.doesNotMatch(hudScript, /addEventListener\(['"](?:click|mousedown|keydown|wheel)/);
  assert.doesNotMatch(shopFixture, /(?:makePurchase|checkout|purchaseItem|setPrice|submitOrder)/i);
  assert.match(shopFixture, /Fixture vazia/);
});

test("Meridian shell exposes the fixture registry, lifecycle and shared component factories", () => {
  const shell = readFileSync("frontend/Data/MeridianUI/aetheriusui/shell.js", "utf8");
  const classFixture = readFileSync("frontend/test-fixtures/class-echo-module.js", "utf8");
  const shopFixture = readFileSync("frontend/test-fixtures/shop-slot-module.js", "utf8");
  assert.match(shell, /MeridianInput/);
  assert.match(shell, /attachNavigation/);
  assert.match(shell, /window\.AetheriusUI = Object\.freeze/);
  assert.match(shell, /loader:|definition\.loader/);
  assert.match(shell, /components: components/);
  assert.match(classFixture, /id: 'class'/);
  assert.match(classFixture, /context\.request\('core', 'echo'/);
  assert.match(shopFixture, /id: 'shop'/);
  assert.match(shopFixture, /radialSlot: 11/);
});
