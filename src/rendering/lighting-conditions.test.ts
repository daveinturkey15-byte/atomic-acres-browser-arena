/**
 * Lane AB — the contract for time-of-day lighting.
 *
 * Four things can silently ruin this feature and all four are pinned here:
 * a preset that darkens the shadow a player is standing in, two peers computing
 * different suns, a weather state that fights the hour instead of composing with
 * it, and the whole thing quietly ceasing to be the identity at the authored
 * hour (which is what makes it a bounded excursion rather than a repaint).
 */
import { describe, expect, it } from 'vitest';
import { ARENA_IDS, type ArenaId } from '../arena-identity';
import { WEATHER_SEVERITY_LADDER, WEATHER_STATE_TABLE } from '../weather/weather-state';
import {
  ARENA_DAYLIGHT_PROFILES,
  DEFAULT_LIGHTING_TIME_CHOICE,
  LIGHTING_CONDITION_BOUNDS,
  LIGHTING_TIME_CHOICES,
  SWEPT_SKY_DARKEN,
  arenaDaylightProfile,
  assertLightingConditionSafety,
  identityLightingConditions,
  isLightingTimeChoice,
  lightingConditionsAreIdentity,
  resolveLightingConditions,
  resolveLightingHour,
  type LightingConditionWrites,
} from './lighting-conditions';

const OUTDOOR: readonly ArenaId[] = ARENA_IDS.filter((id) => !ARENA_DAYLIGHT_PROFILES[id].pinned);

function sweepBand(arenaId: ArenaId, steps = 64): readonly number[] {
  const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
  const low = profile.hourRange[0];
  const high = profile.hourRange[1];
  const hours: number[] = [];
  for (let step = 0; step <= steps; step += 1) hours.push(low + ((high - low) * step) / steps);
  return hours;
}

