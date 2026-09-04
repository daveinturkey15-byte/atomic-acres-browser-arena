/**
 * PASS 95 — netcode diagnostics model (owner priority 2026-09-02: "WAN sessions
 * with friends as evidence, a netcode diagnostics overlay").
 *
 * WHY THIS FILE EXISTS AND WHAT IT DELIBERATELY IS NOT
 * ---------------------------------------------------
 * When a friend says "it felt laggy" there is currently nothing to look at. The
 * end-of-match diagnostic (`src/last-multiplayer-diagnostic.ts`) records one
 * scalar per field AFTER the match, which cannot answer "was it laggy for
 * everyone or just Sam, and was it latency or divergence?". This module is the
 * live, per-peer half of that answer.
 *
 * It is a PURE MODEL. It touches no DOM, imports nothing from three.js, and
 * knows nothing about rendering. The overlay that draws it is
 * `src/netcode-diagnostics-overlay.ts`; the evidence bundle that ships it to
 * the owner is `src/netcode-evidence-recorder.ts`. Keeping the arithmetic here
 * is what makes it testable without a browser.
 *
 * ALLOCATION CONTRACT (the reason for the typed arrays below)
 * -----------------------------------------------------------
 * Every `record*` entry point is called from the network receive path or the
 * frame loop and MUST NOT allocate. Samples land in preallocated
 * `Float64Array` rings; per-peer state is one mutable object created once when
 * the peer joins. No closures, no spread, no array literals, no string
 * building on those paths. Strings are produced only by `renderDiagnostics*`,
 * which the overlay calls at a throttled cadence and only when the model says
 * something changed. `src/netcode-diagnostics.test.ts` pins this by sampling
 * the ring's identity across thousands of pushes.
 *
 * The metrics themselves are deliberately the same shapes the runtime already
 * adapts on (`src/network-sync.ts` demotes snapshot rate on rtt/jitter/gaps,
 * `src/network-fairness.ts` rewinds by rtt/2 + jitter), so the overlay shows
 * the numbers that actually drive behaviour rather than a parallel invention.
 */

export const DEFAULT_SAMPLE_CAPACITY = 64;
export const REQUEST_OUTCOME_CAPACITY = 5;

/**
 * RFC 3550's interarrival-jitter gain. J += (|D| - J)/16 — a first-order filter
 * with a ~16-sample memory, chosen because it is the number every network
 * engineer already recognises and because it is insensitive to a single
 * outlying sample, which a raw standard deviation is not.
 */
export const JITTER_GAIN = 1 / 16;

/** Matches `updatePeerTiming` in src/network-fairness.ts so the two agree. */
export const RTT_EMA_ALPHA = 0.25;

/** Above this the desync meter is saturated; 2 m is roughly one player width. */
export const DESYNC_POSITION_SATURATION_M = 2;
/** A last-ack older than this is a stall, not jitter. */
export const DESYNC_ACK_SATURATION_MS = 1_000;

export type NetDiagnosticsRole = 'host' | 'guest' | 'offline';
export type NetRequestKind = 'reload' | 'pickup';
export type NetRequestOutcome = 'accepted' | 'rejected' | 'timeout';

/**
 * A fixed-capacity ring of finite numbers over one `Float64Array`. Pushing past
 * capacity overwrites the oldest sample and never grows the backing store.
 * Non-finite values are dropped rather than poisoning every later mean — a NaN
 * that reached the buffer would make the whole overlay read `NaN` forever.
 */
