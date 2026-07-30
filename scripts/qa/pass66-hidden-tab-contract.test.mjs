import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORBIDDEN_BACKGROUND_BYPASS_FLAGS,
  REQUIRED_BROWSER_WEAPON_IDS,
  REQUIRED_HELD_CPU_ASSET,
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
    weaponCatalog: {
      retained: ['carbine'],
      retainedCount: 1,
      loaded: 1,
      available: REQUIRED_BROWSER_WEAPON_IDS.length,
      maximumRetained: REQUIRED_BROWSER_WEAPON_IDS.length,
      gpuReady: 0,
      prewarming: true,
    },
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
    ignoreDefaultArgs: [...FORBIDDEN_BACKGROUND_BYPASS_FLAGS],
  }));
  assert.throws(() => assertHeadedChromeLaunchContract({
    headless: true,
    executablePath: chrome,
    args: [],
    ignoreDefaultArgs: [...FORBIDDEN_BACKGROUND_BYPASS_FLAGS],
  }), /headed Chrome/);
  for (const flag of FORBIDDEN_BACKGROUND_BYPASS_FLAGS) {
    assert.throws(() => assertHeadedChromeLaunchContract({
      headless: false,
      executablePath: chrome,
      args: [flag],
      ignoreDefaultArgs: [...FORBIDDEN_BACKGROUND_BYPASS_FLAGS],
    }), /forbids browser throttling bypasses/);
  }
  const defaultArgMutations = [
    undefined,
    [],
    FORBIDDEN_BACKGROUND_BYPASS_FLAGS.slice(0, -1),
    [...FORBIDDEN_BACKGROUND_BYPASS_FLAGS].reverse(),
    [...FORBIDDEN_BACKGROUND_BYPASS_FLAGS, '--disable-features=CalculateNativeWinOcclusion'],
  ];
  for (const ignoreDefaultArgs of defaultArgMutations) {
    assert.throws(() => assertHeadedChromeLaunchContract({
      headless: false,
      executablePath: chrome,
      args: ['--enable-unsafe-webgpu'],
      ignoreDefaultArgs,
    }), /must remove exactly Playwright's forbidden defaults/);
  }
});

test('accepts hidden CPU progress only when frames, WebGPU submission, authority, audio and generation stay paused', () => {
  const beforeRelease = checkpoint();
  const afterHidden = checkpoint({
    assetResources: [{ name: REQUIRED_HELD_CPU_ASSET, responseEnd: 123 }],
    weaponCatalog: {
      retained: [...REQUIRED_BROWSER_WEAPON_IDS],
      retainedCount: REQUIRED_BROWSER_WEAPON_IDS.length,
      loaded: REQUIRED_BROWSER_WEAPON_IDS.length,
      available: REQUIRED_BROWSER_WEAPON_IDS.length,
      maximumRetained: REQUIRED_BROWSER_WEAPON_IDS.length,
      gpuReady: 0,
      prewarming: true,
    },
    transition: {
      ...beforeRelease.transition,
      profile: { phases: [
        { phase: 'quality-presentation' },
        { phase: 'material-tuning' },
        { phase: 'weapon-catalog-prewarm' },
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
  for (const interactiveWorldTick of [null, Number.NaN, 0.5, -1]) {
    assert.match(hiddenCheckpointFailures({
      beforeRelease,
      afterHidden: { ...afterHidden, interactiveWorldTick },
      heldAssetRequests: 1,
    }).join(' | '), /canonical interactiveWorldTick was missing or non-integral/);
  }
  assert.match(hiddenCheckpointFailures({
    beforeRelease,
    afterHidden: { ...afterHidden, interactiveWorldTick: beforeRelease.interactiveWorldTick + 1 },
    heldAssetRequests: 1,
  }).join(' | '), /offline interactive-world authority advanced while hidden/);
});

test('rejects a phase-only claim and incomplete or self-reordered retained weapon IDs', () => {
  const beforeRelease = checkpoint();
  const afterHidden = checkpoint({
    assetResources: [{ name: REQUIRED_HELD_CPU_ASSET, responseEnd: 123 }],
    weaponCatalog: {
      retained: [...REQUIRED_BROWSER_WEAPON_IDS],
      retainedCount: REQUIRED_BROWSER_WEAPON_IDS.length,
      loaded: REQUIRED_BROWSER_WEAPON_IDS.length,
      available: REQUIRED_BROWSER_WEAPON_IDS.length,
      maximumRetained: REQUIRED_BROWSER_WEAPON_IDS.length,
      gpuReady: 0,
      prewarming: true,
    },
    transition: {
      ...beforeRelease.transition,
      profile: { phases: [
        { phase: 'quality-presentation' },
        { phase: 'weapon-catalog-prewarm' },
      ] },
    },
  });

  const phaseOnly = {
    ...afterHidden,
    weaponCatalog: { ...beforeRelease.weaponCatalog },
  };
  assert.match(hiddenCheckpointFailures({
    beforeRelease,
    afterHidden: phaseOnly,
    heldAssetRequests: 1,
  }).join(' | '), /did not commit the exact 18-weapon retained catalog.*loaded-model count did not advance/);

  const incomplete = {
    ...afterHidden,
    weaponCatalog: {
      ...afterHidden.weaponCatalog,
      retained: REQUIRED_BROWSER_WEAPON_IDS.slice(0, -1),
      retainedCount: REQUIRED_BROWSER_WEAPON_IDS.length - 1,
    },
  };
  assert.match(hiddenCheckpointFailures({
    beforeRelease,
    afterHidden: incomplete,
    heldAssetRequests: 1,
  }).join(' | '), /did not commit the exact 18-weapon retained catalog/);

  const reordered = {
    ...afterHidden,
    weaponCatalog: {
      ...afterHidden.weaponCatalog,
      retained: [...REQUIRED_BROWSER_WEAPON_IDS].reverse(),
    },
  };
  assert.match(hiddenCheckpointFailures({
    beforeRelease,
    afterHidden: reordered,
    heldAssetRequests: 1,
  }).join(' | '), /did not commit the exact 18-weapon retained catalog/);
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
