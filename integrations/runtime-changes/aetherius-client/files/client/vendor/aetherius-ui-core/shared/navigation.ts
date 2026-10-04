import { NAVIGATION_CATALOG } from "./catalog";

export type NavigationState =
  | { kind: "gameplay" }
  | { kind: "radial"; selectedId: string | null }
  | { kind: "workspace"; moduleId: string; routeStack: string[] };

export type NavigationAction =
  | { type: "TAB" }
  | { type: "ESCAPE" }
  | { type: "OPEN"; moduleId: string; available: boolean }
  | { type: "HOVER"; moduleId: string | null }
  | { type: "NAVIGATE"; route: string }
  | { type: "BACK" }
  | { type: "CLOSE" };

export const INITIAL_NAVIGATION_STATE: NavigationState = Object.freeze({ kind: "gameplay" });

export function reduceNavigation(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case "TAB":
      if (state.kind === "gameplay") return { kind: "radial", selectedId: null };
      if (state.kind === "radial") return { kind: "gameplay" };
      return { kind: "radial", selectedId: state.moduleId };
    case "ESCAPE":
    case "BACK":
      if (state.kind !== "workspace") return state.kind === "radial" ? { kind: "gameplay" } : state;
      if (state.routeStack.length > 1) return { ...state, routeStack: state.routeStack.slice(0, -1) };
      return { kind: "radial", selectedId: state.moduleId };
    case "OPEN": {
      if (state.kind !== "radial" || !action.available || !isModuleId(action.moduleId)) return state;
      const descriptor = NAVIGATION_CATALOG.find((item) => item.id === action.moduleId);
      if (!descriptor) return state;
      return { kind: "workspace", moduleId: action.moduleId, routeStack: [descriptor.route] };
    }
    case "HOVER":
      return state.kind === "radial" ? { ...state, selectedId: action.moduleId } : state;
    case "NAVIGATE":
      if (state.kind !== "workspace" || !isSafeRoute(action.route) || !routeBelongsToModule(action.route, state.moduleId)) return state;
      return { ...state, routeStack: [...state.routeStack, normalizeRoute(action.route)] };
    case "CLOSE":
      return { kind: "gameplay" };
  }
}

export function isSafeRoute(route: string): boolean {
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//") || route.includes("\\")) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(route.split(/[?#]/, 1)[0]); } catch { return false; }
  return !decoded.startsWith("//") && !decoded.includes("\\") &&
    !decoded.split("/").some((part) => part === ".." || part === ".");
}

function normalizeRoute(route: string): string {
  const withoutQuery = route.split(/[?#]/, 1)[0] || "/";
  return withoutQuery.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function isModuleId(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/.test(value);
}

function routeBelongsToModule(route: string, moduleId: string): boolean {
  const root = NAVIGATION_CATALOG.find((item) => item.id === moduleId)?.route;
  if (!root) return false;
  const normalizedRoot = root.replace(/\/$/, "") || "/";
  return route === normalizedRoot || route.startsWith(`${normalizedRoot === "/" ? "" : normalizedRoot}/`);
}
