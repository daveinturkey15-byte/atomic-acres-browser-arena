import { GUN_RANGE_WEAPON_STATIONS } from './gun-range-armory';
import type { ArenaId } from './map-selection';
import {
  WEAPON_IDS,
  type PrimaryWeaponId,
  type SidearmWeaponId,
  type WeaponId,
} from './protocol';

/**
 * A live WebGPU weapon switch may never compile a first-person pipeline. Keep
 * this limit coupled to the canonical protocol registry so new weapons are
 * admitted by deployment prewarm automatically instead of regressing later.
 */
export const RUNTIME_WEAPON_RETENTION_LIMIT = WEAPON_IDS.length;
export const GUN_RANGE_FIELD_TEST_WEAPONS = Object.freeze([
  'explosive-crossbow',
  'm14-ebr',
] as const satisfies readonly WeaponId[]);

function uniqueWeaponIds(ids: readonly WeaponId[]): readonly WeaponId[] {
  return Object.freeze([...new Set(ids)]);
}

/** Keep menu loadout edits light; full gameplay readiness belongs to deployment. */
export function menuWeaponPrewarmCatalog(
  primary: PrimaryWeaponId,
  secondary: SidearmWeaponId,
): readonly WeaponId[] {
  return uniqueWeaponIds([primary, secondary]);
}

/**
 * Every weapon that can become the local first-person view during this arena.
 * Normal matches permit any loadout on redeploy, every primary as a corpse
 * pickup, and the railgun, so the canonical set is intentionally exhaustive.
 */
export function weaponPrewarmCatalogForArena(
  arenaId: ArenaId,
  gunRangeSidearm: SidearmWeaponId,
): readonly WeaponId[] {
  if (arenaId !== 'gun-range') return WEAPON_IDS;
  return uniqueWeaponIds([
    ...GUN_RANGE_WEAPON_STATIONS.map((station) => station.weapon),
    gunRangeSidearm,
    ...GUN_RANGE_FIELD_TEST_WEAPONS,
  ]);
}
