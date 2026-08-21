import assert from 'node:assert/strict';

export const PASS73_NATIVE_GRENADE_SCHEMA = 'atomic-acres/pass73-native-grenade@1';
export const PASS73_NATIVE_GRENADE_PROFILES = Object.freeze(['quality', 'performance']);
export const PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE = 3;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function exactArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function closeVector(left, right, tolerance = 0.0001) {
  return array(left).length === 3
    && array(right).length === 3
    && left.every((value, index) => finite(value) && finite(right[index]) && Math.abs(value - right[index]) <= tolerance);
}

function validRoute(route, profile, trial) {
  try {
    const url = new URL(route);
    return url.pathname.endsWith('/channels/the-big-one/')
      && url.searchParams.get('release') === 'latest'
      && url.searchParams.get('map') === 'atomic-acres'
      && url.searchParams.get('renderer') === 'webgpu'
      && url.searchParams.get('requireWebGPU') === '1'
      && url.searchParams.get('render') === profile
      && url.searchParams.get('externalServices') === 'off'
      && url.searchParams.get('traceNodeBuilds') === '1'
      && url.searchParams.get('seed') === `pass73-native-grenade-${profile}-${trial}`;
  } catch {
    return false;
  }
}

function validateRender(render, label, failures) {
  const value = object(render);
  if (value.requestedBackend !== 'webgpu' || value.actualBackend !== 'webgpu'
    || value.initialized !== true || value.failClosed !== false
    || value.adapterClass !== 'GPUAdapter' || value.deviceClass !== 'GPUDevice'
    || typeof value.adapterLabel !== 'string' || value.adapterLabel.length < 3
    || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu.test(value.adapterLabel)
    || value.softwareAdapter !== false || value.deviceLost !== false
    || value.uncapturedErrors !== 0 || value.presentation?.completionFailures !== 0
    || value.presentation?.status !== 'healthy') {
    failures.push(`${label} did not retain healthy native hardware WebGPU`);
  }
}

