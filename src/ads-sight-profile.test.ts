import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from './protocol';
import {
  ADS_IRON_SIGHT_MINIMUM_FOV_DEGREES,
  ADS_SIGHT_PROFILES,
  adsAimingFovDegrees,
  adsSightCatalogComplete,
  authoredOpticMagnification,
  ironSightAdsFovDegrees,
} from './ads-sight-profile';
import { magnifiedFovDegrees } from './weapon-presentation-state';

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

/**
 * HF-405 — "need a better scope 1.5x on the crossbow".
 *
 * The optic was NOT missing: weapon-catalog authors explosive-crossbow with
 * `optic.magnification: 1.5` and weapon-model builds the compact glass. It
 * simply had no reader. The ADS ladder hard-coded sniper/m14-ebr/railgun and
 * dropped every other weapon — the crossbow included — into one generic
 * iron-sight number, so the authored magnification never reached the camera.
 */
describe('HF-405 ADS reads the authored optic', () => {
  const BASE_FOV = 82;
  const IRON_SIGHT_FOV = 62;

  it('gives the crossbow an optic that is actually felt, not merely non-zero', () => {
    expect(authoredOpticMagnification('explosive-crossbow')).toBe(2.5);
    const aimed = adsAimingFovDegrees('explosive-crossbow', BASE_FOV);
    expect(aimed).toBeCloseTo(magnifiedFovDegrees(BASE_FOV, 2.5), 10);
    expect(aimed).toBeCloseTo(38.35, 2);
    expect(aimed).toBeLessThan(ironSightAdsFovDegrees(BASE_FOV));
  });

  /**
   * THE DEFECT THIS GATE EXISTS FOR, and the reason the assertion above is not
   * enough on its own. Owner 2026-08-31: the crossbow scope had "no zoom". It
   * was not broken code - it was arithmetic. The generic iron-sight ADS already
   * takes 20 degrees off the base FOV, which at 82 is about 1.45x on its own,
   * so an authored 1.5x bought 1.04x over iron sights: measurably magnified,
   * perceptually nothing.
   *
   * `toBeLessThan(ironSight)` passed that whole time. What matters is not that
   * an optic tightens the view but that it tightens it ENOUGH TO NOTICE, so
   * this gate measures the ratio a player actually experiences.
   */
  it('requires a presented optic to beat iron sights by a felt margin', () => {
    const felt = (weapon: 'explosive-crossbow' | 'sniper') => {
      const iron = ironSightAdsFovDegrees(BASE_FOV);
      const aimed = adsAimingFovDegrees(weapon, BASE_FOV);
      // Zoom ratio, not a degree difference: what the player sees is the ratio
      // of the tangents, which is how magnification is defined.
      return Math.tan((iron * Math.PI) / 360) / Math.tan((aimed * Math.PI) / 360);
    };
    // 1.04x is what shipped and what the owner correctly called no zoom.
    expect(felt('explosive-crossbow')).toBeGreaterThan(1.5);
    expect(felt('sniper')).toBeGreaterThan(1.5);
  });

  it('leaves weapons with no authored optic on the exact iron-sight fallback', () => {
    expect(ironSightAdsFovDegrees(BASE_FOV)).toBe(IRON_SIGHT_FOV);
    for (const weapon of ['smg', 'scattergun', 'flamethrower', 'crimson-flamethrower'] as const) {
      expect(authoredOpticMagnification(weapon)).toBeNull();
      expect(adsAimingFovDegrees(weapon, BASE_FOV)).toBe(IRON_SIGHT_FOV);
    }
  });

  it('never lets a weakly authored optic aim worse than iron sights', () => {
    // The flare gun authors 1.1x, which alone would OPEN the view to 74.5
    // degrees. An optic may only ever tighten the shot.
    expect(authoredOpticMagnification('flare-gun')).toBe(1.1);
    expect(magnifiedFovDegrees(BASE_FOV, 1.1)).toBeGreaterThan(IRON_SIGHT_FOV);
    expect(adsAimingFovDegrees('flare-gun', BASE_FOV)).toBe(IRON_SIGHT_FOV);
    expect(adsAimingFovDegrees('carbine', BASE_FOV)).toBe(IRON_SIGHT_FOV);
  });

  it('keeps the iron-sight floor at a low preferred field of view', () => {
    expect(ironSightAdsFovDegrees(60)).toBe(ADS_IRON_SIGHT_MINIMUM_FOV_DEGREES);
    expect(adsAimingFovDegrees('smg', 60)).toBe(ADS_IRON_SIGHT_MINIMUM_FOV_DEGREES);
    // The floor is a floor on the FALLBACK, never a ceiling on a real optic:
    // the crossbow still magnifies from a narrow base.
    expect(adsAimingFovDegrees('explosive-crossbow', 60))
      .toBeCloseTo(magnifiedFovDegrees(60, 2.5), 10);
    expect(adsAimingFovDegrees('explosive-crossbow', 60)).toBeLessThan(ADS_IRON_SIGHT_MINIMUM_FOV_DEGREES);
  });

  it('is what legacy-main actually consumes', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(main).toContain(': adsAimingFovDegrees(player.weapon, preferredFov);');
    expect(main).not.toContain(': Math.max(55, preferredFov - 20);');
  });
});
