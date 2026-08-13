import type { Page } from '@playwright/test';

export const TARGET_FRAME_BUDGET_MS = 1_000 / 60;
export const BASELINE_OBSERVATION_MS = 350;
export const MINIMUM_BASELINE_FRAME_SAMPLES = 10;
export const BASELINE_CAPTURE_DEADLINE_MS = 2_000;
export const MAXIMUM_BASELINE_P95_FRAME_BUDGETS = 1.5;
export const MAXIMUM_BASELINE_GAP_FRAME_BUDGETS = 3;
export const MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS = 3;
export const MINIMUM_ACTION_FRAME_BUDGETS = 2;
export const MAXIMUM_ACTION_FRAME_BUDGETS = 3;
export const ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS = 1;
export const MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS = 2;

export type FrameActionBaseline = Readonly<{
  label: string;
  observationMs: number;
  frameSamples: number;
  gapsMs: readonly number[];
  p50GapMs: number;
  p95GapMs: number;
  maximumGapMs: number;
  presentationStatus: string;
  startingPresentedFrame: number;
  endingPresentedFrame: number;
  startingSubmissionSequence: number;
  startingCompletedSequence: number;
  targetSubmissionSequence: number;
  endingSubmissionSequence: number;
  endingCompletedSequence: number;
  firstPresentedFrameDelayMs: number;
  firstSubmissionDelayMs: number;
  firstCompletionDelayMs: number;
  maximumPendingForMs: number;
  completionFailures: number;
}>;

export type FrameActionBudget = Readonly<{
  targetFrameBudgetMs: number;
  maximumActionMs: number;
  maximumSynchronousActionMs: number;
  referenceBaselineMs: number;
}>;

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]!;
}

function requireFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative`);
}

export function deriveFrameActionBudget(baseline: FrameActionBaseline): FrameActionBudget {
  for (const [label, value] of [
    ['observationMs', baseline.observationMs],
    ['p50GapMs', baseline.p50GapMs],
    ['p95GapMs', baseline.p95GapMs],
    ['maximumGapMs', baseline.maximumGapMs],
    ['firstPresentedFrameDelayMs', baseline.firstPresentedFrameDelayMs],
    ['firstSubmissionDelayMs', baseline.firstSubmissionDelayMs],
    ['firstCompletionDelayMs', baseline.firstCompletionDelayMs],
    ['maximumPendingForMs', baseline.maximumPendingForMs],
  ] as const) requireFiniteNonNegative(value, `${baseline.label}.${label}`);
  if (baseline.observationMs < BASELINE_OBSERVATION_MS) {
    throw new Error(`${baseline.label} did not cover the ${BASELINE_OBSERVATION_MS}ms baseline window`);
  }
  if (!Number.isSafeInteger(baseline.frameSamples)
    || baseline.frameSamples < MINIMUM_BASELINE_FRAME_SAMPLES
    || baseline.gapsMs.length !== baseline.frameSamples) {
    throw new Error(`${baseline.label} has an incomplete frame sample set`);
  }
  if (!baseline.gapsMs.every((gap) => Number.isFinite(gap) && gap >= 0)) {
    throw new Error(`${baseline.label} contains an invalid animation-frame gap`);
  }
  if (Math.abs(rounded(percentile(baseline.gapsMs, 0.5)) - baseline.p50GapMs) > 0.001
    || Math.abs(rounded(percentile(baseline.gapsMs, 0.95)) - baseline.p95GapMs) > 0.001
    || Math.abs(rounded(Math.max(...baseline.gapsMs)) - baseline.maximumGapMs) > 0.001) {
    throw new Error(`${baseline.label} percentile summary does not match its raw frame samples`);
  }
  if (baseline.presentationStatus !== 'healthy' && baseline.presentationStatus !== 'synchronous') {
    throw new Error(`${baseline.label} presentation frontier is ${baseline.presentationStatus}`);
  }
  if (baseline.completionFailures !== 0
    || baseline.endingPresentedFrame <= baseline.startingPresentedFrame
    || baseline.endingSubmissionSequence < baseline.startingSubmissionSequence
    || baseline.endingCompletedSequence < baseline.startingCompletedSequence
    || baseline.endingCompletedSequence < baseline.targetSubmissionSequence) {
    throw new Error(`${baseline.label} did not advance a healthy completed presentation frontier`);
  }

  const maximumBaselineP95Ms = TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_P95_FRAME_BUDGETS;
  const maximumBaselineGapMs = TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_GAP_FRAME_BUDGETS;
  const maximumBaselineCompletionMs = TARGET_FRAME_BUDGET_MS
    * MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS;
  if (baseline.p95GapMs >= maximumBaselineP95Ms
    || baseline.maximumGapMs >= maximumBaselineGapMs
    || baseline.firstCompletionDelayMs >= maximumBaselineCompletionMs) {
    throw new Error(
      `${baseline.label} baseline is already outside the no-freeze envelope: ${JSON.stringify({
        p95GapMs: baseline.p95GapMs,
        maximumGapMs: baseline.maximumGapMs,
        firstCompletionDelayMs: baseline.firstCompletionDelayMs,
        maximumBaselineP95Ms,
        maximumBaselineGapMs,
        maximumBaselineCompletionMs,
      })}`,
    );
  }

  const referenceBaselineMs = Math.max(
    baseline.p95GapMs,
    baseline.firstPresentedFrameDelayMs,
    baseline.firstSubmissionDelayMs,
    baseline.firstCompletionDelayMs,
  );
  const maximumActionMs = Math.min(
    TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS,
    Math.max(
      TARGET_FRAME_BUDGET_MS * MINIMUM_ACTION_FRAME_BUDGETS,
      referenceBaselineMs + TARGET_FRAME_BUDGET_MS * ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
    ),
  );
  return Object.freeze({
    targetFrameBudgetMs: rounded(TARGET_FRAME_BUDGET_MS),
    maximumActionMs: rounded(maximumActionMs),
    maximumSynchronousActionMs: rounded(
      TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
    ),
    referenceBaselineMs: rounded(referenceBaselineMs),
  });
}

export async function captureFrameActionBaseline(
  page: Page,
  label: string,
): Promise<FrameActionBaseline> {
  return page.evaluate(({
    baselineLabel,
    captureDeadlineMs,
    minimumFrameSamples,
    minimumObservationMs,
  }) => new Promise<FrameActionBaseline>((resolve, reject) => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__ as any;
    if (!debug) {
      reject(new Error('Atomic Acres debug surface is unavailable'));
      return;
    }
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const startingPresentation = debug.samplePresentationTelemetry() as any;
      const startingPresentedFrame = debug.admissionState().presentedGameplayFrame;
      const synchronous = startingPresentation.status === 'synchronous';
      let previousFrameAt = startedAt;
      let targetSubmissionSequence: number | null = synchronous ? 0 : null;
      let firstPresentedFrameDelayMs: number | null = null;
      let firstSubmissionDelayMs: number | null = synchronous ? null : null;
      let firstCompletionDelayMs: number | null = synchronous ? null : null;
      let maximumPendingForMs = startingPresentation.pendingForMs as number;
      let completionFailures = startingPresentation.completionFailures as number;
      let endingPresentation = startingPresentation;
      let endingPresentedFrame = startingPresentedFrame;
      const gapsMs: number[] = [];
      const deadline = startedAt + captureDeadlineMs;
      const round = (value: number) => Number(value.toFixed(3));

      const inspect = () => {
        const now = performance.now();
        const elapsedMs = now - startedAt;
        gapsMs.push(now - previousFrameAt);
        previousFrameAt = now;
        endingPresentation = debug.samplePresentationTelemetry() as any;
        endingPresentedFrame = debug.admissionState().presentedGameplayFrame;
        maximumPendingForMs = Math.max(maximumPendingForMs, endingPresentation.pendingForMs as number);
        completionFailures = Math.max(completionFailures, endingPresentation.completionFailures as number);
        if (firstPresentedFrameDelayMs === null && endingPresentedFrame > startingPresentedFrame) {
          firstPresentedFrameDelayMs = elapsedMs;
          if (synchronous) {
            firstSubmissionDelayMs = elapsedMs;
            firstCompletionDelayMs = elapsedMs;
          }
        }
        if (!synchronous && targetSubmissionSequence === null
          && endingPresentation.submissionSequence > startingPresentation.submissionSequence) {
          targetSubmissionSequence = endingPresentation.submissionSequence;
          firstSubmissionDelayMs = elapsedMs;
        }
        if (!synchronous && firstCompletionDelayMs === null && targetSubmissionSequence !== null
          && endingPresentation.completedSequence >= targetSubmissionSequence) {
          firstCompletionDelayMs = elapsedMs;
        }
        const complete = now < deadline
          && elapsedMs >= minimumObservationMs
          && gapsMs.length >= minimumFrameSamples
          && firstPresentedFrameDelayMs !== null
          && firstSubmissionDelayMs !== null
          && firstCompletionDelayMs !== null
          && targetSubmissionSequence !== null;
        if (complete) {
          const sorted = [...gapsMs].sort((left, right) => left - right);
          const sample = (quantile: number) => sorted[
            Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))
          ]!;
          resolve({
            label: baselineLabel,
            observationMs: round(elapsedMs),
            frameSamples: gapsMs.length,
            gapsMs: gapsMs.map(round),
            p50GapMs: round(sample(0.5)),
            p95GapMs: round(sample(0.95)),
            maximumGapMs: round(sorted[sorted.length - 1]!),
            presentationStatus: endingPresentation.status,
            startingPresentedFrame,
            endingPresentedFrame,
            startingSubmissionSequence: startingPresentation.submissionSequence,
            startingCompletedSequence: startingPresentation.completedSequence,
            targetSubmissionSequence: targetSubmissionSequence!,
            endingSubmissionSequence: endingPresentation.submissionSequence,
            endingCompletedSequence: endingPresentation.completedSequence,
            firstPresentedFrameDelayMs: round(firstPresentedFrameDelayMs!),
            firstSubmissionDelayMs: round(firstSubmissionDelayMs!),
            firstCompletionDelayMs: round(firstCompletionDelayMs!),
            maximumPendingForMs: round(maximumPendingForMs),
            completionFailures,
          });
          return;
        }
        if (now >= deadline) {
          reject(new Error(
            `${baselineLabel} did not complete a ${minimumFrameSamples}-sample presentation frontier within ${captureDeadlineMs}ms`
              + ` (samples=${gapsMs.length}, elapsedMs=${round(elapsedMs)})`,
          ));
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }), {
    baselineLabel: label,
    captureDeadlineMs: BASELINE_CAPTURE_DEADLINE_MS,
    minimumFrameSamples: MINIMUM_BASELINE_FRAME_SAMPLES,
    minimumObservationMs: BASELINE_OBSERVATION_MS,
  });
}
