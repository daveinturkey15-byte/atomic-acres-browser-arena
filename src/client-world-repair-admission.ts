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
