import test from 'node:test';
import assert from 'node:assert/strict';
import { createTacticalPolicy } from './tactical-policy.mjs';

test('damage burst latches one retreat direction without per-hit oscillation', () => {
  const policy = createTacticalPolicy({ retreatDamage: 18 });
  const first = policy.update({ now: 1000, active: true, health: 90, damageDelta: 10, movementCycle: 0 });
  assert.equal(first.mode, 'roam');
  const second = policy.update({ now: 1200, active: true, health: 80, damageDelta: 10, movementCycle: 1 });
  assert.equal(second.mode, 'retreat');
  const direction = second.direction;
  const third = policy.update({ now: 1300, active: true, health: 75, damageDelta: 5, movementCycle: 2 });
  assert.equal(third.mode, 'retreat');
  assert.equal(third.direction, direction);
  assert.ok(third.keys.includes('KeyS'));
  assert.ok(third.keys.includes('ShiftLeft'));
});

test('recovery is bounded and cooldown prevents repeated stuck oscillation', () => {
  const policy = createTacticalPolicy({ recoveryDurationMs: 1000, recoveryCooldownMs: 4000 });
  const start = policy.update({ now: 1000, active: true, health: 100, stuck: true, movementCycle: 0 });
  assert.equal(start.mode, 'recover');
  assert.equal(Math.abs(start.turn), 92);
  const held = policy.update({ now: 1500, active: true, health: 100, stuck: true, movementCycle: 1 });
  assert.equal(held.mode, 'recover');
  assert.equal(held.turn, 0);
  const clear = policy.update({ now: 2200, active: true, health: 100, stuck: true, movementCycle: 2 });
  assert.equal(clear.mode, 'recover');
  assert.equal(clear.reason, 'stuck-cooldown-hold');
});

test('engagement stops translation except for a bounded post-shot strafe', () => {
  const policy = createTacticalPolicy({ postShotStrafeMs: 650 });
  const lock = policy.update({ now: 1000, active: true, health: 100, currentTarget: true, lastShotAt: -Infinity, movementCycle: 0 });
  assert.equal(lock.mode, 'engage');
  assert.deepEqual(lock.keys, []);
  assert.equal(lock.allowEngagement, true);
  const postShot = policy.update({ now: 1200, active: true, health: 100, currentTarget: true, lastShotAt: 1100, movementCycle: 1 });
  assert.equal(postShot.keys.length, 1);
});

test('visible damage finish window suppresses post-shot displacement without weakening engagement authority', () => {
  const policy = createTacticalPolicy({ postShotStrafeMs: 650 });
  const result = policy.update({
    now: 1200,
    active: true,
    health: 100,
    currentTarget: true,
    holdEngagement: true,
    lastShotAt: 1100,
    movementCycle: 1,
  });
  assert.equal(result.mode, 'engage');
  assert.equal(result.allowEngagement, true);
  assert.deepEqual(result.keys, []);
});

test('close minimap threats produce lateral exposure control instead of rushing', () => {
  const policy = createTacticalPolicy({ closeThreatDistance: 18 });
  const result = policy.update({
    now: 1000,
    active: true,
    health: 100,
    movementCycle: 0,
    minimapThreat: { bearingRadians: 0.2, distance: 12 },
  });
  assert.equal(result.mode, 'roam');
  assert.deepEqual(result.keys, ['KeyA']);
});

test('low health vetoes engagement until retreat expires', () => {
  const policy = createTacticalPolicy({ retreatHealth: 45, retreatDurationMs: 1500 });
  const result = policy.update({ now: 1000, active: true, health: 40, damageDelta: 5, currentTarget: true, movementCycle: 0 });
  assert.equal(result.mode, 'retreat');
  assert.equal(result.allowEngagement, false);
});

test('missing health fails closed and cannot authorize engagement', () => {
  const policy = createTacticalPolicy();
  const result = policy.update({ now: 1000, active: true, currentTarget: true, movementCycle: 0 });
  assert.equal(result.mode, 'recover');
  assert.equal(result.reason, 'invalid-health-hold');
  assert.equal(result.allowEngagement, false);
  assert.deepEqual(result.keys, []);
});

