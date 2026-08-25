import * as THREE from 'three';
import { describe, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { buildArena } from './map';
import type { ArenaMap } from './map';

const R = 0.38;
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
    if (circleIntersectsBox(bx, bz, radius0(), b)) return true;
  }
  return false;
}
function radius0() { return R; }

describe('diag', () => {
  it('labels components under the harness rules', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const idx = (i: number, j: number) => j * (cols + 1) + i;
    const blocked = new Uint8Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        const x = ARENA_BOUNDS.minX + i * CELL;
        const z = ARENA_BOUNDS.minZ + j * CELL;
        blocked[idx(i, j)] = groundBlocked(map, x, z) ? 1 : 0;
      }
    }
    const comp = new Int32Array(blocked.length).fill(-1);
    const info: Array<{ size: number; minX: number; maxX: number; minZ: number; maxZ: number }> = [];
    for (let seed = 0; seed < blocked.length; seed += 1) {
      if (blocked[seed] || comp[seed] >= 0) continue;
      const stack = [seed];
      comp[seed] = info.length;
      const me = { size: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      while (stack.length) {
        const c = stack.pop()!;
        me.size += 1;
        const ci = c % (cols + 1);
        const cj = Math.floor(c / (cols + 1));
        const x = ARENA_BOUNDS.minX + ci * CELL;
        const z = ARENA_BOUNDS.minZ + cj * CELL;
        if (x < me.minX) me.minX = x; if (x > me.maxX) me.maxX = x;
        if (z < me.minZ) me.minZ = z; if (z > me.maxZ) me.maxZ = z;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = ci + di; const nj = cj + dj;
          if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
          const nk = idx(ni, nj);
          if (!blocked[nk] && comp[nk] < 0) { comp[nk] = info.length; stack.push(nk); }
        }
      }
      info.push(me);
    }
    const order = info.map((m, i) => ({ i, ...m })).sort((a, b) => b.size - a.size);
    for (const m of order.slice(0, 10)) {
      console.log(`comp ${m.i} cells=${m.size} bbox x[${m.minX.toFixed(2)},${m.maxX.toFixed(2)}] z[${m.minZ.toFixed(2)},${m.maxZ.toFixed(2)}]`);
    }
    for (const p of [[29, 27], [28.5, 26], [28.5, -26], [-29, -27], [29, -27], [-29, 27]]) {
      const i = Math.round((p[0] - ARENA_BOUNDS.minX) / CELL);
      const j = Math.round((p[1] - ARENA_BOUNDS.minZ) / CELL);
      // Nearest free cell of each nearby component
      let nearest: string | undefined;
      for (let ring = 0; ring <= 32 && !nearest; ring += 1) {
        for (let dj = -ring; dj <= ring && !nearest; dj += 1) {
          for (let di = -ring; di <= ring && !nearest; di += 1) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
            const ni = i + di; const nj = j + dj;
            if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
            if (!blocked[idx(ni, nj)]) {
              nearest = `ring=${ring} cell(${(ARENA_BOUNDS.minX + ni * CELL).toFixed(2)},${(ARENA_BOUNDS.minZ + nj * CELL).toFixed(2)}) comp=${comp[idx(ni, nj)]}`;
            }
          }
        }
      }
      console.log(`probe ${p[0]},${p[1]} blocked=${blocked[idx(i, j)] === 1} nearestFree: ${nearest}`);
    }
    const status = (px: number, pz: number) => {
      const i = Math.round((px - ARENA_BOUNDS.minX) / CELL);
      const j = Math.round((pz - ARENA_BOUNDS.minZ) / CELL);
      return `(${px},${pz}) blocked=${blocked[idx(i, j)] === 1} comp=${comp[idx(i, j)]}`;
    };
    for (const c of [[25.5, 26], [26.5, 25], [27, 24], [28, 24], [28, 22], [29, 23], [29, 21], [26, 26], [24.5, 26.5]]) {
      console.log(`candidate ${status(c[0], c[1])}`);
    }
  }, 300_000);
});
