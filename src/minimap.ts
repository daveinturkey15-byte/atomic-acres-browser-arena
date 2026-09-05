/** Footprint plus, where the arena authored it, the vertical extent the structural rule reads. */
export type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number; minY?: number; maxY?: number };

/**
 * HF-510 (owner, repeated from HF-491): "The mini map also still feels very
 * cluttered on Nuke Town ... and the same on all levels. We shouldn't have this
 * crazy busy mini map. It should be very simple. Just mainly showing where the
 * walls are, not all the tiny components within, like cover."
 *
 * THE MINIMAP THEREFORE DRAWS THREE STRUCTURAL CLASSES AND NOTHING ELSE:
 *
 *   - `building`  authored building footprints (`arena.houses`)
 *   - `wall`      structural blockers: walls, hangar shells, major boundaries
 *   - `road`      the drivable/walkable street or apron surface
 *
 * Everything else - cover, props, furniture, vehicles used as scenery,
 * vegetation, small colliders, interior fixtures - is excluded. Players, bots,
 * objectives and killstreak pings stay, but they are MARKERS painted after this
 * layer, never structural elements.
 *
 * WHY THE RULE IS GEOMETRIC AND NOT A NAME TABLE. HF-491 classified by authored
 * surface name. That worked on Nuke Town and silently produced an EMPTY minimap
 * on six of the eleven catalog arenas, because their authors never used the
 * blessed words - and it was never wired into the renderer at all, which is why
 * the owner still saw every collider rectangle on Nuke Town. A geometric rule
 * reads the same authored data the collision world already trusts, so a new
 * arena is classified correctly the day it is built, with no roster to update.
 */
export type MinimapStructuralClass = 'building' | 'wall' | 'road';

export type MinimapSurfaceDescriptor = Readonly<{
  id: string;
  name: string;
  bounds: MinimapBounds;
}>;
export type MinimapHouseDescriptor = Readonly<{
  id: string;
  origin: Readonly<{ x: number; z: number }>;
  dimensions: Readonly<{ width: number; depth: number }>;
}>;
export type MinimapElement = Readonly<{
  id: string;
  className: MinimapStructuralClass;
  bounds: MinimapBounds;
  /** How many authored pieces were merged into this silhouette. */
  sourceCount: number;
}>;

/**
 * A blocker is structural when a player reads it as a WALL rather than as
 * something to hide behind:
 *
 *   - it is at least chest-high, so waist-high cover, crates, planters,
 *     benches, bins, low fences and kerbs never qualify, and
 *   - its longer footprint side spans at least a room's width, so barrels,
 *     appliances, furniture, debris and interior fixtures never qualify.
 *
 * Both numbers are world metres, not minimap pixels, so a 192 m arena and a
 * 36 m arena classify the same physical wall identically. The pixel fence
 * (`MINIMAP_MIN_SEGMENT_PX`) is applied separately, after merging, purely for
 * readability at HUD size.
 */
export const MINIMAP_STRUCTURAL_MIN_HEIGHT_M = 1.6;
export const MINIMAP_STRUCTURAL_MIN_SPAN_M = 4;
/**
 * Authored walls arrive as many abutting segments. Segments whose footprints
 * touch or overlap within this slack are one silhouette, which is what turns a
 * house's wall boxes into one building outline.
 */
export const MINIMAP_STRUCTURAL_MERGE_EPSILON_M = 0.35;
export const MINIMAP_MIN_SEGMENT_PX = 2;

/**
 * PER-ARENA ELEMENT BUDGET.
 *
 * Derived, not guessed: `scripts/qa/minimap-structural-audit.mts` builds every
 * arena in the catalog roster and counts the merged structural silhouettes.
 * Measured 2026-09-05 on this head (256 px minimap):
 *
 *   nuketown2 13, raid2 14, atomic-acres 10, skyline-terminal 10,
 *   rustworks-1v1 24, gun-range 10, farcrysis 3, high-seas 18,
 *   test1 22, test2 27, map3 11
 *
 * The busiest arena is `test2` at 27, so the ceiling is 32: enough headroom for
 * an author to add a building without tripping the gate, and still an order of
 * magnitude below what these maps drew before HF-510 (test2 drew 307
 * rectangles, Nuke Town 359).
 */
export const MINIMAP_ELEMENT_CEILING = 32;

/**
 * The only name-driven rule left. Road/apron surfaces are flat, so geometry
 * alone cannot tell a carriageway from a lawn; the authored surface name can.
 * Kerbs are deliberately NOT matched - they are trim, and matching them put 36
 * slivers on Nuke Town's minimap.
 */
export const MINIMAP_ROAD_NAME_PATTERN = /\b(?:road|asphalt|tarmac|carriageway|turning head)\b/iu;
/** Road TRIM: kerbs, lane dashes, kerb islands and markings are not the surface. */
export const MINIMAP_ROAD_TRIM_PATTERN = /\b(?:kerb|curb|dash|island|marking|line)\b/iu;

function boundsSpanX(bounds: MinimapBounds): number { return bounds.maxX - bounds.minX; }
function boundsSpanZ(bounds: MinimapBounds): number { return bounds.maxZ - bounds.minZ; }

/** The documented source rule, exported so the per-arena budget test can quote it. */
export function isMinimapStructuralCollider(bounds: MinimapBounds): boolean {
  const height = Number.isFinite(bounds.maxY)
    ? (bounds.maxY as number) - (Number.isFinite(bounds.minY) ? (bounds.minY as number) : 0)
    : Number.POSITIVE_INFINITY;
  if (height < MINIMAP_STRUCTURAL_MIN_HEIGHT_M) return false;
  return Math.max(boundsSpanX(bounds), boundsSpanZ(bounds)) >= MINIMAP_STRUCTURAL_MIN_SPAN_M;
}

