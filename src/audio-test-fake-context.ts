/**
 * Headless Web Audio double for ArenaAudio contract tests. Records every node
 * factory call, every connection edge and every AudioParam write, so a test
 * can assert routing (which bus a panner feeds), levels (the peak an envelope
 * was scheduled to) and allocation (how many buffers/panners were created
 * after prewarm). Test support only; never imported by runtime code.
 */

export class FakeAudioParam {
  value = 0;
  /** Largest value ever SCHEDULED (initial value excluded); a proxy for the voice's peak. */
  peak = 0;
  readonly writes: Array<{ kind: string; value: number; at: number }> = [];
  constructor(initial = 0) { this.value = initial; }
  private record(kind: string, value: number, at = 0): this {
    this.value = value;
    this.peak = Math.max(this.peak, value);
    this.writes.push({ kind, value, at });
    return this;
  }
  setValueAtTime(value: number, at = 0): this { return this.record('set', value, at); }
  exponentialRampToValueAtTime(value: number, at = 0): this { return this.record('exp', value, at); }
  linearRampToValueAtTime(value: number, at = 0): this { return this.record('linear', value, at); }
  setTargetAtTime(value: number, at = 0): this { return this.record('target', value, at); }
  cancelScheduledValues(): this { return this; }
  cancelAndHoldAtTime(): this { return this; }
}

export class FakeAudioNode {
  readonly outputs: FakeAudioNode[] = [];
  readonly context: FakeAudioContext;
  constructor(context: FakeAudioContext) { this.context = context; }
  connect<T extends FakeAudioNode>(destination: T): T {
    this.outputs.push(destination);
    return destination;
  }
  disconnect(): void { this.outputs.length = 0; }
  /** Every node reachable downstream, for "does this voice reach bus X" checks. */
  reaches(target: FakeAudioNode, seen = new Set<FakeAudioNode>()): boolean {
    if (this === target) return true;
    if (seen.has(this)) return false;
    seen.add(this);
    return this.outputs.some((node) => node.reaches(target, seen));
  }
}

export class FakeScheduledSource extends FakeAudioNode {
  onended: ((event: Event) => void) | null = null;
  started = false;
  ended = false;
  stopAt: number | null = null;
  start(): void { this.started = true; }
  /**
   * A real source keeps playing until `when`; `onended` fires later on the
   * audio thread. Deferring it through a macrotask keeps the graph inspectable
   * right after scheduling and lets fake timers end the voice on demand.
   */
  stop(when = 0): void {
    if (this.ended) return;
    this.ended = true;
    this.stopAt = when;
    setTimeout(() => this.onended?.(new Event('ended')), 0);
  }
}

export class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
}

export class FakeBufferSourceNode extends FakeScheduledSource {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeAudioParam(1);
}

export class FakeGainNode extends FakeAudioNode { readonly gain = new FakeAudioParam(1); }

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
  readonly detune = new FakeAudioParam(0);
}

export class FakeDelayNode extends FakeAudioNode { readonly delayTime = new FakeAudioParam(0); }

export class FakeWaveShaperNode extends FakeAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2_048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  get frequencyBinCount(): number { return this.fftSize / 2; }
  getFloatTimeDomainData(target: Float32Array): void { target.fill(0); }
  getFloatFrequencyData(target: Float32Array): void { target.fill(-100); }
}

export class FakePannerNode extends FakeAudioNode {
  panningModel: PanningModelType = 'equalpower';
  distanceModel: DistanceModelType = 'inverse';
  refDistance = 1;
  maxDistance = 10_000;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  coneOuterGain = 0;
  readonly positionX = new FakeAudioParam(0);
  readonly positionY = new FakeAudioParam(0);
  readonly positionZ = new FakeAudioParam(0);
  readonly orientationX = new FakeAudioParam(1);
  readonly orientationY = new FakeAudioParam(0);
  readonly orientationZ = new FakeAudioParam(0);
  setPosition(x: number, y: number, z: number): void {
    this.positionX.setValueAtTime(x);
    this.positionY.setValueAtTime(y);
    this.positionZ.setValueAtTime(z);
  }
}

export class FakeAudioListener {
  readonly positionX = new FakeAudioParam(0);
  readonly positionY = new FakeAudioParam(0);
  readonly positionZ = new FakeAudioParam(0);
  readonly forwardX = new FakeAudioParam(0);
  readonly forwardY = new FakeAudioParam(0);
  readonly forwardZ = new FakeAudioParam(-1);
  readonly upX = new FakeAudioParam(0);
  readonly upY = new FakeAudioParam(1);
  readonly upZ = new FakeAudioParam(0);
}

export type FakeAudioBuffer = {
  readonly duration: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
};

export class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];
  readonly sampleRate = 8_000;
  readonly destination: FakeAudioNode;
  readonly listener = new FakeAudioListener();
  state: AudioContextState = 'running';
  currentTime = 0;
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly panners: FakePannerNode[] = [];
  readonly buffers: FakeAudioBuffer[] = [];
  readonly compressors: FakeDynamicsCompressorNode[] = [];
  readonly delays: FakeDelayNode[] = [];
  decodeAudioDataCalls = 0;

  constructor() {
    this.destination = new FakeAudioNode(this);
    FakeAudioContext.instances.push(this);
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    const node = new FakeDynamicsCompressorNode(this);
    this.compressors.push(node);
    return node;
  }
  createGain(): FakeGainNode { const node = new FakeGainNode(this); this.gains.push(node); return node; }
  createBiquadFilter(): FakeBiquadFilterNode { const node = new FakeBiquadFilterNode(this); this.filters.push(node); return node; }
  createOscillator(): FakeOscillatorNode { const node = new FakeOscillatorNode(this); this.oscillators.push(node); return node; }
  createBufferSource(): FakeBufferSourceNode { const node = new FakeBufferSourceNode(this); this.bufferSources.push(node); return node; }
  createDelay(): FakeDelayNode { const node = new FakeDelayNode(this); this.delays.push(node); return node; }
  createWaveShaper(): FakeWaveShaperNode { return new FakeWaveShaperNode(this); }
  createAnalyser(): FakeAnalyserNode { return new FakeAnalyserNode(this); }
  createPanner(): FakePannerNode { const node = new FakePannerNode(this); this.panners.push(node); return node; }
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer: FakeAudioBuffer = {
      duration: length / sampleRate, length, sampleRate, numberOfChannels: channels,
      getChannelData: (channel: number) => data[channel] ?? data[0]!,
    };
    this.buffers.push(buffer);
    return buffer;
  }
  decodeAudioData(): Promise<never> {
    this.decodeAudioDataCalls += 1;
    return Promise.reject(new Error('decodeAudioData is forbidden on the combat path'));
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }

  /** Allocation snapshot for "nothing was created in combat" assertions. */
  allocations(): Readonly<{ buffers: number; panners: number; decodes: number }> {
    return Object.freeze({ buffers: this.buffers.length, panners: this.panners.length, decodes: this.decodeAudioDataCalls });
  }
}
