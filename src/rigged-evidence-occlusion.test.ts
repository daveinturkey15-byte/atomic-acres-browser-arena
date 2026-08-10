import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  collectRiggedEvidenceOccluders,
  firstRiggedEvidenceOccluder,
  installRiggedEvidenceMainCameraDrawSession,
  projectRiggedEvidenceLiveDeformedRasterRoi,
  riggedEvidenceIntersectionCanOcclude,
  riggedEvidenceMainCameraActorDrawComplete,
  validateRiggedEvidenceCaptureTargets,
} from './rigged-evidence-occlusion';

function fakeHit(mesh: THREE.Mesh, distance: number, materialIndex: number): THREE.Intersection {
  return {
    distance,
    point: new THREE.Vector3(distance, 0, 0),
    object: mesh,
    face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(1, 0, 0), materialIndex },
  };
}

function riggedDrawFixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 180);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  scene.add(camera);
  const root = new THREE.Group();
  scene.add(root);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0, 0.5, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setIndex([0, 1, 2]);
  const material = new THREE.MeshBasicMaterial();
  material.name = 'fixture-material';
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'fixture-skin';
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.position.z = -2;
  mesh.computeBoundingSphere();
  root.add(mesh);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const actor = Object.freeze({ kind: 'bot' as const, id: 'fixture-bot' });
  let frame = 41;
  let captureRevision = 7;
  const session = installRiggedEvidenceMainCameraDrawSession(
    [{ actor, root, operatorRoot: root }],
    scene,
    camera,
    () => frame,
    () => captureRevision,
    ['fixture-skin'],
  );
  const invoke = (
    phase: 'before' | 'after',
    renderScene: THREE.Scene = scene,
    renderCamera: THREE.Camera = camera,
    renderMaterial: THREE.Material = material,
    callbackGroup: Readonly<{ start: number; count: number; materialIndex: number }> | null = null,
  ) => {
    const callback = phase === 'before' ? mesh.onBeforeRender : mesh.onAfterRender;
    callback.call(
      mesh,
      {} as THREE.WebGLRenderer,
      renderScene,
      renderCamera,
      geometry,
      renderMaterial,
      callbackGroup as unknown as THREE.Group,
    );
  };
  return {
    scene,
    camera,
    root,
    mesh,
    material,
    actor,
    session: session!,
    invoke,
    setFrame: (value: number) => { frame = value; },
    setCaptureRevision: (value: number) => { captureRevision = value; },
  };
}

