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
      'MINIMUM_NATIVE_ACTION_FRAME_SAMPLES = MINIMUM_BASELINE_FRAME_SAMPLES',
      'MINIMUM_SOFTWARE_CI_ACTION_FRAME_SAMPLES = 2',
      'BASELINE_CAPTURE_DEADLINE_MS = 2_000',
      'MAXIMUM_BASELINE_P95_FRAME_BUDGETS = 1.5',
      'MAXIMUM_BASELINE_GAP_FRAME_BUDGETS = 3',
      'MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS = 3',
      'MINIMUM_ACTION_FRAME_BUDGETS = 2',
      'MAXIMUM_ACTION_FRAME_BUDGETS = 3',
      'ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS = 1',
      "NATIVE_NO_FREEZE_FRAME_ACTION_MODE = 'native-no-freeze'",
      "SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE = 'software-ci-semantic'",
      'REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE = NATIVE_NO_FREEZE_FRAME_ACTION_MODE',
      'endingCompletedSequence < baseline.targetSubmissionSequence',
      'baseline.p95GapMs >= maximumBaselineP95Ms',
      'baseline.maximumGapMs >= maximumBaselineGapMs',
      'baseline.firstCompletionDelayMs >= maximumBaselineCompletionMs',
      'gapsMs.length >= minimumFrameSamples',
      'minimumFrameSamples: MINIMUM_BASELINE_FRAME_SAMPLES',
      'captureDeadlineMs: BASELINE_CAPTURE_DEADLINE_MS',
      'const complete = now < deadline',
      'identity.evidenceMode !== REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE',
      'identity.checkoutSourceSha !== identity.expectedSourceSha',
      'identity.servedSourceSha !== identity.expectedSourceSha',
      "identity.renderer !== 'webgpu'",
      "identity.browserChannel !== 'msedge'",
      'identity.softwareAdapter !== false',
      "throw new Error('software-ci-semantic frame-action evidence is CI-only')",
    ]) expect(actionBudget).toContain(token);
    expect(actionBudget).toContain('Math.min(');
    expect(actionBudget).toContain('referenceBaselineMs + TARGET_FRAME_BUDGET_MS');
    expect(actionBudget).toContain('baseline.maximumGapMs + relativeAllowanceMs');
    expect(actionBudget).toContain('baseline.firstSubmissionDelayMs + relativeAllowanceMs');
    expect(actionBudget).toContain('baseline.firstCompletionDelayMs + relativeAllowanceMs');
    expect(actionBudget).toContain('baseline.maximumPendingForMs + relativeAllowanceMs');
    expect(actionBudget).toContain('TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS');
    expect(actionBudget).toContain('TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS');
  });

  it('applies the completed-frontier envelope to cold and warm grenade actions', () => {
    expect(grenadeSpec).toContain('captureFrameActionBaseline(page, baselineLabel)');
    expect(grenadeSpec).toContain('deriveFrameActionBudget(frameActionBaseline, evidenceMode)');
    expect(grenadeSpec).toContain("assertFrameActionEvidenceEnvironment(evidenceMode, process.env.CI === 'true')");
    expect(grenadeSpec).toContain('`${grenade}-cold-preaction-baseline`');
    expect(grenadeSpec).toContain('`${grenade}-warm-preaction-baseline`');
    expect(grenadeSpec).toContain('profile.firstCompletionDelayMs!');
    expect(grenadeSpec).toContain('profile.maximumPendingForMs');
    expect(grenadeSpec).toContain('maximumSynchronousActionMs: Number((TARGET_FRAME_BUDGET_MS * 2).toFixed(3))');
    expect(grenadeSpec).toContain('maximumFrameWorkMs: profile.maximumFrameWorkMs');
    expect(grenadeSpec).toContain('maximumAnimationFrameGapMs: profile.maximumAnimationFrameGapMs');
    expect(grenadeSpec).toContain('firstCompletionDelayMs: profile.firstCompletionDelayMs!');
    expect(grenadeSpec).toContain('frameActionBudgetFailures(frameActionBudget');
    expect(grenadeSpec).toContain('minimumActionFrameSamples(evidenceMode)');
    expect(grenadeSpec).toContain('const cold = await throwAndObserve(page, `${grenade}-cold-preaction-baseline`)');
    expect(grenadeSpec).toContain('const warm = await throwAndObserve(page, `${grenade}-warm-preaction-baseline`)');
    expect(grenadeSpec).toContain("'software-CI action-overhead semantics only; not hardware no-freeze evidence'");
    expect(grenadeSpec).toContain('frameActionReleaseAcceptanceEligible(');
    expect(grenadeSpec).toContain('exactExpectedCheckoutAndServedSourceShaRequired: true');
    expect(grenadeSpec).toContain('actionFrameSamples: {');
    expect(grenadeSpec).toContain("expect(runtime.softwareAdapter, `${evidence}: software-CI provenance`).toBe(true)");
    expect(grenadeSpec).toContain("expect(renderer, `${evidence}: software-CI semantics are WebGL2-only`).toBe('webgl2')");
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
      'pass71-glass-quality-matrix',
      'pass71-glass-quality-flare',
      'pass71-glass-quality-crossbow',
      'pass71-glass-performance-matrix',
      'pass71-glass-performance-flare',
      'pass71-glass-performance-crossbow',
      'pass71-nuke-warning',
      'pass70-chopper-gunner',
    ]) expect(boundedRunner).toContain(`name: '${group}'`);
    for (const [group, title] of [
      ['pass71-glass-quality-matrix', 'quality: all six authored panes'],
      ['pass71-glass-quality-flare', 'quality: real Flare Gun impacts'],
      ['pass71-glass-quality-crossbow', 'quality: real explosive-crossbow impact'],
      ['pass71-glass-performance-matrix', 'performance: all six authored panes'],
      ['pass71-glass-performance-flare', 'performance: real Flare Gun impacts'],
      ['pass71-glass-performance-crossbow', 'performance: real explosive-crossbow impact'],
    ]) {
      const line = boundedRunner.match(new RegExp(`name: '${group}'[^\\n]+`, 'u'))?.[0] ?? '';
      expect(line).toContain('timeoutMs: 360_000');
      expect(line).toContain("'tests/e2e/pass71-glass-lifecycle-matrix.spec.ts'");
      expect(line).toContain("'--workers=1'");
      expect(line).toContain("'--grep'");
      expect(line).toContain(`'${title}'`);
    }
    expect(boundedRunner).toContain("stdio: 'inherit'");
    expect(boundedRunner).toContain('windowsHide: true');
    expect(boundedRunner).not.toContain("encoding: 'utf8'");
    expect(boundedRunner).not.toContain('result.stdout');
    expect(boundedRunner).not.toContain('result.stderr');
    const grenadeGroup = boundedRunner.match(/name: 'pass71-grenade-first-action'[^\n]+/u)?.[0] ?? '';
    expect(grenadeGroup).toContain('timeoutMs: 600_000');
    expect(grenadeGroup).toContain("'tests/e2e/pass71-grenade-first-action.spec.ts'");
    const chopperGroup = boundedRunner.match(/name: 'pass70-chopper-gunner'[^\n]+/u)?.[0] ?? '';
    expect(chopperGroup).toContain('timeoutMs: 420_000');
    expect(chopperGroup).toContain("'tests/e2e/pass70-chopper-gunner.spec.ts'");
    expect(chopperGroup).toContain("'tests/e2e/pass71-controlled-support-native.spec.ts'");
    expect(impactClassifier).toContain("windows_supplemental_groups: 'pass71-grenade-first-action,pass70-chopper-gunner'");
    expect(impactClassifier).toContain("linux_supplemental_groups: 'pass71-glass-quality-matrix,pass71-glass-quality-flare,pass71-glass-quality-crossbow,pass71-glass-performance-matrix,pass71-glass-performance-flare,pass71-glass-performance-crossbow,pass71-nuke-warning'");
    expect(verifyWorkflow).toContain('bounded-browser-windows-supplemental-shard:');
    const grenadeWorkflowStep = verifyWorkflow.match(
      /- name: Run Pass 71 Windows software-CI semantic grenade shard[\s\S]+?run: npm run test:e2e:bounded/u,
    )?.[0] ?? '';
    expect(grenadeWorkflowStep).toContain("if: matrix.group == 'pass71-grenade-first-action'");
    expect(grenadeWorkflowStep).toContain('PASS71_GRENADE_EVIDENCE_MODE: software-ci-semantic');
    expect(grenadeWorkflowStep).not.toContain('PASS71_GRENADE_EVIDENCE_MODE: native-no-freeze');
    expect(grenadeWorkflowStep).not.toContain('PASS71_GRENADE_RENDERER: webgpu');
    expect(grenadeWorkflowStep).not.toContain('QA_INSTALLED_EDGE');
    expect(releaseWorkflow).not.toContain('software-ci-semantic');
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
