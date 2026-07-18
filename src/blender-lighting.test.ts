import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';

describe('Pass 29 early-morning arena lighting', () => {
  it('uses bounded low-contrast early-morning balance in Blender Render', () => {
    const blender = arenaLightingProfile('blender');
    expect(blender).toMatchObject({
      exposure: 1,
      hemisphereIntensity: 1.5,
      ambientIntensity: 0.52,
      sunIntensity: 2.7,
      fogColor: 0xb8c1ba,
      fogNear: 58,
      fogFar: 136,
      skyTop: 0x66879e,
      skyHorizon: 0xb7c6cc,
      skyBottom: 0xe1b27c,
      routeLightIntensity: 5,
      routeLightCount: 3,
      streetLightCount: 4,
      streetLightIntensity: 6,
      interiorLightIntensity: 12,
      interiorLightCount: 4,
      godRayStrength: 0.12,
      godRayLobes: 4,
    });
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeGreaterThanOrEqual(1.6);
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeLessThanOrEqual(2.2);
    expect(blender.fogFar - blender.fogNear).toBeGreaterThanOrEqual(60);
    expect(blender.sunPosition).toEqual([-62, 25, 38]);
  });

  it('keeps Performance bounded and Compatibility software-safe', () => {
    const performance = arenaLightingProfile('performance');
    const compat = arenaLightingProfile('compat');
    expect(performance).toMatchObject({
      exposure: 1.02,
      hemisphereIntensity: 1.5,
      ambientIntensity: 0.55,
      sunIntensity: 2.7,
      routeLightIntensity: 3,
      streetLightIntensity: 4,
      interiorLightIntensity: 8,
      routeLightCount: 3,
      streetLightCount: 4,
      interiorLightCount: 2,
      godRayStrength: 0.08,
      godRayLobes: 2,
    });
    expect(performance.sunIntensity / performance.hemisphereIntensity).toBeGreaterThanOrEqual(1.6);
    expect(performance.sunIntensity / performance.hemisphereIntensity).toBeLessThanOrEqual(2.2);
    expect(compat).toMatchObject({ routeLightCount: 0, streetLightCount: 0, interiorLightCount: 0, godRayStrength: 0, godRayLobes: 0 });
    expect(compat.ambientIntensity).toBeGreaterThan(performance.ambientIntensity);
  });

  it('returns isolated position arrays instead of mutable shared lighting state', () => {
    const first = arenaLightingProfile('blender');
    const second = arenaLightingProfile('blender');
    expect(first.sunPosition).not.toBe(second.sunPosition);
    expect(first).toEqual(second);
  });
});
