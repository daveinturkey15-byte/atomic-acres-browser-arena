import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { arch, platform, release, tmpdir, totalmem } from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import {
  PASS65_FRAME_PACING_THRESHOLDS,
  compareAtomicAgainstTerminal,
  summarizeFramePacingWindow,
  validateFramePacingWindow,
  type FramePacingWindowSummary,
} from '../../src/pass65-frame-pacing-gate.ts';
import {
  PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS,
  PASS65_HARDWARE_WEBGL2_FEEDBACK_IDS,
  validateAdmissionReadPixels,
  validateHardwareWebGl2AdmissionTiming,
  validateHardwareWebGl2Runtime,
  validatePostReadyFiftyMillisecondFrames,
  type WebGlReadPixelsEvent,
} from '../../src/pass65-hardware-webgl2-admission-gate.ts';
import {
  validateHardwareWebGl2BuildManifest,
  validateHardwareWebGl2DetailedReceipt,
} from './pass65-hardware-webgl2-receipt-contract.mjs';
import { OFFSCREEN_ARGS } from './lib/browser-launch-flags.mjs';

const ARTIFACT_ROOT = 'artifacts/pass65/hardware-webgl2-admission';
const OWNER_ARTIFACT_ROOT = 'artifacts/pass65-owner-feedback';
const VIEWPORT = Object.freeze({ width: 2_560, height: 1_440 });
const ARENA_SEQUENCE = Object.freeze([
  'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range',
] as const);
type ArenaId = typeof ARENA_SEQUENCE[number];

