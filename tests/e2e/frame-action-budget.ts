import type { Page } from '@playwright/test';

export const TARGET_FRAME_BUDGET_MS = 1_000 / 60;
export const BASELINE_OBSERVATION_MS = 350;
export const MINIMUM_BASELINE_FRAME_SAMPLES = 10;
export const MINIMUM_NATIVE_ACTION_FRAME_SAMPLES = MINIMUM_BASELINE_FRAME_SAMPLES;
export const MINIMUM_SOFTWARE_CI_ACTION_FRAME_SAMPLES = 2;
export const BASELINE_CAPTURE_DEADLINE_MS = 2_000;
export const MAXIMUM_BASELINE_P95_FRAME_BUDGETS = 1.5;
export const MAXIMUM_BASELINE_GAP_FRAME_BUDGETS = 3;
export const MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS = 3;
export const MINIMUM_ACTION_FRAME_BUDGETS = 2;
export const MAXIMUM_ACTION_FRAME_BUDGETS = 3;
export const ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS = 1;
export const MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS = 2;

export const NATIVE_NO_FREEZE_FRAME_ACTION_MODE = 'native-no-freeze';
export const SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE = 'software-ci-semantic';
export const REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE = NATIVE_NO_FREEZE_FRAME_ACTION_MODE;

export type FrameActionEvidenceMode =
  | typeof NATIVE_NO_FREEZE_FRAME_ACTION_MODE
  | typeof SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE;

export type FrameActionReleaseAcceptanceIdentity = Readonly<{
  evidenceMode: FrameActionEvidenceMode;
  expectedSourceSha: string | undefined;
  checkoutSourceSha: string | undefined;
  servedSourceSha: string | undefined;
  renderer: 'webgl2' | 'webgpu';
  browserChannel: 'msedge' | 'configured-chromium';
  browserUserAgent: string;
  installedBrowser: boolean;
  softwareAdapter: boolean | undefined;
  adapterLabel: string | undefined;
}>;

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
  evidenceMode: FrameActionEvidenceMode;
  releaseAcceptanceModeEligible: boolean;
  targetFrameBudgetMs: number;
  maximumActionMs: number;
  maximumSynchronousActionMs: number;
  maximumFrameWorkMs: number;
  maximumAnimationFrameGapMs: number;
  maximumFirstSubmissionDelayMs: number;
  maximumFirstCompletionDelayMs: number;
  maximumPendingForMs: number;
  referenceBaselineMs: number;
}>;

