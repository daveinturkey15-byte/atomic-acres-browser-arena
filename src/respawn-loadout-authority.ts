import type { GrenadeId, PrimaryWeaponId, SidearmWeaponId } from './protocol';

/** The class-authored weapons that a new life is allowed to start with. */
export type AuthoredRespawnLoadout = Readonly<{
  primary: PrimaryWeaponId;
  secondary: SidearmWeaponId;
  grenade: GrenadeId;
  /** A new life always equips the authored primary, never the prior special. */
  weapon: PrimaryWeaponId;
}>;

/**
 * Build the canonical combat loadout for a new life. This deliberately drops
 * transient pickup/swap state; the caller replenishes both authored weapons
 * from their weapon caps and clears any special-weapon authority separately.
 */
export function authoredRespawnLoadout(input: Readonly<{
  primary: PrimaryWeaponId;
  secondary: SidearmWeaponId;
  grenade: GrenadeId;
}>): AuthoredRespawnLoadout {
  return Object.freeze({
    primary: input.primary,
    secondary: input.secondary,
    grenade: input.grenade,
    weapon: input.primary,
  });
}
