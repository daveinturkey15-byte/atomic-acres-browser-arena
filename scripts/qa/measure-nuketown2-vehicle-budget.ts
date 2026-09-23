#!/usr/bin/env tsx
/**
 * Nuke Town Rebuild street-vehicle DRAW-CALL and TRIANGLE budget.
 *
 * "Merged, so it is cheap" is a claim, not a measurement. This walks the real
 * constructed arena - the same `buildNuketown2` the game calls, including the
 * presentation batcher - and reports what a frame actually submits, split into
 * the street vehicles and everything else, so a vehicle change can be quoted
 * before and after against the same instrument.
 *
 * A hidden mesh costs nothing: `batchPresentationOnlyBoxes` sets
 * `visible = false` on every box it folds into a batch, so visibility is the
 * right filter, not the child count.
 *
 *   npx tsx scripts/qa/measure-nuketown2-vehicle-budget.ts
 */
import * as THREE from 'three';
import { buildNuketown2 } from '../../src/nuketown2-arena';

interface Row {
  meshes: number;
  triangles: number;
}

function add(row: Row, mesh: THREE.Mesh): void {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  row.meshes += 1;
  row.triangles += Math.round(((index ? index.count : position?.count ?? 0) / 3));
}

function visibleChain(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

const map = buildNuketown2(new THREE.Scene());
const vehicles: Row = { meshes: 0, triangles: 0 };
const rest: Row = { meshes: 0, triangles: 0 };
const byName: Array<{ name: string; triangles: number }> = [];

map.root.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  if (!visibleChain(object)) return;
  const path = ((): string => {
    const parts: string[] = [];
    let node: THREE.Object3D | null = object;
    while (node) { if (node.name) parts.unshift(node.name); node = node.parent; }
    return parts.join('/');
  })();
  const isVehicle = /street-vehicle|vehicle-forge|(north|south) car /.test(path);
  add(isVehicle ? vehicles : rest, object);
  if (isVehicle) {
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.getIndex();
    byName.push({ name: path, triangles: Math.round((index ? index.count : position?.count ?? 0) / 3) });
  }
});

const total: Row = {
  meshes: vehicles.meshes + rest.meshes,
  triangles: vehicles.triangles + rest.triangles,
};

console.log('nuketown2 street-vehicle budget');
console.log('  street vehicles   %d draw calls, %d triangles', vehicles.meshes, vehicles.triangles);
console.log('  rest of the arena %d draw calls, %d triangles', rest.meshes, rest.triangles);
console.log('  arena total       %d draw calls, %d triangles', total.meshes, total.triangles);
console.log('  colliders %d, physics colliders %d, shot surfaces %d',
  map.colliders.length, map.physicsColliders.length, map.shotSurfaces?.length ?? 0);
byName.sort((a, b) => b.triangles - a.triangles);
for (const row of byName.slice(0, 24)) console.log('    %s  %d tris', row.name, row.triangles);
