import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_PARITY_CONFIG,
  FRAME_PARITY_SCHEMA_VERSION,
  buildParityUrl,
  classifyParityRun,
  computeFramePercentiles,
  detectFrameCapAndVsync,
  validateParityReceipt,
} from './measure-browser-frame-parity.mjs';

const runnerSource = readFileSync(new URL('./measure-browser-frame-parity.mjs', import.meta.url), 'utf8');

test('computeFramePercentiles calculates exact statistical distributions', () => {
  // Empty or invalid input
  assert.deepEqual(computeFramePercentiles([]), {
    p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, minMs: null, meanMs: null, approximateFps: null, sampleCount: 0,
  });
  assert.deepEqual(computeFramePercentiles([0, -5, NaN, Infinity]), {
    p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, minMs: null, meanMs: null, approximateFps: null, sampleCount: 0,
  });

  // Synthetic 100-sample run: 1ms through 100ms
  const samples = Array.from({ length: 100 }, (_, i) => i + 1);
  const result = computeFramePercentiles(samples);

  assert.equal(result.sampleCount, 100);
  assert.equal(result.minMs, 1);
  assert.equal(result.maxMs, 100);
  assert.equal(result.p50Ms, 50);
  assert.equal(result.p95Ms, 95);
  assert.equal(result.p99Ms, 99);
  assert.equal(result.meanMs, 50.5);
  assert.equal(result.approximateFps, 20); // 1000 / 50

  // 150 FPS run (~6.67ms per frame)
  const chromeFrames = Array.from({ length: 300 }, () => 6.6 + (Math.random() * 0.2));
  const chromeStats = computeFramePercentiles(chromeFrames);
  assert.equal(chromeStats.sampleCount, 300);
  assert.ok(chromeStats.p50Ms >= 6.5 && chromeStats.p50Ms <= 6.9);
  assert.ok(chromeStats.approximateFps >= 140 && chromeStats.approximateFps <= 155);
});

test('detectFrameCapAndVsync detects standard vsync locks and uncapped runs', () => {
  // 60Hz lock (~!6.67ms)
  const frames60 = Array.from({ length: 120 }, () => 16.65 + (Math.random() * 0.04));
  const cap60 = detectFrameCapAndVsync(frames60, 16.67, 16.70);
  assert.equal(cap60.vsyncOrCapDetected, true);
  assert.equal(cap60.inferredCeilingHz, 60);

  // 120Hz lock (~8.33ms)
  const frames120 = Array.from({ length: 120 }, () => 8.32 + (Math.random() * 0.02));
  const cap120 = detectFrameCapAndVsync(frames120, 8.33, 8.35);
  assert.equal(cap120.vsyncOrCapDetected, true);
  assert.equal(cap120.inferredCeilingHz, 120);

  // 144Hz lock (~6.94ms)
  const frames144 = Array.from({ length: 120 }, () => 6.93 + (Math.random() * 0.02));
  const cap144 = detectFrameCapAndVsync(frames144, 6.94, 6.96);
  assert.equal(cap144.vsyncOrCapDetected, true);
  assert.equal(cap144.inferredCeilingHz, 144);

  // Uncapped fast run (e.g. 5.1ms)
  const framesUncapped = Array.from({ length: 120 }, () => 5.1 + (Math.random() * 0.1));
  const capUncapped = detectFrameCapAndVsync(framesUncapped, 5.15, 5.25);
  assert.equal(capUncapped.vsyncOrCapDetected, false);
  assert.equal(capUncapped.inferredCeilingHz, null);

  // Explicit targetHz override
  const targetHzOverride = detectFrameCapAndVsync(frames60, 16.67, 16.70, 60);
  assert.equal(targetHzOverride.vsyncOrCapDetected, true);
  assert.equal(targetHzOverride.inferredCeilingHz, 60);
});

