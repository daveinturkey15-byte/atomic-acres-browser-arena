import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';

class FakeAudioParam {
  value = 0;
  setValueAtTime(value: number): this { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  setTargetAtTime(value: number): this { this.value = value; return this; }
  cancelScheduledValues(): this { return this; }
}

class FakeAudioNode {
  disconnected = false;
  connect<T>(destination: T): T { return destination; }
  disconnect(): void { this.disconnected = true; }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  ended = false;
  stop(): void {
    if (this.ended) return;
    this.ended = true;
    this.onended?.(new Event('ended'));
  }
}

class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  start(): void { /* continuous until ownership teardown */ }
}

class FakeAudioBufferSourceNode extends FakeScheduledSource {
  buffer: { duration: number } | null = null;
  loop = false;
  start(): void { /* bounded effects are irrelevant to this ownership test */ }
}

class FakeGainNode extends FakeAudioNode { readonly gain = new FakeAudioParam(); }
class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
}
class FakeDynamicsCompressorNode extends FakeAudioNode {
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
  readonly sampleRate = 1_000;
  readonly destination = new FakeAudioNode();
  readonly listener = {
    positionX: new FakeAudioParam(), positionY: new FakeAudioParam(), positionZ: new FakeAudioParam(),
    forwardX: new FakeAudioParam(), forwardY: new FakeAudioParam(), forwardZ: new FakeAudioParam(),
    upX: new FakeAudioParam(), upY: new FakeAudioParam(), upZ: new FakeAudioParam(),
  };
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;

  constructor() { FakeAudioContext.instances.push(this); }
  createDynamicsCompressor(): FakeDynamicsCompressorNode { return new FakeDynamicsCompressorNode(); }
  createGain(): FakeGainNode { return new FakeGainNode(); }
  createBiquadFilter(): FakeBiquadFilterNode { return new FakeBiquadFilterNode(); }
  createOscillator(): FakeOscillatorNode {
    const source = new FakeOscillatorNode();
    this.oscillators.push(source);
    return source;
  }
  createBufferSource(): FakeAudioBufferSourceNode {
    const source = new FakeAudioBufferSourceNode();
    this.bufferSources.push(source);
    return source;
  }
  createPanner(): FakePannerNode { return new FakePannerNode(); }
  createBuffer(_channels: number, length: number, sampleRate: number): { duration: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

describe('HF-165 bounded continuous audio ownership', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('uses two protected oscillator beds, never an indefinite white-noise buffer, and cleans every arena switch', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.setArena('atomic-acres');
    audio.unlock();
    const context = FakeAudioContext.instances[0];
    const internals = audio as unknown as {
      arenaSources: FakeScheduledSource[];
      arenaNodes: FakeAudioNode[];
      continuousVoiceOwners: Map<FakeScheduledSource, unknown>;
      activeVoices: Map<FakeScheduledSource, { protectedContinuous: boolean }>;
    };

    expect(audio.telemetry().ambience.continuousSources).toBe(2);
    expect(internals.arenaSources.every((source) => source instanceof FakeOscillatorNode)).toBe(true);
    expect(context.bufferSources.filter((source) => source.loop)).toHaveLength(0);
    expect(internals.continuousVoiceOwners.size).toBe(2);
    expect([...internals.activeVoices.values()].every((voice) => voice.protectedContinuous)).toBe(true);

    const firstSources = [...internals.arenaSources];
    const firstNodes = [...internals.arenaNodes];
    audio.overdriveAvailable();
    audio.setArena('skyline-terminal');
    expect(firstSources.every((source) => source.ended)).toBe(true);
    expect(firstNodes.every((node) => node.disconnected)).toBe(true);
    expect(audio.telemetry().ambience.continuousSources).toBe(2);
    expect(internals.continuousVoiceOwners.size).toBe(2);
    expect([...internals.activeVoices.values()].filter((voice) => voice.protectedContinuous)).toHaveLength(2);

    audio.dispose();
    expect(internals.continuousVoiceOwners.size).toBe(0);
    expect(internals.activeVoices.size).toBe(0);
    expect(context.state).toBe('closed');
  });
});
