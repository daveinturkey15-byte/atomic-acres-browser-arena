import { describe, expect, it } from 'vitest';
import {
  FLAMETHROWER_EFFECT,
  FLARE_PROJECTILE_EFFECT,
  advanceFlareProjectileKinematics,
  createFlareProjectileKinematics,
  flareBurnDamagePerSecond,
  flareProjectileExpired,
  flamethrowerStreamScale,
} from './special-weapon-effects';

describe('special weapon effect contracts', () => {
  it('creates a finite normalized 52 m/s flare projectile and rejects malformed directions', () => {
    const flare = createFlareProjectileKinematics([1, 2, 3], [0, 0, -1]);
    expect(flare).toMatchObject({ position: [1, 2, 3], velocity: [0, 0, -52], ageMs: 0 });
    expect(Math.hypot(...flare!.velocity)).toBeCloseTo(FLARE_PROJECTILE_EFFECT.speedMps, 8);
    expect(createFlareProjectileKinematics([0, 0, 0], [0, 0, -0.5])).toBeNull();
    expect(createFlareProjectileKinematics([0, Number.NaN, 0], [0, 0, -1])).toBeNull();
  });

  it('advances on bounded fixed steps with deterministic gravity and expiry', () => {
    const initial = createFlareProjectileKinematics([0, 2, 0], [1, 0, 0])!;
    const first = advanceFlareProjectileKinematics(initial, 1 / 60);
    expect(first.position[0]).toBeCloseTo(52 / 60, 8);
    expect(first.velocity[1]).toBeCloseTo(-FLARE_PROJECTILE_EFFECT.gravityMps2 / 60, 8);
    expect(first.ageMs).toBeCloseTo(1_000 / 60, 8);
    expect(advanceFlareProjectileKinematics(first, 0.5)).toBe(first);
    expect(flareProjectileExpired({ ...first, ageMs: 5_499 })).toBe(false);
    expect(flareProjectileExpired({ ...first, ageMs: 5_500 })).toBe(true);
  });

  it('uses a flat bounded ten-DPS non-explosive fire zone', () => {
    expect(flareBurnDamagePerSecond(0)).toBe(10);
    expect(flareBurnDamagePerSecond(FLARE_PROJECTILE_EFFECT.burnRadiusM / 2)).toBe(10);
    expect(flareBurnDamagePerSecond(FLARE_PROJECTILE_EFFECT.burnRadiusM)).toBe(0);
    expect(flareBurnDamagePerSecond(Number.NaN)).toBe(0);
  });

  it('ends the flamethrower stream at its canonical short range', () => {
    expect(flamethrowerStreamScale(0)).toBe(1);
    expect(flamethrowerStreamScale(FLAMETHROWER_EFFECT.rangeM)).toBeCloseTo(0.18, 8);
    expect(flamethrowerStreamScale(FLAMETHROWER_EFFECT.rangeM + 0.001)).toBe(0);
  });
});
