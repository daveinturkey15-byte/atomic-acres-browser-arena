// =====================================================================
// SUPERSEDED 2026-08-23 (Lane Q). DO NOT REACH FOR THIS FOR HF-331.
//
// HF-331 is CLOSED and this instrument is one of the ones that could not
// close it. Root cause, bisected: Firefox launched with an explicit
// `-profile <dir>` never gives the content document focus - document
// .hasFocus() stays false forever and no focus/blur/focusin event ever
// fires, even with the window verified foreground, visible, and clicked
// into with synthesised input. The product pauses its frame loop on
// exactly that predicate (`ownsForeground()` in src/legacy-main.ts), so
// every harness that used a disposable -profile measured a game that was
// deliberately rendering nothing and reported it as "Firefox is slow".
//
// The measured answer: Firefox 154 runs atomic-acres at 38.5 fps median on
// WebGPU against its own 166.7 fps presentation ceiling - about 88% of
// Chrome, not a fifteenth of it.
//
// Working instrument:  scripts/qa/verify-cross-browser-matrix.mjs
// Standing gate:       npm run qa:cross-browser
// Lane discipline:     scripts/qa/installed-browser-lanes.mjs
// Write-up:            docs/LANE_Q_CROSS_BROWSER_AND_MOBILE_AUDIT_2026-08-23.md
// =====================================================================
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
} from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

export const FRAME_PARITY_SCHEMA_VERSION = 1;

export const DEFAULT_PARITY_CONFIG = Object.freeze({
  viewport: Object.freeze([1920, 1080]),
  arenaId: 'atomic-acres',
  graphicsProfile: 'quality',
  sampleWindowMs: 5000,
  previewPort: 4555,
  driverPort: 4469,
  rendererQuery: 'webgpu',
  geckodriverArchive: 'C:/Users/david/projects/browser-tools/geckodriver-v0.37.1-win64.zip',
  firefoxExecutableCandidates: Object.freeze([
    'C:/Program Files/Mozilla Firefox/firefox.exe',
    'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
  ]),
  chromeExecutableCandidates: Object.freeze([
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ]),
});

export function computeFramePercentiles(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return {
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      minMs: null,
      meanMs: null,
      approximateFps: null,
      sampleCount: 0,
    };
  }
  const valid = intervals.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (valid.length === 0) {
    return {
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      minMs: null,
      meanMs: null,
      approximateFps: null,
      sampleCount: 0,
    };
  }
  valid.sort((a, b) => a - b);
  const percentile = (p) => {
    const idx = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * p) - 1));
    return valid[idx];
  };
  const p50 = percentile(0.5);
  const p95 = percentile(0.95);
  const p99 = percentile(0.99);
  const min = valid[0];
  const max = valid[valid.length - 1];
  const mean = valid.reduce((sum, val) => sum + val, 0) / valid.length;
  const approximateFps = p50 > 0 ? 1000 / p50 : null;

  return {
    p50Ms: Number(p50.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    p99Ms: Number(p99.toFixed(3)),
    maxMs: Number(max.toFixed(3)),
    minMs: Number(min.toFixed(3)),
    meanMs: Number(mean.toFixed(3)),
    approximateFps: approximateFps !== null ? Number(approximateFps.toFixed(2)) : null,
    sampleCount: valid.length,
  };
}

export function detectFrameCapAndVsync(intervals, p50Ms, p95Ms, targetHz = null) {
  if (!Array.isArray(intervals) || intervals.length < 10 || p50Ms === null) {
    return {
      vsyncOrCapDetected: false,
      inferredCeilingHz: targetHz,
      reason: targetHz ? ('Configured targetHz: ' + targetHz) : 'Insufficient frame samples to determine ceiling',
    };
  }

  if (targetHz && Number.isFinite(targetHz) && targetHz > 0) {
    const targetIntervalMs = 1000 / targetHz;
    if (Math.abs(p50Ms - targetIntervalMs) / targetIntervalMs < 0.05) {
      return {
        vsyncOrCapDetected: true,
        inferredCeilingHz: targetHz,
        reason: 'p50 frame time (' + p50Ms + 'ms) matches configured targetHz ceiling (' + targetHz + 'Hz / ' + targetIntervalMs.toFixed(2) + 'ms)',
      };
    }
  }

  const standardRates = [60, 75, 120, 144, 165, 240, 360];
  for (const rate of standardRates) {
    const targetIntervalMs = 1000 / rate;
    const delta = Math.abs(p50Ms - targetIntervalMs);
    if (delta / targetIntervalMs <= 0.035) {
      const p95Delta = p95Ms !== null ? Math.abs(p95Ms - targetIntervalMs) / targetIntervalMs : 1;
      if (p95Delta <= 0.15) {
        return {
          vsyncOrCapDetected: true,
          inferredCeilingHz: rate,
          reason: 'p50 frame time (' + p50Ms + 'ms) tightly locks to ' + rate + 'Hz VSync/refresh interval (' + targetIntervalMs.toFixed(2) + 'ms)',
        };
      }
    }
  }

  const estFps = 1000 / p50Ms;
  return {
    vsyncOrCapDetected: false,
    inferredCeilingHz: null,
    reason: 'Uncapped or non-standard frame interval; median throughput ~' + estFps.toFixed(1) + ' FPS (' + p50Ms + 'ms)',
  };
}

