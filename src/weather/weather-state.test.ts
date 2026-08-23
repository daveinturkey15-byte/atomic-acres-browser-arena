/**
 * Pass 76 - the zero-traffic weather state machine.
 *
 * The claims being pinned: every peer computes the same sky from the same three
 * numbers, the sky never repeats inside a match, and the indoor arena can never
 * rain no matter what seed it is handed.
 */
import { describe, expect, it } from 'vitest';
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
  type WeatherSample,
} from './weather-state';

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
    for (const arenaId of ARENA_IDS) {
      let previous = sampleWeather(arenaId, 77, 0);
      for (let elapsed = 0.1; elapsed <= 900; elapsed += 0.1) {
        const current = sampleWeather(arenaId, 77, elapsed);
        // A visible pop in any of these reads as a rendering bug, not weather.
        expect(Math.abs(current.intensity - previous.intensity), `${arenaId}@${elapsed}`).toBeLessThan(0.02);
        expect(Math.abs(current.rainRate - previous.rainRate), `${arenaId}@${elapsed}`).toBeLessThan(0.02);
        expect(Math.abs(current.skyDarkenAmount - previous.skyDarkenAmount), `${arenaId}@${elapsed}`).toBeLessThan(0.02);
        expect(Math.abs(current.fogDensityMultiplier - previous.fogDensityMultiplier), `${arenaId}@${elapsed}`).toBeLessThan(0.02);
        expect(Math.abs(current.windMultiplier - previous.windMultiplier), `${arenaId}@${elapsed}`).toBeLessThan(0.02);
        expect(Math.abs(current.wetness - previous.wetness), `${arenaId}@${elapsed}`).toBeLessThan(0.02);
        previous = current;
      }
    }
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
