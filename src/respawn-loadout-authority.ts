import type { GrenadeId, PlayerSnapshot, PrimaryWeaponId, SidearmWeaponId } from './protocol';

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

/** Explicit host-authorized life boundary for one admitted guest snapshot. */
export type AuthoritativeRespawnTransition = Readonly<{
  /** A death-to-life transition the host health authority just admitted. */
  respawned: boolean;
  /** An explicit class redeploy the host already authorized. */
  redeployed: boolean;
}>;

/**
 * Admit the held loadout for one host-side guest snapshot.
 *
 * A new life (respawn or authorized redeploy) resets to the authored loadout:
 * the respawn seeds from the host-retained canonical class fields because the
 * guest packet may still carry the prior special, while a redeploy seeds from
 * the already-authorized incoming selection. Continuous (non-boundary) state
 * keeps the admitted weapon untouched so a legitimate secondary swap — and a
 * secondary reload in flight — survives; the allow-list, holder, and
 * primary/secondary fences downstream still run on the preserved claim.
 */
export function admitAuthoritativeRespawnLoadout(
  incoming: PlayerSnapshot,
  canonicalClass: Readonly<{
    primary: PrimaryWeaponId;
    secondary: SidearmWeaponId;
    grenade: GrenadeId;
  }>,
  transition: AuthoritativeRespawnTransition,
  authoritativeHp: number,
): PlayerSnapshot {
  if (!transition.respawned && !transition.redeployed) {
    return { ...incoming, hp: authoritativeHp };
  }
  const seed = transition.respawned ? canonicalClass : incoming;
  return { ...incoming, ...authoredRespawnLoadout(seed), hp: authoritativeHp };
}
