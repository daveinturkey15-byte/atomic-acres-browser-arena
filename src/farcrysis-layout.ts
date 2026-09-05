/**
 * farcrysis-layout.ts — PASS 95 layout stage (SPEC.md §7, steps L2/L3/L5).
 *
 * WHAT THIS MODULE IS. The measured layout contract for the Farcrysis island,
 * in the shape the nuketown2 rebuild uses (`nuketown2-layout.ts`): the scale
 * anchors every proportion is read against, the three route loops the PASS 69
 * spec (§R3) describes as the map's rhythm, the sightline metric that decides
 * whether a mid-map mass has a job, and the derived-roster helpers the tests
 * and the receipt script share. It imports the arena's leaf constants, the
 * terrain authority and the shared collision maths — never `farcrysis.ts` —
 * so it can be consumed by both the builder and the tests without a cycle.
 *
 * WHY IT EXISTS. `docs/evidence/pass95/farcrysis-rebuild/SPEC.md` §4 row F:
 * the owner (2026-08-31) asked to "remove all the messy clutter in the middle
 * etc". §7 L2 turns that into one hard rule — *every mid-map mass either
 * blocks a sightline the metric says needs blocking, or it is not placed* —
 * and §7 L3 asks for the sightline and cover numbers to be re-measured with a
 * REAL occlusion test, because the PASS 74 audit found `farcrysis.test.ts`
 * asserting `maxSightline >= 0` against a "metric" that measured the distance
 * from a spawn to the far corner of a cover box (`farcrysisHITL`). That was
 * never a sightline. This module is the metric that replaces it.
 *
 * ORIGINALITY. Nothing here is measured off any external game. The route
 * loops and their proportions come from the repository's own PASS 69 spec and
 * the frozen brief; the scale anchors come from this codebase's own physics
 * and spawn-layout constants; the reference bar is real-world scale (a 1.7 m
 * eye, a 0.42 m step, a 5.2 m/s sprint).
 */

import { firstSegmentBoxHit, type Box2, type Point3 } from './collision';
import {
  FARCRYSIS_BOUNDS,
  FARCRYSIS_COVER_MIN,
  FARCRYSIS_MAX_SIGHTLINE,
  FARCRYSIS_PATROL_XZ,
  FARCRYSIS_SPAWNS_XZ,
} from './farcrysis-constants';
import {
  FARCRYSIS_SAFETY_FLOOR_Y,
  FARCRYSIS_SHORE,
  FARCRYSIS_WATER_LEVEL,
  farcrysisTerrainHeight,
} from './farcrysis-terrain-authority';
import { TSL_FOLIAGE_MAX_DISTINCT_GRAPHS } from './farcrysis-tsl-foliage';

// ---------------------------------------------------------------------------
// 1. Scale anchors — the numbers every layout distance is read against
// ---------------------------------------------------------------------------

/**
 * Every value is a DOCUMENTED COPY of a constant that lives elsewhere in the
 * repository, named here so a layout reviewer can read one table.
 * `farcrysis-layout.test.ts` cross-checks each copy against its source module
 * at test time, so a drift in the source reds this file rather than silently
 * re-scaling the map. (The sources are not imported directly because
 * `spawn-layout-constraints.ts` pulls in every arena builder and
 * `operator-posture-layer.ts` pulls in three — neither belongs under a leaf.)
 */
