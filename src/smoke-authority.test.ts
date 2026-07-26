import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_SMOKE_VOLUMES,
  MAX_SMOKE_CORRIDORS_PER_VOLUME,
  SMOKE_CORRIDOR_LIFETIME_MS,
  SMOKE_VOLUME_LIFETIME_MS,
  SmokeAuthority,
  type SmokeShotAdmission,
} from './smoke-authority';

const centre = Object.freeze({ x: 0, y: 1.25, z: -4 });
const throughSmoke = (shotResultId: string, now = 1_100, pelletIndex = 0): SmokeShotAdmission => Object.freeze({
  matchEpoch: 7,
  shotResultId,
  resolvedAtHostTimeMs: now,
  segments: Object.freeze([Object.freeze({
    pelletIndex,
    start: Object.freeze({ x: 0, y: 1.25, z: 0 }),
    end: Object.freeze({ x: 0, y: 1.25, z: -12 }),
  })]),
});

function register(authority: SmokeAuthority, actionNonce = 41, at = 1_000): boolean {
  return authority.registerVolume({
    matchEpoch: 7,
    ownerId: 'host-player',
    actionNonce,
    centre,
    startsAtHostTimeMs: at,
  });
}

describe('SmokeAuthority', () => {
  it('allows only host authority to create volumes or corridors', () => {
    const replica = new SmokeAuthority(7, 'replica');
    expect(register(replica)).toBe(false);
    expect(replica.admitShot(throughSmoke('shot-forged'))).toMatchObject({
      accepted: false,
      reason: 'not-host',
    });
    expect(replica.telemetry(1_100)).toMatchObject({
      activeVolumes: 0,
      activeCorridors: 0,
      rejectedNotHost: 2,
    });
  });

  it('creates a deterministic bounded corridor only when an admitted segment intersects active smoke', () => {
    const authority = new SmokeAuthority(7, 'host');
    expect(register(authority)).toBe(true);
    const outside = authority.admitShot({
      ...throughSmoke('shot-outside'),
      segments: [{ pelletIndex: 0, start: { x: 12, y: 1, z: 0 }, end: { x: 12, y: 1, z: -12 } }],
    });
    expect(outside).toMatchObject({ accepted: true, createdCorridorIds: [] });

    const admitted = authority.admitShot(throughSmoke('shot-result-9'));
    expect(admitted).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(admitted.createdCorridorIds).toEqual([
      'smoke-host-player-41:corridor:shot-result-9:0',
    ]);
    const volume = authority.snapshot(1_100).volumes[0]!;
    expect(volume.corridors[0]).toMatchObject({
      id: admitted.createdCorridorIds[0],
      shotResultId: 'shot-result-9',
      pelletIndex: 0,
      radiusM: 0.42,
      expiresAtMs: 1_100 + SMOKE_CORRIDOR_LIFETIME_MS,
    });
  });

  it('rejects replay before checking newly active smoke', () => {
    const authority = new SmokeAuthority(7, 'host');
    expect(register(authority)).toBe(true);
    expect(authority.admitShot(throughSmoke('shot-once')).accepted).toBe(true);
    expect(authority.admitShot(throughSmoke('shot-once', 1_101))).toMatchObject({
      accepted: false,
      reason: 'replay',
      createdCorridorIds: [],
    });
    expect(authority.telemetry(1_101)).toMatchObject({ activeCorridors: 1, rejectedReplay: 1 });
  });

  it('expires corridors and volumes in host time', () => {
    const authority = new SmokeAuthority(7, 'host');
    register(authority);
    authority.admitShot(throughSmoke('shot-expiring'));
    expect(authority.snapshot(1_999).volumes[0]!.corridors).toHaveLength(1);
    expect(authority.snapshot(2_000).volumes[0]!.corridors).toHaveLength(0);
    expect(authority.snapshot(1_000 + SMOKE_VOLUME_LIFETIME_MS).volumes).toHaveLength(0);
  });

  it('caps volume and corridor state without allocating per-shot entities beyond the contract', () => {
    const authority = new SmokeAuthority(7, 'host');
    for (let index = 0; index < MAX_ACTIVE_SMOKE_VOLUMES + 4; index += 1) {
      register(authority, 100 + index, 1_000 + index);
    }
    expect(authority.snapshot(1_100).volumes).toHaveLength(MAX_ACTIVE_SMOKE_VOLUMES);

    const oneVolume = new SmokeAuthority(7, 'host');
    register(oneVolume);
    for (let index = 0; index < MAX_SMOKE_CORRIDORS_PER_VOLUME + 5; index += 1) {
      oneVolume.admitShot(throughSmoke(`shot-cap-${index}`, 1_100 + index));
    }
    const corridors = oneVolume.snapshot(1_200).volumes[0]!.corridors;
    expect(corridors).toHaveLength(MAX_SMOKE_CORRIDORS_PER_VOLUME);
    expect(corridors[0]!.shotResultId).toBe('shot-cap-5');
  });

  it('rejects wrong epochs and malformed or excessive paths', () => {
    const authority = new SmokeAuthority(7, 'host');
    expect(authority.registerVolume({
      matchEpoch: 8,
      ownerId: 'host-player',
      actionNonce: 1,
      centre,
      startsAtHostTimeMs: 1_000,
    })).toBe(false);
    expect(authority.admitShot({
      ...throughSmoke('shot-too-long'),
      segments: [{ pelletIndex: 0, start: { x: 0, y: 0, z: 0 }, end: { x: 300, y: 0, z: 0 } }],
    })).toMatchObject({ accepted: false, reason: 'malformed' });
    expect(authority.telemetry(1_100)).toMatchObject({
      rejectedWrongEpoch: 1,
      rejectedMalformed: 1,
    });
  });

  it('disposes the prior epoch state and rejects stale admissions after reset', () => {
    const authority = new SmokeAuthority(7, 'host');
    register(authority);
    authority.admitShot(throughSmoke('shot-before-reset'));
    expect(authority.telemetry(1_100)).toMatchObject({ activeVolumes: 1, activeCorridors: 1 });
    authority.reset(8, 'host');
    expect(authority.telemetry(1_100)).toMatchObject({
      matchEpoch: 8,
      revision: 0,
      activeVolumes: 0,
      activeCorridors: 0,
      rememberedShots: 0,
    });
    expect(authority.admitShot(throughSmoke('stale-epoch'))).toMatchObject({
      accepted: false,
      reason: 'wrong-epoch',
    });
  });
});
