import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import type { Node as GltfNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PASS70_CROSSBOW_LOADED_BOLT_CLEARANCE_CONTRACT,
  clampPass70CrossbowLoadedBoltAnimation,
  createPass65CrossbowModel,
  disposePass65WeaponModel,
  loadPass65CrossbowAssets,
  reloadImportedWeapon,
  resetPass70CrossbowLoadedBoltRestPose,
  updateImportedWeapon,
} from './weapon-model';

const CROSSBOW_DELIVERIES = Object.freeze([
  'pass65-crossbow-fp-lod0.glb',
  'pass65-crossbow-fp-lod1.glb',
  'pass65-crossbow-world-lod0.glb',
  'pass65-crossbow-world-lod1.glb',
  'pass65-crossbow-world-lod2.glb',
  'pass65-crossbow-drop-lod0.glb',
]);

type MeshBounds = Readonly<{ name: string; box: THREE.Box3 }>;

function meshBounds(root: GltfNode): readonly MeshBounds[] {
  const result: MeshBounds[] = [];
  root.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const worldMatrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      if (!positions) continue;
      result.push(Object.freeze({
        name: node.getName(),
        box: new THREE.Box3(
          new THREE.Vector3(...positions.getMinNormalized([])),
          new THREE.Vector3(...positions.getMaxNormalized([])),
        ).applyMatrix4(worldMatrix),
      }));
    }
  });
  return Object.freeze(result);
}

function minimumSeparatedLensMargin(loadedBolt: GltfNode, lenses: readonly GltfNode[]): number {
  const boltBounds = meshBounds(loadedBolt);
  const lensBounds = lenses.flatMap((lens) => meshBounds(lens));
  let minimumMargin = Number.POSITIVE_INFINITY;
  for (const bolt of boltBounds) {
    for (const lens of lensBounds) {
      expect(bolt.box.intersectsBox(lens.box), `${bolt.name} intersects ${lens.name}`).toBe(false);
      const overlapsX = bolt.box.max.x >= lens.box.min.x && bolt.box.min.x <= lens.box.max.x;
      const overlapsZ = bolt.box.max.z >= lens.box.min.z && bolt.box.min.z <= lens.box.max.z;
      if (!overlapsX || !overlapsZ) continue;
      minimumMargin = Math.min(minimumMargin, Math.max(
        lens.box.min.y - bolt.box.max.y,
        bolt.box.min.y - lens.box.max.y,
      ));
    }
  }
  return minimumMargin;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pass 70 crossbow loaded-bolt optic clearance', () => {
  it('resets the leaked bind pose and clamps only animation Y', () => {
    const loadedBolt = new THREE.Object3D();
    loadedBolt.position.set(0, 0.12, -0.85);
    resetPass70CrossbowLoadedBoltRestPose(loadedBolt);
    expect(loadedBolt.position.toArray()).toEqual([0, 0, 0]);
    expect(loadedBolt.userData.pass70ClearanceContract)
      .toBe(PASS70_CROSSBOW_LOADED_BOLT_CLEARANCE_CONTRACT);

    loadedBolt.position.set(0.125, 0.080078125, -0.72021484375);
    clampPass70CrossbowLoadedBoltAnimation(loadedBolt);
    expect(loadedBolt.position.toArray()).toEqual([0.125, 0, -0.72021484375]);
  });

  it('keeps all six shipped variants clear at rest and through both reload clips', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const delivery of CROSSBOW_DELIVERIES) {
      const document = await io.read(join(
        process.cwd(),
        'public/assets/original/models/weapons/pass65-crossbow',
        delivery,
      ));
      const root = document.getRoot();
      const loadedBolt = root.listNodes().find((node) => node.getName() === 'crossbow-loaded-bolt');
      const lenses = root.listNodes().filter((node) => /Crossbow_Optic(?:Front|Rear)Lens/u.test(node.getName()));
      expect(loadedBolt, `${delivery}: semantic loaded bolt`).toBeDefined();
      expect(lenses, `${delivery}: two optic lenses`).toHaveLength(2);

      const runtimeBolt = new THREE.Object3D();
      runtimeBolt.position.fromArray(loadedBolt!.getTranslation());
      resetPass70CrossbowLoadedBoltRestPose(runtimeBolt);
      loadedBolt!.setTranslation(runtimeBolt.position.toArray());
      expect(minimumSeparatedLensMargin(loadedBolt!, lenses), `${delivery}: rest margin`)
        .toBeGreaterThan(0.005);

      for (const actionName of ['reload', 'empty-reload']) {
        const action = root.listAnimations().find((animation) => animation.getName() === actionName);
        const channel = action?.listChannels().find((candidate) => (
          candidate.getTargetNode() === loadedBolt && candidate.getTargetPath() === 'translation'
        ));
        const samples = channel?.getSampler()?.getOutput();
        expect(samples, `${delivery}: ${actionName} loaded-bolt translation`).toBeDefined();
        for (let sample = 0; sample < samples!.getCount(); sample += 1) {
          const authored = samples!.getElement(sample, []);
          runtimeBolt.position.fromArray(authored);
          const authoredX = runtimeBolt.position.x;
          const authoredZ = runtimeBolt.position.z;
          clampPass70CrossbowLoadedBoltAnimation(runtimeBolt);
          expect(runtimeBolt.position.x, `${delivery}: ${actionName} sample ${sample} X`).toBe(authoredX);
          expect(runtimeBolt.position.y, `${delivery}: ${actionName} sample ${sample} Y`).toBe(0);
          expect(runtimeBolt.position.z, `${delivery}: ${actionName} sample ${sample} Z`).toBe(authoredZ);
          loadedBolt!.setTranslation(runtimeBolt.position.toArray());
          expect(minimumSeparatedLensMargin(loadedBolt!, lenses), `${delivery}: ${actionName} sample ${sample} margin`)
            .toBeGreaterThan(0.005);
        }
      }
    }
  }, 30_000);

  it('applies the correction through model instantiation and post-mixer updates', async () => {
    const scene = new THREE.Group();
    const loadedBolt = new THREE.Group();
    loadedBolt.name = 'crossbow-loaded-bolt';
    loadedBolt.position.set(0, 0.12, -0.85);
    loadedBolt.userData.atomic_socket = 'bolt';
    scene.add(loadedBolt);
    const reload = new THREE.AnimationClip('reload', 1, [
      new THREE.VectorKeyframeTrack(
        'crossbow-loaded-bolt.position',
        [0, 1],
        [0, 0.08, -0.72, 0, 0, 0],
      ),
    ]);
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({
      scene,
      animations: [reload],
    } as never);

    await loadPass65CrossbowAssets('first-person');
    const model = createPass65CrossbowModel(false, 'first-person');
    expect(model).not.toBeNull();
    const runtimeBolt = model!.getObjectByName('crossbow-loaded-bolt');
    expect(runtimeBolt?.position.toArray()).toEqual([0, 0, 0]);
    reloadImportedWeapon(model!);
    updateImportedWeapon(model!, 0.05);
    expect(runtimeBolt?.position.y).toBe(0);
    expect(runtimeBolt?.position.z).toBeLessThan(-0.6);
    disposePass65WeaponModel(model!);
  });
});
