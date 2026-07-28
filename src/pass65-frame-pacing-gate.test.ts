import { describe, expect, it } from 'vitest';
import {
  compareAtomicAgainstTerminal,
  summarizeFramePacingWindow,
  validateFramePacingWindow,
} from './pass65-frame-pacing-gate';

function repeat(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value);
}

describe('Pass 65 native-WebGPU frame-pacing gate', () => {
  it('reports exact tail percentiles and strict long-frame thresholds', () => {
    const samples = [8, 12, 20, 20.1, 33, 33.1, 50, 50.1, 100, 100.1];
    expect(summarizeFramePacingWindow(samples, 10_000)).toMatchObject({
      sampleCount: 10,
      p50Ms: 33,
      p95Ms: 100,
      p99Ms: 100,
      maxMs: 100.1,
      longFrames: { over20Ms: 7, over33Ms: 5, over50Ms: 3, over100Ms: 1 },
    });
  });

  it('accepts a complete 60 Hz-class ten-second window without long tasks', () => {
    const summary = summarizeFramePacingWindow(repeat(16.667, 600), 10_001);
    expect(summary.cadenceHz).toBeCloseTo(59.994, 3);
    expect(validateFramePacingWindow(summary, 0, true)).toEqual([]);
  });

  it('rejects short evidence, >100 ms frames, bad tails and any steady long task', () => {
    const summary = summarizeFramePacingWindow([
      ...repeat(16.667, 570),
      ...repeat(36, 28),
      101,
    ], 9_500);
    expect(validateFramePacingWindow(summary, 1, true)).toEqual(expect.arrayContaining([
      'window-too-short:9500/10000',
      'frame-over-100ms:101',
      'frames-over-100ms:1',
      'steady-long-tasks:1/0',
    ]));
  });

  it('fails when Atomic Acres hides a severe tail behind a good median', () => {
    const terminal = summarizeFramePacingWindow([...repeat(8.3, 599), 8.5], 10_000);
    const atomic = summarizeFramePacingWindow([...repeat(8.4, 560), ...repeat(31.4, 39), 58.5], 10_000);
    expect(compareAtomicAgainstTerminal(atomic, terminal)).toEqual(expect.arrayContaining([
      'atomic-max-materially-worse:58.5/8.5',
      'atomic-over-20ms-rate-materially-worse:66.667/0',
    ]));
  });

  it('does not turn a display-interval percentile cliff into a false relative regression', () => {
    const terminal = summarizeFramePacingWindow([...repeat(5.6, 3_254), ...repeat(11.1, 171)], 20_000);
    const atomic = summarizeFramePacingWindow([...repeat(5.6, 3_205), ...repeat(11.1, 198)], 20_000);
    expect({ atomicP95: atomic.p95Ms, terminalP95: terminal.p95Ms }).toEqual({
      atomicP95: 11.1,
      terminalP95: 5.6,
    });
    expect(compareAtomicAgainstTerminal(atomic, terminal)).toEqual([]);
  });

  it('rejects a material Atomic Acres throughput deficit', () => {
    const terminal = summarizeFramePacingWindow(repeat(16.667, 600), 10_000);
    const atomic = summarizeFramePacingWindow(repeat(16.667, 500), 10_000);
    expect(compareAtomicAgainstTerminal(atomic, terminal)).toContain('atomic-cadence-materially-worse:50/60');
  });

  it('permits only bounded measurement noise between Atomic Acres and Terminal', () => {
    const terminal = summarizeFramePacingWindow([...repeat(16.6, 598), 19, 24], 10_000);
    const atomic = summarizeFramePacingWindow([...repeat(16.7, 597), 19.5, 23, 27], 10_000);
    expect(compareAtomicAgainstTerminal(atomic, terminal)).toEqual([]);
  });
});
