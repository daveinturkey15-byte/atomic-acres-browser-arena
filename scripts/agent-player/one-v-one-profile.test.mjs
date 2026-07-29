import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  fingerprintProfile,
  loadPlayerProfile,
  validatePlayerProfile,
  validatePlayerRuntimeRequest,
} from './one-v-one/profile-contract.mjs';
import { gateSemanticDetections, legacyProposalsToShadowDetections } from './one-v-one/semantic-detector.mjs';
import { createSingleTargetTracker } from './one-v-one/single-target-tracker.mjs';
import { createVisualServoController } from './one-v-one/visual-servo.mjs';
import { createFreshFrameFireGate } from './one-v-one/fresh-frame-fire-gate.mjs';
import { createOneVOneController } from './one-v-one/one-v-one-controller.mjs';
import { createRenderedMotionSemanticGate } from './one-v-one/rendered-motion-semantic.mjs';
import { runReplay } from './one-v-one/replay-evaluator.mjs';
import { verifyPlayerProfiles } from './verify-player-profiles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const profilePath = resolve(here, 'profiles/one-v-one-semantic-v1.profile.json');
const fixturePath = resolve(here, 'one-v-one/fixtures/scaffold-replay-v1.json');
const semanticDatasetPath = resolve(here, 'profiles/datasets/one-v-one-rendered-semantic-v2.manifest.json');
const motionSemanticEvaluationPath = resolve(here, 'profiles/datasets/rendered-motion-semantic-v1.evaluation.json');
const clone = (value) => structuredClone(value);

function opponent(sequence, x = 160, y = 90, confidence = 0.96) {
  return {
    frameSequence: sequence,
    source: 'rendered-world-view',
    provider: 'deterministic-fixture',
    semanticClass: 'mobile-opponent-operator',
    confidence,
    semanticAuthority: true,
    proposalOnly: false,
    bounds: { x: x - 8, y: y - 18, width: 16, height: 36 },
    centre: { x, y },
  };
}

function practice(sequence, x = 160, y = 90) {
  return {
    ...opponent(sequence, x, y),
    semanticClass: 'practice-target',
    confidence: 0.99,
  };
}

function frame(sequence, capturedAtMs = sequence * 34) {
  return { sequence, capturedAtMs, width: 320, height: 180, source: 'rendered-world-view' };
}

test('one-v-one profile is valid, stable, default-off and non-promoted', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const validation = validatePlayerProfile(profile);
  assert.equal(validation.ok, true);
  assert.equal(profile.status, 'scaffold-default-off');
  assert.equal(profile.selected, false);
  assert.equal(profile.promoted, false);
  assert.equal(profile.activation.liveEnabled, false);
  assert.equal(profile.activation.aimInputEnabled, false);
  assert.equal(profile.activation.automaticFireEnabled, false);
  assert.match(fingerprintProfile(profile), /^[a-f0-9]{64}$/);
  assert.equal(fingerprintProfile(profile), fingerprintProfile(clone(profile)));
});

test('activation fails closed without build, detector and calibration receipts', async () => {
  const profile = clone(await loadPlayerProfile(profilePath));
  profile.activation.liveEnabled = true;
  profile.activation.aimInputEnabled = true;
  profile.activation.automaticFireEnabled = true;
  const validation = validatePlayerProfile(profile);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('requiredBuildReceipt')));
  assert.ok(validation.errors.some((error) => error.includes('detector model')));
});

test('rendered semantic dataset freezes credited positives, hard negatives and ambiguous fail-closed labels', async () => {
  const manifest = JSON.parse(await readFile(semanticDatasetPath, 'utf8'));
  assert.equal(manifest.status, 'frozen-offline-evidence-default-off');
  assert.ok(Object.values(manifest.acceptance).every(Boolean));
  assert.ok(manifest.counts['visible-live-bot'] >= 50);
  assert.ok(manifest.counts['credited-bot-contact'] >= 50);
  assert.ok(manifest.hardNegativeIndependentSequenceCount >= 12);
  assert.equal(manifest.counts['ambiguous-reject'], 2);
  assert.equal(manifest.fairnessBoundary.hiddenStateUsedLive, false);
  assert.equal(manifest.fairnessBoundary.motionAloneMayAuthorizeFire, false);
});

