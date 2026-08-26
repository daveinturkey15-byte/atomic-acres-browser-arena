export const MAX_CLIENT_WORLD_REPAIR_ATTEMPTS = 2;

/**
 * Minimum spacing between repair-ready attempts, and the grace the LAST attempt
 * gets before exhaustion may be declared.
 *
 * WHY. Attempts used to be burned per incoming stale killstreak snapshot, and
 * the host broadcasts several force-reliable snapshots around match start - so
 * two stale snapshots could arrive within milliseconds and consume the whole
 * cap before the guest's first repair-ready had even round-tripped. The guest
 * was then declared "attempts-exhausted" and left permanently dead at spawn,
 * which players reported as "can't move" on RustRig/Terminal (HF-347/HF-322;
 * the arena was never the variable - the race was).
 *
 * An attempt is a REQUEST to the host, so it is only meaningful to retry after
 * the previous request has had time to be answered. The 5s admission timeout
 * remains the hard failure bound for a host that never answers at all.
 */
export const MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS = 1_000;

export type ClientWorldRepairIdentity = Readonly<{
  playerId: string;
  connectionEpoch: string;
  matchEpoch: number;
  lifeId: number;
}>;

export type ClientWorldRepairAdmission = Readonly<{
  identity: ClientWorldRepairIdentity;
  attempts: number;
  acknowledged: boolean;
  /** performance.now() of the most recent attempt; null before the first. */
  lastAttemptAtMs: number | null;
}>;

type ClientWorldReceiverReady = Readonly<{
  connectionEpoch: string;
  matchEpoch: number;
  exactActorAcknowledged: boolean;
}>;

type ClientWorldActorAck = Readonly<{
  actorId: string;
  lifeId: number;
}>;

function validIdentity(identity: ClientWorldRepairIdentity): boolean {
  return identity.playerId.length > 0
    && identity.connectionEpoch.length > 0
    && Number.isSafeInteger(identity.matchEpoch)
    && identity.matchEpoch > 0
    && Number.isSafeInteger(identity.lifeId)
    && identity.lifeId >= 0;
}

export function beginClientWorldRepair(identity: ClientWorldRepairIdentity): ClientWorldRepairAdmission {
  if (!validIdentity(identity)) throw new TypeError('Invalid client world-repair identity');
  return Object.freeze({ identity: Object.freeze({ ...identity }), attempts: 0, acknowledged: false, lastAttemptAtMs: null });
}

export function clientWorldRepairPending(admission: ClientWorldRepairAdmission | null): boolean {
  return admission !== null && !admission.acknowledged;
}

export function clientWorldRepairCanAttempt(
  admission: ClientWorldRepairAdmission | null,
  nowMs: number,
): boolean {
  return admission !== null
    && !admission.acknowledged
    && admission.attempts < MAX_CLIENT_WORLD_REPAIR_ATTEMPTS
    && (admission.lastAttemptAtMs === null
      || nowMs - admission.lastAttemptAtMs >= MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS);
}

/**
 * True only when the cap is spent AND the final attempt has had a full spacing
 * window to be answered. Declaring exhaustion the instant the cap is reached
 * re-creates the burst race this module exists to prevent.
 */
export function clientWorldRepairExhausted(
  admission: ClientWorldRepairAdmission | null,
  nowMs: number,
): boolean {
  return admission !== null
    && !admission.acknowledged
    && admission.attempts >= MAX_CLIENT_WORLD_REPAIR_ATTEMPTS
    && admission.lastAttemptAtMs !== null
    && nowMs - admission.lastAttemptAtMs >= MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS;
}

export function clientWorldRepairReceiverReady(
  admission: ClientWorldRepairAdmission | null,
  receiver: ClientWorldReceiverReady,
  nowMs: number,
): boolean {
  return clientWorldRepairCanAttempt(admission, nowMs)
    && admission !== null
    && !receiver.exactActorAcknowledged
    && admission.identity.connectionEpoch === receiver.connectionEpoch
    && admission.identity.matchEpoch === receiver.matchEpoch;
}

export function recordClientWorldRepairAttempt(
  admission: ClientWorldRepairAdmission,
  nowMs: number,
): ClientWorldRepairAdmission {
  if (admission.acknowledged || admission.attempts >= MAX_CLIENT_WORLD_REPAIR_ATTEMPTS) return admission;
  return Object.freeze({ ...admission, attempts: admission.attempts + 1, lastAttemptAtMs: nowMs });
}

export function acknowledgeClientWorldRepairActor(
  admission: ClientWorldRepairAdmission | null,
  actor: ClientWorldActorAck,
): ClientWorldRepairAdmission | null {
  if (admission === null || admission.acknowledged
    || actor.actorId !== admission.identity.playerId
    || actor.lifeId !== admission.identity.lifeId) return admission;
  return Object.freeze({ ...admission, acknowledged: true });
}

