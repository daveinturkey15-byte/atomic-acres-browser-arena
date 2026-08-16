import { describe, expect, it } from 'vitest';
import {
  assertFrameActionEvidenceEnvironment,
  BASELINE_CAPTURE_DEADLINE_MS,
  BASELINE_OBSERVATION_MS,
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
    expect(budget).toEqual({
      evidenceMode: NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
      releaseAcceptanceModeEligible: true,
      targetFrameBudgetMs: 16.667,
      maximumActionMs: 33.333,
      maximumSynchronousActionMs: 33.333,
      maximumFrameWorkMs: 33.333,
      maximumAnimationFrameGapMs: 33.333,
      maximumFirstSubmissionDelayMs: 33.333,
      maximumFirstCompletionDelayMs: 33.333,
      maximumPendingForMs: 33.333,
      referenceBaselineMs: 16,
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

  it('derives software-CI thresholds from the completed ambient baseline and unchanged handler ceiling', () => {
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
      maximumActionMs: 178.333,
      maximumSynchronousActionMs: 33.333,
      maximumFrameWorkMs: 145,
      maximumAnimationFrameGapMs: 161.667,
      maximumFirstSubmissionDelayMs: 178.333,
      maximumFirstCompletionDelayMs: 178.333,
      maximumPendingForMs: 16.667,
    });
    expect(frameActionBudgetFailures(budget, {
      internalHandlerSyncMs: 33.332,
      outerHandlerSyncMs: 33.332,
      eventToNextAnimationFrameMs: 161.666,
      maximumAnimationFrameGapMs: 161.666,
      maximumFrameWorkMs: 144.999,
      maximumPendingForMs: 16.666,
      firstSubmissionDelayMs: 178.332,
      firstCompletionDelayMs: 178.332,
    })).toEqual([]);
  });

  it('retains the existing 50ms software frame-work floor when the completed ambient p95 is faster', () => {
    const fastSoftwareBaseline = baseline(Array.from({ length: 22 }, () => 16), 352);
    const budget = deriveFrameActionBudget(
      fastSoftwareBaseline,
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
    );

    expect(budget.maximumFrameWorkMs).toBe(50);
    expect(budget.releaseAcceptanceModeEligible).toBe(false);
  });

  it('admits the exact failed Windows SwiftShader receipts while rejecting every boundary and overrun', () => {
    const receipts = [
      {
        grenade: 'frag',
        baseline: {
          gapsMs: [141.2, 120.5, 133, 125, 131.3, 137.2, 121, 120.3, 118.2, 128.9],
          observationMs: 1_276.6,
          firstFrontierMs: 141.2,
        },
        measurement: {
          internalHandlerSyncMs: 1.8,
          outerHandlerSyncMs: 2.5,
          eventToNextAnimationFrameMs: 93,
          maximumAnimationFrameGapMs: 208.2,
          maximumFrameWorkMs: 88.9,
          maximumPendingForMs: 0,
          firstSubmissionDelayMs: 131.6,
          firstCompletionDelayMs: 131.6,
        },
        expected: { frameWork: 141.2, firstFrontier: 174.533, animationFrame: 157.867 },
      },
      {
        grenade: 'smoke',
        baseline: {
          gapsMs: [124.4, 128.7, 131.4, 136, 124.6, 127.5, 128.1, 128.6, 133.1, 125.9],
          observationMs: 1_288.3,
          firstFrontierMs: 124.4,
        },
        measurement: {
          internalHandlerSyncMs: 3.3,
          outerHandlerSyncMs: 4.1,
          eventToNextAnimationFrameMs: 88.6,
          maximumAnimationFrameGapMs: 213,
          maximumFrameWorkMs: 60.3,
          maximumPendingForMs: 0,
          firstSubmissionDelayMs: 130.1,
          firstCompletionDelayMs: 130.1,
        },
        expected: { frameWork: 136, firstFrontier: 169.333, animationFrame: 152.667 },
      },
      {
        grenade: 'semtex',
        baseline: {
          gapsMs: [146, 137.4, 137.2, 140.5, 139.5, 129.8, 127.1, 137.7, 148.3, 138.2],
          observationMs: 1_381.7,
          firstFrontierMs: 146,
        },
        measurement: {
          internalHandlerSyncMs: 14.1,
          outerHandlerSyncMs: 15.4,
          eventToNextAnimationFrameMs: 108,
          maximumAnimationFrameGapMs: 276,
          maximumFrameWorkMs: 54.7,
          maximumPendingForMs: 0,
          firstSubmissionDelayMs: 176.2,
          firstCompletionDelayMs: 176.2,
        },
        expected: { frameWork: 148.3, firstFrontier: 181.633, animationFrame: 164.967 },
      },
      {
        grenade: 'semtex-91ea-sparse-first-gap',
        baseline: {
          gapsMs: [111, 115.6, 109.1, 94, 94.9, 98.9, 95.7, 92.1, 97.5, 91.7],
          observationMs: 1_000.5,
          firstFrontierMs: 111,
        },
        measurement: {
          internalHandlerSyncMs: 2.2,
          outerHandlerSyncMs: 3.2,
          eventToNextAnimationFrameMs: 168.9,
          maximumAnimationFrameGapMs: 205.2,
          maximumFrameWorkMs: 32.4,
          maximumPendingForMs: 0,
          firstSubmissionDelayMs: 205.2,
          firstCompletionDelayMs: 205.2,
        },
        expected: { frameWork: 115.6, firstFrontier: 148.933, animationFrame: 132.267 },
      },
    ] as const;

    for (const receipt of receipts) {
      const completedBaseline = {
        ...baseline(receipt.baseline.gapsMs, receipt.baseline.observationMs),
        label: `${receipt.grenade}-cold-preaction-baseline`,
        firstPresentedFrameDelayMs: receipt.baseline.firstFrontierMs,
        firstSubmissionDelayMs: receipt.baseline.firstFrontierMs,
        firstCompletionDelayMs: receipt.baseline.firstFrontierMs,
      };
      const budget = deriveFrameActionBudget(
        completedBaseline,
        SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
      );

      expect(budget, receipt.grenade).toMatchObject({
        evidenceMode: SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
        releaseAcceptanceModeEligible: false,
        maximumActionMs: receipt.expected.firstFrontier,
        maximumSynchronousActionMs: 33.333,
        maximumFrameWorkMs: receipt.expected.frameWork,
        maximumAnimationFrameGapMs: receipt.expected.animationFrame,
        maximumFirstSubmissionDelayMs: receipt.expected.firstFrontier,
        maximumFirstCompletionDelayMs: receipt.expected.firstFrontier,
        maximumPendingForMs: 16.667,
      });
      expect(frameActionBudgetFailures(budget, receipt.measurement), receipt.grenade).toEqual([]);

      for (const [field, failureLabel, maximum] of [
        ['internalHandlerSyncMs', 'internal-handler-sync', budget.maximumSynchronousActionMs],
        ['outerHandlerSyncMs', 'outer-handler-sync', budget.maximumSynchronousActionMs],
        ['maximumFrameWorkMs', 'maximum-frame-work', budget.maximumFrameWorkMs],
        ['maximumPendingForMs', 'maximum-presentation-pending', budget.maximumPendingForMs],
      ] as const) {
        expect(frameActionBudgetFailures(budget, {
          ...receipt.measurement,
          [field]: maximum,
        }), `${receipt.grenade} ${field} exact boundary`).toEqual([
          `${failureLabel}:${maximum}>=${maximum}`,
        ]);
        const overrun = Number((maximum + 0.001).toFixed(3));
        expect(frameActionBudgetFailures(budget, {
          ...receipt.measurement,
          [field]: overrun,
        }), `${receipt.grenade} ${field} just over boundary`).toEqual([
          `${failureLabel}:${overrun}>=${maximum}`,
        ]);
      }
    }
  });

  it('retains a slower corresponding first-frontier sample as the software threshold anchor', () => {
    const completedBaseline = {
      ...baseline(Array.from({ length: 10 }, () => 120), 1_200),
      firstSubmissionDelayMs: 140,
      firstCompletionDelayMs: 130,
    };
    const budget = deriveFrameActionBudget(
      completedBaseline,
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
    );

    expect(budget.maximumFirstSubmissionDelayMs).toBe(173.333);
    expect(budget.maximumFirstCompletionDelayMs).toBe(163.333);
    expect(budget.maximumFrameWorkMs).toBe(120);
  });

  it('fails software-CI semantics closed on action-induced overhead and bounded handler/frame-work regressions', () => {
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

    expect(frameActionBudgetFailures(budget, { ...valid, internalHandlerSyncMs: 33.333 }))
      .toContain('internal-handler-sync:33.333>=33.333');
    expect(frameActionBudgetFailures(budget, { ...valid, outerHandlerSyncMs: 33.333 }))
      .toContain('outer-handler-sync:33.333>=33.333');
    expect(frameActionBudgetFailures(budget, { ...valid, maximumFrameWorkMs: 145 }))
      .toContain('maximum-frame-work:145>=145');
    expect(frameActionBudgetFailures(budget, { ...valid, maximumPendingForMs: 16.667 }))
      .toContain('maximum-presentation-pending:16.667>=16.667');
  });

  it('keeps every sparse software scheduler frontier diagnostic while native evidence gates them', () => {
    const slowBaseline = baseline(
      [140, 141, 139, 145, 142, 141, 144, 140, 143, 142],
      1_417,
    );
    const validExceptForAmbientRafFrontiers = {
      internalHandlerSyncMs: 2,
      outerHandlerSyncMs: 3,
      eventToNextAnimationFrameMs: 220,
      maximumAnimationFrameGapMs: 230,
      maximumFrameWorkMs: 36,
      maximumPendingForMs: 0,
      firstSubmissionDelayMs: 240,
      firstCompletionDelayMs: 250,
    };

    expect(frameActionBudgetFailures(
      deriveFrameActionBudget(slowBaseline, SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE),
      validExceptForAmbientRafFrontiers,
    )).toEqual([]);

    const nativeBudget = deriveFrameActionBudget(
      baseline(Array.from({ length: 22 }, () => 16), 352),
    );
    const nativeMeasurement = {
      ...validExceptForAmbientRafFrontiers,
      eventToNextAnimationFrameMs: 16,
      maximumAnimationFrameGapMs: 16,
      maximumFrameWorkMs: 16,
      firstSubmissionDelayMs: 16,
      firstCompletionDelayMs: 16,
    };
    for (const [field, failureLabel, maximum] of [
      ['eventToNextAnimationFrameMs', 'event-to-next-animation-frame', nativeBudget.maximumAnimationFrameGapMs],
      ['maximumAnimationFrameGapMs', 'maximum-animation-frame-gap', nativeBudget.maximumAnimationFrameGapMs],
      ['firstSubmissionDelayMs', 'first-submission-delay', nativeBudget.maximumFirstSubmissionDelayMs],
      ['firstCompletionDelayMs', 'first-completion-delay', nativeBudget.maximumFirstCompletionDelayMs],
    ] as const) {
      expect(frameActionBudgetFailures(nativeBudget, {
        ...nativeMeasurement,
        [field]: maximum,
      }), `${field} exact native boundary`).toEqual([`${failureLabel}:${maximum}>=${maximum}`]);
    }
  });

  it('keeps the native action sample floor while allowing the 350ms software-CI window to be observed', () => {
    expect(MINIMUM_NATIVE_ACTION_FRAME_SAMPLES).toBe(10);
    expect(MINIMUM_SOFTWARE_CI_ACTION_FRAME_SAMPLES).toBe(2);
    expect(minimumActionFrameSamples(NATIVE_NO_FREEZE_FRAME_ACTION_MODE)).toBe(10);
    expect(minimumActionFrameSamples(SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE)).toBe(2);
  });

  it('admits the observed two-frame software baseline without weakening the ten-frame native floor', () => {
    const sparseSoftwareWindowsBaseline = baseline([633, 516], 1_149);
    const softwareBudget = deriveFrameActionBudget(
      sparseSoftwareWindowsBaseline,
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
    );

    expect(sparseSoftwareWindowsBaseline.observationMs).toBeGreaterThanOrEqual(BASELINE_OBSERVATION_MS);
    expect(sparseSoftwareWindowsBaseline.observationMs).toBeLessThan(BASELINE_CAPTURE_DEADLINE_MS);
    expect(sparseSoftwareWindowsBaseline.frameSamples)
      .toBe(minimumActionFrameSamples(SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE));
    expect(softwareBudget).toMatchObject({
      evidenceMode: SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
      releaseAcceptanceModeEligible: false,
      referenceBaselineMs: 633,
    });
    expect(() => deriveFrameActionBudget(
      sparseSoftwareWindowsBaseline,
      NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
    )).toThrow('synthetic-baseline has an incomplete frame sample set');
    expect(() => deriveFrameActionBudget(
      baseline([633], 633),
      SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
    )).toThrow('synthetic-baseline has an incomplete frame sample set');
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