function validateActionWindow(windowValue, actionValue, label, failures) {
  const frameWindow = object(windowValue);
  const action = object(actionValue);
  const before = object(frameWindow.telemetryBefore);
  const after = object(frameWindow.telemetryAfter);
  if (frameWindow.keyCode !== 'KeyG' || frameWindow.keyTrusted !== true || frameWindow.keyRepeat !== false) {
    failures.push(`${label} did not originate from one trusted non-repeat G key event`);
  }
  if (frameWindow.longTaskObserverSupported !== true) failures.push(`${label} could not observe Long Tasks`);
  if (array(frameWindow.gapsMs).length < 3 || !array(frameWindow.gapsMs).every((sample) => finite(sample) && sample >= 0)) {
    failures.push(`${label} lacks a bounded requestAnimationFrame sample window`);
  }
  if (array(frameWindow.longTasks).length !== 0) failures.push(`${label} recorded a Long Task`);
  if (array(frameWindow.resourceLoads).length !== 0) failures.push(`${label} loaded a resource during the throw window`);
  if (!finite(frameWindow.maximumGapMs) || frameWindow.maximumGapMs > 20) {
    failures.push(`${label} exceeded the absolute 20 ms frame-gap limit`);
  }
  for (const percentile of ['p50Ms', 'p95Ms', 'p99Ms']) {
    if (!finite(frameWindow[percentile])) failures.push(`${label} has invalid ${percentile}`);
  }
  validateRender(before.render, `${label} before`, failures);
  validateRender(after.render, `${label} after`, failures);
  if (!exactArray(before.render?.compiledPipelineIds, after.render?.compiledPipelineIds)
    || !exactArray(before.render?.slowNodeBuilds, after.render?.slowNodeBuilds)) {
    failures.push(`${label} compiled a pipeline or node graph during the throw window`);
  }
  if (before.pool?.total !== after.pool?.total
    || before.pool?.gpuPrewarmGeneration !== after.pool?.gpuPrewarmGeneration
    || after.pool?.acquisitions - before.pool?.acquisitions !== 1
    || after.pool?.exhaustions !== before.pool?.exhaustions
    || after.pool?.prewarmBlockedAcquisitions !== 0) {
    failures.push(`${label} did not use exactly one retained prewarmed grenade mesh`);
  }
  if (before.audio?.prepared !== true || after.audio?.prepared !== true
    || before.audio?.runs !== 1 || after.audio?.runs !== 1
    || before.audio?.warmupSources !== 7 || after.audio?.warmupSources !== 7
    || before.audio?.retainedSources !== 0 || after.audio?.retainedSources !== 0
    || before.audio?.retainedBroadbandLoops !== 0 || after.audio?.retainedBroadbandLoops !== 0
    || before.audio?.liveRecipe !== 'sawtooth-pressure-plus-dual-filtered-noise-v1'
    || after.audio?.liveRecipe !== before.audio?.liveRecipe) {
    failures.push(`${label} changed or failed the bounded authored grenade-audio recipe`);
  }
  if (action.observationComplete !== true || action.grenade !== 'frag'
    || action.pool?.acquiredRetainedMesh !== true || typeof action.pool?.family !== 'string'
    || action.animation?.activeAtHandlerEnd !== true || action.animation?.activeOnFirstPresentedFrame !== true
    || action.meshVisibleOnFirstPresentedFrame !== true
    || action.physics?.path !== 'deterministic-kinematic-no-rapier-body'
    || action.physics?.rapierBodiesAcquired !== 0
    || array(action.physics?.initialOrigin).length !== 3 || array(action.physics?.initialVelocity).length !== 3
    || action.physics?.fuseMs !== 2_300
    || !finite(action.handlerSyncMs) || !finite(action.firstPresentedDelayMs)
    || action.firstPresentedDelayMs > 20 || action.maximumAnimationFrameGapMs > 20
    || !finite(action.frameP95Ms) || !finite(action.frameP99Ms)
    || action.startingSubmissionSequence >= action.targetSubmissionSequence
    || !finite(action.firstSubmissionDelayMs) || !finite(action.firstCompletionDelayMs)
    || action.completionFailures !== 0 || action.status !== 'healthy') {
    failures.push(`${label} did not preserve retained mesh, animation, kinematic, and completed-submission identity`);
  }
}

function validateTrial(trialValue, profile, trialNumber, failures) {
  const trial = object(trialValue);
  const label = `${profile} trial ${trialNumber}`;
  if (trial.profile !== profile || trial.trial !== trialNumber || !validRoute(trial.route, profile, trialNumber)) {
    failures.push(`${label} route/profile identity is invalid`);
  }
  if (typeof trial.userAgent !== 'string' || !/Chrome\//u.test(trial.userAgent) || /Edg\//u.test(trial.userAgent)) {
    failures.push(`${label} did not run in installed Google Chrome`);
  }
  if (!exactArray(trial.viewport, [2_560, 1_440]) || trial.deviceScaleFactor !== 1) {
    failures.push(`${label} viewport identity is invalid`);
  }
  if (array(trial.browserErrors).length !== 0) failures.push(`${label} emitted browser or GPU errors`);
  validateActionWindow(trial.first?.window, trial.first?.action, `${label} cold throw`, failures);
  validateActionWindow(trial.second?.window, trial.second?.action, `${label} warm throw`, failures);

  const firstWindow = object(trial.first?.window);
  const secondWindow = object(trial.second?.window);
  const firstAction = object(trial.first?.action);
  const secondAction = object(trial.second?.action);
  if (firstAction.sequence !== 0 || firstAction.cold !== true
    || secondAction.sequence !== 1 || secondAction.cold !== false) {
    failures.push(`${label} did not compare the true first action with the second action`);
  }
  if (firstWindow.maximumGapMs > secondWindow.maximumGapMs + 4
    || firstWindow.p95Ms > secondWindow.p95Ms + 3
    || firstWindow.p99Ms > secondWindow.p99Ms + 4
    || firstAction.handlerSyncMs > secondAction.handlerSyncMs + 3
    || firstAction.frameP95Ms > secondAction.frameP95Ms + 3
    || firstAction.frameP99Ms > secondAction.frameP99Ms + 4
    || firstAction.maximumAnimationFrameGapMs > secondAction.maximumAnimationFrameGapMs + 4) {
    failures.push(`${label} cold throw exceeded the retained warm-throw envelope`);
  }
  if (firstAction.grenade !== secondAction.grenade
    || firstAction.pool?.family !== secondAction.pool?.family
    || firstAction.audio?.liveRecipe !== secondAction.audio?.liveRecipe
    || firstAction.physics?.path !== secondAction.physics?.path
    || firstAction.physics?.fuseMs !== secondAction.physics?.fuseMs
    || !closeVector(firstAction.physics?.initialOrigin, secondAction.physics?.initialOrigin)
    || !closeVector(firstAction.physics?.initialVelocity, secondAction.physics?.initialVelocity)) {
    failures.push(`${label} cold and warm throws changed mesh, audio, or kinematic identity`);
  }
}

