import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRustworks1v1 } from './additional-maps';
import {
  auditHostRecoveryPoses,
  type HostRecoveryPoseCheckpoint,
} from './host-match-recovery-pose';

function checkpoint(
  host: readonly [number, number, number] = [13, 1.7, -14],
  guest: readonly [number, number, number] = [13, 1.7, -19],
  bot: readonly [number, number, number] | null = null,
): HostRecoveryPoseCheckpoint {
  const pose = (id: string, value: readonly [number, number, number]) => ({
    id, x: value[0], y: value[1], z: value[2],
  });
  return {
    config: { arenaId: 'rustworks-1v1' },
    hostPlayer: pose('host', host),
    guests: [{ snapshot: pose('guest', guest) }],
    bots: bot ? [{ snapshot: pose('host-bot-0', bot) }] : [],
  };
}

describe('host-match recovery pose persistence gate', () => {
  const rustworks = buildRustworks1v1(new THREE.Scene());

  it('accepts a deterministic clear Rustworks host/guest checkpoint', () => {
    expect(auditHostRecoveryPoses(
      checkpoint(),
      'rustworks-1v1',
      rustworks.bounds,
      rustworks.colliders,
    )).toEqual({ accepted: true, reason: null });
  });

  it('rejects the exact z+5 ramp pose that previously replaced a safe checkpoint', () => {
    expect(auditHostRecoveryPoses(
      checkpoint([0, 1.7, -14], [0, 1.7, -19]),
      'rustworks-1v1',
      rustworks.bounds,
      rustworks.colliders,
    )).toEqual({ accepted: false, reason: 'host:host:blocked-by-collider' });
  });

  it('attributes invalid guest, bot and arena poses without accepting a partial roster', () => {
    expect(auditHostRecoveryPoses(
      checkpoint([13, 1.7, -14], [19, 1.7, 5]),
      'rustworks-1v1',
      rustworks.bounds,
      rustworks.colliders,
    )).toEqual({ accepted: false, reason: 'guest:guest:blocked-by-collider' });
    expect(auditHostRecoveryPoses(
      checkpoint([13, 1.7, -14], [13, 1.7, -19], [19, 0, 5]),
      'rustworks-1v1',
      rustworks.bounds,
      rustworks.colliders,
    )).toEqual({ accepted: false, reason: 'bot:host-bot-0:blocked-by-collider' });
    expect(auditHostRecoveryPoses(
      checkpoint(),
      'atomic-acres',
      rustworks.bounds,
      rustworks.colliders,
    )).toEqual({ accepted: false, reason: 'arena-mismatch:rustworks-1v1:atomic-acres' });
  });
});
