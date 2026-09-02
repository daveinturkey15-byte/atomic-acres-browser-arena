// Lane R (PASS 85): proposes a farcrysis spawn table that passes the HF-402
// constraint set, and measures the authored one against it.
//
//   npx tsx scripts/qa/solve-farcrysis-spawns.ts [--out artifacts/.../spawns.json]
//
// Why farcrysis needs its own solver rather than
// `scripts/qa/solve-spawn-layouts.ts` (Lane D's, unchanged here):
//
// That solver takes ONE y for a whole team - `arena.spawns[team][0].y` - because
// every arena it was written for has a flat floor. farcrysis does not: its
// ground is the analytic field `farcrysisTerrainHeight(x, z)`, which runs from
// the interior plateau down through the wade shelf to the sea floor. The
// authored table pinned all eight points at the shared `spawnRecord` height of
// y = 1.7, i.e. feet at y = 0, and the runtime uses that y VERBATIM
// (`player.position.copy(spawnPoint()); characterPhysics.teleportEye(...)` in
// legacy-main). Measured before this script existed, with
// `measure-spawn-layouts.ts --arenas farcrysis`:
//
//     farcrysis  8 spawns, in-envelope 0% - floor 0/8, every point 'no-floor'
//
// - i.e. not one of the eight stood on the island. So each candidate here
// carries its OWN y, resolved through the terrain authority, and every other
// rule is the shared one from src/spawn-layout-constraints.ts: nothing is
// weakened, the extra freedom is only in the vertical.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { isBlocked, type Point3 } from '../../src/collision';
import { buildFarcrysis } from '../../src/farcrysis';
import {
  FARCRYSIS_WATER_LEVEL,
  farcrysisFloorGapBeneath,
  farcrysisTerrainHeight,
} from '../../src/farcrysis-terrain-authority';
import {
  SPAWN_EYE_HEIGHT,
  SPAWN_LAYOUT_THRESHOLDS,
  arenaFieldsBots,
  measureSpawnLayout,
  openArcFraction,
  spawnPointFailures,
  walkableRegionFrom,
  wallStandoffDistance,
} from '../../src/spawn-layout-constraints';

/**
 * The shared `spawnPointFailures` reports 'no-floor' for every point on this
 * island: its `floorBeneath` skips rotated boxes and farcrysis's ground is
 * 5,474 rotated tangent-plane slabs. The floor is therefore measured here with
 * `farcrysisFloorGapBeneath`, against those plates, using the same segment and
 * the same tolerances - and NOTHING else is dropped: every other rule comes
 * back from the shared function unchanged and a candidate must pass all of
 * them. `docs/evidence/pass85/lane-r/spawn-layout-constraints-rotated-plate-floor.patch`
 * removes the need for this once it lands in that (Lane D-owned) module.
 */
function failuresFor(eye: Point3, enemies: readonly Point3[], arena: ReturnType<typeof buildFarcrysis>, botArena: boolean): string[] {
  const failures = spawnPointFailures(eye, arena, enemies, botArena, true)
    .filter((failure) => failure !== 'no-floor');
  if (farcrysisFloorGapBeneath(eye, arena.physicsColliders) === null) failures.push('no-floor');
  // `spawnPointFailures` only reaches the standoff and open-arc rules when
  // nothing cheaper failed - and on this arena 'no-floor' ALWAYS fails, so
  // those two are never reached from inside it. Applying them here, with the
  // module's own functions and thresholds, is the whole reason the first run of
  // this solver proposed a point 0.54 m off a view-blocking face.
  if (failures.length === 0) {
    if (wallStandoffDistance(eye, arena.colliders) < SPAWN_LAYOUT_THRESHOLDS.minimumWallStandoffM) failures.push('wall-in-the-face');
    else if (openArcFraction(eye, arena.colliders) < SPAWN_LAYOUT_THRESHOLDS.minimumOpenArcFraction) failures.push('boxed-in');
  }
  return failures;
}

const argv = process.argv.slice(2);
const arg = (name: string): string | null => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : null;
};
const OUT = arg('--out');

