import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import { ARENA_DAYLIGHT_PROFILES, lightingConditionsAreIdentity } from './lighting-conditions';
import { NUKETOWN2_SKY_PRESETS } from '../nuketown2-lighting';
import { ARENA_WEATHER_PROFILES, WEATHER_STATE_TABLE } from '../weather/weather-state';
import {
  NUKETOWN2_TIME_PRESET_SKIES,
  SKY_BACKDROP_INTENSITY_BOUNDS,
  SKY_TIME_PRESET_IDS,
  WEATHER_PRESET_IDS,
  arenaConfiguredSkyPreset,
  arenaWeatherPresetState,
  assertSkyWeatherPresetSafety,
  isSkyTimePresetId,
  isWeatherPresetId,
  matchTimeSkyPreset,
  resolveSkyWeatherPreset,
  skyBackdropIntensity,
  skyTimePresetHour,
} from './sky-weather-presets';

describe('sky/weather preset catalogue: roster coverage', () => {
  it('resolves every arena in the registry at every time x weather preset', () => {
    for (const arenaId of ARENA_IDS) {
      for (const time of SKY_TIME_PRESET_IDS) {
        for (const weather of WEATHER_PRESET_IDS) {
          const resolved = resolveSkyWeatherPreset({ arenaId, time, weather });
          expect(resolved.arenaId).toBe(arenaId);
          expect(resolved.writes.arenaId).toBe(arenaId);
          expect(Number.isFinite(resolved.hour)).toBe(true);
          expect(Number.isFinite(resolved.backdropIntensity)).toBe(true);
          expect(resolved.captureQuery).toBe(`todhour=${resolved.hour}&weather=${resolved.weatherState}`);
        }
      }
    }
  });

  it('fails closed on the whole catalogue at import time', () => {
    expect(() => assertSkyWeatherPresetSafety()).not.toThrow();
  });

  it('addresses hours inside each generic arena MEASURED band, never outside it', () => {
    for (const arenaId of ARENA_IDS) {
      if (arenaId === 'nuketown2') continue;
      const [low, high] = ARENA_DAYLIGHT_PROFILES[arenaId].hourRange;
      for (const time of SKY_TIME_PRESET_IDS) {
        const hour = skyTimePresetHour(arenaId, time);
        expect(hour).toBeGreaterThanOrEqual(low);
        expect(hour).toBeLessThanOrEqual(high);
      }
      expect(skyTimePresetHour(arenaId, 'dawn')).toBeLessThanOrEqual(skyTimePresetHour(arenaId, 'day'));
      expect(skyTimePresetHour(arenaId, 'day')).toBeLessThanOrEqual(skyTimePresetHour(arenaId, 'dusk'));
    }
  });

  it('addresses the Nuke Town Rebuild skies by their own capture hours', () => {
    for (const time of SKY_TIME_PRESET_IDS) {
      expect(skyTimePresetHour('nuketown2', time)).toBe(NUKETOWN2_SKY_PRESETS[NUKETOWN2_TIME_PRESET_SKIES[time]].captureHour);
    }
    expect(skyTimePresetHour('nuketown2', 'night')).toBeGreaterThan(skyTimePresetHour('nuketown2', 'dusk'));
  });

  it('keeps pinned arenas at their authored hour and identity at every preset', () => {
    for (const arenaId of ARENA_IDS) {
      if (!ARENA_DAYLIGHT_PROFILES[arenaId].pinned || arenaId === 'nuketown2') continue;
      for (const time of SKY_TIME_PRESET_IDS) {
        const resolved = resolveSkyWeatherPreset({ arenaId, time, weather: 'clear' });
        expect(resolved.hour).toBe(ARENA_DAYLIGHT_PROFILES[arenaId].authoredHour);
        expect(lightingConditionsAreIdentity(resolved.writes)).toBe(true);
        expect(resolved.backdropIntensity).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('sky/weather preset catalogue: combat readability', () => {
  it('never composes a shade darker than the shipped arena, in any preset', () => {
    for (const arenaId of ARENA_IDS) {
      for (const time of SKY_TIME_PRESET_IDS) {
        for (const weather of WEATHER_PRESET_IDS) {
          const { writes } = resolveSkyWeatherPreset({ arenaId, time, weather });
          expect(writes.shadowFloorScale).toBeGreaterThanOrEqual(1);
          expect(writes.ambientIntensityScale).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('turns the Nuke Town Rebuild street and porch lights on at night and dawn, off by day', () => {
    expect(resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'night', weather: 'clear' }).localLightFade).toBe(1);
    expect(resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'dawn', weather: 'clear' }).localLightFade).toBeGreaterThan(0.85);
    expect(resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'day', weather: 'clear' }).localLightFade).toBe(0);
    expect(resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'dusk', weather: 'clear' }).localLightFade).toBeGreaterThan(0.5);
  });

  it('keeps night readable on the Nuke Town Rebuild: key at the shipped floor, shade lifted, sky dimmed', () => {
    const night = resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'night', weather: 'clear' });
    const dusk = resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'dusk', weather: 'clear' });
    expect(night.writes.sunIntensityScale).toBeCloseTo(0.55, 6);
    expect(night.writes.shadowFloorScale).toBeGreaterThan(1.4);
    expect(night.backdropIntensity).toBeLessThan(dusk.backdropIntensity);
    expect(night.backdropIntensity).toBeGreaterThanOrEqual(SKY_BACKDROP_INTENSITY_BOUNDS.minimum);
    // Cool shade, warm-less key: the night reads by hue, not by darkness.
    expect(night.writes.ambientTint[2]).toBeGreaterThan(night.writes.ambientTint[0]);
  });
});

