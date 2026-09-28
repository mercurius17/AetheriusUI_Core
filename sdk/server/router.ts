import { createMessageId, UiProtocolError, validateEnvelope, type UiEnvelope } from "../../shared/protocol";
import { RequestDeduplicator } from "../../shared/revisionStore";

export interface UiServerRequestContext {
  readonly userId: number;
  readonly actorId: number;
  readonly sessionId: string;
  readonly correlationId: string;
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

export class UiServerRouter {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly dedupeBySession = new Map<string, RequestDeduplicator<UiEnvelope>>();

  register(moduleId: string, action: string, handler: UiActionHandler, options: UiActionOptions = {}): () => void {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/.test(moduleId)) throw new Error("Invalid UI module id.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(action)) throw new Error("Invalid UI action id.");
    const requiredCapabilities = [...new Set(options.requiredCapabilities ?? [])];
    if (requiredCapabilities.some((capability) => !/^[a-z][a-z0-9.-]{0,63}$/.test(capability))) throw new Error("Invalid UI capability id.");
    if (requiredCapabilities.length > 0 && typeof options.authorize !== "function") throw new Error("Protected UI actions require a server authorization policy.");
    const key = routeKey(moduleId, action);
    if (this.handlers.has(key)) throw new Error(`UI action is already registered: ${key}`);
    this.handlers.set(key, { moduleId, action, handler, options: { ...options, requiredCapabilities } });
    return () => { this.handlers.delete(key); };
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
    const dedupe = this.dedupeBySession.get(request.sessionId) ?? new RequestDeduplicator<UiEnvelope>();
    this.dedupeBySession.set(request.sessionId, dedupe);
    const cached = dedupe.read(request.messageId);
    if (cached) return cached;
    const registered = this.handlers.get(routeKey(request.moduleId, request.action ?? ""));
    if (!registered) return this.remember(dedupe, request, this.errorFor(request, "ACTION_UNAVAILABLE", "A ação não está disponível."));
    const handlerContext: UiServerRequestContext = {
      userId: context.userId,
      actorId: context.actorId,
      sessionId: request.sessionId,
      correlationId: request.correlationId,
    };
    if (registered.options.requiredCapabilities?.some((capability) => !registered.options.authorize?.(handlerContext, capability))) {
      return this.remember(dedupe, request, this.errorFor(request, "FORBIDDEN", "A conexão não tem autorização para esta ação."));
    }
    try {
      const result = await registered.handler(handlerContext, request.payload);
      const response = createResponse(request, result);
      return this.remember(dedupe, request, response);
    } catch {
      const response = this.errorFor(request, "REQUEST_FAILED", "O servidor não conseguiu concluir a solicitação.");
      return this.remember(dedupe, request, response);
    }
  }

  forgetSession(sessionId: string): void {
    this.dedupeBySession.delete(sessionId);
  }

  private remember(dedupe: RequestDeduplicator<UiEnvelope>, request: UiEnvelope, response: UiEnvelope): UiEnvelope {
    dedupe.remember(request.messageId, response);
    return response;
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
