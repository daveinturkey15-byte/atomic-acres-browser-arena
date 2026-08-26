import * as THREE from 'three';
import { it } from 'vitest';
import { buildArena } from './map';

it('sills', () => {
  const map = buildArena(new THREE.Scene());
  for (const b of map.colliders) {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (cx < -20 && cx > -32 && cz > 15 && cz < 27) {
      console.log(`sig=${(b.maxX-b.minX).toFixed(4)}x${(b.maxZ-b.minZ).toFixed(4)} centre=(${cx.toFixed(4)},${cz.toFixed(4)})`);
    }
  }
});
