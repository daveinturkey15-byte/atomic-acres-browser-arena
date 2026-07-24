import { describe, expect, it } from 'vitest';
import {
  SnapshotInterpolationBuffer,
  createInterpolationDelayState,
  createSnapshotRateState,
  desiredInterpolationDelayMs,
  desiredSnapshotRate,
  shortestYaw,
  snapshotIntervalMs,
  stateBroadcastWakeIntervalMs,
  updateInterpolationDelay,
  updateSnapshotRate,
} from './network-sync';

const healthy = { rttMs: 20, jitterMs: 2, sequenceGaps: 0, reordered: 0, bufferedPressure: 0 };

describe('adaptive 20/30/40 Hz replication', () => {
  it('selects only the three contracted tiers', () => {
    expect(desiredSnapshotRate(healthy)).toBe(40);
    expect(desiredSnapshotRate({ ...healthy, rttMs: 140 })).toBe(30);
    expect(desiredSnapshotRate({ ...healthy, jitterMs: 80 })).toBe(20);
    expect(snapshotIntervalMs(20)).toBe(50);
    expect(snapshotIntervalMs(30)).toBeCloseTo(33.333, 2);
    expect(snapshotIntervalMs(40)).toBe(25);
  });

  it('does not run the replication wake-up loop at network frequency in solo play', () => {
    expect(stateBroadcastWakeIntervalMs('offline', true, true, 40)).toBe(250);
    expect(stateBroadcastWakeIntervalMs('host', false, true, 40)).toBe(250);
    expect(stateBroadcastWakeIntervalMs('client', true, true, 40)).toBe(25);
  });

  it('demotes quickly under sustained pressure without flapping', () => {
    let state = createSnapshotRateState(0);
    state = updateSnapshotRate(state, { ...healthy, bufferedPressure: 0.8 }, 1_100);
    expect(state.rateHz).toBe(40);
    state = updateSnapshotRate(state, { ...healthy, bufferedPressure: 0.8 }, 1_150);
    expect(state.rateHz).toBe(20);
    state = updateSnapshotRate(state, healthy, 2_000);
    expect(state.rateHz).toBe(20);
  });

  it('promotes one tier only after stable recovery residency', () => {
    let state: ReturnType<typeof createSnapshotRateState> = { ...createSnapshotRateState(0), rateHz: 20 };
    for (let index = 0; index < 7; index += 1) state = updateSnapshotRate(state, healthy, 5_000 + index * 50);
    expect(state.rateHz).toBe(20);
    state = updateSnapshotRate(state, healthy, 5_400);
    expect(state.rateHz).toBe(30);
  });

  it('uses receiver gaps and reorder feedback independently', () => {
    expect(desiredSnapshotRate({ ...healthy, sequenceGaps: 1 })).toBe(30);
    expect(desiredSnapshotRate({ ...healthy, sequenceGaps: 4 })).toBe(20);
    expect(desiredSnapshotRate({ ...healthy, reordered: 2 })).toBe(20);
  });
});

