import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  PASS73_LIVE_GRAPHICS_PIXEL_FLOORS,
  PASS73_LIVE_GRAPHICS_SCHEMA,
  PASS73_LIVE_GRAPHICS_VIEWPORT,
  assertPass73LiveGraphicsReceipt,
  pass73LiveGraphicsFailures,
} from './pass73-live-graphics-contract.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);
const STAGED_TREE = 'c'.repeat(64);
const TOPOLOGY_SHA = 'd'.repeat(64);
const BROWSER_SHA = 'e'.repeat(64);
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_URL = 'http://127.0.0.1:44273/channels/the-big-one/';
const SOURCE_EVIDENCE = Object.freeze(['channels/the-big-one/assets/index-AbC123.js']);
const TOTAL_PIXELS = PASS73_LIVE_GRAPHICS_VIEWPORT[0] * PASS73_LIVE_GRAPHICS_VIEWPORT[1];

const expected = Object.freeze({
  sourceSha: SOURCE_SHA,
  sourceTree: SOURCE_TREE,
  topologySchemaVersion: 5,
  releasePass: 'PASS 73',
  treeSha256: STAGED_TREE,
  exactRootFileCount: 512,
  topologyReceiptSha256: TOPOLOGY_SHA,
  sourceEvidenceFiles: SOURCE_EVIDENCE,
  browserExecutablePath: BROWSER_PATH,
  browserExecutableSha256: BROWSER_SHA,
  baseUrl: BASE_URL,
});

function nativeRuntime(samples) {
  return {
    requestedBackend: 'webgpu',
    actualBackend: 'webgpu',
    initialized: true,
    failClosed: false,
    adapterLabel: 'NVIDIA GeForce RTX 5080',
    adapterClass: 'GPUAdapter',
    deviceClass: 'GPUDevice',
    softwareAdapter: false,
    deviceLost: false,
    uncapturedErrors: 0,
    canvasAlphaMode: 'opaque',
    canvasAntialias: samples > 1,
    canvasSamples: samples,
    principalHdrSamples: samples,
    bloomSamples: 1,
    renderPipelineApi: 'three-r185-render-pipeline',
    presentation: {
      status: 'healthy', submissionSequence: 220, completedSequence: 220,
      maximumInFlightSubmissions: 2, completionFailures: 0, lastFailure: null,
    },
  };
}

function lighting(profile) {
  const quality = profile === 'blender';
  return {
    hemisphereSky: quality ? '#c7dcff' : '#aac6e9',
    hemisphereGround: quality ? '#82715f' : '#635a50',
    fillColor: quality ? '#ffe2b4' : '#c9d6e4',
    fillPosition: quality ? [18, 25, -11] : [12, 18, -8],
    runtime: {
      hemisphere: {
        color: quality ? '#c7dcff' : '#aac6e9',
        groundColor: quality ? '#82715f' : '#635a50',
        intensity: quality ? 1 : 0.4,
      },
      fill: {
        color: quality ? '#ffe2b4' : '#c9d6e4',
        position: quality ? [18, 25, -11] : [12, 18, -8],
        intensity: quality ? 0.8 : 0.3,
      },
      sun: { castShadow: quality },
    },
  };
}

function advanced(profile, principalSamples) {
  const quality = profile === 'blender';
  return {
    principalSamples,
    oceanWaveAmplitude: 1.55,
    volumetricActual: {
      scale: quality ? 1 : 0.5,
      mistOpacity: quality ? 0.5 : 0.2,
      smokeOpacity: quality ? 0.4 : 0.1,
      dustOpacity: quality ? 0.3 : 0.1,
      dustMotes: quality ? 96 : 48,
    },
    bloomStrength: quality ? 0.55 : 0.15,
    filmGrainScale: quality ? 0.32 : 0.1,
  };
}