describe('rigged evidence per-intersection occluder qualification', () => {
  it('fails closed on null, malformed, duplicate, missing, or oversized capture targets', () => {
    const actorExists = (_kind: 'bot' | 'training-dummy', id: string) => id === 'present';
    expect(validateRiggedEvidenceCaptureTargets([], actorExists)).toEqual({ valid: true, targets: null });
    for (const adversary of [
      [null],
      [42],
      [{}],
      [{ kind: 'bot', id: '' }],
      [{ kind: 'other', id: 'present' }],
      [{ kind: 'bot', id: 'missing' }],
      [{ kind: 'bot', id: 'present' }, { kind: 'bot', id: 'present' }],
      Array.from({ length: 5 }, () => ({ kind: 'bot', id: 'present' })),
    ]) {
      expect(validateRiggedEvidenceCaptureTargets(adversary, actorExists)).toEqual({ valid: false, targets: null });
    }
    expect(validateRiggedEvidenceCaptureTargets([{ kind: 'bot', id: 'present' }], actorExists)).toEqual({
      valid: true,
      targets: [{ kind: 'bot', id: 'present' }],
    });
  });

  it('skips a transparent first group and retains a later opaque group hit', () => {
    const transparent = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2 });
    const opaque = new THREE.MeshBasicMaterial({ transparent: false });
    const mixed = new THREE.Mesh(new THREE.BufferGeometry(), [transparent, opaque]);
    const transparentHit = fakeHit(mixed, 1, 0);
    const opaqueHit = fakeHit(mixed, 2, 1);

    expect(riggedEvidenceIntersectionCanOcclude(transparentHit)).toBe(false);
    expect(riggedEvidenceIntersectionCanOcclude(opaqueHit)).toBe(true);
    expect(firstRiggedEvidenceOccluder([transparentHit, opaqueHit])).toBe(opaqueHit);
  });

  it('rejects the actual hidden or non-color-writing material even when another group is opaque', () => {
    const hidden = new THREE.MeshBasicMaterial();
    hidden.visible = false;
    const depthOnly = new THREE.MeshBasicMaterial();
    depthOnly.colorWrite = false;
    const opaque = new THREE.MeshBasicMaterial();
    const mixed = new THREE.Mesh(new THREE.BufferGeometry(), [hidden, depthOnly, opaque]);

    expect(firstRiggedEvidenceOccluder([
      fakeHit(mixed, 1, 0),
      fakeHit(mixed, 2, 1),
      fakeHit(mixed, 3, 2),
    ])?.distance).toBe(3);
  });

  it('uses the actual BufferGeometry group material and skips a nearer transparent real ray hit', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0, 1, -1, 0, 0, 1, 0,
      -1, -1, -1, 1, -1, -1, 0, 1, -1,
    ], 3));
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const transparent = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.2 });
    const opaque = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, [transparent, opaque]);
    mesh.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
    const hits = raycaster.intersectObject(mesh, false);

    expect(hits.map((hit) => hit.face?.materialIndex)).toEqual([0, 1]);
    expect(firstRiggedEvidenceOccluder(hits)?.face?.materialIndex).toBe(1);
  });

  it('excludes target descendants, camera children, and wrong-layer meshes while retaining another actor', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.layers.set(1);
    scene.add(camera);
    const actor = new THREE.Group();
    const actorMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    actor.add(actorMesh);
    scene.add(actor);
    const cameraChild = actorMesh.clone();
    camera.add(cameraChild);
    const otherActor = actorMesh.clone();
    otherActor.layers.set(1);
    scene.add(otherActor);
    const wrongLayer = actorMesh.clone();
    wrongLayer.layers.set(2);
    scene.add(wrongLayer);

    const observed = collectRiggedEvidenceOccluders(
      scene,
      camera,
      actor,
      (node) => node instanceof THREE.Mesh && node.layers.test(camera.layers),
    );
    expect(observed).toEqual([otherActor]);
  });

  it('records only exact gameplay-scene, gameplay-camera, world-layer callbacks and restores prior hooks', () => {
    const fixture = riggedDrawFixture();
    let originalBeforeCalls = 0;
    let originalAfterCalls = 0;
    fixture.session.dispose();
    fixture.mesh.onBeforeRender = () => { originalBeforeCalls += 1; };
    fixture.mesh.onAfterRender = () => { originalAfterCalls += 1; };
    const originalBefore = fixture.mesh.onBeforeRender;
    const originalAfter = fixture.mesh.onAfterRender;
    const session = installRiggedEvidenceMainCameraDrawSession(
      [{ actor: fixture.actor, root: fixture.root, operatorRoot: fixture.root }],
      fixture.scene,
      fixture.camera,
      () => 41,
      () => 7,
      ['fixture-skin'],
    )!;
    const wrongScene = new THREE.Scene();
    const wrongCamera = fixture.camera.clone();
    fixture.invoke('before', wrongScene, fixture.camera);
    fixture.invoke('after', wrongScene, fixture.camera);
    fixture.invoke('before', fixture.scene, wrongCamera);
    fixture.invoke('after', fixture.scene, wrongCamera);
    fixture.camera.layers.set(2);
    fixture.invoke('before');
    fixture.invoke('after');
    fixture.camera.layers.set(0);
    fixture.invoke('before');
    fixture.invoke('after');

    const receipt = session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)!;
    expect(receipt).toMatchObject({
      pixelProof: false,
      expectedMeshNames: ['fixture-skin'],
      beforeMeshNames: ['fixture-skin'],
      afterMeshNames: ['fixture-skin'],
      ignoredCallbacks: { wrongScene: 2, wrongCamera: 2, nonWorldCameraLayer: 2 },
      exactExpectedMeshNames: true,
      exactExpectedMeshUuids: true,
      complete: true,
    });
    expect(receipt.meshes[0]).toMatchObject({ beforeCount: 1, afterCount: 1, complete: true });
    expect(receipt.meshes[0].before).toMatchObject({
      frame: 41,
      captureRevision: 7,
      meshName: 'fixture-skin',
      meshLayerMask: 1,
      sceneUuid: fixture.scene.uuid,
      cameraLayerMask: 1,
      sceneOverrideMaterialUuid: null,
      drawRange: { start: 0, count: 'infinity', effectiveCount: 3, positionCount: 3, indexCount: 3 },
      world: { attachedToGameplayScene: true, effectivelyVisible: true, matrixFinite: true, determinant: 1 },
      frustum: { frustumCulled: true, intersectsMainCameraFrustum: true },
      stateValid: true,
    });
    expect(riggedEvidenceMainCameraActorDrawComplete(receipt)).toBe(true);
    expect(originalBeforeCalls).toBe(4);
    expect(originalAfterCalls).toBe(4);
    session.dispose();
    expect(fixture.mesh.onBeforeRender).toBe(originalBefore);
    expect(fixture.mesh.onAfterRender).toBe(originalAfter);
    session.dispose();
  });

  it('binds stamps to the exact frame and capture revision', () => {
    const fixture = riggedDrawFixture();
    fixture.invoke('before');
    fixture.invoke('after');
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)?.complete).toBe(true);
    const replacementRoot = new THREE.Group();
    (replacementRoot as unknown as { uuid: string }).uuid = fixture.root.uuid;
    const replacementOperatorRoot = new THREE.Group();
    (replacementOperatorRoot as unknown as { uuid: string }).uuid = fixture.root.uuid;
    fixture.root.add(replacementOperatorRoot);
    expect(fixture.session.actorReceipt(fixture.actor, replacementRoot, fixture.root, 41, 7)).toBeNull();
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, replacementOperatorRoot, 41, 7)).toBeNull();
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 42, 7)).toMatchObject({
      beforeMeshNames: [],
      afterMeshNames: [],
      complete: false,
    });
    fixture.setFrame(42);
    fixture.setCaptureRevision(8);
    fixture.invoke('before');
    fixture.invoke('after');
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 42, 8)?.complete).toBe(true);
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)?.complete).toBe(false);
    fixture.session.dispose();
  });

  it('rejects missing, extra, duplicate, or hidden visible-mesh manifests before installing callbacks', () => {
    const missing = riggedDrawFixture();
    missing.session.dispose();
    expect(installRiggedEvidenceMainCameraDrawSession(
      [{ actor: missing.actor, root: missing.root, operatorRoot: missing.root }], missing.scene, missing.camera,
      () => 41, () => 7, ['missing-skin'],
    )).toBeNull();

    const extra = riggedDrawFixture();
    extra.session.dispose();
    const extraMesh = extra.mesh.clone();
    extraMesh.name = 'extra-skin';
    extra.root.add(extraMesh);
    expect(installRiggedEvidenceMainCameraDrawSession(
      [{ actor: extra.actor, root: extra.root, operatorRoot: extra.root }], extra.scene, extra.camera,
      () => 41, () => 7, ['fixture-skin'],
    )).toBeNull();

    const duplicate = riggedDrawFixture();
    duplicate.session.dispose();
    const duplicateMesh = duplicate.mesh.clone();
    duplicateMesh.name = 'fixture-skin';
    duplicate.root.add(duplicateMesh);
    expect(installRiggedEvidenceMainCameraDrawSession(
      [{ actor: duplicate.actor, root: duplicate.root, operatorRoot: duplicate.root }],
      duplicate.scene, duplicate.camera, () => 41, () => 7,
      ['fixture-skin', 'another-skin'],
    )).toBeNull();

    const hidden = riggedDrawFixture();
    hidden.session.dispose();
    hidden.mesh.visible = false;
    expect(installRiggedEvidenceMainCameraDrawSession(
      [{ actor: hidden.actor, root: hidden.root, operatorRoot: hidden.root }], hidden.scene, hidden.camera,
      () => 41, () => 7, ['fixture-skin'],
    )).toBeNull();

    const shared = riggedDrawFixture();
    shared.session.dispose();
    expect(installRiggedEvidenceMainCameraDrawSession(
      [
        { actor: shared.actor, root: shared.root, operatorRoot: shared.root },
        {
          actor: { kind: 'training-dummy', id: 'same-root-forged-dummy' },
          root: shared.root,
          operatorRoot: shared.root,
        },
      ],
      shared.scene,
      shared.camera,
      () => 41,
      () => 7,
      ['fixture-skin'],
    )).toBeNull();
  });

  it('fails a null renderer-owned bound without computing or persisting one in the evidence callback', () => {
    const fixture = riggedDrawFixture();
    (fixture.mesh as unknown as { boundingSphere: THREE.Sphere | null }).boundingSphere = null;
    fixture.invoke('before');
    fixture.invoke('after');
    const receipt = fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)!;
    expect(fixture.mesh.boundingSphere).toBeNull();
    expect(receipt.meshes[0].before?.frustum.boundingSphere).toBeNull();
    expect(receipt.complete).toBe(false);
    fixture.session.dispose();
  });

  it('does not update mesh or camera matrices after an existing callback mutates local transforms', () => {
    const fixture = riggedDrawFixture();
    fixture.session.dispose();
    const meshWorldBefore = fixture.mesh.matrixWorld.clone();
    const cameraWorldBefore = fixture.camera.matrixWorld.clone();
    fixture.mesh.onBeforeRender = () => {
      fixture.mesh.position.x = 5;
      fixture.camera.position.x = 7;
    };
    const session = installRiggedEvidenceMainCameraDrawSession(
      [{ actor: fixture.actor, root: fixture.root, operatorRoot: fixture.root }],
      fixture.scene, fixture.camera, () => 41, () => 7, ['fixture-skin'],
    )!;
    fixture.invoke('before');
    expect(fixture.mesh.matrixWorld.equals(meshWorldBefore)).toBe(true);
    expect(fixture.camera.matrixWorld.equals(cameraWorldBefore)).toBe(true);
    expect(session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)?.meshes[0].before?.world.position[0]).toBe(0);
    session.dispose();
  });

  it('stamps and rejects a same-scene same-camera override-material pass', () => {
    const fixture = riggedDrawFixture();
    const override = new THREE.MeshDepthMaterial();
    fixture.scene.overrideMaterial = override;
    fixture.invoke('before');
    fixture.invoke('after');
    const receipt = fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)!;
    expect(receipt.meshes[0].before?.sceneOverrideMaterialUuid).toBe(override.uuid);
    expect(receipt.meshes[0].after?.sceneOverrideMaterialUuid).toBe(override.uuid);
    expect(receipt.complete).toBe(false);
    fixture.session.dispose();
  });

  it('records every material group and fails a zero or malformed group intersection', () => {
    const fixture = riggedDrawFixture();
    const secondMaterial = new THREE.MeshBasicMaterial();
    (fixture.material as unknown as { uuid: string }).uuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    (secondMaterial as unknown as { uuid: string }).uuid = '00000000-0000-4000-8000-000000000001';
    (fixture.mesh as unknown as { material: THREE.Material | THREE.Material[] }).material = [
      fixture.material,
      secondMaterial,
    ];
    const group0 = { start: 0, count: 3, materialIndex: 0 };
    const group1 = { start: 0, count: 3, materialIndex: 1 };
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('before', fixture.scene, fixture.camera, secondMaterial, group1);
    fixture.invoke('after', fixture.scene, fixture.camera, secondMaterial, group1);
    const complete = fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)!;
    expect(complete.meshes[0]).toMatchObject({ beforeCount: 2, afterCount: 2, complete: true });
    expect(complete.meshes[0].materialSlotUuids).toEqual([fixture.material.uuid, secondMaterial.uuid]);
    expect(complete.meshes[0].materialUuidSet).toEqual([secondMaterial.uuid, fixture.material.uuid]);
    expect(complete.meshes[0].beforeStamps.map(({ drawRange }) => drawRange.group)).toEqual([group0, group1]);

    fixture.setFrame(42);
    const zeroGroup = { start: 0, count: 0, materialIndex: 0 };
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, zeroGroup);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, zeroGroup);
    fixture.invoke('before', fixture.scene, fixture.camera, secondMaterial, group1);
    fixture.invoke('after', fixture.scene, fixture.camera, secondMaterial, group1);
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 42, 7)?.complete).toBe(false);

    fixture.setFrame(43);
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, null);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, null);
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 43, 7)?.complete).toBe(false);

    fixture.setFrame(44);
    (fixture.mesh as unknown as { material: THREE.Material | THREE.Material[] }).material = [
      fixture.material,
      fixture.material,
    ];
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, group1);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, group1);
    const reused = fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 44, 7)!;
    expect(reused.complete).toBe(true);
    expect(reused.meshes[0].materialSlotUuids).toEqual([fixture.material.uuid, fixture.material.uuid]);
    expect(reused.meshes[0].materialUuidSet).toEqual([fixture.material.uuid]);

    fixture.setFrame(45);
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('before', fixture.scene, fixture.camera, fixture.material, group0);
    fixture.invoke('after', fixture.scene, fixture.camera, fixture.material, group0);
    expect(fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 45, 7)?.complete).toBe(false);
    fixture.session.dispose();
  });

  it.each([
    ['no callback', (_fixture: ReturnType<typeof riggedDrawFixture>) => undefined],
    ['detached actor', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      fixture.root.removeFromParent();
      fixture.invoke('before');
      fixture.invoke('after');
    }],
    ['reparented mesh', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      const replacementRoot = new THREE.Group();
      fixture.scene.add(replacementRoot);
      replacementRoot.add(fixture.mesh);
      fixture.invoke('before');
      fixture.invoke('after');
    }],
    ['layer mismatch', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      fixture.mesh.layers.set(1);
      fixture.invoke('before');
      fixture.invoke('after');
    }],
    ['offscreen bounds', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      fixture.mesh.position.x = 1_000;
      fixture.scene.updateMatrixWorld(true);
      fixture.invoke('before');
      fixture.invoke('after');
    }],
    ['zero draw range', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      fixture.mesh.geometry.setDrawRange(0, 0);
      fixture.invoke('before');
      fixture.invoke('after');
    }],
    ['invisible material', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      fixture.material.visible = false;
      fixture.invoke('before');
      fixture.invoke('after');
    }],
    ['scene override material', (fixture: ReturnType<typeof riggedDrawFixture>) => {
      fixture.scene.overrideMaterial = new THREE.MeshDepthMaterial();
      fixture.invoke('before');
      fixture.invoke('after');
    }],
  ])('fails closed for the %s adversary', (_label, mutate) => {
    const fixture = riggedDrawFixture();
    mutate(fixture);
    const receipt = fixture.session.actorReceipt(fixture.actor, fixture.root, fixture.root, 41, 7)!;
    expect(receipt.complete).toBe(false);
    expect(riggedEvidenceMainCameraActorDrawComplete(receipt)).toBe(false);
    fixture.session.dispose();
  });

  it('runs the exact observe/suppress/restored sequence and restores all three material writes per draw', () => {
    const fixture = riggedDrawFixture();
    fixture.material.depthWrite = false;
    fixture.material.stencilWrite = true;
    const renderMode = (
      mode: 'visible-observe' | 'principal-write-suppressed' | 'visible-restored',
      frame: number,
      revision: number,
    ) => {
      fixture.setFrame(frame);
      fixture.setCaptureRevision(revision);
      expect(fixture.session.configurePrincipalWriteControl({
        sessionId: fixture.session.sessionId,
        actor: fixture.actor,
        captureRevision: revision,
        mode,
      })).toBe(true);
      fixture.invoke('before');
      if (mode === 'principal-write-suppressed') {
        expect({
          colorWrite: fixture.material.colorWrite,
          depthWrite: fixture.material.depthWrite,
          stencilWrite: fixture.material.stencilWrite,
        }).toEqual({ colorWrite: false, depthWrite: false, stencilWrite: false });
      }
      fixture.invoke('after');
      fixture.session.restorePrincipalWritesAfterRenderCall();
      return fixture.session.principalWriteControlReceipt(fixture.actor, frame, revision)!;
    };
    const observed = renderMode('visible-observe', 41, 7);
    const suppressed = renderMode('principal-write-suppressed', 42, 8);
    const restored = renderMode('visible-restored', 43, 9);
    expect([observed.mode, suppressed.mode, restored.mode]).toEqual([
      'visible-observe', 'principal-write-suppressed', 'visible-restored',
    ]);
    expect(suppressed).toMatchObject({
      observedDrawCount: 1,
      suppressionAppliedCount: 1,
      suppressionRestoredAfterCount: 1,
      suppressionRestoredFinallyCount: 0,
      outstandingSuppressionCount: 0,
      materialStateRestored: true,
      complete: true,
    });
    expect(suppressed.suppressionEntries[0]).toMatchObject({
      before: { colorWrite: true, depthWrite: false, stencilWrite: true },
      suppressed: { colorWrite: false, depthWrite: false, stencilWrite: false },
      suppressedExactly: true,
      restoredBy: 'after-render',
      after: { colorWrite: true, depthWrite: false, stencilWrite: true },
      restoredExactly: true,
    });
    expect({
      colorWrite: fixture.material.colorWrite,
      depthWrite: fixture.material.depthWrite,
      stencilWrite: fixture.material.stencilWrite,
    }).toEqual({ colorWrite: true, depthWrite: false, stencilWrite: true });
    expect(suppressed.drawManifest).toEqual(observed.drawManifest);
    expect(restored.drawManifest).toEqual(observed.drawManifest);
    fixture.session.dispose();
  });

  it('fails closed for stale sessions, stale revisions, wrong mode order, and zero callbacks', () => {
    const fixture = riggedDrawFixture();
    expect(fixture.session.configurePrincipalWriteControl({
      sessionId: 'stale-session', actor: fixture.actor, captureRevision: 7, mode: 'visible-observe',
    })).toBe(false);
    expect(fixture.session.configurePrincipalWriteControl({
      sessionId: fixture.session.sessionId, actor: fixture.actor, captureRevision: 6, mode: 'visible-observe',
    })).toBe(false);
    expect(fixture.session.configurePrincipalWriteControl({
      sessionId: fixture.session.sessionId, actor: fixture.actor, captureRevision: 7, mode: 'principal-write-suppressed',
    })).toBe(false);
    expect(fixture.session.configurePrincipalWriteControl({
      sessionId: fixture.session.sessionId, actor: fixture.actor, captureRevision: 7, mode: 'visible-observe',
    })).toBe(true);
    fixture.session.restorePrincipalWritesAfterRenderCall();
    expect(fixture.session.principalWriteControlReceipt(fixture.actor, 41, 7)).toMatchObject({
      observedDrawCount: 0,
      complete: false,
    });
    fixture.setCaptureRevision(8);
    expect(fixture.session.configurePrincipalWriteControl({
      sessionId: fixture.session.sessionId, actor: fixture.actor, captureRevision: 8, mode: 'principal-write-suppressed',
    })).toBe(false);
    fixture.session.dispose();
  });

  it.each(['render-finally', 'abort', 'dispose'] as const)(
    'restores an unbalanced suppressed callback on %s',
    (restoration) => {
      const fixture = riggedDrawFixture();
      expect(fixture.session.configurePrincipalWriteControl({
        sessionId: fixture.session.sessionId, actor: fixture.actor, captureRevision: 7, mode: 'visible-observe',
      })).toBe(true);
      fixture.invoke('before');
      fixture.invoke('after');
      fixture.session.restorePrincipalWritesAfterRenderCall();
      fixture.setFrame(42);
      fixture.setCaptureRevision(8);
      expect(fixture.session.configurePrincipalWriteControl({
        sessionId: fixture.session.sessionId, actor: fixture.actor, captureRevision: 8, mode: 'principal-write-suppressed',
      })).toBe(true);
      fixture.invoke('before');
      expect(fixture.material.colorWrite).toBe(false);
      if (restoration === 'render-finally') fixture.session.restorePrincipalWritesAfterRenderCall();
      if (restoration === 'abort') fixture.session.abortPrincipalWriteControl();
      if (restoration === 'dispose') fixture.session.dispose();
      expect(fixture.material.colorWrite).toBe(true);
      if (restoration === 'render-finally') {
        expect(fixture.session.principalWriteControlReceipt(fixture.actor, 42, 8)).toMatchObject({
          suppressionRestoredFinallyCount: 1,
          complete: false,
        });
      }
      fixture.session.dispose();
    },
  );

  it('restores before a throwing original after-render callback escapes', () => {
    const fixture = riggedDrawFixture();
    fixture.session.dispose();
    let throwAfter = false;
    fixture.mesh.onAfterRender = () => { if (throwAfter) throw new Error('fixture-after-render'); };
    const session = installRiggedEvidenceMainCameraDrawSession(
      [{ actor: fixture.actor, root: fixture.root, operatorRoot: fixture.root }],
      fixture.scene,
      fixture.camera,
      () => 42,
      () => throwAfter ? 8 : 7,
      ['fixture-skin'],
    )!;
    expect(session.configurePrincipalWriteControl({
      sessionId: session.sessionId, actor: fixture.actor, captureRevision: 7, mode: 'visible-observe',
    })).toBe(true);
    fixture.invoke('before');
    fixture.invoke('after');
    session.restorePrincipalWritesAfterRenderCall();
    throwAfter = true;
    expect(session.configurePrincipalWriteControl({
      sessionId: session.sessionId, actor: fixture.actor, captureRevision: 8, mode: 'principal-write-suppressed',
    })).toBe(true);
    fixture.invoke('before');
    expect(fixture.material.colorWrite).toBe(false);
    expect(() => fixture.invoke('after')).toThrow('fixture-after-render');
    expect(fixture.material.colorWrite).toBe(true);
    session.restorePrincipalWritesAfterRenderCall();
    session.dispose();
  });

  it('restores a shared material before the next non-target actor callback', () => {
    const fixture = riggedDrawFixture();
    fixture.session.dispose();
    const secondRoot = new THREE.Group();
    fixture.scene.add(secondRoot);
    const secondMesh = new THREE.SkinnedMesh(fixture.mesh.geometry.clone(), fixture.material);
    secondMesh.name = 'fixture-skin';
    const secondBone = new THREE.Bone();
    secondMesh.add(secondBone);
    secondMesh.bind(new THREE.Skeleton([secondBone]));
    secondMesh.position.z = -2;
    secondMesh.computeBoundingSphere();
    secondRoot.add(secondMesh);
    fixture.scene.updateMatrixWorld(true);
    const secondActor = Object.freeze({ kind: 'training-dummy' as const, id: 'fixture-dummy' });
    let frame = 41;
    let revision = 7;
    let nonTargetObserved: [boolean, boolean, boolean] | null = null;
    secondMesh.onBeforeRender = () => {
      nonTargetObserved = [fixture.material.colorWrite, fixture.material.depthWrite, fixture.material.stencilWrite];
    };
    const session = installRiggedEvidenceMainCameraDrawSession(
      [
        { actor: fixture.actor, root: fixture.root, operatorRoot: fixture.root },
        { actor: secondActor, root: secondRoot, operatorRoot: secondRoot },
      ],
      fixture.scene,
      fixture.camera,
      () => frame,
      () => revision,
      ['fixture-skin'],
    )!;
    const invoke = (mesh: THREE.SkinnedMesh, phase: 'before' | 'after') => {
      const callback = phase === 'before' ? mesh.onBeforeRender : mesh.onAfterRender;
      callback.call(
        mesh,
        {} as THREE.WebGLRenderer,
        fixture.scene,
        fixture.camera,
        mesh.geometry,
        fixture.material,
        null as unknown as THREE.Group,
      );
    };
    expect(session.configurePrincipalWriteControl({
      sessionId: session.sessionId, actor: fixture.actor, captureRevision: revision, mode: 'visible-observe',
    })).toBe(true);
    invoke(fixture.mesh, 'before'); invoke(fixture.mesh, 'after');
    invoke(secondMesh, 'before'); invoke(secondMesh, 'after');
    session.restorePrincipalWritesAfterRenderCall();
    frame = 42; revision = 8; nonTargetObserved = null;
    expect(session.configurePrincipalWriteControl({
      sessionId: session.sessionId, actor: fixture.actor, captureRevision: revision, mode: 'principal-write-suppressed',
    })).toBe(true);
    invoke(fixture.mesh, 'before');
    expect(fixture.material.colorWrite).toBe(false);
    invoke(fixture.mesh, 'after');
    invoke(secondMesh, 'before'); invoke(secondMesh, 'after');
    session.restorePrincipalWritesAfterRenderCall();
    expect(nonTargetObserved).toEqual([true, true, false]);
    expect(session.principalWriteControlReceipt(fixture.actor, frame, revision)?.complete).toBe(true);
    session.dispose();
  });

  it('derives a no-padding live-deformed ROI and changes its full ordered vertex digest with skin pose', () => {
    const fixture = riggedDrawFixture();
    const anchorWorld = [0, 0, -2] as const;
    const ndc = new THREE.Vector3(...anchorWorld).project(fixture.camera).toArray();
    const joints = Array.from({ length: 16 }, (_, index) => ({
      kind: index < 6 ? 'arm' : 'finger',
      side: index % 2 === 0 ? 'left' : 'right',
      role: index < 6 ? 'joint' : null,
      digit: index >= 6 ? 'digit' : null,
      joint: index,
      bone: `joint-${index}`,
      worldPosition: [...anchorWorld],
      ndc: [...ndc],
    }));
    const first = projectRiggedEvidenceLiveDeformedRasterRoi(
      fixture.root,
      fixture.camera,
      ['fixture-skin'],
      anchorWorld,
      joints,
    )!;
    expect(first).not.toBeNull();
    expect(first.roi).toEqual({
      minX: Math.floor(first.projectedPixelExtrema.minX),
      minY: Math.floor(first.projectedPixelExtrema.minY),
      maxXExclusive: Math.ceil(first.projectedPixelExtrema.maxX),
      maxYExclusive: Math.ceil(first.projectedPixelExtrema.maxY),
    });
    fixture.camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
    fixture.camera.updateProjectionMatrix();
    expect(projectRiggedEvidenceLiveDeformedRasterRoi(
      fixture.root, fixture.camera, ['fixture-skin'], anchorWorld, joints,
    )).toBeNull();
    const webgpuNdc = new THREE.Vector3(...anchorWorld).project(fixture.camera).toArray();
    const webgpuJoints = joints.map((joint) => ({ ...joint, ndc: [...webgpuNdc] }));
    const webgpu = projectRiggedEvidenceLiveDeformedRasterRoi(
      fixture.root, fixture.camera, ['fixture-skin'], anchorWorld, webgpuJoints,
    );
    expect(webgpu).not.toBeNull();
    expect(webgpu!.anchor.ndc[2]).toBeGreaterThanOrEqual(0);
    fixture.camera.coordinateSystem = THREE.WebGLCoordinateSystem;
    fixture.camera.updateProjectionMatrix();
    const forgedNdc = structuredClone(joints);
    forgedNdc[0].ndc[0] += 0.01;
    expect(projectRiggedEvidenceLiveDeformedRasterRoi(
      fixture.root, fixture.camera, ['fixture-skin'], anchorWorld, forgedNdc,
    )).toBeNull();
    fixture.mesh.skeleton.bones[0].position.x = 0.1;
    fixture.mesh.skeleton.update();
    fixture.scene.updateMatrixWorld(true);
    const second = projectRiggedEvidenceLiveDeformedRasterRoi(
      fixture.root,
      fixture.camera,
      ['fixture-skin'],
      anchorWorld,
      joints,
    )!;
    expect(second).not.toBeNull();
    expect(second.deformedVertexProjectionDigest).not.toEqual(first.deformedVertexProjectionDigest);
    fixture.session.dispose();
  });
});
