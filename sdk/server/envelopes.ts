import { createMessageId, validateEnvelope, type UiEnvelope } from "../../shared/protocol";

export function createUiEvent(sessionId: string, moduleId: string, action: string, payload: unknown): UiEnvelope {
  const messageId = createMessageId();
  return validateEnvelope({ protocolVersion: 1, kind: "event", messageId, correlationId: messageId, sessionId, moduleId, action, payload }, { requireSession: true });
}

export function createUiSnapshot(sessionId: string, moduleId: string, revision: number, payload: unknown): UiEnvelope {
  const messageId = createMessageId();
  return validateEnvelope({ protocolVersion: 1, kind: "snapshot", messageId, correlationId: messageId, sessionId, moduleId, revision, payload }, { requireSession: true });
}

export function createUiPatch(sessionId: string, moduleId: string, baseRevision: number, revision: number, payload: unknown): UiEnvelope {
  const messageId = createMessageId();
  return validateEnvelope({ protocolVersion: 1, kind: "patch", messageId, correlationId: messageId, sessionId, moduleId, baseRevision, revision, payload }, { requireSession: true });
}
