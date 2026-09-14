import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIGHTING_CONDITION_BOUNDS, lightingConditionsAreIdentity, resolveLightingConditions } from '../rendering/lighting-conditions';
import { deriveWeatherMatchSeed } from '../legacy-pure-helpers-2';
import { resolveWeatherPresentation } from '../weather/weather-settings';
import { STUDIO_ENVIRONMENTS, studioEnvironmentForSeed } from './environment';
import { createStudioWeatherRouter, isStudioPresetId, resolveStudioLightingConditions, studioWeatherSeed } from './weather-routing';

describe('New World shared environment routing', () => {
  it('binds host and late join to host epoch, ignoring each local seed and override', () => {
    const hostSeed = studioWeatherSeed(true, 'host-123', 123456789, 111)!;
    const guestSeed = studioWeatherSeed(true, 'host-123', 123456789, 999)!;
    expect(hostSeed).toBe(deriveWeatherMatchSeed('host-123', 123456789));
    expect(guestSeed).toBe(hostSeed);
    const host = createStudioWeatherRouter().resolve(hostSeed, true, 'spring-rain');
    const guest = createStudioWeatherRouter().resolve(guestSeed, true, 'winter-snow');
    expect(host.preset).toBe(studioEnvironmentForSeed(hostSeed));
    expect(guest.preset).toBe(host.preset);
    expect(guest.environment).toEqual(host.environment);
  });

  it('never substitutes a local seed when hosted identity is missing or invalid', () => {
    expect(studioWeatherSeed(true, null, 42, 999)).toBeNull();
    expect(studioWeatherSeed(true, 'host', Number.NaN, 999)).toBeNull();
    expect(studioWeatherSeed(true, 'host', -1, 999)).toBeNull();
    expect(studioWeatherSeed(true, 'host', null, 1)).toBe(studioWeatherSeed(true, 'host', null, 99));
    expect(studioWeatherSeed(false, null, null, 99)).toBe(99);
  });

  it('supports only known offline preset overrides and covers each authored preset', () => {
    const router = createStudioWeatherRouter();
    for (const preset of STUDIO_ENVIRONMENTS) {
      expect(isStudioPresetId(preset.id)).toBe(true);
      expect(router.resolve(6, false, preset.id).preset).toBe(preset);
    }
    expect(isStudioPresetId('invented')).toBe(false);
    expect(router.resolve(6, false, 'invented').preset).toBe(studioEnvironmentForSeed(6));
  });

  it('starts spring rainy and gives winter actual snow without rain', () => {
    const router = createStudioWeatherRouter();
    const rain = router.resolve(0, false, 'spring-rain');
    expect(rain.weather.raining).toBe(true);
    expect(rain.weather.rainRate).toBe(0.48);
    expect(rain.environment.snow).toBe(0);
    const snow = router.resolve(0, false, 'winter-snow');
    expect(snow.environment.snow).toBe(0.65);
    expect(snow.weather.rainRate).toBe(0);
    expect(snow.weather.raining).toBe(false);
    expect(snow.weather.state).toBe('overcast');
    expect(snow.weather.skyDarkenAmount).toBeGreaterThan(0);
  });

  it('honors weather, wind and wet-surface presentation controls without changing preset identity', () => {
    const router = createStudioWeatherRouter();
    for (const presetId of ['spring-rain', 'winter-snow'] as const) {
      const full = router.resolve(0, false, presetId);
      const off = router.resolve(0, false, presetId, resolveWeatherPresentation({ weatherIntensity: 'off', windStrength: 0 }));
      expect(off.preset).toBe(full.preset);
      expect(off.environment).toMatchObject({ rain: 0, snow: 0, wetness: 0, wind: 0 });
      expect(off.weather.skyDarkenAmount).toBe(0);
      const light = router.resolve(0, false, presetId, resolveWeatherPresentation({ weatherIntensity: 'light' }));
      expect(light.environment.rain + light.environment.snow).toBe(0);
      const moderate = router.resolve(0, false, presetId, resolveWeatherPresentation({ weatherIntensity: 'moderate' }));
      expect(moderate.environment.rain + moderate.environment.snow).toBeLessThanOrEqual(0.34);
      const dry = router.resolve(0, false, presetId, resolveWeatherPresentation({ wetSurfaces: false }));
      expect(dry.environment.wetness).toBe(0);
      expect(dry.preset).toBe(full.preset);
    }
  });

  it('retains the same root environment and weather objects until an input changes', () => {
    const router = createStudioWeatherRouter();
    const settings = resolveWeatherPresentation({});
    const first = router.resolve(0, false, 'spring-rain', settings);
    for (let frame = 0; frame < 180; frame += 1) {
      expect(router.resolve(0, false, 'spring-rain', settings)).toBe(first);
    }
    expect(router.resolve(0, false, 'winter-snow', settings)).not.toBe(first);
    expect(router.resolve(0, false, 'spring-rain', resolveWeatherPresentation({ weatherIntensity: 'off' }))).not.toBe(first);
  });

  it('uses the tested adapter at construction, seed reset and before the active frame hook', () => {
    const source = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    expect(source).toContain('syncWorldStudioEnvironment(nextArena)');
    expect(source).toContain('const studioWeather = syncWorldStudioEnvironment()');
    expect(source.indexOf('const studioWeather = syncWorldStudioEnvironment()'))
      .toBeLessThan(source.indexOf('arenaFrameAnimator.tick(arena'));
    expect(source).toContain('studioWeather?.weather ??');
    expect(source).toContain('target.root.userData.worldStudioEnvironment = route.environment');
  });
});

