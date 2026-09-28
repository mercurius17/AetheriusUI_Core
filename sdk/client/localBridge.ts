import { MAX_ENVELOPE_BYTES, UiProtocolError } from "../../shared/protocol";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const MAX_BASE64_CHARS = Math.ceil(MAX_ENVELOPE_BYTES / 3) * 4;

export function encodeLocalBridgeMessage(json: string): string {
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_ENVELOPE_BYTES) throw new UiProtocolError("PAYLOAD_TOO_LARGE", "Local bridge message exceeds 16 KiB.");
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    output += BASE64[a >> 2];
    output += BASE64[((a & 3) << 4) | (b >> 4)];
    output += index + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : "=";
    output += index + 2 < bytes.length ? BASE64[c & 63] : "=";
  }
  return output;
}

export function decodeLocalBridgeMessage(encoded: string): string {
  if (encoded.length > MAX_BASE64_CHARS || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new UiProtocolError("INVALID_ENVELOPE", "Local bridge encoding is invalid.");
  }
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 4) {
    const a = BASE64.indexOf(encoded[index]);
    const b = BASE64.indexOf(encoded[index + 1]);
    const c = encoded[index + 2] === "=" ? 0 : BASE64.indexOf(encoded[index + 2]);
    const d = encoded[index + 3] === "=" ? 0 : BASE64.indexOf(encoded[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new UiProtocolError("INVALID_ENVELOPE", "Local bridge encoding is invalid.");
    bytes.push((a << 2) | (b >> 4));
    if (encoded[index + 2] !== "=") bytes.push(((b & 15) << 4) | (c >> 2));
    if (encoded[index + 3] !== "=") bytes.push(((c & 3) << 6) | d);
  }
  if (bytes.length > MAX_ENVELOPE_BYTES) throw new UiProtocolError("PAYLOAD_TOO_LARGE", "Local bridge message exceeds 16 KiB.");
  return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
}

