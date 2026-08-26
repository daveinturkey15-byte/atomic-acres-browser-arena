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
 *       2. Shore descent — the outer 4 m of beach now dips below the water
 *          level so walking seaward actually reaches swim depth (HF-358 swim
 *          state). The old profile clamped the whole beach to >= 0 while the
 *          swimmable registry water sat at -0.25/-0.3: the arena's ONLY swim
 *          water was physically unreachable on foot.
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

/** The one gameplay water level (registry-authoritative, see water-authoring). */
export const FARCRYSIS_WATER_LEVEL = FARCRYSIS_WATER.level;

/**
 * Physics-only fail-safe floor. Must sit below the deepest shore point
 * (~-3.98 m) so the safety plate never overrides the authored sea-floor ramp.
 */
export const FARCRYSIS_SAFETY_FLOOR_Y = -4.5;

/** Shore-descent profile constants (HF-360 deliberate change #2 above). */
export const FARCRYSIS_SHORE = Object.freeze({
  /** Edge distance (m from the arena boundary) where the seaward drop begins. */
  descentStartDist: 4,
  /** Metres of drop per metre walked toward the arena edge (45 degrees). */
  descentSlope: 1.0,
  /** Height where the descent joins the untouched beach shelf at dist=4. */
  joinHeight: 0.02,
} as const);

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

  // Shore descent: the outer band ramps 1:1 below the waterline so walking
  // seaward reaches swim-entry depth before the world boundary (HF-358).
  if (dist < FARCRYSIS_SHORE.descentStartDist) {
    return (dist - FARCRYSIS_SHORE.descentStartDist) * FARCRYSIS_SHORE.descentSlope
      + FARCRYSIS_SHORE.joinHeight;
  }
  // Beach shelf: flat near edges, rising toward center (adopted unchanged).
  if (dist < 10) return Math.max(0, dist * 0.03 - 0.1);
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