test('offline motion semantic evaluation rejects every known hard negative and retains eligible bot sequences', async () => {
  const evaluation = JSON.parse(await readFile(motionSemanticEvaluationPath, 'utf8'));
  assert.equal(evaluation.passed, true);
  assert.ok(Object.values(evaluation.acceptance).every(Boolean));
  assert.equal(evaluation.summary.acceptedHardNegativeFrames, 0);
  assert.equal(evaluation.summary.acceptedAmbiguousFrames, 0);
  assert.ok(evaluation.summary.visibleBotSequenceAcceptanceRate >= 0.8);
  assert.ok(evaluation.summary.eligibleVisibleBotSequences >= 3);
});

test('unavailable production semantic model rejects every live detection', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const result = gateSemanticDetections([opponent(1)], frame(1), profile, { offlineFixture: false });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'semantic-model-unavailable');
});

test('live shadow accepts legacy rendered proposals without granting semantic or fire authority', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const target = (x) => ({
    x,
    y: 90,
    pixels: 40,
    detector: 'pass63-visible-purple-operator-v1',
    bounds: { minX: x - 6, minY: 76, width: 12, height: 28 },
  });
  const semantic = gateSemanticDetections(
    legacyProposalsToShadowDetections([target(160)], 1),
    frame(1),
    profile,
    { liveShadowProposal: true },
  );
  assert.equal(semantic.accepted.length, 1);
  assert.equal(semantic.accepted[0].semanticAuthority, false);
  assert.equal(semantic.accepted[0].disposition, 'accepted-shadow-proposal');
  const tracker = createSingleTargetTracker(profile.tracker, profile.detector.thresholds);
  tracker.update(semantic.accepted, frame(1));
  const second = gateSemanticDetections(
    legacyProposalsToShadowDetections([target(162)], 2),
    frame(2),
    profile,
    { liveShadowProposal: true },
  );
  const confirmed = tracker.update(second.accepted, frame(2));
  assert.equal(confirmed.state, 'CONFIRMED');
  assert.equal(confirmed.semanticAuthority, false);
  assert.equal(confirmed.canAuthorizeFire, false);
});

test('rendered motion semantic gate rejects static contacts and confirms independently moving contacts only while the observer is stationary', async () => {
  const target = (x, pixels = 60) => ({
    x, y: 90, pixels, detector: 'pass63-visible-purple-operator-v1',
    bounds: { minX: x - 4, minY: 84, maxX: x + 4, maxY: 96, width: 9, height: 13 },
  });
  const staticGate = createRenderedMotionSemanticGate();
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    const result = staticGate.update([target(160)], frame(sequence), { cameraMoved: false, movementMoved: false });
    assert.equal(result.detections.length, 0);
  }
  const movingGate = createRenderedMotionSemanticGate();
  assert.equal(movingGate.update([target(150)], frame(1), { cameraMoved: false, movementMoved: false }).detections.length, 0);
  assert.equal(movingGate.update([target(150.5)], frame(2), { cameraMoved: false, movementMoved: false }).detections.length, 0);
  const accepted = movingGate.update([target(153)], frame(3), { cameraMoved: false, movementMoved: false });
  assert.equal(accepted.detections.length, 1);
  assert.equal(accepted.receipt.reason, 'independent-rendered-motion-confirmed');
  assert.equal(accepted.detections[0].provider, 'rendered-motion-semantic-v1');
  const movingObserverGate = createRenderedMotionSemanticGate();
  movingObserverGate.update([target(150)], frame(1), { cameraMoved: true, movementMoved: false });
  movingObserverGate.update([target(156)], frame(2), { cameraMoved: true, movementMoved: false });
  const observerMotion = movingObserverGate.update([target(160)], frame(3), { cameraMoved: true, movementMoved: false });
  assert.equal(observerMotion.detections.length, 0);
  assert.equal(observerMotion.receipt.reason, 'observer-moving');
});

