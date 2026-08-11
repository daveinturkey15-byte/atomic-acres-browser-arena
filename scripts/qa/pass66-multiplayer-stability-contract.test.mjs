import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  PASS66_MULTIPLAYER_SPECS,
  PASS66_MULTIPLAYER_TEST_COUNT,
  multiplayerPlaywrightReportFailures,
  multiplayerServedCandidateFailures,
  multiplayerStabilityEnvironmentFailures,
  multiplayerStabilityReceiptFailures,
  summarizeMultiplayerPlaywrightReport,
} from './pass66-multiplayer-stability-contract.mjs';

const sourceSha = 'a'.repeat(40);
const treeSha256 = 'b'.repeat(64);
const exactRootFileCount = 12;
const candidate = {
  schemaVersion: 4,
  channel: 'the-big-one',
  releasePass: 'PASS 70',
  path: 'channels/the-big-one',
  sourceSha,
  treeSha256,
  exactRootFileCount,
};

function validEnvironment() {
  return {
    QA_OWNED_GATE: 'multiplayer-stability',
    QA_OWNED_RELEASE_PASS: 'PASS 70',
    QA_BASE_URL: 'http://127.0.0.1:4530/channels/the-big-one/',
    BASE_URL: 'http://127.0.0.1:4530/channels/the-big-one/',
    QA_OWNED_SOURCE_SHA: sourceSha,
    QA_OWNED_TREE_SHA256: treeSha256,
    QA_OWNED_FILE_COUNT: String(exactRootFileCount),
    QA_OWNED_RECEIPT_PATH: resolve('artifacts/multiplayer/stability/receipt.json'),
  };
}

function makeSpec(title) {
  return {
    title,
    ok: true,
    tests: [{
      projectName: 'chromium',
      expectedStatus: 'passed',
      results: [{ status: 'passed', duration: 25 }],
    }],
  };
}

function validReport() {
  return {
    errors: [],
    stats: {
      expected: PASS66_MULTIPLAYER_TEST_COUNT,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
      duration: 800,
    },
    suites: PASS66_MULTIPLAYER_SPECS.map(({ path, expectedTests, titles }) => ({
      file: path,
      specs: Array.from({ length: expectedTests }, (_, index) => makeSpec(titles[index])),
    })),
  };
}

test('owned multiplayer verifier environment fails closed on route or source ambiguity', () => {
  const environment = validEnvironment();
  assert.deepEqual(multiplayerStabilityEnvironmentFailures(environment), []);
  assert.match(multiplayerStabilityEnvironmentFailures({
    ...environment,
    QA_BASE_URL: 'http://127.0.0.1:4530/',
  }).join('\n'), /candidate channel route/u);
  assert.match(multiplayerStabilityEnvironmentFailures({
    ...environment,
    BASE_URL: 'http://127.0.0.1:4530/channels/stable/',
  }).join('\n'), /exactly match/u);
  assert.match(multiplayerStabilityEnvironmentFailures({
    ...environment,
    QA_OWNED_SOURCE_SHA: 'stale',
  }).join('\n'), /source SHA/u);
  assert.match(multiplayerStabilityEnvironmentFailures({
    ...environment,
    QA_OWNED_RECEIPT_PATH: 'relative/receipt.json',
  }).join('\n'), /absolute/u);
});

test('served provenance requires the exact configured candidate identity', () => {
  const expected = { releasePass: 'PASS 70', sourceSha, treeSha256, exactRootFileCount };
  assert.deepEqual(multiplayerServedCandidateFailures(candidate, expected), []);
  assert.match(multiplayerServedCandidateFailures({
    ...candidate,
    sourceSha: 'c'.repeat(40),
  }, expected).join('\n'), /source SHA mismatch/u);
  assert.match(multiplayerServedCandidateFailures({
    ...candidate,
    exactRootFileCount: exactRootFileCount + 1,
  }, expected).join('\n'), /file count mismatch/u);
});

