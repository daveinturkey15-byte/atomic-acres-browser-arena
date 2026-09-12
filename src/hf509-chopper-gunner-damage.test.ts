import { describe, expect, it } from 'vitest';
import { collectCombatDamageTable } from './combat-damage-table';
import { CHOPPER_GUN_PROFILE, supportGunDamageAtDistance } from './killstreak-support-catalog';
import {
  CHOPPER_GUN_DAMAGE_AFTER,
  CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
  CHOPPER_GUN_DAMAGE_HF458,
  CHOPPER_GUN_DAMAGE_MULTIPLIER_FROM_V2,
  CHOPPER_GUN_MINIMUM_DAMAGE_AFTER,
  CHOPPER_GUN_MINIMUM_DAMAGE_HF458,
} from './killstreak-tuning';
import { CHOPPER_GUN_SPLASH_MAX_DAMAGE, CHOPPER_MISSILE_MAX_DAMAGE } from './killstreak-runtime';
import { PASS65_KILLSTREAK_SOURCES } from './killstreak-catalog';

/**
 * HF-509 (owner 2026-09-05): "half the damage of the helicopter's machine gun,
 * the chopper gunner. Keep everything else the same."
 *
 * Two obligations, two halves of this file:
 *   1. the Chopper Gunner machine gun deals exactly half what it dealt before;
 *   2. nothing else moved.
 *
 * BASE_COMBAT_DAMAGE_TABLE below was READ OUT of the base commit 452d7aba by
 * running `collectCombatDamageTable()` against that tree and serialising the
 * result - it is not a hand-typed guess. Any future change to a weapon,
 * killstreak, flame or player damage number will fail here until it is
 * deliberately re-derived the same way.
 */
