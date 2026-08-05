import { describe, expect, it } from 'vitest';
import { GUN_RANGE_WEAPON_STATIONS } from './gun-range-armory';
import { WEAPON_IDS } from './protocol';
import {
  GUN_RANGE_FIELD_TEST_WEAPONS,
  RUNTIME_WEAPON_RETENTION_LIMIT,
  menuWeaponPrewarmCatalog,
  weaponPrewarmCatalogForArena,
} from './weapon-prewarm-catalog';

describe('Pass 65 first-person weapon prewarm authority', () => {
  it('keeps menu editing bounded to the selected loadout', () => {
    expect(menuWeaponPrewarmCatalog('carbine', 'pistol')).toEqual(['carbine', 'pistol']);
  });

  it('automatically retains every canonical weapon in normal matches', () => {
    for (const arenaId of ['atomic-acres', 'rustworks-1v1', 'skyline-terminal'] as const) {
      expect(weaponPrewarmCatalogForArena(arenaId, 'pistol')).toBe(WEAPON_IDS);
    }
    expect(RUNTIME_WEAPON_RETENTION_LIMIT).toBe(WEAPON_IDS.length);
    expect(new Set(WEAPON_IDS).size).toBe(WEAPON_IDS.length);
  });

  it('keeps the full retained corpus across Gun Range and normal-map transitions', () => {
    expect(weaponPrewarmCatalogForArena('gun-range', 'pistol')).toBe(WEAPON_IDS);
    expect(weaponPrewarmCatalogForArena('gun-range', 'magnum')).toBe(WEAPON_IDS);
    expect(GUN_RANGE_WEAPON_STATIONS.every((station) => WEAPON_IDS.includes(station.weapon))).toBe(true);
    expect([...GUN_RANGE_FIELD_TEST_WEAPONS].sort()).toEqual([...WEAPON_IDS].sort());
  });
});