export function classifyParityRun(chromeResult, firefoxResult) {
  const chromeLaunched = chromeResult?.status === 'LAUNCHED';
  const firefoxLaunched = firefoxResult?.status === 'LAUNCHED';

  if (!chromeLaunched || !firefoxLaunched) {
    return {
      bothReachedWebGpu: false,
      chromeRoute: chromeResult?.actualBackend ?? 'unlaunched',
      firefoxRoute: firefoxResult?.actualBackend ?? 'unlaunched',
      diagnosis: 'BROWSER_LAUNCH_FAILED',
      reason: 'Browser launch failed: Chrome=' + (chromeResult?.status ?? 'missing') + ', Firefox=' + (firefoxResult?.status ?? 'missing'),
      throughputRatioFirefoxToChrome: null,
      p50FrameTimeDeltaMs: null,
      p95FrameTimeDeltaMs: null,
    };
  }

  const chromeWebGpu = chromeResult.actualBackend === 'webgpu' && chromeResult.reachedWebGpu === true;
  const firefoxWebGpu = firefoxResult.actualBackend === 'webgpu' && firefoxResult.reachedWebGpu === true;
  const chromeFps = chromeResult.frameTiming?.approximateFps ?? null;
  const firefoxFps = firefoxResult.frameTiming?.approximateFps ?? null;
  const chromeP50 = chromeResult.frameTiming?.p50Ms ?? null;
  const firefoxP50 = firefoxResult.frameTiming?.p50Ms ?? null;
  const chromeP95 = chromeResult.frameTiming?.p95Ms ?? null;
  const firefoxP95 = firefoxResult.frameTiming?.p95Ms ?? null;

  const throughputRatio = (chromeFps && firefoxFps && chromeFps > 0)
    ? Number((firefoxFps / chromeFps).toFixed(4))
    : null;
  const p50Delta = (chromeP50 !== null && firefoxP50 !== null)
    ? Number((firefoxP50 - chromeP50).toFixed(3))
    : null;
  const p95Delta = (chromeP95 !== null && firefoxP95 !== null)
    ? Number((firefoxP95 - chromeP95).toFixed(3))
    : null;

  if (!chromeWebGpu) {
    return {
      bothReachedWebGpu: false,
      chromeRoute: chromeResult.actualBackend ?? 'unknown',
      firefoxRoute: firefoxResult.actualBackend ?? 'unknown',
      diagnosis: 'CHROME_FAILED_TO_REACH_WEBGPU',
      reason: 'Chrome did not reach WebGPU (actualBackend: ' + chromeResult.actualBackend + ', adapter: ' + chromeResult.adapterLabel + ')',
      throughputRatioFirefoxToChrome: throughputRatio,
      p50FrameTimeDeltaMs: p50Delta,
      p95FrameTimeDeltaMs: p95Delta,
    };
  }

  if (!firefoxWebGpu) {
    if (firefoxResult.actualBackend === 'webgl2') {
      return {
        bothReachedWebGpu: false,
        chromeRoute: 'webgpu',
        firefoxRoute: 'webgl2',
        diagnosis: 'FIREFOX_FELL_BACK_TO_WEBGL2',
        reason: 'Firefox silently fell back to WebGL2 instead of WebGPU (adapter: ' + firefoxResult.adapterLabel + ', failClosed: ' + firefoxResult.failClosed + ')',
        throughputRatioFirefoxToChrome: throughputRatio,
        p50FrameTimeDeltaMs: p50Delta,
        p95FrameTimeDeltaMs: p95Delta,
      };
    }
    return {
      bothReachedWebGpu: false,
      chromeRoute: 'webgpu',
      firefoxRoute: firefoxResult.actualBackend ?? 'unknown',
      diagnosis: 'FIREFOX_FAILED_TO_INIT_WEBGPU',
      reason: 'Firefox failed to reach WebGPU (actualBackend: ' + firefoxResult.actualBackend + ', error: ' + (firefoxResult.error ?? 'unknown') + ')',
      throughputRatioFirefoxToChrome: throughputRatio,
      p50FrameTimeDeltaMs: p50Delta,
      p95FrameTimeDeltaMs: p95Delta,
    };
  }

  let diagnosis = 'BOTH_WEBGPU_PARITY_MATCH';
  let reason = 'Both browsers reached WebGPU on hardware adapter with comparable performance';

  if (throughputRatio !== null && throughputRatio < 0.5) {
    diagnosis = 'BOTH_WEBGPU_FIREFOX_GENUINELY_SLOWER';
    reason = 'Both browsers reached WebGPU, but Firefox throughput (~' + firefoxFps + ' FPS) is significantly slower than Chrome (~' + chromeFps + ' FPS, ratio: ' + throughputRatio + ')';
  } else if (throughputRatio !== null && throughputRatio > 1.5) {
    diagnosis = 'BOTH_WEBGPU_FIREFOX_FASTER';
    reason = 'Both browsers reached WebGPU, and Firefox throughput (~' + firefoxFps + ' FPS) is faster than Chrome (~' + chromeFps + ' FPS, ratio: ' + throughputRatio + ')';
  }

  return {
    bothReachedWebGpu: true,
    chromeRoute: 'webgpu',
    firefoxRoute: 'webgpu',
    diagnosis,
    reason,
    throughputRatioFirefoxToChrome: throughputRatio,
    p50FrameTimeDeltaMs: p50Delta,
    p95FrameTimeDeltaMs: p95Delta,
  };
}

