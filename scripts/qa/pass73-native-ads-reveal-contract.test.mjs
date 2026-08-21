import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  PASS73_NATIVE_ADS_REVEAL_PROFILES,
  PASS73_NATIVE_ADS_REVEAL_ROI,
  PASS73_NATIVE_ADS_REVEAL_SCHEMA,
  PASS73_NATIVE_ADS_REVEAL_THRESHOLDS,
  PASS73_NATIVE_ADS_REVEAL_WEAPONS,
  pass73NativeAdsRevealFailures,
  pass73NativeAdsRevealStaticFailures,
} from './pass73-native-ads-reveal-contract.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const head = '1'.repeat(40);
const tree = '2'.repeat(40);
const executableSha256 = '3'.repeat(64);

function clone(value) {
  return structuredClone(value);
}

function render() {
  return {
    requestedBackend: 'webgpu',
    actualBackend: 'webgpu',
    initialized: true,
    failClosed: false,
    adapterClass: 'GPUAdapter',
    deviceClass: 'GPUDevice',
    adapterLabel: 'NVIDIA GeForce RTX 5080',
    softwareAdapter: false,
    deviceLost: false,
    uncapturedErrors: 0,
    presentation: { completionFailures: 0, status: 'healthy' },
  };
}

function revealTelemetry(stage) {
  const target = {
    id: stage.id,
    lifeId: stage.lifeId,
    continuityId: stage.continuityId,
    sourceRootUuid: stage.sourceRootUuid,
    sourceVisualUuid: 'visual-uuid',
    sourceRootAttached: true,
    sourceVisualAttached: true,
    sourceBodyLayers: stage.normalBodyLayers,
    exactModelLayers: stage.normalBodyLayers,
    haloLayers: stage.normalBodyLayers,
    detachedLayers: 0,
    extraneousModelLayers: 0,
    extraneousHaloLayers: 0,
    poseIdentity: true,
    sourcePoseDigest: 'a1b2c3d4',
    modelPoseDigest: 'a1b2c3d4',
    active: true,
    lastSeenGeneration: 7,
  };
  return {
    contract: 'exact-animated-operator-plus-orange-halo-v1',
    trackedTargets: 1,
    activeTargets: 1,
    activeTargetIds: [stage.id],
    targets: [target],
    activeModelLayers: stage.normalBodyLayers,
    activeSourceBodyLayers: stage.normalBodyLayers,
    activeHaloLayers: stage.normalBodyLayers,
    geometryIdentity: true,
    skeletonIdentity: true,
    bindMatrixIdentity: true,
    meshWorldMatrixIdentity: true,
    haloWorldMatrixIdentity: true,
    boneWorldMatrixIdentity: true,
    normalMaterialEquivalence: true,
    silhouetteLayerIdentity: true,
    siblingParentIdentity: true,
    lifeIdentityCurrent: true,
    poseIdentity: true,
    sourceRootsAttached: true,
    sourceRootIdentityUnique: true,
    detachedLayers: 0,
    extraneousModelLayers: 0,
    extraneousHaloLayers: 0,
    duplicateSourceRootInputs: 0,
    exactModelVisible: true,
    exactModelColorWrite: true,
    exactModelOpacity: 0.34,
    exactModelDepthTestDisabled: true,
    exactModelDepthWriteDisabled: true,
    haloVisible: true,
    haloColorWrite: true,
    haloOpacity: 0.88,
    haloDepthTestDisabled: true,
    haloDepthWriteDisabled: true,
    throughGeometry: true,
    orangeHalo: true,
    proxyMeshes: 0,
    completeOperatorModels: true,
    incompleteTargets: 0,
  };
}

function readback(profile, weapon, state, artifacts, ordinal) {
  const artifactPath = `artifacts/pass73/native-ads-reveal/${profile}-${weapon}-${state}.png`;
  const artifactSha256 = ordinal.toString(16).padStart(64, '0');
  const artifactBytes = 1_000 + ordinal;
  artifacts.push({ path: artifactPath, sha256: artifactSha256, bytes: artifactBytes });
  return {
    contract: 'pass73-native-ads-reveal-hdr-roi-v1',
    x: 1_024,
    y: 400,
    width: 512,
    height: 640,
    targetWidth: 2_560,
    targetHeight: 1_440,
    bytes: 512 * 640 * 4,
    componentType: 'float16',
    channels: 4,
    nonFiniteComponents: 0,
    hash: ordinal.toString(16).padStart(8, '0'),
    controls: { viewmodelHidden: true, targetPoseFrozen: true },
    artifactPath,
    artifactSha256,
    artifactBytes,
  };
}

