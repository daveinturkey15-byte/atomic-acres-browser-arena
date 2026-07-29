import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseCombat, contactClusters, elapsedSeconds } from './analyze-combat.mjs';

test('elapsed labels and five-second contact windows are deterministic', () => {
  assert.equal(elapsedSeconds('01:02.3'), 62.3);
  assert.equal(elapsedSeconds('bad'), null);
  assert.deepEqual(contactClusters([{ at: '00:01.0' }, { at: '00:04.0' }, { at: '00:10.0' }]), [
    { firstAtSeconds: 1, lastAtSeconds: 4, eventCount: 2 },
    { firstAtSeconds: 10, lastAtSeconds: 10, eventCount: 1 },
  ]);
});

test('combat benchmark separates bots, practice targets, survival and control metrics', () => {
  const summary = {
    build: 'PASS 63',
    match: { arena: 'Atomic Acres', mode: 'solo', result: 'DEFEAT', durationSeconds: 60, completedAt: '2026-07-25T00:01:00Z', damageTimelineComplete: true },
    stats: { kills: 1, deaths: 2, killDeathRatio: 0.5, shotsFired: 10, shotsHit: 4, accuracyPercent: 40, damageDealt: 100, damageTaken: 150, headshots: 1, bestKillstreak: 1 },
    participants: [
      { name: 'Jigglyclaw', kind: 'player', finalHealth: 50 },
      { name: 'Bot', kind: 'solo-bot', kills: 2, deaths: 1, damageDealt: 150, damageTaken: 100, finalHealth: 0 },
    ],
    damageTimeline: [
      { at: '00:05.0', from: 'Jigglyclaw', to: '1-point range target', damage: 1, distanceMeters: 5, hitZone: 'body' },
      { at: '00:12.0', from: 'Jigglyclaw', to: 'Bot', damage: 30, distanceMeters: 8, hitZone: 'torso' },
      { at: '00:13.0', from: 'Bot', to: 'Jigglyclaw', damage: 20, targetHealthAfter: 80, distanceMeters: 9 },
      { at: '00:14.0', from: 'Jigglyclaw', to: 'Jigglyclaw', source: 'environment', damage: 4, targetHealthAfter: 76 },
      { at: '00:20.0', from: 'Jigglyclaw', to: 'Bot', damage: 70, distanceMeters: 12, hitZone: 'head' },
      { at: '00:25.0', from: 'Bot', to: 'Jigglyclaw', damage: 80, targetHealthAfter: 0, distanceMeters: 8 },
      { at: '00:50.0', from: 'Bot', to: 'Jigglyclaw', damage: 100, health: '100 -> 0 HP', distanceMeters: 10 },
    ],
  };
  const report = {
    source: { pass: 'PASS 63', url: 'https://example.test/' }, session: { pointerLock: true },
    fairness: { forbiddenInputsUsed: [] },
    performance: {
      observedRenderProfile: 'performance', visionFrames: 50, rawTargetFrames: 10, confirmedTargetFrames: 4,
      rejectedScreenLockedFrames: 3, fpsCounter: { value: '30' }, framePacing: { cadenceHz: 29.5 },
      visionLoopMs: { median: 7, p95: 10 },
      visionStream: { sourceFps: 8, failedFrames: 0, mode: 'cdp-screencast-latest-frame', captureMs: { minimum: 20, median: 25, p95: 40, maximum: 50 } },
    },
    input: {
      aimMoves: 50, shotPulses: 10, bursts: 3, warmupShotPulses: 0, unconfirmedShotPulses: 0,
      reloadRequests: 1, stuckRecoveries: 2, damageReactions: 3, maximumObservedHoldMs: 360,
      killAnchorActivations: 2, killAnchorRenewals: 1, killAnchorActiveFrames: 40, killAnchorEngagementFrames: 8,
      rawTargetObservationExpirations: 4, rawTargetObservationFrames: 33, lowHealthEvasionFrames: 21,
      respawnEscapeActivations: 3, respawnEscapeFrames: 27, respawnReentryFrames: 19,
      lastLifeDurationMs: 12_500, quickDeathStreak: 2, quickDeathReceipts: 4, quickDeathCooldownFrames: 29,
      retreatReturnFireFrames: 11, contactSearchFrames: 17, minimapGuidedContactSearchFrames: 9,
      renderedCoverActivations: 5, renderedCoverAcquisitions: 3, renderedCoverProbeReversals: 2, renderedCoverAborts: 1,
      renderedCoverProbeFrames: 31, renderedCoverOcclusionFrames: 13, renderedCoverHoldFrames: 23,
      renderedCoverHealthGatedHoldFrames: 14,
      renderedCoverPeekFrames: 7, renderedCoverReturnFrames: 9, renderedCoverConfirmedPeekFrames: 2,
      renderedCoverCueChosenDirections: 4, renderedCoverTargetAwayDirections: 1,
      renderedCoverMeanLeftCue: 0.12, renderedCoverMeanRightCue: 0.27, firstCoverAcquisitionCaptured: true,
      exposureGateSuppressions: 6, exposurePixelSuppressions: 5, exposureAreaSuppressions: 4, exposureHeightSuppressions: 3,
      configuredMaxHoldMs: 2_000, releasedAtEnd: true, holdWatchdogExceeded: false,
    },
    browser: { pageErrors: [], warningOrErrorCount: 0 },
    outcome: { matchEndedObserved: true, downloadedSummary: {}, downloadedTechnical: {} },
  };
  const result = analyseCombat(summary, report);
  assert.equal(result.result.shotsPerKill, 10);
  assert.equal(result.contacts.creditedBotDamageEvents, 2);
  assert.equal(result.contacts.nonBotDamageEvents, 1);
  assert.equal(result.contacts.incomingDamageEvents, 4);
  assert.equal(result.contacts.outgoingContactWindows, 2);
  assert.equal(result.contacts.medianOutgoingDistanceMeters, 10);
  assert.deepEqual(result.contacts.hitZones, { torso: 1, head: 1 });
  assert.equal(result.survival.medianCompletedLifeSeconds, 25);
  assert.equal(result.survival.longestCompletedLifeSeconds, 25);
  assert.equal(result.survival.finalCensoredLifeSeconds, 10);
  assert.equal(result.perception.confirmedToRawRatio, 0.4);
  assert.equal(result.control.gameFps, 30);
  assert.equal(result.control.killAnchorActivations, 2);
  assert.equal(result.control.killAnchorRenewals, 1);
  assert.equal(result.control.killAnchorActiveFrames, 40);
  assert.equal(result.control.killAnchorEngagementFrames, 8);
  assert.equal(result.control.rawTargetObservationExpirations, 4);
  assert.equal(result.control.rawTargetObservationFrames, 33);
  assert.equal(result.control.lowHealthEvasionFrames, 21);
  assert.equal(result.control.respawnEscapeActivations, 3);
  assert.equal(result.control.respawnEscapeFrames, 27);
  assert.equal(result.control.respawnReentryFrames, 19);
  assert.equal(result.control.lastLifeDurationMs, 12_500);
  assert.equal(result.control.quickDeathStreak, 2);
  assert.equal(result.control.quickDeathReceipts, 4);
  assert.equal(result.control.quickDeathCooldownFrames, 29);
  assert.equal(result.control.retreatReturnFireFrames, 11);
  assert.equal(result.control.contactSearchFrames, 17);
  assert.equal(result.control.minimapGuidedContactSearchFrames, 9);
  assert.equal(result.control.renderedCoverActivations, 5);
  assert.equal(result.control.renderedCoverAcquisitions, 3);
  assert.equal(result.control.renderedCoverProbeReversals, 2);
  assert.equal(result.control.renderedCoverAborts, 1);
  assert.equal(result.control.renderedCoverHealthGatedHoldFrames, 14);
  assert.equal(result.control.renderedCoverConfirmedPeekFrames, 2);
  assert.equal(result.control.renderedCoverMeanRightCue, 0.27);
  assert.equal(result.control.firstCoverAcquisitionCaptured, true);
  assert.equal(result.control.exposureGateSuppressions, 6);
  assert.equal(result.control.exposurePixelSuppressions, 5);
  assert.equal(result.control.exposureAreaSuppressions, 4);
  assert.equal(result.control.exposureHeightSuppressions, 3);
});

test('legacy reports preserve absent policy metrics as missing rather than zero', () => {
  const result = analyseCombat({ match: { durationSeconds: 10 }, stats: {}, participants: [], damageTimeline: [] }, {
    performance: { visionFrames: 5, targetFrames: 4, visionStream: {} },
    input: { releasedAtEnd: true }, browser: {}, outcome: {}, fairness: {}, session: {}, source: {},
  });
  assert.equal(result.perception.rawTargetFrames, 4);
  assert.equal(result.perception.confirmedTargetFrames, null);
  assert.equal(result.control.warmupShotPulses, null);
});