export function isMinimapRoadSurface(name: string): boolean {
  return MINIMAP_ROAD_NAME_PATTERN.test(name) && !MINIMAP_ROAD_TRIM_PATTERN.test(name);
}

/**
 * `arena.physicalCover` is the arena's own declaration that a piece exists to
 * be hidden behind. A cargo stack or a coach is big enough to pass the wall
 * rule on geometry alone, so cover is subtracted explicitly: a blocker whose
 * footprint sits inside an authored cover footprint is cover, whatever its
 * size. This is why the owner's "not ... cover" is enforced at the source
 * rather than by a renderer that decides what to skip.
 */
function containedIn(inner: MinimapBounds, outer: MinimapBounds, epsilon: number): boolean {
  return inner.minX >= outer.minX - epsilon && inner.maxX <= outer.maxX + epsilon
    && inner.minZ >= outer.minZ - epsilon && inner.maxZ <= outer.maxZ + epsilon;
}

function unionBounds(a: MinimapBounds, b: MinimapBounds): MinimapBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

function touches(a: MinimapBounds, b: MinimapBounds, epsilon: number): boolean {
  return a.minX - epsilon <= b.maxX && b.minX - epsilon <= a.maxX
    && a.minZ - epsilon <= b.maxZ && b.minZ - epsilon <= a.maxZ;
}

/** Merge every touching/overlapping footprint into one silhouette (union-find). */
function mergeFootprints(
  pieces: readonly MinimapBounds[],
  epsilon: number,
): Array<{ bounds: MinimapBounds; sourceCount: number }> {
  const parent = pieces.map((_, index) => index);
  const find = (index: number): number => {
    let node = index;
    while (parent[node] !== node) { parent[node] = parent[parent[node]!]!; node = parent[node]!; }
    return node;
  };
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      if (!touches(pieces[i]!, pieces[j]!, epsilon)) continue;
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent[rootI] = rootJ;
    }
  }
  const merged = new Map<number, { bounds: MinimapBounds; sourceCount: number }>();
  pieces.forEach((piece, index) => {
    const key = find(index);
    const previous = merged.get(key);
    merged.set(key, previous
      ? { bounds: unionBounds(previous.bounds, piece), sourceCount: previous.sourceCount + 1 }
      : { bounds: { minX: piece.minX, maxX: piece.maxX, minZ: piece.minZ, maxZ: piece.maxZ }, sourceCount: 1 });
  });
  return [...merged.values()];
}

/**
 * Builds the complete structural element set for one arena's minimap.
 *
 * Deterministic: elements are ordered by class, then by world position, then
 * numbered, so the same arena always yields the same ids and the per-arena
 * budget test can compare runs.
 */
export function buildMinimapStructuralElements(input: Readonly<{
  bounds: MinimapBounds;
  width: number;
  height: number;
  houses?: readonly MinimapHouseDescriptor[];
  colliders?: readonly MinimapBounds[];
  /** Authored cover footprints, subtracted from the structural set. */
  cover?: readonly MinimapBounds[];
  surfaces?: readonly MinimapSurfaceDescriptor[];
  minSegmentPx?: number;
}>): readonly MinimapElement[] {
  const epsilon = MINIMAP_STRUCTURAL_MERGE_EPSILON_M;
  const roadPieces = (input.surfaces ?? [])
    .filter((surface) => isMinimapRoadSurface(surface.name))
    .map((surface) => surface.bounds);
  const cover = input.cover ?? [];
  const wallPieces = (input.colliders ?? []).filter((collider) => isMinimapStructuralCollider(collider)
    && !cover.some((piece) => containedIn(collider, piece, epsilon)));
  const housePieces = (input.houses ?? []).map((house) => ({
    minX: house.origin.x - house.dimensions.width / 2,
    maxX: house.origin.x + house.dimensions.width / 2,
    minZ: house.origin.z - house.dimensions.depth / 2,
    maxZ: house.origin.z + house.dimensions.depth / 2,
  }));

  const minSegmentPx = input.minSegmentPx ?? MINIMAP_MIN_SEGMENT_PX;
  const arenaSpanX = Math.max(0.001, boundsSpanX(input.bounds));
  const arenaSpanZ = Math.max(0.001, boundsSpanZ(input.bounds));
  const readable = (bounds: MinimapBounds): boolean => Math.max(
    (boundsSpanX(bounds) / arenaSpanX) * input.width,
    (boundsSpanZ(bounds) / arenaSpanZ) * input.height,
  ) >= minSegmentPx;

  const elements: MinimapElement[] = [];
  const layers: ReadonlyArray<readonly [MinimapStructuralClass, readonly MinimapBounds[]]> = [
    ['road', roadPieces],
    ['building', housePieces],
    ['wall', wallPieces],
  ];
  for (const [className, pieces] of layers) {
    mergeFootprints(pieces, epsilon)
      .filter((group) => readable(group.bounds))
      .sort((a, b) => (a.bounds.minX - b.bounds.minX) || (a.bounds.minZ - b.bounds.minZ))
      .forEach((group, index) => elements.push(Object.freeze({
        id: className + '-' + String(index + 1).padStart(2, '0'),
        className,
        bounds: group.bounds,
        sourceCount: group.sourceCount,
      })));
  }
  return Object.freeze(elements);
}

export type MinimapLandmarkFootprint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