test('low health cannot silently expire from retreat into engagement', () => {
  const policy = createTacticalPolicy({ retreatHealth: 45, retreatDurationMs: 500 });
  policy.update({ now: 1000, active: true, health: 40, damageDelta: 5, currentTarget: true, movementCycle: 0 });
  const result = policy.update({ now: 1700, active: true, health: 40, damageDelta: 0, currentTarget: true, movementCycle: 1 });
  assert.equal(result.mode, 'recover');
  assert.equal(result.reason, 'low-health-hold');
  assert.equal(result.allowEngagement, false);
});

test('opt-in low-health evasion keeps moving after the initial retreat timer expires', () => {
  const policy = createTacticalPolicy({ retreatHealth: 45, retreatDurationMs: 500, lowHealthEvade: true });
  policy.update({ now: 1000, active: true, health: 40, damageDelta: 5, currentTarget: true, movementCycle: 0 });
  const result = policy.update({ now: 1700, active: true, health: 40, damageDelta: 0, currentTarget: true, movementCycle: 1 });
  assert.equal(result.mode, 'retreat');
  assert.equal(result.reason, 'low-health-evasion');
  assert.equal(result.allowEngagement, false);
  assert.ok(result.keys.includes('KeyS'));
  assert.ok(result.keys.includes('ShiftLeft'));
  assert.equal(policy.snapshot().lowHealthEvasionFrames, 1);
});

test('inactive respawn state clears old retreat timers', () => {
  const policy = createTacticalPolicy({ retreatDamage: 5, retreatDurationMs: 2000 });
  assert.equal(policy.update({ now: 1000, active: true, health: 80, damageDelta: 6, movementCycle: 0 }).mode, 'retreat');
  assert.equal(policy.update({ now: 1200, active: false, health: 0, movementCycle: 1 }).mode, 'roam');
  const respawn = policy.update({ now: 1300, active: true, health: 100, damageDelta: 0, movementCycle: 2 });
  assert.equal(respawn.mode, 'roam');
});

test('opt-in respawn escape leaves the initial life unchanged and reverse-sprints after a rendered respawn', () => {
  const policy = createTacticalPolicy({ respawnEscapeDurationMs: 2500, respawnReentryDurationMs: 2000 });
  const initialLife = policy.update({ now: 1000, active: true, health: 100, movementCycle: 0 });
  assert.equal(initialLife.mode, 'roam');
  assert.equal(policy.snapshot().respawnEscapeActivations, 0);

  policy.update({ now: 2000, active: false, health: 0, movementCycle: 1 });
  const respawn = policy.update({ now: 3000, active: true, health: 100, movementCycle: 2 });
  assert.equal(respawn.mode, 'retreat');
  assert.equal(respawn.reason, 'respawn-escape');
  assert.equal(respawn.allowEngagement, false);
  assert.ok(respawn.keys.includes('KeyS'));
  assert.ok(respawn.keys.includes('ShiftLeft'));
  assert.equal(policy.snapshot().respawnEscapeActivations, 1);
  assert.equal(policy.snapshot().respawnEscapeFrames, 1);

  const reentry = policy.update({ now: 5600, active: true, health: 100, movementCycle: 3, navigationTick: true });
  assert.equal(reentry.mode, 'roam');
  assert.equal(reentry.reason, 'respawn-reentry');
  assert.ok(reentry.keys.includes('KeyW'));
  assert.ok(reentry.keys.includes('ShiftLeft'));
  assert.equal(policy.snapshot().respawnReentryFrames, 1);

  const visibleDuringReentry = policy.update({ now: 5700, active: true, health: 100, currentTarget: true, movementCycle: 4 });
  assert.equal(visibleDuringReentry.mode, 'engage');
  assert.equal(visibleDuringReentry.allowEngagement, true);

  const expired = policy.update({ now: 7600, active: true, health: 100, movementCycle: 5 });
  assert.equal(expired.mode, 'roam');
  assert.equal(expired.reason, 'roam-clear');
});

