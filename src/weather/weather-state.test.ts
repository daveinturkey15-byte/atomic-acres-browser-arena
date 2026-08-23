/**
 * Pass 76 - the zero-traffic weather state machine.
 *
 * The claims being pinned: every peer computes the same sky from the same three
 * numbers, the sky never repeats inside a match, and the indoor arena can never
 * rain no matter what seed it is handed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARENA_IDS, type ArenaId } from '../arena-identity';
import {
  ARENA_WEATHER_PROFILES,
  WEATHER_HEAVY_MAX_DURATION_SECONDS,
  WEATHER_HEAVY_RAIN_RATE,
  WEATHER_MATCH_HORIZON_SECONDS,
  WEATHER_SEVERITY_LADDER,
  WEATHER_STATE_TABLE,
  WEATHER_TRANSITION_SECONDS,
  WEATHER_WETNESS,
  arenaCanRain,
  arenaWeatherProfile,
  clearWeatherSample,
  sampleWeather,
  weatherAvailability,
  weatherPhaseSequence,
  weatherStateRow,
  WEATHER_LIGHTNING,
  assertLightningCombatSafety,
  forcedWeatherSample,
  lightningFlashEnvelope,
  sampleWeatherLightning,
  type WeatherSample,
} from './weather-state';
import {
  WEATHER_INTENSITY_CHOICES,
  publishWeatherPresentation,
  resetWeatherPresentation,
  resolveWeatherPresentation,
  type WeatherIntensityChoice,
} from './weather-settings';

/** The full authored experience, passed explicitly so no test reads the latch. */
const UNCAPPED = resolveWeatherPresentation({});

function capped(intensity: WeatherIntensityChoice) {
  return resolveWeatherPresentation({ weatherIntensity: intensity });
}

afterEach(() => {
  resetWeatherPresentation();
});

const SEEDS = [0, 1, 7, 4_242, 0x51ce_2f01, 987_654_321];

function scalarsOf(sample: WeatherSample): readonly number[] {
  return [
    sample.intensity,
    sample.rainRate,
    sample.windMultiplier,
    sample.wetness,
    sample.fogDensityMultiplier,
    sample.skyDarkenAmount,
  ];
}

describe('weather determinism', () => {
  it('gives every peer the same weather from (arena, seed, elapsed) alone', () => {
    for (const arenaId of ARENA_IDS) {
      for (const seed of SEEDS) {
        for (let elapsed = 0; elapsed < 700; elapsed += 6.5) {
          const host = sampleWeather(arenaId, seed, elapsed);
          const guest = sampleWeather(arenaId, seed, elapsed);
          expect(guest, `${arenaId}/${seed}@${elapsed}`).toEqual(host);
        }
      }
    }
  });

  it('lets a LATE JOINER agree without a resync, and keeps NO hidden state', () => {
    // A guest whose very first call is at t=613 must land on exactly what a
    // host that has been stepping 60 Hz since t=0 sees. The failure mode this
    // guards is someone later "optimising" the phase walk with a module-level
    // cache: that would make the answer depend on call history, and the guest
    // and host would silently diverge.
    for (const arenaId of ['high-seas', 'farcrysis', 'rustworks-1v1'] as const) {
      const guest = sampleWeather(arenaId, 99, 613);
      for (let elapsed = 0; elapsed <= 613; elapsed += 1 / 60) sampleWeather(arenaId, 99, elapsed);
      const host: WeatherSample = sampleWeather(arenaId, 99, 613);
      expect(host, arenaId).toEqual(guest);
      expect(scalarsOf(host), arenaId).toEqual(scalarsOf(guest));
    }
  });

  it('matches an independent numerical integration of the wetness ODE', () => {
    // The closed-form wetness walk is the one place this module could be
    // self-consistently wrong, so check it against a dumb Euler integration of
    // the same relaxation that knows nothing about phases.
    for (const arenaId of ['farcrysis', 'high-seas'] as const) {
      const seed = 17;
      const stepSeconds = 1 / 60;
      let reference = weatherStateRow(weatherAvailability(arenaId)[0]).wetnessTarget;
      for (let elapsed = 0; elapsed < 400; elapsed += stepSeconds) {
        const sample = sampleWeather(arenaId, seed, elapsed);
        const from = weatherStateRow(sample.previousState).wetnessTarget;
        const to = weatherStateRow(sample.state).wetnessTarget;
        const target = from + (to - from) * sample.transitionBlend;
        const rate = target > reference
          ? WEATHER_WETNESS.soakRatePerSecond
          : WEATHER_WETNESS.dryRatePerSecond;
        reference += (target - reference) * rate * stepSeconds;
      }
      expect(sampleWeather(arenaId, seed, 400).wetness, arenaId).toBeCloseTo(reference, 2);
    }
  });

  it('makes the match seed produce genuinely different weather', () => {
    const first = weatherPhaseSequence('high-seas', 1, 24);
    const second = weatherPhaseSequence('high-seas', 2, 24);
    expect(first.map((phase) => phase.state).join()).not.toBe(second.map((phase) => phase.state).join());
  });

  it('gives two arenas on one seed different schedules', () => {
    const seas = weatherPhaseSequence('high-seas', 42, 30).map((phase) => `${phase.state}:${phase.durationSeconds.toFixed(3)}`);
    const jungle = weatherPhaseSequence('farcrysis', 42, 30).map((phase) => `${phase.state}:${phase.durationSeconds.toFixed(3)}`);
    expect(seas.join()).not.toBe(jungle.join());
  });
});

