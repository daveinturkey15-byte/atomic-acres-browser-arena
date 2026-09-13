/**
 * RAID2: mechanical layout metrics for the Raid layout rethink (HF-408).
 *
 * The owner's complaint about the shipped Raid (`test2`) is one sentence:
 * "raid just feels like loads of walls". That is a claim about GEOMETRY, so it
 * is measurable, and this module is the instrument. It builds an arena through
 * the same factory the game and the collider/visual parity audit use
 * (`loadArenaFactories`), then reduces the authoritative colliders to four
 * numbers a human can argue with:
 *
 *   1. FILL          accessible ground / bounding box. The reference study
 *                    (docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md section 1.1)
 *                    measured the archetype's playable region at 62.4% of its
 *                    bounding box, so a rebuild that fills 40% is a warren and
 *                    one that fills 85% is a field.
 *   2. WALL DENSITY  movement-blocking collider footprint / bounding box, and
 *                    the same number expressed per 100 m2 of accessible ground
 *                    ("how much wall does a player get per step of floor").
 *   3. SIGHTLINES    from every accessible cell, 16 rays at the 1.70 m standing
 *                    eye. Reports the mean open distance (the single number
 *                    that tracks "loads of walls"), the median, p90, and how
 *                    much of the map can hold a 45 m+ line. The reference has
 *                    exactly ONE lane that long (spec 3.2).
 *   4. ENCLOSURE     share of accessible ground that is roofed, and share whose
 *                    16 rays all die inside 12 m (a "pocket": nowhere to shoot).
 *
 * Deliberately COLLIDER-BASED, not mesh-based: the authoritative colliders are
 * what a player bumps into and what a bullet stops on, and they are the same in
 * both graphics profiles. Presentation dressing cannot flatter these numbers.
 *
 * Ground level only, by design. Upper rooms are measured separately (their
 * floors are colliders in the same list) because mixing two storeys into one
 * grid would count a first-floor slab as a ground-level wall.
 *
 * CLI: npx tsx scripts/qa/raid2-layout-metrics.ts [arenaId ...]
 */
import * as THREE from 'three';
import type { Box2 } from '../../src/collision';
import type { ArenaMap } from '../../src/map';
import { installHeadlessArenaShims, loadArenaFactories } from './collider-visual-parity-core';

/** Grid pitch. 0.5 m is a quarter of a player capsule diameter: fine enough that
 *  a 1 m doorway is two open cells, coarse enough that a 100 x 76 m map is
 *  30,400 cells and a 16-ray sweep over all of them runs in seconds. */
export const CELL_M = 0.5;
/** Standing eye height (STANCE_SHAPES, src/physics.ts). Sightlines are cast here. */
export const EYE_M = 1.7;
/**
 * A collider whose top is at or below this cannot stop a player: the measured
 * jump apex on this controller is 0.82 m and the cover rule authors mountable
 * cover at <= 0.75 m. Anything lower is furniture, not a wall.
 */
export const MOUNTABLE_TOP_M = 0.8;
/** Roof test: a collider whose underside is above this is overhead, not a wall. */
export const OVERHEAD_MIN_Y_M = 2.4;
/** Rays per cell for the sightline sweep. 16 = every 22.5 degrees. */
export const SIGHT_RAYS = 16;
/** A cell whose longest open line is under this is a pocket with no shot from it. */
export const POCKET_MAX_M = 12;
/** The reference allows exactly one lane to hold a line this long (spec 3.2). */
export const LONG_LANE_M = 45;

type ColliderLike = Box2;

function spanY(box: ColliderLike): { minY: number; maxY: number } {
  return { minY: box.minY ?? -0.5, maxY: box.maxY ?? 8 };
}

