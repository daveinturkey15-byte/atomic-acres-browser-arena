/**
 * RAID2: mechanical VERTICAL reachability instrument (HF-408 repair pass).
 *
 * WHY THIS EXISTS, AND WHY THE LAYOUT INSTRUMENT COULD NOT DO IT.
 *
 * `scripts/qa/raid2-layout-metrics.ts` is a 2D ground-level rasteriser. It is
 * the right instrument for the owner's complaint ("loads of walls") and it is
 * deliberately blind to the second storey: it counts a first-floor slab as
 * overhead mass and never asks whether a player can get on top of it. That
 * blindness shipped a real defect. Three of raid2's four upper rooms were
 * physically unreachable - two stairwells were emitted with an unbroken slab
 * over the treads (0.138 m of headroom against a 1.82 m standing and a 1.16 m
 * crouch capsule) and a third stair had its bottom riser buried inside a solid
 * wall - while every band in the fidelity gate stayed green, because none of
 * them looks up.
 *
 * So this module answers exactly one question, mechanically: STARTING FROM THE
 * SPAWN TABLE, WHICH STANDABLE SURFACES IN THIS ARENA CAN A PLAYER ACTUALLY
 * GET TO? It is deliberately OPTIMISTIC - it point-samples surfaces rather than
 * sweeping a capsule, so it is more permissive than the physics. Anything it
 * calls unreachable is unreachable for certain; anything it calls reachable is
 * reachable unless the capsule sweep says otherwise.
 *
 * THE GRID PITCH IS LOAD-BEARING. 0.25 m, not the layout instrument's 0.5 m,
 * for a mechanical reason: `stairRun` authors 0.45 m treads, and a 0.5 m
 * lattice can miss a 0.45 m tread entirely, which turns one 0.378 m riser into
 * an apparent 0.756 m step and reports a perfectly good stair as sealed. A
 * closed interval of 0.45 m always contains a point of a 0.25 m lattice, so at
 * this pitch every tread is sampled. (The centres also never land exactly on a
 * tread boundary for any of raid2's four runs: 25k - 45j = <non-integer> has no
 * solution for each of them.)
 *
 * CLI: npx tsx scripts/qa/raid2-reachability.ts
 */
import type { Box2 } from '../../src/collision';
import type { ArenaMap } from '../../src/map';
import { CHARACTER_PHYSICS_CONFIG, STANCE_SHAPES } from '../../src/physics';

/** Grid pitch. See the header: it must be finer than one stair tread. */
export const CELL_M = 0.25;
/** The controller's real autostep. A step taller than this is not walked up. */
export const AUTOSTEP_M = CHARACTER_PHYSICS_CONFIG.autostepHeight;
/** Full standing capsule height: 2 * (halfHeight + radius). */
export const STAND_CAPSULE_M = 2 * (STANCE_SHAPES.stand.halfHeight + STANCE_SHAPES.stand.radius);
/** Full crouch capsule height, reported so "sealed" can be told from "crawlable". */
export const CROUCH_CAPSULE_M = 2 * (STANCE_SHAPES.crouch.halfHeight + STANCE_SHAPES.crouch.radius);
/** A surface and the collider resting on it are not the same contact. */
const SURFACE_EPS = 0.02;
/** Surfaces outside this band are not floors (basins below, roofs above). */
const MIN_SURFACE_Y = -2;
const MAX_SURFACE_Y = 6;
/** Spatial index pitch. Only affects speed. */
const BUCKET_M = 4;

export type ReachRegion = {
  id: string;
  label: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Surface band this region occupies. Defaults to the first-floor band. */
  minY?: number;
  maxY?: number;
};

export type ReachRegionResult = {
  id: string;
  label: string;
  standableCells: number;
  reachableCells: number;
  /** Reachable / standable. 0 means the room is sealed. */
  reachableFraction: number;
  /** Standable only if the capsule is crouched. Tells "tight" from "sealed". */
  crouchOnlyCells: number;
};

export type ReachPatrolResult = {
  x: number;
  y: number;
  z: number;
  surfaces: number[];
  reachable: boolean;
};

export type ReachabilityReport = {
  id: string;
  cellM: number;
  autostepM: number;
  standCapsuleM: number;
  standableNodes: number;
  reachableNodes: number;
  regions: ReachRegionResult[];
  patrolPoints: ReachPatrolResult[];
  /** Patrol points a bot is told to walk to and no traversal reaches. */
  unreachablePatrolPoints: string[];
};

type ColliderLike = Box2;

function spanY(box: ColliderLike): { minY: number; maxY: number } {
  return { minY: box.minY ?? -0.5, maxY: box.maxY ?? 8 };
}

