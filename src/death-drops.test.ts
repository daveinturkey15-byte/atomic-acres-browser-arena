import { describe, expect, it } from 'vitest';
import {
  DEATH_DROP_LIFETIME_MS,
  consumeDeathDropWeapon,
  createDeathDrop,
  deathDropAmmoAvailable,
  deathDropAvailable,
  deathDropWeaponAvailable,
  nearestDeathDrop,
  nearestScavengeDeathDrop,
  pruneDeathDrops,
  scavengeDeathDrop,
} from './death-drops';

describe('death-drop inventory contract', () => {
  it('keeps both dropped gun and ammo available for 30 seconds, then expires both exactly', () => {
    expect(DEATH_DROP_LIFETIME_MS).toBe(30_000);
    const drop = createDeathDrop('death-30s', 'carbine', { x: 0, y: 0, z: 0 }, 15, 30, 1_000);
    expect(drop.expiresAt).toBe(31_000);
    expect(deathDropAmmoAvailable(drop, 30_999)).toBe(true);
    expect(deathDropWeaponAvailable(drop, 30_999)).toBe(true);
    expect(deathDropAvailable(drop, 30_999)).toBe(true);
    expect(deathDropAmmoAvailable(drop, 31_000)).toBe(false);
    expect(deathDropWeaponAvailable(drop, 31_000)).toBe(false);
    expect(deathDropAvailable(drop, 31_000)).toBe(false);
    expect(pruneDeathDrops([drop], 31_000)).toEqual([]);
  });

  it('scavenges carried-weapon ammo and one grenade without selecting the dropped gun', () => {
    const drop = createDeathDrop('death-1', 'sniper', { x: 1, y: 0, z: 1 }, 5, 4, 1_000);
    const result = scavengeDeathDrop(drop, { weapon: 'carbine', reserve: 116, grenades: 1 }, 120, 2, 1_100);
    expect(result.scavenged).toBe(true);
    expect(result.inventory).toEqual({ weapon: 'carbine', reserve: 120, grenades: 2 });
    expect(result.ammoGranted).toBe(4);
    expect(result.grenadeGranted).toBe(1);
    expect(deathDropAmmoAvailable(result.drop, 1_101)).toBe(false);
    expect(deathDropWeaponAvailable(result.drop, 1_101)).toBe(true);
    expect(deathDropAvailable(result.drop, 1_101)).toBe(true);
  });

  it('does not consume the ammo payload when carried ammo and grenades are already full', () => {
    const drop = createDeathDrop('death-full', 'smg', { x: 0, y: 0, z: 0 }, 16, 32, 1_000);
    const result = scavengeDeathDrop(drop, { weapon: 'carbine', reserve: 120, grenades: 2 }, 120, 2, 1_100);
    expect(result.scavenged).toBe(false);
    expect(result.drop).toEqual(drop);
    expect(deathDropAmmoAvailable(result.drop, 1_101)).toBe(true);
  });

  it('keeps the dropped weapon independently selectable after walk-over scavenging', () => {
    const drop = createDeathDrop('death-2', 'sniper', { x: 0, y: 0, z: 0 }, 5, 6, 1_000);
    const scavenged = scavengeDeathDrop(drop, { weapon: 'carbine', reserve: 100, grenades: 1 }, 120, 2, 1_100);
    const picked = consumeDeathDropWeapon(scavenged.drop, { primary: 'carbine', ammo: 30, reserve: 120 }, 25, 1_200);
    expect(picked.consumed).toBe(true);
    expect(picked.mode).toBe('pickup');
    expect(picked.inventory).toEqual({ primary: 'sniper', ammo: 5, reserve: 0 });
    expect(deathDropAvailable(picked.drop, 1_201)).toBe(false);
  });

  it('explicitly replenishes a matching gun only when its ammo payload remains', () => {
    const drop = createDeathDrop('death-3', 'sniper', { x: 0, y: 0, z: 0 }, 5, 99, 1_000);
    const result = consumeDeathDropWeapon(drop, { primary: 'sniper', ammo: 2, reserve: 24 }, 25, 1_100);
    expect(result.consumed).toBe(true);
    expect(result.mode).toBe('replenish');
    expect(result.inventory).toEqual({ primary: 'sniper', ammo: 2, reserve: 25 });
    expect(deathDropAvailable(result.drop, 1_101)).toBe(false);
    expect(consumeDeathDropWeapon(result.drop, result.inventory, 25, 1_200).consumed).toBe(false);
  });

  it('uses tight horizontal walk-over range while preserving wider F interaction and expiry pruning', () => {
    const drops = [
      createDeathDrop('a', 'carbine', { x: 0.8, y: 0, z: 0 }, 10, 10, 0),
      createDeathDrop('b', 'smg', { x: 2, y: 0, z: 0 }, 10, 10, 0),
      createDeathDrop('c', 'scattergun', { x: 0.5, y: 0, z: 0 }, 2, 4, -30_000),
    ];
    expect(nearestScavengeDeathDrop(drops, { x: 0, y: 1.7, z: 0 }, 1_000)?.id).toBe('a');
    expect(nearestDeathDrop(drops, { x: 0, y: 1.7, z: 0 }, 2.35, 1_000)?.id).toBe('a');
    expect(pruneDeathDrops(drops, 1_000, 1).map((drop) => drop.id)).toEqual(['a']);
  });
});
