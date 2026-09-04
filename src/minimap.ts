export type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type MinimapStructuralClass = 'house' | 'garage' | 'perimeter' | 'road' | 'vehicle';
export type MinimapSurfaceDescriptor = Readonly<{
  id: string;
  name: string;
  bounds: MinimapBounds;
  /** Authoring may pin a class; absent means the name table/override must decide. */
  minimapClass?: MinimapStructuralClass;
}>;
export type MinimapHouseDescriptor = Readonly<{
  id: string;
  origin: Readonly<{ x: number; z: number }>;
  dimensions: Readonly<{ width: number; depth: number }>;
  team?: number;
}>;
export type MinimapPhysicalCoverDescriptor = Readonly<{
  id: string;
  bounds: MinimapBounds;
  minimapClass?: MinimapStructuralClass;
}>;
export type MinimapElement = Readonly<{
  id: string;
  className: MinimapStructuralClass;
  bounds: MinimapBounds;
  sourceCount: number;
}>;

type MinimapClassRule = Readonly<{
  name: string;
  className: MinimapStructuralClass;
  pattern: RegExp;
}>;

/**
 * The shared name rules are deliberately narrow. A surface is hidden unless it
 * is a recognizable macro silhouette; words such as prop, trim, rail, window,
 * decal and furniture never grant minimap visibility by themselves.
 */
export const MINIMAP_CLASS_TABLE: readonly MinimapClassRule[] = Object.freeze([
  Object.freeze({ name: 'vehicle-body', className: 'vehicle', pattern: /\b(?:vehicle|bus|coach|truck|car)\s+(?:body|cab|box|hull)\b/iu }),
  Object.freeze({ name: 'road-surface', className: 'road', pattern: /\b(?:road|asphalt|tarmac|carriageway|turning head)\b|\bstreet\s+(?:asphalt|road|surface|turning|kerb)\b/iu }),
  Object.freeze({ name: 'perimeter', className: 'perimeter', pattern: /\b(?:perimeter|compound|boundary)\s+(?:wall|fence)\b/iu }),
  Object.freeze({ name: 'garage', className: 'garage', pattern: /\bgarage\s+(?:floor|roof|wall|link pier|front pier|back pier|door head)\b/iu }),
  Object.freeze({ name: 'house-footprint', className: 'house', pattern: /\bhouse\s+(?:floor|roof deck|wall|front pier|upper front pier|back pier|upper back pier)\b/iu }),
]);

export type MinimapArenaOverride = Readonly<{
  rules: readonly MinimapClassRule[];
  exclusive?: boolean;
  group?: (surface: MinimapSurfaceDescriptor, className: MinimapStructuralClass) => string | undefined;
}>;

/**
 * Hooks are data-owned by the arena, not a second renderer roster. Nuke Town's
 * detailed authoring names need a bounded allow-list so a house's furniture,
 * trim and dressing remain hidden while its footprint survives.
 */
export const MINIMAP_ARENA_OVERRIDES: Readonly<Record<string, MinimapArenaOverride>> = Object.freeze({
  'atomic-acres': Object.freeze({
    exclusive: true,
    rules: Object.freeze([
      Object.freeze({ name: 'atomic-acres-road', className: 'road', pattern: /^atomic-acres-road$/iu }),
    ]),
  }),
  nuketown2: Object.freeze({
    exclusive: true,
    rules: Object.freeze([
      Object.freeze({ name: 'nuketown2-house-footprint', className: 'house', pattern: /^nuketown2 (?:north|south) house (?:floor|roof deck|wall\b|front pier\b|upper front pier\b|back pier\b|upper back pier\b)/iu }),
      Object.freeze({ name: 'nuketown2-garage-footprint', className: 'garage', pattern: /^nuketown2 (?:north|south) garage (?:floor|roof|wall\b|link pier\b|front pier\b|back pier\b|door head\b)/iu }),
      Object.freeze({ name: 'nuketown2-road', className: 'road', pattern: /^nuketown2 (?:north |south )?street (?:asphalt|turning head|kerb)/iu }),
      Object.freeze({ name: 'nuketown2-perimeter', className: 'perimeter', pattern: /^nuketown2 (?:north|south) perimeter wall/iu }),
      Object.freeze({ name: 'nuketown2-vehicle', className: 'vehicle', pattern: /^nuketown2 (?:street-vehicle (?:truck (?:cab|deck|box)|coach body|head car body)|(?:north|south) car body)/iu }),
    ]),
    group: (surface: MinimapSurfaceDescriptor, className: MinimapStructuralClass) => {
      if (className === 'road') return 'road';
      if (className === 'perimeter') return 'perimeter';
      const side = /\bnorth\b/iu.test(surface.name) ? 'north' : /\bsouth\b/iu.test(surface.name) ? 'south' : undefined;
      if (className === 'house' || className === 'garage') return `${className}:${side ?? 'unknown'}`;
      if (className === 'vehicle') {
        if (/\bcoach\b/iu.test(surface.name)) return 'vehicle:coach';
        if (/\btruck\b/iu.test(surface.name)) return 'vehicle:truck';
        if (/\bhead car\b/iu.test(surface.name)) return 'vehicle:head-car';
        if (side) return `vehicle:${side}-car`;
      }
      return undefined;
    },
  }),
});