function activePhase({
  liveProfile,
  constructionProfile,
  preset,
  documentId,
  timeOrigin,
  frameCount,
  matchEpoch,
  reconstructed = false,
}) {
  const qualityOwners = liveProfile === 'blender';
  const principalSamples = constructionProfile === 'blender' ? 4 : 1;
  const staged = liveProfile === 'performance' && constructionProfile === 'blender'
    ? ['antiAliasing', 'geometryDetail']
    : [];
  const pending = staged.length > 0;
  return {
    document: { id: documentId, timeOrigin },
    gameStarted: true,
    matchPhase: 'active',
    menuVisible: false,
    frameCount,
    matchEpoch,
    player: { id: 'local-player', team: 0, position: [4, 1.8, -7], yaw: 0.25, pitch: -0.08, hp: 100 },
    settings: {
      displayedGraphicsPreset: preset,
      requestedPreset: preset,
      liveApplication: { profile: liveProfile, pendingRendererReload: pending, stagedReconstruction: staged },
    },
    ui: {
      effectiveLabel: pending
        ? 'APPLIED LIVE: PERFORMANCE DPR / LIGHTING / EFFECTS · FULL PRESET NEXT ARENA: ANTIALIASING + GEOMETRYDETAIL'
        : `EFFECTIVE: ${preset.toUpperCase()}`,
      graphicsModeLabel: preset === 'high' ? 'QUALITY' : 'PERFORMANCE',
      graphicsStaged: staged.join(','),
      graphicsPreset: preset,
      graphicsLiveProfile: liveProfile,
    },
    render: {
      profile: constructionProfile,
      liveProfile,
      representation: constructionProfile === 'blender' ? 'blender' : 'responsive',
      pixelRatio: qualityOwners ? 1 : 0.75,
      drawingBuffer: qualityOwners ? [2_560, 1_440] : [1_920, 1_080],
      shadows: qualityOwners,
      authoredShadows: qualityOwners,
      shadowMode: 'static',
      graphicsApplication: {
        requestedProfile: liveProfile,
        constructionProfile,
        state: pending ? 'live-safe-applied-topology-pending' : 'fully-effective',
        fullPresetEffective: !pending,
        pendingRendererReload: pending,
        stagedReconstruction: staged,
      },
      runtime: nativeRuntime(principalSamples),
      post: {
        owner: 'pass64-webgpu-tsl',
        liveProfile,
        canvasAntialias: principalSamples === 4,
        canvasSamples: principalSamples,
        principalHdrSamples: principalSamples,
        bloomSamples: 1,
        advancedGraphics: advanced(liveProfile, principalSamples),
      },
      lighting: lighting(liveProfile),
      contrast: {
        profile: liveProfile,
        activeLights: qualityOwners ? 4 : 0,
        shadowCastingLights: qualityOwners ? 2 : 0,
      },
      refinement: {
        profile: liveProfile,
        budget: {
          environmentIntensity: qualityOwners ? 0.85 : 0.55,
          bloomStrength: qualityOwners ? 0.6 : 0.2,
          particleDensityScale: qualityOwners ? 1 : 0.5,
        },
      },
      atmosphere: {
        profile: liveProfile,
        dustMotes: qualityOwners ? 100 : 50,
        mistOpacity: qualityOwners ? 0.4 : 0.2,
        smokeOpacity: qualityOwners ? 0.3 : 0.1,
        dustOpacity: qualityOwners ? 0.2 : 0.05,
      },
      water: { waveAmp: 1.55, waveAuthority: 'rustworks-ocean-v2' },
      playableScene: {
        authoritativeArenaRoots: 1,
        authoritativeArenaRootIsGameplayRoot: true,
        duplicateArenaRoots: false,
        actualArenaVisualPolicy: {
          definitionId: 'atomic-acres',
          shadows: { enabled: qualityOwners, sunCastShadow: qualityOwners },
        },
        tslSystemVisibility: { waterWaveAmplitude: 1.55, waterWaveAuthority: 'rustworks-ocean-v2' },
      },
      roots: {
        proceduralRootActuallyVisible: constructionProfile !== 'blender',
        qualityArtRootVisible: constructionProfile === 'blender',
        overlappingPrimaryArenaRoots: false,
      },
      qualityAssetState: 'ready',
    },
    reconstructed,
  };
}