export const FARCRYSIS_SCALE = Object.freeze({
  /** `spawn-layout-constraints.ts` SPAWN_EYE_HEIGHT; `spawnRecord` in farcrysis.ts seats every spawn at ground + 1.7. */
  eyeHeightM: 1.7,
  /** `physics.ts` CHARACTER_PHYSICS_CONFIG.autostepHeight — the tallest riser a walk climbs without a jump. */
  autostepM: 0.42,
  /** `operator-posture-layer.ts` SPRINT_ENTER_MPS — the speed the route timings below are quoted at. */
  sprintMps: 5.2,
  /** `spawn-layout-constraints.ts` HARD_COVER_HEIGHT_M — the shortest box that counts as cover. */
  hardCoverM: 0.7,
  /** `spawn-layout-constraints.ts` VIEW_BLOCK_HEIGHT_M — a box this tall fills a standing view. */
  viewBlockM: 1.8,
  /** `spawn-layout-constraints.ts` SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM — cover-in-reach from a spawn. */
  spawnCoverReachM: 6,
  /**
   * The engagement band the layout is cut for: `FARCRYSIS_MAX_SIGHTLINE` (22 m)
   * is the longest straight line the PASS 69 spec §R5/C4 allows from any spawn
   * or patrol point. The hitscan resolvers in legacy-main.ts cap a shot at
   * 90-220 m depending on the path, so on this island every engagement is
   * range-limited by GEOMETRY, never by the weapon — which is the whole point
   * of the number.
   */
  engagementM: FARCRYSIS_MAX_SIGHTLINE,
  /** legacy-main.ts local/bot/world trace caps; the island is geometry-limited. */
  weaponRangeM: Object.freeze({
    localHitscan: 90,
    botHitscan: 110,
    worldTrace: 220,
    flamethrower: 18,
  }),
});

/** Terrain and water remain one authority, including the rectangular shore. */
export const FARCRYSIS_TERRAIN_WATER = Object.freeze({
  heightAuthority: 'farcrysisTerrainHeight(x, z)',
  safetyFloorY: FARCRYSIS_SAFETY_FLOOR_Y,
  waterLevelY: FARCRYSIS_WATER_LEVEL,
  dryFootprint: 'rectangular 55.5 m half-extent',
  shore: FARCRYSIS_SHORE,
});

/** The cover rhythm is a placement rule, not a decorative scatter count. */
export const FARCRYSIS_COVER_RHYTHM = Object.freeze({
  minimumPhysicalPieces: FARCRYSIS_COVER_MIN,
  spawnCoverReachM: FARCRYSIS_SCALE.spawnCoverReachM,
  bands: Object.freeze([
    Object.freeze({ id: 'beach-ring', register: 'wide gaps broken by palms, skiffs and rocks' }),
    Object.freeze({ id: 'jungle-band', register: 'cover-heavy chain with tight turns' }),
    Object.freeze({ id: 'core-loop', register: 'hard shell and interior cover at the vertical crossing' }),
  ]),
});

// ---------------------------------------------------------------------------
// 2. Playable bounds and the three loops (PASS 69 spec §R3, brief "Subject")
// ---------------------------------------------------------------------------

/** Half-extent of the square island; the single constant every ring derives from. */
export const FARCRYSIS_HALF_M = FARCRYSIS_BOUNDS.maxX;

/**
 * Chebyshev radius that separates "the middle" from the mid-jungle ring.
 * The research core occupies chebyshev <= 5.5 (its walls) and the four
 * HF-395 landmark frames sit on the diagonals at 26 m; their innermost
 * authored props (the approach-kit crate-b at local u = -4.7) come no closer
 * than chebyshev 23. Twenty metres therefore bounds every mass that is
 * neither the core nor a landmark — exactly the set the owner called
 * "the messy clutter in the middle". Pinned by `farcrysis-layout.test.ts`.
 */
export const FARCRYSIS_MIDDLE_RADIUS_M = 20;

/** One of the three overlaid loops the map rhythm is built from. */
export type FarcrysisLoop = Readonly<{
  id: 'beach-ring' | 'jungle-band' | 'core-loop';
  /** Chebyshev distance from the island centre the loop runs at (approximate for the core). */
  chebyshevM: number;
  /** Closed polyline, x/z, walked in order. */
  waypoints: ReadonlyArray<readonly [number, number]>;
  /** Design register from PASS 69 §R3 — quoted, not invented. */
  register: string;
  /** Clear corridor width reserved for this route, in player metres. */
  widthM: number;
  /** Nominal lap time at sprint, seconds (perimeter / sprintMps). */
  sprintLapS: number;
}>;