test('Playwright JSON must prove the exact five-spec ten-test serial Chromium matrix', () => {
  const report = validReport();
  assert.deepEqual(multiplayerPlaywrightReportFailures(report), []);
  const summary = summarizeMultiplayerPlaywrightReport(report);
  assert.equal(summary.totalTests, 10);
  assert.equal(summary.passedTests, 10);
  assert.deepEqual(summary.specs.map(({ testCount }) => testCount), [1, 1, 3, 4, 1]);

  const missing = validReport();
  missing.suites.pop();
  assert.match(multiplayerPlaywrightReportFailures(missing).join('\n'), /adrenaline.*exactly 1 tests/iu);

  const skipped = validReport();
  skipped.stats.skipped = 1;
  skipped.stats.expected = 7;
  assert.match(multiplayerPlaywrightReportFailures(skipped).join('\n'), /skipped count must be zero/u);

  const retried = validReport();
  retried.suites[0].specs[0].tests[0].results.push({ status: 'passed', duration: 10 });
  assert.match(multiplayerPlaywrightReportFailures(retried).join('\n'), /exactly once/u);

  const wrongProject = validReport();
  wrongProject.suites[0].specs[0].tests[0].projectName = 'firefox';
  assert.match(multiplayerPlaywrightReportFailures(wrongProject).join('\n'), /non-Chromium/u);
});

test('all five runtime specs bind their navigated page through the shared exact-candidate guard', () => {
  const support = readFileSync('tests/e2e/pass66-e2e-support.ts', 'utf8');
  assert.match(support, /export async function assertPass66OwnedCandidatePage/u);
  assert.match(support, /route\.pathname !== '\/channels\/the-big-one\/'/u);
  assert.match(support, /new URL\('channel-provenance\.json', route\)/u);
  assert.match(support, /provenance\.sourceSha !== ownedIdentity\.sourceSha/u);

  for (const { path } of PASS66_MULTIPLAYER_SPECS) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /assertPass66OwnedCandidatePage/u, `${path} must import the shared candidate guard`);
    assert.match(source, /await assertPass66OwnedCandidatePage\(page\)/u, `${path} must bind the navigated page`);
    assert.doesNotMatch(source, /new URL\('\/', test\.info\(\)\.project\.use\.baseURL/u, `${path} must not escape to chooser root`);
    assert.match(source, /startOwnedPeerServer\(peerPort, process\.env\.PASS66_[A-Z_]+_PEER_PATH\)/u,
      `${path} must consume the wrapper-owned tokenized PeerJS path`);
  }
});

