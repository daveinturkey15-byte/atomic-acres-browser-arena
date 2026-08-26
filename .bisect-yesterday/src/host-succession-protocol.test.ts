import { describe, expect, it } from 'vitest';
import {
  HOST_AUTHORITY_MIRROR_MAX_CHECKPOINT_BYTES,
  HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
  hostSuccessionMessageBelongsToPlayer,
  isHostSuccessionProtocolMessage,
  type HostAuthorityMirrorMessage,
  type HostPromotedMessage,
  type HostSuccessionMandateMessage,
} from './host-succession-protocol';
import {
  HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
  HOST_SUCCESSION_MANDATE_TTL_MS,
  type SuccessionMandate,
} from './host-migration';
import { HOST_MATCH_CHECKPOINT_MAX_BYTES } from './host-match-checkpoint';
import { isGameMessage, isHostAuthorityMessage, isStateTrafficMessage, messageBelongsToPlayer } from './protocol';

const ROOM = 'atomic-room-a';
const ISSUED_AT = 1_700_000_000_000;

function mandate(overrides: Partial<SuccessionMandate> = {}): SuccessionMandate {
  return {
    schemaVersion: HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
    term: 4,
    roomCode: ROOM,
    successorId: 'guest-1',
    lobbyRevision: 17,
    issuedByHostId: 'host-1',
    issuedAtEpochMs: ISSUED_AT,
    expiresAtEpochMs: ISSUED_AT + HOST_SUCCESSION_MANDATE_TTL_MS,
    ...overrides,
  };
}

/**
 * The envelope validator never reads the checkpoint's contents, so a bounded
 * record stands in for one everywhere in this file. The deep schema check lives
 * in `host-succession-wire.ts` and is pinned in its own test.
 */
const opaqueCheckpoint = { roomCode: ROOM, hostPlayer: { id: 'guest-1' } } as unknown as HostAuthorityMirrorMessage['checkpoint'];

function mandateMessage(overrides: Partial<HostSuccessionMandateMessage> = {}): HostSuccessionMandateMessage {
  return {
    type: 'host-succession-mandate',
    schemaVersion: HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
    by: 'host-1',
    mandate: mandate(),
    nonce: 91,
    ...overrides,
  };
}

function mirrorMessage(overrides: Partial<HostAuthorityMirrorMessage> = {}): HostAuthorityMirrorMessage {
  return {
    type: 'host-authority-mirror',
    schemaVersion: HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
    by: 'host-1',
    forPlayerId: 'guest-1',
    mandate: mandate(),
    checkpoint: opaqueCheckpoint,
    hostEpochMs: ISSUED_AT + 250,
    nonce: 92,
    ...overrides,
  };
}

function promotedMessage(overrides: Partial<HostPromotedMessage> = {}): HostPromotedMessage {
  return {
    type: 'host-promoted',
    schemaVersion: HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
    by: 'guest-1',
    mandate: mandate(),
    term: 5,
    nonce: 93,
    ...overrides,
  };
}