export type LayoutMetrics = {
  id: string;
  bounds: Box2;
  boundingAreaM2: number;
  accessibleGroundM2: number;
  fillFraction: number;
  wallFootprintM2: number;
  wallFractionOfBox: number;
  wallM2Per100M2Accessible: number;
  meanOpenM: number;
  medianOpenM: number;
  p90OpenM: number;
  maxOpenM: number;
  longLaneCellFraction: number;
  roofedFraction: number;
  pocketFraction: number;
  colliderCount: number;
  hardCoverCount: number;
  mountableCount: number;
  upperFloorM2: number;
  /**
   * How the wall is DISTRIBUTED, which is the half of "loads of walls" that
   * total wall area cannot see. Two maps can carry the same wall footprint and
   * play nothing alike: one spends it on four long masses that define lanes,
   * the other scatters it as forty short partitions that chop every line.
   */
  eyeClusterCount: number;
  meanEyeClusterM2: number;
  largestEyeClusterM2: number;
  /** Median open distance along the LONG AXIS only (+/-x): the lane reading. */
  longAxisMedianM: number;
  longAxisP90M: number;
};

/**
 * Rasterises the authoritative colliders onto three boolean grids and derives
 * the metric block. Exported so the fidelity test measures exactly what the CLI
 * prints, rather than keeping a second implementation that can drift.
 */
