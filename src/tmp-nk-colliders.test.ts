import * as THREE from 'three';
import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { buildArena } from './map';

describe('nk colliders', () => {
  it('lists colliders near the south-east corner', () => {
    const map = buildArena(new THREE.Scene());
    const lines: string[] = [];
    for (const b of map.physicsColliders) {
      const minY = b.minY ?? 0;
      const maxY = b.maxY ?? minY + 3;
      if (maxY <= 0.45 || minY >= 2.2) continue;
      const overlaps =
        b.maxX >= 23 && b.minX <= 31 && b.maxZ >= 22 && b.minZ <= 30;
      if (!overlaps) continue;
      lines.push(`${b.id} x=[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] z=[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}] y=[${minY.toFixed(2)},${maxY.toFixed(2)}] yaw=${b.rotation?.[1]?.toFixed(3) ?? '0'}`);
    }
    appendFileSync('.gauntlet-tmp/nk-colliders-out.txt', `${lines.join('\n')}\n`);
  });
});
