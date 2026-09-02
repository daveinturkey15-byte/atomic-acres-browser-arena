// Proposes valid, well-spread spawn sets for arenas whose authored lists fail
// src/spawn-layout-quality.test.ts. Read-only: it prints coordinates for a human
// to paste, and never edits a map.
//
// Guessing spawn coordinates by eye is how invalid points got authored in the
// first place; this searches the arena's own geometry instead.
//
// HF-402 (2026-09-02): the first version of this solver searched with
// `validArenaSpawnPoint` alone - finite, inside the bounding RECTANGLE, not
// inside a collider - and maximised spread. On Raid, whose playable area is a
// building footprint inside a much larger rectangle, that put five of six
// spawns per team in the void outside the boundary wall: no paving, no route,
// 1.2 m drop to the physics fail-safe floor. "Raid spawns me in outside."
// Every candidate now has to pass the full constraint set in
// src/spawn-layout-constraints.ts (floor beneath, autostep route to the
// enemy, cover within reach, no enemy spawn in sight, team separation) before
// spread is even considered.
//
//   npx tsx scripts/qa/solve-spawn-layouts.ts [--arenas test2,...] [--all]
//
// By default only arenas whose AUTHORED layout fails are solved; --all solves
// every selectable arena so the proposal can be compared against the shipped
// one.
import * as THREE from 'three';
import type { ArenaMap } from '../../src/map';
import type { Point3 } from '../../src/collision';
import {
  AUTOSTEP_M,
  SELECTABLE_ARENA_BUILDERS,
  SPAWN_EYE_HEIGHT,
  SPAWN_LAYOUT_THRESHOLDS,
  arenaFieldsBots,
  arenaPointsOfInterest,
  crossTeamSeparation,
  floorBeneath,
  measureSpawnLayout,
  spawnPointFailures,
  walkableRegionFrom,
} from '../../src/spawn-layout-constraints';

const argv = process.argv.slice(2);
const arg = (name: string): string | null => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : null;
};
const ONLY = arg('--arenas')?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? null;
const ALL = argv.includes('--all');

const MIN_PAIR = 4.5;      // comfortably above the gate's 3 m floor
const WANTED = 6;
/**
 * Each team searches its own end of the separation axis: this fraction of the
 * axis measured from its edge, widening only when the narrower band cannot
 * seat a full team at MIN_PAIR spacing.
 */
const OWN_END_FRACTIONS = [0.2, 0.28, 0.36] as const;

type XZ = { x: number; z: number };
type Axis = 'x' | 'z';

