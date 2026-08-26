import { describe, expect, it } from 'vitest';
import {
  GUN_RANGE_ARMORY_INTERACTION_RANGE,
  GUN_RANGE_WEAPON_STATIONS,
  nearestGunRangeWeaponStation,
} from './gun-range-armory';
import { WEAPONS } from './gameplay';

describe('Gun Range walk-up armory', () => {
  it('offers every primary family once, including the new LMG', () => {
    expect(GUN_RANGE_WEAPON_STATIONS.map((station) => station.weapon)).toEqual([
      'carbine', 'smg', 'lmg', 'scattergun', 'sniper',
    ]);
    expect(new Set(GUN_RANGE_WEAPON_STATIONS.map((station) => station.id)).size).toBe(5);
    expect(new Set(GUN_RANGE_WEAPON_STATIONS.map((station) => station.position.x)).size).toBe(5);
    expect(WEAPONS.lmg.penetration).toMatchObject({
      caliber: '7.62 mm',
      penetrationPower: 6.9,
      maxPenetratedSurfaces: 2,
    });
  });

  it('selects only the nearest station inside the explicit interaction radius', () => {
    expect(nearestGunRangeWeaponStation({ x: 0.3, y: 1.7, z: 11.2 })?.weapon).toBe('lmg');
    expect(nearestGunRangeWeaponStation({ x: 3, y: 1.7, z: 11.2 })).toBeNull();
    expect(nearestGunRangeWeaponStation({ x: 0, y: 1.7, z: 11 + GUN_RANGE_ARMORY_INTERACTION_RANGE + 1 })).toBeNull();
    expect(nearestGunRangeWeaponStation({ x: Number.NaN, y: 1.7, z: 11 })).toBeNull();
  });
});
