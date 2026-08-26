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
    if (circleIntersectsBox(x, z, R, b)) return true;
  }
  return false;
}

/** TEMP DIAGNOSTIC (repair round): component census under traversal-harness rules. */
describe('diag-comps', () => {
  it('labels components', () => {
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
    const comp = new Int32Array(blocked.length).fill(-1);
    const info: Array<{ size: number; minX: number; maxX: number; minZ: number; maxZ: number }> = [];
    for (let seed = 0; seed < blocked.length; seed += 1) {
      if (blocked[seed] || comp[seed] >= 0) continue;
      let size = 0;
      const stack = [seed];
      comp[seed] = info.length;
      const minX = Infinity; let maxX = -Infinity; const minZ = Infinity; let maxZ = -Infinity;
      while (stack.length > 0) {
        const c = stack.pop()!;
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
        const ci = c % (cols + 1);
        const cj = Math.floor(c / (cols + 1));
        const wx = ARENA_BOUNDS.minX + ci * CELL;
        const wz = ARENA_BOUNDS.minZ + cj * CELL;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            if (di === 0 && dj === 0) continue;
            const ni = ci + di;
            const nj = cj + dj;
            if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
            const nk = key(ni, nj);
            if (blocked[nk] || comp[nk] >= 0) continue;
            if (di !== 0 && dj !== 0 && (blocked[key(ni, cj)] || blocked[key(ci, nj)])) continue;
            comp[nk] = info.length;
            stack.push(nk);
          }
        }
      }
      info.push({ size, minX, maxX, minZ, maxZ });
    }
    const order = info.map((m, i) => ({ i, ...m })).sort((a, b) => b.size - a.size);
    for (const m of order.slice(0, 8)) {
      console.log(`comp ${m.i} cells=${m.size} bbox x[${m.minX.toFixed(2)},${m.maxX.toFixed(2)}] z[${m.minZ.toFixed(2)},${m.maxZ.toFixed(2)}]`);
    }
    for (const p of [[-28.5, -26], [28.5, -26], [30, 25.5], [-18, 26], [-28.5, 14]]) {
      const i = Math.round((p[0] - ARENA_BOUNDS.minX) / CELL);
      const j = Math.round((p[1] - ARENA_BOUNDS.minZ) / CELL);
      console.log(`probe (${p[0]},${p[1]}) blocked=${blocked[key(i, j)] === 1} comp=${comp[key(i, j)]}`);
    }
  }, 300_000);
});
