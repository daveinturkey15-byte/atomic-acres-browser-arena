import { describe, expect, it } from 'vitest';
import { NETWORK_IMPAIRMENT_PROFILES, impairNetworkEvents, type NetworkEvent } from './network-chaos';
import { admitRemoteShot, createRemoteShotAdmissionState } from './remote-shot-admission';
import { admitCombatTiming, createPeerTimingState, updatePeerTiming } from './network-fairness';
import type { PlayerSnapshot, ShotMessage } from './protocol';

const sender: PlayerSnapshot = {
  id: 'peer-a', name: 'Peer A', team: 1,
  x: 2, y: 1.7, z: 3, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0,
  primary: 'carbine', weapon: 'carbine', stance: 'stand', seq: 1,
};

function shotEvents(count: number): Array<NetworkEvent<ShotMessage>> {
  return Array.from({ length: count }, (_, index) => ({
    id: `shot-${index}`,
    sentAt: index * 100,
    payload: {
      type: 'shot', by: sender.id, weapon: 'carbine',
      origin: [sender.x, sender.y, sender.z], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: index + 1,
    },
  }));
}

describe('deterministic network impairment', () => {
  it('repeats the same loss, jitter, duplication and reorder schedule from a seed', () => {
    const events = shotEvents(500);
    const first = impairNetworkEvents(events, NETWORK_IMPAIRMENT_PROFILES.normal, 'normal-seed');
    const second = impairNetworkEvents(events, NETWORK_IMPAIRMENT_PROFILES.normal, 'normal-seed');
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(450);
    expect(first.length).toBeLessThanOrEqual(510);
  });

  it('never admits one shot nonce twice under duplicated and reordered delivery', () => {
    const profile = { ...NETWORK_IMPAIRMENT_PROFILES.adverse, outage: undefined, duplicateRate: 0.35, reorderRate: 0.35 };
    const deliveries = impairNetworkEvents(shotEvents(200), profile, 'hostile-seed');
    let state = createRemoteShotAdmissionState();
    const admitted = new Set<number>();
    for (const delivery of deliveries) {
      const result = admitRemoteShot(delivery.payload, sender, delivery.arrivesAt, state);
      if (!result.accepted) continue;
      expect(admitted.has(delivery.payload.nonce)).toBe(false);
      admitted.add(delivery.payload.nonce);
      state = result.nextState;
    }
    expect(admitted.size).toBeGreaterThan(0);
    expect(admitted.size).toBeLessThanOrEqual(200);
  });

  it('produces symmetric bounded admission for host and guest under the same chaos schedule', () => {
    const profile = { ...NETWORK_IMPAIRMENT_PROFILES.normal, duplicateRate: 0.2, reorderRate: 0.15, lossRate: 0.03 };
    const events = Array.from({ length: 80 }, (_, eventSeq) => ({ id: 'combat-' + eventSeq, sentAt: eventSeq * 90, payload: { eventSeq, sentAtEpochMs: 10_000 + eventSeq * 90 } }));
    const deliveries = impairNetworkEvents(events, profile, 'symmetric-combat');
    const run = (clockOffsetMs: number) => {
      let state = updatePeerTiming(createPeerTimingState(), { clockOffsetMs, rttMs: 80 });
      const accepted: number[] = [];
      for (const delivery of deliveries) {
        const admission = admitCombatTiming(state, delivery.payload, 10_000 + clockOffsetMs + delivery.arrivesAt);
        if (!admission.accepted) continue;
        state = admission.state;
        accepted.push(delivery.payload.eventSeq);
      }
      return accepted;
    };
    expect(run(0)).toEqual(run(37));
    expect(run(0).length).toBeGreaterThan(50);
  });
  it('models the declared two-second adverse outage without manufacturing deliveries', () => {
    const deliveries = impairNetworkEvents(shotEvents(80), NETWORK_IMPAIRMENT_PROFILES.adverse, 'outage-seed');
    expect(deliveries.some((delivery) => delivery.sentAt >= 2_000 && delivery.sentAt < 4_000)).toBe(false);
  });
});
