import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_WINDOW_MS,
  createNetcodeEvidenceRecorder,
  evidenceFileName,
  recomputedDesync,
  sanitiseTraceKind,
  validateEvidenceBundle,
} from './netcode-evidence-recorder';
import { serialiseEvidenceBundle } from './netcode-evidence-export';
import {
  createNetcodeDiagnosticsModel,
  recordInboundSnapshot,
  recordPositionDisagreement,
  recordRttSample,
} from './netcode-diagnostics';

const META = { protocolVersion: 42, pass: 'pass95', generatedAtEpochMs: 1_757_000_000_000 } as const;

function populatedModel() {
  const model = createNetcodeDiagnosticsModel('host', 'host-peer-id', 'ABCD');
  for (const sample of [70, 90, 70, 90]) recordRttSample(model, 'guest-peer-id', sample);
  let now = 0;
  for (const seq of [0, 1, 2, 4, 5]) {
    recordInboundSnapshot(model, 'guest-peer-id', seq, now);
    now += 25;
  }
  for (const metres of [0.1, 0.3, 0.2, 1.4]) recordPositionDisagreement(model, 'guest-peer-id', metres);
  return model;
}

describe('recorder opt-in', () => {
  it('records nothing until it is explicitly started', () => {
    const recorder = createNetcodeEvidenceRecorder();
    expect(recorder.recording).toBe(false);
    recorder.recordTrace(0, 'in', 'state', 'guest-peer-id', 1, 120);
    recorder.recordDiff(0, 'guest-peer-id', 0.4, 1);
    recorder.recordRequest(0, 'guest-peer-id', 'reload', 'accepted', 30, 'ok');
    const bundle = recorder.build(1_000, createNetcodeDiagnosticsModel(), META);
    expect(bundle.traces).toHaveLength(0);
    expect(bundle.diffs).toHaveLength(0);
    expect(bundle.requests).toHaveLength(0);
  });

  it('stops recording on stop() and discards everything on reset()', () => {
    const recorder = createNetcodeEvidenceRecorder();
    recorder.start(0);
    recorder.recordTrace(10, 'in', 'state', 'g', 1, 100);
    recorder.stop();
    recorder.recordTrace(20, 'in', 'state', 'g', 2, 100);
    expect(recorder.build(50, createNetcodeDiagnosticsModel(), META).traces).toHaveLength(1);
    recorder.reset();
    expect(recorder.recording).toBe(false);
    expect(recorder.build(50, createNetcodeDiagnosticsModel(), META).traces).toHaveLength(0);
  });
});

describe('ring bounds and the three caps', () => {
  it('holds at most its entry cap and reports what it dropped', () => {
    const recorder = createNetcodeEvidenceRecorder(EVIDENCE_WINDOW_MS, 100, 50);
    recorder.start(0);
    for (let index = 0; index < 350; index += 1) recorder.recordTrace(index, 'in', 'state', 'g', index, 80);
    for (let index = 0; index < 120; index += 1) recorder.recordDiff(index, 'g', index / 100, index);
    const bundle = recorder.build(400, createNetcodeDiagnosticsModel(), META);
    expect(bundle.traces).toHaveLength(100);
    expect(bundle.diffs).toHaveLength(50);
    // A truncated bundle must never read as a complete one.
    expect(bundle.dropped.traces).toBe(250);
    expect(bundle.dropped.diffs).toBe(70);
    // Oldest shed first: the newest sequence survives.
    expect(bundle.traces[bundle.traces.length - 1]?.seq).toBe(349);
  });

  it('keeps only the last window and times everything from the start', () => {
    const recorder = createNetcodeEvidenceRecorder(1_000, 500, 500);
    recorder.start(10_000);
    recorder.recordTrace(10_100, 'in', 'state', 'g', 1, 80); // t = 100, falls out
    recorder.recordTrace(11_800, 'in', 'state', 'g', 2, 80); // t = 1800, kept
    const bundle = recorder.build(12_000, createNetcodeDiagnosticsModel(), META);
    expect(bundle.traces).toHaveLength(1);
    expect(bundle.traces[0]?.t).toBe(1_800);
    expect(bundle.traces[0]?.seq).toBe(2);
    // The window reported is the recorded span, capped at the window length.
    expect(bundle.windowMs).toBe(1_000);
    // Times are relative to the start, never a wall clock.
    expect(bundle.traces.every((trace) => trace.t < 2_000)).toBe(true);
  });

  it('enforces the byte cap on the actual serialisation, shedding oldest traces', () => {
    const recorder = createNetcodeEvidenceRecorder(EVIDENCE_WINDOW_MS, 200_000, 10);
    recorder.start(0);
    // ~90k trace entries: well past 4 MB of JSON.
    for (let index = 0; index < 90_000; index += 1) {
      recorder.recordTrace(index, index % 2 === 0 ? 'in' : 'out', 'state', 'guest-peer-id', index, 96);
    }
    const bundle = recorder.build(90_000, createNetcodeDiagnosticsModel(), META);
    expect(JSON.stringify(bundle).length).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
    expect(bundle.dropped.byBytes).toBeGreaterThan(0);
    // The most recent seconds are what a friend is describing; they survive.
    expect(bundle.traces[bundle.traces.length - 1]?.seq).toBe(89_999);
  });
});