function perimeter(points: ReadonlyArray<readonly [number, number]>): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

function ring(chebyshev: number): ReadonlyArray<readonly [number, number]> {
  const r = chebyshev;
  return [
    [-r, -r], [0, -r], [r, -r], [r, 0], [r, r], [0, r], [-r, r], [-r, 0],
  ];
}

function loop(
  id: FarcrysisLoop['id'],
  chebyshevM: number,
  waypoints: ReadonlyArray<readonly [number, number]>,
  register: string,
  widthM: number,
): FarcrysisLoop {
  return Object.freeze({
    id,
    chebyshevM,
    waypoints: Object.freeze(waypoints.map((p) => Object.freeze([p[0], p[1]] as const))),
    register,
    widthM,
    sprintLapS: perimeter(waypoints) / FARCRYSIS_SCALE.sprintMps,
  });
}

/**
 * The three loops. Radii are derived from the island half (64 m): the beach
 * ring runs just inside the HF-393 waterline (chebyshev ~55), the jungle band
 * runs through the landmark ring (26), and the core loop is the 12 m station
 * shell with its two doors on the north/south faces.
 */
export const FARCRYSIS_LOOPS: readonly FarcrysisLoop[] = Object.freeze([
  loop('beach-ring', FARCRYSIS_HALF_M - 14, ring(FARCRYSIS_HALF_M - 14),
    'wide, open-ish, sightline breaks via palms, skiffs and rocks', 8),
  loop('jungle-band', 26, ring(26),
    'dense, cover-heavy, tight turns, short sightlines (~4-8 m)', 6),
  // The core loop is an outside-shell octagon. Corner waypoints sit beyond
  // the 5.5 m wall square so every edge is a real route, not a chord through
  // the shell collider at an adjacent wall corner.
  loop('core-loop', 5.5, [[0, -8], [6.5, -6.5], [6.5, 0], [6.5, 6.5], [0, 8], [-6.5, 6.5], [-6.5, 0], [-6.5, -6.5]],
    'ruined research core: two doors, one catwalk, the one vertical crossing', 4.5),
]);

/**
 * The four cardinal lanes that cross the loops — beach to core along each
 * axis. These are the "mid-ring cardinal corridor" the physics placement
 * comments keep clear, made explicit so a test can probe them.
 */
export const FARCRYSIS_CROSS_LANES: ReadonlyArray<Readonly<{
  id: 'lane-n' | 'lane-s' | 'lane-w' | 'lane-e';
  from: readonly [number, number];
  to: readonly [number, number];
  widthM: number;
}>> = Object.freeze([
  { id: 'lane-n', from: [0, -(FARCRYSIS_HALF_M - 14)], to: [0, -8], widthM: 6 },
  { id: 'lane-s', from: [0, FARCRYSIS_HALF_M - 14], to: [0, 8], widthM: 6 },
  { id: 'lane-w', from: [-(FARCRYSIS_HALF_M - 14), 0], to: [-8, 0], widthM: 6 },
  { id: 'lane-e', from: [FARCRYSIS_HALF_M - 14, 0], to: [8, 0], widthM: 6 },
]);

// ---------------------------------------------------------------------------
// 3. The sightline metric — real occlusion, eye to eye
// ---------------------------------------------------------------------------

/** A named solid the metric can occlude with. `arena.root.userData.farcrysisColliderAudit` has this shape. */
export type FarcrysisRouteSegment = Readonly<{
  routeId: string;
  segment: number;
  from: readonly [number, number];
  to: readonly [number, number];
  widthM: number;
  distanceM: number;
  sprintSeconds: number;
}>;