const portRaw = Number(process.env.PASS65_HARDWARE_WEBGL2_PORT ?? 44_078);
if (!Number.isSafeInteger(portRaw) || portRaw < 1_024 || portRaw > 65_535) {
  throw new Error(`PASS65_HARDWARE_WEBGL2_PORT must be an integer from 1024 to 65535; received ${String(process.env.PASS65_HARDWARE_WEBGL2_PORT)}`);
}
const port = portRaw;
const headed = process.env.PASS65_HARDWARE_WEBGL2_HEADED === '1';
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter((candidate): candidate is string => Boolean(candidate));
function requireInstalledChrome(candidates: readonly string[]): string {
  const candidate = candidates.find((entry) => existsSync(entry));
  if (!candidate) throw new Error('Pass 65 hardware-WebGL2 QA requires PASS65_CHROME_PATH or installed Google Chrome');
  return candidate;
}
const executablePath = requireInstalledChrome(chromeCandidates);

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitStatus(): string {
  return git('status', '--porcelain', '--untracked-files=all');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function withNodeDeadline<T>(label: string, timeoutMs: number, operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded independent Node deadline ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type BuildManifest = Readonly<{
  schemaVersion: 1;
  sourceSha: string;
  files: readonly Readonly<{ path: string; bytes: number; sha256: string }>[];
}>;

async function collectBuildFiles(directory: string, relative = ''): Promise<Array<{ path: string; bytes: number; sha256: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectBuildFiles(childAbsolute, childRelative));
    else if (entry.isFile()) {
      const bytes = await readFile(childAbsolute);
      files.push({ path: childRelative.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return files;
}

async function createBuildManifest(): Promise<{ manifest: BuildManifest; serialized: string; digest: string }> {
  if (!existsSync('dist')) throw new Error('Pass 65 hardware-WebGL2 QA requires a production dist/ build');
  const manifest = Object.freeze({ schemaVersion: 1 as const, sourceSha, files: Object.freeze(await collectBuildFiles('dist')) });
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  return { manifest, serialized, digest: sha256(serialized) };
}

async function removeTemporaryProfile(profilePath: string): Promise<void> {
  const resolvedProfile = path.resolve(profilePath);
  const resolvedTemp = path.resolve(tmpdir());
  const relation = path.relative(resolvedTemp, resolvedProfile);
  if (relation.startsWith('..') || path.isAbsolute(relation) || !path.basename(resolvedProfile).startsWith('pass65-webgl2-')) {
    throw new Error(`Refusing to remove unexpected Chrome profile path ${resolvedProfile}`);
  }
  await rm(resolvedProfile, { recursive: true, force: true });
}

const sourceSha = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
const cleanBefore = gitStatus().length === 0;
if (!cleanBefore) throw new Error('Pass 65 hardware-WebGL2 QA requires a completely clean worktree');
if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error(`Invalid source SHA: ${sourceSha}`);

type LongTask = Readonly<{ startTime: number; duration: number; name: string }>;
type Instrumentation = Readonly<{
  observerSupported: boolean;
  longTasks: readonly LongTask[];
  readPixels: readonly WebGlReadPixelsEvent[];
  deploymentStartedAt: number | null;
  transitionReadyAt: number | null;
  firstGameplayPresentedAt: number | null;
  activeAt: number | null;
  physicalSoloStarts: readonly Readonly<{ at: number; isTrusted: boolean }>[];
  readPixelsTripwireInstalled: boolean;
  expectedAdmissionGeneration: number | null;
  observedAdmissionGeneration: number | null;
  presentedGameplayFrameAtReady: number | null;
  postReadyCaptureStartedAt: number | null;
  postReadyCaptureStoppedAt: number | null;
  postReadyIntervalsMs: readonly number[];
}>;
type BrowserFault = Readonly<{ phase: string; kind: string; message: string }>;
type RequestFailure = Readonly<{ url: string; resourceType: string; failure: string | null }>;
type FrameWindow = Readonly<{
  startedAt: number;
  endedAt: number;
  elapsedMs: number;
  intervalsMs: readonly number[];
  longTasks: readonly LongTask[];
  readPixels: readonly WebGlReadPixelsEvent[];
  observerSupported: boolean;
}>;
type GameplayProgressPoint = Readonly<{
  frameCount: number;
  presentedGameplayFrame: number;
}>;
type GameplayProgress = Readonly<{
  minimumExpectedProgressFrames: number;
  before: GameplayProgressPoint;
  after: GameplayProgressPoint;
  delta: GameplayProgressPoint;
}>;
type FrameWindowCollection = Readonly<{
  frameWindow: FrameWindow;
  postReadyFrameWindow: FrameWindow;
  progress: GameplayProgress;
}>;
type ArenaReceipt = Readonly<{
  arenaId: ArenaId;
  menuAudit: unknown;
  loadingAudit: unknown;
  admission: Readonly<{
    timing: unknown;
    longTasks: readonly LongTask[];
    readPixels: readonly WebGlReadPixelsEvent[];
    physicalSoloStarts: readonly Readonly<{ at: number; isTrusted: boolean }>[];
    readPixelsTripwireInstalled: boolean;
    expectedAdmissionGeneration: number | null;
    observedAdmissionGeneration: number | null;
    presentedGameplayFrameAtReady: number | null;
    postReadyFrameWindow: FrameWindow;
  }>;
  steady: Readonly<{
    requestedWindowMs: number;
    frameWindow: FrameWindow;
    summary: FramePacingWindowSummary;
    progress: GameplayProgress;
  }>;
  activeAudit: unknown;
  finalAudit: unknown;
  issues: readonly string[];
}>;
type TrialReceipt = Readonly<{
  trial: number;
  browserVersion: string;
  profile: Readonly<{
    id: string; tempRelativeBasename: string; absolutePathSha256: string;
    initiallyEmpty: boolean; removedAfterRun: boolean;
  }>;
  browserProcessIds: readonly number[];
  systemInfo: unknown;
  arenas: readonly ArenaReceipt[];
  faults: readonly BrowserFault[];
  readbackWarnings: readonly BrowserFault[];
  requestFailures: readonly RequestFailure[];
  atomicAgainstTerminalIssues: readonly string[];
  issues: readonly string[];
}>;

async function installInstrumentation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify({
        version: 1,
        graphics: { schemaVersion: 1, preset: 'performance' },
      }));
      localStorage.setItem('atomic-acres-render-profile', 'performance');
    } catch { /* The originless bootstrap document cannot access storage. */ }

    type Gate = {
      observerSupported: boolean;
      longTasks: LongTask[];
      readPixels: WebGlReadPixelsEvent[];
      deploymentStartedAt: number | null;
      transitionReadyAt: number | null;
      firstGameplayPresentedAt: number | null;
      activeAt: number | null;
      physicalSoloStarts: Array<{ at: number; isTrusted: boolean }>;
      readPixelsTripwireInstalled: boolean;
      armedBaselineGeneration: number | null;
      expectedAdmissionGeneration: number | null;
      observedAdmissionGeneration: number | null;
      presentedGameplayFrameAtReady: number | null;
      postReadyCaptureStartedAt: number | null;
      postReadyCaptureStoppedAt: number | null;
      postReadyPreviousRafAt: number | null;
      postReadyIntervalsMs: number[];
    };
    const target = globalThis as typeof globalThis & {
      __PASS65_HARDWARE_WEBGL2_GATE__?: Gate;
      __PASS65_HARDWARE_WEBGL2_START_WATCH__?: () => void;
      __PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF__?: (timestamp: number) => void;
    };
    const gate: Gate = {
      observerSupported: false,
      longTasks: [],
      readPixels: [],
      deploymentStartedAt: null,
      transitionReadyAt: null,
      firstGameplayPresentedAt: null,
      activeAt: null,
      physicalSoloStarts: [],
      readPixelsTripwireInstalled: false,
      armedBaselineGeneration: null,
      expectedAdmissionGeneration: null,
      observedAdmissionGeneration: null,
      presentedGameplayFrameAtReady: null,
      postReadyCaptureStartedAt: null,
      postReadyCaptureStoppedAt: null,
      postReadyPreviousRafAt: null,
      postReadyIntervalsMs: [],
    };
    target.__PASS65_HARDWARE_WEBGL2_GATE__ = gate;

    try {
      const prototype = WebGL2RenderingContext.prototype;
      const originalReadPixels = prototype.readPixels;
      Object.defineProperty(prototype, 'readPixels', {
        configurable: true,
        writable: true,
        value(this: WebGL2RenderingContext, ...args: unknown[]) {
          gate.readPixels.push({
            at: Number(performance.now().toFixed(3)),
            width: Number(args[2]),
            height: Number(args[3]),
            stack: new Error('WebGL2 readPixels tripwire').stack ?? 'stack-unavailable',
          });
          return Reflect.apply(originalReadPixels, this, args);
        },
      });
      gate.readPixelsTripwireInstalled = prototype.readPixels !== originalReadPixels;
    } catch { /* A failed tripwire is exposed by the missing probe ledger. */ }

    try {
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            gate.longTasks.push({
              startTime: Number(entry.startTime.toFixed(3)),
              duration: Number(entry.duration.toFixed(3)),
              name: entry.name,
            });
          }
        });
        observer.observe({ type: 'longtask', buffered: true });
        gate.observerSupported = true;
      }
    } catch { gate.observerSupported = false; }

    target.__PASS65_HARDWARE_WEBGL2_START_WATCH__ = () => {
      const api = (globalThis as typeof globalThis & {
        __ATOMIC_ACRES_DEBUG__?: { admissionState: () => { matchAdmissionGeneration: number } };
      }).__ATOMIC_ACRES_DEBUG__;
      gate.armedBaselineGeneration = api?.admissionState().matchAdmissionGeneration ?? null;
      gate.deploymentStartedAt = null;
      gate.transitionReadyAt = null;
      gate.firstGameplayPresentedAt = null;
      gate.activeAt = null;
      gate.expectedAdmissionGeneration = null;
      gate.observedAdmissionGeneration = null;
      gate.presentedGameplayFrameAtReady = null;
      gate.postReadyCaptureStartedAt = null;
      gate.postReadyCaptureStoppedAt = null;
      gate.postReadyPreviousRafAt = null;
      gate.postReadyIntervalsMs.length = 0;
    };
    const recordPostReadyFrame = (timestamp: number) => {
      if (!Number.isFinite(gate.transitionReadyAt) || gate.postReadyCaptureStoppedAt !== null) return;
      if (gate.postReadyCaptureStartedAt === null) {
        gate.postReadyCaptureStartedAt = Number(gate.transitionReadyAt);
        gate.postReadyPreviousRafAt = Number(gate.transitionReadyAt);
      }
      const roundedTimestamp = Number(timestamp.toFixed(3));
      if (gate.postReadyPreviousRafAt !== null && roundedTimestamp > gate.postReadyPreviousRafAt) {
        gate.postReadyIntervalsMs.push(Number((roundedTimestamp - gate.postReadyPreviousRafAt).toFixed(3)));
        gate.postReadyPreviousRafAt = roundedTimestamp;
      }
    };
    target.__PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF__ = (timestamp) => {
      if (gate.postReadyCaptureStoppedAt !== null) return;
      recordPostReadyFrame(timestamp);
      gate.postReadyCaptureStoppedAt = Number(timestamp.toFixed(3));
    };
    const beginTrustedAdmissionWatch = () => {
      if (gate.armedBaselineGeneration === null || gate.deploymentStartedAt !== null) return;
      gate.deploymentStartedAt = performance.now();
      gate.expectedAdmissionGeneration = gate.armedBaselineGeneration + 1;
      const watchAdmission = (timestamp: number) => {
        const api = (globalThis as typeof globalThis & {
          __ATOMIC_ACRES_DEBUG__?: { admissionState: () => {
            gameStarted: boolean; matchPhase: string; arenaTransitionPhase: string;
            presentedGameplayFrame: number; matchAdmissionGeneration: number;
          } };
        }).__ATOMIC_ACRES_DEBUG__;
        if (api) {
          const state = api.admissionState();
          gate.observedAdmissionGeneration = state.matchAdmissionGeneration;
          if (state.matchAdmissionGeneration > (gate.expectedAdmissionGeneration ?? Number.POSITIVE_INFINITY)) {
            gate.transitionReadyAt = Number.NaN;
            gate.firstGameplayPresentedAt = Number.NaN;
            gate.activeAt = Number.NaN;
            return;
          }
          const expectedGenerationActive = state.matchAdmissionGeneration === gate.expectedAdmissionGeneration;
          if (expectedGenerationActive && state.gameStarted && gate.transitionReadyAt === null) {
            const transition = document.querySelector<HTMLElement>('#deployment-transition');
            const readyGeneration = Number(transition?.dataset.readyGeneration);
            const readyAt = Number(transition?.dataset.readyAt);
            const readyPresentedGameplayFrame = Number(transition?.dataset.readyPresentedGameplayFrame);
            if (readyGeneration === gate.expectedAdmissionGeneration && Number.isFinite(readyAt)
              && Number.isSafeInteger(readyPresentedGameplayFrame) && readyPresentedGameplayFrame >= 0) {
              gate.transitionReadyAt = readyAt;
              gate.presentedGameplayFrameAtReady = readyPresentedGameplayFrame;
            }
          }
          if (expectedGenerationActive && state.gameStarted && gate.transitionReadyAt !== null
            && gate.presentedGameplayFrameAtReady !== null
            && state.presentedGameplayFrame > gate.presentedGameplayFrameAtReady
            && gate.firstGameplayPresentedAt === null) {
            gate.firstGameplayPresentedAt = performance.now();
          }
          if (expectedGenerationActive && state.gameStarted && state.matchPhase === 'active'
            && state.arenaTransitionPhase === 'idle' && gate.activeAt === null) {
            gate.activeAt = performance.now();
          }
        }
        recordPostReadyFrame(timestamp);
        const admissionTimingComplete = gate.transitionReadyAt !== null
          && gate.firstGameplayPresentedAt !== null
          && gate.activeAt !== null;
        if (!admissionTimingComplete || gate.postReadyCaptureStoppedAt === null) requestAnimationFrame(watchAdmission);
      };
      requestAnimationFrame(watchAdmission);
    };
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('#solo') : null;
      if (target) {
        gate.physicalSoloStarts.push({ at: performance.now(), isTrusted: event.isTrusted });
        if (event.isTrusted) beginTrustedAdmissionWatch();
      }
    }, { capture: true });
  });
}

