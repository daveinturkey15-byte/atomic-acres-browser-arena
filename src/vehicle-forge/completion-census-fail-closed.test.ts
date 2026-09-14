import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collectMeshCensus } from '../../scripts/qa/collider-visual-parity-core';
import { FORGE_VEHICLE_ANCHOR_ATTRIBUTE, partitionMergedVehicles } from './build';

function fixture(indexed = false): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const source = indexed ? geometry : geometry.toNonIndexed();
  const anchors = new Float32Array(source.getAttribute('position').count * 2);
  source.setAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE, new THREE.Float32BufferAttribute(anchors, 2));
  source.computeBoundingBox(); // Invalid coordinates must not hide behind this old box.
  const mesh = new THREE.Mesh(source, new THREE.MeshBasicMaterial());
  mesh.name = 'census corruption fixture';
  return mesh;
}

describe('vehicle census corruption cannot remove visible geometry from the gate', () => {
  it.each([
    ['NaN x', (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position').setX(1, Number.NaN)],
    ['infinite y', (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position').setY(1, Number.POSITIVE_INFINITY)],
    ['infinite z', (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position').setZ(1, Number.NEGATIVE_INFINITY)],
    ['all coordinates NaN', (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position').array.fill(Number.NaN)],
    ['non-finite parent transform', (mesh: THREE.Mesh) => { mesh.scale.y = Number.NaN; }],
  ] as const)('%s is reported with its full count, even with a cached old bounding box', (_, corrupt) => {
    const mesh = fixture();
    corrupt(mesh);
    const scene = new THREE.Scene();
    scene.add(mesh);
    scene.updateMatrixWorld(true);
    expect(partitionMergedVehicles(mesh.geometry, mesh.matrixWorld).kind).toBe('malformed');
    const census = collectMeshCensus(scene);
    expect(census.visibleMeshes).toBe(1);
    expect(census.meshes).toEqual([]);
    expect(census.meshComponents).toEqual({ partitionedMeshes: 0, components: 0, partitionedVertices: 0, malformedAnchorMeshes: 1 });
    expect(census.unmeasurableMeshes).toEqual([{ name: mesh.name, path: expect.any(String), vertices: 36 }]);
    mesh.geometry.dispose();
  });

  it('mixed triangle ownership falls back to whole geometry and blocks the malformed-metadata gate', () => {
    const mesh = fixture();
    mesh.geometry.getAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE).setX(1, 100);
    expect(partitionMergedVehicles(mesh.geometry)).toMatchObject({ kind: 'malformed', vertices: 36, reason: 'ownership changes within triangle 0' });
    const scene = new THREE.Scene();
    scene.add(mesh);
    const census = collectMeshCensus(scene);
    expect(census.meshComponents.malformedAnchorMeshes).toBe(1);
    expect(census.meshComponents.partitionedVertices).toBe(0);
    expect(census.meshes).toHaveLength(1);
    expect(census.meshes[0].vertices).toBe(36);
    expect(census.meshes[0].component).toBeUndefined();
    expect(census.unmeasurableMeshes).toEqual([]);
    mesh.geometry.dispose();
  });

  it('an indexed anchor mesh is measured whole until indexed ownership is explicitly supported', () => {
    const mesh = fixture(true);
    expect(partitionMergedVehicles(mesh.geometry).kind).toBe('malformed');
    const scene = new THREE.Scene();
    scene.add(mesh);
    const census = collectMeshCensus(scene);
    expect(census.meshComponents.malformedAnchorMeshes).toBe(1);
    expect(census.meshComponents.partitionedVertices).toBe(0);
    expect(census.meshes).toHaveLength(1);
    expect(census.meshes[0].vertices).toBe(24);
    mesh.geometry.dispose();
  });

  it('ordinary unanchored meshes retain whole-mesh accounting', () => {
    const mesh = fixture();
    mesh.geometry.deleteAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const census = collectMeshCensus(scene);
    expect(census.visibleMeshes).toBe(1);
    expect(census.meshes).toHaveLength(1);
    expect(census.meshes[0].vertices).toBe(36);
    expect(census.meshComponents.malformedAnchorMeshes).toBe(0);
    expect(census.unmeasurableMeshes).toEqual([]);
    mesh.geometry.dispose();
  });
});
