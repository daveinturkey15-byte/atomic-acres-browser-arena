import { describe, expect, it } from 'vitest';
import { admitAuthoritativeShot, createAuthoritativeShotAdmissionState, validateShotOrigin } from './authoritative-shot';
import { MULTIPLAYER_PROTOCOL_VERSION, type PlayerSnapshot, type ShotRequestMessage } from './protocol';

const sender: PlayerSnapshot = {
  id: 'guest', name: 'Guest', team: 1, x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0, primary: 'carbine', weapon: 'carbine', seq: 10,
};
const request = (shotSeq: number, renderedHostTimeMs: number): ShotRequestMessage => ({
  type: 'shot-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: 'guest',
  shotId: `session-1:${shotSeq}`, shotSeq, fireSeq: shotSeq, weapon: 'carbine', renderedHostTimeMs,
  continuity: 1, origin: [0, 1.7, 0], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: shotSeq + 1,
});

describe('host-authored shot admission', () => {
  it('uses authored host time so jitter-bunched receipt does not reject valid cadence', () => {
    let state = createAuthoritativeShotAdmissionState();
    for (let index = 0; index < 7; index += 1) {
      const result = admitAuthoritativeShot(request(index, 1_000 + index * 100), sender, 1_610, state);
      expect(result.accepted, result.reason).toBe(true);
      state = result.state;
    }
    expect(state.lastShotSeq).toBe(6);
  });

  it('rejects replay, stale, future, weapon and cadence violations explicitly', () => {
    const first = admitAuthoritativeShot(request(0, 1_000), sender, 1_020, createAuthoritativeShotAdmissionState());
    expect(admitAuthoritativeShot(request(0, 1_000), sender, 1_030, first.state).reason).toBe('duplicate');
    expect(admitAuthoritativeShot(request(1, 1_050), sender, 1_060, first.state).reason).toBe('cadence');
    expect(admitAuthoritativeShot(request(2, 1_000), sender, 1_700, first.state).reason).toBe('stale');
    expect(admitAuthoritativeShot(request(2, 1_300), sender, 1_000, first.state).reason).toBe('future');
    expect(admitAuthoritativeShot({ ...request(2, 1_200), weapon: 'smg', pelletDirections: [[0, 0, -1]] }, sender, 1_220, first.state).reason).toBe('weapon-mismatch');
  });

  it('validates the predicted muzzle against the rewound host-admitted shooter pose', () => {
    const pose = { at: 1_000, x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const, continuity: 1 };
    expect(validateShotOrigin(request(0, 1_000), pose)).toBe(true);
    expect(validateShotOrigin({ ...request(0, 1_000), origin: [10, 1.7, 0] }, pose)).toBe(false);
  });
});
