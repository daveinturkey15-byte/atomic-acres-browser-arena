import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PASS71_GRENADE_NATIVE_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-298',
  kind: 'pass71-hf298-grenade-native-webgpu-component',
  contract: 'atomic-acres/pass71-hf298-grenade-native-webgpu-component@1',
  gate: 'pass71-exact-sha-installed-edge-native-webgpu-grenade-first-action-v1',
  grenades: Object.freeze(['frag', 'flash', 'smoke', 'semtex']),
  phases: Object.freeze(['cold', 'warm']),
});

export const PASS71_GRENADE_NATIVE_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-grenade-native-receipt.mjs',
  contract: 'scripts/qa/pass71-grenade-native-receipt-contract.mjs',
  spec: 'tests/e2e/pass71-grenade-first-action.spec.ts',
  frameActionBudget: 'tests/e2e/frame-action-budget.ts',
  playwrightConfig: 'playwright.config.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  acceptanceGate: 'scripts/release/acceptance-gate.mjs',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
  edgeIdentityProbe: 'scripts/qa/pass71-edge-executable-identity.mjs',
  nativeUserAgentContract: 'scripts/qa/pass70-cross-browser-native-user-agent-contract.mjs',
  multiplayerBrowserContract: 'scripts/qa/pass66-multiplayer-stability-contract.mjs',
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
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

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, expected, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...expected].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function pass71GrenadeNativeCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 grenade native evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71GrenadeNativeRecordSha256(record) {
  return createHash('sha256').update(pass71GrenadeNativeCanonicalBytes(record)).digest('hex');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function pass71GrenadeNativeToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_GRENADE_NATIVE_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256File(resolve(repositoryRoot, path))],
  )));
}

export function pass71GrenadeNativeToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 grenade tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_GRENADE_NATIVE_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, createHash('sha256').update(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    )).digest('hex')],
  )));
}

function expectedBudget(baseline) {
  const referenceBaselineMs = Math.max(
    baseline.p95GapMs,
    baseline.firstPresentedFrameDelayMs,
    baseline.firstSubmissionDelayMs,
    baseline.firstCompletionDelayMs,
  );
  const maximumActionMs = rounded(Math.min(
    TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS,
    Math.max(
      TARGET_FRAME_BUDGET_MS * MINIMUM_ACTION_FRAME_BUDGETS,
      referenceBaselineMs + TARGET_FRAME_BUDGET_MS * ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
    ),
  ));
  return {
    evidenceMode: 'native-no-freeze',
    releaseAcceptanceModeEligible: true,
    targetFrameBudgetMs: rounded(TARGET_FRAME_BUDGET_MS),
    maximumActionMs,
    maximumSynchronousActionMs: rounded(
      TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
    ),
    maximumFrameWorkMs: maximumActionMs,
    maximumAnimationFrameGapMs: maximumActionMs,
    maximumFirstSubmissionDelayMs: maximumActionMs,
    maximumFirstCompletionDelayMs: maximumActionMs,
    maximumPendingForMs: maximumActionMs,
    referenceBaselineMs: rounded(referenceBaselineMs),
  };
}

