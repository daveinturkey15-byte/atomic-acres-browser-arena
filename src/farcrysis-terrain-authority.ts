/**
 * farcrysis-terrain-authority.ts — the ONE terrain-height truth for farcrysis.
 *
 * HF-360 audit: the arena carried THREE conflicting terrain-height models.
 * The rendered ground (farcrysis-art.ts buildInlineTerrain) sculpted rolling
 * hills up to ~2.2 m, farcrysis-vegetation.ts kept a phantom 3.5-8 m plateau
 * model from a deleted terrain module (leaving whole dressing layers floating
 * mid-air), and farcrysis-palms-enhanced.ts guessed a third profile — while
 * gameplay collision stood on a flat y=0 safety floor, so players sank chest
 * deep into every hill. This module is the single source of truth:
 *
 *   - `farcrysisTerrainHeight(x, z)` is the analytic surface. It is the LIVE
 *     interior profile adopted verbatim from farcrysis-art.ts (visuals do not
 *     move), with two deliberate, documented profile changes:
 *       1. Core pad — the research-station footprint (Chebyshev <= 7 m from
 *          origin, blended out to 10 m) is flattened to y=0 so the authored
 *          station walls/desk/catwalk sit on one coherent floor instead of a
 *          slope that buried the south wall and floated the north one.
 *       2. Shore descent (HF-393 reshape) — the outer seabed band leaves dry
 *          sand at the beach-shelf join height and descends on a gentle
 *          ~0.38 grade, so walking seaward WADES progressively deeper until
 *          the swim state engages. HF-358 first made the water reachable on
 *          foot with a 1:1 / 45-degree ramp over the outer 4 m; the owner
 *          played that as "you fall down into the water", so HF-393
 *          reshaped it into a shelved seabed (see FARCRYSIS_SHORE).
 *
 *   - `farcrysisTerrainPhysicsTiles()` compiles that surface into rotated
 *     Box2 plates for `physicsColliders` (the same physics-only channel the
 *     Atomic Acres ramps use in map.ts), so the Rapier capsule stands on the
 *     visual ground. Plates are tangent planes fitted adaptively until the
 *     surface error is within PLATE_FIT_TOLERANCE_M.
 *
 *   - `farcrysisBotGroundPlatforms()` compiles the same surface into the
 *     ArenaVerticalNavigation platform grid legacy-main's botElevationAt
 *     already consumes generically (the high-seas idiom), so bots track the
 *     ground without any engine change.
 *
 * Everything here is pure and seeded-deterministic: same inputs, same world,
 * on every peer. No Math.random anywhere.
 */

import type { Box2 } from './collision';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_WATER } from './water/water-authoring';
import { SWIM_TUNING } from './water/swim-state';

/** The one gameplay water level (registry-authoritative, see water-authoring). */
export const FARCRYSIS_WATER_LEVEL = FARCRYSIS_WATER.level;

/**
 * Physics-only fail-safe floor. Must sit below the deepest shore point
 * (~-3.98 m) so the safety plate never overrides the authored sea-floor ramp.
 */
export const FARCRYSIS_SAFETY_FLOOR_Y = -4.5;

/**
 * Shore-descent profile constants (HF-393 wade reshaping of the HF-360
 * change #2). The seabed leaves dry sand at `descentStartDist` from the
 * arena boundary at the old beach-shelf height (`joinHeight`), then descends
 * at a single gentle grade to swim-entry depth before the boundary wall:
 *
 *   ground(d) = joinHeight - shelfSlope * (descentStartDist - d)
 *
 * With the registry water level (-0.25) and the standing eye height this
 * gives: waterline crossing 8.8 m out, ~6.8 m of progressively deepening
 * wade (ankle -> knee -> waist -> chest), then the swim state engages about
 * 2 m before the boundary. The pre-HF-393 profile dropped 1:1 (45 degrees)
 * over the outer 4 m, which played as "you fall down into the water".
 */
export const FARCRYSIS_SHORE = Object.freeze({
  /** Edge distance (m from the arena boundary) where the seabed leaves dry sand. */
  descentStartDist: 10,
  /** Seabed height at descentStartDist — continuous with the beach shelf join. */
  joinHeight: 0.2,
  /** Metres of drop per metre walked seaward (~21 degrees). */
  shelfSlope: 0.38,
  /** Edge distance where the shelf stops and the outer drop begins. */
  outerDropDist: 1.5,
  /** Seabed height at the arena boundary face (safety floor stays below it). */
  edgeHeight: -3.98,
} as const);

/**
 * HF-393 progressive wade slowdown. While the player stands in swimmable
 * water but the swim state has NOT engaged yet, the movement loop multiplies
 * this into player speed so deepening water physically resists before
 * swimming takes over. The curve is pinned at BOTH ends: no effect in dry or
 * ankle-deep water, and exactly `SWIM_TUNING.swimSpeedScale` at the swim
 * state's enter depth — so engaging swim cannot step the player's speed.
 *
 * Pure and host-authoritative like every movement modifier; depth over eye
 * uses the same convention as legacy-main's stepSwimState feed
 * (surfaceY - player.position.y). WIRED status: see the movement-loop patch
 * referenced in the HF-393 ledger row.
 */
