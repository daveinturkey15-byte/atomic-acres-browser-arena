import { describe, expect, it } from 'vitest';
import {
  DESYNC_ACK_SATURATION_MS,
  DESYNC_POSITION_SATURATION_M,
  JITTER_GAIN,
  MAX_DIAGNOSTIC_PEERS,
  NumericRing,
  REQUEST_OUTCOME_CAPACITY,
  RequestOutcomeRing,
  createNetcodeDiagnosticsModel,
  desyncMeter,
  forgetPeer,
  lastAckAgeMs,
  lossFraction,
  measuredRateHz,
  nextJitterMs,
  nextRttMs,
  peerFor,
  recordAck,
  recordInboundSnapshot,
  recordOutboundSnapshot,
  recordPositionDisagreement,
  recordRequestOutcome,
  recordRttSample,
  renderDiagnosticsLines,
  summarisePeer,
  summariseRequests,
} from './netcode-diagnostics';

describe('NumericRing bounds', () => {
  it('never exceeds its capacity and overwrites the oldest sample', () => {
    const ring = new NumericRing(4);
    for (let value = 1; value <= 10; value += 1) ring.push(value);
    expect(ring.capacity).toBe(4);
    expect(ring.length).toBe(4);
    // 7,8,9,10 — oldest first.
    expect([ring.at(0), ring.at(1), ring.at(2), ring.at(3)]).toEqual([7, 8, 9, 10]);
    expect(ring.last()).toBe(10);
  });

  it('holds one backing Float64Array for the life of the ring', () => {
    const ring = new NumericRing(8);
    const before = (ring as unknown as { values: Float64Array }).values;
    for (let index = 0; index < 100_000; index += 1) ring.push(index);
    const after = (ring as unknown as { values: Float64Array }).values;
    // The allocation contract in the module header, asserted rather than
    // described: a ring that reallocated would fail here.
    expect(after).toBe(before);
    expect(after.length).toBe(8);
    expect(ring.length).toBe(8);
  });

  it('drops non-finite samples instead of poisoning every later mean', () => {
    const ring = new NumericRing(4);
    ring.push(10);
    expect(ring.push(Number.NaN)).toBe(false);
    expect(ring.push(Number.POSITIVE_INFINITY)).toBe(false);
    ring.push(20);
    expect(ring.length).toBe(2);
    expect(ring.rejectedCount).toBe(2);
    expect(ring.mean()).toBe(15);
  });

  it('reports NaN rather than 0 for an empty read', () => {
    const ring = new NumericRing(4);
    expect(Number.isNaN(ring.mean())).toBe(true);
    expect(Number.isNaN(ring.last())).toBe(true);
    expect(Number.isNaN(ring.max())).toBe(true);
    expect(Number.isNaN(ring.at(0))).toBe(true);
    expect(Number.isNaN(ring.at(-1))).toBe(true);
  });

  it('refuses a non-positive capacity rather than silently making a 0-length ring', () => {
    expect(() => new NumericRing(0)).toThrow(RangeError);
    expect(() => new NumericRing(-3)).toThrow(RangeError);
    expect(() => new NumericRing(2.5)).toThrow(RangeError);
  });

  it('computes a nearest-rank percentile over the retained window only', () => {
    const ring = new NumericRing(5);
    for (const value of [100, 1, 2, 3, 4, 5]) ring.push(value);
    // 100 has been overwritten; the window is 1..5.
    expect(ring.max()).toBe(5);
    expect(ring.percentile(1)).toBe(5);
    expect(ring.percentile(0.5)).toBe(3);
    expect(ring.percentile(0)).toBe(1);
  });
});

describe('RequestOutcomeRing bounds', () => {
  it('keeps exactly the last five outcomes, oldest first', () => {
    const ring = new RequestOutcomeRing();
    expect(ring.capacity).toBe(REQUEST_OUTCOME_CAPACITY);
    for (let index = 0; index < 9; index += 1) {
      ring.record(index % 2 === 0 ? 'reload' : 'pickup', 'accepted', index, index);
    }
    expect(ring.length).toBe(5);
    expect(ring.at(0)?.atMs).toBe(4);
    expect(ring.at(4)?.atMs).toBe(8);
    expect(ring.at(5)).toBeNull();
  });

  it('renders a compact glyph run the owner can read out loud', () => {
    const ring = new RequestOutcomeRing();
    expect(summariseRequests(ring)).toBe('--');
    ring.record('reload', 'accepted', 1, 10);
    ring.record('pickup', 'rejected', 2, 10, 'not-eligible');
    ring.record('reload', 'timeout', 3, 900);
    expect(summariseRequests(ring)).toBe('R+ P- R?');
  });
});

