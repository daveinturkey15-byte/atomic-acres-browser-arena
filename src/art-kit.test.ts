import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticMeshes, optimizeAttachedWeapon } from './art-kit';

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

  it('keeps lit palette batches responsive to authored lighting', () => {
    const root = new THREE.Group();
    root.name = 'lit-test';
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 })));
    const destination = new THREE.Group();

    batchStaticMeshes(root, destination, () => '', 'palette-lit');
    const material = (destination.getObjectByName('lit-test-render-batches')?.children[0] as THREE.Mesh).material;

    expect(material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('preserves mapped materials, UVs and normals in texture-lit batches', () => {
    const root = new THREE.Group();
    root.name = 'texture-lit-test';
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 0.8 });
    const first = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    first.castShadow = true;
    first.receiveShadow = true;
    const second = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    second.position.x = 2;
    root.add(first, second);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'texture-lit');
    const batch = destination.getObjectByName('texture-lit-test-render-batches')?.children[0] as THREE.Mesh;

    expect(stats).toEqual({ sourceMeshes: 2, batches: 1 });
    expect(batch.material).toBe(material);
    expect(batch.geometry.getAttribute('uv')).toBeDefined();
    expect(batch.geometry.getAttribute('normal')).toBeDefined();
    expect(batch.castShadow).toBe(false);
    expect(batch.receiveShadow).toBe(true);
  });

  it('collapses colour groups into one vertex-lit batch without losing palette variation', () => {
    const root = new THREE.Group();
    root.name = 'vertex-lit-test';
    const aqua = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 }));
    const gold = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd6a944 }));
    gold.position.x = 2;
    root.add(aqua, gold);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'vertex-lit');
    const batch = destination.getObjectByName('vertex-lit-test-render-batches')?.children[0] as THREE.Mesh;
    const colors = batch.geometry.getAttribute('color') as THREE.BufferAttribute;
    const unique = new Set(Array.from({ length: colors.count }, (_, index) => new THREE.Color(colors.getX(index), colors.getY(index), colors.getZ(index)).getHex()));

    expect(stats).toEqual({ sourceMeshes: 2, batches: 1 });
    expect(batch.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(unique).toEqual(new Set([0x4eaaa7, 0xd6a944]));
  });
});

describe('attached weapon draw-call batching', () => {
  it('collapses immutable pieces while preserving animated mechanics and sockets', () => {
    const weapon = new THREE.Group();
    weapon.name = 'synthetic-weapon';
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x454b50 }),
      new THREE.MeshStandardMaterial({ color: 0xd6a944 }),
      new THREE.MeshStandardMaterial({ color: 0x202529 }),
    ];
    for (let index = 0; index < 36; index += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), materials[index % materials.length]);
      mesh.position.z = index * 0.01;
      weapon.add(mesh);
    }
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), materials[0]);
    bolt.name = 'bolt-or-slide';
    weapon.add(bolt);
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle-socket';
    weapon.add(muzzle);
    const before = weapon.getObjectsByProperty('isMesh', true).filter((node) => node.visible).length;
    const stats = optimizeAttachedWeapon(weapon, 'palette-lit');
    const after = weapon.getObjectsByProperty('isMesh', true).filter((node) => node.visible).length;

    expect(before).toBe(37);
    expect(stats.sourceMeshes).toBe(36);
    expect(stats.batches).toBe(3);
    expect(after).toBe(4);
    expect(weapon.getObjectByName('muzzle-socket')).toBeDefined();
    expect(weapon.getObjectByName('bolt-or-slide')?.visible).toBe(true);
  });
});
