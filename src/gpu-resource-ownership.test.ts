import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cloneMeshGeometriesForOwner, ownedMeshGeometryCount } from './gpu-resource-ownership';

describe('independently retired GPU resource ownership', () => {
  it('clones shared source geometry before an instance can dispose it', () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    let sourceDisposals = 0;
    source.addEventListener('dispose', () => { sourceDisposals += 1; });
    const firstRoot = new THREE.Group();
    const first = new THREE.Mesh(source, new THREE.MeshBasicMaterial());
    const second = new THREE.Mesh(source, new THREE.MeshBasicMaterial());
    firstRoot.add(first, second);
    const secondRoot = new THREE.Group();
    const otherInstance = new THREE.Mesh(source, new THREE.MeshBasicMaterial());
    secondRoot.add(otherInstance);

    expect(cloneMeshGeometriesForOwner(firstRoot, 'operator-instance')).toBe(1);
    expect(cloneMeshGeometriesForOwner(secondRoot, 'operator-instance')).toBe(1);
    expect(first.geometry).not.toBe(source);
    expect(first.geometry).toBe(second.geometry);
    expect(first.geometry).not.toBe(otherInstance.geometry);
    expect(ownedMeshGeometryCount(firstRoot, 'operator-instance')).toBe(1);
    expect(ownedMeshGeometryCount(secondRoot, 'operator-instance')).toBe(1);

    first.geometry.dispose();
    otherInstance.geometry.dispose();
    expect(sourceDisposals).toBe(0);
  });
});
