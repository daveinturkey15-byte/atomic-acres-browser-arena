import {
  applyGuestCombatInventoryProjection,
} from './guest-combat-inventory-authority';
import {
  ORDINARY_WEAPON_IDS,
} from './protocol';
import type {
  GuestCombatInventory,
  GuestCombatInventoryProjection,
  PlayerSnapshot,
  ReloadResultMessage,
  StateMessage,
} from './protocol';

export function applyRemoteInventoryProjection(
  authority: GuestCombatInventory,
  projection: GuestCombatInventoryProjection,
  snapshot: PlayerSnapshot,
  sidearm: PlayerSnapshot['secondary'],
): GuestCombatInventory | null {
  return applyGuestCombatInventoryProjection(authority, projection, snapshot.primary, sidearm);
}

export function applyRemoteInventoryProjectionToMaps(
  inventories: Map<string, GuestCombatInventory>, revisions: Map<string, number>, playerId: string,
  projection: GuestCombatInventoryProjection, snapshot: PlayerSnapshot, sidearm: PlayerSnapshot['secondary'],
): boolean {
  const authority = inventories.get(playerId);
  if (!authority || projection.revision < (revisions.get(playerId) ?? -1)) return false;
  const next = applyRemoteInventoryProjection(authority, projection, snapshot, sidearm);
  if (!next) return false;
  inventories.set(playerId, next); revisions.set(playerId, projection.revision); return true;
}

export function createCanonicalRemoteState(
  snapshot: PlayerSnapshot,
  hostTimeMs: number,
  continuity: number,
  rateHz: StateMessage['rateHz'],
  combatInventory: GuestCombatInventoryProjection | null,
): StateMessage {
  return {
    type: 'state', player: snapshot, hostTimeMs, continuity, rateHz,
    ...(combatInventory ? { combatInventory } : {}),
  };
}

export function applyRemoteReloadResult(
  snapshot: PlayerSnapshot,
  authority: GuestCombatInventory,
  message: ReloadResultMessage,
  sidearm: PlayerSnapshot['secondary'],
): { snapshot: PlayerSnapshot; inventory: GuestCombatInventory } | null {
  const inventory = applyGuestCombatInventoryProjection(authority, message.combatInventory, snapshot.primary, sidearm);
  if (!inventory) return null;
  const accepted = message.status === 'started' || message.status === 'committed';
  return {
    inventory,
    snapshot: { ...snapshot, ...(accepted ? { weapon: message.weapon } : {}), reloading: message.status === 'started' },
  };
}
/**
 * F1: allow-list a guest-claimed equipped weapon against the admitted pair.
 *
 * Runs on the host after the railgun/timed-map holder fences (which drop
 * non-holder special claims) and after the primary/secondary gates, and clamps
 * a forged ordinary weapon (e.g. `sniper` over an `m4a1/pistol` loadout) to the
 * admitted primary BEFORE the host stores (`remote.snapshot`) or rebroadcasts
 * (`createCanonicalRemoteState`) it. Legitimate holds pass through untouched:
 * either admitted-pair member, a holder-gated special that survived its fence,
 * or `crimson-flamethrower`, a personal care-package grant with no host holder
 * registry (cf. `canonicalRetainedGuestSnapshot`, which likewise passes it
 * through instead of clamping it to primary).
 */
export function clampAdmittedHeldWeapon(
  snapshot: PlayerSnapshot,
  sidearm: PlayerSnapshot['secondary'],
): PlayerSnapshot {
  const claimed = snapshot.weapon;
  if (claimed === snapshot.primary || claimed === sidearm) return snapshot;
  if (!ORDINARY_WEAPON_IDS.some((candidate) => candidate === claimed)) return snapshot;
  return { ...snapshot, weapon: snapshot.primary };
}
