import { WEAPONS } from './gameplay';
import {
  type GuestCombatInventory,
  type OrdinaryWeaponId,
  type ReloadIntentMessage,
} from './protocol';
import { setGuestCombatInventoryWeapon } from './guest-combat-inventory-authority';

export const GUEST_RELOAD_EXPIRY_GRACE_MS = 10_000;

export type GuestReloadPending = Readonly<{
  connectionEpoch: string;
  lifeId: number;
  actionSequence: number;
  weapon: OrdinaryWeaponId;
  startedAtHostTimeMs: number;
  completesAtHostTimeMs: number;
  expiresAtHostTimeMs: number;
}>;

export type GuestReloadAuthorityState = Readonly<{
  connectionEpoch: string;
  lifeId: number;
  lastActionSequence: number;
  pending: GuestReloadPending | null;
}>;

export type GuestReloadReason =
  | 'accepted'
  | 'action-sequence'
  | 'connection-epoch'
  | 'life-mismatch'
  | 'weapon-mismatch'
  | 'shooter-dead'
  | 'already-pending'
  | 'nothing-to-reload'
  | 'no-pending-reload'
  | 'duration-pending'
  | 'cancelled'
  | 'expired'
  | 'committed';

export type GuestReloadAdmission = Readonly<{
  accepted: boolean;
  reason: GuestReloadReason;
  state: GuestReloadAuthorityState;
}>;

export type GuestReloadAdvance = Readonly<{
  status: 'pending' | 'committed' | 'cancelled';
  reason: GuestReloadReason;
  state: GuestReloadAuthorityState;
  inventory: GuestCombatInventory;
  actionSequence: number | null;
  weapon: OrdinaryWeaponId | null;
}>;

export function createGuestReloadAuthorityState(
  connectionEpoch: string,
  lifeId: number,
): GuestReloadAuthorityState {
  return Object.freeze({ connectionEpoch, lifeId, lastActionSequence: -1, pending: null });
}

export function admitGuestReloadIntent(
  state: GuestReloadAuthorityState,
  message: ReloadIntentMessage,
  context: Readonly<{
    connectionEpoch: string;
    lifeId: number;
    weapon: OrdinaryWeaponId;
    alive: boolean;
    nowHostTimeMs: number;
    durationMs: number;
    inventory: GuestCombatInventory;
  }>,
): GuestReloadAdmission {
  const reject = (reason: GuestReloadReason): GuestReloadAdmission => Object.freeze({ accepted: false, reason, state });
  if (message.connectionEpoch !== context.connectionEpoch || state.connectionEpoch !== context.connectionEpoch) {
    return reject('connection-epoch');
  }
  if (message.lifeId !== context.lifeId || state.lifeId !== context.lifeId) return reject('life-mismatch');
  if (message.actionSequence !== state.lastActionSequence + 1) return reject('action-sequence');
  if (!context.alive) return reject('shooter-dead');

  if (message.action === 'cancel') {
    if (!state.pending) return reject('no-pending-reload');
    if (message.weapon !== state.pending.weapon) return reject('weapon-mismatch');
    return Object.freeze({
      accepted: true,
      reason: 'cancelled',
      state: Object.freeze({ ...state, lastActionSequence: message.actionSequence, pending: null }),
    });
  }

  if (message.weapon !== context.weapon) return reject('weapon-mismatch');
  if (state.pending) return reject('already-pending');
  const spec = WEAPONS[message.weapon];
  const ammo = context.inventory.ammo[message.weapon];
  const reserve = context.inventory.reserve[message.weapon];
  if (ammo >= spec.mag || reserve <= 0) return reject('nothing-to-reload');
  const durationMs = Math.max(1, Math.floor(context.durationMs));
  const pending = Object.freeze({
    connectionEpoch: context.connectionEpoch,
    lifeId: context.lifeId,
    actionSequence: message.actionSequence,
    weapon: message.weapon,
    startedAtHostTimeMs: context.nowHostTimeMs,
    completesAtHostTimeMs: context.nowHostTimeMs + durationMs,
    expiresAtHostTimeMs: context.nowHostTimeMs + durationMs + GUEST_RELOAD_EXPIRY_GRACE_MS,
  });
  return Object.freeze({
    accepted: true,
    reason: 'accepted',
    state: Object.freeze({ ...state, lastActionSequence: message.actionSequence, pending }),
  });
}

export function advanceGuestReloadAuthority(
  state: GuestReloadAuthorityState,
  context: Readonly<{
    connectionEpoch: string;
    lifeId: number;
    weapon: OrdinaryWeaponId;
    alive: boolean;
    nowHostTimeMs: number;
    inventory: GuestCombatInventory;
    preserveReserve?: boolean;
  }>,
): GuestReloadAdvance {
  const pending = state.pending;
  if (!pending) return Object.freeze({
    status: 'cancelled', reason: 'no-pending-reload', state, inventory: context.inventory,
    actionSequence: null, weapon: null,
  });
  const cancel = (reason: GuestReloadReason): GuestReloadAdvance => Object.freeze({
    status: 'cancelled',
    reason,
    state: Object.freeze({ ...state, pending: null }),
    inventory: context.inventory,
    actionSequence: pending.actionSequence,
    weapon: pending.weapon,
  });
  if (pending.connectionEpoch !== context.connectionEpoch) return cancel('connection-epoch');
  if (pending.lifeId !== context.lifeId) return cancel('life-mismatch');
  if (!context.alive) return cancel('shooter-dead');
  if (pending.weapon !== context.weapon) return cancel('weapon-mismatch');
  if (context.nowHostTimeMs > pending.expiresAtHostTimeMs) return cancel('expired');
  if (context.nowHostTimeMs < pending.completesAtHostTimeMs) return Object.freeze({
    status: 'pending', reason: 'duration-pending', state, inventory: context.inventory,
    actionSequence: pending.actionSequence, weapon: pending.weapon,
  });

  const spec = WEAPONS[pending.weapon];
  const ammo = context.inventory.ammo[pending.weapon];
  const reserve = context.inventory.reserve[pending.weapon];
  const moved = Math.min(spec.mag - ammo, reserve);
  if (moved <= 0) return cancel('nothing-to-reload');
  return Object.freeze({
    status: 'committed',
    reason: 'committed',
    state: Object.freeze({ ...state, pending: null }),
    inventory: setGuestCombatInventoryWeapon(
      context.inventory,
      pending.weapon,
      ammo + moved,
      context.preserveReserve ? reserve : reserve - moved,
    ),
    actionSequence: pending.actionSequence,
    weapon: pending.weapon,
  });
}
