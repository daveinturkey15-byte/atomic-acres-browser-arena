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
    });
    presentation.setExternalProfileOwnsStaticFragments(true);
    expect(presentation.telemetry()).toEqual({
      fragments: 10,
      detached: 0,
      visibleInstances: 2,
      activeDraws: 1,
      externalProfileOwnsStaticFragments: true,
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
});
