import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hardwareAdapterVendor,
  nextOuterRectForContentViewport,
  ownedBrowserVerifierReceiptFailures,
  stagedTopologyFailures,
} from './pass66-owned-browser-verifier-contract.mjs';
import {
  PASS66_MULTIPLAYER_BROWSER_CHANNEL,
  PASS66_MULTIPLAYER_SPECS,
} from './pass66-multiplayer-stability-contract.mjs';

const sourceSha = 'a'.repeat(40);
const treeSha256 = 'b'.repeat(64);
const browserExecutableSha256 = 'c'.repeat(64);
const browserExecutablePath = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/opt/google/chrome/chrome';
const candidate = {
  schemaVersion: 4,
  channel: 'the-big-one',
  releasePass: 'PASS 66',
  sourceSha,
  path: 'channels/the-big-one',
  exactRootFileCount: 12,
  treeSha256,
};

test('accepts only the exact staged Pass 66 candidate identity', () => {
  const topology = {
    schemaVersion: 4,
    sourceSha,
    releasePass: 'PASS 66',
    root: { kind: 'chooser-only' },
    channels: { experimental: candidate },
  };
  assert.deepEqual(stagedTopologyFailures(topology, sourceSha), []);
  assert.match(stagedTopologyFailures({ ...topology, sourceSha: 'c'.repeat(40) }, sourceSha).join('\n'), /sourceSha mismatch/u);
  assert.match(stagedTopologyFailures({
    ...topology,
    channels: { experimental: { ...candidate, treeSha256: 'stale' } },
  }, sourceSha).join('\n'), /tree digest/u);
});

test('accepts a current multiplayer release pass without weakening staged source identity', () => {
  const topology = {
    schemaVersion: 4,
    sourceSha,
    releasePass: 'PASS 70',
    root: { kind: 'chooser-only' },
    channels: { experimental: { ...candidate, releasePass: 'PASS 70' } },
  };
  assert.deepEqual(stagedTopologyFailures(topology, sourceSha, 'PASS 70'), []);
  assert.match(stagedTopologyFailures(topology, sourceSha, 'PASS 69').join('\n'), /releasePass/u);
});

test('binds schema 5 Pass 73 topology and compensates outer chrome to an exact content viewport', () => {
  const topology = {
    schemaVersion: 5,
    sourceSha,
    releasePass: 'PASS 73',
    root: { kind: 'chooser-only' },
    channels: { experimental: { ...candidate, schemaVersion: 5, releasePass: 'PASS 73' } },
  };
  assert.deepEqual(stagedTopologyFailures(topology, sourceSha, 'PASS 73', 5), []);
  assert.match(stagedTopologyFailures(topology, sourceSha, 'PASS 73', 4).join('\n'), /schemaVersion/u);
  assert.deepEqual(nextOuterRectForContentViewport({
    innerWidth: 2_500, innerHeight: 1_300, outerWidth: 2_516, outerHeight: 1_390,
  }), { width: 2_576, height: 1_530 });
  assert.throws(() => nextOuterRectForContentViewport({
    innerWidth: 0, innerHeight: 1_300, outerWidth: 2_516, outerHeight: 1_390,
  }), /positive integer/u);
  assert.equal(hardwareAdapterVendor('0x10de / 0x2c02'), 'nvidia');
  assert.equal(hardwareAdapterVendor('Intel(R) Graphics / 0x8086'), 'intel');
  assert.equal(hardwareAdapterVendor('Default Adapter'), null);
});

