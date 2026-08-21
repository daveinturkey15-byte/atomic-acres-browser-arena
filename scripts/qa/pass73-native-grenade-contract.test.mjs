import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE,
  PASS73_NATIVE_GRENADE_PROFILES,
  PASS73_NATIVE_GRENADE_SCHEMA,
  assertPass73NativeGrenadeReceipt,
  pass73NativeGrenadeFailures,
} from './pass73-native-grenade-contract.mjs';

const head = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const executableSha256 = 'c'.repeat(64);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function render(sequence) {
  return {
    requestedBackend: 'webgpu', actualBackend: 'webgpu', initialized: true, failClosed: false,
    adapterLabel: 'NVIDIA GeForce RTX 5080', adapterClass: 'GPUAdapter', deviceClass: 'GPUDevice',
    softwareAdapter: false, deviceLost: false, uncapturedErrors: 0,
    compiledPipelineIds: ['atomic-sky', 'world-ordnance'], slowNodeBuilds: [],
    presentation: { status: 'healthy', completionFailures: 0, submissionSequence: sequence, completedSequence: sequence },
  };
}

function telemetry(acquisitions, sequence) {
  return {
    audio: {
      prepared: true, runs: 1, warmupSources: 7, retainedSources: 0,
      retainedBroadbandLoops: 0, liveRecipe: 'sawtooth-pressure-plus-dual-filtered-noise-v1',
    },
    pool: {
      total: 4, gpuPrewarmGeneration: 1, acquisitions, exhaustions: 0, prewarmBlockedAcquisitions: 0,
    },
    render: render(sequence),
  };
}

function frameWindow(acquisitions, maximumGapMs) {
  return {
    keyCode: 'KeyG', keyTrusted: true, keyRepeat: false,
    gapsMs: [6.8, 6.9, maximumGapMs, 6.8], maximumGapMs,
    p50Ms: 6.9, p95Ms: maximumGapMs, p99Ms: maximumGapMs,
    longTaskObserverSupported: true, longTasks: [], resourceLoads: [],
    telemetryBefore: telemetry(acquisitions, 10 + acquisitions),
    telemetryAfter: telemetry(acquisitions + 1, 11 + acquisitions),
  };
}

function action(sequence, cold, maximumGapMs) {
  return {
    sequence, cold, grenade: 'frag', observationComplete: true, handlerSyncMs: 0.7,
    pool: { acquiredRetainedMesh: true, family: 'frag', acquisitionsBefore: sequence, acquisitionsAfter: sequence + 1 },
    audio: { liveRecipe: 'sawtooth-pressure-plus-dual-filtered-noise-v1' },
    animation: { activeAtHandlerEnd: true, activeOnFirstPresentedFrame: true },
    physics: {
      path: 'deterministic-kinematic-no-rapier-body', rapierBodiesAcquired: 0,
      initialOrigin: [1, 2, 3], initialVelocity: [0, 5.2, -13], fuseMs: 2_300,
    },
    meshVisibleOnFirstPresentedFrame: true,
    firstPresentedDelayMs: maximumGapMs,
    startingSubmissionSequence: 10,
    targetSubmissionSequence: 11,
    firstSubmissionDelayMs: 6.9,
    firstCompletionDelayMs: 13.8,
    completionFailures: 0,
    status: 'healthy',
    frameP95Ms: maximumGapMs,
    frameP99Ms: maximumGapMs,
    maximumAnimationFrameGapMs: maximumGapMs,
    maximumFrameWorkMs: Math.max(0, maximumGapMs - 1),
  };
}

function trial(profile, trialNumber) {
  const firstMax = 9;
  const secondMax = 8;
  return {
    profile,
    trial: trialNumber,
    route: `http://127.0.0.1:4173/channels/the-big-one/?release=latest&map=atomic-acres&renderer=webgpu&requireWebGPU=1&render=${profile}&externalServices=off&traceNodeBuilds=1&seed=pass73-native-grenade-${profile}-${trialNumber}`,
    userAgent: 'Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36',
    viewport: [2_560, 1_440],
    deviceScaleFactor: 1,
    browserErrors: [],
    first: { window: frameWindow(0, firstMax), action: action(0, true, firstMax) },
    second: { window: frameWindow(1, secondMax), action: action(1, false, secondMax) },
  };
}