describe('weather never repeats inside a match', () => {
  const varyingArenas = ARENA_IDS.filter((arenaId) => weatherAvailability(arenaId).length > 1);

  it('has more than one arena to test, or this suite is vacuous', () => {
    expect(varyingArenas.length).toBeGreaterThanOrEqual(5);
  });

  it('produces a phase schedule with no exact period across the match horizon', () => {
    for (const arenaId of varyingArenas) {
      const phases = weatherPhaseSequence(arenaId, 0xbeef, 120)
        .map((phase) => `${phase.state}:${phase.durationSeconds.toFixed(6)}`);
      for (let period = 1; period <= 40; period += 1) {
        let identical = true;
        for (let index = 0; index + period < phases.length && identical; index += 1) {
          if (phases[index] !== phases[index + period]) identical = false;
        }
        expect(identical, `${arenaId} period ${period}`).toBe(false);
      }
    }
  });

  it('never repeats the derived weather signal at any lag inside a match', () => {
    for (const arenaId of varyingArenas) {
      for (let lag = 5; lag <= WEATHER_MATCH_HORIZON_SECONDS; lag += 11) {
        let maxDeviation = 0;
        for (let elapsed = 0; elapsed < 320; elapsed += 13) {
          const left = sampleWeather(arenaId, 3, elapsed);
          const right = sampleWeather(arenaId, 3, elapsed + lag);
          maxDeviation = Math.max(
            maxDeviation,
            Math.abs(left.intensity - right.intensity) + Math.abs(left.wetness - right.wetness),
          );
        }
        expect(maxDeviation, `${arenaId} lag ${lag}`).toBeGreaterThan(0.01);
      }
    }
  });
});

