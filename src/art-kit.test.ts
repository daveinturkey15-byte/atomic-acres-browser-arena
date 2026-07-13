import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes } from './art-kit';

describe('palette static batching', () => {
  it('preserves ordinary material colours instead of blending the default black emissive channel', () => {
    const root = new THREE.Group();
    root.name = 'palette-test';
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 })),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc66d5a })),
    );
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'palette-basic');
    const batch = destination.getObjectByName('palette-test-render-batches');
    const colors = batch?.children.map((node) => {
      expect(node).toBeInstanceOf(THREE.Mesh);
      return ((node as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex();
    });

    expect(stats).toEqual({ sourceMeshes: 2, batches: 2 });
    expect(colors).toEqual(expect.arrayContaining([0x4eaaa7, 0xc66d5a]));
  });

  it('batches transparent authored materials while preserving opacity', () => {
    const root = new THREE.Group();
    root.name = 'glass-test';
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x78bad0, transparent: true, opacity: 0.5 }),
    );
    root.add(glass);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'palette-basic');
    const batch = destination.getObjectByName('glass-test-render-batches')?.children[0] as THREE.Mesh;
    const material = batch.material as THREE.MeshBasicMaterial;

    expect(stats).toEqual({ sourceMeshes: 1, batches: 1 });
    expect(glass.visible).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
    expect(material.depthWrite).toBe(false);
  });
});
