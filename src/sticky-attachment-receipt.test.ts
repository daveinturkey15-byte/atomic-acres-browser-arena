import { describe, expect, it } from 'vitest';
import { STATE_BROADCAST_INTERVAL_MS } from './network-sync';
import { MULTIPLAYER_PROTOCOL_VERSION, type StickyAttachmentReceiptMessage } from './protocol';
import {
  STICKY_ATTACHMENT_PENDING_CAPACITY,
  STICKY_ATTACHMENT_PENDING_TTL_MS,
  STICKY_ATTACHMENT_PENDING_STATE_WINDOWS,
  STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY,
  StickyAttachmentReceiptLedger,
  planStickyAttachmentOnset,
} from './sticky-attachment-receipt';

function receipt(overrides: Partial<StickyAttachmentReceiptMessage> = {}): StickyAttachmentReceiptMessage {
  return {
    type: 'sticky-attachment-receipt',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: 'host',
    forPlayerId: 'guest-attacker',
    matchEpoch: 7,
    source: 'semtex',
    ownerId: 'guest-attacker',
    ownerLifeId: 3,
    targetId: 'host',
    targetLifeId: 5,
    actionNonce: 41,
    attachedAtHostTimeMs: 1_250,
    nonce: 91,
    ...overrides,
  };
}

const guestAttackerContext = {
  expectedHostId: 'host',
  expectedRecipientId: 'guest-attacker',
  expectedMatchEpoch: 7,
  currentOwnerLifeId: 3,
  currentTargetLifeId: 5,
} as const;

