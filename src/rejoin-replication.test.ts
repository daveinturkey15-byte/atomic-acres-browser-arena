import { describe, expect, it } from 'vitest';
import { isGameMessage, type PlayerSnapshot } from './protocol';
import { buildRejoinReplicationPlan, sessionBoundCreditKey } from './rejoin-replication';

const rejoiner: PlayerSnapshot = {
  id: 'guest-a', name: 'Guest A', team: 0,
  x: 4, y: 1.7, z: -2, yaw: 0.25, pitch: -0.1,
  hp: 72, kills: 3, deaths: 1, primary: 'carbine', secondary: 'pistol',
  grenade: 'frag', weapon: 'carbine', seq: 41,
};

describe('host-authoritative rejoin replication', () => {
  it('replays the fresh slot to observers and sends a full state to the rejoiner', () => {
    const plan = buildRejoinReplicationPlan({
      rejoinerId: rejoiner.id,
      connectionEpoch: 'epoch-current-123',
      snapshot: rejoiner,
      continuity: 8,
      hostTimeMs: 12_345,
      rateHz: 40,
      observerIds: ['guest-b', 'guest-c'],
    });

    expect(plan.rejoiner.messages).toHaveLength(2);
    expect(plan.rejoiner.messages.every(isGameMessage)).toBe(true);
    expect(plan.rejoiner.messages.map((message) => message.type)).toEqual(['join', 'state']);
    expect(plan.observers).toHaveLength(2);
    expect(plan.observers.flatMap((entry) => entry.messages).every(isGameMessage)).toBe(true);
    expect(plan.observers.map((entry) => entry.playerId)).toEqual(['guest-b', 'guest-c']);
    expect(plan.observers[0]?.messages[1]).toMatchObject({
      type: 'state', player: rejoiner, continuity: 8, hostTimeMs: 12_345,
    });
    expect(plan.creditSession).toEqual({
      playerId: 'guest-a', connectionEpoch: 'epoch-current-123',
      key: 'guest-a:epoch-current-123',
    });
    expect(sessionBoundCreditKey('guest-a', 'epoch-old-123')).not.toBe(plan.creditSession.key);
  });
});
