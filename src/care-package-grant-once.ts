/**
 * HF-509 (owner: "I've got the Crimson Flamethrower in the care package, and it
 * just let me keep pressing the button and getting a hundred percent value. It
 * should only grant it to you once, and then you have it until it's out of
 * ammo.")
 *
 * Every other care-package reward is redeemed through
 * `killstreakRuntime.activate`, whose admission shifts the reward off the
 * actor's `careRewards` queue exactly once (`fromCare`). The crimson
 * flamethrower — the one care reward that is a WEAPON grant rather than a
 * streak — returned from `activateFieldSupport` before reaching that admission,
 * so the queue entry was never consumed and every subsequent press re-granted a
 * full magazine and reserve.
 *
 * This module supplies the two pure pieces that fix it without inventing a new
 * authority:
 *
 *  1. `advanceCareRewardQueue` / `headCarePackageId` derive a stable identity
 *     for the care-package INSTANCE currently at the head of the replicated
 *     `revealedCareRewards` queue, from the host-authoritative snapshot alone.
 *     No protocol field is added: the identity is (match epoch, owner, how many
 *     rewards that owner has already consumed this epoch), which is exactly the
 *     instance ordinal the host's `shift()` advances.
 *
 *  2. `createCarePackageGrantLedger` is the idempotent claim ledger, keyed by
 *     package id + claimant. The FIRST valid claim on a package id wins and the
 *     package is consumed; a repeat by the same claimant and a claim by any
 *     other claimant both refuse. It mirrors the host-validated pickup relay
 *     (`acceptRemotePickup`), which refuses a duplicate nonce and an already
 *     taken drop rather than applying the effect twice.
 *
 * The ledger is the in-flight guard: it stops the local re-grant in the window
 * between a press and the host snapshot that clears the queue. The durable
 * exactly-once remains host-side (`careRewards.shift()` plus the activation
 * replay set), and the crate itself is already deleted and replicated on
 * capture by `beginCareCapture`.
 */

/** Bounded ledger memory. A match cannot deliver anywhere near this many care
 * packages, so eviction is a safety valve rather than an expected path. */
export const CARE_PACKAGE_GRANT_LEDGER_CAPACITY = 256;

export type CarePackageGrantRequest = Readonly<{
  /** Stable identity of the package instance whose contents are being taken. */
  packageId: string;
  /** The player claiming it. */
  claimantId: string;
  /** The claimant's life at claim time; a new life never re-opens a package. */
  lifeId: number;
}>;

export type CarePackageGrantReason =
  /** First valid claim: the contents are granted and the package is consumed. */
  | 'granted'
  /** This claimant already took this package. Silent no-op, no prompt. */
  | 'already-claimed'
  /** Another claimant took it first (guest double-claim / late arrival). */
  | 'package-consumed'
  /** Structurally invalid request; nothing is consumed. */
  | 'invalid-request';

export type CarePackageGrantDecision = Readonly<{
  granted: boolean;
  reason: CarePackageGrantReason;
  packageId: string;
  /** The claimant that owns the grant, which for a refusal is the first one. */
  grantedTo: string | null;
}>;

export type CarePackageGrantLedger = Readonly<{
  /** Idempotent: grants exactly once per package id, to the first claimant. */
  claim: (request: CarePackageGrantRequest) => CarePackageGrantDecision;
  /**
   * Rolls back a claim whose host-authoritative consumption was refused, so a
   * retryable rejection never strands the reward. Only the owning claimant may
   * release, and only a package this ledger actually granted.
   */
  release: (packageId: string, claimantId: string) => boolean;
  isConsumed: (packageId: string) => boolean;
  claimantOf: (packageId: string) => string | null;
  consumedCount: () => number;
  /** Match-epoch boundary: package ids are epoch-scoped, so this is hygiene. */
  reset: () => void;
}>;

function validRequest(request: CarePackageGrantRequest): boolean {
  return typeof request.packageId === 'string' && request.packageId.length > 0
    && typeof request.claimantId === 'string' && request.claimantId.length > 0
    && Number.isSafeInteger(request.lifeId) && request.lifeId >= 0;
}

function decision(
  granted: boolean,
  reason: CarePackageGrantReason,
  packageId: string,
  grantedTo: string | null,
): CarePackageGrantDecision {
  return Object.freeze({ granted, reason, packageId, grantedTo });
}

export function createCarePackageGrantLedger(
  capacity: number = CARE_PACKAGE_GRANT_LEDGER_CAPACITY,
): CarePackageGrantLedger {
  const bound = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : CARE_PACKAGE_GRANT_LEDGER_CAPACITY;
  // Insertion-ordered, so the oldest entry is the first key.
  const granted = new Map<string, string>();

  const trim = (): void => {
    while (granted.size > bound) {
      const oldest = granted.keys().next();
      if (oldest.done) return;
      granted.delete(oldest.value);
    }
  };

  return Object.freeze({
    claim(request: CarePackageGrantRequest): CarePackageGrantDecision {
      if (!validRequest(request)) return decision(false, 'invalid-request', String(request.packageId ?? ''), null);
      const existing = granted.get(request.packageId);
      if (existing !== undefined) {
        return existing === request.claimantId
          ? decision(false, 'already-claimed', request.packageId, existing)
          : decision(false, 'package-consumed', request.packageId, existing);
      }
      granted.set(request.packageId, request.claimantId);
      trim();
      return decision(true, 'granted', request.packageId, request.claimantId);
    },
    release(packageId: string, claimantId: string): boolean {
      if (granted.get(packageId) !== claimantId) return false;
      granted.delete(packageId);
      return true;
    },
    isConsumed(packageId: string): boolean {
      return granted.has(packageId);
    },
    claimantOf(packageId: string): string | null {
      return granted.get(packageId) ?? null;
    },
    consumedCount(): number {
      return granted.size;
    },
    reset(): void {
      granted.clear();
    },
  });
}

