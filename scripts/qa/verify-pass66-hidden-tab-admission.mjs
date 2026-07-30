import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { isFatalWebGpuConsoleWarning } from './pass65-browser-console-contract.mjs';
import {
  PASS66_HIDDEN_TAB_GATE_SCHEMA,
  assertHeadedChromeLaunchContract,
  hiddenCheckpointFailures,
  recoveredCheckpointFailures,
} from './pass66-hidden-tab-contract.mjs';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const maximumHiddenPreparationMs = 30_000;
const minimumHiddenObservationMs = 1_500;
const maximumForegroundRecoveryMs = 20_000;
const artifactRoot = 'artifacts/pass66/hidden-tab-admission';
const chromeCandidates = [
  process.env.PASS66_CHROME_PATH,
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 66 hidden-tab admission requires installed Google Chrome');

const launchOptions = {
  headless: false,
  executablePath,
  args: ['--enable-unsafe-webgpu'],
};
assertHeadedChromeLaunchContract(launchOptions);

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  throw new Error('Pass 66 hidden-tab admission requires a clean tracked worktree');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not complete within ${milliseconds}ms`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

function uniqueFatalErrors(errors) {
  return [...new Set(errors)].filter((message) => !/favicon|leaderboard|Failed to fetch/i.test(message));
}

async function sample(page) {
  return page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api.snapshot();
    const transition = state.arenaSelection.streaming.transition;
    return {
      sampledAt: performance.now(),
      document: {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      frameCount: state.frameCount,
      gameStarted: state.gameStarted,
      matchPhase: state.matchPhase,
      bootstrap: state.bootstrap,
      presentationScheduling: state.presentationScheduling,
      admission: api.admissionState(),
      presentation: api.samplePresentationTelemetry(),
      runtime: state.render.runtime,
      audio: window.__PASS66_AUDIO_AUDIT__.snapshot(),
      interactiveWorldTick: state.interactiveWorld.envelope?.tick
        ?? state.interactiveWorld.telemetry?.tick
        ?? null,
      assetResources: performance.getEntriesByType('resource')
        .filter((entry) => /\/assets\/original\/models\/atomic-acres-blender-arena\.glb(?:\?|$)/.test(entry.name))
        .map((entry) => ({
          name: new URL(entry.name, location.href).pathname,
          startTime: entry.startTime,
          responseEnd: entry.responseEnd,
          duration: entry.duration,
          decodedBodySize: 'decodedBodySize' in entry ? entry.decodedBodySize : null,
        })),
      streaming: {
        constructionCount: state.arenaSelection.streaming.constructionCount,
        constructionHistory: state.arenaSelection.streaming.constructionHistory,
        constructedArenaIds: state.arenaSelection.streaming.constructedArenaIds,
        residentArenaRoots: state.arenaSelection.streaming.residentArenaRoots,
        activeRoots: state.arenaSelection.activeRoots,
      },
      transition: {
        generation: transition.generation,
        phase: transition.phase,
        failure: transition.failure,
        renderSubmissionPaused: transition.renderSubmissionPaused,
        profile: transition.profile,
      },
    };
  });
}

async function waitForNodeSample(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await sample(page);
    if (predicate(latest)) return latest;
    await delay(100);
  }
  throw new Error(`${label} did not complete within ${timeoutMs}ms; latest=${JSON.stringify(latest)}`);
}

async function stubExternalServices(page) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ entries: [] }),
  }));
  await page.route('**/v1/streak', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ accepted: true }),
  }));
}

await mkdir(artifactRoot, { recursive: true });
let browser;
let receipt = null;
try {
  browser = await chromium.launch(launchOptions);
  const browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1_600, height: 900 }, deviceScaleFactor: 1 });
  const game = await context.newPage();
  const cover = await context.newPage();
  const errors = [];
  let heldAssetRequests = 0;
  let releaseAssetBarrier;
  let observeAssetBarrier;
  const assetBarrierReleased = new Promise((resolveRelease) => { releaseAssetBarrier = resolveRelease; });
  const assetBarrierObserved = new Promise((resolveObserved) => { observeAssetBarrier = resolveObserved; });

  game.on('pageerror', (error) => errors.push(error.message));
  game.on('console', (message) => {
    if (message.type() === 'error'
      || message.type() === 'warning' && isFatalWebGpuConsoleWarning(message.text())) {
      errors.push(message.text());
    }
  });
  await game.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const contexts = [];
    const audit = { suspendCalls: 0, resumeCalls: 0 };
    const nativeSuspend = NativeAudioContext.prototype.suspend;
    const nativeResume = NativeAudioContext.prototype.resume;
    NativeAudioContext.prototype.suspend = function trackedSuspend(...args) {
      audit.suspendCalls += 1;
      return nativeSuspend.apply(this, args);
    };
    NativeAudioContext.prototype.resume = function trackedResume(...args) {
      audit.resumeCalls += 1;
      return nativeResume.apply(this, args);
    };
    function TrackedAudioContext(...args) {
      const context = new NativeAudioContext(...args);
      contexts.push(context);
      return context;
    }
    Object.setPrototypeOf(TrackedAudioContext, NativeAudioContext);
    TrackedAudioContext.prototype = NativeAudioContext.prototype;
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: TrackedAudioContext });
    Object.defineProperty(window, '__PASS66_AUDIO_AUDIT__', {
      configurable: false,
      value: {
        snapshot: () => ({
          contexts: contexts.map((context) => ({ state: context.state, sampleRate: context.sampleRate })),
          suspendCalls: audit.suspendCalls,
          resumeCalls: audit.resumeCalls,
        }),
      },
    });
  });
  await stubExternalServices(game);
  await game.route('**/assets/original/models/atomic-acres-blender-arena.glb*', async (route) => {
    heldAssetRequests += 1;
    observeAssetBarrier();
    await assetBarrierReleased;
    await route.continue();
  });

  await cover.setContent(`<!doctype html><title>Pass 66 hidden-tab cover</title><main style="font:32px system-ui;padding:48px">Pass 66 background-throttling probe</main>`);
  const url = new URL(baseUrl);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('externalServices', 'off');
  url.searchParams.set('render', 'blender');
  url.searchParams.set('map', 'atomic-acres');
  url.searchParams.set('seed', '660152');
  await game.goto(url.toString());
  await game.bringToFront();
  await game.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    return state?.bootstrap.stage === 'ready'
      && state?.render.runtime.actualBackend === 'webgpu'
      && state?.render.runtime.softwareAdapter === false
      && state?.arenaSelection.streaming.constructionCount === 0
      && state?.bootstrap.menuDeploymentAssetsProfile?.completed === true
      && api.sampleWeaponAssetCache().runtimeCorpus.ready === true;
  }, undefined, { timeout: 60_000 });
  await game.locator('#player-name').fill('Pass 66 Hidden Tab QA');
  const initial = await sample(game);
  if (initial.document.visibilityState !== 'visible' || !initial.document.hasFocus) {
    throw new Error(`installed Chrome did not grant the game tab foreground ownership: ${JSON.stringify(initial.document)}`);
  }
  await game.locator('#solo').click();
  await withTimeout(assetBarrierObserved, 30_000, 'Atomic Acres held asset request');
  await cover.bringToFront();
  await waitForNodeSample(game, (checkpoint) => (
    checkpoint.document.visibilityState === 'hidden' && !checkpoint.document.hasFocus
  ), 5_000, 'real game-tab visibility loss');
  const beforeRelease = await sample(game);
  releaseAssetBarrier();
  const afterCpuProgress = await waitForNodeSample(game, (checkpoint) => (
    checkpoint.document.visibilityState === 'hidden'
    && checkpoint.assetResources.length >= 1
    && checkpoint.transition.profile?.phases.some((entry) => entry.phase === 'prewarm-batched-effects')
  ), maximumHiddenPreparationMs, 'hidden fetch/decode/CPU preparation');
  await delay(minimumHiddenObservationMs);
  const afterHidden = await sample(game);
  const hiddenFailures = hiddenCheckpointFailures({ beforeRelease, afterHidden, heldAssetRequests });
  if (hiddenFailures.length > 0) throw new Error(`hidden checkpoint failed: ${hiddenFailures.join('; ')}`);

  const foregroundStartedAt = Date.now();
  await game.bringToFront();
  const recovered = await waitForNodeSample(game, (checkpoint) => (
    checkpoint.document.visibilityState === 'visible'
    && checkpoint.document.hasFocus
    && checkpoint.gameStarted
    && checkpoint.admission.presentedGameplayFrame >= 1
    && checkpoint.transition.phase === 'idle'
    && checkpoint.presentation.status === 'healthy'
    && checkpoint.audio.contexts.length === 1
    && checkpoint.audio.contexts.every((context) => context.state === 'running')
  ), maximumForegroundRecoveryMs, 'foreground match recovery');
  recovered.foregroundRecoveryMs = Date.now() - foregroundStartedAt;
  const recoveryFailures = recoveredCheckpointFailures({
    beforeRelease,
    afterHidden,
    recovered,
    maximumRecoveryMs: maximumForegroundRecoveryMs,
  });
  const fatalErrors = uniqueFatalErrors(errors);
  if (fatalErrors.length > 0) recoveryFailures.push(`browser/GPU errors: ${fatalErrors.join(' | ')}`);
  if (recoveryFailures.length > 0) throw new Error(`foreground checkpoint failed: ${recoveryFailures.join('; ')}`);

  receipt = {
    schema: PASS66_HIDDEN_TAB_GATE_SCHEMA,
    gate: 'pass66-real-headed-chrome-hidden-tab-admission',
    verdict: 'pass',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    browser: {
      executablePath,
      version: browserVersion,
      headed: true,
      launchArgs: launchOptions.args,
      backgroundThrottlingBypassFlags: [],
    },
    contract: {
      heldAsset: '/assets/original/models/atomic-acres-blender-arena.glb',
      heldAssetRequests,
      minimumHiddenObservationMs,
      maximumHiddenPreparationMs,
      maximumForegroundRecoveryMs,
    },
    initial,
    beforeRelease,
    afterCpuProgress,
    afterHidden,
    recovered,
    errors: fatalErrors,
  };
  await writeFile(`${artifactRoot}/exact-sha-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    pass: true,
    sourceRevision,
    browserVersion,
    hiddenCpuPhase: afterCpuProgress.transition.profile?.phases.at(-1)?.phase ?? null,
    hiddenSubmissionAdvance: afterHidden.presentation.submissionSequence - beforeRelease.presentation.submissionSequence,
    foregroundRecoveryMs: recovered.foregroundRecoveryMs,
    receipt: `${artifactRoot}/exact-sha-receipt.json`,
  }, null, 2));
  await context.close();
} catch (error) {
  await writeFile(`${artifactRoot}/failure-receipt.json`, `${JSON.stringify({
    schema: PASS66_HIDDEN_TAB_GATE_SCHEMA,
    gate: 'pass66-real-headed-chrome-hidden-tab-admission',
    verdict: 'fail',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    executablePath,
    partialReceipt: receipt,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await browser?.close();
}