test('rejects stale or incomplete installed-Firefox receipts', () => {
  const currentCandidate = { ...candidate, schemaVersion: 5, releasePass: 'PASS 73' };
  const coldRoute = 'http://127.0.0.1:4526/channels/the-big-one/?release=latest&map=atomic-acres&renderer=webgpu&requireWebGPU=1&render=quality&externalServices=off&multiplayerQa=1&seed=pass73-installed-browser-webgpu-cold';
  const route = 'http://127.0.0.1:4526/channels/the-big-one/?release=latest&map=atomic-acres&renderer=webgpu&requireWebGPU=1&render=quality&externalServices=off&multiplayerQa=1&seed=pass73-installed-browser-webgpu-parity';
  const graphicsContract = {
    arenaId: 'atomic-acres', humanProfile: 'quality', internalRenderProfile: 'blender',
    renderer: {
      requestedBackend: 'webgpu', actualBackend: 'webgpu', pixelRatio: 1,
      drawingBuffer: [2_560, 1_440], viewport: [2_560, 1_440], shadows: true,
      authoredShadows: true, shadowMode: 'static', canvasAntialias: true,
      canvasSamples: 4, principalHdrSamples: 4, bloomSamples: 0,
      renderPipelineApi: 'three-r185-render-pipeline',
    },
    effects: {
      depthAwareBloom: true,
      advancedGraphics: { bloomStrength: 0.14, volumetricScale: 1 },
      lighting: { profile: 'blender' }, sky: { linearHdr: true },
      grass: { enabled: true }, atmosphere: { enabled: true }, water: { enabled: false },
    },
    assets: {
      qualityAssetState: 'ready', qualityArtRootVisible: true,
      proceduralRootActuallyVisible: false, overlappingPrimaryArenaRoots: false,
      asset: './assets/original/models/atomic-acres-blender-arena.glb?v=test',
      meshCount: 120, triangleCount: 42_000, surfaceSeparationPass: true,
      worldIdentityPass: true, proceduralWorldHidden: true,
    },
  };
  const performance = {
    metricSource: 'webgpu-submission', elapsedMs: 5_100,
    callbackSampleCount: 280, callbackFps: 280 * 1_000 / 5_100, submissionSampleCount: 180,
    frameDelta: 282, submissionDelta: 280, completionDelta: 279, completionCaughtUp: true,
    p50FrameTimeMs: 17, p95FrameTimeMs: 20, p99FrameTimeMs: 24,
    maximumFrameTimeMs: 42,
    finalPresentation: {
      status: 'healthy', submissionSequence: 500, completedSequence: 499, maximumInFlightSubmissions: 2,
    },
  };
  const cycle = {
    label: 'cold', requestedBackend: 'webgpu', backend: 'webgpu', failClosed: false,
    deviceLost: false, uncapturedErrors: 0, liveProfile: 'blender', qualityAssetState: 'ready',
    adapterLabel: 'NVIDIA GeForce RTX 5080', adapterClass: 'GPUAdapter', deviceClass: 'GPUDevice',
    adapterVendor: 'nvidia', softwareAdapter: false,
    viewport: [2_560, 1_440], pixelRatio: 1, drawingBuffer: [2_560, 1_440],
    post: { depthAwareBloom: true, advancedGraphics: { bloomStrength: 0.14, volumetricScale: 1 } },
    performance, graphicsContract, route, userAgent: 'Mozilla/5.0 Firefox/142.0',
    gameStarted: true, matchPhase: 'active', navigatorGpu: true,
    visibilityState: 'visible', documentHasFocus: true,
  };
  const chromeCycle = {
    ...cycle, userAgent: 'Mozilla/5.0 HeadlessChrome/140.0.0.0',
    performance: { ...performance, p50FrameTimeMs: 16, p95FrameTimeMs: 18 },
  };
  const chrome = {
    browserVersion: '140.0.0.0', executable: browserExecutablePath,
    executableSha256: browserExecutableSha256, headless: true, presentationMode: 'headless',
    nativeUserAgent: true, userAgent: chromeCycle.userAgent,
    cycles: [{ ...chromeCycle, label: 'cold', route: coldRoute }, { ...chromeCycle, label: 'warm' }],
    viewportControl: {
      mechanism: 'playwright-content-viewport', requestedContentViewport: [2_560, 1_440], matched: true,
      final: { innerWidth: 2_560, innerHeight: 1_440, outerWidth: 2_560, outerHeight: 1_440, devicePixelRatio: 1 },
    },
  };
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    gate: 'installed-firefox',
    releasePass: 'PASS 73',
    topologySchemaVersion: 5,
    sourceSha,
    servedCandidate: currentCandidate,
    servedCandidateAfter: currentCandidate,
    browser: 'installed-firefox',
    executable: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    hiddenHeadful: false,
    cycles: [{ ...cycle, route: coldRoute }, { ...cycle, label: 'warm' }],
    firefoxSessionClosedBeforeChrome: true,
    toolchain: {
      firefox: {
        executable: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
        executableSha256: 'd'.repeat(64), browserVersion: '142.0', headless: true,
        presentationMode: 'headless', graphicsMode: 'default', nativeUserAgent: true, userAgent: cycle.userAgent,
      },
      chrome: {
        executable: browserExecutablePath, executableSha256: browserExecutableSha256, browserVersion: chrome.browserVersion,
        headless: true, presentationMode: 'headless', nativeUserAgent: true, userAgent: chrome.userAgent,
      },
    },
    viewportControl: {
      firefox: {
        mechanism: 'webdriver-outer-compensation', requestedContentViewport: [2_560, 1_440], matched: true,
        attempts: [{
          requestedOuterRect: { width: 2_576, height: 1_530 },
          sample: {
            innerWidth: 2_560, innerHeight: 1_440, outerWidth: 2_576, outerHeight: 1_530,
            devicePixelRatio: 1, windowRect: { width: 2_576, height: 1_530, x: 0, y: 0 },
          },
        }],
        final: {
          innerWidth: 2_560, innerHeight: 1_440, outerWidth: 2_576, outerHeight: 1_530,
          devicePixelRatio: 1, windowRect: { width: 2_576, height: 1_530, x: 0, y: 0 },
        },
      },
      chrome: chrome.viewportControl,
    },
    parity: {
      contract: 'same-content-matched-mode-native-webgpu-firefox-chrome-80pct-median-125pct-p95-v2',
      seed: 'pass73-installed-browser-webgpu-parity', viewport: [2_560, 1_440],
      routeParameters: {
        release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1', render: 'quality',
        externalServices: 'off', multiplayerQa: '1',
      },
      profile: 'quality', internalRenderProfile: 'blender', map: 'atomic-acres', backend: 'webgpu',
      presentationMode: 'headless', chrome,
      firefoxMedianThroughputFps: 1_000 / 17, chromeMedianThroughputFps: 1_000 / 16,
      medianThroughputRatio: 16 / 17, p95FrameTimeRatio: 20 / 18,
      identicalGraphicsContract: true, passed: true,
    },
    sourceState: { startingSha: sourceSha, endingSha: sourceSha, cleanBefore: true, cleanAfter: true },
  };
  const expected = {
    gate: 'installed-firefox', releasePass: 'PASS 73', topologySchemaVersion: 5,
    sourceSha, treeSha256, exactRootFileCount: 12,
    baseUrl: 'http://127.0.0.1:4526/channels/the-big-one/',
  };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    cycles: [receipt.cycles[0], { ...receipt.cycles[1], backend: null }],
  }, expected).join('\n'), /native-WebGPU admission identity/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    parity: {
      ...receipt.parity,
      chrome: {
        ...chrome,
        cycles: chrome.cycles.map((entry) => ({
          ...entry, adapterLabel: 'Intel Arc Graphics', adapterVendor: 'intel',
        })),
      },
    },
  }, expected).join('\n'), /paired installed Chrome/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    cycles: [receipt.cycles[0], { ...receipt.cycles[1], failClosed: true }],
  }, expected).join('\n'), /native-WebGPU admission identity/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    servedCandidate: { ...currentCandidate, sourceSha: 'c'.repeat(40) },
  }, expected).join('\n'), /served candidate sourceSha mismatch/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    servedCandidateAfter: { ...currentCandidate, treeSha256: 'f'.repeat(64) },
  }, expected).join('\n'), /served candidate tree digest mismatch/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    parity: { ...receipt.parity, medianThroughputRatio: 0.79 },
  }, expected).join('\n'), /paired installed Chrome/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    parity: {
      ...receipt.parity,
      chrome: {
        ...chrome,
        cycles: chrome.cycles.map((entry, index) => index === 1
          ? { ...entry, adapterLabel: 'Google SwiftShader', softwareAdapter: true }
          : entry),
      },
    },
  }, expected).join('\n'), /native-WebGPU admission identity/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    cycles: [receipt.cycles[0], {
      ...receipt.cycles[1], performance: { ...performance, metricSource: 'animation-frame' },
    }],
  }, expected).join('\n'), /submission performance evidence/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    viewportControl: {
      ...receipt.viewportControl,
      firefox: {
        ...receipt.viewportControl.firefox,
        final: { ...receipt.viewportControl.firefox.final, innerHeight: 1_340 },
      },
    },
  }, expected).join('\n'), /content viewport control/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    parity: { ...receipt.parity, chrome: { ...chrome, headless: false, presentationMode: 'headed' } },
  }, expected).join('\n'), /paired installed Chrome/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    parity: {
      ...receipt.parity,
      chrome: {
        ...chrome,
        cycles: chrome.cycles.map((entry, index) => index === 1
          ? { ...entry, graphicsContract: { ...entry.graphicsContract, humanProfile: 'performance' } }
          : entry),
      },
    },
  }, expected).join('\n'), /Quality graphics\/assets\/effects|paired installed Chrome/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    sourceState: { ...receipt.sourceState, cleanAfter: false },
  }, expected).join('\n'), /clean source/u);
});

