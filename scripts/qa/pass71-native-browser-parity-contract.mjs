export const PASS71_NATIVE_BROWSER_PARITY = Object.freeze({
  schemaVersion: 2,
  gate: 'pass71-native-firefox-chrome-webgl2-parity',
  viewport: Object.freeze({ width: 1_904, height: 987, deviceScaleFactor: 1 }),
  settleMs: 6_000,
  minimumWindowMs: 8_000,
  maximumWindowMs: 10_000,
  targetWindowMs: 9_000,
  minimumGameFrameToCallbackRatio: 0.98,
  maximumGameFrameToCallbackRatio: 1.02,
  minimumFirefoxMedianFpsRatio: 0.8,
  minimumFirefoxPresentedFpsRatio: 0.8,
  maximumFirefoxP95FrameTimeRatio: 1.25,
});

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.filter(finite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function summarizePass71FrameWindow(intervalsMs, elapsedMs) {
  const intervals = Array.isArray(intervalsMs) ? intervalsMs.filter((value) => finite(value) && value > 0) : [];
  const medianFrameTimeMs = percentile(intervals, 0.5);
  return Object.freeze({
    elapsedMs,
    sampleCount: intervals.length,
    callbackFps: finite(elapsedMs) && elapsedMs > 0 ? intervals.length * 1_000 / elapsedMs : null,
    medianFrameTimeMs,
    medianFps: finite(medianFrameTimeMs) && medianFrameTimeMs > 0 ? 1_000 / medianFrameTimeMs : null,
    p95FrameTimeMs: percentile(intervals, 0.95),
    p99FrameTimeMs: percentile(intervals, 0.99),
    maximumFrameTimeMs: intervals.length > 0 ? Math.max(...intervals) : null,
  });
}

function browserFailures(browser, expectedName, contract) {
  const failures = [];
  if (browser?.name !== expectedName) failures.push(`${expectedName}:browser-name`);
  if (!/^[a-f0-9]{64}$/u.test(browser?.identity?.executableSha256 ?? '')) failures.push(`${expectedName}:executable-hash`);
  if (typeof browser?.identity?.version !== 'string' || browser.identity.version.trim() === '') failures.push(`${expectedName}:version`);
  if (browser?.route !== browser?.requestedRoute) failures.push(`${expectedName}:route-drift`);
  if (browser?.viewport?.width !== contract.viewport.width
    || browser?.viewport?.height !== contract.viewport.height
    || browser?.viewport?.deviceScaleFactor !== contract.viewport.deviceScaleFactor) failures.push(`${expectedName}:viewport`);
  if (browser?.scene?.arenaId !== 'atomic-acres' || browser?.scene?.gameStarted !== true
    || browser?.scene?.matchPhase !== 'active' || browser?.scene?.botCount !== 1
    || browser?.scene?.botsFrozen !== true || browser?.scene?.qualityAssetState !== 'ready') failures.push(`${expectedName}:scene`);
  const runtime = browser?.runtime;
  if (runtime?.requestedBackend !== 'webgl2' || runtime?.actualBackend !== 'webgl2'
    || runtime?.softwareAdapter !== false || runtime?.deviceLost !== false
    || runtime?.uncapturedErrors !== 0 || !String(browser?.webglVersion ?? '').includes('WebGL 2')) failures.push(`${expectedName}:hardware-webgl2`);
  const graphics = browser?.graphics;
  if (graphics?.requestedPreset !== 'custom' || graphics?.effectivePreset !== 'custom'
    || graphics?.renderProfile !== 'blender' || graphics?.renderScale !== 1
    || graphics?.adaptive !== false || graphics?.antialiasSamples !== 4
    || graphics?.geometryDetail !== 'full' || graphics?.frameRateLimit !== 0) failures.push(`${expectedName}:graphics`);
  if (browser?.principalHdrSamples !== 4) failures.push(`${expectedName}:principal-hdr-msaa`);
  if (browser?.settleMs < contract.settleMs) failures.push(`${expectedName}:settle-window`);
  const performance = browser?.performance;
  const derivedPresentedFps = performance?.gameFrameDelta * 1_000 / performance?.elapsedMs;
  const derivedGameFrameToCallbackRatio = performance?.gameFrameDelta / performance?.sampleCount;
  if (!finite(performance?.elapsedMs) || performance.elapsedMs < contract.minimumWindowMs
    || performance.elapsedMs > contract.maximumWindowMs || !finite(performance?.medianFps)
    || !finite(performance?.p95FrameTimeMs) || performance.sampleCount < 120
    || !Number.isSafeInteger(performance?.gameFrameDelta) || performance.gameFrameDelta < 1
    || !finite(performance?.presentedFps) || performance.presentedFps !== derivedPresentedFps
    || !finite(performance?.gameFrameToCallbackRatio)
    || performance.gameFrameToCallbackRatio !== derivedGameFrameToCallbackRatio) failures.push(`${expectedName}:measurement-window`);
  if (!finite(derivedGameFrameToCallbackRatio)
    || derivedGameFrameToCallbackRatio < contract.minimumGameFrameToCallbackRatio
    || derivedGameFrameToCallbackRatio > contract.maximumGameFrameToCallbackRatio) failures.push(`${expectedName}:presentation-cadence`);
  const faults = browser?.faults;
  if (!faults || faults.bootstrapError !== null || faults.runtimeErrorLog !== ''
    || faults.fatalErrorVisible !== false || faults.capturedErrors?.length !== 0
    || faults.watchdogStatus !== 'healthy' || faults.watchdogIncidents !== 0
    || faults.contextLosses !== 0 || faults.documentVisible !== true || faults.documentFocused !== true) failures.push(`${expectedName}:runtime-or-watchdog-fault`);
  return failures;
}

export function pass71NativeBrowserParityFailures(receipt, contract = PASS71_NATIVE_BROWSER_PARITY) {
  const failures = [];
  if (receipt?.schemaVersion !== contract.schemaVersion || receipt?.gate !== contract.gate) failures.push('receipt-identity');
  if (!/^[a-f0-9]{40}$/u.test(receipt?.source?.sha ?? '') || !/^[a-f0-9]{40}$/u.test(receipt?.source?.tree ?? '')
    || receipt?.source?.cleanBefore !== true || receipt?.source?.cleanAfter !== true) failures.push('source-identity');
  if (!/^[a-f0-9]{64}$/u.test(receipt?.build?.manifestSha256 ?? '') || receipt?.build?.fileCount < 2) failures.push('build-identity');
  if (!/^[a-f0-9]{64}$/u.test(receipt?.tooling?.runnerSha256 ?? '')
    || !/^[a-f0-9]{64}$/u.test(receipt?.tooling?.contractSha256 ?? '')) failures.push('tooling-identity');
  const chrome = receipt?.browsers?.chrome;
  const firefox = receipt?.browsers?.firefox;
  failures.push(...browserFailures(chrome, 'chrome', contract), ...browserFailures(firefox, 'firefox', contract));
  if (chrome?.requestedRoute !== firefox?.requestedRoute) failures.push('route-not-identical');
  if (chrome?.scene?.seed !== firefox?.scene?.seed || chrome?.scene?.staging !== firefox?.scene?.staging
    || typeof chrome?.scene?.signature !== 'string' || chrome.scene.signature !== firefox?.scene?.signature) failures.push('scene-not-identical');
  const medianRatio = firefox?.performance?.medianFps / chrome?.performance?.medianFps;
  const presentedRatio = firefox?.performance?.presentedFps / chrome?.performance?.presentedFps;
  const p95Ratio = firefox?.performance?.p95FrameTimeMs / chrome?.performance?.p95FrameTimeMs;
  if (!finite(medianRatio) || medianRatio < contract.minimumFirefoxMedianFpsRatio) failures.push('firefox-median-fps-ratio');
  if (!finite(presentedRatio) || presentedRatio < contract.minimumFirefoxPresentedFpsRatio) failures.push('firefox-presented-fps-ratio');
  if (!finite(p95Ratio) || p95Ratio > contract.maximumFirefoxP95FrameTimeRatio) failures.push('firefox-p95-frame-time-ratio');
  if (receipt?.comparison?.firefoxMedianFpsRatio !== medianRatio
    || receipt?.comparison?.firefoxPresentedFpsRatio !== presentedRatio
    || receipt?.comparison?.firefoxP95FrameTimeRatio !== p95Ratio) failures.push('comparison-mismatch');
  return [...new Set(failures)];
}

export function assertPass71NativeBrowserParityReceipt(receipt, contract = PASS71_NATIVE_BROWSER_PARITY) {
  const failures = pass71NativeBrowserParityFailures(receipt, contract);
  if (failures.length > 0) throw new Error(`Pass 71 native browser parity failed: ${failures.join(', ')}`);
  return receipt;
}
