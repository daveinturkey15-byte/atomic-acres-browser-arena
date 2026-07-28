import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.PASS65_ENDURANCE_PORT ?? '44075');
const sampleIntervalMs = Math.max(500, Number(process.env.PASS65_SAMPLE_INTERVAL_MS ?? '1000'));
const rustworksDurationMs = Math.max(10_000, Number(process.env.PASS65_RUSTWORKS_SOAK_MS ?? '45000'));
const otherArenaDurationMs = Math.max(5_000, Number(process.env.PASS65_MAP_SOAK_MS ?? '12000'));
const maximumLiveSubmissionGapMs = 250;
const maximumLiveCompletionGapMs = 500;
const maximumLivePendingMs = 750;
const requiredCaptureRecoveryCompletions = 12;
const minimumCaptureRecoveryWindowMs = 250;
const maximumCaptureRecoveryCompletionMs = 50;
const maximumLiveLongTaskEntries = 8;
const artifactRoot = 'artifacts/pass65/webgpu-endurance';
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 endurance requires PASS65_CHROME_PATH or installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedWorktreeDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
if (trackedWorktreeDirty) throw new Error('Pass 65 endurance requires a clean tracked worktree so the receipt identifies an exact source SHA');

const canonicalArenaSequence = [
  'rustworks-1v1',
  'gun-range',
  'skyline-terminal',
  'atomic-acres',
  'rustworks-1v1',
  'gun-range',
  'atomic-acres',
  'skyline-terminal',
  'rustworks-1v1',
  'rustworks-1v1',
];
const diagnosticStress = process.env.PASS65_DIAGNOSTIC_STRESS?.trim().toLowerCase() ?? '';
const skipDiagnosticCapture = process.env.PASS65_DIAGNOSTIC_SKIP_CAPTURE === '1';
const profileFirstActivation = process.env.PASS65_PROFILE_FIRST_ACTIVATION === '1';
const traceNodeBuilds = process.env.PASS65_TRACE_NODE_BUILDS === '1';
const probeBaselineWindow = process.env.PASS65_PROBE_BASELINE === '1';
const killstreakProbeMode = process.env.PASS65_KILLSTREAK_PROBE_MODE?.trim().toLowerCase() ?? 'both';
const secondActivationDelayMs = Math.max(0, Number(process.env.PASS65_SECOND_ACTIVATION_DELAY_MS ?? '0'));
if (!['both', 'chopper', 'swarm'].includes(killstreakProbeMode)) {
  throw new Error(`Unknown PASS65_KILLSTREAK_PROBE_MODE: ${killstreakProbeMode}`);
}
const diagnosticArena = process.env.PASS65_DIAGNOSTIC_ARENA?.trim() ?? '';
const diagnosticSequence = (process.env.PASS65_DIAGNOSTIC_SEQUENCE ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const canonicalArenaIds = new Set(canonicalArenaSequence);
const invalidDiagnosticArena = diagnosticSequence.find((arenaId) => !canonicalArenaIds.has(arenaId));
if (invalidDiagnosticArena) throw new Error(`Unknown PASS65_DIAGNOSTIC_SEQUENCE arena: ${invalidDiagnosticArena}`);
const diagnosticMode = diagnosticStress.length > 0 || diagnosticArena.length > 0 || diagnosticSequence.length > 0;
// Capture stays mandatory for the canonical gate. Diagnostics can explicitly
// remove compositor screenshots to separate verifier cost from gameplay cost.
const captureEnabled = !diagnosticMode || !skipDiagnosticCapture;
const enabledStress = new Set(diagnosticStress && diagnosticStress !== 'all'
  ? diagnosticStress.split(',').map((entry) => entry.trim()).filter(Boolean)
  : ['killstreak', 'grenade', 'smoke', 'weapons']);
const arenaSequence = diagnosticSequence.length > 0
  ? diagnosticSequence
  : diagnosticArena ? [diagnosticArena] : canonicalArenaSequence;
const rustworksVisitIndices = arenaSequence
  .map((arenaId, visit) => arenaId === 'rustworks-1v1' ? visit : -1)
  .filter((visit) => visit >= 0);
const doorResetProbeDetachVisit = rustworksVisitIndices.length >= 2
  ? rustworksVisitIndices[rustworksVisitIndices.length - 2]
  : -1;
const doorResetProbeRestoreVisit = rustworksVisitIndices.length >= 2
  ? rustworksVisitIndices[rustworksVisitIndices.length - 1]
  : -1;

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function fatalBrowserErrors(errors) {
  return [...new Set(errors)].filter((message) => (
    /GPUValidationError|device\s*lost|destroyed|uncaptured|WebGPU|render.*stalled|context.*lost/i.test(message)
    || !/favicon|leaderboard|Failed to fetch/i.test(message)
  ));
}

async function pauseAndDrainPresentation(page) {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.setRenderPaused(true));
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.render?.runtime?.presentation;
    return presentation && presentation.completedSequence >= presentation.submissionSequence;
  }, undefined, { timeout: 12_000 });
  const progress = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      atMs: performance.now(),
      frameCount: state.frameCount,
      presentation: state.render.runtime.presentation,
    };
  });
  if (progress.presentation.submissionSequence !== progress.presentation.completedSequence) {
    throw new Error(`Verifier failed to hold a drained WebGPU frontier: ${JSON.stringify(progress.presentation)}`);
  }
  return progress;
}

