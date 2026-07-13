import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot, ShotMessage } from './protocol';
import { admitRemoteShot, createRemoteShotAdmissionState } from './remote-shot-admission';

const sender: PlayerSnapshot = {
  id: 'remote-a', name: 'Remote', team: 1, x: 2, y: 1.7, z: 3,
  yaw: 0, pitch: 0, hp: 100, kills: 0, deaths: 0, primary: 'carbine', weapon: 'carbine', seq: 2,
};
const shot = (overrides: Partial<ShotMessage> = {}): ShotMessage => ({
  type: 'shot', by: sender.id, weapon: 'carbine', origin: [2, 1.7, 3], direction: [0, 0, -1], nonce: 10,
  ...overrides,
});

describe('remote shot admission', () => {
  it('accepts a known, normalized, origin-consistent shot', () => {
    const result = admitRemoteShot(shot(), sender, 1_000, createRemoteShotAdmissionState());
    expect(result.accepted).toBe(true);
    expect(result.nextState.recentNonces).toEqual([10]);
  });

  it('rejects spoofing, replay, malformed direction and origin mismatch', () => {
    const initial = createRemoteShotAdmissionState();
    expect(admitRemoteShot(shot(), undefined, 1_000, initial).reason).toBe('unknown-sender');
    expect(admitRemoteShot(shot({ weapon: 'smg' }), sender, 1_000, initial).reason).toBe('weapon-mismatch');
    expect(admitRemoteShot(shot({ direction: [0, 0, 0] }), sender, 1_000, initial).reason).toBe('invalid-direction');
    expect(admitRemoteShot(shot({ origin: [20, 1.7, 3] }), sender, 1_000, initial).reason).toBe('origin-mismatch');
    const accepted = admitRemoteShot(shot(), sender, 1_000, initial).nextState;
    expect(admitRemoteShot(shot(), sender, 1_200, accepted).reason).toBe('duplicate');
  });

  it('enforces a bounded cadence and nonce history', () => {
    let state = admitRemoteShot(shot(), sender, 1_000, createRemoteShotAdmissionState()).nextState;
    expect(admitRemoteShot(shot({ nonce: 11 }), sender, 1_010, state).reason).toBe('cadence');
    for (let index = 0; index < 24; index += 1) {
      const result = admitRemoteShot(shot({ nonce: 100 + index }), sender, 1_100 + index * 100, state);
      if (result.accepted) state = result.nextState;
    }
    expect(state.recentNonces.length).toBeLessThanOrEqual(16);
  });
});
