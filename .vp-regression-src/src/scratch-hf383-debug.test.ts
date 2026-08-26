import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox, type Box2 } from './collision';
import { buildArena } from './map';
import type { ArenaMap } from './map';

const CELL = 0.5;

function blockingBodies(map: ArenaMap, x: number, z: number): Box2[] {
  const hits: Box2[] = [];
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    if (circleIntersectsBox(x, z, 0.39, b)) hits.push(b);
  }
  return hits;
}

describe('debug seal', () => {
  it('finds cheapest blocker-crossing paths out of the east pocket', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const key = (i: number, j: number) => j * (cols + 1) + i;
    const cellBlockers: Box2[][] = [];
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        cellBlockers[key(i, j)] = blockingBodies(map, ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL);
      }
    }
    const seen = new Uint8Array(cellBlockers.length);
    const si = Math.round((-10 - ARENA_BOUNDS.minX) / CELL);
    const sj = Math.round((0 - ARENA_BOUNDS.minZ) / CELL);
    const stack: number[] = [key(si, sj)];
    seen[stack[0]] = 1;
    while (stack.length > 0) {
      const k = stack.pop()!;
      const i = k % (cols + 1);
      const j = Math.floor(k / (cols + 1));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
        const nk = key(ni, nj);
        if (cellBlockers[nk].length === 0 && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    // Dijkstra from ALL reached cells outward; cost of entering a cell = number
    // of bodies blocking it. The cheapest way out of the pocket names the seal.
    type Entry = { k: number; cost: number };
    const dist = new Map<number, number>();
    const heap: Entry[] = [];
    for (let k = 0; k < seen.length; k += 1) {
      if (seen[k]) {
        dist.set(k, 0);
        heap.push({ k, cost: 0 });
      }
    }
    const parent = new Map<number, number>();
    while (heap.length > 0) {
      heap.sort((a, b) => a.cost - b.cost);
      const cur = heap.shift()!;
      if ((dist.get(cur.k) ?? Infinity) < cur.cost) continue;
      const i = cur.k % (cols + 1);
      const j = Math.floor(cur.k / (cols + 1));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
        const nk = key(ni, nj);
        const stepCost = Math.max(1, cellBlockers[nk].length);
        const next = cur.cost + stepCost;
        if (next < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, next);
          parent.set(nk, cur.k);
          heap.push({ k: nk, cost: next });
        }
      }
    }
    // Report cheapest exits for probe points inside the unreachable pocket.
    const probes: Array<[number, number]> = [[15, 0], [20, -4], [20, 4], [28, 0], [20, -20], [25, 25]];
    const report: string[] = [];
    for (const [px, pz] of probes) {
      const pk = key(Math.round((px - ARENA_BOUNDS.minX) / CELL), Math.round((pz - ARENA_BOUNDS.minZ) / CELL));
      let cursor: number | undefined = pk;
      let guard = 0;
      const crossed = new Map<string, number>();
      while (cursor !== undefined && (dist.get(cursor) ?? 0) > 0 && guard < 500) {
        guard += 1;
        for (const b of cellBlockers[cursor]) {
          const label = `[${b.minX.toFixed(1)},${b.maxX.toFixed(1)}]x[${b.minZ.toFixed(1)},${b.maxZ.toFixed(1)}]y[${(b.minY ?? 0).toFixed(2)},${(b.maxY ?? 0).toFixed(2)}]`;
          crossed.set(label, (crossed.get(label) ?? 0) + 1);
        }
        cursor = parent.get(cursor);
      }
      report.push(`probe (${px},${pz}) cost=${dist.get(pk)} crossed=${JSON.stringify([...crossed.entries()])}`);
    }
    writeFileSync('.gauntlet-tmp/hf383-seal.txt', report.join('\n'));
  });
});
