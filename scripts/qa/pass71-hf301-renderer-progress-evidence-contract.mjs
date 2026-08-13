import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_HF301_RENDERER_PROGRESS_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-301',
  kind: 'pass71-hf301-renderer-forward-progress-closure',
  contract: 'atomic-acres/pass71-hf301-renderer-forward-progress-closure@1',
  feedbackId: 'HF-301',
  status: 'passed',
  coverageDisposition: 'exact-reproduction-and-bounded-native-action-matrix',
  closesFeedback: true,
  liveNoProgressThresholdMs: 1_000,
});

export const PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.evidenceId,
  kind: PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF301_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF301_TRACE_ORDER = Object.freeze([
  'combat-first-fire',
  'glass-first-breach',
  'grenade-first-frag',
  'support-first-chopper',
]);

export const PASS71_HF301_COVERAGE = Object.freeze({
  machine: 'dave-gaming-pc',
  browser: 'installed-authenticode-valid-microsoft-edge',
  adapter: 'native-nonsoftware-hardware',
  renderers: PASS71_HF301_RENDERERS,
  arena: 'atomic-acres',
  traceOrder: PASS71_HF301_TRACE_ORDER,
  traceWindowMs: Object.freeze({ minimum: 1_100, maximum: 3_000 }),
  failureFence: Object.freeze({
    thresholdMs: 1_000,
    capturedElapsedMs: 1_146,
    capturedPendingSubmissions: 2,
    exactFailure: 'Renderer presentation made no GPU progress for 1146ms (2 submission pending)',
  }),
  requiredProvenance: Object.freeze([
    'submission-and-completion-frontiers',
    'slow-node-compilation-count',
    'queue-pending-age',
    'long-tasks',
    'visibility-and-focus',
    'match-and-arena-lifecycle',
    'runtime-and-console-faults',
    'live-canvas-readback-tripwires',
  ]),
  closureBoundary: 'the reported foreground 1146ms/two-pending-submission regression on this exact machine, browser, candidate and bounded action sequence',
});

export const PASS71_HF301_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf301-renderer-progress-evidence.mjs',
  contract: 'scripts/qa/pass71-hf301-renderer-progress-evidence-contract.mjs',
  ownerCapture: 'scripts/qa/capture-pass71-hf301-renderer-owner.mts',
  browserSpec: 'tests/e2e/pass71-hf301-renderer-progress.spec.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  playwrightConfig: 'playwright.config.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  releaseChannels: 'release-channels.json',
  frameOwner: 'src/legacy-main.ts',
  rendererOwner: 'src/rendering/render-runtime.ts',
  rendererOwnerTests: 'src/rendering/render-runtime.test.ts',
  presentationContractTests: 'src/presentation-prewarm-contract.test.ts',
  compositorOwner: 'src/atomic-signal.ts',
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const EXPECTED_OWNER_REPLAY = Object.freeze({
  schemaVersion: 1,
  contract: 'atomic-acres/pass71-hf301-renderer-owner-replay@1',
  input: Object.freeze({
    activeMatch: true,
    menuHidden: true,
    documentVisible: true,
    documentFocused: true,
    arenaSelectionReady: true,
    debugRenderPaused: false,
    renderSubmissionPaused: false,
    backpressureActive: true,
    currentSubmissionGapMs: 1_146,
    pendingForMs: 1_146,
    stallThresholdMs: 1_000,
    submissionSequence: 2,
    completedSequence: 0,
  }),
  detected: Object.freeze({ kind: 'pending-completion', elapsedMs: 1_146 }),
  exactFailure: 'Renderer presentation made no GPU progress for 1146ms (2 submission pending)',
  missingSubmissionDetected: Object.freeze({ kind: 'missing-submission', elapsedMs: 1_146 }),
  hiddenOwnershipExcluded: true,
  schedulerGapDetectedAtThreshold: true,
  sourceAuditFailures: Object.freeze([]),
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...keys].sort())) {
    failures.push(`${label}:schema-fields`);
  }
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function pass71Hf301RecordSha256(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return sha256(Buffer.from(`${JSON.stringify(canonical(unsigned))}\n`, 'utf8'));
}

