/**
 * PASS 94 integration: re-derive the Nuke Town Rebuild spawn table so it
 * satisfies BOTH lanes' gates at once.
 *
 * Two lanes edited NUKETOWN2_SPAWN_LAYOUT from the same base and their gates
 * disagreed on the merged head:
 *   - the spawn-distribution lane (HF-456) raised src/spawn-layout-quality.test.ts'
 *     floor for this arena to 8 points per team with a 7 m mean nearest-neighbour,
 *     and reached it by adding two points at |z| = 40;
 *   - the Nuke Town lane's src/nuketown2-fidelity.test.ts requires every spawn to
 *     stand INSIDE the fenced back yard (|z| < 36). |z| = 40 is the border path,
 *     which is the flank route rather than a spawn room.
 * Neither number may be weakened, so the table is re-solved against the union of
 * the two constraint sets rather than one lane picking the other's lock.
 *
 * Read-only. It prints an authored-frame table for a human to paste.
 *   npx tsx scripts/qa/solve-nuketown2-spawn-layout.ts
 */
import * as THREE from 'three';
import { isBlocked } from '../../src/collision';
import type { ArenaMap } from '../../src/map';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_SECTION,
  NUKETOWN2_STREET_LENGTH,
  NUKETOWN2_SPAWN_LAYOUT,
  buildNuketown2,
} from '../../src/nuketown2-arena';
import { NUKETOWN2_HOUSE_LAYOUT, nuketown2HandedX } from '../../src/nuketown2-layout';
import { shedPlacementsForArena } from '../../src/destructible-shed-registry';
import { arenaFieldsBots, measureSpawnLayout, spawnPointFailures } from '../../src/spawn-layout-constraints';
import { validArenaSpawnPoint } from '../../src/spawn-safety';

const PLAYER_RADIUS = 0.44;
const L = NUKETOWN2_STREET_LENGTH;
const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
const backWall = NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth + NUKETOWN2_SECTION.houseDepth;
const fence = backWall + NUKETOWN2_SECTION.yardDepth;
const furthestLegalYardCorner = Math.hypot(width / 2, fence);
const MIN_PAIR = 4.5;          // the Nuke Town lane's own spacing brief (gate floor is 3)
const MIN_MEAN_NEAREST = 7.5;    // src/spawn-layout-quality.test.ts floor is 7; 0.5 m of margin is deliberate
const MIN_SPREAD = 0.18;       // ditto
const SHED_CLEARANCE = 5.5;    // the Nuke Town lane's own search criterion
const WANTED = 8;

const scene = new THREE.Scene();
const map: ArenaMap = buildNuketown2(scene);
map.root.updateMatrixWorld(true);

const eyeColliders = map.colliders.filter((b) => {
  const minY = b.minY ?? 0;
  const maxY = b.maxY ?? minY + 3;
  return 1.65 > minY && 1.65 < maxY;
});

function clearLine(from: readonly [number, number], to: readonly [number, number]): boolean {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const steps = Math.ceil(Math.hypot(dx, dz) * 4);
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    const x = from[0] + dx * t;
    const z = from[1] + dz * t;
    for (const b of eyeColliders) {
      if (x > b.minX - 0.05 && x < b.maxX + 0.05 && z > b.minZ - 0.05 && z < b.maxZ + 0.05) return false;
    }
  }
  return true;
}

const perimeter: Array<[number, number]> = [];
for (let x = NUKETOWN2_BOUNDS.minX + 1; x <= NUKETOWN2_BOUNDS.maxX - 1; x += 2) {
  perimeter.push([x, NUKETOWN2_BOUNDS.minZ + 1], [x, NUKETOWN2_BOUNDS.maxZ - 1]);
}
for (let z = NUKETOWN2_BOUNDS.minZ + 1; z <= NUKETOWN2_BOUNDS.maxZ - 1; z += 2) {
  perimeter.push([NUKETOWN2_BOUNDS.minX + 1, z], [NUKETOWN2_BOUNDS.maxX - 1, z]);
}

function exposure(p: readonly [number, number]): number {
  let longest = 0;
  for (const sample of perimeter) {
    const metres = Math.hypot(sample[0] - p[0], sample[1] - p[1]);
    if (metres > longest && clearLine(p, sample)) longest = metres;
  }
  return longest;
}