test('requires tokenized owned local signaling in the private-lobby receipt', () => {
  const peerPath = `/peerjs-${'c'.repeat(24)}`;
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    gate: 'private-lobby',
    sourceSha,
    servedCandidate: candidate,
    schema: 'atomic-acres/pass66-private-lobby@2',
    ownedPeer: { host: '127.0.0.1', port: 9077, path: peerPath, localOnly: true },
    errors: [],
    soloHostNoBots: { startActsAsReadyCommit: true, active: true, humans: 1, bots: 0 },
    soloHostWithBots: { startActsAsReadyCommit: true, active: true, humans: 1, bots: 4 },
    rejoinRecovered: true,
    rejoinIdentityPreserved: true,
    sixPlayersAdmitted: true,
    allReady: true,
  };
  const expected = {
    gate: 'private-lobby', sourceSha, treeSha256, exactRootFileCount: 12, peerPort: 9077, peerPath,
  };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    ownedPeer: { ...receipt.ownedPeer, path: '/peerjs' },
  }, expected).join('\n'), /owned PeerJS identity mismatch/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    soloHostNoBots: { ...receipt.soloHostNoBots, startActsAsReadyCommit: false },
  }, expected).join('\n'), /solo host-start proof/u);
});

test('rejects weakened or unowned Pass 61 authoritative-netcode evidence', () => {
  const peerPath = `/peerjs-${'d'.repeat(24)}`;
  const receipt = {
    schemaVersion: 1,
    schema: 'atomic-acres/pass61-authoritative-netcode@1',
    status: 'PASS',
    gate: 'pass61-netcode',
    sourceSha,
    servedCandidate: candidate,
    ownedPeer: { host: '127.0.0.1', port: 9081, path: peerPath, localOnly: true },
    errors: [],
    hostAccepted: 7,
    guestCreated: 7,
    guestConfirmed: 7,
    hostHealthAfter: 30,
    exactAgreement: true,
    resolverMatchesReportedRewind: true,
    delayFitsRewindBudget: true,
    transportTimingCaptured: true,
    resolutionTraces: Array.from({ length: 7 }, (_, index) => ({ shot: index + 1 })),
  };
  const expected = {
    gate: 'pass61-netcode', sourceSha, treeSha256, exactRootFileCount: 12, peerPort: 9081, peerPath,
  };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    ownedPeer: { ...receipt.ownedPeer, path: '/peerjs' },
  }, expected).join('\n'), /owned PeerJS identity mismatch/u);
  assert.match(ownedBrowserVerifierReceiptFailures({ ...receipt, hostAccepted: 6 }, expected).join('\n'), /damage counts/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    resolverMatchesReportedRewind: false,
  }, expected).join('\n'), /timing and agreement/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    resolutionTraces: receipt.resolutionTraces.slice(0, 6),
  }, expected).join('\n'), /exactly seven resolution traces/u);
});

