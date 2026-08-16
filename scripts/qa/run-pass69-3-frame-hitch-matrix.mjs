import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4551' }),
  'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4552' }),
});
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 69.3 frame-hitch target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const artifactBase = resolve(root, 'artifacts/pass69-3/frame-hitch');
const rendererArtifacts = resolve(artifactBase, target.renderer);
const receiptPath = resolve(artifactBase, `receipt-${target.renderer}.json`);
mkdirSync(artifactBase, { recursive: true });
rmSync(rendererArtifacts, { recursive: true, force: true });
rmSync(receiptPath, { force: true });

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function discardEvidence(message) {
  rmSync(rendererArtifacts, { recursive: true, force: true });
  rmSync(receiptPath, { force: true });
  throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readReceipt(kind) {
  const path = resolve(rendererArtifacts, `${kind}.json`);
  try {
    return { path, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    discardEvidence(`Pass 69.3 ${targetName} did not emit readable ${kind} evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function finite(value) {
  return Number.isFinite(value);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function hardwareRuntimeValid(runtime, contextLifecycle, webgl) {
  if (runtime?.requestedBackend !== target.renderer
    || runtime.actualBackend !== target.renderer
    || runtime.initialized !== true
    || runtime.failClosed !== false
    || runtime.softwareAdapter !== false
    || runtime.deviceLost !== false
    || runtime.uncapturedErrors !== 0
    || typeof runtime.adapterLabel !== 'string'
    || runtime.adapterLabel.trim().length === 0
    || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu.test(runtime.adapterLabel)) return false;
  if (target.renderer === 'webgpu') {
    return runtime.adapterClass === 'GPUAdapter'
      && runtime.deviceClass === 'GPUDevice'
      && runtime.presentation?.status === 'healthy'
      && webgl === null;
  }
  return runtime.adapterClass === 'WebGL2RenderingContext'
    && runtime.presentation?.status === 'synchronous'
    && /ANGLE/iu.test(runtime.adapterLabel)
    && contextLifecycle?.lost === false
    && contextLifecycle.losses === 0
    && contextLifecycle.restorations === 0
    && webgl?.adapterClass === 'WebGL2RenderingContext'
    && webgl.unmaskedRenderer === runtime.adapterLabel
    && typeof webgl.version === 'string'
    && /WebGL 2/iu.test(webgl.version)
    && !/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu.test(
      `${webgl.unmaskedVendor ?? ''} ${webgl.unmaskedRenderer ?? ''}`,
    );
}

function componentEnvelopeValid(receipt, kind, expectedMap, sourceSha) {
  const expectedScopes = {
    'glass-m14': 'cold-carbine-empty-sky-plus-cold-and-warm-window-breach-plus-m14-event-to-presented-frame',
    flamethrower: 'cold-equip-ready-and-held-flamethrower-emission-ground-fire-and-release-frame-pacing',
    'flare-gun': 'cold-equip-ready-flare-flight-impact-burn-and-auto-reload-frame-pacing',
  };
  return receipt?.schemaVersion === 1
    && receipt.status === 'PASS'
    && receipt.contract === 'atomic-acres/pass69-3-frame-hitch-evidence@1'
    && receipt.evidenceKind === kind
    && receipt.evidenceScope === expectedScopes[kind]
    && receipt.target === targetName
    && receipt.sourceSha === sourceSha
    && receipt.endingSourceSha === sourceSha
    && receipt.cleanSource === true
    && receipt.renderer === target.renderer
    && receipt.renderProfile === 'blender'
    && receipt.map === expectedMap
    && receipt.browser?.project === 'chromium'
    && receipt.browser?.channel === 'msedge'
    && /Edg\//u.test(receipt.browser?.userAgent ?? '')
    && receipt.servedCandidate?.schemaVersion === 4
    && receipt.servedCandidate.channel === 'the-big-one'
    && receipt.servedCandidate.releasePass === 'PASS 69'
    && receipt.servedCandidate.path === 'channels/the-big-one'
    && receipt.servedCandidate.sourceSha === sourceSha
    && /^[a-f0-9]{64}$/u.test(receipt.servedCandidate?.treeSha256 ?? '')
    && Number.isSafeInteger(receipt.servedCandidate?.exactRootFileCount)
    && receipt.servedCandidate.exactRootFileCount >= 2
    && hardwareRuntimeValid(receipt.runtimeBefore, receipt.contextLifecycleBefore, receipt.webglBefore)
    && hardwareRuntimeValid(receipt.runtimeAfter, receipt.contextLifecycleAfter, receipt.webglAfter)
    && receipt.runtimeErrorVisibleBefore === false
    && receipt.runtimeErrorVisibleAfter === false
    && Array.isArray(receipt.browserErrors)
    && receipt.browserErrors.length === 0;
}

function thresholdsValid(thresholds, sustained) {
  return thresholds?.maximumEventToPresentedFrameMs === 120
    && thresholds.maximumSynchronousActionMs === 50
    && thresholds.maximumRelativeMultiplier === 4
    && thresholds.maximumRelativeAllowanceMs === 40
    && (!sustained || (
      thresholds.maximumSustainedPresentedFrameGapMs === 120
      && thresholds.maximumSustainedP95Ms === 50
    ));
}

function actionProbeValid(probe, action, label) {
  return probe?.action === action
    && probe.label === label
    && finite(probe.synchronousMs) && probe.synchronousMs >= 0 && probe.synchronousMs < 50
    && finite(probe.eventToPresentedFrameMs) && probe.eventToPresentedFrameMs >= 0
    && probe.eventToPresentedFrameMs < 120
    && Number.isSafeInteger(probe.presentedFrameDelta) && probe.presentedFrameDelta > 0;
}

function m14TransitionProbeValid(probe, action, label, thermalActive) {
  const readiness = probe?.readiness;
  return actionProbeValid(probe, action, label)
    && finite(probe.readyMs) && probe.readyMs >= probe.eventToPresentedFrameMs && probe.readyMs < 5_000
    && finite(probe.maximumAnimationFrameGapMs) && probe.maximumAnimationFrameGapMs >= 0
    && probe.maximumAnimationFrameGapMs < 120
    && readiness?.requestedWeapon === 'm14-ebr'
    && readiness.ready === true
    && readiness.modelLoaded === true
    && readiness.gpuReady === true
    && readiness.resident === true
    && readiness.catalogPrewarming === false
    && readiness.importedWeapon === 'm14-ebr'
    && readiness.mountedIsRequested === true
    && readiness.assetCacheLoading === 0
    && readiness.dmrThermalActive === thermalActive
    && finite(readiness.adsProgress) && readiness.adsProgress >= 0
    && Number.isSafeInteger(readiness.dmrThermalContacts) && readiness.dmrThermalContacts >= 0
    && finite(readiness.cameraFov)
    && finite(readiness.expectedFov)
    && (!thermalActive || (
      readiness.adsProgress >= 0.9
      && readiness.dmrThermalContacts > 0
      && Math.abs(readiness.cameraFov - readiness.expectedFov) < 0.35
    ));
}

function coldFireProbeValid(probe, label) {
  return probe?.label === label
    && finite(probe.synchronousMs) && probe.synchronousMs >= 0 && probe.synchronousMs < 50
    && finite(probe.eventToPresentedFrameMs) && probe.eventToPresentedFrameMs >= 0
    && probe.eventToPresentedFrameMs < 120
    && Number.isSafeInteger(probe.presentedFrameDelta) && probe.presentedFrameDelta > 0;
}

function specialEquipProbeValid(probe, weapon, configuredSpinUpMs) {
  const readiness = probe?.readiness;
  return actionProbeValid(probe, 'acquire-training-weapon', `${weapon}-equip-ready`)
    && finite(probe.readyMs) && probe.readyMs >= probe.eventToPresentedFrameMs && probe.readyMs < 5_000
    && finite(probe.maximumAnimationFrameGapMs) && probe.maximumAnimationFrameGapMs >= 0
    && probe.maximumAnimationFrameGapMs < 120
    && readiness?.requestedWeapon === weapon
    && readiness.ready === true
    && readiness.modelLoaded === true
    && readiness.gpuReady === true
    && readiness.resident === true
    && readiness.catalogPrewarming === false
    && readiness.importedWeapon === weapon
    && readiness.mountedIsRequested === true
    && readiness.assetCacheLoading === 0
    && readiness.switchingReady === true
    && readiness.switchingRemainingMs === 0
    && readiness.configuredSpinUpMs === configuredSpinUpMs;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function percentile(sorted, quantile) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function frameWindowValid(window, label, minimumDurationMs, minimumFrames) {
  if (window?.label !== label
    || !finite(window.durationMs) || window.durationMs < minimumDurationMs
    || !Number.isSafeInteger(window.frameDelta) || window.frameDelta < minimumFrames
    || !Array.isArray(window.gapsMs) || window.gapsMs.length === 0
    || !window.gapsMs.every((gap) => finite(gap) && gap >= 0)
    || !finite(window.p50Ms) || !finite(window.p95Ms) || !finite(window.p99Ms) || !finite(window.maximumMs)
    || window.p95Ms >= 50 || window.maximumMs >= 120) return false;
  const sorted = [...window.gapsMs].sort((left, right) => left - right);
  return Math.abs(window.p50Ms - rounded(percentile(sorted, 0.5))) <= 0.001
    && Math.abs(window.p95Ms - rounded(percentile(sorted, 0.95))) <= 0.001
    && Math.abs(window.p99Ms - rounded(percentile(sorted, 0.99))) <= 0.001
    && Math.abs(window.maximumMs - rounded(sorted[sorted.length - 1])) <= 0.001;
}

const TARGET_FRAME_BUDGET_MS = 1_000 / 60;
const BASELINE_OBSERVATION_MS = 350;
const MINIMUM_BASELINE_FRAME_SAMPLES = 10;
const MAXIMUM_BASELINE_P95_FRAME_BUDGETS = 1.5;
const MAXIMUM_BASELINE_GAP_FRAME_BUDGETS = 3;
const MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS = 3;
const MINIMUM_ACTION_FRAME_BUDGETS = 2;
const MAXIMUM_ACTION_FRAME_BUDGETS = 3;
const ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS = 1;
const MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS = 2;

function frameActionBaselineValid(baseline, label) {
  if (baseline?.label !== label
    || !finite(baseline.observationMs) || baseline.observationMs < BASELINE_OBSERVATION_MS
    || !Number.isSafeInteger(baseline.frameSamples)
    || baseline.frameSamples < MINIMUM_BASELINE_FRAME_SAMPLES
    || !Array.isArray(baseline.gapsMs) || baseline.gapsMs.length !== baseline.frameSamples
    || !baseline.gapsMs.every((gap) => finite(gap) && gap >= 0)
    || !finite(baseline.p50GapMs) || !finite(baseline.p95GapMs) || !finite(baseline.maximumGapMs)
    || !finite(baseline.firstPresentedFrameDelayMs) || baseline.firstPresentedFrameDelayMs < 0
    || !finite(baseline.firstSubmissionDelayMs) || baseline.firstSubmissionDelayMs < 0
    || !finite(baseline.firstCompletionDelayMs) || baseline.firstCompletionDelayMs < 0
    || !finite(baseline.maximumPendingForMs) || baseline.maximumPendingForMs < 0
    || !['healthy', 'synchronous'].includes(baseline.presentationStatus)
    || baseline.completionFailures !== 0
    || !Number.isSafeInteger(baseline.startingPresentedFrame)
    || !Number.isSafeInteger(baseline.endingPresentedFrame)
    || baseline.endingPresentedFrame <= baseline.startingPresentedFrame
    || !Number.isSafeInteger(baseline.startingSubmissionSequence)
    || !Number.isSafeInteger(baseline.startingCompletedSequence)
    || !Number.isSafeInteger(baseline.targetSubmissionSequence)
    || !Number.isSafeInteger(baseline.endingSubmissionSequence)
    || !Number.isSafeInteger(baseline.endingCompletedSequence)
    || baseline.endingSubmissionSequence < baseline.startingSubmissionSequence
    || baseline.endingCompletedSequence < baseline.startingCompletedSequence
    || baseline.endingCompletedSequence < baseline.targetSubmissionSequence
    || baseline.p95GapMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_P95_FRAME_BUDGETS
    || baseline.maximumGapMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_GAP_FRAME_BUDGETS
    || baseline.firstCompletionDelayMs
      >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS) return false;
  const sorted = [...baseline.gapsMs].sort((left, right) => left - right);
  return Math.abs(baseline.p50GapMs - rounded(percentile(sorted, 0.5))) <= 0.001
    && Math.abs(baseline.p95GapMs - rounded(percentile(sorted, 0.95))) <= 0.001
    && Math.abs(baseline.maximumGapMs - rounded(sorted[sorted.length - 1])) <= 0.001;
}

function deriveFrameActionBudget(baseline) {
  const referenceBaselineMs = Math.max(
    baseline.p95GapMs,
    baseline.firstPresentedFrameDelayMs,
    baseline.firstSubmissionDelayMs,
    baseline.firstCompletionDelayMs,
  );
  return {
    targetFrameBudgetMs: rounded(TARGET_FRAME_BUDGET_MS),
    maximumActionMs: rounded(Math.min(
      TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS,
      Math.max(
        TARGET_FRAME_BUDGET_MS * MINIMUM_ACTION_FRAME_BUDGETS,
        referenceBaselineMs + TARGET_FRAME_BUDGET_MS * ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
      ),
    )),
    maximumSynchronousActionMs: rounded(
      TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
    ),
    referenceBaselineMs: rounded(referenceBaselineMs),
  };
}

function glassThresholdsValid(thresholds, baseline, budget) {
  return budget && typeof budget === 'object'
    && thresholds?.targetFrameBudgetMs === rounded(TARGET_FRAME_BUDGET_MS)
    && thresholds.maximumBaselineP95FrameBudgets === MAXIMUM_BASELINE_P95_FRAME_BUDGETS
    && thresholds.maximumBaselineGapFrameBudgets === MAXIMUM_BASELINE_GAP_FRAME_BUDGETS
    && thresholds.maximumBaselineCompletionFrameBudgets === MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS
    && thresholds.minimumActionFrameBudgets === MINIMUM_ACTION_FRAME_BUDGETS
    && thresholds.maximumActionFrameBudgets === MAXIMUM_ACTION_FRAME_BUDGETS
    && thresholds.actionRelativeAllowanceFrameBudgets === ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS
    && thresholds.maximumActionMs === budget.maximumActionMs
    && thresholds.maximumSynchronousActionMs === budget.maximumSynchronousActionMs
    && thresholds.maximumM14TransitionReadyMs === 5_000
    && budget.targetFrameBudgetMs === rounded(TARGET_FRAME_BUDGET_MS)
    && budget.maximumActionMs === deriveFrameActionBudget(baseline).maximumActionMs
    && budget.maximumSynchronousActionMs === deriveFrameActionBudget(baseline).maximumSynchronousActionMs
    && budget.referenceBaselineMs === deriveFrameActionBudget(baseline).referenceBaselineMs;
}

function glassActionProbeValid(probe, action, label, budget) {
  return probe?.action === action
    && probe.label === label
    && finite(probe.synchronousMs) && probe.synchronousMs >= 0
    && probe.synchronousMs < budget.maximumSynchronousActionMs
    && finite(probe.eventToPresentedFrameMs) && probe.eventToPresentedFrameMs >= 0
    && probe.eventToPresentedFrameMs < budget.maximumActionMs
    && finite(probe.eventToCompletionMs) && probe.eventToCompletionMs >= 0
    && probe.eventToCompletionMs < budget.maximumActionMs
    && finite(probe.maximumPendingForMs) && probe.maximumPendingForMs >= 0
    && probe.maximumPendingForMs < budget.maximumActionMs
    && Number.isSafeInteger(probe.presentedFrameDelta) && probe.presentedFrameDelta > 0
    && ['healthy', 'synchronous'].includes(probe.presentationStatus)
    && probe.completionFailures === 0
    && Number.isSafeInteger(probe.startingSubmissionSequence)
    && Number.isSafeInteger(probe.startingCompletedSequence)
    && Number.isSafeInteger(probe.targetSubmissionSequence)
    && Number.isSafeInteger(probe.endingSubmissionSequence)
    && Number.isSafeInteger(probe.endingCompletedSequence)
    && probe.endingSubmissionSequence >= probe.startingSubmissionSequence
    && probe.endingCompletedSequence >= probe.startingCompletedSequence
    && probe.endingCompletedSequence >= probe.targetSubmissionSequence;
}

function glassM14TransitionProbeValid(probe, action, label, thermalActive, budget) {
  const readiness = probe?.readiness;
  return glassActionProbeValid(probe, action, label, budget)
    && finite(probe.readyMs) && probe.readyMs >= probe.eventToPresentedFrameMs && probe.readyMs < 5_000
    && finite(probe.maximumAnimationFrameGapMs) && probe.maximumAnimationFrameGapMs >= 0
    && probe.maximumAnimationFrameGapMs < budget.maximumActionMs
    && readiness?.requestedWeapon === 'm14-ebr'
    && readiness.ready === true
    && readiness.modelLoaded === true
    && readiness.gpuReady === true
    && readiness.resident === true
    && readiness.catalogPrewarming === false
    && readiness.importedWeapon === 'm14-ebr'
    && readiness.mountedIsRequested === true
    && readiness.assetCacheLoading === 0
    && readiness.dmrThermalActive === thermalActive
    && finite(readiness.adsProgress) && readiness.adsProgress >= 0
    && Number.isSafeInteger(readiness.dmrThermalContacts) && readiness.dmrThermalContacts >= 0
    && finite(readiness.cameraFov)
    && finite(readiness.expectedFov)
    && (!thermalActive || (
      readiness.adsProgress >= 0.9
      && readiness.dmrThermalContacts > 0
      && Math.abs(readiness.cameraFov - readiness.expectedFov) < 0.35
    ));
}

function glassM14EvidenceValid(receipt) {
  const evidence = receipt.evidence;
  const probes = evidence?.probes;
  const frameActionBaseline = evidence?.frameActionBaseline;
  const frameActionBudget = evidence?.frameActionBudget;
  const expectedProbes = [
    ['noop', 'baseline-noop'],
    ['fire', 'cold-carbine-empty-sky'],
    ['equip-m14', 'm14-cold-equip'],
    ['ads-on', 'm14-cold-ads-on'],
    ['fire', 'm14-cold-fire'],
    ['ads-off', 'm14-ads-off'],
    ['fire', 'cold-glass-breach'],
    ['fire', 'warm-glass-breach'],
  ];
  if (!frameActionBaselineValid(frameActionBaseline, 'glass-m14-preaction-baseline')
    || !glassThresholdsValid(receipt.thresholds, frameActionBaseline, frameActionBudget)
    || evidence?.retainedGlassBefore?.pool?.contract !== 'retained-exact-instanced-render-object-v1'
    || evidence.retainedGlassBefore.pool.retained !== 6
    || evidence.retainedGlassBefore.pool.currentArenaRetained !== 6
    || evidence.retainedGlassBefore.pool.active !== 0
    || !exactArray(evidence.retainedGlassBefore.panes, [true, true, true, true, true, true])
    || evidence?.glassAfter?.coldWindowBroken !== true
    || evidence.glassAfter.warmWindowBroken !== true
    || !Array.isArray(probes) || probes.length !== expectedProbes.length
    || !probes.every((probe, index) => glassActionProbeValid(
      probe, expectedProbes[index][0], expectedProbes[index][1], frameActionBudget,
    ))
    || !glassM14TransitionProbeValid(
      probes[2], 'equip-m14', 'm14-cold-equip', false, frameActionBudget,
    )
    || !glassM14TransitionProbeValid(
      probes[3], 'ads-on', 'm14-cold-ads-on', true, frameActionBudget,
    )) return false;
  return true;
}

function flamethrowerEvidenceValid(receipt) {
  const evidence = receipt.evidence;
  const baseline = evidence?.baseline;
  const equipProbe = evidence?.equipProbe;
  const probe = evidence?.probe;
  const releaseProbe = evidence?.releaseProbe;
  const clearance = evidence?.clearance;
  return thresholdsValid(receipt.thresholds, true)
    && frameWindowValid(baseline, 'flamethrower-baseline', 750, 20)
    && specialEquipProbeValid(equipProbe, 'flamethrower', 180)
    && equipProbe.eventToPresentedFrameMs < baseline.p95Ms * 4 + 40
    && equipProbe.maximumAnimationFrameGapMs < baseline.p95Ms * 4 + 40
    && probe?.label === 'flamethrower-held-fire'
    && finite(probe.durationMs) && probe.durationMs >= 2_000
    && finite(probe.synchronousMs) && probe.synchronousMs >= 0 && probe.synchronousMs < 50
    && finite(probe.triggerToPresentedFrameMs) && probe.triggerToPresentedFrameMs >= 0
    && probe.triggerToPresentedFrameMs < 120
    && finite(probe.firstEmissionObservedAfterTriggerMs) && probe.firstEmissionObservedAfterTriggerMs >= 0
    && finite(probe.firstEmissionContainingFrameGapMs) && probe.firstEmissionContainingFrameGapMs >= 0
    && probe.firstEmissionContainingFrameGapMs < 120
    && frameWindowValid(probe.frameWindow, 'flamethrower-held-fire', 2_000, 50)
    && probe.frameWindow.maximumMs < baseline.p95Ms * 4 + 40
    && Number.isSafeInteger(probe.emissions) && probe.emissions >= 8
    && probe.softwarePresentationBudget === false
    && probe.particlesPerEmission === 4
    && probe.particlesSpawned === probe.emissions * 4
    && probe.maximumActive > 0
    && probe.groundFireActive > 0
    && probe.poolExhaustions === 0
    && coldFireProbeValid(releaseProbe, 'flamethrower-release-clearance')
    && clearance?.fastPathActive === false
    && clearance.armNearPlaneClear === true
    && clearance.weaponNearPlaneClear === true
    && clearance.prewarmChecks >= 1
    && clearance.entryTransitions >= 1
    && clearance.exitTransitions >= 1
    && clearance.skippedFrames >= 20;
}

function flareEvidenceValid(receipt) {
  const evidence = receipt.evidence;
  const before = evidence?.before;
  const after = evidence?.after;
  const effect = evidence?.effectTelemetry;
  const impactStage = evidence?.impactStage;
  const equipProbe = evidence?.equipProbe;
  return thresholdsValid(receipt.thresholds, true)
    && frameWindowValid(evidence?.baseline, 'flare-gun-baseline', 750, 20)
    && specialEquipProbeValid(equipProbe, 'flare-gun', 0)
    && equipProbe.eventToPresentedFrameMs < evidence.baseline.p95Ms * 4 + 40
    && equipProbe.maximumAnimationFrameGapMs < evidence.baseline.p95Ms * 4 + 40
    && coldFireProbeValid(evidence?.coldFire, 'flare-gun-cold-fire')
    && frameWindowValid(evidence?.sustained, 'flare-gun-impact-and-burn-lifecycle', 1_200, 20)
    && evidence.autoReloadObserved === true
    && finite(evidence.reloadStartedAfterFireMs) && evidence.reloadStartedAfterFireMs >= 0
    && evidence.reloadStartedAfterFireMs < evidence.sustained.durationMs
    && evidence.sustained.maximumMs < evidence.baseline.p95Ms * 4 + 40
    && typeof impactStage?.targetId === 'string' && impactStage.targetId.length > 0
    && Array.isArray(impactStage.playerPosition) && impactStage.playerPosition.length === 3
    && impactStage.playerPosition.every(finite)
    && Array.isArray(impactStage.targetPosition) && impactStage.targetPosition.length === 3
    && impactStage.targetPosition.every(finite)
    && finite(impactStage.yaw) && finite(impactStage.pitch)
    && finite(impactStage.distanceM) && impactStage.distanceM > 0
    && effect?.spawnCountDelta === after?.spawnCount - before?.spawnCount
    && effect.spawnCountDelta === 1
    && effect.impactCountDelta === after.impactCount - before.impactCount
    && effect.impactCountDelta > 0
    && effect.burnPulseCountDelta === after.burnPulseCount - before.burnPulseCount
    && effect.burnPulseCountDelta > 0
    && effect.activeAfterWindow === after.active
    && effect.flyingAfterWindow === after.flying
    && effect.burningAfterWindow === after.burning
    && after.flying + after.burning === after.active
    && effect.poolExhaustionsDelta === after.poolExhaustions - before.poolExhaustions
    && effect.poolExhaustionsDelta === 0;
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) {
  discardEvidence(`Pass 69.3 frame-hitch rejects local Vite environment overrides: ${localViteOverrides.join(', ')}`);
}
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 69.3 frame-hitch requires one completely clean source SHA');
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass69-3-glass-m14-frame-hitch.spec.ts',
  'tests/e2e/pass69-3-special-weapon-frame-hitch.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: 'PASS 69',
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_INSTALLED_EDGE: '1',
    QA_PREVIEW_PORT: target.port,
    PASS69_3_FRAME_HITCH_RENDERER: target.renderer,
    PASS69_3_FRAME_HITCH_RENDER_PROFILE: 'blender',
    PASS69_3_FRAME_HITCH_SOURCE_SHA: sourceSha,
    PASS69_3_FRAME_HITCH_TARGET: targetName,
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 69.3 ${targetName} frame-hitch failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 69.3 ${targetName} frame-hitch terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) discardEvidence(`Pass 69.3 ${targetName} frame-hitch failed with exit ${result.status ?? 1}`);

const components = Object.freeze({
  'glass-m14': readReceipt('glass-m14'),
  flamethrower: readReceipt('flamethrower'),
  'flare-gun': readReceipt('flare-gun'),
});
if (!componentEnvelopeValid(components['glass-m14'].value, 'glass-m14', 'atomic-acres', sourceSha)
  || !glassM14EvidenceValid(components['glass-m14'].value)
  || !componentEnvelopeValid(components.flamethrower.value, 'flamethrower', 'gun-range', sourceSha)
  || !flamethrowerEvidenceValid(components.flamethrower.value)
  || !componentEnvelopeValid(components['flare-gun'].value, 'flare-gun', 'gun-range', sourceSha)
  || !flareEvidenceValid(components['flare-gun'].value)) {
  discardEvidence(`Pass 69.3 ${targetName} frame-hitch emitted invalid, incomplete, or weakened evidence`);
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 69.3 ${targetName} frame-hitch source drifted during verification (${sourceSha} -> ${endingSha})`);
}

writeFileSync(receiptPath, `${JSON.stringify({
  schemaVersion: 1,
  status: 'PASS',
  contract: 'atomic-acres/pass69-3-frame-hitch-matrix@1',
  target: targetName,
  renderer: target.renderer,
  renderProfile: 'blender',
  sourceSha,
  endingSourceSha: endingSha,
  cleanSource: true,
  browser: { project: 'chromium', channel: 'msedge' },
  isolatedPreviewPort: Number(target.port),
  components: Object.fromEntries(Object.entries(components).map(([kind, component]) => [kind, {
    path: component.path.replaceAll('\\', '/').slice(root.replaceAll('\\', '/').length + 1),
    sha256: sha256(component.path),
  }])),
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  pass69_3FrameHitch: 'PASS',
  target: targetName,
  sourceSha,
  receiptPath,
}, null, 2));