/** Comfortably above the gate's 3 m floor, as Lane D's solver uses. */
const MIN_PAIR = 6;
/** Points wanted per team. The gate's minimum is 4. */
const WANTED = 6;
/**
 * Dry land only. A spawn whose ground is at or below the water line puts the
 * player in the wade shelf on the respawn frame; 1.2 m of freeboard keeps the
 * feet out of the surf at every tide phase the water system animates.
 */
const DRY_FREEBOARD_M = 1.2;
/**
 * The authored table splits the two teams across the NW/SE diagonal. That
 * intent is kept: the separation coordinate is u = (x + z) / 2, so team 0 owns
 * u <= -BAND and team 1 owns u >= +BAND.
 *
 * |grad u| = 1/sqrt(2), so the narrowest possible cross-team distance is
 * 2 * BAND * sqrt(2). The layout gate wants 0.33 of the 128 m longer axis =
 * 42.24 m, i.e. BAND >= 14.93; 14 measured 39.7 m and failed
 * `teams-too-close`. 17 gives 48.1 m, a margin that survives the solver
 * choosing points off the diagonal itself.
 */
const DIAGONAL_BAND_M = 17;
/** Search step over the island, in metres. */
const STEP_M = 2;

type XZ = { x: number; z: number };

function eyeAt(point: XZ): Point3 {
  return { x: point.x, y: farcrysisTerrainHeight(point.x, point.z) + SPAWN_EYE_HEIGHT, z: point.z };
}

