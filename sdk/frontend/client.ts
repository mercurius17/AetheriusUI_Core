import { createMessageId, decodeEnvelope, encodeEnvelope, UiProtocolError, type UiEnvelope } from "../../shared/protocol";

export interface FrontendBridge {
  send(encoded: string): void;
  subscribe(listener: (encoded: string) => void): () => void;
}

export interface UiClientOptions {
  bridge: FrontendBridge;
  sessionId: () => string | null;
  timeoutMs?: number;
  onDiagnostic?: (event: { event: string; moduleId?: string; correlationId?: string; durationMs?: number }) => void;
}

export class UiRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UiRequestError";
    this.code = code;
  }
}

export class AetheriusUiClient {
  private readonly pending = new Map<string, {
    moduleId: string;
    sessionId: string;
    startedAt: number;
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private readonly listeners = new Map<string, Set<(message: UiEnvelope) => void>>();
  private readonly unsubscribeBridge: () => void;
  private readonly timeoutMs: number;

  constructor(private readonly options: UiClientOptions) {
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8000, 250), 30_000);
    this.unsubscribeBridge = options.bridge.subscribe((encoded) => this.receive(encoded));
  }

  request<T>(moduleId: string, action: string, payload?: unknown): Promise<T> {
    this.rejectStalePending();
    const sessionId = this.options.sessionId();
    if (!sessionId) return Promise.reject(new UiRequestError("SESSION_MISMATCH", "A conexão ainda não recebeu uma sessão do servidor."));
    const messageId = createMessageId();
    const correlationId = createMessageId();
    const encoded = encodeEnvelope({
      protocolVersion: 1,
      kind: "request",
      messageId,
      correlationId,
      sessionId,
      moduleId,
      action,
      payload,
    }, { requireSession: true });
    return new Promise<T>((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new UiRequestError("TIMEOUT", "O servidor não respondeu dentro do prazo."));
        this.options.onDiagnostic?.({ event: "request-timeout", moduleId, correlationId, durationMs: Date.now() - startedAt });
      }, this.timeoutMs);
      this.pending.set(correlationId, {
        moduleId,
        sessionId,
        startedAt,
        timer,
        resolve: (value) => resolve(value as T),
        reject,
      });
      try {
        this.options.bridge.send(encoded);
        this.options.onDiagnostic?.({ event: "request-sent", moduleId, correlationId });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(correlationId);
        reject(error instanceof Error ? error : new UiRequestError("BRIDGE_UNAVAILABLE", "Bridge indisponível."));
      }
    });
  }

  subscribe(moduleId: string, listener: (message: UiEnvelope) => void): () => void {
    const set = this.listeners.get(moduleId) ?? new Set<(message: UiEnvelope) => void>();
    set.add(listener);
    this.listeners.set(moduleId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(moduleId);
    };
  }

  close(): void {
    this.unsubscribeBridge();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new UiRequestError("UNAVAILABLE", "A interface foi fechada."));
    }
    this.pending.clear();
    this.listeners.clear();
  }

  private receive(encoded: string): void {
    let message: UiEnvelope;
    try {
      message = decodeEnvelope(encoded, { requireSession: true });
    } catch {
      this.options.onDiagnostic?.({ event: "invalid-bridge-message" });
      return;
    }
    this.rejectStalePending();
    const currentSession = this.options.sessionId();
    if (message.sessionId !== currentSession) {
      this.options.onDiagnostic?.({ event: "stale-session-message", moduleId: message.moduleId, correlationId: message.correlationId });
      return;
    }
    if (message.kind === "response" || message.kind === "error") {
      const pending = this.pending.get(message.correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.correlationId);
        this.options.onDiagnostic?.({
          event: "response-received",
          moduleId: pending.moduleId,
          correlationId: message.correlationId,
          durationMs: Date.now() - pending.startedAt,
        });
        if (message.kind === "error") pending.reject(new UiRequestError(message.error?.code ?? "REQUEST_FAILED", message.error?.message ?? "A solicitação falhou."));
        else pending.resolve(message.payload);
      }
    }
    for (const listener of this.listeners.get(message.moduleId) ?? []) {
      try { listener(message); } catch { /* Falha de consumer não atravessa o shell. */ }
    }
  }

  private rejectStalePending(): void {
    const currentSession = this.options.sessionId();
    for (const [correlationId, entry] of this.pending) {
      if (entry.sessionId === currentSession) continue;
      clearTimeout(entry.timer);
      this.pending.delete(correlationId);
      entry.reject(new UiRequestError("SESSION_MISMATCH", "A sessão do servidor mudou durante a solicitação."));
      this.options.onDiagnostic?.({ event: "request-session-reset", moduleId: entry.moduleId, correlationId, durationMs: Date.now() - entry.startedAt });
    }
  }
}

export function bridgeProtocolError(error: unknown): UiRequestError {
  if (error instanceof UiProtocolError) return new UiRequestError(error.code, error.message);
  return new UiRequestError("INVALID_ENVELOPE", "Mensagem de UI inválida.");
}
