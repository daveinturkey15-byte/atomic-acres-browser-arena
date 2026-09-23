/** HF-536 facade port: before/after mesh, draw and triangle census (lane tool). */
import * as THREE from 'three';
import { buildNuketown2 } from '../../src/nuketown2-arena';

const scene = new THREE.Scene();
const map = buildNuketown2(scene);
let visibleMeshes = 0;
let triangles = 0;
let hidden = 0;
const byPrefix = new Map<string, { meshes: number; tris: number }>();
map.root.traverse((node) => {
  if (!(node instanceof THREE.Mesh)) return;
  const geometry = node.geometry;
  const tris = geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
  if (node.visible === false) { hidden += 1; return; }
  visibleMeshes += 1;
  triangles += tris;
  const key = node.name.replace(/\d+/g, '#').split(' ').slice(0, 3).join(' ');
  const slot = byPrefix.get(key) ?? { meshes: 0, tris: 0 };
  slot.meshes += 1; slot.tris += tris;
  byPrefix.set(key, slot);
});
const batches = map.root.userData.nuketown2PresentationBatches as unknown;
console.log(JSON.stringify({
  visibleMeshes, triangles, hiddenMeshes: hidden, batches,
  top: [...byPrefix.entries()].sort((a, b) => b[1].meshes - a[1].meshes).slice(0, 12)
    .map(([k, v]) => `${k}: ${v.meshes} meshes / ${v.tris} tris`),
}, null, 2));