export class NumericRing {
  private readonly values: Float64Array;
  private writeIndex = 0;
  private count = 0;
  private rejected = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`NumericRing capacity must be a positive integer, received ${String(capacity)}`);
    }
    this.values = new Float64Array(capacity);
  }

  get capacity(): number {
    return this.values.length;
  }

  /** Number of samples currently held; never exceeds `capacity`. */
  get length(): number {
    return this.count;
  }

  /** Samples refused for being non-finite. Surfaced so a silent drop is visible. */
  get rejectedCount(): number {
    return this.rejected;
  }

  push(value: number): boolean {
    if (!Number.isFinite(value)) {
      this.rejected += 1;
      return false;
    }
    this.values[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.values.length;
    if (this.count < this.values.length) this.count += 1;
    return true;
  }

  /** `index` 0 is the OLDEST retained sample. Out-of-range reads return NaN. */
  at(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return Number.NaN;
    const start = this.count < this.values.length ? 0 : this.writeIndex;
    return this.values[(start + index) % this.values.length] as number;
  }

  last(): number {
    return this.count === 0 ? Number.NaN : this.at(this.count - 1);
  }

  mean(): number {
    if (this.count === 0) return Number.NaN;
    let total = 0;
    for (let index = 0; index < this.count; index += 1) total += this.at(index);
    return total / this.count;
  }

  max(): number {
    if (this.count === 0) return Number.NaN;
    let highest = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < this.count; index += 1) {
      const value = this.at(index);
      if (value > highest) highest = value;
    }
    return highest;
  }

  /**
   * Nearest-rank percentile over the retained window. Allocation-free: it does
   * not sort a copy, it counts how many samples fall at or below each
   * candidate, which is O(n^2) on a 64-sample ring (4096 comparisons at the
   * 4 Hz overlay cadence) and costs nothing measurable.
   */
  percentile(fraction: number): number {
    if (this.count === 0 || !Number.isFinite(fraction)) return Number.NaN;
    const clamped = Math.min(1, Math.max(0, fraction));
    const rank = Math.max(1, Math.ceil(clamped * this.count));
    let best = Number.NaN;
    for (let candidateIndex = 0; candidateIndex < this.count; candidateIndex += 1) {
      const candidate = this.at(candidateIndex);
      let atOrBelow = 0;
      for (let index = 0; index < this.count; index += 1) {
        if (this.at(index) <= candidate) atOrBelow += 1;
      }
      if (atOrBelow >= rank && (Number.isNaN(best) || candidate < best)) best = candidate;
    }
    return best;
  }

  clear(): void {
    this.writeIndex = 0;
    this.count = 0;
    this.rejected = 0;
    this.values.fill(0);
  }
}

/**
 * The last N request outcomes. Separate from NumericRing because the entries
 * are records, and preallocated because this is written from the message
 * handler. Slots are reused in place: `record()` never constructs an object.
 */
export type RequestOutcomeSlot = {
  used: boolean;
  kind: NetRequestKind;
  outcome: NetRequestOutcome;
  atMs: number;
  latencyMs: number;
  /** Host-supplied refusal reason, already an enum on the wire; never free text. */
  reason: string;
};

export class RequestOutcomeRing {
  private readonly slots: RequestOutcomeSlot[];
  private writeIndex = 0;
  private count = 0;

  constructor(capacity: number = REQUEST_OUTCOME_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`RequestOutcomeRing capacity must be a positive integer, received ${String(capacity)}`);
    }
    this.slots = [];
    for (let index = 0; index < capacity; index += 1) {
      this.slots.push({ used: false, kind: 'reload', outcome: 'accepted', atMs: 0, latencyMs: 0, reason: '' });
    }
  }

  get capacity(): number {
    return this.slots.length;
  }

  get length(): number {
    return this.count;
  }

  record(kind: NetRequestKind, outcome: NetRequestOutcome, atMs: number, latencyMs: number, reason = ''): void {
    const slot = this.slots[this.writeIndex] as RequestOutcomeSlot;
    slot.used = true;
    slot.kind = kind;
    slot.outcome = outcome;
    slot.atMs = Number.isFinite(atMs) ? atMs : 0;
    slot.latencyMs = Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0;
    slot.reason = reason;
    this.writeIndex = (this.writeIndex + 1) % this.slots.length;
    if (this.count < this.slots.length) this.count += 1;
  }

  /** `index` 0 is the OLDEST retained outcome. Returns null out of range. */
  at(index: number): RequestOutcomeSlot | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return null;
    const start = this.count < this.slots.length ? 0 : this.writeIndex;
    return this.slots[(start + index) % this.slots.length] as RequestOutcomeSlot;
  }

  clear(): void {
    this.writeIndex = 0;
    this.count = 0;
    for (const slot of this.slots) slot.used = false;
  }
}

