import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';

describe('Blender Render lighting', () => {
  it('uses a lower-fill textured-material rig without changing the existing profiles', () => {
    const blender = arenaLightingProfile('blender');
    const quality = arenaLightingProfile('quality');
    const performance = arenaLightingProfile('performance');

    expect(blender).toEqual({
      exposure: 1.02,
      hemisphereIntensity: 1,
      ambientIntensity: 0.18,
      sunIntensity: 2.45,
      shadowBias: -0.00012,
      shadowNormalBias: 0.04,
      softShadows: true,
    });
    expect(blender.exposure).toBeLessThan(quality.exposure);
    expect(blender.hemisphereIntensity).toBeLessThan(quality.hemisphereIntensity);
    expect(blender.ambientIntensity).toBeLessThan(quality.ambientIntensity);
    expect(quality).toEqual(performance);
    expect(quality.softShadows).toBe(false);
  });
});