/**
 * Local mirror of the replicated `revealedCareRewards` queue, plus how many of
 * this owner's care rewards have already been consumed in the current match
 * epoch. `consumedCount` is the head package instance's ordinal.
 */
export type CareRewardQueueTracker = Readonly<{
  matchEpoch: number;
  queue: readonly string[];
  consumedCount: number;
}>;

export function createCareRewardQueueTracker(matchEpoch = 0): CareRewardQueueTracker {
  return Object.freeze({ matchEpoch, queue: Object.freeze([] as readonly string[]), consumedCount: 0 });
}

/**
 * Folds the next replicated queue into the tracker. Entries leaving the HEAD
 * are consumptions (the host's `careRewards.shift()`); entries appended at the
 * tail are new captures and advance nothing.
 *
 * A shrink is counted by length, and an equal-length queue whose head changed
 * counts as exactly one consumption — the case where a capture landed in the
 * same replication step that consumed the previous head. A match-epoch change
 * resets the ordinal, because package ids are epoch-scoped.
 */
export function advanceCareRewardQueue(
  tracker: CareRewardQueueTracker,
  nextQueue: readonly string[],
  matchEpoch: number = tracker.matchEpoch,
): CareRewardQueueTracker {
  const queue = Object.freeze([...nextQueue]);
  if (matchEpoch !== tracker.matchEpoch) {
    return Object.freeze({ matchEpoch, queue, consumedCount: 0 });
  }
  const previous = tracker.queue;
  let consumed = 0;
  if (queue.length < previous.length) consumed = previous.length - queue.length;
  else if (queue.length === previous.length && previous.length > 0 && queue[0] !== previous[0]) consumed = 1;
  if (consumed === 0 && queue.length === previous.length) return tracker.queue === queue ? tracker
    : Object.freeze({ matchEpoch, queue, consumedCount: tracker.consumedCount });
  return Object.freeze({ matchEpoch, queue, consumedCount: tracker.consumedCount + consumed });
}

/**
 * Identity of the package instance at the head of the queue, or null when the
 * owner holds no care reward. Two different packages never share an id inside
 * one match epoch, and the id is stable across every snapshot refresh that does
 * not consume the head — which is precisely what makes a repeat press idempotent.
 */
export function headCarePackageId(
  tracker: CareRewardQueueTracker,
  ownerId: string,
): string | null {
  if (tracker.queue.length === 0 || ownerId.length === 0) return null;
  return `care-${tracker.matchEpoch}-${ownerId}-${tracker.consumedCount}`;
}

/**
 * The whole redemption step for a care-package WEAPON reward, as one pure
 * decision so the press loop is testable without the DOM.
 *
 * Order matters and is pinned by the suite: claim first (so a repeat press is
 * refused before it can reach the network at all), then ask the host to consume
 * the queued reward, and only grant when both admit it. A refused host
 * admission releases the claim, because `killstreakRuntime.activate` leaves a
 * rejected reward retryable — stranding it would be a second defect.
 */
export type CarePackageRedemptionPorts = Readonly<{
  /** Head package instance id, or null when the owner holds no care reward. */
  packageId: string | null;
  claimantId: string;
  lifeId: number;
  ledger: CarePackageGrantLedger;
  /** Host-authoritative consumption of the queued reward. False = refused. */
  requestHostConsumption: () => boolean;
  /** Applies the weapon grant locally. Called at most once per package. */
  grant: () => void;
}>;

export type CarePackageRedemption = Readonly<{
  granted: boolean;
  reason: CarePackageGrantReason | 'no-package' | 'host-refused';
  packageId: string | null;
}>;

export function redeemCarePackageWeaponGrant(ports: CarePackageRedemptionPorts): CarePackageRedemption {
  const packageId = ports.packageId;
  if (packageId === null || packageId.length === 0) {
    return Object.freeze({ granted: false, reason: 'no-package' as const, packageId: null });
  }
  const claim = ports.ledger.claim({ packageId, claimantId: ports.claimantId, lifeId: ports.lifeId });
  if (!claim.granted) return Object.freeze({ granted: false, reason: claim.reason, packageId });
  if (ports.requestHostConsumption() !== true) {
    ports.ledger.release(packageId, ports.claimantId);
    return Object.freeze({ granted: false, reason: 'host-refused' as const, packageId });
  }
  ports.grant();
  return Object.freeze({ granted: true, reason: 'granted' as const, packageId });
}