function gitShow(repositoryRoot, sourceSha, path) {
  return execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
}

export function pass71Hf301ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (typeof repositoryRoot !== 'string' || !SHA40.test(sourceSha ?? '')) {
    throw new Error('HF-301 tooling hashes require a repository root and exact source SHA');
  }
  return Object.fromEntries(Object.entries(PASS71_HF301_TOOL_PATHS).map(([name, path]) => [
    `${name}Sha256`, sha256(Buffer.from(gitShow(repositoryRoot, sourceSha, path), 'utf8')),
  ]));
}

export function pass71Hf301SourceTreeAtSource(repositoryRoot, sourceSha) {
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

export function pass71Hf301OwnerSourceFailures(sources) {
  const failures = [];
  const legacy = sources?.legacyMain;
  const renderer = sources?.renderRuntime;
  if (typeof legacy !== 'string' || typeof renderer !== 'string') return ['owner-source-unavailable'];
  if ((legacy.match(/const LIVE_WEBGPU_PRESENTATION_STALL_MS = 1_000;/gu) ?? []).length !== 1) {
    failures.push('live-threshold-not-exactly-1000ms');
  }
  if (!legacy.includes('stallThresholdMs: LIVE_WEBGPU_PRESENTATION_STALL_MS,')) {
    failures.push('live-detector-not-bound-to-frozen-threshold');
  }
  const monitorStart = legacy.indexOf('function monitorSelectedArenaRender(');
  const monitorEnd = legacy.indexOf('/**\n * Runtime error trap.', monitorStart);
  const monitor = monitorStart >= 0 && monitorEnd > monitorStart ? legacy.slice(monitorStart, monitorEnd) : '';
  if (!monitor.includes("if (liveStall?.kind === 'pending-completion') {")
    || monitor.includes("liveStall?.kind === 'pending-completion' &&")
    || monitor.includes('pending-completion\' && presentation.completionDeadlineExceeded')) {
    failures.push('pending-completion-not-unconditionally-fatal');
  }
  if (!monitor.includes('Renderer presentation made no GPU progress for ${Math.round(liveStall.elapsedMs)}ms')
    || !monitor.includes('presentation.submissionSequence - presentation.completedSequence')
    || !monitor.includes("if (liveStall?.kind === 'missing-submission')")) {
    failures.push('live-failure-reporting-drift');
  }
  if (!legacy.includes("resetWebGpuPresentationEpoch('foreground scheduler gap', now, false);")) {
    failures.push('scheduler-gap-rebases-pending-work');
  }
  if (!renderer.includes('if (Number.isFinite(input.pendingForMs) && input.pendingForMs >= input.stallThresholdMs)')
    || !renderer.includes("return Object.freeze({ kind: 'pending-completion', elapsedMs: Math.max(0, input.pendingForMs) });")) {
    failures.push('renderer-pending-detector-drift');
  }
  if (!renderer.includes('if (!input.backpressureActive && Number.isFinite(input.currentSubmissionGapMs)')
    || !renderer.includes('input.currentSubmissionGapMs >= input.stallThresholdMs')) {
    failures.push('renderer-missing-submission-detector-drift');
  }
  const logoStart = legacy.indexOf("function flashKillstreakLogo(kind: 'palantir' | 'us-flag')");
  const logoEnd = legacy.indexOf('function beginNuke(', logoStart);
  const logo = logoStart >= 0 && logoEnd > logoStart ? legacy.slice(logoStart, logoEnd) : '';
  if (!logo || /toDataURL|toBlob|getImageData|readPixels|readRenderTargetPixels/u.test(logo)) {
    failures.push('killstreak-action-path-canvas-readback');
  }
  const reportStart = legacy.indexOf('function reportRuntimeError(');
  const frameStart = legacy.indexOf('function frame(', reportStart);
  const report = reportStart >= 0 && frameStart > reportStart ? legacy.slice(reportStart, frameStart) : '';
  if (!report.includes('console.error(') || !report.includes('appendClientRuntimeLog({')
    || !report.includes("document.getElementById('runtime-error-log')")) {
    failures.push('caught-frame-error-not-observable');
  }
  const frameEnd = legacy.indexOf('// Multiplayer transport and snapshot timers', frameStart);
  const frame = frameStart >= 0 && frameEnd > frameStart ? legacy.slice(frameStart, frameEnd) : '';
  if (!frame.includes('monitorSelectedArenaRender(now);') || !frame.includes("reportRuntimeError('frame', error);")) {
    failures.push('frame-monitor-or-fault-route-drift');
  }
  return [...new Set(failures)].sort();
}

export function pass71Hf301OwnerReplayAtSource(repositoryRoot, sourceSha) {
  const sourceAuditFailures = pass71Hf301OwnerSourceFailures({
    legacyMain: gitShow(repositoryRoot, sourceSha, PASS71_HF301_TOOL_PATHS.frameOwner),
    renderRuntime: gitShow(repositoryRoot, sourceSha, PASS71_HF301_TOOL_PATHS.rendererOwner),
  });
  return { ...EXPECTED_OWNER_REPLAY, sourceAuditFailures };
}

function validateSource(record, expected, failures) {
  exactKeys(record, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!SHA40.test(expected.sourceSha ?? '') || record?.expectedSourceSha !== expected.sourceSha
    || record?.checkoutSourceSha !== expected.sourceSha || record?.endingCheckoutSourceSha !== expected.sourceSha
    || record?.sourceTreeSha !== expected.sourceTreeSha || !SHA40.test(record?.sourceTreeSha ?? '')
    || record?.releasePass !== 'PASS 71' || record?.cleanBefore !== true || record?.cleanAfter !== true) {
    failures.push('exact-clean-candidate-a-source');
  }
}

function validateServedCandidate(record, expected, failures) {
  exactKeys(record, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], 'served-candidate', failures);
  if (record?.schemaVersion !== 4 || record?.channel !== 'the-big-one' || record?.releasePass !== 'PASS 71'
    || record?.sourceSha !== expected.sourceSha || record?.path !== 'channels/the-big-one'
    || !SHA256.test(record?.treeSha256 ?? '') || !Number.isSafeInteger(record?.exactRootFileCount)
    || record.exactRootFileCount < 2) failures.push('exact-staged-candidate-a');
}