/**
 * Standable surfaces, reachability by autostep-connected flood fill from the
 * spawn table, and the per-region roll-up. One pass, no browser, no physics
 * engine: the same authoritative colliders the game builds.
 */
export function measureReachability(arena: ArenaMap, regions: readonly ReachRegion[]): ReachabilityReport {
  const bounds = arena.bounds;
  const nx = Math.max(1, Math.round((bounds.maxX - bounds.minX) / CELL_M));
  const nz = Math.max(1, Math.round((bounds.maxZ - bounds.minZ) / CELL_M));

  const colliders: ColliderLike[] = [
    ...arena.colliders,
    ...arena.physicsColliders,
    ...arena.physicalCover.map((cover) => cover.bounds),
  ];

  // Uniform bucket index, so a per-cell point query touches a handful of boxes
  // instead of all of them.
  const bx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / BUCKET_M));
  const bz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / BUCKET_M));
  const buckets: ColliderLike[][] = Array.from({ length: bx * bz }, () => []);
  const bucketOf = (x: number, z: number): number => {
    const i = Math.min(bx - 1, Math.max(0, Math.floor((x - bounds.minX) / BUCKET_M)));
    const k = Math.min(bz - 1, Math.max(0, Math.floor((z - bounds.minZ) / BUCKET_M)));
    return i * bz + k;
  };
  for (const box of colliders) {
    const i0 = Math.min(bx - 1, Math.max(0, Math.floor((box.minX - bounds.minX) / BUCKET_M)));
    const i1 = Math.min(bx - 1, Math.max(0, Math.floor((box.maxX - bounds.minX) / BUCKET_M)));
    const k0 = Math.min(bz - 1, Math.max(0, Math.floor((box.minZ - bounds.minZ) / BUCKET_M)));
    const k1 = Math.min(bz - 1, Math.max(0, Math.floor((box.maxZ - bounds.minZ) / BUCKET_M)));
    for (let i = i0; i <= i1; i += 1) for (let k = k0; k <= k1; k += 1) buckets[i * bz + k]!.push(box);
  }

  const centreX = (i: number): number => bounds.minX + (i + 0.5) * CELL_M;
  const centreZ = (k: number): number => bounds.minZ + (k + 0.5) * CELL_M;
  const hitsAt = (x: number, z: number): ColliderLike[] =>
    buckets[bucketOf(x, z)]!.filter((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);

  /** Standing-clear surfaces per cell, ascending. Parallel array: crouch-only. */
  const surfaces: number[][] = new Array(nx * nz);
  const crouchOnly: number[][] = new Array(nx * nz);
  for (let i = 0; i < nx; i += 1) {
    const x = centreX(i);
    for (let k = 0; k < nz; k += 1) {
      const z = centreZ(k);
      const hits = hitsAt(x, z);
      const tops = new Set<number>();
      for (const box of hits) {
        const { maxY } = spanY(box);
        if (maxY >= MIN_SURFACE_Y && maxY <= MAX_SURFACE_Y) tops.add(maxY);
      }
      const clear: number[] = [];
      const tight: number[] = [];
      for (const y of tops) {
        const obstructed = (headroom: number): boolean => hits.some((box) => {
          const span = spanY(box);
          return span.minY < y + headroom - 1e-6 && span.maxY > y + SURFACE_EPS;
        });
        if (!obstructed(STAND_CAPSULE_M)) clear.push(y);
        else if (!obstructed(CROUCH_CAPSULE_M)) tight.push(y);
      }
      surfaces[i * nz + k] = clear.sort((a, b) => a - b);
      crouchOnly[i * nz + k] = tight;
    }
  }

  // Flood fill from the spawn table only. Patrol points are an ASSERTION
  // TARGET, never a seed: seeding from them would let a walled-off pocket that
  // happens to contain a patrol point call itself reachable.
  const nodeKey = (i: number, k: number, slot: number): number => (i * nz + k) * 8 + slot;
  const reached = new Set<number>();
  const queue: Array<[number, number, number]> = [];
  const push = (i: number, k: number, slot: number): void => {
    const key = nodeKey(i, k, slot);
    if (reached.has(key)) return;
    reached.add(key);
    queue.push([i, k, slot]);
  };
  for (const team of Object.values(arena.spawns)) {
    for (const point of team) {
      const i = Math.floor((point.x - bounds.minX) / CELL_M);
      const k = Math.floor((point.z - bounds.minZ) / CELL_M);
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      // `spawnRecord` stores the spawn EYE at a fixed y = 1.7, not the floor,
      // so the seed is the highest surface at or below that eye - the ground a
      // player standing on that point is actually stood on.
      const list = surfaces[i * nz + k]!;
      let best = -1;
      for (let slot = 0; slot < list.length; slot += 1) {
        const y = list[slot]!;
        if (y > point.y + 0.1 || y < point.y - 2.5) continue;
        best = slot;
      }
      if (best >= 0) push(i, k, best);
    }
  }
  while (queue.length > 0) {
    const [i, k, slot] = queue.pop()!;
    const y = surfaces[i * nz + k]![slot]!;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
      const list = surfaces[ni * nz + nk]!;
      for (let next = 0; next < list.length; next += 1) {
        if (Math.abs(list[next]! - y) > AUTOSTEP_M + 1e-6) continue;
        push(ni, nk, next);
      }
    }
  }

  let standableNodes = 0;
  for (let index = 0; index < nx * nz; index += 1) standableNodes += surfaces[index]!.length;

  const regionResults: ReachRegionResult[] = regions.map((region) => {
    const minY = region.minY ?? 3.0;
    const maxY = region.maxY ?? 3.8;
    let standable = 0;
    let reachable = 0;
    let tight = 0;
    for (let i = 0; i < nx; i += 1) {
      const x = centreX(i);
      if (x < region.x0 || x > region.x1) continue;
      for (let k = 0; k < nz; k += 1) {
        const z = centreZ(k);
        if (z < region.z0 || z > region.z1) continue;
        const list = surfaces[i * nz + k]!;
        for (let slot = 0; slot < list.length; slot += 1) {
          const y = list[slot]!;
          if (y < minY || y > maxY) continue;
          standable += 1;
          if (reached.has(nodeKey(i, k, slot))) reachable += 1;
        }
        for (const y of crouchOnly[i * nz + k]!) if (y >= minY && y <= maxY) tight += 1;
      }
    }
    return {
      id: region.id,
      label: region.label,
      standableCells: standable,
      reachableCells: reachable,
      reachableFraction: standable === 0 ? 0 : reachable / standable,
      crouchOnlyCells: tight,
    };
  });

  const patrolPoints: ReachPatrolResult[] = arena.patrolPoints.map((point) => {
    const i = Math.floor((point.x - bounds.minX) / CELL_M);
    const k = Math.floor((point.z - bounds.minZ) / CELL_M);
    const list = (i >= 0 && k >= 0 && i < nx && k < nz) ? surfaces[i * nz + k]! : [];
    const near: number[] = [];
    let reachable = false;
    for (let slot = 0; slot < list.length; slot += 1) {
      const y = list[slot]!;
      if (Math.abs(y - point.y) > 0.6) continue;
      near.push(y);
      if (reached.has(nodeKey(i, k, slot))) reachable = true;
    }
    return { x: point.x, y: point.y, z: point.z, surfaces: near, reachable };
  });

  return {
    id: arena.id,
    cellM: CELL_M,
    autostepM: AUTOSTEP_M,
    standCapsuleM: STAND_CAPSULE_M,
    standableNodes,
    reachableNodes: reached.size,
    regions: regionResults,
    patrolPoints,
    unreachablePatrolPoints: patrolPoints
      .filter((point) => !point.reachable)
      .map((point) => `(${point.x}, ${point.y}, ${point.z})`),
  };
}

