import { describe, expect, it, vi } from 'vitest';
import {
  ArenaAudio,
  EXPLOSION_AUDIO_COALESCE_MS,
  admitExplosionAudioMix,
  createExplosionAudioGate,
} from './audio';

describe('explosion audio admission', () => {
  it('admits one full mix and coalesces concurrent impacts', () => {
    let state = createExplosionAudioGate();
    const first = admitExplosionAudioMix(state, 1_000);
    expect(first.admitted).toBe(true);
    state = first.state;
    const second = admitExplosionAudioMix(state, 1_000);
    expect(second.admitted).toBe(false);
    state = second.state;
    const third = admitExplosionAudioMix(state, 1_000 + EXPLOSION_AUDIO_COALESCE_MS - 1);
    expect(third.admitted).toBe(false);
    expect(third.state).toMatchObject({ requests: 3, mixes: 1, coalesced: 2 });
  });

  it('admits a later explosion after the perceptual coalescing window', () => {
    const first = admitExplosionAudioMix(createExplosionAudioGate(), 2_000);
    const later = admitExplosionAudioMix(first.state, 2_000 + EXPLOSION_AUDIO_COALESCE_MS);
    expect(later.admitted).toBe(true);
    expect(later.state).toMatchObject({ requests: 2, mixes: 2, coalesced: 0 });
  });

  it('keeps the Sanctified Frag choir when the heavy explosion mix is coalesced', () => {
    const audio = new ArenaAudio();
    const start = vi.fn();
    const stop = vi.fn();
    const feedback = {};
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(() => feedback),
    };
    const source = {
      buffer: null as { duration: number } | null,
      connect: vi.fn(() => gain),
      start,
      stop,
    };
    Object.assign(audio, {
      context: { currentTime: 1, createBufferSource: () => source, createGain: () => gain },
      feedback,
      sanctifiedChoirBuffer: { duration: 1.2 },
    });
    vi.spyOn(audio, 'explosion').mockReturnValue(false);

    audio.sanctifiedFragExplosion();

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(audio.telemetry().sanctifiedFragChoir.plays).toBe(1);
  });
});