export type FrameActionMeasurement = Readonly<{
  internalHandlerSyncMs: number;
  outerHandlerSyncMs: number;
  eventToNextAnimationFrameMs: number;
  maximumAnimationFrameGapMs: number;
  maximumFrameWorkMs: number;
  maximumPendingForMs: number;
  firstSubmissionDelayMs: number;
  firstCompletionDelayMs: number;
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

export function resolveFrameActionEvidenceMode(value: string | undefined): FrameActionEvidenceMode {
  if (value === undefined || value === '' || value === NATIVE_NO_FREEZE_FRAME_ACTION_MODE) {
    return NATIVE_NO_FREEZE_FRAME_ACTION_MODE;
  }
  if (value === SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE) return SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE;
  throw new Error(`Unknown frame-action evidence mode: ${value}`);
}

export function assertFrameActionEvidenceEnvironment(
  evidenceMode: FrameActionEvidenceMode,
  continuousIntegration: boolean,
): void {
  if (evidenceMode === SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE && !continuousIntegration) {
    throw new Error('software-ci-semantic frame-action evidence is CI-only');
  }
}

export function isContinuousIntegrationEnvironment(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

const SOFTWARE_ADAPTER_PATTERN = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export function minimumActionFrameSamples(evidenceMode: FrameActionEvidenceMode): number {
  return evidenceMode === NATIVE_NO_FREEZE_FRAME_ACTION_MODE
    ? MINIMUM_NATIVE_ACTION_FRAME_SAMPLES
    : MINIMUM_SOFTWARE_CI_ACTION_FRAME_SAMPLES;
}

export function frameActionReleaseAcceptanceFailures(
  identity: FrameActionReleaseAcceptanceIdentity,
): readonly string[] {
  const failures: string[] = [];
  if (identity.evidenceMode !== REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE) {
    failures.push('native-no-freeze evidence mode required');
  }
  if (!SOURCE_SHA_PATTERN.test(identity.expectedSourceSha ?? '')
    || identity.checkoutSourceSha !== identity.expectedSourceSha
    || identity.servedSourceSha !== identity.expectedSourceSha) {
    failures.push('exact expected checkout and served source SHA required');
  }
  if (identity.renderer !== 'webgpu') failures.push('WebGPU renderer required');
  if (!identity.installedBrowser || identity.browserChannel !== 'msedge'
    || !/Edg\//u.test(identity.browserUserAgent)) {
    failures.push('installed Edge identity required');
  }
  if (identity.softwareAdapter !== false
    || typeof identity.adapterLabel !== 'string'
    || identity.adapterLabel.trim() === ''
    || SOFTWARE_ADAPTER_PATTERN.test(identity.adapterLabel)) {
    failures.push('non-software adapter identity required');
  }
  return failures;
}

export function frameActionReleaseAcceptanceEligible(
  identity: FrameActionReleaseAcceptanceIdentity,
): boolean {
  return frameActionReleaseAcceptanceFailures(identity).length === 0;
}

function validateCompletedFrameActionBaseline(baseline: FrameActionBaseline): void {
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
}

export function deriveFrameActionBudget(
  baseline: FrameActionBaseline,
  evidenceMode: FrameActionEvidenceMode = NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
): FrameActionBudget {
  if (evidenceMode !== NATIVE_NO_FREEZE_FRAME_ACTION_MODE
    && evidenceMode !== SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE) {
    throw new Error(`Unknown frame-action evidence mode: ${String(evidenceMode)}`);
  }
  validateCompletedFrameActionBaseline(baseline);

  const maximumBaselineP95Ms = TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_P95_FRAME_BUDGETS;
  const maximumBaselineGapMs = TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_GAP_FRAME_BUDGETS;
  const maximumBaselineCompletionMs = TARGET_FRAME_BUDGET_MS
    * MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS;
  if (evidenceMode === NATIVE_NO_FREEZE_FRAME_ACTION_MODE
    && (baseline.p95GapMs >= maximumBaselineP95Ms
      || baseline.maximumGapMs >= maximumBaselineGapMs
      || baseline.firstCompletionDelayMs >= maximumBaselineCompletionMs)) {
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
  const relativeAllowanceMs = TARGET_FRAME_BUDGET_MS * ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS;
  const softwareSemanticThresholds = Object.freeze({
    maximumAnimationFrameGapMs: rounded(baseline.maximumGapMs + relativeAllowanceMs),
    maximumFirstSubmissionDelayMs: rounded(baseline.firstSubmissionDelayMs + relativeAllowanceMs),
    maximumFirstCompletionDelayMs: rounded(baseline.firstCompletionDelayMs + relativeAllowanceMs),
    maximumPendingForMs: rounded(baseline.maximumPendingForMs + relativeAllowanceMs),
  });
  const nativeThreshold = rounded(maximumActionMs);
  const maximumSynchronousActionMs = rounded(
    TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
  );
  const maximumFrameWorkMs = evidenceMode === NATIVE_NO_FREEZE_FRAME_ACTION_MODE
    ? nativeThreshold
    : rounded(TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS);
  const thresholds = evidenceMode === NATIVE_NO_FREEZE_FRAME_ACTION_MODE
    ? Object.freeze({
      maximumAnimationFrameGapMs: nativeThreshold,
      maximumFirstSubmissionDelayMs: nativeThreshold,
      maximumFirstCompletionDelayMs: nativeThreshold,
      maximumPendingForMs: nativeThreshold,
    })
    : softwareSemanticThresholds;
  return Object.freeze({
    evidenceMode,
    // Mode is the first acceptance fence. The exact receipt must additionally
    // prove an installed browser and a non-software adapter.
    releaseAcceptanceModeEligible: evidenceMode === REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE,
    targetFrameBudgetMs: rounded(TARGET_FRAME_BUDGET_MS),
    maximumActionMs: evidenceMode === NATIVE_NO_FREEZE_FRAME_ACTION_MODE
      ? nativeThreshold
      : Math.max(...Object.values(softwareSemanticThresholds)),
    maximumSynchronousActionMs,
    maximumFrameWorkMs,
    ...thresholds,
    referenceBaselineMs: rounded(referenceBaselineMs),
  });
}

export function frameActionBudgetFailures(
  budget: FrameActionBudget,
  measurement: FrameActionMeasurement,
): readonly string[] {
  const thresholds = [
    ['internal-handler-sync', measurement.internalHandlerSyncMs, budget.maximumSynchronousActionMs],
    ['outer-handler-sync', measurement.outerHandlerSyncMs, budget.maximumSynchronousActionMs],
    ['event-to-next-animation-frame', measurement.eventToNextAnimationFrameMs, budget.maximumAnimationFrameGapMs],
    // A 2-3 sample maximum on hosted software WebGL is scheduler jitter rather
    // than action work. The semantic shard retains it in the receipt, but gates
    // the action through the handler, frame-work, next-rAF and presentation
    // frontiers below. Native acceptance still gates the complete rAF maximum.
    ...(budget.evidenceMode === NATIVE_NO_FREEZE_FRAME_ACTION_MODE
      ? [['maximum-animation-frame-gap', measurement.maximumAnimationFrameGapMs,
        budget.maximumAnimationFrameGapMs] as const]
      : []),
    ['maximum-frame-work', measurement.maximumFrameWorkMs, budget.maximumFrameWorkMs],
    ['maximum-presentation-pending', measurement.maximumPendingForMs, budget.maximumPendingForMs],
    ['first-submission-delay', measurement.firstSubmissionDelayMs, budget.maximumFirstSubmissionDelayMs],
    ['first-completion-delay', measurement.firstCompletionDelayMs, budget.maximumFirstCompletionDelayMs],
  ] as const;
  return thresholds.flatMap(([label, value, maximum]) => (
    Number.isFinite(value) && value >= 0 && value < maximum
      ? []
      : [`${label}:${String(value)}>=${maximum}`]
  ));
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
