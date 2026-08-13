import { describe, expect, it } from 'vitest';
import {
  deriveFrameActionBudget,
  MAXIMUM_ACTION_FRAME_BUDGETS,
  TARGET_FRAME_BUDGET_MS,
  type FrameActionBaseline,
} from '../tests/e2e/frame-action-budget';

function baseline(gapsMs: readonly number[], observationMs: number): FrameActionBaseline {
  const sorted = [...gapsMs].sort((left, right) => left - right);
  const sample = (quantile: number) => sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))
  ]!;
  const round = (value: number) => Number(value.toFixed(3));
  return {
    label: 'synthetic-baseline',
    observationMs,
    frameSamples: gapsMs.length,
    gapsMs: gapsMs.map(round),
    p50GapMs: round(sample(0.5)),
    p95GapMs: round(sample(0.95)),
    maximumGapMs: round(sorted[sorted.length - 1]!),
    presentationStatus: 'synchronous',
    startingPresentedFrame: 10,
    endingPresentedFrame: 10 + gapsMs.length,
    startingSubmissionSequence: 0,
    startingCompletedSequence: 0,
    targetSubmissionSequence: 0,
    endingSubmissionSequence: 0,
    endingCompletedSequence: 0,
    firstPresentedFrameDelayMs: round(gapsMs[0]!),
    firstSubmissionDelayMs: round(gapsMs[0]!),
    firstCompletionDelayMs: round(gapsMs[0]!),
    maximumPendingForMs: 0,
    completionFailures: 0,
  };
}

describe('Pass 71 frame-action baseline', () => {
  it('retains the strict sub-50ms action budget for a complete healthy sample', () => {
    const budget = deriveFrameActionBudget(baseline(Array.from({ length: 22 }, () => 16), 352));

    expect(budget.maximumActionMs).toBeLessThan(TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS);
    expect(budget.maximumActionMs).toBe(33.333);
    expect(budget.maximumSynchronousActionMs).toBe(33.333);
  });

  it('retains fail-closed validation for a prematurely completed nine-frame Windows sample', () => {
    const windowsGaps = [40.4, 37.4, 40, 41.7, 41, 42.6, 41.2, 41.6, 40.1];

    expect(() => deriveFrameActionBudget(baseline(windowsGaps, 366)))
      .toThrow('synthetic-baseline has an incomplete frame sample set');
  });

  it('rejects rather than conceals the same slow presentation once ten samples are complete', () => {
    const windowsGaps = [40.4, 37.4, 40, 41.7, 41, 42.6, 41.2, 41.6, 40.1, 40.5];

    expect(() => deriveFrameActionBudget(baseline(windowsGaps, 406.5)))
      .toThrow('synthetic-baseline baseline is already outside the no-freeze envelope');
  });
});