function validateBrowser(record, failures) {
  exactKeys(record, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion',
    'authenticodeStatus', 'authenticodeSigner', 'userAgents',
  ], 'browser', failures);
  if (record?.channel !== 'msedge' || record?.installed !== true || record?.executableName !== 'msedge.exe'
    || !SHA256.test(record?.executableSha256 ?? '') || typeof record?.executableVersion !== 'string'
    || record.executableVersion.length === 0 || record?.authenticodeStatus !== 'Valid'
    || !/Microsoft/iu.test(record?.authenticodeSigner ?? '') || !Array.isArray(record?.userAgents)
    || record.userAgents.length !== PASS71_HF301_RENDERERS.length
    || record.userAgents.some((entry) => typeof entry !== 'string' || !/Edg\//u.test(entry))) {
    failures.push('installed-edge-identity');
  }
}

function validateRuntime(runtime, renderer, failures, label) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'slowNodeBuildCount',
  ], `${label}:runtime`, failures);
  if (runtime?.requestedBackend !== renderer || runtime?.actualBackend !== renderer || runtime?.initialized !== true
    || typeof runtime?.adapterClass !== 'string' || runtime.adapterClass.length === 0
    || typeof runtime?.adapterLabel !== 'string' || runtime.adapterLabel.length === 0
    || runtime?.softwareAdapter !== false || SOFTWARE_ADAPTER.test(runtime.adapterLabel)
    || runtime?.deviceLost !== false || runtime?.uncapturedErrors !== 0
    || !integer(runtime?.slowNodeBuildCount)) failures.push(`${label}:native-runtime`);
  if (renderer === 'webgl2' && (runtime?.adapterClass !== 'WebGL2RenderingContext' || runtime?.deviceClass !== null)) {
    failures.push(`${label}:webgl2-identity`);
  }
  if (renderer === 'webgpu' && (typeof runtime?.deviceClass !== 'string' || runtime.deviceClass.length === 0)) {
    failures.push(`${label}:webgpu-identity`);
  }
}

