/**
 * PASS 94 integration: find the two extra MIRRORED spawn pairs Raid Rebuild
 * needs to satisfy both lanes at once.
 *
 * The spawn-distribution lane (HF-456) raised this arena's floor to eight points
 * per team, and reached it by authoring two free points on each side. Raid is an
 * x mirror by contract (src/raid2-fidelity.test.ts item 16: the two flanks
 * differ in KIND, so a 180-degree rotation would demand they be equal and they
 * are not), so every team-0 point needs a team-1 partner within 2 m of its x
 * mirror - and both halves of a pair have to be legal, which the lane's picks
 * were not. This searches for pairs where BOTH halves pass.
 *
 * Read-only. Prints coordinates for a human to paste.
 *   npx tsx scripts/qa/solve-raid2-mirrored-spawns.ts
 */
import * as THREE from 'three';
import { buildRaid2 } from '../../src/raid2-arena';
import {
  arenaFieldsBots,
  floorBeneath,
  measureSpawnLayout,
  spawnPointFailures,
  walkableRegionFrom,
} from '../../src/spawn-layout-constraints';

const SPAWN_Y = 1.7;
const MIN_PAIR = 6;          // comfortably over the 3 m repo floor
const MIN_MEAN_NEAREST = 7;  // src/spawn-layout-quality.test.ts floor for raid2
const REACH_CELL_M = 1;

const arena = buildRaid2(new THREE.Scene());
const bounds = arena.bounds;
const botArena = arenaFieldsBots('raid2');

const team0 = arena.spawns[0].map((p) => ({ x: p.x, z: p.z }));
const team1 = arena.spawns[1].map((p) => ({ x: p.x, z: p.z }));
// The six authored mirror pairs; the lane's two unmirrored extras are dropped.
const base0 = team0.slice(0, 6);
const base1 = team1.slice(0, 6);
console.log('base team0: ' + JSON.stringify(base0.map((p) => [p.x, p.z])));

const cellKey = (x: number, z: number): string =>
  `${Math.round((x - bounds.minX) / REACH_CELL_M)},${Math.round((z - bounds.minZ) / REACH_CELL_M)}`;
const origin = { x: base0[0]!.x, y: SPAWN_Y, z: base0[0]!.z };
const region = walkableRegionFrom(origin, bounds, arena.colliders);
console.log('walkable cells reachable from a legal spawn: ' + region.size);

function legal(x: number, z: number, enemies: readonly { x: number; z: number }[]): boolean {
  const point = { x, y: SPAWN_Y, z };
  if (!region.has(cellKey(x, z))) return false;
  if (!floorBeneath(point, arena)) return false;
  return spawnPointFailures(
    point, arena,
    enemies.map((e) => ({ x: e.x, y: SPAWN_Y, z: e.z })),
    botArena, true,
  ).length === 0;
}

type Pair = { x: number; z: number };
/**
 * The cross-team separation this arena already has is 64 m: the innermost
 * authored pair sits at |x| = 32, and a mirrored point at x contributes 2|x|.
 * `measureSpawnLayout` reports `teams-too-close` on the MINIMUM, so a new pair
 * inboard of |x| = 32 would shrink a number the ratchet says may only grow.
 */
const MIN_OWN_SIDE_X = 32;

const pairs: Pair[] = [];
for (let x = Math.ceil(bounds.minX + 1); x <= -MIN_OWN_SIDE_X; x += 1) {
  for (let z = Math.ceil(bounds.minZ + 1); z <= Math.floor(bounds.maxZ - 1); z += 1) {
    if (!legal(x, z, base1)) continue;
    if (!legal(-x, z, base0)) continue;   // the partner has to be real too
    if (base0.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_PAIR)) continue;
    if (base1.some((p) => Math.hypot(p.x + x, p.z - z) < MIN_PAIR)) continue;
    pairs.push({ x, z });
  }
}
console.log('mirrorable candidate cells: ' + pairs.length);