export type PeerDiagnostics = {
  readonly peerId: string;
  role: NetDiagnosticsRole;
  /** EMA of round-trip time, same filter the fairness module rewinds by. */
  rttMs: number;
  /** RFC 3550 interarrival jitter over rtt samples. */
  jitterMs: number;
  /** Highest snapshot sequence seen; with `receivedSnapshots` gives loss. */
  highestSeq: number;
  baseSeq: number;
  receivedSnapshots: number;
  /** Snapshots this peer sent us, timestamped, for the measured inbound rate. */
  readonly inboundArrivals: NumericRing;
  /** Snapshots we sent this peer, timestamped, for the measured outbound rate. */
  readonly outboundSends: NumericRing;
  /** Metres between our rendered pose for this peer and the host's authority. */
  readonly disagreementM: NumericRing;
  readonly rttSamples: NumericRing;
  readonly requests: RequestOutcomeRing;
  lastAckAtMs: number;
  lastInboundAtMs: number;
  everAcked: boolean;
};

export type NetcodeDiagnosticsModel = {
  localRole: NetDiagnosticsRole;
  localPeerId: string;
  roomCode: string;
  /** Peers in a stable Map; iteration order is join order, which is stable. */
  readonly peers: Map<string, PeerDiagnostics>;
  /** Bumped by every mutation so the overlay can skip work cheaply. */
  revision: number;
};

export function createPeerDiagnostics(peerId: string, role: NetDiagnosticsRole, capacity = DEFAULT_SAMPLE_CAPACITY): PeerDiagnostics {
  return {
    peerId,
    role,
    rttMs: 0,
    jitterMs: 0,
    highestSeq: -1,
    baseSeq: -1,
    receivedSnapshots: 0,
    inboundArrivals: new NumericRing(capacity),
    outboundSends: new NumericRing(capacity),
    disagreementM: new NumericRing(capacity),
    rttSamples: new NumericRing(capacity),
    requests: new RequestOutcomeRing(),
    lastAckAtMs: 0,
    lastInboundAtMs: 0,
    everAcked: false,
  };
}

export function createNetcodeDiagnosticsModel(
  localRole: NetDiagnosticsRole = 'offline',
  localPeerId = '',
  roomCode = '',
): NetcodeDiagnosticsModel {
  return { localRole, localPeerId, roomCode, peers: new Map<string, PeerDiagnostics>(), revision: 0 };
}

/**
 * Returns the peer's record, creating it on first sight. The allocation here is
 * per JOIN, not per sample — a four-player room allocates four times for the
 * whole match.
 */
export function peerFor(
  model: NetcodeDiagnosticsModel,
  peerId: string,
  role: NetDiagnosticsRole = 'guest',
  capacity = DEFAULT_SAMPLE_CAPACITY,
): PeerDiagnostics {
  const existing = model.peers.get(peerId);
  if (existing) return existing;
  const created = createPeerDiagnostics(peerId, role, capacity);
  model.peers.set(peerId, created);
  model.revision += 1;
  return created;
}

export function forgetPeer(model: NetcodeDiagnosticsModel, peerId: string): boolean {
  const removed = model.peers.delete(peerId);
  if (removed) model.revision += 1;
  return removed;
}

/** EMA identical in shape to `updatePeerTiming`; first sample seeds the filter. */
export function nextRttMs(previousRttMs: number, sampleMs: number, alpha = RTT_EMA_ALPHA): number {
  if (!Number.isFinite(sampleMs) || sampleMs < 0) return previousRttMs;
  if (!Number.isFinite(previousRttMs) || previousRttMs <= 0) return sampleMs;
  return previousRttMs * (1 - alpha) + sampleMs * alpha;
}

