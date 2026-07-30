import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORBIDDEN_BACKGROUND_BYPASS_FLAGS,
  assertHeadedChromeLaunchContract,
  hiddenCheckpointFailures,
  recoveredCheckpointFailures,
} from './pass66-hidden-tab-contract.mjs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function checkpoint(overrides = {}) {
  return {
    document: { visibilityState: 'hidden', hasFocus: false },
    frameCount: 7,
    gameStarted: false,
    matchPhase: 'warmup',
    bootstrap: { matchAdmissionCadence: null },
    presentationScheduling: { mode: 'paused-offline', recoveryCount: 0 },
    admission: { matchAdmissionGeneration: 1, presentedGameplayFrame: 0 },
    presentation: { submissionSequence: 4, completedSequence: 4, completionFailures: 0, status: 'healthy' },
    runtime: { actualBackend: 'webgpu', softwareAdapter: false, deviceLost: false, uncapturedErrors: 0 },
    audio: { contexts: [{ state: 'suspended' }], suspendCalls: 1, resumeCalls: 1 },
    interactiveWorldTick: 0,
    assetResources: [],
    streaming: {
      constructionCount: 1,
      constructedArenaIds: ['atomic-acres'],
      residentArenaRoots: 1,
      activeRoots: ['atomic-acres'],
    },
    transition: {
      generation: 1,
      phase: 'preparing',
      failure: null,
      renderSubmissionPaused: true,
      profile: { phases: [{ phase: 'quality-presentation' }] },
    },
    ...overrides,
  };
}

test('requires real headed installed Chrome without background-throttling bypass flags', () => {
  assert.doesNotThrow(() => assertHeadedChromeLaunchContract({
    headless: false,
    executablePath: chrome,
    args: ['--enable-unsafe-webgpu'],
  }));
  assert.throws(() => assertHeadedChromeLaunchContract({ headless: true, executablePath: chrome, args: [] }), /headed Chrome/);
  for (const flag of FORBIDDEN_BACKGROUND_BYPASS_FLAGS) {
    assert.throws(() => assertHeadedChromeLaunchContract({
      headless: false,
      executablePath: chrome,
      args: [flag],
    }), /forbids browser throttling bypasses/);
  }
});

test('accepts hidden CPU progress only when frames, WebGPU submission, authority, audio and generation stay paused', () => {
  const beforeRelease = checkpoint();
  const afterHidden = checkpoint({
    assetResources: [{ name: '/assets/original/models/atomic-acres-blender-arena.glb', responseEnd: 123 }],
    transition: {
      ...beforeRelease.transition,
      profile: { phases: [
        { phase: 'quality-presentation' },
        { phase: 'material-tuning' },
        { phase: 'prewarm-batched-effects' },
      ] },
    },
  });
  assert.deepEqual(hiddenCheckpointFailures({ beforeRelease, afterHidden, heldAssetRequests: 1 }), []);
  assert.match(hiddenCheckpointFailures({
    beforeRelease,
    afterHidden: {
      ...afterHidden,
      presentation: { ...afterHidden.presentation, submissionSequence: 5 },
      audio: { ...afterHidden.audio, contexts: [{ state: 'running' }] },
    },
    heldAssetRequests: 1,
  }).join(' | '), /submissionSequence advanced while hidden.*Web Audio was not suspended/);
});

test('accepts one healthy foreground recovery of the same generation and root', () => {
  const beforeRelease = checkpoint();
  const afterHidden = checkpoint();
  const recovered = checkpoint({
    document: { visibilityState: 'visible', hasFocus: true },
    gameStarted: true,
    matchPhase: 'active',
    foregroundRecoveryMs: 8_400,
    presentationScheduling: { mode: 'foreground-presentation', recoveryCount: 1 },
    admission: { matchAdmissionGeneration: 1, presentedGameplayFrame: 12 },
    audio: { contexts: [{ state: 'running' }], suspendCalls: 1, resumeCalls: 2 },
    bootstrap: {
      matchAdmissionCadence: {
        backend: 'webgpu',
        admittedDegraded: false,
        visibilityState: 'visible',
        drained: true,
        endingSubmissionSequence: 12,
        endingCompletedSequence: 12,
      },
    },
    transition: {
      ...beforeRelease.transition,
      phase: 'idle',
      renderSubmissionPaused: false,
    },
  });
  assert.deepEqual(recoveredCheckpointFailures({
    beforeRelease,
    afterHidden,
    recovered,
    maximumRecoveryMs: 20_000,
  }), []);
  assert.match(recoveredCheckpointFailures({
    beforeRelease,
    afterHidden,
    recovered: {
      ...recovered,
      presentationScheduling: { ...recovered.presentationScheduling, recoveryCount: 2 },
      streaming: { ...recovered.streaming, residentArenaRoots: 2 },
    },
    maximumRecoveryMs: 20_000,
  }).join(' | '), /exactly one lifecycle recovery.*exactly one active Atomic Acres root/);
});
