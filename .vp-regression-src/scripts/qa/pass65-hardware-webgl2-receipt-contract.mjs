import { createHash } from 'node:crypto';

export const HARDWARE_WEBGL2_TEST_ID = 'T-COLD-HARDWARE-WEBGL2';
export const HARDWARE_WEBGL2_ARENAS = Object.freeze([
  'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range',
]);

export function receiptSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function percentile(ordered, fraction) {
  return ordered[Math.floor((ordered.length - 1) * fraction)];
}

function summarize(intervals, windowMs) {
  const ordered = [...intervals].sort((left, right) => left - right);
  const count = (threshold) => ordered.filter((interval) => interval > threshold).length;
  const longFrames = {
    over20Ms: count(20), over33Ms: count(33), over50Ms: count(50), over100Ms: count(100),
  };
  const per1000 = (value) => rounded(value * 1_000 / ordered.length);
  return {
    windowMs: rounded(windowMs),
    sampleCount: ordered.length,
    rejectedSampleCount: 0,
    cadenceHz: rounded(ordered.length * 1_000 / windowMs),
    p50Ms: rounded(percentile(ordered, 0.5)),
    p95Ms: rounded(percentile(ordered, 0.95)),
    p99Ms: rounded(percentile(ordered, 0.99)),
    maxMs: rounded(ordered.at(-1)),
    longFrames,
    longFrameRates: {
      over20MsPer1000: per1000(longFrames.over20Ms),
      over33MsPer1000: per1000(longFrames.over33Ms),
      over50MsPer1000: per1000(longFrames.over50Ms),
      over100MsPer1000: per1000(longFrames.over100Ms),
    },
  };
}