export function validateParityReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return ['Receipt must be an object'];

  if (receipt.schemaVersion !== FRAME_PARITY_SCHEMA_VERSION) {
    errors.push('schemaVersion mismatch: expected ' + FRAME_PARITY_SCHEMA_VERSION + ', received ' + receipt.schemaVersion);
  }
  if (typeof receipt.timestamp !== 'string' || !receipt.timestamp) {
    errors.push('timestamp is missing or invalid');
  }
  if (!receipt.environment || typeof receipt.environment !== 'object') {
    errors.push('environment section is missing');
  } else {
    if (!Array.isArray(receipt.environment.resolution) || receipt.environment.resolution.length !== 2) {
      errors.push('environment.resolution must be [width, height]');
    }
    if (!receipt.environment.arena) errors.push('environment.arena is missing');
    if (!receipt.environment.graphicsProfile) errors.push('environment.graphicsProfile is missing');
    if (receipt.environment.explicitRendererParam !== 'webgpu') {
      errors.push('environment.explicitRendererParam must be "webgpu"');
    }
  }

  for (const browserName of ['chrome', 'firefox']) {
    const data = receipt[browserName];
    if (!data || typeof data !== 'object') {
      errors.push(browserName + ' section is missing');
      continue;
    }
    if (!['LAUNCHED', 'FAILED_LAUNCH', 'CRASHED'].includes(data.status)) {
      errors.push(browserName + '.status must be LAUNCHED, FAILED_LAUNCH, or CRASHED');
    }
    if (data.status === 'LAUNCHED') {
      if (typeof data.actualBackend !== 'string') errors.push(browserName + '.actualBackend must be a string');
      if (typeof data.adapterLabel !== 'string') errors.push(browserName + '.adapterLabel must be a string');
      if (typeof data.reachedWebGpu !== 'boolean') errors.push(browserName + '.reachedWebGpu must be a boolean');
      if (!data.frameTiming || typeof data.frameTiming !== 'object') {
        errors.push(browserName + '.frameTiming must be an object');
      } else {
        for (const metric of ['p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'approximateFps']) {
          if (data.frameTiming[metric] === undefined) {
            errors.push(browserName + '.frameTiming.' + metric + ' must be present');
          }
        }
      }
      if (!data.longTasks || typeof data.longTasks !== 'object') {
        errors.push(browserName + '.longTasks must be an object');
      }
      if (!data.frameCapAndVsync || typeof data.frameCapAndVsync !== 'object') {
        errors.push(browserName + '.frameCapAndVsync must be an object');
      }
    }
  }

  if (!receipt.comparison || typeof receipt.comparison !== 'object') {
    errors.push('comparison section is missing');
  } else {
    if (typeof receipt.comparison.bothReachedWebGpu !== 'boolean') {
      errors.push('comparison.bothReachedWebGpu must be a boolean');
    }
    if (!receipt.comparison.diagnosis) {
      errors.push('comparison.diagnosis is missing');
    }
  }

  if (typeof receipt.passed !== 'boolean') {
    errors.push('passed flag must be a boolean');
  }

  return errors;
}

