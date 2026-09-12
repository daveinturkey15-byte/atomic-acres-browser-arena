import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { GRAPHICS_PRESET_VALUES } from '../../graphics-settings-registry';
import { LINEAR_SOURCE_STAGE_ORDER, OPTIONAL_LINEAR_SOURCE_STAGES } from '../grade-profile';
import { publishBakedIndirectReceipt } from './baked-indirect-node';
import {
  BAKED_INDIRECT_STAGE,
  screenSpaceMrtRequirement,
  screenSpacePostStages,
} from '../screen-space-post';
import {
  SCREEN_SPACE_POST_DISABLED,
  assertScreenSpacePostCombatSafety,
  resolveScreenSpacePostRuntime,
  screenSpaceTopologyKey,
} from '../screen-space-post-profile';
import { BAKED_INDIRECT_MAXIMUM_GAIN, resolveBakedIndirectTuning } from './baked-indirect';
import { EXTRACTION_DEBOUNCE_MS, buildBakedIndirectRuntime } from './baked-indirect-runtime';

const SELECTION = {
  bakedIndirect: 'off',
  volumetricLightShafts: 'off',
  volumetricQuality: 'high',
  screenSpaceReflections: 'off',
  screenSpaceGi: 'off',
  depthOfField: false,
  depthOfFieldStrength: 0.3,
  motionBlur: 0,
  spatialUpscaling: 'off',
  rayTracing: 'off',
} as const;

const runtimeAt = (tier: 'off' | 'low' | 'high') => resolveScreenSpacePostRuntime(
  { ...SELECTION, bakedIndirect: tier }, { shadowsEnabled: true },
);

describe('HF-418 baked indirect: the profile defaults, and the argument for each', () => {
  it('PERFORMANCE leaves it off', () => {
    // Not because the frame cannot afford three texture fetches - it can - but
    // because the BAKE is CPU work at load on the machines this preset exists
    // for, and PERFORMANCE's contract is that nothing in the screen-space stack
    // runs here at all.
    expect(GRAPHICS_PRESET_VALUES.performance.bakedIndirect).toBe('off');
  });

  it('QUALITY has it on LOW - the owner\'s "quality maybe its on lightly"', () => {
    // QUALITY is the auto-selected default, so anything added here has to be
    // nearly free. This is: three 3D texture fetches and eleven multiply-adds,
    // with no march, no extra render target and no new attachment beyond the
    // normal buffer. It is the cheapest visual gain available to this preset.
    expect(GRAPHICS_PRESET_VALUES.high.bakedIndirect).toBe('low');
  });

  it('QUALITY carries the trace on the LOW bake; MAX carries trace and HIGH bake together', () => {
    // Classic recursive ray tracing has no global illumination. The documented
    // failure mode is raising a flat ambient constant until the scene is milk.
    // HF-438 folds the trace into the ladder: QUALITY keeps its argued LOW
    // bake (its SSR LOW march still supplies reflective detail), while MAX —
    // the rung that also holds SSGI — carries the expensive tier, which costs
    // bake time and nothing per frame either way.
    expect(GRAPHICS_PRESET_VALUES.high.bakedIndirect).toBe('low');
    expect(GRAPHICS_PRESET_VALUES.high.rayTracing).toBe('reflections');
    expect(GRAPHICS_PRESET_VALUES.max.bakedIndirect).toBe('high');
  });

  it('MAX has it on HIGH, alongside SSGI rather than instead of it', () => {
    // They answer different questions: SSGI bounces what is on screen this
    // frame (a muzzle flash, a moving player's lit side); the bake carries the
    // static room's own bounce, including from geometry off screen. Neither
    // subsumes the other and both are additive.
    expect(GRAPHICS_PRESET_VALUES.max.bakedIndirect).toBe('high');
    expect(GRAPHICS_PRESET_VALUES.max.screenSpaceGi).toBe('high');
  });
});

