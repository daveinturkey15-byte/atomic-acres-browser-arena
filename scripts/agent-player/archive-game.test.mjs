import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { archiveGame, compareBenchmarks, hardGateFailures, METRIC_REGISTRY, partialBenchmarkFromReport, policyConfigurationFingerprint, validateExperimentPolicy } from './archive-game.mjs';
import { verifyArchive } from './verify-archive.mjs';

function benchmarkFixture(overrides = {}) {
  return {
    result: { kills: 0, deaths: 10, killDeathRatio: 0, shotsFired: 100, shotsHit: 0, accuracyPercent: 0, damageDealt: 0, damageTaken: 1000, headshots: 0, bestKillstreak: 0, shotsPerKill: null, damagePerShot: 0 },
    survival: { firstIncomingDamageAtSeconds: 10, firstDeathAtSeconds: 20, medianCompletedLifeSeconds: 20, longestCompletedLifeSeconds: 30 },
    contacts: { creditedBotDamageEvents: 0, nonBotDamageEvents: 0, firstCreditedBotHitAtSeconds: null, creditedBotDamageFromTimeline: 0 },
    perception: { sourceFps: 2, captureFailures: 0, captureMedianMs: 300, captureP95Ms: 500, decodeMedianMs: 10, rawTargetFrames: 90, rawTargetFrameRatio: 0.9, confirmedTargetFrames: 0, confirmedToRawRatio: 0, rejectedScreenLockedFrames: 0 },
    control: { gameFps: 29, gameCadenceHz: 29, warmupShotPulses: 0, unconfirmedShotPulses: 0, reloadRequests: 20, stuckRecoveries: 0, damageReactions: 0, activeInputVeto: false, pointerLockLosses: 0, focusLosses: 0, hudFreshnessFailures: 0, maximumObservedHoldMs: 1000, browserWarnings: 0, performanceProfile: 'performance', pointerLock: true, releasedAtEnd: true, holdWatchdogExceeded: false, pageErrors: [] },
    integrity: { droppedDamageEvents: 0, forbiddenInputsUsed: [], matchEndedObserved: true, summaryDownloaded: true, technicalDownloaded: true },
    ...overrides,
  };
}

test('all registered metrics receive deterministic comparison labels and hard safety regressions fail', () => {
  const baseline = benchmarkFixture();
  const current = benchmarkFixture({
    result: { ...baseline.result, kills: 1, deaths: 8, killDeathRatio: 0.125, shotsHit: 3, accuracyPercent: 3, damageDealt: 90, damageTaken: 800, shotsPerKill: 100, damagePerShot: 0.9 },
    control: { ...baseline.control, releasedAtEnd: false, warmupShotPulses: 0, unconfirmedShotPulses: 0 },
  });
  const comparison = compareBenchmarks(current, baseline, 'G0001');
  assert.equal(comparison.rows.length, METRIC_REGISTRY.length);
  assert.equal(comparison.rows.find((row) => row.key === 'combat.kills').label, 'improved');
  assert.equal(comparison.rows.find((row) => row.key === 'combat.deaths').label, 'improved');
  assert.equal(comparison.rows.find((row) => row.key === 'safety.releasedAtEnd').label, 'regressed');
  assert.equal(comparison.hardRegression, true);
  assert.deepEqual(comparison.hardRegressions, ['safety.releasedAtEnd']);
});

test('missing metrics are not coerced to zero', () => {
  const comparison = compareBenchmarks({ result: { kills: null } }, { result: { kills: 0 } }, 'G0001', [
    { key: 'combat.kills', path: 'result.kills', direction: 'higher' },
  ]);
  assert.equal(comparison.rows[0].label, 'missing');
  assert.equal(comparison.rows[0].value, null);
});

test('absolute hard gates fail even when the reference has the same invalid value', () => {
  const baseline = benchmarkFixture();
  const invalid = benchmarkFixture({
    control: { ...baseline.control, releasedAtEnd: false },
  });
  const comparison = compareBenchmarks(invalid, invalid, 'G0001');
  assert.equal(comparison.rows.find((row) => row.key === 'safety.releasedAtEnd').label, 'unchanged');
  assert.equal(comparison.hardRegression, true);
  assert.deepEqual(hardGateFailures(invalid).map((gate) => gate.key), ['safety.releasedAtEnd']);
});

