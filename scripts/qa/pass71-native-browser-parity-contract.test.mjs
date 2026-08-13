import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS71_NATIVE_BROWSER_PARITY,
  assertPass71NativeBrowserParityReceipt,
  pass71NativeBrowserParityFailures,
  summarizePass71FrameWindow,
} from './pass71-native-browser-parity-contract.mjs';

const hash = 'a'.repeat(64);
function browser(name, medianFps, p95FrameTimeMs, presentedFps = medianFps) {
  const elapsedMs = 9_000;
  const sampleCount = Math.round(medianFps * elapsedMs / 1_000);
  const gameFrameDelta = Math.round(presentedFps * elapsedMs / 1_000);
  return {
    name,
    identity: { executableSha256: hash, version: '1.2.3' },
    route: 'http://127.0.0.1:4561/?renderer=webgl2&render=blender&map=atomic-acres&seed=pass71-parity-v1',
    requestedRoute: 'http://127.0.0.1:4561/?renderer=webgl2&render=blender&map=atomic-acres&seed=pass71-parity-v1',
    viewport: { ...PASS71_NATIVE_BROWSER_PARITY.viewport },
    scene: { arenaId: 'atomic-acres', gameStarted: true, matchPhase: 'active', botCount: 1, botsFrozen: true, qualityAssetState: 'ready', seed: 'pass71-parity-v1', staging: 'frozen-one-bot-ahead-v1', signature: 'same-scene' },
    runtime: { requestedBackend: 'webgl2', actualBackend: 'webgl2', softwareAdapter: false, deviceLost: false, uncapturedErrors: 0 },
    webglVersion: 'WebGL 2.0',
    graphics: { requestedPreset: 'custom', effectivePreset: 'custom', renderProfile: 'blender', renderScale: 1, adaptive: false, antialiasSamples: 4, geometryDetail: 'full', frameRateLimit: 0 },
    principalHdrSamples: 4,
    settleMs: 6_000,
    performance: {
      elapsedMs,
      sampleCount,
      medianFps,
      p95FrameTimeMs,
      gameFrameDelta,
      presentedFps: gameFrameDelta * 1_000 / elapsedMs,
      gameFrameToCallbackRatio: gameFrameDelta / sampleCount,
    },
    faults: { bootstrapError: null, runtimeErrorLog: '', fatalErrorVisible: false, capturedErrors: [], watchdogStatus: 'healthy', watchdogIncidents: 0, contextLosses: 0, documentVisible: true, documentFocused: true },
  };
}

function receipt(firefoxMedianFps = 50, firefoxP95 = 20, firefoxPresentedFps = firefoxMedianFps) {
  const chrome = browser('chrome', 60, 16);
  const firefox = browser('firefox', firefoxMedianFps, firefoxP95, firefoxPresentedFps);
  return {
    schemaVersion: PASS71_NATIVE_BROWSER_PARITY.schemaVersion,
    gate: PASS71_NATIVE_BROWSER_PARITY.gate,
    source: { sha: 'b'.repeat(40), tree: 'c'.repeat(40), cleanBefore: true, cleanAfter: true },
    build: { manifestSha256: hash, fileCount: 10 },
    tooling: { runnerSha256: hash, contractSha256: hash },
    browsers: { chrome, firefox },
    comparison: {
      firefoxMedianFpsRatio: firefox.performance.medianFps / chrome.performance.medianFps,
      firefoxPresentedFpsRatio: firefox.performance.presentedFps / chrome.performance.presentedFps,
      firefoxP95FrameTimeRatio: firefox.performance.p95FrameTimeMs / chrome.performance.p95FrameTimeMs,
    },
  };
}

test('summarizes median FPS and p95 frame time from retained intervals', () => {
  const summary = summarizePass71FrameWindow([10, 12, 14, 16, 20], 72);
  assert.equal(summary.medianFrameTimeMs, 14);
  assert.equal(summary.medianFps, 1_000 / 14);
  assert.equal(summary.p95FrameTimeMs, 20);
});

test('accepts the exact threshold boundaries', () => {
  assert.doesNotThrow(() => assertPass71NativeBrowserParityReceipt(receipt(48, 20)));
});

test('rejects Firefox below 0.80 Chrome median FPS', () => {
  assert.ok(pass71NativeBrowserParityFailures(receipt(47.99, 20)).includes('firefox-median-fps-ratio'));
});

test('rejects a slow game presentation loop even when independent rAF cadence looks healthy', () => {
  const value = receipt(60, 16, 30);
  const failures = pass71NativeBrowserParityFailures(value);
  assert.ok(failures.includes('firefox:presentation-cadence'));
  assert.ok(failures.includes('firefox-presented-fps-ratio'));
});

test('rejects omitted or self-inconsistent game presentation telemetry', () => {
  const value = receipt();
  delete value.browsers.firefox.performance.gameFrameDelta;
  assert.ok(pass71NativeBrowserParityFailures(value).includes('firefox:measurement-window'));

  const inconsistent = receipt();
  inconsistent.browsers.firefox.performance.presentedFps += 1;
  assert.ok(pass71NativeBrowserParityFailures(inconsistent).includes('firefox:measurement-window'));
});

test('rejects Firefox above 1.25 Chrome p95 frame time', () => {
  assert.ok(pass71NativeBrowserParityFailures(receipt(50, 20.01)).includes('firefox-p95-frame-time-ratio'));
});

test('rejects software adapters, configuration drift and watchdog incidents', () => {
  const value = receipt();
  value.browsers.firefox.runtime.softwareAdapter = true;
  value.browsers.firefox.graphics.adaptive = true;
  value.browsers.firefox.faults.watchdogIncidents = 1;
  const failures = pass71NativeBrowserParityFailures(value);
  assert.ok(failures.includes('firefox:hardware-webgl2'));
  assert.ok(failures.includes('firefox:graphics'));
  assert.ok(failures.includes('firefox:runtime-or-watchdog-fault'));
});

test('rejects a different staged player or bot pose despite an identical seed', () => {
  const value = receipt();
  value.browsers.firefox.scene.signature = 'different-scene';
  assert.ok(pass71NativeBrowserParityFailures(value).includes('scene-not-identical'));
});
