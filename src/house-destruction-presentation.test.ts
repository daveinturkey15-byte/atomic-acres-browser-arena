import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HOUSE_LAYOUT } from './arena-layout';
import { createHouseArchitecture } from './house-navigation';
import {
  applyHouseFragmentDamage,
  createAtomicHouseFragmentDefinitions,
  createInitialHouseDestructionState,
} from './house-destruction';
import { HouseDestructionPresentation } from './house-destruction-presentation';

const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
const definitions = createAtomicHouseFragmentDefinitions(houses);

describe('profile-safe Atomic-house fragment presentation', () => {
  it('uses four bounded instanced draws and never quality-hides runtime-only furniture', () => {
    const state = createInitialHouseDestructionState(definitions, 31);
    const presentation = new HouseDestructionPresentation(definitions, state);
    expect(presentation.root.userData).toMatchObject({
      authorityClass: 'host-owned-preauthored-house-fragments',
      qualityInvariantMajorFragments: true,
      arbitraryRuntimeFracture: false,
    });
    expect(presentation.telemetry()).toEqual({
      fragments: 10,
      detached: 0,
      visibleInstances: 10,
      activeDraws: 4,
      externalProfileOwnsStaticFragments: false,
      prewarmed: false,
    });
    presentation.setExternalProfileOwnsStaticFragments(true);
    expect(presentation.telemetry()).toEqual({
      fragments: 10,
      detached: 0,
      visibleInstances: 2,
      activeDraws: 1,
      externalProfileOwnsStaticFragments: true,
      prewarmed: false,
    });
    expect(presentation.raycastMeshes().map((mesh) => mesh.name)).toEqual([
      'atomic-house-fragments:storage-locker',
    ]);
    presentation.dispose();
  });

  it('keeps a detached profile-owned wall visible and moving under external Quality art', () => {
    const initial = createInitialHouseDestructionState(definitions, 32);
    const wall = definitions.find((definition) => definition.role === 'wall')!;
    const detached = applyHouseFragmentDamage(definitions, initial, {
      isHost: true, matchEpoch: 32, expectedRevision: 0,
      fragmentId: wall.id, damageQ: wall.detachDamageQ,
    }).state;
    const presentation = new HouseDestructionPresentation(definitions, detached);
    presentation.setExternalProfileOwnsStaticFragments(true);
    expect(presentation.telemetry()).toMatchObject({ detached: 1, visibleInstances: 3, activeDraws: 2 });
    const materialMesh = presentation.root.getObjectByName(
      `atomic-house-fragments:${wall.presentationMaterialId}`,
    ) as THREE.InstancedMesh;
    expect(materialMesh.visible).toBe(true);
    expect(materialMesh.userData.qualityInvariantMajorFragments).toBe(true);
    const ids = materialMesh.userData.fragmentIds as string[];
    const matrix = new THREE.Matrix4();
    materialMesh.getMatrixAt(ids.indexOf(wall.id), matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(wall.position.x, 5);
    expect(position.y).toBeCloseTo(wall.position.y, 5);
    expect(position.z).toBeCloseTo(wall.position.z, 5);
    presentation.setExternalProfileOwnsStaticFragments(false);
    expect(presentation.telemetry()).toMatchObject({ visibleInstances: 10, activeDraws: 4 });
    presentation.dispose();
  });

  // HF-332: Prewarms interactive house destruction presentation resources
  it('prewarms house destruction material pipelines and sets prewarmed telemetry', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const initial = createInitialHouseDestructionState(definitions, 33);
    const presentation = new HouseDestructionPresentation(definitions, initial);
    scene.add(presentation.root);

    let compileRuns = 0;
    const runtime = {
      compileAndRender: async (root: THREE.Object3D) => {
        compileRuns += 1;
        expect(root).toBe(presentation.root);
        for (const name of [
          'atomic-house-fragments:aqua-wall',
          'atomic-house-fragments:coral-wall',
          'atomic-house-fragments:roof-shingles',
          'atomic-house-fragments:storage-locker',
        ]) {
          const mesh = presentation.root.getObjectByName(name) as THREE.InstancedMesh;
          expect(mesh.visible).toBe(true);
        }
      },
    };

    expect(presentation.telemetry().prewarmed).toBe(false);
    await presentation.prewarm(runtime, camera, 1);
    expect(compileRuns).toBe(1);
    expect(presentation.telemetry().prewarmed).toBe(true);

    // Idempotent for same sceneGeneration
    await presentation.prewarm(runtime, camera, 1);
    expect(compileRuns).toBe(1);

    // Runs again for new sceneGeneration
    await presentation.prewarm(runtime, camera, 2);
    expect(compileRuns).toBe(2);

    presentation.dispose();
  });

  it('throws on prewarm when detached and re-arms on failure', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const initial = createInitialHouseDestructionState(definitions, 34);
    const presentation = new HouseDestructionPresentation(definitions, initial);

    await expect(presentation.prewarm({ compileAndRender: async () => undefined }, camera, 1))
      .rejects.toThrow('House destruction presentation must be attached to a scene before prewarm');
    expect(presentation.telemetry().prewarmed).toBe(false);

    const scene = new THREE.Scene();
    scene.add(presentation.root);
    const failingRuntime = {
      compileAndRender: async () => {
        throw new Error('synthetic compile failure');
      },
    };
    await expect(presentation.prewarm(failingRuntime, camera, 1)).rejects.toThrow('synthetic compile failure');
    // HF-332: Re-armed for retry on next deployment
    expect(presentation.telemetry().prewarmed).toBe(false);

    // Succeeded retry
    await presentation.prewarm({ compileAndRender: async () => undefined }, camera, 1);
    expect(presentation.telemetry().prewarmed).toBe(true);
    presentation.dispose();
  });
});
