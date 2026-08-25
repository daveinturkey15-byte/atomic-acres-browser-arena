import * as THREE from 'three';
import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { buildArena } from './map';
import type { ArenaMap } from './map';
import { CHARACTER_PHYSICS_CONFIG } from './physics';

const CELL = 0.25;

function blockedAt(map: ArenaMap, x: number, z: number, radius: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    const yaw = b.rotation?.[1];
    let bx = x;
    let bz = z;
    if (yaw !== undefined && yaw !== 0) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const dx = x - cx;
      const dz = z - cz;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      bx = cx + dx * cos - dz * sin;
      bz = cz + dx * sin + dz * cos;
    }
    if (circleIntersectsBox(bx, bz, radius, b)) return true;
  }
  return false;
}

function flood(map: ArenaMap, radius: number): Int32Array {
  const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
  const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
  const key = (i: number, j: number) => j * (cols + 1) + i;
  const blocked = new Uint8Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      blocked[key(i, j)] = blockedAt(map, ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL, radius) ? 1 : 0;
    }
  }
  const comp = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  let next = 0;
  const sizes: Array<[number, number]> = [];
  for (let s = 0; s < comp.length; s += 1) {
    if (blocked[s] || comp[s] !== -1) continue;
    const queue = [s];
    comp[s] = next;
    let size = 0;
    while (queue.length > 0) {
      const c = queue.pop()!;
      size += 1;
      const ci = c % (cols + 1);
      const cj = Math.floor(c / (cols + 1));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
        const nk = key(ni, nj);
        if (blocked[nk] || comp[nk] !== -1) continue;
        comp[nk] = next;
        queue.push(nk);
      }
    }
    sizes.push([next, size]);
    next += 1;
  }
  const report: string[] = [`radius=${radius} sizes=${JSON.stringify(sizes.filter(([, n]) => n > 10))}`];
  for (const [id, n] of sizes) {
    if (n <= 10 || n > 500) continue;
    const cells: string[] = [];
    for (let s = 0; s < comp.length && cells.length < 6; s += 1) {
      if (comp[s] === id) cells.push(`(${(ARENA_BOUNDS.minX + (s % (cols + 1)) * CELL).toFixed(2)},${(ARENA_BOUNDS.minZ + Math.floor(s / (cols + 1)) * CELL).toFixed(2)})`);
    }
    report.push(`small comp ${id} size=${n} cells=${cells.join(' ')}`);
  }
  appendFileSync('.gauntlet-tmp/nk-pocket-out.txt', `${report.join('\n')}\n`);
  return comp;
}

describe('nk pocket', () => {
  it('floods at several radii', () => {
    const map = buildArena(new THREE.Scene());
    appendFileSync('.gauntlet-tmp/nk-pocket-out.txt', `live playerRadius=${CHARACTER_PHYSICS_CONFIG.playerRadius}\n`);
    for (const r of [0.36, 0.38, 0.39, 0.40]) flood(map, r);
  });
});