export const MINIMAP_MIN_SEGMENT_PX = 2;

function unionBounds(a: MinimapBounds, b: MinimapBounds): MinimapBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function classifyMinimapSurface(
  arenaId: string,
  surface: MinimapSurfaceDescriptor,
  override: MinimapArenaOverride | undefined = MINIMAP_ARENA_OVERRIDES[arenaId],
): MinimapStructuralClass | null {
  if (surface.minimapClass) return surface.minimapClass;
  for (const rule of override?.rules ?? []) if (rule.pattern.test(surface.name)) return rule.className;
  if (override?.exclusive) return null;
  for (const rule of MINIMAP_CLASS_TABLE) if (rule.pattern.test(surface.name)) return rule.className;
  return null;
}

function minimapGroup(
  surface: MinimapSurfaceDescriptor,
  className: MinimapStructuralClass,
  override: MinimapArenaOverride | undefined,
): string {
  return override?.group?.(surface, className) ?? `${className}:${surface.id}`;
}

/**
 * Builds only macro map silhouettes. Grouping is the semantic merge pass: all
 * authored pieces of one house/garage/vehicle become one footprint, and the
 * final pixel fence drops remnants that cannot be read at the HUD resolution.
 */
export function buildMinimapStructuralElements(input: Readonly<{
  arenaId: string;
  bounds: MinimapBounds;
  width: number;
  height: number;
  houses?: readonly MinimapHouseDescriptor[];
  physicalCover?: readonly MinimapPhysicalCoverDescriptor[];
  surfaces?: readonly MinimapSurfaceDescriptor[];
  minSegmentPx?: number;
  override?: MinimapArenaOverride;
}>): readonly MinimapElement[] {
  const override = input.override ?? MINIMAP_ARENA_OVERRIDES[input.arenaId];
  const grouped = new Map<string, MinimapElement>();
  const add = (id: string, className: MinimapStructuralClass, bounds: MinimapBounds, group: string): void => {
    const previous = grouped.get(group);
    grouped.set(group, previous
      ? { ...previous, bounds: unionBounds(previous.bounds, bounds), sourceCount: previous.sourceCount + 1 }
      : { id, className, bounds, sourceCount: 1 });
  };

  for (const [index, house] of (input.houses ?? []).entries()) {
    add(house.id || `house-${index}`, 'house', {
      minX: house.origin.x - house.dimensions.width / 2,
      maxX: house.origin.x + house.dimensions.width / 2,
      minZ: house.origin.z - house.dimensions.depth / 2,
      maxZ: house.origin.z + house.dimensions.depth / 2,
    }, `house:${house.id || index}`);
  }
  for (const cover of input.physicalCover ?? []) {
    const className = cover.minimapClass ?? (/\b(?:bus|coach|truck|car|vehicle)\b/iu.test(cover.id) ? 'vehicle' : null);
    if (className) {
      const descriptor = { id: cover.id, name: cover.id, bounds: cover.bounds };
      add(cover.id, className, cover.bounds, minimapGroup(descriptor, className, override));
    }
  }
  for (const surface of input.surfaces ?? []) {
    const className = classifyMinimapSurface(input.arenaId, surface, override);
    if (!className) continue;
    add(surface.id, className, surface.bounds, minimapGroup(surface, className, override));
  }

  const minSegmentPx = input.minSegmentPx ?? MINIMAP_MIN_SEGMENT_PX;
  return Object.freeze([...grouped.values()]
    .filter((element) => {
      const widthPx = ((element.bounds.maxX - element.bounds.minX) / Math.max(0.001, input.bounds.maxX - input.bounds.minX)) * input.width;
      const heightPx = ((element.bounds.maxZ - element.bounds.minZ) / Math.max(0.001, input.bounds.maxZ - input.bounds.minZ)) * input.height;
      return Math.max(widthPx, heightPx) >= minSegmentPx;
    })
    .sort((a, b) => a.id.localeCompare(b.id)));
}

