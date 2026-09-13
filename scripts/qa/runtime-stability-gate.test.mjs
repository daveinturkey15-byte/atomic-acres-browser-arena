import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarizeCadence, summarizePresentation } from './runtime-stability-gate.mjs';

test('computes upper-tail frame gaps and corresponding FPS without a spot sample', () => {
    assert.equal(percentile([16, 17, 18, 120, 260], 95), 260);
    assert.deepEqual(summarizeCadence([
      { atMs: 1_000, gapMs: 16 },
      { atMs: 1_010, gapMs: 17 },
      { atMs: 1_030, gapMs: 120 },
      { atMs: 1_290, gapMs: 260 },
    ], 0), {
      sampleCount: 4,
      medianGapMs: 17,
      p95GapMs: 260,
      p99GapMs: 260,
      maxGapMs: 260,
      medianFps: 8.333333333333334,
      p05Fps: 3.8461538461538463,
      p01Fps: 3.8461538461538463,
      stallCount100ms: 2,
      stallCount250ms: 1,
      stallCount1000ms: 0,
    });
  });

test('keeps WebGPU completion progress separate from rAF cadence', () => {
    const result = summarizePresentation([
      { atMs: 100, counters: { submissionSequence: 10, completedSequence: 9, inFlightSubmissions: 1, lastCompletionLatencyMs: 18 }, telemetry: { status: 'healthy', progress: { currentSubmissionGapMs: 16, currentCompletionGapMs: 20 } } },
      { atMs: 200, counters: { submissionSequence: 15, completedSequence: 14, inFlightSubmissions: 1, lastCompletionLatencyMs: 40 }, telemetry: { status: 'healthy', progress: { currentSubmissionGapMs: 22, currentCompletionGapMs: 30 } } },
    ], 0);
    assert.deepEqual(result, {
      sampleCount: 2,
      submissionAdvances: 5,
      completionAdvances: 5,
      maxInFlight: 1,
      maxCompletionLatencyMs: 40,
      p95CompletionLatencyMs: 40,
      p99CompletionLatencyMs: 40,
      maxSubmissionGapMs: 22,
      maxCompletionGapMs: 30,
      statuses: ['healthy'],
    });
});
