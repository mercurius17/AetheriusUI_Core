import type * as Platform from "skyrimPlatform";
import type { UiEnvelope } from "../../../vendor/aetherius-ui-core/shared/protocol";

type MapPlatform = Pick<typeof Platform, "Game" | "Ui" | "Input">;
type Controller = { on: typeof Platform.on };
type PendingMap = { ticket: string; session: string; expiresAt: number; phase: "prepared" | "committed" | "opening" };
const BLOCKED = ["Console", "Main Menu", "Loading Menu", "Dialogue Menu", "RaceSex Menu", "Fader Menu", "InventoryMenu", "MagicMenu", "FavoritesMenu", "ContainerMenu", "BarterMenu", "Crafting Menu", "Book Menu", "Journal Menu", "Sleep/Wait Menu", "TweenMenu"];

/** Local visual command using existing SKSE/Skyrim Platform APIs, not a server mutation. */
export class NativeMapControl {
  private focused = false;
  private pending: PendingMap | null = null;
  private recent = new Map<string, UiEnvelope>();

  constructor(private sp: MapPlatform, controller: Controller, private send: (packet: unknown) => void, private session: () => string | null, private connected: () => boolean) {
    controller.on("update", () => this.update());
    controller.on("menuOpen", event => { if (event.name === "MapMenu" && this.pending?.phase === "opening") this.finish("opened"); });
  }

  onFocusChanged(focused: boolean): void {
    // A newly focused browser must not inherit an old committed map command.
    if (focused && !this.focused && this.pending?.phase !== "prepared") this.pending = null;
    this.focused = focused;
  }

  reset(): void { this.pending = null; this.recent.clear(); }

  private guard(): number {
    if (typeof this.sp.Input?.getMappedKey !== "function" || typeof this.sp.Input?.tapKey !== "function" || typeof this.sp.Ui?.isMenuOpen !== "function") throw new Error("API nativa do mapa indisponível.");
    if (!this.connected() || !this.session() || !this.sp.Game.getPlayer()?.is3DLoaded() || !this.sp.Game.isMenuControlsEnabled() || BLOCKED.some(menu => this.sp.Ui.isMenuOpen(menu))) throw new Error("O mapa não pode ser aberto no estado atual do jogo.");
    // Quick Map is the engine's existing map action; never assume the M key.
    const key = this.sp.Input.getMappedKey("Quick Map", 0);
    if (!Number.isInteger(key) || key < 1 || key >= 255) throw new Error("Configure uma tecla de teclado para Mapa nos controles do jogo.");
    // The current Core also owns the physical TAB scancode (0x0f).
    if (key === 0x0f || key === this.sp.Input.getMappedKey("Tween Menu", 0)) throw new Error("Mapa e TAB estão associados à mesma tecla. Ajuste os controles do jogo.");
    return key;
  }

  handle(request: UiEnvelope): boolean {
    if (request.moduleId !== "map") return false;
    if (request.kind !== "request" || request.sessionId !== this.session() || !this.connected()) return true;
    const old = this.recent.get(request.correlationId);
    if (old) { this.send({ type: "envelope", envelope: old }); return true; }
    try {
      const payload = request.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Solicitação de mapa inválida.");
      const fields = Object.keys(payload),ticket = (payload as { ticket?: unknown }).ticket;
      if (request.action === "prepareNative") {
        if (fields.length || !this.focused) throw new Error("Abra MAPA pelo radial do TAB.");
        this.guard();
        if (this.pending && this.pending.expiresAt > Date.now()) throw new Error("A abertura do mapa já está em andamento.");
        this.pending = { ticket: request.correlationId, session: request.sessionId!, expiresAt: Date.now() + 5000, phase: "prepared" };
        this.reply(request, { ok: true, status: "prepared", ticket: request.correlationId });
      } else if (request.action === "openNative") {
        if (fields.length !== 1 || fields[0] !== "ticket" || !this.pending || this.pending.ticket !== ticket || this.pending.session !== request.sessionId || this.pending.phase !== "prepared" || this.pending.expiresAt <= Date.now() || !this.focused) throw new Error("Solicitação de mapa expirada. Abra MAPA novamente.");
        this.guard();this.pending.phase = "committed";
        this.reply(request, { ok: true, status: "releaseFocus" });
      } else if (request.action === "cancelNative") {
        if (fields.length !== 1 || fields[0] !== "ticket" || typeof ticket !== "string") throw new Error("Cancelamento inválido.");
        if (this.pending?.ticket === ticket && this.pending.phase !== "opening") this.pending = null;
        this.reply(request, { ok: true, status: "cancelled" });
      } else throw new Error("Ação de mapa não permitida.");
    } catch (error) { this.reply(request, { ok: false, error: { code: "MAP_UNAVAILABLE", message: error instanceof Error ? error.message : "Mapa indisponível." } }); }
    return true;
  }

  private reply(request: UiEnvelope, payload: unknown): void {
    const response: UiEnvelope = { protocolVersion: 1, kind: "response", moduleId: "map", action: request.action, sessionId: request.sessionId, messageId: request.messageId, correlationId: request.correlationId, payload };
    this.recent.set(request.correlationId, response);
    while (this.recent.size > 32) this.recent.delete(this.recent.keys().next().value!);
    this.send({ type: "envelope", envelope: response });
  }

  private update(): void {
    const pending = this.pending;if (!pending) return;
    if (pending.session !== this.session() || !this.connected()) { this.pending = null; return; }
    if (pending.expiresAt <= Date.now()) { this.finish("failed", "O jogo não confirmou a abertura do mapa."); return; }
    if (pending.phase === "prepared" || this.focused) return;
    if (this.sp.Ui.isMenuOpen("MapMenu")) { this.finish("opened"); return; }
    if (pending.phase === "opening") return; // Never tap twice: the second tap would close MapMenu.
    // Meridian queues its focus-menu close separately from the focus callback.
    if (this.sp.Ui.isMenuOpen("MeridianUI_FocusMenu")) return;
    try { const key = this.guard();pending.phase = "opening";this.sp.Input.tapKey(key); }
    catch (error) { this.finish("failed", error instanceof Error ? error.message : "Mapa indisponível."); }
  }

  private finish(status: "opened" | "failed", message?: string): void {
    const pending = this.pending;if (!pending) return;this.pending = null;
    this.send({ type: "envelope", envelope: { protocolVersion: 1, kind: "event", moduleId: "map", action: "nativeMapState", sessionId: pending.session, messageId: pending.ticket, correlationId: pending.ticket, payload: { status, ...(message ? { message } : {}) } } });
  }
}

