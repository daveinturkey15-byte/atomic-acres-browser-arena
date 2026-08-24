import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { buildArena } from './map';
import type { ArenaMap } from './map';

const CELL = 0.25;
const RADIUS = 0.39;

function groundBlocked(map: ArenaMap, x: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    if (circleIntersectsBox(x, z, RADIUS, b)) return true;
  }
  return false;
}

describe('component map', () => {
  it('labels ground-level connectivity components', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const key = (i: number, j: number) => j * (cols + 1) + i;
    const walkable: Uint8Array = new Uint8Array((cols + 1) * (rows + 1));
    let total = 0;
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        if (!groundBlocked(map, ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL)) {
          walkable[key(i, j)] = 1;
          total += 1;
        }
      }
    }
    const label = new Int32Array(walkable.length).fill(-1);
    const sizes: number[] = [];
    for (let k0 = 0; k0 < walkable.length; k0 += 1) {
      if (!walkable[k0] || label[k0] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      const stack: number[] = [k0];
      label[k0] = id;
      while (stack.length > 0) {
        const k = stack.pop()!;
        size += 1;
        const i = k % (cols + 1);
        const j = Math.floor(k / (cols + 1));
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
          const nk = key(ni, nj);
          if (walkable[nk] && label[nk] < 0) {
            label[nk] = id;
            stack.push(nk);
          }
        }
      }
      sizes.push(size);
    }
    const order = sizes.map((s, id) => ({ s, id })).sort((a, b) => b.s - a.s).slice(0, 8);
    const lines: string[] = [`cell=${CELL}m radius=${RADIUS} totalWalkable=${total} components=${sizes.length}`];
    for (const { s, id } of order) {
      // Sample a few labelled cells of this component to locate it.
      const samples: string[] = [];
      for (let k = 0; k < walkable.length && samples.length < 3; k += 7) {
        if (label[k] === id) {
          samples.push(`(${(ARENA_BOUNDS.minX + (k % (cols + 1)) * CELL).toFixed(1)},${(ARENA_BOUNDS.minZ + Math.floor(k / (cols + 1)) * CELL).toFixed(1)})`);
        }
      }
      lines.push(`component ${id}: ${s} cells (${(s * CELL * CELL).toFixed(0)} m2) e.g. ${samples.join(' ')}`);
    }
    // Which component holds each probe?
    for (const [px, pz, name] of [
      [-10, 0, 'west street'], [0, -4, 'north crossing mouth'], [15, 0, 'east street'],
      [-29, -27, 'NW spawn corner'], [29, 27, 'SE spawn corner'], [20, -20, 'NE yard'],
      [-20, 20, 'SW yard'], [19, 7, 'patrol east'], [24, 20, 'patrol far east'],
    ] as const) {
      const k = key(Math.round((px - ARENA_BOUNDS.minX) / CELL), Math.round((pz - ARENA_BOUNDS.minZ) / CELL));
      lines.push(`probe ${name} (${px},${pz}): ${walkable[k] ? `component ${label[k]} (size ${sizes[label[k]]})` : 'BLOCKED cell'}`);
    }
    writeFileSync('.gauntlet-tmp/hf383-components.txt', lines.join('\n'));
  });
});