test('rendered cover overrides scalar retreat only after damage and preserves visible receipts', () => {
  const policy = createTacticalPolicy({
    renderedCover: true,
    coverProbeDurationMs: 1000,
    coverOcclusionConfirmMs: 300,
    coverDamageQuietMs: 400,
    coverHoldDurationMs: 700,
  });
  const targetDetails = { x: 80, pixels: 40, bounds: { width: 8, height: 12 } };
  const coverCues = { left: { score: 0.03 }, right: { score: 0.20 } };
  const probe = policy.update({
    now: 100,
    active: true,
    health: 88,
    healthFresh: true,
    movementCycle: 0,
    damageDelta: 12,
    currentTarget: true,
    currentTargetDetails: targetDetails,
    rawTarget: true,
    rawTargetDetails: targetDetails,
    renderedCoverCues: coverCues,
    frameWidth: 320,
  });
  assert.equal(probe.mode, 'cover-probe');
  assert.deepEqual(probe.keys, ['KeyD', 'ShiftLeft']);
  assert.equal(probe.allowEngagement, false);
  assert.equal(probe.coverEvent.kind, 'activate');
  assert.equal(policy.snapshot().coverEngagementSuppressedFrames, 1);

  policy.update({ now: 300, active: true, health: 88, healthFresh: true, movementCycle: 1, renderedCoverCues: coverCues, frameWidth: 320 });
  const hold = policy.update({ now: 700, active: true, health: 88, healthFresh: true, movementCycle: 2, renderedCoverCues: coverCues, frameWidth: 320 });
  assert.equal(hold.mode, 'cover-hold');
  assert.equal(hold.allowScan, false);
  assert.equal(hold.coverEvent.kind, 'acquire');
  const receipt = policy.snapshot().renderedCover;
  assert.equal(receipt.activations, 1);
  assert.equal(receipt.acquisitions, 1);
});

test('quick-death receipts lengthen escape and hold a safe cooldown before re-entry', () => {
  const policy = createTacticalPolicy({
    respawnEscapeDurationMs: 1000,
    respawnReentryDurationMs: 2500,
    respawnQuickDeathWindowMs: 30_000,
    respawnQuickDeathEscapeBonusMs: 500,
    respawnQuickDeathCooldownMs: 4000,
  });
  policy.update({ now: 0, active: true, health: 100 });
  policy.update({ now: 10_000, active: false, health: 0 });
  const escaped = policy.update({ now: 12_000, active: true, health: 100, navigationTick: true });
  assert.equal(escaped.mode, 'retreat');
  assert.equal(escaped.reason, 'respawn-escape');

  const cooldown = policy.update({ now: 14_000, active: true, health: 100 });
  assert.equal(cooldown.mode, 'anchor');
  assert.equal(cooldown.reason, 'quick-death-cooldown');
  assert.deepEqual(cooldown.keys, []);

  const defended = policy.update({ now: 14_500, active: true, health: 100, currentTarget: true });
  assert.equal(defended.mode, 'engage');
  assert.equal(defended.allowEngagement, true);

  const reentry = policy.update({ now: 18_000, active: true, health: 100, navigationTick: true });
  assert.equal(reentry.reason, 'respawn-reentry');
  assert.deepEqual(reentry.keys, ['KeyW', 'ShiftLeft']);
  const receipt = policy.snapshot();
  assert.equal(receipt.quickDeathReceipts, 1);
  assert.equal(receipt.quickDeathStreak, 1);
  assert.equal(receipt.lastLifeDurationMs, 10_000);
  assert.ok(receipt.quickDeathCooldownFrames >= 1);
});

test('respawn escape remains default-off after an active-inactive-active cycle', () => {
  const policy = createTacticalPolicy();
  policy.update({ now: 1000, active: true, health: 100, movementCycle: 0 });
  policy.update({ now: 2000, active: false, health: 0, movementCycle: 1 });
  const respawn = policy.update({ now: 3000, active: true, health: 100, movementCycle: 2 });
  assert.equal(respawn.mode, 'roam');
  assert.equal(policy.snapshot().respawnEscapeActivations, 0);
});

