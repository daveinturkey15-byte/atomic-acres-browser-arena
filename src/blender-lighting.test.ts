import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';

describe('Pass 30 stormfront early-morning arena lighting', () => {
  it('uses bounded purple-orange early-morning balance in Quality Graphics', () => {
    const blender = arenaLightingProfile('blender');
    expect(blender).toMatchObject({
      exposure: 1.18,
      hemisphereIntensity: 1.9,
      ambientIntensity: 0.82,
      sunIntensity: 2.7,
      fogColor: 0xb0a5b5,
      fogNear: 50,
      fogFar: 128,
      skyTop: 0x46385f,
      skyHorizon: 0xcf8a7c,
      skyBottom: 0xf0a15f,
      skyCloudShadow: 0x382149,
      skyCloudLight: 0xff873f,
      routeLightIntensity: 5,
      routeLightCount: 3,
      streetLightCount: 4,
      streetLightIntensity: 6,
      interiorLightIntensity: 15,
      interiorLightCount: 4,
      fillColor: 0xd8ddff,
      fillIntensity: 0.7,
      fillPosition: [54, 20, -42],
      godRayStrength: 0.12,
      godRayLobes: 4,
    });
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeGreaterThanOrEqual(1.35);
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeLessThanOrEqual(1.6);
    expect(blender.fogFar - blender.fogNear).toBeGreaterThanOrEqual(60);
    expect(blender.sunPosition).toEqual([-62, 25, 38]);
  });

  it('keeps Performance bounded and Compatibility software-safe', () => {
    const performance = arenaLightingProfile('performance');
    const compat = arenaLightingProfile('compat');
    expect(performance).toMatchObject({
      exposure: 1.16,
      hemisphereIntensity: 1.82,
      ambientIntensity: 0.78,
      sunIntensity: 2.65,
      routeLightIntensity: 3,
      streetLightIntensity: 4,
      interiorLightIntensity: 11,
      routeLightCount: 3,
      streetLightCount: 4,
      interiorLightCount: 2,
      fillIntensity: 0.58,
      godRayStrength: 0.08,
      godRayLobes: 2,
    });
    expect(performance.sunIntensity / performance.hemisphereIntensity).toBeGreaterThanOrEqual(1.4);
    expect(performance.sunIntensity / performance.hemisphereIntensity).toBeLessThanOrEqual(1.55);
    expect(compat).toMatchObject({ routeLightCount: 0, streetLightCount: 0, interiorLightCount: 0, fillIntensity: 0.66, godRayStrength: 0, godRayLobes: 0 });
    expect(compat.ambientIntensity).toBeGreaterThan(performance.ambientIntensity);
  });

  it('returns isolated position arrays instead of mutable shared lighting state', () => {
    const first = arenaLightingProfile('blender');
    const second = arenaLightingProfile('blender');
    expect(first.sunPosition).not.toBe(second.sunPosition);
    expect(first.fillPosition).not.toBe(second.fillPosition);
    expect(first).toEqual(second);
  });

  it('scopes the clear retro-future daylight palette to Atomic Acres', () => {
    const atomic = arenaLightingProfile('blender', 'atomic-acres');
    const otherMap = arenaLightingProfile('blender', 'rustworks-1v1');
    expect(atomic).toMatchObject({
      exposure: 1.06,
      fogColor: 0xaebdbd,
      fogNear: 58,
      fogFar: 148,
      skyTop: 0x4d83a5,
      skyHorizon: 0xdda77d,
      sunPosition: [-48, 42, 30],
      routeLightIntensity: 3,
      interiorLightIntensity: 10,
      godRayStrength: 0.05,
    });
    expect(otherMap).toEqual(arenaLightingProfile('blender'));
  });
});