export type MinimapLandmarkKind =
  | 'bus'
  | 'cargo-stack'
  | 'pipe-stack'
  | 'service-skip'
  | 'generator-trailer'
  | 'jetliner'
  | 'terminal'
  | 'fuel';

export function minimapLandmarkLabel(kind: MinimapLandmarkKind): 'BUS' | 'CRGO' | 'PIPE' | 'SKIP' | 'GEN' | 'JET' | 'TERM' | 'FUEL' {
  if (kind === 'cargo-stack') return 'CRGO';
  if (kind === 'pipe-stack') return 'PIPE';
  if (kind === 'service-skip') return 'SKIP';
  if (kind === 'generator-trailer') return 'GEN';
  if (kind === 'jetliner') return 'JET';
  if (kind === 'terminal') return 'TERM';
  if (kind === 'fuel') return 'FUEL';
  return 'BUS';
}

export type MinimapLandmarkFootprint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function physicalCoverMinimapKind(
  id: string,
  performanceVisualKind?: Exclude<MinimapLandmarkKind, 'bus'>,
): MinimapLandmarkKind | null {
  if (performanceVisualKind) return performanceVisualKind;
  if (id.endsWith('-bus')) return 'bus';
  if (id.includes('jetliner')) return 'jetliner';
  if (id.includes('terminal')) return 'terminal';
  if (id.includes('fuel')) return 'fuel';
  if (id.includes('cargo-stack')) return 'cargo-stack';
  return null;
}

export function worldToMinimap(
  x: number,
  z: number,
  bounds: MinimapBounds,
  width: number,
  height: number,
): [number, number] {
  const normalizedX = Math.max(0, Math.min(1, (x - bounds.minX) / Math.max(0.001, bounds.maxX - bounds.minX)));
  const normalizedZ = Math.max(0, Math.min(1, (z - bounds.minZ) / Math.max(0.001, bounds.maxZ - bounds.minZ)));
  return [normalizedX * width, height - normalizedZ * height];
}

