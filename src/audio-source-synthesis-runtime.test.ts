import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';
import { NOISE_TEXTURES } from './audio-synthesis';

/**
 * HF-376 runtime evidence for the re-authored source synthesis.
 *
 * audio-synthesis.test.ts proves the DSP primitives are correct in isolation.
 * This file proves the RUNTIME actually reaches for them: that a report is
 * layered out of the right textures with a real attack, that a blast carries
 * low-frequency weight, that two surfaces sound like two surfaces, and that
 * two consecutive shots are not the same shot twice.
 *
 * The instrumentation records automation calls rather than rendering audio,
 * because the properties that make these sounds good - an onset that is a ramp
 * and not a step, a pitch fall with a knee in it, a texture chosen per layer -
 * are all visible in the schedule.
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
  state: AudioContextState = 'running';
  currentTime = 0;

  constructor() { FakeAudioContext.instances.push(this); }
  createDynamicsCompressor(): FakeCompressorNode { return new FakeCompressorNode(); }
  createGain(): FakeGainNode { const node = new FakeGainNode(); this.gains.push(node); return node; }
  createBiquadFilter(): FakeBiquadFilterNode { const node = new FakeBiquadFilterNode(); this.filters.push(node); return node; }
  createOscillator(): FakeOscillatorNode { const node = new FakeOscillatorNode(); this.oscillators.push(node); return node; }
  createBufferSource(): FakeBufferSourceNode { const node = new FakeBufferSourceNode(); this.bufferSources.push(node); return node; }
  createWaveShaper(): FakeWaveShaperNode { const node = new FakeWaveShaperNode(); this.shapers.push(node); return node; }
  createPanner(): FakePannerNode { return new FakePannerNode(); }
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

function startAudio(): { audio: ArenaAudio; context: FakeAudioContext } {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const audio = new ArenaAudio();
  audio.unlock();
  audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
  return { audio, context: FakeAudioContext.instances[0]! };
}

/** Mean absolute first difference: high for bright textures, low for dark ones. */
function roughness(data: Float32Array): number {
  if (data.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < data.length; index += 1) total += Math.abs(data[index]! - data[index - 1]!);
  return total / (data.length - 1);
}

