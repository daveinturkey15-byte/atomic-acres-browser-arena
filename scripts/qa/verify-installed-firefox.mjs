import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const root = path.resolve(process.cwd());
const baseUrl = process.env.QA_BASE_URL ?? process.env.BASE_URL ?? '';
const expectedGate = process.env.PASS66_OWNED_GATE ?? '';
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
const parityViewport = Object.freeze([2_560, 1_440]);
const parityRouteParameters = Object.freeze({
  release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1', render: 'blender',
  externalServices: 'off', multiplayerQa: '1',
});
const softwareAdapterPattern = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic|fallback/iu;
const firefoxGraphicsPrefs = process.env.QA_FIREFOX_GRAPHICS === 'basic'
  ? {
    'gfx.webrender.force-disabled': true,
    'gfx.webrender.software': false,
    'layers.acceleration.disabled': true,
  }
  : process.env.QA_FIREFOX_GRAPHICS === 'hardware'
    ? {
      'gfx.webrender.all': true,
      'gfx.webrender.force-disabled': false,
      'gfx.webrender.software': false,
      'layers.acceleration.disabled': false,
    }
    : {};

if (expectedGate !== 'installed-firefox' || !/^https?:\/\/127\.0\.0\.1:\d+\/channels\/the-big-one\/$/u.test(baseUrl)
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
  if (value?.schemaVersion !== 4 || value.channel !== 'the-big-one' || value.releasePass !== 'PASS 66'
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
  await execute('window.__ATOMIC_ACRES_DEBUG__.startSolo(); return true;');
  const active = await poll(`${label} match admission`, () => execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (!state) return null;
    return {
      stage: state.bootstrap?.stage ?? null,
      error: state.bootstrap?.error ?? null,
      matchPhase: state.matchPhase ?? null,
      gameStarted: state.gameStarted === true,
      frameCount: state.frameCount ?? 0,
      backend: state.render?.runtime?.actualBackend ?? null,
      webglVersion: state.render?.webglVersion ?? null,
      requestedBackend: state.render?.runtime?.requestedBackend ?? null,
      failClosed: state.render?.runtime?.failClosed ?? null,
      deviceLost: state.render?.runtime?.deviceLost ?? null,
      uncapturedErrors: state.render?.runtime?.uncapturedErrors ?? null,
      adapterLabel: state.render?.runtime?.adapterLabel ?? null,
      softwareAdapter: state.render?.runtime?.softwareAdapter ?? null,
      liveProfile: state.render?.liveProfile ?? null,
      qualityAssetState: state.render?.qualityAssetStreaming?.atomicAcres ?? null,
      post: state.render?.atomicSignal ?? null,
      pixelRatio: state.render?.pixelRatio ?? null,
      drawingBuffer: state.render?.drawingBuffer ?? null,
      viewport: [innerWidth, innerHeight],
      pointerLock: typeof document.querySelector('#game')?.requestPointerLock === 'function',
      webRtc: typeof window.RTCPeerConnection === 'function',
      navigatorGpu: typeof navigator.gpu !== 'undefined',
      runtimeErrorVisible: document.querySelector('#runtime-error')?.hidden === false,
      userAgent: navigator.userAgent,
    };
  `), (sample) => sample?.gameStarted && sample.matchPhase === 'active' && sample.frameCount > menu.frameCount + 1, 90_000);
  if (active.error || active.runtimeErrorVisible) {
    throw new Error(`${label} reported a runtime fault: ${JSON.stringify(active)}`);
  }
  if (active.requestedBackend !== 'webgpu' || active.backend !== 'webgpu' || active.failClosed !== true
    || active.deviceLost !== false || active.uncapturedErrors !== 0
    || active.softwareAdapter !== false || typeof active.adapterLabel !== 'string'
    || active.adapterLabel.length < 3 || softwareAdapterPattern.test(active.adapterLabel)
    || active.liveProfile !== 'blender'
    || active.qualityAssetState !== 'ready' || active.post?.depthAwareBloom !== true
    || active.post?.advancedGraphics?.bloomStrength <= 0 || active.post?.advancedGraphics?.volumetricScale <= 0
    || JSON.stringify(active.viewport) !== JSON.stringify(parityViewport)
    || !active.navigatorGpu || !active.pointerLock || !active.webRtc) {
    throw new Error(`${label} capability contract failed: ${JSON.stringify(active)}`);
  }
  await execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    const probe = { startedAt: performance.now(), lastAt: 0, intervals: [], startingFrame: state.frameCount, active: true };
    window.__PASS73_FIREFOX_WEBGPU_FRAME_PROBE__ = probe;
    const tick = (now) => {
      if (!probe.active) return;
      if (probe.lastAt > 0) probe.intervals.push(now - probe.lastAt);
      probe.lastAt = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  `);
  await poll(`${label} WebGPU performance window`, () => execute(`
    const probe = window.__PASS73_FIREFOX_WEBGPU_FRAME_PROBE__;
    return probe ? { elapsedMs: performance.now() - probe.startedAt, samples: probe.intervals.length } : null;
  `), (sample) => sample?.elapsedMs >= 5_000, 12_000);
  const framePerformance = await execute(`
    const probe = window.__PASS73_FIREFOX_WEBGPU_FRAME_PROBE__;
    if (!probe) throw new Error('Firefox WebGPU frame probe missing');
    probe.active = false;
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const sorted = probe.intervals.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
    const elapsedMs = performance.now() - probe.startedAt;
    return {
      elapsedMs,
      sampleCount: sorted.length,
      callbackFps: sorted.length * 1000 / elapsedMs,
      frameDelta: state.frameCount - probe.startingFrame,
      p50FrameTimeMs: percentile(0.5),
      p95FrameTimeMs: percentile(0.95),
      p99FrameTimeMs: percentile(0.99),
      maximumFrameTimeMs: sorted.length > 0 ? Math.max(...sorted) : null,
      finalPresentation: state.render?.runtime?.presentation ?? null,
    };
  `);
  if (framePerformance.elapsedMs < 5_000 || framePerformance.sampleCount < 150
    || framePerformance.frameDelta < 150 || framePerformance.callbackFps < 30
    || framePerformance.p50FrameTimeMs > 34 || framePerformance.p95FrameTimeMs > 50
    || framePerformance.maximumFrameTimeMs > 250
    || !['healthy', 'synchronous'].includes(framePerformance.finalPresentation?.status)) {
    throw new Error(`${label} Firefox native WebGPU performance failed: ${JSON.stringify(framePerformance)}`);
  }
  return { label, admissionMs: Date.now() - startedAt, ...active, performance: framePerformance };
}

async function runChromeParityCycle(seed) {
  const browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: parityViewport[0], height: parityViewport[1] },
      deviceScaleFactor: 1,
    });
    const url = parityUrl(seed);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true;
    }, undefined, { timeout: 90_000 });
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true && state?.matchPhase === 'active' && state?.frameCount > 2;
    }, undefined, { timeout: 90_000 });
    const active = await page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        backend: state.render?.runtime?.actualBackend ?? null,
        requestedBackend: state.render?.runtime?.requestedBackend ?? null,
        failClosed: state.render?.runtime?.failClosed ?? null,
        deviceLost: state.render?.runtime?.deviceLost ?? null,
        uncapturedErrors: state.render?.runtime?.uncapturedErrors ?? null,
        adapterLabel: state.render?.runtime?.adapterLabel ?? null,
        softwareAdapter: state.render?.runtime?.softwareAdapter ?? null,
        liveProfile: state.render?.liveProfile ?? null,
        qualityAssetState: state.render?.qualityAssetStreaming?.atomicAcres ?? null,
        post: state.render?.atomicSignal ?? null,
        pixelRatio: state.render?.pixelRatio ?? null,
        drawingBuffer: state.render?.drawingBuffer ?? null,
        viewport: [innerWidth, innerHeight],
        navigatorGpu: typeof navigator.gpu !== 'undefined',
        userAgent: navigator.userAgent,
      };
    });
    if (active.requestedBackend !== 'webgpu' || active.backend !== 'webgpu' || active.failClosed !== true
      || active.deviceLost !== false || active.uncapturedErrors !== 0
      || active.softwareAdapter !== false || typeof active.adapterLabel !== 'string'
      || active.adapterLabel.length < 3 || softwareAdapterPattern.test(active.adapterLabel)
      || active.liveProfile !== 'blender'
      || active.qualityAssetState !== 'ready' || active.post?.depthAwareBloom !== true
      || active.post?.advancedGraphics?.bloomStrength <= 0 || active.post?.advancedGraphics?.volumetricScale <= 0
      || JSON.stringify(active.viewport) !== JSON.stringify(parityViewport) || !active.navigatorGpu) {
      throw new Error(`installed Chrome native WebGPU parity capability failed: ${JSON.stringify(active)}`);
    }
    await page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const probe = { startedAt: performance.now(), lastAt: 0, intervals: [], startingFrame: state.frameCount, active: true };
      window.__PASS73_CHROME_WEBGPU_FRAME_PROBE__ = probe;
      const tick = (now) => {
        if (!probe.active) return;
        if (probe.lastAt > 0) probe.intervals.push(now - probe.lastAt);
        probe.lastAt = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.waitForFunction(() => {
      const probe = window.__PASS73_CHROME_WEBGPU_FRAME_PROBE__;
      return probe && performance.now() - probe.startedAt >= 5_000;
    }, undefined, { timeout: 12_000 });
    const performance = await page.evaluate(() => {
      const probe = window.__PASS73_CHROME_WEBGPU_FRAME_PROBE__;
      probe.active = false;
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const sorted = probe.intervals.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
      const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
      const elapsedMs = performance.now() - probe.startedAt;
      return {
        elapsedMs,
        sampleCount: sorted.length,
        callbackFps: sorted.length * 1000 / elapsedMs,
        frameDelta: state.frameCount - probe.startingFrame,
        p50FrameTimeMs: percentile(0.5),
        p95FrameTimeMs: percentile(0.95),
        p99FrameTimeMs: percentile(0.99),
        maximumFrameTimeMs: sorted.length > 0 ? Math.max(...sorted) : null,
        finalPresentation: state.render?.runtime?.presentation ?? null,
      };
    });
    return { browser: browser.version(), executable: chromeExecutable, route: url.toString(), ...active, performance };
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
          args: hiddenHeadful ? [] : ['-headless'],
          prefs: {
            'browser.shell.checkDefaultBrowser': false,
            'browser.startup.page': 0,
            'datareporting.policy.dataSubmissionEnabled': false,
            'toolkit.telemetry.reportingpolicy.firstRun': false,
            'webgl.disabled': false,
            'dom.webgpu.enabled': true,
            'gfx.webgpu.force-enabled': true,
            ...firefoxGraphicsPrefs,
          },
        },
      },
    },
  }, 45_000);
  sessionId = created?.sessionId;
  if (!sessionId) throw new Error(`geckodriver did not return a session id: ${JSON.stringify(created)}`);
  await request('POST', `/session/${sessionId}/window/rect`, { width: 2_560, height: 1_440 });
  const cold = await runAdmissionCycle('cold', 'pass66-installed-firefox-cold');
  const paritySeed = 'pass73-installed-browser-webgpu-parity';
  const warm = await runAdmissionCycle('warm', paritySeed);
  const chrome = await runChromeParityCycle(paritySeed);
  const firefoxMedianThroughputFps = 1_000 / warm.performance.p50FrameTimeMs;
  const chromeMedianThroughputFps = 1_000 / chrome.performance.p50FrameTimeMs;
  const medianThroughputRatio = firefoxMedianThroughputFps / chromeMedianThroughputFps;
  const p95FrameTimeRatio = warm.performance.p95FrameTimeMs / chrome.performance.p95FrameTimeMs;
  const identicalGraphicsContract = warm.liveProfile === chrome.liveProfile
    && warm.qualityAssetState === chrome.qualityAssetState
    && warm.post?.depthAwareBloom === chrome.post?.depthAwareBloom
    && warm.post?.advancedGraphics?.bloomStrength === chrome.post?.advancedGraphics?.bloomStrength
    && warm.post?.advancedGraphics?.volumetricScale === chrome.post?.advancedGraphics?.volumetricScale
    && warm.pixelRatio === chrome.pixelRatio
    && JSON.stringify(warm.drawingBuffer) === JSON.stringify(chrome.drawingBuffer)
    && JSON.stringify(warm.viewport) === JSON.stringify(chrome.viewport);
  if (!identicalGraphicsContract || medianThroughputRatio < 0.8 || p95FrameTimeRatio > 1.25) {
    throw new Error(`installed Firefox/Chrome native WebGPU parity failed: ${JSON.stringify({
      firefoxMedianThroughputFps, chromeMedianThroughputFps, medianThroughputRatio, p95FrameTimeRatio,
      firefox: warm.performance, chrome: chrome.performance,
    })}`);
  }
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    gate: 'installed-firefox',
    sourceSha: expectedSourceSha,
    servedCandidate,
    browser: 'installed-firefox',
    executable: firefoxExecutable,
    driver: driverExecutable,
    launcher: driverLauncher ?? null,
    hiddenHeadful,
    cycles: [cold, warm],
    parity: {
      contract: 'same-content-native-webgpu-firefox-chrome-80pct-median-125pct-p95-v1',
      seed: paritySeed,
      viewport: parityViewport,
      profile: 'blender',
      map: 'atomic-acres',
      backend: 'webgpu',
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
