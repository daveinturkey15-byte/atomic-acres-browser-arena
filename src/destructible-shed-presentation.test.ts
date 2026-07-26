import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  admitShedDoorInteraction,
  advanceShedDoor,
  applyShedExplosion,
  applyShedSheetImpact,
  createInitialShedState,
  validateDestructibleShedDefinition,
  type ShedPlacement,
} from './destructible-world';
import {
  FIELD_SHED_DEFINITION,
  createFieldShedPresentation,
} from './destructible-shed-presentation';

const placement: ShedPlacement = Object.freeze({
  id: 'atomic-shed-vertical-slice',
  definitionId: FIELD_SHED_DEFINITION.id,
  arenaId: 'atomic-acres',
  zone: 'whole-arena',
  position: { x: 9, y: 0, z: -7 },
  yaw: Math.PI / 3,
});

describe('Pass 65 destructible shed presentation', () => {
  it('builds the canonical ridged dark-green vertical slice inside the eight-draw cap', () => {
    expect(validateDestructibleShedDefinition(FIELD_SHED_DEFINITION)).toEqual([]);
    const state = createInitialShedState(FIELD_SHED_DEFINITION, placement, 1);
    const presentation = createFieldShedPresentation(placement, state);
    expect(presentation.root.position.toArray()).toEqual([9, 0, -7]);
    expect(presentation.root.rotation.y).toBeCloseTo(Math.PI / 3);
    expect(presentation.root.getObjectByName('field-shed-damageable-shell')).toBeInstanceOf(THREE.Mesh);
    expect(presentation.root.getObjectByName('field-shed-door-leaf')).toBeInstanceOf(THREE.Mesh);
    expect(presentation.root.getObjectByName('field-shed-structural-frame')).toBeInstanceOf(THREE.InstancedMesh);
    expect(presentation.telemetry(state)).toEqual({ revision: 0, activeDraws: 4, apertures: 0, dents: 0, detachedChunks: 0 });
    presentation.dispose();
  });

  it('cuts real panel geometry and renders the rim from the same admitted aperture', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 2);
    const presentation = createFieldShedPresentation(placement, initial);
    const shell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const intactVertexCount = shell.geometry.getAttribute('position').count;
    const impact = applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 2,
      expectedRevision: initial.revision,
      surfaceId: 'wall-north',
      uQ: 1_500,
      vQ: -500,
      radiusUQ: 700,
      radiusVQ: 900,
      damageQ: 60,
      penetrationEnergyQ: 70,
    });
    presentation.sync(impact.state);
    const cutVertexCount = shell.geometry.getAttribute('position').count;
    const rims = presentation.root.getObjectByName('field-shed-aperture-rims') as THREE.InstancedMesh;
    expect(cutVertexCount).toBeGreaterThan(intactVertexCount);
    expect(rims.count).toBe(1);
    expect(presentation.telemetry(impact.state)).toMatchObject({ activeDraws: 5, apertures: 1 });
    presentation.dispose();
  });

  it('drives the door hinge only from canonical angle state', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 3);
    const presentation = createFieldShedPresentation(placement, initial);
    const admitted = admitShedDoorInteraction(initial, {
      isHost: true,
      matchEpoch: 3,
      expectedRevision: initial.revision,
      actorId: 'player-a',
      actorAlive: true,
      sequence: 1,
      distance: 1,
      hasLineOfSight: true,
      tick: 100,
    });
    const halfway = advanceShedDoor(admitted.state, 130);
    presentation.sync(halfway);
    const hinge = presentation.root.getObjectByName('field-shed-door-hinge') as THREE.Group;
    expect(hinge.rotation.y).toBeCloseTo(-Math.PI / 4);
    presentation.dispose();
  });

  it('keeps a door aperture rim attached to the identical moving panel frame', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 5);
    const perforated = applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
      isHost: true, matchEpoch: 5, expectedRevision: 0, surfaceId: 'door-south',
      uQ: 4_000, vQ: 0, radiusUQ: 800, radiusVQ: 800, damageQ: 60, penetrationEnergyQ: 70,
    });
    const presentation = createFieldShedPresentation(placement, perforated.state);
    const rims = presentation.root.getObjectByName('field-shed-aperture-rims') as THREE.InstancedMesh;
    const closed = new THREE.Matrix4();
    rims.getMatrixAt(0, closed);
    const moving = admitShedDoorInteraction(perforated.state, {
      isHost: true, matchEpoch: 5, expectedRevision: perforated.state.revision,
      actorId: 'player-a', actorAlive: true, sequence: 1, distance: 1, hasLineOfSight: true, tick: 10,
    });
    const halfway = advanceShedDoor(moving.state, 40);
    presentation.sync(halfway);
    const opened = new THREE.Matrix4();
    rims.getMatrixAt(0, opened);
    const closedPosition = new THREE.Vector3().setFromMatrixPosition(closed);
    const openedPosition = new THREE.Vector3().setFromMatrixPosition(opened);
    expect(openedPosition.distanceTo(closedPosition)).toBeGreaterThan(0.25);
    presentation.dispose();
  });

  it('swaps an authored detached panel for one bounded major-debris instance', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 4);
    const presentation = createFieldShedPresentation(placement, initial);
    const shell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const intactVertexCount = shell.geometry.getAttribute('position').count;
    const fractured = applyShedExplosion(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 4,
      expectedRevision: initial.revision,
      surfaceId: 'wall-west',
      damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ,
    });
    presentation.sync(fractured.state);
    const debris = presentation.root.getObjectByName('field-shed-major-debris') as THREE.InstancedMesh;
    expect(shell.geometry.getAttribute('position').count).toBeLessThan(intactVertexCount);
    expect(debris.count).toBe(1);
    expect(presentation.telemetry(fractured.state)).toMatchObject({ activeDraws: 5, detachedChunks: 1 });
    presentation.dispose();
  });
});