describe('HF-376 runtime source synthesis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('generates one distinct noise texture per character at unlock', () => {
    const { context } = startAudio();
    expect(context.buffers).toHaveLength(NOISE_TEXTURES.length);
    // Creation order is white, then the rest of NOISE_TEXTURES. The ordering
    // assertion below is what licenses the by-index lookups in the tests that
    // follow: it fails loudly if the palette is ever reordered.
    const [white, pink, brown, crackle] = context.buffers;
    expect(roughness(brown!.data)).toBeLessThan(roughness(pink!.data));
    expect(roughness(pink!.data)).toBeLessThan(roughness(white!.data));
    // Crackle is mostly silence between grains; nothing else in the palette is.
    const nearSilent = (data: Float32Array): number => data.reduce(
      (count, value) => count + (Math.abs(value) < 0.02 ? 1 : 0), 0,
    ) / data.length;
    expect(nearSilent(crackle!.data)).toBeGreaterThan(0.5);
    expect(nearSilent(white!.data)).toBeLessThan(0.1);
  });

  it('gives every scheduled voice a ramped onset instead of a step, and a held body', () => {
    const { audio, context } = startAudio();
    const before = context.gains.length;
    audio.shot('m4a1', false, 0);
    const reportGains = context.gains.slice(before).filter((gain) => gain.gain.calls.length > 0);
    expect(reportGains.length).toBeGreaterThan(4);
    for (const gain of reportGains) {
      const [first, second, ...rest] = gain.gain.calls;
      // A step onset is a DC discontinuity, heard as a click ON TOP of the
      // sound. Every voice must open with a set-to-floor then a linear ramp.
      expect(first!.kind).toBe('set');
      expect(second!.kind).toBe('linear');
      expect(second!.at).toBeGreaterThan(first!.at);
      expect(second!.value).toBeGreaterThan(first!.value);
      // ...and then fall exponentially, in at least one stage.
      expect(rest.length).toBeGreaterThan(0);
      expect(rest.every((call) => call.kind === 'exponential')).toBe(true);
    }
    // The layered ones collapse to a held body first and only then decay,
    // which is the three-region shape a beep does not have.
    expect(reportGains.some((gain) => gain.gain.calls.filter((call) => call.kind === 'exponential').length >= 2)).toBe(true);
  });

  it('drops a report body with a knee rather than one straight glide', () => {
    const { audio, context } = startAudio();
    const before = context.oscillators.length;
    audio.shot('ak-47', false, 0);
    const body = context.oscillators[before]!;
    const ramps = body.frequency.calls.filter((call) => call.kind === 'exponential');
    expect(body.type).toBe('sawtooth');
    // Two ramps: the knee and the endpoint. One ramp is the old glide.
    expect(ramps).toHaveLength(2);
    const [knee, end] = ramps;
    expect(knee!.value).toBeGreaterThan(end!.value);
    // Front-loaded: the knee is early in time but already most of the way down
    // in log-frequency.
    const start = body.frequency.calls[0]!.value;
    expect(knee!.at - body.frequency.calls[0]!.at).toBeLessThan((end!.at - body.frequency.calls[0]!.at) * 0.3);
    expect(Math.log(start / knee!.value)).toBeGreaterThan(Math.log(start / end!.value) * 0.5);
  });

  it('never fires the same report twice in a row', () => {
    const { audio, context } = startAudio();
    const first = context.oscillators.length;
    audio.shot('smg', false, 0);
    const second = context.oscillators.length;
    audio.shot('smg', false, 0);
    // Same weapon, same distance, different voice: the round-robin detune is
    // what stops automatic fire reading as one looped sample.
    expect(context.oscillators[second]!.frequency.calls[0]!.value)
      .not.toBe(context.oscillators[first]!.frequency.calls[0]!.value);
  });

  it('saturates the report body so it is loud rather than merely turned up', () => {
    const { audio, context } = startAudio();
    const before = context.shapers.length;
    audio.shot('lmg', false, 0);
    const shapers = context.shapers.slice(before);
    expect(shapers.length).toBeGreaterThan(0);
    for (const shaper of shapers) {
      const curve = shaper.curve!;
      expect(curve.length).toBeGreaterThan(64);
      for (let index = 1; index < curve.length; index += 1) {
        expect(curve[index]! >= curve[index - 1]!).toBe(true);
      }
      expect(Math.abs(curve[curve.length - 1]!)).toBeLessThanOrEqual(1);
    }
    // Curves are cached per drive, so a second shot must not allocate more.
    const afterFirst = context.shapers.length;
    audio.shot('lmg', false, 0);
    expect(context.shapers.length - afterFirst).toBe(shapers.length);
  });

  it('builds a blast out of low-frequency weight and impulsive debris', () => {
    const { audio, context } = startAudio();
    const brown = context.buffers[2]!;
    const crackle = context.buffers[3]!;
    const before = context.bufferSources.length;
    expect(audio.explosion(1_000)).toBe(true);
    const layers = context.bufferSources.slice(before);
    // The body draws the darkest texture in the palette and the debris draws
    // the impulsive one. Neither could come from the single shared white
    // buffer the blast used to be built from.
    expect(layers.map((source) => source.buffer)).toEqual([brown, crackle]);
    const oscillators = context.oscillators.slice(-2);
    expect(oscillators.map(({ type }) => type)).toEqual(['sawtooth', 'sine']);
    // The sub outlives the pressure body - that is what makes a blast felt.
    const bodyEnd = oscillators[0]!.frequency.calls.at(-1)!.at;
    const subEnd = oscillators[1]!.frequency.calls.at(-1)!.at;
    expect(subEnd).toBeGreaterThan(bodyEnd);
  });

  it('separates impact materials by texture, resonance and whether they ring', () => {
    const { audio, context } = startAudio();
    const textureOf = (source: FakeBufferSourceNode): number => context.buffers.indexOf(source.buffer!);

    const beforeMetal = { sources: context.bufferSources.length, oscillators: context.oscillators.length };
    audio.impact('metal', 0);
    const metalSources = context.bufferSources.slice(beforeMetal.sources);
    const metalOscillators = context.oscillators.length - beforeMetal.oscillators;

    const beforeSoil = { sources: context.bufferSources.length, oscillators: context.oscillators.length };
    audio.impact('soil', 0);
    const soilSources = context.bufferSources.slice(beforeSoil.sources);
    const soilOscillators = context.oscillators.length - beforeSoil.oscillators;

    // Different grain: steel is struck (white), earth absorbs (brown).
    expect(textureOf(metalSources[0]!)).not.toBe(textureOf(soilSources[0]!));
    // Steel rings on a second inharmonic partial; earth does not ring at all.
    expect(metalOscillators).toBe(soilOscillators + 1);
    // Both throw debris, and both do it with the impulsive texture.
    expect(textureOf(metalSources.at(-1)!)).toBe(3);
    expect(textureOf(soilSources.at(-1)!)).toBe(3);
  });

  it('separates footstep surfaces by texture and by the resonance they excite', () => {
    const { audio, context } = startAudio();
    const beforeMetal = context.filters.length;
    audio.footstep('metal', false, false);
    const metalPeaks = context.filters.slice(beforeMetal).filter((filter) => filter.type === 'peaking');

    const beforeGrass = context.filters.length;
    audio.footstep('grass', false, false);
    const grassPeaks = context.filters.slice(beforeGrass).filter((filter) => filter.type === 'peaking');

    expect(metalPeaks.length).toBeGreaterThan(0);
    expect(grassPeaks.length).toBeGreaterThan(0);
    // Steel deck rings high and tight; grass barely resonates at all. This is
    // the cue a player uses to tell what an enemy they cannot see is standing
    // on, and the old single band-pass could not carry it.
    expect(metalPeaks[0]!.frequency.value).toBeGreaterThan(grassPeaks[0]!.frequency.value * 4);
    expect(metalPeaks[0]!.Q.value).toBeGreaterThan(grassPeaks[0]!.Q.value * 3);
  });

  it('sprinting adds gear rattle that walking and crouching do not', () => {
    const { audio, context } = startAudio();
    const beforeWalk = context.bufferSources.length;
    audio.footstep('concrete', false, false);
    const walkLayers = context.bufferSources.length - beforeWalk;
    const beforeSprint = context.bufferSources.length;
    audio.footstep('concrete', true, false);
    expect(context.bufferSources.length - beforeSprint).toBe(walkLayers + 1);
  });

  it('gives a remote footstep the same heel-then-settle shape as a local one', () => {
    const { audio, context } = startAudio();
    const before = context.gains.length;
    expect(audio.worldFootstep({ x: 4, y: 0, z: -3 }, 'wood', 'walk')).toBe(true);
    const chainGain = context.gains.slice(before)[0]!;
    const scheduled = chainGain.gain.calls.filter((call) => call.kind !== 'cancel');
    expect(scheduled[0]!.kind).toBe('set');
    expect(scheduled[1]!.kind).toBe('linear');
    expect(scheduled.filter((call) => call.kind === 'exponential').length).toBeGreaterThanOrEqual(2);
  });

  it('builds mechanical weapon handling out of metal contacts, not tones', () => {
    const { audio, context } = startAudio();
    const before = { sources: context.bufferSources.length, filters: context.filters.length };
    audio.weaponAction('m4a1', 'bolt-release');
    const sources = context.bufferSources.slice(before.sources);
    const filters = context.filters.slice(before.filters);
    // A bolt going forward is a struck part: impulsive grains through a tight
    // inharmonic peak, plus the recoil-spring ring.
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.some((source) => context.buffers.indexOf(source.buffer!) === 3)).toBe(true);
    const peaks = filters.filter((filter) => filter.type === 'peaking');
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks[0]!.Q.value).toBeGreaterThan(4);
  });

  it('makes a hull creak stick and slip rather than swell smoothly', () => {
    // 0.2 selects hs.hull-creak from the High Seas weight table and fixes the
    // gap and bearing, so this exercises one named event rather than whichever
    // one the sparse scheduler happened to pick.
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const { audio, context } = startAudio();
    audio.setArena('high-seas');
    const before = { gains: context.gains.length, oscillators: context.oscillators.length };
    for (let attempt = 0; attempt < 60 && context.gains.length === before.gains; attempt += 1) {
      context.currentTime += 1;
      audio.updateArenaAmbience();
    }
    expect(context.gains.length).toBe(before.gains + 1);

    const envelope = context.gains[before.gains]!.gain.calls.filter((call) => call.kind !== 'cancel');
    // Stick-slip: many stages, and - the actual defining property - the level
    // goes back UP between stages. A smooth swell can only ever go down after
    // its peak, which is why the old two-ramp envelope could not creak.
    expect(envelope.length).toBeGreaterThan(6);
    const rises = envelope.slice(2).filter((call, index) => call.value > envelope[index + 1]!.value);
    expect(rises.length).toBeGreaterThan(1);

    // A creak is tonal here, so it also gets a moving formant rather than the
    // bare sine it used to be.
    const oscillator = context.oscillators[before.oscillators]!;
    expect(oscillator.type).toBe('triangle');
    expect(oscillator.frequency.calls.filter((call) => call.kind === 'exponential').length).toBeGreaterThan(4);
    expect(context.filters.some((filter) => filter.type === 'bandpass')).toBe(true);
  });

  it('re-voices damage taken as a front-loaded body blow, not a linear beep', () => {
    const { audio, context } = startAudio();
    // unlock() prepares combat: breath, heartbeat, damage - the third voice.
    const voice = context.oscillators[2]!;
    // The damage voice chain is oscillator -> bandpass(520 Hz, Q 1.2) -> gain.
    const damageFilter = context.filters.find((filter) => filter.type === 'bandpass'
      && filter.frequency.value === 520 && filter.Q.value === 1.2)!;
    expect(damageFilter).toBeDefined();
    audio.damage();
    // Pitch: endpoints preserved (180 -> 72 Hz) but through a front-loaded
    // knee, not one exponential glide across the whole 140 ms.
    const pitch = voice.frequency.calls.filter((call) => call.kind !== 'cancel');
    expect(pitch[0]!.kind).toBe('set');
    expect(pitch[0]!.value).toBe(180);
    const pitchRamps = pitch.filter((call) => call.kind === 'exponential');
    expect(pitchRamps).toHaveLength(2);
    const [knee, endpoint] = pitchRamps;
    expect(endpoint!.value).toBe(72);
    expect(knee!.at).toBeLessThan(endpoint!.at);
    expect(Math.log(pitch[0]!.value / knee!.value))
      .toBeGreaterThan(Math.log(pitch[0]!.value / endpoint!.value) * 0.5);
    // Amplitude: set-to-floor, ramped attack, then ONLY exponentials - the
    // old shape was two straight linear ramps, which read as a soft tone.
    const damageGain = (damageFilter.outputs[0] as FakeGainNode).gain;
    const envelope = damageGain.calls.filter((call) => call.kind !== 'cancel');
    expect(envelope[0]!.kind).toBe('set');
    expect(envelope[1]!.kind).toBe('linear');
    expect(envelope[1]!.value).toBeGreaterThan(envelope[0]!.value);
    expect(envelope.slice(2).every((call) => call.kind === 'exponential')).toBe(true);
    // Three regions: the held body (the collapse target) sits above the
    // silence floor the voice finally decays to.
    expect(envelope.length).toBeGreaterThanOrEqual(4);
    expect(envelope[2]!.value).toBeGreaterThan(envelope.at(-1)!.value);
  });

  it('re-voices the crossbow fuse beep with a snap attack and a pitch knee, not one glide', () => {
    const { audio, context } = startAudio();
    const before = { oscillators: context.oscillators.length, gains: context.gains.length };
    expect(audio.crossbowFuseBeep({ x: 3, y: 1, z: -2 }, 900)).toBe(true);
    const oscillator = context.oscillators[before.oscillators]!;
    expect(oscillator.type).toBe('square');
    // Urgency mapping preserved exactly: remainingMs=900 -> urgency 0.28.
    const urgency = 1 - 900 / 1250;
    const pitch = oscillator.frequency.calls;
    expect(pitch[0]!.kind).toBe('set');
    expect(pitch[0]!.value).toBeCloseTo(860 + urgency * 720, 5);
    const ramps = pitch.filter((call) => call.kind === 'exponential');
    expect(ramps).toHaveLength(2);
    const [knee, endpoint] = ramps;
    expect(endpoint!.value).toBeCloseTo(760 + urgency * 820, 5);
    expect(knee!.at).toBeLessThan(endpoint!.at);
    expect(Math.log(pitch[0]!.value / knee!.value))
      .toBeGreaterThan(Math.log(pitch[0]!.value / endpoint!.value) * 0.5);
    // Amplitude: the old graph was a 4 ms exponential attack into ONE
    // exponential decay. Now: set, ramped attack, held body, then decay.
    const gain = context.gains[before.gains]!;
    const envelope = gain.gain.calls.filter((call) => call.kind !== 'cancel');
    expect(envelope[0]!.kind).toBe('set');
    expect(envelope[1]!.kind).toBe('linear');
    expect(envelope[1]!.value).toBeGreaterThan(envelope[0]!.value);
    expect(envelope.slice(2).every((call) => call.kind === 'exponential')).toBe(true);
    expect(envelope.length).toBe(4);
    expect(envelope[2]!.value).toBeGreaterThan(envelope.at(-1)!.value);
  });
  it('re-voices the scout sweep pings with a pitch knee, a held body and per-pulse variation', () => {
    const { audio, context } = startAudio();
    const before = { oscillators: context.oscillators.length, gains: context.gains.length };
    audio.scoutSweep();
    // Five rising sensor pings plus five fixed confirmation blips - one voice
    // per pulse now, not one shared oscillator whose overlapping cues fought
    // over the same automation timeline.
    const pings = context.oscillators.slice(before.oscillators, before.oscillators + 5);
    expect(pings.map(({ type }) => type)).toEqual(Array.from({ length: 5 }, () => 'triangle'));
    const pingGains = context.gains.slice(before.gains, before.gains + 5);
    for (const [index, gain] of pingGains.entries()) {
      const envelope = gain.gain.calls.filter((call) => call.kind !== 'cancel');
      // Amplitude: set-to-floor, ramped attack, held body, decay - NOT the
      // old exp-attack straight into ONE exp decay (a beep).
      expect(envelope[0]!.kind).toBe('set');
      expect(envelope[1]!.kind).toBe('linear');
      expect(envelope[1]!.value).toBeGreaterThan(envelope[0]!.value);
      expect(envelope.slice(2).every((call) => call.kind === 'exponential')).toBe(true);
      expect(envelope.length).toBeGreaterThanOrEqual(4);
      expect(envelope[2]!.value).toBeGreaterThan(envelope.at(-1)!.value);
      // Pitch: the 420 -> 1080 Hz rise keeps its endpoints but goes through a
      // front-loaded knee; one glide is the old shape.
      const voice = pings[index]!;
      const pitch = voice.frequency.calls.filter((call) => call.kind !== 'cancel');
      const start = pitch[0]!.value;
      const ramps = pitch.filter((call) => call.kind === 'exponential');
      expect(ramps).toHaveLength(2);
      const [knee, endpoint] = ramps;
      expect(knee!.at).toBeLessThan(endpoint!.at);
      // Front-loaded regardless of direction: most of the log interval is
      // spent before the knee.
      expect(Math.abs(Math.log(start / knee!.value)))
        .toBeGreaterThan(Math.abs(Math.log(start / endpoint!.value)) * 0.5);
    }
    // Round-robin detune: five identical pulses in a row read as a looped
    // sample, which is the loudest "this is a synth" tell there is.
    const onsets = pings.map((voice) => voice.frequency.calls[0]!.value);
    expect(new Set(onsets).size).toBe(5);
  });

  it('re-voices the nuke warning siren with held bodies and a pitch knee instead of one glide per pulse', () => {
    const { audio, context } = startAudio();
    const before = { oscillators: context.oscillators.length, gains: context.gains.length };
    audio.nukeWarning();
    // Five sawtooth alarm pulses, five square confirmation blips and the low
    // ambience pressure rise behind them.
    const pulses = context.oscillators.slice(before.oscillators, before.oscillators + 5);
    expect(pulses.map(({ type }) => type)).toEqual(Array.from({ length: 5 }, () => 'sawtooth'));
    const pulseGains = context.gains.slice(before.gains, before.gains + 5);
    for (const [index, gain] of pulseGains.entries()) {
      const envelope = gain.gain.calls.filter((call) => call.kind !== 'cancel');
      expect(envelope[0]!.kind).toBe('set');
      expect(envelope[1]!.kind).toBe('linear');
      expect(envelope.slice(2).every((call) => call.kind === 'exponential')).toBe(true);
      expect(envelope.length).toBeGreaterThanOrEqual(4);
      expect(envelope[2]!.value).toBeGreaterThan(envelope.at(-1)!.value);
      // Each alarm pulse falls through a knee; endpoints preserved.
      const voice = pulses[index]!;
      const pitch = voice.frequency.calls.filter((call) => call.kind !== 'cancel');
      const start = pitch[0]!.value;
      const ramps = pitch.filter((call) => call.kind === 'exponential');
      expect(ramps).toHaveLength(2);
      const [knee, endpoint] = ramps;
      expect(endpoint!.value).toBeLessThan(start);
      expect(Math.log(start / knee!.value)).toBeGreaterThan(Math.log(start / endpoint!.value) * 0.5);
    }
    const onsets = pulses.map((voice) => voice.frequency.calls[0]!.value);
    expect(new Set(onsets).size).toBe(5);
  });
 });
