import { describe, expect, it } from 'vitest';
import { REMOTE_INTERPOLATION_RATE, STATE_BROADCAST_INTERVAL_MS, remoteInterpolationAlpha, stateBroadcastIntervalMs } from './network-sync';

describe('network synchronization pacing', () => {
  it('broadcasts healthy snapshots at 20 Hz and adapts under high latency', () => {
    expect(STATE_BROADCAST_INTERVAL_MS).toBe(50);
    expect(stateBroadcastIntervalMs(null)).toBe(50);
    expect(stateBroadcastIntervalMs(140)).toBe(50);
    expect(stateBroadcastIntervalMs(200)).toBe(66);
    expect(stateBroadcastIntervalMs(300)).toBe(100);
  });

  it('uses a bounded frame-rate-independent interpolation response', () => {
    const oneSixtieth = remoteInterpolationAlpha(1 / 60);
    const twoOneTwentieths = 1 - (1 - remoteInterpolationAlpha(1 / 120)) ** 2;
    expect(REMOTE_INTERPOLATION_RATE).toBe(24);
    expect(oneSixtieth).toBeCloseTo(twoOneTwentieths, 8);
    expect(oneSixtieth).toBeGreaterThan(0.3);
    expect(oneSixtieth).toBeLessThan(0.4);
  });

  it('rejects invalid time and clamps long stalls', () => {
    expect(remoteInterpolationAlpha(Number.NaN)).toBe(0);
    expect(remoteInterpolationAlpha(-1)).toBe(0);
    expect(remoteInterpolationAlpha(1)).toBeCloseTo(remoteInterpolationAlpha(0.05), 8);
  });
});
