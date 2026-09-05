import {
  applyGuestCombatInventoryProjection,
} from './guest-combat-inventory-authority';
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
