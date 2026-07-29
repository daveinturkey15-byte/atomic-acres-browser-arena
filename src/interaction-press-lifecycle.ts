import {
  primaryHoldInteraction,
  primaryTapInteraction,
  type InteractionCandidate,
} from './interaction-arbitration';

export const F_INTERACTION_HOLD_MS = 1_000;

export type FInteractionCancelReason =
  | 'blur'
  | 'pause'
  | 'death'
  | 'epoch-change'
  | 'life-change'
  | 'target-invalid'
  | 'range-invalid'
  | 'line-of-sight-invalid'
  | 'input-ineligible'
  | 'invalid-time'
  | 'released-without-action'
  | 'manual-reset';

export type FInteractionCommit = Readonly<{
  pressId: number;
  phase: 'tap' | 'hold';
  candidate: InteractionCandidate;
  committedAtMs: number;
}>;

export type FInteractionPressState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{
    phase: 'pressed';
    pressId: number;
    pressedAtMs: number;
    matchEpoch: number;
    lifeId: number;
    tapCandidate: InteractionCandidate | null;
    holdCandidate: InteractionCandidate | null;
  }>
  | Readonly<{
    phase: 'committed';
    pressId: number;
    commit: FInteractionCommit;
  }>;

type InteractionSample = Readonly<{
  nowMs: number;
  matchEpoch: number;
  lifeId: number;
  inputEligible: boolean;
  candidates: readonly InteractionCandidate[];
}>;

export type FInteractionPressEvent =
  | (InteractionSample & Readonly<{ type: 'press'; pressId: number }>)
  | (InteractionSample & Readonly<{ type: 'advance' | 'release' }>)
  | Readonly<{ type: 'cancel'; nowMs: number; reason: FInteractionCancelReason }>;

export type FInteractionPressTransition = Readonly<{
  state: FInteractionPressState;
  commit: FInteractionCommit | null;
  cancellation: FInteractionCancelReason | null;
}>;

const IDLE: FInteractionPressState = Object.freeze({ phase: 'idle' });

export function createFInteractionPressState(): FInteractionPressState {
  return IDLE;
}

function cloneCandidate(candidate: InteractionCandidate | null): InteractionCandidate | null {
  return candidate ? Object.freeze({ ...candidate }) : null;
}

function validNow(nowMs: number): boolean {
  return Number.isFinite(nowMs) && nowMs >= 0;
}

function eligibleCandidate(
  pinned: InteractionCandidate | null,
  current: readonly InteractionCandidate[],
): boolean {
  if (!pinned) return true;
  return current.some((candidate) => candidate.kind === pinned.kind
    && candidate.targetId === pinned.targetId
    && candidate.enabled !== false
    && Number.isFinite(candidate.proximityM)
    && candidate.proximityM >= 0);
}

function cancelled(reason: FInteractionCancelReason): FInteractionPressTransition {
  return Object.freeze({ state: IDLE, commit: null, cancellation: reason });
}

function unchanged(state: FInteractionPressState): FInteractionPressTransition {
  return Object.freeze({ state, commit: null, cancellation: null });
}

function validatePressed(
  state: Extract<FInteractionPressState, { phase: 'pressed' }>,
  event: InteractionSample,
): FInteractionCancelReason | null {
  if (!validNow(event.nowMs) || event.nowMs < state.pressedAtMs) return 'invalid-time';
  if (!event.inputEligible) return 'input-ineligible';
  if (event.matchEpoch !== state.matchEpoch) return 'epoch-change';
  if (event.lifeId !== state.lifeId) return 'life-change';
  if (!eligibleCandidate(state.tapCandidate, event.candidates)
    || !eligibleCandidate(state.holdCandidate, event.candidates)) return 'target-invalid';
  return null;
}

function committed(
  state: Extract<FInteractionPressState, { phase: 'pressed' }>,
  phase: FInteractionCommit['phase'],
  candidate: InteractionCandidate,
  atMs: number,
): FInteractionPressTransition {
  const commit = Object.freeze({
    pressId: state.pressId,
    phase,
    candidate: Object.freeze({ ...candidate }),
    committedAtMs: atMs,
  });
  return Object.freeze({
    state: phase === 'tap'
      ? IDLE
      : Object.freeze({ phase: 'committed', pressId: state.pressId, commit }),
    commit,
    cancellation: null,
  });
}

/**
 * Pure authority for the complete F key press. Candidates are pinned once on
 * keydown. Later candidates may validate that pin but can never replace it.
 */
export function reduceFInteractionPress(
  state: FInteractionPressState,
  event: FInteractionPressEvent,
): FInteractionPressTransition {
  if (event.type === 'cancel') return cancelled(event.reason);
  if (event.type === 'press') {
    if (state.phase !== 'idle') return unchanged(state);
    if (!validNow(event.nowMs) || !Number.isSafeInteger(event.pressId) || event.pressId < 1) {
      return cancelled('invalid-time');
    }
    if (!event.inputEligible) return cancelled('input-ineligible');
    const tapCandidate = cloneCandidate(primaryTapInteraction(event.candidates));
    const holdCandidate = cloneCandidate(primaryHoldInteraction(event.candidates));
    if (!tapCandidate && !holdCandidate) return unchanged(IDLE);
    return Object.freeze({
      state: Object.freeze({
        phase: 'pressed',
        pressId: event.pressId,
        pressedAtMs: event.nowMs,
        matchEpoch: event.matchEpoch,
        lifeId: event.lifeId,
        tapCandidate,
        holdCandidate,
      }),
      commit: null,
      cancellation: null,
    });
  }
  if (state.phase === 'idle') return unchanged(state);
  if (state.phase === 'committed') {
    return event.type === 'release' ? unchanged(IDLE) : unchanged(state);
  }

  const invalid = validatePressed(state, event);
  if (invalid) return cancelled(invalid);
  const elapsedMs = event.nowMs - state.pressedAtMs;
  if (state.holdCandidate && elapsedMs >= F_INTERACTION_HOLD_MS) {
    return committed(state, 'hold', state.holdCandidate, event.nowMs);
  }
  if (event.type === 'release') {
    if (elapsedMs < F_INTERACTION_HOLD_MS && state.tapCandidate) {
      return committed(state, 'tap', state.tapCandidate, event.nowMs);
    }
    return cancelled('released-without-action');
  }
  return unchanged(state);
}

export function fInteractionHoldProgress(state: FInteractionPressState, nowMs: number): number {
  if (state.phase !== 'pressed' || !state.holdCandidate || !validNow(nowMs)) return 0;
  return Math.max(0, Math.min(1, (nowMs - state.pressedAtMs) / F_INTERACTION_HOLD_MS));
}
