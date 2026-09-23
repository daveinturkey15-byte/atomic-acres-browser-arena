/**
 * PASS 95 — the WAN evidence recorder (owner priority 2026-09-02: "WAN sessions
 * with friends as evidence").
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every netcode gate in this repository runs against two Chromium contexts on
 * one machine over loopback. Loopback has no jitter worth the name, no
 * asymmetric uplink, no NAT, and no 4G friend on a train. The owner's actual
 * quality bar is "does it feel right when I play with friends", and there is
 * currently no way to turn one of those sessions into something a gate can
 * read. This recorder is that conversion: a friend plays, presses one key, and
 * hands back a file that `scripts/qa/mp-evidence-analyse.mjs` turns into a
 * divergence table.
 *
 * WHAT IT RECORDS, AND WHAT IT REFUSES TO
 * ---------------------------------------
 * Recording is OPT-IN (`start()` is never called on its own) and bounded three
 * ways at once — a 120 s time window, an entry cap, and a serialised byte cap —
 * because a friend's browser tab is not somewhere to grow an unbounded array.
 *
 * The bundle carries peer ids and the room code and NOTHING ELSE identifying.
 * Message payloads are never stored: a trace entry is {time, direction, kind,
 * peer, seq, bytes}, so a chat message contributes its SIZE and its TYPE and
 * not one character of its text. `sanitiseTraceKind` is an allowlist, not a
 * denylist, which is the only shape that stays safe when a new message type is
 * added later — an unknown kind records as 'other' rather than leaking a new
 * field. `src/netcode-evidence-recorder.test.ts` pins that by feeding it a
 * message carrying a player name and asserting the name is absent from the
 * serialised bundle.
 */

import { desyncMeter, lossFraction, measuredRateHz, summarisePeer, type NetcodeDiagnosticsModel } from './netcode-diagnostics';

export const EVIDENCE_SCHEMA_VERSION = 1;
export const EVIDENCE_WINDOW_MS = 120_000;
export const EVIDENCE_MAX_TRACES = 20_000;
export const EVIDENCE_MAX_DIFFS = 8_000;
/**
 * 4 MB serialised. Sized against the worst realistic case: 40 Hz snapshots from
 * three peers for 120 s is ~14,400 trace entries at ~60 bytes of JSON each,
 * ~0.9 MB. The cap is therefore roughly 4x headroom and still small enough to
 * paste into a chat window, which is how a friend will actually send it back.
 */
export const EVIDENCE_MAX_BYTES = 4_000_000;

export const EVIDENCE_TRACE_KINDS = Object.freeze([
  'state', 'input', 'shot', 'melee', 'explosion', 'damage', 'reload', 'pickup',
  'join', 'leave', 'ack', 'ping', 'chat', 'lobby', 'other',
] as const);
export type EvidenceTraceKind = typeof EVIDENCE_TRACE_KINDS[number];

const TRACE_KIND_LOOKUP = new Set<string>(EVIDENCE_TRACE_KINDS);

/**
 * Allowlist. An unrecognised message type becomes 'other' — it must never be
 * copied through verbatim, because a future message type could be named after
 * whatever it carries.
 */
export function sanitiseTraceKind(kind: unknown): EvidenceTraceKind {
  return typeof kind === 'string' && TRACE_KIND_LOOKUP.has(kind) ? kind as EvidenceTraceKind : 'other';
}

export type EvidenceTrace = Readonly<{
  /** Milliseconds since the recorder started. Never a wall clock. */
  t: number;
  dir: 'in' | 'out';
  kind: EvidenceTraceKind;
  peer: string;
  seq: number;
  bytes: number;
}>;

export type EvidenceDiff = Readonly<{
  t: number;
  peer: string;
  /** Metres between our rendered pose for the peer and host authority. */
  disagreementM: number;
  /** Snapshot sequence the disagreement was measured against; -1 if unknown. */
  seq: number;
}>;

export type EvidenceRequest = Readonly<{
  t: number;
  peer: string;
  kind: 'reload' | 'pickup';
  outcome: 'accepted' | 'rejected' | 'timeout';
  latencyMs: number;
  reason: string;
}>;

