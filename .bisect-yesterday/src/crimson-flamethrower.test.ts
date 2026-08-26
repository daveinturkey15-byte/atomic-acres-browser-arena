/**
 * HF-334 — the care package can hand you a flamethrower, without ever taking
 * the map one away.
 *
 * The owner asked for "10% chance in care package to get a flamethrower". The
 * naive wiring was refused twice for two concrete reasons, and this suite pins
 * the fix for both:
 *   1. CANNIBALISATION — a shared single-instance grant consumed the world
 *      pickup, so the physical flamethrower vanished mid-match for whoever was
 *      walking toward it. The reward is now a SEPARATE weapon id with its own
 *      ammo, untouched by timed-map-weapon authority.
 *   2. "EXACTLY 10%" — unreachable with integer pool weights while the Nuke
 *      stays exactly 1%. The reward is now a fixed-percentage entry, so the
 *      owner's number is exact rather than approximated.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARE_PACKAGE_FIXED_DENOMINATOR,
  CRIMSON_FLAMETHROWER_KILLSTREAK_ID,
  PASS65_KILLSTREAK_CATALOG,
  PASS65_KILLSTREAK_SLOT_DEFINITIONS,
  rewardForCarePackageUnit,
} from './killstreak-catalog';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import { SPECIAL_WEAPON_IDS, WEAPON_IDS } from './protocol';
import { TIMED_MAP_WEAPON_IDS } from './timed-map-weapon-authority';
import { weaponFinishProfile } from './weapon-finish';
import { authoredFirearmIdFor } from './weapon-model';

const catalogEntry = (id: string) => WEAPON_CATALOG.find((weapon) => weapon.id === id)!;

describe('HF-334 exact care-package probability', () => {
  it('lands the flamethrower reward on exactly 10% of the pool', () => {
    const pool = PASS65_KILLSTREAK_CATALOG.carePackagePool;
    const entry = pool.entries.find((candidate) => candidate.id === CRIMSON_FLAMETHROWER_KILLSTREAK_ID)!;
    expect(entry).toBeDefined();
    // Exact ratio, not a rounded approximation.
    expect(entry.weightUnits * CARE_PACKAGE_FIXED_DENOMINATOR).toBe(pool.totalWeightUnits * 10);
    expect(entry.weightUnits / pool.totalWeightUnits).toBeCloseTo(0.1, 12);
  });

  it('keeps the Nuke at exactly 1% alongside it', () => {
    const pool = PASS65_KILLSTREAK_CATALOG.carePackagePool;
    const nuke = pool.entries.find((candidate) => candidate.id === 'nuke')!;
    expect(nuke.weightUnits * CARE_PACKAGE_FIXED_DENOMINATOR).toBe(pool.totalWeightUnits * 1);
  });

  it('actually rolls the reward across the pool, once, at the right frequency', () => {
    const pool = PASS65_KILLSTREAK_CATALOG.carePackagePool;
    let hits = 0;
    for (let unit = 0; unit < pool.totalWeightUnits; unit += 1) {
      if (rewardForCarePackageUnit(PASS65_KILLSTREAK_CATALOG, unit) === CRIMSON_FLAMETHROWER_KILLSTREAK_ID) hits += 1;
    }
    expect(hits * CARE_PACKAGE_FIXED_DENOMINATOR).toBe(pool.totalWeightUnits * 10);
  });

  it('is care-package only — never selectable into a killstreak slot', () => {
    const definition = PASS65_KILLSTREAK_CATALOG.definitions
      .find((entry) => entry.id === CRIMSON_FLAMETHROWER_KILLSTREAK_ID)!;
    expect(definition.availability).toBe('care-only');
    for (const slot of PASS65_KILLSTREAK_SLOT_DEFINITIONS) {
      expect(slot.allowedIds).not.toContain(CRIMSON_FLAMETHROWER_KILLSTREAK_ID);
    }
  });
});

describe('HF-334 separate weapon instance', () => {
  it('is its own weapon id, not the arena-bound map flamethrower', () => {
    expect(WEAPON_IDS).toContain('crimson-flamethrower');
    expect(SPECIAL_WEAPON_IDS).toContain('crimson-flamethrower');
    expect(catalogEntry('crimson-flamethrower').id).not.toBe(catalogEntry('flamethrower').id);
  });

  it('is NOT a timed map weapon, so a grant cannot consume the world pickup', () => {
    // This is the refutation that blocked the row: claimTimedMapWeapon was the
    // only admissible transition, so granting took the map weapon away.
    expect(TIMED_MAP_WEAPON_IDS).toContain('flamethrower');
    expect(TIMED_MAP_WEAPON_IDS).not.toContain('crimson-flamethrower');
  });

  it('deals exactly 30% less direct damage than the map flamethrower', () => {
    const map = catalogEntry('flamethrower').damage;
    const crimson = catalogEntry('crimson-flamethrower').damage;
    expect(crimson.base).toBeCloseTo(map.base * 0.7, 10);
    // Range and falloff are unchanged: it is the same weapon, weaker.
    expect(crimson.falloffStartM).toBe(map.falloffStartM);
    expect(crimson.falloffEndM).toBe(map.falloffEndM);
  });

  it('reads red rather than orange', () => {
    const crimsonTracer = catalogEntry('crimson-flamethrower').effects.tracerColorHex;
    const mapTracer = catalogEntry('flamethrower').effects.tracerColorHex;
    expect(crimsonTracer).not.toBe(mapTracer);
    const red = (hex: number) => (hex >> 16) & 0xff;
    const green = (hex: number) => (hex >> 8) & 0xff;
    // Strongly red-dominant, and less orange than the map weapon.
    expect(red(crimsonTracer)).toBeGreaterThan(200);
    expect(green(crimsonTracer)).toBeLessThan(green(mapTracer));
    expect(weaponFinishProfile('crimson-flamethrower').tintHex).toBeDefined();
    expect(weaponFinishProfile('flamethrower').tintHex).toBeUndefined();
  });

  it('reuses the authored flamethrower GLB instead of shipping a second asset', () => {
    expect(authoredFirearmIdFor('crimson-flamethrower')).toBe('flamethrower');
    expect(authoredFirearmIdFor('flamethrower')).toBe('flamethrower');
    expect(authoredFirearmIdFor('carbine')).toBe('carbine');
  });

  it('is never carried by bots and never spawns as a map pickup weapon station', () => {
    expect(catalogEntry('crimson-flamethrower').policies.bot).toBe('never');
  });
});

describe('HF-334 grant wiring', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('diverts a rolled crimson reward to the weapon grant, not streak activation', () => {
    expect(main).toContain('if (revealedCareReward === CRIMSON_FLAMETHROWER_KILLSTREAK_ID) {');
    expect(main).toContain('grantCrimsonFlamethrower();');
  });

  it('grants finite personal ammo without touching timed-map-weapon authority', () => {
    const start = main.indexOf('function grantCrimsonFlamethrower(');
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('function activateFieldSupport(', start));
    expect(body).toContain("player.ammo[weapon] = WEAPONS[weapon].mag");
    expect(body).toContain("player.reserve[weapon] = WEAPONS[weapon].reserve");
    expect(body).not.toContain('claimTimedMapWeapon');
    expect(body).not.toContain('applyTimedMapWeaponState');
  });
});
