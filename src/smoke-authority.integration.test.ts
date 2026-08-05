import { describe, expect, it } from 'vitest';
import { smokeBlocksTargetAcquisition } from './combat/ordnance';
import { SMOKE_AUTHORITY_SCHEMA_VERSION, SmokeAuthority } from './smoke-authority';
import { isSmokeStateMessage, type SmokeStateMessage } from './smoke-protocol';

describe('host smoke state to late-join replica integration', () => {
  it('reconstructs remaining volumes/corridors and converges semantic visibility', () => {
    const host = new SmokeAuthority(23, 'host');
    expect(host.registerVolume({
      matchEpoch: 23,
      ownerId: 'guest-a',
      actionNonce: 91,
      centre: { x: 0, y: 1.25, z: -4 },
      startsAtHostTimeMs: 10_000,
    })).toBe(true);
    expect(host.admitShot({
      matchEpoch: 23,
      shotResultId: 'connection-a:shot-5',
      resolvedAtHostTimeMs: 10_500,
      segments: [{ pelletIndex: 0, start: { x: 0, y: 1.25, z: 0 }, end: { x: 0, y: 1.25, z: -12 } }],
    }).accepted).toBe(true);

    const wire: unknown = JSON.parse(JSON.stringify({
      type: 'smoke-state',
      schemaVersion: SMOKE_AUTHORITY_SCHEMA_VERSION,
      by: 'host',
      snapshot: host.snapshot(10_700),
      nonce: 72,
    } satisfies SmokeStateMessage));
    expect(isSmokeStateMessage(wire)).toBe(true);
    if (!isSmokeStateMessage(wire)) throw new Error('wire snapshot failed validation');

    const lateJoin = new SmokeAuthority(23, 'replica');
    expect(lateJoin.applyAuthoritativeSnapshot(wire.snapshot)).toBe(true);
    const hostView = host.snapshot(10_700);
    const guestView = lateJoin.snapshot(10_700);
    expect(guestView).toEqual(hostView);

    const observer = { x: 0, y: 1.25, z: 0 };
    const targetInsideCorridor = { x: 0, y: 1.25, z: -10 };
    const targetOutsideCorridor = { x: 2.5, y: 1.25, z: -10 };
    expect(smokeBlocksTargetAcquisition(observer, targetInsideCorridor, hostView.volumes, 10_700)).toBe(false);
    expect(smokeBlocksTargetAcquisition(observer, targetInsideCorridor, guestView.volumes, 10_700)).toBe(false);
    expect(smokeBlocksTargetAcquisition(observer, targetOutsideCorridor, hostView.volumes, 10_700)).toBe(true);
    expect(smokeBlocksTargetAcquisition(observer, targetOutsideCorridor, guestView.volumes, 10_700)).toBe(true);

    expect(lateJoin.snapshot(11_400).volumes[0]!.corridors).toHaveLength(0);
    expect(lateJoin.snapshot(22_000).volumes).toHaveLength(0);
    expect(lateJoin.applyAuthoritativeSnapshot(wire.snapshot)).toBe(false);
  });
});
