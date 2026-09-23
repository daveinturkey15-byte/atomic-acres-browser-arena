import type { OrdinaryWeaponId, ReloadResultMessage } from './protocol';

/**
 * Guest-side pending-reload state machine — the client twin of the host-side
 * guest-reload-authority.ts. Extracted from legacy-main.ts (pendingLocalReloadAuthority,
 * acceptLocalReloadResult, sendLocalReloadCancel) per Pass 74 refactor X1.
 *
 * HF-315(b) owner requirement: a pending reload must never brick shooting/reloading.
 * Before this pass the pending record had no deadline and no life scoping, so one lost
 * reload-result (or a death mid-reload, which increments the local continuity and makes
 * every future host result unmatchable) left reload() dead for the rest of the match.
 * This module makes a pending clearable two ways: isExpired() once the reliable-lane
 * grace after the expected completion has elapsed, and isStale() once the local life
 * no longer matches the pending's life. Ammo still only moves through host-authored
 * combat-inventory projections — nothing here writes ammo.
 */

/**
 * HF-315(b): grace beyond the locally computed reload completion before a pending
 * with no host result is considered lost. Reload results travel the reliable event
 * lane, so 2 s beyond completion comfortably covers worst-case delivery; the host's
 * own pending window (GUEST_RELOAD_EXPIRY_GRACE_MS = 10 s) is untouched — this is a
 * client give-up, not a widened host admission.
 */
export const LOCAL_RELOAD_EXPIRY_GRACE_MS = 2_000;

export type LocalReloadPending = Readonly<{
  connectionEpoch: string;
  lifeId: number;
  requestId: string;
  startSequence: number;
  cancelSequence: number | null;
  cancelRequestId: string | null;
  weapon: OrdinaryWeaponId;
  requestedAtMs: number;
  expectedCompletionMs: number;
}>;

/** The subset of a reload-result the state machine reasons about. */
export type LocalReloadResultInput = Pick<
  ReloadResultMessage,
  'connectionEpoch' | 'lifeId' | 'actionSequence' | 'requestId' | 'weapon' | 'status' | 'reason'
>;

export type LocalReloadContext = Readonly<{
  localConnectionEpoch: string;
  currentLifeId: number;
}>;

export type LocalReloadResultAction =
  /** Result is not addressed to the current epoch/life or matches nothing — drop it. */
  | 'ignore'
  /** Host accepted the start; keep the pending until a terminal result arrives. */
  | 'acknowledge-started'
  /** Terminal result for the tracked pending: clear it and apply the host projection. */
  | 'clear-and-apply-projection'
  /**
   * Late authoritative 'committed' that no longer matches a pending (cleared by
   * expiry, or superseded by a newer attempt): apply the host projection, leave
   * pending untouched. HF-315(b): a slow-but-successful commit must stay
   * authoritative even after the local expiry gave up on it.
   */
  | 'apply-projection-only';

export type LocalReloadResultOutcome = Readonly<{
  pending: LocalReloadPending | null;
  action: LocalReloadResultAction;
  /** True when the caller should record a 'reload-authority rejected' diagnostic. */
  recordRejectedDiagnostic: boolean;
}>;

export function createPendingReload(input: Readonly<{
  connectionEpoch: string;
  lifeId: number;
  requestId: string;
  weapon: OrdinaryWeaponId;
  actionSequence: number;
  nowMs: number;
  expectedCompletionMs: number;
}>): LocalReloadPending {
  return Object.freeze({
    connectionEpoch: input.connectionEpoch,
    lifeId: input.lifeId,
    requestId: input.requestId,
    startSequence: input.actionSequence,
    cancelSequence: null,
    cancelRequestId: null,
    weapon: input.weapon,
    requestedAtMs: input.nowMs,
    expectedCompletionMs: input.expectedCompletionMs,
  });
}

/**
 * One-shot cancel registration (mirrors the legacy sendLocalReloadCancel guard):
 * returns the pending with the cancel sequence recorded, or null when a cancel is
 * already in flight — the caller must not send a second cancel intent.
 */
export function cancelRequested(
  pending: LocalReloadPending,
  actionSequence: number,
  requestId: string,
): LocalReloadPending | null {
  if (pending.cancelSequence !== null) return null;
  return Object.freeze({ ...pending, cancelSequence: actionSequence, cancelRequestId: requestId });
}

/**
 * Stable request identity for an intent and every retry of that intent. The
 * connection epoch is already an authenticated, bounded protocol value, so it
 * is safe to derive a bounded digest from it, giving the host a stable key
 * within a match without exposing the epoch or relying on a random nonce
 * surviving a retry.
 */