const sampleKeys = [
  'elapsedMs', 'presentedFrame', 'status', 'submissionMode', 'submissionSequence',
  'completedSequence', 'inFlightSubmissions', 'pendingForMs', 'currentSubmissionGapMs',
  'currentCompletionGapMs', 'completionFailures', 'slowNodeBuildCount', 'visibilityState',
  'documentFocused',
];

function validateOutcome(trace, failures, label) {
  const outcome = trace?.outcome;
  if (trace?.id === 'combat-first-fire') {
    exactKeys(outcome, ['ammoBefore', 'ammoAfter'], `${label}:outcome`, failures);
    if (!integer(outcome?.ammoBefore) || outcome?.ammoAfter !== outcome.ammoBefore - 1) failures.push(`${label}:combat-outcome`);
  } else if (trace?.id === 'grenade-first-frag') {
    exactKeys(outcome, [
      'grenadesBefore', 'grenadesAfter', 'profileGrenade', 'profileCold', 'profileObservationComplete',
    ], `${label}:outcome`, failures);
    if (outcome?.grenadesBefore !== 1 || outcome?.grenadesAfter !== 0 || outcome?.profileGrenade !== 'frag'
      || outcome?.profileCold !== true || outcome?.profileObservationComplete !== true) failures.push(`${label}:grenade-outcome`);
  } else if (trace?.id === 'glass-first-breach') {
    exactKeys(outcome, [
      'windowId', 'brokenBefore', 'brokenAfter', 'apertureOpenAfter',
    ], `${label}:outcome`, failures);
    if (typeof outcome?.windowId !== 'string' || outcome.windowId.length === 0 || outcome?.brokenBefore !== false
      || outcome?.brokenAfter !== true || outcome?.apertureOpenAfter !== true) failures.push(`${label}:glass-outcome`);
  } else if (trace?.id === 'support-first-chopper') {
    exactKeys(outcome, [
      'accepted', 'entitiesBefore', 'entitiesAfter', 'chopperPresent',
    ], `${label}:outcome`, failures);
    if (outcome?.accepted !== true || !integer(outcome?.entitiesBefore) || !integer(outcome?.entitiesAfter)
      || outcome.entitiesAfter <= outcome.entitiesBefore || outcome?.chopperPresent !== true) failures.push(`${label}:support-outcome`);
  }
}