function validateBaseline(baseline, expectedLabel, prefix, failures) {
  exactKeys(baseline, [
    'label', 'observationMs', 'frameSamples', 'gapsMs', 'p50GapMs', 'p95GapMs',
    'maximumGapMs', 'presentationStatus', 'startingPresentedFrame', 'endingPresentedFrame',
    'startingSubmissionSequence', 'startingCompletedSequence', 'targetSubmissionSequence',
    'endingSubmissionSequence', 'endingCompletedSequence', 'firstPresentedFrameDelayMs',
    'firstSubmissionDelayMs', 'firstCompletionDelayMs', 'maximumPendingForMs',
    'completionFailures',
  ], `${prefix}:baseline`, failures);
  if (!object(baseline) || baseline.label !== expectedLabel
    || !finiteNonNegative(baseline.observationMs) || baseline.observationMs < BASELINE_OBSERVATION_MS
    || !Number.isSafeInteger(baseline.frameSamples)
    || baseline.frameSamples < MINIMUM_BASELINE_FRAME_SAMPLES
    || !Array.isArray(baseline.gapsMs) || baseline.gapsMs.length !== baseline.frameSamples
    || baseline.gapsMs.some((gap) => !finiteNonNegative(gap))
    || !finiteNonNegative(baseline.p50GapMs) || !finiteNonNegative(baseline.p95GapMs)
    || !finiteNonNegative(baseline.maximumGapMs)
    || !finiteNonNegative(baseline.firstPresentedFrameDelayMs)
    || !finiteNonNegative(baseline.firstSubmissionDelayMs)
    || !finiteNonNegative(baseline.firstCompletionDelayMs)
    || !finiteNonNegative(baseline.maximumPendingForMs)
    || baseline.presentationStatus !== 'healthy'
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
    || baseline.endingCompletedSequence < baseline.targetSubmissionSequence) {
    failures.push(`${prefix}:baseline-frontier`);
    return null;
  }
  if (Math.abs(rounded(percentile(baseline.gapsMs, 0.5)) - baseline.p50GapMs) > 0.001
    || Math.abs(rounded(percentile(baseline.gapsMs, 0.95)) - baseline.p95GapMs) > 0.001
    || Math.abs(rounded(Math.max(...baseline.gapsMs)) - baseline.maximumGapMs) > 0.001) {
    failures.push(`${prefix}:baseline-summary`);
  }
  if (baseline.p95GapMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_P95_FRAME_BUDGETS
    || baseline.maximumGapMs >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_GAP_FRAME_BUDGETS
    || baseline.firstCompletionDelayMs
      >= TARGET_FRAME_BUDGET_MS * MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS) {
    failures.push(`${prefix}:baseline-native-envelope`);
  }
  return expectedBudget(baseline);
}

function validateAction(action, grenade, phase, prefix, failures) {
  const expectedCold = phase === 'cold';
  exactKeys(action, ['phase', 'baseline', 'budget', 'measurement', 'frontier', 'audio'], prefix, failures);
  if (!object(action) || action.phase !== phase) {
    failures.push(`${prefix}:identity`);
    return;
  }
  const budget = validateBaseline(
    action.baseline,
    `${grenade}-${phase}-preaction-baseline`,
    prefix,
    failures,
  );
  exactKeys(action?.budget, [
    'evidenceMode', 'releaseAcceptanceModeEligible', 'targetFrameBudgetMs', 'maximumActionMs',
    'maximumSynchronousActionMs', 'maximumFrameWorkMs', 'maximumAnimationFrameGapMs',
    'maximumFirstSubmissionDelayMs', 'maximumFirstCompletionDelayMs', 'maximumPendingForMs',
    'referenceBaselineMs',
  ], `${prefix}:budget`, failures);
  if (!budget || !sameJson(action.budget, budget)) failures.push(`${prefix}:budget-forged-or-stale`);
  const measurement = action.measurement;
  exactKeys(measurement, [
    'internalHandlerSyncMs', 'outerHandlerSyncMs', 'eventToNextAnimationFrameMs',
    'maximumAnimationFrameGapMs', 'maximumFrameWorkMs', 'maximumPendingForMs',
    'firstSubmissionDelayMs', 'firstCompletionDelayMs',
  ], `${prefix}:measurement`, failures);
  const measurementFields = [
    ['internal-handler-sync', 'internalHandlerSyncMs', budget?.maximumSynchronousActionMs],
    ['outer-handler-sync', 'outerHandlerSyncMs', budget?.maximumSynchronousActionMs],
    ['event-to-next-animation-frame', 'eventToNextAnimationFrameMs', budget?.maximumAnimationFrameGapMs],
    // Native acceptance deliberately retains and gates the complete rAF maximum.
    ['maximum-animation-frame-gap', 'maximumAnimationFrameGapMs', budget?.maximumAnimationFrameGapMs],
    ['maximum-frame-work', 'maximumFrameWorkMs', budget?.maximumFrameWorkMs],
    ['maximum-presentation-pending', 'maximumPendingForMs', budget?.maximumPendingForMs],
    ['first-submission-delay', 'firstSubmissionDelayMs', budget?.maximumFirstSubmissionDelayMs],
    ['first-completion-delay', 'firstCompletionDelayMs', budget?.maximumFirstCompletionDelayMs],
  ];
  if (!object(measurement)) failures.push(`${prefix}:measurement-missing`);
  else for (const [label, field, maximum] of measurementFields) {
    if (!finiteNonNegative(measurement[field]) || !finiteNonNegative(maximum)
      || measurement[field] >= maximum) failures.push(`${prefix}:${label}`);
  }
  const frontier = action.frontier;
  exactKeys(frontier, [
    'actionNonce', 'grenade', 'cold', 'frameSamples', 'startingSubmissionSequence',
    'startingCompletedSequence', 'targetSubmissionSequence', 'endingSubmissionSequence',
    'endingCompletedSequence', 'completionFailures', 'status', 'observationComplete',
  ], `${prefix}:frontier`, failures);
  if (!object(frontier) || frontier.grenade !== grenade || frontier.cold !== expectedCold
    || !Number.isSafeInteger(frontier.actionNonce)
    || !Number.isSafeInteger(frontier.frameSamples)
    || frontier.frameSamples < MINIMUM_BASELINE_FRAME_SAMPLES
    || !Number.isSafeInteger(frontier.startingSubmissionSequence)
    || !Number.isSafeInteger(frontier.startingCompletedSequence)
    || !Number.isSafeInteger(frontier.targetSubmissionSequence)
    || frontier.targetSubmissionSequence <= frontier.startingSubmissionSequence
    || !Number.isSafeInteger(frontier.endingSubmissionSequence)
    || !Number.isSafeInteger(frontier.endingCompletedSequence)
    || frontier.endingCompletedSequence < frontier.targetSubmissionSequence
    || frontier.completionFailures !== 0 || frontier.status !== 'healthy'
    || frontier.observationComplete !== true) failures.push(`${prefix}:completed-presentation-frontier`);
  const audio = action.audio;
  exactKeys(audio, ['contextState', 'prepared', 'retainedSources'], `${prefix}:audio`, failures);
  if (!object(audio) || audio.contextState !== 'running' || audio.prepared !== true
    || audio.retainedSources !== 3) failures.push(`${prefix}:audio-action-prewarm`);
}

