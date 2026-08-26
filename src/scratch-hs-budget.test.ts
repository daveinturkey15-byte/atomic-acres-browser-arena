import * as THREE from 'three';
import { it } from 'vitest';
import { buildHighSeas } from './high-seas';

it('logs geometry budget', () => {
  const map = buildHighSeas(new THREE.Scene());
  let draws = 0;
  let triangles = 0;
  map.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const index = geometry.getIndex();
    const primitiveTriangles = index ? index.count / 3 : position.count / 3;
    draws += node instanceof THREE.InstancedMesh ? node.count : 1;
    triangles += primitiveTriangles * (node instanceof THREE.InstancedMesh ? node.count : 1);
  });
  console.log('BUDGET', JSON.stringify({ draws, triangles }));
});
