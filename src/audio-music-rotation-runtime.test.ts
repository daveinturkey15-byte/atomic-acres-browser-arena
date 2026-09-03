import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';
import {
  CHIPTUNE_TRACKS,
  CHIPTUNE_TRACK_IDS,
  GAME_MUSIC_BUS_GAIN,
  chiptuneBarSeconds,
  chiptuneLoopSeconds,
  createDeterministicRng,
  type ChiptuneTrackId,
} from './chiptune-music';
import { AUDIO_BUS_IDS, type AudioBusId, type AudioSettings } from './pass65-settings';

/**
 * HF-430 RUNTIME evidence for the chiptune rotation (Lane AW).
 *
 * WHY THIS FILE EXISTS, and what was actually wrong without it.
 *
 * `chiptune-music.test.ts` proves the composition data and the PURE scheduler:
 * ten tracks, the duration band, the shuffle property, and that
 * `advanceMultiTrackSchedule()` swaps on a bar boundary. All of that was true
 * and none of it touched the shipped code path. `ArenaAudio.pumpGameMusic()`
 * carried its own second copy of the rotation loop, so every rotation
 * assertion in the suite passed against a function the game never called:
 * deleting the runtime swap entirely left the suite green. That is the same
 * shape as the hardcoded-roster and stale-build gates in this repo's gotcha
 * ledger - a gate that never looked at what ships.
 *
 * So this file drives the REAL object. It stands up `ArenaAudio` on an
 * instrumented AudioContext, starts the music, and advances the audio clock a
 * frame at a time for five minutes of virtual time, reading the properties the
 * owner asked for off the notes and the oscillators the runtime actually
 * committed:
 *
 *   "half the chiptune music sound and have it swap between about 10 different
 *    variations and tracks, each one lasting about 90 seconds and being random
 *    in order"
 *
 * Set LANE_AW_EVIDENCE=1 to have the five-minute case also write its receipt to
 * docs/evidence/pass89/lane-aw/runtime-music-rotation.json.
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
  connect<T>(destination: T): T { this.outputs.push(destination as unknown as FakeAudioNode); return destination; }
  disconnect(): void { /* nothing to unwind in the recorder */ }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  start(): void { /* bounded by stop() */ }
  stop(): void { /* nothing to unwind in the recorder */ }
}

class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  /** Every assignment to `type`, stamped with the clock it happened on. */
  readonly typeHistory: Array<{ type: OscillatorType; atSeconds: number }> = [];
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
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly gains: FakeGainNode[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createDynamicsCompressor(): FakeCompressorNode { return new FakeCompressorNode(); }
  createGain(): FakeGainNode { const node = new FakeGainNode(); this.gains.push(node); return node; }
  createBiquadFilter(): FakeBiquadFilterNode { return new FakeBiquadFilterNode(); }
  createOscillator(): FakeOscillatorNode {
    const context = this;
    const node = new FakeOscillatorNode();
    let waveform: OscillatorType = 'sine';
    // `type` is a plain property on OscillatorNode, not an AudioParam, so the
    // only way to see WHEN the runtime changed a timbre is to trap the setter.
    Object.defineProperty(node, 'type', {
      get: () => waveform,
      set: (next: OscillatorType) => {
        waveform = next;
        node.typeHistory.push({ type: next, atSeconds: context.currentTime });
      },
      enumerable: true,
      configurable: true,
    });
    this.oscillators.push(node);
    return node;
  }
  createBufferSource(): FakeBufferSourceNode { return new FakeBufferSourceNode(); }
  createWaveShaper(): FakeWaveShaperNode { return new FakeWaveShaperNode(); }
  createPanner(): FakePannerNode { return new FakePannerNode(); }
  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, data, getChannelData: () => data };
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

function settingsWith(gains: Partial<Record<AudioBusId, number>>): AudioSettings {
  return Object.freeze({
    schemaVersion: 1,
    gains: Object.freeze(Object.fromEntries(
      AUDIO_BUS_IDS.map((id) => [id, gains[id] ?? 100]),
    ) as Record<AudioBusId, number>),
    mutes: Object.freeze(Object.fromEntries(
      AUDIO_BUS_IDS.map((id) => [id, false]),
    ) as Record<AudioBusId, boolean>),
    gameMusicRetuned: true as const,
  });
}

/**
 * Stands the real ArenaAudio up on the recorder, with the rotation's own RNG
 * pinned so a failure names one sequence rather than a random one.
 */
function startMusic(seed: number): { audio: ArenaAudio; context: FakeAudioContext } {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.spyOn(Math, 'random').mockImplementation(createDeterministicRng(seed));
  const audio = new ArenaAudio();
  audio.unlock();
  audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
  audio.startGameMusic();
  return { audio, context: FakeAudioContext.instances[0]! };
}

