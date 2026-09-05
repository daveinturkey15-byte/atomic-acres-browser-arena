import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createArenaArtReadyContract } from './arena-art-ready';
import { buildNuketown2 } from './nuketown2-arena';

describe('arena authored-art readiness', () => {
  it('stays not-ready while a placeholder material is present, then becomes ready when resolved', () => {
    const scene = new THREE.Scene();
    const arena = buildNuketown2(scene);
    const root = arena.root;
    const mesh = root.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const material = mesh.material as THREE.Material;
    material.userData.arenaArtMaterialState = 'placeholder';
    root.visible = true;

    const contract = arena.artReadyContract ?? createArenaArtReadyContract('nuketown2', root, scene);
    expect(contract.snapshot()).toMatchObject({
      arenaId: 'nuketown2',
      authoredArtRootVisible: true,
      authoredMaterialsResolved: false,
      streamingSettled: true,
      ready: false,
      registry: { unresolvedMaterialCount: 1 },
    });

    material.userData.arenaArtMaterialState = 'resolved';
    expect(contract.snapshot()).toMatchObject({
      authoredArtRootVisible: true,
      authoredMaterialsResolved: true,
      streamingSettled: true,
      ready: true,
      registry: { unresolvedMaterialCount: 0 },
    });

    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    material.dispose();
  });

  it('reports pending texture and LUT generation from the authored root', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.userData.arenaArtPendingTextureCount = 1;
    root.userData.arenaArtPendingLutCount = 1;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    scene.add(root);
    root.visible = true;

    expect(createArenaArtReadyContract('nuketown2', root, scene).snapshot()).toMatchObject({
      authoredMaterialsResolved: true,
      streamingSettled: false,
      ready: false,
      registry: { pendingTextureCount: 1, pendingLutCount: 1 },
    });
  });
});