test('partial games preserve available control evidence without inventing combat results', () => {
  const partial = partialBenchmarkFromReport({
    source: { pass: 'PASS 63' }, session: { mode: 'solo', pointerLock: true },
    performance: { observedRenderProfile: 'performance', visionFrames: 12, visionStream: { sourceFps: 6, failedFrames: 1 } },
    input: { releasedAtEnd: true, holdWatchdogExceeded: false, activeInputVeto: false, pointerLockLosses: 0, focusLosses: 0, hudFreshnessFailures: 0 }, browser: { pageErrors: [] },
    fairness: { forbiddenInputsUsed: [] }, outcome: { matchEndedObserved: false },
  });
  assert.deepEqual(partial.result, {});
  assert.equal(partial.perception.sourceFps, 6);
  assert.equal(partial.control.releasedAtEnd, true);
  assert.equal(partial.control.activeInputVeto, false);
  assert.equal(partial.control.pointerLockLosses, 0);
  assert.equal(partial.control.focusLosses, 0);
  assert.equal(partial.control.hudFreshnessFailures, 0);
  assert.equal(partial.integrity.matchEndedObserved, false);
});

async function writeGameSource(directory, { startedAt, kills, deaths, damageDealt, damageTaken }) {
  await mkdir(directory, { recursive: true });
  const report = {
    startedAt, endedAt: startedAt, source: { url: 'https://example.test/?release=latest', pass: 'PASS 63', harnessGitSha: 'abc1234' },
    session: { mode: 'solo', callsign: 'Jigglyclaw', pointerLock: true }, fairness: { forbiddenInputsUsed: [] },
    performance: { observedRenderProfile: 'performance', visionFrames: 10, rawTargetFrames: 2, confirmedTargetFrames: 1, fpsCounter: { value: '30' }, framePacing: { cadenceHz: 30 }, visionLoopMs: {}, visionStream: { sourceFps: 5, failedFrames: 0, captureMs: {}, mode: 'test' } },
    input: { releasedAtEnd: true, holdWatchdogExceeded: false, warmupShotPulses: 0, unconfirmedShotPulses: 0, activeInputVeto: false, pointerLockLosses: 0, focusLosses: 0, hudFreshnessFailures: 0 }, browser: { pageErrors: [], warningOrErrorCount: 0 },
    outcome: { matchEndedObserved: true, downloadedSummary: {}, downloadedTechnical: {} },
  };
  const summary = {
    build: 'PASS 63', match: { arena: 'Atomic Acres', mode: 'solo', result: kills > 0 ? 'VICTORY' : 'DEFEAT', durationSeconds: 303, completedAt: startedAt, damageTimelineComplete: true },
    stats: { kills, deaths, killDeathRatio: deaths ? kills / deaths : kills, shotsFired: 10, shotsHit: kills, accuracyPercent: kills * 10, damageDealt, damageTaken, headshots: 0, bestKillstreak: kills },
    participants: [{ name: 'Jigglyclaw', kind: 'player', finalHealth: 100 }, { name: 'BOT', kind: 'solo-bot', kills: deaths, deaths: kills, damageDealt: damageTaken, damageTaken: damageDealt, finalHealth: 100 }],
    damageTimeline: [], droppedDamageEvents: 0,
  };
  await writeFile(join(directory, 'report.json'), `${JSON.stringify(report)}\n`);
  await writeFile(join(directory, 'match-summary.json'), `${JSON.stringify(summary)}\n`);
  await writeFile(join(directory, 'match-technical.json'), '{"schemaVersion":2}\n');
}