async function instrumentation(page: Page): Promise<Instrumentation> {
  return page.evaluate(() => {
    const gate = (globalThis as typeof globalThis & { __PASS65_HARDWARE_WEBGL2_GATE__: Instrumentation })
      .__PASS65_HARDWARE_WEBGL2_GATE__;
    return {
      observerSupported: gate.observerSupported,
      longTasks: [...gate.longTasks],
      readPixels: [...gate.readPixels],
      deploymentStartedAt: gate.deploymentStartedAt,
      transitionReadyAt: gate.transitionReadyAt,
      firstGameplayPresentedAt: gate.firstGameplayPresentedAt,
      activeAt: gate.activeAt,
      physicalSoloStarts: [...gate.physicalSoloStarts],
      readPixelsTripwireInstalled: gate.readPixelsTripwireInstalled,
      expectedAdmissionGeneration: gate.expectedAdmissionGeneration,
      observedAdmissionGeneration: gate.observedAdmissionGeneration,
      presentedGameplayFrameAtReady: gate.presentedGameplayFrameAtReady,
      postReadyCaptureStartedAt: gate.postReadyCaptureStartedAt,
      postReadyCaptureStoppedAt: gate.postReadyCaptureStoppedAt,
      postReadyIntervalsMs: [...gate.postReadyIntervalsMs],
    };
  });
}

async function collectFrameWindow(page: Page, durationMs: number): Promise<FrameWindowCollection> {
  return page.evaluate(async ({ duration, minimumCadenceHz }) => {
    const target = globalThis as typeof globalThis & {
      __PASS65_HARDWARE_WEBGL2_GATE__: Instrumentation;
      __PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF__: (timestamp: number) => void;
      __ATOMIC_ACRES_DEBUG__: {
        snapshot: () => Record<string, any>;
        admissionState: () => { presentedGameplayFrame: number };
      };
    };
    const gate = target.__PASS65_HARDWARE_WEBGL2_GATE__;
    const sampleGameplayProgress = (): GameplayProgressPoint => {
      const state = target.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        frameCount: Number(state.frameCount),
        presentedGameplayFrame: Number(target.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame),
      };
    };
    const intervalsMs: number[] = [];
    let startedAt = 0;
    let endedAt = 0;
    let progressBefore: GameplayProgressPoint | null = null;
    let progressAfter: GameplayProgressPoint | null = null;
    await new Promise<void>((resolve) => {
      let previous: number | null = null;
      const tick = (timestamp: number) => {
        if (previous === null) {
          startedAt = timestamp;
          previous = timestamp;
          target.__PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF__(timestamp);
          progressBefore = sampleGameplayProgress();
        } else {
          intervalsMs.push(Number((timestamp - previous).toFixed(3)));
          previous = timestamp;
        }
        if (timestamp - startedAt >= duration) {
          endedAt = timestamp;
          progressAfter = sampleGameplayProgress();
          resolve();
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const overlaps = (entry: { startTime: number; duration: number }) => (
      entry.startTime < endedAt && entry.startTime + entry.duration > startedAt
    );
    const frameWindow = {
      startedAt: Number(startedAt.toFixed(3)),
      endedAt: Number(endedAt.toFixed(3)),
      elapsedMs: Number((endedAt - startedAt).toFixed(3)),
      intervalsMs,
      longTasks: gate.longTasks.filter(overlaps),
      readPixels: gate.readPixels.filter((entry) => entry.at >= startedAt && entry.at <= endedAt),
      observerSupported: gate.observerSupported,
    };
    const postReadyStartedAt = Number(gate.postReadyCaptureStartedAt);
    const postReadyEndedAt = Number(gate.postReadyCaptureStoppedAt);
    const overlapsPostReady = (entry: { startTime: number; duration: number }) => (
      entry.startTime < postReadyEndedAt && entry.startTime + entry.duration > postReadyStartedAt
    );
    const postReadyFrameWindow = {
      startedAt: postReadyStartedAt,
      endedAt: postReadyEndedAt,
      elapsedMs: Number((postReadyEndedAt - postReadyStartedAt).toFixed(3)),
      intervalsMs: [...gate.postReadyIntervalsMs],
      longTasks: gate.longTasks.filter(overlapsPostReady),
      readPixels: gate.readPixels.filter((entry) => entry.at >= postReadyStartedAt && entry.at <= postReadyEndedAt),
      observerSupported: gate.observerSupported,
    };
    const before = progressBefore ?? { frameCount: Number.NaN, presentedGameplayFrame: Number.NaN };
    const after = progressAfter ?? { frameCount: Number.NaN, presentedGameplayFrame: Number.NaN };
    return {
      frameWindow,
      postReadyFrameWindow,
      progress: {
        minimumExpectedProgressFrames: Math.floor(frameWindow.elapsedMs * minimumCadenceHz / 1_000),
        before,
        after,
        delta: {
          frameCount: after.frameCount - before.frameCount,
          presentedGameplayFrame: after.presentedGameplayFrame - before.presentedGameplayFrame,
        },
      },
    };
  }, { duration: durationMs, minimumCadenceHz: PASS65_FRAME_PACING_THRESHOLDS.minimumCadenceHz });
}

function localRequestIssues(failures: readonly RequestFailure[]): readonly string[] {
  return failures.flatMap(({ url, resourceType, failure }) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== '127.0.0.1'
        || !['document', 'script', 'stylesheet', 'image', 'font', 'media'].includes(resourceType)) return [];
      return [`local-request-failed:${resourceType}:${parsed.pathname}:${failure ?? 'unknown'}`];
    } catch { return [`malformed-failed-request:${url}`]; }
  });
}