const BASE_COMBAT_DAMAGE_TABLE: Readonly<Record<string, number | string>> = Object.freeze({
  "weapon.carbine.policy": "standard",
  "weapon.carbine.base": 31,
  "weapon.carbine.minimum": 20,
  "weapon.carbine.falloffStartM": 24,
  "weapon.carbine.falloffEndM": 72,
  "weapon.carbine.headMultiplier": 1.5,
  "weapon.carbine.limbMultiplier": 0.82,
  "weapon.carbine.rpm": 650,
  "weapon.carbine.pellets": 1,
  "weapon.smg.policy": "standard",
  "weapon.smg.base": 23,
  "weapon.smg.minimum": 14,
  "weapon.smg.falloffStartM": 15,
  "weapon.smg.falloffEndM": 52,
  "weapon.smg.headMultiplier": 1.5,
  "weapon.smg.limbMultiplier": 0.8,
  "weapon.smg.rpm": 860,
  "weapon.smg.pellets": 1,
  "weapon.lmg.policy": "standard",
  "weapon.lmg.base": 27,
  "weapon.lmg.minimum": 18,
  "weapon.lmg.falloffStartM": 30,
  "weapon.lmg.falloffEndM": 82,
  "weapon.lmg.headMultiplier": 1.5,
  "weapon.lmg.limbMultiplier": 0.82,
  "weapon.lmg.rpm": 720,
  "weapon.lmg.pellets": 1,
  "weapon.scattergun.policy": "standard",
  "weapon.scattergun.base": 13,
  "weapon.scattergun.minimum": 5,
  "weapon.scattergun.falloffStartM": 10,
  "weapon.scattergun.falloffEndM": 38,
  "weapon.scattergun.headMultiplier": 1.35,
  "weapon.scattergun.limbMultiplier": 0.86,
  "weapon.scattergun.rpm": 95,
  "weapon.scattergun.pellets": 9,
  "weapon.sniper.policy": "standard",
  "weapon.sniper.base": 67,
  "weapon.sniper.minimum": 67,
  "weapon.sniper.falloffStartM": 96,
  "weapon.sniper.falloffEndM": 120,
  "weapon.sniper.headMultiplier": 3,
  "weapon.sniper.limbMultiplier": 0.9,
  "weapon.sniper.rpm": 55,
  "weapon.sniper.pellets": 1,
  "weapon.railgun.policy": "standard",
  "weapon.railgun.base": 50,
  "weapon.railgun.minimum": 50,
  "weapon.railgun.falloffStartM": 512,
  "weapon.railgun.falloffEndM": 512,
  "weapon.railgun.headMultiplier": 1,
  "weapon.railgun.limbMultiplier": 1,
  "weapon.railgun.rpm": 40,
  "weapon.railgun.pellets": 1,
  "weapon.pistol.policy": "standard",
  "weapon.pistol.base": 36,
  "weapon.pistol.minimum": 22,
  "weapon.pistol.falloffStartM": 20,
  "weapon.pistol.falloffEndM": 58,
  "weapon.pistol.headMultiplier": 1.5,
  "weapon.pistol.limbMultiplier": 0.84,
  "weapon.pistol.rpm": 420,
  "weapon.pistol.pellets": 1,
  "weapon.magnum.policy": "standard",
  "weapon.magnum.base": 52,
  "weapon.magnum.minimum": 34,
  "weapon.magnum.falloffStartM": 18,
  "weapon.magnum.falloffEndM": 55,
  "weapon.magnum.headMultiplier": 1.9,
  "weapon.magnum.limbMultiplier": 0.75,
  "weapon.magnum.rpm": 90,
  "weapon.magnum.pellets": 1,
  "weapon.machine-pistol.policy": "standard",
  "weapon.machine-pistol.base": 18,
  "weapon.machine-pistol.minimum": 11,
  "weapon.machine-pistol.falloffStartM": 11,
  "weapon.machine-pistol.falloffEndM": 34,
  "weapon.machine-pistol.headMultiplier": 1.5,
  "weapon.machine-pistol.limbMultiplier": 0.8,
  "weapon.machine-pistol.rpm": 900,
  "weapon.machine-pistol.pellets": 1,
  "weapon.mini-uzi.policy": "standard",
  "weapon.mini-uzi.base": 19,
  "weapon.mini-uzi.minimum": 8,
  "weapon.mini-uzi.falloffStartM": 9,
  "weapon.mini-uzi.falloffEndM": 36,
  "weapon.mini-uzi.headMultiplier": 1.45,
  "weapon.mini-uzi.limbMultiplier": 0.78,
  "weapon.mini-uzi.rpm": 1050,
  "weapon.mini-uzi.pellets": 1,
  "weapon.mp5.policy": "standard",
  "weapon.mp5.base": 25,
  "weapon.mp5.minimum": 16,
  "weapon.mp5.falloffStartM": 18,
  "weapon.mp5.falloffEndM": 58,
  "weapon.mp5.headMultiplier": 1.5,
  "weapon.mp5.limbMultiplier": 0.82,
  "weapon.mp5.rpm": 800,
  "weapon.mp5.pellets": 1,
  "weapon.m4a1.policy": "standard",
  "weapon.m4a1.base": 29,
  "weapon.m4a1.minimum": 19,
  "weapon.m4a1.falloffStartM": 26,
  "weapon.m4a1.falloffEndM": 78,
  "weapon.m4a1.headMultiplier": 1.5,
  "weapon.m4a1.limbMultiplier": 0.82,
  "weapon.m4a1.rpm": 700,
  "weapon.m4a1.pellets": 1,
  "weapon.ak-47.policy": "standard",
  "weapon.ak-47.base": 35,
  "weapon.ak-47.minimum": 22,
  "weapon.ak-47.falloffStartM": 28,
  "weapon.ak-47.falloffEndM": 86,
  "weapon.ak-47.headMultiplier": 1.5,
  "weapon.ak-47.limbMultiplier": 0.82,
  "weapon.ak-47.rpm": 600,
  "weapon.ak-47.pellets": 1,
  "weapon.minigun.policy": "standard",
  "weapon.minigun.base": 11.25,
  "weapon.minigun.minimum": 8.4375,
  "weapon.minigun.falloffStartM": 24,
  "weapon.minigun.falloffEndM": 74,
  "weapon.minigun.headMultiplier": 1,
  "weapon.minigun.limbMultiplier": 0.85,
  "weapon.minigun.rpm": 1200,
  "weapon.minigun.pellets": 1,
  "weapon.m14-ebr.policy": "standard",
  "weapon.m14-ebr.base": 52.1,
  "weapon.m14-ebr.minimum": 33.6,
  "weapon.m14-ebr.falloffStartM": 38,
  "weapon.m14-ebr.falloffEndM": 100,
  "weapon.m14-ebr.headMultiplier": 1.7,
  "weapon.m14-ebr.limbMultiplier": 0.82,
  "weapon.m14-ebr.rpm": 46,
  "weapon.m14-ebr.pellets": 1,
  "weapon.slug-shotgun.policy": "standard",
  "weapon.slug-shotgun.base": 88,
  "weapon.slug-shotgun.minimum": 45,
  "weapon.slug-shotgun.falloffStartM": 20,
  "weapon.slug-shotgun.falloffEndM": 72,
  "weapon.slug-shotgun.headMultiplier": 1.35,
  "weapon.slug-shotgun.limbMultiplier": 0.72,
  "weapon.slug-shotgun.rpm": 85,
  "weapon.slug-shotgun.pellets": 1,
  "weapon.flashlight-pistol.policy": "standard",
  "weapon.flashlight-pistol.base": 45,
  "weapon.flashlight-pistol.minimum": 28,
  "weapon.flashlight-pistol.falloffStartM": 18,
  "weapon.flashlight-pistol.falloffEndM": 56,
  "weapon.flashlight-pistol.headMultiplier": 1.5,
  "weapon.flashlight-pistol.limbMultiplier": 0.82,
  "weapon.flashlight-pistol.rpm": 300,
  "weapon.flashlight-pistol.pellets": 1,
  "weapon.explosive-crossbow.policy": "standard",
  "weapon.explosive-crossbow.base": 45,
  "weapon.explosive-crossbow.minimum": 45,
  "weapon.explosive-crossbow.falloffStartM": 120,
  "weapon.explosive-crossbow.falloffEndM": 121,
  "weapon.explosive-crossbow.headMultiplier": 1,
  "weapon.explosive-crossbow.limbMultiplier": 1,
  "weapon.explosive-crossbow.rpm": 72,
  "weapon.explosive-crossbow.pellets": 1,
  "weapon.flamethrower.policy": "standard",
  "weapon.flamethrower.base": 81,
  "weapon.flamethrower.minimum": 0,
  "weapon.flamethrower.falloffStartM": 8,
  "weapon.flamethrower.falloffEndM": 18,
  "weapon.flamethrower.headMultiplier": 1,
  "weapon.flamethrower.limbMultiplier": 1,
  "weapon.flamethrower.rpm": 600,
  "weapon.flamethrower.pellets": 1,
  "weapon.flare-gun.policy": "standard",
  "weapon.flare-gun.base": 42,
  "weapon.flare-gun.minimum": 42,
  "weapon.flare-gun.falloffStartM": 45,
  "weapon.flare-gun.falloffEndM": 90,
  "weapon.flare-gun.headMultiplier": 1,
  "weapon.flare-gun.limbMultiplier": 1,
  "weapon.flare-gun.rpm": 24,
  "weapon.flare-gun.pellets": 1,
  "weapon.crimson-flamethrower.policy": "standard",
  "weapon.crimson-flamethrower.base": 56.7,
  "weapon.crimson-flamethrower.minimum": 0,
  "weapon.crimson-flamethrower.falloffStartM": 8,
  "weapon.crimson-flamethrower.falloffEndM": 18,
  "weapon.crimson-flamethrower.headMultiplier": 1,
  "weapon.crimson-flamethrower.limbMultiplier": 1,
  "weapon.crimson-flamethrower.rpm": 600,
  "weapon.crimson-flamethrower.pellets": 1,
  "support.droneGunBaseline.id": "drone-gun-inspected-baseline-v1",
  "support.droneGunBaseline.damage": 12,
  "support.droneGunBaseline.minimumDamage": 8,
  "support.droneGunBaseline.falloffStartM": 18,
  "support.droneGunBaseline.maximumRangeM": 45,
  "support.droneGunBaseline.cadenceMs": 300,
  "support.pilotedDroneGun.id": "piloted-drone-gun-half-baseline-v1",
  "support.pilotedDroneGun.damage": 6,
  "support.pilotedDroneGun.minimumDamage": 4,
  "support.pilotedDroneGun.falloffStartM": 18,
  "support.pilotedDroneGun.maximumRangeM": 45,
  "support.pilotedDroneGun.cadenceMs": 240,
  "support.droneSwarmGun.id": "drone-swarm-gun-double-baseline-v1",
  "support.droneSwarmGun.damage": 24,
  "support.droneSwarmGun.minimumDamage": 16,
  "support.droneSwarmGun.falloffStartM": 18,
  "support.droneSwarmGun.maximumRangeM": 45,
  "support.droneSwarmGun.cadenceMs": 240,
  "flame.carpet-bomber-napalm.damagePerSecond": 20,
  "flame.carpet-bomber-napalm.previousDamagePerSecond": 10,
  "flame.flare-gun-burn.damagePerSecond": 20,
  "flame.flare-gun-burn.previousDamagePerSecond": 10,
  "flame.flamethrower-ground-fire.damagePerSecond": 20,
  "flame.flamethrower-ground-fire.previousDamagePerSecond": 10,
  "flame.multiplier": 2,
  "killstreak.chopperMissileMaxDamage": 240,
  "killstreak.chopperGunSplashMaxDamage": 16,
  "killstreak.chopperHealth": 800,
  "killstreak.droneHealth": 50,
  "killstreak.carpetBomberMaxDamage": 240,
  "killstreak.carpetBomberDamageMultiplier": 3,
  "killstreak.triPassMaxDamage": 450,
  "killstreak.hunterSwarmDirectDamage": 200,
  "killstreak.hunterSwarmSplashDamage": 100,
  "killstreak.hunterSwarmProneMultiplier": 0.09,
  "killstreak.nukeDamage": 1000,
  "player.grenadeMaxDamage": 230,
  "player.meleeDamage": 100,
  "player.headshotMultiplier": 1.5,
  "player.sniperHeadshotMultiplier": 3,
  "player.fallDamageMultiplier": 0.5,
  "player.botDamageMultiplier": 0.25,
  "player.adrenalineDamageMultiplier": 1.1,
  "player.overdriveDamageMultiplier": 2,
  "player.railgunDamage": 50,
  "player.explosiveBoltDirectDamage": 45,
  "player.explosiveBoltBlastMaxDamage": 60,
  "player.explosiveBoltBlastMinDamage": 15,
});

