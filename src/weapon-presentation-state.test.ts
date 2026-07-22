import { describe, expect, it } from 'vitest';
import { advanceAdsBlend, advanceWeaponHeat, fireCycleAt, hitReactionAt, magnifiedFovDegrees } from './weapon-presentation-state';

describe('weapon presentation state', () => {
  it('accumulates and cools bounded weapon heat', () => {
    expect(advanceWeaponHeat(0, true, 0, 'carbine')).toBeCloseTo(0.17);
    expect(advanceWeaponHeat(0.8, false, 1, 'carbine')).toBeCloseTo(0.56);
    expect(advanceWeaponHeat(0.95, true, 0, 'scattergun')).toBe(1);
    expect(advanceWeaponHeat(Number.NaN, false, Number.NaN, 'carbine')).toBe(0);
  });

  it('authors a finite carbine flash, bolt cycle and casing marker', () => {
    const start = fireCycleAt('carbine', 0, 0.5);
    const middle = fireCycleAt('carbine', 31, 0.5);
    const end = fireCycleAt('carbine', 70, 0.5);
    expect(start.flash).toBe(1);
    expect(start.kick).toBe(1);
    expect(middle.kick).toBeGreaterThan(0.2);
    expect(middle.kick).toBeLessThan(start.kick);
    expect(middle.boltTravel).toBeGreaterThan(0.95);
    expect(middle.casingReady).toBe(false);
    expect(end.flash).toBe(0);
    expect(end.kick).toBe(0);
    expect(end.boltTravel).toBe(0);
    expect(end.casingReady).toBe(true);
    expect(start.smokeScale).toBeGreaterThan(1);
  });

  it('converts the player FOV into a true 3x angular scope FOV', () => {
    const baseFov = 76;
    const scopedFov = magnifiedFovDegrees(baseFov, 3);
    const angularRatio = Math.tan(baseFov * Math.PI / 360) / Math.tan(scopedFov * Math.PI / 360);
    expect(scopedFov).toBeCloseTo(29.15, 1);
    expect(angularRatio).toBeCloseTo(3, 8);
    expect(magnifiedFovDegrees(Number.NaN, Number.NaN)).toBeCloseTo(76, 8);
  });

  it('snaps sniper ADS both ways while preserving eased ADS for other weapons', () => {
    expect(advanceAdsBlend(0.15, true, 1 / 120, 'sniper')).toBe(1);
    expect(advanceAdsBlend(0.85, false, 1 / 120, 'sniper')).toBe(0);
    expect(advanceAdsBlend(0, true, 1 / 120, 'carbine')).toBeGreaterThan(0);
    expect(advanceAdsBlend(0, true, 1 / 120, 'carbine')).toBeLessThan(1);
  });

  it('returns bounded presentation-only hit reactions', () => {
    expect(hitReactionAt(0, 'body').envelope).toBe(0);
    expect(hitReactionAt(140, 'head').envelope).toBeGreaterThan(0.5);
    expect(hitReactionAt(400, 'limb')).toEqual({ envelope: 0, pitch: 0, roll: 0 });
    for (const value of Object.values(hitReactionAt(Number.NaN, 'body'))) expect(Number.isFinite(value)).toBe(true);
  });
});