function driverGpuProof(systemInfo: Record<string, any> | null): readonly string[] {
  const devices = Array.isArray(systemInfo?.gpu?.devices) ? systemInfo.gpu.devices as Array<Record<string, unknown>> : [];
  const labels = devices.map((device) => `${String(device.vendorString ?? '')} ${String(device.deviceString ?? '')} ${String(device.driverVendor ?? '')}`);
  if (labels.length === 0) return ['cdp-gpu-device-proof-missing'];
  if (!labels.some((label) => /nvidia|amd|intel/i.test(label) && !/swiftshader|software|microsoft basic/i.test(label))) {
    return [`cdp-hardware-gpu-proof-missing:${labels.join(' | ')}`];
  }
  return [];
}

async function menuAudit(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: { snapshot: () => Record<string, any> } })
      .__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
      menuLifecycle: document.documentElement.dataset.menuLifecycle ?? null,
      arenaId: state.arenaSelection.id,
      streaming: state.arenaSelection.streaming,
      menuPreview: state.menuPreview,
      runtime: state.render.runtime,
    };
  });
}

async function selectArenaPhysically(page: Page, arenaId: ArenaId): Promise<void> {
  const current = await page.evaluate(() => (
    globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: { admissionState: () => { arenaId: string } } }
  ).__ATOMIC_ACRES_DEBUG__.admissionState().arenaId);
  if (current !== arenaId) await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
  await page.waitForFunction((expected) => {
    const api = (globalThis as typeof globalThis & {
      __ATOMIC_ACRES_DEBUG__?: { admissionState: () => { arenaId: string } };
    }).__ATOMIC_ACRES_DEBUG__;
    return api?.admissionState().arenaId === expected;
  }, arenaId, { timeout: 10_000 });
  await page.locator('#solo').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true), undefined, { timeout: 10_000 });
}