describe('metric arithmetic', () => {
  it('seeds the rtt filter with the first sample and then eases', () => {
    expect(nextRttMs(0, 80)).toBe(80);
    expect(nextRttMs(80, 80)).toBe(80);
    expect(nextRttMs(80, 180)).toBeCloseTo(105, 6);
    // A negative or non-finite sample must not move the filter.
    expect(nextRttMs(80, -1)).toBe(80);
    expect(nextRttMs(80, Number.NaN)).toBe(80);
  });

  it('follows RFC 3550 for jitter and stays non-negative', () => {
    expect(nextJitterMs(0, 50, 50)).toBe(0);
    // |70-50| = 20; 0 + (20 - 0)/16 = 1.25
    expect(nextJitterMs(0, 50, 70)).toBeCloseTo(20 * JITTER_GAIN, 9);
    // A steady 20 ms swing converges on 20 ms of jitter.
    let jitter = 0;
    let previous = 50;
    for (let index = 0; index < 400; index += 1) {
      const sample = index % 2 === 0 ? 70 : 50;
      jitter = nextJitterMs(jitter, previous, sample);
      previous = sample;
    }
    expect(jitter).toBeCloseTo(20, 3);
    expect(nextJitterMs(5, 50, Number.NaN)).toBe(5);
  });

  it('reads loss from the observed sequence window and never guesses', () => {
    // Ten sequences, eight arrived.
    expect(lossFraction(0, 9, 8)).toBeCloseTo(0.2, 9);
    expect(lossFraction(0, 9, 10)).toBe(0);
    // Before a sequence has been seen at all, "no data" is 0% loss, not 100%.
    expect(lossFraction(-1, -1, 0)).toBe(0);
    // A single snapshot is a full window of one.
    expect(lossFraction(5, 5, 1)).toBe(0);
    // More received than expected (a duplicate) clamps rather than going negative.
    expect(lossFraction(0, 4, 99)).toBe(0);
    expect(lossFraction(0, 9, 0)).toBe(1);
  });

  it('measures the delivered snapshot rate from arrival times, not the negotiated rate', () => {
    const ring = new NumericRing(16);
    expect(measuredRateHz(ring)).toBe(0);
    ring.push(1_000);
    expect(measuredRateHz(ring)).toBe(0);
    // Five arrivals 25 ms apart: 4 intervals over 100 ms = 40 Hz.
    for (const t of [1_025, 1_050, 1_075, 1_100]) ring.push(t);
    expect(measuredRateHz(ring)).toBeCloseTo(40, 9);
    // Same timestamps twice in a row cannot produce Infinity.
    const degenerate = new NumericRing(4);
    degenerate.push(5);
    degenerate.push(5);
    expect(measuredRateHz(degenerate)).toBe(0);
  });

  it('reports the desync meter as the worst axis, not the average', () => {
    const healthy = { disagreementM: 0.05, lossFraction: 0, jitterMs: 2, snapshotRateHz: 40, lastAckAgeMs: 30 };
    expect(desyncMeter(healthy)).toBeLessThan(0.25);
    // One broken axis saturates even when the other three are perfect. An
    // average would hide it: (1 + 0 + 0 + 0)/4 = 0.25 reads as healthy.
    expect(desyncMeter({ ...healthy, disagreementM: DESYNC_POSITION_SATURATION_M })).toBe(1);
    expect(desyncMeter({ ...healthy, lossFraction: 1 })).toBe(1);
    expect(desyncMeter({ ...healthy, lastAckAgeMs: DESYNC_ACK_SATURATION_MS })).toBe(1);
    // Jitter is measured against half a snapshot interval, so the same jitter
    // is worse at a higher rate — which is the behaviour interpolation sees.
    const at20 = desyncMeter({ ...healthy, jitterMs: 12, snapshotRateHz: 20 });
    const at40 = desyncMeter({ ...healthy, jitterMs: 12, snapshotRateHz: 40 });
    expect(at40).toBeGreaterThan(at20);
    expect(desyncMeter({ ...healthy, disagreementM: 500 })).toBe(1);
    // Non-finite inputs contribute nothing rather than producing NaN.
    expect(desyncMeter({ ...healthy, jitterMs: Number.NaN, disagreementM: Number.NaN })).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(desyncMeter({ ...healthy, jitterMs: Number.NaN }))).toBe(false);
  });
});

