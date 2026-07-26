import { describe, expect, it } from 'vitest';
import { MULTIPLAYER_PROTOCOL_VERSION, type GrenadeThrowMessage, type PlayerSnapshot } from './protocol';
import {
  REMOTE_GRENADE_MIN_FUSE_MS,
  REMOTE_SEMTEX_MIN_FUSE_MS,
  admitRemoteGrenadeExplosion,
  admitRemoteGrenadeHit,
  admitRemoteGrenadeThrow,
  createRemoteGrenadeAuthorityState,
  replenishRemoteGrenadeAuthorityState,
  resetRemoteGrenadeAuthorityState,
  remoteGrenadeForAction,
} from './remote-grenade-admission';

const sender: PlayerSnapshot = {
  id: 'guest', name: 'Guest', team: 1, x: 1, y: 1.7, z: 2,
  yaw: 0, pitch: 0, stance: 'stand', hp: 100, kills: 0, deaths: 0,
  primary: 'carbine', secondary: 'pistol', grenade: 'frag', weapon: 'carbine', seq: 4,
};
const thrown = (nonce: number): GrenadeThrowMessage => ({
  type: 'grenade-throw', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  by: sender.id, grenade: 'frag', lifeId: 4, actionSequence: nonce,
  origin: [1, 1.7, 2], velocity: [0, 5.2, -13], actionNonce: nonce, nonce: nonce + 10,
});

describe('remote grenade authority', () => {
  it('admits only one bounded selected-grenade throw per life', () => {
    let state = createRemoteGrenadeAuthorityState();
    const first = admitRemoteGrenadeThrow(state, thrown(1), sender, 100);
    expect(first.accepted).toBe(true); state = first.state;
    const duplicate = admitRemoteGrenadeThrow(state, thrown(1), sender, 200);
    expect(duplicate.accepted).toBe(false);
    const second = admitRemoteGrenadeThrow(state, thrown(2), sender, 300);
    expect(second.accepted).toBe(false); state = second.state;
    expect(admitRemoteGrenadeThrow(state, thrown(3), sender, 400).accepted).toBe(false);
    expect(resetRemoteGrenadeAuthorityState().remaining).toBe(1);
  });

  it('restores scavenged capacity without exceeding the authoritative cap', () => {
    const depleted = { ...createRemoteGrenadeAuthorityState(), remaining: 0 };
    expect(replenishRemoteGrenadeAuthorityState(depleted).remaining).toBe(1);
    expect(replenishRemoteGrenadeAuthorityState(depleted, 99).remaining).toBe(1);
    expect(replenishRemoteGrenadeAuthorityState(depleted, 0)).toBe(depleted);
  });

  it('requires a fused admitted throw and one stable explosion origin', () => {
    const admitted = admitRemoteGrenadeThrow(createRemoteGrenadeAuthorityState(), thrown(7), sender, 1_000);
    const early = admitRemoteGrenadeHit(admitted.state, {
      actionNonce: 7, explosionOrigin: [1, 0.2, -8], target: 'host', now: 1_000 + REMOTE_GRENADE_MIN_FUSE_MS - 1,
    });
    expect(early.accepted).toBe(false);
    const first = admitRemoteGrenadeHit(admitted.state, {
      actionNonce: 7, explosionOrigin: [1, 0.2, -8], target: 'host', now: 1_000 + REMOTE_GRENADE_MIN_FUSE_MS,
    });
    expect(first.accepted).toBe(true);
    expect(admitRemoteGrenadeHit(first.state, {
      actionNonce: 7, explosionOrigin: [1, 0.2, -8], target: 'host', now: 3_000,
    }).accepted).toBe(false);
    expect(admitRemoteGrenadeHit(first.state, {
      actionNonce: 7, explosionOrigin: [5, 0.2, -8], target: 'other', now: 3_000,
    }).accepted).toBe(false);
  });

  it('rejects remote spawning, dead throws, and impossible travel', () => {
    expect(admitRemoteGrenadeThrow(createRemoteGrenadeAuthorityState(), {
      ...thrown(9), origin: [20, 1.7, 20],
    }, sender, 0).accepted).toBe(false);
    expect(admitRemoteGrenadeThrow(createRemoteGrenadeAuthorityState(), thrown(9), { ...sender, hp: 0 }, 0).accepted).toBe(false);
    const admitted = admitRemoteGrenadeThrow(createRemoteGrenadeAuthorityState(), thrown(9), sender, 0);
    expect(admitRemoteGrenadeHit(admitted.state, {
      actionNonce: 9, explosionOrigin: [40, 0.2, 40], target: 'host', now: 2_300,
    }).accepted).toBe(false);
  });

  it('correlates window-break explosions with a fused admitted throw', () => {
    const admitted = admitRemoteGrenadeThrow(createRemoteGrenadeAuthorityState(), thrown(12), sender, 1_000);
    expect(admitRemoteGrenadeExplosion(admitted.state, {
      actionNonce: 99, explosionOrigin: [1, 0.2, -8], now: 3_000,
    }).accepted).toBe(false);
    expect(admitRemoteGrenadeExplosion(admitted.state, {
      actionNonce: 12, explosionOrigin: [1, 0.2, -8], now: 1_000 + REMOTE_GRENADE_MIN_FUSE_MS - 1,
    }).accepted).toBe(false);
    const explosion = admitRemoteGrenadeExplosion(admitted.state, {
      actionNonce: 12, explosionOrigin: [1, 0.2, -8], now: 1_000 + REMOTE_GRENADE_MIN_FUSE_MS,
    });
    expect(explosion.accepted).toBe(true);
    expect(admitRemoteGrenadeHit(explosion.state, {
      actionNonce: 12, explosionOrigin: [1, 0.2, -8], target: 'host', now: 3_000,
    }).accepted).toBe(true);
    expect(admitRemoteGrenadeExplosion(explosion.state, {
      actionNonce: 12, explosionOrigin: [5, 0.2, -8], now: 3_000,
    }).accepted).toBe(false);
  });

  it('admits Semtex as the selected grenade with its impact-fuse window and exactly-once targets', () => {
    const semtexSender = { ...sender, grenade: 'semtex' as const };
    const semtexThrow = { ...thrown(22), grenade: 'semtex' as const };
    const admitted = admitRemoteGrenadeThrow(createRemoteGrenadeAuthorityState('semtex'), semtexThrow, semtexSender, 1_000);
    expect(admitted.accepted).toBe(true);
    expect(remoteGrenadeForAction(admitted.state, 22)).toBe('semtex');
    expect(admitRemoteGrenadeHit(admitted.state, {
      actionNonce: 22, explosionOrigin: [1, 0.2, -3], target: 'host', now: 1_000 + REMOTE_SEMTEX_MIN_FUSE_MS - 1,
    }).accepted).toBe(false);
    const hit = admitRemoteGrenadeHit(admitted.state, {
      actionNonce: 22, explosionOrigin: [1, 0.2, -3], target: 'host', now: 1_000 + REMOTE_SEMTEX_MIN_FUSE_MS,
    });
    expect(hit.accepted).toBe(true);
    expect(admitRemoteGrenadeHit(hit.state, {
      actionNonce: 22, explosionOrigin: [1, 0.2, -3], target: 'host', now: 2_100,
    }).accepted).toBe(false);
  });
});
