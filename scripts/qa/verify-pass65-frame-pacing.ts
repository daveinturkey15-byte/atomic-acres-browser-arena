import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, platform, release, totalmem } from 'node:os';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import {
  PASS65_FRAME_PACING_THRESHOLDS,
  compareAtomicAgainstTerminal,
  summarizeFramePacingWindow,
  validateFramePacingWindow,
  type FramePacingWindowSummary,
} from '../../src/pass65-frame-pacing-gate.ts';

const ARTIFACT_ROOT = 'artifacts/pass65/frame-pacing';
const VIEWPORT = Object.freeze({ width: 2_560, height: 1_440 });
const ARENA_IDS = Object.freeze(['atomic-acres', 'skyline-terminal'] as const);
type ArenaId = typeof ARENA_IDS[number];

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}; received ${raw ?? '<unset>'}`);
  }
  return value;
}

const port = boundedInteger('PASS65_FRAME_PACING_PORT', 44_077, 1_024, 65_535);
const windowMs = boundedInteger(
  'PASS65_FRAME_PACING_WINDOW_MS',
  10_000,
  PASS65_FRAME_PACING_THRESHOLDS.minimumWindowMs,
  120_000,
);
const warmupMs = boundedInteger('PASS65_FRAME_PACING_WARMUP_MS', 3_000, 2_000, 30_000);
const repeats = boundedInteger('PASS65_FRAME_PACING_REPEATS', 2, 1, 4);
const headed = process.env.PASS65_FRAME_PACING_HEADED === '1';
const gtaoValues = new Set(['off', 'low', 'high', 'ultra'] as const);
type GtaoQuality = 'off' | 'low' | 'high' | 'ultra';
const requestedGtao = (process.env.PASS65_FRAME_PACING_GTAO ?? 'off').toLowerCase();
if (!gtaoValues.has(requestedGtao as GtaoQuality)) {
  throw new Error(`PASS65_FRAME_PACING_GTAO must be off, low, high or ultra; received ${requestedGtao}`);
}
const gtaoQuality = requestedGtao as GtaoQuality;
const requestedGraphicsPreset = gtaoQuality === 'off' ? 'high' : 'custom';
// The explicit render=blender review override is intentionally surfaced as High while preserving Custom internals.
const expectedDisplayedGraphicsPreset = 'high';
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter((candidate): candidate is string => Boolean(candidate));
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 frame-pacing QA requires PASS65_CHROME_PATH or installed Google Chrome');
const chromeExecutablePath = executablePath;

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitStatus(): string {
  return git('status', '--porcelain', '--untracked-files=all');
}

const sourceSha = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
const cleanBefore = gitStatus().length === 0;
if (!cleanBefore) throw new Error('Pass 65 frame-pacing QA requires a completely clean worktree so its receipt identifies exact source');
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error(`Invalid source SHA: ${sourceSha}`);

type BrowserError = Readonly<{ kind: string; message: string }>;
type RequestFailure = Readonly<{ url: string; resourceType: string; failure: string | null }>;
type LongTask = Readonly<{
  startTime: number;
  duration: number;
  name: string;
  attribution: readonly Readonly<{ name: string; containerType: string; containerName: string; containerSrc: string }>[];
}>;

type RawFrameWindow = Readonly<{
  startedAt: number;
  endedAt: number;
  elapsedMs: number;
  intervalsMs: readonly number[];
  observerSupported: boolean;
  steadyLongTasks: readonly LongTask[];
  allLongTasks: readonly LongTask[];
  resources: readonly Readonly<{
    path: string;
    initiatorType: string;
    startTime: number;
    duration: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
  }>[];
}>;

type TrialReceipt = Readonly<{
  trialId: string;
  repeat: number;
  arenaId: ArenaId;
  status: 'passed' | 'failed';
  issues: readonly string[];
  browserErrors: readonly BrowserError[];
  browserWarnings: readonly string[];
  requestFailures: readonly RequestFailure[];
  preDeployment: unknown;
  deployment: unknown;
  frameWindow: RawFrameWindow | null;
  frameSummary: FramePacingWindowSummary | null;
  performanceBudget: unknown;
  finalState: unknown;
}>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function localCriticalRequestFailures(failures: readonly RequestFailure[]): readonly string[] {
  return failures
    .filter(({ url, resourceType }) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname === '127.0.0.1'
          && ['document', 'script', 'stylesheet', 'image', 'font', 'media'].includes(resourceType);
      } catch {
        return true;
      }
    })
    .map(({ resourceType, url, failure }) => {
      let path = url;
      try { path = new URL(url).pathname; } catch { /* Retain the malformed value as evidence. */ }
      return `local-request-failed:${resourceType}:${path}:${failure ?? 'unknown'}`;
    });
}

function finiteOrderedDistribution(
  value: Record<string, unknown>,
  prefix: 'cpuFrame' | 'presentationFrame' | 'queueSubmission',
): boolean {
  const fields = ['P50Ms', 'P95Ms', 'P99Ms', 'MaxMs'].map((suffix) => value[`${prefix}${suffix}`]);
  return fields.every((field) => typeof field === 'number' && Number.isFinite(field))
    && (fields[0] as number) <= (fields[1] as number)
    && (fields[1] as number) <= (fields[2] as number)
    && (fields[2] as number) <= (fields[3] as number);
}

function hardwareBudgetIssues(performanceBudget: unknown, finalState: unknown): readonly string[] {
  const issues: string[] = [];
  if (!performanceBudget || typeof performanceBudget !== 'object') return ['performance-budget-missing'];
  const budget = performanceBudget as Record<string, unknown>;
  for (const prefix of ['cpuFrame', 'presentationFrame', 'queueSubmission'] as const) {
    if (!finiteOrderedDistribution(budget, prefix)) issues.push(`${prefix}-distribution-invalid`);
  }
  const presentationP95 = Number(budget.presentationFrameP95Ms);
  const presentationP99 = Number(budget.presentationFrameP99Ms);
  const presentationMax = Number(budget.presentationFrameMaxMs);
  if (presentationP95 > PASS65_FRAME_PACING_THRESHOLDS.maximumP95Ms) issues.push(`budget-presentation-p95:${presentationP95}`);
  if (presentationP99 > PASS65_FRAME_PACING_THRESHOLDS.maximumP99Ms) issues.push(`budget-presentation-p99:${presentationP99}`);
  if (presentationMax > PASS65_FRAME_PACING_THRESHOLDS.maximumFrameMs) issues.push(`budget-presentation-max:${presentationMax}`);
  for (const field of ['cpuFrameMaxMs', 'queueSubmissionMaxMs']) {
    const value = Number(budget[field]);
    if (value > PASS65_FRAME_PACING_THRESHOLDS.maximumFrameMs) issues.push(`budget-${field}-over-100ms:${value}`);
  }
  const state = finalState && typeof finalState === 'object' ? finalState as Record<string, unknown> : {};
  const budgetAudit = state.budgetAudit && typeof state.budgetAudit === 'object'
    ? state.budgetAudit as Record<string, unknown>
    : null;
  if (!budgetAudit || budgetAudit.pass !== true) issues.push(`arena-visual-budget-failed:${JSON.stringify(budgetAudit?.violations ?? null)}`);
  return Object.freeze(issues);
}

function runtimeIssues(finalState: unknown): readonly string[] {
  if (!finalState || typeof finalState !== 'object') return ['final-runtime-state-missing'];
  const state = finalState as Record<string, unknown>;
  const runtime = state.runtime && typeof state.runtime === 'object' ? state.runtime as Record<string, unknown> : {};
  const presentation = runtime.presentation && typeof runtime.presentation === 'object'
    ? runtime.presentation as Record<string, unknown>
    : {};
  const streaming = state.streaming && typeof state.streaming === 'object' ? state.streaming as Record<string, unknown> : {};
  const watchdog = state.watchdog && typeof state.watchdog === 'object' ? state.watchdog as Record<string, unknown> : {};
  const issues: string[] = [];
  if (runtime.requestedBackend !== 'webgpu' || runtime.actualBackend !== 'webgpu' || runtime.initialized !== true) issues.push('native-webgpu-not-active');
  if (runtime.failClosed === true) issues.push('webgpu-fail-closed-triggered');
  if (runtime.softwareAdapter === true) issues.push('software-webgpu-adapter');
  if (runtime.deviceLost === true) issues.push('webgpu-device-lost');
  if (runtime.uncapturedErrors !== 0) issues.push(`webgpu-uncaptured-errors:${runtime.uncapturedErrors}`);
  if (presentation.status !== 'healthy') issues.push(`presentation-not-healthy:${String(presentation.status)}`);
  if (presentation.completionFailures !== 0) issues.push(`presentation-completion-failures:${presentation.completionFailures}`);
  if (streaming.transition && typeof streaming.transition === 'object') {
    const transition = streaming.transition as Record<string, unknown>;
    if (transition.phase !== 'idle' || transition.failure !== null || transition.renderSubmissionPaused !== false) {
      issues.push(`arena-transition-not-idle:${JSON.stringify(transition)}`);
    }
  } else issues.push('arena-streaming-transition-missing');
  if (watchdog.fatal === true) issues.push('arena-render-watchdog-fatal');
  return Object.freeze(issues);
}

async function installInstrumentation(context: BrowserContext): Promise<void> {
  await context.addInitScript((graphics: { preset: 'high' | 'custom'; ambientOcclusion: GtaoQuality }) => {
    try {
      localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify({
        version: 1,
        graphics: { schemaVersion: 1, preset: graphics.preset, ambientOcclusion: graphics.ambientOcclusion },
      }));
      localStorage.setItem('atomic-acres-render-profile', 'blender');
    } catch { /* The originless bootstrap document has no storage; the navigated localhost document does. */ }
    const target = globalThis as typeof globalThis & {
      __PASS65_FRAME_GATE__?: {
        observerSupported: boolean;
        longTasks: Array<{
          startTime: number;
          duration: number;
          name: string;
          attribution: Array<{ name: string; containerType: string; containerName: string; containerSrc: string }>;
        }>;
      };
    };
    const gate = { observerSupported: false, longTasks: [] as Array<{
      startTime: number;
      duration: number;
      name: string;
      attribution: Array<{ name: string; containerType: string; containerName: string; containerSrc: string }>;
    }> };
    target.__PASS65_FRAME_GATE__ = gate;
    try {
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceEntry & { attribution?: ArrayLike<{
            name?: string;
            containerType?: string;
            containerName?: string;
            containerSrc?: string;
          }> };
          gate.longTasks.push({
            startTime: Number(entry.startTime.toFixed(3)),
            duration: Number(entry.duration.toFixed(3)),
            name: entry.name,
            attribution: Array.from(timing.attribution ?? []).map((item) => ({
              name: item.name ?? '',
              containerType: item.containerType ?? '',
              containerName: item.containerName ?? '',
              containerSrc: item.containerSrc ? new URL(item.containerSrc, location.href).pathname : '',
            })),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      gate.observerSupported = true;
    } catch {
      gate.observerSupported = false;
    }
  }, { preset: requestedGraphicsPreset, ambientOcclusion: gtaoQuality });
}

async function waitForRafDuration(page: Page, durationMs: number): Promise<void> {
  await page.evaluate((duration) => new Promise<void>((resolve) => {
    let startedAt: number | null = null;
    const tick = (timestamp: number) => {
      if (startedAt === null) startedAt = timestamp;
      if (timestamp - startedAt >= duration) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), durationMs);
}

async function collectFrameWindow(page: Page, durationMs: number, deploymentStartedAt: number): Promise<RawFrameWindow> {
  return page.evaluate(async ({ duration, deploymentAt }) => {
    const target = globalThis as typeof globalThis & {
      __PASS65_FRAME_GATE__?: { observerSupported: boolean; longTasks: LongTask[] };
    };
    const gate = target.__PASS65_FRAME_GATE__ ?? { observerSupported: false, longTasks: [] };
    const intervalsMs: number[] = [];
    let startedAt = 0;
    let endedAt = 0;
    await new Promise<void>((resolve) => {
      let previous: number | null = null;
      const tick = (timestamp: number) => {
        if (previous === null) {
          startedAt = timestamp;
          previous = timestamp;
        } else {
          intervalsMs.push(Number((timestamp - previous).toFixed(3)));
          previous = timestamp;
        }
        if (timestamp - startedAt >= duration) {
          endedAt = timestamp;
          resolve();
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const overlaps = (task: LongTask) => task.startTime < endedAt && task.startTime + task.duration > startedAt;
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => entry.startTime >= deploymentAt)
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        const parsed = new URL(resource.name, location.href);
        return {
          path: parsed.pathname,
          initiatorType: resource.initiatorType,
          startTime: Number(resource.startTime.toFixed(3)),
          duration: Number(resource.duration.toFixed(3)),
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        };
      });
    return {
      startedAt: Number(startedAt.toFixed(3)),
      endedAt: Number(endedAt.toFixed(3)),
      elapsedMs: Number((endedAt - startedAt).toFixed(3)),
      intervalsMs,
      observerSupported: gate.observerSupported,
      steadyLongTasks: gate.longTasks.filter(overlaps),
      allLongTasks: [...gate.longTasks],
      resources,
    };
  }, { duration: durationMs, deploymentAt: deploymentStartedAt });
}

async function runTrial(browser: Browser, repeat: number, arenaId: ArenaId): Promise<TrialReceipt> {
  const trialId = `${arenaId}-r${repeat + 1}`;
  const issues: string[] = [];
  const browserErrors: BrowserError[] = [];
  const browserWarnings: string[] = [];
  const requestFailures: RequestFailure[] = [];
  let preDeployment: unknown = null;
  let deployment: unknown = null;
  let frameWindow: RawFrameWindow | null = null;
  let frameSummary: FramePacingWindowSummary | null = null;
  let performanceBudget: unknown = null;
  let finalState: unknown = null;
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await installInstrumentation(context);
  context.on('weberror', (webError) => browserErrors.push({ kind: 'weberror', message: webError.error().message }));
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push({ kind: 'pageerror', message: error.message }));
  page.on('crash', () => browserErrors.push({ kind: 'page-crash', message: 'renderer page crashed' }));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push({ kind: 'console-error', message: message.text() });
    else if (message.type() === 'warning') browserWarnings.push(message.text());
  });
  page.on('requestfailed', (request) => requestFailures.push({
    url: request.url(),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText ?? null,
  }));
  try {
    if (headed) await page.bringToFront();
    const seed = 6_505 + repeat;
    await page.goto(
      `http://127.0.0.1:${port}/?release=latest&renderer=webgpu&map=${arenaId}&render=blender&grass=on&mist=on&seed=${seed}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await page.waitForFunction(() => {
      const state = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => Record<string, any> } })
        .__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.weaponReady === true
        && state?.bootstrap?.stage === 'ready'
        && state?.render?.runtime?.actualBackend === 'webgpu';
    }, undefined, { timeout: 60_000 });
    preDeployment = await page.evaluate(() => {
      const api = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: { snapshot: () => Record<string, any> } }).__ATOMIC_ACRES_DEBUG__;
      const state = api.snapshot();
      return {
        atMs: performance.now(),
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, visibilityState: document.visibilityState, hasFocus: document.hasFocus() },
        gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
        menuArena: document.documentElement.dataset.menuArenaId ?? null,
        renderer: state.render.runtime,
        renderProfile: state.render.profile,
        graphicsPreset: state.settings.graphics,
        displayedGraphicsPreset: state.settings.displayedGraphicsPreset,
        streaming: state.arenaSelection.streaming,
        menuPreview: state.menuPreview,
      };
    });
    const before = preDeployment as Record<string, any>;
    if (before.viewport?.width !== VIEWPORT.width || before.viewport?.height !== VIEWPORT.height || before.viewport?.devicePixelRatio !== 1) {
      issues.push(`viewport-not-2560x1440-dpr1:${JSON.stringify(before.viewport)}`);
    }
    if (before.viewport?.visibilityState !== 'visible') issues.push(`page-not-visible:${String(before.viewport?.visibilityState)}`);
    if (before.gameplayArena !== 'deferred-until-deployment'
      || before.streaming?.constructionCount !== 0
      || before.streaming?.residentArenaRoots !== 0) {
      issues.push(`menu-eagerly-prepared-gameplay:${JSON.stringify({ gameplayArena: before.gameplayArena, streaming: before.streaming })}`);
    }
    if (before.renderProfile !== 'blender'
      || before.graphicsPreset?.requestedPreset !== requestedGraphicsPreset
      || before.graphicsPreset?.effectivePreset !== requestedGraphicsPreset
      || before.graphicsPreset?.ambientOcclusion?.quality !== gtaoQuality
      || before.displayedGraphicsPreset !== expectedDisplayedGraphicsPreset) {
      issues.push(`quality-profile-not-active:${JSON.stringify({ renderProfile: before.renderProfile, graphics: before.graphicsPreset, displayed: before.displayedGraphicsPreset })}`);
    }
    const deploymentStartedAt = await page.evaluate(() => {
      const api = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        startSolo: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      const now = performance.now();
      api.setBotsFrozen(true);
      api.startSolo();
      return now;
    });
    await page.waitForFunction((expectedArena) => {
      const state = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => Record<string, any> } })
        .__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true
        && state?.arenaSelection?.id === expectedArena
        && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
        && state?.arenaSelection?.streaming?.transition?.failure === null
        && state?.arenaSelection?.streaming?.residentArenaIds?.includes(expectedArena)
        && state?.render?.runtime?.presentation?.status === 'healthy'
        && document.documentElement.dataset.gameplayArena === expectedArena
        && document.querySelector('#menu')?.classList.contains('hidden');
    }, arenaId, { timeout: 60_000 });
    const activeDeployment = await page.evaluate(() => {
      const api = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: {
        snapshot: () => Record<string, any>;
        setBotsFrozen: (frozen: boolean) => void;
        setMovement: (forward: boolean, sprint?: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.setMovement(true, true);
      const state = api.snapshot();
      return {
        activeAtMs: performance.now(),
        arenaId: state.arenaSelection.id,
        gameStarted: state.gameStarted,
        botsFrozen: true,
        playerPosition: state.player.position,
        drawingBuffer: state.render.drawingBuffer,
        renderer: state.render.runtime,
        streaming: state.arenaSelection.streaming,
        qualityAssetStreaming: state.render.qualityAssetStreaming,
        compiledPipelineIds: state.render.playableScene.traversal?.compiledPipelineIds ?? [],
      };
    });
    deployment = { requestedAtMs: deploymentStartedAt, ...activeDeployment };
    await waitForRafDuration(page, warmupMs);
    frameWindow = await collectFrameWindow(page, windowMs, deploymentStartedAt);
    frameSummary = summarizeFramePacingWindow(frameWindow.intervalsMs, frameWindow.elapsedMs);
    issues.push(...validateFramePacingWindow(
      frameSummary,
      frameWindow.steadyLongTasks.length,
      frameWindow.observerSupported,
    ));
    try {
      performanceBudget = await page.evaluate(() => (
        globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: { sampleArenaPerformanceBudget: () => Promise<unknown> } }
      ).__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget());
    } catch (error) {
      browserErrors.push({ kind: 'performance-budget-error', message: error instanceof Error ? error.message : String(error) });
    }
    finalState = await page.evaluate(() => {
      const api = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: {
        snapshot: () => Record<string, any>;
        sampleRendererResidency: () => unknown;
        setMovement: (forward: boolean, sprint?: boolean) => void;
        setBotsFrozen: (frozen: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setMovement(false, false);
      api.setBotsFrozen(true);
      const state = api.snapshot();
      return {
        atMs: performance.now(),
        frameCount: state.frameCount,
        gameStarted: state.gameStarted,
        arenaId: state.arenaSelection.id,
        runtime: state.render.runtime,
        runtimeFramePacing: state.render.framePacing,
        drawingBuffer: state.render.drawingBuffer,
        adaptive: state.render.adaptive,
        watchdog: state.render.playableScene.renderWatchdog,
        budgetAudit: state.render.playableScene.budgetAudit,
        compiledPipelineIds: state.render.playableScene.traversal?.compiledPipelineIds ?? [],
        legacyShaderMaterials: state.render.playableScene.traversal?.legacyShaderMaterials ?? [],
        streaming: state.arenaSelection.streaming,
        qualityAssetStreaming: state.render.qualityAssetStreaming,
        residency: api.sampleRendererResidency(),
        menuPreview: state.menuPreview,
      };
    });
    issues.push(...runtimeIssues(finalState));
    issues.push(...hardwareBudgetIssues(performanceBudget, finalState));
  } catch (error) {
    issues.push(`trial-exception:${error instanceof Error ? error.message : String(error)}`);
  } finally {
    issues.push(...browserErrors.map(({ kind, message }) => `${kind}:${message}`));
    issues.push(...localCriticalRequestFailures(requestFailures));
    await context.close();
  }
  const finalIssues = unique(issues);
  return Object.freeze({
    trialId,
    repeat,
    arenaId,
    status: finalIssues.length === 0 ? 'passed' : 'failed',
    issues: Object.freeze(finalIssues),
    browserErrors: Object.freeze(browserErrors),
    browserWarnings: Object.freeze(unique(browserWarnings)),
    requestFailures: Object.freeze(requestFailures),
    preDeployment,
    deployment,
    frameWindow,
    frameSummary,
    performanceBudget,
    finalState,
  });
}

function aggregateArena(trials: readonly TrialReceipt[], arenaId: ArenaId): Readonly<{
  arenaId: ArenaId;
  trialCount: number;
  windowMs: number;
  intervalsMs: readonly number[];
  summary: FramePacingWindowSummary | null;
}> {
  const selected = trials.filter((trial) => trial.arenaId === arenaId && trial.frameWindow !== null);
  const intervalsMs = selected.flatMap((trial) => trial.frameWindow?.intervalsMs ?? []);
  const totalWindowMs = selected.reduce((sum, trial) => sum + (trial.frameWindow?.elapsedMs ?? 0), 0);
  return Object.freeze({
    arenaId,
    trialCount: selected.length,
    windowMs: Number(totalWindowMs.toFixed(3)),
    intervalsMs: Object.freeze(intervalsMs),
    summary: intervalsMs.length > 0 ? summarizeFramePacingWindow(intervalsMs, totalWindowMs) : null,
  });
}

function scrubGpuInfo(systemInfo: Record<string, any> | null): unknown {
  if (!systemInfo) return null;
  const gpu = systemInfo.gpu ?? {};
  return {
    devices: Array.isArray(gpu.devices) ? gpu.devices.map((device: Record<string, unknown>) => ({
      vendorId: device.vendorId ?? null,
      deviceId: device.deviceId ?? null,
      vendorString: device.vendorString ?? null,
      deviceString: device.deviceString ?? null,
      driverVendor: device.driverVendor ?? null,
      driverVersion: device.driverVersion ?? null,
    })) : [],
    featureStatus: gpu.featureStatus ?? null,
  };
}

async function main(): Promise<void> {
await mkdir(ARTIFACT_ROOT, { recursive: true });
let server: PreviewServer | null = null;
let browser: Browser | null = null;
let systemInfo: Record<string, any> | null = null;
const trials: TrialReceipt[] = [];
const runIssues: string[] = [];
let browserVersion: string | null = null;
const startedAt = new Date().toISOString();
try {
  server = await preview({
    preview: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'error',
  });
  browser = await chromium.launch({
    headless: !headed,
    executablePath: chromeExecutablePath,
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--force-device-scale-factor=1',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
  });
  browserVersion = browser.version();
  try {
    const cdp = await browser.newBrowserCDPSession();
    systemInfo = await cdp.send('SystemInfo.getInfo') as Record<string, any>;
    await cdp.detach();
  } catch (error) {
    runIssues.push(`system-info-unavailable:${error instanceof Error ? error.message : String(error)}`);
  }
  const sequence: Array<Readonly<{ repeat: number; arenaId: ArenaId }>> = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const order = repeat % 2 === 0 ? ARENA_IDS : [...ARENA_IDS].reverse();
    for (const arenaId of order) sequence.push({ repeat, arenaId });
  }
  for (const { repeat, arenaId } of sequence) {
    console.log(`[pass65-frame-pacing] trial=${arenaId}-r${repeat + 1} window=${windowMs}ms preset=${requestedGraphicsPreset} gtao=${gtaoQuality} viewport=2560x1440`);
    trials.push(await runTrial(browser, repeat, arenaId));
  }
} catch (error) {
  runIssues.push(`run-exception:${error instanceof Error ? error.stack ?? error.message : String(error)}`);
} finally {
  await browser?.close().catch(() => undefined);
  if (server) {
    await new Promise<void>((resolve) => server?.httpServer.close(() => resolve()));
  }
}

for (const trial of trials) runIssues.push(...trial.issues.map((issue) => `${trial.trialId}:${issue}`));
if (trials.length !== repeats * ARENA_IDS.length) runIssues.push(`incomplete-trial-count:${trials.length}/${repeats * ARENA_IDS.length}`);
const atomic = aggregateArena(trials, 'atomic-acres');
const terminal = aggregateArena(trials, 'skyline-terminal');
const comparisons: Array<Readonly<{ scope: string; issues: readonly string[] }>> = [];
if (atomic.summary && terminal.summary) {
  comparisons.push({ scope: 'aggregate', issues: compareAtomicAgainstTerminal(atomic.summary, terminal.summary) });
} else runIssues.push('aggregate-comparison-unavailable');
for (let repeat = 0; repeat < repeats; repeat += 1) {
  const atomicTrial = trials.find((trial) => trial.repeat === repeat && trial.arenaId === 'atomic-acres')?.frameSummary;
  const terminalTrial = trials.find((trial) => trial.repeat === repeat && trial.arenaId === 'skyline-terminal')?.frameSummary;
  if (!atomicTrial || !terminalTrial) {
    runIssues.push(`repeat-comparison-unavailable:r${repeat + 1}`);
    continue;
  }
  comparisons.push({ scope: `repeat-${repeat + 1}`, issues: compareAtomicAgainstTerminal(atomicTrial, terminalTrial) });
}
for (const comparison of comparisons) {
  runIssues.push(...comparison.issues.map((issue) => `${comparison.scope}:${issue}`));
}

const cleanAfter = gitStatus().length === 0;
if (!cleanAfter) runIssues.push('worktree-became-dirty-during-hardware-run');
const finalIssues = unique(runIssues);
const completedAt = new Date().toISOString();
const receipt = {
  schemaVersion: 1,
  gate: 'pass65-native-webgpu-atomic-vs-terminal-frame-pacing',
  status: finalIssues.length === 0 ? 'passed' : 'failed',
  startedAt,
  completedAt,
  source: {
    sha: sourceSha,
    branch,
    cleanBefore,
    cleanAfter,
    productionBuild: true,
    previewServer: 'vite-preview',
  },
  environment: {
    platform: platform(),
    release: release(),
    arch: arch(),
    totalMemoryGiB: Number((totalmem() / 1024 ** 3).toFixed(2)),
    browser: browserVersion,
    executable: chromeExecutablePath.replaceAll('\\', '/'),
    mode: headed ? 'headed-foreground' : 'headless-native-compositor',
    gpu: scrubGpuInfo(systemInfo),
  },
  configuration: {
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    graphicsPreset: requestedGraphicsPreset === 'high' ? 'Quality/high' : 'Custom',
    gtaoQuality,
    renderProfile: 'blender',
    backend: 'webgpu-required',
    bots: 'frozen-after-explicit-solo-deployment',
    movement: 'forward-sprint-during-warmup-and-sample',
    warmupMs,
    windowMs,
    repeats,
    order: 'alternating fresh browser contexts',
    thresholds: PASS65_FRAME_PACING_THRESHOLDS,
    percentileMethod: 'sorted floor((n - 1) * q); all intervals retained; strict greater-than long-frame counts',
  },
  trials,
  aggregates: { atomic, terminal },
  comparisons,
  issues: finalIssues,
  claimStates: {
    observed: 'Installed Chrome trial telemetry, exact rAF intervals, PerformanceObserver tasks, runtime/adapter/GPU state and renderer residency in this receipt.',
    inference: 'A passing receipt is strong same-machine evidence that steady native-WebGPU Quality presentation is bounded for these two deterministic solo traces.',
    assumption: 'Fresh automated contexts with deterministic forward movement approximate the owner steady gameplay workload; they do not reproduce every combat/support/input sequence.',
    unknown: headed ? 'Owner-specific free-look/combat/support feel remains HITL.' : 'Final exact-S0 foreground/headed and owner free-look/combat/support feel remain separate evidence.',
    falsifiers: 'Any source/worktree mismatch, software/fallback backend, browser/GPU error, long task, >100ms frame, absolute tail breach or material Atomic-vs-Terminal delta fails this receipt.',
  },
};
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
const digest = createHash('sha256').update(serialized).digest('hex');
const receiptPath = `${ARTIFACT_ROOT}/${sourceSha}-receipt.json`;
await writeFile(receiptPath, serialized, 'utf8');
await writeFile(`${receiptPath}.sha256`, `${digest}  ${sourceSha}-receipt.json\n`, 'utf8');

console.log(JSON.stringify({
  status: receipt.status,
  sourceSha,
  receiptPath,
  receiptSha256: digest,
  atomic: atomic.summary,
  terminal: terminal.summary,
  comparisons,
  issues: finalIssues,
}, null, 2));
if (finalIssues.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
