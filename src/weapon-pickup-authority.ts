import type { PickupResultDropRecord, PickupResultReason } from './protocol';

/**
 * PASS 95 — HF-504 ("cannot reload or pick up guns"), the host-authoritative
 * ground-weapon transaction.
 *
 * WHY THIS MODULE EXISTS, measured rather than assumed.
 *
 * The wire shape for ground-weapon pickup was already host-authoritative: a
 * guest sends `PickupMessage` naming a host-owned drop id, the host answers
 * every request with a `PickupResultMessage`, and the guest either confirms or
 * reverts its optimistic swap. Three things about the transaction were not
 * yet true, and each of them is visible to a player as "I pressed F and the
 * gun did not come":
 *
 *   1. IT WAS NOT IDEMPOTENT. The host recorded every consumed nonce in one
 *      global `processedNonces` set and answered a repeat with
 *      `status: 'rejected', reason: 'duplicate'`. The guest's rejection path
 *      restores the pre-swap inventory. So a request the host ACCEPTED, whose
 *      result was then lost or arrived after the guest's 1,500 ms deadline,
 *      became a guest that reverted a gun the host had already given it. The
 *      two sides then disagreed about the guest's primary weapon, and the
 *      state-admission path at the `authorizedRemotePickups` window (2 s)
 *      began rejecting the guest's own snapshots.
 *
 *   2. THE GUEST NEVER RETRIED. It sent once and reverted after 1,500 ms. One
 *      dropped datagram cost the pickup even when the host was healthy.
 *
 *   3. THE HOST DID NOT CHECK LINE OF SIGHT. Range was checked; sight was not.
 *      The timed-map-weapon claim path (`acceptTimedMapWeaponClaim`) has
 *      always traced eye-to-pickup against the world colliders, so a ground
 *      gun on the far side of a wall was reachable by radius alone.
 *
 * Everything here is pure. The host's THREE.js/collider reads stay in
 * `legacy-main.ts`; the DECISIONS — guard order, replay, retry timing — live
 * here so they can be tested without a DOM, a GPU or a peer.
 */

/**
 * Slack the host allows between the position a guest STAMPS on its request and
 * the position the host has replicated for it. Both roles run the same
 * `DEATH_DROP_INTERACTION_RANGE`; this covers one snapshot of movement, and it
 * is the number the pre-existing host path already used.
 */
export const PICKUP_RANGE_TOLERANCE_M = 0.5;
/** Maximum drift between the request's stamped position and the host's replicated sender position. */
export const PICKUP_SENDER_DISTANCE_TOLERANCE_M = 2.8;
/** Vertical window for a scavenge, matching the local scavenge predicate plus one stance change. */
export const PICKUP_SCAVENGE_VERTICAL_TOLERANCE_M = 2.5;

export type PickupGeometryReason = Extract<PickupResultReason,
  'out-of-bounds' | 'sender-distance' | 'drop-distance' | 'line-of-sight'>;

export type PickupGeometryInput = Readonly<{
  mode: 'scavenge' | 'weapon';
  /** Distance from the request's stamped position to the host's replicated sender position. */
  senderDistanceM: number;
  /** Straight-line distance from the stamped position to the host's drop record. */
  dropDistanceM: number;
  /** Horizontal (xz) distance, used by the scavenge window. */
  dropHorizontalDistanceM: number;
  /** Absolute vertical separation, used by the scavenge window. */
  dropVerticalDistanceM: number;
  /** Host's own bounds test for the stamped position. */
  insideBounds: boolean;
  /**
   * Host's own eye-to-drop collider trace. `true` means an authoritative world
   * collider stands between the requester and the gun. Scavenging is a contact
   * action inside 1.05 m and is deliberately NOT sight-gated: you are standing
   * on the corpse.
   */
  sightBlocked: boolean;
  /** Interaction radius for a weapon pickup, before tolerance. */
  weaponRangeM: number;
  /** Horizontal radius for a scavenge, before tolerance. */
  scavengeRangeM: number;
}>;

/**
 * The geometric and spatial half of the host admission, in ONE fixed order so
 * a rejection names the first guard that actually failed. Ownership, expiry,
 * payload and inventory guards stay with the host, which owns those records.
 *
 * Returns `null` when the request is spatially admissible.
 */