function cell(profile, weapon, artifacts, ordinal) {
  const stage = {
    contract: 'pass73-native-ads-reveal-staged-target-v1',
    id: `bot-${profile}-${weapon}`,
    kind: 'bot',
    team: 1,
    hostile: true,
    alive: true,
    lifeId: 0,
    continuityId: 4,
    position: [-9, 0, -21.5],
    sourceRootUuid: `root-uuid-${profile}-${weapon}`,
    sourceRootAttached: true,
    normalBodyLayers: 3,
    normalBodyHidden: false,
    targetNdc: [0, 0, 0.5],
    blockerCount: 1,
    blockers: [{ minX: -10, maxX: -8, minY: 0, maxY: 3, minZ: -18, maxZ: -17, rotation: null }],
    animatedPose: { stance: 'stand', speed: 2.4 },
  };
  const outsideReadbacks = {
    revealEnabled: readback(profile, weapon, 'outside-reveal-enabled', artifacts, ordinal),
    revealSuppressed: readback(profile, weapon, 'outside-reveal-suppressed', artifacts, ordinal + 1),
    normalHidden: readback(profile, weapon, 'outside-normal-hidden', artifacts, ordinal + 2),
  };
  const adsReadbacks = {
    revealSuppressed: readback(profile, weapon, 'ads-reveal-suppressed', artifacts, ordinal + 3),
    normalHidden: readback(profile, weapon, 'ads-normal-hidden', artifacts, ordinal + 4),
    revealShown: readback(profile, weapon, 'ads-reveal-shown', artifacts, ordinal + 5),
  };
  const route = new URL('http://127.0.0.1:4173/channels/the-big-one/');
  for (const [key, value] of Object.entries({
    release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1',
    render: profile, externalServices: 'off', traceNodeBuilds: '1',
    seed: `pass73-native-ads-reveal-${profile}-${weapon}`,
  })) route.searchParams.set(key, value);
  return {
    id: `${profile}:${weapon}`,
    profile,
    weapon,
    route: route.toString(),
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    viewport: [2_560, 1_440],
    deviceScaleFactor: 1,
    browserErrors: [],
    render: render(),
    stage,
    trustedInput: {
      source: 'playwright-page-mouse-physical-rmb',
      syntheticEvents: 0,
      events: ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].map((type) => ({ type, button: 2, isTrusted: true })),
    },
    outsideAds: {
      adsHeld: false,
      revealActiveTargets: 0,
      adsOffLeakFraction: 0,
      normalBodyLeakFraction: 0,
      readbacks: outsideReadbacks,
    },
    ads: {
      adsHeld: true,
      adsProgress: 1,
      normalBodyLeakFraction: 0,
      revealChangedFraction: 0.03,
      orangeChangedFraction: 0.006,
      revealTelemetry: revealTelemetry(stage),
      identityAfter: { ...stage },
      readbacks: adsReadbacks,
      pose: {
        firstSourceDigest: 'a1b2c3d4',
        firstModelDigest: 'a1b2c3d4',
        secondSourceDigest: 'e5f60718',
        secondModelDigest: 'e5f60718',
        lifeId: stage.lifeId,
        continuityId: stage.continuityId,
      },
    },
    release: { adsHeld: false, activeTargets: 0, throughGeometry: false, orangeHalo: false },
  };
}

function validReceipt() {
  const artifacts = [];
  const cells = [];
  let ordinal = 1;
  for (const profile of PASS73_NATIVE_ADS_REVEAL_PROFILES) {
    for (const weapon of PASS73_NATIVE_ADS_REVEAL_WEAPONS) {
      cells.push(cell(profile, weapon, artifacts, ordinal));
      ordinal += 6;
    }
  }
  return {
    schema: PASS73_NATIVE_ADS_REVEAL_SCHEMA,
    verdict: 'pass',
    source: { head, tree, clean: true, endingHead: head, endingTree: tree },
    browser: {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      executableSha256,
      version: '140.0.7339.42',
    },
    gate: {
      profiles: [...PASS73_NATIVE_ADS_REVEAL_PROFILES],
      weapons: [...PASS73_NATIVE_ADS_REVEAL_WEAPONS],
      viewport: [2_560, 1_440],
      deviceScaleFactor: 1,
      backend: 'native-hardware-webgpu',
      input: 'trusted-physical-rmb',
      compositor: 'headed-offscreen',
      cells: 4,
      skipped: 0,
      roi: { ...PASS73_NATIVE_ADS_REVEAL_ROI },
      thresholds: { ...PASS73_NATIVE_ADS_REVEAL_THRESHOLDS },
    },
    testSummary: { expected: 1, passed: 1, failed: 0, skipped: 0 },
    artifacts,
    cells,
  };
}

