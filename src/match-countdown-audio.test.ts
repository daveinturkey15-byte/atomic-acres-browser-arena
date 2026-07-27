import { describe, expect, it } from 'vitest';
import {
  MATCH_COUNTDOWN_AUDIO_LIMITS,
  assertMatchCountdownAudioProfile,
  matchCountdownAudioCue,
} from './match-countdown-audio';

describe('Pass 65 bounded match countdown audio', () => {
  it('uses an ascending three-step identity followed by a distinct engage sweep', () => {
    const fundamentals = [3, 2, 1].map((cue) => matchCountdownAudioCue(cue as 1 | 2 | 3)[0]!.startFrequencyHz);
    expect(fundamentals).toEqual([430, 520, 610]);
    expect(matchCountdownAudioCue('engage')[0]).toMatchObject({
      kind: 'sweep',
      bus: 'announcements',
      waveform: 'sawtooth',
    });
  });

  it('keeps every cue on the UI/announcement mixer graph and inside hard voice, gain and time caps', () => {
    expect(assertMatchCountdownAudioProfile()).toBe(true);
    for (const cue of [3, 2, 1, 'engage'] as const) {
      const voices = matchCountdownAudioCue(cue);
      expect(voices).toHaveLength(MATCH_COUNTDOWN_AUDIO_LIMITS.maximumVoicesPerCue);
      expect(new Set(voices.map(({ bus }) => bus))).toEqual(new Set(['announcements', 'ui']));
      expect(voices.reduce((sum, voice) => sum + voice.gain, 0)).toBeLessThanOrEqual(MATCH_COUNTDOWN_AUDIO_LIMITS.maximumCombinedGain);
      expect(Math.max(...voices.map((voice) => voice.delaySeconds + voice.durationSeconds)))
        .toBeLessThanOrEqual(MATCH_COUNTDOWN_AUDIO_LIMITS.maximumCueWindowSeconds);
    }
  });

  it('returns frozen profiles so runtime callers cannot inflate a cue', () => {
    const cue = matchCountdownAudioCue(3);
    expect(Object.isFrozen(cue)).toBe(true);
    expect(cue.every(Object.isFrozen)).toBe(true);
  });
});
