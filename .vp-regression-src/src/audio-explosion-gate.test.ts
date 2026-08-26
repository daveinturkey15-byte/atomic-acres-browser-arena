import { describe, expect, it } from 'vitest';
import {
  ArenaAudio,
  EXPLOSION_AUDIO_COALESCE_MS,
  GRENADE_FUSE_BEEP_START_MS,
  OVERDRIVE_AVAILABLE_CUE_PROFILE,
  admitExplosionAudioMix,
  createExplosionAudioGate,
  grenadeFuseBeepIntervalMs,
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

  it('uses an accelerating conventional frag warning cadence and no always-on noise sources', () => {
    const audio = new ArenaAudio();
    const intervals = [GRENADE_FUSE_BEEP_START_MS, 900, 450, 100].map(grenadeFuseBeepIntervalMs);
    expect(intervals).toEqual([...intervals].sort((a, b) => b - a));
    expect(intervals.at(-1)).toBeLessThan(120);
    expect(audio.telemetry()).toMatchObject({
      ambience: { continuousSources: 0, busGain: 0.12 },
      grenadeFuse: { beeps: 0, startMs: GRENADE_FUSE_BEEP_START_MS },
    });
  });

  it('keeps the 2x-core availability cue tonal and explicitly broadband-free', () => {
    expect(OVERDRIVE_AVAILABLE_CUE_PROFILE.broadbandNoiseLayers).toBe(0);
    expect(OVERDRIVE_AVAILABLE_CUE_PROFILE.maximumDurationSeconds).toBeLessThanOrEqual(0.55);
    expect(OVERDRIVE_AVAILABLE_CUE_PROFILE.announcementTones.map((layer) => layer.frequencyHz)).toEqual([330, 495]);
    expect(OVERDRIVE_AVAILABLE_CUE_PROFILE.ambienceTone.frequencyHz).toBe(660);
    expect(OVERDRIVE_AVAILABLE_CUE_PROFILE.transient).toMatchObject({
      startFrequencyHz: 1_650,
      endFrequencyHz: 2_350,
      wave: 'triangle',
    });
  });
});