describe('authoritative sticky attachment onset', () => {
  it('retains forty slow state-lane opportunities inside the bounded two-second reorder window', () => {
    expect(STATE_BROADCAST_INTERVAL_MS).toBe(50);
    expect(STICKY_ATTACHMENT_PENDING_TTL_MS).toBe(2_000);
    expect(STICKY_ATTACHMENT_PENDING_STATE_WINDOWS).toBe(40);
    expect(STICKY_ATTACHMENT_PENDING_TTL_MS / STATE_BROADCAST_INTERVAL_MS)
      .toBe(STICKY_ATTACHMENT_PENDING_STATE_WINDOWS);
  });

  it('plans guest-attacker to host-victim feedback at attachment onset', () => {
    expect(planStickyAttachmentOnset(receipt(), 'host')).toEqual({
      localAudience: 'victim',
      remoteRecipients: [{ playerId: 'guest-attacker', audience: 'attacker' }],
    });
  });

  it('plans host-attacker to guest-victim feedback at attachment onset', () => {
    expect(planStickyAttachmentOnset(receipt({
      forPlayerId: 'guest-victim',
      source: 'explosive-crossbow',
      ownerId: 'host',
      ownerLifeId: 5,
      targetId: 'guest-victim',
      targetLifeId: 8,
    }), 'host')).toEqual({
      localAudience: 'attacker',
      remoteRecipients: [{ playerId: 'guest-victim', audience: 'victim' }],
    });
  });

  it('targets both guest parties when neither attachment party is the host', () => {
    expect(planStickyAttachmentOnset(receipt({
      ownerId: 'guest-attacker',
      targetId: 'guest-victim',
      forPlayerId: 'guest-attacker',
    }), 'host')).toEqual({
      localAudience: null,
      remoteRecipients: [
        { playerId: 'guest-attacker', audience: 'attacker' },
        { playerId: 'guest-victim', audience: 'victim' },
      ],
    });
  });

  it('admits both Semtex and crossbow receipts only for the exact current authority tuple', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    expect(ledger.admit(receipt(), guestAttackerContext)).toEqual({
      accepted: true, reason: 'accepted', audience: 'attacker',
    });
    expect(ledger.admit(receipt({
      forPlayerId: 'guest-victim',
      source: 'explosive-crossbow',
      ownerId: 'host',
      ownerLifeId: 5,
      targetId: 'guest-victim',
      targetLifeId: 8,
      actionNonce: 42,
      nonce: 92,
    }), {
      expectedHostId: 'host',
      expectedRecipientId: 'guest-victim',
      expectedMatchEpoch: 7,
      currentOwnerLifeId: 5,
      currentTargetLifeId: 8,
    })).toEqual({ accepted: true, reason: 'accepted', audience: 'victim' });
  });

  it('rejects wrong host, recipient, epoch, owner life, target life, and non-party recipients', () => {
    const attempt = (
      message: StickyAttachmentReceiptMessage,
      context: Parameters<StickyAttachmentReceiptLedger['admit']>[1] = guestAttackerContext,
    ) => new StickyAttachmentReceiptLedger().admit(message, context).reason;
    expect(attempt(receipt({ by: 'forged-host' }))).toBe('forged-host');
    expect(attempt(receipt({ forPlayerId: 'host' }))).toBe('wrong-recipient');
    expect(attempt(receipt({ matchEpoch: 6 }))).toBe('match-epoch-mismatch');
    expect(attempt(receipt({ ownerLifeId: 2 }))).toBe('owner-life-mismatch');
    expect(attempt(receipt({ targetLifeId: 4 }))).toBe('target-life-mismatch');
    expect(attempt(receipt({ forPlayerId: 'spectator' }), {
      ...guestAttackerContext,
      expectedRecipientId: 'spectator',
    })).toBe('recipient-not-party');
  });

  it('does not let a rejected prediction or forged envelope suppress the later canonical receipt', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    expect(ledger.admit(receipt({ by: 'forged-host' }), guestAttackerContext).reason).toBe('forged-host');
    expect(ledger.admit(receipt(), guestAttackerContext)).toEqual({
      accepted: true, reason: 'accepted', audience: 'attacker',
    });
  });

  it('queues a canonical receipt that outruns owner and target continuity, then consumes it exactly once', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    expect(ledger.admit(receipt(), {
      ...guestAttackerContext,
      currentOwnerLifeId: 2,
      currentTargetLifeId: null,
    }, 1_000)).toEqual({ accepted: false, reason: 'pending-continuity', audience: null });
    expect(ledger.snapshot()).toMatchObject({ pending: 1, nextPendingExpiryAtMs: 1_000 + STICKY_ATTACHMENT_PENDING_TTL_MS });

    expect(ledger.retryPending({
      expectedHostId: 'host',
      expectedRecipientId: 'guest-attacker',
      expectedMatchEpoch: 7,
      currentLifeId: (actorId) => actorId === 'guest-attacker' ? 3 : 4,
    }, 1_100)).toEqual([]);
    const ready = ledger.retryPending({
      expectedHostId: 'host',
      expectedRecipientId: 'guest-attacker',
      expectedMatchEpoch: 7,
      currentLifeId: (actorId) => actorId === 'guest-attacker' ? 3 : 5,
    }, 1_200);
    expect(ready).toEqual([{ message: receipt(), audience: 'attacker' }]);
    expect(ledger.snapshot()).toMatchObject({ pending: 1, nonces: 0, attachments: 0 });
    expect(ledger.finalizePending(ready[0]!.message)).toBe(true);
    expect(ledger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });
    expect(ledger.retryPending({
      expectedHostId: 'host',
      expectedRecipientId: 'guest-attacker',
      expectedMatchEpoch: 7,
      currentLifeId: () => 5,
    }, 1_300)).toEqual([]);
    expect(ledger.admit(receipt({ nonce: 92 }), guestAttackerContext, 1_300).reason).toBe('duplicate-attachment');
    expect(ledger.admit(receipt({ actionNonce: 42, nonce: 92 }), guestAttackerContext, 1_300).reason).toBe('duplicate-nonce');
  });

  it('releases a host-attacker crossbow receipt to its guest victim only when both lives are current', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    const message = receipt({
      forPlayerId: 'guest-victim',
      source: 'explosive-crossbow',
      ownerId: 'host',
      ownerLifeId: 5,
      targetId: 'guest-victim',
      targetLifeId: 8,
      actionNonce: 42,
      nonce: 92,
    });
    expect(ledger.admit(message, {
      expectedHostId: 'host',
      expectedRecipientId: 'guest-victim',
      expectedMatchEpoch: 7,
      currentOwnerLifeId: null,
      currentTargetLifeId: 7,
    }, 2_000).reason).toBe('pending-continuity');
    const ready = ledger.retryPending({
      expectedHostId: 'host',
      expectedRecipientId: 'guest-victim',
      expectedMatchEpoch: 7,
      currentLifeId: (actorId) => actorId === 'host' ? 5 : 8,
    }, 2_100);
    expect(ready).toEqual([{ message, audience: 'victim' }]);
    expect(ledger.snapshot()).toMatchObject({ pending: 1, nonces: 0, attachments: 0 });
    expect(ledger.finalizePending(message)).toBe(true);
    expect(ledger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });
  });

  it('does not allocate a pending receipt twice for either its transport or semantic identity', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    const behind = { ...guestAttackerContext, currentOwnerLifeId: 2, currentTargetLifeId: 4 };
    expect(ledger.admit(receipt(), behind, 1_000).reason).toBe('pending-continuity');
    expect(ledger.admit(receipt(), behind, 1_001).reason).toBe('duplicate-nonce');
    expect(ledger.admit(receipt({ nonce: 92 }), behind, 1_002).reason).toBe('duplicate-attachment');
    expect(ledger.snapshot()).toMatchObject({ pending: 1, attachments: 0, nonces: 1 });
  });

  it('bounds pending canonical identities and tombstones an evicted replay', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    for (let index = 0; index <= STICKY_ATTACHMENT_PENDING_CAPACITY; index += 1) {
      expect(ledger.admit(receipt({ actionNonce: index, nonce: index }), {
        ...guestAttackerContext,
        currentOwnerLifeId: 2,
      }, 1_000 + index).reason).toBe('pending-continuity');
    }
    expect(ledger.snapshot()).toMatchObject({
      pending: STICKY_ATTACHMENT_PENDING_CAPACITY,
      nonces: 1,
      attachments: 1,
      bounded: true,
    });
    expect(ledger.admit(receipt({ actionNonce: 0, nonce: 0 }), guestAttackerContext, 2_000).reason)
      .toBe('duplicate-nonce');
  });

  it('expires a pending receipt and burns its replay identity before continuity catches up', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    expect(ledger.admit(receipt(), {
      ...guestAttackerContext,
      currentTargetLifeId: 4,
    }, 1_000).reason).toBe('pending-continuity');
    expect(ledger.retryPending({
      expectedHostId: 'host',
      expectedRecipientId: 'guest-attacker',
      expectedMatchEpoch: 7,
      currentLifeId: (actorId) => actorId === 'guest-attacker' ? 3 : 5,
    }, 1_000 + STICKY_ATTACHMENT_PENDING_TTL_MS + 1)).toEqual([]);
    expect(ledger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });
    expect(ledger.admit(receipt(), guestAttackerContext, 4_000).reason).toBe('duplicate-nonce');
  });

  it('drops stale pending lives on a later respawn and clears actor or disconnect queues replay-safely', () => {
    const respawnLedger = new StickyAttachmentReceiptLedger();
    respawnLedger.admit(receipt(), { ...guestAttackerContext, currentOwnerLifeId: 2 }, 1_000);
    expect(respawnLedger.retryPending({
      expectedHostId: 'host',
      expectedRecipientId: 'guest-attacker',
      expectedMatchEpoch: 7,
      currentLifeId: (actorId) => actorId === 'guest-attacker' ? 4 : 5,
    }, 1_100)).toEqual([]);
    expect(respawnLedger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });

    const actorLedger = new StickyAttachmentReceiptLedger();
    actorLedger.admit(receipt(), { ...guestAttackerContext, currentTargetLifeId: null }, 2_000);
    actorLedger.discardPendingBeforeActorLife('host', 5);
    expect(actorLedger.snapshot()).toMatchObject({ pending: 1, nonces: 0, attachments: 0 });
    actorLedger.discardPendingBeforeActorLife('host', 6);
    expect(actorLedger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });

    const disconnectLedger = new StickyAttachmentReceiptLedger();
    disconnectLedger.admit(receipt(), { ...guestAttackerContext, currentTargetLifeId: null }, 2_000);
    disconnectLedger.discardPendingForActor('host');
    expect(disconnectLedger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });

    const matchLedger = new StickyAttachmentReceiptLedger();
    matchLedger.admit(receipt(), { ...guestAttackerContext, currentTargetLifeId: null }, 2_000);
    matchLedger.discardPending();
    expect(matchLedger.snapshot()).toMatchObject({ pending: 0, nonces: 1, attachments: 1 });
  });

  it('never queues wrong host, recipient, epoch, or non-party identities', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    const future = { ...guestAttackerContext, currentOwnerLifeId: null, currentTargetLifeId: null };
    expect(ledger.admit(receipt({ by: 'forged-host' }), future, 1_000).reason).toBe('forged-host');
    expect(ledger.admit(receipt({ forPlayerId: 'victim-two' }), future, 1_000).reason).toBe('wrong-recipient');
    expect(ledger.admit(receipt({ matchEpoch: 8 }), future, 1_000).reason).toBe('match-epoch-mismatch');
    expect(ledger.admit(receipt({ forPlayerId: 'spectator' }), {
      ...future,
      expectedRecipientId: 'spectator',
    }, 1_000).reason).toBe('recipient-not-party');
    expect(ledger.snapshot()).toEqual({
      nonces: 0, attachments: 0, pending: 0, nextPendingExpiryAtMs: null, bounded: true,
    });
  });

  it('rejects exact transport and fresh-nonce semantic replays without dropping distinct valid actions', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    expect(ledger.admit(receipt(), guestAttackerContext).accepted).toBe(true);
    expect(ledger.admit(receipt(), guestAttackerContext).reason).toBe('duplicate-nonce');
    expect(ledger.admit(receipt({ nonce: 92 }), guestAttackerContext).reason).toBe('duplicate-attachment');
    expect(ledger.admit(receipt({ actionNonce: 42, nonce: 93 }), guestAttackerContext)).toEqual({
      accepted: true, reason: 'accepted', audience: 'attacker',
    });
  });

  it('retains bounded replay evidence and resets at a match boundary', () => {
    const ledger = new StickyAttachmentReceiptLedger();
    for (let index = 0; index <= STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY; index += 1) {
      ledger.admit(receipt({ actionNonce: index, nonce: index }), guestAttackerContext);
    }
    expect(ledger.snapshot()).toEqual({
      nonces: STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY,
      attachments: STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY,
      pending: 0,
      nextPendingExpiryAtMs: null,
      bounded: true,
    });
    ledger.reset();
    expect(ledger.snapshot()).toEqual({
      nonces: 0, attachments: 0, pending: 0, nextPendingExpiryAtMs: null, bounded: true,
    });
  });
});
