import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arenaHorizontalSurfaceAudit,
  collectHorizontalOverlaySpecs,
  computeMinimumSafeVerticalSeparation,
  findNearCoplanarPairs,
} from './coplanar-surface-audit';

// HF-346: threshold tests.
describe('coplanar surface audit', () => {
  it('computes a millimetre-rounded safe separation from near/far/z', () => {
    const threshold = computeMinimumSafeVerticalSeparation(0.08, 190, 71.72);
    expect(threshold).toBe(0.004);
  });

  it('grows quadratically with view distance', () => {
    const a = computeMinimumSafeVerticalSeparation(0.08, 190, 50);
    const b = computeMinimumSafeVerticalSeparation(0.08, 190, 100);
    expect(b).toBeGreaterThan(a);
  });

  it('flags two overlapping decals closer than the threshold', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    b.name = 'decal-b';
    b.position.set(0, 0.012, 0);
    root.add(a, b);
    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length).toBe(1);
    expect(pairs[0].dy).toBeCloseTo(0.002, 3);
  });

  it('allows two overlapping decals separated by the threshold', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    b.name = 'decal-b';
    b.position.set(0, 0.015, 0);
    root.add(a, b);
    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length).toBe(0);
  });

  it('records a failing audit on badly spaced geometry', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    root.add(a);
    const b = a.clone();
    b.name = 'decal-b';
    b.position.set(0, 0.011, 0);
    root.add(b);
    const audit = arenaHorizontalSurfaceAudit(root, 0.08, 190, 71.72);
    expect(audit.threshold).toBe(0.004);
    expect(audit.pass).toBe(false);
    expect(audit.pairs.length).toBeGreaterThan(0);
  });
});
