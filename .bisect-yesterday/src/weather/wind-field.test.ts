/**
 * Pass 76 - the shared wind field.
 *
 * Two properties carry this module and both are mechanical: every peer must
 * compute the same wind with no traffic, and the gust stack must never repeat
 * inside a match. Everything else here guards the authoring.
 */
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import {
  WIND_GUST_BANDS,
  WIND_GUST_PERIOD_RADICANDS,
  WIND_PROFILES,
  calmWind,
  createWindField,
  sampleWind,
  windPeakSpeed,
  windProfile,
} from './wind-field';

const MATCH_HORIZON_SECONDS = 900;

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** True when a/b reduces to (p/q)^2 - i.e. when sqrt(a)/sqrt(b) is rational. */
function ratioIsPerfectSquare(a: number, b: number): boolean {
  const divisor = greatestCommonDivisor(a, b);
  const left = a / divisor;
  const right = b / divisor;
  const rootLeft = Math.round(Math.sqrt(left));
  const rootRight = Math.round(Math.sqrt(right));
  return rootLeft * rootLeft === left && rootRight * rootRight === right;
}

describe('wind field determinism', () => {
  it('gives two independently created fields byte-identical wind - no sync needed', () => {
    for (const arenaId of ARENA_IDS) {
      // Two peers. Same arena, same match seed, zero shared state.
      const host = createWindField(arenaId, 0x51ce_2f01);
      const guest = createWindField(arenaId, 0x51ce_2f01);
      expect(host, arenaId).not.toBe(guest);
      for (let time = 0; time < 240; time += 3.7) {
        for (const [x, z] of [[0, 0], [17.5, -8.25], [-31, 44], [120, -120]] as const) {
          const left = sampleWind(host, x, z, time);
          const right = sampleWind(guest, x, z, time);
          expect(right.x, `${arenaId}@${time}`).toBe(left.x);
          expect(right.z, `${arenaId}@${time}`).toBe(left.z);
          expect(right.speed, `${arenaId}@${time}`).toBe(left.speed);
          expect(right.bearingRadians, `${arenaId}@${time}`).toBe(left.bearingRadians);
          expect(right.gust, `${arenaId}@${time}`).toBe(left.gust);
        }
      }
    }
  });

  it('makes the match seed matter, or the seed is decoration', () => {
    const first = createWindField('high-seas', 11);
    const second = createWindField('high-seas', 12);
    let differences = 0;
    for (let time = 0; time < 120; time += 1.3) {
      if (Math.abs(sampleWind(first, 4, 4, time).speed - sampleWind(second, 4, 4, time).speed) > 0.05) differences += 1;
    }
    expect(differences).toBeGreaterThan(60);
  });

  it('gives two arenas on one seed different wind', () => {
    const seas = createWindField('high-seas', 7);
    const jungle = createWindField('farcrysis', 7);
    expect(seas.bandPhases).not.toEqual(jungle.bandPhases);
  });

  it('is a FIELD - the wind differs across the arena, not just across time', () => {
    const field = createWindField('farcrysis', 3);
    const near = sampleWind(field, 0, 0, 60);
    const far = sampleWind(field, 90, -90, 60);
    expect(Math.abs(near.speed - far.speed)).toBeGreaterThan(0.05);
  });
});

describe('wind field never loops', () => {
  it('uses provably incommensurate band periods - no finite common period exists', () => {
    expect(WIND_GUST_BANDS).toHaveLength(WIND_GUST_PERIOD_RADICANDS.length);
    for (let i = 0; i < WIND_GUST_PERIOD_RADICANDS.length; i += 1) {
      const radicand = WIND_GUST_PERIOD_RADICANDS[i];
      const root = Math.round(Math.sqrt(radicand));
      // A perfect-square radicand would make that band's period rational.
      expect(root * root, `radicand ${radicand}`).not.toBe(radicand);
      expect(WIND_GUST_BANDS[i].periodSeconds).toBeCloseTo(Math.sqrt(radicand), 12);
      for (let j = i + 1; j < WIND_GUST_PERIOD_RADICANDS.length; j += 1) {
        expect(
          ratioIsPerfectSquare(radicand, WIND_GUST_PERIOD_RADICANDS[j]),
          `${radicand}:${WIND_GUST_PERIOD_RADICANDS[j]}`,
        ).toBe(false);
      }
    }
  });

  it('has no NEAR-common period either, so it does not even look periodic', () => {
    // Incommensurate is not enough on its own: 6.0 and 6.0001 never share an
    // exact period but visibly beat. Require every small integer multiple pair
    // to stay well apart.
    let closest = Infinity;
    for (let i = 0; i < WIND_GUST_BANDS.length; i += 1) {
      for (let j = i + 1; j < WIND_GUST_BANDS.length; j += 1) {
        for (let p = 1; p <= 12; p += 1) {
          for (let q = 1; q <= 12; q += 1) {
            closest = Math.min(closest, Math.abs(p * WIND_GUST_BANDS[i].periodSeconds - q * WIND_GUST_BANDS[j].periodSeconds));
          }
        }
      }
    }
    expect(closest).toBeGreaterThan(0.3);
  });

  it('never repeats a wind sample at any lag inside a match', () => {
    for (const arenaId of ARENA_IDS) {
      if (WIND_PROFILES[arenaId].gustSpeedMps <= 0) continue;
      const field = createWindField(arenaId, 0x9e37);
      const tolerance = WIND_PROFILES[arenaId].gustSpeedMps * 0.02;
      for (let lag = 2; lag <= MATCH_HORIZON_SECONDS; lag += 7) {
        let maxDeviation = 0;
        for (let time = 0; time < 130; time += 11) {
          maxDeviation = Math.max(
            maxDeviation,
            Math.abs(sampleWind(field, 6, -6, time).speed - sampleWind(field, 6, -6, time + lag).speed),
          );
        }
        // If every probe matched at some lag, the field has that period.
        expect(maxDeviation, `${arenaId} lag ${lag}`).toBeGreaterThan(tolerance);
      }
    }
  });
});