test('retreat latches a strafe direction away from a visible minimap threat', () => {
  const policy = createTacticalPolicy();
  const retreat = policy.update({ now: 100, active: true, health: 75, damageDelta: 20, minimapThreat: { bearingRadians: 0.6 } });
  assert.equal(retreat.mode, 'retreat');
  assert.ok(retreat.keys.includes('KeyA'));
  assert.ok(!retreat.keys.includes('KeyD'));
  const held = policy.update({ now: 300, active: true, health: 70, damageDelta: 5, minimapThreat: { bearingRadians: -0.6 } });
  assert.ok(held.keys.includes('KeyA'));
});

test('opt-in retreat return fire requires a confirmed operator and sufficient visible health', () => {
  const disabled = createTacticalPolicy({ retreatDamage: 5 });
  const defaultRetreat = disabled.update({ now: 100, active: true, health: 80, damageDelta: 6, currentTarget: true });
  assert.equal(defaultRetreat.mode, 'retreat');
  assert.equal(defaultRetreat.allowEngagement, false);

  const enabled = createTacticalPolicy({ retreatDamage: 5, retreatReturnFire: true, retreatReturnFireMinimumHealth: 30 });
  const armedRetreat = enabled.update({ now: 100, active: true, health: 80, damageDelta: 6, currentTarget: true });
  assert.equal(armedRetreat.mode, 'retreat');
  assert.equal(armedRetreat.allowEngagement, true);
  assert.equal(armedRetreat.allowScan, true);
  assert.equal(enabled.snapshot().retreatReturnFireFrames, 1);

  const lowHealth = enabled.update({ now: 200, active: true, health: 20, damageDelta: 0, currentTarget: true });
  assert.equal(lowHealth.allowEngagement, false);
});

test('respawn escape never enables retreat return fire', () => {
  const policy = createTacticalPolicy({ respawnEscapeDurationMs: 2500, retreatReturnFire: true });
  policy.update({ now: 100, active: true, health: 100 });
  policy.update({ now: 200, active: false, health: 0 });
  const escape = policy.update({ now: 300, active: true, health: 100, currentTarget: true });
  assert.equal(escape.reason, 'respawn-escape');
  assert.equal(escape.allowEngagement, false);
});

test('contact search stays dormant initially, sweeps after a confirmed-target drought, and stops on confirmation', () => {
  const policy = createTacticalPolicy({ contactSearchAfterMs: 15_000, contactSearchTurn: 24 });
  const initial = policy.update({ now: 1000, active: true, health: 100, movementCycle: 0, navigationTick: true });
  assert.equal(initial.reason, 'roam-clear');
  const search = policy.update({ now: 16_100, active: true, health: 100, movementCycle: 1, navigationTick: true });
  assert.equal(search.reason, 'contact-search-sweep');
  assert.equal(search.turn, 24);
  assert.ok(search.keys.includes('KeyW'));
  assert.ok(search.keys.includes('ShiftLeft'));
  assert.equal(policy.snapshot().contactSearchFrames, 1);
  const found = policy.update({ now: 16_200, active: true, health: 100, currentTarget: true, movementCycle: 2 });
  assert.equal(found.mode, 'engage');
  assert.equal(found.allowEngagement, true);
});

test('offensive profile pursues a recently lost rendered contact without granting fire', () => {
  const policy = createTacticalPolicy({ offensiveProfile: true, offensiveContactCommitMs: 900, contactSearchTurn: 18 });
  const engage = policy.update({
    now: 100, active: true, health: 100, currentTarget: true,
    movementCycle: 0, navigationTick: false, lastShotAt: Number.NEGATIVE_INFINITY,
  });
  assert.equal(engage.mode, 'engage');
  assert.equal(engage.allowEngagement, true);
  assert.deepEqual(engage.keys, []);

  const pursuit = policy.update({
    now: 300, active: true, health: 100, currentTarget: false,
    movementCycle: 1, navigationTick: true,
    minimapThreat: { bearingRadians: 0.7, distance: 24 },
  });
  assert.equal(pursuit.reason, 'offensive-contact-pursuit');
  assert.deepEqual(pursuit.keys, ['KeyW', 'ShiftLeft']);
  assert.equal(pursuit.turn, 18);
  assert.equal(pursuit.allowEngagement, false);

  const expired = policy.update({
    now: 1101, active: true, health: 100, currentTarget: false,
    movementCycle: 2, navigationTick: false,
  });
  assert.equal(expired.reason, 'roam-clear');
  const snapshot = policy.snapshot();
  assert.equal(snapshot.offensiveEngagementFrames, 1);
  assert.equal(snapshot.offensiveStableAimFrames, 1);
  assert.equal(snapshot.offensivePursuitFrames, 1);
});

