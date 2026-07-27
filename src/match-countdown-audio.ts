export type MatchCountdownAudioCueId = 1 | 2 | 3 | 'engage';
export type MatchCountdownAudioBus = 'announcements' | 'ui';
export type MatchCountdownAudioWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type MatchCountdownAudioVoice = Readonly<{
  kind: 'tone' | 'sweep';
  bus: MatchCountdownAudioBus;
  startFrequencyHz: number;
  endFrequencyHz: number;
  durationSeconds: number;
  gain: number;
  delaySeconds: number;
  waveform: MatchCountdownAudioWaveform;
}>;

export const MATCH_COUNTDOWN_AUDIO_LIMITS = Object.freeze({
  maximumVoicesPerCue: 2,
  maximumCueWindowSeconds: 0.36,
  maximumVoiceGain: 0.075,
  maximumCombinedGain: 0.12,
  minimumFrequencyHz: 80,
  maximumFrequencyHz: 4_000,
});

function freezeVoices(voices: readonly MatchCountdownAudioVoice[]): readonly MatchCountdownAudioVoice[] {
  return Object.freeze(voices.map((voice) => Object.freeze({ ...voice })));
}

const MATCH_COUNTDOWN_AUDIO_CUES: Readonly<Record<string, readonly MatchCountdownAudioVoice[]>> = Object.freeze({
  3: freezeVoices([
    { kind: 'tone', bus: 'announcements', startFrequencyHz: 430, endFrequencyHz: 391, durationSeconds: 0.115, gain: 0.048, delaySeconds: 0, waveform: 'triangle' },
    { kind: 'tone', bus: 'ui', startFrequencyHz: 860, endFrequencyHz: 783, durationSeconds: 0.072, gain: 0.025, delaySeconds: 0.025, waveform: 'sine' },
  ]),
  2: freezeVoices([
    { kind: 'tone', bus: 'announcements', startFrequencyHz: 520, endFrequencyHz: 473, durationSeconds: 0.115, gain: 0.048, delaySeconds: 0, waveform: 'triangle' },
    { kind: 'tone', bus: 'ui', startFrequencyHz: 1_040, endFrequencyHz: 946, durationSeconds: 0.072, gain: 0.025, delaySeconds: 0.025, waveform: 'sine' },
  ]),
  1: freezeVoices([
    { kind: 'tone', bus: 'announcements', startFrequencyHz: 610, endFrequencyHz: 555, durationSeconds: 0.125, gain: 0.052, delaySeconds: 0, waveform: 'triangle' },
    { kind: 'tone', bus: 'ui', startFrequencyHz: 1_220, endFrequencyHz: 1_110, durationSeconds: 0.08, gain: 0.027, delaySeconds: 0.025, waveform: 'sine' },
  ]),
  engage: freezeVoices([
    { kind: 'sweep', bus: 'announcements', startFrequencyHz: 340, endFrequencyHz: 1_280, durationSeconds: 0.26, gain: 0.068, delaySeconds: 0, waveform: 'sawtooth' },
    { kind: 'tone', bus: 'ui', startFrequencyHz: 1_320, endFrequencyHz: 1_201, durationSeconds: 0.18, gain: 0.047, delaySeconds: 0.08, waveform: 'square' },
  ]),
});

export function matchCountdownAudioCue(cue: MatchCountdownAudioCueId): readonly MatchCountdownAudioVoice[] {
  const profile = MATCH_COUNTDOWN_AUDIO_CUES[String(cue)];
  if (!profile) throw new Error(`Unknown match countdown audio cue ${String(cue)}`);
  return profile;
}

export function assertMatchCountdownAudioProfile(): true {
  for (const cue of [3, 2, 1, 'engage'] as const) {
    const voices = matchCountdownAudioCue(cue);
    if (voices.length === 0 || voices.length > MATCH_COUNTDOWN_AUDIO_LIMITS.maximumVoicesPerCue) {
      throw new Error(`Countdown ${cue} exceeds its voice cap`);
    }
    const combinedGain = voices.reduce((sum, voice) => sum + voice.gain, 0);
    if (combinedGain > MATCH_COUNTDOWN_AUDIO_LIMITS.maximumCombinedGain) {
      throw new Error(`Countdown ${cue} exceeds its combined gain cap`);
    }
    for (const voice of voices) {
      const windowSeconds = voice.delaySeconds + voice.durationSeconds;
      if (windowSeconds > MATCH_COUNTDOWN_AUDIO_LIMITS.maximumCueWindowSeconds) {
        throw new Error(`Countdown ${cue} exceeds its cue window`);
      }
      if (voice.gain <= 0 || voice.gain > MATCH_COUNTDOWN_AUDIO_LIMITS.maximumVoiceGain) {
        throw new Error(`Countdown ${cue} has an invalid voice gain`);
      }
      if (voice.startFrequencyHz < MATCH_COUNTDOWN_AUDIO_LIMITS.minimumFrequencyHz
        || voice.startFrequencyHz > MATCH_COUNTDOWN_AUDIO_LIMITS.maximumFrequencyHz
        || voice.endFrequencyHz < MATCH_COUNTDOWN_AUDIO_LIMITS.minimumFrequencyHz
        || voice.endFrequencyHz > MATCH_COUNTDOWN_AUDIO_LIMITS.maximumFrequencyHz) {
        throw new Error(`Countdown ${cue} has an out-of-band frequency`);
      }
    }
  }
  return true;
}

assertMatchCountdownAudioProfile();