export function measureLayout(id: string, arena: ArenaMap): LayoutMetrics {
  const bounds = arena.bounds;
  const nx = Math.max(1, Math.round((bounds.maxX - bounds.minX) / CELL_M));
  const nz = Math.max(1, Math.round((bounds.maxZ - bounds.minZ) / CELL_M));
  const cellArea = CELL_M * CELL_M;

  const colliders: ColliderLike[] = [
    ...arena.colliders,
    ...arena.physicsColliders,
    ...arena.physicalCover.map((cover) => cover.bounds),
  ];

  // blockMove: you cannot walk or jump through it at ground level.
  // blockEye:  it stops a standing sightline at 1.70 m.
  // roofed:    something solid is overhead (an interior, a colonnade, a soffit).
  // floorUp:   a first-floor slab, counted separately as upper-storey area.
  const blockMove = new Uint8Array(nx * nz);
  const blockEye = new Uint8Array(nx * nz);
  const roofed = new Uint8Array(nx * nz);
  const floorUp = new Uint8Array(nx * nz);

  let hardCoverCount = 0;
  let mountableCount = 0;

  const stamp = (box: ColliderLike, grid: Uint8Array): number => {
    const i0 = Math.max(0, Math.floor((box.minX - bounds.minX) / CELL_M));
    const i1 = Math.min(nx - 1, Math.ceil((box.maxX - bounds.minX) / CELL_M) - 1);
    const j0 = Math.max(0, Math.floor((box.minZ - bounds.minZ) / CELL_M));
    const j1 = Math.min(nz - 1, Math.ceil((box.maxZ - bounds.minZ) / CELL_M) - 1);
    let painted = 0;
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const index = i * nz + j;
        if (!grid[index]) painted += 1;
        grid[index] = 1;
      }
    }
    return painted;
  };

  for (const box of colliders) {
    const { minY, maxY } = spanY(box);
    // Overhead-only mass: a soffit, a balcony underside, a first-floor slab.
    if (minY >= OVERHEAD_MIN_Y_M) {
      stamp(box, roofed);
      if (minY < 4.2) stamp(box, floorUp);
      continue;
    }
    if (maxY <= MOUNTABLE_TOP_M) {
      mountableCount += 1;
      continue;
    }
    stamp(box, blockMove);
    if (maxY > EYE_M && minY < EYE_M) {
      hardCoverCount += 1;
      stamp(box, blockEye);
    }
  }

  let wallCells = 0;
  for (let index = 0; index < blockMove.length; index += 1) if (blockMove[index]) wallCells += 1;

  // Accessible ground: flood fill from every spawn point of both teams. Using
  // the spawn table rather than the map centre is what makes this an honest
  // "can a player get here" measure - a walled-off pocket is not accessible
  // just because it is empty.
  const open = new Uint8Array(nx * nz);
  const queue: number[] = [];
  const seed = (point: THREE.Vector3): void => {
    const i = Math.floor((point.x - bounds.minX) / CELL_M);
    const j = Math.floor((point.z - bounds.minZ) / CELL_M);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return;
    const index = i * nz + j;
    if (blockMove[index] || open[index]) return;
    open[index] = 1;
    queue.push(index);
  };
  // SPAWNS ONLY. Seeding from patrol points as well was a hole in the
  // falsifier: a walled-off pocket that happened to contain a patrol point
  // would have been counted accessible and would have flattered fillFraction,
  // roofedFraction and pocketFraction. Patrol points are an ASSERTION TARGET
  // instead: scripts/qa/raid2-reachability.ts asserts that every patrol point
  // lands on a surface a real traversal reaches, and the fidelity test gates it.
  for (const team of Object.values(arena.spawns)) for (const point of team) seed(point);
  while (queue.length > 0) {
    const index = queue.pop()!;
    const i = Math.floor(index / nz);
    const j = index % nz;
    const step = (ni: number, nj: number): void => {
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) return;
      const next = ni * nz + nj;
      if (blockMove[next] || open[next]) return;
      open[next] = 1;
      queue.push(next);
    };
    step(i + 1, j); step(i - 1, j); step(i, j + 1); step(i, j - 1);
  }

  let accessibleCells = 0;
  let roofedCells = 0;
  for (let index = 0; index < open.length; index += 1) {
    if (!open[index]) continue;
    accessibleCells += 1;
    if (roofed[index]) roofedCells += 1;
  }

  // Sightline sweep. DDA on the eye grid; a ray dies at the first eye-blocking
  // cell or at the bounding box, whichever comes first.
  const directions: Array<[number, number]> = [];
  for (let ray = 0; ray < SIGHT_RAYS; ray += 1) {
    const angle = (ray / SIGHT_RAYS) * Math.PI * 2;
    directions.push([Math.cos(angle), Math.sin(angle)]);
  }
  const maxSpan = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const stepM = CELL_M * 0.9;
  const perCellMeans: number[] = [];
  const longAxisOpen: number[] = [];
  let longLaneCells = 0;
  let pocketCells = 0;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const index = i * nz + j;
      if (!open[index] || blockEye[index]) continue;
      const x0 = bounds.minX + (i + 0.5) * CELL_M;
      const z0 = bounds.minZ + (j + 0.5) * CELL_M;
      let sum = 0;
      let longest = 0;
      let axisBest = 0;
      for (const [dx, dz] of directions) {
        let travelled = 0;
        while (travelled < maxSpan) {
          travelled += stepM;
          const x = x0 + dx * travelled;
          const z = z0 + dz * travelled;
          if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) break;
          const ci = Math.floor((x - bounds.minX) / CELL_M);
          const cj = Math.floor((z - bounds.minZ) / CELL_M);
          if (blockEye[ci * nz + cj]) break;
        }
        const open_m = Math.min(travelled, maxSpan);
        sum += open_m;
        if (open_m > longest) longest = open_m;
        // The two rays closest to +/-x are the long-axis reading.
        if (Math.abs(dz) < 0.01 && open_m > axisBest) axisBest = open_m;
      }
      perCellMeans.push(sum / SIGHT_RAYS);
      longAxisOpen.push(axisBest);
      if (longest >= LONG_LANE_M) longLaneCells += 1;
      if (longest < POCKET_MAX_M) pocketCells += 1;
    }
  }
  perCellMeans.sort((a, b) => a - b);
  longAxisOpen.sort((a, b) => a - b);
  const axisQuantile = (q: number): number => (longAxisOpen.length === 0
    ? 0
    : longAxisOpen[Math.min(longAxisOpen.length - 1, Math.max(0, Math.round(q * (longAxisOpen.length - 1))))]);

  // Connected components of the eye-blocking grid (4-neighbour). A map built
  // from a few architectural masses has a handful of large clusters; a warren
  // has dozens of small ones.
  const clusterSeen = new Uint8Array(nx * nz);
  const clusterSizes: number[] = [];
  const clusterSeeds: Array<{ m2: number; x: number; z: number }> = [];
  for (let start = 0; start < blockEye.length; start += 1) {
    if (!blockEye[start] || clusterSeen[start]) continue;
    let size = 0;
    const stack = [start];
    clusterSeen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      size += 1;
      const i = Math.floor(index / nz);
      const j = index % nz;
      const visit = (ni: number, nj: number): void => {
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) return;
        const next = ni * nz + nj;
        if (!blockEye[next] || clusterSeen[next]) return;
        clusterSeen[next] = 1;
        stack.push(next);
      };
      visit(i + 1, j); visit(i - 1, j); visit(i, j + 1); visit(i, j - 1);
    }
    clusterSizes.push(size * cellArea);
    if (process.env.RAID2_METRICS_CLUSTERS === '1') {
      const i = Math.floor(start / nz);
      const j = start % nz;
      clusterSeeds.push({
        m2: size * cellArea,
        x: Math.round(bounds.minX + i * CELL_M),
        z: Math.round(bounds.minZ + j * CELL_M),
      });
    }
  }
  if (process.env.RAID2_METRICS_CLUSTERS === '1') {
    clusterSeeds.sort((a, b) => b.m2 - a.m2);
    process.stdout.write(`${id}: ${clusterSeeds.length} eye-blocking masses (m2 @ first cell)
`);
    for (const entry of clusterSeeds) {
      process.stdout.write(`  ${entry.m2.toFixed(1).padStart(7)} m2  @ x=${String(entry.x).padStart(4)} z=${String(entry.z).padStart(4)}
`);
    }
  }
  const quantile = (q: number): number => (perCellMeans.length === 0
    ? 0
    : perCellMeans[Math.min(perCellMeans.length - 1, Math.max(0, Math.round(q * (perCellMeans.length - 1))))]);
  const mean = perCellMeans.length === 0
    ? 0
    : perCellMeans.reduce((total, value) => total + value, 0) / perCellMeans.length;

  let upperCells = 0;
  for (let index = 0; index < floorUp.length; index += 1) if (floorUp[index]) upperCells += 1;

  // Diagnostic dump, off by default. RAID2_METRICS_MAP=1 prints a 2 m ASCII
  // plan whose glyph is the cell's long-axis open distance, so a tight pocket
  // is found by looking at the map instead of by guessing at the geometry.
  if (process.env.RAID2_METRICS_MAP === '1') {
    const glyph = (i: number, j: number): string => {
      const index = i * nz + j;
      if (blockEye[index]) return '#';
      if (blockMove[index]) return '=';
      if (!open[index]) return '.';
      const x0 = bounds.minX + (i + 0.5) * CELL_M;
      const z0 = bounds.minZ + (j + 0.5) * CELL_M;
      let best = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0]] as const) {
        let travelled = 0;
        while (travelled < maxSpan) {
          travelled += stepM;
          const x = x0 + dx * travelled;
          const z = z0 + dz * travelled;
          if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) break;
          if (blockEye[Math.floor((x - bounds.minX) / CELL_M) * nz + Math.floor((z - bounds.minZ) / CELL_M)]) break;
        }
        if (travelled > best) best = travelled;
      }
      if (best < 10) return '1';
      if (best < 16) return '2';
      if (best < 24) return '3';
      if (best < 34) return '4';
      if (best < 45) return '5';
      return '6';
    };
    const lines: string[] = [`${id}: long-axis open distance, 2 m cells. 1:<10 2:<16 3:<24 4:<34 5:<45 6:45+  #=eye wall  ==low wall  .=outside`];
    let ruler = '      ';
    for (let i = 0; i < nx; i += 4) {
      const x = Math.round(bounds.minX + i * CELL_M);
      ruler += x % 10 === 0 ? String(Math.abs(x / 10) % 10) : ' ';
    }
    lines.push(ruler);
    for (let j = 0; j < nz; j += 4) {
      let row = `z${String(Math.round(bounds.minZ + j * CELL_M)).padStart(4)} `;
      for (let i = 0; i < nx; i += 4) row += glyph(i, j);
      lines.push(row);
    }
    process.stdout.write(`${lines.join('\n')}\n\n`);
  }

  const boundingAreaM2 = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
  const accessibleGroundM2 = accessibleCells * cellArea;
  const wallFootprintM2 = wallCells * cellArea;
  return {
    id,
    bounds,
    boundingAreaM2,
    accessibleGroundM2,
    fillFraction: accessibleGroundM2 / boundingAreaM2,
    wallFootprintM2,
    wallFractionOfBox: wallFootprintM2 / boundingAreaM2,
    wallM2Per100M2Accessible: accessibleGroundM2 > 0 ? (wallFootprintM2 / accessibleGroundM2) * 100 : 0,
    meanOpenM: mean,
    medianOpenM: quantile(0.5),
    p90OpenM: quantile(0.9),
    maxOpenM: perCellMeans.length === 0 ? 0 : perCellMeans[perCellMeans.length - 1],
    longLaneCellFraction: perCellMeans.length === 0 ? 0 : longLaneCells / perCellMeans.length,
    roofedFraction: accessibleCells === 0 ? 0 : roofedCells / accessibleCells,
    pocketFraction: perCellMeans.length === 0 ? 0 : pocketCells / perCellMeans.length,
    colliderCount: colliders.length,
    hardCoverCount,
    mountableCount,
    upperFloorM2: upperCells * cellArea,
    eyeClusterCount: clusterSizes.length,
    meanEyeClusterM2: clusterSizes.length === 0
      ? 0
      : clusterSizes.reduce((total, value) => total + value, 0) / clusterSizes.length,
    largestEyeClusterM2: clusterSizes.length === 0 ? 0 : Math.max(...clusterSizes),
    longAxisMedianM: axisQuantile(0.5),
    longAxisP90M: axisQuantile(0.9),
  };
}

