import { describe, expect, it } from 'vitest';
import {
  HostKillstreakLoadoutAckRegistry,
  type HostKillstreakLoadoutAckIdentity,
} from './host-killstreak-loadout-ack';

const identity = (
  overrides: Partial<HostKillstreakLoadoutAckIdentity> = {},
): HostKillstreakLoadoutAckIdentity => ({
  connectionEpoch: 'connection-1',
  matchEpoch: 41,
  actorId: 'guest-1',
  lifeId: 2,
  ...overrides,
});

describe('host killstreak loadout acknowledgement registry', () => {
  it('acknowledges duplicate spam once only after the targeted reliable send succeeds', () => {
    const registry = new HostKillstreakLoadoutAckRegistry();
    const exact = identity();

    expect(registry.needsAck(exact)).toBe(true);
    expect(registry.recordReliableResult(exact, false)).toBe(false);
    expect(registry.needsAck(exact)).toBe(true);
    expect(registry.size).toBe(0);

    expect(registry.recordReliableResult(exact, true)).toBe(true);
    expect(registry.acknowledged(exact)).toBe(true);
    for (let duplicate = 0; duplicate < 32; duplicate += 1) {
      expect(registry.needsAck(exact)).toBe(false);
    }
    expect(registry.size).toBe(1);
  });

  it('keeps independent roster-bounded records for other players', () => {
    const registry = new HostKillstreakLoadoutAckRegistry();
    const first = identity();
    const second = identity({ actorId: 'guest-2', connectionEpoch: 'connection-2', lifeId: 5 });

    registry.recordReliableResult(first, true);
    expect(registry.needsAck(second)).toBe(true);
    registry.recordReliableResult(second, true);

    expect(registry.acknowledged(first)).toBe(true);
    expect(registry.acknowledged(second)).toBe(true);
    expect(registry.size).toBe(2);
  });

  it('overwrites one actor record across connection replacement and clears on eviction or reset', () => {
    const registry = new HostKillstreakLoadoutAckRegistry();
    const original = identity();
    const replacement = identity({ connectionEpoch: 'connection-2' });

    registry.recordReliableResult(original, true);
    expect(registry.needsAck(replacement)).toBe(true);
    registry.recordReliableResult(replacement, true);
    expect(registry.acknowledged(original)).toBe(false);
    expect(registry.acknowledged(replacement)).toBe(true);
    expect(registry.size).toBe(1);

    expect(registry.clearActor(replacement.actorId)).toBe(true);
    expect(registry.needsAck(replacement)).toBe(true);
    expect(registry.size).toBe(0);

    registry.recordReliableResult(replacement, true);
    registry.clear();
    expect(registry.needsAck(replacement)).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('does not cross match, actor-life, or malformed identity boundaries', () => {
    const registry = new HostKillstreakLoadoutAckRegistry();
    registry.recordReliableResult(identity(), true);

    expect(registry.needsAck(identity({ matchEpoch: 42 }))).toBe(true);
    expect(registry.needsAck(identity({ lifeId: 3 }))).toBe(true);
    expect(registry.needsAck(identity({ connectionEpoch: '' }))).toBe(false);
    expect(registry.recordReliableResult(identity({ matchEpoch: 0 }), true)).toBe(false);
    expect(registry.size).toBe(1);
  });
});