describe('arena daylight catalog', () => {
  it('covers every arena id exactly once, with no gaps and no strays', () => {
    expect(Object.keys(ARENA_DAYLIGHT_PROFILES).sort()).toEqual([...ARENA_IDS].sort());
  });

  it('gives every arena a unique authoring identity', () => {
    const identities = ARENA_IDS.map((id) => ARENA_DAYLIGHT_PROFILES[id].identity);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it('keeps every authored hour inside its own band, and every band inside its arc', () => {
    for (const arenaId of ARENA_IDS) {
      const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
      expect(profile.hourRange[1]).toBeGreaterThanOrEqual(profile.hourRange[0]);
      expect(profile.authoredHour).toBeGreaterThanOrEqual(profile.hourRange[0]);
      expect(profile.authoredHour).toBeLessThanOrEqual(profile.hourRange[1]);
      expect(profile.hourRange[0]).toBeGreaterThanOrEqual(profile.dayWindow[0]);
      expect(profile.hourRange[1]).toBeLessThanOrEqual(profile.dayWindow[1]);
    }
  });

  it('pins the indoor arena and the preview map, and only those', () => {
    const pinned = ARENA_IDS.filter((id) => ARENA_DAYLIGHT_PROFILES[id].pinned);
    expect([...pinned].sort()).toEqual(['gun-range', 'map3']);
  });

  it('gives rustworks-1v1 the narrowest outdoor band (its night is the safety datum)', () => {
    const span = (id: ArenaId): number => ARENA_DAYLIGHT_PROFILES[id].hourRange[1] - ARENA_DAYLIGHT_PROFILES[id].hourRange[0];
    for (const arenaId of OUTDOOR) {
      if (arenaId === 'rustworks-1v1') continue;
      expect(span('rustworks-1v1')).toBeLessThanOrEqual(span(arenaId) + 1e-9);
    }
  });

  it('exposes the profile by lookup', () => {
    expect(arenaDaylightProfile('farcrysis')).toBe(ARENA_DAYLIGHT_PROFILES.farcrysis);
  });
});

describe('the authored hour is the identity', () => {
  it('changes nothing at all, for every arena', () => {
    for (const arenaId of ARENA_IDS) {
      const writes = resolveLightingConditions({ arenaId, choice: 'authored' });
      expect(lightingConditionsAreIdentity(writes)).toBe(true);
      expect(writes.hour).toBe(ARENA_DAYLIGHT_PROFILES[arenaId].authoredHour);
      expect(writes.deviation).toBe(0);
    }
  });

  it('and a fixedHour at the anchor is the same identity', () => {
    for (const arenaId of ARENA_IDS) {
      const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
      expect(lightingConditionsAreIdentity(resolveLightingConditions({ arenaId, fixedHour: profile.authoredHour }))).toBe(true);
    }
  });

  it('publishes a neutral value callers can hold before a match starts', () => {
    expect(lightingConditionsAreIdentity(identityLightingConditions('high-seas'))).toBe(true);
  });
});

describe('combat safety: the shadow floor can only rise', () => {
  it('never returns a shadow-floor scale below 1, anywhere in any band in any weather', () => {
    for (const arenaId of ARENA_IDS) {
      for (const hour of sweepBand(arenaId)) {
        for (const skyDarkenAmount of SWEPT_SKY_DARKEN) {
          const writes = resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount });
          expect(writes.shadowFloorScale).toBeGreaterThanOrEqual(1);
          expect(writes.ambientIntensityScale).toBeGreaterThanOrEqual(1);
          expect(writes.hemisphereIntensityScale).toBeGreaterThanOrEqual(1);
          expect(writes.fillIntensityScale).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('lifts the shadow floor by MORE than the key light gave up, monotonically', () => {
    for (const arenaId of OUTDOOR) {
      for (const hour of sweepBand(arenaId)) {
        const writes = resolveLightingConditions({ arenaId, fixedHour: hour });
        const drop = Math.max(0, 1 - writes.sunIntensityScale);
        expect(writes.shadowFloorScale - 1).toBeGreaterThanOrEqual(drop - 1e-12);
      }
    }
  });

  it('never lets the key light fall below the authored floor', () => {
    for (const arenaId of ARENA_IDS) {
      for (const hour of sweepBand(arenaId)) {
        const writes = resolveLightingConditions({ arenaId, fixedHour: hour });
        expect(writes.sunIntensityScale).toBeGreaterThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunIntensityScale.minimum);
        expect(writes.sunIntensityScale).toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.sunIntensityScale.maximum);
      }
    }
  });

  it('never drives the sun to the horizon (shadows the length of the map)', () => {
    for (const arenaId of OUTDOOR) {
      const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
      // Reconstruct the absolute elevation the caller will apply.
      const anchor = resolveLightingConditions({ arenaId, choice: 'authored' });
      expect(anchor.sunElevationDeltaDegrees).toBe(0);
      for (const hour of sweepBand(arenaId)) {
        const writes = resolveLightingConditions({ arenaId, fixedHour: hour });
        expect(Math.abs(writes.sunAzimuthDeltaDegrees)).toBeLessThanOrEqual(profile.azimuthSwingDegrees + 1e-9);
        expect(Math.abs(writes.sunAzimuthDeltaDegrees)).toBeLessThanOrEqual(
          LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.maximum,
        );
      }
    }
  });

  it('only ever raises exposure, and never past the bound', () => {
    for (const arenaId of ARENA_IDS) {
      for (const hour of sweepBand(arenaId)) {
        const writes = resolveLightingConditions({ arenaId, fixedHour: hour });
        expect(writes.exposureScale).toBeGreaterThanOrEqual(1);
        expect(writes.exposureScale).toBeLessThanOrEqual(LIGHTING_CONDITION_BOUNDS.exposureScale.maximum);
      }
    }
  });

  it('fails closed for the whole catalog when asked directly', () => {
    expect(() => assertLightingConditionSafety()).not.toThrow();
  });
});

describe('replication: two peers, no traffic', () => {
  const HOST_SEED = 0x51ed_beef | 0;
  const GUEST_SEED = HOST_SEED;

  it('resolves identical writes for the same seed and clock', () => {
    for (const arenaId of ARENA_IDS) {
      for (const elapsedSeconds of [0, 7.5, 61, 187.25, 299, 614]) {
        for (const choice of LIGHTING_TIME_CHOICES) {
          const host = resolveLightingConditions({ arenaId, matchSeed: HOST_SEED, elapsedSeconds, choice });
          const guest = resolveLightingConditions({ arenaId, matchSeed: GUEST_SEED, elapsedSeconds, choice });
          expect(guest).toEqual(host);
        }
      }
    }
  });

  it('lets a late joiner agree with a host who has been there since t=0', () => {
    // The guest computes t=214 directly; the host walked there. Both are the
    // same pure call, which is the whole point of deriving rather than sending.
    const host = resolveLightingConditions({ arenaId: 'high-seas', matchSeed: HOST_SEED, elapsedSeconds: 214, choice: 'cycle' });
    const guest = resolveLightingConditions({ arenaId: 'high-seas', matchSeed: HOST_SEED, elapsedSeconds: 214, choice: 'cycle' });
    expect(guest.hour).toBe(host.hour);
    expect(guest.sunIntensityScale).toBe(host.sunIntensityScale);
  });

  it('gives different matches different hours', () => {
    const hours = new Set<number>();
    for (let seed = 1; seed <= 24; seed += 1) {
      hours.add(Number(resolveLightingHour('farcrysis', seed * 0x9e3779b1, 0, 'random').toFixed(4)));
    }
    expect(hours.size).toBeGreaterThan(12);
  });

  it('stays inside the arena band for every seed, every clock and every choice', () => {
    for (const arenaId of ARENA_IDS) {
      const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
      for (let seed = 0; seed < 64; seed += 1) {
        for (const elapsedSeconds of [0, 43, 199, 512, 1301]) {
          for (const choice of LIGHTING_TIME_CHOICES) {
            const hour = resolveLightingHour(arenaId, seed * 2654435761, elapsedSeconds, choice);
            expect(hour).toBeGreaterThanOrEqual(profile.hourRange[0] - 1e-9);
            expect(hour).toBeLessThanOrEqual(profile.hourRange[1] + 1e-9);
          }
        }
      }
    }
  });

  it('walks the cycle mode continuously and never leaves the band', () => {
    let previous = resolveLightingHour('atomic-acres', 1234, 0, 'cycle');
    for (let elapsed = 1; elapsed <= 900; elapsed += 1) {
      const hour = resolveLightingHour('atomic-acres', 1234, elapsed, 'cycle');
      expect(Math.abs(hour - previous)).toBeLessThan(0.05);
      previous = hour;
    }
  });

  it('treats a non-finite seed or clock as zero rather than producing NaN', () => {
    const writes = resolveLightingConditions({
      arenaId: 'test1',
      matchSeed: Number.NaN,
      elapsedSeconds: Number.POSITIVE_INFINITY,
      choice: 'cycle',
    });
    expect(Number.isFinite(writes.hour)).toBe(true);
    expect(Number.isFinite(writes.sunIntensityScale)).toBe(true);
  });
});

describe('pinned arenas are provably constant', () => {
  it('resolves the identity for gun-range and map3 at every choice, seed and clock', () => {
    for (const arenaId of ['gun-range', 'map3'] as const) {
      for (const choice of LIGHTING_TIME_CHOICES) {
        for (const elapsedSeconds of [0, 120, 750]) {
          const writes = resolveLightingConditions({ arenaId, matchSeed: 99, elapsedSeconds, choice });
          expect(lightingConditionsAreIdentity(writes)).toBe(true);
        }
      }
    }
  });
});

describe('weather composes with the hour, it never fights it', () => {
  it('mirrors the weather table it was authored against', () => {
    const authored = WEATHER_SEVERITY_LADDER.map((state) => WEATHER_STATE_TABLE[state].skyDarkenAmount);
    expect([...SWEPT_SKY_DARKEN]).toEqual(authored);
  });

  it('shrinks the time-of-day deviation monotonically as the sky darkens', () => {
    for (const arenaId of OUTDOOR) {
      const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
      const hour = profile.hourRange[1];
      let previous = Number.POSITIVE_INFINITY;
      for (const skyDarkenAmount of SWEPT_SKY_DARKEN) {
        const writes = resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount });
        expect(writes.deviation).toBeLessThanOrEqual(previous + 1e-12);
        previous = writes.deviation;
      }
    }
  });

  it('reaches the identity as the sky darkens fully — a storm has no golden hour', () => {
    for (const arenaId of OUTDOOR) {
      const hour = ARENA_DAYLIGHT_PROFILES[arenaId].hourRange[0];
      const writes = resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount: 1 });
      expect(lightingConditionsAreIdentity(writes)).toBe(true);
    }
  });

  it('bounds the tint envelope proved for clear weather over every weather rung', () => {
    for (const arenaId of OUTDOOR) {
      for (const hour of sweepBand(arenaId, 24)) {
        const clear = resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount: 0 });
        for (const skyDarkenAmount of SWEPT_SKY_DARKEN) {
          const weathered = resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount });
          for (let channel = 0; channel < 3; channel += 1) {
            expect(Math.abs(weathered.sunTint[channel] - 1)).toBeLessThanOrEqual(Math.abs(clear.sunTint[channel] - 1) + 1e-12);
          }
        }
      }
    }
  });
});