test('offensive profile remains default-off after target loss', () => {
  const policy = createTacticalPolicy({ offensiveContactCommitMs: 900 });
  policy.update({ now: 100, active: true, health: 100, currentTarget: true, movementCycle: 0, navigationTick: false });
  const decision = policy.update({ now: 300, active: true, health: 100, currentTarget: false, movementCycle: 1, navigationTick: false });
  assert.equal(decision.reason, 'roam-clear');
  assert.equal(policy.snapshot().offensivePursuitFrames, 0);
});

test('offensive lane isolation makes a bounded diagonal move under rendered two-lane damage without granting fire', () => {
  const policy = createTacticalPolicy({
    offensiveProfile: true,
    offensiveLaneIsolation: true,
    offensiveLaneMinimumSpreadRadians: 0.75,
    offensiveLaneMaximumDistance: 60,
    offensiveLaneBurstMs: 450,
    offensiveLaneCooldownMs: 1200,
    offensiveLaneDamageMinimum: 15,
    retreatHealth: 20,
    retreatDamage: 150,
    damageWindowMs: 700,
  });
  const threats = [
    { bearingRadians: -0.62, distance: 20 },
    { bearingRadians: 0.58, distance: 28 },
  ];
  const first = policy.update({
    now: 100, active: true, health: 100, healthFresh: true, damageDelta: 16,
    currentTarget: true, rawTarget: true, minimapThreats: threats, minimapThreat: threats[0], movementCycle: 1,
  });
  assert.equal(first.reason, 'offensive-crossfire-isolation');
  assert.equal(first.allowEngagement, false);
  assert.deepEqual(first.keys, ['KeyW', 'ShiftLeft', 'KeyA']);
  assert.equal(first.offensiveLaneEvent.kind, 'activate');
  assert.equal(first.offensiveLaneEvent.threatCount, 2);
  const continued = policy.update({
    now: 300, active: true, health: 84, healthFresh: true, damageDelta: 0,
    currentTarget: true, rawTarget: true, minimapThreats: threats, minimapThreat: threats[0], movementCycle: 2,
  });
  assert.equal(continued.reason, 'offensive-crossfire-isolation');
  assert.equal(continued.offensiveLaneEvent, null);
  const resumed = policy.update({
    now: 600, active: true, health: 84, healthFresh: true, damageDelta: 0,
    currentTarget: true, rawTarget: true, minimapThreats: threats, minimapThreat: threats[0], movementCycle: 3,
  });
  assert.equal(resumed.reason, 'confirmed-operator');
  assert.equal(resumed.allowEngagement, true);
  assert.equal(policy.snapshot().offensiveLaneIsolationActivations, 1);
  assert.equal(policy.snapshot().offensiveLaneIsolationFrames, 2);
  assert.equal(policy.snapshot().offensiveLaneEngagementSuppressions, 2);
});

test('proactive offensive lane isolation can activate from rendered crossfire geometry before damage', () => {
  const policy = createTacticalPolicy({
    offensiveLaneIsolation: true,
    offensiveLaneRequireRecentDamage: false,
    offensiveLaneMinimumSpreadRadians: 0.75,
    offensiveLaneMaximumDistance: 60,
  });
  const threats = [
    { bearingRadians: -0.2, distance: 36 },
    { bearingRadians: 1.1, distance: 44 },
  ];
  const result = policy.update({
    now: 100, active: true, health: 100, healthFresh: true, damageDelta: 0,
    currentTarget: true, rawTarget: true, minimapThreats: threats, minimapThreat: threats[0], movementCycle: 1,
  });
  assert.equal(result.reason, 'offensive-crossfire-isolation');
  assert.equal(result.allowEngagement, false);
  assert.equal(result.offensiveLaneEvent.damageWindowAmount, 0);
});