function validReceipt() {
  return {
    schema: PASS73_NATIVE_GRENADE_SCHEMA,
    verdict: 'pass',
    source: { head, tree, clean: true, endingHead: head, endingTree: tree },
    browser: {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      executableSha256,
      version: '151.0.7922.170',
    },
    gate: {
      profiles: [...PASS73_NATIVE_GRENADE_PROFILES],
      contextsPerProfile: PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE,
      viewport: [2_560, 1_440],
      deviceScaleFactor: 1,
      backend: 'native-hardware-webgpu',
      input: 'trusted-keyboard-KeyG',
      freshBrowserContextPerTrial: true,
      compositor: 'headed-offscreen',
    },
    trials: PASS73_NATIVE_GRENADE_PROFILES.flatMap((profile) => (
      Array.from({ length: PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE }, (_, index) => trial(profile, index + 1))
    )),
  };
}

test('accepts the complete exact-source six-context Quality and Performance receipt', () => {
  assert.doesNotThrow(() => assertPass73NativeGrenadeReceipt(validReceipt(), { head, tree, executableSha256 }));
});

test('owned runner binds the receipt claim to a headed offscreen installed-Chrome compositor', () => {
  const config = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8');
  const runner = readFileSync(resolve(root, 'scripts/qa/run-pass73-native-grenade.mjs'), 'utf8');
  const spec = readFileSync(resolve(root, 'tests/e2e/pass73-native-grenade.spec.ts'), 'utf8');
  assert.match(config, /headless: pass73NativeWebGpu \? false : undefined/u);
  assert.match(config, /'--window-position=-32000,-32000'/u);
  assert.match(config, /'--window-size=2640,1520'/u);
  assert.match(config, /'--disable-backgrounding-occluded-windows'/u);
  assert.match(runner, /PASS73_NATIVE_COMPOSITOR: 'headed-offscreen'/u);
  assert.ok(
    spec.indexOf('const telemetryBefore = api.sampleGrenadeColdPathTelemetry();')
      < spec.indexOf('const onKeyDown = (event: KeyboardEvent): void =>'),
    'large diagnostic snapshots must be captured before the trusted input timing window',
  );
});

test('rejects debug input, a hitch, resource or pipeline work, and software WebGPU', () => {
  const mutations = [
    [
      (receipt) => { receipt.trials[0].first.window.keyTrusted = false; },
      /trusted non-repeat G/u,
    ],
    [
      (receipt) => { receipt.trials[0].first.window.maximumGapMs = 21; },
      /absolute 20 ms/u,
    ],
    [
      (receipt) => { receipt.trials[0].first.window.resourceLoads.push({ path: '/late.glb' }); },
      /loaded a resource/u,
    ],
    [
      (receipt) => { receipt.trials[0].first.window.telemetryAfter.render.compiledPipelineIds.push('late'); },
      /compiled a pipeline/u,
    ],
    [
      (receipt) => { receipt.trials[0].first.window.telemetryAfter.render.softwareAdapter = true; },
      /native hardware WebGPU/u,
    ],
  ];
  for (const [mutate, expected] of mutations) {
    const receipt = structuredClone(validReceipt());
    mutate(receipt);
    assert.match(pass73NativeGrenadeFailures(receipt).join('\n'), expected);
  }
});

test('rejects changed kinematics, missing matrix rows, and source drift', () => {
  const changedKinematics = structuredClone(validReceipt());
  changedKinematics.trials[0].second.action.physics.initialVelocity[2] = -12;
  assert.match(pass73NativeGrenadeFailures(changedKinematics).join('\n'), /changed mesh, audio, or kinematic/u);

  const missing = structuredClone(validReceipt());
  missing.trials.pop();
  assert.match(pass73NativeGrenadeFailures(missing).join('\n'), /six required|missing or duplicated/u);

  const drifted = structuredClone(validReceipt());
  drifted.source.endingHead = 'd'.repeat(40);
  assert.match(pass73NativeGrenadeFailures(drifted).join('\n'), /clean immutable Git source/u);
});

test('compares cold and warm throws using measured game-loop work rather than refresh buckets', () => {
  const refreshBucketVariance = structuredClone(validReceipt());
  refreshBucketVariance.trials[0].first.window.p95Ms = 14;
  refreshBucketVariance.trials[0].second.window.p95Ms = 7;
  assert.doesNotThrow(() => assertPass73NativeGrenadeReceipt(refreshBucketVariance));

  const coldGameLoopWork = structuredClone(validReceipt());
  coldGameLoopWork.trials[0].first.action.maximumFrameWorkMs = 11.1;
  coldGameLoopWork.trials[0].second.action.maximumFrameWorkMs = 8;
  assert.match(pass73NativeGrenadeFailures(coldGameLoopWork).join('\n'), /cold throw exceeded/u);
});
