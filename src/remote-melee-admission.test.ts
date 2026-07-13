import { describe, expect, it } from 'vitest';
import { admitRemoteMelee, createRemoteMeleeAdmissionState, meleeActionHitsPoint } from './remote-melee-admission';
import type { MeleeMessage, PlayerSnapshot } from './protocol';

const sender: PlayerSnapshot = {
  id: 'remote', name: 'Remote', team: 1,
  x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0, primary: 'carbine', weapon: 'pistol', seq: 1,
};
const action: MeleeMessage = {
  type: 'melee', by: 'remote', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 10,
};

describe('remote melee admission', () => {
  it('admits a plausible identity-bound normalized action', () => {
    expect(admitRemoteMelee(action, sender, 1_000, createRemoteMeleeAdmissionState()).accepted).toBe(true);
  });

  it('rejects spoofed origins, duplicate nonces and cadence spam', () => {
    const first = admitRemoteMelee(action, sender, 1_000, createRemoteMeleeAdmissionState());
    expect(admitRemoteMelee({ ...action, nonce: 11, origin: [8, 1.7, 0] }, sender, 1_600, first.nextState).accepted).toBe(false);
    expect(admitRemoteMelee(action, sender, 1_600, first.nextState).accepted).toBe(false);
    expect(admitRemoteMelee({ ...action, nonce: 12 }, sender, 1_200, first.nextState).accepted).toBe(false);
  });

  it('accepts only a close target inside the forward cone', () => {
    expect(meleeActionHitsPoint(action, { x: 0.2, y: 1.6, z: -1.5 })).toBe(true);
    expect(meleeActionHitsPoint(action, { x: 0, y: 1.7, z: -2.2 })).toBe(false);
    expect(meleeActionHitsPoint(action, { x: 0, y: 1.7, z: 1 })).toBe(false);
  });
});
