import * as THREE from 'three';
import { expect, it } from 'vitest';
import { buildHighSeas } from './high-seas';

it('scratch budget probe', () => {
  const map = buildHighSeas(new THREE.Scene());
  let draws = 0;
  let triangles = 0;
  map.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((entry) => entry.visible)) return;
    draws += node instanceof THREE.InstancedMesh ? node.count : 1;
    const geometry = node.geometry;
    const primitiveTriangles = geometry.index
      ? geometry.index.count / 3
      : (geometry.getAttribute('position')?.count ?? 0) / 3;
    triangles += primitiveTriangles * (node instanceof THREE.InstancedMesh ? node.count : 1);
  });
  console.log(`HF392-BASELINE draws=${draws} triangles=${triangles}`);
  expect(true).toBe(true);
});