function meanNearest(points: readonly Pair[]): number {
  const values = points.map((p, i) => Math.min(...points
    .filter((_, j) => j !== i)
    .map((q) => Math.hypot(p.x - q.x, p.z - q.z))));
  return values.reduce((s, v) => s + v, 0) / values.length;
}
function spanFraction(points: readonly Pair[]): number {
  const longest = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const spanZ = Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z));
  return Math.max(spanX, spanZ) / longest;
}

let best: { a: Pair; b: Pair; mean: number; span: number } | null = null;
for (let i = 0; i < pairs.length; i += 1) {
  for (let j = i + 1; j < pairs.length; j += 1) {
    const a = pairs[i]!;
    const b = pairs[j]!;
    if (Math.hypot(a.x - b.x, a.z - b.z) < MIN_PAIR) continue;
    const set = [...base0, a, b];
    const mean = meanNearest(set);
    if (mean < MIN_MEAN_NEAREST) continue;
    const span = spanFraction(set);
    if (span < 0.18) continue;
    // HF-456 is about spawns clustering, so SPREAD is the objective and the
    // 7 m mean nearest-neighbour is the constraint - not the other way round.
    if (best !== null && (span < best.span || (span === best.span && mean <= best.mean))) continue;
    // Re-check on the REAL machinery, with the full mirrored enemy table rather
    // than the six base points: line of sight is decided by the whole set.
    const candidate0 = set.map((p) => new THREE.Vector3(p.x, SPAWN_Y, p.z));
    const candidate1 = [...base1, { x: -a.x, z: a.z }, { x: -b.x, z: b.z }]
      .map((p) => new THREE.Vector3(p.x, SPAWN_Y, p.z));
    const check = measureSpawnLayout('raid2', {
      ...arena, spawns: { 0: candidate0, 1: candidate1 } as never,
    });
    if (check.failures.length > 0) continue;
    if (check.points.some((point) => point.failures.length > 0 || !point.reachable || point.floorGapM === null)) continue;
    // src/raid2-fidelity.test.ts item 18: NO spawn may see an enemy spawn at
    // any range. `spawnPointFailures` only fires under 30 m, so this is the
    // stricter of the two and the one that decides.
    if (check.summary.enemyLosPairs !== 0) continue;
    best = { a, b, mean, span };
  }
}
if (!best) {
  console.log('NO LEGAL MIRRORED PAIR FOUND');
  process.exit(1);
}
const new0 = [...base0, best.a, best.b];
const new1 = [...base1, { x: -best.a.x, z: best.a.z }, { x: -best.b.x, z: best.b.z }];
console.log('team0 mean nearest ' + meanNearest(new0).toFixed(2) + ' m, spread ' + spanFraction(new0).toFixed(3));
console.log('team1 mean nearest ' + meanNearest(new1).toFixed(2) + ' m, spread ' + spanFraction(new1).toFixed(3));
console.log('team0: ' + new0.map((p) => `[${p.x}, ${p.z}]`).join(', '));
console.log('team1: ' + new1.map((p) => `[${p.x}, ${p.z}]`).join(', '));

const proposal = {
  0: new0.map((p) => new THREE.Vector3(p.x, SPAWN_Y, p.z)),
  1: new1.map((p) => new THREE.Vector3(p.x, SPAWN_Y, p.z)),
} as const;
const report = measureSpawnLayout('raid2', { ...arena, spawns: proposal as never });
const bad = report.points.filter((p) => p.failures.length > 0 || !p.reachable || p.floorGapM === null);
console.log('measureSpawnLayout: ' + report.points.length + ' points, ' + bad.length + ' bad'
  + ' | layout failures: ' + (report.failures.length ? report.failures.join(',') : 'none'));
for (const p of bad) console.log('  BAD team ' + p.team + ' (' + p.x + ', ' + p.z + '): ' + p.failures.join(','));