describe('model recording', () => {
  it('allocates one record per peer join, not per sample', () => {
    const model = createNetcodeDiagnosticsModel('host', 'host-1', 'ABCD');
    const first = peerFor(model, 'guest-1');
    for (let index = 0; index < 500; index += 1) recordInboundSnapshot(model, 'guest-1', index, index * 25);
    expect(peerFor(model, 'guest-1')).toBe(first);
    expect(model.peers.size).toBe(1);
  });

  it('tracks rtt, jitter, loss, rates, ack age and disagreement for one peer', () => {
    const model = createNetcodeDiagnosticsModel('host', 'host-1', 'ABCD');
    for (const sample of [80, 120, 80, 120]) recordRttSample(model, 'guest-1', sample);
    // Sequences 0..9 with 3 and 7 lost.
    let now = 1_000;
    for (const seq of [0, 1, 2, 4, 5, 6, 8, 9]) {
      recordInboundSnapshot(model, 'guest-1', seq, now);
      now += 25;
    }
    for (let index = 0; index < 8; index += 1) recordOutboundSnapshot(model, 'guest-1', 1_000 + index * 50);
    recordAck(model, 'guest-1', 1_150);
    recordPositionDisagreement(model, 'guest-1', 0.4);
    recordPositionDisagreement(model, 'guest-1', 1.1);

    const peer = peerFor(model, 'guest-1');
    const summary = summarisePeer(peer!, 1_400);
    expect(summary.rttMs).toBeGreaterThan(80);
    expect(summary.rttMs).toBeLessThan(120);
    expect(summary.jitterMs).toBeGreaterThan(0);
    expect(summary.lossFraction).toBeCloseTo(0.2, 9);
    expect(summary.inboundRateHz).toBeCloseTo(40, 6);
    expect(summary.outboundRateHz).toBeCloseTo(20, 6);
    expect(summary.lastAckAgeMs).toBe(250);
    expect(summary.disagreementM).toBeCloseTo(1.1, 9);
    expect(summary.disagreementMaxM).toBeCloseTo(1.1, 9);
    expect(summary.desync).toBeGreaterThan(0);
  });

  it('reports an unacked peer as NaN age rather than pretending it just acked', () => {
    const model = createNetcodeDiagnosticsModel('guest', 'g', 'ROOM');
    const peer = peerFor(model, 'host-1', 'host');
    expect(Number.isNaN(lastAckAgeMs(peer!, 5_000))).toBe(true);
    recordAck(model, 'host-1', 4_000);
    expect(lastAckAgeMs(peer!, 5_000)).toBe(1_000);
  });

  it('bumps the revision on every mutation so the overlay can skip cheaply', () => {
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    const start = model.revision;
    recordRttSample(model, 'g1', 40);
    recordInboundSnapshot(model, 'g1', 1, 10);
    recordRequestOutcome(model, 'g1', 'reload', 'rejected', 20, 45, 'no-ammo');
    expect(model.revision).toBeGreaterThan(start);
    const before = model.revision;
    // A refused (non-finite) rtt sample still counts as a peer touch at most
    // once; what matters is that the revision never goes backwards.
    recordRttSample(model, 'g1', Number.NaN);
    expect(model.revision).toBeGreaterThanOrEqual(before);
  });

  it('forgets a peer that left', () => {
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    peerFor(model, 'g1');
    expect(forgetPeer(model, 'g1')).toBe(true);
    expect(forgetPeer(model, 'g1')).toBe(false);
    expect(model.peers.size).toBe(0);
  });

  it('bounds peer rows even when callers present unbounded ids', () => {
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    for (let index = 0; index < MAX_DIAGNOSTIC_PEERS + 4; index += 1) {
      recordInboundSnapshot(model, `forged-${index}`, index, index);
    }
    expect(model.peers.size).toBe(MAX_DIAGNOSTIC_PEERS);
    expect(peerFor(model, 'forged-overflow')).toBeNull();
  });
});

describe('line rendering', () => {
  it('writes into the caller-owned array and truncates it to the line count', () => {
    const model = createNetcodeDiagnosticsModel('host', 'host-1', 'ABCD');
    const out: string[] = ['stale', 'stale', 'stale', 'stale', 'stale', 'stale'];
    const written = renderDiagnosticsLines(model, 1_000, out);
    expect(written).toBe(out.length);
    expect(out.some((line) => line === 'stale')).toBe(false);
    expect(out[0]).toContain('role=host');
    expect(out[0]).toContain('room=ABCD');
    expect(out[out.length - 1]).toContain('no peers');
  });

  it('emits one line per peer with every requested field present', () => {
    const model = createNetcodeDiagnosticsModel('guest', 'guest-1', 'WXYZ');
    recordRttSample(model, 'host-1', 60, 'host');
    recordInboundSnapshot(model, 'host-1', 0, 0, 'host');
    recordInboundSnapshot(model, 'host-1', 1, 25, 'host');
    recordAck(model, 'host-1', 25, 'host');
    recordPositionDisagreement(model, 'host-1', 0.12, 'host');
    recordRequestOutcome(model, 'host-1', 'pickup', 'accepted', 30, 40);
    const out: string[] = [];
    renderDiagnosticsLines(model, 40, out);
    expect(out).toHaveLength(3);
    const header = out[1] as string;
    for (const column of ['peer', 'role', 'rtt', 'jit', 'loss', 'in', 'out', 'ack', 'dis', 'desync', 'req']) {
      expect(header).toContain(column);
    }
    const row = out[2] as string;
    expect(row.startsWith('host-1')).toBe(true);
    expect(row).toContain('P+');
    expect(row).not.toContain('NaN');
  });

  it('prints -- rather than NaN for a peer with no samples yet', () => {
    const model = createNetcodeDiagnosticsModel('host', 'h', 'ROOM');
    peerFor(model, 'fresh-peer');
    const out: string[] = [];
    renderDiagnosticsLines(model, 100, out);
    expect(out[2]).toContain('--');
    expect(out.join('\n')).not.toContain('NaN');
  });
});
