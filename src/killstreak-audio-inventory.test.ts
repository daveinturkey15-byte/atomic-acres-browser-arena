import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AUDIO_RUNTIME_BUDGET } from './spatial-audio';
import { ArenaAudio } from './audio';

/**
 * HF-542 Phase-0 instrument: scheduled Web Audio graph inventory for the
 * 18 killstreak/support cues + 3 bursts + 4 reference cues.
 *
 * Evidence is the scheduled graph (node types created, automation scheduled
 * on each AudioParam, admitted-vs-dropped voices), not rendered samples.
 * See src/audio-source-synthesis-runtime.test.ts header for why the schedule
 * is the assertable surface. console.log is swallowed by this vitest config,
 * so the array is written to docs/evidence/pass95/killstreak-audio/ with
 * writeFileSync.
 */

type AutomationCall = Readonly<{ kind: 'set' | 'linear' | 'exponential' | 'target' | 'cancel'; value: number; at: number }>;

class FakeAudioParam {
  value = 0;
  readonly calls: AutomationCall[] = [];
  setValueAtTime(value: number, at = 0): this { this.value = value; this.calls.push({ kind: 'set', value, at }); return this; }
  exponentialRampToValueAtTime(value: number, at = 0): this { this.value = value; this.calls.push({ kind: 'exponential', value, at }); return this; }
  linearRampToValueAtTime(value: number, at = 0): this { this.value = value; this.calls.push({ kind: 'linear', value, at }); return this; }
  setTargetAtTime(value: number, at = 0): this { this.value = value; this.calls.push({ kind: 'target', value, at }); return this; }
  cancelScheduledValues(at = 0): this { this.calls.push({ kind: 'cancel', value: 0, at }); return this; }
}

class FakeAudioNode {
  readonly outputs: FakeAudioNode[] = [];
  disconnected = false;
  connect<T>(destination: T): T { this.outputs.push(destination as unknown as FakeAudioNode); return destination; }
  disconnect(): void { this.disconnected = true; }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  start(): void { /* bounded by stop() */ }
  stop(): void { /* nothing to unwind in the recorder */ }
}

class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
}

type FakeBuffer = { duration: number; data: Float32Array; getChannelData: () => Float32Array };

class FakeBufferSourceNode extends FakeScheduledSource {
  buffer: FakeBuffer | null = null;
  loop = false;
}

class FakeGainNode extends FakeAudioNode { readonly gain = new FakeAudioParam(); }

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
}

class FakeWaveShaperNode extends FakeAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
}

class FakeCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam();
  readonly knee = new FakeAudioParam();
  readonly ratio = new FakeAudioParam();
  readonly attack = new FakeAudioParam();
  readonly release = new FakeAudioParam();
}

class FakePannerNode extends FakeAudioNode {
  panningModel: PanningModelType = 'equalpower';
  distanceModel: DistanceModelType = 'inverse';
  refDistance = 1;
  maxDistance = 10_000;
  rolloffFactor = 1;
  readonly positionX = new FakeAudioParam();
  readonly positionY = new FakeAudioParam();
  readonly positionZ = new FakeAudioParam();
}