/** RFC 3550 §A.8: J += (|D| - J) / 16, clamped at zero. */
export function nextJitterMs(previousJitterMs: number, previousSampleMs: number, sampleMs: number, gain = JITTER_GAIN): number {
  if (!Number.isFinite(sampleMs) || !Number.isFinite(previousSampleMs)) return previousJitterMs;
  const base = Number.isFinite(previousJitterMs) && previousJitterMs > 0 ? previousJitterMs : 0;
  return Math.max(0, base + (Math.abs(sampleMs - previousSampleMs) - base) * gain);
}

/**
 * Fraction of snapshots that never arrived, over the sequence window actually
 * observed. Returns 0 (not NaN) before a second sequence has been seen, because
 * "no data yet" must not render as "100% loss" on a healthy first frame.
 */
export function lossFraction(baseSeq: number, highestSeq: number, received: number): number {
  if (!Number.isFinite(baseSeq) || !Number.isFinite(highestSeq) || !Number.isFinite(received)) return 0;
  if (baseSeq < 0 || highestSeq < baseSeq) return 0;
  const expected = highestSeq - baseSeq + 1;
  if (expected <= 0) return 0;
  const missing = expected - Math.max(0, received);
  return Math.min(1, Math.max(0, missing / expected));
}

/**
 * Measured rate from arrival timestamps: (n - 1) intervals over the elapsed
 * span. Not the NEGOTIATED rate — the whole point is to show when the wire is
 * delivering fewer snapshots than the sender claims to be sending.
 */
export function measuredRateHz(ring: NumericRing): number {
  if (ring.length < 2) return 0;
  const span = ring.last() - ring.at(0);
  if (!Number.isFinite(span) || span <= 0) return 0;
  return ((ring.length - 1) * 1_000) / span;
}

export function lastAckAgeMs(peer: PeerDiagnostics, nowMs: number): number {
  if (!peer.everAcked || !Number.isFinite(nowMs)) return Number.NaN;
  return Math.max(0, nowMs - peer.lastAckAtMs);
}

/**
 * A single 0..1 number a friend can read out over voice chat. It is the MAXIMUM
 * of four normalised pressures rather than their average, deliberately: a
 * session that is perfect on three axes and broken on the fourth is broken, and
 * an average would hide it behind the three good ones.
 *
 *   position   metres of disagreement / DESYNC_POSITION_SATURATION_M
 *   loss       loss fraction, already 0..1
 *   jitter     jitter / (half the snapshot interval) — jitter past half an
 *              interval is what makes interpolation underrun
 *   ack age    ms since the last ack / DESYNC_ACK_SATURATION_MS
 */
export function desyncMeter(input: Readonly<{
  disagreementM: number;
  lossFraction: number;
  jitterMs: number;
  snapshotRateHz: number;
  lastAckAgeMs: number;
}>): number {
  const position = Number.isFinite(input.disagreementM)
    ? Math.max(0, input.disagreementM) / DESYNC_POSITION_SATURATION_M
    : 0;
  const loss = Number.isFinite(input.lossFraction) ? Math.max(0, input.lossFraction) : 0;
  const intervalMs = Number.isFinite(input.snapshotRateHz) && input.snapshotRateHz > 0
    ? 1_000 / input.snapshotRateHz
    : 1_000 / 20;
  const jitter = Number.isFinite(input.jitterMs) ? Math.max(0, input.jitterMs) / (intervalMs / 2) : 0;
  const ack = Number.isFinite(input.lastAckAgeMs) ? Math.max(0, input.lastAckAgeMs) / DESYNC_ACK_SATURATION_MS : 0;
  return Math.min(1, Math.max(position, loss, jitter, ack));
}

// ---------------------------------------------------------------------------
// Recording entry points. Every one of these is allocation-free.
// ---------------------------------------------------------------------------