export type EvidencePeerSummary = Readonly<{
  peer: string;
  role: string;
  rttMs: number;
  jitterMs: number;
  lossFraction: number;
  inboundRateHz: number;
  outboundRateHz: number;
  disagreementMeanM: number;
  disagreementP95M: number;
  disagreementMaxM: number;
  /** The LIVE meter at export time: last-sample disagreement plus ack age. */
  desync: number;
  /**
   * The SESSION meter: the same formula run over the p95 disagreement and with
   * no ack term, so it does not depend on the instant the export key was
   * pressed. `scripts/qa/mp-evidence-analyse.mjs` recomputes exactly this and
   * compares, which is only a meaningful tamper/version check because the two
   * are the same statistic. Comparing it against `desync` would flag every
   * healthy bundle, since `desync` is a different quantity by design.
   */
  desyncSessionP95: number;
  sampleCount: number;
}>;

export type EvidenceBundle = Readonly<{
  schemaVersion: number;
  generatedAtEpochMs: number;
  /** Recorded span in ms; may be shorter than EVIDENCE_WINDOW_MS. */
  windowMs: number;
  roomCode: string;
  localPeerId: string;
  localRole: string;
  protocolVersion: number;
  pass: string;
  traces: readonly EvidenceTrace[];
  diffs: readonly EvidenceDiff[];
  requests: readonly EvidenceRequest[];
  peers: readonly EvidencePeerSummary[];
  /** Entries the caps discarded, so a truncated bundle cannot read as complete. */
  dropped: Readonly<{ traces: number; diffs: number; requests: number; byBytes: number }>;
}>;

type MutableTrace = { t: number; dir: 'in' | 'out'; kind: EvidenceTraceKind; peer: string; seq: number; bytes: number };
type MutableDiff = { t: number; peer: string; disagreementM: number; seq: number };

/**
 * A ring over preallocated records. Same reasoning as NumericRing: this is
 * written from the message handler, so `record()` mutates a slot rather than
 * constructing one. The window trim is by TIME on read, not by shifting on
 * write — shifting a 20,000-entry array on every message is exactly the kind of
 * per-message cost a diagnostics tool must not add.
 */
class RecordRing<T> {
  private readonly slots: T[];
  private writeIndex = 0;
  private count = 0;
  private droppedCount = 0;

  constructor(capacity: number, make: () => T) {
    this.slots = [];
    for (let index = 0; index < capacity; index += 1) this.slots.push(make());
  }