export function evaluatePickupGeometry(input: PickupGeometryInput): PickupGeometryReason | null {
  if (!input.insideBounds) return 'out-of-bounds';
  if (!(input.senderDistanceM <= PICKUP_SENDER_DISTANCE_TOLERANCE_M)) return 'sender-distance';
  const withinRange = input.mode === 'scavenge'
    ? input.dropHorizontalDistanceM <= input.scavengeRangeM + PICKUP_RANGE_TOLERANCE_M
      && input.dropVerticalDistanceM <= PICKUP_SCAVENGE_VERTICAL_TOLERANCE_M
    : input.dropDistanceM <= input.weaponRangeM + PICKUP_RANGE_TOLERANCE_M;
  if (!withinRange) return 'drop-distance';
  if (input.mode === 'weapon' && input.sightBlocked) return 'line-of-sight';
  return null;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * What the host decided for one `(playerId, nonce)` request. The combat
 * inventory is deliberately NOT stored: a replay re-projects the host's
 * CURRENT canonical inventory, because that is the value the guest has to
 * converge on, and it may legitimately have moved on (a reload, a scavenge)
 * since the original answer.
 */
export type PickupResolution = Readonly<{
  status: 'accepted' | 'rejected';
  reason: PickupResultReason;
  drop: PickupResultDropRecord | 'removed';
  resolvedAt: number;
}>;

/**
 * How long a resolved request stays replayable. It must outlive the guest's
 * whole retry schedule (`PICKUP_REVERT_AFTER_MS`) with room for one round
 * trip, and it is bounded so a long match cannot accumulate resolutions.
 */
export const PICKUP_RESOLUTION_TTL_MS = 15_000;
export const PICKUP_RESOLUTION_LIMIT = 256;

export type PickupResolutionLedger = Map<string, PickupResolution>;

export function createPickupResolutionLedger(): PickupResolutionLedger {
  return new Map<string, PickupResolution>();
}

export function pickupRequestKey(playerId: string, nonce: number): string {
  return `${playerId}:${nonce}`;
}

/**
 * The replay lookup. A hit means this exact request was already resolved and
 * the host must answer with the SAME resolution - an accepted pickup answers
 * accepted again, so a lost ack costs a round trip and never the gun, and a
 * rejected one answers rejected again, so a retry cannot become a second
 * successful pick of the same drop.
 */
export function recallPickupResolution(
  ledger: PickupResolutionLedger,
  key: string,
  now: number,
  ttlMs = PICKUP_RESOLUTION_TTL_MS,
): PickupResolution | null {
  const resolution = ledger.get(key);
  if (!resolution) return null;
  if (now - resolution.resolvedAt > ttlMs) {
    ledger.delete(key);
    return null;
  }
  return resolution;
}

/**
 * Records a resolution. Insertion-ordered eviction: expired entries first, then
 * the oldest, so the ledger cannot outgrow `limit` even under a flood of
 * fabricated nonces from a hostile guest.
 */
export function rememberPickupResolution(
  ledger: PickupResolutionLedger,
  key: string,
  resolution: PickupResolution,
  ttlMs = PICKUP_RESOLUTION_TTL_MS,
  limit = PICKUP_RESOLUTION_LIMIT,
): PickupResolutionLedger {
  ledger.delete(key);
  ledger.set(key, resolution);
  for (const [candidate, entry] of ledger) {
    if (resolution.resolvedAt - entry.resolvedAt > ttlMs) ledger.delete(candidate);
  }
  while (ledger.size > Math.max(1, limit)) {
    const oldest = ledger.keys().next();
    if (oldest.done) break;
    ledger.delete(oldest.value);
  }
  return ledger;
}

/** Forgets every resolution for one player — called when that peer leaves. */
export function forgetPlayerPickupResolutions(
  ledger: PickupResolutionLedger,
  playerId: string,
): PickupResolutionLedger {
  const prefix = `${playerId}:`;
  for (const key of [...ledger.keys()]) if (key.startsWith(prefix)) ledger.delete(key);
  return ledger;
}

// ---------------------------------------------------------------------------
// Guest retry schedule
// ---------------------------------------------------------------------------

/**
 * When the guest re-sends the SAME request (same nonce, so the host replays
 * rather than re-executes) and when it finally gives up and reverts. The
 * revert deadline is unchanged from the pre-existing behaviour; the resend is
 * new, and it is why a single lost datagram no longer costs the pickup.
 */
export const PICKUP_RESEND_AFTER_MS = 700;
export const PICKUP_REVERT_AFTER_MS = 1_500;

export type PendingPickupTiming = Readonly<{ sentAt: number; resentAt: number | null }>;

export type PendingPickupStep = 'wait' | 'resend' | 'revert';

export function stepPendingPickup(
  pending: PendingPickupTiming,
  now: number,
  resendAfterMs = PICKUP_RESEND_AFTER_MS,
  revertAfterMs = PICKUP_REVERT_AFTER_MS,
): PendingPickupStep {
  const age = now - pending.sentAt;
  if (age > revertAfterMs) return 'revert';
  if (pending.resentAt === null && age >= resendAfterMs) return 'resend';
  return 'wait';
}

// ---------------------------------------------------------------------------
// Drop-on-death payload
// ---------------------------------------------------------------------------

export type WeaponAmmoSpec = Readonly<{ mag: number; reserve: number }>;
export type CarriedAmmo = Readonly<{ ammo: number; reserve: number }>;
export type DeathDropPayload = Readonly<{ ammo: number; reserve: number }>;

/**
 * What a gun brings with it when its owner dies.
 *
 * Before PASS 95 the host always spawned `ceil(mag * 0.5)` / `ceil(reserve *
 * 0.25)` regardless of what the victim actually had left, so the ground weapon
 * was a fiction the host invented. Where the host HAS the victim's canonical
 * combat inventory (every remote peer has one, `remoteCombatInventories`), the
 * drop now carries the real remainder. Nothing is minted: the victim's ledger
 * is the source, and a dead player's is reset on respawn.
 *
 * The fallback fraction is retained verbatim for victims the host has no
 * inventory for (bots), so their loot economy is unchanged.
 *
 * The magazine floors at one round: a drop with an empty magazine is
 * indistinguishable from a consumed one to `consumeDeathDropWeapon`, which
 * clamps the transferred magazine with `Math.max(1, ...)` anyway - a floor
 * here keeps the ground record honest about what the picker will receive.
 */
export function deathDropPayload(spec: WeaponAmmoSpec, carried: CarriedAmmo | null): DeathDropPayload {
  const magCap = Math.max(1, Math.floor(spec.mag));
  const reserveCap = Math.max(0, Math.floor(spec.reserve));
  if (!carried || !Number.isFinite(carried.ammo) || !Number.isFinite(carried.reserve)) {
    return Object.freeze({
      ammo: Math.max(1, Math.ceil(magCap * 0.5)),
      reserve: Math.max(1, Math.ceil(reserveCap * 0.25)),
    });
  }
  return Object.freeze({
    ammo: Math.min(magCap, Math.max(1, Math.round(carried.ammo))),
    reserve: Math.min(reserveCap, Math.max(0, Math.round(carried.reserve))),
  });
}