describe('sanitisation — the bundle carries peer ids and the room code and nothing else', () => {
  it('reduces an unknown message type to "other" rather than copying it', () => {
    expect(sanitiseTraceKind('state')).toBe('state');
    expect(sanitiseTraceKind('chat')).toBe('chat');
    expect(sanitiseTraceKind('some-future-message-about-DaveGamer')).toBe('other');
    expect(sanitiseTraceKind(undefined)).toBe('other');
    expect(sanitiseTraceKind(17)).toBe('other');
  });

  it('never lets a chat payload or a player name reach the serialised bundle', () => {
    const recorder = createNetcodeEvidenceRecorder();
    recorder.start(0);
    // Exactly the shape of a real chat message: a type, a sender name and text.
    recorder.recordTrace(10, 'in', 'chat', 'guest-peer-id', 7, 'meet me at 21 Foo Street'.length);
    recorder.recordRequest(20, 'guest-peer-id', 'pickup', 'rejected', 40, 'not-eligible');
    // A host that tried to put free text into a shared bundle is refused.
    recorder.recordRequest(30, 'guest-peer-id', 'reload', 'rejected', 40, 'DaveGamer was here');
    const text = serialiseEvidenceBundle(recorder.build(100, populatedModel(), META));
    expect(text).not.toContain('Foo Street');
    expect(text).not.toContain('DaveGamer');
    expect(text).toContain('"kind": "chat"');
    expect(text).toContain('not-eligible');
    expect(text).toContain('"reason": "other"');
    // What IS present: peer ids and the room code, as the brief allows.
    expect(text).toContain('guest-peer-id');
    expect(text).toContain('ABCD');
  });

  it('caps an over-long peer id instead of letting it bloat the bundle', () => {
    const recorder = createNetcodeEvidenceRecorder();
    recorder.start(0);
    recorder.recordTrace(1, 'in', 'state', 'x'.repeat(5_000), 1, 10);
    const bundle = recorder.build(10, createNetcodeDiagnosticsModel(), META);
    expect(bundle.traces[0]?.peer.length).toBe(64);
  });

  it('coerces junk numeric input rather than writing NaN into the file', () => {
    const recorder = createNetcodeEvidenceRecorder();
    recorder.start(0);
    recorder.recordTrace(Number.NaN, 'in', 'state', 'g', Number.NaN, Number.NaN);
    recorder.recordDiff(Number.NaN, 'g', Number.NaN, Number.NaN);
    const text = serialiseEvidenceBundle(recorder.build(10, createNetcodeDiagnosticsModel(), META));
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('null');
  });
});

