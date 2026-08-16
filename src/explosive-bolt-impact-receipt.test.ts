import { describe, expect, it } from 'vitest';
import {
  ExplosiveBoltImpactReceiptLedger,
  bindExplosiveBoltImpactObservation,
  type ExplosiveBoltImpactObservationBinding,
  type ExplosiveBoltImpactReceiptInput,
} from './explosive-bolt-impact-receipt';

const intactPane = Object.freeze({
  id: 'atomic-window-1',
  broken: false as const,
  visible: true as const,
  activeWorldColliderPresent: true as const,
  rapierDynamicColliderCount: 8,
  authority: Object.freeze({
    phase: 'intact' as const,
    paneVisible: true as const,
    apertureOpen: false as const,
    movementSolid: true as const,
    ballisticSolid: true as const,
    aiLineOfSightSolid: true as const,
  }),
});

function receipt(overrides: Partial<ExplosiveBoltImpactReceiptInput> = {}): ExplosiveBoltImpactReceiptInput {
  return {
    matchEpoch: 4,
    ownerId: 'local-player',
    actionNonce: 91,
    authority: true,
    spawnedAt: 1_000,
    impactedAt: 1_240,
    impactWindowId: intactPane.id,
    position: [4, 1.6, -7],
    detonatesAt: 1_940,
    pane: intactPane,
    ...overrides,
  };
}

function binding(overrides: Partial<ExplosiveBoltImpactObservationBinding> = {}): ExplosiveBoltImpactObservationBinding {
  return {
    cursor: 0,
    matchEpoch: 4,
    ownerId: 'local-player',
    actionNonce: 91,
    authority: true,
    spawnedAt: 1_000,
    impactWindowId: intactPane.id,
    ...overrides,
  };
}

describe('authoritative explosive-bolt impact receipts', () => {
  it('retains a bounded deeply immutable receipt from one exact action identity', () => {
    const ledger = new ExplosiveBoltImpactReceiptLedger(2);
    const first = ledger.record(receipt());
    expect(first).not.toBeNull();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first!.position)).toBe(true);
    expect(Object.isFrozen(first!.pane)).toBe(true);
    expect(Object.isFrozen(first!.pane.authority)).toBe(true);
    expect(ledger.record(receipt())).toBeNull();

    expect(ledger.record(receipt({ actionNonce: 92 }))).not.toBeNull();
    expect(ledger.record(receipt({ actionNonce: 93 }))).not.toBeNull();
    expect(ledger.size()).toBe(2);
    expect(ledger.readExact(binding(), 2_000, 3_000)).toMatchObject({ status: 'pending', reason: 'missing' });
  });

  it('rejects backdated event and action timestamps instead of manufacturing a deadline pass', () => {
    const ledger = new ExplosiveBoltImpactReceiptLedger();
    expect(ledger.record(receipt({ spawnedAt: 1_000, impactedAt: 999 }))).toBeNull();
    expect(ledger.record(receipt({ impactedAt: 1_240, detonatesAt: 1_240 }))).toBeNull();
    expect(bindExplosiveBoltImpactObservation({
      cursor: 0,
      matchEpoch: 4,
      ownerId: 'local-player',
      impactWindowId: intactPane.id,
      armedAt: 1_000,
    }, {
      matchEpoch: 4,
      ownerId: 'local-player',
      actionNonce: 91,
      authority: true,
      spawnedAt: 999,
    })).toBeNull();
  });

  it('does not bind a stale owner, epoch or non-authoritative local action', () => {
    const arm = {
      cursor: 7,
      matchEpoch: 4,
      ownerId: 'local-player',
      impactWindowId: intactPane.id,
      armedAt: 1_000,
    } as const;
    const action = {
      matchEpoch: 4,
      ownerId: 'local-player',
      actionNonce: 91,
      authority: true,
      spawnedAt: 1_001,
    } as const;
    expect(bindExplosiveBoltImpactObservation(arm, action)).toEqual({
      cursor: 7,
      matchEpoch: 4,
      ownerId: 'local-player',
      actionNonce: 91,
      authority: true,
      spawnedAt: 1_001,
      impactWindowId: intactPane.id,
    });
    expect(bindExplosiveBoltImpactObservation(arm, { ...action, ownerId: 'stale-owner' })).toBeNull();
    expect(bindExplosiveBoltImpactObservation(arm, { ...action, matchEpoch: 3 })).toBeNull();
    expect(bindExplosiveBoltImpactObservation(arm, { ...action, authority: false })).toBeNull();
  });

  it('never admits a stale nonce, owner or pane through the cursor', () => {
    const ledger = new ExplosiveBoltImpactReceiptLedger();
    expect(ledger.record(receipt())).not.toBeNull();
    expect(ledger.readExact(binding({ actionNonce: 90 }), 2_000, 2_000)).toMatchObject({
      status: 'pending', reason: 'missing',
    });
    expect(ledger.readExact(binding({ ownerId: 'other-player' }), 2_000, 2_000)).toMatchObject({
      status: 'pending', reason: 'missing',
    });
    expect(ledger.readExact(binding({ impactWindowId: 'atomic-window-2' }), 2_000, 2_000)).toMatchObject({
      status: 'rejected', reason: 'pane-mismatch',
    });
  });

  it('advances a reset barrier so pre-clear arms cannot bind later receipts', () => {
    const ledger = new ExplosiveBoltImpactReceiptLedger();
    expect(ledger.record(receipt())).not.toBeNull();
    const staleCursor = ledger.cursor();
    ledger.clear();
    const currentCursor = ledger.cursor();
    expect(currentCursor).toBeGreaterThan(staleCursor);
    expect(ledger.acceptsCursor(staleCursor)).toBe(false);
    expect(ledger.acceptsCursor(currentCursor)).toBe(true);
    expect(ledger.record(receipt({
      actionNonce: 92,
      spawnedAt: 2_000,
      impactedAt: 2_250,
      detonatesAt: 2_950,
    }))).not.toBeNull();
    expect(ledger.readExact(binding({
      cursor: staleCursor,
      actionNonce: 92,
      spawnedAt: 2_000,
    }), 2_000, 4_000)).toMatchObject({
      status: 'rejected', reason: 'stale-cursor', receipt: null,
    });
    expect(ledger.readExact(binding({
      cursor: currentCursor,
      actionNonce: 92,
      spawnedAt: 2_000,
    }), 2_000, 4_000)).toMatchObject({
      status: 'accepted', actualImpactLatencyMs: 250,
    });
  });

  it('rejects an actual impact beyond 2000ms even when it is observed later', () => {
    const ledger = new ExplosiveBoltImpactReceiptLedger();
    expect(ledger.record(receipt({ impactedAt: 3_001, detonatesAt: 3_701 }))).not.toBeNull();
    expect(ledger.readExact(binding(), 2_000, 5_000)).toMatchObject({
      status: 'rejected', reason: 'late-impact',
    });
  });

  it('accepts the immutable actual event after detonation when its impact met the original deadline', () => {
    const ledger = new ExplosiveBoltImpactReceiptLedger();
    const recorded = ledger.record(receipt({ impactedAt: 1_250, detonatesAt: 1_950 }));
    expect(recorded).not.toBeNull();
    expect(ledger.readExact(binding(), 2_000, 5_000)).toMatchObject({
      status: 'accepted',
      reason: 'accepted',
      actualImpactLatencyMs: 250,
      observedAfterDetonation: true,
      receipt: { cursor: recorded!.cursor, actionNonce: 91, impactWindowId: intactPane.id },
    });
  });
});