test('archive assigns immutable sequential IDs, deduplicates imports and compares every completed game', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atomic-archive-test-'));
  const archiveRoot = join(root, 'archive');
  const first = join(root, 'first');
  const second = join(root, 'second');
  const calibration = join(root, 'calibration');
  await writeGameSource(first, { startedAt: '2026-07-25T00:00:00Z', kills: 0, deaths: 10, damageDealt: 0, damageTaken: 1000 });
  await writeGameSource(second, { startedAt: '2026-07-25T01:00:00Z', kills: 1, deaths: 8, damageDealt: 100, damageTaken: 800 });
  await writeGameSource(calibration, { startedAt: '2026-07-25T02:00:00Z', kills: 2, deaths: 7, damageDealt: 200, damageTaken: 700 });
  const archivedFirst = await archiveGame({ sourceDirectory: first, archiveRoot, setBaseline: true });
  const duplicate = await archiveGame({ sourceDirectory: first, archiveRoot });
  const archivedSecond = await archiveGame({ sourceDirectory: second, archiveRoot });
  const archivedCalibration = await archiveGame({ sourceDirectory: calibration, archiveRoot, runType: 'calibration' });
  assert.equal(archivedFirst.game.id, 'G0001');
  assert.equal(duplicate.duplicate, true);
  assert.equal(archivedSecond.game.id, 'G0002');
  assert.equal(archivedSecond.game.previousComparableGameId, 'G0001');
  assert.equal(archivedSecond.baselineComparison.rows.length, METRIC_REGISTRY.length);
  assert.equal(archivedCalibration.game.completed, true);
  assert.equal(archivedCalibration.game.counted, false);
  assert.equal(archivedCalibration.game.previousComparableGameId, 'G0002');
  const index = JSON.parse(await readFile(join(archiveRoot, 'index.json'), 'utf8'));
  assert.equal(index.baselineGameId, 'G0001');
  assert.deepEqual(index.games.map((game) => game.id), ['G0001', 'G0002', 'G0003']);
  const manifest = JSON.parse(await readFile(join(archiveRoot, 'games/G0002/manifest.json'), 'utf8'));
  assert.ok(manifest.evidence.some((entry) => entry.file === 'combat-benchmark.json' && /^[a-f0-9]{64}$/.test(entry.sha256)));
  const verification = await verifyArchive(archiveRoot);
  assert.equal(verification.ok, true, verification.errors.join('\n'));
  assert.equal(verification.gameCount, 3);
});

test('archive rejects an invalid comparison baseline before creating an immutable destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atomic-archive-preflight-test-'));
  const archiveRoot = join(root, 'archive');
  const first = join(root, 'first');
  const candidate = join(root, 'candidate');
  await writeGameSource(first, { startedAt: '2026-07-25T00:00:00Z', kills: 1, deaths: 8, damageDealt: 100, damageTaken: 800 });
  await writeGameSource(candidate, { startedAt: '2026-07-25T01:00:00Z', kills: 0, deaths: 1, damageDealt: 0, damageTaken: 100 });
  await archiveGame({ sourceDirectory: first, archiveRoot, setBaseline: true });
  const policy = {
    schemaVersion: 1,
    policyId: 'atomic-player-invalid-baseline-preflight',
    hypothesis: 'Archive baseline validation should happen before immutable evidence is copied.',
    expectedMetricMovements: ['Archive integrity remains unchanged after a rejected policy.'],
    unchangedControls: ['The source report and existing G0001 evidence remain untouched.'],
    rollbackCondition: 'Any unindexed G0002 directory is created.',
    comparisonBaselineGameId: 'G9999',
    comparisonGroup: 'weapon:CARBINE',
    configuration: {
      playerHarnessCommit: 'abc1234',
      profile: 'atomicplayer',
      provider: 'openai-codex',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
      serviceTier: 'priority',
    },
  };
  await writeFile(join(candidate, 'experiment-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
  await assert.rejects(
    archiveGame({ sourceDirectory: candidate, archiveRoot, runType: 'calibration' }),
    /not a completed comparable archive game/,
  );
  await assert.rejects(readFile(join(archiveRoot, 'games/G0002/report.json')), /ENOENT/);
  const index = JSON.parse(await readFile(join(archiveRoot, 'index.json'), 'utf8'));
  assert.deepEqual(index.games.map((game) => game.id), ['G0001']);
});