function validateTrace(trace, renderer, index, failures) {
  const label = `${renderer}:trace:${index}`;
  exactKeys(trace, [
    'id', 'durationMs', 'actionReturned', 'lifecycle', 'outcome', 'summary', 'samples',
    'longTaskObserverSupported', 'longTasks', 'readbacks',
  ], label, failures);
  if (trace?.id !== PASS71_HF301_TRACE_ORDER[index] || trace?.actionReturned !== true
    || !finite(trace?.durationMs) || trace.durationMs < PASS71_HF301_COVERAGE.traceWindowMs.minimum
    || trace.durationMs > PASS71_HF301_COVERAGE.traceWindowMs.maximum) failures.push(`${label}:identity-duration-action`);
  exactKeys(trace?.lifecycle, ['arenaId', 'matchPhase', 'gameStarted'], `${label}:lifecycle`, failures);
  if (trace?.lifecycle?.arenaId !== 'atomic-acres' || trace?.lifecycle?.matchPhase !== 'active'
    || trace?.lifecycle?.gameStarted !== true) failures.push(`${label}:foreground-lifecycle`);
  exactKeys(trace?.readbacks, [
    'webglReadPixels', 'webgl2ReadPixels', 'canvasToDataUrl', 'canvasToBlob', 'canvasGetImageData',
  ], `${label}:readbacks`, failures);
  if (Object.values(trace?.readbacks ?? {}).some((value) => value !== 0)) failures.push(`${label}:live-canvas-readback`);
  if (trace?.longTaskObserverSupported !== true || !Array.isArray(trace?.longTasks)
    || trace.longTasks.some((entry) => !object(entry) || !finite(entry.startTimeMs) || !finite(entry.durationMs)
      || entry.durationMs < 0 || entry.durationMs >= PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.liveNoProgressThresholdMs)) {
    failures.push(`${label}:long-task-provenance-or-stall`);
  }
  if (!Array.isArray(trace?.samples) || trace.samples.length < 20) {
    failures.push(`${label}:insufficient-samples`);
    return;
  }
  let prior = null;
  for (const [sampleIndex, sample] of trace.samples.entries()) {
    exactKeys(sample, sampleKeys, `${label}:sample:${sampleIndex}`, failures);
    if (!finite(sample?.elapsedMs) || !integer(sample?.presentedFrame) || !integer(sample?.submissionSequence)
      || !integer(sample?.completedSequence) || !integer(sample?.inFlightSubmissions)
      || !finite(sample?.pendingForMs) || !finite(sample?.currentSubmissionGapMs)
      || !finite(sample?.currentCompletionGapMs) || !integer(sample?.completionFailures)
      || !integer(sample?.slowNodeBuildCount) || sample?.visibilityState !== 'visible'
      || sample?.documentFocused !== true || !['synchronous', 'healthy'].includes(sample?.status)) {
      failures.push(`${label}:sample:${sampleIndex}:identity-health`);
    }
    if (sample?.pendingForMs >= PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.liveNoProgressThresholdMs
      || sample?.currentSubmissionGapMs >= PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.liveNoProgressThresholdMs
      || sample?.currentCompletionGapMs >= PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.liveNoProgressThresholdMs
      || sample?.completionFailures !== 0) failures.push(`${label}:sample:${sampleIndex}:no-progress-fence`);
    if (sample?.completedSequence > sample?.submissionSequence) failures.push(`${label}:sample:${sampleIndex}:frontier-order`);
    if (prior && (sample.elapsedMs < prior.elapsedMs || sample.presentedFrame < prior.presentedFrame
      || sample.submissionSequence < prior.submissionSequence || sample.completedSequence < prior.completedSequence
      || sample.slowNodeBuildCount !== prior.slowNodeBuildCount)) failures.push(`${label}:sample:${sampleIndex}:monotonicity-or-compile`);
    if (renderer === 'webgl2' && (sample?.status !== 'synchronous' || sample?.submissionMode !== 'synchronous'
      || sample?.submissionSequence !== 0 || sample?.completedSequence !== 0 || sample?.inFlightSubmissions !== 0)) {
      failures.push(`${label}:sample:${sampleIndex}:webgl2-synchronous-frontier`);
    }
    if (renderer === 'webgpu' && (sample?.status !== 'healthy' || sample?.submissionMode !== 'warmed-live'
      || sample?.inFlightSubmissions > 3)) failures.push(`${label}:sample:${sampleIndex}:webgpu-frontier`);
    prior = sample;
  }
  const first = trace.samples[0];
  const last = trace.samples.at(-1);
  const gaps = trace.samples.slice(1).map((sample, sampleIndex) => sample.elapsedMs - trace.samples[sampleIndex].elapsedMs);
  const derived = {
    sampleCount: trace.samples.length,
    presentedFrameAdvances: last.presentedFrame - first.presentedFrame,
    submissionAdvances: last.submissionSequence - first.submissionSequence,
    completionAdvances: last.completedSequence - first.completedSequence,
    maximumAnimationFrameGapMs: gaps.length > 0 ? Math.max(...gaps) : 0,
    maximumPendingForMs: Math.max(...trace.samples.map((sample) => sample.pendingForMs)),
    maximumSubmissionGapMs: Math.max(...trace.samples.map((sample) => sample.currentSubmissionGapMs)),
    maximumCompletionGapMs: Math.max(...trace.samples.map((sample) => sample.currentCompletionGapMs)),
    maximumInFlightSubmissions: Math.max(...trace.samples.map((sample) => sample.inFlightSubmissions)),
    startingSubmissionSequence: first.submissionSequence,
    startingCompletedSequence: first.completedSequence,
    endingSubmissionSequence: last.submissionSequence,
    endingCompletedSequence: last.completedSequence,
  };
  exactKeys(trace?.summary, Object.keys(derived), `${label}:summary`, failures);
  for (const [key, value] of Object.entries(derived)) {
    const actual = trace?.summary?.[key];
    const equal = Number.isInteger(value) ? actual === value : finite(actual) && Math.abs(actual - value) <= 0.001;
    if (!equal) failures.push(`${label}:summary:${key}`);
  }
  if (derived.presentedFrameAdvances <= 0 || derived.maximumAnimationFrameGapMs >= 1_000
    || derived.maximumPendingForMs >= 1_000 || derived.maximumSubmissionGapMs >= 1_000
    || derived.maximumCompletionGapMs >= 1_000) failures.push(`${label}:forward-progress`);
  if (renderer === 'webgpu' && (derived.submissionAdvances <= 0 || derived.completionAdvances <= 0
    || derived.endingCompletedSequence < derived.startingSubmissionSequence + 1)) {
    failures.push(`${label}:webgpu-completed-submission`);
  }
  validateOutcome(trace, failures, label);
}

