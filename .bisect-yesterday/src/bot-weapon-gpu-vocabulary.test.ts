import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BOT_WEAPON_POOL } from './bot-arsenal';
import {
  BOT_WEAPON_CPU_MODELS_PER_SLICE,
  BotWeaponGpuVocabulary,
} from './bot-weapon-gpu-vocabulary';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

function runtime(
  compileAndRender: PresentationPrewarmRuntime['compileAndRender'],
): PresentationPrewarmRuntime {
  return { compileAndRender };
}

describe('BotWeaponGpuVocabulary', () => {
  it('projects the exact canonical bot pool into one retained world presentation per ID', async () => {
    const beforePool = [...BOT_WEAPON_POOL];
    const scene = new THREE.Scene();
    const vocabulary = new BotWeaponGpuVocabulary(scene, false);
    const yieldToBrowser = vi.fn(async () => undefined);

    await vocabulary.prepareCpu(yieldToBrowser);
    const telemetry = vocabulary.telemetry();

    expect(BOT_WEAPON_CPU_MODELS_PER_SLICE).toBe(1);
    expect(BOT_WEAPON_POOL).toEqual(beforePool);
    expect(telemetry.expectedIds).toEqual(BOT_WEAPON_POOL);
    expect(telemetry.preparedIds).toEqual(BOT_WEAPON_POOL);
    expect(telemetry.gpuReadyIds).toEqual([]);
    expect(telemetry.prepared).toBe(true);
    expect(telemetry.gpuReady).toBe(false);
    expect(telemetry.sceneGeneration).toBeNull();
    expect(telemetry.sceneAttached).toBe(true);
    expect(telemetry.hidden).toBe(true);
    expect(vocabulary.root.parent).toBe(scene);
    expect(vocabulary.root.userData.presentationOnly).toBe(true);
    expect(vocabulary.root.children).toHaveLength(BOT_WEAPON_POOL.length);
    expect(vocabulary.root.children.map((model) => model.userData.weaponId)).toEqual(BOT_WEAPON_POOL);
    expect(vocabulary.root.children.map((model) => model.name)).toEqual(
      BOT_WEAPON_POOL.map((id) => `operator-${id}`),
    );
    expect(new Set(vocabulary.root.children.map((model) => model.uuid)).size).toBe(BOT_WEAPON_POOL.length);
    expect(yieldToBrowser).toHaveBeenCalledTimes(BOT_WEAPON_POOL.length - 1);

    for (const model of vocabulary.root.children) {
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        expect(node.userData.presentationOnly).toBe(true);
        expect(node.raycast(new THREE.Raycaster(), [])).toBeUndefined();
      });
    }
    vocabulary.dispose();
  });

  it('uses the shared operator factory from the live setOperatorWeapon path', () => {
    const source = readFileSync(new URL('./art-kit.ts', import.meta.url), 'utf8');
    const setOperatorWeapon = source.slice(
      source.indexOf('export function setOperatorWeapon('),
      source.indexOf('export function fireOperator('),
    );
    expect(setOperatorWeapon).toContain('const weapon = createOperatorWeaponPresentation(weaponId, flattenMaterials);');
    expect(setOperatorWeapon).not.toContain('buildWeaponModel(weaponId');
    expect(setOperatorWeapon).not.toContain('createImportedWeaponModel(weaponId');
  });

  it('compiles the exact attached root with culling disabled, then retains it hidden after the fence', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const vocabulary = new BotWeaponGpuVocabulary(scene, true);
    await vocabulary.prepareCpu(async () => undefined);

    const originalFrustumStates = new Map<THREE.Object3D, boolean>();
    let nodeIndex = 0;
    vocabulary.root.traverse((node) => {
      node.frustumCulled = nodeIndex++ % 2 === 0;
      originalFrustumStates.set(node, node.frustumCulled);
    });
    let releaseFence!: () => void;
    const fence = new Promise<void>((resolve) => { releaseFence = resolve; });
    const compileAndRender = vi.fn(async (root: THREE.Object3D, submittedCamera: THREE.Camera, submittedScene: THREE.Scene) => {
      expect(root).toBe(vocabulary.root);
      expect(root.parent).toBe(scene);
      expect(submittedCamera).toBe(camera);
      expect(submittedScene).toBe(scene);
      expect(root.visible).toBe(true);
      root.traverse((node) => expect(node.frustumCulled).toBe(false));
      await fence;
    });

    const prewarm = vocabulary.prewarm(runtime(compileAndRender), camera, 17, async () => undefined);
    await vi.waitFor(() => expect(compileAndRender).toHaveBeenCalledTimes(1));
    expect(vocabulary.telemetry().gpuReady).toBe(false);
    expect(vocabulary.root.visible).toBe(true);
    releaseFence();
    await prewarm;

    const telemetry = vocabulary.telemetry();
    expect(telemetry.gpuReady).toBe(true);
    expect(telemetry.gpuReadyIds).toEqual(BOT_WEAPON_POOL);
    expect(telemetry.sceneGeneration).toBe(17);
    expect(telemetry.hidden).toBe(true);
    expect(vocabulary.root.children).toHaveLength(BOT_WEAPON_POOL.length);
    for (const [node, frustumCulled] of originalFrustumStates) {
      expect(node.frustumCulled).toBe(frustumCulled);
    }

    await vocabulary.prewarm(runtime(compileAndRender), camera, 17, async () => undefined);
    expect(compileAndRender).toHaveBeenCalledTimes(1);
    vocabulary.dispose();
  });

  it('invalidates prior readiness for a new scene generation and stays not-ready after failure', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const vocabulary = new BotWeaponGpuVocabulary(scene);
    await vocabulary.prepareCpu(async () => undefined);
    const compileAndRender = vi.fn<PresentationPrewarmRuntime['compileAndRender']>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('injected WebGPU fence failure'))
      .mockResolvedValueOnce(undefined);
    const prewarmRuntime = runtime(compileAndRender);

    await vocabulary.prewarm(prewarmRuntime, camera, 4, async () => undefined);
    expect(vocabulary.telemetry().gpuReady).toBe(true);

    const failed = vocabulary.prewarm(prewarmRuntime, camera, 5, async () => undefined);
    expect(vocabulary.telemetry().gpuReady).toBe(false);
    await expect(failed).rejects.toThrow('injected WebGPU fence failure');
    expect(vocabulary.telemetry()).toMatchObject({
      gpuReadyIds: [],
      gpuReady: false,
      sceneGeneration: null,
      hidden: true,
      lastError: 'injected WebGPU fence failure',
    });
    expect(vocabulary.root.parent).toBe(scene);
    expect(vocabulary.root.children).toHaveLength(BOT_WEAPON_POOL.length);

    await vocabulary.prewarm(prewarmRuntime, camera, 5, async () => undefined);
    expect(vocabulary.telemetry()).toMatchObject({
      gpuReadyIds: BOT_WEAPON_POOL,
      gpuReady: true,
      sceneGeneration: 5,
      hidden: true,
      lastError: null,
    });
    expect(compileAndRender).toHaveBeenCalledTimes(3);
    vocabulary.dispose();
  });

  it('rejects a detached root without publishing GPU readiness', async () => {
    const scene = new THREE.Scene();
    const vocabulary = new BotWeaponGpuVocabulary(scene);
    await vocabulary.prepareCpu(async () => undefined);
    scene.remove(vocabulary.root);
    const compileAndRender = vi.fn(async () => undefined);

    await expect(vocabulary.prewarm(
      runtime(compileAndRender),
      new THREE.PerspectiveCamera(),
      1,
      async () => undefined,
    )).rejects.toThrow('must remain attached');
    expect(compileAndRender).not.toHaveBeenCalled();
    expect(vocabulary.telemetry().gpuReady).toBe(false);
    expect(vocabulary.root.visible).toBe(false);
    vocabulary.dispose();
  });
});