type Frame = Readonly<{ atSeconds: number; track: ChiptuneTrackId; lead: OscillatorType; bass: OscillatorType }>;

/**
 * Advances the audio clock at 60 Hz for `seconds`, pumping the scheduler the
 * way the frame loop does, and records what the runtime believed each frame.
 */
function runFrames(audio: ArenaAudio, context: FakeAudioContext, seconds: number): Frame[] {
  const frames: Frame[] = [];
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  const [lead, bass] = context.oscillators.slice(-2);
  for (let index = 0; index < steps; index += 1) {
    context.currentTime += dt;
    audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
    const state = audio.debugMusicState();
    frames.push({
      atSeconds: context.currentTime,
      track: state!.track!,
      lead: lead!.type,
      bass: bass!.type,
    });
  }
  return frames;
}

/** The rotation as the RUNTIME recorded it, with each entry's authored length. */
function rotationFrom(audio: ArenaAudio): Array<{ track: ChiptuneTrackId; atSeconds: number; durationSeconds: number }> {
  return audio.debugMusicState()!.history.map((entry) => ({
    track: entry.track,
    atSeconds: entry.atSeconds,
    durationSeconds: chiptuneLoopSeconds(entry.track),
  }));
}

describe('HF-430 runtime: the shipped ArenaAudio rotates the chiptune roster', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('halves the game-music bus and leaves every other bus where it was', () => {
    const { audio, context } = startMusic(20_260_903);
    audio.configure(settingsWith({}));
    // The bus nodes are the only gains carrying a setTargetAtTime from
    // applyBusSetting; at a 100% slider each one reads its own base gain.
    const busGains = context.gains
      .filter((gain) => gain.gain.calls.some((call) => call.kind === 'target'))
      .map((gain) => Number(gain.gain.value.toFixed(6)));
    expect(busGains).toContain(GAME_MUSIC_BUS_GAIN);
    // SFX is the bus the owner measured the music against; halving the music
    // must not have moved it, and 0.054 must be gone from the graph entirely.
    expect(busGains).toContain(0.78);
    expect(busGains).not.toContain(0.054);
  });

  it('still scales the halved base by the persisted volume slider', () => {
    const { audio, context } = startMusic(20_260_903);
    audio.configure(settingsWith({ 'game-music': 50 }));
    const halfSlider = context.gains.filter((gain) => gain.gain.calls.some(
      (call) => call.kind === 'target' && Math.abs(call.value - GAME_MUSIC_BUS_GAIN * 0.5) < 1e-9,
    ));
    expect(halfSlider.length).toBe(1);

    audio.configure(settingsWith({ 'game-music': 0 }));
    expect(halfSlider[0]!.gain.value).toBe(0);
  });

  it('opens on the authored timbre of the first track, not a default square', () => {
    // The channels used to be built as two squares BEFORE the track was drawn,
    // so a triangle- or sawtooth-led opener played on the wrong oscillator for
    // its whole first ~90 s. Four of the ten tracks are affected.
    for (const seed of [1, 7, 42, 2026, 20_260_903]) {
      const { audio, context } = startMusic(seed);
      const opening = audio.debugMusicState()!.track!;
      const [lead, bass] = context.oscillators.slice(-2);
      expect(lead!.type, `${opening} lead`).toBe(CHIPTUNE_TRACKS[opening].leadWaveform ?? 'square');
      expect(bass!.type, `${opening} bass`).toBe(CHIPTUNE_TRACKS[opening].bassWaveform ?? 'square');
      audio.stopGameMusic();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      FakeAudioContext.instances.length = 0;
    }
  });

  it('plays four ~90 s tracks across five minutes, swapping on exact bar boundaries', () => {
    const { audio, context } = startMusic(20_260_903);
    const frames = runFrames(audio, context, 300);
    const rotation = rotationFrom(audio);

    // Five minutes at ~90 s a track is four entries: the opener plus three swaps.
    expect(rotation.length).toBe(4);
    expect(new Set(rotation.map((entry) => entry.track)).size).toBe(4);

    for (let index = 1; index < rotation.length; index += 1) {
      const previous = rotation[index - 1]!;
      const swapAt = rotation[index]!.atSeconds;
      // The swap lands exactly where the outgoing track ended...
      expect(swapAt - previous.atSeconds).toBeCloseTo(previous.durationSeconds, 6);
      // ...which is a whole number of that track's bars, i.e. on the beat.
      const bars = (swapAt - previous.atSeconds) / chiptuneBarSeconds(previous.track);
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-6);
      // ...and inside the band the owner asked for.
      expect(previous.durationSeconds).toBeGreaterThanOrEqual(85);
      expect(previous.durationSeconds).toBeLessThanOrEqual(95);
    }

    // The frame-by-frame view agrees with the history: the runtime's current
    // track changes exactly three times, and never back to the one it just left.
    const changes = frames.filter((frame, index) => index > 0 && frame.track !== frames[index - 1]!.track);
    expect(changes.length).toBe(3);
    for (let index = 1; index < rotation.length; index += 1) {
      expect(rotation[index]!.track).not.toBe(rotation[index - 1]!.track);
    }

    if (process.env.LANE_AW_EVIDENCE === '1') {
      const path = resolve('docs/evidence/pass89/lane-aw/runtime-music-rotation.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify({
        producedBy: 'vitest run src/audio-music-rotation-runtime.test.ts (LANE_AW_EVIDENCE=1)',
        harness: 'ArenaAudio on an instrumented AudioContext, 18000 frames at 60 Hz',
        seed: 20_260_903,
        gain: { previous: 0.054, halved: GAME_MUSIC_BUS_GAIN, ratio: GAME_MUSIC_BUS_GAIN / 0.054 },
        virtualSeconds: Number(context.currentTime.toFixed(3)),
        frames: frames.length,
        rotation: rotation.map((entry) => ({
          track: entry.track,
          startedAtSeconds: Number(entry.atSeconds.toFixed(4)),
          durationSeconds: Number(entry.durationSeconds.toFixed(4)),
          barSeconds: Number(chiptuneBarSeconds(entry.track).toFixed(4)),
          tempoBpm: CHIPTUNE_TRACKS[entry.track].tempoBpm,
          leadWaveform: CHIPTUNE_TRACKS[entry.track].leadWaveform ?? 'square',
        })),
      }, null, 2)}\n`, 'utf8');
    }
  });

  it('never lets the committed schedule fall behind the clock, so a swap has no gap', () => {
    const { audio, context } = startMusic(4242);
    const dt = 1 / 60;
    let worstLead = Infinity;
    for (let index = 0; index < 60 * 200; index += 1) {
      context.currentTime += dt;
      audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
      // `scheduledAhead` is how far past the clock the notes are already
      // committed. If a boundary ever emptied the window this goes negative,
      // which is a silent hole in the music - the audible failure mode of a
      // rotation that re-seeds its scheduler on a swap.
      worstLead = Math.min(worstLead, audio.debugMusicState()!.scheduledAhead);
    }
    expect(worstLead).toBeGreaterThan(0);
  });

  it('changes the oscillator timbre AT the boundary, never a lookahead early', () => {
    const { audio, context } = startMusic(20_260_903);
    runFrames(audio, context, 300);
    const rotation = rotationFrom(audio);
    const [lead, bass] = context.oscillators.slice(-2);

    for (const osc of [lead!, bass!]) {
      // The opening assignment happens at construction; every later one must
      // belong to a swap and must land at or after that swap's boundary.
      for (const change of osc.typeHistory.slice(1)) {
        const owner = rotation.find((entry) => Math.abs(entry.atSeconds - change.atSeconds) < 0.5);
        expect(owner, `timbre changed at t=${change.atSeconds.toFixed(3)} with no swap near it`).toBeDefined();
        expect(change.atSeconds).toBeGreaterThanOrEqual(owner!.atSeconds);
        // One frame of slack. The old code moved the timbre up to
        // MUSIC_LOOKAHEAD_SECONDS (0.75 s) EARLY, so the outgoing track's last
        // bar played on the incoming track's oscillator.
        expect(change.atSeconds - owner!.atSeconds).toBeLessThanOrEqual(1 / 60 + 1e-9);
      }
    }
  });

  it('plays all ten tracks before repeating any of them, in the runtime', () => {
    const { audio, context } = startMusic(31_337);
    // Ten tracks at ~90 s each; run past a full cycle and into the next.
    runFrames(audio, context, 1_150);
    const played = rotationFrom(audio).map((entry) => entry.track);
    expect(played.length).toBeGreaterThanOrEqual(11);

    const firstCycle = played.slice(0, 10);
    expect(new Set(firstCycle).size).toBe(10);
    for (const id of CHIPTUNE_TRACK_IDS) expect(firstCycle).toContain(id);
    for (let index = 1; index < played.length; index += 1) {
      expect(played[index], `immediate repeat at ${index}`).not.toBe(played[index - 1]);
    }
  });

  it('holds the two-voice budget: exactly one oscillator per channel for the session', () => {
    const { audio, context } = startMusic(9);
    const before = context.oscillators.length;
    runFrames(audio, context, 300);
    // A rotation that rebuilt its graph per track would leak oscillators past
    // AUDIO_RUNTIME_BUDGET.perBus['game-music'] = 2 every 90 seconds.
    expect(context.oscillators.length).toBe(before);
  });
});
