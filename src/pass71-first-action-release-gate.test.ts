import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const grenadeSpec = readFileSync('tests/e2e/pass71-grenade-first-action.spec.ts', 'utf8');
const glassSpec = readFileSync('tests/e2e/pass69-3-glass-m14-frame-hitch.spec.ts', 'utf8');
const actionBudget = readFileSync('tests/e2e/frame-action-budget.ts', 'utf8');
const boundedRunner = readFileSync('scripts/qa/run-bounded-e2e.mjs', 'utf8');
const impactClassifier = readFileSync('scripts/release/change-impact.mjs', 'utf8');
const pipelineGuard = readFileSync('scripts/release/pipeline-guard.mjs', 'utf8');
const verifyWorkflow = readFileSync('.github/workflows/verify.yml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release-production.yml', 'utf8');
const topologyStaging = readFileSync('scripts/release/stage-release-topology.mjs', 'utf8');
const topologyVerifier = readFileSync('scripts/qa/verify-release-topology.mjs', 'utf8');
const releaseChannels = JSON.parse(readFileSync('release-channels.json', 'utf8'));

describe('Pass 71 first-action and protected-release gate', () => {
  it('derives a strict action envelope from a healthy completed-frame baseline', () => {
    for (const token of [
      'TARGET_FRAME_BUDGET_MS = 1_000 / 60',
      'BASELINE_OBSERVATION_MS = 350',
      'MINIMUM_BASELINE_FRAME_SAMPLES = 10',
      'MAXIMUM_BASELINE_P95_FRAME_BUDGETS = 1.5',
      'MAXIMUM_BASELINE_GAP_FRAME_BUDGETS = 3',
      'MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS = 3',
      'MINIMUM_ACTION_FRAME_BUDGETS = 2',
      'MAXIMUM_ACTION_FRAME_BUDGETS = 3',
      'ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS = 1',
      'endingCompletedSequence < baseline.targetSubmissionSequence',
      'baseline.p95GapMs >= maximumBaselineP95Ms',
      'baseline.maximumGapMs >= maximumBaselineGapMs',
      'baseline.firstCompletionDelayMs >= maximumBaselineCompletionMs',
    ]) expect(actionBudget).toContain(token);
    expect(actionBudget).toContain('Math.min(');
    expect(actionBudget).toContain('referenceBaselineMs + TARGET_FRAME_BUDGET_MS');
  });

  it('applies the completed-frontier envelope to cold and warm grenade actions', () => {
    expect(grenadeSpec).toContain('captureFrameActionBaseline(page, baselineLabel)');
    expect(grenadeSpec).toContain('deriveFrameActionBudget(frameActionBaseline)');
    expect(grenadeSpec).toContain('`${grenade}-cold-preaction-baseline`');
    expect(grenadeSpec).toContain('`${grenade}-warm-preaction-baseline`');
    expect(grenadeSpec).toContain('profile.firstCompletionDelayMs!');
    expect(grenadeSpec).toContain('profile.maximumPendingForMs');
    expect(grenadeSpec).toContain('frameActionBudget.maximumActionMs');
    expect(grenadeSpec).toContain('frameActionBudget.maximumSynchronousActionMs');
    expect(grenadeSpec).not.toContain('MAX_FIRST_PRESENTATION_MS');
    expect(grenadeSpec).not.toContain('MAX_OBSERVATION_FRAME_GAP_MS');
    expect(grenadeSpec).not.toContain('MAX_COMPLETION_MS');
  });

  it('applies the same strict frontier to first glass breach and M14 transitions', () => {
    expect(glassSpec).toContain("captureFrameActionBaseline(page, 'glass-m14-preaction-baseline')");
    expect(glassSpec).toContain('probe.eventToCompletionMs');
    expect(glassSpec).toContain('probe.maximumPendingForMs');
    expect(glassSpec).toContain('probe.endingCompletedSequence');
    expect(glassSpec).toContain('budget.maximumActionMs');
    expect(glassSpec).not.toContain('baseline.eventToPresentedFrameMs * 4 + 40');
  });

  it('makes grenade, glass lifecycle, Nuke and Chopper coverage required full-impact shards', () => {
    for (const group of [
      'pass71-grenade-first-action',
      'pass71-glass-lifecycle',
      'pass71-nuke-warning',
      'pass70-chopper-gunner',
    ]) expect(boundedRunner).toContain(`name: '${group}'`);
    expect(impactClassifier).toContain("windows_supplemental_groups: 'pass71-grenade-first-action,pass70-chopper-gunner'");
    expect(impactClassifier).toContain("linux_supplemental_groups: 'pass71-glass-lifecycle,pass71-nuke-warning'");
    expect(verifyWorkflow).toContain('bounded-browser-windows-supplemental:');
    expect(verifyWorkflow).toContain('bounded-browser-linux-supplemental:');
    expect(verifyWorkflow).toContain('bounded-browser-linux-supplemental, bounded-browser-windows-supplemental');
    expect(verifyWorkflow).toContain('requirements-acceptance:\n    needs: [classify-change, static-and-unit, bounded-browser-linux-supplemental, bounded-browser-windows-supplemental]\n    if: always()');
    expect(verifyWorkflow).toContain('WINDOWS_SUPPLEMENTAL_RESULT: ${{ needs.bounded-browser-windows-supplemental.result }}');
    expect(verifyWorkflow).toContain('LINUX_SUPPLEMENTAL_RESULT: ${{ needs.bounded-browser-linux-supplemental.result }}');
    expect(verifyWorkflow).toContain('required Windows supplemental groups ($WINDOWS_SUPPLEMENTAL_GROUPS) concluded $WINDOWS_SUPPLEMENTAL_RESULT');
    expect(verifyWorkflow).toContain('required Linux supplemental groups ($LINUX_SUPPLEMENTAL_GROUPS) concluded $LINUX_SUPPLEMENTAL_RESULT');
    expect(verifyWorkflow).toContain('empty Windows supplemental groups unexpectedly concluded $WINDOWS_SUPPLEMENTAL_RESULT');
    expect(verifyWorkflow).toContain('empty Linux supplemental groups unexpectedly concluded $LINUX_SUPPLEMENTAL_RESULT');
    expect(pipelineGuard).toContain("'bounded-browser-linux-supplemental'");
    expect(pipelineGuard).toContain("'bounded-browser-windows-supplemental'");
  });

  it('stages Pass 63 from one configured Pages subtree without rebuilding historical source', () => {
    expect(releaseChannels.rollback).toMatchObject({
      pass: 'PASS 63',
      sourceSha: 'ac85e9b8b46cc2370aee903d564ecf3c4682b24c',
      pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c',
      pagesPath: 'channels/pass63-rollback',
      runtimeFileCount: 119,
      runtimeTreeSha256: 'b7416e02c190d8ff0403a65cd7a7c894970507bc6a8de7b196cc2d7979d69bce',
      path: 'channels/pass63-rollback',
    });
    expect(topologyStaging).toContain("stagePinned('rollback', config.rollback)");
    expect(topologyStaging).not.toContain('RELEASE_ROLLBACK_DIST');
    expect(topologyStaging).not.toContain('PASS63_PREVIEW_PIN');
    expect(topologyVerifier).toContain('const rollbackFiles = verifyPinned(config.rollback)');
    expect(topologyVerifier).toContain('rollbackFiles !== config.rollback.runtimeFileCount + 1');
    expect(topologyVerifier).toContain('rollbackWrapper.pagesSha !== config.rollback.pagesSha');
    expect(releaseWorkflow).toContain('ROLLBACK_PAGES_SHA=$(node -e');
    expect(releaseWorkflow).not.toContain('pass63-rollback-src');
  });
});