describe('New World time-of-day inspection boundary', () => {
  it('keeps default production noon until the measured band is adopted', () => {
    for (let matchSeed = 0; matchSeed < 32; matchSeed += 1) {
      const normal = resolveStudioLightingConditions({ hosted: false, matchSeed });
      expect(normal.hour).toBe(12);
      expect(lightingConditionsAreIdentity(normal)).toBe(true);
    }
  });

  it('rejects all local time and weather overrides for both host and guest', () => {
    for (let matchSeed = 0; matchSeed < 32; matchSeed += 1) {
      const host = resolveStudioLightingConditions({ hosted: true, matchSeed, fixedHour: 9.5, offlinePresetOverride: 'spring-rain' });
      const guest = resolveStudioLightingConditions({ hosted: true, matchSeed, fixedHour: 16.5, offlinePresetOverride: 'winter-snow' });
      expect(host).toEqual(guest);
      expect(host).toEqual(resolveLightingConditions({ arenaId: 'world-studio', matchSeed }));
    }
  });

  it('moves actual light and atmosphere writes and preserves the exact noon anchor', () => {
    const early = resolveStudioLightingConditions({ hosted: false, fixedHour: 9.5 });
    const noon = resolveStudioLightingConditions({ hosted: false, fixedHour: 12 });
    const late = resolveStudioLightingConditions({ hosted: false, fixedHour: 16.5 });
    expect([early.hour, noon.hour, late.hour]).toEqual([9.5, 12, 16.5]);
    expect(lightingConditionsAreIdentity(noon)).toBe(true);
    expect(early.sunAzimuthDeltaDegrees).toBeLessThan(0);
    expect(late.sunAzimuthDeltaDegrees).toBeGreaterThan(0);
    expect(late.sunElevationDeltaDegrees).toBeLessThan(early.sunElevationDeltaDegrees);
    expect(late.sunTint[0]).toBeGreaterThan(noon.sunTint[0]);
    expect(late.sunTint[2]).toBeLessThan(noon.sunTint[2]);
    expect(late.fogTint).not.toEqual(noon.fogTint);
    expect(late.hemisphereSkyTint).not.toEqual(noon.hemisphereSkyTint);
    expect(late.sunIntensityScale).toBeLessThan(1);
    expect(resolveStudioLightingConditions({ hosted: false, fixedHour: 16.5, elapsedSeconds: 900 })).toEqual(late);
  });

  it('retains all numeric safety ceilings throughout the candidate inspection range', () => {
    for (let hour = 9.5; hour <= 16.5; hour += 0.125) {
      for (const skyDarkenAmount of [0, 0.16, 0.3, 0.45, 0.58, 1]) {
        const writes = resolveStudioLightingConditions({ hosted: false, fixedHour: hour, skyDarkenAmount });
        for (const [value, bound] of [
          [writes.sunIntensityScale, LIGHTING_CONDITION_BOUNDS.sunIntensityScale],
          [writes.shadowFloorScale, LIGHTING_CONDITION_BOUNDS.shadowFloorScale],
          [writes.exposureScale, LIGHTING_CONDITION_BOUNDS.exposureScale],
          [writes.sunAzimuthDeltaDegrees, LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees],
          [62 + writes.sunElevationDeltaDegrees, LIGHTING_CONDITION_BOUNDS.sunElevationDegrees],
        ] as const) {
          expect(value).toBeGreaterThanOrEqual(bound.minimum);
          expect(value).toBeLessThanOrEqual(bound.maximum);
        }
        for (const tint of [writes.sunTint, writes.ambientTint, writes.hemisphereSkyTint, writes.hemisphereGroundTint, writes.fillTint]) {
          for (const value of tint) {
            expect(value).toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.tintChannel.minimum);
            expect(value).toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.tintChannel.maximum);
          }
        }
        for (const value of writes.fogTint) {
          expect(value).toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.fogTintChannel.minimum);
          expect(value).toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.fogTintChannel.maximum);
        }
        if (skyDarkenAmount === 1) expect(lightingConditionsAreIdentity(writes)).toBe(true);
      }
    }
    expect(resolveStudioLightingConditions({ hosted: false, fixedHour: -100 }).hour).toBe(9.5);
    expect(resolveStudioLightingConditions({ hosted: false, fixedHour: 100 }).hour).toBe(16.5);
    expect(resolveStudioLightingConditions({ hosted: false, fixedHour: Number.NaN }).hour).toBe(12);
  });

  it('wires the live resolver and background uniform while retaining local inspection telemetry', () => {
    const source = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    expect(source).toContain('return resolveStudioLightingConditions({');
    expect(source).toContain("hosted: network.role !== 'offline' || privateLobbySnapshot !== null");
    expect(source).toContain('scene.backgroundIntensity = studioLightingBackdropBaseline * writes.sunIntensityScale');
    expect(source).toContain('scene.backgroundIntensity = studioLightingBackdropBaseline;');
    expect(source).toContain('studioTimeOfDayInspection:');
    expect(source).toContain('studioHour === lightingConditionsGateStudioHour');
  });
});
