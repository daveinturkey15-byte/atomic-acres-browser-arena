import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  admitShedDoorInteraction,
  advanceShedDoor,
  applyShedExplosion,
  applyShedSheetImpact,
  applyShedStructuralBlast,
  createInitialShedState,
  resetShedState,
  validateDestructibleShedDefinition,
  type ShedPlacement,
} from './destructible-world';
import {
  DestructibleShedPresentation,
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
    for (const name of ['field-shed-dents', 'field-shed-major-debris']) {
      const mesh = presentation.root.getObjectByName(name) as THREE.InstancedMesh;
      expect(mesh.instanceColor, `${name}:prewarmed-color-buffer`).not.toBeNull();
      expect(mesh.instanceColor?.usage, `${name}:dynamic-color-buffer`).toBe(THREE.DynamicDrawUsage);
      expect(mesh.userData.instanceColorPrewarmed).toBe(true);
    }
    expect(presentation.telemetry(state)).toEqual({
      revision: 0,
      activeDraws: 4,
      apertures: 0,
      dents: 0,
      detachedChunks: 0,
      retiredGeometries: 0,
      frameCollapsed: false,
      prewarmed: false,
    });
    presentation.dispose();
  });

  it('slopes both roof sheets up to the centre ridge with outward-facing normals', () => {
    for (const surfaceId of ['roof-east', 'roof-west']) {
      const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => candidate.id === surfaceId)!;
      const centre = new THREE.Vector3(surface.frame.centre.x, surface.frame.centre.y, surface.frame.centre.z);
      const u = new THREE.Vector3(surface.frame.uAxis.x, surface.frame.uAxis.y, surface.frame.uAxis.z);
      const v = new THREE.Vector3(surface.frame.vAxis.x, surface.frame.vAxis.y, surface.frame.vAxis.z);
      const ridge = centre.clone().addScaledVector(v, surface.frame.halfV);
      const eave = centre.clone().addScaledVector(v, -surface.frame.halfV);
      expect(Math.abs(ridge.x), `${surfaceId}:ridge-x`).toBeLessThan(0.01);
      expect(Math.abs(eave.x), `${surfaceId}:eave-x`).toBeGreaterThan(1.79);
      expect(ridge.y).toBeGreaterThan(eave.y);
      expect(new THREE.Vector3().crossVectors(u, v).normalize().y).toBeGreaterThan(0.8);
    }
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
    const cutShell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const cutVertexCount = cutShell.geometry.getAttribute('position').count;
    const rims = presentation.root.getObjectByName('field-shed-aperture-rims') as THREE.InstancedMesh;
    expect(cutShell).not.toBe(shell);
    expect(cutVertexCount).toBeGreaterThan(intactVertexCount);
    expect(rims.count).toBe(1);
    expect(presentation.telemetry(impact.state)).toMatchObject({ activeDraws: 5, apertures: 1 });
    presentation.dispose();
  });

  it('hands replaced WebGPU geometry to the renderer fence instead of retaining it across rematches', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 12);
    const retired: THREE.BufferGeometry[] = [];
    const presentation = new DestructibleShedPresentation(
      FIELD_SHED_DEFINITION,
      placement,
      initial,
      (geometry) => retired.push(geometry),
    );
    const impact = applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 12,
      expectedRevision: initial.revision,
      surfaceId: 'wall-north',
      uQ: 0,
      vQ: 0,
      radiusUQ: 700,
      radiusVQ: 700,
      damageQ: 60,
      penetrationEnergyQ: 70,
    });
    presentation.sync(impact.state);
    expect(retired).toHaveLength(2);
    expect(presentation.telemetry(impact.state).retiredGeometries).toBe(0);
    presentation.dispose();
    retired.forEach((geometry) => geometry.dispose());
  });

  it('replaces WebGPU mesh identities and keeps a detached door hidden with complete buffers through reset', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 13);
    const retired: THREE.BufferGeometry[] = [];
    const presentation = new DestructibleShedPresentation(
      FIELD_SHED_DEFINITION,
      placement,
      initial,
      (geometry) => retired.push(geometry),
    );
    const initialShell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const initialDoor = presentation.root.getObjectByName('field-shed-door-leaf') as THREE.Mesh;
    const perforated = applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 13,
      expectedRevision: initial.revision,
      surfaceId: 'wall-north',
      uQ: 0,
      vQ: 0,
      radiusUQ: 700,
      radiusVQ: 700,
      damageQ: 60,
      penetrationEnergyQ: 70,
    });
    presentation.sync(perforated.state);
    const perforatedShell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const perforatedDoor = presentation.root.getObjectByName('field-shed-door-leaf') as THREE.Mesh;
    expect(perforatedShell).not.toBe(initialShell);
    expect(perforatedDoor).not.toBe(initialDoor);
    expect(retired).toEqual(expect.arrayContaining([initialShell.geometry, initialDoor.geometry]));

    const detached = applyShedExplosion(FIELD_SHED_DEFINITION, perforated.state, {
      isHost: true,
      matchEpoch: 13,
      expectedRevision: perforated.state.revision,
      surfaceId: 'door-south',
      damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ,
    });
    presentation.sync(detached.state);
    const detachedDoor = presentation.root.getObjectByName('field-shed-door-leaf') as THREE.Mesh;
    expect(detachedDoor).not.toBe(perforatedDoor);
    expect(detachedDoor.visible).toBe(false);
    expect(detachedDoor.geometry.index?.count).toBeGreaterThan(0);
    expect(detachedDoor.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(detachedDoor.geometry.getAttribute('normal').count).toBeGreaterThan(0);
    expect(detachedDoor.geometry.getAttribute('uv').count).toBeGreaterThan(0);
    expect(retired).toContain(perforatedDoor.geometry);

    const reset = resetShedState(detached.state, 14, FIELD_SHED_DEFINITION, placement);
    presentation.sync(reset);
    const resetShell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const resetDoor = presentation.root.getObjectByName('field-shed-door-leaf') as THREE.Mesh;
    expect(resetShell).not.toBe(perforatedShell);
    expect(resetDoor).not.toBe(detachedDoor);
    expect(resetDoor.visible).toBe(true);
    expect(resetDoor.geometry.index?.count).toBeGreaterThan(0);
    expect(resetDoor.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(resetDoor.geometry.getAttribute('normal').count).toBeGreaterThan(0);
    expect(resetDoor.geometry.getAttribute('uv').count).toBeGreaterThan(0);
    expect(retired).toEqual(expect.arrayContaining([detachedDoor.geometry, perforatedShell.geometry]));
    presentation.dispose();
    retired.forEach((geometry) => geometry.dispose());
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

  it('deepens, spreads and recolors repeated damage in one persistent local region', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 16);
    const presentation = createFieldShedPresentation(placement, initial);
    const first = applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
      isHost: true, matchEpoch: 16, expectedRevision: 0, surfaceId: 'wall-east',
      uQ: 1_000, vQ: 1_000, radiusUQ: 850, radiusVQ: 850, damageQ: 32, penetrationEnergyQ: 10,
    });
    presentation.sync(first.state);
    const dents = presentation.root.getObjectByName('field-shed-dents') as THREE.InstancedMesh;
    expect(dents.userData).toMatchObject({
      regionalDamageModel: 'persistent-neighbour-density-v1',
      regionalRadiusQ: 1_800,
    });
    const firstMatrix = new THREE.Matrix4();
    dents.getMatrixAt(0, firstMatrix);
    const firstScale = new THREE.Vector3();
    firstMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), firstScale);
    const firstColor = new THREE.Color();
    dents.getColorAt(0, firstColor);

    const second = applyShedSheetImpact(FIELD_SHED_DEFINITION, first.state, {
      isHost: true, matchEpoch: 16, expectedRevision: first.state.revision, surfaceId: 'wall-east',
      uQ: 1_120, vQ: 940, radiusUQ: 850, radiusVQ: 850, damageQ: 32, penetrationEnergyQ: 10,
    });
    presentation.sync(second.state);
    expect(dents.count).toBe(2);
    const strengthenedMatrix = new THREE.Matrix4();
    dents.getMatrixAt(0, strengthenedMatrix);
    const strengthenedScale = new THREE.Vector3();
    strengthenedMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), strengthenedScale);
    const strengthenedColor = new THREE.Color();
    dents.getColorAt(0, strengthenedColor);
    const secondMatrix = new THREE.Matrix4();
    dents.getMatrixAt(1, secondMatrix);
    expect(strengthenedScale.x).toBeGreaterThan(firstScale.x);
    expect(strengthenedScale.z).toBeGreaterThan(firstScale.z);
    expect(strengthenedColor.getHex()).not.toBe(firstColor.getHex());
    expect(new THREE.Vector3().setFromMatrixPosition(strengthenedMatrix).distanceTo(
      new THREE.Vector3().setFromMatrixPosition(secondMatrix),
    )).toBeGreaterThan(0.001);
    presentation.dispose();
  });

  it('renders bounded pressed-metal geometry and keeps the dent attached after sheet detachment', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 6);
    const presentation = createFieldShedPresentation(placement, initial);
    const dented = applyShedSheetImpact(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 6,
      expectedRevision: initial.revision,
      surfaceId: 'wall-west',
      uQ: 1_700,
      vQ: -800,
      radiusUQ: 900,
      radiusVQ: 900,
      damageQ: 30,
      penetrationEnergyQ: 20,
    });
    presentation.sync(dented.state);
    const dents = presentation.root.getObjectByName('field-shed-dents') as THREE.InstancedMesh;
    expect(dents.count).toBe(1);
    expect(dents.userData.deformationModel).toBe('pressed-metal-geometry-v1');
    expect(dents.castShadow).toBe(true);
    expect(dents.receiveShadow).toBe(true);
    const positions = dents.geometry.getAttribute('position');
    const normals = dents.geometry.getAttribute('normal');
    expect(positions.count).toBeGreaterThan(40);
    expect(Math.max(...Array.from({ length: positions.count }, (_, index) => positions.getZ(index)))
      - Math.min(...Array.from({ length: positions.count }, (_, index) => positions.getZ(index)))).toBeGreaterThan(0.5);
    expect(Array.from({ length: normals.count }, (_, index) => Math.hypot(normals.getX(index), normals.getY(index)))
      .some((slope) => slope > 0.1)).toBe(true);
    const attachedMatrix = new THREE.Matrix4();
    dents.getMatrixAt(0, attachedMatrix);
    const attachedScale = new THREE.Vector3();
    attachedMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), attachedScale);
    expect(attachedScale.z).toBeGreaterThan(0.018);
    expect(attachedScale.z).toBeLessThanOrEqual(0.1);

    const detached = applyShedExplosion(FIELD_SHED_DEFINITION, dented.state, {
      isHost: true,
      matchEpoch: 6,
      expectedRevision: dented.state.revision,
      surfaceId: 'wall-west',
      damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ - 30,
    });
    presentation.sync(detached.state);
    const debris = presentation.root.getObjectByName('field-shed-major-debris') as THREE.InstancedMesh;
    expect(dents.count).toBe(2);
    expect(debris.count).toBe(1);
    expect(debris.castShadow).toBe(true);
    expect(debris.receiveShadow).toBe(true);
    expect(debris.userData.geometryKind).toBe('definition-scaled-corrugated-sheet-v1');
    expect(debris.geometry.name).toBe('field-shed-corrugated-sheet-debris-geometry');
    const debrisMatrix = new THREE.Matrix4();
    const debrisScale = new THREE.Vector3();
    debris.getMatrixAt(0, debrisMatrix);
    debrisMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), debrisScale);
    expect(debrisScale.x).toBeCloseTo(2.1);
    expect(debrisScale.y).toBeCloseTo(1.2);
    expect(debrisScale.z).toBeCloseTo(1);
    expect(presentation.telemetry(detached.state)).toMatchObject({
      dents: 2,
      detachedChunks: 1,
      activeDraws: 6,
    });
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
    const fracturedShell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    const debris = presentation.root.getObjectByName('field-shed-major-debris') as THREE.InstancedMesh;
    expect(fracturedShell).not.toBe(shell);
    expect(fracturedShell.geometry.getAttribute('position').count).toBeLessThan(intactVertexCount);
    expect(debris.count).toBe(1);
    expect(presentation.telemetry(fractured.state)).toMatchObject({ activeDraws: 6, detachedChunks: 1, dents: 1 });
    presentation.dispose();
  });

  it('keeps an empty shell valid when Carpet Bomber detaches every panel at once', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 8);
    const presentation = createFieldShedPresentation(placement, initial);
    const obliterated = applyShedStructuralBlast(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 8,
      expectedRevision: initial.revision,
      blastId: 'carpet-bomber-obliteration-8-1',
      blastClass: 'carpet-bomber-obliteration',
      originLocal: { x: 0, y: 1.2, z: 0 },
    });

    expect(obliterated.accepted).toBe(true);
    expect(() => presentation.sync(obliterated.state)).not.toThrow();
    const shell = presentation.root.getObjectByName('field-shed-damageable-shell') as THREE.Mesh;
    expect(shell.geometry.getAttribute('position')).toBeUndefined();
    // Owner direction: the structural frame must break with the panels. After a
    // full obliteration the members stay visible but topple into a deterministic
    // wreckage layout lying on the ground instead of floating as a skeleton.
    const frame = presentation.root.getObjectByName('field-shed-structural-frame') as THREE.InstancedMesh;
    expect(frame.visible).toBe(true);
    const toppled = new THREE.Matrix4();
    frame.getMatrixAt(4, toppled); // ridge beam: stood at y=3.45
    const toppledPosition = new THREE.Vector3().setFromMatrixPosition(toppled);
    expect(toppledPosition.y).toBeLessThan(0.4);
    expect(presentation.telemetry(obliterated.state)).toMatchObject({ detachedChunks: 6, frameCollapsed: true });
    presentation.dispose();
  });

  it('keeps the structural frame standing while any panel remains attached', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 8);
    const presentation = createFieldShedPresentation(placement, initial);
    presentation.sync(initial);
    const frame = presentation.root.getObjectByName('field-shed-structural-frame') as THREE.InstancedMesh;
    expect(frame.visible).toBe(true);
    expect(presentation.telemetry(initial)).toMatchObject({ frameCollapsed: false });
    presentation.dispose();
  });

  // HF-332: Prewarms interactive destruction and collapse debris presentation resources
  it('prewarms rims, dents, and debris pipelines and sets prewarmed telemetry', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 9);
    const presentation = createFieldShedPresentation(placement, initial);
    scene.add(presentation.root);

    let compileRuns = 0;
    const runtime = {
      compileAndRender: async (root: THREE.Object3D) => {
        compileRuns += 1;
        expect(root).toBe(presentation.root);
        const rims = presentation.root.getObjectByName('field-shed-aperture-rims') as THREE.InstancedMesh;
        const dents = presentation.root.getObjectByName('field-shed-dents') as THREE.InstancedMesh;
        const debris = presentation.root.getObjectByName('field-shed-major-debris') as THREE.InstancedMesh;
        expect(rims.count).toBeGreaterThan(0);
        expect(dents.count).toBeGreaterThan(0);
        expect(debris.count).toBeGreaterThan(0);
      },
    };

    expect(presentation.telemetry(initial).prewarmed).toBe(false);
    await presentation.prewarm(runtime, camera, 1);
    expect(compileRuns).toBe(1);
    expect(presentation.telemetry(initial).prewarmed).toBe(true);

    // Idempotent with same generation
    await presentation.prewarm(runtime, camera, 1);
    expect(compileRuns).toBe(1);

    // Runs again for a new sceneGeneration
    await presentation.prewarm(runtime, camera, 2);
    expect(compileRuns).toBe(2);

    // Instance counts restored after prewarm
    const rimsAfter = presentation.root.getObjectByName('field-shed-aperture-rims') as THREE.InstancedMesh;
    const dentsAfter = presentation.root.getObjectByName('field-shed-dents') as THREE.InstancedMesh;
    const debrisAfter = presentation.root.getObjectByName('field-shed-major-debris') as THREE.InstancedMesh;
    expect(rimsAfter.count).toBe(0);
    expect(dentsAfter.count).toBe(0);
    expect(debrisAfter.count).toBe(0);

    presentation.dispose();
  });

  it('throws on prewarm when detached and re-arms on failure', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 10);
    const presentation = createFieldShedPresentation(placement, initial);

    await expect(presentation.prewarm({ compileAndRender: async () => undefined }, camera, 1))
      .rejects.toThrow('Destructible shed presentation must be attached to a scene before prewarm');
    expect(presentation.telemetry(initial).prewarmed).toBe(false);

    const scene = new THREE.Scene();
    scene.add(presentation.root);
    const failingRuntime = {
      compileAndRender: async () => {
        throw new Error('synthetic WebGPU compile error');
      },
    };
    await expect(presentation.prewarm(failingRuntime, camera, 1)).rejects.toThrow('synthetic WebGPU compile error');
    // HF-332: Re-armed for retry on next deployment
    expect(presentation.telemetry(initial).prewarmed).toBe(false);

    // Succeeded retry
    await presentation.prewarm({ compileAndRender: async () => undefined }, camera, 1);
    expect(presentation.telemetry(initial).prewarmed).toBe(true);
    presentation.dispose();
  });
});
