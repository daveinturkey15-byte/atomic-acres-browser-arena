// HF-402: the constraint set every authored spawn is measured against.
//
// Owner 2026-09-02: "please ensure all maps have more reasonable spawns for
// both players and bots, currently raid spawns me in outside".
//
// The 2026-08-31 layout pass (b138b9c0) validated a spawn with
// `validArenaSpawnPoint`: finite, inside the RECTANGULAR bounds, not inside a
// collider. Raid's playable area is a building footprint that leaves ~26% of
// its bounding rectangle as nothing at all - no paving, no floor, a boundary
// wall between it and the map - and a point in that nothing is "valid" by that
// definition because there is no collider to be inside. The solver then
// maximised spread along the bounding rectangle's edge and put five of six
// spawns per team out there. Measured 2026-09-02, before this module existed:
//
//     test2 (Raid)  team 0: 5/6 spawns with NO floor beneath and NO route to
//                   the enemy; team 1: 4/6 - and the two with a floor sit in
//                   a garage that only a jump leaves.
//
// So "valid" now means the five things a player would say make a spawn
// reasonable, each measured from the arena's own authored geometry:
//
//   1. STANDABLE  - the old check: finite, in bounds, not inside a collider.
//   2. FLOOR      - a standing surface within autostep reach of the feet: a
//                   downward ray against the arena's raycast meshes, an
//                   axis-aligned collider top, or the physics fail-safe floor
//                   the runtime builds at `physicsSafetyFloorY ?? 0`. Raid's
//                   fail-safe is 1.2 m below grade: "outside" has no floor.
//   3. REACHABLE  - a walkable route on the spawn's own level, needing nothing
//                   higher than autostep, from the spawn to at least one ENEMY
//                   spawn. Bots share the tables and cannot jump, so a route
//                   that needs a jump is not a route.
//   4. COVER      - hard cover within reach, so the first seconds are not spent
//                   crossing open ground.
//   5. NOT SEEN   - no enemy spawn within 30 m has a direct eye-height line to
//                   it. Bots draw from the enemy table, so this is also the
//                   rule that keeps a bot from materialising in view.
//
// Plus, for arenas that field bots, TEAM SEPARATION: the two spawn tables must
// be far enough apart that a bot does not materialise beside the player.
//
// Thresholds are calibrated on Nuke Town, the arena the owner is happy with:
// a threshold the reference map fails is a wrong threshold, not a finding.
import * as THREE from 'three';
import { ARENA_SELECTIONS, type ArenaId } from './map-selection';
import { buildArena, type ArenaMap } from './map';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { buildFarcrysis } from './farcrysis';
import { buildHighSeas } from './high-seas';
import { buildTest1, buildTest2 } from './test-maps';
import { isBlocked, pointInsideBounds, segmentIntersectsBox, type Box2, type Point3 } from './collision';
import { validArenaSpawnPoint } from './spawn-safety';

export type ArenaBuilder = (scene: THREE.Scene) => ArenaMap;

/**
 * Every arena id the registry knows, mapped to its builder. `Record<ArenaId,
 * ...>` is exhaustive by type: registering a new arena without a builder here
 * fails `tsc`, so no gate can silently skip it. The playable roster is then
 * DERIVED from the registry's own `selectable` flag - never a hand-kept list.
 */
export const ARENA_BUILDERS: Readonly<Record<ArenaId, ArenaBuilder>> = Object.freeze({
  'atomic-acres': buildArena as ArenaBuilder,
  'rustworks-1v1': buildRustworks1v1 as ArenaBuilder,
  'gun-range': buildGunRange as ArenaBuilder,
  'skyline-terminal': buildSkylineTerminal as ArenaBuilder,
  farcrysis: buildFarcrysis as ArenaBuilder,
  'high-seas': ((scene: THREE.Scene) => buildHighSeas(scene)) as ArenaBuilder,
  test1: buildTest1 as ArenaBuilder,
  test2: buildTest2 as ArenaBuilder,
});

/** `[id, builder]` for every arena the menu offers. */
export function SELECTABLE_ARENA_BUILDERS(): Array<[ArenaId, ArenaBuilder]> {
  return ARENA_SELECTIONS
    .filter((selection) => selection.selectable !== false)
    .map((selection) => [selection.id, ARENA_BUILDERS[selection.id]]);
}