async function requireCaptureRecoveryCompletions(page, captureCompletionSequence) {
  return page.evaluate(({ baselineSequence, requiredCompletions, minimumWindowMs, maximumCompletionMs }) => (
    new Promise((resolve, reject) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      if (!api) {
        reject(new Error('Capture recovery requires the Atomic Acres debug API'));
        return;
      }
      const startedAt = performance.now();
      const timeoutAt = startedAt + 12_000;
      const consecutiveCompletions = [];
      const observations = [];
      let observedCompletionSequence = baselineSequence;
      let discardedCompletionCount = 0;

      const holdAndReject = (message) => {
        api.setRenderPaused(true);
        reject(new Error(`${message}: ${JSON.stringify({
          baselineSequence,
          observedCompletionSequence,
          consecutiveCompletions,
          discardedCompletionCount,
          observations,
        })}`));
      };
      const inspect = () => {
        const presentation = api.snapshot()?.render?.runtime?.presentation;
        if (!presentation) {
          holdAndReject('Capture recovery lost presentation telemetry');
          return;
        }
        if (presentation.status === 'device-lost' || presentation.status === 'failed'
          || presentation.status === 'stalled') {
          holdAndReject(`Capture recovery entered ${presentation.status}`);
          return;
        }
        if (presentation.completedSequence < observedCompletionSequence) {
          holdAndReject('Capture recovery completion sequence regressed');
          return;
        }
        if (presentation.completedSequence > observedCompletionSequence) {
          const advancedBy = presentation.completedSequence - observedCompletionSequence;
          const completionLatencyMs = presentation.lastCompletionLatencyMs;
          const observedAtMs = performance.now();
          const observation = {
            observedAtMs,
            completedSequence: presentation.completedSequence,
            submissionSequence: presentation.submissionSequence,
            advancedBy,
            completionLatencyMs,
            lastSubmittedAt: presentation.lastSubmittedAt,
            lastCompletedAt: presentation.lastCompletedAt,
            status: presentation.status,
          };
          observations.push(observation);
          if (observations.length > 12) observations.shift();
          observedCompletionSequence = presentation.completedSequence;

          // MAX_IN_FLIGHT_SUBMISSIONS is one. Count only an individually
          // observed game completion, never a batched frontier jump. The July
          // 29 capture-tail failure crossed the hard 250 ms submission limit
          // after a three-frame recovery, so recovery must now span that whole
          // limit and contain at least 12 ordinary <= 50 ms completions. This
          // proves sustained progress rather than one short compositor burst.
          if (advancedBy === 1
            && presentation.status === 'healthy'
            && Number.isFinite(completionLatencyMs)
            && completionLatencyMs <= maximumCompletionMs) {
            consecutiveCompletions.push(observation);
          } else {
            discardedCompletionCount += advancedBy;
            consecutiveCompletions.length = 0;
          }
          const recoveryWindowMs = consecutiveCompletions.length > 1
            ? observedAtMs - consecutiveCompletions[0].observedAtMs
            : 0;
          if (consecutiveCompletions.length >= requiredCompletions
            && recoveryWindowMs >= minimumWindowMs) {
            // Hold in the same browser task that proves the sustained window;
            // the caller then drains any already-admitted frontier.
            api.setRenderPaused(true);
            resolve({
              baselineSequence,
              requiredCompletions,
              minimumWindowMs,
              maximumCompletionMs,
              recoveryWindowMs,
              elapsedMs: performance.now() - startedAt,
              discardedCompletionCount,
              qualifyingCompletionCount: consecutiveCompletions.length,
              firstQualifyingCompletion: consecutiveCompletions[0],
              lastQualifyingCompletion: consecutiveCompletions.at(-1),
              consecutiveCompletions: consecutiveCompletions.slice(),
              observations,
            });
            return;
          }
        }
        if (performance.now() >= timeoutAt) {
          holdAndReject(`Capture recovery did not establish ${requiredCompletions} ordinary completions across ${minimumWindowMs} ms within 12 seconds`);
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    })
  ), {
    baselineSequence: captureCompletionSequence,
    requiredCompletions: requiredCaptureRecoveryCompletions,
    minimumWindowMs: minimumCaptureRecoveryWindowMs,
    maximumCompletionMs: maximumCaptureRecoveryCompletionMs,
  });
}

async function captureCanvasOnly(page, clip) {
  const captureIsolationStartedAt = Date.now();
  try {
    await page.evaluate(() => { document.documentElement.dataset.pass65CanvasOnly = 'true'; });
    // Chrome's compositor capture may occupy the same adapter queue for more
    // than a second at 2560x1440. Drain the last game submission and prevent a
    // new one from being admitted during capture so verifier work is excluded
    // from the next gameplay progress interval.
    await pauseAndDrainPresentation(page);
    const screenshot = await page.screenshot({ clip });
    const captureCompletionSequence = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime.presentation.completedSequence
    ));
    await page.evaluate(() => {
      delete document.documentElement.dataset.pass65CanvasOnly;
      window.__ATOMIC_ACRES_DEBUG__?.setRenderPaused(false);
    });
    // page.screenshot() can return while Chrome compositor work remains queued
    // on the same adapter. Require a sustained 250 ms window containing at
    // least 12 individually observed game completions at <= 50 ms before the
    // next measured interval. This quarantine does not relax the live limits.
    const recovery = await requireCaptureRecoveryCompletions(page, captureCompletionSequence);
    const progress = await pauseAndDrainPresentation(page);
    return { screenshot, progress, recovery, captureIsolationMs: Date.now() - captureIsolationStartedAt };
  } catch (error) {
    await page.evaluate(() => {
      delete document.documentElement.dataset.pass65CanvasOnly;
      window.__ATOMIC_ACRES_DEBUG__?.setRenderPaused(false);
    }).catch(() => undefined);
    throw error;
  }
}

