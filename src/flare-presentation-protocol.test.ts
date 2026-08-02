import { describe, expect, it } from 'vitest';
import { stableStringify } from './canonical-state';
import {
  FLARE_PRESENTATION_SCHEMA_VERSION,
  MAX_FLARE_PRESENTATION_MESSAGE_BYTES,
  MAX_FLARE_PRESENTATION_REPLICAS,
  canonicalizeFlarePresentationReplicas,
  isFlarePresentationStateMessage,
  type FlarePresentationReplicaSnapshot,
  type FlarePresentationStateMessage,
} from './flare-presentation-protocol';
import {
  isGameMessage,
  isHostAuthorityMessage,
  isStateTrafficMessage,
  messageBelongsToPlayer,
} from './protocol';

function replica(ownerId = 'guest-1', actionNonce = 1): FlarePresentationReplicaSnapshot {
  return Object.freeze({
    ownerId,
    ownerTeam: 1,
    actionNonce,
    phase: 'flight',
    position: Object.freeze([1, 2, 3] as const),
    velocity: Object.freeze([52, 0, 0] as const),
    remainingMs: 5_500,
  });
}

function message(flares: readonly FlarePresentationReplicaSnapshot[] = [replica()]): FlarePresentationStateMessage {
  return Object.freeze({
    type: 'flare-presentation-state',
    schemaVersion: FLARE_PRESENTATION_SCHEMA_VERSION,
    by: 'host-1',
    matchEpoch: 42,
    weaponGeneration: 7,
    snapshotSeq: 1,
    sampledAtHostTimeMs: 1_000,
    flares,
    nonce: 8,
  });
}

describe('flare presentation protocol', () => {
  it('admits one canonical bounded host state through the shared multiplayer routing contract', () => {
    const value = message();
    expect(isFlarePresentationStateMessage(value)).toBe(true);
    expect(isGameMessage(value)).toBe(true);
    expect(messageBelongsToPlayer(value, 'host-1')).toBe(true);
    expect(isHostAuthorityMessage(value)).toBe(true);
    expect(isStateTrafficMessage(value)).toBe(true);
  });

  it('rejects authority smuggling, extra keys, malformed phase fields and non-canonical identities', () => {
    const valid = message();
    expect(isFlarePresentationStateMessage({ ...valid, authority: true })).toBe(false);
    expect(isFlarePresentationStateMessage({
      ...valid,
      flares: [{ ...valid.flares[0]!, damage: 42 }],
    })).toBe(false);
    expect(isFlarePresentationStateMessage({
      ...valid,
      flares: [{ ...valid.flares[0]!, phase: 'burn', velocity: [1, 0, 0] }],
    })).toBe(false);
    expect(isFlarePresentationStateMessage({
      ...valid,
      flares: [{ ...valid.flares[0]!, phase: 'flight', velocity: null }],
    })).toBe(false);
    expect(isFlarePresentationStateMessage({
      ...valid,
      flares: [replica('z-owner', 1), replica('a-owner', 1)],
    })).toBe(false);
    expect(isFlarePresentationStateMessage({
      ...valid,
      flares: [replica('guest-1', 1), replica('guest-1', 1)],
    })).toBe(false);
  });

  it('canonicalizes immutable replicas and rejects duplicates or a thirteenth entity', () => {
    const canonical = canonicalizeFlarePresentationReplicas([
      replica('z-owner', 2),
      replica('a-owner', 3),
      replica('a-owner', 1),
    ]);
    expect(canonical?.map(({ ownerId, actionNonce }) => `${ownerId}:${actionNonce}`)).toEqual([
      'a-owner:1', 'a-owner:3', 'z-owner:2',
    ]);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical?.[0]?.position)).toBe(true);
    expect(canonicalizeFlarePresentationReplicas([replica(), replica()])).toBeNull();
    expect(canonicalizeFlarePresentationReplicas(Array.from(
      { length: MAX_FLARE_PRESENTATION_REPLICAS + 1 },
      (_, index) => replica(`owner-${index}`, index),
    ))).toBeNull();
  });

  it('keeps the worst admitted twelve-replica state within the eight KiB wire budget', () => {
    const flares = canonicalizeFlarePresentationReplicas(Array.from(
      { length: MAX_FLARE_PRESENTATION_REPLICAS },
      (_, index) => replica(`${String(index).padStart(2, '0')}${'x'.repeat(78)}`, Number.MAX_SAFE_INTEGER - index),
    ))!;
    const value: FlarePresentationStateMessage = Object.freeze({
      ...message(flares),
      by: 'h'.repeat(80),
      matchEpoch: 999_999_999,
      weaponGeneration: 1_000_000_000,
      snapshotSeq: Number.MAX_SAFE_INTEGER,
      sampledAtHostTimeMs: Number.MAX_SAFE_INTEGER,
      nonce: Number.MAX_SAFE_INTEGER,
    });
    const bytes = new TextEncoder().encode(stableStringify(value)).byteLength;
    expect(isFlarePresentationStateMessage(value)).toBe(true);
    expect(bytes).toBeLessThanOrEqual(MAX_FLARE_PRESENTATION_MESSAGE_BYTES);
  });
});
