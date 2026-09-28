import { NAVIGATION_CATALOG, type NavigationDescriptor } from "./catalog";

export const UI_SDK_VERSION = "1.0.0";

export interface ModuleAvailability {
  available: boolean;
  reason?: string;
}

export interface ModuleMountContext {
  readonly moduleId: string;
  readonly route: string;
  readonly signal: AbortSignal;
  readonly sdkVersion: string;
  readonly assets: readonly string[];
  readonly capabilities: readonly string[];
  readonly permissions: readonly string[];
}

export interface ModuleRuntime {
  mount(container: HTMLElement, context: ModuleMountContext): void | Promise<void>;
  unmount?(): void | Promise<void>;
}

export interface UiModuleDefinition {
  id: string;
  version: string;
  sdk: { min: string; maxExclusive?: string };
  label: string;
  rootRoute: string;
  radialSlot?: number;
  icon?: string;
  subroutes?: readonly string[];
  assets?: readonly string[];
  permissions?: readonly string[];
  capabilities?: readonly string[];
  availability?: () => ModuleAvailability;
  loader: () => Promise<ModuleRuntime>;
}

export interface RegisteredModuleView {
  descriptor: NavigationDescriptor | null;
  definition: UiModuleDefinition;
  availability: ModuleAvailability;
}

interface ActiveMount {
  runtime: ModuleRuntime;
  abortController: AbortController;
  container: HTMLElement;
}

