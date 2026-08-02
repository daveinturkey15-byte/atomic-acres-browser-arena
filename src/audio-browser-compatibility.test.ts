import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio, resolveBrowserAudioContext } from './audio';

class FakeAudioParam {
  value = 0;
  setTargetAtTime(value: number): this { this.value = value; return this; }
}
class FakeAudioNode {
  connect<T>(destination: T): T { return destination; }
  disconnect(): void { /* no-op browser compatibility fixture */ }
}
class FakeGainNode extends FakeAudioNode { readonly gain = new FakeAudioParam(); }
class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam();
  readonly knee = new FakeAudioParam();
  readonly ratio = new FakeAudioParam();
  readonly attack = new FakeAudioParam();
  readonly release = new FakeAudioParam();
}
class FakeAudioContext {
  static instances = 0;
  readonly sampleRate = 1_000;
  readonly destination = new FakeAudioNode();
  state: AudioContextState = 'running';

  constructor() { FakeAudioContext.instances += 1; }
  createDynamicsCompressor(): FakeDynamicsCompressorNode { return new FakeDynamicsCompressorNode(); }
  createGain(): FakeGainNode { return new FakeGainNode(); }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(length) };
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

class StandardAudioContext extends FakeAudioContext { static instances = 0; constructor() { super(); StandardAudioContext.instances += 1; } }
class WebkitAudioContext extends FakeAudioContext { static instances = 0; constructor() { super(); WebkitAudioContext.instances += 1; } }
class ThrowingAudioContext {
  constructor() { throw new DOMException('Audio device is unavailable', 'NotSupportedError'); }
}

describe('browser Web Audio constructor compatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances = 0;
    StandardAudioContext.instances = 0;
    WebkitAudioContext.instances = 0;
  });

  it('prefers the standard AudioContext when both constructors exist', () => {
    vi.stubGlobal('AudioContext', StandardAudioContext);
    vi.stubGlobal('webkitAudioContext', WebkitAudioContext);
    const resolution = resolveBrowserAudioContext();
    expect(resolution.source).toBe('standard');

    const audio = new ArenaAudio();
    audio.unlock();
    expect(StandardAudioContext.instances).toBe(1);
    expect(WebkitAudioContext.instances).toBe(0);
    expect(audio.telemetry().context).toEqual({ source: 'standard', state: 'running' });
  });

  it('uses webkitAudioContext only when the standard constructor is absent', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', WebkitAudioContext);
    const audio = new ArenaAudio();
    expect(() => audio.unlock()).not.toThrow();
    expect(WebkitAudioContext.instances).toBe(1);
    expect(audio.telemetry().context).toEqual({ source: 'webkit', state: 'running' });
  });

  it('enters a truthful disabled-audio state when neither constructor exists', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const audio = new ArenaAudio();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
    expect(FakeAudioContext.instances).toBe(0);
    expect(audio.telemetry().context).toEqual({ source: 'unavailable', state: 'unavailable' });
  });

  it('contains a throwing constructor and removes every partially initialized graph owner', () => {
    vi.stubGlobal('AudioContext', ThrowingAudioContext);
    vi.stubGlobal('webkitAudioContext', WebkitAudioContext);
    const audio = new ArenaAudio();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
    expect(WebkitAudioContext.instances).toBe(0);
    expect(audio.telemetry().context).toEqual({ source: 'failed', state: 'failed' });
    expect(audio.telemetry().buses.master.effectiveGain).toBe(0.34);
    expect(audio.telemetry().runtime.voices).toBe(0);
    expect(audio.telemetry().ambience.continuousSources).toBe(0);
    const internals = audio as unknown as {
      context: unknown;
      master: unknown;
      buses: Map<string, unknown>;
    };
    expect(internals.context).toBeNull();
    expect(internals.master).toBeNull();
    expect(internals.buses.size).toBe(0);
  });
});