  get length(): number {
    return this.count;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  nextSlot(): T {
    const slot = this.slots[this.writeIndex] as T;
    this.writeIndex = (this.writeIndex + 1) % this.slots.length;
    if (this.count < this.slots.length) this.count += 1;
    else this.droppedCount += 1;
    return slot;
  }

  at(index: number): T | null {
    if (index < 0 || index >= this.count) return null;
    const start = this.count < this.slots.length ? 0 : this.writeIndex;
    return this.slots[(start + index) % this.slots.length] as T;
  }

  clear(): void {
    this.writeIndex = 0;
    this.count = 0;
    this.droppedCount = 0;
  }
}

export type NetcodeEvidenceRecorder = {
  readonly recording: boolean;
  readonly startedAtMs: number;
  start(nowMs: number): void;
  stop(): void;
  reset(): void;
  recordTrace(nowMs: number, dir: 'in' | 'out', kind: unknown, peer: string, seq: number, bytes: number): void;
  recordDiff(nowMs: number, peer: string, disagreementM: number, seq: number): void;
  recordRequest(nowMs: number, peer: string, kind: 'reload' | 'pickup', outcome: 'accepted' | 'rejected' | 'timeout', latencyMs: number, reason: string): void;
  /** Builds the bundle. The ONLY allocating path; called on the export key. */
  build(nowMs: number, model: NetcodeDiagnosticsModel, meta: Readonly<{ protocolVersion: number; pass: string; generatedAtEpochMs: number }>): EvidenceBundle;
};

/** Peer ids are opaque PeerJS ids; cap the length so a hostile id cannot bloat. */
function safeId(value: string): string {
  return typeof value === 'string' ? value.slice(0, 64) : '';
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function createNetcodeEvidenceRecorder(
  windowMs = EVIDENCE_WINDOW_MS,
  maxTraces = EVIDENCE_MAX_TRACES,
  maxDiffs = EVIDENCE_MAX_DIFFS,
): NetcodeEvidenceRecorder {
  const traces = new RecordRing<MutableTrace>(maxTraces, () => ({ t: 0, dir: 'in', kind: 'other', peer: '', seq: -1, bytes: 0 }));
  const diffs = new RecordRing<MutableDiff>(maxDiffs, () => ({ t: 0, peer: '', disagreementM: 0, seq: -1 }));
  const requests: EvidenceRequest[] = [];
  let recording = false;
  let startedAtMs = 0;
  let droppedRequests = 0;

  function elapsed(nowMs: number): number {
    return Math.max(0, finite(nowMs) - startedAtMs);
  }

  const recorder: NetcodeEvidenceRecorder = {
    get recording() {
      return recording;
    },
    get startedAtMs() {
      return startedAtMs;
    },
    start(nowMs: number): void {
      recording = true;
      startedAtMs = finite(nowMs);
      traces.clear();
      diffs.clear();
      requests.length = 0;
      droppedRequests = 0;
    },
    stop(): void {
      recording = false;
    },
    reset(): void {
      recording = false;
      startedAtMs = 0;
      traces.clear();
      diffs.clear();
      requests.length = 0;
      droppedRequests = 0;
    },
    recordTrace(nowMs, dir, kind, peer, seq, bytes): void {
      if (!recording) return;
      const slot = traces.nextSlot();
      slot.t = elapsed(nowMs);
      slot.dir = dir === 'out' ? 'out' : 'in';
      slot.kind = sanitiseTraceKind(kind);
      slot.peer = safeId(peer);
      slot.seq = Number.isFinite(seq) ? Math.trunc(seq) : -1;
      slot.bytes = Math.max(0, Math.trunc(finite(bytes)));
    },
    recordDiff(nowMs, peer, disagreementM, seq): void {
      if (!recording) return;
      const slot = diffs.nextSlot();
      slot.t = elapsed(nowMs);
      slot.peer = safeId(peer);
      slot.disagreementM = Math.max(0, finite(disagreementM));
      slot.seq = Number.isFinite(seq) ? Math.trunc(seq) : -1;
    },
    recordRequest(nowMs, peer, kind, outcome, latencyMs, reason): void {
      if (!recording) return;
      // Requests are rare (a reload or a pickup, not a snapshot), so a plain
      // array with a hard cap is honest here; the cap still cannot be exceeded.
      if (requests.length >= 512) {
        requests.shift();
        droppedRequests += 1;
      }
      requests.push({
        t: elapsed(nowMs),
        peer: safeId(peer),
        kind: kind === 'pickup' ? 'pickup' : 'reload',
        outcome: outcome === 'rejected' || outcome === 'timeout' ? outcome : 'accepted',
        latencyMs: Math.max(0, finite(latencyMs)),
        // Refusal reasons are protocol enums; anything else is dropped rather
        // than copied, so a host cannot put free text into a shared bundle.
        reason: /^[a-z0-9-]{0,32}$/u.test(reason) ? reason : 'other',
      });
    },
    build(nowMs, model, meta): EvidenceBundle {
      const cutoff = Math.max(0, elapsed(nowMs) - windowMs);
      const keptTraces: EvidenceTrace[] = [];
      for (let index = 0; index < traces.length; index += 1) {
        const slot = traces.at(index);
        if (!slot || slot.t < cutoff) continue;
        keptTraces.push({ t: Math.round(slot.t), dir: slot.dir, kind: slot.kind, peer: slot.peer, seq: slot.seq, bytes: slot.bytes });
      }
      const keptDiffs: EvidenceDiff[] = [];
      for (let index = 0; index < diffs.length; index += 1) {
        const slot = diffs.at(index);
        if (!slot || slot.t < cutoff) continue;
        keptDiffs.push({ t: Math.round(slot.t), peer: slot.peer, disagreementM: Math.round(slot.disagreementM * 1_000) / 1_000, seq: slot.seq });
      }
      const keptRequests = requests.filter((entry) => entry.t >= cutoff);

      const peers: EvidencePeerSummary[] = [];
      for (const peer of model.peers.values()) {
        const summary = summarisePeer(peer, nowMs);
        peers.push({
          peer: safeId(peer.peerId),
          role: peer.role,
          rttMs: Math.round(summary.rttMs * 10) / 10,
          jitterMs: Math.round(summary.jitterMs * 10) / 10,
          lossFraction: Math.round(lossFraction(peer.baseSeq, peer.highestSeq, peer.receivedSnapshots) * 10_000) / 10_000,
          inboundRateHz: Math.round(measuredRateHz(peer.inboundArrivals) * 10) / 10,
          outboundRateHz: Math.round(measuredRateHz(peer.outboundSends) * 10) / 10,
          disagreementMeanM: peer.disagreementM.length > 0 ? Math.round(peer.disagreementM.mean() * 1_000) / 1_000 : 0,
          disagreementP95M: Math.round(summary.disagreementP95M * 1_000) / 1_000,
          disagreementMaxM: Math.round(summary.disagreementMaxM * 1_000) / 1_000,
          desync: Math.round(summary.desync * 1_000) / 1_000,
          desyncSessionP95: 0, // replaced below, once the row it is derived from exists
          sampleCount: peer.disagreementM.length,
        });
      }

      // Derived from the finished row rather than from the live model, so the
      // analyser recomputes it from exactly the numbers the bundle carries.
      for (let index = 0; index < peers.length; index += 1) {
        const row = peers[index] as EvidencePeerSummary;
        peers[index] = { ...row, desyncSessionP95: Math.round(recomputedDesync(row) * 1_000) / 1_000 };
      }

      let droppedByBytes = 0;
      let bundle = freezeBundle({
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        generatedAtEpochMs: finite(meta.generatedAtEpochMs),
        windowMs: Math.min(windowMs, Math.round(elapsed(nowMs))),
        roomCode: safeId(model.roomCode),
        localPeerId: safeId(model.localPeerId),
        localRole: model.localRole,
        protocolVersion: Math.trunc(finite(meta.protocolVersion)),
        pass: typeof meta.pass === 'string' ? meta.pass.slice(0, 32) : '',
        traces: keptTraces,
        diffs: keptDiffs,
        requests: keptRequests,
        peers,
        dropped: { traces: traces.dropped, diffs: diffs.dropped, requests: droppedRequests, byBytes: 0 },
      });
      // Byte cap, enforced on the ACTUAL serialisation rather than an estimate.
      // Traces are shed oldest-first because the most recent seconds are the
      // ones a friend is describing when they say "it just happened".
      while (JSON.stringify(bundle).length > EVIDENCE_MAX_BYTES && bundle.traces.length > 0) {
        const shed = Math.max(1, Math.floor(bundle.traces.length * 0.2));
        droppedByBytes += shed;
        bundle = freezeBundle({
          ...bundle,
          traces: bundle.traces.slice(shed),
          dropped: { ...bundle.dropped, byBytes: droppedByBytes },
        });
      }
      return bundle;
    },
  };
  return recorder;
}

function freezeBundle(value: EvidenceBundle): EvidenceBundle {
  return Object.freeze(value);
}

/**
 * Schema validation, exported so BOTH sides use one definition: the recorder
 * test asserts what it produces and the analyser refuses what it cannot read.
 * A bundle that arrives from a friend is untrusted input — it has crossed a
 * chat window — so this checks shape and range rather than trusting the file.
 */
export function validateEvidenceBundle(value: unknown): { ok: true; bundle: EvidenceBundle } | { ok: false; reason: string } {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'not an object' };
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion ${String(candidate.schemaVersion)} is not ${EVIDENCE_SCHEMA_VERSION}` };
  }
  for (const key of ['roomCode', 'localPeerId', 'localRole'] as const) {
    if (typeof candidate[key] !== 'string') return { ok: false, reason: `${key} must be a string` };
  }
  for (const key of ['traces', 'diffs', 'requests', 'peers'] as const) {
    if (!Array.isArray(candidate[key])) return { ok: false, reason: `${key} must be an array` };
  }
  for (const peer of candidate.peers as unknown[]) {
    if (typeof peer !== 'object' || peer === null) return { ok: false, reason: 'peer entry must be an object' };
    const row = peer as Record<string, unknown>;
    if (typeof row.peer !== 'string') return { ok: false, reason: 'peer.peer must be a string' };
    for (const key of ['rttMs', 'jitterMs', 'lossFraction', 'disagreementP95M', 'disagreementMaxM', 'desync'] as const) {
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key] as number)) {
        return { ok: false, reason: `peer.${key} must be a finite number` };
      }
    }
  }
  return { ok: true, bundle: candidate as unknown as EvidenceBundle };
}

/**
 * Recomputes the desync meter from a bundle's own recorded numbers. The
 * analyser uses this rather than trusting the `desync` the sender wrote, so a
 * bundle produced by an older build (or edited by hand) cannot claim a health
 * it does not have.
 */
export function recomputedDesync(peer: EvidencePeerSummary): number {
  return desyncMeter({
    disagreementM: peer.disagreementP95M,
    lossFraction: peer.lossFraction,
    jitterMs: peer.jitterMs,
    snapshotRateHz: peer.inboundRateHz,
    lastAckAgeMs: 0,
  });
}

/** Stable filename: no timestamp collisions between a host and three guests. */
export function evidenceFileName(bundle: EvidenceBundle): string {
  const room = bundle.roomCode.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 12) || 'room';
  const peer = bundle.localPeerId.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 10) || 'peer';
  return `aa-netcode-evidence-${room}-${bundle.localRole}-${peer}-${bundle.generatedAtEpochMs}.json`;
}