export class ModuleRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleRegistryError";
  }
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersion(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function routeIsSafe(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(route.split(/[?#]/, 1)[0]); } catch { return false; }
  return !decoded.startsWith("//") && !decoded.includes("\\") &&
    !decoded.split("/").some((part) => part === "." || part === "..");
}

function routeBelongsToModule(route: string, rootRoute: string): boolean {
  const normalizedRoot = rootRoute.replace(/\/$/, "") || "/";
  return route === normalizedRoot || route.startsWith(`${normalizedRoot === "/" ? "" : normalizedRoot}/`);
}

function cleanLabel(label: string): string {
  return label.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 48);
}

export class UiModuleRegistry {
  private readonly modules = new Map<string, UiModuleDefinition>();
  private readonly slots = new Map<number, string>();
  private readonly active = new Map<string, ActiveMount>();
  private readonly mounting = new Map<string, AbortController>();
  private readonly unmounting = new Map<string, Promise<void>>();

  constructor(private readonly sdkVersion = UI_SDK_VERSION) {}

  register(definition: UiModuleDefinition): void {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/.test(definition.id)) {
      throw new ModuleRegistryError("Module id has an invalid format.");
    }
    if (this.modules.has(definition.id)) throw new ModuleRegistryError(`Module ${definition.id} is already registered.`);
    const version = parseVersion(definition.version);
    const min = parseVersion(definition.sdk?.min ?? "");
    const max = definition.sdk?.maxExclusive ? parseVersion(definition.sdk.maxExclusive) : null;
    const currentSdk = parseVersion(this.sdkVersion);
    if (!version || !min || !currentSdk || (definition.sdk.maxExclusive && !max)) {
      throw new ModuleRegistryError("Module and SDK versions must use numeric semantic versions.");
    }
    if (compareVersion(currentSdk, min) < 0 || (max && compareVersion(currentSdk, max) >= 0)) {
      throw new ModuleRegistryError(`Module ${definition.id} is incompatible with SDK ${this.sdkVersion}.`);
    }
    const label = cleanLabel(definition.label);
    if (!label || !routeIsSafe(definition.rootRoute) || typeof definition.loader !== "function") {
      throw new ModuleRegistryError("Module requires a label, safe root route and loader.");
    }
    const subroutes = [...new Set(definition.subroutes ?? [])];
    if (subroutes.some((route) => !routeIsSafe(route) || !routeBelongsToModule(route, definition.rootRoute))) {
      throw new ModuleRegistryError("Module subroutes must stay below its root route.");
    }
    const assets = [...new Set(definition.assets ?? [])];
    if (assets.some((asset) => !/^[a-zA-Z0-9._/-]{1,160}$/.test(asset) || asset.startsWith("/") || asset.split("/").some((part) => part === ".." || part === "."))) {
      throw new ModuleRegistryError("Module assets must be relative local paths.");
    }
    const permissions = [...new Set(definition.permissions ?? [])];
    const capabilities = [...new Set(definition.capabilities ?? [])];
    if ([...permissions, ...capabilities].some((value) => !/^[a-z][a-z0-9.-]{0,63}$/.test(value))) {
      throw new ModuleRegistryError("Module permission and capability ids must be stable lowercase identifiers.");
    }
    if (definition.radialSlot !== undefined) {
      const descriptor = NAVIGATION_CATALOG.find((item) => item.radialSlot === definition.radialSlot);
      if (!descriptor || descriptor.id !== definition.id) {
        throw new ModuleRegistryError(`Slot ${definition.radialSlot} is not assigned to ${definition.id}.`);
      }
      if (this.slots.has(definition.radialSlot)) throw new ModuleRegistryError(`Slot ${definition.radialSlot} is already registered.`);
      this.slots.set(definition.radialSlot, definition.id);
    }
    this.modules.set(definition.id, { ...definition, subroutes, assets, permissions, capabilities, label, rootRoute: definition.rootRoute.replace(/\/$/, "") || "/" });
  }

  get(id: string): RegisteredModuleView | null {
    const definition = this.modules.get(id);
    if (!definition) return null;
    const descriptor = NAVIGATION_CATALOG.find((item) => item.id === id) ?? null;
    let availability: ModuleAvailability = { available: true };
    try {
      const result = definition.availability?.() ?? availability;
      if (typeof result.available !== "boolean") throw new Error("Invalid availability result.");
      availability = {
        available: result.available,
        reason: typeof result.reason === "string" ? cleanLabel(result.reason).slice(0, 160) : undefined,
      };
    } catch {
      availability = { available: false, reason: "O módulo falhou ao verificar disponibilidade." };
    }
    return { descriptor, definition, availability };
  }

  listNavigation(): Array<NavigationDescriptor & { registered: boolean; available: boolean; reason?: string }> {
    return NAVIGATION_CATALOG.map((descriptor) => {
      const module = this.get(descriptor.id);
      return {
        ...descriptor,
        registered: module !== null,
        available: module?.availability.available ?? false,
        reason: module?.availability.reason ?? "Módulo externo não registrado.",
      };
    });
  }

  async mount(id: string, container: HTMLElement, route: string): Promise<void> {
    if (this.active.has(id) || this.mounting.has(id) || this.unmounting.has(id)) throw new ModuleRegistryError(`Module ${id} is already mounting, mounted or unmounting.`);
    const module = this.get(id);
    if (!module || !module.availability.available) {
      throw new ModuleRegistryError(module?.availability.reason ?? `Module ${id} is not registered.`);
    }
    if (!routeIsSafe(route) || !routeBelongsToModule(route, module.definition.rootRoute)) {
      throw new ModuleRegistryError("Route is outside the module's local route space.");
    }
    const abortController = new AbortController();
    this.mounting.set(id, abortController);
    let runtime: ModuleRuntime | null = null;
    try {
      runtime = await module.definition.loader();
      if (abortController.signal.aborted || this.modules.get(id) !== module.definition) {
        throw new Error("The module was unregistered while loading.");
      }
      await runtime.mount(container, {
        moduleId: id,
        route,
        signal: abortController.signal,
        sdkVersion: this.sdkVersion,
        assets: module.definition.assets ?? [],
        capabilities: module.definition.capabilities ?? [],
        permissions: module.definition.permissions ?? [],
      });
      if (abortController.signal.aborted || this.modules.get(id) !== module.definition) {
        throw new Error("The module was unregistered while mounting.");
      }
      this.active.set(id, { runtime, abortController, container });
    } catch (error) {
      abortController.abort();
      try { await runtime?.unmount?.(); } catch { /* partial module cleanup is isolated */ }
      container.replaceChildren();
      throw new ModuleRegistryError(`Module ${id} failed to mount: ${safeError(error)}`);
    } finally {
      this.mounting.delete(id);
    }
  }

  async unmount(id: string): Promise<boolean> {
    this.mounting.get(id)?.abort();
    const pendingCleanup = this.unmounting.get(id);
    if (pendingCleanup) {
      await pendingCleanup;
      return this.modules.has(id);
    }
    const mount = this.active.get(id);
    if (!mount) return this.modules.has(id);
    this.active.delete(id);
    mount.abortController.abort();
    const cleanup = Promise.resolve().then(async () => {
      try {
        await mount.runtime.unmount?.();
      } catch {
        // Cleanup failures are isolated from the shell and other modules.
      } finally {
        mount.container.replaceChildren();
      }
    });
    this.unmounting.set(id, cleanup);
    try { await cleanup; } finally { if (this.unmounting.get(id) === cleanup) this.unmounting.delete(id); }
    return true;
  }

  async unregister(id: string): Promise<boolean> {
    await this.unmount(id);
    const definition = this.modules.get(id);
    if (!definition) return false;
    this.modules.delete(id);
    if (definition.radialSlot !== undefined) this.slots.delete(definition.radialSlot);
    return true;
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? "erro do adapter" : "falha não detalhada do adapter";
}