test('classifyParityRun distinguishes genuine slowdown from wrong-route fallbacks and launch failures', () => {
  const healthyChrome = {
    status: 'LAUNCHED',
    actualBackend: 'webgpu',
    adapterLabel: 'NVIDIA GeForce RTX 5080',
    reachedWebGpu: true,
    frameTiming: { p50Ms: 6.67, p95Ms: 8.0, p99Ms: 10.0, maxMs: 14.0, approximateFps: 150.0 },
  };

  // Case 1: Healthy parity match
  const healthyFirefox = {
    status: 'LAUNCHED',
    actualBackend: 'webgpu',
    adapterLabel: 'NVIDIA GeForce RTX 5080',
    reachedWebGpu: true,
    frameTiming: { p50Ms: 7.14, p95Ms: 9.0, p99Ms: 11.0, maxMs: 15.0, approximateFps: 140.0 },
  };
  const parityMatch = classifyParityRun(healthyChrome, healthyFirefox);
  assert.equal(parityMatch.bothReachedWebGpu, true);
  assert.equal(parityMatch.diagnosis, 'BOTH_WEBGPU_PARITY_MATCH');
  assert.ok(parityMatch.throughputRatioFirefoxToChrome >= 0.9);

  // Case 2: Genuine slowdown (HF-331 symptom where Firefox WebGPU renders at ~10 FPS vs 150 FPS Chrome)
  const slowWebGpuFirefox = {
    status: 'LAUNCHED',
    actualBackend: 'webgpu',
    adapterLabel: 'NVIDIA GeForce RTX 5080',
    reachedWebGpu: true,
    frameTiming: { p50Ms: 100.0, p95Ms: 120.0, p99Ms: 150.0, maxMs: 200.0, approximateFps: 10.0 },
  };
  const slowResult = classifyParityRun(healthyChrome, slowWebGpuFirefox);
  assert.equal(slowResult.bothReachedWebGpu, true);
  assert.equal(slowResult.diagnosis, 'BOTH_WEBGPU_FIREFOX_GENUINELY_SLOWER');
  assert.equal(slowResult.throughputRatioFirefoxToChrome, 0.0667);
  assert.equal(slowResult.p50FrameTimeDeltaMs, 93.33);

  // Case 3: Wrong-route (Firefox silently fell back to WebGL2)
  const webGl2Firefox = {
    status: 'LAUNCHED',
    actualBackend: 'webgl2',
    adapterLabel: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Direct3D11 vs_5_0 ps_5_0)',
    reachedWebGpu: false,
    failClosed: true,
    frameTiming: { p50Ms: 16.67, p95Ms: 20.0, p99Ms: 25.0, maxMs: 30.0, approximateFps: 60.0 },
  };
  const webGl2Result = classifyParityRun(healthyChrome, webGl2Firefox);
  assert.equal(webGl2Result.bothReachedWebGpu, false);
  assert.equal(webGl2Result.diagnosis, 'FIREFOX_FELL_BACK_TO_WEBGL2');
  assert.equal(webGl2Result.firefoxRoute, 'webgl2');

  // Case 4: Firefox failed to initialize WebGPU (threw / crashed / adapter unavailable)
  const failedFirefox = {
    status: 'LAUNCHED',
    actualBackend: 'unknown',
    adapterLabel: 'unknown',
    reachedWebGpu: false,
    error: 'GPUDevice creation failed: Adapter unavailable',
  };
  const failedInitResult = classifyParityRun(healthyChrome, failedFirefox);
  assert.equal(failedInitResult.bothReachedWebGpu, false);
  assert.equal(failedInitResult.diagnosis, 'FIREFOX_FAILED_TO_INIT_WEBGPU');

  // Case 5: Launch failure
  const unlaunchedFirefox = {
    status: 'FAILED_LAUNCH',
    error: 'Firefox executable not found',
  };
  const unlaunchedResult = classifyParityRun(healthyChrome, unlaunchedFirefox);
  assert.equal(unlaunchedResult.bothReachedWebGpu, false);
  assert.equal(unlaunchedResult.diagnosis, 'BROWSER_LAUNCH_FAILED');
});