function distance(a: XZ, b: XZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function centroid(points: readonly XZ[]): XZ {
  if (points.length === 0) return { x: 0, z: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}

/** The axis along which the authored tables are separated, and which sign each team owns. */
function separationAxis(arena: ArenaMap): { axis: Axis; teamSign: [number, number] } {
  const a = centroid(arena.spawns[0]);
  const b = centroid(arena.spawns[1]);
  const axis: Axis = Math.abs(a.x - b.x) >= Math.abs(a.z - b.z) ? 'x' : 'z';
  const centre = axis === 'x' ? (arena.bounds.minX + arena.bounds.maxX) / 2 : (arena.bounds.minZ + arena.bounds.maxZ) / 2;
  const sign0 = (axis === 'x' ? a.x : a.z) < centre ? -1 : 1;
  return { axis, teamSign: [sign0, -sign0] };
}

function mirror(point: XZ, arena: ArenaMap, axis: Axis): XZ {
  if (axis === 'x') return { x: arena.bounds.minX + arena.bounds.maxX - point.x, z: point.z };
  return { x: point.x, z: arena.bounds.minZ + arena.bounds.maxZ - point.z };
}

function cellKey(point: XZ, arena: ArenaMap): string {
  return `${Math.round(point.x - arena.bounds.minX)},${Math.round(point.z - arena.bounds.minZ)}`;
}

function solveTeam(
  arena: ArenaMap,
  team: 0 | 1,
  enemies: readonly Point3[],
  reachTargets: readonly Point3[],
  seeds: readonly XZ[],
  axis: Axis,
  sign: number,
  botArena: boolean,
): { chosen: XZ[]; kept: number; candidates: number; band: number } {
  const y = arena.spawns[team][0]?.y ?? SPAWN_EYE_HEIGHT;
  const asPoint = (point: XZ): Point3 => ({ x: point.x, y, z: point.z });
  // One flood fill from the map's interior at autostep, on the spawn level: a
  // candidate is reachable when its cell is in that region. The origin is the
  // first reach target that stands on a floor at the spawn level, so a target
  // in a walled-off pocket (Raid's kerbed garage) cannot seed the region.
  const origin = reachTargets
    .map((target) => ({ x: target.x, y, z: target.z }))
    .find((target) => floorBeneath(target, arena) && spawnPointFailures(target, arena, [], false, true).length === 0);
  const region = origin ? walkableRegionFrom(origin, arena.bounds, arena.colliders) : new Set<string>();
  const admissible = (point: XZ): boolean => region.has(cellKey(point, arena))
    && spawnPointFailures(asPoint(point), arena, enemies, botArena, true).length === 0;

  // Keep the authored points that pass; they encode designer intent. Then the
  // mirrored partner's points, for the map's symmetry.
  const chosen: XZ[] = [];
  for (const seed of [...arena.spawns[team].map((point) => ({ x: point.x, z: point.z })), ...seeds]) {
    if (!admissible(seed)) continue;
    if (chosen.every((existing) => distance(existing, seed) >= MIN_PAIR)) chosen.push(seed);
  }
  const kept = chosen.length;

  // Then search the team's own end for extra points, preferring maximum
  // spread. The band starts at the map's back edge and only widens when the
  // back edge cannot seat a full team: Nuke Town, the reference, lines its
  // spawns along the back fence and spreads them ACROSS it, and a
  // farthest-point search over a wide band would instead pull spawns toward
  // the map's middle where mutual distances are largest.
  const { minX, maxX, minZ, maxZ } = arena.bounds;
  let candidates: XZ[] = [];
  let band = OWN_END_FRACTIONS[0]!;
  for (const fraction of OWN_END_FRACTIONS) {
    band = fraction;
    candidates = [];
    for (let x = Math.ceil(minX) + 1; x <= maxX - 1; x += 1) {
      for (let z = Math.ceil(minZ) + 1; z <= maxZ - 1; z += 1) {
        const along = axis === 'x' ? (x - minX) / (maxX - minX) : (z - minZ) / (maxZ - minZ);
        if (sign < 0 ? along > fraction : along < 1 - fraction) continue;
        if (!region.has(cellKey({ x, z }, arena))) continue;
        if (admissible({ x, z })) candidates.push({ x, z });
      }
    }
    if (greedySpread([...chosen], candidates).length >= WANTED) break;
  }
  const spread = greedySpread(chosen, candidates);
  return { chosen: spread, kept, candidates: candidates.length, band };
}

/** Greedy farthest-point: each new spawn is the candidate furthest from those chosen. */
function greedySpread(chosen: XZ[], candidates: readonly XZ[]): XZ[] {
  while (chosen.length < WANTED && candidates.length > 0) {
    let best: XZ | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const nearest = chosen.length === 0 ? Infinity : Math.min(...chosen.map((point) => distance(point, candidate)));
      if (nearest < MIN_PAIR) continue;
      if (nearest > bestScore) { bestScore = nearest; best = candidate; }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

for (const [id, build] of SELECTABLE_ARENA_BUILDERS()) {
  if (ONLY && !ONLY.includes(id)) continue;
  const arena = build(new THREE.Scene());
  const before = measureSpawnLayout(id, arena);
  const authoredFails = before.failures.length > 0 || before.points.some((point) => point.failures.length > 0);
  console.log(`\n=== ${id} === authored ${authoredFails ? 'FAILS' : 'passes'} the gate`
    + (before.summary.worstOffender ? ` (worst: ${before.summary.worstOffender})` : ''));
  if (!authoredFails && !ALL) continue;

  const botArena = arenaFieldsBots(id);
  const { axis, teamSign } = separationAxis(arena);
  const pointsOfInterest = arenaPointsOfInterest(arena);
  const y = (team: 0 | 1): number => arena.spawns[team][0]?.y ?? SPAWN_EYE_HEIGHT;
  const asPoints = (points: readonly XZ[], team: 0 | 1): Point3[] => points.map((point) => ({ x: point.x, y: y(team), z: point.z }));

  // Team 0 first, reaching for the map's own interior anchors (patrol points
  // are where bots must be able to walk) and then whatever of the enemy table
  // stands on a floor.
  const enemyStanding = arena.spawns[1].filter((point) => floorBeneath(point, arena));
  const team0 = solveTeam(arena, 0, arena.spawns[1], [...pointsOfInterest, ...enemyStanding], [], axis, teamSign[0], botArena);
  // Team 1 reaches for the solved team 0 and is seeded with its mirror.
  const team1 = solveTeam(
    arena, 1, asPoints(team0.chosen, 0), asPoints(team0.chosen, 0),
    team0.chosen.map((point) => mirror(point, arena, axis)), axis, teamSign[1], botArena,
  );
  // Team 0 is re-checked against the solved team 1 (line of sight, separation).
  const recheck0 = team0.chosen.filter((point) => spawnPointFailures({ x: point.x, y: y(0), z: point.z }, arena, asPoints(team1.chosen, 1), botArena, true).length === 0);

  const proposal: Record<0 | 1, THREE.Vector3[]> = {
    0: recheck0.map((point) => new THREE.Vector3(point.x, y(0), point.z)),
    1: team1.chosen.map((point) => new THREE.Vector3(point.x, y(1), point.z)),
  };
  const after = measureSpawnLayout(id, { ...arena, spawns: proposal });
  const separation = crossTeamSeparation([proposal[0], proposal[1]], arena.bounds);
  const spread = (points: readonly XZ[]): number => {
    const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const spanZ = Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z));
    return Math.max(spanX, spanZ);
  };
  const longest = Math.max(arena.bounds.maxX - arena.bounds.minX, arena.bounds.maxZ - arena.bounds.minZ);
  console.log(`    axis ${axis}; team0 kept ${team0.kept} authored, ${team0.candidates} candidates in the back ${(team0.band * 100).toFixed(0)}%; team1 kept ${team1.kept} authored/mirrored, ${team1.candidates} candidates in the back ${(team1.band * 100).toFixed(0)}%`);
  console.log(`    proposal: ${proposal[0].length} + ${proposal[1].length} points, spread ${spread(recheck0).toFixed(1)} / ${spread(team1.chosen).toFixed(1)} m of ${longest} m, cross-team ${separation.distanceM.toFixed(1)} m (${(separation.fraction * 100).toFixed(0)}%), route step ${AUTOSTEP_M} m`);
  console.log(`    proposal gate: ${after.failures.length === 0 && after.points.every((point) => point.failures.length === 0) ? 'PASSES' : 'FAILS'}`
    + (after.summary.worstOffender ? ` (${after.summary.worstOffender})` : '')
    + `; cover max ${after.summary.maxCoverDistanceM} m, nearest visible enemy pair ${after.summary.nearestVisibleEnemyPairM ?? 'none'} m (bot arena: ${botArena}, limit ${SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM})`);
  console.log('    team0: ' + JSON.stringify(recheck0.map((p) => [p.x, p.z])));
  console.log('    team1: ' + JSON.stringify(team1.chosen.map((p) => [p.x, p.z])));
}