describe('arena weather availability', () => {
  it('covers every shipped arena with a distinct identity', () => {
    const identities = new Set<string>();
    for (const arenaId of ARENA_IDS) {
      const profile = arenaWeatherProfile(arenaId);
      expect(profile, arenaId).toBeDefined();
      expect(profile.arenaId, arenaId).toBe(arenaId);
      expect(profile.availableStates.length, arenaId).toBeGreaterThan(0);
      identities.add(profile.identity);
      for (const state of profile.availableStates) {
        expect(WEATHER_SEVERITY_LADDER, arenaId).toContain(state);
      }
      // Mild-first ordering is what makes the ladder walk meaningful.
      const severities = profile.availableStates.map((state) => WEATHER_SEVERITY_LADDER.indexOf(state));
      expect([...severities].sort((a, b) => a - b), arenaId).toEqual(severities);
      expect(new Set(profile.availableStates).size, arenaId).toBe(profile.availableStates.length);
    }
    expect(identities.size).toBe(ARENA_IDS.length);
  });

  it('NEVER rains on the gun range - it is indoors', () => {
    expect(ARENA_WEATHER_PROFILES['gun-range'].indoor).toBe(true);
    expect(weatherAvailability('gun-range')).toEqual(['clear']);
    expect(arenaCanRain('gun-range')).toBe(false);
    for (const seed of [...SEEDS, 123_456, 0xffff_ffff, -17]) {
      for (let elapsed = 0; elapsed <= WEATHER_MATCH_HORIZON_SECONDS * 2; elapsed += 3.25) {
        const sample = sampleWeather('gun-range', seed, elapsed);
        expect(sample.state, `${seed}@${elapsed}`).toBe('clear');
        expect(sample.previousState, `${seed}@${elapsed}`).toBe('clear');
        expect(sample.rainRate, `${seed}@${elapsed}`).toBe(0);
        expect(sample.raining, `${seed}@${elapsed}`).toBe(false);
        expect(sample.wetness, `${seed}@${elapsed}`).toBe(0);
        expect(sample.intensity, `${seed}@${elapsed}`).toBe(0);
        expect(sample.skyDarkenAmount, `${seed}@${elapsed}`).toBe(0);
        expect(sample.windMultiplier, `${seed}@${elapsed}`).toBe(1);
      }
    }
    // And it never even schedules a second state to blend toward.
    expect(new Set(weatherPhaseSequence('gun-range', 8, 200).map((phase) => phase.state))).toEqual(new Set(['clear']));
  });

  it('only ever reaches states its arena authored', () => {
    for (const arenaId of ARENA_IDS) {
      const allowed = new Set(weatherAvailability(arenaId));
      for (const phase of weatherPhaseSequence(arenaId, 0x1234, 300)) {
        expect(allowed.has(phase.state), `${arenaId}/${phase.state}`).toBe(true);
      }
    }
  });

  it('opens every match on the arena baseline instead of ambushing the spawn', () => {
    for (const arenaId of ARENA_IDS) {
      for (const seed of SEEDS) {
        expect(sampleWeather(arenaId, seed, 0).state, `${arenaId}/${seed}`).toBe(weatherAvailability(arenaId)[0]);
      }
    }
  });
});

