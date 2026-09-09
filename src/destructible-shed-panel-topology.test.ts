import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createInitialShedState,
  type BallisticAperture,
  type DamageableSheetSurfaceState,
} from './destructible-world';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';
import { createShedPanelShape } from './destructible-shed-presentation';
import { normaliseApertures } from './destructible-shed-panel-topology';

const wallEast = FIELD_SHED_DEFINITION.surfaces.find((surface) => surface.id === 'wall-east')!;
const gableNorth = FIELD_SHED_DEFINITION.surfaces.find((surface) => surface.id === 'gable-north')!;

function aperture(id: number, uQ: number, vQ: number, radiusUQ = 700, radiusVQ = 700): BallisticAperture {
  return { id, surfaceId: wallEast.id, uQ, vQ, radiusUQ, radiusVQ };
}

function surfaceState(surfaceId: string, apertures: readonly BallisticAperture[]): DamageableSheetSurfaceState {
  return {
    surfaceId,
    role: 'wall',
    attachedChunkId: null,
    healthQ: 1_000,
    stage: 'perforated',
    apertures,
    dents: [],
  };
}

describe('destructible shed panel topology hygiene', () => {
  it('drops exact-coincident and wholly-contained later apertures while preserving distinct holes', () => {
    const first = aperture(1, 0, 0);
    const duplicate = aperture(2, 0, 0);
    const contained = aperture(3, 30, 30, 120, 120);
    const distinct = aperture(4, 3_000, 0);
    expect(normaliseApertures(wallEast, [first, duplicate, contained, distinct])).toEqual([first, distinct]);
  });

  it('drops only centers outside the rendered gable outline', () => {
    const inside = { id: 1, surfaceId: gableNorth.id, uQ: 0, vQ: -9_000, radiusUQ: 500, radiusVQ: 500 };
    const outside = { id: 2, surfaceId: gableNorth.id, uQ: 0, vQ: 12_000, radiusUQ: 500, radiusVQ: 500 };
    expect(normaliseApertures(gableNorth, [inside, outside])).toEqual([inside]);
  });

  it('keeps three duplicate authority apertures as valid indexed panel geometry', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, {
      id: 'topology-test-shed', definitionId: FIELD_SHED_DEFINITION.id, arenaId: 'atomic-acres',
      zone: 'whole-arena', position: { x: 0, y: 0, z: 0 }, yaw: 0,
    }, 77);
    const state = {
      ...initial,
      surfaces: initial.surfaces.map((surface) => surface.surfaceId === wallEast.id
        ? surfaceState(wallEast.id, [aperture(1, 0, 0), aperture(2, 0, 0), aperture(3, 0, 0)])
        : surface),
    };
    const geometry = new THREE.ShapeGeometry(createShedPanelShape(wallEast, state.surfaces.find((surface) => surface.surfaceId === wallEast.id)!), 18);
    expect(geometry.index?.count ?? 0).toBeGreaterThan(0);
    geometry.dispose();
  });
});