describe('bounded adaptive interpolation delay', () => {
  it('derives smooth targets inside the measured 20/30/40 Hz starting bands', () => {
    expect(desiredInterpolationDelayMs(40, 0)).toBe(50);
    expect(desiredInterpolationDelayMs(40, 100)).toBe(70);
    expect(desiredInterpolationDelayMs(30, 5)).toBeCloseTo(74.167, 2);
    expect(desiredInterpolationDelayMs(20, 0)).toBe(100);
    expect(desiredInterpolationDelayMs(20, 100)).toBe(120);
  });

  it('increases only after repeated underruns and reduces after sustained stability', () => {
    let state = createInterpolationDelayState(0);
    state = updateInterpolationDelay(state, { snapshotRateHz: 40, jitterMs: 0, underruns: 1 }, 250);
    state = updateInterpolationDelay(state, { snapshotRateHz: 40, jitterMs: 0, underruns: 1 }, 500);
    expect(state.delayMs).toBe(60);
    state = updateInterpolationDelay(state, { snapshotRateHz: 40, jitterMs: 0, underruns: 1 }, 750);
    expect(state.delayMs).toBe(65);
    for (let index = 1; index <= 20; index += 1) {
      state = updateInterpolationDelay(state, { snapshotRateHz: 40, jitterMs: 0, underruns: 0 }, 750 + index * 250);
    }
    expect(state.delayMs).toBe(60);
    expect(state).toMatchObject({ increases: 1, decreases: 1, targetMs: 50 });
  });

  it('moves across cadence bands in five-millisecond steps instead of jumping time', () => {
    let state = createInterpolationDelayState(0);
    for (let index = 1; index <= 4; index += 1) {
      state = updateInterpolationDelay(state, { snapshotRateHz: 20, jitterMs: 0, underruns: 0 }, index * 250);
    }
    expect(state).toMatchObject({ delayMs: 65, targetMs: 100 });
  });
});

describe('timestamped snapshot interpolation', () => {
  const buffer = () => new SnapshotInterpolationBuffer<{ x: number; yaw: number }>(
    (before, after, alpha) => ({
      x: before.x + (after.x - before.x) * alpha,
      yaw: shortestYaw(before.yaw, after.yaw, alpha),
    }),
  );

  it('reports the actual host-world time represented by the rendered pose', () => {
    const snapshots = buffer();
    snapshots.push({ seq: 1, hostTimeMs: 1_000, continuity: 1, value: { x: 0, yaw: 0 } });
    snapshots.push({ seq: 2, hostTimeMs: 1_100, continuity: 1, value: { x: 10, yaw: 1 } });
    const rendered = snapshots.sample(1_150, 100)!;
    expect(rendered.mode).toBe('interpolated');
    expect(rendered.renderedHostTimeMs).toBe(1_050);
    expect(rendered.renderedWorldAgeMs).toBe(100);
    expect(rendered.value.x).toBe(5);
  });

  it('deduplicates, records reorder/gaps and flushes discontinuities', () => {
    const snapshots = buffer();
    expect(snapshots.push({ seq: 1, hostTimeMs: 100, continuity: 1, value: { x: 1, yaw: 0 } })).toBe(true);
    expect(snapshots.push({ seq: 1, hostTimeMs: 100, continuity: 1, value: { x: 1, yaw: 0 } })).toBe(false);
    snapshots.push({ seq: 4, hostTimeMs: 400, continuity: 1, value: { x: 4, yaw: 0 } });
    snapshots.push({ seq: 3, hostTimeMs: 300, continuity: 1, value: { x: 3, yaw: 0 } });
    expect(snapshots.stats).toMatchObject({ duplicates: 1, sequenceGaps: 2, reordered: 1 });
    snapshots.push({ seq: 1, hostTimeMs: 500, continuity: 2, value: { x: 10, yaw: 0 } });
    expect(snapshots.depth).toBe(1);
    expect(snapshots.stats.discontinuities).toBe(1);
  });

  it('interpolates yaw along the shortest path and holds bounded endpoints', () => {
    const snapshots = buffer();
    snapshots.push({ seq: 1, hostTimeMs: 1_000, continuity: 1, value: { x: 0, yaw: Math.PI - 0.1 } });
    snapshots.push({ seq: 2, hostTimeMs: 1_100, continuity: 1, value: { x: 1, yaw: -Math.PI + 0.1 } });
    const rendered = snapshots.sample(1_150, 100)!;
    expect(Math.abs(rendered.value.yaw - Math.PI)).toBeLessThan(0.01);
    expect(snapshots.sample(2_000, 100)?.mode).toBe('held-latest');
    expect(snapshots.stats.underruns).toBe(1);
    expect(snapshots.sample(1_000, 100)?.mode).toBe('held-oldest');
    expect(snapshots.stats.overruns).toBe(1);
  });
});
