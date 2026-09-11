import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from '../nuketown2-arena';
import { batchPresentationOnlyBoxes } from '../additional-maps';
import {
  applyNuketownArchitecturalProfiles, createArchitecturalEdgeProfile,
  createClapboardProfile, inspectNuketownArchitecturalProfiles,
} from './architectural-profiles';

const bounds = (geometry: THREE.BufferGeometry) => {
  geometry.computeBoundingBox();
  return [...geometry.boundingBox!.min.toArray(), ...geometry.boundingBox!.max.toArray()];
};

describe('built architectural profiles', () => {
  it('keeps every clapboard envelope and triangle count while tilting all four outward faces', () => {
    for (const axis of ['x', 'z'] as const) for (const sign of [-1, 1]) {
      const source = new THREE.BoxGeometry(axis === 'x' ? 0.06 : 4, 0.216, axis === 'x' ? 4 : 0.06);
      const profile = createClapboardProfile(source, axis, sign);
      bounds(profile).forEach((value, index) => expect(value).toBeCloseTo(bounds(source)[index], 6));
      expect(profile.index!.count).toBe(source.index!.count);
      const normals = profile.getAttribute('normal');
      expect(Array.from({ length: normals.count }, (_, index) => normals.getY(index)).some((y) => y > 0.03 && y < 0.1)).toBe(true);
      source.dispose(); profile.dispose();
    }
  });

  it('bevels inside existing bounds and remains compatible with indexed box batching', () => {
    const source = new THREE.BoxGeometry(3, 0.12, 0.1);
    const profile = createArchitecturalEdgeProfile(source);
    expect(profile).toBeInstanceOf(THREE.BoxGeometry);
    expect(profile.index!.count / 3).toBe(108);
    bounds(profile).forEach((value, index) => expect(value).toBeCloseTo(bounds(source)[index], 6));
    for (const attribute of Object.values(profile.attributes)) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const original = new THREE.Mesh(source, material);
    const rounded = new THREE.Mesh(profile, material);
    for (const mesh of [original, rounded]) { mesh.userData.presentationBatchCandidate = true; root.add(mesh); }
    expect(batchPresentationOnlyBoxes(root).batches).toBe(1);
    const batch = root.children.find((entry) => entry.userData.sourceMeshes === 2) as THREE.Mesh;
    expect(batch.geometry.index!.count / 3).toBe(120);
    source.dispose(); profile.dispose(); batch.geometry.dispose(); material.dispose();
  });

  it('measures broad real-house coverage under budget and rejects late mutation of rendered batches', () => {
    const map = buildNuketown2(new THREE.Scene());
    const report = inspectNuketownArchitecturalProfiles(map.root);
    console.log('ARCHITECTURAL_PROFILE_CENSUS', JSON.stringify(report));
    expect(report.clapboards).toBeGreaterThan(500);
    expect(report.edges).toBeGreaterThanOrEqual(20);
    expect(report.addedTriangles).toBeLessThanOrEqual(4000);
    expect(() => applyNuketownArchitecturalProfiles(map.root)).toThrow(/before presentation batching/);
  });
});
