import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PMREMGenerator needs a real GPU context; these are unit tests, so stub it at
// the module boundary. The stub records calls and hands back disposable fakes,
// which is exactly the surface the lifecycle contract is about. The lane that
// first authored this file called the REAL PMREMGenerator against a mock
// renderer, so its tests could never have passed - they were shipped unrun.
//
// THE MOCK IS ON 'three/webgpu', NOT ON 'three'. That is the whole point of the
// 2026-08-31 fix: `THREE.PMREMGenerator` is the WebGL implementation, and given
// a WebGPURenderer it silently produces an environment texture that carries no
// light (measured: environmentIntensity 20 moved the frame by 0.0000). If this
// mock ever drifts back onto 'three', the module under test will have gone back
// to the generator that does not work on this route - so where the mock lives
// IS part of the contract.
const pmremInstances: Array<{
  fromEquirectangular: ReturnType<typeof vi.fn>;
  compileEquirectangularShader: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class StubPmrem {
    compileEquirectangularShader = vi.fn(async () => {});
    dispose = vi.fn();
    fromEquirectangular = vi.fn(() => {
      const texture = new THREE.Texture();
      const target = { texture, height: 256, dispose: vi.fn() };
      return target as unknown as THREE.WebGLRenderTarget;
    });

    constructor() {
      pmremInstances.push(this);
    }
  }
  return { ...actual, PMREMGenerator: StubPmrem };
});

import {
  applyArenaEnvironmentIbl,
  assertArenaEnvironmentLive,
  disposeArenaIbl,
  needsIblRegeneration,
  observeArenaEnvironment,
  pmremResolutionForReflectionQuality,
  skyBackdropPreset,
  updateArenaEnvironmentIntensity,
  type ArenaIblState,
} from './arena-environment-ibl';
import { arenaEnvironmentScale } from '../graphics-refinement';

import type { WebGPURenderer } from 'three/webgpu';

// `hasInitialized()` is the WebGPU generator's own precondition: it throws
// rather than producing a dead texture if the backend is not up. A stub that
// reported false would send the module into `renderer.init()`, which is exactly
// the branch these tests are not exercising.
const renderer = { hasInitialized: () => true } as unknown as WebGPURenderer;

function emptyState(): ArenaIblState {
  return {
    environmentTexture: null,
    pmremTarget: null,
    arenaId: null,
    resolutionTier: 128,
    budgetEnvironmentIntensity: 0,
    arenaEnvironmentScale: 0,
    reflectionScale: 0,
    sourceTexture: null,
    generatedCubeSize: 0,
  } as ArenaIblState;
}

function sceneWithBackdrop(name = 'sky-procedural'): THREE.Scene {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  texture.name = name;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = texture;
  return scene;
}

