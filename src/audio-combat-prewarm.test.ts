import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';

class FakeAudioParam {
  value = 0;
  cancelCalls = 0;
  targetCalls = 0;
  setValueAtTime(value: number): this { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  setTargetAtTime(value: number): this { this.value = value; this.targetCalls += 1; return this; }
  cancelScheduledValues(): this { this.cancelCalls += 1; return this; }
}

class FakeAudioNode {
  disconnected = false;
  connect<T>(destination: T): T { return destination; }
  disconnect(): void { this.disconnected = true; }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  ended = false;
  startCount = 0;
  start(): void { this.startCount += 1; }
  stop(): void {
    if (this.ended) return;
    this.ended = true;
    this.onended?.(new Event('ended'));
  }
}

class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeScheduledSource {
  buffer: { duration: number } | null = null;
  loop = false;
}

class FakeGainNode extends FakeAudioNode { readonly gain = new FakeAudioParam(); }
class FakeFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
}
class FakeCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam();
  readonly knee = new FakeAudioParam();
  readonly ratio = new FakeAudioParam();
  readonly attack = new FakeAudioParam();
  readonly release = new FakeAudioParam();
}

class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];
  readonly sampleRate = 1_000;
  readonly destination = new FakeAudioNode();
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeFilterNode[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;

  constructor() { FakeAudioContext.instances.push(this); }
  createDynamicsCompressor(): FakeCompressorNode { return new FakeCompressorNode(); }
  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter(): FakeFilterNode {
    const node = new FakeFilterNode();
    this.filters.push(node);
    return node;
  }
  createOscillator(): FakeOscillatorNode {
    const source = new FakeOscillatorNode();
    this.oscillators.push(source);
    return source;
  }
  createBufferSource(): FakeBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.bufferSources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): { duration: number; getChannelData: () => Float32Array } {
    return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) };
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

describe('HF-280/HF-282 pre-owned combat audio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('prepares a tonal muted graph once and makes first damage/low-health entry allocation-free', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const preparedFactories = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };

    expect(preparedFactories).toEqual({ oscillators: 3, bufferSources: 0, gains: 11, filters: 2 });
    expect(context.oscillators.every((source) => source.startCount === 1 && !source.ended)).toBe(true);
    expect(audio.telemetry()).toMatchObject({
      combatPrewarm: { prepared: true, runs: 1, sources: 3, nodes: 5, broadbandLoopSources: 0 },
      lowHealth: { prepared: true, sources: 2, active: false, broadbandSources: 0 },
      damageFeedback: { prepared: true, sources: 1, pulses: 0 },
      runtime: { voices: 3 },
    });

    audio.damage();
    audio.setLowHealthFeedback({
      active: true, severity: 0.8, vignetteOpacity: 0.2,
      breathingGain: 0.07, heartbeatGain: 0.05, pulseHz: 0.72,
    });
    for (let repeat = 0; repeat < 120; repeat += 1) {
      audio.setLowHealthFeedback({
        active: true, severity: 0.8, vignetteOpacity: 0.2,
        breathingGain: 0.07, heartbeatGain: 0.05, pulseHz: 0.72,
      });
    }
    audio.damage();
    expect({
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    }).toEqual(preparedFactories);
    expect(audio.prepareCombat()).toBe(true);
    expect(audio.telemetry()).toMatchObject({
      combatPrewarm: { prepared: true, runs: 1, sources: 3 },
      lowHealth: { active: true, audible: true, automationWrites: 2, broadbandSources: 0 },
      damageFeedback: { pulses: 2 },
    });

    audio.setLowHealthFeedback({
      active: true, severity: 0.8, vignetteOpacity: 0.055,
      breathingGain: 0, heartbeatGain: 0, pulseHz: 0,
    });
    expect(audio.telemetry()).toMatchObject({
      lowHealth: { active: true, audible: false, automationWrites: 4 },
      runtime: { voices: 3 },
    });
    audio.setLowHealthFeedback({
      active: false, severity: 0, vignetteOpacity: 0,
      breathingGain: 0, heartbeatGain: 0, pulseHz: 0,
    });
    expect(audio.telemetry().lowHealth).toMatchObject({ active: false, audible: false, automationWrites: 4 });
    expect(context.oscillators.every((source) => !source.ended)).toBe(true);

    audio.dispose();
    expect(context.oscillators.every((source) => source.ended && source.disconnected)).toBe(true);
    expect(context.state).toBe('closed');
    expect(audio.telemetry()).toMatchObject({
      combatPrewarm: { prepared: false, sources: 0 },
      lowHealth: { prepared: false, active: false },
      damageFeedback: { prepared: false, sources: 0 },
      runtime: { voices: 0 },
    });
  });

  it.each([1, 2, 3])('fully tears down partial graphs when combat source %i cannot register', (failedSource) => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    const internals = audio as unknown as {
      registerContinuousVoice: (...args: unknown[]) => boolean;
      activeVoices: Map<unknown, unknown>;
      continuousVoiceOwners: Map<unknown, unknown>;
    };
    const originalRegister = internals.registerContinuousVoice.bind(audio);
    let registrations = 0;
    internals.registerContinuousVoice = (...args: unknown[]) => {
      registrations += 1;
      return registrations === failedSource ? false : originalRegister(...args);
    };

    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    expect(context.oscillators).toHaveLength(failedSource);
    expect(context.oscillators.every((source) => source.ended && source.disconnected)).toBe(true);
    expect(context.filters.every((node) => node.disconnected)).toBe(true);
    expect(context.gains.slice(8).every((node) => node.disconnected)).toBe(true);
    expect(internals.activeVoices.size).toBe(0);
    expect(internals.continuousVoiceOwners.size).toBe(0);
    expect(audio.telemetry()).toMatchObject({
      combatPrewarm: { prepared: false, runs: 1, sources: 0, nodes: 0 },
      lowHealth: { prepared: false, sources: 0, active: false, audible: false },
      damageFeedback: { prepared: false, sources: 0 },
    });
    audio.dispose();
    expect(context.state).toBe('closed');
  });
});
