import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';

describe('Pass 30 stormfront early-morning arena lighting', () => {
  it('uses bounded purple-orange early-morning balance in Quality Graphics', () => {
    const blender = arenaLightingProfile('blender');
    expect(blender).toMatchObject({
      exposure: 1.02,
      hemisphereIntensity: 0.7,
      ambientIntensity: 0.18,
      sunIntensity: 3.15,
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
      fillIntensity: 0.22,
      fillPosition: [54, 20, -42],
      godRayStrength: 0.12,
      godRayLobes: 4,
    });
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeGreaterThanOrEqual(4);
    expect(blender.sunIntensity / blender.hemisphereIntensity).toBeLessThanOrEqual(5);
    expect(blender.softShadows).toBe(true);
    expect(blender.fogFar - blender.fogNear).toBeGreaterThanOrEqual(60);
    expect(blender.sunPosition).toEqual([-62, 25, 38]);
  });

  it('keeps Performance bounded and Compatibility software-safe', () => {
    const performance = arenaLightingProfile('performance');
    const compat = arenaLightingProfile('compat');
    expect(performance).toMatchObject({
      exposure: 1.06,
      hemisphereIntensity: 1.05,
      ambientIntensity: 0.34,
      sunIntensity: 2.7,
      routeLightIntensity: 3,
      streetLightIntensity: 4,
      interiorLightIntensity: 11,
      routeLightCount: 3,
      streetLightCount: 4,
      interiorLightCount: 2,
      fillIntensity: 0.32,
      godRayStrength: 0.08,
      godRayLobes: 2,
    });
    expect(performance.sunIntensity / performance.hemisphereIntensity).toBeGreaterThanOrEqual(2.4);
    expect(performance.sunIntensity / performance.hemisphereIntensity).toBeLessThanOrEqual(2.7);
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
    // Owner 2026-08-29 re-pin: the old >4:1 sun:hemisphere pin ENCODED the
    // dead-black shadow sides the owner reported. The daylight must stay
    // strongly directional (ratio > 2.5) without crushing shadow detail
    // (ambient in [0.3, 0.45]).
    expect(atomic.sunIntensity / atomic.hemisphereIntensity).toBeGreaterThan(2.5);
    expect(atomic.sunIntensity / atomic.hemisphereIntensity).toBeLessThan(4);
    expect(atomic.ambientIntensity).toBeGreaterThan(0.3);
    expect(atomic.ambientIntensity).toBeLessThan(0.45);
    // RustRig gets the owner-specced +25% brightness lift so its darkest
    // corridors read; it must not fall back to the plain blender profile.
    const plain = arenaLightingProfile('blender');
    expect(otherMap).not.toEqual(plain);
    expect(otherMap.exposure).toBeCloseTo(plain.exposure * 1.25, 5);
    expect(otherMap.ambientIntensity).toBeCloseTo(plain.ambientIntensity * 1.25, 5);
    expect(otherMap.hemisphereIntensity).toBeCloseTo(plain.hemisphereIntensity * 1.25, 5);
    expect(otherMap.sunIntensity).toBeCloseTo(plain.sunIntensity * 1.25, 5);
    expect(otherMap.fillIntensity).toBeCloseTo(plain.fillIntensity * 1.25, 5);
    expect(otherMap.interiorLightIntensity).toBeCloseTo(plain.interiorLightIntensity * 1.25, 5);
  });
});