function routeSegment(
  routeId: string,
  segment: number,
  from: readonly [number, number],
  to: readonly [number, number],
  widthM: number,
): FarcrysisRouteSegment {
  const distanceM = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return Object.freeze({
    routeId,
    segment,
    from: Object.freeze([from[0], from[1]] as const),
    to: Object.freeze([to[0], to[1]] as const),
    widthM,
    distanceM,
    sprintSeconds: distanceM / FARCRYSIS_SCALE.sprintMps,
  });
}

/** Every authored route edge, used by the stock-flags probe and the report. */
export const FARCRYSIS_ROUTE_SEGMENTS: readonly FarcrysisRouteSegment[] = Object.freeze([
  ...FARCRYSIS_LOOPS.flatMap((route) => route.waypoints.map((from, segment) =>
    routeSegment(route.id, segment, from, route.waypoints[(segment + 1) % route.waypoints.length]!, route.widthM))),
  ...FARCRYSIS_CROSS_LANES.map((route) => routeSegment(route.id, 0, route.from, route.to, route.widthM)),
]);

export type FarcrysisSpawnZone = Readonly<{
  id: string;
  team: 0 | 1;
  centre: readonly [number, number];
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  preferredRoute: 'jungle-band' | 'lane-n' | 'lane-s' | 'lane-w' | 'lane-e';
  coverReachM: number;
  visibleEnemyFloorM: number;
}>;

function spawnZone(team: 0 | 1, preferredRoute: FarcrysisSpawnZone['preferredRoute']): FarcrysisSpawnZone {
  const points = FARCRYSIS_SPAWNS_XZ[team];
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  return Object.freeze({
    id: `spawn-zone-t${team}`,
    team,
    centre: Object.freeze([
      xs.reduce((sum, value) => sum + value, 0) / xs.length,
      zs.reduce((sum, value) => sum + value, 0) / zs.length,
    ] as const),
    bounds: Object.freeze({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }),
    preferredRoute,
    coverReachM: FARCRYSIS_SCALE.spawnCoverReachM,
    visibleEnemyFloorM: 30,
  });
}

/** Spawn bands are derived from the one constants table, never hand-copied. */
export const FARCRYSIS_SPAWN_ZONES: readonly FarcrysisSpawnZone[] = Object.freeze([
  spawnZone(0, 'lane-w'),
  spawnZone(1, 'lane-e'),
]);

export type FarcrysisVerticalCrossing = Readonly<{
  id: 'core-catwalk-stairs';
  foot: readonly [number, number, number];
  top: readonly [number, number, number];
  widthM: number;
  purpose: string;
}>;

/** The core stair is the single deliberate level change in the layout. */
export const FARCRYSIS_VERTICAL_CROSSING: FarcrysisVerticalCrossing = Object.freeze({
  id: 'core-catwalk-stairs',
  foot: Object.freeze([2.9, 0, 4.6] as const),
  top: Object.freeze([2.9, 2.59, 1.35] as const),
  widthM: 1.2,
  purpose: 'one core loop crossing from terrain floor to the catwalk lookout',
});

export type FarcrysisReviewStation = Readonly<{
  id: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  purpose: 'overview' | 'geometry' | 'light-occlusion';
  exposure: number;
  far: number;
}>;

function station(
  id: string,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  purpose: FarcrysisReviewStation['purpose'],
): FarcrysisReviewStation {
  return Object.freeze({
    id,
    position: Object.freeze([...position] as [number, number, number]),
    target: Object.freeze([...target] as [number, number, number]),
    purpose,
    exposure: 1.08,
    far: 190,
  });
}

/** Stable station ids consumed by the capture harness and viewpoint catalog. */
export const FARCRYSIS_REVIEW_STATIONS: readonly FarcrysisReviewStation[] = Object.freeze([
  station('farcrysis-beach-golden', [-54, 3.2, -54], [0, 1.2, 0], 'overview'),
  station('farcrysis-jungle-dapple', [-20, 1.9, -24], [0, 1.7, 0], 'light-occlusion'),
  station('farcrysis-core-interior', [-4.3, 1.65, 0], [3.4, 1.9, 2.4], 'geometry'),
  station('farcrysis-seaplane-throwback', [48, 2.4, -48], [40, 1.2, -40], 'overview'),
  station('farcrysis-island-topdown', [0, 95, 2], [0, 0, 0], 'overview'),
  station('farcrysis-west-shoreline', [-62, 5, -6], [-50, 1.2, 12], 'overview'),
]);