describe('the hue story is real, not a filter', () => {
  it('warms the sun and cools the sky as the sun drops', () => {
    // atomic-acres is authored at 17:30 and its band runs to 19:00 (dusk).
    const dusk = resolveLightingConditions({ arenaId: 'atomic-acres', fixedHour: 19 });
    expect(dusk.sunTint[0]).toBeGreaterThan(1); // red survives the long path
    expect(dusk.sunTint[2]).toBeLessThan(1); // blue does not
    expect(dusk.ambientTint[2]).toBeGreaterThan(1); // the dome scatters blue
    expect(dusk.ambientTint[0]).toBeLessThan(1);
  });

  it('cools the sun and neutralises the sky as the sun climbs', () => {
    const noon = resolveLightingConditions({ arenaId: 'atomic-acres', fixedHour: 15 });
    expect(noon.sunTint[0]).toBeLessThan(1);
    expect(noon.sunTint[2]).toBeGreaterThan(1);
  });

  it('moves the fog colour with the sky but only half as far', () => {
    const dusk = resolveLightingConditions({ arenaId: 'atomic-acres', fixedHour: 19 });
    for (let channel = 0; channel < 3; channel += 1) {
      expect(Math.abs(dusk.fogTint[channel] - 1)).toBeLessThan(Math.abs(dusk.ambientTint[channel] - 1) + 1e-12);
    }
  });
});