function validateScope(scope, renderer, expected, failures) {
  const label = `scope:${renderer}`;
  exactKeys(scope, [
    'renderer', 'expectedSourceSha', 'checkoutSourceSha', 'servedCandidate', 'browser',
    'runtime', 'scene', 'traceOrder', 'traces', 'runtimeErrorLog', 'faults',
  ], label, failures);
  if (scope?.renderer !== renderer || scope?.expectedSourceSha !== expected.sourceSha
    || scope?.checkoutSourceSha !== expected.sourceSha) failures.push(`${label}:exact-source`);
  validateServedCandidate(scope?.servedCandidate, expected, failures);
  exactKeys(scope?.browser, ['version', 'userAgent'], `${label}:browser`, failures);
  if (typeof scope?.browser?.version !== 'string' || scope.browser.version.length === 0
    || !/Edg\//u.test(scope?.browser?.userAgent ?? '')) failures.push(`${label}:edge-runtime-identity`);
  validateRuntime(scope?.runtime, renderer, failures, label);
  exactKeys(scope?.scene, ['arenaId', 'matchPhase', 'supportAssetsReady'], `${label}:scene`, failures);
  if (scope?.scene?.arenaId !== 'atomic-acres' || scope?.scene?.matchPhase !== 'active'
    || scope?.scene?.supportAssetsReady !== true) failures.push(`${label}:scene-not-ready`);
  if (!sameJson(scope?.traceOrder, PASS71_HF301_TRACE_ORDER) || !Array.isArray(scope?.traces)
    || scope.traces.length !== PASS71_HF301_TRACE_ORDER.length) failures.push(`${label}:trace-matrix`);
  else scope.traces.forEach((trace, index) => validateTrace(trace, renderer, index, failures));
  if (scope?.runtimeErrorLog !== '' || !Array.isArray(scope?.faults) || scope.faults.length !== 0) {
    failures.push(`${label}:swallowed-or-browser-errors`);
  }
}

export function pass71Hf301EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.kind
    || record.contract !== PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.feedbackId
    || record.status !== 'passed' || record.coverageDisposition !== PASS71_HF301_RENDERER_PROGRESS_EVIDENCE.coverageDisposition
    || record.closesFeedback !== true || record.liveNoProgressThresholdMs !== 1_000) {
    return ['hf301-identity-status-threshold-or-closure'];
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closesFeedback', 'liveNoProgressThresholdMs', 'startedAt',
    'completedAt', 'source', 'servedCandidate', 'environment', 'browser', 'tooling',
    'coverage', 'ownerReplay', 'scopes', 'faults', 'receiptSha256',
  ], 'record', failures);
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  validateBrowser(record.browser, failures);
  const toolingKeys = Object.keys(PASS71_HF301_TOOL_PATHS).map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingKeys)
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) failures.push('candidate-a-tooling-hashes');
  if (!sameJson(record.coverage, PASS71_HF301_COVERAGE)) failures.push('literal-coverage-contract');
  if (!sameJson(record.ownerReplay, expected.ownerReplay ?? EXPECTED_OWNER_REPLAY)) failures.push('real-owner-replay');
  if (!Array.isArray(record.scopes) || record.scopes.length !== PASS71_HF301_RENDERERS.length
    || !sameJson(record.scopes.map((scope) => scope?.renderer), PASS71_HF301_RENDERERS)) {
    failures.push('exact-renderer-scope-set');
  } else record.scopes.forEach((scope, index) => validateScope(scope, PASS71_HF301_RENDERERS[index], expected, failures));
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '') || record.receiptSha256 !== pass71Hf301RecordSha256(record)) {
    failures.push('receipt-sha256');
  }
  return [...new Set(failures)].sort();
}