class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];
  readonly sampleRate = 48_000;
  readonly destination = new FakeAudioNode();
  readonly listener = {
    positionX: new FakeAudioParam(), positionY: new FakeAudioParam(), positionZ: new FakeAudioParam(),
    forwardX: new FakeAudioParam(), forwardY: new FakeAudioParam(), forwardZ: new FakeAudioParam(),
    upX: new FakeAudioParam(), upY: new FakeAudioParam(), upZ: new FakeAudioParam(),
  };
  readonly buffers: FakeBuffer[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly shapers: FakeWaveShaperNode[] = [];
  readonly panners: FakePannerNode[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;

  constructor() { FakeAudioContext.instances.push(this); }
  createDynamicsCompressor(): FakeCompressorNode { return new FakeCompressorNode(); }
  createGain(): FakeGainNode { const node = new FakeGainNode(); this.gains.push(node); return node; }
  createBiquadFilter(): FakeBiquadFilterNode { const node = new FakeBiquadFilterNode(); this.filters.push(node); return node; }
  createOscillator(): FakeOscillatorNode { const node = new FakeOscillatorNode(); this.oscillators.push(node); return node; }
  createBufferSource(): FakeBufferSourceNode { const node = new FakeBufferSourceNode(); this.bufferSources.push(node); return node; }
  createWaveShaper(): FakeWaveShaperNode { const node = new FakeWaveShaperNode(); this.shapers.push(node); return node; }
  createPanner(): FakePannerNode { const node = new FakePannerNode(); this.panners.push(node); return node; }
  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    const data = new Float32Array(length);
    const buffer = { duration: length / sampleRate, data, getChannelData: () => data };
    this.buffers.push(buffer);
    return buffer;
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

afterEach(() => { vi.unstubAllGlobals(); });

type CueSpec = Readonly<{ cue: string; run: (audio: ArenaAudio) => void }>;

const CUES: readonly CueSpec[] = [
  { cue: 'killstreakAnnounce.hostile', run: (a) => { a.killstreakAnnounce('hostile'); } },
  { cue: 'killstreakAnnounce.own', run: (a) => { a.killstreakAnnounce('own'); } },
  { cue: 'supportInbound.yardhawk', run: (a) => { a.supportInbound('yardhawk'); } },
  { cue: 'supportInbound.tri-pass', run: (a) => { a.supportInbound('tri-pass'); } },
  { cue: 'supportInbound.hunter-swarm', run: (a) => { a.supportInbound('hunter-swarm'); } },
  { cue: 'scoutSweep', run: (a) => { a.scoutSweep(); } },
  { cue: 'hunterLaunch(0)', run: (a) => { a.hunterLaunch(0); } },
  { cue: 'bombRelease', run: (a) => { a.bombRelease({ x: 12, y: 30, z: -8 }); } },
  { cue: 'missileLaunch', run: (a) => { a.missileLaunch({ x: 12, y: 30, z: -8 }); } },
  { cue: 'supportGunPositional.chopper', run: (a) => { a.supportGunPositional('chopper', { x: 12, y: 30, z: -8 }); } },
  { cue: 'supportGunPositional.drone', run: (a) => { a.supportGunPositional('drone', { x: 12, y: 30, z: -8 }); } },
  { cue: 'nukeWarning', run: (a) => { a.nukeWarning(); } },
  { cue: 'nukeDetonation', run: (a) => { a.nukeDetonation(); } },
  { cue: 'overdrivePickup', run: (a) => { a.overdrivePickup(); } },
  { cue: 'overdriveAvailable', run: (a) => { a.overdriveAvailable(); } },
  { cue: 'overdriveExpire', run: (a) => { a.overdriveExpire(); } },
  { cue: 'adrenalineState.on', run: (a) => { a.adrenalineState(true); } },
  { cue: 'dominationCue.friendly', run: (a) => { a.dominationCue(true); } },
  {
    cue: 'BURST nuke sequence',
    run: (a) => { a.killstreakAnnounce('hostile'); a.nukeWarning(); },
  },
  {
    cue: 'BURST hunter-swarm activation',
    run: (a) => {
      a.killstreakAnnounce('own');
      a.supportInbound('hunter-swarm');
      for (let i = 0; i < 5; i += 1) a.hunterLaunch(i);
    },
  },
  {
    cue: 'BURST tri-pass activation',
    run: (a) => {
      a.killstreakAnnounce('own');
      a.supportInbound('tri-pass');
      a.bombRelease({ x: 5, y: 40, z: 5 });
    },
  },
  { cue: 'REF shot(carbine)', run: (a) => { a.shot('carbine'); } },
  { cue: 'REF impact.concrete', run: (a) => { a.impact('concrete', 10); } },
  { cue: 'REF footstep', run: (a) => { a.footstep('concrete', true); } },
  { cue: 'REF matchStinger.start', run: (a) => { a.matchStinger('start'); } },
];

export type CueInventory = {
  cue: string;
  scheduledVoices: number; admittedVoices: number; oscVoices: number; noiseVoices: number;
  envelopeGains: number; stage3: number; stage4plus: number;
  defaultAttackVoices: number; minAttackMs: number; maxAttackMs: number;
  peakSum: number; admittedPeakSum: number; maxPeak: number;
  saturators: number; distinctWaves: string[]; spanSeconds: number;
  dropped: number; stolen: number;
  liveVoicesByBus: Record<string, number>; peakConcurrentByBus: Record<string, number>;
};

function freshRig(): { audio: ArenaAudio; context: FakeAudioContext } {
  FakeAudioContext.instances.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const audio = new ArenaAudio();
  audio.unlock();
  audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
  return { audio, context: FakeAudioContext.instances[0]! };
}

function measureOne(spec: CueSpec): CueInventory {
  const { audio, context } = freshRig();
  const before = {
    gains: context.gains.length,
    osc: context.oscillators.length,
    buf: context.bufferSources.length,
    shapers: context.shapers.length,
  };
  const droppedBefore = audio.telemetry().runtime.dropped;
  const stolenBefore = audio.telemetry().runtime.stolen;
  spec.run(audio);
  const dropped = audio.telemetry().runtime.dropped - droppedBefore;
  const stolen = audio.telemetry().runtime.stolen - stolenBefore;
  const newGains = context.gains.slice(before.gains);
  const newOsc = context.oscillators.slice(before.osc);
  const newBuf = context.bufferSources.slice(before.buf);
  const newShapers = context.shapers.slice(before.shapers);
  const busIdentity = (audio as unknown as { busIdentity: Map<unknown, string> }).busIdentity;

  const envelopes = newGains.filter((g) => g.gain.calls.length >= 3);
  const stage3 = envelopes.filter((g) => g.gain.calls.length === 3).length;
  const stage4plus = envelopes.filter((g) => g.gain.calls.length >= 4).length;
  const attacks = envelopes.map((g) => g.gain.calls[1]!.at - g.gain.calls[0]!.at);
  const defaultAttackVoices = attacks.filter((a) => Math.abs(a - 0.0009) < 1e-9).length;
  const peaks = envelopes.map((g) => g.gain.calls[1]!.value);
  const peakSum = peaks.reduce((s, v) => s + v, 0);
  const admittedPeaks = envelopes.filter((g) => !g.disconnected).map((g) => g.gain.calls[1]!.value);
  const admittedPeakSum = admittedPeaks.reduce((s, v) => s + v, 0);
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0;
  const distinctWaves = [...new Set(newOsc.map((o) => o.type))].sort();

  const starts = envelopes.map((g) => g.gain.calls[0]!.at);
  const ends = envelopes.map((g) => g.gain.calls[g.gain.calls.length - 1]!.at);
  const spanSeconds = envelopes.length > 0 ? Math.max(...ends) - Math.min(...starts) : 0;

  const liveVoicesByBus: Record<string, number> = {};
  const intervalsByBus = new Map<string, Array<{ start: number; end: number }>>();
  for (const g of envelopes) {
    const dest = g.outputs[0] as unknown;
    const bus = (dest !== undefined && busIdentity.get(dest)) || 'sfx';
    const start = g.gain.calls[0]!.at;
    const end = g.gain.calls[g.gain.calls.length - 1]!.at;
    const list = intervalsByBus.get(bus) ?? [];
    list.push({ start, end });
    intervalsByBus.set(bus, list);
    if (!g.disconnected) liveVoicesByBus[bus] = (liveVoicesByBus[bus] ?? 0) + 1;
  }
  // NOTE (Phase 0): peakConcurrentByBus is recorded, not asserted. The
  // hunter-swarm baselines genuinely exceed the announcements cap of 4;
  // Phase 1 adds the advancing-time proof test.
  const peakConcurrentByBus: Record<string, number> = {};
  for (const [bus, intervals] of intervalsByBus) {
    const events: Array<{ t: number; d: number }> = [];
    for (const iv of intervals) {
      events.push({ t: iv.start, d: 1 });
      events.push({ t: iv.end, d: -1 });
    }
    // Half-open [start, end): ends sort before starts at equal times.
    events.sort((l, r) => l.t - r.t || l.d - r.d);
    let cur = 0;
    let peak = 0;
    for (const e of events) {
      cur += e.d;
      if (cur > peak) peak = cur;
    }
    peakConcurrentByBus[bus] = peak;
  }

  const scheduledVoices = newOsc.length + newBuf.length;
  return {
    cue: spec.cue,
    scheduledVoices,
    admittedVoices: scheduledVoices - dropped,
    oscVoices: newOsc.length,
    noiseVoices: newBuf.length,
    envelopeGains: envelopes.length,
    stage3,
    stage4plus,
    defaultAttackVoices,
    minAttackMs: attacks.length > 0 ? Math.min(...attacks) * 1000 : 0,
    maxAttackMs: attacks.length > 0 ? Math.max(...attacks) * 1000 : 0,
    peakSum,
    admittedPeakSum,
    maxPeak,
    saturators: newShapers.length,
    distinctWaves,
    spanSeconds,
    dropped,
    stolen,
    liveVoicesByBus,
    peakConcurrentByBus,
  };
}

describe('HF-542 killstreak audio inventory', () => {
  it('records the scheduled-graph inventory for every probed cue', () => {
    const rows = CUES.map(measureOne);
    mkdirSync('docs/evidence/pass95/killstreak-audio', { recursive: true });
    writeFileSync(
      process.env.KS_INVENTORY_OUT ?? 'docs/evidence/pass95/killstreak-audio/inventory-baseline.json',
      JSON.stringify(rows, null, 2),
    );
    // Structural sanity only: numbers are evidence in the JSON, not pins.
    // Pinning them here would force a test edit on every legitimate fix.
    for (const row of rows) {
      expect(row.scheduledVoices).toBeGreaterThan(0);
      expect(row.envelopeGains).toBe(row.scheduledVoices);
      expect(row.admittedVoices).toBe(row.scheduledVoices - row.dropped);
      expect(Number.isFinite(row.peakSum)).toBe(true);
    }
  });
  it('time-aware occupancy admits delayed pulses while the budget still bites', () => {
    const caps = AUDIO_RUNTIME_BUDGET.perBus as unknown as Record<string, number>;
    // Delayed pulses share one slot across time: zero drops, peak within cap.
    for (const label of ['nukeWarning', 'scoutSweep', 'BURST nuke sequence', 'BURST tri-pass activation']) {
      const row = measureOne(CUES.find((c) => c.cue === label)!);
      expect(row.dropped).toBe(0);
      expect(row.stolen).toBe(0);
      for (const [bus, peak] of Object.entries(row.peakConcurrentByBus)) {
        expect(peak).toBeLessThanOrEqual(caps[bus] ?? Number.MAX_SAFE_INTEGER);
      }
    }
    // Anti-cheat: genuinely simultaneous voices still hit the cap. Three
    // hostile stings at one instant stack 6 announcements voices over a cap
    // of 4, so at least 2 must drop. Without this, "zero drops" would only
    // prove a disabled budget.
    const rig = freshRig();
    const dropBefore = rig.audio.telemetry().runtime.dropped;
    rig.audio.killstreakAnnounce('hostile');
    rig.audio.killstreakAnnounce('hostile');
    rig.audio.killstreakAnnounce('hostile');
    expect(rig.audio.telemetry().runtime.dropped - dropBefore).toBeGreaterThan(0);
    // Advancing time frees windows: a second long cue fired after the first
    // cue's last voice ends drops nothing. Under the old bookkeeping the
    // accumulated (never-released in the fake) voices would drop 6 of 10.
    const rig2 = freshRig();
    const dropBefore2 = rig2.audio.telemetry().runtime.dropped;
    rig2.audio.nukeWarning();
    rig2.context.currentTime += 100;
    rig2.audio.scoutSweep();
    expect(rig2.audio.telemetry().runtime.dropped - dropBefore2).toBe(0);
  });
});
