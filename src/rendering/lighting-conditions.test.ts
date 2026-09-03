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
  lightingConditionWritesEqual,
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

  it('pins the roofed arena and the PREVIEW maps, and only those', () => {
    // Two reasons to pin, and both are deliberate: gun-range has a roof, and
    // map3 / nuketown2 / raid2 are PREVIEW maps whose own lanes own their look
    // while they are being built — a second lane moving their sun underneath
    // them would be a merge conflict rendered on screen. This list is asserted
    // exactly so that promoting a preview out of PREVIEW cannot silently leave
    // it pinned, and so that adding a pin needs a reason written down.
    const pinned = ARENA_IDS.filter((id) => ARENA_DAYLIGHT_PROFILES[id].pinned);
    expect([...pinned].sort()).toEqual(['gun-range', 'map3', 'nuketown2', 'raid2']);
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

describe('the table covers the roster, and says so before it throws', () => {
  it('has a profile for every arena id, including ones added by another lane', () => {
    // This is not a restatement of the Record type. A lane branch typechecks
    // against the roster IT has, so an arena added on the integration line is
    // invisible here until the merge — and what the merge then produced was not
    // a type error but `Cannot read properties of undefined (reading
    // 'hourRange')` thrown out of the import-time safety sweep, which took five
    // unrelated test files down with it (measured 2026-09-03 against the head
    // carrying nuketown2). A missing row must name itself.
    const missing = ARENA_IDS.filter((arenaId) => !ARENA_DAYLIGHT_PROFILES[arenaId]);
    expect(missing, `ARENA_DAYLIGHT_PROFILES has no row for ${missing.join(', ')}. `
      + 'A new arena needs one before it can ship: start it pinned (every choice resolves '
      + 'to the identity, so this lane cannot touch a map another lane is still building) '
      + 'and give it a measured band later — see the preset template in '
      + 'docs/DYNAMIC_LIGHTING_2026-09-03.md.').toEqual([]);
  });

  it('never resolves a profile-less arena into a write', () => {
    for (const arenaId of ARENA_IDS) {
      const writes = resolveLightingConditions({ arenaId, matchSeed: 7, elapsedSeconds: 61 });
      expect(Number.isFinite(writes.hour)).toBe(true);
      expect(Number.isFinite(writes.sunIntensityScale)).toBe(true);
    }
  });
});

describe('pinned arenas are provably constant', () => {
  it('resolves the identity for gun-range and map3 at every choice, seed and clock', () => {
    for (const arenaId of ['gun-range', 'map3', 'nuketown2'] as const) {
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

/**
 * THE BAND-EVIDENCE CONTRACT.
 *
 * This suite exists because the model's arithmetic guarantee held perfectly on
 * a frame that failed the pixel gate. `shadowFloorScale >= 1` says every shaded
 * pixel is at least as bright as the shipped arena, and it was: on Nuke Town at
 * 19:00 the fifth-percentile luma went UP three steps. The shaded AREA still
 * grew 4.21 points, because a lower sun casts longer shadows — and area is what
 * a defender hides in. Brightness and area are different claims, and only a
 * capture can settle the second one.
 *
 * So each band end is measured by `scripts/qa/scan-lane-ab-band-readability.mjs`
 * and the result is committed as evidence. These tests pin the shipped bands
 * against that file, which makes widening a band impossible without re-running
 * the scan that justifies it — the enforcement the two rejected model-level
 * fixes did not have.
 */
describe('band ends are the measured safe interval, not a chosen one', () => {
  /**
   * Read straight out of the committed scans' own `scans[].safeBand`, clear
   * weather — the rung that binds, since every weather only pulls the excursion
   * back toward the identity. Update these ONLY by re-running the scan and
   * copying its output.
   *
   *   band-readability-scan.json              atomic-acres, skyline-terminal, test1, test2
   *   band-readability-scan-2.json            farcrysis, rustworks-1v1, skyline-terminal (both weathers)
   *   band-readability-scan-3-high-seas.json  high-seas (both weathers)
   *
   * EVERY UNPINNED ARENA IS NOW HERE, which it was not for one pass: three
   * bands rested on the three-point capture sweep alone, and this lane had
   * already proved that instrument can be wrong in both directions — it
   * refuted a Raid finding on a re-run, and it raised a farcrysis finding of
   * +3.96 points that thirteen paired scan samples then measured at +0.28.
   */
  const MEASURED_SAFE_BAND: Record<ArenaId, readonly [number, number] | null> = {
    'atomic-acres': [15, 18.2],
    'skyline-terminal': [6.8, 10.5],
    'rustworks-1v1': [20, 22],
    farcrysis: [9, 17],
    'high-seas': [7.5, 19],
    test1: [9.8, 13],
    test2: [16, 18.5],
    // PINNED arenas resolve to the identity at every hour, so there is no band
    // to measure and no scan to run until their lane unpins them. `null` is the
    // deliberate value; a MISSING key fails the coverage case below, which is
    // how a newly added arena is forced to declare one or the other.
    'gun-range': null,
    map3: null,
    nuketown2: null,
    raid2: null,
  };

  it('never plays an hour the scan measured as unsafe', () => {
    for (const [arenaId, safeBand] of Object.entries(MEASURED_SAFE_BAND) as [ArenaId, readonly [number, number] | null][]) {
      if (safeBand === null) continue;
      const { hourRange } = ARENA_DAYLIGHT_PROFILES[arenaId];
      expect(hourRange[0]).toBeGreaterThanOrEqual(safeBand[0]);
      expect(hourRange[1]).toBeLessThanOrEqual(safeBand[1]);
    }
  });

  it('has a scanned band for every unpinned arena, and says so for the pinned ones', () => {
    // The gap this closes: for one pass, rustworks-1v1, farcrysis and high-seas
    // simply had no row here and nothing said so. A missing row read exactly
    // like a scanned one.
    for (const arenaId of ARENA_IDS) {
      expect(Object.prototype.hasOwnProperty.call(MEASURED_SAFE_BAND, arenaId)).toBe(true);
      const pinned = ARENA_DAYLIGHT_PROFILES[arenaId].pinned;
      if (pinned) expect(MEASURED_SAFE_BAND[arenaId]).toBeNull();
      else expect(MEASURED_SAFE_BAND[arenaId]).not.toBeNull();
    }
  });

  it('reaches every hour a match can resolve, in every mode', () => {
    // The band is the safety claim, so the claim is only worth anything if no
    // mode can leave it. `cycle` walks it, `random` samples it, and both are
    // swept here rather than argued about.
    for (const arenaId of ARENA_IDS) {
      const { hourRange } = ARENA_DAYLIGHT_PROFILES[arenaId];
      const low = Math.min(hourRange[0], hourRange[1]);
      const high = Math.max(hourRange[0], hourRange[1]);
      for (const choice of LIGHTING_TIME_CHOICES) {
        for (let seed = 0; seed < 24; seed += 1) {
          for (const elapsedSeconds of [0, 37, 121, 300, 899, 3_600]) {
            const hour = resolveLightingHour(arenaId, seed, elapsedSeconds, choice);
            expect(hour).toBeGreaterThanOrEqual(low - 1e-9);
            expect(hour).toBeLessThanOrEqual(high + 1e-9);
          }
        }
      }
    }
  });

  it('keeps the authored hour inside the narrowed bands, so the identity is still reachable', () => {
    // Narrowing a band around a measurement could easily have cut the anchor
    // out of it, which would make `authored` an hour the arena cannot play and
    // silently end the A/B this whole feature rests on.
    for (const arenaId of ARENA_IDS) {
      const { hourRange, authoredHour } = ARENA_DAYLIGHT_PROFILES[arenaId];
      expect(authoredHour).toBeGreaterThanOrEqual(Math.min(hourRange[0], hourRange[1]));
      expect(authoredHour).toBeLessThanOrEqual(Math.max(hourRange[0], hourRange[1]));
      expect(lightingConditionsAreIdentity(identityLightingConditions(arenaId))).toBe(true);
    }
  });

  it('still gives every unpinned arena a visible excursion after the narrowing', () => {
    // A band narrowed until it is safe AND until nothing happens is not a fix,
    // it is a silent revert, so the floor here is what a PLAYER can see rather
    // than a round number: 1.04 on the key light is about five 8-bit steps on a
    // mid-grey surface, comfortably above dithering and above the capture
    // harness's own noise (the control pairs in the sweep report run 0.00-0.06
    // points on every arena whose review frame holds still).
    //
    // Firing Range sits nearest this floor and that is a fact about the map, not
    // slack in the test: its 10:00-13:00 band straddles the arc's peak, so both
    // ends of it are high sun, and the low morning hours that would give it a
    // real swing are exactly the ones the scan measured as unsafe (+4.09 points
    // at 09:00). A flat range overlooked by a tower cannot have both.
    const excursions: Partial<Record<ArenaId, number>> = {};
    for (const arenaId of OUTDOOR) {
      const scales = sweepBand(arenaId, 48).map((hour) =>
        resolveLightingConditions({ arenaId, fixedHour: hour }).sunIntensityScale);
      excursions[arenaId] = Math.max(...scales) / Math.min(...scales);
      expect(excursions[arenaId]).toBeGreaterThan(1.04);
    }
    // And the excursion must survive the arena's heaviest weather too, or the
    // feature quietly stops existing whenever it rains.
    for (const arenaId of OUTDOOR) {
      const scales = sweepBand(arenaId, 48).map((hour) =>
        resolveLightingConditions({ arenaId, fixedHour: hour, skyDarkenAmount: 0.45 }).sunIntensityScale);
      expect(Math.max(...scales) / Math.min(...scales)).toBeGreaterThan(1.02);
    }
  });
});

/**
 * THE GATE THE RUNTIME USES, tested where it is pure.
 *
 * The shipped runtime used to skip its uniform write whenever the resolved HOUR
 * had not moved. `skyDarkenAmount` is the model's second input and never enters
 * `hour`, so at a fixed hour every weather-driven write was resolved and thrown
 * away -- in `fixed` and in `random`, and `random` is the default. Every model
 * test still passed, because the model was never wrong. What follows is the
 * property the runtime now gates on: two records are the same WRITE only when
 * every term that reaches a light is the same.
 */
describe('the uniform-write gate distinguishes exactly what reaches a light', () => {
  it('says a weather change at a FIXED HOUR is a different write', () => {
    // This is the blocker, stated as a test. If it ever passes with equal
    // records again, the runtime is discarding weather writes once more.
    for (const arenaId of OUTDOOR) {
      const fixedHour = ARENA_DAYLIGHT_PROFILES[arenaId].hourRange[1];
      const clear = resolveLightingConditions({ arenaId, fixedHour, skyDarkenAmount: 0 });
      for (const skyDarkenAmount of SWEPT_SKY_DARKEN.filter((rung) => rung > 0)) {
        const wet = resolveLightingConditions({ arenaId, fixedHour, skyDarkenAmount });
        expect(wet.hour).toBe(clear.hour);
        expect(lightingConditionWritesEqual(clear, wet)).toBe(false);
      }
    }
  });

  it('says identical inputs are the same write, so a steady frame writes nothing', () => {
    for (const arenaId of ARENA_IDS) {
      for (const choice of LIGHTING_TIME_CHOICES) {
        const a = resolveLightingConditions({ arenaId, matchSeed: 3, elapsedSeconds: 42, choice, skyDarkenAmount: 0.3 });
        const b = resolveLightingConditions({ arenaId, matchSeed: 3, elapsedSeconds: 42, choice, skyDarkenAmount: 0.3 });
        expect(lightingConditionWritesEqual(a, b)).toBe(true);
      }
    }
  });

  it('never calls two arenas the same write, so an arena change always re-anchors', () => {
    const left = resolveLightingConditions({ arenaId: 'atomic-acres', choice: 'authored' });
    const right = resolveLightingConditions({ arenaId: 'skyline-terminal', choice: 'authored' });
    // Both are the identity; the arena still differs, and the lights behind them
    // carry different authored values.
    expect(lightingConditionsAreIdentity(left) && lightingConditionsAreIdentity(right)).toBe(true);
    expect(lightingConditionWritesEqual(left, right)).toBe(false);
  });

  it('treats a missing record as "not equal", so the first write of a match always lands', () => {
    const writes = resolveLightingConditions({ arenaId: 'high-seas', choice: 'late' });
    expect(lightingConditionWritesEqual(writes, null)).toBe(false);
    expect(lightingConditionWritesEqual(null, writes)).toBe(false);
    expect(lightingConditionWritesEqual(null, null)).toBe(false);
  });

  it('sees an hour move on a PINNED arena as no write at all', () => {
    // Pinned arenas resolve to the identity at every hour, so the gate must
    // suppress the write rather than repaint the same numbers every frame.
    for (const arenaId of ARENA_IDS.filter((id) => ARENA_DAYLIGHT_PROFILES[id].pinned)) {
      const early = resolveLightingConditions({ arenaId, choice: 'early' });
      const late = resolveLightingConditions({ arenaId, choice: 'late' });
      expect(lightingConditionWritesEqual(early, late)).toBe(true);
    }
  });

  it('resolves the smallest real weather step to a WRITE, not to float noise', () => {
    // One 1/256th rung of skyDarkenAmount is the finest step the runtime gate
    // can be asked about; anything below its own epsilon would be suppressed.
    const arenaId = 'atomic-acres';
    const fixedHour = ARENA_DAYLIGHT_PROFILES[arenaId].hourRange[1];
    const a = resolveLightingConditions({ arenaId, fixedHour, skyDarkenAmount: 0.25 });
    const b = resolveLightingConditions({ arenaId, fixedHour, skyDarkenAmount: 0.25 + 1 / 256 });
    expect(lightingConditionWritesEqual(a, b)).toBe(false);
  });
});