function planCentre(suffix: string): { x: number; z: number } {
  let found: THREE.Mesh | undefined;
  map.root.traverse((node) => {
    if (found === undefined && node instanceof THREE.Mesh && node.name.endsWith(suffix)) found = node;
  });
  if (!found) throw new Error('mesh not found: ' + suffix);
  const box = new THREE.Box3().setFromObject(found);
  return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
}

const houseCentre = planCentre('north house roof deck');
const garageCentre = planCentre('north garage roof');
const house = NUKETOWN2_HOUSE_LAYOUT[0]!;
const sheds = shedPlacementsForArena('nuketown2').map((s) => [s.position.x, s.position.z] as const);

type Cand = { x: number; z: number; exposure: number };
const candidates: Cand[] = [];
for (let x = Math.ceil(NUKETOWN2_BOUNDS.minX + PLAYER_RADIUS); x <= Math.floor(NUKETOWN2_BOUNDS.maxX - PLAYER_RADIUS); x += 1) {
  for (let z = -fence + 1; z <= -backWall - 1; z += 1) {
    const p = [x, z] as const;
    if (!(z < -backWall && z > -fence)) continue;
    const radius = Math.hypot(x, z);
    if (!(radius < furthestLegalYardCorner && radius > backWall)) continue;
    if (isBlocked({ x, y: 1.7, z }, map.colliders, PLAYER_RADIUS)) continue;
    if (!validArenaSpawnPoint({ x, y: 1.7, z }, map.bounds, map.colliders as never)) continue;
    if (sheds.some(([sx, sz]) => Math.hypot(sx - x, sz - z) <= SHED_CLEARANCE)) continue;
    // Behind your own house, and the garage on your RIGHT (HF-473).
    const forward = { x: houseCentre.x - x, z: houseCentre.z - z };
    if (Math.sign(forward.z) !== house.facing) continue;
    const right = { x: -forward.z, z: forward.x };
    const toGarage = { x: garageCentre.x - x, z: garageCentre.z - z };
    if (toGarage.x * right.x + toGarage.z * right.z <= 0) continue;
    // Reachability is asserted on the FINAL set through measureSpawnLayout,
    // which walks the real autostep flood fill; passing `true` here only keeps
    // the per-cell filter cheap.
    if (spawnPointFailures({ x, y: 1.7, z }, map, map.spawns[1]!, arenaFieldsBots('nuketown2'), true).length > 0) continue;
    const e = exposure(p);
    if (!(e >= 0.5 * L && e <= L)) continue;
    candidates.push({ x, z, exposure: e });
  }
}
console.log('admissible yard cells: ' + candidates.length);

/** No spawn may see ANY enemy spawn; the enemy table is this one negated. */
function seesEnemy(set: readonly Cand[]): boolean {
  for (const a of set) {
    for (const b of set) {
      if (clearLine([a.x, a.z], [-b.x, -b.z])) return true;
    }
  }
  return false;
}

function meanNearest(set: readonly Cand[]): number {
  const values = set.map((p, i) => Math.min(...set.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.z - q.z))));
  return values.reduce((s, v) => s + v, 0) / values.length;
}
function minPair(set: readonly Cand[]): number {
  let m = Infinity;
  for (let i = 0; i < set.length; i += 1) {
    for (let j = i + 1; j < set.length; j += 1) m = Math.min(m, Math.hypot(set[i]!.x - set[j]!.x, set[i]!.z - set[j]!.z));
  }
  return m;
}
function spread(set: readonly Cand[]): number {
  const longestAxis = Math.max(NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX, NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ);
  const spanX = Math.max(...set.map((p) => p.x)) - Math.min(...set.map((p) => p.x));
  const spanZ = Math.max(...set.map((p) => p.z)) - Math.min(...set.map((p) => p.z));
  return Math.max(spanX, spanZ) / longestAxis;
}
function meanDepth(set: readonly Cand[]): number {
  // Distance from the road: the owner's other complaint is spawns sitting too far back.
  return set.reduce((s, p) => s + (Math.abs(p.z) - NUKETOWN2_SECTION.streetHalfWidth), 0) / set.length;
}

/**
 * The Nuke Town lane's own search, with the spawn lane's floors added as HARD
 * constraints rather than as a new objective. Its recorded scoring order is:
 * zero spawn-to-spawn sightlines, >= 24 m x-spread and >= 6 m z-spread, 4.5 m
 * spacing - all hard - then LOWEST WORST EXPOSURE, then SHALLOWEST MEAN DEPTH,
 * because the other half of the owner's complaint is that the spawns sit too
 * far back. The additions are `WANTED = 8` and `meanNearest >= 7`.
 */
