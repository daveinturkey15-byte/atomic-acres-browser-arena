/**
 * Contract for scripts/qa/mp-evidence-analyse.mjs.
 *
 * PASS 95. The analyser is the piece that turns a friend's WAN session into
 * gate evidence, so the failure that matters most is not "it crashed" — it is
 * "it read a broken session and printed ok". Every test below is aimed at that
 * shape: a bundle that should be rejected, a threshold that should fire, and an
 * asymmetry that a single-machine test can never produce.
 *
 * Run: node --test scripts/qa/mp-evidence-analyse.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  THRESHOLDS,
  analyse,
  asymmetryRows,
  divergenceRows,
  formatReport,
  loadBundles,
  recomputeDesync,
  summariseTraces,
  validateBundle,
} from './mp-evidence-analyse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../docs/evidence/pass95/mp-diagnostics-overlay/fixture');

function peerRow(overrides = {}) {
  return {
    peer: 'guest-bbb',
    role: 'guest',
    rttMs: 40,
    jitterMs: 4,
    lossFraction: 0,
    inboundRateHz: 40,
    outboundRateHz: 40,
    disagreementMeanM: 0.05,
    disagreementP95M: 0.1,
    disagreementMaxM: 0.2,
    desync: 0.1,
    desyncSessionP95: 0.16,
    sampleCount: 100,
    ...overrides,
  };
}

function bundle(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAtEpochMs: 1_757_020_000_000,
    windowMs: 120_000,
    roomCode: 'ROOM1',
    localPeerId: 'host-aaa',
    localRole: 'host',
    protocolVersion: 18,
    pass: 'pass95',
    traces: [],
    diffs: [],
    requests: [],
    peers: [peerRow()],
    dropped: { traces: 0, diffs: 0, requests: 0, byBytes: 0 },
    ...overrides,
  };
}

test('validateBundle refuses everything it cannot safely read', () => {
  assert.equal(validateBundle(null).ok, false);
  assert.equal(validateBundle('a string').ok, false);
  // An array is an object to typeof; it is not a bundle.
  assert.equal(validateBundle([]).ok, false);
  assert.equal(validateBundle(bundle({ schemaVersion: 2 })).ok, false);
  assert.equal(validateBundle(bundle({ localRole: 'admin' })).ok, false);
  assert.equal(validateBundle(bundle({ peers: 'not-an-array' })).ok, false);
  // A NaN slipped into a metric must not silently become a healthy row.
  assert.equal(validateBundle(bundle({ peers: [peerRow({ rttMs: Number.NaN })] })).ok, false);
  assert.equal(validateBundle(bundle({ peers: [peerRow({ disagreementP95M: 'lots' })] })).ok, false);
  assert.equal(validateBundle(bundle()).ok, true);
});

test('recomputeDesync is the max of the pressures, not their average', () => {
  // One broken axis with three healthy ones must NOT be averaged away.
  const broken = recomputeDesync(peerRow({ disagreementP95M: 2.0, jitterMs: 0, lossFraction: 0 }));
  assert.equal(broken, 1);
  // Position saturates at 2 m and never exceeds 1.
  assert.equal(recomputeDesync(peerRow({ disagreementP95M: 40 })), 1);
  // A zero snapshot rate falls back to the 20 Hz interval rather than dividing
  // by zero and returning NaN, which would render as a blank healthy cell.
  const zeroRate = recomputeDesync(peerRow({ inboundRateHz: 0, jitterMs: 25 }));
  assert.ok(Number.isFinite(zeroRate) && zeroRate > 0);
});

test('divergenceRows names every threshold a row broke', () => {
  const healthy = divergenceRows([{ source: 'a', bundle: bundle() }]);
  assert.equal(healthy.length, 1);
  assert.deepEqual(healthy[0].findings, []);

  const sick = divergenceRows([{
    source: 'b',
    bundle: bundle({
      peers: [peerRow({
        disagreementP95M: THRESHOLDS.disagreementP95M + 1.0,
        jitterMs: THRESHOLDS.jitterMs + 10,
        lossFraction: THRESHOLDS.lossFraction + 0.05,
        inboundRateHz: THRESHOLDS.minInboundRateHz - 5,
      })],
    }),
  }]);
  assert.deepEqual(sick[0].findings.sort(), ['desync', 'jitter', 'loss', 'position', 'rate']);
});

test('every threshold comparison is exclusive at the boundary', () => {
  // Found while writing the test above: a row sitting EXACTLY on a threshold is
  // not a finding. That is the right call — the thresholds are the values the
  // runtime already adapts at, so landing on one is the adaptation working, not
  // failing — but it is worth pinning, because an off-by-one here silently
  // turns a gate into either a nag or a rubber stamp.
  const exactly = divergenceRows([{
    source: 'boundary',
    bundle: bundle({
      peers: [peerRow({
        disagreementP95M: THRESHOLDS.disagreementP95M,
        jitterMs: THRESHOLDS.jitterMs,
        lossFraction: THRESHOLDS.lossFraction,
        inboundRateHz: THRESHOLDS.minInboundRateHz,
      })],
    }),
  }]);
  assert.deepEqual(exactly[0].findings, []);

  // One step past each boundary in the failing direction does fire.
  const past = divergenceRows([{
    source: 'past',
    bundle: bundle({
      peers: [peerRow({
        disagreementP95M: THRESHOLDS.disagreementP95M + 1e-6,
        jitterMs: THRESHOLDS.jitterMs + 1e-6,
        lossFraction: THRESHOLDS.lossFraction + 1e-6,
        inboundRateHz: THRESHOLDS.minInboundRateHz - 1e-6,
      })],
    }),
  }]);
  assert.deepEqual(past[0].findings.sort(), ['jitter', 'loss', 'position', 'rate']);
});

test('a peer reporting zero inbound rate is not flagged as a slow rate', () => {
  // Zero means "we never measured", which is a lobby-only bundle, not a fault.
  // Flagging it would make every pre-match bundle red and teach the owner to
  // ignore the column.
  const rows = divergenceRows([{ source: 'c', bundle: bundle({ peers: [peerRow({ inboundRateHz: 0 })] }) }]);
  assert.equal(rows[0].findings.includes('rate'), false);
});

test('asymmetryRows only pairs a host and a guest from the SAME room', () => {
  const host = { source: 'h', bundle: bundle({ localRole: 'host', localPeerId: 'host-aaa', peers: [peerRow({ peer: 'guest-bbb', disagreementP95M: 0.2 })] }) };
  const guest = { source: 'g', bundle: bundle({ localRole: 'guest', localPeerId: 'guest-bbb', peers: [peerRow({ peer: 'host-aaa', role: 'host', disagreementP95M: 1.4 })] }) };
  const otherRoom = { source: 'x', bundle: bundle({ roomCode: 'ROOM2', localRole: 'guest', localPeerId: 'guest-zzz', peers: [peerRow({ peer: 'host-aaa', role: 'host' })] }) };

  const rows = asymmetryRows([host, guest, otherRoom]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].host, 'host-aaa');
  assert.equal(rows[0].guest, 'guest-bbb');
  // The finding: the guest sees 1.2 m more disagreement than the host does.
  assert.ok(Math.abs(rows[0].divergenceM - 1.2) < 1e-9);

  // Two guests and no host cannot be cross-checked; producing a row anyway
  // would be an invented comparison against no authority.
  assert.equal(asymmetryRows([guest, otherRoom]).length, 0);
});

test('summariseTraces counts direction and kind without trusting the entries', () => {
  const summary = summariseTraces(bundle({
    traces: [
      { t: 0, dir: 'in', kind: 'state', peer: 'p', seq: 1, bytes: 100 },
      { t: 1, dir: 'out', kind: 'state', peer: 'p', seq: 2, bytes: 120 },
      { t: 2, dir: 'in', kind: 'shot', peer: 'p', seq: -1, bytes: 80 },
      null,
      { t: 3, dir: 'in', kind: 42, peer: 'p', seq: -1, bytes: 'lots' },
    ],
  }));
  assert.equal(summary.inbound, 3);
  assert.equal(summary.outbound, 1);
  assert.equal(summary.byKind.get('state'), 2);
  // A non-string kind lands in 'other' rather than becoming a Map key of 42.
  assert.equal(summary.byKind.get('other'), 1);
  // A non-numeric byte count contributes nothing rather than making the total NaN.
  assert.equal(summary.bytes, 300);
});

test('the shipped fixture bundles load, and the struggling guest is the finding', () => {
  const { loaded, errors } = loadBundles([FIXTURE]);
  assert.deepEqual(errors, []);
  assert.equal(loaded.length, 3);

  const result = analyse([FIXTURE]);
  assert.equal(result.rows.length, 4);
  // guest-ccc is over threshold from BOTH sides; guest-bbb from neither.
  const flaggedPeers = new Set(result.flagged.map((row) => `${row.observer}->${row.peer}`));
  assert.ok(flaggedPeers.has('guest-ccc->host-aaa'));
  assert.ok(flaggedPeers.has('host-aaa->guest-ccc'));
  assert.equal(flaggedPeers.has('guest-bbb->host-aaa'), false);
  assert.equal(flaggedPeers.has('host-aaa->guest-bbb'), false);

  // The asymmetry is the whole reason for collecting both sides: the host
  // measures 0.74 m for guest-ccc and guest-ccc measures 2.61 m for itself.
  const asym = result.asymmetries.find((row) => row.guest === 'guest-ccc');
  assert.ok(asym);
  assert.ok(asym.divergenceM > 1.5, `expected >1.5 m divergence, got ${asym.divergenceM}`);
});

test('a fixture bundle whose desyncSessionP95 was edited is called out', () => {
  const tampered = bundle({ peers: [peerRow({ desyncSessionP95: 0.01, disagreementP95M: 1.8 })] });
  const rows = divergenceRows([{ source: 't', bundle: tampered }]);
  const report = formatReport([{ source: 't', bundle: tampered }], rows, []);
  assert.match(report, /NOTE: bundle claimed session desync/u);
  // And the recomputed value, not the claimed one, decides the finding.
  assert.ok(rows[0].findings.includes('position'));
});

test('an unreadable file is an error, not a silently missing row', () => {
  const { loaded, errors } = loadBundles([join(FIXTURE, 'no-such-bundle.json')]);
  assert.equal(loaded.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].reason, /cannot read|not valid JSON/u);
});

test('formatReport marks a truncated bundle so it cannot read as complete', () => {
  const truncated = bundle({ dropped: { traces: 1_200, diffs: 0, requests: 0, byBytes: 400 } });
  const report = formatReport([{ source: 'z', bundle: truncated }], [], []);
  assert.match(report, /TRUNCATED: dropped traces=1200/u);
});
