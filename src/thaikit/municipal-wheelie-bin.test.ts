import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createMunicipalWheelieBin, createMunicipalWheelieBinGeometry,
  createMunicipalWheelieBinMaterial, THAIKIT_BIN_ENVELOPE,
} from './municipal-wheelie-bin';

describe('adapted ThaiKit municipal wheelie bin', () => {
  it('fits the original placement envelope and existing 1200 triangle yard budget', () => {
    const mesh = createMunicipalWheelieBin();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
      expect(bounds.min[axis as 'x']).toBeCloseTo(THAIKIT_BIN_ENVELOPE.min[index], 6);
      expect(bounds.max[axis as 'x']).toBeCloseTo(THAIKIT_BIN_ENVELOPE.max[index], 6);
    }
    const triangles = mesh.geometry.index!.count / 3;
    expect(triangles).toBe(488);
    expect(756 - 72 + triangles).toBeLessThanOrEqual(1200);
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it('shares one draw resource per placement with no textures, lights or asset physics', () => {
    const geometry = createMunicipalWheelieBinGeometry();
    const material = createMunicipalWheelieBinMaterial();
    const north = createMunicipalWheelieBin(geometry, material);
    const south = createMunicipalWheelieBin(geometry, material);
    expect(north.geometry).toBe(south.geometry);
    expect(north.material).toBe(south.material);
    expect(material.map).toBeNull();
    expect(north.children).toHaveLength(0);
    expect(north.userData.colliders).toBeUndefined();
    expect(north.userData.presentationOnly).toBe(true);
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    material.addEventListener('dispose', materialDisposed);
    geometry.dispose(); material.dispose();
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
  });

  it('retains the exact licensed upstream factory separately from adapted runtime source', () => {
    const path = 'docs/third-party/thaikit/municipal-wheelie-bin/';
    expect(createHash('sha256').update(readFileSync(`${path}createObjectModel.ts`)).digest('hex'))
      .toBe('e74fe0186d075d1c47b9967c713063a42225959145565a40287684f933c231e4');
    expect(readFileSync(`${path}LICENSE`, 'utf8')).toContain('MIT License');
  });
});