describe('wind field authoring', () => {
  it('covers every shipped arena with a distinct identity', () => {
    const identities = new Set<string>();
    for (const arenaId of ARENA_IDS) {
      const entry = windProfile(arenaId);
      expect(entry, arenaId).toBeDefined();
      expect(entry.arenaId, arenaId).toBe(arenaId);
      identities.add(entry.identity);
    }
    expect(identities.size).toBe(ARENA_IDS.length);
  });

  it('keeps the indoor range calm and the open ocean the stiffest breeze', () => {
    expect(WIND_PROFILES['gun-range'].sheltered).toBe(true);
    for (const arenaId of ARENA_IDS) {
      if (arenaId === 'gun-range') continue;
      expect(WIND_PROFILES[arenaId].sheltered, arenaId).toBe(false);
    }
    // Indoors is a ventilation plant, not weather.
    expect(windPeakSpeed('gun-range')).toBeLessThan(1);
    for (const arenaId of ARENA_IDS) {
      if (arenaId === 'gun-range' || arenaId === 'high-seas') continue;
      expect(WIND_PROFILES['high-seas'].baseSpeedMps, arenaId).toBeGreaterThan(WIND_PROFILES[arenaId].baseSpeedMps);
    }
  });

  it('keeps the gust weights normalised so the envelope really spans 0..1', () => {
    const total = WIND_GUST_BANDS.reduce((sum, entry) => sum + entry.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    // Long swells must dominate; a stack led by its shortest band flutters.
    expect(WIND_GUST_BANDS[0].weight).toBeGreaterThan(WIND_GUST_BANDS[WIND_GUST_BANDS.length - 1].weight);
  });

  it('stays inside the authored speed envelope and reaches both ends of it', () => {
    for (const arenaId of ARENA_IDS) {
      const entry = WIND_PROFILES[arenaId];
      const field = createWindField(arenaId, 5);
      let lowest = Infinity;
      let highest = -Infinity;
      for (let time = 0; time < 600; time += 0.37) {
        const sample = sampleWind(field, 3, -4, time);
        expect(sample.gust, arenaId).toBeGreaterThanOrEqual(0);
        expect(sample.gust, arenaId).toBeLessThanOrEqual(1);
        expect(sample.speed, arenaId).toBeGreaterThanOrEqual(entry.baseSpeedMps - 1e-9);
        expect(sample.speed, arenaId).toBeLessThanOrEqual(entry.baseSpeedMps + entry.gustSpeedMps + 1e-9);
        expect(Math.hypot(sample.x, sample.z), arenaId).toBeCloseTo(sample.speed, 6);
        lowest = Math.min(lowest, sample.gust);
        highest = Math.max(highest, sample.gust);
      }
      // An envelope that never approaches its ends is a mistuned envelope.
      expect(lowest, arenaId).toBeLessThan(0.25);
      expect(highest, arenaId).toBeGreaterThan(0.75);
    }
  });

  it('scales speed with the weather multiplier but never redirects the wind', () => {
    const field = createWindField('rustworks-1v1', 21);
    const calmSample = sampleWind(field, 8, 8, 42, 1);
    const stormSample = sampleWind(field, 8, 8, 42, 1.78);
    expect(stormSample.speed).toBeCloseTo(calmSample.speed * 1.78, 6);
    expect(stormSample.bearingRadians).toBe(calmSample.bearingRadians);
    expect(sampleWind(field, 8, 8, 42, 0).speed).toBe(0);
  });

  it('degrades to a valid vector rather than NaN on a bad input', () => {
    const field = createWindField('atomic-acres', Number.NaN);
    for (const sample of [
      sampleWind(field, Number.NaN, 0, 10),
      sampleWind(field, 0, Number.POSITIVE_INFINITY, 10),
      sampleWind(field, 0, 0, Number.NaN),
      sampleWind(field, 0, 0, 10, Number.NaN),
      sampleWind(field, 0, 0, 10, -4),
    ]) {
      expect(Number.isFinite(sample.x)).toBe(true);
      expect(Number.isFinite(sample.z)).toBe(true);
      expect(Number.isFinite(sample.speed)).toBe(true);
      expect(sample.speed).toBeGreaterThanOrEqual(0);
    }
  });

  it('offers a dead-calm sample for bypassed consumers', () => {
    const calm = calmWind();
    expect(calm.speed).toBe(0);
    expect(calm.x).toBe(0);
    expect(calm.z).toBe(0);
    expect(calm.gust).toBe(0);
  });
});