/**
 * HF-347 residual ("cant move alot in host and guest lobby etc" / "cant mov
 * when spawn into rustrig in host guest lobby", Pass 74+ Lane J).
 *
 * WHY. The admission deadline used to be one 5-second timer armed at
 * lobby-start. That clock counted straight through BOTH sides' arena load and
 * the WebGL first-presentation prime (which pauses the client's state pump),
 * so on heavy arenas the guest was declared dead-at-spawn before the
 * host/guest handshake could exchange a single message — reproduced
 * mechanically on 4/6 arenas by scripts/qa/verify-hf347-arena-movement-matrix.mjs
 * under load (guest hp 0, "Match admission unacknowledged by host
 * (admission-timeout)", host remoteCount 0).
 *
 * The bound is restructured, not weakened:
 *  - HANDSHAKE_TIMEOUT_MS (5s, unchanged) now measures inactivity from the
 *    latest handshake PROGRESS while the client is actually able to transact
 *    (game started, pump unpaused): progress = becoming pump-eligible or a
 *    recorded repair attempt. A host that answers once and then goes silent
 *    still fails within 5s of that last attempt.
 *  - ARMING_CAP_MS is the absolute fail bound from arming, covering a
 *    live-but-never-answering host. A DEAD host is handled sooner by the
 *    connection-loss path, so this cap never holds a hostage lobby.
 */
export const CLIENT_WORLD_REPAIR_HANDSHAKE_TIMEOUT_MS = 5_000;
export const CLIENT_WORLD_REPAIR_ARMING_CAP_MS = 60_000;
/** Cadence of the deadline evaluation; small against both bounds above. */
export const CLIENT_WORLD_REPAIR_DEADLINE_CHECK_INTERVAL_MS = 500;

export type ClientWorldRepairDeadlineInput = Readonly<{
  /** performance.now() at evaluation time. */
  nowMs: number;
  /** performance.now() when the admission was armed (lobby start). */
  armedAtMs: number;
  /** First observed moment the client could transact; null while loading. */
  pumpEligibleSinceMs: number | null;
  /**
   * performance.now() of the first in-match message admitted from the host
   * since this admission was armed, or null if the host has not been heard
   * from at all yet.
   *
   * WHY (Lane J). The 5s bound is documented as "a host that answers once and
   * then goes silent still fails within 5s" — but nothing implemented the
   * "answers once" precondition, so the clock also ran over the window in
   * which the host had simply not finished loading its own arena yet. Both
   * peers start their arena load from the same START; the guest routinely
   * finishes first and then burned its whole handshake window waiting on a
   * host that was healthy and merely slower. Measured on this machine: the
   * guest was declared "Match admission unacknowledged by host
   * (admission-timeout)" and killed at spawn in 3 of 4 consecutive idle
   * matches, in every case with the host's acknowledgement arriving moments
   * later (hostConfirmedContinuity did land) — the owner's "cant mov when
   * spawn into rustrig in host guest lobby".
   *
   * Silence before first contact is now bounded by the arming cap alone,
   * which is precisely the bound this module already declares for a host that
   * never answers. Nothing is loosened for a host that answered and then
   * stopped: that case still fails 5s after the last progress.
   */
  hostContactAtMs: number | null;
  /** The admission under judgement; null means nothing to judge. */
  admission: ClientWorldRepairAdmission | null;
}>;

export type ClientWorldRepairDeadlineVerdict = 'wait' | 'failed';

/**
 * Pure deadline rule so the timer wiring in legacy-main stays trivial and the
 * race semantics stay unit-testable. 'failed' is terminal for this admission.
 */
export function evaluateClientWorldRepairDeadline(
  input: ClientWorldRepairDeadlineInput,
): ClientWorldRepairDeadlineVerdict {
  const { nowMs, armedAtMs, pumpEligibleSinceMs, hostContactAtMs, admission } = input;
  if (admission === null || admission.acknowledged) return 'wait';
  // Absolute cap: a host that never answers at all cannot wait out the match.
  if (nowMs - armedAtMs >= CLIENT_WORLD_REPAIR_ARMING_CAP_MS) return 'failed';
  // Still loading or pump paused: the handshake has not begun; only the cap runs.
  if (pumpEligibleSinceMs === null) return 'wait';
  // Not heard from the host yet: it is still loading its own arena, and only
  // the cap can tell that apart from a host that is gone. See hostContactAtMs.
  if (hostContactAtMs === null) return 'wait';
  const lastProgressAtMs = Math.max(
    pumpEligibleSinceMs,
    hostContactAtMs,
    admission.lastAttemptAtMs ?? Number.NEGATIVE_INFINITY,
  );
  return nowMs - lastProgressAtMs >= CLIENT_WORLD_REPAIR_HANDSHAKE_TIMEOUT_MS ? 'failed' : 'wait';
}