test('Qoder replacement admission restores foreground ownership without widening frozen bounds', () => {
  const source = readFileSync('tests/e2e/pass66-qoder-multiplayer-authority.spec.ts', 'utf8');
  const samplerStart = source.indexOf('async function sampleRejoinAdmission(');
  const failureDiagnosticStart = source.indexOf('async function sampleRejoinFailureDiagnostic(', samplerStart);
  const failureDiagnosticEnd = source.indexOf('function rejoinSampleFingerprint(', failureDiagnosticStart);
  const presentationStart = source.indexOf('async function waitForRejoinPresentation(');
  const presentationEnd = source.indexOf('async function startMatch(', presentationStart);
  const rejoinStart = source.indexOf('async function rejoinGuest(');
  const rejoinEnd = source.indexOf('async function settleCrashPrimitive(', rejoinStart);
  assert.ok(samplerStart >= 0 && failureDiagnosticStart > samplerStart);
  assert.ok(failureDiagnosticEnd > failureDiagnosticStart);
  assert.ok(presentationStart >= 0 && presentationEnd > presentationStart);
  assert.ok(rejoinStart >= 0 && rejoinEnd > rejoinStart);
  const sampler = source.slice(samplerStart, failureDiagnosticStart);
  const failureDiagnostic = source.slice(failureDiagnosticStart, failureDiagnosticEnd);
  const presentation = source.slice(presentationStart, presentationEnd);
  const rejoin = source.slice(rejoinStart, rejoinEnd);

  assert.match(source, /REJOIN_FOREGROUND_OWNERSHIP_TIMEOUT_MS = 5_000/u);
  assert.match(source, /REJOIN_TRANSPORT_ADMISSION_TIMEOUT_MS = 20_000/u);
  assert.match(source, /REJOIN_END_TO_END_ADMISSION_TIMEOUT_MS = 75_000/u);
  assert.match(source, /test\.describe\.configure\(\{ timeout: 240_000 \}\);/u);
  assert.doesNotMatch(rejoin, /150_000/u);

  const bringToFrontAt = rejoin.indexOf('await guest.bringToFront();');
  const foregroundAssertionAt = rejoin.indexOf("toEqual({ visibilityState: 'visible', hasFocus: true });");
  const trustedRejoinAt = rejoin.indexOf("await guest.locator('#join').click();");
  assert.ok(bringToFrontAt >= 0 && foregroundAssertionAt > bringToFrontAt && trustedRejoinAt > foregroundAssertionAt);
  assert.match(rejoin, /timeout: REJOIN_FOREGROUND_OWNERSHIP_TIMEOUT_MS/u);

  const transportStart = rejoin.indexOf('try {');
  const transportEnd = rejoin.indexOf('const transportElapsedMs', transportStart);
  assert.ok(transportStart >= 0 && transportEnd > transportStart);
  const transport = rejoin.slice(transportStart, transportEnd);
  assert.match(transport, /state\.networkLifecycle\.hostConnectionOpen === true/u);
  assert.match(transport, /state\.privateMatch\?\.members\.length === 2/u);
  assert.match(transport, /timeout: REJOIN_TRANSPORT_ADMISSION_TIMEOUT_MS/u);
  assert.doesNotMatch(transport, /state\.(?:gameStarted|matchPhase)/u);

  assert.match(sampler, /visibilityState: document\.visibilityState/u);
  assert.match(sampler, /hasFocus: document\.hasFocus\(\)/u);
  assert.match(sampler, /dataset\.loadingStage/u);
  assert.match(sampler, /dataset\.loadingPercent/u);
  assert.match(sampler, /dataset\.loadingEtaSeconds/u);
  assert.match(failureDiagnostic, /sampleWeaponCatalogReadiness/u);
  assert.ok(
    presentation.indexOf('totalElapsedMs >= REJOIN_END_TO_END_ADMISSION_TIMEOUT_MS')
      < presentation.indexOf('if (current.ready)'),
    'the exact 75s end-to-end bound must win over a late readiness sample',
  );
  assert.match(presentation, /attachRejoinEvidence\('qoder-rejoin-foreground-loss'/u);
  assert.match(presentation, /attachRejoinEvidence\('qoder-rejoin-presentation-timeout'/u);
  assert.match(rejoin, /attachRejoinEvidence\('qoder-rejoin-transport-timeout'/u);
  assert.match(rejoin, /totalElapsedMs: presentation\.totalElapsedMs/u);
  assert.match(rejoin, /samples: presentation\.samples/u);
});

test('Qoder host recovery isolates a co-located software renderer within the frozen 90s', () => {
  const source = readFileSync('tests/e2e/pass66-qoder-multiplayer-authority.spec.ts', 'utf8');
  const samplerStart = source.indexOf('async function sampleHostRecoveryEvidence(');
  const samplerEnd = source.indexOf('async function failHostRecoveryStage(', samplerStart);
  const failureEnd = source.indexOf('async function selectClearDeathDropApproach(', samplerEnd);
  const ladderStart = source.indexOf("test('post-death ladders survive authenticated replacements");
  const ladderEnd = source.indexOf("test('a guest death-drop scavenge", ladderStart);
  assert.ok(samplerStart >= 0 && samplerEnd > samplerStart);
  assert.ok(failureEnd > samplerEnd);
  assert.ok(ladderStart >= 0 && ladderEnd > ladderStart);
  const sampler = source.slice(samplerStart, samplerEnd);
  const failureDiagnostic = source.slice(samplerEnd, failureEnd);
  const ladder = source.slice(ladderStart, ladderEnd);

  assert.match(source, /HOST_RECOVERY_END_TO_END_TIMEOUT_MS = 90_000/u);
  assert.match(source, /GUEST_RENDER_RESUME_FRAME_TIMEOUT_MS = 10_000/u);
  assert.match(ladder, /test\.setTimeout\(300_000\)/u);
  assert.doesNotMatch(ladder, /timeout: 90_000/u);
  assert.equal(
    ladder.match(/remainingHostRecoveryTimeoutMs\(hostRecoveryStartedAt\)/gu)?.length,
    4,
  );
  assert.equal(source.match(/setRenderPaused\(/gu)?.length, 2);
  assert.equal(ladder.match(/setRenderPaused\(/gu)?.length, 2);

  const topologyAt = ladder.indexOf('const guestRecoveryTopology = await guest.evaluate');
  const softwareAdapterAt = ladder.indexOf('state.render.runtime.softwareAdapter === true', topologyAt);
  const pauseAt = ladder.indexOf('debug.setRenderPaused(true)', softwareAdapterAt);
  const crashAt = ladder.indexOf("cdp.send('Page.crash')", pauseAt);
  const hostClickAt = ladder.indexOf("await host.locator('#host').click();");
  const hostActiveAt = ladder.indexOf("failHostRecoveryStage('host-active'");
  const guestForegroundAt = ladder.indexOf('await guest.bringToFront();', hostActiveAt);
  const guestActiveAt = ladder.indexOf("failHostRecoveryStage('guest-active'", guestForegroundAt);
  const hostActorsAt = ladder.indexOf("failHostRecoveryStage('host-actors'", guestActiveAt);
  const endToEndBoundAt = ladder.indexOf('hostRecoveryElapsedMs > HOST_RECOVERY_END_TO_END_TIMEOUT_MS', hostActorsAt);
  const recoveryFinallyAt = ladder.indexOf('} finally {', hostActorsAt);
  const unpauseAt = ladder.indexOf('setRenderPaused(false)', recoveryFinallyAt);
  const resumedFrameAt = ladder.indexOf('presentedGameplayFrame > baselineFrame', unpauseAt);
  assert.ok(topologyAt >= 0 && softwareAdapterAt > topologyAt && pauseAt > softwareAdapterAt);
  assert.ok(crashAt > pauseAt && hostClickAt > crashAt);
  assert.ok(hostClickAt >= 0 && hostActiveAt > hostClickAt);
  assert.ok(guestForegroundAt > hostActiveAt && guestActiveAt > guestForegroundAt && hostActorsAt > guestActiveAt);
  assert.ok(endToEndBoundAt > hostActorsAt && recoveryFinallyAt > endToEndBoundAt);
  assert.ok(unpauseAt > recoveryFinallyAt && resumedFrameAt > unpauseAt);
  assert.doesNotMatch(ladder.slice(hostClickAt, guestForegroundAt), /killstreak\.actors/u);
  assert.match(ladder, /visibilityState: document\.visibilityState/u);
  assert.match(ladder, /hasFocus: document\.hasFocus\(\)/u);
  assert.match(ladder, /state\.networkLifecycle\.hostConnectionOpen === true/u);
  assert.match(ladder, /snapshot\(\)\.killstreak\.actors\.length === 2/u);
  assert.match(ladder, /hostRecoveryElapsedMs > HOST_RECOVERY_END_TO_END_TIMEOUT_MS/u);
  assert.match(ladder, /'end-to-end-bound'/u);
  assert.match(ladder, /timeout: GUEST_RENDER_RESUME_FRAME_TIMEOUT_MS/u);
  assert.match(ladder, /qoder-host-recovery-guest-render-resume-timeout/u);
  assert.match(ladder, /qoder-host-recovery-complete/u);
  assert.match(ladder, /if \(softwareAdapter\) debug\.setRenderPaused\(true\)/u);
  assert.match(ladder, /finally \{\s+if \(guestRecoveryTopology\.softwareAdapter\)/u);
  assert.match(failureDiagnostic, /sampleHostRecoveryEvidence\(host, guest\)/u);
  assert.match(sampler, /runtimeProvenance: state\?\.render\?\.runtime/u);
  assert.match(sampler, /arenaTransition: state\?\.arenaSelection\?\.streaming\?\.transition/u);
  assert.match(sampler, /menuPrewarm:/u);
  assert.match(sampler, /state: state\?\.menuLifecycle/u);
  assert.match(sampler, /sampleRendererResidency/u);
});

test('Qoder death-drop staging proves host authority before natural expiry without widening bounds', () => {
  const source = readFileSync('tests/e2e/pass66-qoder-multiplayer-authority.spec.ts', 'utf8');
  const selectorStart = source.indexOf('async function selectClearDeathDropApproach(');
  const selectorEnd = source.indexOf('async function stageRemoteAt(', selectorStart);
  const stageEnd = source.indexOf('function ladderProjection(', selectorEnd);
  const deathDropStart = source.indexOf("test('a guest death-drop scavenge");
  const deathDropEnd = source.indexOf("test('Semtex and crossbolt", deathDropStart);
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart && stageEnd > selectorEnd);
  assert.ok(deathDropStart >= 0 && deathDropEnd > deathDropStart);
  const selector = source.slice(selectorStart, selectorEnd);
  const stage = source.slice(selectorEnd, stageEnd);
  const deathDrop = source.slice(deathDropStart, deathDropEnd);

  assert.match(source, /REMOTE_STAGE_ACK_TIMEOUT_MS = 10_000/u);
  assert.match(selector, /directionIndex < 32/u);
  assert.match(selector, /dx \* 4/u);
  assert.match(selector, /dx \* 2\.2/u);
  assert.match(selector, /collisionProbeAt/u);
  assert.match(selector, /segmentBlocked/u);
  assert.match(stage, /timeout: REMOTE_STAGE_ACK_TIMEOUT_MS/u);
  assert.match(stage, /candidate\.id === id/u);
  assert.match(stage, /qoder-death-drop-stage-/u);
  assert.match(deathDrop, /selectClearDeathDropApproach\(guest, dropPosition\)/u);
  assert.equal(deathDrop.match(/stageRemoteAt\(/gu)?.length, 1);
  assert.doesNotMatch(deathDrop, /stageRemoteAt\(guest, host, guestId, approach\.outer/u);
  assert.match(deathDrop, /stageRemoteAt\(guest, host, guestId, approach\.middle, 'middle'\)/u);
  assert.doesNotMatch(deathDrop, /dropZ \+ (?:4|2\.2)/u);

  const dropObservedAt = deathDrop.indexOf('const dropObservedAtEpochMs = Date.now()');
  const initialParallelAt = deathDrop.indexOf('await Promise.all([', dropObservedAt);
  const fireAt = deathDrop.indexOf('__ATOMIC_ACRES_DEBUG__.fireOnce()');
  const reloadAt = deathDrop.indexOf('__ATOMIC_ACRES_DEBUG__.reload()', fireAt);
  const reloadParallelAt = deathDrop.indexOf('await Promise.all([', reloadAt);
  const middleAt = deathDrop.indexOf("stageRemoteAt(guest, host, guestId, approach.middle, 'middle')", reloadAt);
  const pickupAt = deathDrop.indexOf('), approach.pickup);', middleAt);
  const hostProjectionAt = deathDrop.indexOf('let hostPostScavengeProjection', pickupAt);
  const guestInventoryAt = deathDrop.indexOf('let inventoryAfterScavenge', hostProjectionAt);
  const ttlMarginAt = deathDrop.indexOf('projection.expiresInMs >= DEATH_DROP_AUTHORITY_TTL_MARGIN_MS', hostProjectionAt);
  const capturedProjectionAt = deathDrop.indexOf('hostPostScavengeProjection = projection', ttlMarginAt);
  const laterInventoryAt = deathDrop.indexOf('const [laterHostInventory, laterGuestInventory]', guestInventoryAt);
  const exactOnceEvidenceAt = deathDrop.indexOf("attachRejoinEvidence('qoder-death-drop-exact-once'", laterInventoryAt);
  assert.ok(dropObservedAt >= 0 && initialParallelAt > dropObservedAt && fireAt > initialParallelAt);
  assert.ok(reloadAt > fireAt && reloadParallelAt > reloadAt && middleAt > reloadParallelAt && pickupAt > middleAt);
  assert.ok(hostProjectionAt > pickupAt && ttlMarginAt > hostProjectionAt && capturedProjectionAt > ttlMarginAt);
  assert.ok(guestInventoryAt > capturedProjectionAt && laterInventoryAt > guestInventoryAt);
  assert.ok(exactOnceEvidenceAt > laterInventoryAt);
  assert.doesNotMatch(deathDrop.slice(laterInventoryAt, exactOnceEvidenceAt), /deathDrops/u);

  assert.match(deathDrop, /\)\)\.toBe\(29\)/u);
  assert.equal(deathDrop.match(/toEqual\(\{ ammo: 30, reserve: 119 \}\)/gu)?.length, 2);
  assert.match(deathDrop, /projection\.remotePresent === true/u);
  assert.match(deathDrop, /projection\.dropPresent === true/u);
  assert.match(deathDrop, /projection\.ammoAvailable === false/u);
  assert.match(deathDrop, /projection\.weaponAvailable === true/u);
  assert.match(deathDrop, /projection\.hostInventory\?\.reserve === 120/u);
  assert.match(deathDrop, /projection\.hostInventory\?\.grenades === 1/u);
  assert.match(source, /DEATH_DROP_AUTHORITY_TTL_MARGIN_MS = 5_000/u);
  assert.match(deathDrop, /projection\.expiresInMs >= DEATH_DROP_AUTHORITY_TTL_MARGIN_MS/u);
  assert.match(
    deathDrop,
    /expect\(hostPostScavengeProjection\.expiresInMs\)\s+\.toBeGreaterThanOrEqual\(DEATH_DROP_AUTHORITY_TTL_MARGIN_MS\)/u,
  );
  assert.match(deathDrop, /nonAuthoritativeWallClockRemainingTtlEstimateMs/u);
  assert.doesNotMatch(deathDrop, /expect\([^)]*WallClock[^)]*\)/u);
  assert.match(deathDrop, /qoder-death-drop-authority-before-expiry/u);
  assert.doesNotMatch(deathDrop, /const inventoryAfterScavenge = await guest\.evaluate/u);
  assert.match(deathDrop, /waitForTimeout\(750\)/u);
  assert.match(deathDrop, /qoder-death-drop-exact-once/u);
  assert.match(deathDrop, /expect\(laterHostInventory\)\.toEqual\(hostPostScavengeProjection\.hostInventory\)/u);
  assert.match(deathDrop, /expect\(laterGuestInventory\)\.toEqual\(inventoryAfterScavenge\)/u);
});

test('final receipt binds exact runtime, test matrix and five physical peer identities', () => {
  const baseUrl = 'http://127.0.0.1:4530/channels/the-big-one/';
  const receipt = {
    schemaVersion: 2,
    status: 'PASS',
    gate: 'multiplayer-stability',
    releasePass: 'PASS 70',
    schema: 'atomic-acres/multiplayer-stability@2',
    sourceSha,
    servedCandidate: candidate,
    servedCandidateAfter: candidate,
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
      owner, host: '127.0.0.1', port: 10_000 + index,
      path: `/peerjs-${String(index + 1).repeat(24)}`, localOnly: true,
    })),
    playwright: summarizeMultiplayerPlaywrightReport(validReport()),
    errors: [],
  };
  const expected = { releasePass: 'PASS 70', sourceSha, treeSha256, exactRootFileCount, baseUrl };
  assert.deepEqual(multiplayerStabilityReceiptFailures(receipt, expected), []);
  assert.match(multiplayerStabilityReceiptFailures({
    ...receipt,
    ownedPeerServers: receipt.ownedPeerServers.map((peer, index) => index === 0
      ? { ...peer, path: '/peerjs' }
      : peer),
  }, expected).join('\n'), /PeerJS identity mismatch/u);
  assert.match(multiplayerStabilityReceiptFailures({
    ...receipt,
    playwright: {
      ...receipt.playwright,
      specs: receipt.playwright.specs.map((spec, index) => index === 3
        ? { ...spec, passedCount: 2 }
        : spec),
    },
  }, expected).join('\n'), /qoder.*summary mismatch/iu);
});

test('verifier pins the external serial Chromium command and writes only a parsed PASS receipt', () => {
  const source = readFileSync('scripts/qa/verify-pass66-multiplayer-stability.mjs', 'utf8');
  for (const { path } of PASS66_MULTIPLAYER_SPECS) assert.match(source, /PASS66_MULTIPLAYER_SPECS/u, path);
  assert.match(source, /'--project=chromium'/u);
  assert.match(source, /'--workers=1'/u);
  assert.match(source, /'--retries=0'/u);
  assert.match(source, /'--reporter=json'/u);
  assert.match(source, /QA_EXTERNAL_PREVIEW: '1'/u);
  assert.match(source, /multiplayerPlaywrightReportFailures\(result\.report\)/u);
  assert.ok(source.indexOf("status: 'PASS'") < source.indexOf('writeFileSync(temporaryReceiptPath'));
});