function compareAtomicAgainstTerminal(atomic, terminal) {
  const issues = [];
  const materiallyBelow = (candidate, baseline, fixed, fraction) => candidate < baseline - Math.max(fixed, baseline * fraction);
  const materiallyAbove = (candidate, baseline, fixed, fraction) => candidate > baseline + Math.max(fixed, baseline * fraction);
  if (materiallyBelow(atomic.cadenceHz, terminal.cadenceHz, 5, 0.05)) issues.push('atomic-cadence-materially-worse');
  if (materiallyAbove(atomic.maxMs, terminal.maxMs, 12, 0.30)) issues.push('atomic-max-materially-worse');
  if (atomic.longFrameRates.over20MsPer1000 > terminal.longFrameRates.over20MsPer1000 + 15) issues.push('atomic-over20-materially-worse');
  if (atomic.longFrameRates.over33MsPer1000 > terminal.longFrameRates.over33MsPer1000 + 5) issues.push('atomic-over33-materially-worse');
  if (atomic.longFrameRates.over50MsPer1000 > terminal.longFrameRates.over50MsPer1000 + 2) issues.push('atomic-over50-materially-worse');
  return issues;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateRuntime(audit, label, errors) {
  const runtime = object(audit?.runtime);
  if (!runtime) {
    errors.push(`${label}:runtime-missing`);
    return;
  }
  if (runtime.requestedBackend !== 'webgl2' || runtime.actualBackend !== 'webgl2' || runtime.initialized !== true) {
    errors.push(`${label}:webgl2-not-active`);
  }
  if (runtime.adapterClass !== 'WebGL2RenderingContext' || runtime.softwareAdapter !== false
    || typeof runtime.adapterLabel !== 'string' || !/ANGLE/i.test(runtime.adapterLabel)
    || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/i.test(runtime.adapterLabel)) {
    errors.push(`${label}:hardware-angle-proof-invalid`);
  }
  const lifecycle = object(runtime.contextLifecycle);
  if (!lifecycle || lifecycle.lost !== false || lifecycle.losses !== 0 || lifecycle.restorations !== 0) {
    errors.push(`${label}:context-lifecycle-invalid`);
  }
  if (runtime.deviceLost !== false || runtime.uncapturedErrors !== 0) errors.push(`${label}:runtime-errors`);
}

function validateArena(arena, trialIndex, errors) {
  const label = `trial-${trialIndex}:${arena?.arenaId ?? '<missing>'}`;
  if (!HARDWARE_WEBGL2_ARENAS.includes(arena?.arenaId)) errors.push(`${label}:unknown-arena`);
  if (!Array.isArray(arena?.issues) || arena.issues.length !== 0) errors.push(`${label}:arena-issues`);
  const loading = object(arena?.loadingAudit);
  if (!loading || loading.lifecycle !== 'deploying' || loading.visible !== true || loading.arena !== arena.arenaId
    || !['shared-prerecorded-video', 'reduced-motion-poster'].includes(loading.media) || loading.liveRender !== 'false') {
    errors.push(`${label}:loading-surface-invalid`);
  }
  const admission = object(arena?.admission);
  const timing = object(admission?.timing);
  if (!timing) errors.push(`${label}:admission-timing-missing`);
  else {
    const transitionMs = timing.transitionReadyAt - timing.deploymentStartedAt;
    const firstLiveMs = timing.firstGameplayPresentedAt - timing.deploymentStartedAt;
    const activeMs = timing.activeAt - timing.deploymentStartedAt;
    if (![transitionMs, firstLiveMs, activeMs].every((value) => Number.isFinite(value))) errors.push(`${label}:admission-timing-non-finite`);
    if (!(timing.deploymentStartedAt <= timing.transitionReadyAt
      && timing.transitionReadyAt <= timing.firstGameplayPresentedAt
      && timing.firstGameplayPresentedAt <= timing.activeAt)) errors.push(`${label}:admission-timing-order-invalid`);
    if (transitionMs < 0 || transitionMs > 10_000) errors.push(`${label}:transition-ready-over-10000ms`);
    if (firstLiveMs < 0 || firstLiveMs > 10_000) errors.push(`${label}:first-live-over-10000ms`);
    if (activeMs < firstLiveMs || activeMs > 15_000) errors.push(`${label}:active-over-15000ms`);
  }
  if (!Array.isArray(admission?.longTasks)) errors.push(`${label}:admission-long-task-ledger-missing`);
  const readPixels = Array.isArray(admission?.readPixels) ? admission.readPixels : [];
  if (readPixels.length > 3) errors.push(`${label}:admission-readpixels-over-3`);
  for (const event of readPixels) {
    if (event.width !== 1 || event.height !== 1 || typeof event.stack !== 'string'
      || !/validateOutput/.test(event.stack)
      || !timing || !Number.isFinite(event.at) || event.at >= timing.transitionReadyAt) {
      errors.push(`${label}:admission-readpixels-invalid`);
    }
  }
  if (!Array.isArray(admission?.physicalSoloStarts) || admission.physicalSoloStarts.length !== 1
    || admission.physicalSoloStarts[0]?.isTrusted !== true) {
    errors.push(`${label}:physical-solo-proof-invalid`);
  }
  if (admission?.readPixelsTripwireInstalled !== true
    || admission?.expectedAdmissionGeneration === null
    || admission?.observedAdmissionGeneration !== admission?.expectedAdmissionGeneration) {
    errors.push(`${label}:tripwire-or-admission-generation-invalid`);
  }

  let recomputedSummary = null;
  let recomputedIntervals = [];
  let recomputedElapsedMs = 0;
  const steady = object(arena?.steady);
  const window = object(steady?.frameWindow);
  const postReadyWindow = object(admission?.postReadyFrameWindow);
  if (!steady || steady.requestedWindowMs !== 10_000 || !window || window.elapsedMs < 10_000
    || window.observerSupported !== true || !Array.isArray(window.intervalsMs)) {
    errors.push(`${label}:steady-window-invalid`);
  } else {
    const intervals = window.intervalsMs;
    const invalidIntervals = intervals.length === 0
      || intervals.some((interval) => !Number.isFinite(interval) || interval <= 0 || interval >= 50);
    if (invalidIntervals) {
      errors.push(`${label}:steady-interval-invalid`);
    }
    if (intervals.length < Math.floor(window.elapsedMs * 45 / 1_000)) errors.push(`${label}:steady-sample-count-low`);
    if (!Array.isArray(window.longTasks) || window.longTasks.length !== 0) errors.push(`${label}:steady-long-task`);
    if (!Array.isArray(window.readPixels) || window.readPixels.length !== 0) errors.push(`${label}:steady-readpixels`);
    const intervalTotalMs = intervals.reduce((total, interval) => total + interval, 0);
    const continuityToleranceMs = Math.max(1, intervals.length * 0.001);
    if (!Number.isFinite(window.startedAt) || !Number.isFinite(window.endedAt)
      || rounded(window.endedAt - window.startedAt) !== window.elapsedMs
      || Math.abs(intervalTotalMs - window.elapsedMs) > continuityToleranceMs) {
      errors.push(`${label}:steady-window-not-continuous`);
    }
    if (!invalidIntervals) {
      const expectedSummary = summarize(intervals, window.elapsedMs);
      recomputedSummary = expectedSummary;
      recomputedIntervals = intervals;
      recomputedElapsedMs = window.elapsedMs;
      if (!sameJson(steady.summary, expectedSummary)) errors.push(`${label}:steady-summary-forged-or-stale`);
      if (expectedSummary.p50Ms > 18.5 || expectedSummary.p95Ms > 20 || expectedSummary.p99Ms > 33
        || expectedSummary.maxMs > 100 || expectedSummary.longFrames.over100Ms > 0
        || expectedSummary.longFrameRates.over20MsPer1000 > 50
        || expectedSummary.longFrameRates.over33MsPer1000 > 10) {
        errors.push(`${label}:steady-frozen-threshold-failed`);
      }
    }
  }

  if (!postReadyWindow || !timing || !window || postReadyWindow.observerSupported !== true
    || !Array.isArray(postReadyWindow.intervalsMs) || postReadyWindow.intervalsMs.length === 0
    || !Array.isArray(postReadyWindow.longTasks) || postReadyWindow.longTasks.length !== 0
    || !Array.isArray(postReadyWindow.readPixels) || postReadyWindow.readPixels.length !== 0) {
    errors.push(`${label}:post-ready-window-invalid`);
  } else {
    const postReadyIntervals = postReadyWindow.intervalsMs;
    const postReadyIntervalTotalMs = postReadyIntervals.reduce((total, interval) => total + interval, 0);
    const continuityToleranceMs = Math.max(1, postReadyIntervals.length * 0.001);
    if (postReadyWindow.startedAt !== timing.transitionReadyAt
      || postReadyWindow.endedAt !== window.startedAt
      || timing.firstGameplayPresentedAt > postReadyWindow.endedAt
      || timing.activeAt > postReadyWindow.endedAt
      || !Number.isFinite(postReadyWindow.elapsedMs) || postReadyWindow.elapsedMs <= 0
      || rounded(postReadyWindow.endedAt - postReadyWindow.startedAt) !== postReadyWindow.elapsedMs
      || postReadyIntervals.some((interval) => !Number.isFinite(interval) || interval <= 0 || interval >= 50)
      || Math.abs(postReadyIntervalTotalMs - postReadyWindow.elapsedMs) > continuityToleranceMs) {
      errors.push(`${label}:post-ready-window-not-continuous-or-hitch-free`);
    }
  }

  const progress = object(steady?.progress);
  const progressBefore = object(progress?.before);
  const progressAfter = object(progress?.after);
  const progressDelta = object(progress?.delta);
  const minimumExpectedProgressFrames = window ? Math.floor(window.elapsedMs * 45 / 1_000) : Number.NaN;
  const positiveSafeInteger = (value) => Number.isSafeInteger(value) && value > 0;
  if (!progress || !progressBefore || !progressAfter || !progressDelta
    || progress.minimumExpectedProgressFrames !== minimumExpectedProgressFrames
    || !positiveSafeInteger(progressBefore.frameCount) || !positiveSafeInteger(progressBefore.presentedGameplayFrame)
    || !positiveSafeInteger(progressAfter.frameCount) || !positiveSafeInteger(progressAfter.presentedGameplayFrame)
    || progressDelta.frameCount !== progressAfter.frameCount - progressBefore.frameCount
    || progressDelta.presentedGameplayFrame !== progressAfter.presentedGameplayFrame - progressBefore.presentedGameplayFrame
    || progressDelta.frameCount < minimumExpectedProgressFrames
    || progressDelta.presentedGameplayFrame < minimumExpectedProgressFrames) {
    errors.push(`${label}:steady-gameplay-presentation-progress-invalid`);
  }

  const active = object(arena?.activeAudit);
  validateRuntime(active, `${label}:active`, errors);
  if (!active || active.gameStarted !== true || active.matchPhase !== 'active'
    || active.arenaId !== arena.arenaId || active.deploymentTransitionHidden !== true
    || !positiveSafeInteger(active.frameCount)
    || !positiveSafeInteger(active.presentedGameplayFrame) || !positiveSafeInteger(active.renderCalls)
    || active.page?.visibilityState !== 'visible' || active.page?.hasFocus !== true
    || active.page?.width !== 2_560 || active.page?.height !== 1_440 || active.page?.devicePixelRatio !== 1
    || !Array.isArray(active.drawingBuffer) || active.drawingBuffer.length !== 2
    || active.drawingBuffer.some((value) => !Number.isFinite(value) || value <= 0)
    || active.transition?.phase !== 'idle' || active.transition?.failure !== null
    || active.transition?.renderSubmissionPaused !== false) {
    errors.push(`${label}:active-presentation-invalid`);
  }
  if (!active?.atomicSignal || active.atomicSignal.enabled !== true || active.atomicSignal.fallbackReason !== null
    || active.atomicSignal.bypassReason !== null || active.atomicSignal.outputValidated !== true
    || active.atomicSignalDataset !== 'active') {
    errors.push(`${label}:atomic-signal-invalid`);
  }
  if (active?.atomicSignal?.outputValidated === true && readPixels.length === 0) {
    errors.push(`${label}:validated-output-without-readpixels-evidence`);
  }
  if (!active?.rawWebGl || active.rawWebGl.adapterClass !== 'WebGL2RenderingContext'
    || active.rawWebGl.renderer !== active.runtime?.adapterLabel || !/ANGLE/i.test(active.rawWebGl.renderer ?? '')) {
    errors.push(`${label}:raw-gl-runtime-mismatch`);
  }
  for (const backdrop of [active?.backdrop, arena?.finalAudit?.backdrop]) {
    if (!backdrop || backdrop.periodicReadbackCount !== 0 || backdrop.sourceCaptureAttemptCount !== 0
      || backdrop.sourceCaptureCount !== 0) errors.push(`${label}:pause-readback-invalid`);
  }
  validateRuntime(arena?.finalAudit, `${label}:final`, errors);
  const finalAudit = object(arena?.finalAudit);
  if (!finalAudit || !positiveSafeInteger(finalAudit.frameCount) || !positiveSafeInteger(finalAudit.presentedGameplayFrame)
    || (progressBefore && (active?.frameCount > progressBefore.frameCount
      || active?.presentedGameplayFrame > progressBefore.presentedGameplayFrame))
    || (progressAfter && (finalAudit.frameCount < progressAfter.frameCount
      || finalAudit.presentedGameplayFrame < progressAfter.presentedGameplayFrame))) {
    errors.push(`${label}:steady-progress-audit-binding-invalid`);
  }
  return { summary: recomputedSummary, intervals: recomputedIntervals, elapsedMs: recomputedElapsedMs };
}

export function validateHardwareWebGl2DetailedReceipt(receipt, expected) {
  const errors = [];
  if (!object(receipt) || receipt.schemaVersion !== 1
    || receipt.gate !== 'pass65-installed-chrome-hardware-webgl2-performance-admission-v1'
    || receipt.status !== 'passed' || !Array.isArray(receipt.issues) || receipt.issues.length !== 0) {
    return ['detailed-receipt-identity-or-status-invalid'];
  }
  if (receipt.source?.sha !== expected.sourceSha || receipt.source?.endingSha !== expected.sourceSha
    || receipt.source?.cleanBefore !== true || receipt.source?.cleanAfter !== true
    || receipt.source?.productionBuild !== true
    || receipt.source?.buildManifestSha256 !== expected.buildManifestSha256) {
    errors.push('detailed-source-or-build-binding-invalid');
  }
  if (receiptSha256(JSON.stringify(receipt.environment)) !== expected.environmentHash) {
    errors.push('detailed-environment-hash-invalid');
  }
  if (typeof receipt.environment?.chromeExecutable !== 'string'
    || !/chrome\.exe$/i.test(receipt.environment.chromeExecutable)
    || !/^[0-9a-f]{64}$/.test(receipt.environment?.chromeExecutableSha256 ?? '')
    || !Array.isArray(receipt.environment?.browserVersions)
    || receipt.environment.browserVersions.length !== 3
    || receipt.environment.browserVersions.some((version) => typeof version !== 'string' || version.length < 3)) {
    errors.push('detailed-installed-chrome-binding-invalid');
  }
  const config = receipt.configuration;
  if (config?.backend !== 'webgl2-required-hardware-angle-no-software' || config?.graphics !== 'Performance'
    || config?.freshBrowserProfiles !== 3 || config?.physicalSoloButton !== true
    || config?.routeContract !== 'release=latest&renderer=webgl2&render=performance; no compat, renderPaused or signal override'
    || !sameJson(config?.arenaCircuit, HARDWARE_WEBGL2_ARENAS)
    || config?.thresholds?.steadyWindowMs !== 10_000
    || config?.thresholds?.maximumFirstPresentationMs !== 10_000
    || config?.thresholds?.maximumActiveIncludingCountdownMs !== 15_000
    || config?.thresholds?.maximumAdmissionReadPixelsCalls !== 3
    || config?.thresholds?.maximumAdmissionReadPixelsArea !== 1
    || config?.thresholds?.maximumPostReadyFramesAtOrAbove50Ms !== 0
    || config?.frozenSteadyFrameThresholds?.minimumWindowMs !== 10_000
    || config?.frozenSteadyFrameThresholds?.maximumSteadyLongTasks !== 0) {
    errors.push('detailed-configuration-invalid');
  }
  const trials = Array.isArray(receipt.trials) ? receipt.trials : [];
  if (trials.length !== 3) errors.push(`detailed-trial-count:${trials.length}/3`);
  const profileIds = [];
  const processIds = [];
  const aggregateEvidence = new Map(HARDWARE_WEBGL2_ARENAS.map((arenaId) => [arenaId, { intervals: [], elapsedMs: 0 }]));
  for (const [index, trial] of trials.entries()) {
    if (!Array.isArray(trial.issues) || trial.issues.length !== 0
      || !Array.isArray(trial.faults) || trial.faults.length !== 0
      || !Array.isArray(trial.requestFailures) || trial.requestFailures.length !== 0
      || !Array.isArray(trial.atomicAgainstTerminalIssues) || trial.atomicAgainstTerminalIssues.length !== 0) {
      errors.push(`trial-${index + 1}:fault-or-comparison-failed`);
    }
    if (trial.trial !== index + 1 || trial.browserVersion !== receipt.environment.browserVersions[index]
      || !sameJson(trial.systemInfo, receipt.environment.gpuSystemInfo?.[index])) {
      errors.push(`trial-${index + 1}:environment-index-binding-invalid`);
    }
    if (!trial.profile || trial.profile.initiallyEmpty !== true || trial.profile.removedAfterRun !== true
      || typeof trial.profile.id !== 'string' || !trial.profile.id.startsWith('pass65-webgl2-')
      || trial.profile.tempRelativeBasename !== trial.profile.id
      || !/^[0-9a-f]{64}$/.test(trial.profile.absolutePathSha256 ?? '')) {
      errors.push(`trial-${index + 1}:profile-proof-invalid`);
    } else profileIds.push(trial.profile.id);
    if (!Array.isArray(trial.browserProcessIds) || trial.browserProcessIds.length !== 1
      || !Number.isFinite(trial.browserProcessIds[0])) errors.push(`trial-${index + 1}:browser-process-proof-invalid`);
    else processIds.push(trial.browserProcessIds[0]);
    const devices = Array.isArray(trial.systemInfo?.gpu?.devices) ? trial.systemInfo.gpu.devices : [];
    const deviceLabels = devices.map((device) => `${device.vendorString ?? ''} ${device.deviceString ?? ''} ${device.driverVendor ?? ''}`);
    if (!deviceLabels.some((label) => /nvidia|amd|intel/i.test(label)
      && !/swiftshader|software|microsoft basic/i.test(label))) errors.push(`trial-${index + 1}:cdp-hardware-gpu-invalid`);
    const browserProcesses = Array.isArray(trial.systemInfo?.processInfo)
      ? trial.systemInfo.processInfo.filter((entry) => entry.type === 'browser').map((entry) => Number(entry.id))
      : [];
    if (!sameJson(browserProcesses, trial.browserProcessIds)) errors.push(`trial-${index + 1}:cdp-browser-process-mismatch`);
    const arenas = Array.isArray(trial.arenas) ? trial.arenas : [];
    if (arenas.length !== 4 || arenas[0]?.arenaId !== 'atomic-acres'
      || !sameJson([...arenas.map((arena) => arena.arenaId)].sort(), [...HARDWARE_WEBGL2_ARENAS].sort())) {
      errors.push(`trial-${index + 1}:all-map-or-cold-atomic-proof-invalid`);
    }
    const coldMenu = arenas[0]?.menuAudit;
    if (coldMenu?.gameplayArena !== 'deferred-until-deployment' || coldMenu?.streaming?.constructionCount !== 0
      || coldMenu?.streaming?.residentArenaRoots !== 0
      || coldMenu?.menuPreview?.rendererEvidence?.arenaConstructionCount !== 0
      || coldMenu?.menuPreview?.rendererEvidence?.gameplayArenaPrepared !== false) {
      errors.push(`trial-${index + 1}:cold-menu-not-unconstructed`);
    }
    const trialEvidence = new Map();
    for (const arena of arenas) {
      const evidence = validateArena(arena, index + 1, errors);
      trialEvidence.set(arena.arenaId, evidence);
      const aggregate = aggregateEvidence.get(arena.arenaId);
      if (aggregate && evidence.summary) {
        aggregate.intervals.push(...evidence.intervals);
        aggregate.elapsedMs += evidence.elapsedMs;
      }
    }
    const recomputedTrialComparison = trialEvidence.get('atomic-acres')?.summary
      && trialEvidence.get('skyline-terminal')?.summary
      ? compareAtomicAgainstTerminal(trialEvidence.get('atomic-acres').summary, trialEvidence.get('skyline-terminal').summary)
      : ['comparison-unavailable'];
    if (recomputedTrialComparison.length !== 0 || !sameJson(trial.atomicAgainstTerminalIssues, recomputedTrialComparison)) {
      errors.push(`trial-${index + 1}:raw-atomic-terminal-comparison-failed-or-forged`);
    }
    const readPixelsCount = arenas.reduce((total, arena) => total + (arena.admission?.readPixels?.length ?? 0), 0);
    if (!Array.isArray(trial.readbackWarnings)
      || trial.readbackWarnings.some((warning) => !String(warning.phase).startsWith('admission:'))
      || trial.readbackWarnings.some((warning) => !/readpixels|read pixels|gpu stall due to read/i.test(String(warning.message)))
      || trial.readbackWarnings.length > readPixelsCount
      || (trial.readbackWarnings.length > 0 && readPixelsCount === 0)) {
      errors.push(`trial-${index + 1}:readback-warning-unexplained-or-live`);
    }
  }
  if (profileIds.length !== 3 || new Set(profileIds).size !== 3) errors.push('detailed-profile-identities-not-unique');
  if (processIds.length !== 3 || new Set(processIds).size !== 3) errors.push('detailed-browser-processes-not-unique');
  const atomicEvidence = aggregateEvidence.get('atomic-acres');
  const terminalEvidence = aggregateEvidence.get('skyline-terminal');
  const recomputedAtomic = atomicEvidence?.intervals.length > 0 ? summarize(atomicEvidence.intervals, atomicEvidence.elapsedMs) : null;
  const recomputedTerminal = terminalEvidence?.intervals.length > 0 ? summarize(terminalEvidence.intervals, terminalEvidence.elapsedMs) : null;
  const recomputedAggregateComparison = recomputedAtomic && recomputedTerminal
    ? compareAtomicAgainstTerminal(recomputedAtomic, recomputedTerminal)
    : ['comparison-unavailable'];
  if (!recomputedAtomic || !recomputedTerminal || recomputedAggregateComparison.length !== 0
    || !sameJson(receipt.aggregate?.atomic, recomputedAtomic)
    || !sameJson(receipt.aggregate?.terminal, recomputedTerminal)
    || !sameJson(receipt.aggregate?.atomicAgainstTerminalIssues, recomputedAggregateComparison)) {
    errors.push('detailed-aggregate-comparison-invalid');
  }
  return [...new Set(errors)].sort();
}

export function validateHardwareWebGl2BuildManifest(manifest, expected) {
  const errors = [];
  if (!object(manifest) || manifest.schemaVersion !== 1 || manifest.sourceSha !== expected.sourceSha
    || !Array.isArray(manifest.files) || manifest.files.length === 0) return ['build-manifest-invalid'];
  const paths = manifest.files.map((file) => file.path);
  if (!sameJson(paths, [...paths].sort()) || new Set(paths).size !== paths.length) errors.push('build-manifest-path-order-or-duplicates');
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || file.path.length < 1 || file.path.includes('..')
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/.test(file.sha256 ?? '')) {
      errors.push('build-manifest-file-invalid');
    }
  }
  return [...new Set(errors)].sort();
}