async function runArena(page: Page, arenaId: ArenaId, setPhase: (phase: string) => void): Promise<ArenaReceipt> {
  const issues: string[] = [];
  await selectArenaPhysically(page, arenaId);
  const before = await menuAudit(page);
  const initialColdMenu = before.menuLifecycle === 'pre-match'
    && before.gameplayArena === 'deferred-until-deployment';
  if (initialColdMenu) {
    if (before.streaming?.constructionCount !== 0 || before.streaming?.residentArenaRoots !== 0) {
      issues.push(`cold-menu-constructed-gameplay:${JSON.stringify(before.streaming)}`);
    }
    if (before.menuPreview?.rendererEvidence?.arenaConstructionCount !== 0
      || before.menuPreview?.rendererEvidence?.gameplayArenaPrepared !== false) {
      issues.push(`cold-menu-live-preview-work:${JSON.stringify(before.menuPreview?.rendererEvidence)}`);
    }
  }
  if (before.runtime?.requestedBackend !== 'webgl2' || before.runtime?.actualBackend !== 'webgl2') {
    issues.push(`menu-backend-not-webgl2:${JSON.stringify(before.runtime)}`);
  }

  await page.locator('#player-name').fill(`Pass65 Hardware WebGL2 ${arenaId}`);
  setPhase(`admission:${arenaId}`);
  const baselines = await page.evaluate(() => {
    const target = globalThis as typeof globalThis & {
      __PASS65_HARDWARE_WEBGL2_START_WATCH__: () => void;
      __PASS65_HARDWARE_WEBGL2_GATE__: {
      longTasks: LongTask[]; readPixels: WebGlReadPixelsEvent[]; deploymentStartedAt: number | null;
      transitionReadyAt: number | null; firstGameplayPresentedAt: number | null; activeAt: number | null;
      physicalSoloStarts: Array<{ at: number; isTrusted: boolean }>;
      armedBaselineGeneration: number | null;
    }};
    const gate = target.__PASS65_HARDWARE_WEBGL2_GATE__;
    target.__PASS65_HARDWARE_WEBGL2_START_WATCH__();
    return {
      longTasks: gate.longTasks.length,
      readPixels: gate.readPixels.length,
      physicalSoloStarts: gate.physicalSoloStarts.length,
      deploymentStartedAt: gate.deploymentStartedAt,
      armedBaselineGeneration: gate.armedBaselineGeneration,
    };
  });
  if (!Number.isInteger(baselines.armedBaselineGeneration) || Number(baselines.armedBaselineGeneration) < 0) {
    throw new Error(`Admission watch did not arm from a valid generation: ${baselines.armedBaselineGeneration}`);
  }
  const expectedAdmissionGeneration = Number(baselines.armedBaselineGeneration) + 1;
  await page.locator('#solo').click();
  const loading = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('#deployment-transition');
    return {
      lifecycle: document.documentElement.dataset.menuLifecycle ?? null,
      visible: node ? !node.hidden : false,
      media: node?.dataset.media ?? null,
      liveRender: node?.dataset.liveRender ?? null,
      arena: node?.dataset.arena ?? null,
    };
  });
  if (loading.lifecycle !== 'deploying' || loading.visible !== true || loading.arena !== arenaId) {
    issues.push(`deployment-surface-not-active:${JSON.stringify(loading)}`);
  }
  if (!['shared-prerecorded-video', 'reduced-motion-poster'].includes(String(loading.media)) || loading.liveRender !== 'false') {
    issues.push(`deployment-surface-not-prerecorded:${JSON.stringify(loading)}`);
  }

  await page.waitForFunction((expectedGeneration) => {
    const target = globalThis as typeof globalThis & {
      __ATOMIC_ACRES_DEBUG__?: { admissionState: () => {
        bootstrapStage: string; gameStarted: boolean; matchPhase: string;
        arenaTransitionPhase: string; matchAdmissionGeneration: number;
      } };
      __PASS65_HARDWARE_WEBGL2_GATE__?: {
        expectedAdmissionGeneration: number | null;
        observedAdmissionGeneration: number | null;
        activeAt: number | null;
      };
    };
    const api = target.__ATOMIC_ACRES_DEBUG__;
    const gate = target.__PASS65_HARDWARE_WEBGL2_GATE__;
    const state = api?.admissionState();
    if (state?.matchAdmissionGeneration !== expectedGeneration
      || gate?.expectedAdmissionGeneration !== expectedGeneration
      || gate?.observedAdmissionGeneration !== expectedGeneration) return false;
    if (state.bootstrapStage === 'failed') return true;
    return state.gameStarted && state.matchPhase === 'active'
      && state.arenaTransitionPhase === 'idle' && gate.activeAt !== null;
  }, expectedAdmissionGeneration, { timeout: 20_000 });

  const admitted = await instrumentation(page);
  const trustedStarts = admitted.physicalSoloStarts.slice(baselines.physicalSoloStarts);
  if (trustedStarts.length !== 1 || trustedStarts[0]?.isTrusted !== true) {
    issues.push(`untrusted-or-duplicate-solo-start:${JSON.stringify(trustedStarts)}`);
  }
  const timing = {
    deploymentStartedAt: admitted.deploymentStartedAt ?? Number.NaN,
    transitionReadyAt: admitted.transitionReadyAt,
    firstGameplayPresentedAt: admitted.firstGameplayPresentedAt,
    activeAt: admitted.activeAt,
  };
  issues.push(...validateHardwareWebGl2AdmissionTiming(timing));
  if (admitted.expectedAdmissionGeneration === null
    || admitted.observedAdmissionGeneration !== admitted.expectedAdmissionGeneration) {
    issues.push(`match-admission-generation-mismatch:${admitted.observedAdmissionGeneration}/${admitted.expectedAdmissionGeneration}`);
  }
  if (admitted.readPixelsTripwireInstalled !== true) issues.push('webgl2-readpixels-tripwire-not-installed');
  const admissionLongTasks = admitted.longTasks.slice(baselines.longTasks)
    .filter((entry) => entry.startTime < (timing.activeAt ?? Number.POSITIVE_INFINITY));
  const admissionReadPixelsAtActive = admitted.readPixels.slice(baselines.readPixels);
  issues.push(...validateAdmissionReadPixels(admissionReadPixelsAtActive, timing.transitionReadyAt));

  const activeAudit = await page.evaluate(() => {
    const api = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: {
      snapshot: () => Record<string, any>;
      admissionState: () => { presentedGameplayFrame: number };
      setBotsFrozen: (frozen: boolean) => void;
      setMovement: (forward: boolean, sprint?: boolean) => void;
    } }).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(true, true);
    const state = api.snapshot();
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    const gl = canvas?.getContext('webgl2') ?? null;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') ?? null;
    return {
      bootstrap: state.bootstrap,
      gameStarted: state.gameStarted,
      frameCount: state.frameCount,
      matchPhase: state.matchPhase,
      arenaId: state.arenaSelection.id,
      runtime: { ...state.render.runtime, contextLifecycle: state.render.contextLifecycle },
      transition: state.arenaSelection.streaming.transition,
      backdrop: state.menuLifecycle.backdrop,
      deploymentTransitionHidden: document.querySelector<HTMLElement>('#deployment-transition')?.hidden ?? false,
      presentedGameplayFrame: api.admissionState().presentedGameplayFrame,
      drawingBuffer: state.render.drawingBuffer,
      renderCalls: state.render.calls,
      atomicSignal: state.render.atomicSignal,
      atomicSignalDataset: document.documentElement.dataset.atomicSignal ?? null,
      rawWebGl: gl ? {
        adapterClass: gl.constructor.name,
        renderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null,
        vendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : null,
        version: String(gl.getParameter(gl.VERSION)),
      } : null,
      page: {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
      },
    };
  });
  if (!activeAudit.gameStarted || activeAudit.matchPhase !== 'active' || activeAudit.arenaId !== arenaId) {
    issues.push(`arena-not-active:${JSON.stringify(activeAudit)}`);
  }
  issues.push(...validateHardwareWebGl2Runtime(activeAudit.runtime));
  if (activeAudit.page?.visibilityState !== 'visible' || activeAudit.page?.hasFocus !== true
    || activeAudit.page?.width !== VIEWPORT.width || activeAudit.page?.height !== VIEWPORT.height
    || activeAudit.page?.devicePixelRatio !== 1) {
    issues.push(`foreground-viewport-contract-failed:${JSON.stringify(activeAudit.page)}`);
  }
  if (activeAudit.deploymentTransitionHidden !== true) issues.push('deployment-transition-remained-visible-after-match-ready');
  if (!Number.isSafeInteger(activeAudit.frameCount) || activeAudit.frameCount < 1
    || !Number.isSafeInteger(activeAudit.presentedGameplayFrame) || activeAudit.presentedGameplayFrame < 1
    || !Number.isSafeInteger(activeAudit.renderCalls) || activeAudit.renderCalls < 1
    || !Array.isArray(activeAudit.drawingBuffer) || activeAudit.drawingBuffer.some((value: number) => value <= 0)) {
    issues.push(`blank-or-unpresented-gameplay:${JSON.stringify({
      presentedGameplayFrame: activeAudit.presentedGameplayFrame,
      renderCalls: activeAudit.renderCalls,
      drawingBuffer: activeAudit.drawingBuffer,
    })}`);
  }
  if (activeAudit.atomicSignal?.enabled !== true || activeAudit.atomicSignal?.fallbackReason !== null
    || activeAudit.atomicSignal?.bypassReason !== null || activeAudit.atomicSignal?.outputValidated !== true
    || activeAudit.atomicSignalDataset !== 'active') {
    issues.push(`atomic-signal-not-healthy:${JSON.stringify(activeAudit.atomicSignal)}`);
  }
  if (activeAudit.atomicSignal?.outputValidated === true && admissionReadPixelsAtActive.length === 0) {
    issues.push('atomic-signal-output-validated-without-readpixels-tripwire-evidence');
  }
  if (activeAudit.rawWebGl?.adapterClass !== 'WebGL2RenderingContext'
    || typeof activeAudit.rawWebGl?.renderer !== 'string'
    || !/ANGLE/i.test(activeAudit.rawWebGl.renderer)
    || activeAudit.rawWebGl.renderer !== activeAudit.runtime.adapterLabel) {
    issues.push(`raw-gl-runtime-adapter-mismatch:${JSON.stringify({ raw: activeAudit.rawWebGl, runtime: activeAudit.runtime })}`);
  }
  if (activeAudit.transition?.phase !== 'idle' || activeAudit.transition?.failure !== null
    || activeAudit.transition?.renderSubmissionPaused !== false) {
    issues.push(`transition-not-idle:${JSON.stringify(activeAudit.transition)}`);
  }
  if (activeAudit.backdrop?.periodicReadbackCount !== 0
    || activeAudit.backdrop?.sourceCaptureAttemptCount !== 0
    || activeAudit.backdrop?.sourceCaptureCount !== 0) {
    issues.push(`unexpected-pause-backdrop-readback:${JSON.stringify(activeAudit.backdrop)}`);
  }

  const requestedWindowMs = PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.steadyWindowMs;
  setPhase(`steady:${arenaId}`);
  const frameCollection = await collectFrameWindow(page, requestedWindowMs);
  const { frameWindow, postReadyFrameWindow, progress } = frameCollection;
  const postReadyIntervalTotalMs = postReadyFrameWindow.intervalsMs.reduce((total, interval) => total + interval, 0);
  const postReadyContinuityToleranceMs = Math.max(1, postReadyFrameWindow.intervalsMs.length * 0.001);
  if (!Number.isFinite(postReadyFrameWindow.startedAt) || !Number.isFinite(postReadyFrameWindow.endedAt)
    || !Number.isFinite(postReadyFrameWindow.elapsedMs) || postReadyFrameWindow.elapsedMs <= 0
    || postReadyFrameWindow.startedAt !== timing.transitionReadyAt
    || postReadyFrameWindow.endedAt !== frameWindow.startedAt
    || (timing.firstGameplayPresentedAt ?? Number.POSITIVE_INFINITY) > postReadyFrameWindow.endedAt
    || (timing.activeAt ?? Number.POSITIVE_INFINITY) > postReadyFrameWindow.endedAt
    || postReadyFrameWindow.intervalsMs.length === 0
    || Math.abs(postReadyIntervalTotalMs - postReadyFrameWindow.elapsedMs) > postReadyContinuityToleranceMs) {
    issues.push(`post-ready-frame-ledger-not-continuous:${JSON.stringify({
      timing,
      postReadyFrameWindow,
      intervalTotalMs: postReadyIntervalTotalMs,
      toleranceMs: postReadyContinuityToleranceMs,
    })}`);
  }
  issues.push(...validatePostReadyFiftyMillisecondFrames(postReadyFrameWindow.intervalsMs));
  if (postReadyFrameWindow.observerSupported !== true || postReadyFrameWindow.longTasks.length > 0) {
    issues.push(`post-ready-long-tasks:${postReadyFrameWindow.longTasks.length}`);
  }
  if (postReadyFrameWindow.readPixels.length > 0) issues.push(`post-ready-readpixels:${postReadyFrameWindow.readPixels.length}`);
  const summary = summarizeFramePacingWindow(frameWindow.intervalsMs, frameWindow.elapsedMs);
  issues.push(...validateFramePacingWindow(summary, frameWindow.longTasks.length, frameWindow.observerSupported));
  issues.push(...validatePostReadyFiftyMillisecondFrames(frameWindow.intervalsMs));
  if (frameWindow.readPixels.length > 0) issues.push(`steady-readpixels:${frameWindow.readPixels.length}`);
  const expectedProgressDelta = {
    frameCount: progress.after.frameCount - progress.before.frameCount,
    presentedGameplayFrame: progress.after.presentedGameplayFrame - progress.before.presentedGameplayFrame,
  };
  const expectedMinimumProgress = Math.floor(
    frameWindow.elapsedMs * PASS65_FRAME_PACING_THRESHOLDS.minimumCadenceHz / 1_000,
  );
  if (progress.minimumExpectedProgressFrames !== expectedMinimumProgress
    || !Number.isSafeInteger(progress.before.frameCount) || progress.before.frameCount < 1
    || !Number.isSafeInteger(progress.before.presentedGameplayFrame) || progress.before.presentedGameplayFrame < 1
    || !Number.isSafeInteger(progress.after.frameCount) || progress.after.frameCount < 1
    || !Number.isSafeInteger(progress.after.presentedGameplayFrame) || progress.after.presentedGameplayFrame < 1
    || progress.delta.frameCount !== expectedProgressDelta.frameCount
    || progress.delta.presentedGameplayFrame !== expectedProgressDelta.presentedGameplayFrame
    || progress.delta.frameCount < expectedMinimumProgress
    || progress.delta.presentedGameplayFrame < expectedMinimumProgress) {
    issues.push(`steady-gameplay-presentation-progress-invalid:${JSON.stringify({ progress, expectedMinimumProgress })}`);
  }

  const finalAudit = await page.evaluate(() => {
    const api = (globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: {
      snapshot: () => Record<string, any>;
      admissionState: () => { presentedGameplayFrame: number };
      setMovement: (forward: boolean, sprint?: boolean) => void;
    } }).__ATOMIC_ACRES_DEBUG__;
    api.setMovement(false, false);
    const state = api.snapshot();
    return {
      runtime: { ...state.render.runtime, contextLifecycle: state.render.contextLifecycle },
      transition: state.arenaSelection.streaming.transition,
      backdrop: state.menuLifecycle.backdrop,
      frameCount: state.frameCount,
      presentedGameplayFrame: api.admissionState().presentedGameplayFrame,
    };
  });
  issues.push(...validateHardwareWebGl2Runtime(finalAudit.runtime));
  if (finalAudit.backdrop?.periodicReadbackCount !== 0
    || finalAudit.backdrop?.sourceCaptureAttemptCount !== 0
    || finalAudit.backdrop?.sourceCaptureCount !== 0) {
    issues.push(`post-window-pause-backdrop-readback:${JSON.stringify(finalAudit.backdrop)}`);
  }
  if (activeAudit.frameCount > progress.before.frameCount
    || activeAudit.presentedGameplayFrame > progress.before.presentedGameplayFrame
    || !Number.isSafeInteger(finalAudit.frameCount) || finalAudit.frameCount < progress.after.frameCount
    || !Number.isSafeInteger(finalAudit.presentedGameplayFrame)
    || finalAudit.presentedGameplayFrame < progress.after.presentedGameplayFrame) {
    issues.push(`steady-progress-audit-binding-invalid:${JSON.stringify({ activeAudit, progress, finalAudit })}`);
  }
  const completedInstrumentation = await instrumentation(page);
  const completeAdmissionReadPixels = completedInstrumentation.readPixels.slice(baselines.readPixels);
  issues.push(...validateAdmissionReadPixels(completeAdmissionReadPixels, timing.transitionReadyAt));

  return Object.freeze({
    arenaId,
    menuAudit: before,
    loadingAudit: loading,
    admission: Object.freeze({
      timing,
      longTasks: Object.freeze(admissionLongTasks),
      readPixels: Object.freeze(completeAdmissionReadPixels),
      physicalSoloStarts: Object.freeze(trustedStarts),
      readPixelsTripwireInstalled: admitted.readPixelsTripwireInstalled,
      expectedAdmissionGeneration: admitted.expectedAdmissionGeneration,
      observedAdmissionGeneration: admitted.observedAdmissionGeneration,
      presentedGameplayFrameAtReady: admitted.presentedGameplayFrameAtReady,
      postReadyFrameWindow,
    }),
    steady: Object.freeze({ requestedWindowMs, frameWindow, summary, progress }),
    activeAudit,
    finalAudit,
    issues: Object.freeze(unique(issues)),
  });
}

