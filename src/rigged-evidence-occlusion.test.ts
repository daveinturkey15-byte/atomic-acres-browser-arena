import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  collectRiggedEvidenceOccluders,
  firstRiggedEvidenceOccluder,
  riggedEvidenceIntersectionCanOcclude,
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
});