await mkdir(artifactRoot, { recursive: true });
const server = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
});

let browser;
let page;
let activeContext = null;
let lastCompletedLiveSample = null;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify({
      schemaVersion: 1,
      slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'drone-swarm'],
    }));
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&map=rustworks-1v1&render=blender&grass=on&mist=on&seed=6501${traceNodeBuilds ? '&traceNodeBuilds=1' : ''}`);
  await page.addStyleTag({
    content: 'html[data-pass65-canvas-only="true"] body > :not(#app), html[data-pass65-canvas-only="true"] #app > :not(#game) { visibility: hidden !important; }',
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state?.bootstrap?.stage === 'ready'
      && state?.render?.runtime?.actualBackend === 'webgpu';
  }, undefined, { timeout: 60_000 });

  const arenaReceipts = [];
  const settledResidencyByArena = new Map();
  for (const [visit, arenaId] of arenaSequence.entries()) {
    activeContext = { visit, arenaId, phase: 'select-arena', sampleIndex: null };
    console.log(`[pass65-endurance] visit=${visit} arena=${arenaId} phase=select`);
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
    await page.waitForFunction((id) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.arenaSelection?.id === id
        && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
        && state?.arenaSelection?.streaming?.transition?.failure === null;
    }, arenaId, { timeout: 30_000 });
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.equipKit('marksman');
      api.startSolo();
      api.setBotsFrozen(true);
      api.setMovement(true, true);
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true
        && state?.render?.runtime?.presentation?.status === 'healthy'
        && document.querySelector('#menu')?.classList.contains('hidden');
    }, undefined, { timeout: 30_000 });
    // The former probe started as soon as the menu closed, during the three-
    // second countdown. Killstreak authority may accept an activation then, but
    // the local presentation snapshot is not advanced until active play, so the
    // measured rAF window contained no support vehicle at all. Enter the exact
    // gameplay phase whose first-live submission this gate is meant to measure.
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.matchPhase === 'active'
        && state?.render?.runtime?.presentation?.status === 'healthy';
    }, undefined, { timeout: 15_000 });
    let doorResetProbe = null;
    if (visit === doorResetProbeDetachVisit) {
      doorResetProbe = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const before = api.snapshot();
        const shed = before.interactiveWorld?.envelope?.sheds?.[0];
        if (!shed) return { phase: 'detach', accepted: false, reason: 'no-shed' };
        const accepted = api.damageShed(shed.placementId, 'door-south', 220);
        const after = api.snapshot();
        const next = after.interactiveWorld.envelope.sheds.find((entry) => entry.placementId === shed.placementId);
        return {
          phase: 'detach',
          accepted,
          placementId: shed.placementId,
          matchEpoch: next?.matchEpoch ?? null,
          doorStage: next?.surfaces.find((surface) => surface.surfaceId === 'door-south')?.stage ?? null,
        };
      });
      if (!doorResetProbe.accepted || doorResetProbe.doorStage !== 'detached') {
        throw new Error(`RustRig door-reset probe could not stage a detached door: ${JSON.stringify(doorResetProbe)}`);
      }
    } else if (visit === doorResetProbeRestoreVisit) {
      // The previous circuit deliberately left a detached, bufferless door on
      // this same arena runtime. Give its next-epoch intact replacement a full
      // presentation interval: the Three r185 stale-vertex-buffer regression
      // used to fail here, before the ordinary stress samples began.
      await page.waitForTimeout(sampleIntervalMs);
      doorResetProbe = await page.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        const shed = state.interactiveWorld?.envelope?.sheds?.[0];
        return {
          phase: 'restore',
          placementId: shed?.placementId ?? null,
          matchEpoch: shed?.matchEpoch ?? null,
          doorStage: shed?.surfaces.find((surface) => surface.surfaceId === 'door-south')?.stage ?? null,
          uncapturedErrors: state.render.runtime.uncapturedErrors,
          presentationStatus: state.render.runtime.presentation.status,
        };
      });
      if (doorResetProbe.doorStage !== 'intact'
        || doorResetProbe.uncapturedErrors !== 0
        || doorResetProbe.presentationStatus !== 'healthy') {
        throw new Error(`RustRig detached-door reset did not render safely: ${JSON.stringify(doorResetProbe)}`);
      }
    }
    let activationProfiler = null;
    if (profileFirstActivation && visit === 0 && (enabledStress.has('killstreak') || probeBaselineWindow)) {
      activationProfiler = await page.context().newCDPSession(page);
      await activationProfiler.send('Profiler.enable');
      await activationProfiler.send('Profiler.setSamplingInterval', { interval: 100 });
      await activationProfiler.send('Profiler.start');
    }
    if (enabledStress.has('killstreak')) {
      // Entitlement is earned before a real player presses the support key.
      // Stage the synthetic QA eliminations outside the measured activation
      // window and drain their snapshot/HUD projection first.
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
      await page.waitForFunction(() => {
        const available = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.fieldSupport?.available;
        return available?.chopper === true && available?.['drone-swarm'] === true;
      }, undefined, { timeout: 5_000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    const killstreakActivationProbe = await page.evaluate(async ({ activate, probe, mode, secondDelayMs }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      if (!probe) return {
        skipped: true,
        activations: { chopper: null, droneSwarm: null },
      };
      api.resetPresentationProgressWindow();
      const before = api.snapshot();
      return new Promise((resolve) => {
        const frameGapsMs = [];
        const frameGapDetails = [];
        const callbackDelayDetails = [];
        const longTasks = [];
        const longTaskObserver = typeof PerformanceObserver === 'function'
          ? new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
              }
            })
          : null;
        longTaskObserver?.observe({ entryTypes: ['longtask'] });
        let previousRafAt = 0;
        let activationStartedAt = 0;
        let activationCallMs = 0;
        let activations = { chopper: null, droneSwarm: null };
        let settled = false;
        let fallbackTimer = 0;
        const finish = (finishReason) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(fallbackTimer);
          longTaskObserver?.disconnect();
          const after = api.snapshot();
          const elapsedMs = Math.max(1, performance.now() - activationStartedAt);
          resolve({
            skipped: false,
            finishReason,
            activations,
            matchPhaseBefore: before.matchPhase,
            matchPhaseAfter: after.matchPhase,
            supportProjection: {
              choppers: after.killstreak.entities.filter((entity) => entity.kind === 'chopper').length,
              swarmAuthorityEntities: after.killstreak.entities
                .filter((entity) => entity.kind === 'drone' && entity.mode === 'swarm').length,
              swarmRenderedInstances: after.killstreakPresentation.swarmRenderedInstances,
              swarmVisibleRenderBatches: after.killstreakPresentation.swarmVisibleRenderBatches,
              swarmRenderBatches: after.killstreakPresentation.swarmRenderBatches,
              swarmMinimumRenderedInstances: after.killstreakPresentation.swarmMinimumRenderedInstances,
              swarmMaximumRenderedInstances: after.killstreakPresentation.swarmMaximumRenderedInstances,
            },
            activationCallMs,
            elapsedMs,
            sampledFrames: frameGapsMs.length,
            maxFrameGapMs: frameGapsMs.length > 0 ? Math.max(...frameGapsMs) : null,
            largestFrameGaps: [...frameGapDetails]
              .sort((left, right) => right.gapMs - left.gapMs)
              .slice(0, 8),
            maximumCallbackDelayMs: callbackDelayDetails.length > 0
              ? Math.max(...callbackDelayDetails.map((entry) => entry.delayMs))
              : null,
            largestCallbackDelays: [...callbackDelayDetails]
              .sort((left, right) => right.delayMs - left.delayMs)
              .slice(0, 8),
            longTasks,
            frameDelta: after.frameCount - before.frameCount,
            submissionDelta: after.render.runtime.presentation.submissionSequence
              - before.render.runtime.presentation.submissionSequence,
            completionDelta: after.render.runtime.presentation.completedSequence
              - before.render.runtime.presentation.completedSequence,
            presentation: after.render.runtime.presentation,
            uncapturedErrors: after.render.runtime.uncapturedErrors,
          });
        };
        const sampleFrame = (now) => {
          const callbackDelayMs = Math.max(0, performance.now() - now);
          const gapMs = now - previousRafAt;
          frameGapsMs.push(gapMs);
          frameGapDetails.push({ gapMs, atMs: now, offsetMs: now - activationStartedAt });
          callbackDelayDetails.push({ delayMs: callbackDelayMs, atMs: now, offsetMs: now - activationStartedAt });
          previousRafAt = now;
          if (now - activationStartedAt >= 2_000) finish('raf-window');
          else requestAnimationFrame(sampleFrame);
        };
        requestAnimationFrame((now) => {
          previousRafAt = now;
          activationStartedAt = performance.now();
          const callStartedAt = performance.now();
          if (activate) {
            activations = {
              chopper: mode === 'swarm' ? null : api.activateKillstreak('chopper'),
              droneSwarm: mode === 'chopper' || (mode === 'both' && secondDelayMs > 0)
                ? null
                : api.activateKillstreak('drone-swarm'),
            };
            if (mode === 'both' && secondDelayMs > 0) window.setTimeout(() => {
              activations = { ...activations, droneSwarm: api.activateKillstreak('drone-swarm') };
            }, secondDelayMs);
          }
          activationCallMs = performance.now() - callStartedAt;
          requestAnimationFrame(sampleFrame);
        });
        fallbackTimer = window.setTimeout(() => finish('timeout'), 3_500);
      });
    }, {
      activate: enabledStress.has('killstreak'),
      probe: enabledStress.has('killstreak') || probeBaselineWindow,
      mode: killstreakProbeMode,
      secondDelayMs: secondActivationDelayMs,
    });
    if (activationProfiler) {
      const { profile } = await activationProfiler.send('Profiler.stop');
      await activationProfiler.detach();
      await writeFile(`${artifactRoot}/activation-cpu-profile.json`, `${JSON.stringify(profile)}\n`, 'utf8');
    }
    const killstreakStress = killstreakActivationProbe.activations;
    if (enabledStress.has('killstreak')
      && ((killstreakProbeMode !== 'swarm' && !killstreakStress.chopper)
        || (killstreakProbeMode !== 'chopper' && !killstreakStress.droneSwarm))) {
      throw new Error(`${arenaId} could not stage the requested ${killstreakProbeMode} support stress: ${JSON.stringify(killstreakStress)}`);
    }
    if (enabledStress.has('killstreak')) {
      const minimumActivationProgress = Math.max(4, Math.floor(killstreakActivationProbe.elapsedMs / 100));
      const projection = killstreakActivationProbe.supportProjection;
      const completeRequestedChopper = killstreakProbeMode === 'swarm' || projection.choppers >= 1;
      const completeRequestedSwarm = killstreakProbeMode === 'chopper' || (
        projection.swarmAuthorityEntities === 24
        && projection.swarmRenderedInstances === 24
        && projection.swarmVisibleRenderBatches === projection.swarmRenderBatches
        && projection.swarmMinimumRenderedInstances === 24
        && projection.swarmMaximumRenderedInstances === 24
      );
      if (killstreakActivationProbe.finishReason !== 'raf-window'
        || killstreakActivationProbe.matchPhaseBefore !== 'active'
        || killstreakActivationProbe.matchPhaseAfter !== 'active'
        || !completeRequestedChopper
        || !completeRequestedSwarm
        || killstreakActivationProbe.sampledFrames < minimumActivationProgress
        || killstreakActivationProbe.frameDelta < minimumActivationProgress
        || killstreakActivationProbe.submissionDelta < minimumActivationProgress
        || killstreakActivationProbe.completionDelta < 1
        || killstreakActivationProbe.maxFrameGapMs > 100
        || killstreakActivationProbe.maximumCallbackDelayMs > 100
        || killstreakActivationProbe.longTasks.length > 0
        || killstreakActivationProbe.presentation.status !== 'healthy'
        || killstreakActivationProbe.presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs
        || killstreakActivationProbe.presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs
        || killstreakActivationProbe.presentation.progress.maximumPendingForMs > maximumLivePendingMs
        || killstreakActivationProbe.uncapturedErrors !== 0) {
        throw new Error(`${arenaId} killstreak first activation stalled presentation: ${JSON.stringify({ minimumActivationProgress, killstreakActivationProbe })}`);
      }
    }
    if (enabledStress.has('killstreak')) await page.waitForFunction((mode) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const entities = state?.killstreak?.entities ?? [];
      const presentation = state?.killstreakPresentation;
      return (mode === 'swarm' || entities.some((entity) => entity.kind === 'chopper'))
        && (mode === 'chopper' || (
          entities.filter((entity) => entity.kind === 'drone' && entity.mode === 'swarm').length === 24
          && presentation?.swarmRenderedInstances === 24
          && presentation?.swarmVisibleRenderBatches === presentation?.swarmRenderBatches
          && presentation?.swarmMinimumRenderedInstances === 24
          && presentation?.swarmMaximumRenderedInstances === 24
        ));
    }, killstreakProbeMode, { timeout: 5_000 });
    const activeStressBudget = enabledStress.has('killstreak')
      ? await page.evaluate(async () => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const performanceSample = await api.sampleArenaPerformanceBudget();
        const state = api.snapshot();
        return {
          performanceSample,
          budgetAudit: state.render.playableScene.budgetAudit,
          residency: api.sampleRendererResidency(),
        };
      })
      : null;
    if (activeStressBudget && activeStressBudget.budgetAudit.pass !== true) {
      throw new Error(`${arenaId} exceeded its live chopper plus drone-swarm budget: ${JSON.stringify(activeStressBudget)}`);
    }
    const canvasClip = captureEnabled ? await page.locator('#game').boundingBox() : null;
    if (captureEnabled && (!canvasClip || canvasClip.width <= 0 || canvasClip.height <= 0)) {
      throw new Error(`${arenaId} gameplay canvas has no capture bounds`);
    }

    const durationMs = arenaId === 'rustworks-1v1' ? rustworksDurationMs : otherArenaDurationMs;
    const startedAt = Date.now();
    const samples = [];
    const screenshotHashes = new Set();
    let previousScreenshotHash = null;
    let sampleIndex = 0;
    let lastScreenshot = null;
    await pauseAndDrainPresentation(page);
    while (Date.now() - startedAt < durationMs) {
      activeContext = { visit, arenaId, phase: 'sample', sampleIndex };
      const liveWindowStart = await page.evaluate(({ index, stress, maximumLongTaskEntries }) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const held = api.snapshot().render.runtime.presentation;
        if (held.submissionSequence !== held.completedSequence) {
          throw new Error(`Live sample did not begin from a drained frontier: ${JSON.stringify(held)}`);
        }
        api.resetPresentationProgressWindow();
        const liveLongTaskEvidence = {
          supported: false,
          count: 0,
          totalDurationMs: 0,
          maximumDurationMs: 0,
          entries: [],
          truncated: false,
        };
        let liveLongTaskObserver = null;
        const recordLiveLongTasks = (entries) => {
          liveLongTaskEvidence.supported = true;
          for (const entry of entries) {
            const evidence = {
              startTime: entry.startTime,
              duration: entry.duration,
              name: entry.name,
            };
            liveLongTaskEvidence.count += 1;
            liveLongTaskEvidence.totalDurationMs += entry.duration;
            liveLongTaskEvidence.maximumDurationMs = Math.max(
              liveLongTaskEvidence.maximumDurationMs,
              entry.duration,
            );
            if (liveLongTaskEvidence.entries.length < maximumLongTaskEntries) {
              liveLongTaskEvidence.entries.push(evidence);
            } else liveLongTaskEvidence.truncated = true;
          }
        };
        if (typeof PerformanceObserver === 'function') {
          try {
            liveLongTaskObserver = new PerformanceObserver((list) => recordLiveLongTasks(list.getEntries()));
            liveLongTaskObserver.observe({ type: 'longtask', buffered: false });
            liveLongTaskEvidence.supported = true;
          } catch {
            liveLongTaskObserver = null;
          }
        }
        window.__PASS65_ENDURANCE_LIVE_LONG_TASK_SAMPLE__ = {
          evidence: liveLongTaskEvidence,
          observer: liveLongTaskObserver,
          recordEntries: recordLiveLongTasks,
        };
        const state = api.snapshot();
        const [x, y, z] = state.player.position;
        api.setCaptureCameraPose(x, y, z, (index * 0.31) % (Math.PI * 2), Math.sin(index * 0.37) * 0.08);
        if (index % 4 === 0) {
          if (stress.grenade) {
            api.setGrenades(1);
            api.throwGrenade();
          }
          if (stress.smoke) {
            api.stageSmokeVolume(2.5);
            api.stageSmokeVolume(3.5);
            api.stageSmokeVolume(4.5);
          }
        }
        if (stress.weapons && index % 5 === 1) {
          api.equipWeapon('explosive-crossbow');
          api.fireOnce();
        } else if (stress.weapons && index % 5 === 3) {
          api.equipWeapon('m14-ebr');
          api.setAds(true);
          api.fireOnce();
        } else api.setAds(false);
        if (index % 7 === 2) {
          for (const [shedIndex, shed] of (state.interactiveWorld?.envelope?.sheds ?? []).slice(0, 2).entries()) {
            api.damageShed(shed.placementId, shedIndex === 0 ? 'wall-west' : 'wall-east', 220);
          }
        }
        api.setRenderPaused(false);
        const started = api.snapshot();
        return {
          atMs: performance.now(),
          frameCount: started.frameCount,
          presentation: started.render.runtime.presentation,
        };
      }, {
        index: sampleIndex,
        stress: {
          grenade: enabledStress.has('grenade'),
          smoke: enabledStress.has('smoke'),
          weapons: enabledStress.has('weapons'),
        },
        maximumLongTaskEntries: maximumLiveLongTaskEntries,
      });
      await page.waitForTimeout(sampleIntervalMs);

      const sample = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const longTaskSample = window.__PASS65_ENDURANCE_LIVE_LONG_TASK_SAMPLE__;
        if (longTaskSample?.observer) {
          longTaskSample.recordEntries(longTaskSample.observer.takeRecords());
        }
        longTaskSample?.observer?.disconnect();
        delete window.__PASS65_ENDURANCE_LIVE_LONG_TASK_SAMPLE__;
        const state = api.snapshot();
        return {
          atMs: performance.now(),
          frameCount: state.frameCount,
          gameStarted: state.gameStarted,
          arenaId: state.arenaSelection.id,
          transition: state.arenaSelection.streaming.transition,
          runtime: state.render.runtime,
          watchdog: state.render.playableScene.renderWatchdog,
          gpuRetirement: state.interactiveWorld.gpuRetirement,
          killstreak: {
            revision: state.killstreak.revision,
            entities: state.killstreak.entities.map((entity) => ({
              kind: entity.kind,
              mode: entity.mode,
              phase: entity.phase,
            })),
          },
          grenadeWorldPool: state.grenadeVisual.pool,
          smokePresentation: state.dmrThermal.smokePresentation,
          weaponCatalog: state.weaponPresentation.browserWeaponCatalog,
          liveLongTasks: longTaskSample?.evidence ?? {
            supported: false,
            count: 0,
            totalDurationMs: 0,
            maximumDurationMs: 0,
            entries: [],
            truncated: false,
          },
          residency: api.sampleRendererResidency(),
        };
      });
      if (!sample.gameStarted || sample.arenaId !== arenaId
        || sample.transition.phase !== 'idle' || sample.transition.failure !== null || sample.transition.renderSubmissionPaused
        || sample.runtime.actualBackend !== 'webgpu' || sample.runtime.deviceLost
        || sample.runtime.uncapturedErrors !== 0
        || sample.runtime.presentation.status !== 'healthy'
        || sample.runtime.presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs
        || sample.runtime.presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs
        || sample.runtime.presentation.progress.maximumPendingForMs > maximumLivePendingMs
        || sample.watchdog.status !== 'healthy' || sample.watchdog.fatal
        || sample.gpuRetirement.failures !== 0
        || sample.grenadeWorldPool.exhaustions !== 0
        || sample.grenadeWorldPool.prewarmBlockedAcquisitions !== 0
        || sample.smokePresentation.liveDisposals !== 0
        || sample.weaponCatalog.prewarming
        || sample.weaponCatalog.unpreparedSwitches !== 0
        || sample.weaponCatalog.retainedCount > sample.weaponCatalog.maximumRetained
        || sample.weaponCatalog.loaded > sample.weaponCatalog.maximumRetained) {
        throw new Error(`${arenaId} entered an invalid presentation state: ${JSON.stringify(sample)}`);
      }
      // Measure each interval from its own paused+drained frontier. Reset occurs
      // before gameplay actions, so any real smoke/crossbow/support hitch still
      // counts; only Node and compositor capture work is excluded.
      const elapsedMs = Math.max(1, sample.atMs - liveWindowStart.atMs);
      const frameDelta = sample.frameCount - liveWindowStart.frameCount;
      const submissionDelta = sample.runtime.presentation.submissionSequence - liveWindowStart.presentation.submissionSequence;
      const completionDelta = sample.runtime.presentation.completedSequence - liveWindowStart.presentation.completedSequence;
      const minimumFrameProgress = Math.max(4, Math.floor(elapsedMs / 100));
      const capture = captureEnabled
        ? await captureCanvasOnly(page, canvasClip)
        : {
            screenshot: null,
            progress: await pauseAndDrainPresentation(page),
            recovery: null,
            captureIsolationMs: 0,
          };
      lastScreenshot = capture.screenshot;
      const screenshotHash = lastScreenshot ? digest(lastScreenshot) : null;
      if (screenshotHash) screenshotHashes.add(screenshotHash);
      // A WebGPU completion probe retires the entire queue frontier, so its
      // sequence advances in batches rather than once per rendered frame.
      // Measure display throughput from admitted submissions; queue stalls
      // remain hard failures through the presentation status above.
      if (frameDelta < minimumFrameProgress || submissionDelta < minimumFrameProgress
        || (captureEnabled && screenshotHash === previousScreenshotHash)) {
        throw new Error(`${arenaId} presentation freeze detected: ${JSON.stringify({
          elapsedMs, frameDelta, submissionDelta, completionDelta, screenshotHash,
          liveWindowStart, previousReceipt: samples.at(-1) ?? null,
        })}`);
      }
      const receipt = {
        ...sample,
        liveWindowStart,
        screenshotHash,
        verifierCaptureIsolationMs: capture.captureIsolationMs,
        verifierCaptureRecovery: capture.recovery,
        verifierHeldFrontier: capture.progress,
      };
      samples.push(receipt);
      // Preserve a deliberately bounded cross-scope breadcrumb. If the next
      // live interval fails, arena-local `samples` is no longer reachable from
      // the outer catch; retaining the whole receipt would duplicate runtime,
      // residency, weapon and killstreak graphs into the failure artifact.
      lastCompletedLiveSample = {
        visit,
        arenaId,
        sampleIndex,
        liveMetrics: {
          atMs: sample.atMs,
          frameCount: sample.frameCount,
          elapsedMs,
          frameDelta,
          submissionDelta,
          completionDelta,
          minimumFrameProgress,
          screenshotHash,
          presentation: {
            status: sample.runtime.presentation.status,
            submissionSequence: sample.runtime.presentation.submissionSequence,
            completedSequence: sample.runtime.presentation.completedSequence,
            pendingForMs: sample.runtime.presentation.pendingForMs,
            lastCompletionLatencyMs: sample.runtime.presentation.lastCompletionLatencyMs,
            progress: {
              elapsedMs: sample.runtime.presentation.progress.elapsedMs,
              submissionAdvances: sample.runtime.presentation.progress.submissionAdvances,
              completionAdvances: sample.runtime.presentation.progress.completionAdvances,
              submittedHz: sample.runtime.presentation.progress.submittedHz,
              completedHz: sample.runtime.presentation.progress.completedHz,
              maximumSubmissionGapMs: sample.runtime.presentation.progress.maximumSubmissionGapMs,
              maximumCompletionGapMs: sample.runtime.presentation.progress.maximumCompletionGapMs,
              maximumPendingForMs: sample.runtime.presentation.progress.maximumPendingForMs,
            },
          },
        },
        verifierCaptureRecovery: capture.recovery ? {
          baselineSequence: capture.recovery.baselineSequence,
          requiredCompletions: capture.recovery.requiredCompletions,
          minimumWindowMs: capture.recovery.minimumWindowMs,
          maximumCompletionMs: capture.recovery.maximumCompletionMs,
          recoveryWindowMs: capture.recovery.recoveryWindowMs,
          elapsedMs: capture.recovery.elapsedMs,
          discardedCompletionCount: capture.recovery.discardedCompletionCount,
          qualifyingCompletionCount: capture.recovery.qualifyingCompletionCount,
          firstQualifyingCompletion: capture.recovery.firstQualifyingCompletion,
          lastQualifyingCompletion: capture.recovery.lastQualifyingCompletion,
          observations: capture.recovery.observations.slice(-12),
        } : null,
        verifierHeldFrontier: {
          atMs: capture.progress.atMs,
          frameCount: capture.progress.frameCount,
          presentation: {
            status: capture.progress.presentation.status,
            submissionSequence: capture.progress.presentation.submissionSequence,
            completedSequence: capture.progress.presentation.completedSequence,
            pendingForMs: capture.progress.presentation.pendingForMs,
            lastCompletionLatencyMs: capture.progress.presentation.lastCompletionLatencyMs,
          },
        },
        liveLongTasks: sample.liveLongTasks,
      };
      if (captureEnabled) previousScreenshotHash = screenshotHash;
      sampleIndex += 1;
    }
    if (samples.length < 5
      || (captureEnabled && screenshotHashes.size < Math.ceil(samples.length * 0.8))) {
      throw new Error(`${arenaId} did not produce enough distinct live presentation samples`);
    }
    if (captureEnabled && lastScreenshot) {
      await writeFile(`${artifactRoot}/${visit}-${arenaId}-final.png`, lastScreenshot);
    }
    const beforeReturn = samples.at(-1);
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setRenderPaused(false);
      api.setAds(false);
      api.setMovement(false);
      api.setCaptureCameraPose(null);
      api.returnToMainMenu();
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === false && !document.querySelector('#menu')?.classList.contains('hidden');
    }, undefined, { timeout: 20_000 });
    await page.waitForFunction(() => {
      const gpu = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.interactiveWorld?.gpuRetirement;
      return gpu?.queuedResources === 0
        && gpu?.queuedRoots === 0
        && gpu?.queuedGeometries === 0
        && gpu?.draining === false
        && gpu?.scheduledRoots === gpu?.disposedRoots
        && gpu?.scheduledGeometries === gpu?.disposedGeometries;
    }, undefined, { timeout: 20_000 });
    const afterReturn = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api.snapshot();
      return {
        frameCount: state.frameCount,
        runtime: state.render.runtime,
        gpuRetirement: state.interactiveWorld.gpuRetirement,
        pendingSupportRoots: state.fieldSupport.pendingRetiredPresentationRoots,
        grenadeWorldPool: state.grenadeVisual.pool,
        smokePresentation: state.dmrThermal.smokePresentation,
        residency: api.sampleRendererResidency(),
      };
    });
    if (afterReturn.runtime.presentation.status !== 'healthy'
      || afterReturn.runtime.uncapturedErrors !== 0
      || afterReturn.gpuRetirement.failures !== 0
      || afterReturn.gpuRetirement.queuedResources !== 0
      || afterReturn.gpuRetirement.draining
      || afterReturn.gpuRetirement.scheduledRoots !== afterReturn.gpuRetirement.disposedRoots
      || afterReturn.gpuRetirement.scheduledGeometries !== afterReturn.gpuRetirement.disposedGeometries
      || afterReturn.pendingSupportRoots !== 0
      || afterReturn.grenadeWorldPool.active !== 0
      || afterReturn.grenadeWorldPool.exhaustions !== 0
      || afterReturn.grenadeWorldPool.prewarmBlockedAcquisitions !== 0
      || afterReturn.smokePresentation.liveDisposals !== 0
      || afterReturn.smokePresentation.active !== 0) {
      throw new Error(`${arenaId} menu return did not retire presentation safely: ${JSON.stringify(afterReturn)}`);
    }
    const priorSettled = settledResidencyByArena.get(arenaId);
    if (priorSettled && priorSettled.visit === visit - 1) {
      const geometryTolerance = priorSettled.residency.totalGeometryBytes * 0.03 + 1_048_576;
      const textureTolerance = priorSettled.residency.totalTextureBytes * 0.03 + 1_048_576;
      if (afterReturn.residency.totalGeometryBytes > priorSettled.residency.totalGeometryBytes + geometryTolerance
        || afterReturn.residency.totalTextureBytes > priorSettled.residency.totalTextureBytes + textureTolerance
        || afterReturn.residency.activeGeometries > priorSettled.residency.activeGeometries + 8
        || afterReturn.residency.activeTextures > priorSettled.residency.activeTextures + 4) {
        throw new Error(`${arenaId} renderer residency did not plateau across a canonical revisit: ${JSON.stringify({ priorSettled, afterReturn })}`);
      }
    }
    settledResidencyByArena.set(arenaId, { visit, residency: afterReturn.residency });
    arenaReceipts.push({
      visit,
      arenaId,
      requestedDurationMs: durationMs,
      actualDurationMs: samples.at(-1).atMs - samples[0].atMs,
      killstreakStress,
      killstreakActivationProbe,
      activeStressBudget,
      doorResetProbe,
      samples: samples.length,
      captureEnabled,
      distinctScreenshots: screenshotHashes.size,
      first: samples[0],
      last: beforeReturn,
      afterReturn,
    });
    console.log(`[pass65-endurance] visit=${visit} arena=${arenaId} samples=${samples.length} result=pass`);
  }

  const uniqueErrors = fatalBrowserErrors(errors);
  if (uniqueErrors.length > 0) throw new Error(`Pass 65 endurance emitted browser/GPU errors: ${uniqueErrors[0]}`);
  const output = {
    gate: diagnosticMode ? 'pass65-webgpu-presentation-endurance-diagnostic' : 'pass65-webgpu-presentation-endurance',
    verdict: 'pass',
    sourceRevision,
    browserExecutable: executablePath,
    browserVersion: browser.version(),
    adapter: arenaReceipts[0]?.first?.runtime ? {
      label: arenaReceipts[0].first.runtime.adapterLabel,
      adapterClass: arenaReceipts[0].first.runtime.adapterClass,
      deviceClass: arenaReceipts[0].first.runtime.deviceClass,
      softwareAdapter: arenaReceipts[0].first.runtime.softwareAdapter,
    } : null,
    viewport: [2560, 1440],
    sampleIntervalMs,
    maximumLiveSubmissionGapMs,
    maximumLiveCompletionGapMs,
    maximumLivePendingMs,
    requiredCaptureRecoveryCompletions,
    minimumCaptureRecoveryWindowMs,
    maximumCaptureRecoveryCompletionMs,
    maximumLiveLongTaskEntries,
    rustworksDurationMs,
    otherArenaDurationMs,
    arenaSequence,
    captureEnabled,
    skipDiagnosticCapture,
    enabledStress: [...enabledStress],
    killstreakProbeMode,
    secondActivationDelayMs,
    browserErrors: [...new Set(errors)],
    arenaReceipts,
  };
  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (endingRevision !== sourceRevision || endingStatus.length > 0) {
    throw new Error(`Pass 65 endurance source changed during the run: ${JSON.stringify({ sourceRevision, endingRevision, endingStatus })}`);
  }
  const receiptName = diagnosticMode
    ? `diagnostic-${[diagnosticArena || diagnosticSequence.join('_') || 'canonical', ...enabledStress].join('-')}.json`
    : 'exact-sha-receipt.json';
  await writeFile(`${artifactRoot}/${receiptName}`, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  let state = null;
  try {
    state = await page?.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot() ?? null);
  } catch {
    // The renderer may have already failed closed; the browser errors remain evidence.
  }
  const failure = {
    gate: 'pass65-webgpu-presentation-endurance',
    verdict: 'fail',
    sourceRevision,
    activeContext,
    lastCompletedLiveSample,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    browserErrors: [...new Set(errors)],
    state,
  };
  await writeFile(`${artifactRoot}/failure-receipt.json`, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  if (captureEnabled) {
    try {
      await page?.screenshot({ path: `${artifactRoot}/failure.png` });
    } catch {
      // The JSON receipt remains authoritative if the page itself is unavailable.
    }
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