function expectMutation(mutator, pattern) {
  const receipt = validReceipt();
  mutator(receipt);
  assert.match(pass73NativeAdsRevealFailures(receipt, { head, tree, executableSha256 }).join('\n'), pattern);
}

test('accepts the exact clean-SHA four-cell native ADS reveal receipt', () => {
  assert.deepEqual(pass73NativeAdsRevealFailures(validReceipt(), { head, tree, executableSha256 }), []);
});

test('rejects empty ROI and stale target/life identity mutations', () => {
  expectMutation((receipt) => { receipt.cells[0].ads.readbacks.revealShown.bytes = 0; }, /empty, malformed/iu);
  expectMutation((receipt) => { receipt.cells[0].ads.revealTelemetry.targets[0].lifeId += 1; }, /stale, detached/iu);
});

test('rejects ordinary-body leaks and absent or unrestrained reveal pixels', () => {
  expectMutation((receipt) => { receipt.cells[0].ads.normalBodyLeakFraction = 0.01; }, /ADS ROI is empty, leaking/iu);
  expectMutation((receipt) => { receipt.cells[0].ads.revealChangedFraction = 0; }, /ADS ROI is empty, leaking/iu);
  expectMutation((receipt) => { receipt.cells[0].ads.orangeChangedFraction = 0.5; }, /restrained orange halo/iu);
});

test('rejects a missing weapon/profile matrix cell', () => {
  expectMutation((receipt) => { receipt.cells.pop(); }, /four ADS reveal cells|missing or duplicated/iu);
  expectMutation((receipt) => { receipt.gate.profiles = ['quality']; }, /gate matrix/iu);
  expectMutation((receipt) => { receipt.gate.weapons = ['m14-ebr']; }, /gate matrix/iu);
});

test('rejects synthetic RMB and software adapters', () => {
  expectMutation((receipt) => { receipt.cells[0].trustedInput.events[0].isTrusted = false; }, /trusted physical RMB/iu);
  expectMutation((receipt) => { receipt.cells[0].trustedInput.syntheticEvents = 1; }, /trusted physical RMB/iu);
  expectMutation((receipt) => { receipt.cells[0].render.softwareAdapter = true; }, /native hardware WebGPU/iu);
});

test('rejects detached, duplicate, or double-transformed target layers', () => {
  expectMutation((receipt) => { receipt.cells[0].ads.revealTelemetry.detachedLayers = 1; }, /complete exact animated model/iu);
  expectMutation((receipt) => { receipt.cells[0].ads.revealTelemetry.extraneousModelLayers = 1; }, /complete exact animated model/iu);
  expectMutation((receipt) => { receipt.cells[0].ads.revealTelemetry.duplicateSourceRootInputs = 1; }, /complete exact animated model/iu);
  expectMutation((receipt) => { receipt.cells[0].ads.revealTelemetry.targets[0].modelPoseDigest = 'deadbeef'; }, /stale, detached/iu);
});

test('rejects source drift and weakened frozen pixel bounds', () => {
  expectMutation((receipt) => { receipt.source.endingHead = '4'.repeat(40); }, /clean immutable Git source/iu);
  expectMutation((receipt) => { receipt.gate.thresholds.minimumRevealChangedFraction = 0; }, /frozen pixel bounds/iu);
  expectMutation((receipt) => { receipt.gate.roi.pixelDelta = 1; }, /ROI, or frozen pixel bounds/iu);
});

test('rejects a paired raster contaminated by the viewmodel or an advancing target pose', () => {
  expectMutation((receipt) => { receipt.cells[0].ads.readbacks.revealShown.controls.viewmodelHidden = false; }, /GPU ROI/iu);
  expectMutation((receipt) => { receipt.cells[0].outsideAds.readbacks.normalHidden.controls.targetPoseFrozen = false; }, /GPU ROI/iu);
});

