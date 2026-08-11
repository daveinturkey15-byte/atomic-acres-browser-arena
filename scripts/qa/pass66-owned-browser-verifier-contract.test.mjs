import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ownedBrowserVerifierReceiptFailures,
  stagedTopologyFailures,
} from './pass66-owned-browser-verifier-contract.mjs';
import { PASS66_MULTIPLAYER_SPECS } from './pass66-multiplayer-stability-contract.mjs';

const sourceSha = 'a'.repeat(40);
const treeSha256 = 'b'.repeat(64);
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

test('rejects stale or incomplete installed-Firefox receipts', () => {
  const cycle = {
    label: 'cold', backend: 'webgl2', webglVersion: 'WebGL 2.0', contextState: 'ready',
    gameStarted: true, matchPhase: 'active',
  };
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    gate: 'installed-firefox',
    sourceSha,
    servedCandidate: candidate,
    browser: 'installed-firefox',
    cycles: [cycle, { ...cycle, label: 'warm' }],
  };
  const expected = { gate: 'installed-firefox', sourceSha, treeSha256, exactRootFileCount: 12 };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    cycles: [cycle, { ...cycle, label: 'warm', backend: null }],
  }, expected).join('\n'), /invalid admission cycle/u);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    servedCandidate: { ...candidate, sourceSha: 'c'.repeat(40) },
  }, expected).join('\n'), /served candidate sourceSha mismatch/u);
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

test('requires the exact nine-test multiplayer matrix and five tokenized peer identities', () => {
  const currentCandidate = { ...candidate, releasePass: 'PASS 70' };
  const baseUrl = 'http://127.0.0.1:4530/channels/the-big-one/';
  const receipt = {
    schemaVersion: 2,
    status: 'PASS',
    gate: 'multiplayer-stability',
    releasePass: 'PASS 70',
    schema: 'atomic-acres/multiplayer-stability@2',
    sourceSha,
    servedCandidate: currentCandidate,
    servedCandidateAfter: currentCandidate,
    runner: {
      browser: 'chromium', workers: 1, retries: 0, externalPreview: true, baseUrl,
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
      stats: { expected: 9, skipped: 0, unexpected: 0, flaky: 0, durationMs: 800 },
      totalTests: 9,
      passedTests: 9,
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
  };
  assert.deepEqual(ownedBrowserVerifierReceiptFailures(receipt, expected), []);
  assert.match(ownedBrowserVerifierReceiptFailures({
    ...receipt,
    ownedPeerServers: receipt.ownedPeerServers.map((peer, index) => index === 2
      ? { ...peer, path: '/peerjs' }
      : peer),
  }, expected).join('\n'), /PeerJS identity mismatch/u);
});
