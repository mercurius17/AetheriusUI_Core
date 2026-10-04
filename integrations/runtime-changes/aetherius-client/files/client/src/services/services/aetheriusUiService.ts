import { Game } from "skyrimPlatform";
import { NativeMapControl } from "./nativeMapControl";
import { MsgType } from "../../messages";
import { decodeEnvelope, utf8ByteLength, MAX_ENVELOPE_BYTES, type UiEnvelope } from "../../../vendor/aetherius-ui-core/shared/protocol";
import { logTrace } from "../../logging";
import { CustomPacketMessage } from "../messages/customPacketMessage";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import { NetworkingService } from "./networkingService";
import * as fs from "node:fs";

const PACKET_SESSION = "aetherius-ui:v1:session";
const PACKET_REQUEST = "aetherius-ui:v1:request";
const PACKET_MESSAGE = "aetherius-ui:v1:message";
const FROM_VIEW = "AetheriusUI.FromView";
const TO_VIEW = "AetheriusUI.ToView";
const FOCUS_STATE = "AetheriusUI.FocusState";

export class AetheriusUiService extends ClientListener {
  private sessionId: string | null = null;
  private coreSnapshot: UiEnvelope | null = null;
  private readonly nativeMap: NativeMapControl;
  private diagnosticsLeft = 64;
  private bridgeQueue: string[] = [];
  private bridgeQueueBytes = 0;

  private diagnose(status: string): void {
    // Explicit local-test opt-in. Never store sessions, actors or UI payloads.
    const settings = this.sp.settings["skymp5-client"];
    if (settings?.["aetherius-local-test"] !== true || settings?.["server-ip"] !== "127.0.0.1" || this.diagnosticsLeft-- <= 0) return;
    const file = settings["aetherius-ui-diagnostics"];
    if (typeof file !== "string") return;
    try { fs.appendFileSync(file, `${new Date().toISOString()} ${status}\n`); } catch { /* optional test diagnostics */ }
  }

  constructor(private sp: Sp, private controller: CombinedController) {
    super();
    this.nativeMap = new NativeMapControl(this.sp, this.controller, packet => this.sendToView(packet), () => this.sessionId, () => this.controller.lookupListener(NetworkingService).isConnected());
    this.controller.on("modEvent", (event) => this.onModEvent(event));
    this.controller.on("update", () => this.flushBridge());
    this.controller.emitter.on("customPacketMessage", (event) => this.onCustomPacket(event.message));
    this.controller.emitter.on("connectionDisconnect", () => this.resetSession());
    this.controller.emitter.on("connectionFailed", () => this.resetSession());
    this.controller.emitter.on("connectionDenied", () => this.resetSession());
    logTrace(this, "adapter inicializado para eventos locais e customPacket");
    this.diagnose("initialized");
  }

  private onModEvent(event: { eventName: string; strArg: string; numArg: number }) {
    if (event.eventName === "AetheriusUI.Ready") {
      this.diagnose("native-ready");
      if (this.sessionId) {
        this.sendToView({ type: "session", sessionId: this.sessionId });
        if (this.coreSnapshot) this.sendToView({ type: "envelope", envelope: this.coreSnapshot });
      }
      return;
    }
    if (event.eventName === FOCUS_STATE) {
      const focused = event.strArg === "true";
      this.diagnose(focused ? "native-focus-acquired" : "native-focus-released");
      this.nativeMap.onFocusChanged(focused);
      this.controller.emitter.emit("aetheriusUiFocusChanged", focused);
      return;
    }
    if (event.eventName !== FROM_VIEW || !this.sessionId) return;
    if (typeof event.strArg !== "string" || utf8ByteLength(event.strArg) > MAX_ENVELOPE_BYTES) return;

    let envelope: UiEnvelope;
    try {
      envelope = decodeEnvelope(event.strArg, { requireSession: true });
    } catch {
      return;
    }
    if (envelope.kind !== "request" || envelope.sessionId !== this.sessionId) return;
    if (!this.controller.lookupListener(NetworkingService).isConnected()) return;
    if (this.nativeMap.handle(envelope)) return;

    const message: CustomPacketMessage = {
      t: MsgType.CustomPacket,
      contentJsonDump: JSON.stringify({ customPacketType: PACKET_REQUEST, envelope }),
    };
    this.controller.emitter.emit("sendMessage", { message, reliability: "reliable" });
    logTrace(this, "request encaminhado", envelope.moduleId, envelope.action, envelope.correlationId);
  }

