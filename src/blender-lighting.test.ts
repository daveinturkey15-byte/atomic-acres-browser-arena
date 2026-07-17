import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';

describe('Blender Render lighting', () => {
  it('uses a lower-fill textured-material rig without changing Performance', () => {
    const blender = arenaLightingProfile('blender');
    const performance = arenaLightingProfile('performance');

    expect(blender).toEqual({
      exposure: 1.02,
      hemisphereIntensity: 1,
      ambientIntensity: 0.18,
      sunIntensity: 2.45,
      shadowBias: -0.00012,
      shadowNormalBias: 0.04,
      softShadows: false,
    });
    expect(blender.exposure).toBeLessThan(performance.exposure);
    expect(blender.hemisphereIntensity).toBeLessThan(performance.hemisphereIntensity);
    expect(blender.ambientIntensity).toBeLessThan(performance.ambientIntensity);
    expect(performance.softShadows).toBe(false);
  });
});