export function assertPass71Hf301Evidence(record, expected) {
  const failures = pass71Hf301EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-301 renderer evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf301EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR,
    closesFeedback: true,
    validate(record, context) {
      try {
        const sourceSha = context?.sourceSha;
        const root = context?.repositoryRoot;
        return pass71Hf301EvidenceFailures(record, {
          sourceSha,
          sourceTreeSha: context?.options?.pass71Hf301SourceTreeSha
            ?? pass71Hf301SourceTreeAtSource(root, sourceSha),
          tooling: context?.options?.pass71Hf301Tooling
            ?? pass71Hf301ToolingHashesAtSource(root, sourceSha),
          ownerReplay: context?.options?.pass71Hf301OwnerReplay
            ?? pass71Hf301OwnerReplayAtSource(root, sourceSha),
        });
      } catch (error) {
        return [`hf301-tooling-or-owner-source-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY = createPass71Hf301EvidenceRegistryEntry();

function fixtureSample(renderer, index, slowNodeBuildCount) {
  const sequence = renderer === 'webgpu' ? 20 + index : 0;
  return {
    elapsedMs: index * 60,
    presentedFrame: 100 + index,
    status: renderer === 'webgpu' ? 'healthy' : 'synchronous',
    submissionMode: renderer === 'webgpu' ? 'warmed-live' : 'synchronous',
    submissionSequence: sequence,
    completedSequence: renderer === 'webgpu' ? sequence : 0,
    inFlightSubmissions: 0,
    pendingForMs: 0,
    currentSubmissionGapMs: renderer === 'webgpu' ? 4 : 0,
    currentCompletionGapMs: renderer === 'webgpu' ? 4 : 0,
    completionFailures: 0,
    slowNodeBuildCount,
    visibilityState: 'visible',
    documentFocused: true,
  };
}

function fixtureOutcome(id) {
  if (id === 'combat-first-fire') return { ammoBefore: 30, ammoAfter: 29 };
  if (id === 'grenade-first-frag') return {
    grenadesBefore: 1, grenadesAfter: 0, profileGrenade: 'frag', profileCold: true, profileObservationComplete: true,
  };
  if (id === 'glass-first-breach') return {
    windowId: 'fixture-pane', brokenBefore: false, brokenAfter: true, apertureOpenAfter: true,
  };
  return { accepted: true, entitiesBefore: 0, entitiesAfter: 1, chopperPresent: true };
}

function fixtureTrace(renderer, id, index) {
  const samples = Array.from({ length: 21 }, (_, sampleIndex) => fixtureSample(renderer, sampleIndex, 3));
  const first = samples[0];
  const last = samples.at(-1);
  return {
    id,
    durationMs: 1_200,
    actionReturned: true,
    lifecycle: { arenaId: 'atomic-acres', matchPhase: 'active', gameStarted: true },
    outcome: fixtureOutcome(id),
    summary: {
      sampleCount: samples.length,
      presentedFrameAdvances: last.presentedFrame - first.presentedFrame,
      submissionAdvances: last.submissionSequence - first.submissionSequence,
      completionAdvances: last.completedSequence - first.completedSequence,
      maximumAnimationFrameGapMs: 60,
      maximumPendingForMs: 0,
      maximumSubmissionGapMs: renderer === 'webgpu' ? 4 : 0,
      maximumCompletionGapMs: renderer === 'webgpu' ? 4 : 0,
      maximumInFlightSubmissions: 0,
      startingSubmissionSequence: first.submissionSequence,
      startingCompletedSequence: first.completedSequence,
      endingSubmissionSequence: last.submissionSequence,
      endingCompletedSequence: last.completedSequence,
    },
    samples,
    longTaskObserverSupported: true,
    longTasks: [],
    readbacks: {
      webglReadPixels: 0, webgl2ReadPixels: 0, canvasToDataUrl: 0, canvasToBlob: 0, canvasGetImageData: 0,
    },
  };
}

export function createPass71Hf301EvidenceFixture({
  sourceSha,
  sourceTreeSha,
  tooling,
  ownerReplay = EXPECTED_OWNER_REPLAY,
  startedAt = '2026-08-13T20:00:00.000Z',
  completedAt = '2026-08-13T20:02:00.000Z',
}) {
  const servedCandidate = {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
    path: 'channels/the-big-one', treeSha256: 'b'.repeat(64), exactRootFileCount: 7,
  };
  const scopes = PASS71_HF301_RENDERERS.map((renderer) => ({
    renderer,
    expectedSourceSha: sourceSha,
    checkoutSourceSha: sourceSha,
    servedCandidate: { ...servedCandidate },
    browser: { version: '140.0.0.0', userAgent: 'Mozilla/5.0 Edg/140.0.0.0' },
    runtime: {
      requestedBackend: renderer,
      actualBackend: renderer,
      initialized: true,
      adapterClass: renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
      deviceClass: renderer === 'webgpu' ? 'GPUDevice' : null,
      adapterLabel: 'NVIDIA GeForce RTX 5080',
      softwareAdapter: false,
      deviceLost: false,
      uncapturedErrors: 0,
      slowNodeBuildCount: 3,
    },
    scene: { arenaId: 'atomic-acres', matchPhase: 'active', supportAssetsReady: true },
    traceOrder: [...PASS71_HF301_TRACE_ORDER],
    traces: PASS71_HF301_TRACE_ORDER.map((id, index) => fixtureTrace(renderer, id, index)),
    runtimeErrorLog: '',
    faults: [],
  }));
  const record = {
    ...PASS71_HF301_RENDERER_PROGRESS_EVIDENCE,
    startedAt,
    completedAt,
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      sourceTreeSha, releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true,
    },
    servedCandidate,
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'c'.repeat(64),
      executableVersion: '140.0.0.0', authenticodeStatus: 'Valid', authenticodeSigner: 'Microsoft Corporation',
      userAgents: scopes.map((scope) => scope.browser.userAgent),
    },
    tooling: { ...tooling },
    coverage: PASS71_HF301_COVERAGE,
    ownerReplay,
    scopes,
    faults: [],
  };
  record.receiptSha256 = pass71Hf301RecordSha256(record);
  return record;
}
