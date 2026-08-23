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

  it('labels unsupported vendor and experimental paths without fake controls', () => {
    expect(GRAPHICS_CAPABILITY_NOTICES.map(({ state }) => state)).not.toContain('active');
    expect(GRAPHICS_CAPABILITY_NOTICES.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'path-tracing',
      'screen-space-gi',
      'screen-space-reflections',
      'depth-of-field',
      'motion-blur',
      'ai-upscaling-frame-generation',
    ]));
    expect(GRAPHICS_CAPABILITY_NOTICES.every(({ reason, evidence }) => reason.length > 24 && evidence.length > 0)).toBe(true);
  });
});