function validReceipt() {
  const quality = activePhase({
    liveProfile: 'blender', constructionProfile: 'blender', preset: 'high',
    documentId: 'quality-document', timeOrigin: 1_000, frameCount: 200, matchEpoch: 11,
  });
  const performanceLive = activePhase({
    liveProfile: 'performance', constructionProfile: 'blender', preset: 'performance',
    documentId: 'quality-document', timeOrigin: 1_000, frameCount: 210, matchEpoch: 11,
  });
  const performanceReconstructed = activePhase({
    liveProfile: 'performance', constructionProfile: 'performance', preset: 'performance',
    documentId: 'performance-document', timeOrigin: 2_000, frameCount: 40, matchEpoch: 12, reconstructed: true,
  });
  const postReloadMenu = structuredClone(performanceReconstructed);
  postReloadMenu.gameStarted = false;
  postReloadMenu.matchPhase = 'idle';
  postReloadMenu.menuVisible = true;
  const stagedCandidate = {
    schemaVersion: 5, channel: 'the-big-one', releasePass: 'PASS 73', sourceSha: SOURCE_SHA,
    path: 'channels/the-big-one', exactRootFileCount: 512, treeSha256: STAGED_TREE,
  };
  const changedPixels = 737_280;
  return {
    schema: PASS73_LIVE_GRAPHICS_SCHEMA,
    verdict: 'pass',
    zeroSkips: true,
    sourceState: {
      startingSha: SOURCE_SHA, endingSha: SOURCE_SHA, expectedSha: SOURCE_SHA,
      startingTree: SOURCE_TREE, endingTree: SOURCE_TREE, expectedTree: SOURCE_TREE,
      cleanBefore: true, cleanAfter: true,
    },
    topology: {
      serverKind: 'built-staged-release-topology-vite-preview', buildMode: 'production', devServer: false,
      baseUrl: BASE_URL, receiptSha256: TOPOLOGY_SHA,
      sourceEvidenceFiles: [...SOURCE_EVIDENCE],
      stagedCandidate, servedCandidate: structuredClone(stagedCandidate), servedCandidateAfter: structuredClone(stagedCandidate),
      resources: {
        urls: ['/channels/the-big-one/assets/index-AbC123.js', '/channels/the-big-one/channel-provenance.json'],
        devServerUrls: [],
      },
    },
    browser: {
      channel: 'installed-chrome', executablePath: BROWSER_PATH, executableSha256: BROWSER_SHA,
      endingExecutableSha256: BROWSER_SHA, version: 'Chrome/140.0.0.0',
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', headless: false,
      contentViewport: [2_560, 1_440], devicePixelRatio: 1,
    },
    route: `${BASE_URL}?renderer=webgpu&requireWebGPU=1&externalServices=off&map=atomic-acres&seed=7301`,
    phases: { quality, performanceLive, postReloadMenu, performanceReconstructed },
    lifecycle: {
      liveApply: { elapsedMs: 350, navigationCountDelta: 0, qualityDocumentId: 'quality-document', performanceDocumentId: 'quality-document' },
      reconstruction: {
        returnedVia: 'main-menu-button', navigationCount: 1, documentReplaced: true,
        qualityDocumentId: 'quality-document', reconstructedDocumentId: 'performance-document',
        timeOrigins: [1_000, 2_000],
      },
    },
    pixels: {
      qualityToLivePerformance: {
        dimensions: [2_560, 1_440], totalPixels: TOTAL_PIXELS, changedPixels,
        changedRatio: changedPixels / TOTAL_PIXELS, meanAbsoluteChannelDifference: 8.4,
      },
    },
    screenshots: [
      { id: 'quality', path: 'artifacts/pass73/live-graphics/quality.png', bytes: 10_000, sha256: '1'.repeat(64), dimensions: [2_560, 1_440] },
      { id: 'performance-live', path: 'artifacts/pass73/live-graphics/performance-live.png', bytes: 9_000, sha256: '2'.repeat(64), dimensions: [2_560, 1_440] },
      { id: 'performance-reconstructed', path: 'artifacts/pass73/live-graphics/performance-reconstructed.png', bytes: 8_000, sha256: '3'.repeat(64), dimensions: [2_560, 1_440] },
    ],
    browserErrors: [],
  };
}

function mutate(path, value) {
  const receipt = validReceipt();
  const keys = path.split('.');
  let owner = receipt;
  for (const key of keys.slice(0, -1)) owner = owner[key];
  owner[keys.at(-1)] = value;
  return receipt;
}

function expectRejected(receipt, pattern) {
  const failures = pass73LiveGraphicsFailures(receipt, expected);
  assert.ok(failures.length > 0, 'mutation unexpectedly passed');
  assert.match(failures.join('\n'), pattern);
}