beforeEach(() => {
  pmremInstances.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('arena-environment-ibl', () => {
  it('takes its PMREM generator from three/webgpu, never from three', () => {
    // The 2026-08-31 root cause, pinned in source because it is invisible at
    // runtime: `THREE.PMREMGenerator` is the WebGL implementation. Handed a
    // WebGPURenderer it does not throw and does not warn - it returns a texture
    // that contributes NO light, which is why an environment that was correctly
    // bound to the scene, with the correct intensity, changed nothing on screen.
    const source = readFileSync('src/rendering/arena-environment-ibl.ts', 'utf8');
    expect(source).toContain("import { PMREMGenerator, type WebGPURenderer } from 'three/webgpu';");
    // The module's own comment block names the wrong class in order to explain
    // why it is wrong, so the pin is on the CONSTRUCTION, not the mention.
    expect(source).not.toContain('new THREE.PMREMGenerator');
    expect(source).toContain('new PMREMGenerator(renderer)');
  });

  it('maps reflectionQuality to PMREM resolution tiers', () => {
    expect(pmremResolutionForReflectionQuality('off')).toBe(128);
    expect(pmremResolutionForReflectionQuality('low')).toBe(128);
    expect(pmremResolutionForReflectionQuality('high')).toBe(256);
    // Pass 76: the Ultra registry step buys resolution, not intensity.
    expect(pmremResolutionForReflectionQuality('ultra')).toBe(512);
  });

  it('resolves a sky backdrop preset for every canonical arena', () => {
    for (const arena of ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range', 'farcrysis', 'high-seas'] as const) {
      expect(skyBackdropPreset(arena), `${arena} needs a backdrop preset`).toBeTruthy();
    }
  });

  it('generates the environment from the EQUIRECT BACKDROP, never from the scene', async () => {
    // fromScene rendered every mesh through PMREM's cube camera - including a
    // count-0 placeholder geometry - which produced the farcrysis boot's three
    // "computeBoundingSphere(): radius is NaN" warnings. The equirect path
    // renders zero scene meshes, so that class of defect cannot exist.
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'high-seas', 'high', 1, 1, emptyState());
    expect(pmremInstances).toHaveLength(1);
    expect(pmremInstances[0].fromEquirectangular).toHaveBeenCalledTimes(1);
    expect(pmremInstances[0].fromEquirectangular).toHaveBeenCalledWith(scene.background);
    expect(pmremInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBe(state.environmentTexture);
    expect(state.sourceTexture).toBe(scene.background);
  });

  it('refuses to run without an applied sky backdrop', async () => {
    // The caller owns backdrop application (it holds the asset-request recorder
    // and it is the one awaiting the admission). This module must never apply
    // one itself, so "no backdrop" is a caller-ordering error and fails closed.
    const scene = new THREE.Scene();
    await expect(applyArenaEnvironmentIbl(renderer, scene, 'gun-range', 'low', 1, 1, emptyState()))
      .rejects.toThrow(/no sky backdrop/i);
  });

  it('applies budget x arena x reflection intensity', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'high-seas', 'high', 0.8, 0.5, emptyState());
    expect(scene.environmentIntensity).toBeCloseTo(0.8 * state.arenaEnvironmentScale * 0.5, 10);
  });

  it('regenerates on arena, resolution-tier OR backdrop change', () => {
    const backdrop = new THREE.Texture();
    const state = { arenaId: 'farcrysis', resolutionTier: 128, sourceTexture: backdrop } as ArenaIblState;
    expect(needsIblRegeneration(state, 'farcrysis', 128)).toBe(false);
    expect(needsIblRegeneration(state, 'high-seas', 128)).toBe(true);
    expect(needsIblRegeneration(state, 'farcrysis', 256)).toBe(true);
    expect(needsIblRegeneration(state, 'farcrysis', 512)).toBe(true);
    // The generated-sky admission legitimately replaces scene.background under
    // a live arena. Keyed on arena id alone, the environment would stay pinned
    // to the procedural placeholder that went in synchronously ahead of it.
    expect(needsIblRegeneration(state, 'farcrysis', 128, backdrop)).toBe(false);
    expect(needsIblRegeneration(state, 'farcrysis', 128, new THREE.Texture())).toBe(true);
    expect(needsIblRegeneration(state, 'farcrysis', 128, null)).toBe(true);
  });

  it('reconvolves when the admitted sky replaces the placeholder under a live arena', async () => {
    const scene = sceneWithBackdrop('sky-procedural');
    const first = await applyArenaEnvironmentIbl(renderer, scene, 'atomic-acres', 'high', 1, 1, emptyState());
    expect(pmremInstances).toHaveLength(1);

    // Same arena, same tier, no backdrop change: intensity update only.
    const held = await applyArenaEnvironmentIbl(renderer, scene, 'atomic-acres', 'high', 1, 1, first);
    expect(pmremInstances).toHaveLength(1);
    expect(held.environmentTexture).toBe(first.environmentTexture);

    // The .webp lands: scene.background is a different texture now.
    const admitted = new THREE.Texture();
    admitted.name = 'sky-generated-equirect';
    scene.background = admitted;
    const after = await applyArenaEnvironmentIbl(renderer, scene, 'atomic-acres', 'high', 1, 1, held);
    expect(pmremInstances).toHaveLength(2);
    expect(pmremInstances[1].fromEquirectangular).toHaveBeenCalledWith(admitted);
    expect(after.sourceTexture).toBe(admitted);
    expect(scene.environment).toBe(after.environmentTexture);
  });

  it('recovers the environment when reflections are turned off and back on', async () => {
    // The old applyGraphics guard was `activeIblState.environmentTexture`, so
    // once "off" emptied the state nothing could ever bootstrap it again.
    const scene = sceneWithBackdrop();
    const on = await applyArenaEnvironmentIbl(renderer, scene, 'test2', 'high', 1, 1, emptyState());
    expect(scene.environment).toBe(on.environmentTexture);

    const off = await applyArenaEnvironmentIbl(renderer, scene, 'test2', 'off', 1, 1, on);
    expect(scene.environment).toBeNull();
    expect(off.environmentTexture).toBeNull();

    const back = await applyArenaEnvironmentIbl(renderer, scene, 'test2', 'high', 1, 1, off);
    expect(back.environmentTexture).not.toBeNull();
    expect(scene.environment).toBe(back.environmentTexture);
  });

  it('updates intensity in place without touching the texture', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'farcrysis', 'low', 1, 1, emptyState());
    const texture = state.environmentTexture;
    const next = updateArenaEnvironmentIntensity(scene, state, 0.5, 0.25);
    expect(next.environmentTexture).toBe(texture);
    expect(scene.environmentIntensity).toBeCloseTo(0.5 * state.arenaEnvironmentScale * 0.25, 10);
    expect(pmremInstances).toHaveLength(1); // no regeneration
  });

  it('disposes the previous target and texture exactly once', async () => {
    // The repo has already shipped two disposal leaks (water horizon child,
    // wind uniforms). This pins the third candidate closed.
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'farcrysis', 'low', 1, 1, emptyState());
    const textureDispose = vi.spyOn(state.environmentTexture!, 'dispose');
    const targetDispose = vi.spyOn(state.pmremTarget!, 'dispose');
    disposeArenaIbl(state);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(targetDispose).toHaveBeenCalledTimes(1);
  });
});

