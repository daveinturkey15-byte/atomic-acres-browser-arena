import { describe, expect, it } from 'vitest';
import { advanceLocalHealthRegen } from './local-health-regen';
import { REMOTE_HEALTH_REGEN_DELAY_MS, REMOTE_HEALTH_REGEN_PER_SECOND } from './remote-health-authority';

describe('local health regen (HF-338)', () => {
  const BASE_NOW = 10_000;

  it('no regen when below the damage delay', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS - 1,
      dtSeconds: 1,
    });
    expect(hp).toBe(20);
  });

  it('regen at correct rate past the delay', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000,
      dtSeconds: 1,
    });
    expect(hp).toBe(20 + REMOTE_HEALTH_REGEN_PER_SECOND);
  });

  it('adrenaline shortens the wait (delay waived)', () => {
    // At exactly the damage time with adrenaline, regen should happen
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: true,
      now: BASE_NOW,
      dtSeconds: 1,
    });
    expect(hp).toBe(20 + REMOTE_HEALTH_REGEN_PER_SECOND + 1);
  });

  it('adrenaline uses boosted rate (+1 hp/s)', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: true,
      now: BASE_NOW + 1_000,
      dtSeconds: 1,
    });
    expect(hp).toBe(20 + REMOTE_HEALTH_REGEN_PER_SECOND + 1);
  });

  it('hp never exceeds the cap of 100', () => {
    const hp = advanceLocalHealthRegen({
      hp: 95,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 10_000,
      dtSeconds: 10,
    });
    expect(hp).toBe(100);
  });

  it('hp at cap stays at cap', () => {
    const hp = advanceLocalHealthRegen({
      hp: 100,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000,
      dtSeconds: 1,
    });
    expect(hp).toBe(100);
  });

  it('taking damage resets the window (lastDamageAt updated)', () => {
    // First, regen past delay
    let hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000,
      dtSeconds: 1,
    });
    expect(hp).toBe(20 + REMOTE_HEALTH_REGEN_PER_SECOND);

    // Now simulate taking damage at a later time - lastDamageAt is updated
    const damageTime = BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 2_000;
    hp = advanceLocalHealthRegen({
      hp: 38, // hp after regen above
      lastDamageAt: damageTime, // damage resets the window
      adrenalineActive: false,
      now: damageTime + REMOTE_HEALTH_REGEN_DELAY_MS - 1,
      dtSeconds: 1,
    });
    // Should not regen because we're still within the new delay window
    expect(hp).toBe(38);
  });

  it('dt of zero is a no-op', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000,
      dtSeconds: 0,
    });
    expect(hp).toBe(20);
  });

  it('dt negative is a no-op', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000,
      dtSeconds: -1,
    });
    expect(hp).toBe(20);
  });

  it('non-finite inputs return hp unchanged', () => {
    expect(advanceLocalHealthRegen({ hp: NaN, lastDamageAt: BASE_NOW, adrenalineActive: false, now: BASE_NOW, dtSeconds: 1 })).toBe(NaN);
    expect(advanceLocalHealthRegen({ hp: 20, lastDamageAt: NaN, adrenalineActive: false, now: BASE_NOW, dtSeconds: 1 })).toBe(20);
    expect(advanceLocalHealthRegen({ hp: 20, lastDamageAt: BASE_NOW, adrenalineActive: false, now: NaN, dtSeconds: 1 })).toBe(20);
    expect(advanceLocalHealthRegen({ hp: 20, lastDamageAt: BASE_NOW, adrenalineActive: false, now: BASE_NOW, dtSeconds: NaN })).toBe(20);
  });

  it('now before lastDamageAt returns hp unchanged', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW + 1_000,
      adrenalineActive: false,
      now: BASE_NOW,
      dtSeconds: 1,
    });
    expect(hp).toBe(20);
  });

  it('exact delay boundary starts regen', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS,
      dtSeconds: 1,
    });
    expect(hp).toBe(20 + REMOTE_HEALTH_REGEN_PER_SECOND);
  });

  it('fractional dt applies proportional regen', () => {
    const hp = advanceLocalHealthRegen({
      hp: 20,
      lastDamageAt: BASE_NOW,
      adrenalineActive: false,
      now: BASE_NOW + REMOTE_HEALTH_REGEN_DELAY_MS + 1_000,
      dtSeconds: 0.5,
    });
    expect(hp).toBeCloseTo(20 + REMOTE_HEALTH_REGEN_PER_SECOND * 0.5);
  });
});