export function frameSummaryFixture(intervals, windowMs) {
  return summarize(intervals, windowMs);
}

export function createHardwareWebGl2ReceiptFixture(sourceSha = 'a'.repeat(40)) {
  const intervals = Object.freeze(Array.from({ length: 600 }, () => 16.667));
  const postReadyIntervals = Object.freeze(Array.from({ length: 240 }, () => 16.667));
  const elapsedMs = 10_000.2;
  const summary = summarize(intervals, elapsedMs);
  const runtime = Object.freeze({
    requestedBackend: 'webgl2', actualBackend: 'webgl2', initialized: true,
    adapterLabel: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Direct3D11)',
    adapterClass: 'WebGL2RenderingContext', softwareAdapter: false,
    deviceLost: false, uncapturedErrors: 0,
    contextLifecycle: Object.freeze({ lost: false, losses: 0, restorations: 0 }),
  });
  const backdrop = Object.freeze({ periodicReadbackCount: 0, sourceCaptureAttemptCount: 0, sourceCaptureCount: 0 });
  const arena = (arenaId, generation, cold) => ({
    arenaId,
    menuAudit: cold ? {
      gameplayArena: 'deferred-until-deployment',
      streaming: { constructionCount: 0, residentArenaRoots: 0 },
      menuPreview: { rendererEvidence: { arenaConstructionCount: 0, gameplayArenaPrepared: false } },
    } : {},
    loadingAudit: { lifecycle: 'deploying', visible: true, media: 'shared-prerecorded-video', liveRender: 'false', arena: arenaId },
    admission: {
      timing: { deploymentStartedAt: 1_000, transitionReadyAt: 2_000, firstGameplayPresentedAt: 2_100, activeAt: 5_000 },
      longTasks: [{ startTime: 1_200, duration: 60, name: 'self' }],
      readPixels: [{ at: 1_500, width: 1, height: 1, stack: 'AtomicSignalPass.validateOutput' }],
      physicalSoloStarts: [{ at: 1_000, isTrusted: true }],
      readPixelsTripwireInstalled: true,
      expectedAdmissionGeneration: generation,
      observedAdmissionGeneration: generation,
      postReadyFrameWindow: {
        startedAt: 2_000, endedAt: 6_000, elapsedMs: 4_000, intervalsMs: postReadyIntervals,
        longTasks: [], readPixels: [], observerSupported: true,
      },
    },
    steady: {
      requestedWindowMs: 10_000,
      frameWindow: {
        startedAt: 6_000, endedAt: 16_000.2, elapsedMs, intervalsMs: intervals,
        longTasks: [], readPixels: [], observerSupported: true,
      },
      summary,
      progress: {
        minimumExpectedProgressFrames: 450,
        before: { frameCount: 100, presentedGameplayFrame: 100 },
        after: { frameCount: 700, presentedGameplayFrame: 700 },
        delta: { frameCount: 600, presentedGameplayFrame: 600 },
      },
    },
    activeAudit: {
      runtime, gameStarted: true, matchPhase: 'active', arenaId,
      deploymentTransitionHidden: true, frameCount: 80, presentedGameplayFrame: 80, renderCalls: 2,
      drawingBuffer: [2_560, 1_440],
      transition: { phase: 'idle', failure: null, renderSubmissionPaused: false },
      page: { visibilityState: 'visible', hasFocus: true, width: 2_560, height: 1_440, devicePixelRatio: 1 },
      atomicSignal: { enabled: true, fallbackReason: null, bypassReason: null, outputValidated: true },
      atomicSignalDataset: 'active',
      rawWebGl: { adapterClass: 'WebGL2RenderingContext', renderer: runtime.adapterLabel },
      backdrop,
    },
    finalAudit: { runtime, backdrop, frameCount: 700, presentedGameplayFrame: 700 },
    issues: [],
  });
  const browserVersions = ['Chrome/140.0.0.0', 'Chrome/140.0.0.0', 'Chrome/140.0.0.0'];
  const systemInfos = Array.from({ length: 3 }, (_, index) => ({
    gpu: { devices: [{ vendorString: 'NVIDIA', deviceString: 'NVIDIA GeForce RTX 5080', driverVendor: 'NVIDIA' }] },
    processInfo: [{ type: 'browser', id: 100 + index }],
  }));
  const chromeExecutableBytes = Buffer.from('pass65-hardware-webgl2-fixture-chrome', 'utf8');
  const environment = {
    platform: 'win32', release: 'fixture', arch: 'x64', totalMemoryGiB: 64,
    chromeExecutable: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    chromeExecutableSha256: receiptSha256(chromeExecutableBytes), browserVersions, gpuSystemInfo: systemInfos,
  };
  const manifest = {
    schemaVersion: 1,
    sourceSha,
    files: [{ path: 'index.html', bytes: 1, sha256: 'e'.repeat(64) }],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const buildManifestSha256 = receiptSha256(manifestBytes);
  const trials = Array.from({ length: 3 }, (_, index) => {
    const order = index % 2 === 0
      ? HARDWARE_WEBGL2_ARENAS
      : ['atomic-acres', 'skyline-terminal', 'gun-range', 'rustworks-1v1'];
    return {
      trial: index + 1,
      browserVersion: browserVersions[index],
      profile: {
        id: `pass65-webgl2-fixture-${index + 1}`,
        tempRelativeBasename: `pass65-webgl2-fixture-${index + 1}`,
        absolutePathSha256: String(index + 1).repeat(64),
        initiallyEmpty: true,
        removedAfterRun: true,
      },
      browserProcessIds: [100 + index],
      systemInfo: systemInfos[index],
      arenas: order.map((arenaId, arenaIndex) => arena(arenaId, (index + 1) * 10 + arenaIndex, arenaIndex === 0)),
      faults: [], readbackWarnings: [], requestFailures: [], atomicAgainstTerminalIssues: [], issues: [],
    };
  });
  const detailedReceipt = {
    schemaVersion: 1,
    gate: 'pass65-installed-chrome-hardware-webgl2-performance-admission-v1',
    status: 'passed',
    source: {
      sha: sourceSha, endingSha: sourceSha, cleanBefore: true, cleanAfter: true,
      productionBuild: true, previewServer: 'vite-preview', buildManifestSha256,
    },
    environment,
    configuration: {
      viewport: { width: 2_560, height: 1_440 },
      backend: 'webgl2-required-hardware-angle-no-software',
      graphics: 'Performance',
      routeContract: 'release=latest&renderer=webgl2&render=performance; no compat, renderPaused or signal override',
      freshBrowserProfiles: 3,
      physicalSoloButton: true,
      arenaCircuit: HARDWARE_WEBGL2_ARENAS,
      thresholds: {
        steadyWindowMs: 10_000, maximumFirstPresentationMs: 10_000,
        maximumActiveIncludingCountdownMs: 15_000, maximumAdmissionReadPixelsCalls: 3,
        maximumAdmissionReadPixelsArea: 1,
        maximumPostReadyFramesAtOrAbove50Ms: 0,
      },
      frozenSteadyFrameThresholds: { minimumWindowMs: 10_000, maximumSteadyLongTasks: 0 },
    },
    trials,
    aggregate: {
      atomic: summarize([...intervals, ...intervals, ...intervals], elapsedMs * 3),
      terminal: summarize([...intervals, ...intervals, ...intervals], elapsedMs * 3),
      atomicAgainstTerminalIssues: [],
    },
    issues: [],
  };
  const detailedBytes = Buffer.from(`${JSON.stringify(detailedReceipt, null, 2)}\n`, 'utf8');
  return {
    detailedReceipt,
    detailedBytes,
    detailedReceiptSha256: receiptSha256(detailedBytes),
    manifest,
    manifestBytes,
    buildManifestSha256,
    environmentHash: receiptSha256(JSON.stringify(environment)),
    chromeExecutableBytes,
  };
}