export function buildParityUrl(baseUrl, { arenaId, graphicsProfile, rendererQuery = 'webgpu' }) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', rendererQuery);
  url.searchParams.set('map', arenaId);
  url.searchParams.set('render', graphicsProfile);
  url.searchParams.set('externalServices', 'off');
  url.searchParams.set('multiplayerQa', '1');
  return url.toString();
}

function resolveExecutable(candidates, explicitPath = null) {
  if (explicitPath && existsSync(explicitPath) && statSync(explicitPath).isFile()) {
    return resolve(explicitPath);
  }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return resolve(candidate);
    }
  }
  return null;
}

export function extractGeckodriverIfArchive(archivePath, targetDir) {
  if (!existsSync(archivePath)) return null;
  mkdirSync(targetDir, { recursive: true });
  const destinationExe = join(targetDir, 'geckodriver.exe');
  if (existsSync(destinationExe)) return destinationExe;

  try {
    execFileSync('tar', ['-xf', archivePath, '-C', targetDir], {
      windowsHide: true,
      stdio: 'pipe',
    });
    if (existsSync(destinationExe)) return destinationExe;
  } catch {}

  try {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Expand-Archive -Path '" + archivePath + "' -DestinationPath '" + targetDir + "' -Force",
    ], { windowsHide: true, stdio: 'pipe' });
    if (existsSync(destinationExe)) return destinationExe;
  } catch {}

  return null;
}

function isPortAvailable(port) {
  return new Promise((resolveAvailable) => {
    const probe = net.createServer();
    probe.once('error', () => resolveAvailable(false));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      probe.close(() => resolveAvailable(true));
    });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll(label, fn, predicate, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (predicate(last)) return last;
    } catch {}
    await delay(intervalMs);
  }
  throw new Error(label + ' timed out after ' + timeoutMs + 'ms; last sample: ' + JSON.stringify(last));
}

class GeckoDriverClient {
  constructor(executable, port) {
    this.executable = executable;
    this.port = port;
    this.endpoint = 'http://127.0.0.1:' + port;
    this.process = null;
    this.sessionId = null;
    this.output = '';
  }

  async start() {
    this.process = spawn(this.executable, ['--host', '127.0.0.1', '--port', String(this.port), '--log', 'warn'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const retain = (chunk) => { this.output = (this.output + String(chunk)).slice(-16384); };
    this.process.stdout.on('data', retain);
    this.process.stderr.on('data', retain);

    await poll('GeckoDriver readiness', async () => {
      if (this.process.exitCode !== null) throw new Error('GeckoDriver exited: ' + this.process.exitCode + '\n' + this.output);
      const res = await fetch(this.endpoint + '/status', { signal: AbortSignal.timeout(1000) }).catch(() => null);
      const json = await res?.json().catch(() => null);
      return json?.value;
    }, (val) => val?.ready === true, 15000, 100);
  }

  async createSession(firefoxExecutable, width, height) {
    const payload = {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          acceptInsecureCerts: false,
          pageLoadStrategy: 'normal',
          'moz:firefoxOptions': {
            binary: firefoxExecutable,
            args: [], // HEADED
            prefs: {
              'browser.shell.checkDefaultBrowser': false,
              'browser.startup.page': 0,
              'datareporting.policy.dataSubmissionEnabled': false,
              'toolkit.telemetry.reportingpolicy.firstRun': false,
              'webgl.disabled': false,
              'dom.webgpu.enabled': true,
              'gfx.webgpu.force-enabled': true,
              'layout.css.devPixelsPerPx': '1.0',
            },
          },
        },
      },
    };
    const res = await fetch(this.endpoint + '/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.value?.sessionId) {
      throw new Error('Failed to create Firefox session: ' + JSON.stringify(json));
    }
    this.sessionId = json.value.sessionId;

    await fetch(this.endpoint + '/session/' + this.sessionId + '/timeouts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ implicit: 0, pageLoad: 60000, script: 30000 }),
    }).catch(() => null);