export function reloadRequestId(
  connectionEpoch: string,
  lifeId: number,
  actionSequence: number,
  action: 'start' | 'cancel',
): string {
  // Keep the authenticated epoch out of diagnostics and browser snapshots. Two
  // independent 32-bit FNV lanes make the bounded key deterministic without
  // exposing the epoch value itself.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < connectionEpoch.length; index += 1) {
    const code = connectionEpoch.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  const epochDigest = `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
  return `reload-${epochDigest}-${lifeId.toString(36)}-${action === 'start' ? 's' : 'c'}-${actionSequence.toString(36)}`;
}

/**
 * HF-315(b): a pending whose expected completion plus the reliable-lane grace has
 * passed without any host result is lost — clearable so reload never bricks.
 */
export function isExpired(pending: LocalReloadPending, nowMs: number): boolean {
  return nowMs > pending.expectedCompletionMs + LOCAL_RELOAD_EXPIRY_GRACE_MS;
}

/**
 * HF-315(b): a pending from a previous life can never be cleared by a host result
 * (results always carry the current continuity), so it is stale the moment the
 * local life changes.
 */
export function isStale(pending: LocalReloadPending, currentLifeId: number): boolean {
  return pending.lifeId !== currentLifeId;
}

/**
 * Why a pending should be force-cleared right now, for the caller's
 * 'reload-authority expired' diagnostic — or null while it is still live.
 * Stale-life wins over expiry: it identifies the death-mid-reload brick precisely.
 */
export function pendingReloadClearReason(
  pending: LocalReloadPending,
  nowMs: number,
  currentLifeId: number,
): 'stale-life' | 'expired' | null {
  if (isStale(pending, currentLifeId)) return 'stale-life';
  if (isExpired(pending, nowMs)) return 'expired';
  return null;
}

function sequenceMatches(pending: LocalReloadPending, message: LocalReloadResultInput): boolean {
  const expectedSequence = pending.cancelSequence ?? pending.startSequence;
  const expectedRequestId = pending.cancelRequestId ?? pending.requestId;
  if (message.actionSequence === expectedSequence && message.requestId === expectedRequestId) return true;
  // Committed-start special case: the host committed the reload before our cancel
  // intent arrived. The commit at the start sequence stays authoritative even while
  // a cancel is in flight (the cancel will be rejected 'no-pending-reload').
  // HF-315(b): the legacy guard wrote this race with `cancelSequence === null`,
  // which made the branch unreachable and dropped the raced commit.
  return message.status === 'committed'
    && message.actionSequence === pending.startSequence
    && message.requestId === pending.requestId;
}

/**
 * Pure decision for an incoming reload-result. Mirrors the legacy
 * acceptLocalReloadResult guards (epoch/life/weapon/sequence matching, 'started'
 * keeping the pending) plus the HF-315(b) reconciliation rules. The caller owns the
 * side effects: applying the combat-inventory projection, cancelling the local
 * reload presentation, and recording diagnostics.
 */
export function applyReloadResult(
  pending: LocalReloadPending | null,
  message: LocalReloadResultInput,
  context: LocalReloadContext,
): LocalReloadResultOutcome {
  const outcome = (
    nextPending: LocalReloadPending | null,
    action: LocalReloadResultAction,
    recordRejectedDiagnostic = false,
  ): LocalReloadResultOutcome => Object.freeze({ pending: nextPending, action, recordRejectedDiagnostic });

  if (message.connectionEpoch !== context.localConnectionEpoch
    || message.lifeId !== context.currentLifeId) return outcome(pending, 'ignore');

  const matched = pending !== null
    && pending.connectionEpoch === message.connectionEpoch
    && pending.lifeId === message.lifeId
    && pending.weapon === message.weapon
    && sequenceMatches(pending, message);

  if (matched) {
    if (message.status === 'started') return outcome(pending, 'acknowledge-started');
    return outcome(
      null,
      'clear-and-apply-projection',
      message.status === 'rejected' && message.reason !== 'no-pending-reload',
    );
  }

  // HF-315(b) reconciliation: the host telling us it has no pending reload for our
  // current epoch/life clears whatever mismatched pending we still hold (stale life,
  // stale weapon, stale sequence) — clean local reconciliation, never granting ammo.
  if (pending !== null && message.status !== 'started'
    && message.reason === 'no-pending-reload') {
    return outcome(null, 'clear-and-apply-projection');
  }

  // HF-315(b): a late 'committed' after local expiry (or after a newer attempt
  // replaced the pending) is still host truth — apply the projection, keep whatever
  // pending is currently tracked. Projection application downstream is
  // revision-gated, so replays cannot regress ammo.
  if (message.status === 'committed') return outcome(pending, 'apply-projection-only');

  return outcome(pending, 'ignore');
}

export type ReloadActionSequenceAllocator = Readonly<{
  /** Returns the sequence to stamp on the next intent, then advances. */
  next(): number;
  /** Back to zero — mirrors the legacy resets on network reset / resume / match start. */
  reset(): void;
  /** The value next() would return, without consuming it. */
  current(): number;
}>;

/**
 * Replaces the legacy-main module-level `localReloadActionSequence` counter so the
 * wiring no longer owns mutable sequence state.
 */
export function createReloadActionSequenceAllocator(initial = 0): ReloadActionSequenceAllocator {
  let sequence = initial;
  return Object.freeze({
    next: (): number => {
      const allocated = sequence;
      sequence += 1;
      return allocated;
    },
    reset: (): void => {
      sequence = initial;
    },
    current: (): number => sequence,
  });
}
