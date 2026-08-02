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
/** Secure test-bay stations expose the entire canonical runtime catalog. */
export const GUN_RANGE_FIELD_TEST_WEAPONS: readonly WeaponId[] = WEAPON_IDS;

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
 * pickup, and all host-authoritative map specials, so the canonical set is
 * intentionally exhaustive.
 */
export function weaponPrewarmCatalogForArena(
  _arenaId: ArenaId,
  _gunRangeSidearm: SidearmWeaponId,
): readonly WeaponId[] {
  // A retained menu-video corpus is also the smooth map-switch boundary.
  // Shrinking it for Gun Range would force all normal-match models through a
  // second decode/compile cycle when the player changes maps.
  return WEAPON_IDS;
}
