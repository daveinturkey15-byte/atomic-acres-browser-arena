/**
 * Pass 78 - the player's weather settings.
 *
 * One property carries this module: a weather setting may show LESS of the
 * match's weather and never more, and never anything the arena did not author.
 * Everything else here guards the latch, which is the only piece of shared
 * mutable state in the whole weather lane.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import {
  WEATHER_SEVERITY_LADDER,
  WEATHER_STATE_TABLE,
  weatherAvailability,
} from './weather-state';
import {
  DEFAULT_WEATHER_PRESENTATION,
  WEATHER_INTENSITY_CEILING,
  WEATHER_INTENSITY_CHOICES,
  WEATHER_RAIN_DENSITY_RANGE,
  WEATHER_WIND_STRENGTH_RANGE,
  activeWeatherPresentation,
  advanceWeatherOverrideClock,
  publishWeatherPresentation,
  resetWeatherOverrideClock,
  resetWeatherPresentation,
  resolveWeatherPresentation,
  weatherOverrideClockSeconds,
} from './weather-settings';

afterEach(() => {
  resetWeatherPresentation();
  resetWeatherOverrideClock();
});

describe('the weather ladder the player sees', () => {
  it('gives every choice a ceiling that is a real weather state', () => {
    expect(WEATHER_INTENSITY_CHOICES).toHaveLength(5);
    expect(new Set(WEATHER_INTENSITY_CHOICES).size).toBe(WEATHER_INTENSITY_CHOICES.length);
    for (const choice of WEATHER_INTENSITY_CHOICES) {
      const ceiling = WEATHER_INTENSITY_CEILING[choice];
      expect(WEATHER_SEVERITY_LADDER, choice).toContain(ceiling);
    }
  });

  it('is monotonic - a higher choice never shows less weather', () => {
    let previous = -1;
    for (const choice of WEATHER_INTENSITY_CHOICES) {
      const severity = WEATHER_STATE_TABLE[WEATHER_INTENSITY_CEILING[choice]].severity;
      expect(severity, choice).toBeGreaterThan(previous);
      previous = severity;
    }
    // The top choice must not cap anything, or the game ships a state no player
    // can reach and the arenas were authored for nothing.
    expect(WEATHER_INTENSITY_CEILING.storm).toBe(WEATHER_SEVERITY_LADDER[WEATHER_SEVERITY_LADDER.length - 1]);
    // OFF must genuinely be off, not "a bit less".
    expect(WEATHER_STATE_TABLE[WEATHER_INTENSITY_CEILING.off].rainRate).toBe(0);
    expect(WEATHER_STATE_TABLE[WEATHER_INTENSITY_CEILING.off].skyDarkenAmount).toBe(0);
  });

  it('leaves every arena a reachable state at every choice, including OFF', () => {
    // A ceiling that no arena state satisfies would resolve to nothing at all.
    for (const arenaId of ARENA_IDS) {
      const available = weatherAvailability(arenaId);
      for (const choice of WEATHER_INTENSITY_CHOICES) {
        const ceilingSeverity = WEATHER_STATE_TABLE[WEATHER_INTENSITY_CEILING[choice]].severity;
        expect(
          available.some((state) => WEATHER_STATE_TABLE[state].severity <= ceilingSeverity),
          `${arenaId}/${choice}`,
        ).toBe(true);
      }
    }
  });
});

describe('resolving the player settings', () => {
  it('defaults to the FULL authored experience when nothing is stored', () => {
    // A missing settings layer must never silently mute a feature; the audit
    // note this lane exists for was exactly that failure mode.
    expect(DEFAULT_WEATHER_PRESENTATION).toMatchObject({
      intensity: 'storm',
      ceilingState: 'storm',
      rainDensity: 1,
      windStrength: 1,
      lightning: true,
      weatherEnabled: true,
    });
  });

  it('clamps hostile values instead of throwing a frame', () => {
    expect(resolveWeatherPresentation({
      weatherIntensity: 'apocalypse' as never,
      rainDensity: Number.NaN,
      windStrength: 99,
      lightning: 'yes' as never,
    })).toMatchObject({
      intensity: 'storm',
      rainDensity: 1,
      windStrength: WEATHER_WIND_STRENGTH_RANGE.maximum,
      lightning: true,
    });
    expect(resolveWeatherPresentation({ rainDensity: -5 }).rainDensity).toBe(WEATHER_RAIN_DENSITY_RANGE.minimum);
    expect(resolveWeatherPresentation({ rainDensity: 900 }).rainDensity).toBe(WEATHER_RAIN_DENSITY_RANGE.maximum);
    expect(resolveWeatherPresentation({ windStrength: -1 }).windStrength).toBe(0);
  });

  it('reports OFF as disabled and nothing else as disabled', () => {
    for (const choice of WEATHER_INTENSITY_CHOICES) {
      expect(resolveWeatherPresentation({ weatherIntensity: choice }).weatherEnabled, choice).toBe(choice !== 'off');
    }
  });

  it('is a pure function - the same settings resolve to the same numbers', () => {
    const settings = { weatherIntensity: 'moderate', rainDensity: 0.75, windStrength: 1.4, lightning: false } as const;
    expect(resolveWeatherPresentation(settings)).toEqual(resolveWeatherPresentation(settings));
  });
});

describe('the latch', () => {
  it('hands consumers the full experience until something is published', () => {
    expect(activeWeatherPresentation()).toBe(DEFAULT_WEATHER_PRESENTATION);
  });

  it('publishes, reads back, and resets to the default', () => {
    const quiet = resolveWeatherPresentation({ weatherIntensity: 'off', rainDensity: 0.25, lightning: false });
    publishWeatherPresentation(quiet);
    expect(activeWeatherPresentation()).toBe(quiet);
    resetWeatherPresentation();
    expect(activeWeatherPresentation()).toBe(DEFAULT_WEATHER_PRESENTATION);
  });
});

describe('the override clock', () => {
  it('accumulates frame deltas and ignores a hostile one', () => {
    expect(weatherOverrideClockSeconds()).toBe(0);
    advanceWeatherOverrideClock(0.5);
    advanceWeatherOverrideClock(0.25);
    expect(weatherOverrideClockSeconds()).toBeCloseTo(0.75, 9);
    // A NaN dt from a hidden tab, or a negative one from a clock correction,
    // must not be able to run the flash schedule backwards.
    advanceWeatherOverrideClock(Number.NaN);
    advanceWeatherOverrideClock(-10);
    expect(weatherOverrideClockSeconds()).toBeCloseTo(0.75, 9);
  });

  it('is accumulated frame time, not a wall clock', () => {
    // The whole reason this exists rather than a Date.now() read: the same
    // sequence of deltas must reproduce the same schedule.
    resetWeatherOverrideClock();
    for (let frame = 0; frame < 120; frame += 1) advanceWeatherOverrideClock(1 / 60);
    const first = weatherOverrideClockSeconds();
    resetWeatherOverrideClock();
    for (let frame = 0; frame < 120; frame += 1) advanceWeatherOverrideClock(1 / 60);
    expect(weatherOverrideClockSeconds()).toBe(first);
  });
});
