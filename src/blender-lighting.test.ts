import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';

describe('Pass 27 authored arena lighting', () => {
  it('uses stronger sun-to-fill separation and bounded atmospheric depth in Blender Render', () => {
    const blender = arenaLightingProfile('blender');
    const performance = arenaLightingProfile('performance');

    expect(blender).toMatchObject({
      exposure: 1,
      hemisphereIntensity: 0.9,
      ambientIntensity: 0.14,
      sunIntensity: 3.25,
      fogColor: 0x9faaa0,
      fogNear: 58,
      fogFar: 128,
      skyTop: 0x123653,
      skyHorizon: 0x9eafa3,
      skyBottom: 0xc99d68,
      routeLightIntensity: 1,
    });
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeGreaterThan(3.5);
    expect(blender.fogFar - blender.fogNear).toBeGreaterThanOrEqual(60);
    expect(blender.fogNear).toBeGreaterThan(45);
    expect(blender.routeLightIntensity).toBeGreaterThan(performance.routeLightIntensity);
  });

  it('keeps Performance lower-cost while sharing the same readable sky hierarchy', () => {
    const performance = arenaLightingProfile('performance');
    expect(performance).toMatchObject({
      exposure: 1.08,
      hemisphereIntensity: 1.2,
      ambientIntensity: 0.24,
      sunIntensity: 2.95,
      fogNear: 68,
      fogFar: 145,
      routeLightIntensity: 0.38,
      softShadows: false,
    });
    expect(performance.sunPosition).toEqual([-36, 64, 28]);
  });

  it('returns isolated position arrays instead of mutable shared lighting state', () => {
    const first = arenaLightingProfile('blender');
    const second = arenaLightingProfile('blender');
    expect(first.sunPosition).not.toBe(second.sunPosition);
    expect(first).toEqual(second);
  });
});
