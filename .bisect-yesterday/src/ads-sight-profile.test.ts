import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from './protocol';
import { ADS_SIGHT_PROFILES, adsSightCatalogComplete } from './ads-sight-profile';

describe('canonical per-weapon ADS sight profiles', () => {
  it('projects every canonical weapon with no fallback or stale entry', () => {
    expect(adsSightCatalogComplete()).toBe(true);
    expect(Object.keys(ADS_SIGHT_PROFILES).sort()).toEqual([...WEAPON_IDS].sort());
  });

  it('gives every weapon its own stable visual signature', () => {
    const signatures = WEAPON_IDS.map((weapon) => {
      const profile = ADS_SIGHT_PROFILES[weapon];
      return [profile.marker, profile.color, profile.ringSizePx, profile.dotSizePx, profile.rotationDeg].join('|');
    });
    expect(new Set(signatures).size).toBe(WEAPON_IDS.length);
  });

  it('reserves full-screen optics for the authored scoped weapons', () => {
    expect(WEAPON_IDS.filter((weapon) => ADS_SIGHT_PROFILES[weapon].marker === 'scope'))
      .toEqual(['sniper', 'm14-ebr', 'railgun']);
  });
});