test('validateParityReceipt validates complete side-by-side JSON receipt structure', () => {
  const validReceipt = {
    schemaVersion: FRAME_PARITY_SCHEMA_VERSION,
    timestamp: '2026-08-22T09:30:00.000Z',
    environment: {
      os: 'win32',
      node: 'v22.0.0',
      resolution: [1920, 1080],
      arena: 'atomic-acres',
      graphicsProfile: 'quality',
      explicitRendererParam: 'webgpu',
      sampleWindowMs: 5000,
      targetUrl: 'http://127.0.0.1:4555/?renderer=webgpu&map=atomic-acres&render=quality&externalServices=off&multiplayerQa=1',
      chromeExecutable: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      firefoxExecutable: 'C:/Program Files/Mozilla Firefox/firefox.exe',
      geckodriverExecutable: 'C:/Users/david/projects/browser-tools/geckodriver.exe',
    },
    chrome: {
      status: 'LAUNCHED',
      browserName: 'chrome',
      browserVersion: '138.0.7204.92',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0',
      actualBackend: 'webgpu',
      requestedBackend: 'webgpu',
      adapterLabel: 'NVIDIA GeForce RTX 5080',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      failClosed: false,
      reachedWebGpu: true,
      deviceLost: false,
      uncapturedErrors: 0,
      liveProfile: 'quality',
      viewport: [1920, 1080],
      devicePixelRatio: 1,
      frameTiming: { p50Ms: 6.67, p95Ms: 8.0, p99Ms: 10.0, maxMs: 14.0, minMs: 5.5, meanMs: 6.8, approximateFps: 150.0, sampleCount: 750 },
      longTasks: { supported: true, count: 0, entries: [], longFrameCount: 0 },
      frameCapAndVsync: { vsyncOrCapDetected: false, inferredCeilingHz: null, reason: 'Uncapped' },
      presentationStatus: 'healthy',
      error: null,
    },
    firefox: {
      status: 'LAUNCHED',
      browserName: 'firefox',
      browserVersion: '154.0',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:154.0) Gecko/20100101 Firefox/154.0',
      actualBackend: 'webgpu',
      requestedBackend: 'webgpu',
      adapterLabel: 'NVIDIA GeForce RTX 5080',
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      failClosed: false,
      reachedWebGpu: true,
      deviceLost: false,
      uncapturedErrors: 0,
      liveProfile: 'quality',
      viewport: [1920, 1080],
      devicePixelRatio: 1,
      frameTiming: { p50Ms: 7.14, p95Ms: 9.0, p99Ms: 11.0, maxMs: 15.0, minMs: 6.0, meanMs: 7.3, approximateFps: 140.0, sampleCount: 700 },
      longTasks: { supported: true, count: 0, entries: [], longFrameCount: 0 },
      frameCapAndVsync: { vsyncOrCapDetected: false, inferredCeilingHz: null, reason: 'Uncapped' },
      presentationStatus: 'healthy',
      error: null,
    },
    comparison: {
      bothReachedWebGpu: true,
      chromeRoute: 'webgpu',
      firefoxRoute: 'webgpu',
      diagnosis: 'BOTH_WEBGPU_PARITY_MATCH',
      reason: 'Both browsers reached WebGPU on hardware adapter with comparable performance',
      throughputRatioFirefoxToChrome: 0.9333,
      p50FrameTimeDeltaMs: 0.47,
      p95FrameTimeDeltaMs: 1.0,
    },
    passed: true,
  };

  assert.deepEqual(validateParityReceipt(validReceipt), []);

  // Reject malformed schema
  assert.ok(validateParityReceipt(null).length > 0);
  assert.ok(validateParityReceipt({ ...validReceipt, schemaVersion: 999 }).length > 0);
  assert.ok(validateParityReceipt({ ...validReceipt, passed: 'true' }).length > 0);
  assert.ok(validateParityReceipt({ ...validReceipt, chrome: null }).length > 0);
  assert.ok(validateParityReceipt({ ...validReceipt, environment: { ...validReceipt.environment, explicitRendererParam: 'webgl2' } }).length > 0);
});

test('buildParityUrl constructs deterministic query parameters', () => {
  const url = buildParityUrl('http://127.0.0.1:4555/', {
    arenaId: 'atomic-acres',
    graphicsProfile: 'quality',
    rendererQuery: 'webgpu',
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('renderer'), 'webgpu');
  assert.equal(parsed.searchParams.get('map'), 'atomic-acres');
  assert.equal(parsed.searchParams.get('render'), 'quality');
  assert.equal(parsed.searchParams.get('externalServices'), 'off');
  assert.equal(parsed.searchParams.get('multiplayerQa'), '1');
});

test('runner script source enforces critical invariants', () => {
  // 1. Explicit ?renderer=webgpu
  assert.ok(runnerSource.includes("'webgpu'"));
  assert.ok(runnerSource.includes('buildParityUrl'));

  // 2. Both browsers headed (no headless forced)
  assert.ok(runnerSource.includes('headless: false'));
  assert.ok(!runnerSource.includes("args: ['-headless']"));

  // 3. Firefox WebGPU prefs configured
  assert.ok(runnerSource.includes("'dom.webgpu.enabled': true"));
  assert.ok(runnerSource.includes("'gfx.webgpu.force-enabled': true"));

  // 4. Chrome WebGPU flags configured
  assert.ok(runnerSource.includes('--enable-unsafe-webgpu'));
  assert.ok(runnerSource.includes('--use-webgpu-adapter=default'));

  // 5. GeckoDriver extraction and execution handled
  assert.ok(runnerSource.includes('extractGeckodriverIfArchive'));
  assert.ok(runnerSource.includes('GeckoDriverClient'));

  // 6. Fail-closed on non-WebGPU (exits non-zero if either failed)
  assert.ok(runnerSource.includes('process.exitCode = 1'));
  assert.ok(runnerSource.includes('bothReachedWebGpu'));

  // 7. Long task collection and vsync detection present
  assert.ok(runnerSource.includes('longtask'));
  assert.ok(runnerSource.includes('detectFrameCapAndVsync'));
  assert.ok(runnerSource.includes('computeFramePercentiles'));
});
