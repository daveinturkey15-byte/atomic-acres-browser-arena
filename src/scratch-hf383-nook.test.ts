import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { CHARACTER_PHYSICS_CONFIG } from './physics';
import { buildArena } from './map';
import type { ArenaMap } from './map';

const CELL = 0.25;
const R = CHARACTER_PHYSICS_CONFIG.playerRadius;

function groundBlocked(map: ArenaMap, x: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    if (circleIntersectsBox(x, z, R, b)) return true;
  }
  return false;
}

describe('nook', () => {
  it('locates the sealed pocket', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const key = (i: number, j: number) => j * (cols + 1) + i;
    const walkable: Uint8Array = new Uint8Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        if (!groundBlocked(map, ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL)) walkable[key(i, j)] = 1;
      }
    }
    const seen = new Uint8Array(walkable.length);
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
        if (walkable[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, count = 0;
    for (let k = 0; k < walkable.length; k += 1) {
      if (walkable[k] && !seen[k]) {
        count += 1;
        const x = ARENA_BOUNDS.minX + (k % (cols + 1)) * CELL;
        const z = ARENA_BOUNDS.minZ + Math.floor(k / (cols + 1)) * CELL;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
    }
    // Boundary blockers of the pocket: blockers within 0.6 m of its bbox edge midpoints
    const lines = [`pocket cells=${count} x[${minX},${maxX}] z[${minZ},${maxZ}]`];
    for (const b of map.physicsColliders) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      if (cx > minX - 3 && cx < maxX + 3 && cz > minZ - 3 && cz < maxZ + 3) {
        lines.push(`nearby [${b.minX.toFixed(2)},${b.maxX.toFixed(2)}]x[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}]y[${(b.minY ?? 0).toFixed(2)},${(b.maxY ?? 0).toFixed(2)}]`);
      }
    }
    writeFileSync('.gauntlet-tmp/hf383-nook.txt', lines.join('\n'));
  });
});
