import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const verifierSource = readFileSync(new URL('./verify-pass66-hidden-tab-admission.mjs', import.meta.url), 'utf8');

assert.equal(
  REQUIRED_HELD_CPU_ASSET,
  '/assets/original/models/weapons/pass65-firearms/smg/smg-fp-lod0.glb',
  'the hidden gate must hold the first missing catalog viewmodel so the exact catalog advances while hidden',
);
assert.deepEqual(
  REQUIRED_BROWSER_WEAPON_IDS.slice(0, 2),
  ['carbine', 'smg'],
  'the SMG sentinel is valid only while carbine is the active shared asset and SMG is the first catalog-only request',
);

function checkpoint(overrides = {}) {
  return {
    document: { visibilityState: 'hidden', hasFocus: false },
    coverDocument: { visibilityState: 'visible', hasFocus: true },
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

test('requires direct-CDP headed installed Chrome with two native seed tabs and no background bypasses', () => {
  const seedUrls = ['file:///C:/Temp/game.html', 'file:///C:/Temp/cover.html'];
  const baseArgs = [
    '--remote-debugging-port=43123',
    '--user-data-dir=C:/Temp/pass66-profile',
    '--enable-unsafe-webgpu',
    ...seedUrls,
  ];
  assert.doesNotThrow(() => assertHeadedChromeLaunchContract({
    headless: false,
    executablePath: chrome,
    args: baseArgs,
    automation: 'direct-cdp',
    seedUrls,
  }));
  assert.throws(() => assertHeadedChromeLaunchContract({
    headless: true,
    executablePath: chrome,
    args: baseArgs,
    automation: 'direct-cdp',
    seedUrls,
  }), /headed Chrome/);
  for (const flag of FORBIDDEN_BACKGROUND_BYPASS_FLAGS) {
    assert.throws(() => assertHeadedChromeLaunchContract({
      headless: false,
      executablePath: chrome,
      args: [...baseArgs, flag],
      automation: 'direct-cdp',
      seedUrls,
    }), /forbids browser throttling bypasses/);
  }
  assert.throws(() => assertHeadedChromeLaunchContract({
    headless: false,
    executablePath: chrome,
    args: baseArgs,
    automation: 'playwright',
    seedUrls,
  }), /requires direct CDP/);
  assert.throws(() => assertHeadedChromeLaunchContract({
    headless: false,
    executablePath: chrome,
    args: [...baseArgs, '--disable-features=CalculateNativeWinOcclusion'],
    automation: 'direct-cdp',
    seedUrls,
  }), /forbids browser throttling bypasses/);
  for (const invalidSeeds of [undefined, seedUrls.slice(0, 1), [...seedUrls].reverse().slice(0, 1), ['about:blank', seedUrls[1]]]) {
    assert.throws(() => assertHeadedChromeLaunchContract({
      headless: false,
      executablePath: chrome,
      args: baseArgs,
      automation: 'direct-cdp',
      seedUrls: invalidSeeds,
    }), /two command-line-seeded native Chrome tabs/);
  }
});

test('uses one exact native HWND activation and trusted browser input for the admission gesture', () => {
  assert.match(verifierSource, /AttachThreadInput\(\$currentThread, \$foregroundThread, \$true\)/);
  assert.match(verifierSource, /AttachThreadInput\(\$currentThread, \$targetThread, \$true\)/);
  assert.match(verifierSource, /AttachThreadInput\(\$currentThread, \$targetThread, \$false\)/);
  assert.match(verifierSource, /Input\.dispatchMouseEvent', \{ type: 'mousePressed'/);
  assert.match(verifierSource, /Input\.dispatchMouseEvent', \{ type: 'mouseReleased'/);
  assert.match(verifierSource, /await trustedClick\(game, '#solo'\)/);
  assert.doesNotMatch(verifierSource, /document\.querySelector\('#solo'\)\.click\(\)/);
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
    coverDocument: { visibilityState: 'hidden', hasFocus: false },
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