/** Builds one arena through the shared factory table and measures it. */
export async function measureArena(id: string): Promise<LayoutMetrics> {
  installHeadlessArenaShims();
  const factories = await loadArenaFactories();
  const entry = factories[id];
  if (!entry) throw new Error(`unknown arena id: ${id}`);
  const scene = new THREE.Scene();
  // ArenaBuild is (scene) => Omit<ArenaMap, 'id'> & { id?: string } and
  // ArenaEnrich is (scene) => Promise<void>: the factory table deliberately
  // does not promise an ArenaId, because it is keyed by one. measureLayout only
  // reads colliders and bounds, and takes the id as its own argument, so the
  // build result is narrowed here rather than being passed through untyped.
  const built = entry.build(scene);
  if (entry.enrich) await entry.enrich(scene);
  const arena = { ...built, id } as unknown as ArenaMap;
  return measureLayout(id, arena);
}

const DEFAULT_ROSTER = ['test2', 'atomic-acres', 'skyline-terminal', 'high-seas', 'test1'];

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const roster = requested.length > 0 ? requested : DEFAULT_ROSTER;
  const rows: LayoutMetrics[] = [];
  for (const id of roster) rows.push(await measureArena(id));
  const fixed = (value: number, places = 1): string => value.toFixed(places);
  process.stdout.write('arena              box m2  access m2  fill%  wall m2  wall%box  wall/100m2  meanOpen  medOpen  p90Open  axisMed  axisP90  >=45m%  roofed%  pocket%  clusters  meanClu  maxClu  upper m2\n');
  for (const row of rows) {
    process.stdout.write([
      row.id.padEnd(17),
      fixed(row.boundingAreaM2, 0).padStart(7),
      fixed(row.accessibleGroundM2, 0).padStart(10),
      fixed(row.fillFraction * 100).padStart(6),
      fixed(row.wallFootprintM2, 0).padStart(8),
      fixed(row.wallFractionOfBox * 100).padStart(9),
      fixed(row.wallM2Per100M2Accessible).padStart(11),
      fixed(row.meanOpenM, 2).padStart(9),
      fixed(row.medianOpenM, 2).padStart(8),
      fixed(row.p90OpenM, 2).padStart(8),
      fixed(row.longAxisMedianM, 2).padStart(8),
      fixed(row.longAxisP90M, 2).padStart(8),
      fixed(row.longLaneCellFraction * 100).padStart(7),
      fixed(row.roofedFraction * 100).padStart(8),
      fixed(row.pocketFraction * 100).padStart(8),
      String(row.eyeClusterCount).padStart(9),
      fixed(row.meanEyeClusterM2).padStart(8),
      fixed(row.largestEyeClusterM2, 0).padStart(7),
      fixed(row.upperFloorM2, 0).padStart(9),
      '\n',
    ].join(''));
  }
  process.stdout.write(`\nJSON\n${JSON.stringify(rows, null, 2)}\n`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('raid2-layout-metrics.ts');
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  });
}