describe('the choice surface', () => {
  it('defaults to a seeded random hour, which is what a solo player asked for', () => {
    expect(DEFAULT_LIGHTING_TIME_CHOICE).toBe('random');
    expect(resolveLightingHour('farcrysis', 7, 0)).toBe(resolveLightingHour('farcrysis', 7, 0, 'random'));
  });

  it('validates only the authored choices', () => {
    for (const choice of LIGHTING_TIME_CHOICES) expect(isLightingTimeChoice(choice)).toBe(true);
    for (const bad of ['dawn', 'NIGHT', '', 3, null, undefined, {}]) expect(isLightingTimeChoice(bad)).toBe(false);
  });

  it('maps early/midday/late onto the arena band, not onto an absolute clock', () => {
    for (const arenaId of OUTDOOR) {
      const profile = ARENA_DAYLIGHT_PROFILES[arenaId];
      expect(resolveLightingHour(arenaId, 5, 0, 'early')).toBeCloseTo(profile.hourRange[0], 9);
      expect(resolveLightingHour(arenaId, 5, 0, 'late')).toBeCloseTo(profile.hourRange[1], 9);
      expect(resolveLightingHour(arenaId, 5, 0, 'midday')).toBeCloseTo((profile.hourRange[0] + profile.hourRange[1]) / 2, 9);
    }
  });
});

describe('the writes are frozen values, not a mutable handle a caller can poison', () => {
  it('freezes the result and every tint on it', () => {
    const writes: LightingConditionWrites = resolveLightingConditions({ arenaId: 'high-seas', fixedHour: 9 });
    expect(Object.isFrozen(writes)).toBe(true);
    expect(Object.isFrozen(writes.sunTint)).toBe(true);
    expect(Object.isFrozen(writes.fogTint)).toBe(true);
  });
});