test('opt-in contact search turns toward the rendered player-up minimap bearing', () => {
  const policy = createTacticalPolicy({ contactSearchAfterMs: 1000, contactSearchTurn: 20, contactSearchMinimapGuidance: true });
  policy.update({ now: 100, active: true, health: 100, movementCycle: 0, navigationTick: false });
  const right = policy.update({ now: 1200, active: true, health: 100, movementCycle: 1, navigationTick: true, minimapThreat: { bearingRadians: 0.8, distance: 30 } });
  assert.equal(right.reason, 'contact-search-sweep');
  assert.equal(right.turn, 20);
  const left = policy.update({ now: 1400, active: true, health: 100, movementCycle: 1, navigationTick: true, minimapThreat: { bearingRadians: -0.5, distance: 24 } });
  assert.equal(left.turn, -20);
  assert.equal(policy.snapshot().minimapGuidedContactSearchFrames, 2);
});

test('no-threat roaming performs bounded alternating route sweeps', () => {
  const policy = createTacticalPolicy({ routeSweepInterval: 12, routeSweepTurn: 18 });
  const left = policy.update({ now: 100, active: true, health: 100, movementCycle: 0, navigationTick: true });
  const right = policy.update({ now: 1200, active: true, health: 100, movementCycle: 12, navigationTick: true });
  assert.equal(left.mode, 'roam');
  assert.equal(left.turn, -18);
  assert.equal(right.turn, 18);
});

test('visible four-kill lead activates a defensive bank without disabling rendered engagement', () => {
  const policy = createTacticalPolicy({ bankLeadMinimumKills: 4, bankLeadMinimumMargin: 1 });
  const bank = policy.update({
    now: 1000,
    active: true,
    health: 100,
    kills: 4,
    deaths: 2,
    movementCycle: 1,
    navigationTick: false,
  });
  assert.equal(bank.mode, 'bank');
  assert.equal(bank.leadBankActive, true);
  assert.equal(bank.allowEngagement, false);
  assert.equal(bank.allowScan, true);
  assert.ok(!bank.keys.includes('KeyW'));

  const visibleOperator = policy.update({
    now: 1100,
    active: true,
    health: 100,
    kills: 4,
    deaths: 2,
    currentTarget: true,
    movementCycle: 2,
  });
  assert.equal(visibleOperator.mode, 'engage');
  assert.equal(visibleOperator.allowEngagement, true);
});

test('lead banking is opt-in and missing score cannot activate it', () => {
  const disabled = createTacticalPolicy();
  assert.equal(disabled.update({ now: 100, active: true, health: 100, kills: 6, deaths: 1, movementCycle: 0 }).mode, 'roam');
  const enabled = createTacticalPolicy({ bankLeadMinimumKills: 4 });
  assert.equal(enabled.update({ now: 100, active: true, health: 100, movementCycle: 0 }).mode, 'roam');
  assert.equal(enabled.snapshot().leadBankActive, false);
});

test('visible kill anchors the productive angle while preserving scan authority', () => {
  const policy = createTacticalPolicy({ killAnchorDurationMs: 30_000 });
  const result = policy.update({
    now: 10_000,
    active: true,
    health: 100,
    visibleKillDelta: 1,
    kills: 1,
    deaths: 2,
    movementCycle: 0,
  });
  assert.equal(result.mode, 'anchor');
  assert.equal(result.reason, 'visible-kill-productive-angle');
  assert.deepEqual(result.keys, []);
  assert.equal(result.allowScan, true);
  assert.equal(result.allowEngagement, false);
  assert.equal(result.killAnchorActive, true);
  assert.equal(result.anchorEvent.kind, 'activate');
  assert.equal(policy.snapshot().killAnchorActivations, 1);
});

