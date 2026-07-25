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

test('combat baseline separates player outgoing and incoming events', () => {
  const summary = {
    build: 'Pass 63',
    match: { arena: 'Atomic Acres', result: 'DEFEAT', durationSeconds: 300, damageTimelineComplete: true },
    stats: { kills: 1, deaths: 2, killDeathRatio: 0.5, shotsFired: 10, shotsHit: 4, accuracyPercent: 40, damageDealt: 100, damageTaken: 150, headshots: 1, bestKillstreak: 1 },
    participants: [
      { name: 'Jigglyclaw', kind: 'player', finalHealth: 50 },
      { name: 'Bot', kind: 'solo-bot', kills: 2, deaths: 1, damageDealt: 150, damageTaken: 100, finalHealth: 0 },
    ],
    damageTimeline: [
      { at: '00:12.0', from: 'Jigglyclaw', to: 'Bot', damage: 30, distanceMeters: 8, hitZone: 'torso' },
      { at: '00:13.0', from: 'Bot', to: 'Jigglyclaw', damage: 20, distanceMeters: 9 },
      { at: '00:20.0', from: 'Jigglyclaw', to: 'Bot', damage: 70, distanceMeters: 12, hitZone: 'head' },
    ],
  };
  const report = {
    source: { pass: 'PASS 63' }, session: { pointerLock: true },
    performance: { observedRenderProfile: 'performance', visionFrames: 50, targetFrames: 10, targetFrameRatio: 0.2, visionStream: { sourceFps: 3 } },
    input: { aimMoves: 50, shotPulses: 10, releasedAtEnd: true, holdWatchdogExceeded: false },
    browser: { pageErrors: [] },
  };
  const result = analyseCombat(summary, report);
  assert.equal(result.result.shotsPerKill, 10);
  assert.equal(result.contacts.outgoingDamageEvents, 2);
  assert.equal(result.contacts.incomingDamageEvents, 1);
  assert.equal(result.contacts.outgoingContactWindows, 2);
  assert.equal(result.contacts.medianOutgoingDistanceMeters, 10);
  assert.deepEqual(result.contacts.hitZones, { torso: 1, head: 1 });
});
