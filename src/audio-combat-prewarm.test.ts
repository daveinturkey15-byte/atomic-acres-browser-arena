import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';

let audioConnectCalls = 0;
let failAudioConnectAt = Number.POSITIVE_INFINITY;
let audioStartCalls = 0;
let failAudioStartAt = Number.POSITIVE_INFINITY;

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
  connect<T>(destination: T): T {
    audioConnectCalls += 1;
    if (audioConnectCalls === failAudioConnectAt) throw new Error('synthetic-connect-failure');
    return destination;
  }
  disconnect(): void { this.disconnected = true; }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  ended = false;
  startCount = 0;
  start(): void {
    audioStartCalls += 1;
    if (audioStartCalls === failAudioStartAt) throw new Error('synthetic-start-failure');
    this.startCount += 1;
  }
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
    audioConnectCalls = 0;
    failAudioConnectAt = Number.POSITIVE_INFINITY;
    audioStartCalls = 0;
    failAudioStartAt = Number.POSITIVE_INFINITY;
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

  it('prewarms the exact glass impact graph once at zero gain without retaining broadband loops', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const before = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    expect(audio.prepareGlassImpact()).toBe(true);
    expect({
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    }).toEqual({
      oscillators: before.oscillators + 1,
      bufferSources: before.bufferSources + 1,
      gains: before.gains + 2,
      filters: before.filters + 1,
    });
    expect(context.gains.slice(-2).every((gain) => gain.gain.value === 0)).toBe(true);
    expect(context.bufferSources.at(-1)).toMatchObject({ loop: false, startCount: 1 });
    expect(audio.telemetry().glassImpactPrewarm).toEqual({
      prepared: true,
      runs: 1,
      retainedBroadbandLoops: 0,
    });
    const afterFirst = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    expect(audio.prepareGlassImpact()).toBe(true);
    expect({
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    }).toEqual(afterFirst);
    audio.dispose();
    expect(audio.telemetry().glassImpactPrewarm).toMatchObject({ prepared: false, runs: 1 });
  });

  it('silently warms grenade factories while preserving the exact live bounce, fuse and broadband blast recipe', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const beforeWarmup = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    expect(audio.prepareGrenadeEffects()).toBe(true);
    const preparedFactories = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    // HF-376 re-pinned this budget when the grenade mix was re-authored. The
    // guarantees the assertion exists for are unchanged and still exact: the
    // warmup allocates a known set of nodes, it covers every node class the
    // live path will later use, every warmed gain is silent, and a second live
    // grenade allocates exactly as much as the first (the no-growth check
    // further down). Only the authored recipe behind the numbers moved.
    //
    // Four broadband warm entries instead of two, because the live path gained
    // the `bandpass` of the metallic bounce contact and the `peaking` resonance
    // under the blast body.
    expect(preparedFactories).toEqual({
      oscillators: beforeWarmup.oscillators + 5,
      bufferSources: beforeWarmup.bufferSources + 4,
      gains: beforeWarmup.gains + 9,
      filters: beforeWarmup.filters + 4,
    });
    expect(context.oscillators.slice(-5).map(({ type }) => type)).toEqual([
      'triangle', 'square', 'square', 'sine', 'sawtooth',
    ]);
    expect(context.filters.slice(-4).map(({ type }) => type)).toEqual([
      'lowpass', 'peaking', 'bandpass', 'highpass',
    ]);
    expect(context.gains.slice(-9).every((gain) => gain.gain.value === 0)).toBe(true);
    expect(audio.telemetry().grenadeEffectsPrewarm).toEqual({
      prepared: true,
      runs: 1,
      warmupSources: 9,
      warmupNodes: 13,
      retainedSources: 0,
      retainedBroadbandLoops: 0,
      liveRecipe: 'layered-blast-brown-body-sub-and-crackle-debris-v2',
    });

    const exerciseGrenadeAudio = (now: number) => {
      const before = {
        oscillators: context.oscillators.length,
        bufferSources: context.bufferSources.length,
        gains: context.gains.length,
        filters: context.filters.length,
      };
      audio.grenadeBounce(8);
      expect(audio.grenadeFuseBeep(900, now)).toBe(true);
      expect(audio.explosion(now + 100)).toBe(true);
      const after = {
        oscillators: context.oscillators.length,
        bufferSources: context.bufferSources.length,
        gains: context.gains.length,
        filters: context.filters.length,
      };
      // HF-376 re-pinned. Same guarantee, re-authored mix: a bounce is now a
      // metallic contact (crackle burst through a bandpass and an inharmonic
      // peaking resonance, plus its tone) and a blast is a saturated pressure
      // body, a sine sub, a brown broadband layer with a resonance stage, and
      // crackle debris. The numbers below are that mix counted exactly, and
      // the second invocation must still allocate identically - which is the
      // property this test actually protects.
      expect(after).toEqual({
        oscillators: before.oscillators + 6,
        bufferSources: before.bufferSources + 3,
        gains: before.gains + 9,
        filters: before.filters + 5,
      });
      expect(context.oscillators.slice(-6).map(({ type }) => type)).toEqual([
        'square', 'square', 'square', 'sine', 'sawtooth', 'sine',
      ]);
      expect(context.filters.slice(-3).map(({ type }) => type)).toEqual(['lowpass', 'peaking', 'highpass']);
      return after;
    };
    const afterFirst = exerciseGrenadeAudio(1_000);
    const afterSecond = exerciseGrenadeAudio(2_000);
    expect({
      oscillators: afterSecond.oscillators - afterFirst.oscillators,
      bufferSources: afterSecond.bufferSources - afterFirst.bufferSources,
      gains: afterSecond.gains - afterFirst.gains,
      filters: afterSecond.filters - afterFirst.filters,
    }).toEqual({ oscillators: 6, bufferSources: 3, gains: 9, filters: 5 });
    expect(audio.prepareGrenadeEffects()).toBe(true);
    expect(audio.telemetry().grenadeEffectsPrewarm).toMatchObject({
      runs: 1,
      warmupSources: 9,
      retainedSources: 0,
      liveRecipe: 'layered-blast-brown-body-sub-and-crackle-debris-v2',
    });

    audio.dispose();
    expect(audio.telemetry().grenadeEffectsPrewarm).toMatchObject({ prepared: false, warmupSources: 0, warmupNodes: 0 });
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

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'fully tears down a partial graph when combat connection %i throws',
    (failedConnection) => {
      vi.stubGlobal('AudioContext', FakeAudioContext);
      const audio = new ArenaAudio();
      const originalPrepareCombat = audio.prepareCombat.bind(audio);
      audio.prepareCombat = () => false;
      audio.unlock();
      const context = FakeAudioContext.instances[0]!;
      const baseConnectCalls = audioConnectCalls;
      const baseGainCount = context.gains.length;
      audio.prepareCombat = originalPrepareCombat;
      failAudioConnectAt = baseConnectCalls + failedConnection;

      expect(audio.prepareCombat()).toBe(false);
      const internals = audio as unknown as {
        activeVoices: Map<unknown, unknown>;
        continuousVoiceOwners: Map<unknown, unknown>;
      };
      expect(context.oscillators.every((source) => source.ended && source.disconnected)).toBe(true);
      expect(context.filters.every((node) => node.disconnected)).toBe(true);
      expect(context.gains.slice(baseGainCount).every((node) => node.disconnected)).toBe(true);
      expect(internals.activeVoices.size).toBe(0);
      expect(internals.continuousVoiceOwners.size).toBe(0);
      expect(audio.telemetry().combatPrewarm).toMatchObject({ prepared: false, sources: 0, nodes: 0 });
      audio.dispose();
      expect(context.state).toBe('closed');
    },
  );

  it.each([1, 2, 3])('fully releases voice ownership when combat source %i start throws', (failedSource) => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    const originalPrepareCombat = audio.prepareCombat.bind(audio);
    audio.prepareCombat = () => false;
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const baseStartCalls = audioStartCalls;
    const baseGainCount = context.gains.length;
    audio.prepareCombat = originalPrepareCombat;
    failAudioStartAt = baseStartCalls + failedSource;

    expect(audio.prepareCombat()).toBe(false);
    const internals = audio as unknown as {
      activeVoices: Map<unknown, unknown>;
      continuousVoiceOwners: Map<unknown, unknown>;
    };
    expect(context.oscillators).toHaveLength(failedSource);
    expect(context.oscillators.every((source) => source.ended && source.disconnected)).toBe(true);
    expect(context.filters.every((node) => node.disconnected)).toBe(true);
    expect(context.gains.slice(baseGainCount).every((node) => node.disconnected)).toBe(true);
    expect(internals.activeVoices.size).toBe(0);
    expect(internals.continuousVoiceOwners.size).toBe(0);
    expect(audio.telemetry().combatPrewarm).toMatchObject({ prepared: false, sources: 0, nodes: 0 });
    audio.dispose();
    expect(context.state).toBe('closed');
  });

  // HF-332: Interactive destruction and collapse debris audio prewarm
  it('silently warms destruction/debris impact filters and sweeps at zero gain without retaining loops', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const beforeWarmup = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    expect(audio.prepareDestructionEffects()).toBe(true);
    const preparedFactories = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    expect(preparedFactories).toEqual({
      oscillators: beforeWarmup.oscillators + 4,
      bufferSources: beforeWarmup.bufferSources + 3,
      gains: beforeWarmup.gains + 7,
      filters: beforeWarmup.filters + 3,
    });
    expect(context.oscillators.slice(-4).map(({ type }) => type)).toEqual([
      'square', 'triangle', 'triangle', 'triangle',
    ]);
    expect(context.filters.slice(-3).map(({ type }) => type)).toEqual(['bandpass', 'bandpass', 'bandpass']);
    expect(context.gains.slice(-7).every((gain) => gain.gain.value === 0)).toBe(true);
    expect(audio.telemetry().destructionEffectsPrewarm).toEqual({
      prepared: true,
      runs: 1,
      warmupSources: 7,
      warmupNodes: 10,
      retainedSources: 0,
      retainedBroadbandLoops: 0,
    });

    // Idempotent
    expect(audio.prepareDestructionEffects()).toBe(true);
    expect(audio.telemetry().destructionEffectsPrewarm.runs).toBe(1);

    audio.dispose();
    expect(context.state).toBe('closed');
  });

  it('handles destruction effects prewarm failure gracefully and re-arms for retry', () => {
    const audio = new ArenaAudio();
    expect(audio.prepareDestructionEffects()).toBe(false);
    expect(audio.telemetry().destructionEffectsPrewarm.prepared).toBe(false);

    vi.stubGlobal('AudioContext', FakeAudioContext);
    audio.unlock();
    expect(audio.prepareDestructionEffects()).toBe(true);
    expect(audio.telemetry().destructionEffectsPrewarm.prepared).toBe(true);
    audio.dispose();
  });
});