/** Authored spawn eye height above the feet (`spawnRecord` builds every point at y = 1.7). */
export const SPAWN_EYE_HEIGHT = 1.7;
/** Player capsule radius used by every spawn validity probe. */
export const SPAWN_RADIUS = 0.44;
/** CHARACTER_PHYSICS_CONFIG autostep: a ledge this high is walked, not jumped. */
export const AUTOSTEP_M = 0.45;
/** The maps' mountable-low-wall rung (<= 0.75 m against a measured 0.82 m jump apex): a player jumps it, a bot cannot. */
export const MOUNT_LOW_M = 0.75;
/** A floor this far BELOW the feet still counts as the surface the player lands on. */
const FLOOR_DROP_TOLERANCE_M = 0.6;
/** Flood-fill cell size for the route probe. */
const REACH_CELL_M = 1;
/** A box whose top is at least this far above the feet hides a standing body. */
const HARD_COVER_HEIGHT_M = 0.7;

export const SPAWN_LAYOUT_THRESHOLDS = Object.freeze({
  /**
   * Nuke Town's worst spawn is 3.5 m from hard cover; RustRig's 5.75 m and
   * Terminal's 5.93 m are the widest in the shipped set. Raid's old (-45, 26)
   * was 10.4 m from anything.
   */
  maximumCoverDistanceM: 6,
  /**
   * An enemy spawn with a direct eye-height line to this one closer than this
   * is "in the player's face" - and bots draw from the enemy table, so it is
   * also a bot materialising in view. Nuke Town's nearest visible enemy pair
   * is 67.5 m, RustRig's 33.0 m; the runtime scorer handles anything longer
   * by preferring the unseen point. Applies to arenas that field bots.
   */
  minimumVisibleEnemySpawnDistanceM: 30,
  /**
   * Bot arenas: the two tables must be at least this fraction of the longer
   * axis apart. Nuke Town 0.91, RustRig 0.34, Firing Range 0.63, High Seas
   * 0.77; a bot arena whose tables are closer than a third of the map has
   * bots spawning beside the player.
   */
  minimumCrossTeamSeparationFraction: 0.33,
});

export type FloorSource = 'raycast' | 'collider' | 'safety-floor';

export type SpawnPointReport = Readonly<{
  team: 0 | 1;
  index: number;
  x: number;
  y: number;
  z: number;
  standable: boolean;
  /** Feet height above the nearest floor beneath, or null when nothing is beneath. */
  floorGapM: number | null;
  floorSource: FloorSource | null;
  reachable: boolean;
  /** Walkable cells connected to this spawn on its own level. */
  reachableCells: number;
  /**
   * Route to an enemy spawn allowing MOUNT_LOW (0.75 m) hops - what a jumping
   * PLAYER can do and a bot cannot. Reported, not gated: a spawn that is only
   * jump-reachable is a bot trap.
   */
  reachableByJump: boolean;
  coverDistanceM: number;
  poiDistanceM: number;
  enemySpawnsVisible: number;
  /** Distance to the nearest enemy spawn with a direct eye-height line, or null when none. */
  nearestVisibleEnemyM: number | null;
  failures: readonly string[];
}>;

export type SpawnLayoutReport = Readonly<{
  arenaId: ArenaId;
  bounds: Box2;
  botArena: boolean;
  points: readonly SpawnPointReport[];
  summary: Readonly<{
    spawnCount: number;
    inEnvelopePercent: number;
    floorPercent: number;
    reachablePercent: number;
    medianPoiDistanceM: number;
    maxCoverDistanceM: number;
    crossTeamMinDistanceM: number;
    crossTeamMinFraction: number;
    enemyLosPairs: number;
    nearestVisibleEnemyPairM: number | null;
    worstOffender: string | null;
  }>;
  /** Layout-level failures (team separation); per-point failures live on each point. */
  failures: readonly string[];
}>;