describe('HF-418 baked indirect: topology and the receipt', () => {
  it('is a topology change, so switching it cannot claim a live apply', () => {
    expect(screenSpaceTopologyKey(runtimeAt('off')))
      .not.toBe(screenSpaceTopologyKey(runtimeAt('low')));
  });

  it('is NOT a topology change between its own two tiers', () => {
    // Both tiers bind the same three textures at the same fixed grid. A rebuild
    // between them would be a pipeline recompile for a texture upload.
    expect(screenSpaceTopologyKey(runtimeAt('low')))
      .toBe(screenSpaceTopologyKey(runtimeAt('high')));
  });

  it('requires the normal attachment and no material attachment', () => {
    const on = screenSpaceMrtRequirement(runtimeAt('low'));
    expect(on.normal).toBe(true);
    // A baked bounce lands on every surface, glossy or not, so the packed
    // metalness/roughness pair SSR needs buys this layer nothing.
    expect(on.material).toBe(false);
    expect(screenSpaceMrtRequirement(runtimeAt('off')).normal).toBe(false);
  });

  it('appears in the stage receipt only when it is on', () => {
    expect(screenSpacePostStages(runtimeAt('low'))).toContain(BAKED_INDIRECT_STAGE);
    expect(screenSpacePostStages(runtimeAt('off'))).not.toContain(BAKED_INDIRECT_STAGE);
  });

  it('sits before the contact-occlusion multiply in the frozen linear order', () => {
    // Bounced light must be darkened by ambient occlusion exactly as direct
    // light is, or a corner GTAO darkens fills straight back in.
    const stage = LINEAR_SOURCE_STAGE_ORDER.indexOf(BAKED_INDIRECT_STAGE);
    const occlusion = LINEAR_SOURCE_STAGE_ORDER.indexOf('contact-occlusion-multiply');
    expect(stage).toBeGreaterThan(-1);
    expect(stage).toBeLessThan(occlusion);
    expect(OPTIONAL_LINEAR_SOURCE_STAGES).toContain(BAKED_INDIRECT_STAGE);
  });

  it('publishes an OFF receipt when the layer is not built, so absent is never a valid state', () => {
    // Measured 2026-09-03 on the built bundle: with the tier switched off
    // through the real Options surface, dataset.bakedIndirect was ABSENT.
    // Absent is the one value a headless check cannot interpret - it means
    // "off", "this build predates the feature", or "the publish never ran", and
    // those are three different bugs.
    const target = { dataset: {} as Record<string, string | undefined> };
    publishBakedIndirectReceipt(target, null);
    expect(target.dataset.bakedIndirect).toBe('off');
  });

  it('is structurally absent from the disabled runtime, not zeroed', () => {
    expect(SCREEN_SPACE_POST_DISABLED.bakedIndirect.enabled).toBe(false);
    expect(screenSpaceTopologyKey(SCREEN_SPACE_POST_DISABLED)).toContain('-');
  });
});

describe('HF-418 baked indirect: combat safety is asserted, not assumed', () => {
  it('the family safety assert refuses a composite over the ceiling', () => {
    const runtime = runtimeAt('high');
    const overGain = Object.freeze({
      ...runtime,
      bakedIndirect: Object.freeze({
        ...runtime.bakedIndirect,
        composite: BAKED_INDIRECT_MAXIMUM_GAIN + 0.01,
      }),
    });
    expect(() => assertScreenSpacePostCombatSafety(overGain)).toThrow(/baked indirect composite/);
    expect(() => assertScreenSpacePostCombatSafety(runtime)).not.toThrow();
  });

  it('every shipped preset resolves inside the envelope', () => {
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      const tuning = resolveBakedIndirectTuning(preset.bakedIndirect);
      expect(tuning.composite).toBeLessThanOrEqual(BAKED_INDIRECT_MAXIMUM_GAIN);
    }
  });

  it('the LIVE gain uniform is clamped at its own setter, not only by the resolver (B6)', () => {
    // THE DEFECT THIS PINS. `BakedIndirectGraph.applyTuning` wrote
    // `gain.value = next.composite` with no ceiling, so a tuning that had not
    // come through the resolver reached the live uniform at whatever value it
    // carried. The envelope assert then threw - AFTERWARDS. A guard that
    // reports a breach it has already let through is not a guard.
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(20, 40, 10);
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.02, 400);
    scene.add(sun, sun.target, camera);
    const runtime = buildBakedIndirectRuntime(
      { sceneColor: null as never, sceneNormal: null as never, sceneViewZ: null as never, camera, sun },
      resolveBakedIndirectTuning('high'), () => null, () => 0,
    );
    const overGain = { ...resolveBakedIndirectTuning('high'), composite: BAKED_INDIRECT_MAXIMUM_GAIN + 5 };
    runtime.applyTuning(overGain);
    expect(runtime.graph.receipt().gain).toBeLessThanOrEqual(BAKED_INDIRECT_MAXIMUM_GAIN);
    runtime.dispose();
    expect(EXTRACTION_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  it('applies the baked tuning AFTER the family safety assert, not before it (B6)', () => {
    // A source-order pin, because the ordering is the defect and no unit test
    // of either function can see it: `applyRuntime` wrote the baked tuning into
    // the live uniform on its FIRST line and asserted on its second, while every
    // other value in the same function is applied after the assert.
    const source = readFileSync('src/rendering/screen-space-post.ts', 'utf8');
    const body = source.slice(source.indexOf('applyRuntime(next: ScreenSpacePostRuntime)'));
    const assertAt = body.indexOf('assertScreenSpacePostCombatSafety(next)');
    const applyAt = body.indexOf('bakedIndirectRuntime?.applyTuning(next.bakedIndirect)');
    expect(assertAt).toBeGreaterThan(-1);
    expect(applyAt).toBeGreaterThan(-1);
    expect(assertAt).toBeLessThan(applyAt);
  });
});