export function recordRttSample(model: NetcodeDiagnosticsModel, peerId: string, sampleMs: number, role?: NetDiagnosticsRole): void {
  const peer = peerFor(model, peerId, role ?? 'guest');
  if (!Number.isFinite(sampleMs) || sampleMs < 0) return;
  const previousSample = peer.rttSamples.length > 0 ? peer.rttSamples.last() : sampleMs;
  peer.jitterMs = nextJitterMs(peer.jitterMs, previousSample, sampleMs);
  peer.rttMs = nextRttMs(peer.rttMs, sampleMs);
  peer.rttSamples.push(sampleMs);
  model.revision += 1;
}

/**
 * One inbound snapshot. `seq` is the sender's snapshot sequence; passing -1
 * means "this transport does not sequence", in which case loss stays 0 rather
 * than being guessed.
 */
export function recordInboundSnapshot(model: NetcodeDiagnosticsModel, peerId: string, seq: number, nowMs: number, role?: NetDiagnosticsRole): void {
  const peer = peerFor(model, peerId, role ?? 'guest');
  peer.inboundArrivals.push(nowMs);
  peer.lastInboundAtMs = Number.isFinite(nowMs) ? nowMs : peer.lastInboundAtMs;
  if (Number.isFinite(seq) && seq >= 0) {
    if (peer.baseSeq < 0) peer.baseSeq = seq;
    if (seq > peer.highestSeq) peer.highestSeq = seq;
    peer.receivedSnapshots += 1;
  }
  model.revision += 1;
}

export function recordOutboundSnapshot(model: NetcodeDiagnosticsModel, peerId: string, nowMs: number, role?: NetDiagnosticsRole): void {
  const peer = peerFor(model, peerId, role ?? 'guest');
  peer.outboundSends.push(nowMs);
  model.revision += 1;
}

export function recordAck(model: NetcodeDiagnosticsModel, peerId: string, nowMs: number, role?: NetDiagnosticsRole): void {
  const peer = peerFor(model, peerId, role ?? 'guest');
  if (!Number.isFinite(nowMs)) return;
  peer.lastAckAtMs = nowMs;
  peer.everAcked = true;
  model.revision += 1;
}

/**
 * Metres between where WE are drawing this peer and where the host says it is.
 * On the host this is measured against its own authority (and is therefore 0 by
 * construction for the host's own actor, which is exactly the control the
 * divergence table needs).
 */
export function recordPositionDisagreement(model: NetcodeDiagnosticsModel, peerId: string, metres: number, role?: NetDiagnosticsRole): void {
  const peer = peerFor(model, peerId, role ?? 'guest');
  peer.disagreementM.push(metres);
  model.revision += 1;
}

export function recordRequestOutcome(
  model: NetcodeDiagnosticsModel,
  peerId: string,
  kind: NetRequestKind,
  outcome: NetRequestOutcome,
  nowMs: number,
  latencyMs: number,
  reason = '',
): void {
  const peer = peerFor(model, peerId);
  peer.requests.record(kind, outcome, nowMs, latencyMs, reason);
  model.revision += 1;
}

// ---------------------------------------------------------------------------
// Read side. `summarisePeer` allocates ONE object per peer per overlay repaint
// (4 Hz), never per frame and never per message.
// ---------------------------------------------------------------------------

export type PeerSummary = Readonly<{
  peerId: string;
  role: NetDiagnosticsRole;
  rttMs: number;
  jitterMs: number;
  lossFraction: number;
  inboundRateHz: number;
  outboundRateHz: number;
  lastAckAgeMs: number;
  disagreementM: number;
  disagreementP95M: number;
  disagreementMaxM: number;
  desync: number;
  requestSummary: string;
}>;

function formatOutcomeGlyph(slot: RequestOutcomeSlot): string {
  const kind = slot.kind === 'reload' ? 'R' : 'P';
  if (slot.outcome === 'accepted') return `${kind}+`;
  if (slot.outcome === 'rejected') return `${kind}-`;
  return `${kind}?`;
}

