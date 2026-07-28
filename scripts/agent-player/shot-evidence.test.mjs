import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShotEvidence } from './shot-evidence.mjs';

function burst(epochMs, options = {}) {
  return {
    kind: 'operator-authorized-burst',
    atMs: epochMs,
    alignment: 0.005,
    useAds: false,
    postInputReacquired: true,
    twoFrameAligned: true,
    authorityFrameAgeAtTriggerMs: 20,
    fireEvidenceFile: 'fire-evidence/burst-001.jpg',
    triggerReceipts: [{ downEpochMs: epochMs, browserDownEpochMs: epochMs, downMonotonicMs: 100, upMonotonicMs: 172 }],
    target: { x: 160, y: 90, pixels: 40, bounds: { minX: 157, minY: 85, maxX: 163, maxY: 95, width: 7, height: 11 } },
    aimTrace: [
      { sourceSequence: 10, receivedAt: 50, x: 158, y: 90, bounds: { width: 7, height: 11 } },
      { sourceSequence: 12, receivedAt: 100, x: 160, y: 90, bounds: { width: 7, height: 11 } },
    ],
    ...options,
  };
}

function summary(shots, hits, timeline = []) {
  return { report: { stats: { shotsFired: shots, shotsHit: hits }, damageTimeline: timeline } };
}

test('reconciled carbine request joins one later official hit and derives rendered motion', () => {
  const trigger = Date.parse('2026-07-28T20:00:00.000Z');
  const evidence = buildShotEvidence({
    startedAt: '2026-07-28T20:00:00.000Z',
    actions: [burst(trigger)],
    matchSummaryDownload: summary(1, 1, [{
      timestamp: '2026-07-28T20:00:00.090Z', from: 'Jigglyclaw', to: 'RIVET', toKind: 'solo-bot', damage: 31, health: '100 -> 69 HP',
    }]),
  });
  assert.equal(evidence.reconciliation.shotCountReconciled, true);
  assert.equal(evidence.shotRequests[0].official.hitMatch, 'matched');
  assert.equal(evidence.shotRequests[0].official.hitLatencyMs, 90);
  assert.equal(evidence.shotRequests[0].targetMotion.vxPxPerSecond, 40);
});

test('negative hit latency is never matched', () => {
  const trigger = Date.parse('2026-07-28T20:00:00.100Z');
  const evidence = buildShotEvidence({
    actions: [burst(trigger)],
    matchSummaryDownload: summary(1, 1, [{
      timestamp: '2026-07-28T20:00:00.090Z', from: 'Jigglyclaw', to: 'RIVET', toKind: 'solo-bot', damage: 31, health: '100 -> 69 HP',
    }]),
  });
  assert.equal(evidence.reconciliation.matchedOfficialHits, 0);
  assert.equal(evidence.shotRequests[0].official.hitMatch, 'ambiguous-or-unmatched');
});

test('pulse versus official shot mismatch remains explicitly unreconciled', () => {
  const trigger = Date.parse('2026-07-28T20:00:00.000Z');
  const evidence = buildShotEvidence({
    actions: [burst(trigger)],
    matchSummaryDownload: summary(2, 1, []),
  });
  assert.equal(evidence.reconciliation.shotCountReconciled, false);
  assert.equal(evidence.shotRequests[0].official.hitMatch, 'unavailable');
});

test('driver download receipt parsed payload is accepted', () => {
  const trigger = Date.parse('2026-07-28T20:00:00.000Z');
  const evidence = buildShotEvidence({
    actions: [burst(trigger)],
    matchSummaryDownload: { parsed: { stats: { shotsFired: 1, shotsHit: 0 }, damageTimeline: [] } },
  });
  assert.equal(evidence.reconciliation.shotCountReconciled, true);
  assert.equal(evidence.shotRequests[0].official.hitMatch, 'miss-by-reconciled-elimination');
});
