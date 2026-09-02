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

import { segmentBoxHitTime, type Box2, type Point3 } from './collision';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_WATER } from './water/water-authoring';
import { SWIM_TUNING, feetDepthFromEyeDepth } from './water/swim-state';

/** The one gameplay water level (registry-authoritative, see water-authoring). */
export const FARCRYSIS_WATER_LEVEL = FARCRYSIS_WATER.level;

/**
 * Physics-only fail-safe floor. Must sit below the deepest shore point
 * (~-3.98 m) so the safety plate never overrides the authored sea-floor ramp.
 */
export const FARCRYSIS_SAFETY_FLOOR_Y = -4.5;

/**
 * Shore-descent profile constants (HF-393 wade reshaping of the HF-360
 * change #2). The beach is built in two continuous stages:
 *
 *   1. APPROACH FLATTEN — across `approachDist` metres inland of
 *      `descentStartDist`, the rolling hills ease down onto the flat sandy
 *      shelf at `joinHeight` (smoothstep, zero slope at the seam). Without
 *      this the hills (up to ~2.2 m) met the old 0.2 m shelf as a cliff on
 *      every azimuth where they rode high — exactly the owner's "you fall
 *      down into the water".
 *   2. DESCENDING SHELF ENVELOPE — seaward of `descentStartDist` the ground
 *      is min(flattened interior, envelope), where
 *
 *         envelope(d) = joinHeight - shelfSlope * (descentStartDist - d)
 *
 *      Both fields are continuous and agree at the seam, so the shore band
 *      can never present a step: the player walks the flattened beach until
 *      the envelope drops beneath them, then WADES progressively deeper
 *      (ankle -> knee -> waist -> chest) until the host-authoritative swim
 *      state engages. Worst downhill grade anywhere is bounded by
 *      max(approach grade, ~0.38), which the every-azimuth walk test pins.
 *
 * Inside `outerDropDist` the seabed steepens to the boundary face
 * (`edgeHeight`); that band is past swim-entry depth and underwater.
 */