test('motion semantic authority is accepted only inside explicit no-input shadow observer mode', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const gate = createRenderedMotionSemanticGate();
  const target = (x) => ({ x, y: 90, pixels: 60, bounds: { minX: x - 4, minY: 84, maxX: x + 4, maxY: 96, width: 9, height: 13 } });
  gate.update([target(150)], frame(1), { cameraMoved: false, movementMoved: false });
  gate.update([target(151)], frame(2), { cameraMoved: false, movementMoved: false });
  const detection = gate.update([target(154)], frame(3), { cameraMoved: false, movementMoved: false }).detections[0];
  const blocked = gateSemanticDetections([detection], frame(3), profile, {});
  assert.equal(blocked.accepted.length, 0);
  assert.equal(blocked.rejected[0].reason, 'semantic-model-unavailable');
  const observer = gateSemanticDetections([detection], frame(3), profile, { liveMotionSemanticObserver: true });
  assert.equal(observer.accepted.length, 1);
  assert.equal(observer.accepted[0].semanticAuthority, true);
  assert.equal(observer.accepted[0].authorityScope, 'shadow-observer-only');
});

test('runtime contract permits only no-fire, no-item observation for the default-off shadow profile', async () => {
  const profile = await loadPlayerProfile(profilePath);
  assert.deepEqual(validatePlayerRuntimeRequest(profile, {
    shadowMode: true,
    allowLive: true,
    allowCombatFire: false,
    allowTacticalItems: false,
  }), { mode: 'live-shadow-observer', semanticAuthority: false, inputAuthority: false });
  assert.throws(() => validatePlayerRuntimeRequest(profile, {
    shadowMode: true, allowLive: true, allowCombatFire: true, allowTacticalItems: false,
  }), /forbids combat fire/);
  assert.throws(() => validatePlayerRuntimeRequest(profile, {
    shadowMode: true, allowLive: true, allowCombatFire: false, allowTacticalItems: true,
  }), /forbids tactical items/);
});

test('offline fixture gate accepts only fresh rendered opponent semantics', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const detections = [
    opponent(3, 150, 90),
    practice(3, 180, 90),
    { ...opponent(3, 200, 90), proposalOnly: true },
    opponent(2, 210, 90),
    { ...opponent(3, 220, 90), source: 'minimap' },
  ];
  const result = gateSemanticDetections(detections, frame(3), profile, { offlineFixture: true });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].centre.x, 150);
  assert.deepEqual(result.rejected.map((item) => item.reason).sort(), [
    'forbidden-semantic-class',
    'not-rendered-world-view',
    'proposal-only',
    'stale-detection-frame',
  ]);
});

test('single-target tracker confirms two-of-three, coasts without authority and reacquires identity', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const tracker = createSingleTargetTracker(profile.tracker, profile.detector.thresholds);
  const first = tracker.update([opponent(1, 130)], frame(1));
  assert.equal(first.state, 'TENTATIVE');
  assert.equal(first.canAuthorizeFire, false);
  const confirmed = tracker.update([opponent(2, 135)], frame(2));
  assert.equal(confirmed.state, 'CONFIRMED');
  assert.equal(confirmed.trackId, first.trackId);
  assert.equal(confirmed.canAuthorizeFire, true);
  const coast = tracker.update([], frame(3));
  assert.equal(coast.state, 'COASTING');
  assert.equal(coast.canAuthorizeFire, false);
  assert.equal(coast.measurementFresh, false);
  const reacquired = tracker.update([opponent(4, 145, 90, 0.65)], frame(4));
  assert.equal(reacquired.state, 'CONFIRMED');
  assert.equal(reacquired.trackId, first.trackId);
  assert.equal(reacquired.reacquired, true);
});

test('single-target tracker fails closed after the bounded coasting horizon', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const tracker = createSingleTargetTracker(profile.tracker, profile.detector.thresholds);
  tracker.update([opponent(1)], frame(1));
  tracker.update([opponent(2)], frame(2));
  let receipt;
  for (let sequence = 3; sequence <= 8; sequence += 1) receipt = tracker.update([], frame(sequence));
  assert.equal(receipt.state, 'LOST');
  assert.equal(receipt.canAuthorizeFire, false);
  assert.equal(receipt.trackId, null);
});