export const FARCRYSIS_WADE_TUNING = Object.freeze({
  /** Eye depth where wading resistance begins (about ankle-deep). */
  startDepth: 0.25,
  /** Eye depth where wading has slowed all the way to swim speed. */
  fullDepth: SWIM_TUNING.enterDepth,
} as const);

export function farcrysisWadeSpeedScale(depthOverEye: number): number {
  const span = FARCRYSIS_WADE_TUNING.fullDepth - FARCRYSIS_WADE_TUNING.startDepth;
  const t = Math.min(1, Math.max(0, (depthOverEye - FARCRYSIS_WADE_TUNING.startDepth) / span));
  return 1 - t * (1 - SWIM_TUNING.swimSpeedScale);
}

/** Core-pad blend radii (Chebyshev metres from origin; change #1 above). */
const CORE_PAD_INNER = 7;
const CORE_PAD_OUTER = 10;

const ARENA_HALF = FARCRYSIS_BOUNDS.maxX;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Analytic terrain height at (x, z) — the single source of truth.
 *
 * Every consumer (rendered terrain, vegetation seating, prop/collider
 * seating, physics plates, bot elevation platforms) must resolve ground
 * height through this function and nothing else.
 */
export function farcrysisTerrainHeight(x: number, z: number): number {
  const chebyshev = Math.max(Math.abs(x), Math.abs(z));
  const dist = ARENA_HALF - chebyshev;

  // HF-393 wade shelf: the outer band leaves dry sand at the old shelf join
  // height and descends at one gentle grade, so walking seaward wades
  // progressively deeper (ankle -> knee -> waist -> chest) until the
  // host-authoritative swim state engages — instead of dropping down a 1:1
  // chute. Inside `outerDropDist` the seabed steepens to the boundary face;
  // that band is past swim-entry depth and underwater.
  if (dist < FARCRYSIS_SHORE.descentStartDist) {
    if (dist >= FARCRYSIS_SHORE.outerDropDist) {
      return FARCRYSIS_SHORE.joinHeight
        - FARCRYSIS_SHORE.shelfSlope * (FARCRYSIS_SHORE.descentStartDist - dist);
    }
    const t = dist / FARCRYSIS_SHORE.outerDropDist;
    const shelfEnd = FARCRYSIS_SHORE.joinHeight
      - FARCRYSIS_SHORE.shelfSlope * (FARCRYSIS_SHORE.descentStartDist - FARCRYSIS_SHORE.outerDropDist);
    return FARCRYSIS_SHORE.edgeHeight + (shelfEnd - FARCRYSIS_SHORE.edgeHeight) * t;
  }
  // Jungle interior: gentle rolling hills (adopted unchanged).
  const h = Math.sin(x * 0.12) * Math.cos(z * 0.15) * 1.2
    + Math.sin(x * 0.25 + 1.3) * Math.cos(z * 0.22 + 2.1) * 0.6
    + Math.sin(z * 0.18 - 0.7) * 0.4;
  const interior = Math.max(-0.05, h + 0.1);
  // Core pad: fade the hills to a flat y=0 station floor so the authored
  // research-station structure stands on one level.
  if (chebyshev < CORE_PAD_OUTER) {
    return interior * smoothstep(CORE_PAD_INNER, CORE_PAD_OUTER, chebyshev);
  }
  return interior;
}

// ---------------------------------------------------------------------------
// Physics plates — rotated Box2 tangent planes for the Rapier capsule
// ---------------------------------------------------------------------------

/**
 * Maximum |plate surface - analytic surface| accepted before a tile splits.
 * 0.12 m keeps the walking contract (capsule within +/-0.15 m of the visual
 * ground) and keeps plate-to-plate seams under the 0.42 m autostep height.
 */
export const PLATE_FIT_TOLERANCE_M = 0.12;

/** Plates never subdivide below this half-size (corner fold seams only). */
const PLATE_MIN_HALF_M = 0.2;

/** Plate slab thickness — thick enough that seams never open a gap. */
const PLATE_THICKNESS_M = 0.6;

export type TerrainPlate = Readonly<{
  /** Physics collider (rotation encodes the tangent plane). */
  box: Box2;
  /** Tile centre and the analytic height/gradient the plate was fitted to. */
  centreX: number;
  centreZ: number;
  groundY: number;
  gradientX: number;
  gradientZ: number;
}>;