const MIN_X_SPREAD = 24;
const MIN_Z_SPREAD = 6;
function spanX(set: readonly Cand[]): number { return Math.max(...set.map((p) => p.x)) - Math.min(...set.map((p) => p.x)); }
function spanZ(set: readonly Cand[]): number { return Math.max(...set.map((p) => p.z)) - Math.min(...set.map((p) => p.z)); }
function worstExposure(set: readonly Cand[]): number { return Math.max(...set.map((p) => p.exposure)); }

let seed = 20260904;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

let best: { set: Cand[]; minPair: number; mean: number; depth: number; worst: number } | null = null;
const ATTEMPTS = 400_000;
for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
  const set: Cand[] = [candidates[Math.floor(rand() * candidates.length)]!];
  while (set.length < WANTED) {
    const legal = candidates.filter((c) => set.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= MIN_PAIR));
    if (legal.length === 0) break;
    set.push(legal[Math.floor(rand() * legal.length)]!);
  }
  if (set.length < WANTED) continue;
  if (meanNearest(set) < MIN_MEAN_NEAREST) continue;
  if (spread(set) < MIN_SPREAD) continue;
  if (spanX(set) < MIN_X_SPREAD || spanZ(set) < MIN_Z_SPREAD) continue;
  const worst = worstExposure(set);
  const depth = meanDepth(set);
  if (best !== null && (worst > best.worst + 1e-9 || (Math.abs(worst - best.worst) < 1e-9 && depth >= best.depth))) continue;
  if (seesEnemy(set)) continue;
  best = { set, minPair: minPair(set), mean: meanNearest(set), depth, worst };
}

if (!best) {
  console.log('NO LEGAL 8-POINT SET inside the fenced yard.');
  process.exit(1);
}
const ordered = [...best.set].sort((a, b) => (Math.abs(a.z) - Math.abs(b.z)) || (a.x - b.x));
console.log('min pair ' + best.minPair.toFixed(2) + ' m, mean nearest ' + best.mean.toFixed(2)
  + ' m, spread ' + spread(ordered).toFixed(3) + ', mean distance from road ' + best.depth.toFixed(1) + ' m');
console.log('worst exposure ' + Math.max(...ordered.map((p) => p.exposure)).toFixed(1)
  + ' m, best ' + Math.min(...ordered.map((p) => p.exposure)).toFixed(1)
  + ' m (band ' + (0.5 * L).toFixed(0) + '-' + L + ')');
console.log('WORLD frame team 0: ' + JSON.stringify(ordered.map((p) => [p.x, p.z])));
// The table in the arena file is AUTHORED frame; the export mirrors it through
// nuketown2HandedX, which is an involution, so inverting is the same call.
console.log('AUTHORED frame team 0:');
console.log('  ' + ordered.map((p) => '[' + nuketown2HandedX(p.x) + ', ' + p.z + '] as const').join(', '));
console.log('AUTHORED frame team 1:');
console.log('  ' + ordered.map((p) => '[' + (-nuketown2HandedX(p.x)) + ', ' + (-p.z) + '] as const').join(', '));
console.log('current shipped world team 0: ' + JSON.stringify(NUKETOWN2_SPAWN_LAYOUT[0]));

// Final validation on the REAL constraint machinery: the autostep flood fill,
// cover, standoff and cross-team separation, on both teams at once.
const proposal = {
  0: ordered.map((p) => new THREE.Vector3(p.x, 1.7, p.z)),
  1: ordered.map((p) => new THREE.Vector3(-p.x, 1.7, -p.z)),
} as const;
const report = measureSpawnLayout('nuketown2', { ...map, spawns: proposal as never });
const bad = report.points.filter((p) => p.failures.length > 0 || !p.reachable || p.floorGapM === null);
console.log('measureSpawnLayout: ' + report.points.length + ' points, '
  + bad.length + ' with failures/unreachable/no-floor'
  + (report.failures.length ? ' | layout failures: ' + report.failures.join(',') : ' | layout failures: none'));
for (const p of bad) console.log('  BAD team ' + p.team + ' (' + p.x + ', ' + p.z + '): ' + p.failures.join(',') + (p.reachable ? '' : ' unreachable'));

