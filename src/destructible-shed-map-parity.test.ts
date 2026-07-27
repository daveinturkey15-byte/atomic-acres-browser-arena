import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIELD_SHED_DEFINITION,
  FIELD_SHED_MATERIAL_IDS,
  FIELD_SHED_MATERIAL_POLICY_ID,
} from './destructible-shed-definition';
import { DestructibleShedPresentation } from './destructible-shed-presentation';
import { shedPlacementsForArena } from './destructible-shed-registry';
import {
  applyShedSheetImpact,
  createInitialShedState,
  shedSurfaceNormal,
  type ShedPlacement,
  type ShedState,
} from './destructible-world';

function materialIds(root: THREE.Object3D): readonly string[] {
  const ids = new Set<string>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => ids.add(material.name));
  });
  return Object.freeze([...ids].sort());
}

function dentedState(placement: ShedPlacement, matchEpoch: number): ShedState {
  const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, matchEpoch);
  return applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
    isHost: true,
    matchEpoch,
    expectedRevision: initial.revision,
    surfaceId: 'wall-east',
    uQ: 1_300,
    vQ: -700,
    radiusUQ: 850,
    radiusVQ: 850,
    damageQ: 32,
    penetrationEnergyQ: 20,
  }).state;
}

function firstDentMatrix(presentation: DestructibleShedPresentation): readonly number[] {
  const dents = presentation.root.getObjectByName('field-shed-dents') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  dents.getMatrixAt(0, matrix);
  return Object.freeze(matrix.toArray().map((value) => Number(value.toFixed(6))));
}

describe('Pass 65 RustRig/Terminal shed definition and material parity', () => {
  it('projects every placement from one definition and one named material policy', () => {
    const placements = [
      ...shedPlacementsForArena('rustworks-1v1'),
      ...shedPlacementsForArena('skyline-terminal'),
    ];
    expect(placements).toHaveLength(4);
    const expectedMaterials = Object.values(FIELD_SHED_MATERIAL_IDS).sort();
    for (const [index, placement] of placements.entries()) {
      expect(placement.definitionId).toBe(FIELD_SHED_DEFINITION.id);
      const state = createInitialShedState(FIELD_SHED_DEFINITION, placement, index + 1);
      const presentation = new DestructibleShedPresentation(FIELD_SHED_DEFINITION, placement, state);
      expect(presentation.root.userData).toMatchObject({
        definitionId: FIELD_SHED_DEFINITION.id,
        materialPolicyId: FIELD_SHED_MATERIAL_POLICY_ID,
        qualityInvariantMajorFragments: true,
      });
      expect(materialIds(presentation.root)).toEqual(expectedMaterials);
      presentation.dispose();
    }
  });

  it('keeps roof winding upward/outward after every RustRig and Terminal placement yaw', () => {
    const placements = [
      ...shedPlacementsForArena('rustworks-1v1'),
      ...shedPlacementsForArena('skyline-terminal'),
    ];
    const roofs = FIELD_SHED_DEFINITION.surfaces.filter((surface) => surface.role === 'roof');
    for (const placement of placements) {
      for (const roof of roofs) {
        const normal = shedSurfaceNormal(roof.frame);
        const worldNormal = new THREE.Vector3(normal.x, normal.y, normal.z).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          placement.yaw,
        );
        const worldCentre = new THREE.Vector3(
          roof.frame.centre.x,
          roof.frame.centre.y,
          roof.frame.centre.z,
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
        expect(worldNormal.y, `${placement.id}:${roof.id}:up`).toBeGreaterThan(0.8);
        expect(
          worldNormal.x * worldCentre.x + worldNormal.z * worldCentre.z,
          `${placement.id}:${roof.id}:outward`,
        ).toBeGreaterThan(0.4);
      }
    }
  });

  it('produces identical local degradation state and presentation on RustRig and Terminal', () => {
    const rustPlacement = shedPlacementsForArena('rustworks-1v1')[0]!;
    const terminalPlacement = shedPlacementsForArena('skyline-terminal')[0]!;
    const rustState = dentedState(rustPlacement, 31);
    const terminalState = dentedState(terminalPlacement, 31);
    expect(rustState.surfaces).toEqual(terminalState.surfaces);

    const rustPresentation = new DestructibleShedPresentation(FIELD_SHED_DEFINITION, rustPlacement, rustState);
    const terminalPresentation = new DestructibleShedPresentation(FIELD_SHED_DEFINITION, terminalPlacement, terminalState);
    expect(firstDentMatrix(rustPresentation)).toEqual(firstDentMatrix(terminalPresentation));
    expect(materialIds(rustPresentation.root)).toEqual(materialIds(terminalPresentation.root));
    rustPresentation.dispose();
    terminalPresentation.dispose();
  });
});