test('placeholder experiment-policy values are rejected before a counted game can be archived', () => {
  assert.throws(() => validateExperimentPolicy({
    schemaVersion: 1,
    policyId: 'placeholder-policy',
    hypothesis: 'placeholder hypothesis',
    expectedMetricMovements: ['anything changes'],
    unchangedControls: ['anything remains'],
    rollbackCondition: 'anything fails',
    configuration: {
      playerHarnessCommit: 'REPLACE_WITH_GIT_SHA',
      profile: 'wrong-profile',
      provider: 'claimed-provider',
      model: 'claimed-model',
      reasoningEffort: 'low',
      serviceTier: 'normal',
    },
  }), /non-placeholder/);
});

test('comparison baseline IDs and groups are validated independently of the global archive baseline', () => {
  const policy = {
    schemaVersion: 1,
    policyId: 'atomic-player-smg-candidate',
    hypothesis: 'A bounded SMG pulse will improve concentrated damage while retaining safety gates.',
    expectedMetricMovements: ['combat.damageDealt increases'],
    unchangedControls: ['Visible-state firing authority remains mandatory'],
    rollbackCondition: 'Any hard-gate failure or repeated combat regression.',
    comparisonBaselineGameId: 'G0059',
    comparisonGroup: 'weapon:VECTORLINE SMG',
    configuration: {
      playerHarnessCommit: 'abc1234',
      profile: 'atomicplayer',
      provider: 'openai-codex',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'low',
      serviceTier: 'normal',
    },
  };
  assert.equal(validateExperimentPolicy(policy).comparisonBaselineGameId, 'G0059');
  assert.throws(() => validateExperimentPolicy({ ...policy, comparisonBaselineGameId: 'latest-smg' }), /G####/);
});

test('G0003 and later counted benchmarks require a validated frozen player-policy hypothesis', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atomic-policy-test-'));
  const archiveRoot = join(root, 'archive');
  const modelPolicyPath = join(root, 'model-policy.json');
  await writeFile(modelPolicyPath, `${JSON.stringify({
    as_of: '2026-07-25',
    profiles: {
      atomicplayer: {
        provider: 'openai-codex',
        model: 'gpt-5.6-sol',
        reasoning_effort: 'low',
        service_tier: 'normal',
      },
    },
  })}\n`);
  for (let game = 1; game <= 3; game += 1) {
    const directory = join(root, `source-${game}`);
    await writeGameSource(directory, {
      startedAt: `2026-07-25T0${game}:00:00Z`,
      kills: game - 1,
      deaths: 10 - game,
      damageDealt: (game - 1) * 100,
      damageTaken: 1000 - game * 100,
    });
    if (game === 2) {
      const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
      report.outcome.matchEndedObserved = false;
      await writeFile(join(directory, 'report.json'), `${JSON.stringify(report)}\n`);
    }
    if (game < 3) {
      const archived = await archiveGame({ sourceDirectory: directory, archiveRoot, setBaseline: game === 1, modelPolicyPath });
      if (game === 2) assert.equal(archived.game.counted, false);
      continue;
    }
    await assert.rejects(
      archiveGame({ sourceDirectory: directory, archiveRoot, modelPolicyPath }),
      /require a frozen experiment-policy\.json/,
    );
    const policy = validateExperimentPolicy({
      schemaVersion: 1,
      policyId: 'atomic-player-candidate-01',
      hypothesis: 'Temporal operator confirmation will improve credited hits without extra blind fire.',
      expectedMetricMovements: ['combat.creditedHits increases'],
      unchangedControls: ['Performance render profile', 'visible-state inputs only'],
      rollbackCondition: 'Any safety-gate failure or repeated official outcome regression.',
      configuration: {
        playerHarnessCommit: 'abc1234',
        profile: 'atomicplayer',
        provider: 'openai-codex',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'low',
        serviceTier: 'normal',
      },
    });
    await writeFile(join(directory, 'experiment-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
    const archived = await archiveGame({ sourceDirectory: directory, archiveRoot, modelPolicyPath });
    assert.equal(archived.game.id, 'G0003');
    assert.equal(archived.game.previousComparableGameId, 'G0001');
    assert.equal(archived.game.policyId, 'atomic-player-candidate-01');
    assert.equal(archived.manifest.playerPolicy.hypothesis, policy.hypothesis);
    assert.equal(archived.game.policyConfigurationFingerprint, policyConfigurationFingerprint(policy.configuration));
  }
});