  private onCustomPacket(message: CustomPacketMessage) {
    this.diagnose("custom-packet-received");
    if (typeof message.contentJsonDump !== "string" || utf8ByteLength(message.contentJsonDump) > MAX_ENVELOPE_BYTES + 1024) return;
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(message.contentJsonDump);
    } catch {
      return;
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) return;
    if (content.customPacketType === PACKET_MESSAGE && content.uiDisconnect === true) { this.resetSession(); return; }
    if (content.customPacketType === PACKET_SESSION) {
      if (content.protocolVersion !== 1 || typeof content.sessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(content.sessionId)) return;
      this.nativeMap.reset();
      this.sessionId = content.sessionId;
      this.coreSnapshot = null;
      logTrace(this, "sessão de UI recebida do servidor");
      this.diagnose("server-session-accepted");
      this.sendToView({ type: "session", sessionId: this.sessionId });
      return;
    }
    if (content.customPacketType !== PACKET_MESSAGE || !this.sessionId || typeof content.envelope !== "object" || content.envelope === null) return;

    let envelope: UiEnvelope;
    try {
      envelope = decodeEnvelope(JSON.stringify(content.envelope), { requireSession: true });
    } catch {
      return;
    }
    if (envelope.sessionId !== this.sessionId) return;
    if (envelope.kind === "snapshot" && envelope.moduleId === "core") this.coreSnapshot = envelope;
    this.sendToView({ type: "envelope", envelope });
    if (envelope.kind === "response" || envelope.kind === "error") {
      logTrace(this, "resposta de UI recebida", envelope.moduleId, envelope.correlationId, envelope.kind);
    }
  }

  private resetSession() {
    this.nativeMap.reset();
    this.sessionId = null;
    this.coreSnapshot = null;
    this.sendToView({ type: "disconnect" });
  }

  private sendToView(packet: unknown) {
    try {
      const serialized = JSON.stringify(packet);
      const size = utf8ByteLength(serialized);
      if (size > MAX_ENVELOPE_BYTES + 1024) return;
      const type = (packet as { type?: string })?.type;
      if (type === "session" || type === "disconnect") { this.bridgeQueue = []; this.bridgeQueueBytes = 0; }
      if (this.bridgeQueue.length >= 128 || this.bridgeQueueBytes + size > 512 * 1024) { this.diagnose("bridge-queue-limit"); return; }
      this.bridgeQueue.push(serialized);
      this.bridgeQueueBytes += size;
    } catch { /* malformed local packet */ }
  }

  private flushBridge(): void {
    if (!this.bridgeQueue.length) return;
    // Network customPacket is emitted from tick (render thread). Papyrus/native
    // calls are legal in update only. Retain packets until a player is available.
    try {
      const player = Game.getPlayer();
      if (!player) { this.diagnose("bridge-player-unavailable"); return; }
      for (let count = 0; count < 16 && this.bridgeQueue.length; count++) {
        const serialized = this.bridgeQueue[0];
        player.sendModEvent(TO_VIEW, serialized, 0);
        this.bridgeQueue.shift();
        this.bridgeQueueBytes -= utf8ByteLength(serialized);
        this.diagnose("bridge-event-sent");
      }
    } catch (error) {
      this.diagnose(`bridge-event-failed:${error instanceof Error ? error.message.slice(0, 240).replace(/[\r\n]/g, " ") : "unknown"}`);
      // O carregamento da página/personagem pode ainda não ter terminado.
    }
  }
}