test('ambiguous association lowers track quality instead of forcing identity', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const tracker = createSingleTargetTracker(profile.tracker, profile.detector.thresholds);
  tracker.update([opponent(1, 150)], frame(1));
  tracker.update([opponent(2, 152)], frame(2));
  const result = tracker.update([opponent(3, 147), opponent(3, 157)], frame(3));
  assert.equal(result.state, 'COASTING');
  assert.equal(result.association.reason, 'ambiguous-association');
  assert.equal(result.canAuthorizeFire, false);
});

test('visual servo schedules bounded coarse, fine and deadband control without integral wind-up', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const servo = createVisualServoController(profile.servo);
  const coarse = servo.update({ ...opponent(1, 250, 110), vx: 0, vy: 0 }, frame(1));
  assert.equal(coarse.phase, 'COARSE');
  assert.ok(Math.abs(coarse.mouseX) <= profile.servo.maximumMouseX);
  assert.ok(Math.abs(coarse.mouseY) <= profile.servo.maximumMouseY);
  const fine = servo.update({ ...opponent(2, 171, 91), vx: 0, vy: 0 }, frame(2));
  assert.equal(fine.phase, 'FINE');
  const aligned = servo.update({ ...opponent(3, 160, 90), vx: 0, vy: 0 }, frame(3));
  assert.equal(aligned.phase, 'ALIGNED');
  assert.equal(aligned.mouseX, 0);
  assert.equal(aligned.mouseY, 0);
});

test('fresh-frame fire gate computes a candidate but the scaffold profile never authorizes it', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const gate = createFreshFrameFireGate(profile);
  const track = { state: 'CONFIRMED', trackId: 'T1', measurementFresh: true, semanticConfidence: 0.96, lastMeasurementSequence: 2, canAuthorizeFire: true };
  gate.evaluate({ track, servo: { phase: 'ALIGNED' }, frame: frame(2), lastAimCorrectionFrame: 0, nowMs: 68 });
  const result = gate.evaluate({ track: { ...track, lastMeasurementSequence: 3 }, servo: { phase: 'ALIGNED' }, frame: frame(3), lastAimCorrectionFrame: 0, nowMs: 102 });
  assert.equal(result.fireCandidate, true);
  assert.equal(result.fireAuthorized, false);
  assert.equal(result.reason, 'profile-default-off');
});

test('hypothetically armed fire gate still requires two fresh post-correction same-track alignments', async () => {
  const profile = clone(await loadPlayerProfile(profilePath));
  profile.activation = {
    stage: 'benchmark', liveEnabled: true, aimInputEnabled: true, automaticFireEnabled: true,
    requiresExplicitTestAuthorization: true,
    requiredBuildReceipt: { sha256: 'a'.repeat(64) },
    requiredCalibrationReceipt: { sha256: 'b'.repeat(64) },
    requiredDetectorReceipt: { sha256: 'c'.repeat(64) },
  };
  profile.detector.model = { status: 'verified', path: 'model.onnx', sha256: 'd'.repeat(64), calibrationId: 'cal-v1' };
  assert.equal(validatePlayerProfile(profile).ok, true);
  const gate = createFreshFrameFireGate(profile);
  const track = (sequence, state = 'CONFIRMED') => ({ state, trackId: 'T7', measurementFresh: state === 'CONFIRMED', semanticConfidence: 0.96, lastMeasurementSequence: sequence, canAuthorizeFire: state === 'CONFIRMED' });
  assert.equal(gate.evaluate({ track: track(10), servo: { phase: 'ALIGNED' }, frame: frame(10), lastAimCorrectionFrame: 10, nowMs: 340 }).reason, 'frame-not-after-correction');
  assert.equal(gate.evaluate({ track: track(11), servo: { phase: 'ALIGNED' }, frame: frame(11), lastAimCorrectionFrame: 10, nowMs: 374 }).fireAuthorized, false);
  assert.equal(gate.evaluate({ track: track(12), servo: { phase: 'ALIGNED' }, frame: frame(12), lastAimCorrectionFrame: 10, nowMs: 408 }).fireAuthorized, true);
  assert.equal(gate.evaluate({ track: track(13, 'COASTING'), servo: { phase: 'ALIGNED' }, frame: frame(13), lastAimCorrectionFrame: 10, nowMs: 900 }).fireAuthorized, false);
});

