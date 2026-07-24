import { describe, expect, it } from 'vitest';
import { damageNumberPresentation, roundStatSummary, THIRD_PERSON_WEAPON_SCALE } from './player-feedback';

describe('player feedback presentation', () => {
  it('keeps every third-person weapon within the reduced silhouette envelope', () => {
    expect(Object.values(THIRD_PERSON_WEAPON_SCALE)).toHaveLength(8);
    expect(Math.max(...Object.values(THIRD_PERSON_WEAPON_SCALE))).toBeLessThanOrEqual(0.54);
    expect(Math.min(...Object.values(THIRD_PERSON_WEAPON_SCALE))).toBeGreaterThanOrEqual(0.4);
  });

  it('presents headshots as larger critical numbers and rejects invalid damage', () => {
    expect(damageNumberPresentation(42.4, 'body')).toMatchObject({ amount: 42, overkill: 0, critical: false, label: '42' });
    expect(damageNumberPresentation(74.6, 'head')).toMatchObject({ amount: 75, overkill: 0, critical: true, label: 'CRIT 75' });
    expect(damageNumberPresentation(201, 'head', 100)).toMatchObject({
      amount: 201,
      overkill: 101,
      critical: true,
      label: 'CRIT 201 · +101 OVERKILL',
    });
    expect(damageNumberPresentation(91, 'body', 100)).toMatchObject({ amount: 91, overkill: 0, label: '91' });
    expect(damageNumberPresentation(0, 'body')).toBeNull();
    expect(damageNumberPresentation(Number.NaN, 'head')).toBeNull();
  });

  it('formats a bounded end-of-round summary', () => {
    expect(roundStatSummary({ kills: 7, deaths: 2, shotsFired: 31, hitShots: 14, damageDealt: 912.8, headshots: 3 })).toEqual({
      kills: 7, deaths: 2, kd: '3.50', accuracy: '45.2%', damageDealt: 912, headshots: 3,
    });
    expect(roundStatSummary({ kills: 4, deaths: 0, shotsFired: 0, hitShots: 9, damageDealt: -2, headshots: -1 })).toMatchObject({
      kd: '4.00', accuracy: '0%', damageDealt: 0, headshots: 0,
    });
  });
});
