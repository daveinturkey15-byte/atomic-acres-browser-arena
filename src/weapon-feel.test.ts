import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import { LEGACY_WEAPONS } from './combat/legacy-weapon-adapter';
import { computeSpread } from './gameplay';
import {
  FEEL_BAND_EXEMPTIONS,
  WEAPON_FEEL_BANDS,
  allWeaponFeelMetrics,
  weaponFeelFindings,
  UNIVERSAL_PRONE_SPREAD_MULTIPLIER,
  proneSpreadDivergence,
  weaponFeelMetrics,
  weaponFeelTable,
} from './weapon-feel';
import type { WeaponId } from './protocol';

/** `WEAPON_FEEL_REPORT=1 npx vitest run src/weapon-feel.test.ts` prints the table. */
const reportRequested = process.env.WEAPON_FEEL_REPORT === '1';

describe('HF-510 weapon feel bands', () => {
  it('keeps every weapon inside its family band or names an exemption', () => {
    if (reportRequested) console.log(`\n${weaponFeelTable()}\n`);
    expect(weaponFeelFindings()).toEqual([]);
  });

  it('covers every catalog weapon', () => {
    expect(allWeaponFeelMetrics()).toHaveLength(WEAPON_CATALOG.length);
    for (const metrics of allWeaponFeelMetrics()) {
      expect(WEAPON_FEEL_BANDS[metrics.family]).toBeTruthy();
      expect(Number.isFinite(metrics.hipConeCm)).toBe(true);
      expect(Number.isFinite(metrics.recovery95Seconds)).toBe(true);
    }
  });

  it('spends no exemption on a weapon or metric that does not exist', () => {
    const ids = new Set(WEAPON_CATALOG.map((definition) => definition.id));
    const metrics = new Set(Object.keys(WEAPON_FEEL_BANDS['assault-rifle']));
    for (const key of Object.keys(FEEL_BAND_EXEMPTIONS)) {
      const [id, metric] = key.split(':');
      expect(ids.has(id), `exemption for unknown weapon ${id}`).toBe(true);
      expect(metrics.has(metric), `exemption for unknown metric ${metric}`).toBe(true);
      // An exemption with no reason is a silent band widening.
      expect(FEEL_BAND_EXEMPTIONS[key].length).toBeGreaterThan(40);
    }
  });

  it('never exempts a weapon that is actually inside its band', () => {
    // A stale exemption is a hole the next drift falls through unnoticed.
    for (const key of Object.keys(FEEL_BAND_EXEMPTIONS)) {
      const [id, metric] = key.split(':') as [WeaponId, keyof typeof WEAPON_FEEL_BANDS['assault-rifle']];
      const measured = weaponFeelMetrics(id);
      const band = WEAPON_FEEL_BANDS[measured.family][metric];
      const value = measured[metric];
      expect(
        value < band.min || value > band.max,
        `${key} is inside [${band.min}, ${band.max}] at ${value}; drop the exemption`,
      ).toBe(true);
    }
  });
});

describe('HF-510 stance and aim ordering', () => {
  it('never lets a looser stance shoot straighter', () => {
    for (const metrics of allWeaponFeelMetrics()) {
      expect(metrics.proneConeRatio, `${metrics.id} prone`).toBeLessThanOrEqual(metrics.crouchConeRatio + 1e-9);
      expect(metrics.crouchConeRatio, `${metrics.id} crouch`).toBeLessThanOrEqual(1);
      expect(metrics.movingConeRatio, `${metrics.id} moving`).toBeGreaterThanOrEqual(1);
    }
  });

  it('never lets aiming down the sights cost accuracy or control', () => {
    for (const metrics of allWeaponFeelMetrics()) {
      expect(metrics.adsTighteningRatio, `${metrics.id} ADS cone`).toBeLessThanOrEqual(1);
      expect(metrics.adsRecoilRatio, `${metrics.id} ADS recoil`).toBeLessThanOrEqual(1);
      expect(metrics.adsBurstClimbMrad, `${metrics.id} ADS burst`).toBeLessThanOrEqual(metrics.burstClimbMrad + 1e-9);
    }
  });

  it('keeps recoil recovery finite and bounded per weapon', () => {
    for (const metrics of allWeaponFeelMetrics()) {
      expect(metrics.recovery95Seconds).toBeGreaterThan(0);
      // Nobody may empty a magazine inside one settle window: the recoil would
      // be a constant offset rather than a per-shot cost the player rides.
      expect(
        metrics.shotsPerRecoveryWindow,
        `${metrics.id} fires ${metrics.shotsPerRecoveryWindow} shots inside one 95% settle`,
      ).toBeLessThan(LEGACY_WEAPONS[metrics.id].mag);
    }
  });

  it('makes a held trigger cost accuracy on every automatic weapon', () => {
    for (const definition of WEAPON_CATALOG) {
      if (definition.fireMode !== 'automatic') continue;
      const metrics = weaponFeelMetrics(definition.id as WeaponId);
      expect(definition.spread.sustainedPerShot, `${definition.id} sustained bloom`).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.sustainedShotsToMaximumCone)).toBe(true);
      // Saturating in two shots would make the bloom a step, not a curve.
      expect(metrics.sustainedShotsToMaximumCone, `${definition.id}`).toBeGreaterThan(3);
    }
  });
});

describe('HF-511 authored prone spread is NOT read by the runtime (OPEN)', () => {
  it('keeps the Pass 64 universal constant as the shipped behaviour', () => {
    // This mirrors, and must never contradict, the Pass 64 behaviour fixture
    // and `src/combat/legacy-weapon-adapter.test.ts` "preserves hardcoded prone
    // spread". If someone adopts the authored values, that contract reddens
    // first and this one names the reason.
    for (const definition of WEAPON_CATALOG) {
      const weapon = LEGACY_WEAPONS[definition.id as WeaponId];
      const base = { moving: false, crouched: false, sustainedShots: 0, ads: false };
      const standing = computeSpread(weapon, base);
      const prone = computeSpread(weapon, { ...base, prone: true });
      expect(prone / standing, `${definition.id} prone`).toBeCloseTo(UNIVERSAL_PRONE_SPREAD_MULTIPLIER, 10);
    }
  });

  it('measures the gap so the owner decision has a number', () => {
    const divergence = proneSpreadDivergence();
    if (reportRequested) {
      console.log('HF-511 prone spread divergence (authored vs applied):');
      for (const row of divergence) {
        console.log(
          `  ${row.displayName}: authored ${row.authored} applied ${row.effective} `
          + `ratio ${row.ratio.toFixed(3)} error ${row.errorCm.toFixed(1)} cm @30m`,
        );
      }
    }
    // Every catalog weapon authors a prone multiplier; the constant matches
    // only by coincidence. A divergence list that suddenly EMPTIES means the
    // catalog was flattened to the constant, which erases the authored intent.
    expect(divergence.length).toBeGreaterThan(0);
    for (const row of divergence) {
      expect(row.authored).toBeGreaterThan(0);
      expect(row.authored).toBeLessThanOrEqual(1);
      expect(Number.isFinite(row.errorCm)).toBe(true);
    }
    // Prone RECOIL already reads its authored per-weapon value. Recording the
    // asymmetry here is what makes it a finding rather than an opinion.
    const sniper = WEAPON_CATALOG.find((definition) => definition.id === 'sniper')!;
    expect(sniper.recoil.proneMultiplier).toBe(LEGACY_WEAPONS.sniper.proneRecoilMultiplier);
    expect(sniper.spread.proneMultiplier).not.toBe(UNIVERSAL_PRONE_SPREAD_MULTIPLIER);
  });
});