function distanceXZ(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function pointToBoxDistanceXZ(point: Point3, box: Box2): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * The standing surface beneath a spawn. Three independent probes; any
 * suffices: a downward ray against the arena's shot surfaces (terrain and
 * decks are meshes), an unrotated collider whose top is within autostep of
 * the feet (Raid's paving is a collider block), or the physics fail-safe floor
 * the runtime lays across the whole bounds at `physicsSafetyFloorY ?? 0` -
 * which is what holds Nuke Town's back row up 0.5 m past its grass plane, and
 * what Raid lowers 1.2 m under grade so nothing outside the footprint is
 * standing on it.
 */
export function floorBeneath(
  point: Point3,
  arena: Pick<ArenaMap, 'raycastMeshes' | 'colliders' | 'physicsColliders' | 'physicsSafetyFloorY'>,
  raycaster = new THREE.Raycaster(),
): { gapM: number; source: FloorSource } | null {
  const feetY = point.y - SPAWN_EYE_HEIGHT;
  let best: { gapM: number; source: FloorSource } | null = null;
  const consider = (floorY: number, source: FloorSource): void => {
    const gapM = feetY - floorY;
    if (gapM < -AUTOSTEP_M || gapM > FLOOR_DROP_TOLERANCE_M) return;
    if (!best || Math.abs(gapM) < Math.abs(best.gapM)) best = { gapM, source };
  };
  raycaster.set(new THREE.Vector3(point.x, point.y, point.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = SPAWN_EYE_HEIGHT + FLOOR_DROP_TOLERANCE_M + 0.01;
  for (const hit of raycaster.intersectObjects(arena.raycastMeshes, true)) consider(point.y - hit.distance, 'raycast');
  for (const box of [...arena.colliders, ...arena.physicsColliders]) {
    if (box.rotation || box.maxY === undefined) continue;
    if (point.x < box.minX || point.x > box.maxX || point.z < box.minZ || point.z > box.maxZ) continue;
    consider(box.maxY, 'collider');
  }
  consider(arena.physicsSafetyFloorY ?? 0, 'safety-floor');
  return best;
}

/** True when a standing player at `point` is not blocked by anything taller than `stepM` above the feet. */
function walkableAt(point: Point3, bounds: Box2, colliders: readonly Box2[], stepM: number): boolean {
  // Probing `stepM` above the authored eye makes `isBlocked` ignore every box
  // whose top is within `stepM` of the feet - kerbs and sills at autostep, or
  // the map's mountable low walls at the jump-apex ladder.
  const probe = { x: point.x, y: point.y + stepM, z: point.z };
  return pointInsideBounds(probe, bounds, SPAWN_RADIUS) && !isBlocked(probe, colliders, SPAWN_RADIUS);
}

/**
 * Flood-fills the walkable cells on `origin`'s level and reports whether any
 * of `targets` is reached. Cells are `cellM` squares over the bounds; a cell
 * is passable when nothing taller than `stepM` above the feet occupies it.
 */
export function reachableFrom(
  origin: Point3,
  targets: readonly Point3[],
  bounds: Box2,
  colliders: readonly Box2[],
  cellM = REACH_CELL_M,
  stepM = AUTOSTEP_M,
): { reached: boolean; cells: number } {
  const columns = Math.ceil((bounds.maxX - bounds.minX) / cellM) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cellM) + 1;
  const cellOf = (point: Point3): [number, number] => [
    Math.round((point.x - bounds.minX) / cellM),
    Math.round((point.z - bounds.minZ) / cellM),
  ];
  const pointOf = (column: number, row: number): Point3 => ({
    x: bounds.minX + column * cellM,
    y: origin.y,
    z: bounds.minZ + row * cellM,
  });
  const targetKeys = new Set(targets.map((target) => cellOf(target).join(',')));
  const visited = new Set<string>();
  const [startColumn, startRow] = cellOf(origin);
  const queue: Array<[number, number]> = [[startColumn, startRow]];
  visited.add(`${startColumn},${startRow}`);
  let reached = targetKeys.has(`${startColumn},${startRow}`);
  let cells = 0;
  while (queue.length > 0) {
    const [column, row] = queue.shift()!;
    cells += 1;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nextColumn = column + dc;
      const nextRow = row + dr;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
      const key = `${nextColumn},${nextRow}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!walkableAt(pointOf(nextColumn, nextRow), bounds, colliders, stepM)) continue;
      if (targetKeys.has(key)) reached = true;
      queue.push([nextColumn, nextRow]);
    }
  }
  return { reached, cells };
}

/**
 * The set of grid cells walkable from `origin` at autostep, as `x,z` keys on
 * the same lattice `reachableFrom` uses. The solver uses one fill per team
 * instead of one per candidate.
 */
export function walkableRegionFrom(
  origin: Point3,
  bounds: Box2,
  colliders: readonly Box2[],
  cellM = REACH_CELL_M,
): Set<string> {
  const region = new Set<string>();
  const columns = Math.ceil((bounds.maxX - bounds.minX) / cellM) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cellM) + 1;
  const startColumn = Math.round((origin.x - bounds.minX) / cellM);
  const startRow = Math.round((origin.z - bounds.minZ) / cellM);
  const queue: Array<[number, number]> = [[startColumn, startRow]];
  region.add(`${startColumn},${startRow}`);
  while (queue.length > 0) {
    const [column, row] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nextColumn = column + dc;
      const nextRow = row + dr;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
      const key = `${nextColumn},${nextRow}`;
      if (region.has(key)) continue;
      const point = { x: bounds.minX + nextColumn * cellM, y: origin.y, z: bounds.minZ + nextRow * cellM };
      if (!walkableAt(point, bounds, colliders, AUTOSTEP_M)) continue;
      region.add(key);
      queue.push([nextColumn, nextRow]);
    }
  }
  return region;
}

/** Distance to the nearest box that hides a standing body at this spawn. */
export function nearestCoverDistance(point: Point3, colliders: readonly Box2[]): number {
  const feetY = point.y - SPAWN_EYE_HEIGHT;
  let nearest = Number.POSITIVE_INFINITY;
  for (const box of colliders) {
    const top = box.maxY ?? Number.POSITIVE_INFINITY;
    const bottom = box.minY ?? Number.NEGATIVE_INFINITY;
    // A floor is not cover; nor is a soffit the player walks under.
    if (top < feetY + HARD_COVER_HEIGHT_M || bottom > feetY + 1.2) continue;
    nearest = Math.min(nearest, pointToBoxDistanceXZ(point, box));
  }
  return nearest;
}

/** Points of interest a spawn should sit near: patrol anchors, then practice targets. */
export function arenaPointsOfInterest(arena: Pick<ArenaMap, 'patrolPoints' | 'targets'>): Point3[] {
  if (arena.patrolPoints.length > 0) return arena.patrolPoints.map((point) => ({ x: point.x, y: point.y, z: point.z }));
  return arena.targets.map((target) => ({ x: target.root.position.x, y: target.root.position.y, z: target.root.position.z }));
}

/** Distance to the nearest enemy spawn with a clear eye-height line, or null when every one is occluded. */
export function nearestVisibleEnemySpawn(point: Point3, enemies: readonly Point3[], colliders: readonly Box2[]): number | null {
  let nearest: number | null = null;
  for (const enemy of enemies) {
    if (colliders.some((box) => segmentIntersectsBox(point, enemy, box))) continue;
    const distance = distanceXZ(point, enemy);
    if (nearest === null || distance < nearest) nearest = distance;
  }
  return nearest;
}

export function enemySpawnsVisibleFrom(point: Point3, enemies: readonly Point3[], colliders: readonly Box2[]): number {
  return enemies.filter((enemy) => !colliders.some((box) => segmentIntersectsBox(point, enemy, box))).length;
}

/** Arenas whose registry entry fields bots: the enemy table is where bots materialise. */
export function arenaFieldsBots(arenaId: ArenaId): boolean {
  return (ARENA_SELECTIONS.find((selection) => selection.id === arenaId)?.maximumSoloBots ?? 0) > 0;
}

/** Every per-point constraint except the route, which callers supply because it is the expensive one. */
export function spawnPointFailures(
  point: Point3,
  arena: ArenaMap,
  enemies: readonly Point3[],
  botArena: boolean,
  reachable: boolean,
): string[] {
  const failures: string[] = [];
  if (!validArenaSpawnPoint(point, arena.bounds, arena.colliders, SPAWN_RADIUS)) failures.push('inside-geometry-or-out-of-bounds');
  if (!floorBeneath(point, arena)) failures.push('no-floor');
  if (!reachable) failures.push('no-autostep-route-to-enemy');
  if (nearestCoverDistance(point, arena.colliders) > SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM) failures.push('no-cover-in-reach');
  if (botArena) {
    const visible = nearestVisibleEnemySpawn(point, enemies, arena.colliders);
    if (visible !== null && visible < SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM) failures.push('enemy-spawn-in-sight');
  }
  return failures;
}

export function measureSpawnPoint(
  point: Point3,
  team: 0 | 1,
  index: number,
  arena: ArenaMap,
  enemies: readonly Point3[],
  pointsOfInterest: readonly Point3[],
  botArena: boolean,
): SpawnPointReport {
  const standable = validArenaSpawnPoint(point, arena.bounds, arena.colliders, SPAWN_RADIUS);
  const floor = floorBeneath(point, arena);
  const reach = reachableFrom(point, enemies, arena.bounds, arena.colliders);
  const coverDistanceM = nearestCoverDistance(point, arena.colliders);
  const poiDistanceM = pointsOfInterest.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...pointsOfInterest.map((poi) => distanceXZ(point, poi)));
  const nearestVisibleEnemyM = nearestVisibleEnemySpawn(point, enemies, arena.colliders);
  return {
    team,
    index,
    x: point.x,
    y: point.y,
    z: point.z,
    standable,
    floorGapM: floor ? Number(floor.gapM.toFixed(3)) : null,
    floorSource: floor ? floor.source : null,
    reachable: reach.reached,
    reachableCells: reach.cells,
    reachableByJump: reach.reached || reachableFrom(point, enemies, arena.bounds, arena.colliders, REACH_CELL_M, MOUNT_LOW_M).reached,
    coverDistanceM: Number(coverDistanceM.toFixed(2)),
    poiDistanceM: Number(poiDistanceM.toFixed(2)),
    enemySpawnsVisible: enemySpawnsVisibleFrom(point, enemies, arena.colliders),
    nearestVisibleEnemyM: nearestVisibleEnemyM === null ? null : Number(nearestVisibleEnemyM.toFixed(2)),
    failures: spawnPointFailures(point, arena, enemies, botArena, reach.reached),
  };
}

export function crossTeamSeparation(teams: ReadonlyArray<readonly Point3[]>, bounds: Box2): { distanceM: number; fraction: number } {
  let distanceM = Number.POSITIVE_INFINITY;
  for (const left of teams[0] ?? []) for (const right of teams[1] ?? []) distanceM = Math.min(distanceM, distanceXZ(left, right));
  const longestAxis = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return { distanceM, fraction: distanceM / longestAxis };
}

export function measureSpawnLayout(arenaId: ArenaId, arena: ArenaMap): SpawnLayoutReport {
  arena.root.updateMatrixWorld(true);
  const teams: ReadonlyArray<readonly Point3[]> = [arena.spawns[0] ?? [], arena.spawns[1] ?? []];
  const pointsOfInterest = arenaPointsOfInterest(arena);
  const botArena = arenaFieldsBots(arenaId);
  const points: SpawnPointReport[] = [];
  for (const team of [0, 1] as const) {
    const enemies = teams[team === 0 ? 1 : 0]!;
    teams[team]!.forEach((point, index) => {
      points.push(measureSpawnPoint(point, team, index, arena, enemies, pointsOfInterest, botArena));
    });
  }
  const separation = crossTeamSeparation(teams, arena.bounds);
  const failures: string[] = [];
  if (botArena && separation.fraction < SPAWN_LAYOUT_THRESHOLDS.minimumCrossTeamSeparationFraction) {
    failures.push(`teams-too-close:${separation.distanceM.toFixed(1)}m=${(separation.fraction * 100).toFixed(0)}%-of-longest-axis`);
  }
  const inEnvelope = points.filter((point) => point.floorGapM !== null && point.reachable && point.standable);
  const poiDistances = points.map((point) => point.poiDistanceM).filter(Number.isFinite).sort((a, b) => a - b);
  const percent = (count: number): number => points.length === 0 ? 0 : Math.round((count / points.length) * 100);
  const visiblePairs = points.map((point) => point.nearestVisibleEnemyM).filter((value): value is number => value !== null);
  const worst = [...points].sort((a, b) => b.failures.length - a.failures.length || b.coverDistanceM - a.coverDistanceM)[0];
  return {
    arenaId,
    bounds: { minX: arena.bounds.minX, maxX: arena.bounds.maxX, minZ: arena.bounds.minZ, maxZ: arena.bounds.maxZ },
    botArena,
    points,
    summary: {
      spawnCount: points.length,
      inEnvelopePercent: percent(inEnvelope.length),
      floorPercent: percent(points.filter((point) => point.floorGapM !== null).length),
      reachablePercent: percent(points.filter((point) => point.reachable).length),
      medianPoiDistanceM: poiDistances.length === 0 ? Number.POSITIVE_INFINITY : poiDistances[Math.floor(poiDistances.length / 2)]!,
      maxCoverDistanceM: Math.max(...points.map((point) => point.coverDistanceM)),
      crossTeamMinDistanceM: Number(separation.distanceM.toFixed(2)),
      crossTeamMinFraction: Number(separation.fraction.toFixed(3)),
      enemyLosPairs: points.filter((point) => point.team === 0).reduce((sum, point) => sum + point.enemySpawnsVisible, 0),
      nearestVisibleEnemyPairM: visiblePairs.length === 0 ? null : Math.min(...visiblePairs),
      worstOffender: worst && worst.failures.length > 0
        ? `team ${worst.team} (${worst.x}, ${worst.z}): ${worst.failures.join(', ')}`
        : failures[0] ?? null,
    },
    failures,
  };
}
