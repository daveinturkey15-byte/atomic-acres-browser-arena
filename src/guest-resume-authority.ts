import { parseKillstreakLoadout, type KillstreakLoadoutV1 } from './killstreak-catalog';
import { guestCombatInventoryWithinWeaponCaps } from './guest-combat-inventory-authority';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type GuestCombatInventory,
  type GuestResumeAckMessage,
  type GuestResumeAuthorityMessage,
  type GuestResumeNackMessage,
  type PlayerSnapshot,
} from './protocol';

export type GuestResumeAdmissionReason =
  | 'accepted'
  | 'wrong-host'
  | 'wrong-recipient'
  | 'wrong-connection-epoch'
  | 'wrong-match-epoch'
  | 'invalid-inventory'
  | 'replay';

export type GuestResumeAdmission = Readonly<{
  accepted: boolean;
  reason: GuestResumeAdmissionReason;
}>;

export type GuestResumeAuthorityContext = Readonly<{
  expectedHostId: string | null;
  expectedPlayerId: string;
  expectedConnectionEpoch: string;
  expectedMatchEpoch: number;
  seenNonces: ReadonlySet<number>;
}>;

export type GuestResumeProjection = Readonly<{
  player: Readonly<PlayerSnapshot>;
  worldRevision: number;
  combatInventory: GuestCombatInventory;
  combatInventoryRevision: number;
  attempt: number;
  placementReason: GuestResumeAuthorityMessage['placementReason'];
  continuity: number;
  respawnRemainingMs: number;
  loadout: KillstreakLoadoutV1;
}>;

/** A resume projection may only touch physics after the exact host-authored
 * interactive-world revision has been applied. The reliable event-lane mirror
 * normally establishes this ordering; this gate also covers a delayed or lost
 * transient state lane without accepting a stale collider graph. */
export function guestResumeWorldRevisionReady(appliedRevision: number | null, requiredRevision: number): boolean {
  return appliedRevision !== null && Number.isSafeInteger(appliedRevision) && appliedRevision >= 0
    && Number.isSafeInteger(requiredRevision) && requiredRevision >= 0
    && appliedRevision >= requiredRevision;
}

export function admitGuestResumeAuthority(
  message: GuestResumeAuthorityMessage,
  context: GuestResumeAuthorityContext,
): GuestResumeAdmission {
  if (!context.expectedHostId || message.by !== context.expectedHostId) {
    return Object.freeze({ accepted: false, reason: 'wrong-host' });
  }
  if (message.forPlayerId !== context.expectedPlayerId || message.player.id !== context.expectedPlayerId) {
    return Object.freeze({ accepted: false, reason: 'wrong-recipient' });
  }
  if (message.connectionEpoch !== context.expectedConnectionEpoch) {
    return Object.freeze({ accepted: false, reason: 'wrong-connection-epoch' });
  }
  if (message.matchEpoch !== context.expectedMatchEpoch) {
    return Object.freeze({ accepted: false, reason: 'wrong-match-epoch' });
  }
  if (context.seenNonces.has(message.nonce)) {
    return Object.freeze({ accepted: false, reason: 'replay' });
  }
  if (!guestCombatInventoryWithinWeaponCaps(message.combatInventory)) {
    return Object.freeze({ accepted: false, reason: 'invalid-inventory' });
  }
  return Object.freeze({ accepted: true, reason: 'accepted' });
}

/** Clone every authority-bearing collection before it is applied to mutable
 * browser runtime state. Protocol validation has already rejected malformed
 * snapshots; parsing the support loadout here retains its canonical slot rules. */
export function guestResumeProjection(message: GuestResumeAuthorityMessage): GuestResumeProjection {
  if (message.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) throw new Error('guest resume protocol mismatch');
  return Object.freeze({
    player: Object.freeze({ ...message.player }),
    worldRevision: message.worldRevision,
    combatInventory: Object.freeze({
      ammo: Object.freeze({ ...message.combatInventory.ammo }),
      reserve: Object.freeze({ ...message.combatInventory.reserve }),
      grenades: message.combatInventory.grenades,
    }),
    combatInventoryRevision: message.combatInventoryRevision,
    attempt: message.attempt,
    placementReason: message.placementReason,
    continuity: message.continuity,
    respawnRemainingMs: message.respawnRemainingMs,
    loadout: parseKillstreakLoadout(message.loadout),
  });
}

export const MAX_GUEST_RESUME_RETRIES = 2;

/** A NACK is authority-bearing input only when it names the exact pending
 * connection, match, world revision, attempt and authority nonce. */
export function admitGuestResumeNack(
  message: GuestResumeNackMessage,
  pending: GuestResumeAuthorityMessage,
  expectedPlayerId: string,
): boolean {
  return message.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
    && message.by === expectedPlayerId
    && pending.forPlayerId === expectedPlayerId
    && message.connectionEpoch === pending.connectionEpoch
    && message.matchEpoch === pending.matchEpoch
    && message.worldRevision === pending.worldRevision
    && message.authorityNonce === pending.nonce
    && message.attempt === pending.attempt;
}

export function guestResumeRetryAllowed(attempt: number): boolean {
  return Number.isSafeInteger(attempt) && attempt >= 0 && attempt < MAX_GUEST_RESUME_RETRIES;
}

export type GuestResumeAckContext = Readonly<{
  expectedPlayerId: string;
  expectedConnectionEpoch: string;
  expectedMatchEpoch: number;
  expectedAuthorityNonce: number;
}>;

export function admitGuestResumeAck(
  message: GuestResumeAckMessage,
  context: GuestResumeAckContext,
): boolean {
  return message.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
    && message.by === context.expectedPlayerId
    && message.connectionEpoch === context.expectedConnectionEpoch
    && message.matchEpoch === context.expectedMatchEpoch
    && message.authorityNonce === context.expectedAuthorityNonce;
}
