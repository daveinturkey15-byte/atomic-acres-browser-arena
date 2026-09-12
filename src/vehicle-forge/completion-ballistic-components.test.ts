import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { auditArena, collectMeshCensus } from '../../scripts/qa/collider-visual-parity-core';
import type { ArenaMap } from '../map';

function geometry(parts: Array<[number, number, number, number, number, number]>) {
  const g = mergeGeometries(parts.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z)))!;
  g.setAttribute('forgeVehicleAnchor', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}
function makeMap(scene: THREE.Scene, g: THREE.BufferGeometry, surfaces: ArenaMap['shotSurfaces'] = []) {
  const root = new THREE.Group(); const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  mesh.name = 'vehicle-forge merged chrome'; mesh.userData.presentationOnly = true;
  root.add(mesh); scene.add(root);
  return { root, colliders: [], physicsColliders: [], shotSurfaces: surfaces, bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } } as unknown as Omit<ArenaMap, 'id'>;
}
const rails: Array<[number, number, number, number, number, number]> = [
  [0, 0.3, -2, 2, 0.1, 0.1], [0, 1.8, 2, 2, 0.1, 0.1],
];
describe('gunfire census of anchored material batches', () => {
  it('does not treat the air between disconnected trim as a solid wall, while retaining every vertex', async () => {
    const scene = new THREE.Scene(); makeMap(scene, geometry(rails));
    const census = collectMeshCensus(scene);
    expect(census.meshes).toHaveLength(1); // movement keeps the owning envelope
    const owner = census.meshes[0]!;
    expect(owner.ballisticParts).toHaveLength(2);
    expect(owner.ballisticParts!.reduce((sum, part) => sum + part.vertices, 0)).toBe(owner.vertices);
    const result = await auditArena('synthetic', s => makeMap(s, geometry(rails)));
    expect(result.ballisticGhostMeshes).toEqual([]);
  });
  it('still reports a real unregistered tall panel inside the same material batch', async () => {
    const result = await auditArena('synthetic', s => makeMap(s, geometry([...rails, [0, 1.2, 0, 2, 2, 0.1]])));
    expect(result.ballisticGhostMeshes).toHaveLength(1);
    expect(result.ballisticGhostMeshes![0]!.ballisticPart).toBeDefined();
  });
  it('retains solid cover assembled from small touching pieces with no shared vertices', async () => {
    // Different widths mean the touching faces have no coincident corners.
    // Each piece is shorter than 0.9m; together they are substantial cover.
    const result = await auditArena('synthetic', s => makeMap(s, geometry([
      [0, 0.3, 0, 2, 0.6, 0.1], [0.25, 0.9, 0, 1, 0.6, 0.1],
    ])));
    expect(result.ballisticGhostMeshes).toHaveLength(1);
  });
  it('refuses to let a low base explain a tall panel, then accepts the matching full-height authority', async () => {
    const shape: Array<[number, number, number, number, number, number]> = [[0, 1.2, 0, 2, 2, 0.1]];
    const surface = { id: 'panel', name: 'panel', bounds: { minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1, minY: 0, maxY: 0.4 }, material: 'thin-metal' as const, classification: 'explicit' as const };
    const low = await auditArena('synthetic', s => makeMap(s, geometry(shape), [surface]));
    expect(low.ballisticGhostMeshes).toHaveLength(1);
    const full = await auditArena('synthetic', s => makeMap(s, geometry(shape), [{ ...surface, bounds: { ...surface.bounds, maxY: 2.3 } }]));
    expect(full.ballisticGhostMeshes).toEqual([]);
  });
  it('keeps a disconnected missing-coverage body as a finding under its own owner', async () => {
    const g = geometry([[0, 1, 0, 2, 2, 2], [8, 1, 0, 2, 2, 2]]);
    const anchor = g.getAttribute('forgeVehicleAnchor');
    for (let i = 36; i < anchor.count; i++) anchor.setX(i, 8);
    const result = await auditArena('synthetic', s => makeMap(s, g));
    expect(result.ballisticGhostMeshes).toHaveLength(2);
  });
});
