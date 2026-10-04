import { Game } from "skyrimPlatform";
import { NativeMapControl } from "./nativeMapControl";
import { MsgType } from "../../messages";
import { decodeEnvelope, encodeEnvelope, MAX_ENVELOPE_BYTES, type UiEnvelope } from "../../../../../../../shared/protocol";
import { logTrace } from "../../logging";
import { CustomPacketMessage } from "../messages/customPacketMessage";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import { NetworkingService } from "./networkingService";

const PACKET_SESSION = "aetherius-ui:v1:session";
const PACKET_REQUEST = "aetherius-ui:v1:request";
const PACKET_MESSAGE = "aetherius-ui:v1:message";
const FROM_VIEW = "AetheriusUI.FromView";
const TO_VIEW = "AetheriusUI.ToView";
const FOCUS_STATE = "AetheriusUI.FocusState";

export class AetheriusUiService extends ClientListener {
  private sessionId: string | null = null;
  private readonly nativeMap: NativeMapControl;

  constructor(private sp: Sp, private controller: CombinedController) {
    super();
    this.nativeMap = new NativeMapControl(this.sp, this.controller, packet => this.sendToView(packet), () => this.sessionId, () => this.controller.lookupListener(NetworkingService).isConnected());
    this.controller.on("modEvent", (event) => this.onModEvent(event));
    this.controller.emitter.on("customPacketMessage", (event) => this.onCustomPacket(event.message));
    this.controller.emitter.on("connectionDisconnect", () => this.resetSession());
    this.controller.emitter.on("connectionFailed", () => this.resetSession());
    this.controller.emitter.on("connectionDenied", () => this.resetSession());
    logTrace(this, "adapter inicializado para eventos locais e customPacket");
  }

  private onModEvent(event: { eventName: string; strArg: string; numArg: number }) {
    if (event.eventName === FOCUS_STATE) {
      const focused = event.strArg === "true";
      this.nativeMap.onFocusChanged(focused);
      this.controller.emitter.emit("aetheriusUiFocusChanged", focused);
      return;
    }
    if (event.eventName !== FROM_VIEW || !this.sessionId) return;
    if (typeof event.strArg !== "string" || new TextEncoder().encode(event.strArg).byteLength > MAX_ENVELOPE_BYTES) return;

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
    if (typeof message.contentJsonDump !== "string" || new TextEncoder().encode(message.contentJsonDump).byteLength > MAX_ENVELOPE_BYTES + 1024) return;
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(message.contentJsonDump);
    } catch {
      return;
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) return;
    if (content.customPacketType === PACKET_SESSION) {
      if (content.protocolVersion !== 1 || typeof content.sessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(content.sessionId)) return;
      this.nativeMap.reset();
      this.sessionId = content.sessionId;
      logTrace(this, "sessão de UI recebida do servidor");
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
    this.sendToView({ type: "envelope", envelope });
    if (envelope.kind === "response" || envelope.kind === "error") {
      logTrace(this, "resposta de UI recebida", envelope.moduleId, envelope.correlationId, envelope.kind);
    }
  }

  private resetSession() {
    this.nativeMap.reset();
    this.sessionId = null;
    this.sendToView({ type: "disconnect" });
  }

  private sendToView(packet: unknown) {
    let serialized: string;
    try {
      serialized = JSON.stringify(packet);
      if (new TextEncoder().encode(serialized).byteLength > MAX_ENVELOPE_BYTES + 1024) return;
      Game.getPlayer()?.sendModEvent(TO_VIEW, serialized, 0);
    } catch {
      // O carregamento da página/personagem pode ainda não ter terminado.
    }
  }
}