describe('weather transitions', () => {
  it('never skips a rung on the severity ladder', () => {
    for (const arenaId of ARENA_IDS) {
      const available = weatherAvailability(arenaId);
      for (const seed of SEEDS) {
        const phases = weatherPhaseSequence(arenaId, seed, 200);
        for (let index = 1; index < phases.length; index += 1) {
          const from = available.indexOf(phases[index - 1].state);
          const to = available.indexOf(phases[index].state);
          expect(Math.abs(to - from), `${arenaId}/${seed}@${index}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('blends smoothly - no derived value jumps between adjacent frames', () => {
    // The sweep is 54,000 samples, so the assertion is made ONCE on the worst
    // jump it found rather than 300,000 times inside the loop. That is the same
    // claim - a bound on every adjacent pair is a bound on the maximum - at a
    // hundredth of the cost, and it reports where the worst jump was.
    let worstJump = 0;
    let worstLabel = 'none';
    const record = (jump: number, label: string): void => {
      if (jump > worstJump) {
        worstJump = jump;
        worstLabel = label;
      }
    };
    for (const arenaId of ARENA_IDS) {
      let previous = sampleWeather(arenaId, 77, 0);
      for (let elapsed = 0.1; elapsed <= 900; elapsed += 0.1) {
        const current = sampleWeather(arenaId, 77, elapsed);
        // A visible pop in any of these reads as a rendering bug, not weather.
        record(Math.abs(current.intensity - previous.intensity), `${arenaId}@${elapsed} intensity`);
        record(Math.abs(current.rainRate - previous.rainRate), `${arenaId}@${elapsed} rainRate`);
        record(Math.abs(current.skyDarkenAmount - previous.skyDarkenAmount), `${arenaId}@${elapsed} skyDarken`);
        record(Math.abs(current.fogDensityMultiplier - previous.fogDensityMultiplier), `${arenaId}@${elapsed} fog`);
        record(Math.abs(current.windMultiplier - previous.windMultiplier), `${arenaId}@${elapsed} wind`);
        record(Math.abs(current.wetness - previous.wetness), `${arenaId}@${elapsed} wetness`);
        previous = current;
      }
    }
    expect(worstJump, `worst frame-to-frame jump at ${worstLabel}`).toBeLessThan(0.02);
  });

  it('settles the blend after the authored transition length', () => {
    const phases = weatherPhaseSequence('high-seas', 31, 12);
    const changing = phases.find((phase, index) => index > 0 && phase.state !== phase.previousState
      && phase.durationSeconds > WEATHER_TRANSITION_SECONDS + 2);
    expect(changing).toBeDefined();
    const arrival = sampleWeather('high-seas', 31, changing!.startSeconds + 0.001);
    const settled = sampleWeather('high-seas', 31, changing!.startSeconds + WEATHER_TRANSITION_SECONDS + 1);
    expect(arrival.transitionBlend).toBeLessThan(0.02);
    expect(settled.transitionBlend).toBe(1);
  });
});

describe('weather derived values', () => {
  it('rises monotonically along the severity ladder', () => {
    for (let index = 1; index < WEATHER_SEVERITY_LADDER.length; index += 1) {
      const milder = weatherStateRow(WEATHER_SEVERITY_LADDER[index - 1]);
      const harsher = weatherStateRow(WEATHER_SEVERITY_LADDER[index]);
      expect(harsher.severity).toBe(index);
      expect(harsher.intensity).toBeGreaterThan(milder.intensity);
      expect(harsher.rainRate).toBeGreaterThanOrEqual(milder.rainRate);
      expect(harsher.windMultiplier).toBeGreaterThan(milder.windMultiplier);
      expect(harsher.wetnessTarget).toBeGreaterThanOrEqual(milder.wetnessTarget);
      expect(harsher.fogDensityMultiplier).toBeGreaterThan(milder.fogDensityMultiplier);
      expect(harsher.skyDarkenAmount).toBeGreaterThan(milder.skyDarkenAmount);
    }
  });

  it('keeps every row inside its declared range', () => {
    for (const state of WEATHER_SEVERITY_LADDER) {
      const row = weatherStateRow(state);
      expect(row.state).toBe(state);
      expect(row.intensity).toBeGreaterThanOrEqual(0);
      expect(row.intensity).toBeLessThanOrEqual(1);
      expect(row.rainRate).toBeGreaterThanOrEqual(0);
      expect(row.rainRate).toBeLessThanOrEqual(1);
      expect(row.wetnessTarget).toBeGreaterThanOrEqual(0);
      expect(row.wetnessTarget).toBeLessThanOrEqual(1);
      expect(row.skyDarkenAmount).toBeGreaterThanOrEqual(0);
      // Darkening past this is night, not weather.
      expect(row.skyDarkenAmount).toBeLessThanOrEqual(0.65);
      // Weather adds wind; it never stills it.
      expect(row.windMultiplier).toBeGreaterThanOrEqual(1);
      expect(row.fogDensityMultiplier).toBeGreaterThanOrEqual(1);
      const [low, high] = row.durationSecondsRange;
      expect(high).toBeGreaterThan(low);
      expect(low).toBeGreaterThan(0);
    }
  });

  it('keeps the HEAVY states short - readability budget, not taste', () => {
    let heavyRows = 0;
    for (const state of WEATHER_SEVERITY_LADDER) {
      const row = weatherStateRow(state);
      if (row.rainRate < WEATHER_HEAVY_RAIN_RATE) continue;
      heavyRows += 1;
      expect(row.durationSecondsRange[1], state).toBeLessThanOrEqual(WEATHER_HEAVY_MAX_DURATION_SECONDS);
      // And strictly shorter than the mild states they interrupt.
      expect(row.durationSecondsRange[1], state).toBeLessThan(weatherStateRow('clear').durationSecondsRange[0]);
    }
    expect(heavyRows).toBeGreaterThanOrEqual(2);
    expect(weatherStateRow('storm').durationSecondsRange[1])
      .toBeLessThan(weatherStateRow('heavy-rain').durationSecondsRange[1]);
  });

  it('leaves the ground wet after the rain stops, then dries it', () => {
    // Wetness must outlive the shower or rain has no consequence at all. Seeds
    // are scanned rather than hardcoded: a dry match is a legitimate outcome
    // (see the distribution test below), and pinning one lucky seed would make
    // this test a hostage to any future tuning of the ladder weights.
    const arenaId: ArenaId = 'farcrysis';
    let rainyMatches = 0;
    let dryingSamples = 0;
    let wetAfterRainSeen = false;
    for (let seed = 0; seed < 24; seed += 1) {
      let peak = 0;
      let previous = sampleWeather(arenaId, seed, 0);
      for (let elapsed = 0.5; elapsed <= 900; elapsed += 0.5) {
        const current = sampleWeather(arenaId, seed, elapsed);
        peak = Math.max(peak, current.wetness);
        if (!current.raining && current.wetness > 0.3) wetAfterRainSeen = true;
        if (!current.raining && !previous.raining && previous.wetness > 0.02) {
          // Ground under a dry sky may only ever get drier. A rise here would
          // mean wetness was tracking something other than the rain.
          expect(current.wetness, `${seed}@${elapsed}`).toBeLessThanOrEqual(previous.wetness + 1e-9);
          if (current.wetness < previous.wetness - 1e-6) dryingSamples += 1;
        }
        previous = current;
      }
      if (peak > 0.3) rainyMatches += 1;
    }
    expect(rainyMatches).toBeGreaterThan(8);
    // Wetness must actually persist past the shower, not snap back to dry.
    expect(wetAfterRainSeen).toBe(true);
    expect(dryingSamples).toBeGreaterThan(500);
  });

  it('rains often enough to be a feature and rarely enough to be weather', () => {
    // The authoring budget, pinned mechanically. Too rare and most players
    // never see the system at all; too common and every match is a downpour.
    for (const arenaId of ARENA_IDS) {
      if (!arenaCanRain(arenaId)) continue;
      let rainyMatches = 0;
      let rainySamples = 0;
      let totalSamples = 0;
      for (let seed = 0; seed < 40; seed += 1) {
        let rained = false;
        for (let elapsed = 0; elapsed <= WEATHER_MATCH_HORIZON_SECONDS; elapsed += 2) {
          totalSamples += 1;
          if (sampleWeather(arenaId, seed, elapsed).raining) {
            rained = true;
            rainySamples += 1;
          }
        }
        if (rained) rainyMatches += 1;
      }
      expect(rainyMatches / 40, arenaId).toBeGreaterThan(0.5);
      const rainyFraction = rainySamples / totalSamples;
      expect(rainyFraction, arenaId).toBeGreaterThan(0.1);
      expect(rainyFraction, arenaId).toBeLessThan(0.45);
    }
  });

  it('keeps every sample inside its bounds for every arena and seed', () => {
    for (const arenaId of ARENA_IDS) {
      for (const seed of SEEDS) {
        for (let elapsed = 0; elapsed <= 900; elapsed += 7) {
          const sample = sampleWeather(arenaId, seed, elapsed);
          expect(sample.wetness, `${arenaId}/${seed}`).toBeGreaterThanOrEqual(0);
          expect(sample.wetness, `${arenaId}/${seed}`).toBeLessThanOrEqual(1);
          expect(sample.rainRate, `${arenaId}/${seed}`).toBeGreaterThanOrEqual(0);
          expect(sample.rainRate, `${arenaId}/${seed}`).toBeLessThanOrEqual(1);
          expect(sample.intensity, `${arenaId}/${seed}`).toBeGreaterThanOrEqual(0);
          expect(sample.intensity, `${arenaId}/${seed}`).toBeLessThanOrEqual(1);
          expect(sample.windMultiplier, `${arenaId}/${seed}`).toBeGreaterThanOrEqual(1);
          expect(sample.transitionBlend, `${arenaId}/${seed}`).toBeGreaterThanOrEqual(0);
          expect(sample.transitionBlend, `${arenaId}/${seed}`).toBeLessThanOrEqual(1);
          expect(sample.raining, `${arenaId}/${seed}`).toBe(sample.rainRate > 0.001);
        }
      }
    }
  });

  it('degrades to a valid sample rather than hanging on a bad elapsed time', () => {
    for (const elapsed of [Number.NaN, Number.NEGATIVE_INFINITY, -500, 1e12]) {
      const sample = sampleWeather('high-seas', 2, elapsed);
      expect(Number.isFinite(sample.wetness)).toBe(true);
      expect(Number.isFinite(sample.rainRate)).toBe(true);
      expect(WEATHER_SEVERITY_LADDER).toContain(sample.state);
    }
  });

  it('offers a settled-clear sample for bypassed and preview scenes', () => {
    const clear = clearWeatherSample('high-seas');
    expect(clear.state).toBe('clear');
    expect(clear.raining).toBe(false);
    expect(clear.rainRate).toBe(0);
    expect(clear.wetness).toBe(0);
    expect(clear.transitionBlend).toBe(1);
    expect(clear.windMultiplier).toBe(WEATHER_STATE_TABLE.clear.windMultiplier);
  });
});

describe('the player weather ceiling', () => {
  it('never shows MORE weather than the match rolled, at any setting', () => {
    // The whole safety property of a per-player weather control in one test: a
    // clamp may only ever subtract. If any choice could raise a derived value
    // above the uncapped sample, the setting would be inventing weather the
    // other peers are not in.
    for (const arenaId of ARENA_IDS) {
      for (const seed of SEEDS) {
        for (let time = 0; time <= 900; time += 17) {
          const full = sampleWeather(arenaId, seed, time, UNCAPPED);
          for (const choice of WEATHER_INTENSITY_CHOICES) {
            const clamped = sampleWeather(arenaId, seed, time, capped(choice));
            const label = arenaId + '/' + seed + '@' + time + '/' + choice;
            expect(clamped.intensity, label).toBeLessThanOrEqual(full.intensity + 1e-9);
            expect(clamped.rainRate, label).toBeLessThanOrEqual(full.rainRate + 1e-9);
            expect(clamped.wetness, label).toBeLessThanOrEqual(full.wetness + 1e-9);
            expect(clamped.skyDarkenAmount, label).toBeLessThanOrEqual(full.skyDarkenAmount + 1e-9);
            expect(clamped.fogDensityMultiplier, label).toBeLessThanOrEqual(full.fogDensityMultiplier + 1e-9);
            expect(clamped.severity, label).toBeLessThanOrEqual(full.severity);
          }
        }
      }
    }
  });

  it('keeps the SIMULATED state identical whatever the local settings say', () => {
    // This is the field a shared-world consumer compares, and it is what makes
    // the clamp a presentation choice rather than a fork in the match.
    for (const arenaId of ARENA_IDS) {
      for (let time = 0; time <= 600; time += 13) {
        const reference = sampleWeather(arenaId, 4_242, time, UNCAPPED).simulatedState;
        for (const choice of WEATHER_INTENSITY_CHOICES) {
          expect(sampleWeather(arenaId, 4_242, time, capped(choice)).simulatedState, arenaId + '@' + time)
            .toBe(reference);
        }
      }
    }
  });

  it('never presents a state the arena did not author', () => {
    for (const arenaId of ARENA_IDS) {
      const available = weatherAvailability(arenaId);
      for (const choice of WEATHER_INTENSITY_CHOICES) {
        for (let time = 0; time <= 600; time += 7) {
          const sample = sampleWeather(arenaId, 11, time, capped(choice));
          expect(available, arenaId + '/' + choice).toContain(sample.state);
          expect(available, arenaId + '/' + choice).toContain(sample.previousState);
        }
      }
    }
  });

  it('OFF is genuinely off - no rain, no darkening, no flashes, ever', () => {
    const off = capped('off');
    for (const arenaId of ARENA_IDS) {
      for (const seed of SEEDS) {
        for (let time = 0; time <= 900; time += 11) {
          const sample = sampleWeather(arenaId, seed, time, off);
          const label = arenaId + '/' + seed + '@' + time;
          expect(sample.rainRate, label).toBe(0);
          expect(sample.raining, label).toBe(false);
          expect(sample.wetness, label).toBe(0);
          expect(sample.skyDarkenAmount, label).toBe(0);
          expect(sample.lightning.flash, label).toBe(0);
        }
      }
    }
  });

  it('scales wind exactly, and stills it completely at zero', () => {
    const arenaId: ArenaId = 'high-seas';
    for (let time = 0; time <= 400; time += 9) {
      const base = sampleWeather(arenaId, 7, time, UNCAPPED).windMultiplier;
      expect(sampleWeather(arenaId, 7, time, resolveWeatherPresentation({ windStrength: 1.6 })).windMultiplier)
        .toBeCloseTo(base * 1.6, 9);
      expect(sampleWeather(arenaId, 7, time, resolveWeatherPresentation({ windStrength: 0 })).windMultiplier).toBe(0);
    }
  });

  it('applies the ceiling to the ?weather= override too', () => {
    // Otherwise the one route built for LOOKING at weather would be showing a
    // configuration no player can select.
    expect(forcedWeatherSample('high-seas', 'storm', capped('light')).state).toBe('overcast');
    expect(forcedWeatherSample('high-seas', 'storm', capped('off')).state).toBe('clear');
    expect(forcedWeatherSample('high-seas', 'storm', UNCAPPED).state).toBe('storm');
    // And the indoor arena is still a gameplay fact, not a preference.
    expect(forcedWeatherSample('gun-range', 'storm', UNCAPPED).state).toBe('clear');
  });

  it('reads the published latch when a caller does not pass one', () => {
    // The production path: legacy-main calls sampleWeather with three arguments
    // and still gets the player's setting.
    publishWeatherPresentation(capped('off'));
    expect(sampleWeather('high-seas', 3, 300).rainRate).toBe(0);
    publishWeatherPresentation(resolveWeatherPresentation({}));
    expect(sampleWeather('high-seas', 3, 300)).toEqual(sampleWeather('high-seas', 3, 300, UNCAPPED));
  });
});

describe('lightning', () => {
  it('passes its own combat-safety assertion', () => {
    expect(() => assertLightningCombatSafety()).not.toThrow();
  });

  it('keeps the flash envelope inside 0..1 and dark outside the flash', () => {
    let peak = 0;
    for (let age = -0.2; age <= 1; age += 0.001) {
      const value = lightningFlashEnvelope(age);
      expect(value, 'age ' + age.toFixed(3)).toBeGreaterThanOrEqual(0);
      expect(value, 'age ' + age.toFixed(3)).toBeLessThanOrEqual(1);
      if (age < 0 || age >= WEATHER_LIGHTNING.flashSeconds) expect(value, 'age ' + age.toFixed(3)).toBe(0);
      peak = Math.max(peak, value);
    }
    // A ceiling the signal never approaches is a mistuned ceiling.
    expect(peak).toBeGreaterThan(0.9);
    // Two flashes, not one: the leader and the return stroke are separate peaks.
    const leaderPeak = lightningFlashEnvelope(0.001);
    const trough = lightningFlashEnvelope(0.05);
    const strokePeak = lightningFlashEnvelope(0.057);
    expect(trough).toBeLessThan(leaderPeak);
    expect(strokePeak).toBeGreaterThan(trough);
  });

  it('gives two peers the same strikes with no traffic', () => {
    for (let time = 0; time <= 600; time += 0.37) {
      const host = sampleWeatherLightning('high-seas', 0x51ce_2f01, time, 1, true);
      const guest = sampleWeatherLightning('high-seas', 0x51ce_2f01, time, 1, true);
      expect(guest.flash, '@' + time).toBe(host.flash);
      expect(guest.strikeIndex, '@' + time).toBe(host.strikeIndex);
      expect(guest.distanceM, '@' + time).toBe(host.distanceM);
    }
  });

  it('never exceeds the flash ceiling, at any rain rate or distance', () => {
    for (const seed of SEEDS) {
      for (let time = 0; time <= 300; time += 0.05) {
        const strike = sampleWeatherLightning('farcrysis', seed, time, 1, true);
        expect(strike.flash, seed + '@' + time).toBeLessThanOrEqual(WEATHER_LIGHTNING.maxFlash);
        expect(strike.flash, seed + '@' + time).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('only fires in the heavy half of the ladder', () => {
    // Lightning in drizzle is the single fastest way to make weather read as a
    // filter rather than as weather.
    for (let time = 0; time <= 300; time += 0.11) {
      for (const rate of [0, 0.2, 0.34, WEATHER_LIGHTNING.rainRateFloor]) {
        expect(sampleWeatherLightning('high-seas', 9, time, rate, true).flash, 'rate ' + rate).toBe(0);
      }
    }
    let lit = 0;
    for (let time = 0; time <= 300; time += 0.05) {
      if (sampleWeatherLightning('high-seas', 9, time, 1, true).flash > 0) lit += 1;
    }
    expect(lit).toBeGreaterThan(0);
  });

  it('is silent when the player turns it off', () => {
    for (let time = 0; time <= 300; time += 0.05) {
      expect(sampleWeatherLightning('high-seas', 9, time, 1, false).flash, '@' + time).toBe(0);
    }
  });

  it('exposes thunder timing an audio consumer can act on', () => {
    // The contract a consumer relies on: one id per strike, a delay that is the
    // real speed-of-sound delay for the reported distance, and a countdown that
    // crosses zero exactly once per strike.
    let previousIndex = -1;
    let crossings = 0;
    let previousCountdown = Number.POSITIVE_INFINITY;
    for (let time = 0; time <= 120; time += 1 / 60) {
      const strike = sampleWeatherLightning('rustworks-1v1', 5, time, 1, true);
      if (strike.strikeIndex < 0) continue;
      expect(strike.strikeIndex, '@' + time).toBeGreaterThanOrEqual(previousIndex);
      expect(strike.thunderDelaySeconds, '@' + time)
        .toBeCloseTo(strike.distanceM / WEATHER_LIGHTNING.soundSpeedMps, 9);
      expect(strike.distanceM, '@' + time).toBeGreaterThanOrEqual(WEATHER_LIGHTNING.minDistanceM);
      expect(strike.distanceM, '@' + time).toBeLessThanOrEqual(WEATHER_LIGHTNING.maxDistanceM);
      if (strike.strikeIndex !== previousIndex) {
        previousIndex = strike.strikeIndex;
        previousCountdown = strike.thunderInSeconds;
        continue;
      }
      if (previousCountdown > 0 && strike.thunderInSeconds <= 0) crossings += 1;
      previousCountdown = strike.thunderInSeconds;
    }
    expect(crossings).toBeGreaterThan(5);
  });

  it('spaces strikes out instead of strobing', () => {
    const times: number[] = [];
    let previousIndex = -1;
    for (let time = 0; time <= 900; time += 0.01) {
      const strike = sampleWeatherLightning('high-seas', 0x9e37, time, 1, true);
      if (strike.strikeIndex !== previousIndex && strike.strikeIndex >= 0) {
        previousIndex = strike.strikeIndex;
        times.push(time - strike.sinceStrikeSeconds);
      }
    }
    expect(times.length).toBeGreaterThan(80);
    for (let index = 1; index < times.length; index += 1) {
      // Consecutive strikes can never land closer than the slot arithmetic
      // allows, so a flash cannot become a strobe.
      const gap = times[index] - times[index - 1];
      expect(gap, 'strike ' + index).toBeGreaterThan(
        WEATHER_LIGHTNING.strikeIntervalSeconds * (1 - WEATHER_LIGHTNING.slotJitter) - 0.02,
      );
    }
  });
});