async function runTrial(trial: number): Promise<TrialReceipt> {
  let phase = 'browser-bootstrap';
  const faults: BrowserFault[] = [];
  const readbackWarnings: BrowserFault[] = [];
  const requestFailures: RequestFailure[] = [];
  const issues: string[] = [];
  const arenas: ArenaReceipt[] = [];
  let context: BrowserContext | null = null;
  let browserVersion = 'unavailable';
  let systemInfo: Record<string, any> | null = null;
  let profilePath = '';
  let profileInitiallyEmpty = false;
  let profileRemoved = false;
  let browserProcessIds: number[] = [];
  try {
    // A newly created and mechanically empty userDataDir gives each trial a
    // unique installed-Chrome process/profile. No trial can inherit profile or
    // local-storage state from an earlier run.
    profilePath = await mkdtemp(path.join(tmpdir(), 'pass65-webgl2-'));
    profileInitiallyEmpty = (await readdir(profilePath)).length === 0;
    if (!profileInitiallyEmpty) throw new Error('Fresh Chrome profile directory was not initially empty');
    context = await chromium.launchPersistentContext(profilePath, {
      headless: !headed,
      executablePath,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      args: [
    ...OFFSCREEN_ARGS,
    '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--force-device-scale-factor=1',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      ],
    });
    browserVersion = context.browser()?.version() ?? 'unavailable';
    const browser = context.browser();
    if (!browser) throw new Error('Persistent Chrome context did not expose its browser process');
    try {
      const cdp = await browser.newBrowserCDPSession();
      const gpuInfo = await cdp.send('SystemInfo.getInfo') as Record<string, any>;
      const processInfo = await cdp.send('SystemInfo.getProcessInfo') as Record<string, any>;
      systemInfo = { gpu: gpuInfo.gpu ?? null, processInfo: processInfo.processInfo ?? [] };
      browserProcessIds = (Array.isArray(processInfo.processInfo) ? processInfo.processInfo : [])
        .filter((entry: Record<string, unknown>) => entry.type === 'browser' && Number.isFinite(Number(entry.id)))
        .map((entry: Record<string, unknown>) => Number(entry.id));
      if (browserProcessIds.length !== 1) issues.push(`browser-process-identity-count:${browserProcessIds.length}/1`);
      await cdp.detach();
      issues.push(...driverGpuProof(systemInfo));
    } catch (error) {
      issues.push(`cdp-system-info-error:${error instanceof Error ? error.message : String(error)}`);
    }
    await installInstrumentation(context);
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    context.on('weberror', (webError) => faults.push({ phase, kind: 'weberror', message: webError.error().message }));
    page.on('pageerror', (error) => faults.push({ phase, kind: 'pageerror', message: error.message }));
    page.on('crash', () => faults.push({ phase, kind: 'page-crash', message: 'renderer page crashed' }));
    page.on('console', (message) => {
      const record = { phase, kind: `console-${message.type()}`, message: message.text() };
      if (/readpixels|read pixels|gpu stall due to read/i.test(record.message)) readbackWarnings.push(record);
      else if (message.type() === 'error') faults.push(record);
      else if (/webgl.*(?:context lost|error)|atomic signal fallback|gl_invalid|context restored/i.test(record.message)) faults.push(record);
    });
    page.on('requestfailed', (request) => requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? null,
    }));
    page.on('response', (response) => {
      if (response.status() < 400) return;
      requestFailures.push({
        url: response.url(),
        resourceType: response.request().resourceType(),
        failure: `http-status-${response.status()}`,
      });
    });
    if (headed) await page.bringToFront();
    phase = 'cold-menu';
    await page.goto(
      `http://127.0.0.1:${port}/?release=latest&renderer=webgl2&externalServices=off&render=performance&map=atomic-acres&seed=${6_500 + trial}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await page.waitForFunction(() => {
      const state = (globalThis as typeof globalThis & {
        __ATOMIC_ACRES_DEBUG__?: { snapshot: () => Record<string, any> };
      }).__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready'
        && state?.weaponReady === true
        && state?.render?.runtime?.actualBackend === 'webgl2';
    }, undefined, { timeout: 60_000 });

    const order: ArenaId[] = trial % 2 === 1
      ? ['atomic-acres', 'skyline-terminal', 'gun-range', 'rustworks-1v1']
      : [...ARENA_SEQUENCE];
    for (const arenaId of order) {
      phase = `admission:${arenaId}`;
      const receipt = await withNodeDeadline(
        `trial-${trial}-${arenaId}`,
        45_000,
        runArena(page, arenaId, (nextPhase) => { phase = nextPhase; }),
      );
      arenas.push(receipt);
      issues.push(...receipt.issues.map((issue) => `${arenaId}:${issue}`));
      phase = `return-menu:${arenaId}`;
      await page.evaluate(() => (
        globalThis as typeof globalThis & { __ATOMIC_ACRES_DEBUG__: { returnToMainMenu: () => void } }
      ).__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
      await page.waitForFunction(() => document.documentElement.dataset.menuLifecycle === 'pre-match', undefined, { timeout: 10_000 });
    }
    phase = 'complete';
  } catch (error) {
    issues.push(`trial-exception:${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  } finally {
    await context?.close().catch(() => undefined);
    if (profilePath) {
      try {
        await removeTemporaryProfile(profilePath);
        profileRemoved = true;
      } catch (error) {
        issues.push(`temporary-profile-cleanup-failed:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  issues.push(...faults.map((fault) => `${fault.phase}:${fault.kind}:${fault.message}`));
  issues.push(...readbackWarnings
    .filter((warning) => !warning.phase.startsWith('admission:'))
    .map((warning) => `live-readback-warning:${warning.phase}:${warning.message}`));
  const admittedReadPixels = arenas.reduce((total, arena) => total + arena.admission.readPixels.length, 0);
  const admissionReadbackWarnings = readbackWarnings.filter((warning) => warning.phase.startsWith('admission:'));
  if (admissionReadbackWarnings.length > 0 && admittedReadPixels === 0) {
    issues.push(`unexplained-admission-readback-warning:${admissionReadbackWarnings.map((warning) => warning.message).join(' | ')}`);
  }
  issues.push(...localRequestIssues(requestFailures));
  if (arenas.length !== ARENA_SEQUENCE.length) issues.push(`incomplete-arena-circuit:${arenas.length}/${ARENA_SEQUENCE.length}`);
  const atomicSummary = arenas.find((arena) => arena.arenaId === 'atomic-acres')?.steady.summary;
  const terminalSummary = arenas.find((arena) => arena.arenaId === 'skyline-terminal')?.steady.summary;
  const atomicAgainstTerminalIssues = atomicSummary && terminalSummary
    ? compareAtomicAgainstTerminal(atomicSummary, terminalSummary)
    : ['trial-atomic-terminal-comparison-unavailable'];
  issues.push(...atomicAgainstTerminalIssues);
  return Object.freeze({
    trial,
    browserVersion,
    profile: Object.freeze({
      id: profilePath ? path.basename(profilePath) : 'missing',
      tempRelativeBasename: profilePath ? path.basename(profilePath) : 'missing',
      absolutePathSha256: profilePath ? sha256(path.resolve(profilePath)) : 'missing',
      initiallyEmpty: profileInitiallyEmpty,
      removedAfterRun: profileRemoved,
    }),
    browserProcessIds: Object.freeze(browserProcessIds),
    systemInfo,
    arenas: Object.freeze(arenas),
    faults: Object.freeze(faults),
    readbackWarnings: Object.freeze(readbackWarnings),
    requestFailures: Object.freeze(requestFailures),
    atomicAgainstTerminalIssues: Object.freeze(atomicAgainstTerminalIssues),
    issues: Object.freeze(unique(issues)),
  });
}

function aggregateArena(trials: readonly TrialReceipt[], arenaId: 'atomic-acres' | 'skyline-terminal'): FramePacingWindowSummary | null {
  const receipts = trials.filter((trial) => trial.issues.length === 0)
    .flatMap((trial) => trial.arenas.filter((arena) => arena.arenaId === arenaId));
  const intervals = receipts.flatMap((receipt) => receipt.steady.frameWindow.intervalsMs);
  const elapsedMs = receipts.reduce((total, receipt) => total + receipt.steady.frameWindow.elapsedMs, 0);
  return intervals.length > 0 ? summarizeFramePacingWindow(intervals, elapsedMs) : null;
}

async function main(): Promise<void> {
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  await mkdir(OWNER_ARTIFACT_ROOT, { recursive: true });
  const buildManifestBefore = await createBuildManifest();
  const chromeExecutableSha256 = sha256(await readFile(executablePath));
  let server: PreviewServer | null = null;
  const trials: TrialReceipt[] = [];
  const issues: string[] = [];
  const startedAt = new Date().toISOString();
  try {
    server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
    for (let trial = 0; trial < PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials; trial += 1) {
      console.log(`[pass65-hardware-webgl2] fresh-browser-profile=${trial + 1}/3`);
      const receipt = await runTrial(trial + 1);
      trials.push(receipt);
      issues.push(...receipt.issues.map((issue) => `trial-${trial + 1}:${issue}`));
    }
  } catch (error) {
    issues.push(`run-exception:${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  } finally {
    if (server) await new Promise<void>((resolve) => server?.httpServer.close(() => resolve()));
  }

  if (trials.length !== PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials) {
    issues.push(`incomplete-fresh-trials:${trials.length}/${PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials}`);
  }
  const profileIds = trials.map((trial) => trial.profile.id);
  if (new Set(profileIds).size !== PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials
    || trials.some((trial) => !trial.profile.initiallyEmpty || !trial.profile.removedAfterRun)) {
    issues.push(`fresh-profile-proof-failed:${JSON.stringify(trials.map((trial) => trial.profile))}`);
  }
  const browserProcessIds = trials.flatMap((trial) => trial.browserProcessIds);
  if (browserProcessIds.length !== PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials
    || new Set(browserProcessIds).size !== PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials) {
    issues.push(`fresh-browser-process-proof-failed:${JSON.stringify(browserProcessIds)}`);
  }
  const atomic = aggregateArena(trials, 'atomic-acres');
  const terminal = aggregateArena(trials, 'skyline-terminal');
  const comparisonIssues = atomic && terminal ? compareAtomicAgainstTerminal(atomic, terminal) : ['atomic-terminal-comparison-unavailable'];
  issues.push(...comparisonIssues);
  const buildManifestAfter = await createBuildManifest();
  if (buildManifestAfter.digest !== buildManifestBefore.digest) {
    issues.push(`production-build-manifest-drift:${buildManifestBefore.digest}/${buildManifestAfter.digest}`);
  }
  const endingSha = git('rev-parse', 'HEAD');
  if (endingSha !== sourceSha) issues.push(`source-head-drift:${sourceSha}/${endingSha}`);
  const cleanAfter = gitStatus().length === 0;
  if (!cleanAfter) issues.push('worktree-became-dirty-during-hardware-webgl2-run');
  let finalIssues = unique(issues);
  const completedAt = new Date().toISOString();
  const environment = {
    platform: platform(), release: release(), arch: arch(),
    totalMemoryGiB: Number((totalmem() / 1024 ** 3).toFixed(2)),
    chromeExecutable: executablePath.replaceAll('\\', '/'),
    chromeExecutableSha256,
    browserVersions: trials.map((trial) => trial.browserVersion),
    gpuSystemInfo: trials.map((trial) => trial.systemInfo),
  };
  const environmentHash = sha256(JSON.stringify(environment));
  let receipt = {
    schemaVersion: 1,
    gate: 'pass65-installed-chrome-hardware-webgl2-performance-admission-v1',
    status: finalIssues.length === 0 ? 'passed' : 'failed',
    startedAt,
    completedAt,
    source: {
      sha: sourceSha, endingSha, branch, cleanBefore, cleanAfter,
      productionBuild: true, previewServer: 'vite-preview',
      buildManifestSha256: buildManifestBefore.digest,
    },
    environment,
    configuration: {
      viewport: VIEWPORT,
      backend: 'webgl2-required-hardware-angle-no-software',
      graphics: 'Performance',
      routeContract: 'release=latest&renderer=webgl2&render=performance; no compat, renderPaused or signal override',
      freshBrowserProfiles: PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.freshBrowserTrials,
      physicalSoloButton: true,
      arenaCircuit: ARENA_SEQUENCE,
      thresholds: PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS,
      frozenSteadyFrameThresholds: PASS65_FRAME_PACING_THRESHOLDS,
      readbackPolicy: 'AtomicSignal may perform at most three 1x1 validateOutput safety probes before the transition-ready/gameStarted boundary; zero readPixels at or after transition-ready and during every steady window; pause backdrop capture counters remain zero.',
      fiftyMillisecondPolicy: 'Cold admission >=50ms tasks/frames are retained in the admission ledger and bounded by 10s/15s deadlines; zero >=50ms frame intervals applies after ready, including each 10s steady ledger.',
    },
    trials,
    aggregate: { atomic, terminal, atomicAgainstTerminalIssues: comparisonIssues },
    issues: finalIssues,
    claimStates: {
      observed: 'Three fresh installed-Chrome temporary profiles, physical Solo activation, runtime ANGLE adapter identity, CDP GPU identity, cold loading/admission ledgers, WebGL2 readPixels tripwire, all-map transitions and post-ready frame windows.',
      inference: 'A pass proves this exact clean SHA admits and sustains hardware WebGL2 Performance on this machine without the reported compatibility-path freeze signature.',
      assumption: 'The deterministic movement workload covers presentation continuity but does not replace owner combat feel or native-WebGPU evidence.',
      unknown: 'Owner free-look/support/destruction feel and final native-WebGPU HITL remain separate gates.',
      falsifiers: 'Dirty SHA, software/non-ANGLE adapter, missing prerecorded loading surface, >10s first presentation, >15s active, non-1x1 or post-ready readPixels, post-ready >=50ms frame, long task, context loss, browser error, failed map circuit or Atomic regression fails.',
    },
  };
  if (finalIssues.length === 0) {
    const canonicalSelfValidationIssues = [
      ...validateHardwareWebGl2BuildManifest(buildManifestBefore.manifest, { sourceSha }),
      ...validateHardwareWebGl2DetailedReceipt(receipt, {
        sourceSha,
        buildManifestSha256: buildManifestBefore.digest,
        environmentHash,
      }),
    ];
    if (canonicalSelfValidationIssues.length > 0) {
      finalIssues = unique(canonicalSelfValidationIssues.map((issue) => `canonical-self-validation:${issue}`));
      receipt = { ...receipt, status: 'failed', issues: finalIssues };
    }
  }
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const richDigest = sha256(serialized);
  const receiptPath = `${ARTIFACT_ROOT}/${sourceSha}-receipt.json`;
  const buildManifestPath = `${ARTIFACT_ROOT}/${sourceSha}-dist-manifest.json`;
  await writeFile(buildManifestPath, buildManifestBefore.serialized, 'utf8');
  await writeFile(receiptPath, serialized, 'utf8');
  await writeFile(`${receiptPath}.sha256`, `${richDigest}  ${sourceSha}-receipt.json\n`, 'utf8');

  let ownerArtifactPath: string | null = null;
  let ownerArtifactSha256: string | null = null;
  if (finalIssues.length === 0) {
    const ownerReceipt = {
      schemaVersion: 2,
      kind: 'pass65-owner-feedback-evidence',
      sourceSha,
      buildId: `hardware-webgl2-${richDigest.slice(0, 16)}`,
      verifierId: 'pass65-installed-chrome-hardware-webgl2-admission',
      verifierVersion: '1',
      environmentHash,
      result: 'passed',
      feedbackIds: PASS65_HARDWARE_WEBGL2_FEEDBACK_IDS,
      testRefs: ['T-COLD-HARDWARE-WEBGL2'],
      detailedReceiptPath: receiptPath,
      detailedReceiptSha256: richDigest,
      buildManifestPath,
      buildManifestSha256: buildManifestBefore.digest,
    };
    const ownerSerialized = JSON.stringify(ownerReceipt);
    ownerArtifactSha256 = sha256(ownerSerialized);
    ownerArtifactPath = `${OWNER_ARTIFACT_ROOT}/hardware-webgl2-admission-${sourceSha}.json`;
    await writeFile(ownerArtifactPath, ownerSerialized, 'utf8');
  }

  console.log(JSON.stringify({
    status: receipt.status,
    sourceSha,
    receiptPath,
    receiptSha256: richDigest,
    ownerArtifactPath,
    ownerArtifactSha256,
    atomic,
    terminal,
    comparisonIssues,
    issues: finalIssues,
  }, null, 2));
  if (finalIssues.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
