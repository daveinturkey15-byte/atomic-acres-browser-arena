import { describe, expect, it } from 'vitest';
import {
  createRemoteStickyAttachmentAuthorityState,
  pruneRemoteStickyAttachments,
  recordRemoteStickyAttachment,
  sealRemoteStickyDetonation,
  stickyAttachmentRecord,
  verifyRemoteStickyAttachment,
} from './remote-sticky-attachment-authority';

const attachment = {
  matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex' as const, actionNonce: 41,
  targetId: 'host', targetLifeId: 7, attachedAtMs: 1_000, expiresAtMs: 6_000,
};

describe('receiver-authored sticky attachment authority', () => {
  it('requires a receiver-recorded, sealed, live-life and origin-correlated attachment', () => {
    const empty = createRemoteStickyAttachmentAuthorityState();
    expect(verifyRemoteStickyAttachment(empty, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, claimedOrigin: [1, 2, 3], now: 2_000,
    }).status).toBe('pending');

    const recorded = recordRemoteStickyAttachment(empty, attachment);
    expect(recorded.accepted).toBe(true);
    expect(verifyRemoteStickyAttachment(recorded.state, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, claimedOrigin: [1, 2, 3], now: 2_000,
    })).toMatchObject({ status: 'pending', reason: 'unsealed' });

    const sealed = sealRemoteStickyDetonation(recorded.state, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, origin: [1, 2, 3], detonatedAtMs: 2_100,
      currentAttachmentTarget: { id: 'host', lifeId: 7 },
    });
    expect(sealed.accepted).toBe(true);
    expect(verifyRemoteStickyAttachment(sealed.state, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, claimedOrigin: [1.5, 2, 3], now: 2_110,
    })).toMatchObject({ status: 'verified', reason: 'verified' });
  });

  it('rejects forged identities, action/source correlation, stale lives and displaced origins', () => {
    const recorded = recordRemoteStickyAttachment(createRemoteStickyAttachmentAuthorityState(), attachment).state;
    const sealed = sealRemoteStickyDetonation(recorded, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, origin: [1, 2, 3], detonatedAtMs: 2_100,
      currentAttachmentTarget: { id: 'host', lifeId: 7 },
    }).state;
    const verify = (overrides: Partial<Parameters<typeof verifyRemoteStickyAttachment>[1]> = {}) => verifyRemoteStickyAttachment(sealed, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, claimedOrigin: [1, 2, 3], now: 2_110,
      ...overrides,
    });
    expect(verify({ ownerId: 'guest-b' })).toMatchObject({ status: 'pending', reason: 'missing' });
    expect(verify({ actionNonce: 42 })).toMatchObject({ status: 'pending', reason: 'missing' });
    expect(verify({ ownerLifeId: 5 })).toMatchObject({ status: 'pending', reason: 'missing' });
    expect(verify({ matchEpoch: 4 })).toMatchObject({ status: 'pending', reason: 'missing' });
    expect(verify({ source: 'explosive-crossbow' })).toMatchObject({ status: 'pending', reason: 'missing' });
    expect(verify({ claimedOrigin: [4, 2, 3] })).toMatchObject({ status: 'rejected', reason: 'origin-mismatch' });
    expect(verify({ now: 6_001 })).toMatchObject({ status: 'rejected', reason: 'expired' });
  });

  it('is idempotent for exact duplicates and rejects conflicting duplicate/reordered evidence', () => {
    const empty = createRemoteStickyAttachmentAuthorityState();
    const first = recordRemoteStickyAttachment(empty, attachment);
    expect(recordRemoteStickyAttachment(first.state, attachment)).toMatchObject({ accepted: true, reason: 'duplicate' });
    expect(recordRemoteStickyAttachment(first.state, { ...attachment, targetLifeId: 8 }))
      .toMatchObject({ accepted: false, reason: 'conflict' });
    const sealed = sealRemoteStickyDetonation(first.state, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, origin: [1, 2, 3], detonatedAtMs: 2_100,
      currentAttachmentTarget: { id: 'host', lifeId: 7 },
    });
    expect(sealRemoteStickyDetonation(sealed.state, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, origin: [1, 2, 3], detonatedAtMs: 2_100,
      currentAttachmentTarget: { id: 'host', lifeId: 7 },
    })).toMatchObject({ accepted: true, reason: 'duplicate' });
    expect(sealRemoteStickyDetonation(sealed.state, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41, origin: [3, 2, 3], detonatedAtMs: 2_101,
      currentAttachmentTarget: { id: 'host', lifeId: 7 },
    })).toMatchObject({ accepted: false, reason: 'conflict' });
  });

  it('supports crossbolt proof and removes expired evidence before a later life can reuse it', () => {
    const recorded = recordRemoteStickyAttachment(createRemoteStickyAttachmentAuthorityState(), {
      ...attachment, source: 'explosive-crossbow', actionNonce: 99, expiresAtMs: 4_000,
    }).state;
    expect(stickyAttachmentRecord(recorded, 3, 'guest-a', 4, 'explosive-crossbow', 99)?.targetLifeId).toBe(7);
    expect(pruneRemoteStickyAttachments(recorded, 4_001).records).toEqual({});
  });

  it('fails closed on runtime-forged source/nonces and impossible detonation chronology', () => {
    const empty = createRemoteStickyAttachmentAuthorityState();
    expect(recordRemoteStickyAttachment(empty, { ...attachment, source: 'rocket' as never })).toMatchObject({ accepted: false, reason: 'invalid' });
    expect(recordRemoteStickyAttachment(empty, { ...attachment, actionNonce: -1 })).toMatchObject({ accepted: false, reason: 'invalid' });
    expect(recordRemoteStickyAttachment(empty, { ...attachment, actionNonce: 1.5 })).toMatchObject({ accepted: false, reason: 'invalid' });
    const recorded = recordRemoteStickyAttachment(empty, attachment).state;
    expect(sealRemoteStickyDetonation(recorded, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41,
      origin: [1, 2, 3], detonatedAtMs: 2_100, currentAttachmentTarget: { id: 'host', lifeId: 8 },
    })).toMatchObject({ accepted: false, reason: 'conflict' });
    expect(sealRemoteStickyDetonation(recorded, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41,
      origin: [1, 2, 3], detonatedAtMs: 999, currentAttachmentTarget: { id: 'host', lifeId: 7 },
    })).toMatchObject({ accepted: false, reason: 'expired' });
    const sealed = sealRemoteStickyDetonation(recorded, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41,
      origin: [1, 2, 3], detonatedAtMs: 2_100, currentAttachmentTarget: { id: 'host', lifeId: 7 },
    }).state;
    expect(verifyRemoteStickyAttachment(sealed, {
      matchEpoch: 3, ownerId: 'guest-a', ownerLifeId: 4, source: 'semtex', actionNonce: 41,
      claimedOrigin: [1, 2, 3], now: 2_099,
    })).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });
});