function distance(a: XZ, b: XZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const scene = new THREE.Scene();
const arena = buildFarcrysis(scene);
const botArena = arenaFieldsBots('farcrysis');

const before = measureSpawnLayout('farcrysis', arena);
console.log(`authored: ${before.summary.spawnCount} spawns, in-envelope ${before.summary.inEnvelopePercent}% `
  + `(floor ${before.summary.floorPercent}%, reach ${before.summary.reachablePercent}%), worst: ${before.summary.worstOffender ?? 'none'}`);

// The walkable region is flood-filled once over the island: `colliders`
// carries the props only (farcrysis keeps its ground plates in
// `physicsColliders` on purpose), so a single fill covers the whole playfield.
//
// The seed is NOT (0, 0): the ruined core stands there, and a fill started
// inside it returns exactly 1 cell. It is the dry, floored cell nearest the
// centre that a standing player is not blocked at - measured, not assumed.
function fillSeed(): Point3 {
  let best: Point3 | null = null;
  let bestRadius = Infinity;
  for (let x = arena.bounds.minX + STEP_M; x <= arena.bounds.maxX - STEP_M; x += STEP_M) {
    for (let z = arena.bounds.minZ + STEP_M; z <= arena.bounds.maxZ - STEP_M; z += STEP_M) {
      if (farcrysisTerrainHeight(x, z) < FARCRYSIS_WATER_LEVEL + DRY_FREEBOARD_M) continue;
      const radius = Math.hypot(x, z);
      if (radius >= bestRadius) continue;
      const eye = eyeAt({ x, z });
      if (farcrysisFloorGapBeneath(eye, arena.physicsColliders) === null) continue;
      if (isBlocked({ x, y: eye.y, z }, arena.colliders, 0.44)) continue;
      best = eye;
      bestRadius = radius;
    }
  }
  if (!best) throw new Error('farcrysis: no dry, floored, unblocked cell to seed the walkable fill from');
  return best;
}
const seed = fillSeed();
console.log(`fill seed: (${seed.x}, ${seed.z}) eye y ${seed.y.toFixed(2)}`);
const region = walkableRegionFrom(seed, arena.bounds, arena.colliders);
console.log(`walkable region: ${region.size} cells`);
const cellKey = (point: XZ): string => `${Math.round(point.x - arena.bounds.minX)},${Math.round(point.z - arena.bounds.minZ)}`;

/** Every dry, walkable, in-region cell, with its own terrain-resolved eye height. */
const grid: Array<{ xz: XZ; eye: Point3; u: number }> = [];
for (let x = arena.bounds.minX + STEP_M; x <= arena.bounds.maxX - STEP_M; x += STEP_M) {
  for (let z = arena.bounds.minZ + STEP_M; z <= arena.bounds.maxZ - STEP_M; z += STEP_M) {
    const ground = farcrysisTerrainHeight(x, z);
    if (ground < FARCRYSIS_WATER_LEVEL + DRY_FREEBOARD_M) continue;
    const xz = { x, z };
    if (!region.has(cellKey(xz))) continue;
    const eye = eyeAt(xz);
    if (farcrysisFloorGapBeneath(eye, arena.physicsColliders) === null) continue;
    grid.push({ xz, eye, u: (x + z) / 2 });
  }
}
console.log(`grid: ${grid.length} dry walkable candidate cells (step ${STEP_M} m, freeboard ${DRY_FREEBOARD_M} m)`);

/**
 * Greedy farthest-point over the admissible cells of one team's diagonal end.
 * `enemies` is whatever of the opposing table is already fixed; the second team
 * is solved against the first, then the first is re-checked against the second,
 * exactly as Lane D's solver does.
 */
function solveTeam(team: 0 | 1, enemies: readonly Point3[], seeds: readonly Point3[] = []): Point3[] {
  const sign = team === 0 ? -1 : 1;
  const pool = grid.filter((cell) => sign * cell.u >= DIAGONAL_BAND_M);
  const admissible = pool.filter((cell) => failuresFor(cell.eye, enemies, arena, botArena).length === 0);
  console.log(`  team ${team}: ${pool.length} cells on its end, ${admissible.length} pass every rule`);
  // Bootstrap on the FURTHEST-APART admissible pair, then greedy
  // farthest-point. Seeding on a single corner cell instead (the obvious
  // choice) gave team 0 a 20 m span of a 128 m map - under the layout gate's
  // 0.18 spread fraction - because the NW half's admissible set is a narrow
  // shelf and the greedy walk never reached both of its ends.
  const chosen: Point3[] = [];
  let widest = -Infinity;
  // Seeds (the mirrored partner's points) come first and are kept as long as
  // they hold the pair spacing: the arena is authored rotationally symmetric
  // about the core and every mirror that survives every rule keeps it so.
  for (const seed of seeds) {
    if (chosen.every((existing) => distance(existing, seed) >= MIN_PAIR)) chosen.push(seed);
  }
  if (chosen.length > 0) widest = chosen.length < 2 ? 0 : Math.max(
    ...chosen.flatMap((a, i) => chosen.slice(i + 1).map((b) => distance(a, b))),
  );
  if (chosen.length === 0) {
    for (let left = 0; left < admissible.length; left += 1) {
      for (let right = left + 1; right < admissible.length; right += 1) {
        const span = distance(admissible[left]!.xz, admissible[right]!.xz);
        if (span <= widest) continue;
        widest = span;
        chosen.length = 0;
        chosen.push(admissible[left]!.eye, admissible[right]!.eye);
      }
    }
  }
  while (chosen.length > 0 && chosen.length < WANTED) {
    let best: Point3 | null = null;
    let bestScore = -Infinity;
    for (const cell of admissible) {
      const nearest = Math.min(...chosen.map((point) => distance(point, cell.xz)));
      if (nearest < MIN_PAIR) continue;
      if (nearest > bestScore) { bestScore = nearest; best = cell.eye; }
    }
    if (!best) break;
    chosen.push(best);
  }
  console.log(`  team ${team}: widest admissible pair ${widest.toFixed(1)} m`);
  return chosen;
}

const team0 = solveTeam(0, arena.spawns[1]);
// The arena was authored rotationally symmetric about the core (src/farcrysis.test.ts
// pins it), so team 1 is team 0 rotated 180 degrees where the terrain allows
// it - the ground field is NOT symmetric, so each mirror still has to pass
// every rule on its own. Any mirror that does not is replaced by a solved
// point, and the run says which.
const mirrored = team0
  .map((point) => ({ x: -point.x, z: -point.z }))
  // Mirrors skip the candidate grid, so they have to be held to the same two
  // conditions the grid applies before the rule set runs: dry land, and inside
  // the one walkable region. Without the dry-land check the mirror of a ridge
  // spawn landed at 0.73 m, inside the wade shelf.
  .filter((xz) => farcrysisTerrainHeight(xz.x, xz.z) >= FARCRYSIS_WATER_LEVEL + DRY_FREEBOARD_M)
  .filter((xz) => region.has(cellKey(xz)))
  .map((xz) => eyeAt(xz))
  .filter((eye) => failuresFor(eye, team0, arena, botArena).length === 0);
console.log(`  team 1 mirrors: ${mirrored.length} of ${team0.length} team-0 points mirror onto admissible ground`);
const team1 = solveTeam(1, team0, mirrored);
const recheck0 = team0.filter((point) => failuresFor(point, team1, arena, botArena).length === 0);

const proposal: Record<0 | 1, THREE.Vector3[]> = {
  0: recheck0.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
  1: team1.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
};
const after = measureSpawnLayout('farcrysis', { ...arena, spawns: proposal });

console.log(`\nproposal: ${after.summary.spawnCount} spawns, in-envelope ${after.summary.inEnvelopePercent}% `
  + `(floor ${after.summary.floorPercent}%, reach ${after.summary.reachablePercent}%), POI median ${after.summary.medianPoiDistanceM} m, `
  + `cover max ${after.summary.maxCoverDistanceM} m, standoff min ${after.summary.minWallStandoffM} m, `
  + `open arc min ${after.summary.minOpenArcFraction}, cross-team min ${after.summary.crossTeamMinDistanceM} m `
  + `(${after.summary.crossTeamMinFraction} of the longer axis), enemy-LOS pairs ${after.summary.enemyLosPairs}`);
for (const point of after.points) {
  console.log(`  team ${point.team}  [${point.x.toFixed(1)}, ${point.z.toFixed(1)}]  eye y ${point.y.toFixed(2)}  `
    + `plate-floor ${(() => { const gap = farcrysisFloorGapBeneath({ x: point.x, y: point.y, z: point.z }, arena.physicsColliders); return gap === null ? 'NONE' : gap.toFixed(2); })()}  `
    + `cover ${point.coverDistanceM.toFixed(1)}  poi ${point.poiDistanceM.toFixed(1)}  standoff ${point.wallStandoffM.toFixed(2)}  `
    + `arc ${point.openArcFraction.toFixed(2)}  `
    + `${(() => { const f = failuresFor({ x: point.x, y: point.y, z: point.z }, proposal[point.team === 0 ? 1 : 0], arena, botArena); return f.length === 0 ? 'ok' : f.join(','); })()}`);
}
const longestAxis = Math.max(arena.bounds.maxX - arena.bounds.minX, arena.bounds.maxZ - arena.bounds.minZ);
for (const team of [0, 1] as const) {
  const points = proposal[team];
  const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const spanZ = Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z));
  const fraction = Math.max(spanX, spanZ) / longestAxis;
  // src/spawn-layout-quality.test.ts: MINIMUM_SPREAD_FRACTION = 0.18.
  console.log(`  team ${team} spread: ${Math.max(spanX, spanZ).toFixed(1)} m = ${fraction.toFixed(3)} of the longer axis `
    + `(gate floor 0.18) -> ${fraction >= 0.18 ? 'ok' : 'FAILS'}`);
}
console.log(`  layout failures: ${after.failures.length === 0 ? 'none' : after.failures.join(', ')}`);

const source = (team: 0 | 1): string => proposal[team]
  .map((point) => `      [${point.x.toFixed(0)}, ${point.z.toFixed(0)}],`)
  .join('\n');
console.log('\n// paste into src/farcrysis.ts (x, z only - y comes from the terrain authority)\n'
  + `    [\n${source(0)}\n    ],\n    [\n${source(1)}\n    ],`);

if (OUT) {
  const path = resolve(process.cwd(), OUT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), before, after, proposal }, null, 2));
  console.log(`\nwrote ${path}`);
}
