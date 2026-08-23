import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PMREMGenerator needs a real GPU context; these are unit tests, so stub it at
// the module boundary. The stub records calls and hands back disposable fakes,
// which is exactly the surface the lifecycle contract is about. The lane that
// first authored this file called the REAL PMREMGenerator against a mock
// renderer, so its tests could never have passed - they were shipped unrun.
const pmremInstances: Array<{
  fromEquirectangular: ReturnType<typeof vi.fn>;
  compileEquirectangularShader: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class StubPmrem {
    compileEquirectangularShader = vi.fn();
    dispose = vi.fn();
    fromEquirectangular = vi.fn(() => {
      const texture = new actual.Texture();
      const target = { texture, dispose: vi.fn() };
      return target as unknown as THREE.WebGLRenderTarget;
    });

    constructor() {
      pmremInstances.push(this);
    }
  }
  return { ...actual, PMREMGenerator: StubPmrem };
});

vi.mock('./sky-backdrop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sky-backdrop')>();
  return {
    ...actual,
    // The real applySkyBackdrop paints a canvas texture and needs `document`.
    // The unit contract here is "the backdrop the arena applied is what PMREM
    // samples", so the stub applies a minimal equirect texture the same way.
    applySkyBackdrop: vi.fn((scene: { background: unknown }) => {
      if (!scene.background) {
        const texture = new THREE.Texture();
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
      }
    }),
  };
});

import {
  applyArenaEnvironmentIbl,
  disposeArenaIbl,
  needsIblRegeneration,
  pmremResolutionForReflectionQuality,
  skyBackdropPreset,
  updateArenaEnvironmentIntensity,
  type ArenaIblState,
} from './arena-environment-ibl';

import type { WebGPURenderer } from 'three/webgpu';

const renderer = {} as unknown as WebGPURenderer;

function emptyState(): ArenaIblState {
  return {
    environmentTexture: null,
    pmremTarget: null,
    arenaId: null,
    resolutionTier: 128,
    budgetEnvironmentIntensity: 0,
    arenaEnvironmentScale: 0,
    reflectionScale: 0,
  } as ArenaIblState;
}

function sceneWithBackdrop(): THREE.Scene {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
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
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'high-seas', 'quality', 'high', 1, 1, emptyState());
    expect(pmremInstances).toHaveLength(1);
    expect(pmremInstances[0].fromEquirectangular).toHaveBeenCalledTimes(1);
    expect(pmremInstances[0].fromEquirectangular).toHaveBeenCalledWith(scene.background);
    expect(pmremInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBe(state.environmentTexture);
  });

  it('refuses to run without an applied sky backdrop', async () => {
    const { applySkyBackdrop } = await import('./sky-backdrop');
    (applySkyBackdrop as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { /* leaves background null */ });
    const scene = new THREE.Scene();
    await expect(applyArenaEnvironmentIbl(renderer, scene, 'gun-range', 'quality', 'low', 1, 1, emptyState()))
      .rejects.toThrow(/no sky backdrop/i);
  });

  it('applies budget x arena x reflection intensity', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'high-seas', 'quality', 'high', 0.8, 0.5, emptyState());
    expect(scene.environmentIntensity).toBeCloseTo(0.8 * state.arenaEnvironmentScale * 0.5, 10);
  });

  it('regenerates only on arena or resolution-tier change', () => {
    const state = { arenaId: 'farcrysis', resolutionTier: 128 } as ArenaIblState;
    expect(needsIblRegeneration(state, 'farcrysis', 128)).toBe(false);
    expect(needsIblRegeneration(state, 'high-seas', 128)).toBe(true);
    expect(needsIblRegeneration(state, 'farcrysis', 256)).toBe(true);
    expect(needsIblRegeneration(state, 'farcrysis', 512)).toBe(true);
  });

  it('updates intensity in place without touching the texture', async () => {
    const scene = sceneWithBackdrop();
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'farcrysis', 'quality', 'low', 1, 1, emptyState());
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
    const state = await applyArenaEnvironmentIbl(renderer, scene, 'farcrysis', 'quality', 'low', 1, 1, emptyState());
    const textureDispose = vi.spyOn(state.environmentTexture!, 'dispose');
    const targetDispose = vi.spyOn(state.pmremTarget!, 'dispose');
    disposeArenaIbl(state);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(targetDispose).toHaveBeenCalledTimes(1);
  });
});
