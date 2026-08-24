import * as THREE from 'three';
import { buildHighSeas } from '../../src/high-seas';

const scene = new THREE.Scene();
const map = buildHighSeas(scene);
let draws = 0;
let triangles = 0;
map.root.traverse((node) => {
  const mesh = node as THREE.Mesh;
  if (!mesh.isMesh) return;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const count = geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
  draws += 1;
  triangles += count;
});
console.log(JSON.stringify({ draws, triangles }));