export function pass73NativeGrenadeFailures(receiptValue, expected = {}) {
  const receipt = object(receiptValue);
  const failures = [];
  if (receipt.schema !== PASS73_NATIVE_GRENADE_SCHEMA || receipt.verdict !== 'pass') {
    failures.push('receipt schema or verdict is invalid');
  }
  const source = object(receipt.source);
  if (!/^[a-f0-9]{40}$/u.test(source.head ?? '') || !/^[a-f0-9]{40}$/u.test(source.tree ?? '')
    || source.clean !== true || source.head !== source.endingHead || source.tree !== source.endingTree) {
    failures.push('receipt is not bound to one clean immutable Git source/tree');
  }
  if (expected.head && source.head !== expected.head) failures.push('receipt source HEAD differs from the requested candidate');
  if (expected.tree && source.tree !== expected.tree) failures.push('receipt source tree differs from the requested candidate');
  const browser = object(receipt.browser);
  if (typeof browser.executablePath !== 'string'
    || !/[/\\]Google[/\\]Chrome[/\\]Application[/\\]chrome\.exe$/iu.test(browser.executablePath)
    || !/^[a-f0-9]{64}$/u.test(browser.executableSha256 ?? '')
    || typeof browser.version !== 'string' || browser.version.length < 3) {
    failures.push('installed Chrome executable identity is invalid');
  }
  if (expected.executableSha256 && browser.executableSha256 !== expected.executableSha256) {
    failures.push('Chrome executable hash differs from the owned runner');
  }
  const gate = object(receipt.gate);
  if (!exactArray(gate.profiles, PASS73_NATIVE_GRENADE_PROFILES)
    || gate.contextsPerProfile !== PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE
    || !exactArray(gate.viewport, [2_560, 1_440]) || gate.deviceScaleFactor !== 1
    || gate.backend !== 'native-hardware-webgpu'
    || gate.input !== 'trusted-keyboard-KeyG'
    || gate.freshBrowserContextPerTrial !== true) {
    failures.push('gate matrix identity is invalid');
  }
  const trials = array(receipt.trials);
  if (trials.length !== PASS73_NATIVE_GRENADE_PROFILES.length * PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE) {
    failures.push('receipt does not contain all six required fresh-context trials');
  }
  for (const profile of PASS73_NATIVE_GRENADE_PROFILES) {
    for (let trialNumber = 1; trialNumber <= PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE; trialNumber += 1) {
      const matching = trials.filter((trial) => trial?.profile === profile && trial?.trial === trialNumber);
      if (matching.length !== 1) failures.push(`${profile} trial ${trialNumber} is missing or duplicated`);
      else validateTrial(matching[0], profile, trialNumber, failures);
    }
  }
  return failures;
}

export function assertPass73NativeGrenadeReceipt(receipt, expected = {}) {
  const failures = pass73NativeGrenadeFailures(receipt, expected);
  assert.deepEqual(failures, [], failures.join('\n'));
}
