import { describe, expect, it } from 'vitest';
import {
  applyReloadResult,
  cancelRequested,
  createPendingReload,
  createReloadActionSequenceAllocator,
  isExpired,
  isStale,
  LOCAL_RELOAD_EXPIRY_GRACE_MS,
  pendingReloadClearReason,
  type LocalReloadContext,
  type LocalReloadResultInput,
} from './local-reload-authority';

const epoch = 'connection_epoch_a';
const context: LocalReloadContext = { localConnectionEpoch: epoch, currentLifeId: 4 };

const pendingStart = (overrides: Partial<Parameters<typeof createPendingReload>[0]> = {}) =>
  createPendingReload({
    connectionEpoch: epoch, lifeId: 4, requestId: 'reload-request-start-0', weapon: 'm4a1', actionSequence: 0,
    nowMs: 1_000, expectedCompletionMs: 3_400, ...overrides,
  });

const result = (overrides: Partial<LocalReloadResultInput> = {}): LocalReloadResultInput => ({
  connectionEpoch: epoch, lifeId: 4, actionSequence: 0, requestId: 'reload-request-start-0', weapon: 'm4a1',
  status: 'committed', reason: 'committed', ...overrides,
});

describe('local reload authority pending lifecycle', () => {
  it('creates a frozen pending with the start sequence and no cancel in flight', () => {
    const pending = pendingStart();
    expect(pending).toEqual({
      connectionEpoch: epoch, lifeId: 4, requestId: 'reload-request-start-0', startSequence: 0, cancelSequence: null,
      cancelRequestId: null,
      weapon: 'm4a1', requestedAtMs: 1_000, expectedCompletionMs: 3_400,
    });
    expect(Object.isFrozen(pending)).toBe(true);
  });

  it('registers a cancel exactly once without mutating the original pending', () => {
    const pending = pendingStart();
    const cancelling = cancelRequested(pending, 1, 'reload-request-cancel-1');
    expect(cancelling).not.toBeNull();
    expect(cancelling?.cancelSequence).toBe(1);
    expect(cancelling?.startSequence).toBe(0);
    expect(pending.cancelSequence).toBeNull();
    // One-shot: a second cancel intent must not be sent (legacy sendLocalReloadCancel guard).
    expect(cancelRequested(cancelling!, 2, 'reload-request-cancel-2')).toBeNull();
  });
});

describe('applyReloadResult context guards', () => {
  it('ignores results from another connection epoch', () => {
    const pending = pendingStart();
    const outcome = applyReloadResult(pending, result({ connectionEpoch: 'wrong_epoch' }), context);
    expect(outcome).toEqual({ pending, action: 'ignore', recordRejectedDiagnostic: false });
  });

  it('ignores results addressed to a life that is not the current one', () => {
    const pending = pendingStart({ lifeId: 3 });
    // Message matches the pending's (old) life but not the current life — dropped,
    // mirroring the legacy outer guard message.lifeId === localContinuity.
    const outcome = applyReloadResult(pending, result({ lifeId: 3 }), context);
    expect(outcome.action).toBe('ignore');
    expect(outcome.pending).toBe(pending);
  });
});