describe('sun-following sky backdrop', () => {
  it('is exactly 1 at every arena authored hour in clear air', () => {
    for (const arenaId of ARENA_IDS) {
      const authoredHour = arenaId === 'nuketown2'
        ? NUKETOWN2_SKY_PRESETS['golden-hour'].captureHour
        : ARENA_DAYLIGHT_PROFILES[arenaId].authoredHour;
      const anchor = resolveSkyWeatherPreset({ arenaId, time: 'day', weather: 'clear' });
      // Re-resolve at the authored hour through the same writes path.
      const identity = { ...anchor.writes, sunElevationDeltaDegrees: 0 };
      expect(skyBackdropIntensity(identity, 0)).toBeCloseTo(1, 9);
      expect(Number.isFinite(authoredHour)).toBe(true);
    }
  });

  it('dims monotonically with the sun and with the cloud deck, inside the envelope', () => {
    const day = resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'day', weather: 'clear' });
    const dawn = resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'dawn', weather: 'clear' });
    const night = resolveSkyWeatherPreset({ arenaId: 'nuketown2', time: 'night', weather: 'clear' });
    expect(day.backdropIntensity).toBeGreaterThan(dawn.backdropIntensity);
    expect(dawn.backdropIntensity).toBeGreaterThan(night.backdropIntensity);
    for (const arenaId of ARENA_IDS) {
      const clear = resolveSkyWeatherPreset({ arenaId, time: 'day', weather: 'clear' });
      const overcast = resolveSkyWeatherPreset({ arenaId, time: 'day', weather: 'overcast' });
      if (overcast.weatherState === 'clear') {
        expect(overcast.backdropIntensity).toBeCloseTo(clear.backdropIntensity, 9);
      } else if (clear.backdropIntensity < SKY_BACKDROP_INTENSITY_BOUNDS.maximum) {
        expect(overcast.backdropIntensity).toBeLessThan(clear.backdropIntensity);
      } else {
        // Both sides may sit on the ceiling; the deck can never BRIGHTEN the dome.
        expect(overcast.backdropIntensity).toBeLessThanOrEqual(clear.backdropIntensity);
      }
      expect(clear.backdropIntensity).toBeLessThanOrEqual(SKY_BACKDROP_INTENSITY_BOUNDS.maximum);
      expect(overcast.backdropIntensity).toBeGreaterThanOrEqual(SKY_BACKDROP_INTENSITY_BOUNDS.minimum);
    }
  });

  it('tolerates junk input without throwing', () => {
    const anchor = resolveSkyWeatherPreset({ arenaId: 'atomic-acres', time: 'day', weather: 'clear' });
    const junk = { ...anchor.writes, sunElevationDeltaDegrees: Number.NaN };
    expect(Number.isFinite(skyBackdropIntensity(junk, Number.NaN))).toBe(true);
  });
});