test('requires one byte-bound top-panel action surface for both supports across the resolution matrix', () => {
  const supportCases = ['chopper', 'piloted-drone'];
  const viewports = supportCases.flatMap((supportId) => [
    ['700x720', 700, 720],
    ['960x540', 960, 540],
    ['1280x720', 1_280, 720],
    ['2560x1440', 2_560, 1_440],
    ['3840x2160', 3_840, 2_160],
  ].map(([label, width, height]) => ({
    supportId,
    label,
    width,
    height,
    actionBounds: { left: 20, top: 90, right: 300, bottom: 112, width: 280, height: 22 },
    infoBounds: { left: 20, top: 40, right: 300, bottom: 120, width: 280, height: 80 },
    actionFontSize: 12,
    actionLineHeight: 14,
    actionText: supportId === 'chopper'
      ? 'CHOPPER READY · PRESS 5 AGAIN TO OPERATE · AI FLIGHT CONTINUES'
      : 'DRONE READY · PRESS 5 AGAIN TO PILOT · AI FLIGHT CONTINUES',
    actionCount: 1,
    legacyStandalonePromptCount: 0,
    awaitingOperation: 'true',
    horizontalOverflow: 0,
    overlappingHudSurfaces: [],
    actionChangedPixelCount: 1_000,
    hiddenBackgroundDriftPixelCount: 0,
    artifacts: Object.fromEntries(['full', 'visible', 'hidden'].map((kind) => [kind, {
      path: `artifacts/pass66/support-operate-prompt/${supportId}-${label}-${kind}.png`,
      sha256: 'e'.repeat(64),
    }])),
  })));
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    gate: 'support-operate-prompt',
    sourceSha,
    servedCandidate: candidate,
    browser: 'chromium',
    browserVersion: '140.0.0',
    rendererPaused: true,
    singleExistingSurface: true,
    supportCases,
    errors: [],
    sourceState: { startingSha: sourceSha, endingSha: sourceSha, cleanBefore: true, cleanAfter: true },
    viewports,
  };
  const expected = { gate: 'support-operate-prompt', sourceSha, treeSha256, exactRootFileCount: 12 };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    viewports: viewports.map((entry, index) => index === 0
      ? { ...entry, infoBounds: { ...entry.infoBounds, bottom: 721 } }
      : entry),
  }, expected).join('\n'), /bounds escape/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    viewports: viewports.map((entry, index) => index === 1
      ? { ...entry, hiddenBackgroundDriftPixelCount: 33 }
      : entry),
  }, expected).join('\n'), /deterministic pixel proof/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    sourceState: { ...receipt.sourceState, cleanAfter: false },
  }, expected).join('\n'), /clean source before\/after/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    servedCandidate: { ...candidate, treeSha256: 'f'.repeat(64) },
  }, expected).join('\n'), /served candidate tree digest mismatch/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    singleExistingSurface: false,
  }, expected).join('\n'), /one existing top-panel surface/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    viewports: viewports.map((entry, index) => index === 5
      ? { ...entry, legacyStandalonePromptCount: 1 }
      : entry),
  }, expected).join('\n'), /one readable highlighted action surface/u);
});

