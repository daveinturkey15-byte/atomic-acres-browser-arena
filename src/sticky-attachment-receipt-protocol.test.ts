import { describe, expect, it } from 'vitest';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  isGameMessage,
  isHostAuthorityMessage,
  messageBelongsToPlayer,
  type StickyAttachmentReceiptMessage,
} from './protocol';

const receipt: StickyAttachmentReceiptMessage = {
  type: 'sticky-attachment-receipt',
  protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  by: 'host',
  forPlayerId: 'guest',
  matchEpoch: 7,
  source: 'semtex',
  ownerId: 'host',
  ownerLifeId: 2,
  targetId: 'guest',
  targetLifeId: 4,
  actionNonce: 81,
  attachedAtHostTimeMs: 1_500,
  nonce: 91,
};

describe('sticky attachment receipt protocol', () => {
  it('admits an exact versioned host-authority envelope', () => {
    expect(isGameMessage(receipt)).toBe(true);
    expect(isHostAuthorityMessage(receipt)).toBe(true);
    expect(messageBelongsToPlayer(receipt, 'host')).toBe(true);
    expect(messageBelongsToPlayer(receipt, 'guest')).toBe(false);
  });

  it('rejects stale protocol, wrong audience, malformed identity/life/source, and extension fields', () => {
    expect(isGameMessage({ ...receipt, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
    expect(isGameMessage({ ...receipt, forPlayerId: 'spectator' })).toBe(false);
    expect(isGameMessage({ ...receipt, forPlayerId: 'host', targetId: 'host' })).toBe(false);
    expect(isGameMessage({ ...receipt, by: '../host' })).toBe(false);
    expect(isGameMessage({ ...receipt, targetLifeId: -1 })).toBe(false);
    expect(isGameMessage({ ...receipt, ownerLifeId: 1.5 })).toBe(false);
    expect(isGameMessage({ ...receipt, source: 'frag' })).toBe(false);
    expect(isGameMessage({ ...receipt, attachedAtHostTimeMs: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isGameMessage({ ...receipt, extra: true })).toBe(false);
  });
});