describe('applyReloadResult matched transitions', () => {
  it('keeps the pending on a started acknowledgement', () => {
    const pending = pendingStart();
    const outcome = applyReloadResult(pending, result({ status: 'started', reason: 'accepted' }), context);
    expect(outcome.action).toBe('acknowledge-started');
    expect(outcome.pending).toBe(pending);
    expect(outcome.recordRejectedDiagnostic).toBe(false);
  });

  it('clears and applies the projection on a committed start', () => {
    const outcome = applyReloadResult(pendingStart(), result(), context);
    expect(outcome).toEqual({ pending: null, action: 'clear-and-apply-projection', recordRejectedDiagnostic: false });
  });

  it('clears on a cancelled result matching the cancel sequence', () => {
    const cancelling = cancelRequested(pendingStart(), 1, 'reload-request-cancel-1')!;
    const outcome = applyReloadResult(
      cancelling,
      result({ actionSequence: 1, requestId: 'reload-request-cancel-1', status: 'cancelled', reason: 'cancelled' }),
      context,
    );
    expect(outcome.action).toBe('clear-and-apply-projection');
    expect(outcome.pending).toBeNull();
    expect(outcome.recordRejectedDiagnostic).toBe(false);
  });

  it('clears and flags the diagnostic on a substantive rejection', () => {
    const outcome = applyReloadResult(
      pendingStart(),
      result({ status: 'rejected', reason: 'nothing-to-reload' }),
      context,
    );
    expect(outcome.action).toBe('clear-and-apply-projection');
    expect(outcome.pending).toBeNull();
    expect(outcome.recordRejectedDiagnostic).toBe(true);
  });

  it('clears without a diagnostic on a matched no-pending-reload rejection', () => {
    const outcome = applyReloadResult(
      pendingStart(),
      result({ status: 'rejected', reason: 'no-pending-reload' }),
      context,
    );
    expect(outcome.action).toBe('clear-and-apply-projection');
    expect(outcome.recordRejectedDiagnostic).toBe(false);
  });

  it('accepts a committed start that raced an in-flight cancel (committed-start special case)', () => {
    // HF-315(b): the host committed before our cancel intent arrived. The commit at
    // the start sequence is authoritative; the cancel will bounce as no-pending-reload.
    const cancelling = cancelRequested(pendingStart(), 1, 'reload-request-cancel-1')!;
    const outcome = applyReloadResult(cancelling, result({ actionSequence: 0 }), context);
    expect(outcome.action).toBe('clear-and-apply-projection');
    expect(outcome.pending).toBeNull();
  });

  it('ignores a non-committed result at the start sequence while a cancel is in flight', () => {
    const cancelling = cancelRequested(pendingStart(), 1, 'reload-request-cancel-1')!;
    const started = applyReloadResult(
      cancelling,
      result({ actionSequence: 0, status: 'started', reason: 'accepted' }),
      context,
    );
    expect(started.action).toBe('ignore');
    expect(started.pending).toBe(cancelling);
    const rejected = applyReloadResult(
      cancelling,
      result({ actionSequence: 0, status: 'rejected', reason: 'weapon-mismatch' }),
      context,
    );
    expect(rejected.action).toBe('ignore');
    expect(rejected.pending).toBe(cancelling);
  });
});

describe('applyReloadResult duplicate and ordering cases', () => {
  it('ignores a cancelled result whose sequence matches nothing', () => {
    const pending = pendingStart();
    const outcome = applyReloadResult(
      pending,
      result({ actionSequence: 7, status: 'cancelled', reason: 'cancelled' }),
      context,
    );
    expect(outcome.action).toBe('ignore');
    expect(outcome.pending).toBe(pending);
  });

  it('ignores terminal non-committed results when nothing is pending', () => {
    expect(applyReloadResult(null, result({ status: 'rejected', reason: 'cancelled' }), context).action).toBe('ignore');
    expect(applyReloadResult(null, result({ status: 'cancelled', reason: 'cancelled' }), context).action).toBe('ignore');
    expect(applyReloadResult(null, result({ status: 'started', reason: 'accepted' }), context).action).toBe('ignore');
    // No pending to reconcile — a stray no-pending-reload rejection is just noise.
    expect(applyReloadResult(null, result({ status: 'rejected', reason: 'no-pending-reload' }), context).action)
      .toBe('ignore');
  });

  it('applies a duplicate committed after the pending was already cleared', () => {
    const first = applyReloadResult(pendingStart(), result(), context);
    expect(first.pending).toBeNull();
    const duplicate = applyReloadResult(first.pending, result(), context);
    expect(duplicate.action).toBe('apply-projection-only');
    expect(duplicate.pending).toBeNull();
  });

  it('keeps a newer pending when a late committed for an older attempt arrives', () => {
    const newer = pendingStart({ actionSequence: 4, nowMs: 9_000, expectedCompletionMs: 11_400 });
    const outcome = applyReloadResult(newer, result({ actionSequence: 0 }), context);
    expect(outcome.action).toBe('apply-projection-only');
    expect(outcome.pending).toBe(newer);
  });

  it('keeps the pending when a committed for another weapon arrives', () => {
    const pending = pendingStart();
    const outcome = applyReloadResult(pending, result({ weapon: 'pistol' }), context);
    expect(outcome.action).toBe('apply-projection-only');
    expect(outcome.pending).toBe(pending);
  });
});

