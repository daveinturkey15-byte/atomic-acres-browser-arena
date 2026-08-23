import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADVANCED_GRAPHICS_CONTROLS,
  ADVANCED_GRAPHICS_RUNTIME_EVIDENCE,
  GRAPHICS_CAPABILITY_NOTICES,
  GRAPHICS_PRESET_VALUES,
  normalizeAdvancedGraphicsValues,
  validateAdvancedGraphicsRegistry,
} from './graphics-settings-registry';

describe('Advanced Graphics canonical registry', () => {
  it('is complete, unique and executable by a named runtime consumer', () => {
    expect(validateAdvancedGraphicsRegistry()).toEqual([]);
    expect(new Set(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key)).size).toBe(ADVANCED_GRAPHICS_CONTROLS.length);
    expect(ADVANCED_GRAPHICS_CONTROLS.every(({ runtimeConsumer }) => runtimeConsumer.length > 0)).toBe(true);
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(Object.keys(preset).sort()).toEqual(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key).sort());
    }
  });

  it('fails closed unless every visible control probes a real runtime source and telemetry path', () => {
    expect(Object.keys(ADVANCED_GRAPHICS_RUNTIME_EVIDENCE).sort())
      .toEqual(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key).sort());
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      const probes = ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[definition.key];
      expect(probes.length, definition.key).toBeGreaterThan(0);
      for (const probe of probes) {
        expect(existsSync(probe.path), `${definition.key}: ${probe.path}`).toBe(true);
        expect(readFileSync(probe.path, 'utf8'), `${definition.key}: ${probe.symbol}`).toContain(probe.symbol);
        expect(probe.telemetryPath.length, definition.key).toBeGreaterThan(12);
      }
    }
  });

  it('normalizes hostile values and preserves the explicit uncapped sentinel', () => {
    expect(normalizeAdvancedGraphicsValues({
      renderScale: 99,
      targetFps: 999,
      frameRateLimit: 0,
      antiAliasing: 'invented',
      anisotropy: 128,
      exposure: Number.NaN,
    })).toMatchObject({
      renderScale: 1.25,
      targetFps: 360,
      frameRateLimit: 0,
      antiAliasing: GRAPHICS_PRESET_VALUES.high.antiAliasing,
      anisotropy: GRAPHICS_PRESET_VALUES.high.anisotropy,
      exposure: GRAPHICS_PRESET_VALUES.high.exposure,
    });
    expect(normalizeAdvancedGraphicsValues({ frameRateLimit: 361 }).frameRateLimit).toBe(0);
  });

  it('exposes the Pass 76 WebGPU feature controls with honest defaults', () => {
    const byKey = new Map(ADVANCED_GRAPHICS_CONTROLS.map((definition) => [definition.key, definition]));
    const optionValues = (key: 'antiAliasing' | 'reflectionQuality' | 'shadowFilter' | 'filmicProfile') => {
      const definition = byKey.get(key);
      return definition?.kind === 'select' ? definition.options.map(({ value }) => value) : [];
    };
    expect(optionValues('antiAliasing')).toEqual(['off', 'msaa-2x', 'msaa-4x', 'fxaa', 'smaa']);
    expect(optionValues('reflectionQuality')).toEqual(['off', 'low', 'high', 'ultra']);
    expect(optionValues('shadowFilter')).toEqual(['auto', 'pcf', 'pcss-soft']);
    expect(optionValues('filmicProfile')).toEqual(['arena-default', 'performance', 'quality', 'max']);
    expect(byKey.get('sharpness')).toMatchObject({ kind: 'range', minimum: 0, maximum: 1, applyMode: 'live' });
    expect(byKey.get('environmentIntensity')).toMatchObject({ kind: 'range', minimum: 0, maximum: 2, applyMode: 'live' });
    // Every preset keeps the new controls at behaviour-preserving defaults;
    // Max additionally claims the new highest reflection tier.
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(preset.shadowFilter).toBe('auto');
      expect(preset.filmicProfile).toBe('arena-default');
      expect(preset.sharpness).toBe(0);
      expect(preset.environmentIntensity).toBe(1);
    }
    expect(GRAPHICS_PRESET_VALUES.max.reflectionQuality).toBe('ultra');
    expect(normalizeAdvancedGraphicsValues({ antiAliasing: 'fxaa', sharpness: 3, shadowFilter: 'invented' }))
      .toMatchObject({ antiAliasing: 'fxaa', sharpness: 1, shadowFilter: 'auto' });
  });

  it('labels unsupported vendor paths without fake controls, and never both ways at once', () => {
    expect(GRAPHICS_CAPABILITY_NOTICES.map(({ state }) => state)).not.toContain('active');
    // HF-364 turned SSR, SSGI, depth of field, motion blur and spatial
    // upscaling into real controls. What remains unavailable is the genuine
    // browser boundary: no ray-tracing pipeline and no vendor-native temporal
    // reconstruction. This is an EXACT list, not a superset: a notice that
    // outlives its feature is the same lie as a control that does nothing.
    expect(GRAPHICS_CAPABILITY_NOTICES.map(({ id }) => id)).toEqual([
      'path-tracing',
      'ai-upscaling-frame-generation',
    ]);
    expect(GRAPHICS_CAPABILITY_NOTICES.every(({ reason, evidence }) => reason.length > 24 && evidence.length > 0)).toBe(true);
    // The strictness this replaces the old arrayContaining with: nothing may be
    // simultaneously advertised as an unavailable capability and shipped as a
    // working control.
    const noticeTopics = new Set(GRAPHICS_CAPABILITY_NOTICES.map(({ label }) => label.toLowerCase()));
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      expect(noticeTopics.has(definition.label.toLowerCase()), definition.key).toBe(false);
    }
  });

  it('ships the HF-364 screen-space stack as real controls with conservative preset defaults', () => {
    const byKey = new Map(ADVANCED_GRAPHICS_CONTROLS.map((definition) => [definition.key, definition]));
    for (const key of ['volumetricLightShafts', 'screenSpaceReflections', 'screenSpaceGi'] as const) {
      const definition = byKey.get(key);
      expect(definition?.kind, key).toBe('select');
      expect(definition?.kind === 'select' ? definition.options.map(({ value }) => value) : [], key)
        .toEqual(['off', 'low', 'high']);
      // Adding or removing a raymarch changes MRT attachments and render
      // targets, so none of these may claim to be a live apply.
      expect(definition?.applyMode, key).toBe('pipeline-rebuild');
    }
    expect(byKey.get('depthOfField')).toMatchObject({ kind: 'toggle', applyMode: 'pipeline-rebuild' });
    expect(byKey.get('depthOfFieldStrength')).toMatchObject({ kind: 'range', minimum: 0, maximum: 1, applyMode: 'live' });
    expect(byKey.get('motionBlur')).toMatchObject({ kind: 'range', minimum: 0, maximum: 1, applyMode: 'pipeline-rebuild' });
    expect(byKey.get('spatialUpscaling')?.kind === 'select'
      ? (byKey.get('spatialUpscaling') as { options: readonly { value: string }[] }).options.map(({ value }) => value)
      : []).toEqual(['off', 'fsr1-quality', 'fsr1-balanced', 'fsr1-performance']);
    // No preset moves at all. These passes exist only on the WebGPU route and
    // none of them has been compiled on a real device or measured on
    // representative hardware yet, so every one is a Custom opt-in. Promoting
    // one is a value edit here plus the matching preset value; until then a
    // preset must not claim an unmeasured full-screen raymarch.
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(preset.volumetricLightShafts).toBe('off');
      expect(preset.screenSpaceReflections).toBe('off');
      expect(preset.screenSpaceGi).toBe('off');
      expect(preset.depthOfField).toBe(false);
      expect(preset.motionBlur).toBe(0);
      expect(preset.spatialUpscaling).toBe('off');
    }
    expect(normalizeAdvancedGraphicsValues({
      screenSpaceGi: 'ultra', motionBlur: 9, spatialUpscaling: 'dlss', depthOfField: 'yes',
    })).toMatchObject({
      screenSpaceGi: GRAPHICS_PRESET_VALUES.high.screenSpaceGi,
      motionBlur: 1,
      spatialUpscaling: 'off',
      depthOfField: false,
    });
  });
});