test('accepts one exact staged headed-hardware Quality -> Performance lifecycle receipt', () => {
  assert.deepEqual(pass73LiveGraphicsFailures(validReceipt(), expected), []);
  assert.equal(assertPass73LiveGraphicsReceipt(validReceipt(), expected).verdict, 'pass');
});

test('rejects label-only Performance when the real render owners remain Quality', () => {
  const receipt = validReceipt();
  const qualityRender = structuredClone(receipt.phases.quality.render);
  qualityRender.liveProfile = 'performance';
  qualityRender.graphicsApplication.requestedProfile = 'performance';
  qualityRender.post.liveProfile = 'performance';
  qualityRender.refinement.profile = 'performance';
  qualityRender.contrast.profile = 'performance';
  qualityRender.atmosphere.profile = 'performance';
  receipt.phases.performanceLive.render = qualityRender;
  expectRejected(receipt, /did not lower real|did not change every real shadow owner|did not retire real arena contrast lights/u);
});

test('rejects each unchanged real live owner independently', async (t) => {
  const ownerPaths = [
    'render.pixelRatio',
    'render.drawingBuffer',
    'render.lighting.runtime.hemisphere.intensity',
    'render.lighting.runtime.fill.intensity',
    'render.post.advancedGraphics.volumetricActual.scale',
    'render.post.advancedGraphics.volumetricActual.mistOpacity',
    'render.post.advancedGraphics.volumetricActual.smokeOpacity',
    'render.post.advancedGraphics.volumetricActual.dustOpacity',
    'render.post.advancedGraphics.volumetricActual.dustMotes',
    'render.post.advancedGraphics.bloomStrength',
    'render.post.advancedGraphics.filmGrainScale',
    'render.refinement.budget.environmentIntensity',
    'render.refinement.budget.bloomStrength',
    'render.refinement.budget.particleDensityScale',
    'render.atmosphere.dustMotes',
    'render.atmosphere.mistOpacity',
    'render.atmosphere.smokeOpacity',
    'render.atmosphere.dustOpacity',
    'render.shadows',
    'render.authoredShadows',
    'render.lighting.runtime.sun.castShadow',
    'render.playableScene.actualArenaVisualPolicy.shadows.enabled',
    'render.playableScene.actualArenaVisualPolicy.shadows.sunCastShadow',
    'render.contrast.activeLights',
    'render.contrast.shadowCastingLights',
  ];
  for (const ownerPath of ownerPaths) {
    await t.test(ownerPath, () => {
      const receipt = validReceipt();
      const keys = ownerPath.split('.');
      let qualityOwner = receipt.phases.quality;
      let performanceOwner = receipt.phases.performanceLive;
      for (const key of keys.slice(0, -1)) {
        qualityOwner = qualityOwner[key];
        performanceOwner = performanceOwner[key];
      }
      performanceOwner[keys.at(-1)] = structuredClone(qualityOwner[keys.at(-1)]);
      assert.ok(pass73LiveGraphicsFailures(receipt, expected).length > 0, `${ownerPath} mutation passed`);
    });
  }
});

test('rejects a consistently wrong water amplitude instead of accepting phase agreement', () => {
  const receipt = validReceipt();
  for (const phase of [receipt.phases.quality, receipt.phases.performanceLive, receipt.phases.performanceReconstructed]) {
    phase.render.water.waveAmp = 1.2;
    phase.render.post.advancedGraphics.oceanWaveAmplitude = 1.2;
    phase.render.playableScene.tslSystemVisibility.waterWaveAmplitude = 1.2;
  }
  expectRejected(receipt, /water amplitude diverged/u);
});

test('rejects a player or match reset during the live apply', () => {
  const receipt = validReceipt();
  receipt.phases.performanceLive.player.id = 'replacement-player';
  receipt.phases.performanceLive.matchEpoch += 1;
  expectRejected(receipt, /reset or replaced player\/match authority/u);
});

test('rejects missing renderer reconstruction consumption', () => {
  const receipt = validReceipt();
  const reconstructed = receipt.phases.performanceReconstructed;
  reconstructed.render.profile = 'blender';
  reconstructed.render.representation = 'blender';
  reconstructed.render.graphicsApplication.constructionProfile = 'blender';
  reconstructed.render.graphicsApplication.pendingRendererReload = true;
  reconstructed.render.graphicsApplication.stagedReconstruction = ['antiAliasing', 'geometryDetail'];
  expectRejected(receipt, /reconstruction did not consume|post-reload menu did not own/u);
});

