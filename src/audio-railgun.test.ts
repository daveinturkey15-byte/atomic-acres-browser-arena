import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio, RAILGUN_REPORT_PROFILE, railgunReportAttenuation } from './audio';
import { AUDIO_RUNTIME_BUDGET } from './spatial-audio';

class FakeAudioParam {
  value = 0;
  setValueAtTime(value: number): this { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  setTargetAtTime(value: number): this { this.value = value; return this; }
  cancelScheduledValues(): this { return this; }
}

class FakeAudioNode {
  readonly connections: unknown[] = [];
  disconnected = false;
  connect<T>(destination: T): T { this.connections.push(destination); return destination; }
  disconnect(): void { this.disconnected = true; }
}

class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;

  constructor(protected readonly context: FakeAudioContext) { super(); }

  protected scheduleEnd(atContextTime: number): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    const delayMs = Math.max(0, (atContextTime - this.context.currentTime) * 1_000);
    this.endTimer = setTimeout(() => this.finish(), delayMs);
  }

  protected finish(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.onended?.(new Event('ended'));
  }

  stop(when = this.context.currentTime): void {
    if (when <= this.context.currentTime) this.finish();
    else this.scheduleEnd(when);
  }
}

class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  start(): void { /* stop() owns the bounded lifetime. */ }
}

class FakeAudioBufferSourceNode extends FakeScheduledSource {
  buffer: { duration: number } | null = null;
  loop = false;
  start(when = this.context.currentTime, _offset = 0, duration?: number): void {
    if (Number.isFinite(duration)) this.scheduleEnd(when + Number(duration));
  }
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
  readonly panners: FakePannerNode[] = [];
  state: AudioContextState = 'running';
  private readonly startedAt = Date.now();

  constructor() { FakeAudioContext.instances.push(this); }
  get currentTime(): number { return (Date.now() - this.startedAt) / 1_000; }
  createDynamicsCompressor(): FakeDynamicsCompressorNode { return new FakeDynamicsCompressorNode(); }
  createGain(): FakeGainNode { return new FakeGainNode(); }
  createBiquadFilter(): FakeBiquadFilterNode { return new FakeBiquadFilterNode(); }
  createOscillator(): FakeOscillatorNode { return new FakeOscillatorNode(this); }
  createBufferSource(): FakeAudioBufferSourceNode { return new FakeAudioBufferSourceNode(this); }
  createPanner(): FakePannerNode {
    const panner = new FakePannerNode();
    this.panners.push(panner);
    return panner;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): { duration: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

describe('railgun report presentation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeAudioContext.instances.length = 0;
  });

  it('uses a large layered pressure profile that remains audible at replicated map distance', () => {
    expect(RAILGUN_REPORT_PROFILE).toMatchObject({ layerCount: 10, pressureDuration: 0.62, tailDuration: 0.9 });
    expect(RAILGUN_REPORT_PROFILE.duration).toBeGreaterThan(0.4);
    expect(RAILGUN_REPORT_PROFILE.crack).toBeGreaterThan(5_000);
    expect(railgunReportAttenuation(false, 180)).toBe(1);
    expect(railgunReportAttenuation(true, 60)).toBeGreaterThan(0.3);
    expect(railgunReportAttenuation(true, 180)).toBe(0.1);
  });

  it('routes both local and replicated hooks through the same bounded weapon report', () => {
    const audio = new ArenaAudio();
    const shot = vi.spyOn(audio, 'shot').mockImplementation(() => undefined);
    audio.railgunReport(false, 0);
    audio.railgunReport(true, { x: 20, y: 0, z: -48 });
    expect(shot).toHaveBeenNthCalledWith(1, 'railgun', false, 0, undefined);
    expect(shot).toHaveBeenNthCalledWith(2, 'railgun', true, 52, { x: 20, y: 0, z: -48 });
    expect(audio.telemetry().railgun).toMatchObject({
      local: 1,
      replicated: 1,
      lastDistanceM: 52,
      lastSpatial: true,
      lastEmitter: { x: 20, y: 0, z: -48 },
      layerCount: 10,
      pressureDuration: 0.62,
    });
  });

  it('mixes a replicated ten-layer report through two bounded panners and fully cleans repeated reports', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new ArenaAudio();
    audio.unlock();
    audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
    const context = FakeAudioContext.instances[0];

    audio.railgunReport(true, { x: 20, y: 1.7, z: -48 });
    const firstVoices = [...(audio as unknown as {
      activeVoices: Map<unknown, { bus: string }>;
    }).activeVoices.values()];
    const firstBusCounts = Object.fromEntries(['sfx', 'ambience'].map((bus) => [
      bus,
      firstVoices.filter((voice) => voice.bus === bus).length,
    ]));
    expect(audio.telemetry().runtime).toMatchObject({ voices: 10, spatialChains: 2, dropped: 0 });
    expect(audio.telemetry().railgun.layerCount).toBe(firstVoices.length);
    expect(firstBusCounts).toEqual({ sfx: 7, ambience: 3 });
    expect(firstBusCounts.sfx).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.perBus.sfx);
    expect(firstBusCounts.ambience).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.perBus.ambience);
    expect(firstVoices.length).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.globalVoices);
    expect(context.panners).toHaveLength(2);
    expect(context.panners.every((panner) => !panner.disconnected)).toBe(true);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(audio.telemetry().runtime).toMatchObject({ voices: 0, spatialChains: 0 });
    expect(context.panners.every((panner) => panner.disconnected)).toBe(true);

    audio.railgunReport(true, { x: -18, y: 2.1, z: 32 });
    expect(audio.telemetry().runtime).toMatchObject({ voices: 10, spatialChains: 2, dropped: 0 });
    expect(context.panners).toHaveLength(4);
    expect(context.panners.filter((panner) => !panner.disconnected)).toHaveLength(2);
    audio.dispose();
    expect(audio.telemetry().runtime).toMatchObject({ voices: 0, spatialChains: 0 });
    expect(context.panners.every((panner) => panner.disconnected)).toBe(true);
    expect(context.state).toBe('closed');
    expect(vi.getTimerCount()).toBe(0);
  });
});
