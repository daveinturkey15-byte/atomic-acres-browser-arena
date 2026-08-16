import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { WeaponDefinition } from './combat/weapon-schema';
import { WEAPON_IDS } from './protocol';
import {
  WEAPON_GLASS_BREAK_CATALOG,
  projectWeaponGlassBreakCatalog,
  weaponGlassBreakPolicy,
} from './weapon-glass-break-policy';

describe('weapon glass-break catalog', () => {
  it('projects every canonical weapon exactly once', () => {
    expect(new Set(WEAPON_GLASS_BREAK_CATALOG.map(({ weapon }) => weapon))).toEqual(new Set(WEAPON_IDS));
    expect(new Set(WEAPON_GLASS_BREAK_CATALOG.map(({ weapon }) => weapon)).size).toBe(WEAPON_CATALOG.length);
    expect(WEAPON_GLASS_BREAK_CATALOG).toHaveLength(WEAPON_CATALOG.length);
  });

  it('breaches ordinary shots and flares at impact while explosive bolts breach at detonation', () => {
    expect(weaponGlassBreakPolicy('carbine')).toMatchObject({ profile: 'bullet', timing: 'impact' });
    expect(weaponGlassBreakPolicy('railgun')).toMatchObject({ profile: 'bullet', timing: 'impact' });
    expect(weaponGlassBreakPolicy('flamethrower')).toMatchObject({ profile: 'bullet', timing: 'impact' });
    expect(weaponGlassBreakPolicy('flare-gun')).toMatchObject({ profile: 'bullet', timing: 'impact' });
    expect(weaponGlassBreakPolicy('explosive-crossbow')).toMatchObject({ profile: 'explosion', timing: 'detonation' });
  });

  it('fails closed for a duplicate or a newly introduced projectile without a policy', () => {
    expect(() => projectWeaponGlassBreakCatalog([
      WEAPON_CATALOG[0]!,
      WEAPON_CATALOG[0]!,
    ])).toThrow(/Duplicate glass-break weapon/);

    const candidate = {
      ...WEAPON_CATALOG.find(({ id }) => id === 'flare-gun')!,
      id: 'candidate-projectile',
      projectileId: 'candidate-projectile-v1',
    } as WeaponDefinition;
    expect(() => projectWeaponGlassBreakCatalog([...WEAPON_CATALOG, candidate]))
      .toThrow(/has no glass-break policy/);
  });
});
