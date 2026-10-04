export interface NavigationDescriptor {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly radialSlot: number;
  readonly iconFallback: string;
  readonly center?: boolean;
}

export const NAVIGATION_CATALOG: readonly NavigationDescriptor[] = Object.freeze([
  { id: "character", label: "PERSONAGEM", route: "/character", radialSlot: 0, iconFallback: "person", center: true },
  { id: "class", label: "CLASSE", route: "/class", radialSlot: 1, iconFallback: "class" },
  { id: "spells", label: "FEITIÇOS", route: "/spells", radialSlot: 2, iconFallback: "spells" },
  { id: "party", label: "GRUPO", route: "/party", radialSlot: 3, iconFallback: "party" },
  { id: "inventory", label: "INVENTÁRIO", route: "/inventory", radialSlot: 4, iconFallback: "inventory" },
  { id: "server", label: "SERVIDOR", route: "/server", radialSlot: 5, iconFallback: "server" },
  { id: "map", label: "MAPA", route: "/map", radialSlot: 6, iconFallback: "map" },
  { id: "professions", label: "PROFISSÕES", route: "/professions", radialSlot: 7, iconFallback: "professions" },
  { id: "supernatural", label: "SOBRENATURAL", route: "/supernatural", radialSlot: 8, iconFallback: "supernatural" },
  { id: "properties", label: "PROPRIEDADES", route: "/properties", radialSlot: 9, iconFallback: "properties" },
  { id: "house", label: "CASA", route: "/house", radialSlot: 10, iconFallback: "house" },
  { id: "shop", label: "LOJA", route: "/shop", radialSlot: 11, iconFallback: "module" },
].map((item) => Object.freeze(item)));

export const RADIAL_CATALOG = NAVIGATION_CATALOG.filter((item) => !item.center);

export function calculateRadialLayout(count: number, width: number, height: number) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count must be a positive integer");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("width and height must be positive finite values");
  }
  const step = (2 * Math.PI) / count;
  const radius = Math.min(width * 0.43, height * 0.40);
  const outerDiameter = Math.min(116, Math.max(68, Math.min(width, height) * 0.105));
  const centerDiameter = outerDiameter * 1.15;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * step;
    return {
      index,
      angle,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      outerDiameter,
      centerDiameter,
    };
  });
}