describe('HF-325 host succession protocol envelope', () => {
  it('admits all three messages through the top-level protocol validator', () => {
    for (const message of [mandateMessage(), mirrorMessage(), promotedMessage()]) {
      expect(isHostSuccessionProtocolMessage(message)).toBe(true);
      expect(isGameMessage(message)).toBe(true);
    }
  });

  it('rejects non-records and unrelated shapes without throwing', () => {
    for (const value of [null, undefined, 0, '', [], [mandateMessage()], { type: 'host-promoted' }]) {
      expect(isHostSuccessionProtocolMessage(value)).toBe(false);
    }
  });

  it('rejects a message from a bundle that versions these shapes differently', () => {
    // A peer on an older bundle drops these at the transport instead of
    // misreading them. Fail-closed: no mirror, no promotion, current behaviour.
    expect(isGameMessage(mirrorMessage({
      schemaVersion: (HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION + 1) as 1,
    }))).toBe(false);
    expect(isGameMessage({ ...mandateMessage(), schemaVersion: undefined })).toBe(false);
  });

  it('requires the mandate to be signed by the host that issued it', () => {
    expect(isGameMessage(mandateMessage({ by: 'guest-2' }))).toBe(false);
    expect(isGameMessage(mirrorMessage({ by: 'guest-2' }))).toBe(false);
  });

  it('refuses a mandate that fails the host-migration validator', () => {
    expect(isGameMessage(mandateMessage({
      mandate: { ...mandate(), expiresAtEpochMs: ISSUED_AT + 1 },
    }))).toBe(false);
    expect(isGameMessage(mandateMessage({
      mandate: { ...mandate(), successorId: 'host-1' },
    }))).toBe(false);
    expect(isGameMessage(mandateMessage({ mandate: null as unknown as SuccessionMandate }))).toBe(false);
  });

  it('binds the mirror to exactly the peer the mandate names', () => {
    expect(isGameMessage(mirrorMessage({ forPlayerId: 'guest-2' }))).toBe(false);
    expect(isGameMessage(mirrorMessage({
      mandate: mandate({ successorId: 'guest-2' }),
    }))).toBe(false);
  });

  it('bounds the carried checkpoint by the same measure the storage cap uses', () => {
    expect(HOST_AUTHORITY_MIRROR_MAX_CHECKPOINT_BYTES).toBe(HOST_MATCH_CHECKPOINT_MAX_BYTES);
    const oversized = {
      filler: 'x'.repeat(HOST_AUTHORITY_MIRROR_MAX_CHECKPOINT_BYTES + 1),
    } as unknown as HostAuthorityMirrorMessage['checkpoint'];
    expect(isGameMessage(mirrorMessage({ checkpoint: oversized }))).toBe(false);
    for (const checkpoint of [null, 'checkpoint', 42, []]) {
      expect(isGameMessage(mirrorMessage({
        checkpoint: checkpoint as unknown as HostAuthorityMirrorMessage['checkpoint'],
      }))).toBe(false);
    }
  });

  it('refuses a checkpoint whose size cannot be measured', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isGameMessage(mirrorMessage({
      checkpoint: cyclic as unknown as HostAuthorityMirrorMessage['checkpoint'],
    }))).toBe(false);
  });

  it('requires a sane host epoch stamp on the mirror', () => {
    for (const hostEpochMs of [0, -1, 1.5, Number.NaN, 10_000_000_000_001]) {
      expect(isGameMessage(mirrorMessage({ hostEpochMs }))).toBe(false);
    }
  });

  it('lets a claimant present only the mandate that names it, at only its term', () => {
    expect(isGameMessage(promotedMessage({ by: 'guest-2' }))).toBe(false);
    expect(isGameMessage(promotedMessage({ term: 4 }))).toBe(false);
    expect(isGameMessage(promotedMessage({ term: 6 }))).toBe(false);
    expect(isGameMessage(promotedMessage({ term: 5.5 }))).toBe(false);
  });

  it('attributes every succession message to its own author', () => {
    expect(messageBelongsToPlayer(mandateMessage(), 'host-1')).toBe(true);
    expect(messageBelongsToPlayer(mandateMessage(), 'guest-1')).toBe(false);
    expect(messageBelongsToPlayer(mirrorMessage(), 'host-1')).toBe(true);
    // The addressee is not the author. A guest cannot claim a mirror as its own.
    expect(messageBelongsToPlayer(mirrorMessage(), 'guest-1')).toBe(false);
    expect(messageBelongsToPlayer(promotedMessage(), 'guest-1')).toBe(true);
    expect(hostSuccessionMessageBelongsToPlayer(mandateMessage(), '')).toBe(false);
  });

  it('marks all three host-authored, so a guest can never author succession', () => {
    // network.ts drops isHostAuthorityMessage payloads arriving on a guest
    // connection. This is the pin that stops a guest minting a mandate,
    // injecting a mirror, or announcing its own promotion to a live host.
    expect(isHostAuthorityMessage(mandateMessage())).toBe(true);
    expect(isHostAuthorityMessage(mirrorMessage())).toBe(true);
    expect(isHostAuthorityMessage(promotedMessage())).toBe(true);
  });

  it('keeps succession off the unreliable state lane', () => {
    // State traffic may take the lossy channel. A mirror that arrives torn or
    // not at all would be indistinguishable from one that was never sent.
    expect(isStateTrafficMessage(mirrorMessage())).toBe(false);
    expect(isStateTrafficMessage(mandateMessage())).toBe(false);
    expect(isStateTrafficMessage(promotedMessage())).toBe(false);
  });
});
