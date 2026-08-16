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
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeFilterNode[] = [];
  readonly panners: FakePannerNode[] = [];
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
  createPanner(): FakePannerNode {
    const node = new FakePannerNode();
    this.panners.push(node);
    return node;
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
      panners: context.panners.length,
    };

    expect(preparedFactories).toEqual({ oscillators: 12, bufferSources: 0, gains: 20, filters: 11, panners: 4 });
    expect(context.oscillators.every((source) => source.startCount === 1 && !source.ended)).toBe(true);
    expect(audio.telemetry()).toMatchObject({
      combatPrewarm: { prepared: true, runs: 1, sources: 3, nodes: 5, broadbandLoopSources: 0 },
      lowHealth: { prepared: true, sources: 2, active: false, broadbandSources: 0 },
      damageFeedback: { prepared: true, sources: 1, pulses: 0 },
      glassImpactPrewarm: { prepared: true, sources: 2, nodes: 4, retainedBroadbandLoops: 0 },
      grenadeEffectsPrewarm: { prepared: true, sources: 3, nodes: 6, retainedBroadbandLoops: 0 },
      support: {
        chopperRotorPrewarm: {
          prepared: true, runs: 1, capacity: 4, sources: 4, nodes: 12, factoryCalls: 16,
          lastSyncFactoryDelta: 0, retainedBroadbandLoops: 0,
        },
      },
      runtime: { voices: 12, retainedSources: 12, spatialChains: 4 },
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
      panners: context.panners.length,
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
      runtime: { voices: 12, retainedSources: 12, spatialChains: 4 },
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
      glassImpactPrewarm: { prepared: false, sources: 0 },
      grenadeEffectsPrewarm: { prepared: false, sources: 0 },
      support: { chopperRotorPrewarm: { prepared: false, sources: 0 } },
      runtime: { voices: 0, spatialChains: 0 },
    });
  });

  it('preowns glass and grenade effect graphs once and makes their live cues allocation-free', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const before = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
      panners: context.panners.length,
    };
    expect(audio.prepareGlassImpact()).toBe(true);
    expect(audio.prepareGrenadeEffects()).toBe(true);
    expect(audio.prepareChopperRotors()).toBe(true);
    expect({
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
      panners: context.panners.length,
    }).toEqual(before);
    expect(context.gains.slice(-5).every((gain) => gain.gain.value === 0)).toBe(true);
    expect(context.bufferSources).toHaveLength(0);
    expect(audio.telemetry().glassImpactPrewarm).toEqual({
      prepared: true,
      runs: 1,
      sources: 2,
      nodes: 4,
      pulses: 0,
      retainedBroadbandLoops: 0,
    });
    const afterFirst = {
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    };
    expect(audio.prepareGlassImpact()).toBe(true);
    audio.impact('glass', 4);
    audio.grenadeBounce(8);
    expect(audio.grenadeFuseBeep(500, 1_000)).toBe(true);
    expect(audio.explosion(1_000)).toBe(true);
    expect({
      oscillators: context.oscillators.length,
      bufferSources: context.bufferSources.length,
      gains: context.gains.length,
      filters: context.filters.length,
    }).toEqual(afterFirst);
    expect(audio.telemetry()).toMatchObject({
      glassImpactPrewarm: { pulses: 1 },
      grenadeEffectsPrewarm: { prepared: true, runs: 1, sources: 3, nodes: 6, automations: 7 },
      runtime: { retainedSources: 12 },
    });

    const beforeRotorSync = {
      oscillators: context.oscillators.length,
      gains: context.gains.length,
      filters: context.filters.length,
      panners: context.panners.length,
    };
    audio.syncChopperRotors([{ id: 'chopper-1', position: { x: 4, y: 12, z: -8 }, phase: 'orbiting' }]);
    expect({
      oscillators: context.oscillators.length,
      gains: context.gains.length,
      filters: context.filters.length,
      panners: context.panners.length,
    }).toEqual(beforeRotorSync);
    expect(audio.telemetry().support.chopperRotorPrewarm).toMatchObject({
      prepared: true,
      syncs: 1,
      activeSyncs: 1,
      lastSyncFactoryDelta: 0,
      liveIds: ['chopper-1'],
      firstActiveSync: { cold: true, factoryDelta: 0, admitted: 1, contextState: 'running' },
    });
    audio.syncChopperRotors([]);
    expect(audio.telemetry()).toMatchObject({
      support: {
        chopperRotorActive: false,
        chopperRotorStarts: 1,
        chopperRotorStops: 1,
        chopperRotorPrewarm: { sources: 4, lastSyncFactoryDelta: 0, liveIds: [] },
      },
      runtime: { retainedSources: 12, retainedAudibleGains: 0 },
    });
    audio.dispose();
    expect(audio.telemetry().glassImpactPrewarm).toMatchObject({ prepared: false, runs: 1 });
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
});
