import { describe, expect, it } from 'vitest';
import { MULTIPLAYER_PROTOCOL_VERSION, type StickyAttachmentReceiptMessage } from './protocol';
import {
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
      bounded: true,
    });
    ledger.reset();
    expect(ledger.snapshot()).toEqual({ nonces: 0, attachments: 0, bounded: true });
  });
});