describe('bundle schema', () => {
  it('produces a bundle the shared validator accepts', () => {
    const recorder = createNetcodeEvidenceRecorder();
    recorder.start(0);
    recorder.recordTrace(10, 'in', 'state', 'guest-peer-id', 1, 120);
    recorder.recordDiff(20, 'guest-peer-id', 0.42, 1);
    recorder.recordRequest(30, 'guest-peer-id', 'reload', 'accepted', 55, 'ok');
    const bundle = recorder.build(1_000, populatedModel(), META);

    expect(bundle.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
    expect(bundle.roomCode).toBe('ABCD');
    expect(bundle.localPeerId).toBe('host-peer-id');
    expect(bundle.localRole).toBe('host');
    expect(bundle.protocolVersion).toBe(42);
    expect(bundle.pass).toBe('pass95');
    expect(bundle.peers).toHaveLength(1);

    const peer = bundle.peers[0]!;
    expect(peer.peer).toBe('guest-peer-id');
    expect(peer.rttMs).toBeGreaterThan(0);
    expect(peer.lossFraction).toBeCloseTo(1 / 6, 3);
    expect(peer.disagreementMaxM).toBeCloseTo(1.4, 6);
    expect(peer.sampleCount).toBe(4);
    expect(peer.desync).toBeGreaterThan(0);

    const validated = validateEvidenceBundle(JSON.parse(JSON.stringify(bundle)));
    expect(validated.ok).toBe(true);
  });

  it('rejects a bundle that has been edited into a shape it cannot read', () => {
    expect(validateEvidenceBundle(null).ok).toBe(false);
    expect(validateEvidenceBundle('a string').ok).toBe(false);
    expect(validateEvidenceBundle({ schemaVersion: 99 }).ok).toBe(false);
    const base = createNetcodeEvidenceRecorder().build(0, populatedModel(), META) as unknown as Record<string, unknown>;
    const good = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    expect(validateEvidenceBundle(good).ok).toBe(true);
    expect(validateEvidenceBundle({ ...good, traces: 'nope' }).ok).toBe(false);
    expect(validateEvidenceBundle({ ...good, roomCode: 5 }).ok).toBe(false);
    const peers = (good.peers as Record<string, unknown>[]).map((peer) => ({ ...peer, rttMs: 'fast' }));
    expect(validateEvidenceBundle({ ...good, peers }).ok).toBe(false);
    // The specific reason is reported, so a friend's file that will not load
    // says why rather than "invalid".
    const failure = validateEvidenceBundle({ ...good, peers });
    expect(failure.ok === false && failure.reason.includes('rttMs')).toBe(true);
  });

  it('recomputes the desync meter rather than trusting what the sender wrote', () => {
    const forged = {
      peer: 'liar', role: 'guest', rttMs: 400, jitterMs: 300, lossFraction: 0.5,
      inboundRateHz: 40, outboundRateHz: 40, disagreementMeanM: 5,
      disagreementP95M: 9, disagreementMaxM: 12, desync: 0, desyncSessionP95: 0, sampleCount: 10,
    } as const;
    expect(forged.desync).toBe(0);
    expect(recomputedDesync(forged)).toBe(1);
  });

  it('writes a desyncSessionP95 the analyser can recompute exactly', () => {
    // The bundle carries TWO desync numbers on purpose. `desync` is the live
    // meter at the instant the export key was pressed and depends on ack age,
    // so it is not reproducible from the bundle. `desyncSessionP95` is the same
    // formula over the p95 disagreement with no ack term, which
    // scripts/qa/mp-evidence-analyse.mjs recomputes and compares against. If
    // these two were ever conflated, the analyser would print a tamper note on
    // every healthy bundle and the note would stop meaning anything.
    const model = createNetcodeDiagnosticsModel('guest', 'me', 'ROOM');
    recordRttSample(model, 'host-1', 40);
    recordInboundSnapshot(model, 'host-1', 1, 0);
    recordInboundSnapshot(model, 'host-1', 2, 25);
    for (const metres of [0.1, 0.2, 1.9, 0.3]) recordPositionDisagreement(model, 'host-1', metres);
    const bundle = createNetcodeEvidenceRecorder().build(100, model, META);
    const row = bundle.peers[0]!;
    expect(row.desyncSessionP95).toBeCloseTo(recomputedDesync(row), 3);
  });

  it('names the file so a host and three guests never collide', () => {
    const recorder = createNetcodeEvidenceRecorder();
    const hostBundle = recorder.build(0, createNetcodeDiagnosticsModel('host', 'peer-aaa', 'ABCD'), META);
    const guestBundle = recorder.build(0, createNetcodeDiagnosticsModel('guest', 'peer-bbb', 'ABCD'), META);
    expect(evidenceFileName(hostBundle)).not.toBe(evidenceFileName(guestBundle));
    expect(evidenceFileName(hostBundle)).toMatch(/^aa-netcode-evidence-ABCD-host-peer-aaa-\d+\.json$/u);
    // A hostile room code cannot escape into a path.
    const nasty = recorder.build(0, createNetcodeDiagnosticsModel('guest', '../../etc/passwd', 'a/b\\c'), META);
    expect(evidenceFileName(nasty)).not.toContain('/');
    expect(evidenceFileName(nasty)).not.toContain('\\');
  });
});
