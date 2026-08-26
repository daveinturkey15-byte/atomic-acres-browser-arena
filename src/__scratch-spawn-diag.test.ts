import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { buildArena } from './map';
import type { ArenaMap } from './map';
import { CHARACTER_PHYSICS_CONFIG } from './physics';

const R = CHARACTER_PHYSICS_CONFIG.playerRadius;
const CELL = 0.25;

function blocked(map: ArenaMap, x: number, z: number): boolean {
  for (const b of map.colliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? 3;
    if (maxY < 0.45 || minY > 1.8) continue;
    const cx = Math.max(b.minX - R, Math.min(x, b.maxX + R));
    const cz = Math.max(b.minZ - R, Math.min(z, b.maxZ + R));
    if (cx === x && cz === z) return true;
  }
  return false;
}

describe('lap endpoint diag', () => {
  it('labels lap endpoints', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const walkable = new Uint8Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        walkable[j * (cols + 1) + i] = blocked(map, ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL) ? 0 : 1;
      }
    }
    const comp = new Int32Array(walkable.length).fill(-1);
    const sizes: number[] = [];
    for (let seed = 0; seed < walkable.length; seed += 1) {
      if (!walkable[seed] || comp[seed] >= 0) continue;
      const stack = [seed];
      comp[seed] = sizes.length;
      let size = 0;
      while (stack.length > 0) {
        const c = stack.pop()!;
        size += 1;
        const ci = c % (cols + 1);
        const cj = Math.floor(c / (cols + 1));
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            if (di === 0 && dj === 0) continue;
            const ni = ci + di, nj = cj + dj;
            if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
            const nk = nj * (cols + 1) + ni;
            if (!walkable[nk] || comp[nk] >= 0) continue;
            if (di !== 0 && dj !== 0 && (!walkable[cj * (cols + 1) + ni] || !walkable[nj * (cols + 1) + ci])) continue;
            comp[nk] = sizes.length;
            stack.push(nk);
          }
        }
      }
      sizes.push(size);
    }
    let main = 0;
    for (let c = 1; c < sizes.length; c += 1) if (sizes[c] > sizes[main]) main = c;
    for (let c = 0; c < sizes.length; c += 1) {
      if (c === main || sizes[c] < 20) continue;
      let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
      for (let k = 0; k < comp.length; k += 1) {
        if (comp[k] !== c) continue;
        const i = k % (cols + 1);
        const j = Math.floor(k / (cols + 1));
        minI = Math.min(minI, i); maxI = Math.max(maxI, i);
        minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
      }
      console.log(`comp ${c}: ${sizes[c]} cells, x ${ARENA_BOUNDS.minX + minI * CELL}..${ARENA_BOUNDS.minX + maxI * CELL}, z ${ARENA_BOUNDS.minZ + minJ * CELL}..${ARENA_BOUNDS.minZ + maxJ * CELL}`);
    }
    console.log(`main=${main} size=${sizes[main]}`);
    for (const [x, z] of [[-28.5, -26], [28.5, -26], [30, 25.5], [-28.5, 26]]) {
      const i = Math.round((x - ARENA_BOUNDS.minX) / CELL);
      const j = Math.round((z - ARENA_BOUNDS.minZ) / CELL);
      console.log(`endpoint (${x},${z}): blocked=${blocked(map, x, z)} comp=${comp[j * (cols + 1) + i]} (main=${main})`);
      if (blocked(map, x, z)) {
        for (const b of map.colliders) {
          const minY = b.minY ?? 0;
          const maxY = b.maxY ?? 3;
          if (maxY < 0.45 || minY > 1.8) continue;
          const cx = Math.max(b.minX - R, Math.min(x, b.maxX + R));
          const cz = Math.max(b.minZ - R, Math.min(z, b.maxZ + R));
          if (cx === x && cz === z) console.log(`   by x[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] y[${minY.toFixed(2)},${maxY.toFixed(2)}] z[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}]`);
        }
      }
    }
    expect(true).toBe(true);
  }, 120_000);
});