export function minimapLandmarkFootprint(
  landmarkBounds: MinimapBounds,
  arenaBounds: MinimapBounds,
  width: number,
  height: number,
): MinimapLandmarkFootprint {
  const [left, top] = worldToMinimap(landmarkBounds.minX, landmarkBounds.maxZ, arenaBounds, width, height);
  const [right, bottom] = worldToMinimap(landmarkBounds.maxX, landmarkBounds.minZ, arenaBounds, width, height);
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function shouldRevealEnemy(distance: number, now: number, lastShotAt: number): boolean {
  return distance <= 15 || (lastShotAt > 0 && now - lastShotAt <= 3_000);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function minimapToWorld(
  x: number,
  y: number,
  bounds: MinimapBounds,
  width: number,
  height: number,
): { x: number; z: number } {
  const normalizedX = clamp01(x / Math.max(1, width));
  const normalizedY = clamp01(y / Math.max(1, height));
  return {
    x: bounds.minX + normalizedX * (bounds.maxX - bounds.minX),
    z: bounds.maxZ - normalizedY * (bounds.maxZ - bounds.minZ),
  };
}

/** Tri-Pass uses the same left/right handedness as the player HUD minimap. */
export function worldToTacticalMap(
  x: number,
  z: number,
  bounds: MinimapBounds,
  width: number,
  height: number,
): [number, number] {
  const [mapX, mapY] = worldToMinimap(x, z, bounds, width, height);
  return [width - mapX, mapY];
}

export function tacticalMapToWorld(
  x: number,
  y: number,
  bounds: MinimapBounds,
  width: number,
  height: number,
): { x: number; z: number } {
  return minimapToWorld(width - x, y, bounds, width, height);
}

export type FacingGeometry = {
  nose: [number, number];
  tail: [number, number];
  left: [number, number];
  right: [number, number];
  coneLeft: [number, number];
  coneRight: [number, number];
};

export function playerFacingGeometry(x: number, y: number, yaw: number, length = 22, width = 9): FacingGeometry {
  const forwardX = -Math.sin(yaw);
  const forwardY = Math.cos(yaw);
  const rightX = -forwardY;
  const rightY = forwardX;
  return {
    nose: [x + forwardX * length, y + forwardY * length],
    tail: [x - forwardX * length * 0.55, y - forwardY * length * 0.55],
    left: [x - forwardX * 3 - rightX * width, y - forwardY * 3 - rightY * width],
    right: [x - forwardX * 3 + rightX * width, y - forwardY * 3 + rightY * width],
    coneLeft: [x + forwardX * 38 - rightX * 18, y + forwardY * 38 - rightY * 18],
    coneRight: [x + forwardX * 38 + rightX * 18, y + forwardY * 38 + rightY * 18],
  };
}

export function headingDegrees(yaw: number): number {
  return Math.round(((((180 + (yaw * 180) / Math.PI) % 360) + 360) % 360));
}

/** Canvas rotation that keeps the player's camera-forward direction at the top of a player-centred minimap. */
export function playerUpRotationRadians(yaw: number): number {
  return ((Math.PI + yaw) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}

/**
 * Canvas' north-up map uses +X right and -Z up, while Three.js camera-right uses
 * the opposite handedness after yaw. A player-up map therefore needs this
 * horizontal reflection as well as rotation; rotation alone mirrors left/right.
 */
export function playerUpScaleX(): -1 {
  return -1;
}

/**
 * HF-399: closed form of the player-centred minimap transform the 2D context is
 * given every frame, which is exactly
 *
 *   translate(width / 2, height / 2)
 *   rotate(playerUpRotationRadians(yaw))
 *   scale(playerUpScaleX(), 1)
 *   translate(-playerX, -playerY)
 *
 * applied to a point already in minimap pixel space. Nuke Town's static
 * landmark layer is now painted once into an offscreen canvas and composited
 * under that transform, so the landmark LABELS - which must stay upright and
 * therefore cannot ride the rotated context - need the same mapping in scalar
 * form. Before HF-399 that mapping came free from `context.getTransform()
 * .transformPoint(new DOMPoint(x, y))`, once per landmark per frame.
 *
 * Exported (rather than inlined at the call site) so the algebra has an
 * automated guard: `src/minimap-player-view-transform.test.ts` checks it
 * against an independently composed affine matrix chain.
 */
export function minimapPlayerViewPoint(
  anchorX: number,
  anchorY: number,
  view: Readonly<{ width: number; height: number; playerX: number; playerY: number; rotation: number; scaleX: number }>,
): [number, number] {
  const dx = (anchorX - view.playerX) * view.scaleX;
  const dy = anchorY - view.playerY;
  const cos = Math.cos(view.rotation);
  const sin = Math.sin(view.rotation);
  return [
    view.width / 2 + dx * cos - dy * sin,
    view.height / 2 + dx * sin + dy * cos,
  ];
}

/** Screen-space offset where camera-forward is up and camera-right is right. */
export function playerRelativeMinimapOffset(dx: number, dz: number, yaw: number): [number, number] {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  return [
    dx * rightX + dz * rightZ,
    -(dx * forwardX + dz * forwardZ),
  ];
}

export function northMarkerPosition(yaw: number, width: number, height: number, inset = 24): [number, number] {
  const radius = Math.max(0, Math.min(width, height) / 2 - Math.max(0, inset));
  const [northX, northY] = playerRelativeMinimapOffset(0, 1, yaw);
  return [width / 2 + northX * radius, height / 2 + northY * radius];
}
