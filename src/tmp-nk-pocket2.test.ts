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

function blockersAt(map: ArenaMap, x: number, z: number): string[] {
  const hits: string[] = [];
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    if (circleIntersectsBox(x, z, RADIUS, b)) hits.push(`${b.id ?? 'unnamed'} x=[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] z=[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}] y=[${minY.toFixed(2)},${maxY.toFixed(2)}]`);
  }
  return hits;
}

describe('nk pocket2', () => {
  it('probes the nook boundary', () => {
    const map = buildArena(new THREE.Scene());
    const lines: string[] = [];
    const probes: Array<[number, number]> = [
      [24.55, 24.5], [24.55, 25.5], [24.55, 26.1], [25.5, 26.5], [27, 27],
      [30, 27], [30, 24], [30, 20], [28.5, 21], [26.5, 21], [25.5, 21],
      [23, 21.5], [24.55, 22.5], [29, 19], [30.5, 19],
    ];
    for (const [x, z] of probes) {
      lines.push(`probe (${x},${z}): ${blockersAt(map, x, z).length === 0 ? 'FREE' : blockersAt(map, x, z).join(' | ')}`);
    }
    appendFileSync('.gauntlet-tmp/nk-pocket2-out.txt', `${lines.join('\n')}\n`);
  });
});
