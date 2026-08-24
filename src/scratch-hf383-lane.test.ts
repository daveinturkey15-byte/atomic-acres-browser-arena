import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { FRONT_HEDGE_FIN_LAYOUT, FRONT_HEDGE_FIN_SIZE } from './arena-layout';
import { buildArena } from './map';

describe('lane debug', () => {
  it('checks blockers along the failing lane', () => {
    const map = buildArena(new THREE.Scene());
    const lines: string[] = [];
    lines.push(`finLayout=${JSON.stringify(FRONT_HEDGE_FIN_LAYOUT)} size=${JSON.stringify(FRONT_HEDGE_FIN_SIZE)}`);
    // Sample points along lane (-30,-7)->(30,-1)
    for (const x of [-20, -10, -5, 0, 5, 10, 15.5, 16, 16.5, 20, 25]) {
      const z = -7 + (x + 30) * (6 / 60);
      const hits = map.colliders.filter((b) => x > b.minX - 0.05 && x < b.maxX + 0.05 && z > b.minZ - 0.05 && z < b.maxZ + 0.05
        && 1.65 > (b.minY ?? 0) && 1.65 < (b.maxY ?? 3));
      const near = map.colliders.filter((b) => Math.abs((b.minX + b.maxX) / 2 - 16) < 2.5 && Math.abs((b.minZ + b.maxZ) / 2 + 6) < 4)
        .map((b) => `[${b.minX.toFixed(1)},${b.maxX.toFixed(1)}]x[${b.minZ.toFixed(1)},${b.maxZ.toFixed(1)}]y[${(b.minY ?? 0).toFixed(1)},${(b.maxY ?? 0).toFixed(1)}]`);
      lines.push(`x=${x} z=${z.toFixed(2)} blocking=${hits.length} nearStubs=${[...new Set(near)].join(' ')}`);
    }
    writeFileSync('.gauntlet-tmp/hf383-lane.txt', lines.join('\n'));
  });
});