describe('HF-509 Chopper Gunner machine-gun damage', () => {
  it('names exactly one Chopper Gunner in the killstreak catalog', () => {
    // The owner said "the helicopter's machine gun, the chopper gunner". There
    // is one streak with that display name; the player-carried `minigun` is a
    // separate hand weapon and is pinned unchanged by the table below.
    const chopperGunners = PASS65_KILLSTREAK_SOURCES.filter((entry) => entry.displayName === 'Chopper Gunner');
    expect(chopperGunners.map((entry) => entry.id)).toEqual(['chopper']);
  });

  it('halves the per-hit machine-gun damage and nothing else on the profile', () => {
    // Before HF-509 (shipped at base commit 452d7aba):
    expect(CHOPPER_GUN_DAMAGE_HF458).toBe(25.5);
    expect(CHOPPER_GUN_MINIMUM_DAMAGE_HF458).toBe(16.5);

    // After HF-509:
    expect(CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER).toBe(0.5);
    expect(CHOPPER_GUN_DAMAGE_AFTER).toBe(12.75);
    expect(CHOPPER_GUN_MINIMUM_DAMAGE_AFTER).toBe(8.25);
    expect(CHOPPER_GUN_DAMAGE_AFTER).toBe(CHOPPER_GUN_DAMAGE_HF458 / 2);
    expect(CHOPPER_GUN_MINIMUM_DAMAGE_AFTER).toBe(CHOPPER_GUN_MINIMUM_DAMAGE_HF458 / 2);
    expect(CHOPPER_GUN_PROFILE.damage).toBe(CHOPPER_GUN_DAMAGE_AFTER);
    expect(CHOPPER_GUN_PROFILE.minimumDamage).toBe(CHOPPER_GUN_MINIMUM_DAMAGE_AFTER);
    expect(CHOPPER_GUN_PROFILE.damageMultiplierFromV2).toBe(CHOPPER_GUN_DAMAGE_MULTIPLIER_FROM_V2);
    expect(CHOPPER_GUN_DAMAGE_MULTIPLIER_FROM_V2).toBe(0.375);

    // "Keep everything else the same": every other field of the profile holds
    // the exact value it had at the base commit.
    expect(CHOPPER_GUN_PROFILE.falloffStartM).toBe(28);
    expect(CHOPPER_GUN_PROFILE.maximumRangeM).toBe(78);
    expect(CHOPPER_GUN_PROFILE.cadenceMs).toBe(240);
    expect(CHOPPER_GUN_PROFILE.rpm).toBe(250);
    expect(CHOPPER_GUN_PROFILE.penetration).toBe('solid-occluded');
    expect(CHOPPER_GUN_PROFILE.criticalHits).toBe(false);

    // Splash and the missile payload are separate systems the owner did not
    // ask to move, so they stay where they were.
    expect(CHOPPER_GUN_SPLASH_MAX_DAMAGE).toBe(16);
    expect(CHOPPER_MISSILE_MAX_DAMAGE).toBe(240);
  });

  it('halves what the shared host-side damage oracle actually admits', () => {
    // The oracle rounds and floors at 1, so halving the profile field is only
    // meaningful if the ADMITTED shell halves too. Point-blank and max-range
    // are the two ends of the falloff ramp.
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, 0)).toBe(13);
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, 18)).toBe(13);
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, CHOPPER_GUN_PROFILE.maximumRangeM)).toBe(8);
    // Base-commit admitted values were 26 / 26 / 17 respectively.
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, 0)).toBeLessThan(26);
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, CHOPPER_GUN_PROFILE.maximumRangeM)).toBeLessThan(17);
    // Out of range is still zero, not a floored 1.
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, CHOPPER_GUN_PROFILE.maximumRangeM + 0.01)).toBe(0);
  });

  it('leaves every other weapon and killstreak damage number at its base-commit value', () => {
    const current = collectCombatDamageTable();
    expect(current).toEqual(BASE_COMBAT_DAMAGE_TABLE);
    // Guard the guard: the snapshot must actually be covering the surface.
    expect(Object.keys(BASE_COMBAT_DAMAGE_TABLE).length).toBe(237);
    // The Chopper Gunner gun is deliberately NOT in the unchanged table.
    expect(Object.keys(BASE_COMBAT_DAMAGE_TABLE).some((key) => key.startsWith('support.chopperGun'))).toBe(false);
  });
});
