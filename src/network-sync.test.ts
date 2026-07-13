import { describe, expect, it } from 'vitest';
import { REMOTE_INTERPOLATION_RATE, STATE_BROADCAST_INTERVAL_MS, remoteInterpolationAlpha } from './network-sync';

describe('network synchronization pacing', () => {
  it('broadcasts snapshots at approximately 30 Hz', () => {
    expect(STATE_BROADCAST_INTERVAL_MS).toBeGreaterThanOrEqual(32);
    expect(STATE_BROADCAST_INTERVAL_MS).toBeLessThanOrEqual(34);
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