    await fetch(this.endpoint + '/session/' + this.sessionId + '/window/rect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ width, height }),
    }).catch(() => null);

    return json.value;
  }

  async navigate(url) {
    const res = await fetch(this.endpoint + '/session/' + this.sessionId + '/url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error('Firefox navigation failed (' + res.status + ')');
  }

  async executeScript(script, args = []) {
    const res = await fetch(this.endpoint + '/session/' + this.sessionId + '/execute/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ script, args }),
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.value?.error) {
      throw new Error('Firefox execute script error: ' + JSON.stringify(json?.value ?? json));
    }
    return json?.value;
  }

  async close() {
    if (this.sessionId) {
      await fetch(this.endpoint + '/session/' + this.sessionId, {
        method: 'DELETE',
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      this.sessionId = null;
    }
    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGTERM');
      await delay(500);
      if (this.process.exitCode === null) this.process.kill('SIGKILL');
    }
  }
}

const IN_PAGE_PROBE_SCRIPT = `
(() => {
  const probe = {
    startedAt: performance.now(),
    lastAt: 0,
    intervals: [],
    longTasks: [],
    longTasksSupported: false,
    startingFrame: window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.frameCount ?? 0,
    active: true,
  };
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longTasks.push({
          startTime: Number(entry.startTime.toFixed(2)),
          duration: Number(entry.duration.toFixed(2)),
          name: entry.name,
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    probe.longTasksSupported = true;
    probe.observer = observer;
  } catch {
    probe.longTasksSupported = false;
  }
  window.__ATOMIC_ACRES_FRAME_PARITY_PROBE__ = probe;
  const tick = (now) => {
    if (!probe.active) return;
    if (probe.lastAt > 0) probe.intervals.push(now - probe.lastAt);
    probe.lastAt = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})();
`;

const IN_PAGE_COLLECT_SCRIPT = `
(() => {
  const probe = window.__ATOMIC_ACRES_FRAME_PARITY_PROBE__;
  if (!probe) return { error: 'Probe was not initialized' };
  probe.active = false;
  if (probe.observer) {
    try { probe.observer.disconnect(); } catch {}
  }

  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  const state = debugApi ? debugApi.snapshot() : null;
  const presentation = debugApi ? debugApi.samplePresentationTelemetry() : null;
  const runtime = state?.render?.runtime ?? null;
  const framePacing = state?.render?.framePacing ?? null;

  let recordedLongTasks = [...probe.longTasks];
  try {
    const entries = performance.getEntriesByType('longtask');
    if (entries && entries.length > recordedLongTasks.length) {
      recordedLongTasks = entries.map((e) => ({
        startTime: Number(e.startTime.toFixed(2)),
        duration: Number(e.duration.toFixed(2)),
        name: e.name,
      }));
    }
  } catch {}

  const intervals = probe.intervals.filter((v) => Number.isFinite(v) && v > 0);
  const longFrameCount = intervals.filter((v) => v >= 50).length;

  return {
    rawIntervals: intervals,
    elapsedMs: Number((performance.now() - probe.startedAt).toFixed(2)),
    sampleCount: intervals.length,
    frameDelta: (state?.frameCount ?? 0) - probe.startingFrame,
    actualBackend: runtime?.actualBackend ?? (state?.render ? 'webgl2' : 'unknown'),
    requestedBackend: runtime?.requestedBackend ?? 'webgpu',
    failClosed: runtime?.failClosed ?? null,
    adapterLabel: runtime?.adapterLabel ?? 'unknown',
    adapterClass: runtime?.adapterClass ?? 'unknown',
    deviceClass: runtime?.deviceClass ?? 'unknown',
    softwareAdapter: runtime?.softwareAdapter ?? null,
    deviceLost: runtime?.deviceLost ?? false,
    uncapturedErrors: runtime?.uncapturedErrors ?? 0,
    liveProfile: state?.render?.liveProfile ?? null,
    targetHz: framePacing?.targetHz ?? null,
    presentationStatus: presentation?.status ?? 'unknown',
    viewport: [window.innerWidth, window.innerHeight],
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    longTasks: {
      supported: probe.longTasksSupported,
      count: recordedLongTasks.length,
      entries: recordedLongTasks,
      longFrameCount,
    },
  };
})();
`;

export async function measureChromeParity({
  chromeExecutable,
  targetUrl,
  viewport,
  sampleWindowMs,
}) {
  const [width, height] = viewport;
  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: false, // HEADED
      args: ['--mute-audio', 
        '--enable-unsafe-webgpu',
        '--use-webgpu-adapter=default',
        '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
        '--disable-vulkan-fallback-to-gl',
        '--force-device-scale-factor=1',
        '--window-size=' + width + ',' + height,
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    });

    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true;
    }, undefined, { timeout: 60000 });

    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    });

    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true && state?.matchPhase === 'active' && (state?.frameCount ?? 0) > 5;
    }, undefined, { timeout: 45000 });

    await page.evaluate(IN_PAGE_PROBE_SCRIPT);
    await delay(sampleWindowMs);

    const rawData = await page.evaluate(IN_PAGE_COLLECT_SCRIPT);
    if (rawData.error) throw new Error('In-page probe error: ' + rawData.error);

    const frameTiming = computeFramePercentiles(rawData.rawIntervals);
    const frameCapAndVsync = detectFrameCapAndVsync(
      rawData.rawIntervals,
      frameTiming.p50Ms,
      frameTiming.p95Ms,
      rawData.targetHz,
    );

    const reachedWebGpu = rawData.actualBackend === 'webgpu' && rawData.failClosed === false;

    return {
      status: 'LAUNCHED',
      browserName: 'chrome',
      browserVersion: browser.version(),
      userAgent: rawData.userAgent,
      actualBackend: rawData.actualBackend,
      requestedBackend: rawData.requestedBackend,
      adapterLabel: rawData.adapterLabel,
      adapterClass: rawData.adapterClass,
      deviceClass: rawData.deviceClass,
      softwareAdapter: rawData.softwareAdapter,
      failClosed: rawData.failClosed,
      reachedWebGpu,
      deviceLost: rawData.deviceLost,
      uncapturedErrors: rawData.uncapturedErrors,
      liveProfile: rawData.liveProfile,
      viewport: rawData.viewport,
      devicePixelRatio: rawData.devicePixelRatio,
      frameTiming,
      longTasks: rawData.longTasks,
      frameCapAndVsync,
      presentationStatus: rawData.presentationStatus,
      error: null,
    };
  } catch (error) {
    return {
      status: 'FAILED_LAUNCH',
      browserName: 'chrome',
      browserVersion: 'unknown',
      userAgent: 'unknown',
      actualBackend: 'unknown',
      requestedBackend: 'webgpu',
      adapterLabel: 'unknown',
      adapterClass: 'unknown',
      deviceClass: 'unknown',
      softwareAdapter: null,
      failClosed: null,
      reachedWebGpu: false,
      deviceLost: false,
      uncapturedErrors: 0,
      liveProfile: null,
      viewport: null,
      devicePixelRatio: null,
      frameTiming: computeFramePercentiles([]),
      longTasks: { supported: false, count: 0, entries: [], longFrameCount: 0 },
      frameCapAndVsync: { vsyncOrCapDetected: false, inferredCeilingHz: null, reason: 'Chrome launch failed' },
      presentationStatus: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

export async function measureFirefoxParity({
  firefoxExecutable,
  geckodriverExecutable,
  driverPort,
  targetUrl,
  viewport,
  sampleWindowMs,
}) {
  const [width, height] = viewport;
  const client = new GeckoDriverClient(geckodriverExecutable, driverPort);
  try {
    await client.start();
    const session = await client.createSession(firefoxExecutable, width, height);
    const browserVersion = session?.capabilities?.browserVersion ?? 'unknown';

    await client.navigate(targetUrl);

    await poll('Firefox bootstrap ready', async () => {
      return client.executeScript([
        'const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();',
        'return state?.bootstrap?.stage === "ready" && state?.weaponReady === true;'
      ].join('\n'));
    }, (ready) => ready === true, 60000, 250);

    await client.executeScript([
      'window.__ATOMIC_ACRES_DEBUG__.startSolo();',
      'window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);'
    ].join('\n'));

    await poll('Firefox solo match start', async () => {
      return client.executeScript([
        'const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();',
        'return state?.gameStarted === true && state?.matchPhase === "active" && (state?.frameCount ?? 0) > 5;'
      ].join('\n'));
    }, (started) => started === true, 45000, 250);

    await client.executeScript(IN_PAGE_PROBE_SCRIPT);
    await delay(sampleWindowMs);

    const rawData = await client.executeScript(IN_PAGE_COLLECT_SCRIPT);
    if (rawData?.error) throw new Error('In-page probe error: ' + rawData.error);

    const frameTiming = computeFramePercentiles(rawData.rawIntervals);
    const frameCapAndVsync = detectFrameCapAndVsync(
      rawData.rawIntervals,
      frameTiming.p50Ms,
      frameTiming.p95Ms,
      rawData.targetHz,
    );

    const reachedWebGpu = rawData.actualBackend === 'webgpu' && rawData.failClosed === false;

    return {
      status: 'LAUNCHED',
      browserName: 'firefox',
      browserVersion,
      userAgent: rawData.userAgent,
      actualBackend: rawData.actualBackend,
      requestedBackend: rawData.requestedBackend,
      adapterLabel: rawData.adapterLabel,
      adapterClass: rawData.adapterClass,
      deviceClass: rawData.deviceClass,
      softwareAdapter: rawData.softwareAdapter,
      failClosed: rawData.failClosed,
      reachedWebGpu,
      deviceLost: rawData.deviceLost,
      uncapturedErrors: rawData.uncapturedErrors,
      liveProfile: rawData.liveProfile,
      viewport: rawData.viewport,
      devicePixelRatio: rawData.devicePixelRatio,
      frameTiming,
      longTasks: rawData.longTasks,
      frameCapAndVsync,
      presentationStatus: rawData.presentationStatus,
      error: null,
    };
  } catch (error) {
    return {
      status: 'FAILED_LAUNCH',
      browserName: 'firefox',
      browserVersion: 'unknown',
      userAgent: 'unknown',
      actualBackend: 'unknown',
      requestedBackend: 'webgpu',
      adapterLabel: 'unknown',
      adapterClass: 'unknown',
      deviceClass: 'unknown',
      softwareAdapter: null,
      failClosed: null,
      reachedWebGpu: false,
      deviceLost: false,
      uncapturedErrors: 0,
      liveProfile: null,
      viewport: null,
      devicePixelRatio: null,
      frameTiming: computeFramePercentiles([]),
      longTasks: { supported: false, count: 0, entries: [], longFrameCount: 0 },
      frameCapAndVsync: { vsyncOrCapDetected: false, inferredCeilingHz: null, reason: 'Firefox launch failed' },
      presentationStatus: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.close().catch(() => null);
  }
}

export async function runParityMeasurement(options = {}) {
  const root = resolve(process.cwd());
  const distDir = resolve(root, 'dist');
  const previewPort = Number(process.env.QA_PREVIEW_PORT ?? process.env.PARITY_PREVIEW_PORT ?? DEFAULT_PARITY_CONFIG.previewPort);
  const driverPort = Number(process.env.QA_GECKODRIVER_PORT ?? DEFAULT_PARITY_CONFIG.driverPort);
  const viewportWidth = Number(process.env.PARITY_VIEWPORT_WIDTH ?? DEFAULT_PARITY_CONFIG.viewport[0]);
  const viewportHeight = Number(process.env.PARITY_VIEWPORT_HEIGHT ?? DEFAULT_PARITY_CONFIG.viewport[1]);
  const viewport = [viewportWidth, viewportHeight];
  const arenaId = String(process.env.PARITY_ARENA_ID ?? DEFAULT_PARITY_CONFIG.arenaId);
  const graphicsProfile = String(process.env.PARITY_GRAPHICS_PROFILE ?? DEFAULT_PARITY_CONFIG.graphicsProfile);
  const sampleWindowMs = Number(process.env.PARITY_SAMPLE_WINDOW_MS ?? DEFAULT_PARITY_CONFIG.sampleWindowMs);
  const receiptDir = resolve(root, 'artifacts', 'qa');
  const receiptPath = resolve(receiptDir, 'browser-frame-parity-receipt.json');

  const chromeExecutable = resolveExecutable(
    DEFAULT_PARITY_CONFIG.chromeExecutableCandidates,
    process.env.QA_CHROME_EXECUTABLE,
  );
  const firefoxExecutable = resolveExecutable(
    DEFAULT_PARITY_CONFIG.firefoxExecutableCandidates,
    process.env.QA_FIREFOX_EXECUTABLE ?? process.env.PASS70_FIREFOX_EXECUTABLE_PATH,
  );

  const tempGeckoDir = mkdtempSync(join(tmpdir(), 'parity-geckodriver-'));
  const archivePath = process.env.PASS70_GECKODRIVER_ARCHIVE_PATH ?? DEFAULT_PARITY_CONFIG.geckodriverArchive;
  let geckodriverExecutable = resolveExecutable(
    ['geckodriver.exe'],
    process.env.QA_GECKODRIVER,
  );
  if (!geckodriverExecutable && existsSync(archivePath)) {
    geckodriverExecutable = extractGeckodriverIfArchive(archivePath, tempGeckoDir);
  }

  let viteServer = null;

  try {
    if (!options.skipBuild) {
      const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');
      execFileSync(process.execPath, [viteBin, 'build'], {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: 'inherit',
        windowsHide: true,
      });
    }

    if (!await isPortAvailable(previewPort)) {
      throw new Error('Preview port ' + previewPort + ' is already in use');
    }

    viteServer = await preview({
      build: { outDir: distDir },
      preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
    });

    const baseUrl = 'http://127.0.0.1:' + previewPort + '/';
    const targetUrl = buildParityUrl(baseUrl, {
      arenaId,
      graphicsProfile,
      rendererQuery: DEFAULT_PARITY_CONFIG.rendererQuery,
    });

    const environment = {
      os: process.platform,
      node: process.version,
      resolution: viewport,
      arena: arenaId,
      graphicsProfile,
      explicitRendererParam: DEFAULT_PARITY_CONFIG.rendererQuery,
      sampleWindowMs,
      targetUrl,
      chromeExecutable: chromeExecutable ?? 'NOT_FOUND',
      firefoxExecutable: firefoxExecutable ?? 'NOT_FOUND',
      geckodriverExecutable: geckodriverExecutable ?? 'NOT_FOUND',
    };

    let chromeResult;
    if (!chromeExecutable) {
      chromeResult = {
        status: 'FAILED_LAUNCH',
        browserName: 'chrome',
        browserVersion: 'unknown',
        userAgent: 'unknown',
        actualBackend: 'unknown',
        requestedBackend: 'webgpu',
        adapterLabel: 'unknown',
        adapterClass: 'unknown',
        deviceClass: 'unknown',
        softwareAdapter: null,
        failClosed: null,
        reachedWebGpu: false,
        deviceLost: false,
        uncapturedErrors: 0,
        liveProfile: null,
        viewport: null,
        devicePixelRatio: null,
        frameTiming: computeFramePercentiles([]),
        longTasks: { supported: false, count: 0, entries: [], longFrameCount: 0 },
        frameCapAndVsync: { vsyncOrCapDetected: false, inferredCeilingHz: null, reason: 'Chrome executable not found' },
        presentationStatus: 'failed',
        error: 'Chrome executable not found on host',
      };
    } else {
      chromeResult = await measureChromeParity({
        chromeExecutable,
        targetUrl,
        viewport,
        sampleWindowMs,
      });
    }

    let firefoxResult;
    if (!firefoxExecutable || !geckodriverExecutable) {
      firefoxResult = {
        status: 'FAILED_LAUNCH',
        browserName: 'firefox',
        browserVersion: 'unknown',
        userAgent: 'unknown',
        actualBackend: 'unknown',
        requestedBackend: 'webgpu',
        adapterLabel: 'unknown',
        adapterClass: 'unknown',
        deviceClass: 'unknown',
        softwareAdapter: null,
        failClosed: null,
        reachedWebGpu: false,
        deviceLost: false,
        uncapturedErrors: 0,
        liveProfile: null,
        viewport: null,
        devicePixelRatio: null,
        frameTiming: computeFramePercentiles([]),
        longTasks: { supported: false, count: 0, entries: [], longFrameCount: 0 },
        frameCapAndVsync: { vsyncOrCapDetected: false, inferredCeilingHz: null, reason: 'Firefox or GeckoDriver executable not found' },
        presentationStatus: 'failed',
        error: 'Firefox/GeckoDriver missing: firefox=' + (firefoxExecutable ?? 'none') + ', geckodriver=' + (geckodriverExecutable ?? 'none'),
      };
    } else {
      firefoxResult = await measureFirefoxParity({
        firefoxExecutable,
        geckodriverExecutable,
        driverPort,
        targetUrl,
        viewport,
        sampleWindowMs,
      });
    }

    const comparison = classifyParityRun(chromeResult, firefoxResult);
    const passed = comparison.bothReachedWebGpu;

    const receipt = {
      schemaVersion: FRAME_PARITY_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      environment,
      chrome: chromeResult,
      firefox: firefoxResult,
      comparison,
      passed,
    };

    mkdirSync(receiptDir, { recursive: true });
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

    return { receipt, passed };
  } finally {
    if (viteServer?.httpServer?.listening) {
      await new Promise((res) => {
        viteServer.httpServer.close(() => res());
        viteServer.httpServer.closeAllConnections?.();
      });
    }
    rmSync(tempGeckoDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && (
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  || process.argv[1].endsWith('measure-browser-frame-parity.mjs')
)) {
  runParityMeasurement()
    .then(({ receipt, passed }) => {
      process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
      if (!passed) {
        process.stderr.write('\n[FAIL] Browser WebGPU frame parity failed: ' + receipt.comparison.reason + '\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('\n[PASS] Browser WebGPU frame parity measured successfully: ' + receipt.comparison.reason + '\n');
        process.exitCode = 0;
      }
    })
    .catch((err) => {
      process.stderr.write('\n[ERROR] Parity probe fatal exception: ' + (err instanceof Error ? err.stack ?? err.message : String(err)) + '\n');
      process.exitCode = 1;
    });
}