export const FARCRYSIS_SHORE = Object.freeze({
  /** Edge distance (m from the arena boundary) where the shelf envelope starts. */
  descentStartDist: 10,
  /** Beach-shelf height the approach flattens the hills down to. */
  joinHeight: 0.2,
  /** Metres of drop per metre walked seaward along the envelope (~21 degrees). */
  shelfSlope: 0.38,
  /** Inland width of the beach flattening that eases the hills to joinHeight. */
  approachDist: 12,
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
 * Pure and host-authoritative like every movement modifier. The ARGUMENT is
 * depth over the EYE, the same convention as legacy-main's stepSwimState feed
 * (surfaceY - player.position.y), because player.position IS the eye; the
 * TUNING is keyed to the water column over the FEET, and the conversion
 * happens once, here.
 *
 * PASS 81 BODY-REFERENCE CORRECTION (HF-393). These constants shipped
 * documented as "ankle-deep" while being compared against depth over the eye,
 * and EYE_ABOVE_FEET_M is 1.70 m — so resistance did not begin until the
 * player's head was 0.25 m UNDER water. Measured on the x=0 centreline before
 * the fix: the scale was still exactly 1.000 at knee (z=56.51), waist
 * (z=57.82) and chest (z=58.74) depth, and 5.13 m of the 6.84 m walk-in
 * happened at full dry-land speed. Keying to feet depth is what makes the
 * wade something the player feels rather than something the constants claim.
 *
 * WIRED: legacy-main.ts updatePhysics multiplies this into BOTH horizontal
 * speed channels while the water is swimmable and the swim state has not
 * engaged (import at legacy-main.ts:63, call site in the swim block of
 * updatePhysics); pinned by the wiring guard in
 * farcrysis-terrain-authority.test.ts.
 */
export const FARCRYSIS_WADE_TUNING = Object.freeze({
  /** Water column over the FEET where wading resistance begins (ankle-deep). */
  startDepth: 0.25,
  /** Column over the FEET where wading has slowed all the way to swim speed. */
  fullDepth: SWIM_TUNING.enterDepth,
} as const);

/**
 * @param depthOverEye `surfaceY - player.position.y` — what the movement loop
 * measures. Converted to feet depth internally; do NOT pre-convert.
 */
export function farcrysisWadeSpeedScale(depthOverEye: number): number {
  const depthOverFeet = feetDepthFromEyeDepth(depthOverEye);
  const span = FARCRYSIS_WADE_TUNING.fullDepth - FARCRYSIS_WADE_TUNING.startDepth;
  const t = Math.min(1, Math.max(0, (depthOverFeet - FARCRYSIS_WADE_TUNING.startDepth) / span));
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
 * HF-398 interior highland relief ("more jungle like", cadle.gg horizon bar).
 * A ring of three uneven jungle massifs rises inland of the coastal plain,
 * breaking cross-map sightlines and giving the island a skyline against the
 * lagoon. Design bounds, all re-measured after authoring:
 *   - COASTAL GATE: relief is exactly 0 across the ENTIRE HF-393 shore blend
 *     band (dist <= descentStartDist + approachDist = 22), so every
 *     seaward-walk contract (step <= autostep, grade <= 0.6, wade span >= 4)
 *     sees the same profile that passed before the relief existed — by
 *     construction, still pinned by the every-azimuth walk test;
 *   - PAD GATE: a second opposed gate eases relief out of the research-station
 *     core pad over a wide band, so the pad's own blend never crushes full
 *     amplitude into a cliff around the station footprint;
 *   - GRADE: worst combined gradient re-measured after the HF-398 elevation
 *     raise (see the probe receipt in the lane report); it must stay inside
 *     the controller's 50-degree climb limit (grade 1.19); the steep jungle
 *     flanks sit above grass MAX_SLOPE and read as rocky slopes;
 *   - PLATES: physics plate count re-measured inside the <8000 budget guard.
 */
const HIGHLAND_AMP_M = 8.0;
/** Distance inland where the coastal plain ends and relief may begin. */
const HIGHLAND_SHORE_CLEAR_M =
  FARCRYSIS_SHORE.descentStartDist + FARCRYSIS_SHORE.approachDist;
/** Distance inland where the shore gate stops attenuating. */
const HIGHLAND_SHORE_FULL_M = 34;
/** Chebyshev distance where relief clears the research-station pad blend. */
const HIGHLAND_PAD_CLEAR_M = 12;
/** Chebyshev distance where the pad gate stops attenuating. */
const HIGHLAND_PAD_FULL_M = 26;

function highlandRelief(x: number, z: number): number {
  const chebyshev = Math.max(Math.abs(x), Math.abs(z));
  const dist = ARENA_HALF - chebyshev;
  // Two opposed radial gates bound the massifs to an inland ring:
  //   - shore gate: exactly 0 across the whole HF-393 shore blend band
  //     (dist <= 22), so every seaward-walk contract sees the pre-relief
  //     profile inside the probed band — pinned by the every-azimuth test;
  //   - pad gate: eases relief out of the research-station core pad over a
  //     WIDE 14 m band, because the pad's own 3 m blend crushing full
  //     amplitude would present ~3 grade cliffs around the station.
  // Radially the gates oppose each other, so their gradients never sum.
  const inland = smoothstep(HIGHLAND_SHORE_CLEAR_M, HIGHLAND_SHORE_FULL_M, dist);
  const offPad = smoothstep(HIGHLAND_PAD_CLEAR_M, HIGHLAND_PAD_FULL_M, chebyshev);
  // Three uneven angular lobes so the ring reads as separate massifs...
  const lobes = 0.66 + 0.34 * Math.sin(Math.atan2(z, x) * 3 + 0.9);
  // ...with knoll texture so ridge lines are never straight walls.
  const knolls = 0.78 + 0.22 * Math.sin(x * 0.17 + 0.9) * Math.cos(z * 0.15 - 1.4);
  return HIGHLAND_AMP_M * inland * offPad * lobes * knolls;
}


/**
 * Interior jungle profile: gentle rolling hills, flattened to a y=0 pad
 * across the research-station footprint (Chebyshev <= 7 m, blended to 10 m),
 * then eased down onto the beach shelf across FARCRYSIS_SHORE.approachDist.
 * The flatten is what makes the shore envelope's `joinHeight` start at or
 * above local ground level on every azimuth — without it, hills riding above
 * joinHeight met the descending shelf as a cliff (HF-393).
 */
function interiorHeight(x: number, z: number, chebyshev: number, dist: number): number {
  const h = Math.sin(x * 0.12) * Math.cos(z * 0.15) * 1.2
    + Math.sin(x * 0.25 + 1.3) * Math.cos(z * 0.22 + 2.1) * 0.6
    + Math.sin(z * 0.18 - 0.7) * 0.4;
  const hills = Math.max(-0.05, h + 0.1 + highlandRelief(x, z));
  const padded = chebyshev < CORE_PAD_OUTER
    ? hills * smoothstep(CORE_PAD_INNER, CORE_PAD_OUTER, chebyshev)
    : hills;
  const shore = FARCRYSIS_SHORE;
  return shore.joinHeight
    + (padded - shore.joinHeight)
      * smoothstep(shore.descentStartDist, shore.descentStartDist + shore.approachDist, dist);
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

  // HF-393 wade shelf: seaward of descentStartDist the ground is
  // min(flattened interior, descending envelope). Both fields are continuous
  // and agree at the seam, so the beach presents no step at ANY azimuth —
  // the player walks the flattened sand until the envelope passes beneath
  // them and then wades progressively deeper (ankle -> knee -> waist ->
  // chest) until the host-authoritative swim state engages.
  if (dist < FARCRYSIS_SHORE.descentStartDist) {
    const interior = interiorHeight(x, z, chebyshev, dist);
    if (dist >= FARCRYSIS_SHORE.outerDropDist) {
      const envelope = FARCRYSIS_SHORE.joinHeight
        - FARCRYSIS_SHORE.shelfSlope * (FARCRYSIS_SHORE.descentStartDist - dist);
      return Math.min(interior, envelope);
    }
    // Outer drop: steepen from the envelope height at outerDropDist down to
    // the boundary face. Always far below the interior floor, so this branch
    // needs no interior comparison; it is underwater past swim entry.
    const t = dist / FARCRYSIS_SHORE.outerDropDist;
    const shelfEnd = FARCRYSIS_SHORE.joinHeight
      - FARCRYSIS_SHORE.shelfSlope * (FARCRYSIS_SHORE.descentStartDist - FARCRYSIS_SHORE.outerDropDist);
    return FARCRYSIS_SHORE.edgeHeight + (shelfEnd - FARCRYSIS_SHORE.edgeHeight) * t;
  }
  return interiorHeight(x, z, chebyshev, dist);
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

// ---------------------------------------------------------------------------
// Floor probe — what HF-402's `floorBeneath` cannot see on this arena
// ---------------------------------------------------------------------------

/**
 * The gap between a standing player's FEET and the terrain plate beneath them,
 * or null when no plate is within reach. Positive = the surface is below the
 * feet; negative = the feet are inside it, up to autostep.
 *
 * PASS 85 Lane R. `floorBeneath` in src/spawn-layout-constraints.ts finds a
 * floor from a downward ray against `raycastMeshes`, an axis-aligned collider
 * top, or the physics fail-safe floor — and skips any box carrying a
 * `rotation`. farcrysis has none of the three under the player: the visual
 * terrain is presentation-only and deliberately absent from `raycastMeshes`,
 * the fail-safe floor is 4.5 m down, and the ground IS 5,474 rotated
 * tangent-plane slabs from `farcrysisTerrainPhysicsTiles`. Measured with the
 * shipped rule: 7 of 1,244 dry 2 m cells on this island report a floor, all of
 * them prop tops. This probe answers the same question against the plates,
 * with the same segment and the same tolerances, so farcrysis instruments do
 * not have to wait on a change to a shared module.
 */
export function farcrysisFloorGapBeneath(
  eye: Point3,
  physicsColliders: readonly Box2[],
  eyeHeightM = 1.7,
  autostepM = 0.45,
  dropToleranceM = 0.6,
): number | null {
  const far = eyeHeightM + dropToleranceM + 0.01;
  const feetY = eye.y - eyeHeightM;
  const start = { x: eye.x, y: eye.y, z: eye.z };
  const end = { x: eye.x, y: eye.y - far, z: eye.z };
  let best: number | null = null;
  for (const box of physicsColliders) {
    if (box.maxY === undefined) continue;
    let surfaceY: number;
    if (box.rotation) {
      const time = segmentBoxHitTime(start, end, box, 0);
      if (time === null) continue;
      surfaceY = eye.y - time * far;
    } else {
      if (eye.x < box.minX || eye.x > box.maxX || eye.z < box.minZ || eye.z > box.maxZ) continue;
      surfaceY = box.maxY;
    }
    const gap = feetY - surfaceY;
    if (gap < -autostepM || gap > dropToleranceM) continue;
    if (best === null || Math.abs(gap) < Math.abs(best)) best = gap;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Terrain collision proxy — the ground this arena never registered for raycasts
// ---------------------------------------------------------------------------

/**
 * Chunks per axis. The proxy is split so THREE's per-mesh bounding-box test
 * rejects all but the one or two chunks a ray actually crosses; a single
 * 32k-triangle ground mesh would be walked in full on every hitscan.
 */
export const TERRAIN_PROXY_CHUNKS_PER_AXIS = 8;

/** Grid steps per chunk edge. 4 chunks x 32 steps over 128 m = a 1 m lattice. */
export const TERRAIN_PROXY_SEGMENTS_PER_CHUNK = 24;

export type TerrainProxyChunk = Readonly<{
  id: string;
  /** World-space triangle soup; the mesh sits at the origin untransformed. */
  positions: Float32Array;
  indices: Uint32Array;
  /** Tight world bounds, used verbatim as the chunk's BallisticSurface box. */
  bounds: Box2;
}>;

let proxyCache: readonly TerrainProxyChunk[] | null = null;

/**
 * A collision-only triangulation of `farcrysisTerrainHeight` over the arena.
 *
 * WHY THIS EXISTS. `floorBeneath` in src/spawn-layout-constraints.ts — the
 * shared HF-402 spawn-quality rule — accepts a floor from a downward ray
 * against `raycastMeshes`, from the top face of an AXIS-ALIGNED collider box,
 * or from the fail-safe floor. Every other shipped arena satisfies it the first
 * way: additional-maps.ts pushes its `ground` / `floor` / `tarmac` mesh into
 * `raycastMeshes`. farcrysis satisfied none of them — its ground is 5,474
 * ROTATED tangent-plane plates in `physicsColliders`, which that rule skips by
 * construction, and its sculpted terrain was presentation-only and absent from
 * `raycastMeshes`. MEASURED before this proxy existed, over the 3,136 dry 2 m
 * cells of the island (`scripts/qa/measure-farcrysis-floor-coverage.ts`): 202
 * cells reported a floor — 6.44 %, every one of them a prop top. So the arena
 * was the outlier, not the shared rule, and this closes it from the arena side
 * rather than by loosening a shared threshold.
 *
 * The same registration also makes the ground a shot blocker. It was not one:
 * the plates carry no `BallisticSurface`, so bullets passed through hillsides.
 *
 * RESOLUTION. 8 x 8 chunks of 24 steps is a 0.667 m lattice. MEASURED off-
 * lattice (mid-cell samples, where linear interpolation is worst) against the
 * analytic field: maximum 0.1086 m, mean 0.0028 m. That is inside the 0.12 m
 * `PLATE_FIT_TOLERANCE_M` the physics plates themselves are fitted to, and far
 * inside `floorBeneath`'s 0.45 m autostep and 0.6 m drop tolerances, so proxy
 * error cannot push the probe off a real floor. The coarser 4 x 32 layout
 * (same 32,768-triangle budget, a 1 m lattice) was measured first and rejected:
 * same per-ray cost, 0.3296 m maximum error.
 *
 * COST. MEASURED over 2,000 hitscan-shaped rays across the arena's full
 * `raycastMeshes` set: 0.024 ms/ray without the proxy, 0.293 ms/ray with it.
 * The chunking is what keeps that bounded - one 73,728-triangle ground mesh
 * would be walked in full on every shot. The hit rate over those same rays
 * rises 37.1 % -> 53.3 %: that difference is bullets which used to fly through
 * the island.
 */
export function farcrysisTerrainProxyChunks(): readonly TerrainProxyChunk[] {
  if (proxyCache) return proxyCache;
  const chunks: TerrainProxyChunk[] = [];
  const spanX = (FARCRYSIS_BOUNDS.maxX - FARCRYSIS_BOUNDS.minX) / TERRAIN_PROXY_CHUNKS_PER_AXIS;
  const spanZ = (FARCRYSIS_BOUNDS.maxZ - FARCRYSIS_BOUNDS.minZ) / TERRAIN_PROXY_CHUNKS_PER_AXIS;
  const steps = TERRAIN_PROXY_SEGMENTS_PER_CHUNK;
  const stepX = spanX / steps;
  const stepZ = spanZ / steps;

  for (let cx = 0; cx < TERRAIN_PROXY_CHUNKS_PER_AXIS; cx += 1) {
    for (let cz = 0; cz < TERRAIN_PROXY_CHUNKS_PER_AXIS; cz += 1) {
      const originX = FARCRYSIS_BOUNDS.minX + cx * spanX;
      const originZ = FARCRYSIS_BOUNDS.minZ + cz * spanZ;
      const positions = new Float32Array((steps + 1) * (steps + 1) * 3);
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let i = 0; i <= steps; i += 1) {
        for (let j = 0; j <= steps; j += 1) {
          // Sample on the shared lattice, not on a chunk-local offset, so the
          // seam vertices of neighbouring chunks are bit-identical and no ray
          // can slip between them.
          const x = originX + i * stepX;
          const z = originZ + j * stepZ;
          const y = farcrysisTerrainHeight(x, z);
          const base = (i * (steps + 1) + j) * 3;
          positions[base] = x;
          positions[base + 1] = y;
          positions[base + 2] = z;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const indices = new Uint32Array(steps * steps * 6);
      let cursor = 0;
      for (let i = 0; i < steps; i += 1) {
        for (let j = 0; j < steps; j += 1) {
          const a = i * (steps + 1) + j;
          const b = a + 1;
          const c = a + (steps + 1);
          const d = c + 1;
          // Counter-clockwise seen from +Y, so the face normals point UP and a
          // downward probe hits the FRONT face. The mirrored winding compiles
          // and renders identically (the mesh never renders) but every
          // `floorBeneath` ray passes straight through a FrontSide material.
          indices[cursor] = a;
          indices[cursor + 1] = b;
          indices[cursor + 2] = c;
          indices[cursor + 3] = b;
          indices[cursor + 4] = d;
          indices[cursor + 5] = c;
          cursor += 6;
        }
      }
      chunks.push(Object.freeze({
        id: `farcrysis-terrain-proxy-${cx}-${cz}`,
        positions,
        indices,
        bounds: Object.freeze({
          minX: originX,
          maxX: originX + spanX,
          minZ: originZ,
          maxZ: originZ + spanZ,
          minY,
          maxY,
        }) as Box2,
      }));
    }
  }
  proxyCache = Object.freeze(chunks);
  return proxyCache;
}
