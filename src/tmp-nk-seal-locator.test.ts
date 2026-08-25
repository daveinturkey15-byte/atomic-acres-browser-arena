import * as THREE from 'three';
import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { buildArena } from './map';
import type { ArenaMap } from './map';
import { CHARACTER_PHYSICS_CONFIG } from './physics';

const RADIUS = CHARACTER_PHYSICS_CONFIG.playerRadius;
const CELL = 0.25;

function groundBlocked(map: ArenaMap, x: number, z: number): boolean {
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
    if (circleIntersectsBox(bx, bz, RADIUS, b)) return true;
  }
  return false;
}

describe('nk seal locator', () => {
  it('locates adjacency pairs across distinct large components', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const key = (i: number, j: number) => j * (cols + 1) + i;
    const blocked = new Uint8Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        blocked[key(i, j)] = groundBlocked(map, ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL) ? 1 : 0;
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
    const big = sizes.filter(([, n]) => n > 500).map(([id]) => id);
    const lines: string[] = [];
    lines.push(`components=${next} big=${JSON.stringify(big)} sizes=${JSON.stringify(sizes)}`);
    // Adjacency midpoints where two DIFFERENT big components sit two cells
    // apart with exactly one blocked cell between them -> these cluster along
    // the sealing wall.
    const clusters = new Map<string, number>();
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        const k = key(i, j);
        if (blocked[k]) continue;
        const a = comp[k];
        if (!big.includes(a)) continue;
        for (const [di, dj] of [[1, 0], [0, 1]] as const) {
          const mid = key(i + di, j + dj);
          const ni = i + di * 2;
          const nj = j + dj * 2;
          if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
          const nk = key(ni, nj);
          if (blocked[mid] !== 1 || blocked[nk] || comp[nk] === a || !big.includes(comp[nk])) continue;
          const wx = ARENA_BOUNDS.minX + (i + di) * CELL;
          const wz = ARENA_BOUNDS.minZ + (j + dj) * CELL;
          const ck = `${Math.round(wx)},${Math.round(wz)}:${Math.min(a, comp[nk])}-${Math.max(a, comp[nk])}`;
          clusters.set(ck, (clusters.get(ck) ?? 0) + 1);
        }
      }
    }
    const sorted = [...clusters.entries()].sort((x, y) => y[1] - x[1]).slice(0, 80);
    for (const [ck, n] of sorted) lines.push(`seal ${n} ${ck}`);
    appendFileSync('.gauntlet-tmp/nk-seal-locator-out.txt', `${lines.join('\n')}\n`);
  });
});
