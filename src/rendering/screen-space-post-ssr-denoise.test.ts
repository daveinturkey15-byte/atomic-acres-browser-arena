import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ARENA_VISUAL_REGISTRY } from './arena-visual-stream';
import { createPass64TslSceneSystems } from './pass64-tsl-scene';
import {
  screenSpaceMrtRequirement,
  screenSpacePostStages,
} from './screen-space-post';
import {
  assertScreenSpacePostCombatSafety,
  resolveScreenSpacePostRuntime,
  SCREEN_SPACE_POST_DISABLED,
  screenSpaceTopologyKey,
  type ScreenSpacePostRuntime,
  type ScreenSpacePostSelection,
} from './screen-space-post-profile';

function selection(overrides: Partial<ScreenSpacePostSelection>): ScreenSpacePostSelection {
  return {
    bakedIndirect: 'off',
    volumetricLightShafts: 'off',
    volumetricQuality: 'low',
    screenSpaceReflections: 'high',
    screenSpaceGi: 'off',
    depthOfField: false,
    depthOfFieldStrength: 0,
    motionBlur: 0,
    spatialUpscaling: 'off',
    rayTracing: 'off',
    ...overrides,
  };
}

function runtime(overrides: Partial<ScreenSpacePostSelection> = {}): ScreenSpacePostRuntime {
  return resolveScreenSpacePostRuntime(selection(overrides), { shadowsEnabled: true });
}

function shadowCastingSun(): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  return sun;
}

async function buildSystems(screenSpace: ScreenSpacePostRuntime, renderer?: WebGPURenderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const sun = shadowCastingSun();
  scene.add(sun);
  const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
  const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
  const systems = createPass64TslSceneSystems(
    scene,
    camera,
    renderPipeline,
    definition,
    {
      principalSamples: 1,
      volumetricScale: 1,
      ambientOcclusion: {
        quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false,
      },
      post: {
        bloomStrength: 0.14, exposureScale: 1, toneMapping: 'aces', filmGrainScale: 0.3,
        vignetteStrength: 0.1, sharpness: 0,
      },
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
      screenSpace,
    },
    renderer,
    sun,
  );
  return { systems, scene };
}

function fakeRenderer() {
  const copyTextureToTexture = vi.fn(() => undefined);
  return {
    copyTextureToTexture,
    renderer: { copyTextureToTexture } as unknown as WebGPURenderer,
  };
}

describe('HF-486 SSR temporal-denoise MRT and stages', () => {
  it('requests the velocity attachment for the denoise even with motion blur off', () => {
    expect(screenSpaceMrtRequirement(runtime({ motionBlur: 0 })))
      .toEqual({ normal: true, material: true, velocity: true });
    expect(screenSpaceMrtRequirement(runtime({ ssrTemporalDenoise: false, motionBlur: 0 })))
      .toEqual({ normal: true, material: true, velocity: false });
    expect(screenSpaceMrtRequirement(SCREEN_SPACE_POST_DISABLED))
      .toEqual({ normal: false, material: false, velocity: false });
  });

  it('adds no stage: the denoise lives inside the SSR additive term', () => {
    const on = screenSpacePostStages(runtime({}));
    const off = screenSpacePostStages(runtime({ ssrTemporalDenoise: false }));
    expect(on).toEqual(off);
    expect(on).toContain('ssr-screen-space-reflection-add');
  });

  it('moves the topology key on presence only (toggle rebuilds, tiers do not)', () => {
    const on = screenSpaceTopologyKey(runtime({}));
    const off = screenSpaceTopologyKey(runtime({ ssrTemporalDenoise: false }));
    expect(on).not.toBe(off);
    expect(on).toContain('ssr+denoise');
    expect(off).toContain('ssr');
    expect(screenSpaceTopologyKey(runtime({ screenSpaceReflections: 'low' }))).toBe(
      screenSpaceTopologyKey(runtime({ screenSpaceReflections: 'high' })),
    );
  });

  it('fails closed when the strength exceeds its ceiling', () => {
    const base = runtime({});
    expect(() => assertScreenSpacePostCombatSafety(base)).not.toThrow();
    expect(() => assertScreenSpacePostCombatSafety({
      ...base,
      ssrDenoise: { enabled: true, strength: 0.9 },
    })).toThrow(/SSR denoise strength/);
  });
});

describe('HF-486 SSR temporal-denoise graph wiring', () => {
  it('builds the denoise at construction with one history buffer and no valid frame yet', async () => {
    const { systems } = await buildSystems(runtime({}));
    try {
      // Registered at construction, so the deploy-time precompile covers it:
      // nothing about the denoise is created lazily in combat.
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: true, historyTargets: 1, historyValid: false });
      expect(systems.linearSourceStages).toContain('ssr-screen-space-reflection-add');
      expect(systems.principalHdrTarget.textures.map(({ name }) => name))
        .toEqual(['output', 'normal', 'material', 'velocity']);
    } finally {
      systems.dispose();
    }
  });

  it('restores the old path exactly when the toggle is off: no buffer, no copy, same stages', async () => {
    const { copyTextureToTexture, renderer } = fakeRenderer();
    const { systems } = await buildSystems(runtime({ ssrTemporalDenoise: false }), renderer);
    try {
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: false, historyTargets: 0, historyValid: false });
      expect(systems.linearSourceStages).toContain('ssr-screen-space-reflection-add');
      systems.update(16);
      systems.update(32);
      expect(copyTextureToTexture).not.toHaveBeenCalled();
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: false, historyTargets: 0, historyValid: false });
    } finally {
      systems.dispose();
    }
  });

  it('primes the history on the second pre-frame refresh and never allocates again', async () => {
    const { copyTextureToTexture, renderer } = fakeRenderer();
    const { systems } = await buildSystems(runtime({}), renderer);
    try {
      systems.update(16);
      expect(copyTextureToTexture).toHaveBeenCalledTimes(1);
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: true, historyTargets: 1, historyValid: false });
      systems.update(32);
      expect(copyTextureToTexture).toHaveBeenCalledTimes(2);
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: true, historyTargets: 1, historyValid: true });
      // In-combat steady state: one copy per frame, still exactly one buffer.
      systems.update(48);
      systems.update(64);
      systems.update(80);
      expect(copyTextureToTexture).toHaveBeenCalledTimes(5);
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: true, historyTargets: 1, historyValid: true });
    } finally {
      systems.dispose();
    }
  });

  it('never validates without a renderer (headless keeps the old path)', async () => {
    const { systems } = await buildSystems(runtime({}));
    try {
      systems.update(16);
      systems.update(32);
      expect(systems.ssrDenoiseStatus()).toEqual({ enabled: true, historyTargets: 1, historyValid: false });
    } finally {
      systems.dispose();
    }
  });
});

describe('HF-486 SSR temporal-denoise precompile registration', () => {
  it('refreshes pre-frame and invalidates on arena apply in the assembler', () => {
    const source = readFileSync(new URL('./pass64-tsl-scene.ts', import.meta.url), 'utf8');
    expect(source).toContain('hdr.refreshSsrDenoiseHistory(renderer)');
    expect(source).toContain('screenSpace.invalidateSsrDenoiseHistory()');
    expect(source).toContain('screenSpace.refreshSsrDenoiseHistory(renderer)');
  });
});