test('offline controller replay is deterministic, exercises tracking, and emits no live fire', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const first = runReplay(profile, fixture);
  const second = runReplay(profile, fixture);
  assert.equal(first.replayFingerprint, second.replayFingerprint);
  assert.equal(first.summary.fireAuthorizedCount, 0);
  assert.ok(first.summary.fireCandidateCount >= 1);
  assert.ok(first.summary.states.CONFIRMED >= 1);
  assert.ok(first.summary.states.COASTING >= 1);
  assert.ok(first.summary.semanticRejectReasons['forbidden-semantic-class'] >= 1);
  assert.equal(first.summary.inputCommandsIssued, 0);
});

test('controller telemetry includes causal lineage, track quality, servo and fire-gate receipts', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const controller = createOneVOneController(profile, { offlineFixture: true });
  controller.step({ frame: frame(1), detections: [opponent(1, 170)] });
  const result = controller.step({ frame: frame(2), detections: [opponent(2, 165)] });
  for (const field of profile.telemetry.requiredFields) assert.ok(field in result.telemetry, field);
  assert.equal(result.inputIssued, false);
  assert.equal(result.telemetry.frameSequence, 2);
  assert.equal(result.telemetry.trackState, 'CONFIRMED');
});

test('driver verifies the exact profile fingerprint and refuses the default-off scaffold before browser launch', async () => {
  const profile = await loadPlayerProfile(profilePath);
  const result = spawnSync(process.execPath, [
    resolve(here, 'atomic-player-driver.mjs'),
    '--player-profile', profilePath,
    '--player-profile-fingerprint', fingerprintProfile(profile),
    '--allow-live',
  ], { cwd: resolve(here, '../..'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /default-off and cannot enter a live session/);
  assert.doesNotMatch(result.stderr, /phase=browser-launch/);
});

test('launcher surfaces forward both profile path and fingerprint only when explicitly configured', async () => {
  const campaign = await readFile('/root/.hermes/scripts/run_atomic_player_campaign.sh', 'utf8');
  const powershell = await readFile('/root/.hermes/scripts/run_atomic_player_game.ps1', 'utf8');
  assert.match(campaign, /PLAYER_PROFILE_PATH/);
  assert.match(campaign, /PlayerProfileFingerprint/);
  assert.match(campaign, /PLAYER_PROFILE_SHADOW/);
  assert.match(campaign, /PLAYER_PROFILE_MOTION_SEMANTIC_SHADOW/);
  assert.match(campaign, /CANDIDATE_IMAGE_INTERVAL_MS/);
  assert.match(powershell, /--player-profile/);
  assert.match(powershell, /--player-profile-fingerprint/);
  assert.match(powershell, /--player-profile-shadow/);
  assert.match(powershell, /--player-profile-motion-semantic-shadow/);
  assert.match(powershell, /BoundedCalibration/);
  assert.match(powershell, /CandidateImageInterval/);
  assert.match(powershell, /PlayerProfileFingerprint is required/);
});

test('profile registry verifies immutable legacy evidence, implementation hashes and replay receipt', async () => {
  const receipt = await verifyPlayerProfiles(resolve(here, 'profiles/index.json'));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.preservedCurrentProfileId, 'legacy-offensive-accuracy-v2-frozen-20260729');
  assert.equal(receipt.candidateProfileId, 'one-v-one-semantic-v1-scaffold');
  assert.equal(receipt.replaySummary.fireAuthorizedCount, 0);
  assert.equal(receipt.replaySummary.inputCommandsIssued, 0);
});