async function main(): Promise<void> {
  const [{ default: THREE }, arenaModule] = await Promise.all([
    import('three').then((mod) => ({ default: mod })),
    import('../../src/raid2-arena'),
  ]);
  const arena = arenaModule.buildRaid2(new THREE.Scene());
  const report = measureReachability(arena, arenaModule.RAID2_UPPER_ROOMS);
  console.log(`raid2 reachability — cell ${report.cellM} m, autostep ${report.autostepM} m, `
    + `standing capsule ${report.standCapsuleM.toFixed(2)} m`);
  console.log(`standable surface nodes ${report.standableNodes}, reachable ${report.reachableNodes}`);
  for (const region of report.regions) {
    console.log(`  ${region.id.padEnd(3)} ${region.label.padEnd(48)} `
      + `standable ${String(region.standableCells).padStart(5)}  `
      + `reachable ${String(region.reachableCells).padStart(5)}  `
      + `${(region.reachableFraction * 100).toFixed(1)}%  `
      + `crouch-only ${region.crouchOnlyCells}`);
  }
  for (const point of report.patrolPoints) {
    if (point.y < 1) continue;
    console.log(`  patrol (${point.x}, ${point.y}, ${point.z}) surfaces=${JSON.stringify(point.surfaces)} `
      + `reachable=${point.reachable}`);
  }
  console.log(report.unreachablePatrolPoints.length === 0
    ? 'OK — every patrol point is reachable from the spawn table.'
    : `FAIL — unreachable patrol points: ${report.unreachablePatrolPoints.join(', ')}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('raid2-reachability.ts')) {
  void main();
}
