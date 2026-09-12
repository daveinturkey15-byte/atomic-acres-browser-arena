// NOTE (Lane Q, 2026-08-23): this drives Firefox through geckodriver, which
// launches it with a temporary profile. An explicit `-profile <dir>` is exactly
// what stops Firefox handing the content document focus on this machine -
// document.hasFocus() stays false for the whole session - and the product pauses
// its frame loop on that predicate. So any FRAME-RATE number taken through this
// path is measuring a paused game, which is what HF-331's "Firefox ~10 FPS"
// actually was. The audio/console evidence this file exists for is unaffected.
// For frame rate use scripts/qa/verify-cross-browser-matrix.mjs, and see
// docs/LANE_Q_CROSS_BROWSER_AND_MOBILE_AUDIT_2026-08-23.md.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import {
  hardwareAdapterVendor,
  nextOuterRectForContentViewport,
} from './pass66-owned-browser-verifier-contract.mjs';
import { OFFSCREEN_ARGS } from './lib/browser-launch-flags.mjs';

const root = path.resolve(process.cwd());
const baseUrl = process.env.QA_BASE_URL ?? process.env.BASE_URL ?? '';
const expectedGate = process.env.PASS66_OWNED_GATE ?? '';
const expectedReleasePass = process.env.QA_OWNED_RELEASE_PASS ?? '';
const expectedTopologySchemaVersion = Number(process.env.QA_OWNED_TOPOLOGY_SCHEMA_VERSION ?? Number.NaN);
const expectedSourceSha = process.env.PASS66_OWNED_SOURCE_SHA ?? '';
const expectedTreeSha256 = process.env.PASS66_OWNED_TREE_SHA256 ?? '';
const expectedFileCount = Number(process.env.PASS66_OWNED_FILE_COUNT ?? Number.NaN);
const receiptPath = process.env.PASS66_OWNED_RECEIPT_PATH ?? '';
const driverPort = Number(process.env.QA_GECKODRIVER_PORT ?? '4466');
const firefoxCandidates = [
  process.env.QA_FIREFOX_EXECUTABLE,
  'C:/Program Files/Mozilla Firefox/firefox.exe',
  'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
].filter(Boolean);
const driverCandidates = [
  process.env.QA_GECKODRIVER,
  'geckodriver.exe',
].filter(Boolean);
const firefoxExecutable = firefoxCandidates.find((candidate) => existsSync(candidate));
const chromeExecutable = [
  process.env.QA_CHROME_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
const driverExecutable = driverCandidates.find((candidate) => candidate === 'geckodriver.exe' || existsSync(candidate));
const driverLauncher = process.env.QA_GECKODRIVER_LAUNCHER;
const hiddenHeadful = process.env.QA_FIREFOX_HEADFUL_HIDDEN === '1';
const parityHeadless = !hiddenHeadful;
const presentationMode = parityHeadless ? 'headless' : 'headed';
const parityViewport = Object.freeze([2_560, 1_440]);
const parityRouteParameters = Object.freeze({
  release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1', render: 'quality',
  externalServices: 'off', multiplayerQa: '1',
});
const parityContract = 'same-content-matched-mode-native-webgpu-firefox-chrome-80pct-median-125pct-p95-v2';
const softwareAdapterPattern = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic|fallback|unavailable|unknown/iu;
const firefoxGraphicsMode = process.env.QA_FIREFOX_GRAPHICS ?? 'default';
const firefoxGraphicsPrefs = firefoxGraphicsMode === 'hardware'
  ? {
    'gfx.webrender.all': true,
    'gfx.webrender.force-disabled': false,
    'gfx.webrender.software': false,
    'layers.acceleration.disabled': false,
  }
  : {};

if (expectedGate !== 'installed-firefox' || !/^PASS \d+(?:\.\d+)?$/u.test(expectedReleasePass)
  || !Number.isSafeInteger(expectedTopologySchemaVersion) || expectedTopologySchemaVersion < 1
  || !/^https?:\/\/127\.0\.0\.1:\d+\/channels\/the-big-one\/$/u.test(baseUrl)
  || !/^[a-f0-9]{40}$/u.test(expectedSourceSha) || !/^[a-f0-9]{64}$/u.test(expectedTreeSha256)
  || !Number.isSafeInteger(expectedFileCount) || expectedFileCount < 2 || !path.isAbsolute(receiptPath)) {
  throw new Error('Installed Firefox QA must run through the clean-SHA owned Pass 66 verifier wrapper');
}

if (!firefoxExecutable) {
  throw new Error('Installed Firefox QA requires QA_FIREFOX_EXECUTABLE or a standard Mozilla Firefox installation');
}
if (!chromeExecutable) {
  throw new Error('Installed Firefox parity QA also requires installed Google Chrome');
}
if (!driverExecutable) {
  throw new Error('Installed Firefox QA requires QA_GECKODRIVER or geckodriver.exe on PATH');
}
if (driverLauncher && !existsSync(driverLauncher)) {
  throw new Error(`QA_GECKODRIVER_LAUNCHER does not exist: ${driverLauncher}`);
}
if (hiddenHeadful && !driverLauncher) {
  throw new Error('QA_FIREFOX_HEADFUL_HIDDEN requires QA_GECKODRIVER_LAUNCHER so Firefox cannot flash on the interactive desktop');
}
if (!Number.isSafeInteger(driverPort) || driverPort < 1_024 || driverPort > 65_535) {
  throw new Error(`QA_GECKODRIVER_PORT is invalid: ${process.env.QA_GECKODRIVER_PORT}`);
}
if (!['default', 'hardware'].includes(firefoxGraphicsMode)) {
  throw new Error('Installed Firefox native-WebGPU parity rejects non-hardware QA_FIREFOX_GRAPHICS overrides');
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function userAgentMatchesBrowserVersion(userAgent, browserVersion, family) {
  if (typeof userAgent !== 'string' || typeof browserVersion !== 'string') return false;
  const userAgentVersion = family === 'firefox'
    ? /Firefox\/(\d+)/u.exec(userAgent)?.[1]
    : /(?:Chrome|HeadlessChrome)\/(\d+)/u.exec(userAgent)?.[1];
  return userAgentVersion !== undefined && userAgentVersion === /^(\d+)/u.exec(browserVersion)?.[1];
}

const firefoxExecutableSha256 = sha256File(firefoxExecutable);
const chromeExecutableSha256 = sha256File(chromeExecutable);

function listenerPresent(port) {
  return new Promise((resolveListener) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (present) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveListener(present);
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
if (await listenerPresent(driverPort)) {
  throw new Error(`Refusing stale or unowned listener on geckodriver port ${driverPort}`);
}

const driverOutput = [];
const driverArguments = ['--host', '127.0.0.1', '--port', String(driverPort)];
const driver = spawn(driverLauncher ?? driverExecutable, driverLauncher ? [driverExecutable, ...driverArguments] : driverArguments, {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
driver.once('error', (error) => retainDriverOutput(error.stack ?? error.message));

function retainDriverOutput(chunk) {
  driverOutput.push(chunk.toString('utf8'));
  while (driverOutput.join('').length > 32 * 1_024) driverOutput.shift();
}
driver.stdout.on('data', retainDriverOutput);
driver.stderr.on('data', retainDriverOutput);

function waitForDriverExit(timeoutMs) {
  if (driver.exitCode !== null || driver.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      driver.removeListener('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    driver.once('exit', onExit);
  });
}

async function stopOwnedDriver() {
  if (driver.exitCode === null && driver.signalCode === null) {
    const graceful = waitForDriverExit(5_000);
    driver.kill('SIGTERM');
    if (!await graceful) {
      const forced = waitForDriverExit(2_000);
      driver.kill('SIGKILL');
      await forced;
    }
  }
  if (await listenerPresent(driverPort)) throw new Error(`Owned geckodriver port ${driverPort} remained bound after cleanup`);
}

const endpoint = `http://127.0.0.1:${driverPort}`;
let sessionId = null;

async function request(method, route, body, timeoutMs = 15_000) {
  const response = await fetch(`${endpoint}${route}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.value?.error) {
    const detail = payload?.value?.stacktrace || payload?.value?.message || JSON.stringify(payload);
    throw new Error(`WebDriver ${method} ${route} failed (${response.status}): ${detail}`);
  }
  return payload?.value;
}

async function poll(label, sample, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await sample();
    if (predicate(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`${label} timed out after ${timeoutMs} ms; last sample: ${JSON.stringify(last)}`);
}

async function execute(script) {
  return request('POST', `/session/${sessionId}/execute/sync`, { script, args: [] }, 30_000);
}

async function readServedCandidate() {
  const response = await fetch(new URL('channel-provenance.json', baseUrl), {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Candidate provenance returned HTTP ${response.status}`);
  const value = await response.json();
  if (value?.schemaVersion !== expectedTopologySchemaVersion || value.channel !== 'the-big-one'
    || value.releasePass !== expectedReleasePass
    || value.path !== 'channels/the-big-one' || value.sourceSha !== expectedSourceSha
    || value.treeSha256 !== expectedTreeSha256 || value.exactRootFileCount !== expectedFileCount) {
    throw new Error(`Served candidate provenance mismatch: ${JSON.stringify(value)}`);
  }
  return value;
}

function parityUrl(seed) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries({ ...parityRouteParameters, seed })) url.searchParams.set(key, value);
  return url;
}

function collectActiveBrowserState() {
  const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const runtime = state.render?.runtime ?? null;
  const post = state.render?.atomicSignal ?? null;
  const grass = state.render?.grass ?? null;
  const atmosphere = state.render?.atmosphere ?? null;
  const water = state.render?.water ?? null;
  const blenderEnvironment = state.render?.blenderEnvironment ?? null;
  return {
    stage: state.bootstrap?.stage ?? null,
    error: state.bootstrap?.error ?? null,
    matchPhase: state.matchPhase ?? null,
    gameStarted: state.gameStarted === true,
    frameCount: state.frameCount ?? 0,
    backend: runtime?.actualBackend ?? null,
    requestedBackend: runtime?.requestedBackend ?? null,
    failClosed: runtime?.failClosed ?? null,
    deviceLost: runtime?.deviceLost ?? null,
    uncapturedErrors: runtime?.uncapturedErrors ?? null,
    adapterLabel: runtime?.adapterLabel ?? null,
    adapterClass: runtime?.adapterClass ?? null,
    deviceClass: runtime?.deviceClass ?? null,
    softwareAdapter: runtime?.softwareAdapter ?? null,
    liveProfile: state.render?.liveProfile ?? null,
    qualityAssetState: state.render?.qualityAssetStreaming?.atomicAcres ?? null,
    post,
    pixelRatio: state.render?.pixelRatio ?? null,
    drawingBuffer: state.render?.drawingBuffer ?? null,
    viewport: [window.innerWidth, window.innerHeight],
    pointerLock: typeof document.querySelector('#game')?.requestPointerLock === 'function',
    webRtc: typeof window.RTCPeerConnection === 'function',
    navigatorGpu: typeof navigator.gpu !== 'undefined',
    visibilityState: document.visibilityState,
    documentHasFocus: document.hasFocus(),
    runtimeErrorVisible: document.querySelector('#runtime-error')?.hidden === false,
    userAgent: navigator.userAgent,
    graphicsContract: {
      arenaId: state.arena?.id ?? null,
      humanProfile: 'quality',
      internalRenderProfile: state.render?.liveProfile ?? null,
      renderer: {
        requestedBackend: runtime?.requestedBackend ?? null,
        actualBackend: runtime?.actualBackend ?? null,
        pixelRatio: state.render?.pixelRatio ?? null,
        drawingBuffer: state.render?.drawingBuffer ?? null,
        viewport: [window.innerWidth, window.innerHeight],
        shadows: state.render?.shadows ?? null,
        authoredShadows: state.render?.authoredShadows ?? null,
        shadowMode: state.render?.shadowMode ?? null,
        canvasAntialias: runtime?.canvasAntialias ?? null,
        canvasSamples: runtime?.canvasSamples ?? null,
        principalHdrSamples: runtime?.principalHdrSamples ?? null,
        bloomSamples: runtime?.bloomSamples ?? null,
        renderPipelineApi: runtime?.renderPipelineApi ?? null,
      },
      effects: {
        depthAwareBloom: post?.depthAwareBloom ?? null,
        advancedGraphics: post?.advancedGraphics ?? null,
        lighting: state.render?.lighting ?? null,
        sky: state.render?.sky ? {
          cloudBands: state.render.sky.cloudBands,
          godRayStrength: state.render.sky.godRayStrength,
          godRayLobes: state.render.sky.godRayLobes,
          linearHdr: state.render.sky.linearHdr,
        } : null,
        grass: grass ? {
          profile: grass.profile,
          enabled: grass.enabled,
          bypassReason: grass.bypassReason,
          layoutId: grass.layoutId,
          instances: grass.instances,
          blades: grass.blades,
          checksum: grass.checksum,
          chunks: grass.chunks,
          triangles: grass.triangles,
          triangleLimit: grass.triangleLimit,
          maximumDistance: grass.maximumDistance,
          adaptiveDistance: grass.adaptiveDistance,
        } : null,
        atmosphere: atmosphere ? {
          enabled: atmosphere.enabled,
          bypassReason: atmosphere.bypassReason,
          arenaId: atmosphere.arenaId,
          mistCards: atmosphere.mistCards,
          smokeCards: atmosphere.smokeCards,
          dustMotes: atmosphere.dustMotes,
          triangles: atmosphere.triangles,
          densityScale: atmosphere.densityScale,
        } : null,
        water,
      },
      assets: {
        qualityAssetState: state.render?.qualityAssetStreaming?.atomicAcres ?? null,
        qualityArtRootVisible: blenderEnvironment?.qualityArtRootVisible ?? null,
        proceduralRootActuallyVisible: blenderEnvironment?.proceduralRootActuallyVisible ?? null,
        overlappingPrimaryArenaRoots: blenderEnvironment?.overlappingPrimaryArenaRoots ?? null,
        asset: blenderEnvironment?.asset ?? null,
        meshCount: blenderEnvironment?.meshCount ?? null,
        triangleCount: blenderEnvironment?.triangleCount ?? null,
        surfaceSeparationPass: blenderEnvironment?.surfaceSeparationPass ?? null,
        worldIdentityPass: blenderEnvironment?.worldIdentityPass ?? null,
        proceduralWorldHidden: blenderEnvironment?.proceduralWorldHidden ?? null,
      },
    },
  };
}

function startBrowserFrameProbe(probeKey) {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const state = api.snapshot();
  const presentation = api.samplePresentationTelemetry();
  const probe = {
    startedAt: globalThis.performance.now(),
    lastAt: 0,
    intervals: [],
    startingFrame: state.frameCount,
    startingSubmissionSequence: presentation.submissionSequence,
    startingCompletedSequence: presentation.completedSequence,
    active: true,
  };
  window[probeKey] = probe;
  const tick = (now) => {
    if (!probe.active) return;
    if (probe.lastAt > 0) probe.intervals.push(now - probe.lastAt);
    probe.lastAt = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
}

function finishBrowserFrameProbe(probeKey) {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const probe = window[probeKey];
  if (!probe) throw new Error(`WebGPU frame probe ${probeKey} is missing`);
  probe.active = false;
  const state = api.snapshot();
  const pacing = state.render?.framePacing;
  const presentation = api.samplePresentationTelemetry();
  const sorted = probe.intervals
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const callbackPercentile = (fraction) => sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  ] ?? null;
  const elapsedMs = globalThis.performance.now() - probe.startedAt;
  return {
    metricSource: pacing?.source ?? null,
    elapsedMs,
    callbackSampleCount: sorted.length,
    callbackFps: sorted.length * 1_000 / elapsedMs,
    callbackP50Ms: callbackPercentile(0.5),
    callbackP95Ms: callbackPercentile(0.95),
    frameDelta: state.frameCount - probe.startingFrame,
    submissionSampleCount: pacing?.sampleCount ?? 0,
    submissionDelta: presentation.submissionSequence - probe.startingSubmissionSequence,
    completionDelta: presentation.completedSequence - probe.startingCompletedSequence,
    completionCaughtUp: presentation.completedSequence
      >= presentation.submissionSequence - presentation.maximumInFlightSubmissions,
    p50FrameTimeMs: pacing?.medianMs ?? null,
    p95FrameTimeMs: pacing?.p95Ms ?? null,
    p99FrameTimeMs: pacing?.p99Ms ?? null,
    maximumFrameTimeMs: pacing?.maxMs ?? null,
    finalPresentation: presentation,
  };
}

function assertFramePerformance(label, framePerformance) {
  if (framePerformance.metricSource !== 'webgpu-submission'
    || framePerformance.elapsedMs < 5_000 || framePerformance.callbackSampleCount < 150
    || framePerformance.callbackFps < 30 || framePerformance.submissionSampleCount < 180
    || framePerformance.submissionDelta < 180 || framePerformance.completionDelta < 1
    || framePerformance.completionCaughtUp !== true
    || !Number.isFinite(framePerformance.p50FrameTimeMs) || framePerformance.p50FrameTimeMs <= 0
    || !Number.isFinite(framePerformance.p95FrameTimeMs) || framePerformance.p95FrameTimeMs <= 0
    || !Number.isFinite(framePerformance.p99FrameTimeMs) || framePerformance.p99FrameTimeMs <= 0
    || !Number.isFinite(framePerformance.maximumFrameTimeMs) || framePerformance.maximumFrameTimeMs <= 0
    || framePerformance.p50FrameTimeMs > 34 || framePerformance.p95FrameTimeMs > 50
    || framePerformance.maximumFrameTimeMs > 250
    || !['healthy', 'synchronous'].includes(framePerformance.finalPresentation?.status)) {
    throw new Error(`${label} native WebGPU submission performance failed: ${JSON.stringify(framePerformance)}`);
  }
}

async function firefoxContentViewportSample() {
  const [rect, content] = await Promise.all([
    request('GET', `/session/${sessionId}/window/rect`),
    execute(`return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };`),
  ]);
  return { ...content, windowRect: rect };
}

async function setFirefoxContentViewport() {
  const attempts = [];
  let requestedOuterRect = { width: parityViewport[0], height: parityViewport[1] };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await request('POST', `/session/${sessionId}/window/rect`, requestedOuterRect);
    const sample = await firefoxContentViewportSample();
    attempts.push({ requestedOuterRect, sample });
    if (sample.innerWidth === parityViewport[0] && sample.innerHeight === parityViewport[1]) {
      if (sample.devicePixelRatio !== 1
        || sample.outerWidth !== sample.windowRect?.width
        || sample.outerHeight !== sample.windowRect?.height) {
        throw new Error(`Firefox content viewport has unbound pixel/outer dimensions: ${JSON.stringify(sample)}`);
      }
      return {
        mechanism: 'webdriver-outer-compensation',
        requestedContentViewport: parityViewport,
        attempts,
        final: sample,
        matched: true,
      };
    }
    requestedOuterRect = nextOuterRectForContentViewport(sample, parityViewport);
  }
  throw new Error(`Firefox could not establish exact ${parityViewport.join('x')} content viewport: ${JSON.stringify(attempts)}`);
}

async function runAdmissionCycle(label, seed) {
  const url = parityUrl(seed);
  const startedAt = Date.now();
  await request('POST', `/session/${sessionId}/url`, { url: url.toString() }, 45_000);
  const menu = await poll(`${label} menu admission`, () => execute(`
    const api = window.__ATOMIC_ACRES_DEBUG__;
    if (!api) return null;
    const state = api.snapshot();
    return {
      stage: state.bootstrap?.stage ?? null,
      error: state.bootstrap?.error ?? null,
      weaponReady: state.weaponReady === true,
      soloEnabled: document.querySelector('#solo')?.disabled === false,
      frameCount: state.frameCount ?? 0,
    };
  `), (sample) => sample?.stage === 'ready' && sample.weaponReady && sample.soloEnabled, 90_000);
  if (menu.error) throw new Error(`${label} bootstrap error: ${menu.error}`);
  await execute(`
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    return true;
  `);
  const active = await poll(`${label} match admission`, () => execute(
    `return (${collectActiveBrowserState.toString()})();`,
  ), (sample) => sample?.gameStarted && sample.matchPhase === 'active' && sample.frameCount > menu.frameCount + 1, 90_000);
  if (active.error || active.runtimeErrorVisible) {
    throw new Error(`${label} reported a runtime fault: ${JSON.stringify(active)}`);
  }
  if (active.requestedBackend !== 'webgpu' || active.backend !== 'webgpu' || active.failClosed !== false
    || active.deviceLost !== false || active.uncapturedErrors !== 0
    || active.softwareAdapter !== false || typeof active.adapterLabel !== 'string'
    || active.adapterLabel.length < 3 || softwareAdapterPattern.test(active.adapterLabel)
    || active.adapterClass !== 'GPUAdapter' || active.deviceClass !== 'GPUDevice'
    || active.liveProfile !== 'blender'
    || active.qualityAssetState !== 'ready' || active.post?.depthAwareBloom !== true
    || !Number.isFinite(active.post?.advancedGraphics?.bloomStrength)
    || active.post.advancedGraphics.bloomStrength <= 0
    || !Number.isFinite(active.post?.advancedGraphics?.volumetricScale)
    || active.post.advancedGraphics.volumetricScale <= 0
    || JSON.stringify(active.viewport) !== JSON.stringify(parityViewport)
    || active.pixelRatio !== 1 || JSON.stringify(active.drawingBuffer) !== JSON.stringify(parityViewport)
    || active.visibilityState !== 'visible' || active.documentHasFocus !== true
    || !active.navigatorGpu || !active.pointerLock || !active.webRtc) {
    throw new Error(`${label} capability contract failed: ${JSON.stringify(active)}`);
  }
  const adapterVendor = hardwareAdapterVendor(active.adapterLabel);
  if (adapterVendor === null) {
    throw new Error(`${label} Firefox did not expose a recognized hardware adapter vendor: ${active.adapterLabel}`);
  }
  const probeKey = '__PASS73_FIREFOX_WEBGPU_FRAME_PROBE__';
  await execute(`return (${startBrowserFrameProbe.toString()})(${JSON.stringify(probeKey)});`);
  await poll(`${label} WebGPU performance window`, () => execute(`
    const probe = window[${JSON.stringify(probeKey)}];
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.samplePresentationTelemetry();
    return probe && presentation ? {
      elapsedMs: performance.now() - probe.startedAt,
      samples: probe.intervals.length,
      submissionDelta: presentation.submissionSequence - probe.startingSubmissionSequence,
    } : null;
  `), (sample) => sample?.elapsedMs >= 5_000 && sample?.submissionDelta >= 180, 25_000);
  const framePerformance = await execute(
    `return (${finishBrowserFrameProbe.toString()})(${JSON.stringify(probeKey)});`,
  );
  assertFramePerformance(`${label} Firefox`, framePerformance);
  return {
    label,
    route: url.toString(),
    admissionMs: Date.now() - startedAt,
    ...active,
    adapterVendor,
    performance: framePerformance,
  };
}

async function runChromeParityCycles(seed) {
  const browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: parityHeadless,
    args: [...OFFSCREEN_ARGS,
    '--enable-unsafe-webgpu'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: parityViewport[0], height: parityViewport[1] },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const finalViewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));
    const viewportControl = {
      mechanism: 'playwright-content-viewport',
      requestedContentViewport: parityViewport,
      final: finalViewport,
      matched: finalViewport.innerWidth === parityViewport[0]
        && finalViewport.innerHeight === parityViewport[1]
        && finalViewport.devicePixelRatio === 1,
    };
    if (!viewportControl.matched) {
      throw new Error(`Chrome could not establish exact ${parityViewport.join('x')} content viewport: ${JSON.stringify(viewportControl)}`);
    }

    async function runCycle(label, cycleSeed) {
      const url = parityUrl(cycleSeed);
      const startedAt = Date.now();
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
      const menuFrame = await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true
          && document.querySelector('#solo')?.disabled === false
          ? state.frameCount
          : null;
      }, undefined, { timeout: 90_000 }).then((handle) => handle.jsonValue());
      await page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.startSolo();
        window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
      });
      await page.waitForFunction((startingFrame) => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.gameStarted === true && state?.matchPhase === 'active'
          && state?.frameCount > startingFrame + 1;
      }, menuFrame, { timeout: 90_000 });
      const active = await page.evaluate(collectActiveBrowserState);
      if (active.error || active.runtimeErrorVisible) {
        throw new Error(`${label} Chrome reported a runtime fault: ${JSON.stringify(active)}`);
      }
      if (active.requestedBackend !== 'webgpu' || active.backend !== 'webgpu' || active.failClosed !== false
        || active.deviceLost !== false || active.uncapturedErrors !== 0
        || active.softwareAdapter !== false || typeof active.adapterLabel !== 'string'
        || active.adapterLabel.length < 3 || softwareAdapterPattern.test(active.adapterLabel)
        || active.adapterClass !== 'GPUAdapter' || active.deviceClass !== 'GPUDevice'
        || active.liveProfile !== 'blender'
        || active.qualityAssetState !== 'ready' || active.post?.depthAwareBloom !== true
        || !Number.isFinite(active.post?.advancedGraphics?.bloomStrength)
        || active.post.advancedGraphics.bloomStrength <= 0
        || !Number.isFinite(active.post?.advancedGraphics?.volumetricScale)
        || active.post.advancedGraphics.volumetricScale <= 0
        || JSON.stringify(active.viewport) !== JSON.stringify(parityViewport)
        || active.pixelRatio !== 1 || JSON.stringify(active.drawingBuffer) !== JSON.stringify(parityViewport)
        || active.visibilityState !== 'visible' || active.documentHasFocus !== true
        || !active.navigatorGpu || !active.pointerLock || !active.webRtc) {
        throw new Error(`${label} installed Chrome native WebGPU capability failed: ${JSON.stringify(active)}`);
      }
      const adapterVendor = hardwareAdapterVendor(active.adapterLabel);
      if (adapterVendor === null) {
        throw new Error(`${label} Chrome did not expose a recognized hardware adapter vendor: ${active.adapterLabel}`);
      }
      const probeKey = '__PASS73_CHROME_WEBGPU_FRAME_PROBE__';
      await page.evaluate(startBrowserFrameProbe, probeKey);
      await page.waitForFunction((key) => {
        const probe = window[key];
        const presentation = window.__ATOMIC_ACRES_DEBUG__?.samplePresentationTelemetry();
        return probe && presentation && performance.now() - probe.startedAt >= 5_000
          && presentation.submissionSequence - probe.startingSubmissionSequence >= 180;
      }, probeKey, { timeout: 25_000 });
      const framePerformance = await page.evaluate(finishBrowserFrameProbe, probeKey);
      assertFramePerformance(`${label} Chrome`, framePerformance);
      return {
        label,
        route: url.toString(),
        admissionMs: Date.now() - startedAt,
        ...active,
        adapterVendor,
        performance: framePerformance,
      };
    }

    const cycles = [
      await runCycle('cold', 'pass73-installed-browser-webgpu-cold'),
      await runCycle('warm', seed),
    ];
    const browserVersion = browser.version();
    const userAgent = cycles[1].userAgent;
    const nativeUserAgent = userAgentMatchesBrowserVersion(userAgent, browserVersion, 'chrome');
    if (!nativeUserAgent) {
      throw new Error(`Chrome user agent does not match installed browser ${browserVersion}: ${userAgent}`);
    }
    return {
      browserVersion,
      executable: chromeExecutable,
      executableSha256: chromeExecutableSha256,
      headless: parityHeadless,
      presentationMode,
      nativeUserAgent,
      userAgent,
      cycles,
      viewportControl,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const servedCandidate = await readServedCandidate();
  await poll('geckodriver startup', () => request('GET', '/status', undefined, 1_000).catch(() => null), (value) => value?.ready === true, 15_000);
  const created = await request('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        acceptInsecureCerts: false,
        pageLoadStrategy: 'normal',
        'moz:firefoxOptions': {
          binary: firefoxExecutable,
          args: parityHeadless ? ['-headless'] : [],
          prefs: {
            'browser.shell.checkDefaultBrowser': false,
            'browser.startup.page': 0,
            'datareporting.policy.dataSubmissionEnabled': false,
            'toolkit.telemetry.reportingpolicy.firstRun': false,
            'webgl.disabled': false,
            'dom.webgpu.enabled': true,
            'gfx.webgpu.force-enabled': true,
            'layout.css.devPixelsPerPx': '1.0',
            ...firefoxGraphicsPrefs,
          },
        },
      },
    },
  }, 45_000);
  sessionId = created?.sessionId;
  if (!sessionId) throw new Error(`geckodriver did not return a session id: ${JSON.stringify(created)}`);
  const firefoxViewportControl = await setFirefoxContentViewport();
  const cold = await runAdmissionCycle('cold', 'pass73-installed-browser-webgpu-cold');
  const paritySeed = 'pass73-installed-browser-webgpu-parity';
  const warm = await runAdmissionCycle('warm', paritySeed);
  const firefoxBrowserVersion = created?.capabilities?.browserVersion ?? null;
  const firefoxNativeUserAgent = userAgentMatchesBrowserVersion(warm.userAgent, firefoxBrowserVersion, 'firefox');
  if (!firefoxNativeUserAgent) {
    throw new Error(`Firefox user agent does not match installed browser ${firefoxBrowserVersion}: ${warm.userAgent}`);
  }
  await request('DELETE', `/session/${sessionId}`, undefined, 30_000);
  sessionId = null;
  const firefoxSessionClosedBeforeChrome = true;
  const chrome = await runChromeParityCycles(paritySeed);
  const chromeWarm = chrome.cycles[1];
  const firefoxMedianThroughputFps = 1_000 / warm.performance.p50FrameTimeMs;
  const chromeMedianThroughputFps = 1_000 / chromeWarm.performance.p50FrameTimeMs;
  const medianThroughputRatio = firefoxMedianThroughputFps / chromeMedianThroughputFps;
  const p95FrameTimeRatio = warm.performance.p95FrameTimeMs / chromeWarm.performance.p95FrameTimeMs;
  const identicalGraphicsContract = JSON.stringify(cold.graphicsContract) === JSON.stringify(chrome.cycles[0].graphicsContract)
    && JSON.stringify(warm.graphicsContract) === JSON.stringify(chromeWarm.graphicsContract)
    && cold.route === chrome.cycles[0].route
    && warm.route === chromeWarm.route;
  if (!identicalGraphicsContract || warm.adapterVendor !== chromeWarm.adapterVendor
    || medianThroughputRatio < 0.8 || p95FrameTimeRatio > 1.25) {
    throw new Error(`installed Firefox/Chrome native WebGPU parity failed: ${JSON.stringify({
      firefoxMedianThroughputFps, chromeMedianThroughputFps, medianThroughputRatio, p95FrameTimeRatio,
      firefox: warm.performance, chrome: chromeWarm.performance,
    })}`);
  }
  if (sha256File(firefoxExecutable) !== firefoxExecutableSha256
    || sha256File(chromeExecutable) !== chromeExecutableSha256) {
    throw new Error('Installed Firefox or Chrome executable changed during parity verification');
  }
  const servedCandidateAfter = await readServedCandidate();
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    gate: 'installed-firefox',
    releasePass: expectedReleasePass,
    topologySchemaVersion: expectedTopologySchemaVersion,
    sourceSha: expectedSourceSha,
    servedCandidate,
    servedCandidateAfter,
    browser: 'installed-firefox',
    executable: firefoxExecutable,
    driver: driverExecutable,
    launcher: driverLauncher ?? null,
    hiddenHeadful,
    firefoxSessionClosedBeforeChrome,
    toolchain: {
      firefox: {
        executable: firefoxExecutable,
        executableSha256: firefoxExecutableSha256,
        browserVersion: firefoxBrowserVersion,
        headless: parityHeadless,
        presentationMode,
        graphicsMode: firefoxGraphicsMode,
        nativeUserAgent: firefoxNativeUserAgent,
        userAgent: warm.userAgent,
      },
      chrome: {
        executable: chrome.executable,
        executableSha256: chrome.executableSha256,
        browserVersion: chrome.browserVersion,
        headless: chrome.headless,
        presentationMode: chrome.presentationMode,
        nativeUserAgent: chrome.nativeUserAgent,
        userAgent: chrome.userAgent,
      },
    },
    viewportControl: {
      firefox: firefoxViewportControl,
      chrome: chrome.viewportControl,
    },
    cycles: [cold, warm],
    parity: {
      contract: parityContract,
      seed: paritySeed,
      routeParameters: parityRouteParameters,
      viewport: parityViewport,
      profile: 'quality',
      internalRenderProfile: 'blender',
      map: 'atomic-acres',
      backend: 'webgpu',
      presentationMode,
      chrome,
      firefoxMedianThroughputFps,
      chromeMedianThroughputFps,
      medianThroughputRatio,
      p95FrameTimeRatio,
      identicalGraphicsContract,
      passed: true,
    },
  };
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  const driverDetail = driverOutput.join('').trim();
  process.stderr.write(`${detail}${driverDetail ? `\n--- geckodriver ---\n${driverDetail}` : ''}\n`);
  process.exitCode = 1;
} finally {
  if (sessionId) await request('DELETE', `/session/${sessionId}`, undefined, 10_000).catch(() => undefined);
  await stopOwnedDriver();
}