/** Render limits are derived here once and consumed by both definition and tests. */
export const FARCRYSIS_PIPELINE_BUDGET = Object.freeze({
  maximumFoliageNodeGraphs: TSL_FOLIAGE_MAX_DISTINCT_GRAPHS,
  minimumMaterialsPerFoliageGraph: 4,
  maximumDrawCalls: 460,
  maximumTriangles: 1_100_000,
  derivation: 'TSL foliage graph ceiling plus the authored visual-definition arena ceilings',
});

export type NamedBox = Readonly<{ id: string; bounds: Box2 }>;

/** The slice of an `ArenaMap` the metric reads. */
export type FarcrysisLayoutArena = Readonly<{
  spawns: Readonly<Record<0 | 1, ReadonlyArray<Readonly<{ x: number; z: number }>>>>;
  patrolPoints: ReadonlyArray<Readonly<{ x: number; z: number }>>;
  root: Readonly<{ userData: { farcrysisColliderAudit?: ReadonlyArray<NamedBox> } }>;
}>;

export type SightlineOrigin = Readonly<{ id: string; kind: 'spawn' | 'patrol'; team?: 0 | 1; x: number; z: number }>;

export type SightlineSample = Readonly<{
  origin: string;
  bearingDeg: number;
  /** Open distance at eye height before the first occluder (or the island edge). */
  openM: number;
  /** Collider id, 'terrain', or 'bounds' when nothing stops the line before the edge. */
  blockedBy: string;
}>;

export type SpawnPairSightline = Readonly<{
  from: string;
  to: string;
  distanceM: number;
  blocked: boolean;
  blockedBy: string;
}>;

export type SightlineReport = Readonly<{
  eyeHeightM: number;
  bearings: number;
  origins: readonly SightlineOrigin[];
  samples: readonly SightlineSample[];
  /** Longest open line from any spawn or patrol point. The PASS 69 C4 number. */
  maxOpenM: number;
  maxOpenSample: SightlineSample;
  /** Median and 90th percentile of the open distances. */
  p50OpenM: number;
  p90OpenM: number;
  /** Samples whose open line exceeds FARCRYSIS_MAX_SIGHTLINE. */
  overCeiling: number;
  /** Fraction of samples at or under FARCRYSIS_MAX_SIGHTLINE. */
  underCeilingFraction: number;
  /** Every team-0 spawn to every team-1 spawn, eye to eye. */
  spawnPairs: readonly SpawnPairSightline[];
  spawnPairsOpen: number;
}>;

/** Compass samples per origin (every 10 degrees), matching the HF-402 open-arc walk. */
export const SIGHTLINE_BEARINGS = 36;
/** Terrain is sampled this often along a line for ridge occlusion. */
const TERRAIN_STEP_M = 1.0;
/** Ids the metric never counts as occluders (the island edge is reported as 'bounds' instead). */
const BOUND_WALL_PREFIX = 'farcrysis-bound-';

function isOccluder(box: NamedBox): boolean {
  return !box.id.startsWith(BOUND_WALL_PREFIX);
}

/** Named occluders from a built arena — every solid collider except the invisible bound ring. */
export function farcrysisOccluders(arena: FarcrysisLayoutArena): readonly NamedBox[] {
  return (arena.root.userData.farcrysisColliderAudit ?? []).filter(isOccluder);
}