test('accepts the checked-in spec, runner, config, and runtime static ownership', () => {
  const sources = {
    spec: readFileSync(resolve(root, 'tests/e2e/pass73-native-ads-reveal.spec.ts'), 'utf8'),
    runner: readFileSync(resolve(root, 'scripts/qa/run-pass73-native-ads-reveal.mjs'), 'utf8'),
    config: readFileSync(resolve(root, 'playwright.config.ts'), 'utf8'),
    runtime: readFileSync(resolve(root, 'src/pass73-ads-reveal-readback.ts'), 'utf8'),
    legacy: readFileSync(resolve(root, 'src/legacy-main.ts'), 'utf8'),
  };
  assert.deepEqual(pass73NativeAdsRevealStaticFailures(sources), []);
});

test('static contract rejects synthetic input, source drift gaps, unpinned Chrome, and weakened bounds', () => {
  const sources = {
    spec: "page.mouse.down({ button: 'right' }); page.mouse.up({ button: 'right' }); source: 'playwright-page-mouse-physical-rmb'; PASS73_NATIVE_ADS_REVEAL_PROFILES PASS73_NATIVE_ADS_REVEAL_WEAPONS stagePass73NativeAdsRevealTarget capturePass73NativeAdsRevealRoiTriplet",
    runner: "git('status', '--porcelain', '--untracked-files=all') git('rev-parse', 'HEAD') git('rev-parse', 'HEAD^{tree}') tests/e2e/pass73-native-ads-reveal.spec.ts PASS73_NATIVE_CHROME_SHA256 artifacts/pass73/native-ads-reveal/receipt.json",
    config: 'executablePath: pass73NativeChromePath',
    runtime: [
      'PASS73_ADS_REVEAL_ROI_WIDTH = 512',
      'PASS73_ADS_REVEAL_ROI_HEIGHT = 640',
      'PASS73_ADS_REVEAL_PIXEL_DELTA = 6',
      'PASS73_ADS_REVEAL_MIN_CHANGED_FRACTION = 0.002',
      'PASS73_ADS_REVEAL_MAX_CHANGED_FRACTION = 0.3',
      'PASS73_ADS_REVEAL_MAX_OCCLUDED_BODY_LEAK_FRACTION = 0.0015',
      'PASS73_ADS_REVEAL_MAX_ADS_OFF_LEAK_FRACTION = 0.0015',
      'PASS73_ADS_REVEAL_MIN_ORANGE_FRACTION = 0.00005',
      'PASS73_ADS_REVEAL_MAX_ORANGE_FRACTION = 0.08',
    ].join('\n'),
    legacy: 'readbackPass73NativeAdsRevealRoi setPass73AdsRevealNormalBodyHidden capturePass73NativeAdsRevealRoiTriplet pass73AdsRevealCaptureFrozenTargetId debugCaptureViewmodelHidden = true railgunPresentation.syncExactOperatorReveal(railgunRevealActive, thermalGhostPresentation.telemetry())',
  };
  assert.deepEqual(pass73NativeAdsRevealStaticFailures(sources), []);
  assert.match(pass73NativeAdsRevealStaticFailures({ ...sources, spec: `${sources.spec}; dispatchEvent(new MouseEvent('mousedown'))` }).join('\n'), /synthetic ADS/iu);
  assert.match(pass73NativeAdsRevealStaticFailures({ ...sources, runner: sources.runner.replace("git('rev-parse', 'HEAD^{tree}')", '') }).join('\n'), /HEAD\^\{tree\}/u);
  assert.match(pass73NativeAdsRevealStaticFailures({ ...sources, config: '' }).join('\n'), /hashed Chrome executable/iu);
  assert.match(pass73NativeAdsRevealStaticFailures({ ...sources, runtime: sources.runtime.replace('PIXEL_DELTA = 6', 'PIXEL_DELTA = 1') }).join('\n'), /pixel bound/iu);
  for (const token of [
    'readbackPass73NativeAdsRevealRoi',
    'setPass73AdsRevealNormalBodyHidden',
    'capturePass73NativeAdsRevealRoiTriplet',
    'railgunPresentation.syncExactOperatorReveal(railgunRevealActive, thermalGhostPresentation.telemetry())',
  ]) {
    assert.match(pass73NativeAdsRevealStaticFailures({ ...sources, legacy: sources.legacy.replaceAll(token, '') }).join('\n'), /runtime is missing/iu);
  }
});