test('rejects headless Chrome and software WebGPU evidence', () => {
  expectRejected(mutate('browser.headless', true), /not exact installed headed Chrome/u);
  expectRejected(mutate('phases.quality.render.runtime.softwareAdapter', true), /not native hardware WebGPU/u);
  expectRejected(mutate('phases.quality.render.runtime.adapterLabel', 'Google SwiftShader'), /not native hardware WebGPU/u);
});

test('rejects dev-server bytes and an unowned server label', () => {
  const receipt = validReceipt();
  receipt.topology.serverKind = 'vite-development-server';
  receipt.topology.devServer = true;
  receipt.topology.resources.urls.push('/@vite/client', '/src/legacy-main.ts');
  receipt.topology.resources.devServerUrls.push('/@vite/client', '/src/legacy-main.ts');
  expectRejected(receipt, /built\/staged\/served|production asset graph/u);
});

test('rejects missing source-SHA evidence in the actually served asset graph', () => {
  const receipt = validReceipt();
  receipt.topology.sourceEvidenceFiles = [];
  expectRejected(receipt, /production asset graph/u);
});

test('rejects source SHA, tree, or clean-state drift', () => {
  expectRejected(mutate('sourceState.endingSha', 'f'.repeat(40)), /source HEAD\/tree\/clean identity drifted/u);
  expectRejected(mutate('sourceState.endingTree', 'f'.repeat(40)), /source HEAD\/tree\/clean identity drifted/u);
  expectRejected(mutate('sourceState.cleanAfter', false), /source HEAD\/tree\/clean identity drifted/u);
});

test('rejects weak, internally inconsistent, or byte-identical paired pixel evidence', () => {
  const weak = validReceipt();
  weak.pixels.qualityToLivePerformance.changedPixels = Math.floor(TOTAL_PIXELS * PASS73_LIVE_GRAPHICS_PIXEL_FLOORS.changedRatio);
  weak.pixels.qualityToLivePerformance.changedRatio = weak.pixels.qualityToLivePerformance.changedPixels / TOTAL_PIXELS;
  weak.pixels.qualityToLivePerformance.meanAbsoluteChannelDifference = PASS73_LIVE_GRAPHICS_PIXEL_FLOORS.meanAbsoluteChannelDifference;
  expectRejected(weak, /paired gameplay pixels/u);

  const inconsistent = validReceipt();
  inconsistent.pixels.qualityToLivePerformance.changedRatio = 0.9;
  expectRejected(inconsistent, /paired gameplay pixels/u);

  const identical = validReceipt();
  identical.screenshots[1].sha256 = identical.screenshots[0].sha256;
  expectRejected(identical, /byte-identical/u);
});

test('rejects skipped or browser-error evidence', () => {
  expectRejected(mutate('zeroSkips', false), /zero-skip/u);
  expectRejected(mutate('browserErrors', ['GPU validation error']), /browser-error/u);
});

test('owned runner architecture remains built, staged, headed, and installed-Chrome only', () => {
  const repositoryRoot = resolve(import.meta.dirname, '..', '..');
  const wrapper = readFileSync(resolve(repositoryRoot, 'scripts/qa/verify-pass73-live-graphics.mjs'), 'utf8');
  const browser = readFileSync(resolve(repositoryRoot, 'scripts/qa/run-pass73-live-graphics-browser.mjs'), 'utf8');
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
  assert.doesNotMatch(wrapper, /createServer/u);
  assert.match(wrapper, /node_modules', 'vite', 'bin', 'vite\.js'/u);
  assert.match(wrapper, /stage-release-topology\.mjs/u);
  assert.match(wrapper, /await preview\(/u);
  assert.match(wrapper, /VITE_MATCH_BUILD_ID: expectedSourceSha/u);
  assert.match(wrapper, /PASS73_LIVE_GRAPHICS_SOURCE_SHA/u);
  assert.match(browser, /headless: false/u);
  assert.doesNotMatch(browser, /headless: true/u);
  assert.match(browser, /--disable-software-rasterizer/u);
  assert.match(browser, /--use-angle=d3d11/u);
  assert.match(browser, /returnToMainMenu|#main-menu/u);
  assert.equal(packageJson.scripts['qa:pass73:live-graphics'], 'node scripts/qa/verify-pass73-live-graphics.mjs');
});
