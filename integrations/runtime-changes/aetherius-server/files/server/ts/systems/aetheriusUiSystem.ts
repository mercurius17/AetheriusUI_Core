import * as crypto from "crypto";
import * as path from "path";
import { createRequire } from "module";
import { NAVIGATION_CATALOG } from "../../vendor/aetherius-ui-core/shared/catalog";
import { validateEnvelope, type UiEnvelope } from "../../vendor/aetherius-ui-core/shared/protocol";
import { UiServerRouter } from "../../vendor/aetherius-ui-core/sdk/server/router";
import { System, Content, SystemContext } from "./system";
import { registerInventoryReadModel } from "./aetheriusInventoryReadModel";

const PACKET_SESSION = "aetherius-ui:v1:session";
const PACKET_REQUEST = "aetherius-ui:v1:request";
const PACKET_MESSAGE = "aetherius-ui:v1:message";
const MAX_REQUESTS_PER_WINDOW = 30;
const RATE_WINDOW_MS = 10_000;

interface RequestWindow {
  startedAt: number;
  count: number;
}

export class AetheriusUiSystem implements System {
  readonly systemName = "AetheriusUI";
  private readonly sessions = new Map<number, string>();
  private readonly requestWindows = new Map<number, RequestWindow>();
  private readonly router = new UiServerRouter();
  private readonly externalModules = new Set<string>();
  private readonly demoEnabled = process.env.AETHERIUS_UI_DEMO === "1";
  private domainDispose: (() => void) | undefined;
  private readonly connectedUsers = new Set<number>();

  constructor() {
    this.router.register("core", "snapshot", () => ({ revision: 0, navigation: this.navigationCatalog(), demo: this.demoEnabled }));
    if (this.demoEnabled) {
      this.router.register("core", "echo", (_context, payload) => ({ accepted: true, echo: payload }));
    }
  }

  registerExternalModule(moduleId: string, register: (router: UiServerRouter) => () => void): () => void {
    return this.registerExternalModules([moduleId], register);
  }

  registerExternalModules(moduleIds: readonly string[], register: (router: UiServerRouter) => () => void): () => void {
    if (!moduleIds.length || new Set(moduleIds).size !== moduleIds.length || moduleIds.some(moduleId => !NAVIGATION_CATALOG.some(item => item.id === moduleId) || this.externalModules.has(moduleId))) throw new Error("Invalid or duplicate external module.");
    const dispose = register(this.router);
    if (moduleIds.some(moduleId => !this.router.has(moduleId, "snapshot"))) { dispose(); throw new Error("External module requires snapshot."); }
    moduleIds.forEach(moduleId => this.externalModules.add(moduleId));
    let disposed = false;
    return () => { if (disposed) return; disposed = true; moduleIds.forEach(moduleId => this.externalModules.delete(moduleId)); dispose(); };
  }

  initAsync(ctx: SystemContext): Promise<void> {
    this.registerExternalModules(["inventory", "spells"], router => registerInventoryReadModel(router, ctx.svr as unknown as Record<string, any>));
    this.registerExternalModule("map", router => router.register("map", "snapshot", () => ({ schemaVersion: 1, revision: 0, mode: "native", route: "/map", localControl: "Quick Map" })));
    this.bootstrapGameplay(ctx);
    ctx.gm.on("gamemodeWillReload", () => {
      this.domainDispose?.(); this.domainDispose = undefined;
      for (const userId of this.connectedUsers) {
        this.send(ctx, userId, { customPacketType: PACKET_MESSAGE, uiDisconnect: true });
        this.clearUser(userId);
      }
    });
    ctx.gm.on("gamemodeLoaded", () => {
      this.bootstrapGameplay(ctx);
      for (const userId of this.connectedUsers) this.issueSession(userId, ctx);
    });
    ctx.gm.on("spawnAllowed", (userId: number) => this.issueSession(userId, ctx));
    return Promise.resolve();
  }

  private bootstrapGameplay(ctx: SystemContext): void {
    const host = ctx.svr as unknown as Record<string, any>;
    const settings = host.getServerSettings();
    const root = settings.aetheriusUiGameplayRoot;
    if (!root) return;
    if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("aetheriusUiGameplayRoot must be a trusted absolute server path.");
    const runtime: Record<string, unknown> = {};
    for (const method of ["get", "set", "getServerSettings", "makeProperty"]) {
      if (typeof host[method] !== "function") throw new Error(`Gameplay host lacks ${method}`);
      runtime[method] = host[method].bind(host);
    }
    // The pinned host has no CombatProfile/grant reconciliation API. Reads use
    // real native persistence; mutations remain closed until the domain gate.
    const policy = { readOnlyReason: "Consulta disponível. Alterações de classe e grupo aguardam a integração autoritativa do domínio." };
    const hostRequire = createRequire(path.join(process.cwd(), "aetherius-host.cjs"));
    const register = hostRequire(path.join(root, "integrations", "register-class.cjs"));
    this.domainDispose = this.registerExternalModules(["class", "party"], router => register(router, runtime, policy));
    console.info("[AetheriusUI] GameplayCore class/party registered with native persistence (read-only gate).");
  }