function fitPlate(cx: number, cz: number, half: number): TerrainPlate & { maxError: number } {
  const eps = Math.min(0.25, half * 0.5);
  const groundY = farcrysisTerrainHeight(cx, cz);
  const gradientX = (farcrysisTerrainHeight(cx + eps, cz) - farcrysisTerrainHeight(cx - eps, cz)) / (2 * eps);
  const gradientZ = (farcrysisTerrainHeight(cx, cz + eps) - farcrysisTerrainHeight(cx, cz - eps)) / (2 * eps);

  let maxError = 0;
  for (let i = -2; i <= 2; i += 1) {
    for (let j = -2; j <= 2; j += 1) {
      const sx = cx + (i / 2) * half;
      const sz = cz + (j / 2) * half;
      const plane = groundY + gradientX * (sx - cx) + gradientZ * (sz - cz);
      const error = Math.abs(farcrysisTerrainHeight(sx, sz) - plane);
      if (error > maxError) maxError = error;
    }
  }

  // Euler XYZ (M = Rx * Rz here, y term zero) that maps local +Y onto the
  // tangent-plane normal (-gx, 1, -gz)/|..| — the same convention physics.ts
  // boxRotation and THREE.Quaternion.setFromEuler('XYZ') share.
  const alpha = -Math.atan(gradientZ);
  const gamma = Math.atan(gradientX * Math.cos(alpha));
  const normalY = 1 / Math.sqrt(1 + gradientX * gradientX + gradientZ * gradientZ);
  // Centre the slab so the rotated TOP FACE plane passes through groundY at
  // the tile centre: plane height at centre = centreY + (t/2)/normalY.
  const centreY = groundY - (PLATE_THICKNESS_M / 2) / normalY;
  const flat = Math.abs(gradientX) < 1e-4 && Math.abs(gradientZ) < 1e-4;

  const box: Box2 = {
    minX: cx - half,
    maxX: cx + half,
    minZ: cz - half,
    maxZ: cz + half,
    minY: centreY - PLATE_THICKNESS_M / 2,
    maxY: centreY + PLATE_THICKNESS_M / 2,
    ...(flat ? {} : { rotation: [alpha, 0, gamma] as [number, number, number] }),
  };
  return { box, centreX: cx, centreZ: cz, groundY, gradientX, gradientZ, maxError };
}

function emitPlates(cx: number, cz: number, half: number, out: TerrainPlate[]): void {
  const fitted = fitPlate(cx, cz, half);
  if (fitted.maxError <= PLATE_FIT_TOLERANCE_M || half <= PLATE_MIN_HALF_M) {
    const { maxError: _discarded, ...plate } = fitted;
    out.push(Object.freeze(plate));
    return;
  }
  const quarter = half / 2;
  emitPlates(cx - quarter, cz - quarter, quarter, out);
  emitPlates(cx + quarter, cz - quarter, quarter, out);
  emitPlates(cx - quarter, cz + quarter, quarter, out);
  emitPlates(cx + quarter, cz + quarter, quarter, out);
}

let plateCache: readonly TerrainPlate[] | null = null;

/**
 * Adaptive quadtree of tangent-plane plates covering the full arena. Pure and
 * deterministic; cached because the surface constants never change at runtime.
 * Consumed by buildFarcrysis into `physicsColliders` ONLY — never `colliders`
 * (line-of-sight, bot avoidance and spawn checks must not see 3k ground
 * plates), exactly how map.ts registers Atomic Acres ramps physics-only.
 */
export function farcrysisTerrainPhysicsTiles(): readonly TerrainPlate[] {
  if (plateCache) return plateCache;
  const out: TerrainPlate[] = [];
  const rootHalf = 2; // 4 m root tiles
  for (let cx = FARCRYSIS_BOUNDS.minX + rootHalf; cx < FARCRYSIS_BOUNDS.maxX; cx += rootHalf * 2) {
    for (let cz = FARCRYSIS_BOUNDS.minZ + rootHalf; cz < FARCRYSIS_BOUNDS.maxZ; cz += rootHalf * 2) {
      emitPlates(cx, cz, rootHalf, out);
    }
  }
  plateCache = Object.freeze(out);
  return plateCache;
}

// ---------------------------------------------------------------------------
// Bot elevation platforms — ArenaVerticalNavigation grid
// ---------------------------------------------------------------------------

export type BotGroundPlatform = Readonly<{
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}>;

let platformCache: readonly BotGroundPlatform[] | null = null;

/**
 * 1 m platform grid sampling the authority surface at each cell centre, for
 * `root.userData.verticalNavigation.platforms` (the high-seas idiom that
 * legacy-main botElevationAt already consumes). 1 m keeps neighbouring steps
 * under ~0.4 m so bot feet track the hills without large pops; a continuous
 * bot elevation sampler would need a legacy-main change and is out of scope.
 */
export function farcrysisBotGroundPlatforms(): readonly BotGroundPlatform[] {
  if (platformCache) return platformCache;
  const out: BotGroundPlatform[] = [];
  for (let x = FARCRYSIS_BOUNDS.minX; x < FARCRYSIS_BOUNDS.maxX; x += 1) {
    for (let z = FARCRYSIS_BOUNDS.minZ; z < FARCRYSIS_BOUNDS.maxZ; z += 1) {
      out.push(Object.freeze({
        id: `fc-ground-${x}-${z}`,
        minX: x,
        maxX: x + 1,
        minZ: z,
        maxZ: z + 1,
        y: farcrysisTerrainHeight(x + 0.5, z + 0.5),
      }));
    }
  }
  platformCache = Object.freeze(out);
  return platformCache;
}
