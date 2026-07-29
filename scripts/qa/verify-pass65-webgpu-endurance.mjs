import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { isFatalWebGpuConsoleWarning } from './pass65-browser-console-contract.mjs';
import {
  auditVerifierBoundaryOwnWork,
  maximumVerifierBoundaryP99Ms,
  maximumVerifierOwnedTaskMs,
} from './pass65-endurance-verifier-contract.mjs';

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
const requiredLifecycleRecoveryCyclesPerVisit = 2;
const minimumVisualEvidenceFrames = 5;
const minimumVisualEvidenceDistinctRatio = 0.8;
const visualEvidencePoses = [
  { id: 'forward-low', yaw: 0, pitch: -0.08 },
  { id: 'quarter-right-high', yaw: Math.PI * 0.4, pitch: 0.06 },
  { id: 'rear-right-low', yaw: Math.PI * 0.8, pitch: -0.04 },
  { id: 'rear-left-high', yaw: Math.PI * 1.2, pitch: 0.08 },
  { id: 'quarter-left-level', yaw: Math.PI * 1.6, pitch: 0 },
];
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

function summarizeHeldFrontier(frontier) {
  return {
    atMs: frontier.atMs,
    frameCount: frontier.frameCount,
    presentation: {
      status: frontier.presentation.status,
      submissionSequence: frontier.presentation.submissionSequence,
      completedSequence: frontier.presentation.completedSequence,
      pendingForMs: frontier.presentation.pendingForMs,
      lastCompletionLatencyMs: frontier.presentation.lastCompletionLatencyMs,
    },
  };
}

function summarizeCaptureRecovery(recovery) {
  if (!recovery) return null;
  return {
    baselineSequence: recovery.baselineSequence,
    requiredCompletions: recovery.requiredCompletions,
    minimumWindowMs: recovery.minimumWindowMs,
    maximumCompletionMs: recovery.maximumCompletionMs,
    recoveryWindowMs: recovery.recoveryWindowMs,
    elapsedMs: recovery.elapsedMs,
    discardedCompletionCount: recovery.discardedCompletionCount,
    qualifyingCompletionCount: recovery.qualifyingCompletionCount,
    firstQualifyingCompletion: recovery.firstQualifyingCompletion,
    lastQualifyingCompletion: recovery.lastQualifyingCompletion,
    observations: recovery.observations.slice(-12),
  };
}

async function pauseAndDrainPresentation(page) {
  const progress = await page.evaluate(() => new Promise((resolve, reject) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    if (!api) {
      reject(new Error('Presentation drain requires the Atomic Acres debug API'));
      return;
    }
    const timeoutAt = performance.now() + 12_000;
    let lastPresentation = null;
    api.setRenderPaused(true);
    const inspect = () => {
      const state = api.snapshot();
      lastPresentation = state.render.runtime.presentation;
      if (lastPresentation.completedSequence >= lastPresentation.submissionSequence) {
        // Resolve with the same snapshot that first proves equality. A second
        // Node/browser round trip while intentionally paused would inflate the
        // time-decaying gap telemetry with verifier time.
        resolve({
          atMs: performance.now(),
          frameCount: state.frameCount,
          presentation: lastPresentation,
        });
        return;
      }
      if (performance.now() >= timeoutAt) {
        reject(new Error(`Presentation drain timed out: ${JSON.stringify(lastPresentation)}`));
        return;
      }
      requestAnimationFrame(inspect);
    };
    inspect();
  }));
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