  connect(userId: number): void {
    this.connectedUsers.add(userId);
    this.clearUser(userId);
  }

  disconnect(userId: number): void {
    this.connectedUsers.delete(userId);
    this.clearUser(userId);
  }

  async updateAsync(ctx: SystemContext): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    // TrueHUD owns health/magicka/stamina presentation in this modlist.
  }

  customPacket(userId: number, type: string, content: Content, ctx: SystemContext): void {
    if (type !== PACKET_REQUEST) return;
    try {
      const serializedContent = JSON.stringify(content);
      if (typeof serializedContent !== "string" || Buffer.byteLength(serializedContent, "utf8") > 18 * 1024) return;
    } catch {
      return;
    }
    const sessionId = this.sessions.get(userId);
    if (!sessionId || !ctx.svr.isConnected(userId) || !ctx.svr.getUserActor(userId)) return;

    let request: UiEnvelope;
    try {
      request = validateEnvelope(content.envelope, { requireSession: true });
    } catch {
      return;
    }
    if (request.kind !== "request" || request.sessionId !== sessionId) return;
    console.info("[AetheriusUI] request", request.moduleId, request.action, request.correlationId);
    if (!this.allowRequest(userId)) {
      const error: UiEnvelope = {
        protocolVersion: 1,
        kind: "error",
        messageId: crypto.randomUUID(),
        correlationId: request.correlationId,
        sessionId,
        moduleId: request.moduleId,
        error: { code: "RATE_LIMITED", message: "Muitas solicitações de interface. Aguarde um momento." },
      };
      this.send(ctx, userId, { customPacketType: PACKET_MESSAGE, envelope: error });
      return;
    }

    const actorId = ctx.svr.getUserActor(userId);
    void this.router.dispatch(request, {
      userId,
      actorId,
      expectedSessionId: sessionId,
    }).then((response) => {
      if (this.sessions.get(userId) !== sessionId || !ctx.svr.isConnected(userId) || ctx.svr.getUserActor(userId) !== actorId) return;
      this.send(ctx, userId, { customPacketType: PACKET_MESSAGE, envelope: response });
      if (response.kind === "response" && request.moduleId === "core" && request.action === "echo") {
        this.send(ctx, userId, {
          customPacketType: PACKET_MESSAGE,
          envelope: this.makeEvent(sessionId, "status", { message: "A solicitação de demonstração foi processada." }),
        });
      }
    }).catch(() => {
      // Falhas internas são convertidas no router; este limite impede rejeições não tratadas no loop do servidor.
    });
  }

  private issueSession(userId: number, ctx: SystemContext): void {
    if (!ctx.svr.isConnected(userId)) return;
    const actorId = ctx.svr.getUserActor(userId);
    if (!actorId) return;
    this.clearUser(userId);
    const sessionId = crypto.randomUUID();
    this.sessions.set(userId, sessionId);
    console.info("[AetheriusUI] sessão autenticada emitida");
    this.send(ctx, userId, {
      customPacketType: PACKET_SESSION,
      protocolVersion: 1,
      sessionId,
    });
    const snapshot: UiEnvelope = {
      protocolVersion: 1,
      kind: "snapshot",
      messageId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      sessionId,
      moduleId: "core",
      revision: 0,
      payload: { revision: 0, navigation: this.navigationCatalog(), demo: this.demoEnabled },
    };
    this.send(ctx, userId, { customPacketType: PACKET_MESSAGE, envelope: snapshot });
    this.send(ctx, userId, { customPacketType: PACKET_MESSAGE, envelope: this.makeEvent(sessionId, "status", { message: "Sessão Aetherius UI pronta." }) });
  }

  private makeEvent(sessionId: string, action: string, payload: unknown): UiEnvelope {
    const messageId = crypto.randomUUID();
    return {
      protocolVersion: 1,
      kind: "event",
      messageId,
      correlationId: messageId,
      sessionId,
      moduleId: "core",
      action,
      payload,
    };
  }

  private navigationCatalog() {
    return NAVIGATION_CATALOG.map((item) => ({ ...item, available: this.externalModules.has(item.id), ...(!this.externalModules.has(item.id) ? { reason: "Módulo externo não registrado." } : {}) }));
  }

  private send(ctx: SystemContext, userId: number, content: Record<string, unknown>): void {
    try {
      const json = JSON.stringify(content);
      if (Buffer.byteLength(json, "utf8") > 18 * 1024) return;
      ctx.svr.sendCustomPacket(userId, json);
    } catch {
      // Não registre payloads de interface nem interrompa a sessão do jogador.
    }
  }

  private allowRequest(userId: number): boolean {
    const now = Date.now();
    const window = this.requestWindows.get(userId);
    if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
      this.requestWindows.set(userId, { startedAt: now, count: 1 });
      return true;
    }
    if (window.count >= MAX_REQUESTS_PER_WINDOW) return false;
    window.count += 1;
    return true;
  }

  private clearUser(userId: number): void {
    const session = this.sessions.get(userId);
    if (session) this.router.forgetSession(session);
    this.sessions.delete(userId);
    this.requestWindows.delete(userId);
  }
}