/** "R+ R+ P- R+ P?" — oldest first, at most REQUEST_OUTCOME_CAPACITY entries. */
export function summariseRequests(ring: RequestOutcomeRing): string {
  if (ring.length === 0) return '--';
  let text = '';
  for (let index = 0; index < ring.length; index += 1) {
    const slot = ring.at(index);
    if (!slot) continue;
    text += (text.length > 0 ? ' ' : '') + formatOutcomeGlyph(slot);
  }
  return text;
}

export function summarisePeer(peer: PeerDiagnostics, nowMs: number): PeerSummary {
  const inboundRateHz = measuredRateHz(peer.inboundArrivals);
  const loss = lossFraction(peer.baseSeq, peer.highestSeq, peer.receivedSnapshots);
  const ackAge = lastAckAgeMs(peer, nowMs);
  const disagreement = peer.disagreementM.length > 0 ? peer.disagreementM.last() : 0;
  return {
    peerId: peer.peerId,
    role: peer.role,
    rttMs: peer.rttMs,
    jitterMs: peer.jitterMs,
    lossFraction: loss,
    inboundRateHz,
    outboundRateHz: measuredRateHz(peer.outboundSends),
    lastAckAgeMs: ackAge,
    disagreementM: disagreement,
    disagreementP95M: peer.disagreementM.length > 0 ? peer.disagreementM.percentile(0.95) : 0,
    disagreementMaxM: peer.disagreementM.length > 0 ? peer.disagreementM.max() : 0,
    desync: desyncMeter({
      disagreementM: disagreement,
      lossFraction: loss,
      jitterMs: peer.jitterMs,
      snapshotRateHz: inboundRateHz,
      lastAckAgeMs: Number.isNaN(ackAge) ? 0 : ackAge,
    }),
    requestSummary: summariseRequests(peer.requests),
  };
}

function fixed(value: number, places: number): string {
  return Number.isFinite(value) ? value.toFixed(places) : '--';
}

/**
 * One monospace line per peer. Written into `out` at `offset` rather than
 * returned in a fresh array so the overlay can keep one array for the life of
 * the session; returns the number of lines written.
 */
export function renderDiagnosticsLines(model: NetcodeDiagnosticsModel, nowMs: number, out: string[]): number {
  let written = 0;
  const room = model.roomCode.length > 0 ? model.roomCode : '----';
  out[written] = `NETCODE  role=${model.localRole}  room=${room}  peers=${model.peers.size}`;
  written += 1;
  out[written] = 'peer      role  rtt   jit  loss   in    out   ack    dis   desync  req';
  written += 1;
  for (const peer of model.peers.values()) {
    const summary = summarisePeer(peer, nowMs);
    const id = summary.peerId.length > 8 ? summary.peerId.slice(0, 8) : summary.peerId.padEnd(8, ' ');
    out[written] = `${id}  ${summary.role.slice(0, 5).padEnd(5, ' ')} `
      + `${fixed(summary.rttMs, 0).padStart(4, ' ')}  `
      + `${fixed(summary.jitterMs, 0).padStart(3, ' ')}  `
      + `${fixed(summary.lossFraction * 100, 1).padStart(4, ' ')}  `
      + `${fixed(summary.inboundRateHz, 0).padStart(3, ' ')}  `
      + `${fixed(summary.outboundRateHz, 0).padStart(3, ' ')}  `
      + `${fixed(summary.lastAckAgeMs, 0).padStart(5, ' ')}  `
      + `${fixed(summary.disagreementM, 2).padStart(5, ' ')}  `
      + `${fixed(summary.desync, 2).padStart(5, ' ')}   `
      + summary.requestSummary;
    written += 1;
  }
  if (model.peers.size === 0) {
    out[written] = 'no peers — solo or lobby';
    written += 1;
  }
  out.length = written;
  return written;
}
