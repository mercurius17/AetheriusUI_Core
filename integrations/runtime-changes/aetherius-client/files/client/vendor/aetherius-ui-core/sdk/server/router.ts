import { createMessageId, encodeEnvelope, UiProtocolError, validateEnvelope, type UiEnvelope } from "../../shared/protocol";
import { RequestDeduplicator } from "../../shared/revisionStore";

export interface UiServerRequestContext {
  readonly userId: number;
  readonly actorId: number;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly signal?: AbortSignal;
}

export type UiActionHandler = (context: UiServerRequestContext, payload: unknown) => unknown | Promise<unknown>;

export interface UiActionOptions {
  readonly requiredCapabilities?: readonly string[];
  readonly authorize?: (context: UiServerRequestContext, capability: string) => boolean;
}

interface RegisteredHandler {
  moduleId: string;
  action: string;
  handler: UiActionHandler;
  options: UiActionOptions;
}

interface RequestResult { fingerprint: string; response: UiEnvelope }
interface SessionState {
  userId: number;
  actorId: number;
  controller: AbortController;
  completed: RequestDeduplicator<RequestResult>;
  pending: Map<string, { fingerprint: string; response: Promise<UiEnvelope> }>;
}

export class UiServerRouter {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly sessions = new Map<string, SessionState>();

  register(moduleId: string, action: string, handler: UiActionHandler, options: UiActionOptions = {}): () => void {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/.test(moduleId)) throw new Error("Invalid UI module id.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(action)) throw new Error("Invalid UI action id.");
    const requiredCapabilities = [...new Set(options.requiredCapabilities ?? [])];
    if (requiredCapabilities.some((capability) => !/^[a-z][a-z0-9.-]{0,63}$/.test(capability))) throw new Error("Invalid UI capability id.");
    if (requiredCapabilities.length > 0 && typeof options.authorize !== "function") throw new Error("Protected UI actions require a server authorization policy.");
    const key = routeKey(moduleId, action);
    if (this.handlers.has(key)) throw new Error(`UI action is already registered: ${key}`);
    this.handlers.set(key, { moduleId, action, handler, options: { ...options, requiredCapabilities } });
    const registration = this.handlers.get(key);
    return () => { if (this.handlers.get(key) === registration) this.handlers.delete(key); };
  }

  has(moduleId: string, action: string): boolean {
    return this.handlers.has(routeKey(moduleId, action));
  }