test('fresh visible operator still engages during a kill anchor', () => {
  const policy = createTacticalPolicy({ killAnchorDurationMs: 30_000 });
  policy.update({ now: 10_000, active: true, health: 100, visibleKillDelta: 1, movementCycle: 0 });
  const result = policy.update({
    now: 11_000,
    active: true,
    health: 100,
    currentTarget: true,
    movementCycle: 1,
  });
  assert.equal(result.mode, 'engage');
  assert.equal(result.allowEngagement, true);
  assert.equal(result.killAnchorActive, true);
  assert.equal(policy.snapshot().killAnchorEngagementFrames, 1);
});

test('damage retreat overrides a live kill anchor', () => {
  const policy = createTacticalPolicy({ killAnchorDurationMs: 30_000, retreatDamage: 18 });
  policy.update({ now: 10_000, active: true, health: 100, visibleKillDelta: 1, movementCycle: 0 });
  const result = policy.update({
    now: 10_300,
    active: true,
    health: 80,
    damageDelta: 20,
    movementCycle: 1,
  });
  assert.equal(result.mode, 'retreat');
  assert.equal(result.killAnchorActive, true);
  assert.ok(result.keys.includes('KeyS'));
});

test('clustered visible kill renews the anchor and expiry returns to roam', () => {
  const policy = createTacticalPolicy({ killAnchorDurationMs: 30_000 });
  policy.update({ now: 10_000, active: true, health: 100, visibleKillDelta: 1, movementCycle: 0 });
  const renewed = policy.update({ now: 25_000, active: true, health: 100, visibleKillDelta: 1, movementCycle: 1 });
  assert.equal(renewed.anchorEvent.kind, 'renew');
  assert.equal(policy.snapshot().killAnchorRenewals, 1);
  const expired = policy.update({ now: 55_001, active: true, health: 100, movementCycle: 2 });
  assert.equal(expired.mode, 'roam');
  assert.equal(expired.killAnchorActive, false);
});

test('bounded raw-target observation resumes roaming when a candidate never confirms', () => {
  const policy = createTacticalPolicy({ rawTargetObserveDurationMs: 700, rawTargetObserveResetMs: 1_500 });
  const first = policy.update({ now: 100, active: true, health: 100, rawTarget: true, navigationTick: false });
  assert.equal(first.mode, 'engage');
  assert.equal(first.reason, 'candidate-observation');
  const expired = policy.update({ now: 801, active: true, health: 100, rawTarget: true, navigationTick: false });
  assert.equal(expired.mode, 'roam');
  assert.equal(expired.reason, 'candidate-observation-expired');
  assert.deepEqual(expired.keys, ['KeyW']);
  assert.equal(policy.snapshot().rawTargetObservationExpirations, 1);
});

test('confirmed target still engages after raw observation expiry', () => {
  const policy = createTacticalPolicy({ rawTargetObserveDurationMs: 700 });
  policy.update({ now: 0, active: true, health: 100, rawTarget: true, navigationTick: false });
  const confirmed = policy.update({ now: 900, active: true, health: 100, rawTarget: true, currentTarget: true, navigationTick: false });
  assert.equal(confirmed.mode, 'engage');
  assert.equal(confirmed.reason, 'confirmed-operator');
});

test('a candidate absent past reset receives one fresh bounded observation window', () => {
  const policy = createTacticalPolicy({ rawTargetObserveDurationMs: 700, rawTargetObserveResetMs: 1_500 });
  policy.update({ now: 0, active: true, health: 100, rawTarget: true, navigationTick: false });
  policy.update({ now: 800, active: true, health: 100, rawTarget: true, navigationTick: false });
  policy.update({ now: 2_400, active: true, health: 100, rawTarget: false, navigationTick: false });
  const reacquired = policy.update({ now: 2_500, active: true, health: 100, rawTarget: true, navigationTick: false });
  assert.equal(reacquired.mode, 'engage');
  assert.equal(reacquired.reason, 'candidate-observation');
  assert.equal(policy.snapshot().rawTargetObservationExpirations, 1);
});