function validateRuntime(runtime, prefix, failures) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentation',
  ], prefix, failures);
  exactKeys(runtime?.presentation, ['status'], `${prefix}:presentation`, failures);
  if (!object(runtime) || runtime.requestedBackend !== 'webgpu'
    || runtime.actualBackend !== 'webgpu' || runtime.initialized !== true
    || runtime.adapterClass !== 'GPUAdapter' || runtime.deviceClass !== 'GPUDevice'
    || runtime.softwareAdapter !== false
    || typeof runtime.adapterLabel !== 'string' || runtime.adapterLabel.trim() === ''
    || SOFTWARE_ADAPTER.test(runtime.adapterLabel)
    || runtime.deviceLost !== false || runtime.uncapturedErrors !== 0
    || runtime.presentation?.status !== 'healthy') failures.push(`${prefix}:native-webgpu-runtime`);
}

function validateTrial(trial, grenade, record, prefix, failures) {
  exactKeys(trial, [
    'grenade', 'servedCandidate', 'browser', 'runtime', 'cold', 'warm', 'audio', 'faults',
  ], prefix, failures);
  exactKeys(trial?.servedCandidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256',
    'exactRootFileCount',
  ], `${prefix}:served-candidate`, failures);
  if (!object(trial) || trial.grenade !== grenade
    || !object(trial.servedCandidate)
    || trial.servedCandidate.schemaVersion !== 4
    || trial.servedCandidate.channel !== 'the-big-one'
    || trial.servedCandidate.releasePass !== 'PASS 71'
    || trial.servedCandidate.path !== 'channels/the-big-one'
    || trial.servedCandidate.sourceSha !== record.source.servedSourceSha
    || trial.servedCandidate.sourceSha !== record.source.expectedSourceSha
    || trial.servedCandidate.treeSha256 !== record.source.servedTreeSha256
    || trial.servedCandidate.exactRootFileCount !== record.source.servedFileCount) {
    failures.push(`${prefix}:independent-served-provenance`);
  }
  exactKeys(trial?.browser, ['channel', 'installed', 'userAgent', 'version'], `${prefix}:browser`, failures);
  if (!object(trial?.browser) || trial.browser.channel !== 'msedge'
    || trial.browser.installed !== true || !/Edg\//u.test(trial.browser.userAgent ?? '')
    || trial.browser.version !== record.browser.version
    || !String(trial.browser.userAgent ?? '').includes(`Edg/${record.browser.version}`)) {
    failures.push(`${prefix}:installed-edge-identity`);
  }
  exactKeys(trial?.runtime, ['cold', 'warm'], `${prefix}:runtime`, failures);
  validateRuntime(trial?.runtime?.cold, `${prefix}:cold`, failures);
  validateRuntime(trial?.runtime?.warm, `${prefix}:warm`, failures);
  validateAction(trial?.cold, grenade, 'cold', `${prefix}:cold`, failures);
  validateAction(trial?.warm, grenade, 'warm', `${prefix}:warm`, failures);
  const audio = trial?.audio;
  exactKeys(audio, [
    'prewarm', 'runtimeRetainedSources', 'runtimeRetainedAudibleGains',
    'continuousAmbienceSources', 'settled',
  ], `${prefix}:audio`, failures);
  exactKeys(audio?.prewarm, [
    'prepared', 'runs', 'sources', 'nodes', 'retainedBroadbandLoops',
  ], `${prefix}:audio:prewarm`, failures);
  exactKeys(audio?.settled, [
    'retainedSources', 'retainedAudibleGains', 'continuousAmbienceSources',
  ], `${prefix}:audio:settled`, failures);
  if (!object(audio) || !object(audio.prewarm)
    || audio.prewarm.prepared !== true || audio.prewarm.runs !== 1
    || audio.prewarm.sources !== 3 || audio.prewarm.nodes !== 6
    || audio.prewarm.retainedBroadbandLoops !== 0
    || audio.runtimeRetainedSources !== 12
    || !Number.isSafeInteger(audio.runtimeRetainedAudibleGains)
    || audio.runtimeRetainedAudibleGains < 0 || audio.runtimeRetainedAudibleGains > 3
    || audio.continuousAmbienceSources !== 0
    || !object(audio.settled) || audio.settled.retainedSources !== 12
    || audio.settled.retainedAudibleGains !== 0
    || audio.settled.continuousAmbienceSources !== 0) failures.push(`${prefix}:audio-lifecycle`);
  if (!Array.isArray(trial?.faults) || trial.faults.length !== 0) failures.push(`${prefix}:faults`);
}