  async dispatch(
    raw: unknown,
    context: Omit<UiServerRequestContext, "correlationId" | "sessionId"> & { expectedSessionId: string },
  ): Promise<UiEnvelope> {
    let request: UiEnvelope;
    try {
      request = validateEnvelope(raw, { requireSession: true });
    } catch (error) {
      return this.errorResponse(raw, asProtocolError(error));
    }
    if (request.kind !== "request" || request.sessionId !== context.expectedSessionId) {
      return this.errorFor(request, "SESSION_MISMATCH", "A sessão da solicitação não corresponde à conexão.");
    }
    if (!Number.isSafeInteger(context.userId) || context.userId < 0 || !Number.isSafeInteger(context.actorId) || context.actorId <= 0) {
      return this.errorFor(request, "FORBIDDEN", "Contexto autenticado inválido.");
    }
    let state = this.sessions.get(request.sessionId);
    if (!state) {
      if (this.sessions.size >= 4096) return this.errorFor(request, "RATE_LIMITED", "Limite de sessões de interface atingido.");
      state = { userId: context.userId, actorId: context.actorId, controller: new AbortController(), completed: new RequestDeduplicator<RequestResult>(), pending: new Map() };
      this.sessions.set(request.sessionId, state);
    }
    if (state.userId !== context.userId || state.actorId !== context.actorId) {
      return this.errorFor(request, "SESSION_MISMATCH", "A sessão pertence a outro contexto autenticado.");
    }
    const fingerprint = canonicalJson(request);
    const cached = state.completed.read(request.messageId);
    const pending = state.pending.get(request.messageId);
    if (cached || pending) {
      if ((cached ?? pending)!.fingerprint !== fingerprint) return this.errorFor(request, "REQUEST_ID_REUSED", "Identificador reutilizado com outra solicitação.");
      return cached ? cached.response : pending!.response;
    }
    if (state.pending.size >= 32) return this.errorFor(request, "RATE_LIMITED", "Muitas solicitações em andamento.");
    const registered = this.handlers.get(routeKey(request.moduleId, request.action ?? ""));
    if (!registered) return this.errorFor(request, "ACTION_UNAVAILABLE", "A ação não está disponível.");
    const handlerContext: UiServerRequestContext = {
      userId: context.userId,
      actorId: context.actorId,
      sessionId: request.sessionId,
      correlationId: request.correlationId,
      signal: state.controller.signal,
    };
    const activeState = state;
    const response = Promise.resolve().then(async () => {
      try {
        if (activeState.controller.signal.aborted) return this.errorFor(request, "SESSION_MISMATCH", "Sessão encerrada.");
        if (registered.options.requiredCapabilities?.some((capability) => !registered.options.authorize?.(handlerContext, capability))) {
          return this.errorFor(request, "FORBIDDEN", "A conexão não tem autorização para esta ação.");
        }
        const result = await registered.handler(handlerContext, request.payload);
        const envelope = createResponse(request, result);
        encodeEnvelope(envelope, { requireSession: true });
        return envelope;
      } catch (error) {
        if (error instanceof UiProtocolError && error.code === "PAYLOAD_TOO_LARGE") return this.errorFor(request, error.code, "Resposta excede o limite do protocolo.");
        return this.errorFor(request, "REQUEST_FAILED", "O servidor não conseguiu concluir a solicitação.");
      }
    }).then(envelope => {
      if (this.sessions.get(request.sessionId!) === activeState) activeState.completed.remember(request.messageId, { fingerprint, response: envelope });
      return envelope;
    }).finally(() => activeState.pending.delete(request.messageId));
    state.pending.set(request.messageId, { fingerprint, response });
    return response;
  }

  forgetSession(sessionId: string): void {
    this.sessions.get(sessionId)?.controller.abort();
    this.sessions.delete(sessionId);
  }

  private errorResponse(raw: unknown, error: UiProtocolError): UiEnvelope {
    const base = raw && typeof raw === "object" ? raw as Partial<UiEnvelope> : {};
    const moduleId = typeof base.moduleId === "string" && /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/.test(base.moduleId) ? base.moduleId : "core";
    return {
      protocolVersion: 1,
      kind: "error",
      messageId: createMessageId(),
      correlationId: typeof base.correlationId === "string" ? base.correlationId.slice(0, 64) : createMessageId(),
      moduleId,
      error: { code: error.code, message: error.message.slice(0, 512) },
    };
  }

  private errorFor(request: UiEnvelope, code: string, message: string): UiEnvelope {
    return {
      protocolVersion: 1,
      kind: "error",
      messageId: createMessageId(),
      correlationId: request.correlationId,
      sessionId: request.sessionId,
      moduleId: request.moduleId,
      error: { code, message },
    };
  }
}

function createResponse(request: UiEnvelope, payload: unknown): UiEnvelope {
  return {
    protocolVersion: 1,
    kind: "response",
    messageId: createMessageId(),
    correlationId: request.correlationId,
    sessionId: request.sessionId,
    moduleId: request.moduleId,
    payload,
  };
}

function asProtocolError(error: unknown): UiProtocolError {
  if (error instanceof UiProtocolError) return error;
  return new UiProtocolError("INVALID_ENVELOPE", "Envelope inválido.");
}

function routeKey(moduleId: string, action: string): string {
  return `${moduleId}\u0000${action}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().filter(key => object[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