test('requires the exact ten-test multiplayer matrix and five tokenized peer identities', () => {
  const currentCandidate = { ...candidate, releasePass: 'PASS 70' };
  const baseUrl = 'http://127.0.0.1:4530/channels/the-big-one/';
  const receipt = {
    schemaVersion: 3,
    status: 'PASS',
    gate: 'multiplayer-stability',
    releasePass: 'PASS 70',
    schema: 'atomic-acres/multiplayer-stability@3',
    sourceSha,
    servedCandidate: currentCandidate,
    servedCandidateAfter: currentCandidate,
    runner: {
      browser: 'chromium', channel: PASS66_MULTIPLAYER_BROWSER_CHANNEL,
      headless: true, nativeUserAgent: true,
      executablePath: browserExecutablePath, executableSha256: browserExecutableSha256,
      workers: 1, retries: 0, externalPreview: true, baseUrl,
      args: [
        'test',
        ...PASS66_MULTIPLAYER_SPECS.map(({ path }) => path),
        '--project=chromium', '--workers=1', '--retries=0', '--reporter=json',
      ],
    },
    pageBinding: {
      helper: 'assertPass66OwnedCandidatePage',
      exactCandidateRoute: '/channels/the-big-one/',
      guardedSpecs: PASS66_MULTIPLAYER_SPECS.map(({ path }) => path),
      initialAdmissionGuard: {
        spec: 'tests/e2e/pass66-host-crash-rejoin.spec.ts',
        roles: ['host', 'guest'],
        terminalEvents: ['crash', 'close'],
        timeoutMs: 60_000,
      },
    },
    ownedPeerServers: [
      'hostCrashRejoin', 'ownerFeedbackMultiplayerUi',
      'timedMapWeaponsMultiplayerRejoin', 'qoderMultiplayerAuthority',
      'adrenalineMatchLifecycle',
    ].map((owner, index) => ({
      owner, host: '127.0.0.1', port: 11_000 + index,
      path: `/peerjs-${String(index + 5).repeat(24)}`, localOnly: true,
    })),
    playwright: {
      stats: { expected: 10, skipped: 0, unexpected: 0, flaky: 0, durationMs: 800 },
      totalTests: 10,
      passedTests: 10,
      specs: PASS66_MULTIPLAYER_SPECS.map((spec) => ({
        path: spec.path,
        testCount: spec.expectedTests,
        passedCount: spec.expectedTests,
        titles: spec.titles,
        durationMs: 100,
      })),
    },
    errors: [],
  };
  const expected = {
    gate: 'multiplayer-stability', releasePass: 'PASS 70', sourceSha, treeSha256,
    exactRootFileCount: 12, baseUrl,
    browserChannel: PASS66_MULTIPLAYER_BROWSER_CHANNEL,
    browserExecutablePath,
    browserExecutableSha256,
  };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    ownedPeerServers: receipt.ownedPeerServers.map((peer, index) => index === 2
      ? { ...peer, path: '/peerjs' }
      : peer),
  }, expected).join('\n'), /PeerJS identity mismatch/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    schemaVersion: 2,
  }, expected).join('\n'), /schemaVersion must be 3/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    runner: { ...receipt.runner, executableSha256: 'd'.repeat(64) },
  }, expected).join('\n'), /runner identity mismatch/u);
});
