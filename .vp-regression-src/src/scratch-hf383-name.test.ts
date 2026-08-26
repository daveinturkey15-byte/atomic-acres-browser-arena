import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { buildArena } from './map';

describe('name that collider', () => {
  it('names colliders near the pocket', () => {
    const map = buildArena(new THREE.Scene());
    const lines: string[] = [];
    for (const b of map.physicsColliders) {
      if (b.maxX > 20 && b.minX < 28 && b.maxZ > 25 && b.minZ < 30.5 && (b.maxY ?? 0) < 2) {
        let bestName = '<unnamed>';
        let bestD = Infinity;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        for (const node of map.root.children) {
          const d = Math.hypot(node.position.x - cx, node.position.z - cz);
          if (d < bestD) { bestD = d; bestName = node.name; }
        }
        lines.push(`[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}]x[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}]y[${(b.minY ?? 0).toFixed(2)},${(b.maxY ?? 0).toFixed(2)}] rot=${JSON.stringify(b.rotation ?? null)} name~${bestName}@${bestD.toFixed(1)}`);
      }
    }
    writeFileSync('.gauntlet-tmp/hf383-names.txt', lines.join('\n'));
  });
});