/** Where a ray from (x,z) along (dx,dz) leaves the playable square. */
function distanceToBounds(x: number, z: number, dx: number, dz: number): number {
  let t = Number.POSITIVE_INFINITY;
  if (dx > 1e-9) t = Math.min(t, (FARCRYSIS_BOUNDS.maxX - x) / dx);
  if (dx < -1e-9) t = Math.min(t, (FARCRYSIS_BOUNDS.minX - x) / dx);
  if (dz > 1e-9) t = Math.min(t, (FARCRYSIS_BOUNDS.maxZ - z) / dz);
  if (dz < -1e-9) t = Math.min(t, (FARCRYSIS_BOUNDS.minZ - z) / dz);
  return Math.max(0, t);
}

/**
 * The open distance of ONE eye-to-eye line: from an eye at `start` to an eye
 * standing at `end`, the first named collider hit, else the first terrain
 * ridge that rises above the line, else the far end.
 */
export function openDistance(
  start: Point3,
  end: Point3,
  occluders: readonly NamedBox[],
): Readonly<{ openM: number; blockedBy: string }> {
  const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  if (length < 1e-6) return { openM: 0, blockedBy: 'bounds' };
  let openM = length;
  let blockedBy = 'bounds';
  const hit = firstSegmentBoxHit(start, end, occluders.map((o) => o.bounds));
  if (hit) {
    openM = hit.time * length;
    const named = occluders.find((o) => o.bounds === hit.box);
    blockedBy = named?.id ?? 'collider';
  }
  // Terrain: a ridge higher than the line at that point occludes it.
  const steps = Math.max(1, Math.floor(openM / TERRAIN_STEP_M));
  for (let i = 1; i <= steps; i += 1) {
    const t = (i * TERRAIN_STEP_M) / length;
    if (t >= 1) break;
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    const y = start.y + (end.y - start.y) * t;
    if (farcrysisTerrainHeight(x, z) > y) {
      openM = t * length;
      blockedBy = 'terrain';
      break;
    }
  }
  return { openM, blockedBy };
}

function eye(x: number, z: number, eyeHeightM: number): Point3 {
  return { x, y: farcrysisTerrainHeight(x, z) + eyeHeightM, z };
}

/** Spawns and patrol points, named, from the authored tables. */
export function farcrysisSightlineOrigins(arena: FarcrysisLayoutArena): readonly SightlineOrigin[] {
  const origins: SightlineOrigin[] = [];
  for (const team of [0, 1] as const) {
    arena.spawns[team].forEach((s, i) => origins.push({ id: `spawn-t${team}-${i}`, kind: 'spawn', team, x: s.x, z: s.z }));
  }
  arena.patrolPoints.forEach((p, i) => origins.push({ id: `patrol-${i}`, kind: 'patrol', x: p.x, z: p.z }));
  return origins;
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index]!;
}

/**
 * The metric. For every spawn and patrol point, 36 bearings; each line runs
 * from that eye to an eye standing where the line leaves the island, and is
 * stopped by the first solid collider or terrain ridge. Also every cross-team
 * spawn pair, eye to eye.
 */
