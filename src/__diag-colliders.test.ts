import * as THREE from 'three';
import { describe, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { buildArena } from './map';

const R = 0.38;
const CELL = 0.25;

function groundBlocked(map: ReturnType<typeof buildArena>, x: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    if (circleIntersectsBox(x, z, R, b)) return true;
  }
  return false;
}

describe('diag', () => {
  it('checks candidate waypoint components', () => {
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
    const sizes: number[] = [];
    for (let seed = 0; seed < blocked.length; seed += 1) {
      if (blocked[seed] || comp[seed] >= 0) continue;
      const stack = [seed];
      comp[seed] = sizes.length;
      let size = 0;
      while (stack.length) {
        const c = stack.pop()!;
        size += 1;
        const ci = c % (cols + 1);
        const cj = Math.floor(c / (cols + 1));
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = ci + di; const nj = cj + dj;
          if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
          const nk = idx(ni, nj);
          if (!blocked[nk] && comp[nk] < 0) { comp[nk] = sizes.length; stack.push(nk); }
        }
      }
      sizes.push(size);
    }
    const main = sizes.indexOf(Math.max(...sizes));
    for (const p of [[30, 25.5], [29.5, 25.5], [30, 22], [24.5, 25.5], [24.5, 25.9], [-28.5, 26], [-29, 27], [-28.5, -26], [28.5, -26]]) {
      const i = Math.round((p[0] - ARENA_BOUNDS.minX) / CELL);
      const j = Math.round((p[1] - ARENA_BOUNDS.minZ) / CELL);
      console.log(`(${p[0]},${p[1]}) blocked=${blocked[idx(i, j)] === 1} comp=${comp[idx(i, j)]}/${main}`);
    }
  }, 120_000);
});