/**
 * The gate that would have caught the 2026-08-31 defect.
 *
 * Every assertion below reads the SCENE. None of them reads a source file, a
 * settings object or a requested tier - which is precisely what the previous
 * "runtime evidence" for the environmentIntensity control did, and why nine
 * unit tests passed against a call site that never executed on the first arena
 * of any session.
 */
describe('first-arena environment gate', () => {
  it('fails closed on the exact defect: scene.environment null on a live arena', () => {
    const scene = sceneWithBackdrop();
    const observation = observeArenaEnvironment(scene, 'atomic-acres', 'high', 1, 1, emptyState());
    expect(observation.present).toBe(false);
    // 1 x arenaEnvironmentScale('atomic-acres') x 1
    expect(observation.expectedEnvironmentIntensity).toBeCloseTo(arenaEnvironmentScale('atomic-acres'), 10);
    // The pristine default the bug left behind, against the arena's authored scale.
    expect(observation.environmentIntensity).toBe(1);
    expect(() => assertArenaEnvironmentLive(observation)).toThrow(/scene\.environment === null/);
  });

  it('passes on a correctly bootstrapped arena', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'atomic-acres', 'high', 1, 1, emptyState());
    const observation = observeArenaEnvironment(scene, 'atomic-acres', 'high', 1, 1, state);
    expect(observation.present).toBe(true);
    expect(observation.matchesIblState).toBe(true);
    expect(observation.environmentName).toBe('pass64-arena-environment-atomic-acres-256');
    expect(observation.environmentIntensity).toBeCloseTo(arenaEnvironmentScale('atomic-acres'), 10);
    expect(() => assertArenaEnvironmentLive(observation)).not.toThrow();
  });

  it('fails closed when the intensity is not budget x arena scale x reflection scale', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'high-seas', 'high', 1, 1, emptyState());
    // Anything else that owns scene.environmentIntensity - the adaptive budget
    // in graphics-refinement, for instance - writing a different product after
    // the arena committed is a divergence, not a rounding difference.
    scene.environmentIntensity = 0.5;
    expect(() => assertArenaEnvironmentLive(observeArenaEnvironment(scene, 'high-seas', 'high', 1, 1, state)))
      .toThrow(/environmentIntensity/);
  });

  it('fails closed when something else rebinds scene.environment', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'test1', 'high', 1, 1, emptyState());
    scene.environment = new THREE.Texture();
    expect(() => assertArenaEnvironmentLive(observeArenaEnvironment(scene, 'test1', 'high', 1, 1, state)))
      .toThrow(/not the texture this arena generated/);
  });

  it('asserts the OTHER direction when the player turns reflections off', async () => {
    const scene = sceneWithBackdrop();
    const on = await applyArenaEnvironmentIbl(renderer, scene, 'test2', 'high', 1, 1, emptyState());
    const off = await applyArenaEnvironmentIbl(renderer, scene, 'test2', 'off', 1, 1, on);
    const observation = observeArenaEnvironment(scene, 'test2', 'off', 1, 1, off);
    expect(observation.expectedEnvironmentIntensity).toBe(0);
    expect(() => assertArenaEnvironmentLive(observation)).not.toThrow();
    // ...and a leftover environment under "off" is just as much a defect.
    scene.environment = new THREE.Texture();
    expect(() => assertArenaEnvironmentLive(observeArenaEnvironment(scene, 'test2', 'off', 1, 1, off)))
      .toThrow(/still has scene\.environment/);
  });
});