export function measureFarcrysisSightlines(
  arena: FarcrysisLayoutArena,
  occluders: readonly NamedBox[] = farcrysisOccluders(arena),
  eyeHeightM = FARCRYSIS_SCALE.eyeHeightM,
): SightlineReport {
  const origins = farcrysisSightlineOrigins(arena);
  const samples: SightlineSample[] = [];
  for (const origin of origins) {
    const start = eye(origin.x, origin.z, eyeHeightM);
    for (let b = 0; b < SIGHTLINE_BEARINGS; b += 1) {
      const bearingDeg = (b * 360) / SIGHTLINE_BEARINGS;
      const rad = (bearingDeg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dz = Math.cos(rad);
      const reach = distanceToBounds(origin.x, origin.z, dx, dz);
      const end = eye(origin.x + dx * reach, origin.z + dz * reach, eyeHeightM);
      const { openM, blockedBy } = openDistance(start, end, occluders);
      samples.push({ origin: origin.id, bearingDeg, openM, blockedBy });
    }
  }
  const sorted = samples.map((s) => s.openM).sort((a, b) => a - b);
  const maxOpenSample = samples.reduce((best, s) => (s.openM > best.openM ? s : best), samples[0]!);
  const overCeiling = samples.filter((s) => s.openM > FARCRYSIS_MAX_SIGHTLINE).length;

  const spawnPairs: SpawnPairSightline[] = [];
  const team0 = origins.filter((o) => o.kind === 'spawn' && o.team === 0);
  const team1 = origins.filter((o) => o.kind === 'spawn' && o.team === 1);
  for (const a of team0) {
    for (const b of team1) {
      const start = eye(a.x, a.z, eyeHeightM);
      const end = eye(b.x, b.z, eyeHeightM);
      const distanceM = Math.hypot(b.x - a.x, b.z - a.z);
      const { openM, blockedBy } = openDistance(start, end, occluders);
      const blocked = openM < distanceM - 1e-6 && blockedBy !== 'bounds';
      spawnPairs.push({ from: a.id, to: b.id, distanceM, blocked, blockedBy: blocked ? blockedBy : 'open' });
    }
  }

  return {
    eyeHeightM,
    bearings: SIGHTLINE_BEARINGS,
    origins,
    samples,
    maxOpenM: maxOpenSample.openM,
    maxOpenSample,
    p50OpenM: percentile(sorted, 0.5),
    p90OpenM: percentile(sorted, 0.9),
    overCeiling,
    underCeilingFraction: samples.length === 0 ? 0 : (samples.length - overCeiling) / samples.length,
    spawnPairs,
    spawnPairsOpen: spawnPairs.filter((p) => !p.blocked).length,
  };
}

// ---------------------------------------------------------------------------
// 4. Mid-map mass justification — the L2 rule, made mechanical
// ---------------------------------------------------------------------------

export type MassJustification =
  | 'blocks-sightline'   // removing it lengthens some measured line past FARCRYSIS_MAX_SIGHTLINE
  | 'spawn-cover'        // within spawnCoverReachM of a spawn (HF-402 cover-in-reach)
  | 'core-structure'     // the research core shell and its authored interior (SPEC §7 L4)
  | 'vertical-route'     // the tower: the map's one authored lookout, the vertical crossing
  | 'vegetation-collider' // a palm trunk's collider: the visual stays, so the solid must too
  | null;                // no job — the L2 rule says it is not placed

export type MidMapMass = Readonly<{
  id: string;
  centre: readonly [number, number];
  chebyshevM: number;
  justification: MassJustification;
  /** Sample lines this mass is the FIRST occluder of. */
  linesFirstBlocked: number;
  /** Of those, how many would run past the ceiling without it. */
  linesLengthenedPastCeiling: number;
}>;

export type MidMapMassReport = Readonly<{
  radiusM: number;
  masses: readonly MidMapMass[];
  unjustified: readonly string[];
}>;

/**
 * Structural exemptions, each with the sentence that is its job. Anything in
 * the middle that is not on this list must earn its place through the metric.
 */
export const FARCRYSIS_MIDDLE_EXEMPT: ReadonlyArray<Readonly<{ prefix: string; justification: Exclude<MassJustification, null>; why: string }>> = Object.freeze([
  { prefix: 'farcrysis-core-', justification: 'core-structure', why: 'the station shell, its doors, stair, catwalk and desk are the core loop (PASS 69 R3), not dressing' },
  { prefix: 'farcrysis-art-tower-', justification: 'vertical-route', why: 'the lookout platform is the one authored vantage; HF-423 gave it real deck and dish authority' },
  { prefix: 'farcrysis-enhanced-palm-trunk-collider-', justification: 'vegetation-collider', why: 'a palm is nature, not clutter (HF-429 names vegetation for the dressing stage); its trunk collider exists so the visible trunk is not walk-through' },
]);

function chebyshevOf(b: Box2): number {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return Math.max(Math.abs(cx), Math.abs(cz));
}

/**
 * Classify every solid in the middle. A mass "blocks a sightline the metric
 * says needs blocking" when at least one measured line that it is the first
 * occluder of would exceed FARCRYSIS_MAX_SIGHTLINE with the mass removed.
 */
export function measureFarcrysisMidMapMasses(
  arena: FarcrysisLayoutArena,
  radiusM = FARCRYSIS_MIDDLE_RADIUS_M,
): MidMapMassReport {
  const occluders = farcrysisOccluders(arena);
  const base = measureFarcrysisSightlines(arena, occluders);
  const spawns = [...arena.spawns[0], ...arena.spawns[1]];
  const masses: MidMapMass[] = [];
  for (const mass of occluders) {
    const chebyshevM = chebyshevOf(mass.bounds);
    if (chebyshevM > radiusM) continue;
    const centre: readonly [number, number] = [
      (mass.bounds.minX + mass.bounds.maxX) / 2,
      (mass.bounds.minZ + mass.bounds.maxZ) / 2,
    ];
    const exempt = FARCRYSIS_MIDDLE_EXEMPT.find((e) => mass.id.startsWith(e.prefix));
    const firstBlocked = base.samples.filter((s) => s.blockedBy === mass.id);
    let lengthened = 0;
    if (firstBlocked.length > 0) {
      const without = occluders.filter((o) => o !== mass);
      const originById = new Map(base.origins.map((o) => [o.id, o] as const));
      for (const sample of firstBlocked) {
        const origin = originById.get(sample.origin)!;
        const rad = (sample.bearingDeg * Math.PI) / 180;
        const dx = Math.sin(rad);
        const dz = Math.cos(rad);
        const reach = distanceToBounds(origin.x, origin.z, dx, dz);
        const start = eye(origin.x, origin.z, base.eyeHeightM);
        const end = eye(origin.x + dx * reach, origin.z + dz * reach, base.eyeHeightM);
        if (openDistance(start, end, without).openM > FARCRYSIS_MAX_SIGHTLINE) lengthened += 1;
      }
    }
    const nearSpawn = spawns.some((s) => Math.hypot(s.x - centre[0], s.z - centre[1]) <= FARCRYSIS_SCALE.spawnCoverReachM);
    const justification: MassJustification = exempt
      ? exempt.justification
      : lengthened > 0
        ? 'blocks-sightline'
        : nearSpawn
          ? 'spawn-cover'
          : null;
    masses.push({ id: mass.id, centre, chebyshevM, justification, linesFirstBlocked: firstBlocked.length, linesLengthenedPastCeiling: lengthened });
  }
  masses.sort((a, b) => a.chebyshevM - b.chebyshevM || a.id.localeCompare(b.id));
  return { radiusM, masses, unjustified: masses.filter((m) => m.justification === null).map((m) => m.id) };
}

// ---------------------------------------------------------------------------
// 5. Authored tables re-exported for the receipt, so one script reads one module
// ---------------------------------------------------------------------------

export const FARCRYSIS_LAYOUT_TABLES = Object.freeze({
  bounds: FARCRYSIS_BOUNDS,
  spawns: FARCRYSIS_SPAWNS_XZ,
  patrol: FARCRYSIS_PATROL_XZ,
  loops: FARCRYSIS_LOOPS,
  crossLanes: FARCRYSIS_CROSS_LANES,
  routeSegments: FARCRYSIS_ROUTE_SEGMENTS,
  spawnZones: FARCRYSIS_SPAWN_ZONES,
  verticalCrossing: FARCRYSIS_VERTICAL_CROSSING,
  reviewStations: FARCRYSIS_REVIEW_STATIONS,
  pipelineBudget: FARCRYSIS_PIPELINE_BUDGET,
  terrainWater: FARCRYSIS_TERRAIN_WATER,
  coverRhythm: FARCRYSIS_COVER_RHYTHM,
  middleRadiusM: FARCRYSIS_MIDDLE_RADIUS_M,
  scale: FARCRYSIS_SCALE,
});
