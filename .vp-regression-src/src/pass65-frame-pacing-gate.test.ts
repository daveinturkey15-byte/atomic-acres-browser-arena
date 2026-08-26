import { describe, expect, it } from 'vitest';
import {
  compareAtomicAgainstTerminal,
  comparePresentationCadenceAgainstTerminal,
  summarizeFramePacingWindow,
  summarizePresentationProgressWindow,
  validateFramePacingWindow,
  validatePresentationProgressWindow,
  type PresentationProgressSnapshot,
} from './pass65-frame-pacing-gate';

function repeat(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value);
}

function presentationSnapshot(overrides: Partial<PresentationProgressSnapshot> = {}): PresentationProgressSnapshot {
  return {
    status: 'healthy',
    submissionMode: 'warmed-live',
    maximumInFlightSubmissions: 2,
    inFlightSubmissions: 1,
    submissionSequence: 1_000,
    completedSequence: 999,
    completionFailures: 0,
    skippedSubmissions: 100,
    ...overrides,
  };
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

  it('requires real WebGPU submission and completion throughput independently of rAF callbacks', () => {
    const passed = summarizePresentationProgressWindow(
      presentationSnapshot(),
      presentationSnapshot({ submissionSequence: 1_600, completedSequence: 1_599, skippedSubmissions: 800 }),
      10_000,
    );
    expect(passed).toMatchObject({
      submissionAdvances: 600,
      completionAdvances: 600,
      submittedHz: 60,
      completedHz: 60,
      skippedSubmissionAdvances: 700,
    });
    expect(validatePresentationProgressWindow(passed)).toEqual([]);

    const callbackOnlyPass = summarizeFramePacingWindow(repeat(5.6, 1_786), 10_002);
    expect(validateFramePacingWindow(callbackOnlyPass, 0, true)).toEqual([]);
    const starvedPresentation = summarizePresentationProgressWindow(
      presentationSnapshot(),
      presentationSnapshot({ submissionSequence: 1_380, completedSequence: 1_379, skippedSubmissions: 1_500 }),
      10_002,
    );
    expect(validatePresentationProgressWindow(starvedPresentation)).toEqual(expect.arrayContaining([
      'presentation-submissions-below-45hz:380/450',
      'presentation-completions-below-45hz:380/450',
    ]));
  });

  it('fails closed on a non-live mode, inconsistent depth, sequence regression or frontier drift', () => {
    const invalid = summarizePresentationProgressWindow(
      presentationSnapshot({ submissionMode: 'serialized', maximumInFlightSubmissions: 1, inFlightSubmissions: 2 }),
      presentationSnapshot({
        status: 'failed',
        inFlightSubmissions: 3,
        submissionSequence: 998,
        completedSequence: 997,
        completionFailures: 1,
        skippedSubmissions: 90,
      }),
      10_000,
    );
    expect(validatePresentationProgressWindow(invalid)).toEqual(expect.arrayContaining([
      'presentation-start-mode:serialized',
      'presentation-start-frontier-bound:1',
      'presentation-start-in-flight-invalid:2/1',
      'presentation-end-not-healthy:failed',
      'presentation-end-completion-failures:1',
      'presentation-submission-sequence-regressed:-2',
      'presentation-completion-sequence-regressed:-2',
      'presentation-skipped-sequence-invalid:-10',
    ]));
    const drift = summarizePresentationProgressWindow(
      presentationSnapshot(),
      presentationSnapshot({
        inFlightSubmissions: 20,
        submissionSequence: 1_600,
        completedSequence: 1_580,
      }),
      10_000,
    );
    expect(validatePresentationProgressWindow(drift)).toContain('presentation-frontier-drift:600/581');
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
    expect(comparePresentationCadenceAgainstTerminal(
      { submittedHz: 49, completedHz: 48 },
      { submittedHz: 60, completedHz: 60 },
    )).toEqual([
      'atomic-submission-cadence-materially-worse:49/60',
      'atomic-completion-cadence-materially-worse:48/60',
    ]);
  });

  it('permits only bounded measurement noise between Atomic Acres and Terminal', () => {
    const terminal = summarizeFramePacingWindow([...repeat(16.6, 598), 19, 24], 10_000);
    const atomic = summarizeFramePacingWindow([...repeat(16.7, 597), 19.5, 23, 27], 10_000);
    expect(compareAtomicAgainstTerminal(atomic, terminal)).toEqual([]);
  });
});
