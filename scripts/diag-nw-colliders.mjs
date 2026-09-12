import * as THREE from 'three';
import { buildArena } from '../src/map';

const map = buildArena(new THREE.Scene());
for (const p of map.physicsColliders) {
  if (!(p.minX > -32 && p.maxX < -18 && p.maxZ > 23 && p.minZ < 32)) continue;
  const match = map.colliders.find(
    (c) => Math.abs(c.minX - p.minX) < 0.01 && Math.abs(c.maxX - p.maxX) < 0.01 && Math.abs(c.minZ - p.minZ) < 0.01 && Math.abs(c.maxZ - p.maxZ) < 0.01,
  );
  console.log(
    (match?.name ?? '<no named collider>') + ' | physics:',
    `x[${p.minX.toFixed(2)}..${p.maxX.toFixed(2)}] z[${p.minZ.toFixed(2)}..${p.maxZ.toFixed(2)}]`,
  );
}
