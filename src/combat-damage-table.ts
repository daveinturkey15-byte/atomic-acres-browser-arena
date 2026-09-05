import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE,
  EXPLOSIVE_BOLT_BLAST_MIN_DAMAGE,
  EXPLOSIVE_BOLT_DIRECT_DAMAGE,
} from './combat/ordnance';
import {
  HUNTER_SWARM_DIRECT_DAMAGE,
  HUNTER_SWARM_SPLASH_DAMAGE,
  HUNTER_SWARM_PRONE_MULTIPLIER,
  NUKE_DAMAGE,
  TRI_PASS_MAX_DAMAGE,
} from './field-support';
import { FLAME_DAMAGE_CATALOG, HF279_FLAME_DAMAGE_MULTIPLIER } from './flame-damage-contract';
import {
  BOT_DAMAGE_MULTIPLIER,
  FALL_DAMAGE_MULTIPLIER,
  GRENADE_MAX_DAMAGE,
  HEADSHOT_DAMAGE_MULTIPLIER,
  MELEE_DAMAGE,
  SNIPER_HEADSHOT_DAMAGE_MULTIPLIER,
} from './gameplay';
import {
  ADRENALINE_DAMAGE_MULTIPLIER,
  CARPET_BOMBER_DAMAGE_MULTIPLIER,
  CARPET_BOMBER_MAX_DAMAGE,
  CHOPPER_GUN_SPLASH_MAX_DAMAGE,
  CHOPPER_MISSILE_MAX_DAMAGE,
  DRONE_HEALTH,
  CHOPPER_HEALTH,
} from './killstreak-runtime';
import {
  DRONE_GUN_PROFILE,
  DRONE_SWARM_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE,
} from './killstreak-support-catalog';
import { OVERDRIVE_DAMAGE_MULTIPLIER } from './overdrive';
import { RAILGUN_DAMAGE } from './railgun-authority';

/**
 * HF-509 regression surface. The owner asked for exactly one number to move -
 * the Chopper Gunner machine gun's per-hit damage - so every OTHER admitted
 * damage number in the game is collected here and pinned by
 * `hf509-chopper-gunner-damage.test.ts` against the values read out of the
 * base commit. Chopper Gunner's own profile is deliberately absent: it is
 * asserted separately, with its before/after ratio, in that same test.
 *
 * This is a plain data collector with no side effects, so the snapshot the
 * test compares against is derived from the shipping modules rather than
 * hand-transcribed.
 */
export type CombatDamageTable = Readonly<Record<string, number | string>>;

type SupportGunSnapshotProfile = Readonly<{
  id: string;
  damage: number;
  minimumDamage: number;
  falloffStartM: number;
  maximumRangeM: number;
  cadenceMs: number;
}>;

function supportGunRows(prefix: string, profile: SupportGunSnapshotProfile): Record<string, number | string> {
  return {
    [`${prefix}.id`]: profile.id,
    [`${prefix}.damage`]: profile.damage,
    [`${prefix}.minimumDamage`]: profile.minimumDamage,
    [`${prefix}.falloffStartM`]: profile.falloffStartM,
    [`${prefix}.maximumRangeM`]: profile.maximumRangeM,
    [`${prefix}.cadenceMs`]: profile.cadenceMs,
  };
}

export function collectCombatDamageTable(): CombatDamageTable {
  const rows: Record<string, number | string> = {};

  for (const weapon of WEAPON_CATALOG) {
    const prefix = `weapon.${weapon.id}`;
    rows[`${prefix}.policy`] = weapon.damage.policy;
    rows[`${prefix}.base`] = weapon.damage.base;
    rows[`${prefix}.minimum`] = weapon.damage.minimum;
    rows[`${prefix}.falloffStartM`] = weapon.damage.falloffStartM;
    rows[`${prefix}.falloffEndM`] = weapon.damage.falloffEndM;
    rows[`${prefix}.headMultiplier`] = weapon.damage.headMultiplier;
    rows[`${prefix}.limbMultiplier`] = weapon.damage.limbMultiplier;
    rows[`${prefix}.rpm`] = weapon.rpm;
    rows[`${prefix}.pellets`] = weapon.pellets;
  }

  Object.assign(rows, supportGunRows('support.droneGunBaseline', DRONE_GUN_PROFILE));
  Object.assign(rows, supportGunRows('support.pilotedDroneGun', PILOTED_DRONE_GUN_PROFILE));
  Object.assign(rows, supportGunRows('support.droneSwarmGun', DRONE_SWARM_GUN_PROFILE));

  for (const profile of Object.values(FLAME_DAMAGE_CATALOG)) {
    rows[`flame.${profile.id}.damagePerSecond`] = profile.damagePerSecond;
    rows[`flame.${profile.id}.previousDamagePerSecond`] = profile.previousDamagePerSecond;
  }
  rows['flame.multiplier'] = HF279_FLAME_DAMAGE_MULTIPLIER;

  rows['killstreak.chopperMissileMaxDamage'] = CHOPPER_MISSILE_MAX_DAMAGE;
  rows['killstreak.chopperGunSplashMaxDamage'] = CHOPPER_GUN_SPLASH_MAX_DAMAGE;
  rows['killstreak.chopperHealth'] = CHOPPER_HEALTH;
  rows['killstreak.droneHealth'] = DRONE_HEALTH;
  rows['killstreak.carpetBomberMaxDamage'] = CARPET_BOMBER_MAX_DAMAGE;
  rows['killstreak.carpetBomberDamageMultiplier'] = CARPET_BOMBER_DAMAGE_MULTIPLIER;
  rows['killstreak.triPassMaxDamage'] = TRI_PASS_MAX_DAMAGE;
  rows['killstreak.hunterSwarmDirectDamage'] = HUNTER_SWARM_DIRECT_DAMAGE;
  rows['killstreak.hunterSwarmSplashDamage'] = HUNTER_SWARM_SPLASH_DAMAGE;
  rows['killstreak.hunterSwarmProneMultiplier'] = HUNTER_SWARM_PRONE_MULTIPLIER;
  rows['killstreak.nukeDamage'] = NUKE_DAMAGE;

  rows['player.grenadeMaxDamage'] = GRENADE_MAX_DAMAGE;
  rows['player.meleeDamage'] = MELEE_DAMAGE;
  rows['player.headshotMultiplier'] = HEADSHOT_DAMAGE_MULTIPLIER;
  rows['player.sniperHeadshotMultiplier'] = SNIPER_HEADSHOT_DAMAGE_MULTIPLIER;
  rows['player.fallDamageMultiplier'] = FALL_DAMAGE_MULTIPLIER;
  rows['player.botDamageMultiplier'] = BOT_DAMAGE_MULTIPLIER;
  rows['player.adrenalineDamageMultiplier'] = ADRENALINE_DAMAGE_MULTIPLIER;
  rows['player.overdriveDamageMultiplier'] = OVERDRIVE_DAMAGE_MULTIPLIER;
  rows['player.railgunDamage'] = RAILGUN_DAMAGE;
  rows['player.explosiveBoltDirectDamage'] = EXPLOSIVE_BOLT_DIRECT_DAMAGE;
  rows['player.explosiveBoltBlastMaxDamage'] = EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE;
  rows['player.explosiveBoltBlastMinDamage'] = EXPLOSIVE_BOLT_BLAST_MIN_DAMAGE;

  return Object.freeze(rows);
}
