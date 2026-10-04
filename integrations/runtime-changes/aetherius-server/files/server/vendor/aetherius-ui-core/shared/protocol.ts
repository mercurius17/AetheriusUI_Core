export const UI_PROTOCOL_VERSION = 1 as const;
export const MAX_ENVELOPE_BYTES = 16 * 1024;
export const MAX_PAYLOAD_DEPTH = 16;

/** UTF-8 size without browser globals; Skyrim Platform embeds a Node context. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3; // BMP and the UTF-8 replacement for an unpaired surrogate.
  }
  return bytes;
}

export type UiMessageKind = "request" | "response" | "event" | "snapshot" | "patch" | "error";

export interface UiError {
  code: string;
  message: string;
}

export interface UiEnvelope {
  protocolVersion: typeof UI_PROTOCOL_VERSION;
  kind: UiMessageKind;
  messageId: string;
  correlationId: string;
  sessionId?: string;
  moduleId: string;
  action?: string;
  revision?: number;
  baseRevision?: number;
  payload?: unknown;
  error?: UiError;
}

const KINDS: readonly UiMessageKind[] = ["request", "response", "event", "snapshot", "patch", "error"];
const ENVELOPE_KEYS = new Set([
  "protocolVersion", "kind", "messageId", "correlationId", "sessionId", "moduleId",
  "action", "revision", "baseRevision", "payload", "error",
]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/;

export class UiProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UiProtocolError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateJsonValue(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > MAX_PAYLOAD_DEPTH) throw new UiProtocolError("INVALID_ENVELOPE", "Payload nesting limit exceeded.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new UiProtocolError("INVALID_ENVELOPE", "Payload contains a non-finite number.");
    return;
  }
  if (typeof value !== "object") throw new UiProtocolError("INVALID_ENVELOPE", "Payload must contain JSON values only.");
  if (seen.has(value)) throw new UiProtocolError("INVALID_ENVELOPE", "Payload contains a circular reference.");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 256) throw new UiProtocolError("INVALID_ENVELOPE", "Payload array is too large.");
    for (const item of value) validateJsonValue(item, depth + 1, seen);
  } else {
    if (!isRecord(value)) throw new UiProtocolError("INVALID_ENVELOPE", "Payload objects must be plain JSON objects.");
    const entries = Object.entries(value);
    if (entries.length > 256) throw new UiProtocolError("INVALID_ENVELOPE", "Payload object has too many fields.");
    for (const [key, entry] of entries) {
      if (UNSAFE_KEYS.has(key)) throw new UiProtocolError("INVALID_ENVELOPE", "Payload contains a reserved object key.");
      validateJsonValue(entry, depth + 1, seen);
    }
  }
  seen.delete(value);
}

function requireIdentifier(value: unknown, field: string, pattern = IDENTIFIER): asserts value is string {
  if (typeof value !== "string" || value.length > 64 || !pattern.test(value)) {
    throw new UiProtocolError("INVALID_ENVELOPE", `${field} has an invalid format.`);
  }
}

export function validateEnvelope(value: unknown, options: { requireSession?: boolean } = {}): UiEnvelope {
  if (!isRecord(value)) throw new UiProtocolError("INVALID_ENVELOPE", "Envelope must be an object.");
  for (const key of Object.keys(value)) {
    if (!ENVELOPE_KEYS.has(key)) throw new UiProtocolError("INVALID_ENVELOPE", `Unexpected envelope field: ${key}.`);
  }
  if (value.protocolVersion !== UI_PROTOCOL_VERSION) {
    throw new UiProtocolError("UNSUPPORTED_PROTOCOL", "The UI protocol version is not supported.");
  }
  if (typeof value.kind !== "string" || !KINDS.includes(value.kind as UiMessageKind)) {
    throw new UiProtocolError("INVALID_ENVELOPE", "Message kind is invalid.");
  }
  requireIdentifier(value.messageId, "messageId");
  requireIdentifier(value.correlationId, "correlationId");
  requireIdentifier(value.moduleId, "moduleId", MODULE_ID);
  if (value.sessionId !== undefined) requireIdentifier(value.sessionId, "sessionId");
  if (options.requireSession && typeof value.sessionId !== "string") {
    throw new UiProtocolError("SESSION_MISMATCH", "A server-issued session is required.");
  }
  if (value.action !== undefined) requireIdentifier(value.action, "action");
  if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0)) {
    throw new UiProtocolError("INVALID_ENVELOPE", "revision must be a non-negative safe integer.");
  }
  if (value.baseRevision !== undefined && (!Number.isSafeInteger(value.baseRevision) || (value.baseRevision as number) < 0)) {
    throw new UiProtocolError("INVALID_ENVELOPE", "baseRevision must be a non-negative safe integer.");
  }
  if (value.kind === "request" && typeof value.action !== "string") {
    throw new UiProtocolError("INVALID_ENVELOPE", "Requests require an action.");
  }
  if (value.kind === "patch" && (typeof value.revision !== "number" || typeof value.baseRevision !== "number" || value.revision <= value.baseRevision)) {
    throw new UiProtocolError("INVALID_ENVELOPE", "Patches require a revision greater than baseRevision.");
  }
  if (value.kind === "error") {
    if (!isRecord(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
      throw new UiProtocolError("INVALID_ENVELOPE", "Error messages require a code and message.");
    }
    if (value.error.code.length > 64 || value.error.message.length > 512) {
      throw new UiProtocolError("INVALID_ENVELOPE", "Error details are too long.");
    }
  }
  if (value.payload !== undefined) validateJsonValue(value.payload);
  const envelope = value as unknown as UiEnvelope;
  const bytes = utf8ByteLength(JSON.stringify(envelope));
  if (bytes > MAX_ENVELOPE_BYTES) throw new UiProtocolError("PAYLOAD_TOO_LARGE", "Envelope exceeds 16 KiB.");
  return envelope;
}

export function encodeEnvelope(value: unknown, options: { requireSession?: boolean } = {}): string {
  const envelope = validateEnvelope(value, options);
  const encoded = JSON.stringify(envelope);
  if (utf8ByteLength(encoded) > MAX_ENVELOPE_BYTES) {
    throw new UiProtocolError("PAYLOAD_TOO_LARGE", "Envelope exceeds 16 KiB.");
  }
  return encoded;
}

export function decodeEnvelope(encoded: string, options: { requireSession?: boolean } = {}): UiEnvelope {
  if (typeof encoded !== "string" || utf8ByteLength(encoded) > MAX_ENVELOPE_BYTES) {
    throw new UiProtocolError("PAYLOAD_TOO_LARGE", "Envelope exceeds 16 KiB.");
  }
  try {
    return validateEnvelope(JSON.parse(encoded), options);
  } catch (error) {
    if (error instanceof UiProtocolError) throw error;
    throw new UiProtocolError("INVALID_ENVELOPE", "Envelope is not valid JSON.");
  }
}

export function createMessageId(): string {
  const cryptoApi = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  const random = cryptoApi?.randomUUID?.();
  return random ?? `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
