import { describe, expect, it } from 'vitest';
import {
  assertFrameActionEvidenceEnvironment,
  deriveFrameActionBudget,
  frameActionBudgetFailures,
  frameActionReleaseAcceptanceEligible,
  frameActionReleaseAcceptanceFailures,
  isContinuousIntegrationEnvironment,
  MAXIMUM_ACTION_FRAME_BUDGETS,
  MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS,
  MAXIMUM_BASELINE_GAP_FRAME_BUDGETS,
  MAXIMUM_BASELINE_P95_FRAME_BUDGETS,
  MINIMUM_NATIVE_ACTION_FRAME_SAMPLES,
  MINIMUM_SOFTWARE_CI_ACTION_FRAME_SAMPLES,
  minimumActionFrameSamples,
  NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
  REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE,
  resolveFrameActionEvidenceMode,
  SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
  TARGET_FRAME_BUDGET_MS,
  type FrameActionBaseline,
  type FrameActionReleaseAcceptanceIdentity,
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
    expect(budget.maximumFrameWorkMs).toBe(33.333);
    expect(budget).toMatchObject({
      evidenceMode: NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
      releaseAcceptanceModeEligible: true,
    });
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

  it('freezes the native baseline boundaries at strict p95 <25ms, gap <50ms, completion <50ms', () => {
    expect(TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_P95_FRAME_BUDGETS).toBe(25);
    expect(TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_GAP_FRAME_BUDGETS).toBe(50);
    expect(TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS).toBe(50);

    expect(() => deriveFrameActionBudget(baseline(Array.from({ length: 15 }, () => 25), 375)))
      .toThrow('synthetic-baseline baseline is already outside the no-freeze envelope');
    const exactMaximumGap = baseline([...Array.from({ length: 19 }, () => 16), 50], 354);
    expect(() => deriveFrameActionBudget(exactMaximumGap))
      .toThrow('synthetic-baseline baseline is already outside the no-freeze envelope');
    expect(() => deriveFrameActionBudget({
      ...baseline(Array.from({ length: 22 }, () => 16), 352),
      firstCompletionDelayMs: 50,
    })).toThrow('synthetic-baseline baseline is already outside the no-freeze envelope');
  });

  it('derives software-CI action thresholds from the immediately preceding completed baseline plus one frame', () => {
    const completedSlowBaseline = baseline(
      [140, 141, 139, 145, 142, 141, 144, 140, 143, 142],
      1_417,
    );
    const budget = deriveFrameActionBudget(
      completedSlowBaseline,
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
    );

    expect(budget).toMatchObject({
      evidenceMode: SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
      releaseAcceptanceModeEligible: false,
      maximumSynchronousActionMs: 33.333,
      maximumFrameWorkMs: 50,
      maximumAnimationFrameGapMs: 161.667,
      maximumFirstSubmissionDelayMs: 156.667,
      maximumFirstCompletionDelayMs: 156.667,
      maximumPendingForMs: 16.667,
    });
    expect(frameActionBudgetFailures(budget, {
      internalHandlerSyncMs: 33.332,
      outerHandlerSyncMs: 33.332,
      eventToNextAnimationFrameMs: 161.666,
      maximumAnimationFrameGapMs: 161.666,
      maximumFrameWorkMs: 49.999,
      maximumPendingForMs: 16.666,
      firstSubmissionDelayMs: 156.666,
      firstCompletionDelayMs: 156.666,
    })).toEqual([]);
  });

  it('fails software-CI semantics closed on action-induced overhead and absolute handler/frame-work regressions', () => {
    const budget = deriveFrameActionBudget(
      baseline([140, 141, 139, 145, 142, 141, 144, 140, 143, 142], 1_417),
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
    );
    const valid = {
      internalHandlerSyncMs: 1,
      outerHandlerSyncMs: 1,
      eventToNextAnimationFrameMs: 150,
      maximumAnimationFrameGapMs: 150,
      maximumFrameWorkMs: 10,
      maximumPendingForMs: 1,
      firstSubmissionDelayMs: 150,
      firstCompletionDelayMs: 150,
    };

    expect(frameActionBudgetFailures(budget, { ...valid, firstCompletionDelayMs: 156.667 }))
      .toContain('first-completion-delay:156.667>=156.667');
    expect(frameActionBudgetFailures(budget, { ...valid, internalHandlerSyncMs: 33.333 }))
      .toContain('internal-handler-sync:33.333>=33.333');
    expect(frameActionBudgetFailures(budget, { ...valid, maximumFrameWorkMs: 50 }))
      .toContain('maximum-frame-work:50>=50');
  });

  it('keeps sparse software scheduler maxima diagnostic while native evidence gates them', () => {
    const slowBaseline = baseline(
      [140, 141, 139, 145, 142, 141, 144, 140, 143, 142],
      1_417,
    );
    const validExceptForAmbientRafMaximum = {
      internalHandlerSyncMs: 2,
      outerHandlerSyncMs: 3,
      eventToNextAnimationFrameMs: 100,
      maximumAnimationFrameGapMs: 230,
      maximumFrameWorkMs: 36,
      maximumPendingForMs: 0,
      firstSubmissionDelayMs: 133,
      firstCompletionDelayMs: 133,
    };

    expect(frameActionBudgetFailures(
      deriveFrameActionBudget(slowBaseline, SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE),
      validExceptForAmbientRafMaximum,
    )).toEqual([]);

    const nativeBudget = deriveFrameActionBudget(
      baseline(Array.from({ length: 22 }, () => 16), 352),
    );
    expect(frameActionBudgetFailures(nativeBudget, {
      ...validExceptForAmbientRafMaximum,
      eventToNextAnimationFrameMs: 16,
      maximumFrameWorkMs: 16,
      firstSubmissionDelayMs: 16,
      firstCompletionDelayMs: 16,
    })).toContain('maximum-animation-frame-gap:230>=33.333');
  });

  it('keeps the native action sample floor while allowing the 350ms software-CI window to be observed', () => {
    expect(MINIMUM_NATIVE_ACTION_FRAME_SAMPLES).toBe(10);
    expect(MINIMUM_SOFTWARE_CI_ACTION_FRAME_SAMPLES).toBe(2);
    expect(minimumActionFrameSamples(NATIVE_NO_FREEZE_FRAME_ACTION_MODE)).toBe(10);
    expect(minimumActionFrameSamples(SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE)).toBe(2);
  });

  it('keeps software-CI mode acceptance-ineligible and requires exact-SHA installed Edge WebGPU hardware', () => {
    expect(isContinuousIntegrationEnvironment('1')).toBe(true);
    expect(isContinuousIntegrationEnvironment('true')).toBe(true);
    expect(isContinuousIntegrationEnvironment('TRUE')).toBe(true);
    expect(isContinuousIntegrationEnvironment(undefined)).toBe(false);
    expect(isContinuousIntegrationEnvironment('0')).toBe(false);
    expect(resolveFrameActionEvidenceMode(undefined)).toBe(NATIVE_NO_FREEZE_FRAME_ACTION_MODE);
    expect(resolveFrameActionEvidenceMode(SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE))
      .toBe(SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE);
    expect(() => resolveFrameActionEvidenceMode('native-but-relaxed')).toThrow('Unknown frame-action evidence mode');
    expect(() => assertFrameActionEvidenceEnvironment(
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
      false,
    )).toThrow('software-ci-semantic frame-action evidence is CI-only');
    expect(() => assertFrameActionEvidenceEnvironment(
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
      true,
    )).not.toThrow();
    expect(() => assertFrameActionEvidenceEnvironment(
      NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
      false,
    )).not.toThrow();
    expect(REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE).toBe(NATIVE_NO_FREEZE_FRAME_ACTION_MODE);
    const sourceSha = 'a'.repeat(40);
    const accepted: FrameActionReleaseAcceptanceIdentity = {
      evidenceMode: NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
      expectedSourceSha: sourceSha,
      checkoutSourceSha: sourceSha,
      servedSourceSha: sourceSha,
      renderer: 'webgpu',
      browserChannel: 'msedge',
      browserUserAgent: 'Mozilla/5.0 Edg/140.0.0.0',
      installedBrowser: true,
      softwareAdapter: false,
      adapterLabel: 'NVIDIA GeForce RTX 5080',
    };
    expect(frameActionReleaseAcceptanceFailures(accepted)).toEqual([]);
    expect(frameActionReleaseAcceptanceEligible(accepted)).toBe(true);

    const softwareCi: FrameActionReleaseAcceptanceIdentity = {
      ...accepted,
      evidenceMode: SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
      expectedSourceSha: undefined,
      checkoutSourceSha: undefined,
      servedSourceSha: undefined,
      renderer: 'webgl2',
      browserChannel: 'configured-chromium',
      browserUserAgent: 'Mozilla/5.0 HeadlessChrome/140.0.0.0',
      installedBrowser: false,
      softwareAdapter: true,
      adapterLabel: 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)',
    };
    expect(frameActionReleaseAcceptanceEligible(softwareCi)).toBe(false);
    expect(frameActionReleaseAcceptanceFailures(softwareCi)).toEqual([
      'native-no-freeze evidence mode required',
      'exact expected checkout and served source SHA required',
      'WebGPU renderer required',
      'installed Edge identity required',
      'non-software adapter identity required',
    ]);

    for (const mutation of [
      { servedSourceSha: 'b'.repeat(40) },
      { renderer: 'webgl2' as const },
      { browserChannel: 'configured-chromium' as const },
      { softwareAdapter: true },
      { adapterLabel: 'Google SwiftShader' },
    ]) {
      expect(frameActionReleaseAcceptanceEligible({ ...accepted, ...mutation })).toBe(false);
    }
  });
});