describe('HF-315(b) expiry and life scoping', () => {
  it('expires strictly after expected completion plus the reliable-lane grace', () => {
    const pending = pendingStart();
    const deadline = pending.expectedCompletionMs + LOCAL_RELOAD_EXPIRY_GRACE_MS;
    expect(isExpired(pending, pending.requestedAtMs)).toBe(false);
    expect(isExpired(pending, pending.expectedCompletionMs)).toBe(false);
    expect(isExpired(pending, deadline)).toBe(false);
    expect(isExpired(pending, deadline + 1)).toBe(true);
    expect(pendingReloadClearReason(pending, deadline, 4)).toBeNull();
    expect(pendingReloadClearReason(pending, deadline + 1, 4)).toBe('expired');
  });

  it('marks a pending from a previous life stale', () => {
    const pending = pendingStart();
    expect(isStale(pending, 4)).toBe(false);
    expect(isStale(pending, 5)).toBe(true);
    expect(pendingReloadClearReason(pending, pending.requestedAtMs, 5)).toBe('stale-life');
  });

  it('reports stale-life ahead of expired when both apply', () => {
    const pending = pendingStart();
    const past = pending.expectedCompletionMs + LOCAL_RELOAD_EXPIRY_GRACE_MS + 1;
    expect(pendingReloadClearReason(pending, past, 5)).toBe('stale-life');
  });

  it('started-then-death leaves no permanent pending and never blocks the next life', () => {
    // Life 4: reload starts, host acknowledges 'started' (pending deliberately kept).
    let pending = pendingStart();
    const started = applyReloadResult(pending, result({ status: 'started', reason: 'accepted' }), context);
    expect(started.action).toBe('acknowledge-started');
    pending = started.pending!;
    // Guest dies mid-reload; respawn increments the local life. Before HF-315(b) no
    // host result could ever clear this pending — now it is stale and clearable.
    const newLife = 5;
    expect(pendingReloadClearReason(pending, pending.requestedAtMs + 500, newLife)).toBe('stale-life');
    // Wiring clears it and the next life's reload proceeds normally.
    const fresh = pendingStart({ lifeId: newLife, actionSequence: 2, nowMs: 6_000, expectedCompletionMs: 8_400 });
    const freshContext: LocalReloadContext = { localConnectionEpoch: epoch, currentLifeId: newLife };
    expect(pendingReloadClearReason(fresh, 6_500, newLife)).toBeNull();
    const committed = applyReloadResult(fresh, result({ lifeId: newLife, actionSequence: 2 }), freshContext);
    expect(committed.action).toBe('clear-and-apply-projection');
    expect(committed.pending).toBeNull();
  });

  it('reconciles a stale-life pending on a current-life no-pending-reload rejection', () => {
    // HF-315(b): host says it has no pending for our current epoch/life — clear the
    // mismatched leftover regardless of its life, never granting ammo locally.
    const stale = pendingStart({ lifeId: 3 });
    const outcome = applyReloadResult(
      stale,
      result({ actionSequence: 6, status: 'rejected', reason: 'no-pending-reload' }),
      context,
    );
    expect(outcome.action).toBe('clear-and-apply-projection');
    expect(outcome.pending).toBeNull();
    expect(outcome.recordRejectedDiagnostic).toBe(false);
  });

  it('treats a late committed after local expiry as authoritative', () => {
    const pending = pendingStart();
    const afterExpiry = pending.expectedCompletionMs + LOCAL_RELOAD_EXPIRY_GRACE_MS + 1;
    expect(pendingReloadClearReason(pending, afterExpiry, 4)).toBe('expired');
    // Wiring cleared the pending on expiry; the slow commit still lands its projection.
    const late = applyReloadResult(null, result(), context);
    expect(late.action).toBe('apply-projection-only');
    expect(late.pending).toBeNull();
  });
});

describe('reload action sequence allocator', () => {
  it('allocates monotonically and resets to its initial value', () => {
    const allocator = createReloadActionSequenceAllocator();
    expect(allocator.current()).toBe(0);
    expect(allocator.next()).toBe(0);
    expect(allocator.next()).toBe(1);
    expect(allocator.current()).toBe(2);
    allocator.reset();
    expect(allocator.current()).toBe(0);
    expect(allocator.next()).toBe(0);
  });

  it('keeps independent allocators isolated', () => {
    const a = createReloadActionSequenceAllocator();
    const b = createReloadActionSequenceAllocator(10);
    a.next();
    expect(b.current()).toBe(10);
    expect(b.next()).toBe(10);
    b.reset();
    expect(b.current()).toBe(10);
    expect(a.current()).toBe(1);
  });
});