async function runPilotedDroneWorkflow(page, arenaId) {
  if (arenaId === 'gun-range') return { skipped: true, reason: 'field-support-disabled-in-gun-range' };
  const result = await page.evaluate(async ({ submissionLimitMs, completionLimitMs, pendingLimitMs }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const waitFor = (read, label, timeoutMs = 7_500) => new Promise((resolve, reject) => {
      const timeoutAt = performance.now() + timeoutMs;
      const inspect = () => {
        const value = read();
        if (value) resolve(value);
        else if (performance.now() >= timeoutAt) reject(new Error(`Piloted drone ${label} timed out`));
        else requestAnimationFrame(inspect);
      };
      inspect();
    });
    const waitDuration = (durationMs) => new Promise((resolve) => {
      const endsAt = performance.now() + durationMs;
      const inspect = () => performance.now() >= endsAt ? resolve() : requestAnimationFrame(inspect);
      requestAnimationFrame(inspect);
    });
    const localActor = (state) => state.killstreak.actors[0] ?? null;
    const ownedDrone = (state) => state.killstreak.entities.find((entity) => (
      entity.kind === 'drone' && entity.mode === 'piloted' && entity.ownerId === localActor(state)?.actorId
    ));
    const longTasks = [];
    const observer = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
        })
      : null;
    observer?.observe({ type: 'longtask', buffered: false });
    api.setMovement(false);
    api.resetPresentationProgressWindow();
    const before = api.snapshot();
    const keyName = {
      KeyW: 'w', KeyS: 's', KeyD: 'd', KeyA: 'a', Space: ' ', ControlLeft: 'Control',
    };
    const dispatchKey = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
      code, key: keyName[code], bubbles: true, cancelable: true,
    }));
    const releaseAll = () => {
      for (const code of Object.keys(keyName)) dispatchKey('keyup', code);
      api.setTriggerHeld(false);
    };
    try {
      api.activateSupport('piloted-drone');
      const activatedState = await waitFor(() => {
        const state = api.snapshot();
        return ownedDrone(state) ? state : null;
      }, 'activation');
      const activated = ownedDrone(activatedState);
      const possessionAccepted = api.togglePilotedDroneControl(activated.id);
      const possessedState = await waitFor(() => {
        const state = api.snapshot();
        const actor = localActor(state);
        return actor?.possession?.kind === 'piloted-drone' && actor.possession.entityId === activated.id
          && document.documentElement.dataset.killstreakPossession === 'piloted-drone'
          ? state : null;
      }, 'possession');
      const possessionProof = {
        kind: localActor(possessedState)?.possession?.kind ?? null,
        documentDataset: document.documentElement.dataset.killstreakPossession,
        hudVisible: document.querySelector('#support-combat-feedback')?.hidden === false,
      };
      const phase = async (code, expectedAxis, fire = false) => {
        const phaseBeforeState = api.snapshot();
        const phaseBefore = ownedDrone(phaseBeforeState);
        if (fire) api.setTriggerHeld(true);
        dispatchKey('keydown', code);
        await waitDuration(260);
        dispatchKey('keyup', code);
        if (fire) api.setTriggerHeld(false);
        await waitDuration(80);
        const phaseAfterState = api.snapshot();
        const phaseAfter = ownedDrone(phaseAfterState);
        const displacement = phaseAfter.position.map((value, index) => value - phaseBefore.position[index]);
        const yaw = phaseBefore.attitude[1];
        const forward = [-Math.sin(yaw), 0, -Math.cos(yaw)];
        const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
        const projection = expectedAxis === 'forward' ? displacement[0] * forward[0] + displacement[2] * forward[2]
          : expectedAxis === 'backward' ? -(displacement[0] * forward[0] + displacement[2] * forward[2])
            : expectedAxis === 'right' ? displacement[0] * right[0] + displacement[2] * right[2]
              : expectedAxis === 'left' ? -(displacement[0] * right[0] + displacement[2] * right[2])
                : expectedAxis === 'up' ? displacement[1] : -displacement[1];
        return {
          code,
          expectedAxis,
          before: phaseBefore.position,
          after: phaseAfter.position,
          displacement,
          projection,
          revisionDelta: phaseAfter.revision - phaseBefore.revision,
          magazineBefore: phaseBefore.magazine,
          magazineAfter: phaseAfter.magazine,
        };
      };
      const controls = [];
      controls.push(await phase('KeyW', 'forward', true));
      controls.push(await phase('KeyS', 'backward'));
      controls.push(await phase('KeyD', 'right'));
      controls.push(await phase('KeyA', 'left'));
      controls.push(await phase('Space', 'up'));
      controls.push(await phase('ControlLeft', 'down'));
      releaseAll();
      const beforeExitState = api.snapshot();
      const beforeExit = ownedDrone(beforeExitState);
      const exitAccepted = api.togglePilotedDroneControl(activated.id);
      const exitedState = await waitFor(() => {
        const state = api.snapshot();
        const actor = localActor(state);
        return actor?.possession === null && document.documentElement.dataset.killstreakPossession === 'none'
          ? state : null;
      }, 'exit');
      await waitDuration(450);
      const after = api.snapshot();
      const afterExit = ownedDrone(after);
      const autonomousDisplacementM = Math.hypot(...afterExit.position.map((value, index) => value - beforeExit.position[index]));
      for (const entry of observer?.takeRecords() ?? []) {
        longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
      }
      observer?.disconnect();
      api.setMovement(true, true);
      return {
        skipped: false,
        possessionAccepted,
        exitAccepted,
        entityId: activated.id,
        spawn: activated.position,
        possessed: possessionProof,
        controls,
        firedRounds: Math.max(0, controls[0].magazineBefore - controls[0].magazineAfter),
        autonomousDisplacementM,
        afterExitPosition: afterExit.position,
        frameDelta: after.frameCount - before.frameCount,
        submissionDelta: after.render.runtime.presentation.submissionSequence - before.render.runtime.presentation.submissionSequence,
        completionDelta: after.render.runtime.presentation.completedSequence - before.render.runtime.presentation.completedSequence,
        longTasks,
        presentation: after.render.runtime.presentation,
        deviceLost: after.render.runtime.deviceLost,
        uncapturedErrors: after.render.runtime.uncapturedErrors,
        exited: localActor(exitedState)?.possession === null,
        thresholds: { submissionLimitMs, completionLimitMs, pendingLimitMs },
      };
    } catch (error) {
      releaseAll();
      api.setMovement(true, true);
      observer?.disconnect();
      throw error;
    }
  }, {
    submissionLimitMs: maximumLiveSubmissionGapMs,
    completionLimitMs: maximumLiveCompletionGapMs,
    pendingLimitMs: maximumLivePendingMs,
  });
  if (result.skipped) return result;
  if (!result.possessionAccepted || !result.exitAccepted || !result.exited
    || result.possessed.kind !== 'piloted-drone' || result.possessed.documentDataset !== 'piloted-drone' || !result.possessed.hudVisible
    || result.controls.length !== 6 || result.controls.some((control) => control.projection <= 0.02 || control.revisionDelta <= 0)
    || result.firedRounds < 1 || result.autonomousDisplacementM <= 0.02
    || result.frameDelta < 20 || result.submissionDelta < 20 || result.completionDelta < 1
    || result.longTasks.length !== 0 || result.deviceLost || result.uncapturedErrors !== 0
    || result.presentation.status !== 'healthy'
    || result.presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs
    || result.presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs
    || result.presentation.progress.maximumPendingForMs > maximumLivePendingMs) {
    throw new Error(`${arenaId} piloted-drone activation/possession/control failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function runCarpetBomberWorkflow(page, arenaId) {
  if (arenaId === 'gun-range') return { skipped: true, reason: 'field-support-disabled-in-gun-range' };
  const result = await page.evaluate(async () => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const waitFor = (read, label, timeoutMs = 7_500) => new Promise((resolve, reject) => {
      const timeoutAt = performance.now() + timeoutMs;
      const inspect = () => {
        const value = read();
        if (value) resolve(value);
        else if (performance.now() >= timeoutAt) reject(new Error(`Carpet bomber ${label} timed out`));
        else requestAnimationFrame(inspect);
      };
      inspect();
    });
    const longTasks = [];
    const observer = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
        })
      : null;
    observer?.observe({ type: 'longtask', buffered: false });
    api.setMovement(false);
    api.resetPresentationProgressWindow();
    const before = api.snapshot();
    const [x, y, z] = before.player.position;
    api.setCaptureCameraPose(x, y + 8, z, 0, -1.18);
    try {
      api.activateSupport('carpet-bomber');
      const targeting = await waitFor(() => {
        const state = api.snapshot();
        return state.fieldSupport.targetingMode === 'carpet-bomber' && state.fieldSupport.crosshairTarget
          ? state : null;
      }, 'target preview');
      const previewTarget = targeting.fieldSupport.crosshairTarget;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', bubbles: true, cancelable: true }));
      const staged = await waitFor(() => {
        const state = api.snapshot();
        const markers = state.killstreakPresentation.markerDetails.filter((marker) => marker.source === 'carpet-bomber');
        const aircraft = state.killstreak.entities.find((entity) => entity.kind === 'aircraft' && entity.id.includes('carpet-aircraft'));
        return state.fieldSupport.targetingMode === null && markers.length === 2 && aircraft
          ? { state, markers, aircraft } : null;
      }, 'marker and aircraft projection');
      const dropped = await waitFor(() => {
        const state = api.snapshot();
        return state.killstreakPresentation.bombShells > before.killstreakPresentation.bombShells
          ? state : null;
      }, 'authored shell drop');
      const impact = await waitFor(() => {
        const state = api.snapshot();
        const aircraft = state.killstreak.entities.find((entity) => entity.id === staged.aircraft.id);
        const presented = state.killstreakPresentation.impactFlashes > before.killstreakPresentation.impactFlashes
          || state.killstreakPresentation.emberParticles > before.killstreakPresentation.emberParticles;
        return presented && aircraft ? { state, aircraft } : null;
      }, 'flight and first impact');
      for (const entry of observer?.takeRecords() ?? []) {
        longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
      }
      observer?.disconnect();
      const after = impact.state;
      const aircraftDisplacementM = Math.hypot(...impact.aircraft.position.map((value, index) => value - staged.aircraft.position[index]));
      return {
        skipped: false,
        preview: {
          targetingMode: targeting.fieldSupport.targetingMode,
          crosshairTarget: previewTarget,
        },
        markers: staged.markers,
        aircraft: {
          id: staged.aircraft.id,
          start: staged.aircraft.position,
          afterFirstImpact: impact.aircraft.position,
          displacementM: aircraftDisplacementM,
        },
        impactPresentation: {
          baselineImpactFlashes: before.killstreakPresentation.impactFlashes,
          baselineBombShells: before.killstreakPresentation.bombShells,
          baselineEmberParticles: before.killstreakPresentation.emberParticles,
          droppedBombShells: dropped.killstreakPresentation.bombShells,
          impactFlashes: after.killstreakPresentation.impactFlashes,
          bombShells: after.killstreakPresentation.bombShells,
          emberParticles: after.killstreakPresentation.emberParticles,
        },
        frameDelta: after.frameCount - before.frameCount,
        submissionDelta: after.render.runtime.presentation.submissionSequence - before.render.runtime.presentation.submissionSequence,
        completionDelta: after.render.runtime.presentation.completedSequence - before.render.runtime.presentation.completedSequence,
        longTasks,
        presentation: after.render.runtime.presentation,
        deviceLost: after.render.runtime.deviceLost,
        uncapturedErrors: after.render.runtime.uncapturedErrors,
      };
    } finally {
      api.setCaptureCameraPose(null);
      api.setMovement(true, true);
      observer?.disconnect();
    }
  });
  if (result.skipped) return result;
  const groundMarker = result.markers.find((marker) => marker.shape === 'ground-x');
  const corridor = result.markers.find((marker) => marker.shape === 'corridor');
  if (result.preview.targetingMode !== 'carpet-bomber' || result.preview.crosshairTarget?.length !== 3
    || !groundMarker || groundMarker.audience !== 'all-combatants' || !groundMarker.visible
    || !groundMarker.colourHexes.includes('#ff253f') || groundMarker.writesDepth || !groundMarker.depthTest || !groundMarker.raycastDisabled
    || !corridor || corridor.audience !== 'owner-only' || !corridor.visible || corridor.corridorLengthM < 30
    || !corridor.colourHexes.includes('#ff253f') || corridor.writesDepth || !corridor.depthTest || !corridor.raycastDisabled
    || result.aircraft.displacementM <= 0.1
    || result.impactPresentation.droppedBombShells <= result.impactPresentation.baselineBombShells
    || result.impactPresentation.impactFlashes <= result.impactPresentation.baselineImpactFlashes
      && result.impactPresentation.emberParticles <= result.impactPresentation.baselineEmberParticles
    || result.frameDelta < 8 || result.submissionDelta < 8 || result.completionDelta < 1
    || result.longTasks.length !== 0 || result.deviceLost || result.uncapturedErrors !== 0
    || result.presentation.status !== 'healthy'
    || result.presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs
    || result.presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs
    || result.presentation.progress.maximumPendingForMs > maximumLivePendingMs) {
    throw new Error(`${arenaId} carpet-bomber targeting/flight failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function runLifecycleRecoveryProbe(page, coverPage, arenaId) {
  const cycles = [];
  for (let cycle = 0; cycle < requiredLifecycleRecoveryCyclesPerVisit; cycle += 1) {
    await page.bringToFront();
    const before = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      window.__PASS65_LIFECYCLE_EVENTS__.length = 0;
      api.resetPresentationProgressWindow();
      const state = api.snapshot();
      return {
        frameCount: state.frameCount,
        completedSequence: state.render.runtime.presentation.completedSequence,
      };
    });
    await coverPage.bringToFront();
    await coverPage.waitForTimeout(150);
    await page.bringToFront();
    await page.waitForFunction(({ minimumFrameCount, minimumCompletionSequence }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const events = window.__PASS65_LIFECYCLE_EVENTS__ ?? [];
      return state?.gameStarted === true
        && state.matchPhase === 'active'
        && state.render.runtime.presentation.status === 'healthy'
        && state.render.runtime.deviceLost === false
        && state.render.runtime.uncapturedErrors === 0
        && document.visibilityState === 'visible'
        && document.hasFocus()
        && events.some((entry) => entry.type === 'blur')
        && events.some((entry) => entry.type === 'focus')
        && events.some((entry) => entry.type === 'visibilitychange' && entry.visibilityState === 'hidden')
        && events.some((entry) => entry.type === 'visibilitychange' && entry.visibilityState === 'visible')
        && state.frameCount >= minimumFrameCount
        && state.render.runtime.presentation.completedSequence >= minimumCompletionSequence;
    }, {
      minimumFrameCount: before.frameCount + 8,
      minimumCompletionSequence: before.completedSequence + 1,
    }, { timeout: 12_000 });
    const after = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setMovement(true, true);
      const state = api.snapshot();
      return {
        frameCount: state.frameCount,
        presentation: state.render.runtime.presentation,
        deviceLost: state.render.runtime.deviceLost,
        uncapturedErrors: state.render.runtime.uncapturedErrors,
        framePacing: state.render.framePacing,
        visibilityState: document.visibilityState,
        focused: document.hasFocus(),
        events: [...window.__PASS65_LIFECYCLE_EVENTS__],
      };
    });
    const receipt = {
      cycle,
      frameDelta: after.frameCount - before.frameCount,
      completionDelta: after.presentation.completedSequence - before.completedSequence,
      ...after,
    };
    if (receipt.presentation.status !== 'healthy' || receipt.deviceLost || receipt.uncapturedErrors !== 0
      || receipt.frameDelta < 8 || receipt.completionDelta < 1 || !receipt.focused || receipt.visibilityState !== 'visible'
      || !['tab visibility regained', 'window focus regained'].includes(receipt.framePacing.lastResetReason)
      || receipt.presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs
      || receipt.presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs
      || receipt.presentation.progress.maximumPendingForMs > maximumLivePendingMs) {
      throw new Error(`${arenaId} focus/visibility recovery cycle ${cycle} failed: ${JSON.stringify(receipt)}`);
    }
    cycles.push(receipt);
  }
  return { requiredCycles: requiredLifecycleRecoveryCyclesPerVisit, completedCycles: cycles.length, cycles };
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
let lastCompletedVisualEvidence = null;
let liveTourComplete = false;
let visualPhaseStarted = false;
let completedLivePhaseSummary = null;
let livePhaseEvidenceDigest = null;
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
      slots: ['scout-sweep', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
    }));
    window.__PASS65_LIFECYCLE_EVENTS__ = [];
    const recordLifecycle = (type) => window.__PASS65_LIFECYCLE_EVENTS__.push({
      type,
      atMs: performance.now(),
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
    });
    window.addEventListener('blur', () => recordLifecycle('blur'));
    window.addEventListener('focus', () => recordLifecycle('focus'));
    document.addEventListener('visibilitychange', () => recordLifecycle('visibilitychange'));
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error'
      || message.type() === 'warning' && isFatalWebGpuConsoleWarning(message.text())) {
      errors.push(message.text());
    }
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
  const lifecycleCoverPage = await page.context().newPage();
  await lifecycleCoverPage.goto('about:blank');
  await page.bringToFront();
  await page.evaluate(() => { window.__PASS65_LIFECYCLE_EVENTS__.length = 0; });

  const arenaReceipts = [];
  const visualEvidenceByArena = [];
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
        const explosion = api.detonateGrenadeAtShed(shed.placementId, 'door-south');
        const after = api.snapshot();
        const next = after.interactiveWorld.envelope.sheds.find((entry) => entry.placementId === shed.placementId);
        return {
          phase: 'detach',
          accepted: explosion.accepted,
          explosion,
          placementId: shed.placementId,
          matchEpoch: next?.matchEpoch ?? null,
          doorStage: next?.surfaces.find((surface) => surface.surfaceId === 'door-south')?.stage ?? null,
        };
      });
      if (!doorResetProbe.accepted || doorResetProbe.doorStage !== 'detached'
        || doorResetProbe.explosion.revisionAfter <= doorResetProbe.explosion.revisionBefore
        || doorResetProbe.explosion.detachedChunksAfter <= doorResetProbe.explosion.detachedChunksBefore
        || doorResetProbe.explosion.grenadeExplosionsAfter !== doorResetProbe.explosion.grenadeExplosionsBefore + 1) {
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
        return available?.['piloted-drone'] === true
          && available?.['carpet-bomber'] === true
          && available?.chopper === true
          && available?.['drone-swarm'] === true;
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
    let pilotedDroneProbe = { skipped: true, reason: 'killstreak-stress-disabled' };
    let carpetBomberProbe = { skipped: true, reason: 'killstreak-stress-disabled' };
    if (enabledStress.has('killstreak')) {
      activeContext = { visit, arenaId, phase: 'piloted-drone-workflow', sampleIndex: null };
      pilotedDroneProbe = await runPilotedDroneWorkflow(page, arenaId);
      activeContext = { visit, arenaId, phase: 'carpet-bomber-workflow', sampleIndex: null };
      carpetBomberProbe = await runCarpetBomberWorkflow(page, arenaId);
    }
    activeContext = { visit, arenaId, phase: 'focus-visibility-recovery', sampleIndex: null };
    const lifecycleRecoveryProbe = await runLifecycleRecoveryProbe(page, lifecycleCoverPage, arenaId);
    // Full graph/residency audits are deliberately isolated behind a drained,
    // paused arena-admission frontier. They must never run inside a measured
    // live interval: both walk thousands of resident objects and can trigger GC.
    await pauseAndDrainPresentation(page);
    const arenaAdmissionAudit = await page.evaluate(async (samplePerformanceBudget) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const performanceSample = samplePerformanceBudget ? await api.sampleArenaPerformanceBudget() : null;
      const state = api.snapshot();
      return {
        shedTargets: (state.interactiveWorld?.envelope?.sheds ?? []).slice(0, 2).map((shed) => shed.placementId),
        runtimeIdentity: {
          label: state.render.runtime.adapterLabel,
          adapterClass: state.render.runtime.adapterClass,
          deviceClass: state.render.runtime.deviceClass,
          softwareAdapter: state.render.runtime.softwareAdapter,
        },
        activeStressBudget: samplePerformanceBudget ? {
          performanceSample,
          budgetAudit: state.render.playableScene.budgetAudit,
          residency: api.sampleRendererResidency(),
        } : null,
      };
    }, enabledStress.has('killstreak'));
    const activeStressBudget = arenaAdmissionAudit.activeStressBudget;
    if (activeStressBudget && activeStressBudget.budgetAudit.pass !== true) {
      throw new Error(`${arenaId} exceeded its live chopper, drone and carpet-bomber support budget: ${JSON.stringify(activeStressBudget)}`);
    }
    const durationMs = arenaId === 'rustworks-1v1' ? rustworksDurationMs : otherArenaDurationMs;
    const samples = [];
    let sampleIndex = 0;
    let measuredLiveDurationMs = 0;
    let liveWindowStart = null;
    while (measuredLiveDurationMs < durationMs) {
      activeContext = { visit, arenaId, phase: 'sample', sampleIndex };
      if (!liveWindowStart) liveWindowStart = await page.evaluate((initial) => {
        const beginLiveWindow = ({ index, stress, shedTargets, maximumLongTaskEntries, requireDrained }) => {
          const verifierTaskStartedAt = performance.now();
          const verifierBeginOwnWorkSubstages = {};
          const api = window.__ATOMIC_ACRES_DEBUG__;

          let substageStartedAt = performance.now();
          const held = api.sampleEnduranceHealth();
          verifierBeginOwnWorkSubstages.healthReadMs = performance.now() - substageStartedAt;
          if (requireDrained
            && held.runtime.presentation.submissionSequence !== held.runtime.presentation.completedSequence) {
            throw new Error(`Live sample did not begin from a drained frontier: ${JSON.stringify(held.runtime.presentation)}`);
          }

          substageStartedAt = performance.now();
          const [x, y, z] = held.playerPosition;
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
            for (const [shedIndex, placementId] of shedTargets.entries()) {
              api.damageShed(placementId, shedIndex === 0 ? 'wall-west' : 'wall-east', 220);
            }
          }
          verifierBeginOwnWorkSubstages.stressSetupMs = performance.now() - substageStartedAt;

          substageStartedAt = performance.now();
          api.resetPresentationProgressWindow();
          api.setRenderPaused(false);
          verifierBeginOwnWorkSubstages.progressResetMs = performance.now() - substageStartedAt;

          substageStartedAt = performance.now();
          const started = api.sampleEnduranceHealth();
          verifierBeginOwnWorkSubstages.baselineReadMs = performance.now() - substageStartedAt;

          const liveLongTaskEvidence = {
            supported: false,
            count: 0,
            totalDurationMs: 0,
            maximumDurationMs: 0,
            entries: [],
            truncated: false,
            ignoredBeforeWindow: 0,
          };
          let liveLongTaskObserver = null;
          let observationStartsAtMs = Number.POSITIVE_INFINITY;
          const recordLiveLongTasks = (entries) => {
            liveLongTaskEvidence.supported = true;
            for (const entry of entries) {
              // An observer registered at the tail of this task may receive the
              // task that registered it. That work is separately receipted as
              // verifier-owned and must not masquerade as a gameplay long task.
              if (entry.startTime < observationStartsAtMs) {
                liveLongTaskEvidence.ignoredBeforeWindow += 1;
                continue;
              }
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
          substageStartedAt = performance.now();
          if (typeof PerformanceObserver === 'function') {
            try {
              liveLongTaskObserver = new PerformanceObserver((list) => recordLiveLongTasks(list.getEntries()));
              liveLongTaskObserver.observe({ type: 'longtask', buffered: false });
              liveLongTaskEvidence.supported = true;
            } catch {
              liveLongTaskObserver = null;
            }
          }
          observationStartsAtMs = performance.now();
          verifierBeginOwnWorkSubstages.longTaskObserverSetupMs = observationStartsAtMs - substageStartedAt;
          const verifierBeginOwnWorkMs = observationStartsAtMs - verifierTaskStartedAt;
          window.__PASS65_ENDURANCE_LIVE_LONG_TASK_SAMPLE__ = {
            evidence: liveLongTaskEvidence,
            observer: liveLongTaskObserver,
            recordEntries: recordLiveLongTasks,
          };
          return {
            atMs: observationStartsAtMs,
            frameCount: started.frameCount,
            presentation: started.runtime.presentation,
            verifierBeginOwnWorkMs,
            verifierBeginOwnWorkSubstages,
          };
        };
        window.__PASS65_ENDURANCE_BEGIN_LIVE_WINDOW__ = beginLiveWindow;
        return beginLiveWindow({ ...initial, requireDrained: true });
      }, {
        index: sampleIndex,
        stress: {
          grenade: enabledStress.has('grenade'),
          smoke: enabledStress.has('smoke'),
          weapons: enabledStress.has('weapons'),
        },
        shedTargets: arenaAdmissionAudit.shedTargets,
        maximumLongTaskEntries: maximumLiveLongTaskEntries,
      });
      if (liveWindowStart.verifierBeginOwnWorkMs >= maximumVerifierOwnedTaskMs
        || Math.max(0, ...Object.values(liveWindowStart.verifierBeginOwnWorkSubstages)) >= maximumVerifierOwnedTaskMs) {
        throw new Error(`${arenaId} verifier live-window setup exceeded its own-task limit: ${JSON.stringify(liveWindowStart)}`);
      }
      await page.waitForFunction((minimumEndAt) => performance.now() >= minimumEndAt,
        liveWindowStart.atMs + sampleIntervalMs);

      const boundary = await page.evaluate(({
        measuredBefore,
        requestedDurationMs,
        windowStartAtMs,
        nextIndex,
        stress,
        shedTargets,
        maximumLongTaskEntries,
      }) => {
        const verifierBoundaryStartedAt = performance.now();
        const boundaryEnteredAtMs = verifierBoundaryStartedAt;
        const verifierBoundaryOwnWorkSubstages = {};
        const api = window.__ATOMIC_ACRES_DEBUG__;
        let substageStartedAt = performance.now();
        const longTaskSample = window.__PASS65_ENDURANCE_LIVE_LONG_TASK_SAMPLE__;
        if (longTaskSample?.observer) {
          longTaskSample.recordEntries(longTaskSample.observer.takeRecords());
        }
        longTaskSample?.observer?.disconnect();
        delete window.__PASS65_ENDURANCE_LIVE_LONG_TASK_SAMPLE__;
        verifierBoundaryOwnWorkSubstages.longTaskCollectionMs = performance.now() - substageStartedAt;

        substageStartedAt = performance.now();
        const health = api.sampleEnduranceHealth();
        verifierBoundaryOwnWorkSubstages.healthReadMs = performance.now() - substageStartedAt;

        substageStartedAt = performance.now();
        const sample = {
          atMs: boundaryEnteredAtMs,
          frameCount: health.frameCount,
          gameStarted: health.gameStarted,
          arenaId: health.arenaId,
          transition: health.transition,
          runtime: health.runtime,
          watchdog: health.watchdog,
          gpuRetirement: health.gpuRetirement,
          killstreak: health.killstreak,
          grenadeWorldPool: health.grenadeWorldPool,
          smokePresentation: health.smokePresentation,
          weaponCatalog: health.weaponCatalog,
          liveLongTasks: longTaskSample?.evidence ?? {
            supported: false,
            count: 0,
            totalDurationMs: 0,
            maximumDurationMs: 0,
            entries: [],
            truncated: false,
            ignoredBeforeWindow: 0,
          },
        };
        verifierBoundaryOwnWorkSubstages.sampleAssemblyMs = performance.now() - substageStartedAt;
        const measuredAfter = measuredBefore + Math.max(1, boundaryEnteredAtMs - windowStartAtMs);
        const reachedRequestedDuration = measuredAfter >= requestedDurationMs;
        let nextLiveWindowStart = null;
        substageStartedAt = performance.now();
        if (reachedRequestedDuration) api.setRenderPaused(true);
        else nextLiveWindowStart = window.__PASS65_ENDURANCE_BEGIN_LIVE_WINDOW__({
          index: nextIndex,
          stress,
          shedTargets,
          maximumLongTaskEntries,
          requireDrained: false,
        });
        verifierBoundaryOwnWorkSubstages.nextWindowSetupMs = performance.now() - substageStartedAt;
        sample.verifierBoundaryOwnWorkMs = performance.now() - verifierBoundaryStartedAt;
        sample.verifierBoundaryOwnWorkSubstages = verifierBoundaryOwnWorkSubstages;
        return { sample, nextLiveWindowStart, reachedRequestedDuration };
      }, {
        measuredBefore: measuredLiveDurationMs,
        requestedDurationMs: durationMs,
        windowStartAtMs: liveWindowStart.atMs,
        nextIndex: sampleIndex + 1,
        stress: {
          grenade: enabledStress.has('grenade'),
          smoke: enabledStress.has('smoke'),
          weapons: enabledStress.has('weapons'),
        },
        shedTargets: arenaAdmissionAudit.shedTargets,
        maximumLongTaskEntries: maximumLiveLongTaskEntries,
      });
      const sample = boundary.sample;
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
        || sample.weaponCatalog.loaded > sample.weaponCatalog.maximumRetained
        || !sample.liveLongTasks.supported
        || sample.liveLongTasks.count !== 0
        || sample.verifierBoundaryOwnWorkMs >= maximumVerifierOwnedTaskMs
        || Math.max(0, ...Object.values(sample.verifierBoundaryOwnWorkSubstages)) >= maximumVerifierOwnedTaskMs) {
        throw new Error(`${arenaId} entered an invalid presentation state: ${JSON.stringify(sample)}`);
      }
      // Every boundary samples the completed interval before the browser-side
      // controller atomically resets telemetry and starts the next one. No
      // screenshot, pause or Node-side gap is admitted into measured live time.
      const elapsedMs = Math.max(1, sample.atMs - liveWindowStart.atMs);
      const frameDelta = sample.frameCount - liveWindowStart.frameCount;
      const submissionDelta = sample.runtime.presentation.submissionSequence - liveWindowStart.presentation.submissionSequence;
      const completionDelta = sample.runtime.presentation.completedSequence - liveWindowStart.presentation.completedSequence;
      const minimumFrameProgress = Math.max(4, Math.floor(elapsedMs / 100));
      // A WebGPU completion probe retires the entire queue frontier, so its
      // sequence advances in batches rather than once per rendered frame.
      // Measure display throughput from admitted submissions; queue stalls
      // remain hard failures through the presentation status above.
      if (frameDelta < minimumFrameProgress || submissionDelta < minimumFrameProgress) {
        throw new Error(`${arenaId} presentation freeze detected: ${JSON.stringify({
          elapsedMs, frameDelta, submissionDelta, completionDelta,
          liveWindowStart, previousReceipt: samples.at(-1) ?? null,
        })}`);
      }
      measuredLiveDurationMs += elapsedMs;
      if (boundary.reachedRequestedDuration !== (measuredLiveDurationMs >= durationMs)) {
        throw new Error(`${arenaId} live-duration boundary disagreed with Node: ${JSON.stringify({ measuredLiveDurationMs, durationMs, boundary })}`);
      }
      const receipt = {
        ...sample,
        liveWindowStart,
        elapsedMs,
        frameDelta,
        submissionDelta,
        completionDelta,
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
          measuredLiveDurationMs,
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
        nextLiveWindowStart: boundary.nextLiveWindowStart,
        finalHeldFrontier: null,
        liveLongTasks: sample.liveLongTasks,
        verifierBoundaryOwnWorkMs: sample.verifierBoundaryOwnWorkMs,
        verifierBoundaryOwnWorkSubstages: sample.verifierBoundaryOwnWorkSubstages,
      };
      sampleIndex += 1;
      liveWindowStart = boundary.nextLiveWindowStart;
    }
    if (samples.length < 5 || measuredLiveDurationMs < durationMs) {
      throw new Error(`${arenaId} did not complete its requested measured live soak: ${JSON.stringify({ samples: samples.length, measuredLiveDurationMs, durationMs })}`);
    }
    const verifierBoundaryAudit = auditVerifierBoundaryOwnWork(samples);
    if (!verifierBoundaryAudit.pass) {
      throw new Error(`${arenaId} verifier boundary perturbed the measured live window: ${JSON.stringify(verifierBoundaryAudit)}`);
    }
    const finalLiveFrontier = await pauseAndDrainPresentation(page);
    const finalLiveHealth = await page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        actualBackend: state.render.runtime.actualBackend,
        deviceLost: state.render.runtime.deviceLost,
        uncapturedErrors: state.render.runtime.uncapturedErrors,
        watchdog: state.render.playableScene.renderWatchdog,
      };
    });
    if (finalLiveFrontier.presentation.status !== 'healthy'
      || finalLiveFrontier.presentation.submissionSequence !== finalLiveFrontier.presentation.completedSequence
      || Number(finalLiveFrontier.presentation.pendingForMs ?? 0) > 0
      || finalLiveFrontier.presentation.lastCompletionLatencyMs > maximumLiveCompletionGapMs
      || finalLiveFrontier.presentation.completionFailures !== 0
      || finalLiveFrontier.presentation.progress.maximumPendingForMs > maximumLivePendingMs
      || finalLiveHealth.actualBackend !== 'webgpu'
      || finalLiveHealth.deviceLost
      || finalLiveHealth.uncapturedErrors !== 0
      || finalLiveHealth.watchdog.status !== 'healthy'
      || finalLiveHealth.watchdog.fatal) {
      throw new Error(`${arenaId} final live drain exceeded its hard presentation limits: ${JSON.stringify({ finalLiveFrontier, finalLiveHealth })}`);
    }
    const finalLiveHeldFrontier = summarizeHeldFrontier(finalLiveFrontier);
    samples.at(-1).finalHeldFrontier = finalLiveHeldFrontier;
    lastCompletedLiveSample.finalHeldFrontier = finalLiveHeldFrontier;

    const beforeReturn = samples.at(-1);
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setRenderPaused(false);
      api.setAds(false);
      api.setMovement(false);
      api.setBotsFrozen?.(false);
      api.setCaptureCameraPose(null);
      api.returnToMainMenu();
      api.setRenderPaused(true);
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
      killstreakStress,
      killstreakActivationProbe,
      pilotedDroneProbe,
      carpetBomberProbe,
      lifecycleRecoveryProbe,
      activeStressBudget,
      admissionRuntimeIdentity: arenaAdmissionAudit.runtimeIdentity,
      doorResetProbe,
      live: {
        requestedDurationMs: durationMs,
        measuredLiveDurationMs,
        actualDurationMs: measuredLiveDurationMs,
        sampleCount: samples.length,
        verifierBoundaryAudit,
        first: samples[0],
        last: beforeReturn,
        frameTail: samples.slice(-5).map((sample) => ({
          atMs: sample.atMs,
          frameCount: sample.frameCount,
          elapsedMs: sample.elapsedMs,
          frameDelta: sample.frameDelta,
          submissionDelta: sample.submissionDelta,
          completionDelta: sample.completionDelta,
          presentationStatus: sample.runtime.presentation.status,
          deviceLost: sample.runtime.deviceLost,
          uncapturedErrors: sample.runtime.uncapturedErrors,
        })),
      },
      deviceErrorTelemetry: {
        actualBackend: afterReturn.runtime.actualBackend,
        deviceLost: afterReturn.runtime.deviceLost,
        uncapturedErrors: afterReturn.runtime.uncapturedErrors,
        presentationStatus: afterReturn.runtime.presentation.status,
        completionFailures: afterReturn.runtime.presentation.completionFailures,
      },
      afterReturn,
    });
    console.log(`[pass65-endurance] visit=${visit} arena=${arenaId} liveMs=${measuredLiveDurationMs.toFixed(1)} samples=${samples.length} result=pass`);
  }

  if (arenaReceipts.length !== arenaSequence.length
    || arenaReceipts.some((receipt) => (
      receipt.live.sampleCount < 5
      || receipt.live.measuredLiveDurationMs < receipt.live.requestedDurationMs
      || receipt.afterReturn.runtime.presentation.status !== 'healthy'
      || receipt.afterReturn.runtime.uncapturedErrors !== 0
      || receipt.afterReturn.gpuRetirement.draining
      || receipt.lifecycleRecoveryProbe.completedCycles !== requiredLifecycleRecoveryCyclesPerVisit
      || receipt.live.frameTail.length !== Math.min(5, receipt.live.sampleCount)
      || receipt.deviceErrorTelemetry.actualBackend !== 'webgpu'
      || receipt.deviceErrorTelemetry.deviceLost
      || receipt.deviceErrorTelemetry.uncapturedErrors !== 0
      || receipt.deviceErrorTelemetry.presentationStatus !== 'healthy'
      || enabledStress.has('killstreak') && receipt.arenaId !== 'gun-range'
        && (receipt.pilotedDroneProbe.skipped || receipt.carpetBomberProbe.skipped)
    ))) {
    throw new Error(`Live tour did not finish every requested visit cleanly: ${JSON.stringify({ expected: arenaSequence.length, arenaReceipts })}`);
  }
  const livePhaseBrowserErrors = fatalBrowserErrors(errors);
  if (livePhaseBrowserErrors.length > 0) {
    throw new Error(`Live tour emitted browser/GPU errors before visual capture began: ${livePhaseBrowserErrors[0]}`);
  }
  livePhaseEvidenceDigest = digest(Buffer.from(JSON.stringify(arenaReceipts)));
  completedLivePhaseSummary = {
    visits: arenaReceipts.length,
    requestedVisits: arenaSequence.length,
    evidenceDigest: livePhaseEvidenceDigest,
    arenas: arenaReceipts.map((receipt) => ({
      visit: receipt.visit,
      arenaId: receipt.arenaId,
      requestedDurationMs: receipt.live.requestedDurationMs,
      measuredLiveDurationMs: receipt.live.measuredLiveDurationMs,
      sampleCount: receipt.live.sampleCount,
      frameTailSamples: receipt.live.frameTail.length,
      lifecycleRecoveryCycles: receipt.lifecycleRecoveryProbe.completedCycles,
      pilotedDroneWorkflow: receipt.pilotedDroneProbe.skipped ? receipt.pilotedDroneProbe.reason : 'passed',
      carpetBomberWorkflow: receipt.carpetBomberProbe.skipped ? receipt.carpetBomberProbe.reason : 'passed',
      deviceLost: receipt.deviceErrorTelemetry.deviceLost,
      uncapturedErrors: receipt.deviceErrorTelemetry.uncapturedErrors,
      menuReturnFrameCount: receipt.afterReturn.frameCount,
    })),
  };
  Object.freeze(arenaReceipts);
  liveTourComplete = true;

  const visualArenaSequence = [...new Set(arenaSequence)];
  if (!diagnosticMode && (visualArenaSequence.length !== 4
    || [...canonicalArenaIds].some((arenaId) => !visualArenaSequence.includes(arenaId)))) {
    throw new Error(`Canonical visual tour must contain each of the four arenas exactly once: ${JSON.stringify(visualArenaSequence)}`);
  }
  if (captureEnabled) {
    visualPhaseStarted = true;
    for (const [tourIndex, arenaId] of visualArenaSequence.entries()) {
      activeContext = { visit: tourIndex, arenaId, phase: 'visual-select-arena', sampleIndex: null };
      console.log(`[pass65-endurance] visual=${tourIndex} arena=${arenaId} phase=select`);
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
        api.setMovement(false);
      });
      await page.waitForFunction((id) => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.gameStarted === true
          && state.matchPhase === 'active'
          && state.arenaSelection.id === id
          && state.render.runtime.actualBackend === 'webgpu'
          && state.render.runtime.presentation.status === 'healthy'
          && document.querySelector('#menu')?.classList.contains('hidden');
      }, arenaId, { timeout: 30_000 });
      await pauseAndDrainPresentation(page);

      const canvasClip = await page.locator('#game').boundingBox();
      if (!canvasClip || canvasClip.width <= 0 || canvasClip.height <= 0) {
        throw new Error(`${arenaId} gameplay canvas has no capture bounds`);
      }
      const visualEvidence = {
        tourIndex,
        arenaId,
        requiredFrames: minimumVisualEvidenceFrames,
        minimumDistinctRatio: minimumVisualEvidenceDistinctRatio,
        capturedFrames: 0,
        distinctScreenshots: 0,
        adjacentHashesDistinct: true,
        frames: [],
        afterReturn: null,
      };
      const screenshotHashes = new Set();
      let previousScreenshotHash = null;
      let lastScreenshot = null;
      for (const [visualIndex, pose] of visualEvidencePoses.entries()) {
        activeContext = { visit: tourIndex, arenaId, phase: 'visual-evidence', sampleIndex: visualIndex };
        const poseStart = await page.evaluate((nextPose) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const state = api.snapshot();
          const [x, y, z] = state.player.position;
          api.setCaptureCameraPose(x, y, z, nextPose.yaw, nextPose.pitch);
          const before = api.snapshot();
          api.setRenderPaused(false);
          return {
            frameCount: before.frameCount,
            completedSequence: before.render.runtime.presentation.completedSequence,
          };
        }, pose);
        await page.waitForFunction(({ expectedArenaId, minimumFrameCount, minimumCompletionSequence }) => {
          const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          return state?.gameStarted === true
            && state.arenaSelection.id === expectedArenaId
            && state.arenaSelection.streaming.transition.phase === 'idle'
            && state.arenaSelection.streaming.transition.failure === null
            && state.arenaSelection.streaming.transition.renderSubmissionPaused === false
            && state.render.runtime.actualBackend === 'webgpu'
            && state.render.runtime.deviceLost === false
            && state.render.runtime.uncapturedErrors === 0
            && state.render.runtime.presentation.status === 'healthy'
            && state.render.playableScene.renderWatchdog.status === 'healthy'
            && state.render.playableScene.renderWatchdog.fatal === false
            && state.frameCount >= minimumFrameCount
            && state.render.runtime.presentation.completedSequence >= minimumCompletionSequence;
        }, {
          expectedArenaId: arenaId,
          minimumFrameCount: poseStart.frameCount + 4,
          minimumCompletionSequence: poseStart.completedSequence + 2,
        }, { timeout: 12_000 });
        const capture = await captureCanvasOnly(page, canvasClip);
        lastScreenshot = capture.screenshot;
        const screenshotHash = digest(lastScreenshot);
        const adjacentHashDistinct = previousScreenshotHash === null || screenshotHash !== previousScreenshotHash;
        screenshotHashes.add(screenshotHash);
        const frame = {
          visualIndex,
          pose,
          screenshotHash,
          adjacentHashDistinct,
          captureIsolationMs: capture.captureIsolationMs,
          verifierCaptureRecovery: summarizeCaptureRecovery(capture.recovery),
          verifierHeldFrontier: summarizeHeldFrontier(capture.progress),
        };
        visualEvidence.frames.push(frame);
        lastCompletedVisualEvidence = { tourIndex, arenaId, ...frame };
        previousScreenshotHash = screenshotHash;
      }
      visualEvidence.capturedFrames = visualEvidence.frames.length;
      visualEvidence.distinctScreenshots = screenshotHashes.size;
      visualEvidence.adjacentHashesDistinct = visualEvidence.frames.every((frame) => frame.adjacentHashDistinct);
      const minimumDistinctScreenshots = Math.ceil(
        visualEvidence.capturedFrames * minimumVisualEvidenceDistinctRatio,
      );
      if (visualEvidence.capturedFrames < minimumVisualEvidenceFrames
        || !visualEvidence.adjacentHashesDistinct
        || visualEvidence.distinctScreenshots < minimumDistinctScreenshots) {
        throw new Error(`${arenaId} visual evidence was not sufficiently live and distinct: ${JSON.stringify(visualEvidence)}`);
      }
      await writeFile(`${artifactRoot}/visual-${tourIndex}-${arenaId}-final.png`, lastScreenshot);

      activeContext = { visit: tourIndex, arenaId, phase: 'visual-menu-return', sampleIndex: null };
      await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.setRenderPaused(false);
        api.setAds(false);
        api.setMovement(false);
        api.setBotsFrozen?.(false);
        api.setCaptureCameraPose(null);
        api.returnToMainMenu();
        api.setRenderPaused(true);
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
        throw new Error(`${arenaId} visual-tour menu return did not retire presentation safely: ${JSON.stringify(afterReturn)}`);
      }
      visualEvidence.afterReturn = afterReturn;
      visualEvidenceByArena.push(visualEvidence);
      console.log(`[pass65-endurance] visual=${tourIndex} arena=${arenaId} frames=${visualEvidence.capturedFrames} result=pass`);
    }
  }
  const endingLivePhaseEvidenceDigest = digest(Buffer.from(JSON.stringify(arenaReceipts)));
  if (endingLivePhaseEvidenceDigest !== livePhaseEvidenceDigest) {
    throw new Error(`Visual tour mutated retained live evidence: ${JSON.stringify({ livePhaseEvidenceDigest, endingLivePhaseEvidenceDigest })}`);
  }

  const uniqueErrors = fatalBrowserErrors(errors);
  if (uniqueErrors.length > 0) throw new Error(`Pass 65 endurance emitted browser/GPU errors: ${uniqueErrors[0]}`);
  const output = {
    gate: diagnosticMode ? 'pass65-webgpu-presentation-endurance-diagnostic' : 'pass65-webgpu-presentation-endurance',
    verdict: 'pass',
    sourceRevision,
    browserExecutable: executablePath,
    browserVersion: browser.version(),
    adapter: arenaReceipts[0]?.admissionRuntimeIdentity ?? null,
    viewport: [2560, 1440],
    sampleIntervalMs,
    maximumLiveSubmissionGapMs,
    maximumLiveCompletionGapMs,
    maximumLivePendingMs,
    maximumVerifierBoundaryP99Ms,
    maximumVerifierOwnedTaskMs,
    requiredCaptureRecoveryCompletions,
    minimumCaptureRecoveryWindowMs,
    maximumCaptureRecoveryCompletionMs,
    maximumLiveLongTaskEntries,
    requiredLifecycleRecoveryCyclesPerVisit,
    minimumVisualEvidenceFrames,
    minimumVisualEvidenceDistinctRatio,
    rustworksDurationMs,
    otherArenaDurationMs,
    arenaSequence,
    captureEnabled,
    skipDiagnosticCapture,
    enabledStress: [...enabledStress],
    killstreakProbeMode,
    secondActivationDelayMs,
    browserErrors: [...new Set(errors)],
    completedLivePhaseSummary,
    livePhaseEvidenceDigest,
    arenaReceipts,
    visualTour: {
      enabled: captureEnabled,
      skippedReason: captureEnabled ? null : 'diagnostic-capture-disabled',
      arenaSequence: visualArenaSequence,
    },
    visualEvidenceByArena,
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
  let failureResidency = null;
  try {
    const failureAudit = await page?.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      if (!api) return null;
      api.setRenderPaused(true);
      return {
        state: api.snapshot(),
        residency: api.sampleRendererResidency(),
      };
    });
    state = failureAudit?.state ?? null;
    failureResidency = failureAudit?.residency ?? null;
  } catch {
    // The renderer may have already failed closed; the browser errors remain evidence.
  }
  const failure = {
    gate: 'pass65-webgpu-presentation-endurance',
    verdict: 'fail',
    sourceRevision,
    activeContext,
    liveTourComplete,
    visualPhaseStarted,
    completedLivePhaseSummary,
    livePhaseEvidenceDigest,
    lastCompletedLiveSample,
    lastCompletedVisualEvidence,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    browserErrors: [...new Set(errors)],
    state,
    failureResidency,
  };
  await writeFile(`${artifactRoot}/failure-receipt.json`, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  if (captureEnabled && visualPhaseStarted) {
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
