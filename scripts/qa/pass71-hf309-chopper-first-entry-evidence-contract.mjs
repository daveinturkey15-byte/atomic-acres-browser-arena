import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-309',
  kind: 'pass71-hf309-chopper-first-entry-native',
  contract: 'atomic-acres/pass71-hf309-chopper-first-entry-native@1',
  feedbackId: 'HF-309',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
  ownerSubjectiveApproval: 'not-claimed',
});

export const PASS71_HF309_CHOPPER_FIRST_ENTRY_DESCRIPTOR = Object.freeze({
  evidenceId: 'HF-309',
  kind: PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF309_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF309_REQUIRED_CHOPPER_ASSETS = Object.freeze([
  './assets/original/models/support/pass65-chopper-gunner-lod0.glb',
  './assets/original/models/support/pass65-chopper-gunner-lod1.glb',
  './assets/original/models/support/pass65-chopper-gunner-lod2.glb',
]);
export const PASS71_HF309_EXPECTED_SUPPORT_ASSETS = Object.freeze([
  './assets/original/models/support/pass65-care-aircraft-lod0.glb',
  './assets/original/models/support/pass65-care-aircraft-lod1.glb',
  './assets/original/models/support/pass65-care-aircraft-lod2.glb',
  './assets/original/models/support/pass65-care-crate-lod0.glb',
  './assets/original/models/support/pass65-care-crate-lod1.glb',
  './assets/original/models/support/pass65-carpet-aircraft-lod0.glb',
  './assets/original/models/support/pass65-carpet-aircraft-lod1.glb',
  './assets/original/models/support/pass65-carpet-aircraft-lod2.glb',
  ...PASS71_HF309_REQUIRED_CHOPPER_ASSETS,
].sort());
export const PASS71_HF309_REQUIRED_CHOPPER_ACTIONS = Object.freeze([
  'Chopper_Gun_Fire',
  'Chopper_Gun_Recoil',
  'Chopper_Impact_Pulse',
  'Chopper_Main_Rotor_Loop',
  'Chopper_Muzzle_Flash',
  'Chopper_Quiet_Loop',
  'Chopper_Tail_Rotor_Loop',
  'Chopper_Tracer_Pulse',
]);
export const PASS71_HF309_TOOLING_PATHS = Object.freeze([
  'src/killstreak-presentation.ts',
  'src/audio.ts',
  'src/legacy-main.ts',
  'src/ui/pass64-shell.ts',
  'src/presentation-prewarm-contract.test.ts',
  'src/pass71-hf309-chopper-first-entry-release-evidence.test.ts',
  'tests/e2e/frame-action-budget.ts',
  'tests/e2e/pass71-hf309-chopper-first-entry.spec.ts',
  'scripts/qa/pass71-hf309-chopper-first-entry-evidence-contract.mjs',
  'scripts/qa/pass71-hf309-chopper-first-entry-evidence-contract.d.mts',
  'scripts/qa/pass71-hf309-chopper-first-entry-evidence-contract.test.mjs',
  'scripts/qa/run-pass71-hf309-chopper-first-entry-evidence.mjs',
  'scripts/qa/pass71-edge-executable-identity.mjs',
  'scripts/qa/run-playwright-with-topology.mjs',
  'scripts/release/stage-release-topology.mjs',
  'playwright.config.ts',
  'release-channels.json',
  'package.json',
  'package-lock.json',
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SOFTWARE = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const TARGET_FRAME_BUDGET_MS = 1_000 / 60;
const MINIMUM_ACTION_FRAME_BUDGETS = 2;
const MAXIMUM_ACTION_FRAME_BUDGETS = 3;
const ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS = 1;
const MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS = 2;
const MAXIMUM_BASELINE_P95_FRAME_BUDGETS = 1.5;
const MAXIMUM_BASELINE_GAP_FRAME_BUDGETS = 3;
const MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS = 3;
const EXPECTED_FAMILIES = Object.freeze(['care', 'carpet', 'chopper', 'crate']);
const EXPECTED_SUPPORT_TEXTURE_SIGNATURE = Object.freeze([
  5, 39, 39, 39, 0, 6_990_500, 54_525_900,
]);
const EXPECTED_WEBGPU_PREWARM_GROUPS = Object.freeze([
  'tracers-impacts',
  'explosions',
  'death-drops-glass',
  'world-ordnance',
  'nuke-overdrive-bolts',
  'smoke-volumes',
  'bot-world-weapons',
  'flare-first-shot',
  'flamethrower-first-shot',
  'killstreak-vocabulary',
]);

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys, label, failures) {
  if (!object(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function finite(value, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function safeInteger(value, minimum = Number.MIN_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function iso(value) {
  return typeof value === 'string' && ISO.test(value) && new Date(value).toISOString() === value;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function pass71Hf309RecordSha256(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return sha256(Buffer.from(canonicalJson(unsigned), 'utf8'));
}

export function pass71Hf309ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-309 tooling source must be a full SHA');
  return PASS71_HF309_TOOLING_PATHS.map((path) => ({
    path,
    sha256: sha256(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )),
  }));
}

function sourceTreeAt(repositoryRoot, sourceSha) {
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function expectedBudget(baseline) {
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
  const nativeThreshold = rounded(maximumActionMs);
  return {
    evidenceMode: 'native-no-freeze',
    releaseAcceptanceModeEligible: true,
    targetFrameBudgetMs: rounded(TARGET_FRAME_BUDGET_MS),
    maximumActionMs: nativeThreshold,
    maximumSynchronousActionMs: rounded(
      TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
    ),
    maximumFrameWorkMs: nativeThreshold,
    maximumAnimationFrameGapMs: nativeThreshold,
    maximumFirstSubmissionDelayMs: nativeThreshold,
    maximumFirstCompletionDelayMs: nativeThreshold,
    maximumPendingForMs: nativeThreshold,
    referenceBaselineMs: rounded(referenceBaselineMs),
  };
}

function validateKeyEvent(event, label, failures) {
  exactKeys(event, ['code', 'key', 'isTrusted', 'repeat', 'atMs'], label, failures);
  if (event?.code !== 'Digit6' || event?.key !== '6' || event?.isTrusted !== true
    || event?.repeat !== false || !finite(event?.atMs, 0)) failures.push(`${label}:trusted-slot-input`);
}

function validateResourceSignature(signature, label, failures) {
  exactKeys(signature, [
    'supportAssets', 'supportFamilies', 'supportTextureCounts', 'poolCounts',
    'pooledChopperActions', 'rotorOwnedResources', 'audioRetainedSources',
    'audioSpatialChains', 'hudNodeCount', 'hudIdentityToken',
    'rendererPrewarmGeneration', 'rendererPrewarmGroups',
  ], label, failures);
  const exactRendererPrewarm = (signature?.rendererPrewarmGeneration === null
      && same(signature?.rendererPrewarmGroups, []))
    || (safeInteger(signature?.rendererPrewarmGeneration, 0)
      && same(signature?.rendererPrewarmGroups, EXPECTED_WEBGPU_PREWARM_GROUPS));
  if (!same(signature?.supportAssets, PASS71_HF309_EXPECTED_SUPPORT_ASSETS)
    || !same(signature?.supportFamilies, EXPECTED_FAMILIES)
    || !same(signature?.supportTextureCounts, EXPECTED_SUPPORT_TEXTURE_SIGNATURE)
    || !same(signature?.poolCounts, [6, 29, 24])
    || !same(signature?.pooledChopperActions, PASS71_HF309_REQUIRED_CHOPPER_ACTIONS)
    || !same(signature?.rotorOwnedResources, [1, 4, 4, 12, 16, 0])
    || signature?.audioRetainedSources !== 12
    || signature?.audioSpatialChains !== 4
    || signature?.hudNodeCount !== 42
    || typeof signature?.hudIdentityToken !== 'string'
    || !/^[a-f0-9-]{16,}$/iu.test(signature.hudIdentityToken)
    || !exactRendererPrewarm) {
    failures.push(`${label}:prepared-resource-signature`);
  }
}

function validateBaseline(baseline, renderer, label, failures) {
  exactKeys(baseline, [
    'label', 'observationMs', 'frameSamples', 'gapsMs', 'p50GapMs', 'p95GapMs',
    'maximumGapMs', 'presentationStatus', 'startingPresentedFrame', 'endingPresentedFrame',
    'startingSubmissionSequence', 'startingCompletedSequence', 'targetSubmissionSequence',
    'endingSubmissionSequence', 'endingCompletedSequence', 'firstPresentedFrameDelayMs',
    'firstSubmissionDelayMs', 'firstCompletionDelayMs', 'maximumPendingForMs', 'completionFailures',
  ], label, failures);
  if (typeof baseline?.label !== 'string' || !finite(baseline?.observationMs, 350, 2_000)
    || !safeInteger(baseline?.frameSamples, 10)
    || !Array.isArray(baseline?.gapsMs) || baseline.gapsMs.length !== baseline.frameSamples
    || !baseline.gapsMs.every((gap) => finite(gap, 0, 50))
    || baseline.p50GapMs !== rounded(percentile(baseline.gapsMs, 0.5))
    || baseline.p95GapMs !== rounded(percentile(baseline.gapsMs, 0.95))
    || baseline.maximumGapMs !== rounded(Math.max(...baseline.gapsMs))
    || baseline.p95GapMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_P95_FRAME_BUDGETS
    || baseline.maximumGapMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_GAP_FRAME_BUDGETS
    || baseline.firstCompletionDelayMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS
    || baseline.presentationStatus !== (renderer === 'webgpu' ? 'healthy' : 'synchronous')
    || !safeInteger(baseline.startingPresentedFrame, 0)
    || !safeInteger(baseline.endingPresentedFrame, baseline.startingPresentedFrame + 1)
    || !safeInteger(baseline.startingSubmissionSequence, 0)
    || !safeInteger(baseline.startingCompletedSequence, 0)
    || !safeInteger(baseline.targetSubmissionSequence, 0)
    || !safeInteger(baseline.endingSubmissionSequence, baseline.startingSubmissionSequence)
    || !safeInteger(baseline.endingCompletedSequence, baseline.targetSubmissionSequence)
    || !finite(baseline.firstPresentedFrameDelayMs, 0, 50)
    || !finite(baseline.firstSubmissionDelayMs, 0, 50)
    || !finite(baseline.firstCompletionDelayMs, 0, 50)
    || !finite(baseline.maximumPendingForMs, 0, 50)
    || baseline.completionFailures !== 0
    || (renderer === 'webgpu' && baseline.targetSubmissionSequence <= baseline.startingSubmissionSequence)
    || (renderer === 'webgl2' && [
      baseline.startingSubmissionSequence, baseline.startingCompletedSequence,
      baseline.targetSubmissionSequence, baseline.endingSubmissionSequence,
      baseline.endingCompletedSequence,
    ].some((value) => value !== 0))) failures.push(`${label}:healthy-native-baseline`);
}

function validateFirstPerson(firstPerson, label, failures) {
  if (!object(firstPerson)
    || firstPerson.presentationSource !== 'project-original-blender-glb'
    || !Array.isArray(firstPerson.visibleOutsideCockpit) || firstPerson.visibleOutsideCockpit.length !== 0
    || firstPerson.dashboardVisible !== true || firstPerson.displaysVisible !== true
    || firstPerson.hudVisible !== false || firstPerson.centreSightlineClear !== true
    || firstPerson.weaponVisible !== true || firstPerson.overlayLayerExclusive !== true
    || !object(firstPerson.alignment) || !finite(firstPerson.alignment.pivotErrorM, 0, 0.000999)) {
    failures.push(`${label}:prepared-authored-cockpit-gun`);
  }
}

function validateEntry(entry, renderer, phase, activation, label, failures) {
  exactKeys(entry, [
    'phase', 'baseline', 'budget', 'keyEvent', 'startedAtMs', 'handlerReturnedAtMs',
    'handlerSyncMs', 'eventToNextAnimationFrameMs', 'eventToNextPresentedFrameMs',
    'firstSubmissionDelayMs', 'firstCompletionDelayMs', 'maximumAnimationFrameGapMs',
    'maximumPendingForMs', 'frameSamples', 'startingPresentedFrame', 'endingPresentedFrame',
    'startingSubmissionSequence', 'startingCompletedSequence', 'targetSubmissionSequence',
    'endingSubmissionSequence', 'endingCompletedSequence', 'completionFailures',
    'presentationStatus', 'controlAdmission', 'beforePossession', 'afterHandlerPossession',
    'endingPossession', 'hud', 'firstPerson', 'resourcesBefore', 'resourcesAfterHandler',
    'resourcesAfterObservation',
  ], label, failures);
  if (entry?.phase !== phase) failures.push(`${label}:phase`);
  validateKeyEvent(entry?.keyEvent, `${label}:input`, failures);
  validateBaseline(entry?.baseline, renderer, `${label}:baseline`, failures);
  const expected = object(entry?.baseline) ? expectedBudget(entry.baseline) : null;
  exactKeys(entry?.budget, [
    'evidenceMode', 'releaseAcceptanceModeEligible', 'targetFrameBudgetMs', 'maximumActionMs',
    'maximumSynchronousActionMs', 'maximumFrameWorkMs', 'maximumAnimationFrameGapMs',
    'maximumFirstSubmissionDelayMs', 'maximumFirstCompletionDelayMs', 'maximumPendingForMs',
    'referenceBaselineMs',
  ], `${label}:budget`, failures);
  if (!expected || !same(entry?.budget, expected)
    || entry.budget.maximumActionMs > rounded(TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS)
    || entry.budget.maximumSynchronousActionMs !== rounded(
      TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
    )) failures.push(`${label}:absolute-native-thresholds`);
  const budget = entry?.budget ?? {};
  if (!finite(entry?.startedAtMs, activation?.observedAtMs ?? 0)
    || entry.startedAtMs !== entry?.keyEvent?.atMs
    || !finite(entry?.handlerReturnedAtMs, entry?.startedAtMs ?? 0)
    || !finite(entry?.handlerSyncMs, 0) || entry.handlerSyncMs >= budget.maximumSynchronousActionMs
    || !finite(entry?.eventToNextAnimationFrameMs, 0) || entry.eventToNextAnimationFrameMs >= budget.maximumActionMs
    || !finite(entry?.eventToNextPresentedFrameMs, 0) || entry.eventToNextPresentedFrameMs >= budget.maximumActionMs
    || !finite(entry?.firstSubmissionDelayMs, 0) || entry.firstSubmissionDelayMs >= budget.maximumFirstSubmissionDelayMs
    || !finite(entry?.firstCompletionDelayMs, 0) || entry.firstCompletionDelayMs >= budget.maximumFirstCompletionDelayMs
    || !finite(entry?.maximumAnimationFrameGapMs, 0) || entry.maximumAnimationFrameGapMs >= budget.maximumAnimationFrameGapMs
    || !finite(entry?.maximumPendingForMs, 0) || entry.maximumPendingForMs >= budget.maximumPendingForMs
    || !safeInteger(entry?.frameSamples, 10)) failures.push(`${label}:bounded-native-entry`);
  if (!safeInteger(entry?.startingPresentedFrame, 0)
    || !safeInteger(entry?.endingPresentedFrame, entry.startingPresentedFrame + 1)
    || !safeInteger(entry?.startingSubmissionSequence, 0)
    || !safeInteger(entry?.startingCompletedSequence, 0)
    || !safeInteger(entry?.targetSubmissionSequence, 0)
    || !safeInteger(entry?.endingSubmissionSequence, entry.startingSubmissionSequence)
    || !safeInteger(entry?.endingCompletedSequence, entry.targetSubmissionSequence)
    || entry?.completionFailures !== 0
    || entry?.presentationStatus !== (renderer === 'webgpu' ? 'healthy' : 'synchronous')
    || (renderer === 'webgpu' && entry.targetSubmissionSequence <= entry.startingSubmissionSequence)
    || (renderer === 'webgl2' && [
      entry.startingSubmissionSequence, entry.startingCompletedSequence,
      entry.targetSubmissionSequence, entry.endingSubmissionSequence, entry.endingCompletedSequence,
    ].some((value) => value !== 0))) failures.push(`${label}:completed-presentation-frontier`);
  const admission = entry?.controlAdmission;
  if (!object(admission) || admission.action !== 'toggle-chopper-gunner'
    || admission.entityId !== activation?.entity?.id || admission.accepted !== true
    || admission.reason !== 'accepted') failures.push(`${label}:authoritative-control-admission`);
  if (entry?.beforePossession !== null || entry?.afterHandlerPossession !== 'chopper-gunner'
    || entry?.endingPossession !== 'chopper-gunner') failures.push(`${label}:possession-transition`);
  exactKeys(entry?.hud, [
    'hiddenBefore', 'hiddenAfter', 'samePreparedNode', 'supportKind', 'requiredNodesPresent',
  ], `${label}:hud`, failures);
  if (entry?.hud?.hiddenBefore !== true || entry?.hud?.hiddenAfter !== false
    || entry?.hud?.samePreparedNode !== true || entry?.hud?.supportKind !== 'chopper-gunner'
    || entry?.hud?.requiredNodesPresent !== true) failures.push(`${label}:prepared-hud-node`);
  validateFirstPerson(entry?.firstPerson, `${label}:first-person`, failures);
  validateResourceSignature(entry?.resourcesBefore, `${label}:resources-before`, failures);
  validateResourceSignature(entry?.resourcesAfterHandler, `${label}:resources-handler`, failures);
  validateResourceSignature(entry?.resourcesAfterObservation, `${label}:resources-observation`, failures);
  if (!same(entry?.resourcesBefore, activation?.resources)
    || !same(entry?.resourcesAfterHandler, activation?.resources)
    || !same(entry?.resourcesAfterObservation, activation?.resources)) {
    failures.push(`${label}:post-entry-allocation-or-reprepare`);
  }
}

function validateRuntime(runtime, renderer, label, failures) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ], label, failures);
  if (runtime?.requestedBackend !== renderer || runtime?.actualBackend !== renderer
    || runtime?.initialized !== true || runtime?.softwareAdapter !== false
    || typeof runtime?.adapterLabel !== 'string' || runtime.adapterLabel.trim() === ''
    || SOFTWARE.test(runtime.adapterLabel) || runtime?.deviceLost !== false
    || runtime?.uncapturedErrors !== 0
    || runtime?.presentationStatus !== (renderer === 'webgpu' ? 'healthy' : 'synchronous')
    || (renderer === 'webgl2' && (runtime.adapterClass !== 'WebGL2RenderingContext' || runtime.deviceClass !== null))
    || (renderer === 'webgpu' && (typeof runtime.adapterClass !== 'string'
      || typeof runtime.deviceClass !== 'string'))) failures.push(`${label}:native-hardware-runtime`);
}

function validateInitial(initial, renderer, label, failures) {
  exactKeys(initial, [
    'capturedAtMs', 'physicalStart', 'slot', 'supportVehicle', 'pool', 'hud', 'audio',
    'rendererPrewarm', 'runtime', 'allocationSignature', 'possession',
  ], label, failures);
  if (!finite(initial?.capturedAtMs, 0)) failures.push(`${label}:capture-time`);
  exactKeys(initial?.physicalStart, ['selector', 'eventType', 'isTrusted', 'atMs', 'audioContext'], `${label}:start`, failures);
  if (initial?.physicalStart?.selector !== '#solo' || initial?.physicalStart?.eventType !== 'pointerdown'
    || initial?.physicalStart?.isTrusted !== true || !finite(initial?.physicalStart?.atMs, 0, initial?.capturedAtMs)
    || initial?.physicalStart?.audioContext !== 'running') failures.push(`${label}:trusted-audio-unlock`);
  if (!same(initial?.slot, { slotIndex: 3, inputKey: '6', inputCode: 'Digit6' })) {
    failures.push(`${label}:canonical-slot`);
  }
  const support = initial?.supportVehicle;
  exactKeys(support, [
    'state', 'requiredAssets', 'loadedAssets', 'readyFamilies', 'maxConcurrentDecodes',
    'failureCount', 'textureDedup',
  ], `${label}:support`, failures);
  if (support?.state !== 'ready' || !same(support?.requiredAssets, PASS71_HF309_EXPECTED_SUPPORT_ASSETS)
    || !same(support.requiredAssets, support.loadedAssets)
    || !same(support.readyFamilies, EXPECTED_FAMILIES)
    || support.maxConcurrentDecodes !== 2 || support.failureCount !== 0
    || !object(support.textureDedup)) failures.push(`${label}:authored-aircraft-assets`);
  const pool = initial?.pool;
  exactKeys(pool, [
    'prewarmed', 'pooledEntityInstances', 'pooledSwarmDrones',
    'prewarmedAuthoredSupportFamilies', 'pooledChopperActionNames', 'activeEntities',
    'activeBombShells', 'activeImpactFlashes', 'activeEmberParticles', 'bounded',
  ], `${label}:pool`, failures);
  if (pool?.prewarmed !== 6 || pool?.pooledEntityInstances !== 29 || pool?.pooledSwarmDrones !== 24
    || !same(pool?.prewarmedAuthoredSupportFamilies, EXPECTED_FAMILIES)
    || !same(pool?.pooledChopperActionNames, PASS71_HF309_REQUIRED_CHOPPER_ACTIONS)
    || pool?.activeEntities !== 0 || pool?.activeBombShells !== 0
    || pool?.activeImpactFlashes !== 0 || pool?.activeEmberParticles !== 0
    || pool?.bounded !== true) failures.push(`${label}:preowned-presentation-vocabulary`);
  if (!object(initial?.hud) || initial.hud.hidden !== true || initial.hud.connected !== true
    || initial.hud.supportKind !== 'none' || initial.hud.samePreparedNode !== true
    || initial.hud.requiredNodesPresent !== true || initial.hud.descendantCount !== 42) {
    failures.push(`${label}:prepared-hud`);
  }
  if (!same(initial?.audio, {
    contextState: 'running', prepared: true, runs: 1, capacity: 4, sources: 4, nodes: 12,
    factoryCalls: 16, firstActiveSync: null, retainedBroadbandLoops: 0,
  })) failures.push(`${label}:preowned-rotor-audio`);
  if (!object(initial?.rendererPrewarm) || initial.rendererPrewarm.bootstrapStage !== 'ready'
    || (renderer === 'webgpu' && (!safeInteger(initial.rendererPrewarm.sceneGeneration, 0)
      || !same(initial.rendererPrewarm.groups, EXPECTED_WEBGPU_PREWARM_GROUPS)))
    || (renderer === 'webgl2' && (initial.rendererPrewarm.sceneGeneration !== null
      || !same(initial.rendererPrewarm.groups, [])))) failures.push(`${label}:completed-renderer-prewarm`);
  validateRuntime(initial?.runtime, renderer, `${label}:runtime`, failures);
  validateResourceSignature(initial?.allocationSignature, `${label}:allocation`, failures);
  if (initial?.possession !== null) failures.push(`${label}:preactivation-possession`);
}

function validateActivation(activation, initial, label, failures) {
  exactKeys(activation, [
    'observedAtMs', 'keyEvent', 'entity', 'possession', 'audio', 'resources', 'resourcesBefore',
  ], label, failures);
  validateKeyEvent(activation?.keyEvent, `${label}:input`, failures);
  if (!finite(activation?.observedAtMs, activation?.keyEvent?.atMs ?? 0)
    || !(initial?.capturedAtMs < activation?.keyEvent?.atMs)) failures.push(`${label}:prepare-before-activation`);
  exactKeys(activation?.entity, [
    'id', 'activationId', 'phase', 'gunController', 'poolKey', 'presentationSource',
    'visible', 'visibleMeshCount', 'activeLodAsset',
  ], `${label}:entity`, failures);
  if (typeof activation?.entity?.id !== 'string' || activation.entity.id.length < 1
    || typeof activation.entity.activationId !== 'string' || activation.entity.activationId.length < 1
    || activation.entity.phase !== 'orbiting' || activation.entity.gunController !== 'ai'
    || activation.entity.poolKey !== 'chopper'
    || activation.entity.presentationSource !== 'project-original-blender-glb'
    || activation.entity.visible !== true || !safeInteger(activation.entity.visibleMeshCount, 1)
    || !PASS71_HF309_REQUIRED_CHOPPER_ASSETS.some((asset) => asset === activation.entity.activeLodAsset)) {
    failures.push(`${label}:real-authored-chopper-activation`);
  }
  if (activation?.possession !== null) failures.push(`${label}:activation-before-possession`);
  const audio = activation?.audio;
  if (!object(audio) || audio.prepared !== true || audio.runs !== 1 || audio.capacity !== 4
    || audio.sources !== 4 || audio.nodes !== 12 || audio.factoryCalls !== 16
    || audio.active !== true || !same(audio.liveIds, [activation.entity.id])
    || !object(audio.firstActiveSync) || audio.firstActiveSync.cold !== true
    || audio.firstActiveSync.factoryDelta !== 0 || audio.firstActiveSync.admitted !== 1
    || audio.firstActiveSync.contextState !== 'running') failures.push(`${label}:allocation-free-audio-activation`);
  validateResourceSignature(activation?.resourcesBefore, `${label}:resources-before`, failures);
  validateResourceSignature(activation?.resources, `${label}:resources`, failures);
  if (!same(activation?.resourcesBefore, initial?.allocationSignature)
    || !same(activation?.resources, initial?.allocationSignature)) failures.push(`${label}:activation-allocation`);
}

function validateExit(exit, activation, label, failures) {
  exactKeys(exit, label === 'first-exit'
    ? ['keyEvent', 'possession', 'hudHidden', 'resources']
    : ['keyEvent', 'possession', 'hud', 'resources'], label, failures);
  validateKeyEvent(exit?.keyEvent, `${label}:input`, failures);
  if (exit?.possession !== null) failures.push(`${label}:possession-cleanup`);
  if (label === 'first-exit' && exit?.hudHidden !== true) failures.push(`${label}:hud-cleanup`);
  if (label === 'final-exit' && (!object(exit?.hud) || exit.hud.hidden !== true
    || exit.hud.connected !== true || exit.hud.samePreparedNode !== true
    || exit.hud.supportKind !== 'none')) failures.push(`${label}:hud-cleanup`);
  validateResourceSignature(exit?.resources, `${label}:resources`, failures);
  if (!same(exit?.resources, activation?.resources)) failures.push(`${label}:allocation-or-reprepare`);
}

function validateComponent(component, renderer, aggregate, label, failures) {
  exactKeys(component, [
    'schemaVersion', 'evidenceId', 'contract', 'renderer', 'arenaId', 'renderProfile',
    'startedAt', 'completedAt', 'servedCandidate', 'browser', 'runtime', 'initial',
    'activation', 'firstEntry', 'firstExit', 'warmEntry', 'finalExit', 'allocationStability',
    'keyEvents', 'faults',
  ], label, failures);
  if (component?.schemaVersion !== 1 || component?.evidenceId !== 'HF-309'
    || component?.contract !== 'atomic-acres/pass71-hf309-chopper-first-entry-component@1'
    || component?.renderer !== renderer || component?.arenaId !== 'gun-range'
    || component?.renderProfile !== 'performance' || !iso(component?.startedAt)
    || !iso(component?.completedAt) || Date.parse(component.startedAt) > Date.parse(component.completedAt)) {
    failures.push(`${label}:identity`);
  }
  const served = component?.servedCandidate;
  exactKeys(served, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], `${label}:served`, failures);
  if (served?.schemaVersion !== 4 || served?.channel !== 'the-big-one' || served?.releasePass !== 'PASS 71'
    || served?.sourceSha !== aggregate?.source?.expectedSourceSha || served?.path !== 'channels/the-big-one'
    || !SHA256.test(served?.treeSha256 ?? '') || !safeInteger(served?.exactRootFileCount, 1)) {
    failures.push(`${label}:exact-served-candidate-a`);
  }
  exactKeys(component?.browser, ['channel', 'installed', 'userAgent', 'version', 'sessionNonce'], `${label}:browser`, failures);
  const runtimeVersion = component?.browser?.userAgent?.match(/Edg\/(\d+(?:\.\d+){3})/u)?.[1];
  if (component?.browser?.channel !== 'msedge' || component?.browser?.installed !== true
    || component?.browser?.version !== runtimeVersion
    || component?.browser?.version !== aggregate?.browser?.productVersion
    || typeof component?.browser?.sessionNonce !== 'string'
    || !/^[a-f0-9-]{16,}$/iu.test(component.browser.sessionNonce)) {
    failures.push(`${label}:installed-edge-runtime-identity`);
  }
  validateRuntime(component?.runtime, renderer, `${label}:runtime`, failures);
  validateInitial(component?.initial, renderer, `${label}:initial`, failures);
  if (!same(component?.runtime, component?.initial?.runtime)) failures.push(`${label}:runtime-drift`);
  validateActivation(component?.activation, component?.initial, `${label}:activation`, failures);
  validateEntry(component?.firstEntry, renderer, 'first', component?.activation, `${label}:first`, failures);
  validateExit(component?.firstExit, component?.activation, 'first-exit', failures);
  validateEntry(component?.warmEntry, renderer, 'warm', component?.activation, `${label}:warm`, failures);
  validateExit(component?.finalExit, component?.activation, 'final-exit', failures);
  if (!(component?.firstEntry?.startedAtMs < component?.firstExit?.keyEvent?.atMs
    && component?.firstExit?.keyEvent?.atMs < component?.warmEntry?.startedAtMs
    && component?.warmEntry?.startedAtMs < component?.finalExit?.keyEvent?.atMs)) {
    failures.push(`${label}:first-warm-chronology`);
  }
  exactKeys(component?.allocationStability, [
    'activationPreparedBeforeInput', 'activationSettledBeforeFirstPossession',
    'initialToActivation', 'activationToFirstHandler', 'activationToFirstObservation',
    'activationToFirstExit', 'activationToWarmHandler', 'activationToWarmObservation',
    'activationToFinalExit',
  ], `${label}:allocation-stability`, failures);
  if (!object(component?.allocationStability)
    || Object.values(component.allocationStability).some((value) => value !== true)) {
    failures.push(`${label}:allocation-stability`);
  }
  if (!Array.isArray(component?.keyEvents) || component.keyEvents.length !== 5) {
    failures.push(`${label}:all-real-slot-events`);
  } else {
    component.keyEvents.forEach((event, index) => validateKeyEvent(event, `${label}:key-${index}`, failures));
    const boundEvents = [
      component?.activation?.keyEvent,
      component?.firstEntry?.keyEvent,
      component?.firstExit?.keyEvent,
      component?.warmEntry?.keyEvent,
      component?.finalExit?.keyEvent,
    ];
    if (!same(component.keyEvents, boundEvents)
      || !component.keyEvents.every((event, index) => index === 0
        || event.atMs > component.keyEvents[index - 1].atMs)) {
      failures.push(`${label}:trusted-input-binding-and-order`);
    }
  }
  if (!Array.isArray(component?.faults) || component.faults.length !== 0) failures.push(`${label}:faults`);
}

export function pass71Hf309EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== 1 || record.evidenceId !== 'HF-309'
    || record.kind !== PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE.kind
    || record.contract !== PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE.contract
    || record.feedbackId !== 'HF-309' || record.status !== 'passed'
    || record.closesFeedback !== true || record.closingAuthority !== true
    || record.ownerSubjectiveApproval !== 'not-claimed') return ['receipt-identity-or-status'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'closesFeedback', 'closingAuthority', 'ownerSubjectiveApproval', 'startedAt', 'completedAt',
    'source', 'environment', 'browser', 'coverage', 'tooling', 'components', 'faults',
    'receiptSha256',
  ], 'receipt', failures);
  if (!iso(record.startedAt) || !iso(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('receipt-timestamps');
  const source = record.source;
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!SHA40.test(expected?.sourceSha ?? '') || !SHA40.test(expected?.sourceTreeSha ?? '')
    || source?.expectedSourceSha !== expected.sourceSha || source?.checkoutSourceSha !== expected.sourceSha
    || source?.endingCheckoutSourceSha !== expected.sourceSha || source?.sourceTreeSha !== expected.sourceTreeSha
    || source?.releasePass !== 'PASS 71' || source?.cleanBefore !== true || source?.cleanAfter !== true) {
    failures.push('exact-clean-candidate-a-source');
  }
  if (!same(record.environment, { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' })) {
    failures.push('required-machine-environment');
  }
  const browser = record.browser;
  exactKeys(browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'productVersion', 'installRoot',
    'authenticodeStatus', 'authenticodeSigner', 'processIsolation', 'processCount',
  ], 'browser', failures);
  if (browser?.channel !== 'msedge' || browser?.installed !== true || browser?.executableName !== 'msedge.exe'
    || !SHA256.test(browser?.executableSha256 ?? '') || !/^\d+(?:\.\d+){3}$/u.test(browser?.productVersion ?? '')
    || !/[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(browser?.installRoot ?? '')
    || browser?.authenticodeStatus !== 'Valid' || !/\bMicrosoft Corporation\b/iu.test(browser?.authenticodeSigner ?? '')
    || browser?.processIsolation !== 'fresh-owned-installed-edge-process-and-profile-per-renderer'
    || browser?.processCount !== 2) failures.push('signed-installed-edge-process-identity');
  exactKeys(record.coverage, [
    'renderers', 'arenaId', 'renderProfile', 'entryPhases', 'trustedInputs', 'preparedResources',
    'absoluteNativeFrameBudget', 'completedPresentationFrontiers', 'ownerSubjectiveInspectionPerformed',
  ], 'coverage', failures);
  if (!same(record.coverage?.renderers, PASS71_HF309_RENDERERS)
    || record.coverage?.arenaId !== 'gun-range' || record.coverage?.renderProfile !== 'performance'
    || !same(record.coverage?.entryPhases, ['first', 'warm'])
    || !same(record.coverage?.trustedInputs, ['activation', 'first-entry', 'exit', 'warm-entry', 'final-exit'])
    || !same(record.coverage?.preparedResources, [
      'authored-aircraft-lods', 'cockpit', 'gun-actions', 'missile-shell-and-impact-pools',
      'hud-dom', 'rotor-audio-pool', 'renderer-vocabulary',
    ]) || record.coverage?.absoluteNativeFrameBudget !== true
    || record.coverage?.completedPresentationFrontiers !== true
    || record.coverage?.ownerSubjectiveInspectionPerformed !== false) failures.push('full-hf309-coverage');
  if (!Array.isArray(record.tooling) || !Array.isArray(expected?.tooling)
    || record.tooling.length !== PASS71_HF309_TOOLING_PATHS.length
    || !same(record.tooling, expected.tooling)
    || !record.tooling.every((entry, index) => entry.path === PASS71_HF309_TOOLING_PATHS[index]
      && SHA256.test(entry.sha256 ?? ''))) failures.push('source-bound-tooling');
  if (!Array.isArray(record.components) || record.components.length !== 2
    || !same(record.components.map((component) => component?.renderer), PASS71_HF309_RENDERERS)) {
    failures.push('both-native-renderers');
  } else for (const [index, renderer] of PASS71_HF309_RENDERERS.entries()) {
    validateComponent(record.components[index], renderer, record, `component:${renderer}`, failures);
  }
  if (record.components?.length === 2
    && record.components[0]?.browser?.sessionNonce === record.components[1]?.browser?.sessionNonce) {
    failures.push('fresh-edge-profile-per-renderer');
  }
  if (record.components?.length === 2
    && !same(record.components[0]?.servedCandidate, record.components[1]?.servedCandidate)) {
    failures.push('served-candidate-drift');
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf309RecordSha256(record)) failures.push('receipt-digest');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf309Evidence(record, expected) {
  const failures = pass71Hf309EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-309 evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf309EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF309_CHOPPER_FIRST_ENTRY_DESCRIPTOR,
    closesFeedback: true,
    ownerSubjectiveApproval: 'not-claimed',
    validate(record, context = {}) {
      const sourceSha = context.sourceSha;
      const repositoryRoot = context.repositoryRoot ?? process.cwd();
      const sourceTreeSha = context.options?.pass71Hf309SourceTreeSha
        ?? (SHA40.test(sourceSha ?? '') ? sourceTreeAt(repositoryRoot, sourceSha) : undefined);
      const tooling = context.options?.pass71Hf309Tooling
        ?? (SHA40.test(sourceSha ?? '') ? pass71Hf309ToolingHashesAtSource(repositoryRoot, sourceSha) : undefined);
      return pass71Hf309EvidenceFailures(record, { sourceSha, sourceTreeSha, tooling });
    },
  });
}

export const PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE_REGISTRY_ENTRY =
  createPass71Hf309EvidenceRegistryEntry();

function fixtureBaseline(renderer, phase) {
  const gapsMs = Array.from({ length: 22 }, () => 16);
  return {
    label: `hf309-${renderer}-${phase}-preentry-baseline`,
    observationMs: 352,
    frameSamples: 22,
    gapsMs,
    p50GapMs: 16,
    p95GapMs: 16,
    maximumGapMs: 16,
    presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
    startingPresentedFrame: 100,
    endingPresentedFrame: 122,
    startingSubmissionSequence: renderer === 'webgpu' ? 100 : 0,
    startingCompletedSequence: renderer === 'webgpu' ? 100 : 0,
    targetSubmissionSequence: renderer === 'webgpu' ? 101 : 0,
    endingSubmissionSequence: renderer === 'webgpu' ? 122 : 0,
    endingCompletedSequence: renderer === 'webgpu' ? 122 : 0,
    firstPresentedFrameDelayMs: 16,
    firstSubmissionDelayMs: 16,
    firstCompletionDelayMs: 16,
    maximumPendingForMs: 0,
    completionFailures: 0,
  };
}

function fixtureResource(token, renderer) {
  return {
    supportAssets: [...PASS71_HF309_EXPECTED_SUPPORT_ASSETS],
    supportFamilies: [...EXPECTED_FAMILIES],
    supportTextureCounts: [...EXPECTED_SUPPORT_TEXTURE_SIGNATURE],
    poolCounts: [6, 29, 24],
    pooledChopperActions: [...PASS71_HF309_REQUIRED_CHOPPER_ACTIONS],
    rotorOwnedResources: [1, 4, 4, 12, 16, 0],
    audioRetainedSources: 12,
    audioSpatialChains: 4,
    hudNodeCount: 42,
    hudIdentityToken: token,
    rendererPrewarmGeneration: renderer === 'webgpu' ? 1 : null,
    rendererPrewarmGroups: renderer === 'webgpu' ? [...EXPECTED_WEBGPU_PREWARM_GROUPS] : [],
  };
}

function fixtureKey(atMs) {
  return { code: 'Digit6', key: '6', isTrusted: true, repeat: false, atMs };
}

function fixtureRuntime(renderer) {
  return {
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    adapterClass: renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
    deviceClass: renderer === 'webgpu' ? 'GPUDevice' : null,
    adapterLabel: renderer === 'webgpu'
      ? 'NVIDIA GeForce RTX 5080'
      : 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Direct3D11)',
    softwareAdapter: false,
    deviceLost: false,
    uncapturedErrors: 0,
    presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
  };
}

function fixtureFirstPerson(entityId) {
  return {
    entityId,
    presentationSource: 'project-original-blender-glb',
    visibleMeshNames: ['chopper-cockpit-dashboard-3d', 'chopper-gunner-view-barrel'],
    visibleOutsideSightline: [],
    visibleOutsideCockpit: [],
    dashboardVisible: true,
    displaysVisible: true,
    hudVisible: false,
    centreSightlineClear: true,
    weaponVisible: true,
    overlayLayerExclusive: true,
    alignment: { pivotErrorM: 0.0001 },
  };
}

function fixtureEntry(renderer, phase, startedAtMs, resource, entityId) {
  const baseline = fixtureBaseline(renderer, phase);
  const startingSequence = renderer === 'webgpu' ? 200 : 0;
  const targetSequence = renderer === 'webgpu' ? 201 : 0;
  return {
    phase,
    baseline,
    budget: expectedBudget(baseline),
    keyEvent: fixtureKey(startedAtMs),
    startedAtMs,
    handlerReturnedAtMs: startedAtMs + 2,
    handlerSyncMs: 2,
    eventToNextAnimationFrameMs: 16,
    eventToNextPresentedFrameMs: 16,
    firstSubmissionDelayMs: 16,
    firstCompletionDelayMs: 16,
    maximumAnimationFrameGapMs: 17,
    maximumPendingForMs: 0,
    frameSamples: 22,
    startingPresentedFrame: 200,
    endingPresentedFrame: 222,
    startingSubmissionSequence: startingSequence,
    startingCompletedSequence: startingSequence,
    targetSubmissionSequence: targetSequence,
    endingSubmissionSequence: renderer === 'webgpu' ? 222 : 0,
    endingCompletedSequence: renderer === 'webgpu' ? 222 : 0,
    completionFailures: 0,
    presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
    controlAdmission: {
      atMs: startedAtMs + 1,
      entityId,
      action: 'toggle-chopper-gunner',
      sequence: phase === 'first' ? 2 : 4,
      yawQ: null,
      pitchQ: null,
      fire: false,
      missileFire: false,
      accepted: true,
      reason: 'accepted',
    },
    beforePossession: null,
    afterHandlerPossession: 'chopper-gunner',
    endingPossession: 'chopper-gunner',
    hud: {
      hiddenBefore: true, hiddenAfter: false, samePreparedNode: true,
      supportKind: 'chopper-gunner', requiredNodesPresent: true,
    },
    firstPerson: fixtureFirstPerson(entityId),
    resourcesBefore: structuredClone(resource),
    resourcesAfterHandler: structuredClone(resource),
    resourcesAfterObservation: structuredClone(resource),
  };
}

function fixtureComponent(renderer, sourceSha, version, index) {
  const token = `00000000-0000-4000-8000-00000000000${index + 1}`;
  const resource = fixtureResource(token, renderer);
  const runtime = fixtureRuntime(renderer);
  const entityId = `chopper-fixture-${renderer}`;
  const initial = {
    capturedAtMs: 100,
    physicalStart: { selector: '#solo', eventType: 'pointerdown', isTrusted: true, atMs: 50, audioContext: 'running' },
    slot: { slotIndex: 3, inputKey: '6', inputCode: 'Digit6' },
    supportVehicle: {
      state: 'ready',
      requiredAssets: [...resource.supportAssets],
      loadedAssets: [...resource.supportAssets],
      readyFamilies: [...EXPECTED_FAMILIES],
      maxConcurrentDecodes: 2,
      failureCount: 0,
      textureDedup: {
        canonicalTextureCount: 5, reusedTextureCount: 39, disposedDuplicateTextureCount: 39,
        closedDuplicateImageCount: 39, ineligibleTextureCount: 0,
        estimatedActiveTextureBytes: 6_990_500, estimatedAvoidedTextureBytes: 54_525_900,
      },
    },
    pool: {
      prewarmed: 6, pooledEntityInstances: 29, pooledSwarmDrones: 24,
      prewarmedAuthoredSupportFamilies: [...EXPECTED_FAMILIES],
      pooledChopperActionNames: [...PASS71_HF309_REQUIRED_CHOPPER_ACTIONS],
      activeEntities: 0, activeBombShells: 0, activeImpactFlashes: 0, activeEmberParticles: 0,
      bounded: true,
    },
    hud: {
      hidden: true, connected: true, supportKind: 'none', samePreparedNode: true,
      requiredNodesPresent: true, descendantCount: 42,
    },
    audio: {
      contextState: 'running', prepared: true, runs: 1, capacity: 4, sources: 4,
      nodes: 12, factoryCalls: 16, firstActiveSync: null, retainedBroadbandLoops: 0,
    },
    rendererPrewarm: {
      bootstrapStage: 'ready',
      sceneGeneration: renderer === 'webgpu' ? 1 : null,
      groups: renderer === 'webgpu' ? [...EXPECTED_WEBGPU_PREWARM_GROUPS] : [],
    },
    runtime,
    allocationSignature: structuredClone(resource),
    possession: null,
  };
  const activation = {
    observedAtMs: 160,
    keyEvent: fixtureKey(120),
    entity: {
      id: entityId, activationId: `activation-${renderer}`, phase: 'orbiting', gunController: 'ai',
      poolKey: 'chopper', presentationSource: 'project-original-blender-glb', visible: true,
      visibleMeshCount: 30, activeLodAsset: PASS71_HF309_REQUIRED_CHOPPER_ASSETS[0],
    },
    possession: null,
    audio: {
      prepared: true, runs: 1, capacity: 4, sources: 4, nodes: 12, factoryCalls: 16,
      active: true, liveIds: [entityId],
      firstActiveSync: { cold: true, factoryDelta: 0, admitted: 1, contextState: 'running' },
    },
    resources: structuredClone(resource),
    resourcesBefore: structuredClone(resource),
  };
  const firstEntry = fixtureEntry(renderer, 'first', 500, resource, entityId);
  const warmEntry = fixtureEntry(renderer, 'warm', 1_500, resource, entityId);
  const keyEvents = [
    activation.keyEvent,
    firstEntry.keyEvent,
    fixtureKey(1_000),
    warmEntry.keyEvent,
    fixtureKey(2_000),
  ];
  const servedCandidate = {
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 71',
    sourceSha,
    path: 'channels/the-big-one',
    treeSha256: 'd'.repeat(64),
    exactRootFileCount: 500,
  };
  return {
    schemaVersion: 1,
    evidenceId: 'HF-309',
    contract: 'atomic-acres/pass71-hf309-chopper-first-entry-component@1',
    renderer,
    arenaId: 'gun-range',
    renderProfile: 'performance',
    startedAt: '2026-08-13T20:00:00.000Z',
    completedAt: '2026-08-13T20:01:00.000Z',
    servedCandidate,
    browser: {
      channel: 'msedge', installed: true, userAgent: `Mozilla/5.0 Edg/${version}`,
      version, sessionNonce: token,
    },
    runtime,
    initial,
    activation,
    firstEntry,
    firstExit: { keyEvent: keyEvents[2], possession: null, hudHidden: true, resources: structuredClone(resource) },
    warmEntry,
    finalExit: {
      keyEvent: keyEvents[4], possession: null,
      hud: { hidden: true, connected: true, samePreparedNode: true, supportKind: 'none' },
      resources: structuredClone(resource),
    },
    allocationStability: {
      activationPreparedBeforeInput: true,
      activationSettledBeforeFirstPossession: true,
      initialToActivation: true,
      activationToFirstHandler: true,
      activationToFirstObservation: true,
      activationToFirstExit: true,
      activationToWarmHandler: true,
      activationToWarmObservation: true,
      activationToFinalExit: true,
    },
    keyEvents,
    faults: [],
  };
}

export function createPass71Hf309EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'b'.repeat(40);
  const tooling = options.tooling ?? PASS71_HF309_TOOLING_PATHS.map((path, index) => ({
    path,
    sha256: String((index % 9) + 1).repeat(64),
  }));
  const version = '151.0.4129.72';
  const record = {
    ...PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T20:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T20:03:00.000Z',
    source: {
      expectedSourceSha: sourceSha,
      checkoutSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha,
      sourceTreeSha,
      releasePass: 'PASS 71',
      cleanBefore: true,
      cleanAfter: true,
    },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe',
      executableSha256: 'c'.repeat(64), productVersion: version,
      installRoot: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
      authenticodeStatus: 'Valid',
      authenticodeSigner: 'CN=Microsoft Corporation, O=Microsoft Corporation, C=US',
      processIsolation: 'fresh-owned-installed-edge-process-and-profile-per-renderer',
      processCount: 2,
    },
    coverage: {
      renderers: [...PASS71_HF309_RENDERERS],
      arenaId: 'gun-range',
      renderProfile: 'performance',
      entryPhases: ['first', 'warm'],
      trustedInputs: ['activation', 'first-entry', 'exit', 'warm-entry', 'final-exit'],
      preparedResources: [
        'authored-aircraft-lods', 'cockpit', 'gun-actions', 'missile-shell-and-impact-pools',
        'hud-dom', 'rotor-audio-pool', 'renderer-vocabulary',
      ],
      absoluteNativeFrameBudget: true,
      completedPresentationFrontiers: true,
      ownerSubjectiveInspectionPerformed: false,
    },
    tooling,
    components: PASS71_HF309_RENDERERS.map((renderer, index) => (
      fixtureComponent(renderer, sourceSha, version, index)
    )),
    faults: [],
  };
  record.receiptSha256 = pass71Hf309RecordSha256(record);
  return record;
}
