import { describe, expect, it } from 'vitest';
import {
  ADVANCED_GRAPHICS_CONTROLS,
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
