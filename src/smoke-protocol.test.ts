import { describe, expect, it } from 'vitest';
import { isGameMessage, isHostAuthorityMessage, isStateTrafficMessage, messageBelongsToPlayer } from './protocol';
import { SmokeAuthority, SMOKE_AUTHORITY_SCHEMA_VERSION } from './smoke-authority';
import { isSmokeStateMessage, type SmokeStateMessage } from './smoke-protocol';

function message(): SmokeStateMessage {
  const authority = new SmokeAuthority(12, 'host');
  authority.registerVolume({
    matchEpoch: 12,
    ownerId: 'host',
    actionNonce: 14,
    centre: { x: 1, y: 1.25, z: -4 },
    startsAtHostTimeMs: 1_000,
  });
  authority.admitShot({
    matchEpoch: 12,
    shotResultId: 'guest-epoch:shot-3',
    resolvedAtHostTimeMs: 1_100,
    segments: [{ pelletIndex: 0, start: { x: 1, y: 1.25, z: 0 }, end: { x: 1, y: 1.25, z: -20 } }],
  });
  return {
    type: 'smoke-state',
    schemaVersion: SMOKE_AUTHORITY_SCHEMA_VERSION,
    by: 'host',
    snapshot: authority.snapshot(1_100),
    nonce: 22,
  };
}

describe('smoke protocol', () => {
  it('accepts the bounded host snapshot and rejects extra authority fields', () => {
    const valid = message();
    expect(isSmokeStateMessage(valid)).toBe(true);
    expect(isGameMessage(valid)).toBe(true);
    expect(isHostAuthorityMessage(valid)).toBe(true);
    expect(isStateTrafficMessage(valid)).toBe(true);
    expect(messageBelongsToPlayer(valid, 'host')).toBe(true);
    expect(messageBelongsToPlayer(valid, 'guest')).toBe(false);
    expect(isSmokeStateMessage({ ...valid, guestAuthority: true })).toBe(false);
    expect(isSmokeStateMessage({ ...valid, snapshot: { ...valid.snapshot, matchEpoch: 0 } })).toBe(false);
  });

  it('rejects forged corridor geometry, identity, lifetime, and unbounded collections', () => {
    const valid = message();
    const volume = valid.snapshot.volumes[0]!;
    const corridor = volume.corridors[0]!;
    expect(isSmokeStateMessage({
      ...valid,
      snapshot: { ...valid.snapshot, volumes: [{ ...volume, corridors: [{ ...corridor, id: 'other-corridor' }] }] },
    })).toBe(false);
    expect(isSmokeStateMessage({
      ...valid,
      snapshot: {
        ...valid.snapshot,
        volumes: [{
          ...volume,
          corridors: [{ ...corridor, expiresAtMs: corridor.createdAtHostTimeMs + 901 }],
        }],
      },
    })).toBe(false);
    expect(isSmokeStateMessage({
      ...valid,
      snapshot: {
        ...valid.snapshot,
        volumes: Array.from({ length: 13 }, (_, index) => ({ ...volume, id: `smoke-host-${index}`, actionNonce: index })),
      },
    })).toBe(false);
  });
});