export function pass71GrenadeNativeEvidenceFailures(record, expected) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_GRENADE_NATIVE_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_GRENADE_NATIVE_EVIDENCE.evidenceId
    || record.kind !== PASS71_GRENADE_NATIVE_EVIDENCE.kind
    || record.contract !== PASS71_GRENADE_NATIVE_EVIDENCE.contract
    || record.gate !== PASS71_GRENADE_NATIVE_EVIDENCE.gate
    || record.status !== 'passed') return ['receipt-identity-or-status'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'gate', 'status', 'startedAt',
    'completedAt', 'capturedAt', 'invocation', 'source', 'environment', 'browser',
    'tooling', 'trials', 'faults', 'receiptSha256',
  ], 'receipt', failures);
  const source = record.source;
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'servedSourceSha', 'endingCheckoutSourceSha',
    'cleanBefore', 'cleanAfter', 'servedTreeSha256', 'servedFileCount',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(expected?.sourceSha ?? '')
    || source.expectedSourceSha !== expected.sourceSha
    || source.checkoutSourceSha !== expected.sourceSha
    || source.servedSourceSha !== expected.sourceSha
    || source.endingCheckoutSourceSha !== expected.sourceSha
    || source.cleanBefore !== true || source.cleanAfter !== true
    || !SHA256.test(source.servedTreeSha256 ?? '')
    || !Number.isSafeInteger(source.servedFileCount) || source.servedFileCount < 2) {
    failures.push('exact-source-and-served-provenance');
  }
  exactKeys(record.invocation, [
    'runner', 'expectedSourceSha', 'previewPort', 'renderer', 'renderProfile', 'evidenceMode',
    'playwrightProject', 'workers', 'retries', 'browserProcessCount', 'dependencyPreflight',
    'previewOwnership',
  ], 'invocation', failures);
  if (record.invocation?.runner !== PASS71_GRENADE_NATIVE_TOOL_PATHS.runner
    || record.invocation.expectedSourceSha !== expected?.sourceSha
    || !Number.isSafeInteger(record.invocation.previewPort)
    || record.invocation.previewPort < 1_024 || record.invocation.previewPort > 65_535
    || record.invocation.renderer !== 'webgpu'
    || record.invocation.renderProfile !== 'performance'
    || record.invocation.evidenceMode !== 'native-no-freeze'
    || record.invocation.playwrightProject !== 'chromium'
    || record.invocation.workers !== 1 || record.invocation.retries !== 0
    || record.invocation.dependencyPreflight !== 'npm@10.9.8-ci-dry-run'
    || record.invocation.previewOwnership !== 'owned-fresh-staged-topology-per-grenade'
    || record.invocation.browserProcessCount !== PASS71_GRENADE_NATIVE_EVIDENCE.grenades.length) {
    failures.push('exact-native-invocation');
  }
  exactKeys(record.environment, ['platform', 'arch'], 'environment', failures);
  if (record.environment?.platform !== 'win32' || typeof record.environment?.arch !== 'string'
    || record.environment.arch.trim() === '') failures.push('windows-environment');
  exactKeys(record.browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion',
    'installRoot', 'authenticodeStatus', 'authenticodeSigner', 'version', 'isolation',
  ], 'browser', failures);
  if (!object(record.browser) || record.browser.channel !== 'msedge'
    || record.browser.installed !== true || record.browser.executableName !== 'msedge.exe'
    || !SHA256.test(record.browser.executableSha256 ?? '')
    || typeof record.browser.executableVersion !== 'string'
    || !/^\d+(?:\.\d+){3}$/u.test(record.browser.executableVersion)
    || record.browser.version !== record.browser.executableVersion
    || !/[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(record.browser.installRoot ?? '')
    || record.browser.authenticodeStatus !== 'Valid'
    || !/\bMicrosoft Corporation\b/iu.test(record.browser.authenticodeSigner ?? '')
    || record.browser.isolation !== 'fresh-edge-process-and-profile-per-grenade') {
    failures.push('installed-edge-executable');
  }
  if (!object(record.tooling) || !object(expected?.tooling)
    || Object.entries(expected.tooling).some(([field, value]) => (
      !SHA256.test(value ?? '') || record.tooling[field] !== value
    )) || Object.keys(record.tooling).sort().join(',') !== Object.keys(expected.tooling).sort().join(',')) {
    failures.push('preview-tooling-hashes');
  }
  if (!Array.isArray(record.trials)
    || !sameJson(record.trials.map((trial) => trial?.grenade), PASS71_GRENADE_NATIVE_EVIDENCE.grenades)) {
    failures.push('all-four-grenade-trials');
  } else for (const [index, grenade] of PASS71_GRENADE_NATIVE_EVIDENCE.grenades.entries()) {
    validateTrial(record.trials[index], grenade, record, `trial:${grenade}`, failures);
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || !isoTimestamp(record.capturedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)
    || record.capturedAt !== record.completedAt) {
    failures.push('run-timestamps');
  }
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71GrenadeNativeRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71GrenadeNativeEvidence(record, expected) {
  const failures = pass71GrenadeNativeEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 grenade native evidence failed: ${failures.join(', ')}`);
  return record;
}

function fixtureBaseline(label) {
  const gapsMs = Array.from({ length: 22 }, () => 16);
  return {
    label, observationMs: 352, frameSamples: gapsMs.length, gapsMs,
    p50GapMs: 16, p95GapMs: 16, maximumGapMs: 16,
    presentationStatus: 'healthy',
    startingPresentedFrame: 100, endingPresentedFrame: 122,
    startingSubmissionSequence: 100, startingCompletedSequence: 100,
    targetSubmissionSequence: 101, endingSubmissionSequence: 122, endingCompletedSequence: 122,
    firstPresentedFrameDelayMs: 16, firstSubmissionDelayMs: 16,
    firstCompletionDelayMs: 16, maximumPendingForMs: 0, completionFailures: 0,
  };
}

function fixtureAction(grenade, phase, nonce) {
  const baseline = fixtureBaseline(`${grenade}-${phase}-preaction-baseline`);
  return {
    phase,
    baseline,
    budget: expectedBudget(baseline),
    measurement: {
      internalHandlerSyncMs: 1, outerHandlerSyncMs: 2, eventToNextAnimationFrameMs: 16,
      maximumAnimationFrameGapMs: 17, maximumFrameWorkMs: 4, maximumPendingForMs: 0,
      firstSubmissionDelayMs: 16, firstCompletionDelayMs: 16,
    },
    frontier: {
      actionNonce: nonce, grenade, cold: phase === 'cold', frameSamples: 22,
      startingSubmissionSequence: 100, startingCompletedSequence: 100,
      targetSubmissionSequence: 101, endingSubmissionSequence: 122, endingCompletedSequence: 122,
      completionFailures: 0, status: 'healthy', observationComplete: true,
    },
    audio: { contextState: 'running', prepared: true, retainedSources: 3 },
  };
}

export function createPass71GrenadeNativeEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? {
    runnerSha256: '1'.repeat(64), contractSha256: '2'.repeat(64),
    specSha256: '3'.repeat(64), frameActionBudgetSha256: '4'.repeat(64),
  };
  const runtime = {
    requestedBackend: 'webgpu', actualBackend: 'webgpu', initialized: true,
    adapterClass: 'GPUAdapter', deviceClass: 'GPUDevice',
    adapterLabel: 'NVIDIA GeForce RTX 5080', softwareAdapter: false,
    deviceLost: false, uncapturedErrors: 0, presentation: { status: 'healthy' },
  };
  const servedCandidate = {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71',
    sourceSha, path: 'channels/the-big-one',
    treeSha256: 'b'.repeat(64), exactRootFileCount: 500,
  };
  const version = '151.0.4129.72';
  const trials = PASS71_GRENADE_NATIVE_EVIDENCE.grenades.map((grenade, index) => ({
    grenade,
    servedCandidate,
    browser: {
      channel: 'msedge', installed: true,
      userAgent: `Mozilla/5.0 Edg/${version}`, version,
    },
    runtime: { cold: runtime, warm: runtime },
    cold: fixtureAction(grenade, 'cold', index * 2 + 1),
    warm: fixtureAction(grenade, 'warm', index * 2 + 2),
    audio: {
      prewarm: { prepared: true, runs: 1, sources: 3, nodes: 6, retainedBroadbandLoops: 0 },
      runtimeRetainedSources: 12, runtimeRetainedAudibleGains: 3,
      continuousAmbienceSources: 0,
      settled: { retainedSources: 12, retainedAudibleGains: 0, continuousAmbienceSources: 0 },
    },
    faults: [],
  }));
  const record = {
    schemaVersion: PASS71_GRENADE_NATIVE_EVIDENCE.schemaVersion,
    evidenceId: PASS71_GRENADE_NATIVE_EVIDENCE.evidenceId,
    kind: PASS71_GRENADE_NATIVE_EVIDENCE.kind,
    contract: PASS71_GRENADE_NATIVE_EVIDENCE.contract,
    gate: PASS71_GRENADE_NATIVE_EVIDENCE.gate,
    status: 'passed',
    startedAt: options.startedAt ?? '2026-07-24T09:01:00.000Z',
    completedAt: options.completedAt ?? '2026-07-24T09:05:00.000Z',
    capturedAt: options.completedAt ?? '2026-07-24T09:05:00.000Z',
    invocation: {
      runner: PASS71_GRENADE_NATIVE_TOOL_PATHS.runner,
      expectedSourceSha: sourceSha, previewPort: 4564, renderer: 'webgpu',
      renderProfile: 'performance', evidenceMode: 'native-no-freeze',
      playwrightProject: 'chromium', workers: 1, retries: 0, browserProcessCount: 4,
      dependencyPreflight: 'npm@10.9.8-ci-dry-run',
      previewOwnership: 'owned-fresh-staged-topology-per-grenade',
    },
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha,
      servedSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      cleanBefore: true, cleanAfter: true,
      servedTreeSha256: servedCandidate.treeSha256,
      servedFileCount: servedCandidate.exactRootFileCount,
    },
    environment: { platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe',
      executableSha256: 'c'.repeat(64), executableVersion: version, version,
      installRoot: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
      authenticodeStatus: 'Valid',
      authenticodeSigner: 'CN=Microsoft Corporation, O=Microsoft Corporation, C=US',
      isolation: 'fresh-edge-process-and-profile-per-grenade',
    },
    tooling,
    trials,
    faults: [],
  };
  record.receiptSha256 = pass71GrenadeNativeRecordSha256(record);
  return record;
}
