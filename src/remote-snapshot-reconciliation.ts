import type { PlayerSnapshot } from './protocol';

/** A sub-frame discrepancy is normal while the local mover is ahead of the
 * latest host sample. Larger error is a real authority disagreement. */
export const LOCAL_AUTHORITATIVE_CORRECTION_BOUND_M = 0.35;

export type RemoteAuthoritativeState = Readonly<{
  snapshot: PlayerSnapshot;
  continuity: number;
  hostTimeMs: number;
}>;

export type RemoteSnapshotApplyInput = Readonly<{
  kind: 'join' | 'state';
  snapshot: PlayerSnapshot;
  continuity: number;
  hostTimeMs: number;
}>;

export type RemoteSnapshotApplyResult = Readonly<{
  accepted: boolean;
  reason: 'new-continuity' | 'new-sequence' | 'new-host-time' | 'older-continuity' | 'older-sequence';
  state: RemoteAuthoritativeState;
}>;

export function createRemoteAuthoritativeState(input: RemoteAuthoritativeState): RemoteAuthoritativeState {
  return Object.freeze({
    snapshot: input.snapshot,
    continuity: input.continuity,
    hostTimeMs: input.hostTimeMs,
  });
}

/**
 * Admit one host-authored remote sample. Sequence numbers order samples inside
 * a life, while continuity orders lives/reconnect sessions. A replacement can
 * legitimately send its first state with a sequence lower than the reliable
 * join seed, so continuity is checked before the sequence fence.
 */
export function applyRemoteAuthoritativeSnapshot(
  current: RemoteAuthoritativeState,
  incoming: RemoteSnapshotApplyInput,
): RemoteSnapshotApplyResult {
  if (incoming.continuity < current.continuity) {
    return { accepted: false, reason: 'older-continuity', state: current };
  }
  if (incoming.continuity > current.continuity) {
    return {
      accepted: true,
      reason: 'new-continuity',
      state: createRemoteAuthoritativeState(incoming),
    };
  }
  if (incoming.snapshot.seq > current.snapshot.seq) {
    return {
      accepted: true,
      reason: 'new-sequence',
      state: createRemoteAuthoritativeState(incoming),
    };
  }
  if (incoming.snapshot.seq === current.snapshot.seq && incoming.hostTimeMs > current.hostTimeMs) {
    return {
      accepted: true,
      reason: 'new-host-time',
      state: createRemoteAuthoritativeState(incoming),
    };
  }
  return { accepted: false, reason: 'older-sequence', state: current };
}

export function admitRemoteSnapshot(
  snapshot: PlayerSnapshot,
  continuity: number,
  hostTimeMs: number,
  incoming: RemoteSnapshotApplyInput,
): RemoteSnapshotApplyResult {
  return applyRemoteAuthoritativeSnapshot(createRemoteAuthoritativeState({ snapshot, continuity, hostTimeMs }), incoming);
}

export type LocalAuthoritativeReconciliationInput = Readonly<{
  predicted: PlayerSnapshot;
  authoritative: PlayerSnapshot;
  lastAcknowledgedInputSeq: number;
}>;

export type LocalAuthoritativeReconciliationResult = Readonly<{
  accepted: boolean;
  correction: 'ignore' | 'none' | 'snap';
  divergenceM: number;
  snapshot: PlayerSnapshot;
}>;

/**
 * Reconcile the local prediction against the newest host acknowledgement. The
 * correction curve is deliberately fail-safe: <=0.35 m stays under the local
 * mover's normal prediction envelope; anything larger snaps to the host sample
 * and therefore cannot leave a guest prediction ahead of authority.
 */
export function reconcileLocalAuthoritativeSnapshot(
  input: LocalAuthoritativeReconciliationInput,
): LocalAuthoritativeReconciliationResult {
  const divergenceM = Math.hypot(
    input.predicted.x - input.authoritative.x,
    input.predicted.y - input.authoritative.y,
    input.predicted.z - input.authoritative.z,
  );
  if (input.authoritative.id !== input.predicted.id
    || !Number.isSafeInteger(input.authoritative.seq)
    || input.authoritative.seq <= input.lastAcknowledgedInputSeq) {
    return { accepted: false, correction: 'ignore', divergenceM, snapshot: input.predicted };
  }
  return {
    accepted: true,
    correction: divergenceM > LOCAL_AUTHORITATIVE_CORRECTION_BOUND_M ? 'snap' : 'none',
    divergenceM,
    snapshot: input.authoritative,
  };
}

export type StaleSelfHealthRepairInput = Readonly<{
  messageType: string;
  continuity: number;
  localContinuity: number;
  incomingHp: number;
  currentHp: number;
}>;

/**
 * Damage-direction-only repair for a host-authored self echo whose movement
 * sequence is stale (rejoin freeze: lastAcknowledgedLocalInputSeq pinned at
 * the resume seq while the host damage broadcast reuses that same seq).
 * Admits only a same-life HP decrease: never heals, never resurrects, never
 * moves the player, never advances the input acknowledgement. Stale-life and
 * non-state packets stay rejected; the caller keeps the movement drop counted.
 */
export function shouldApplyStaleSelfHealthRepair(input: StaleSelfHealthRepairInput): boolean {
  return input.messageType === 'state'
    && Number.isSafeInteger(input.continuity)
    && input.continuity === input.localContinuity
    && Number.isFinite(input.incomingHp)
    && input.incomingHp < input.currentHp;
}