describe('weather presets clamp to what the arena can reach', () => {
  it('never asks an arena for a rung it does not author', () => {
    for (const arenaId of ARENA_IDS) {
      const available = ARENA_WEATHER_PROFILES[arenaId].availableStates;
      for (const weather of WEATHER_PRESET_IDS) {
        const state = arenaWeatherPresetState(arenaId, weather);
        expect(available).toContain(state);
        expect(WEATHER_STATE_TABLE[state].severity).toBeLessThanOrEqual(WEATHER_STATE_TABLE[weather].severity);
      }
    }
    expect(arenaWeatherPresetState('gun-range', 'light-rain')).toBe('clear');
    expect(arenaWeatherPresetState('rustworks-1v1', 'light-rain')).toBe('light-rain');
  });

  it('carries the rung wetness and rain rate for the material and rain hooks', () => {
    const rain = resolveSkyWeatherPreset({ arenaId: 'rustworks-1v1', time: 'dusk', weather: 'light-rain' });
    expect(rain.wetnessTarget).toBe(WEATHER_STATE_TABLE['light-rain'].wetnessTarget);
    expect(rain.rainRate).toBe(WEATHER_STATE_TABLE['light-rain'].rainRate);
    expect(rain.rainRate).toBeGreaterThan(0);
    const clear = resolveSkyWeatherPreset({ arenaId: 'rustworks-1v1', time: 'dusk', weather: 'clear' });
    expect(clear.rainRate).toBe(0);
    expect(clear.wetnessTarget).toBe(0);
  });
});

describe('arena-configured and match-time presets', () => {
  it('derives a configured preset for every arena that is nearest its authored hour', () => {
    for (const arenaId of ARENA_IDS) {
      const configured = arenaConfiguredSkyPreset(arenaId);
      expect(isSkyTimePresetId(configured.time)).toBe(true);
      expect(configured.weather).toBe('clear');
    }
    expect(arenaConfiguredSkyPreset('nuketown2').time).toBe('dusk');
    expect(arenaConfiguredSkyPreset('skyline-terminal').time).toBe('dawn');
    expect(arenaConfiguredSkyPreset('rustworks-1v1').time).toBe('day');
  });

  it('walks a match dawn -> day -> dusk -> night in equal quarters, purely', () => {
    expect(matchTimeSkyPreset(0, 300)).toBe('dawn');
    expect(matchTimeSkyPreset(76, 300)).toBe('day');
    expect(matchTimeSkyPreset(151, 300)).toBe('dusk');
    expect(matchTimeSkyPreset(226, 300)).toBe('night');
    expect(matchTimeSkyPreset(10_000, 300)).toBe('night');
    expect(matchTimeSkyPreset(Number.NaN, Number.NaN)).toBe('dawn');
    expect(matchTimeSkyPreset(-5, 0)).toBe('dawn');
  });

  it('validates preset ids as untrusted input', () => {
    expect(isSkyTimePresetId('night')).toBe(true);
    expect(isSkyTimePresetId('midnight')).toBe(false);
    expect(isWeatherPresetId('light-rain')).toBe(true);
    expect(isWeatherPresetId('storm')).toBe(false);
    expect(isWeatherPresetId(null)).toBe(false);
  });
});
