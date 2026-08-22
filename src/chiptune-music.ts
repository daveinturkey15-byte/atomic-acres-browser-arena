/**
 * chiptune-music.ts — the original Atomic Acres background loop.
 *
 * PROVENANCE. This is a project-original composition, written as data in this
 * file. No third-party melody, recording, sample, transcription or asset enters
 * the repository, in keeping with the same clean-room boundary the arena and
 * operator-skin lanes hold. Nothing here was captured, downloaded or converted
 * from anyone else's audio.
 *
 * WHY IT IS SHAPED LIKE THIS. The `game-music` bus is capped at TWO voices
 * (AUDIO_RUNTIME_BUDGET.perBus, spatial-audio.ts). That cap is a real budget and
 * is not something to widen for background music, so the track is written for two
 * channels the way early 2-channel hardware actually worked: one LEAD and one
 * BASS. The runtime holds exactly two long-lived oscillators and automates their
 * frequency and gain, rather than creating an oscillator per note. So the whole
 * soundtrack costs two voices total, allocates nothing per note, and cannot churn
 * the voice budget during a firefight.
 *
 * This module is PURE. It knows nothing about Web Audio: it turns the authored
 * pattern into a list of timed events, which makes the composition testable
 * without an AudioContext and keeps the scheduler in audio.ts trivial.
 */

/** Semitone offsets from A, for the natural-minor scale this loop is written in. */
const A_MINOR_SEMITONES = Object.freeze([0, 2, 3, 5, 7, 8, 10]);

/** MIDI note number of A3, the lead's tonic. */
const LEAD_TONIC_MIDI = 57;
/** MIDI note number of A1, the bass tonic, two octaves below the lead. */
const BASS_TONIC_MIDI = 33;

export type ChiptuneChannel = 'lead' | 'bass';

export type ChiptuneEvent = Readonly<{
  channel: ChiptuneChannel;
  /** Seconds from the start of the loop. */
  offsetSeconds: number;
  /** Note length in seconds, including its release tail. */
  durationSeconds: number;
  frequencyHz: number;
  /** Peak gain for this note, before the bus and user volume are applied. */
  gain: number;
}>;

/**
 * Authored progression, eight bars, as scale degrees of A natural minor.
 *
 * Each entry is one bar: `root` is the chord root as a scale degree (0 = A), and
 * `shape` lists the degrees the lead arpeggiates over that bar, relative to the
 * root. Writing it as degrees rather than absolute notes keeps the whole loop in
 * key by construction - a wrong note here is impossible rather than merely
 * unlikely.
 */
const PROGRESSION = Object.freeze([
  Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 7]) }), // i
  Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 9]) }), // i, reaching
  Object.freeze({ root: 5, shape: Object.freeze([0, 2, 4, 7]) }), // VI
  Object.freeze({ root: 6, shape: Object.freeze([0, 2, 4, 6]) }), // VII
  Object.freeze({ root: 2, shape: Object.freeze([0, 2, 4, 7]) }), // III
  Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 9]) }), // i
  Object.freeze({ root: 3, shape: Object.freeze([0, 2, 4, 7]) }), // iv
  Object.freeze({ root: 4, shape: Object.freeze([0, 2, 4, 6]) }), // v
]);

/**
 * Sixteenth-note velocity mask for one bar of lead.
 *
 * 0 means rest. The gaps are the point: a wall of continuous sixteenths competes
 * with footsteps and gunfire for the listener's attention, and this track has to
 * sit UNDER the game rather than beside it.
 */
const LEAD_ACCENTS = Object.freeze([
  1.0, 0, 0.55, 0.7, 0, 0.6, 0.85, 0,
  0.65, 0, 0.5, 0.75, 0, 0.6, 0.45, 0.35,
]);

/** Eighth-note mask for the bass; the rests are what make it read rhythmically. */
const BASS_PATTERN = Object.freeze([1.0, 0, 0.7, 0.5, 0.9, 0, 0.6, 0.45]);

/** Octave the bass jumps to on each eighth, so one channel implies two. */
const BASS_OCTAVE = Object.freeze([0, 0, 0, 12, 0, 0, 12, 0]);

export const CHIPTUNE_TEMPO_BPM = 124;
export const CHIPTUNE_BARS = PROGRESSION.length;

/** Seconds per beat, per bar, and for the whole loop. */
export const CHIPTUNE_BEAT_SECONDS = 60 / CHIPTUNE_TEMPO_BPM;
export const CHIPTUNE_BAR_SECONDS = CHIPTUNE_BEAT_SECONDS * 4;
export const CHIPTUNE_LOOP_SECONDS = CHIPTUNE_BAR_SECONDS * CHIPTUNE_BARS;

/**
 * Peak note gains. Deliberately low: these are multiplied by the `game-music`
 * bus (0.16) and then by the player's music volume, so the track sits well below
 * weapons and footsteps. The owner asked for quiet background music, and a mix
 * that competes with a gunshot is a gameplay problem, not a taste one.
 */
export const CHIPTUNE_LEAD_GAIN = 0.085;
export const CHIPTUNE_BASS_GAIN = 0.105;

/** Equal-tempered frequency of a MIDI note number. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI note for a scale degree, wrapping octaves as the degree passes 7. */
function degreeToMidi(tonicMidi: number, degree: number): number {
  const octave = Math.floor(degree / A_MINOR_SEMITONES.length);
  const step = degree - octave * A_MINOR_SEMITONES.length;
  return tonicMidi + octave * 12 + A_MINOR_SEMITONES[step];
}

/**
 * Expands the authored pattern into one loop of timed events.
 *
 * Pure and deterministic: the same call always returns the same events, which is
 * what lets the scheduler in audio.ts re-request any loop iteration without
 * keeping composition state, and what lets the tests assert the music without an
 * AudioContext.
 */
export function chiptuneLoopEvents(): readonly ChiptuneEvent[] {
  const events: ChiptuneEvent[] = [];
  const sixteenth = CHIPTUNE_BEAT_SECONDS / 4;
  const eighth = CHIPTUNE_BEAT_SECONDS / 2;

  for (let bar = 0; bar < PROGRESSION.length; bar += 1) {
    const { root, shape } = PROGRESSION[bar];
    const barStart = bar * CHIPTUNE_BAR_SECONDS;

    for (let step = 0; step < LEAD_ACCENTS.length; step += 1) {
      const accent = LEAD_ACCENTS[step];
      if (accent <= 0) continue;
      // Walk up the chord shape, lifting an octave every time the shape wraps,
      // so the arpeggio climbs across the bar instead of circling one register.
      const shapeIndex = step % shape.length;
      const lift = Math.floor(step / shape.length) % 2 === 1 ? 7 : 0;
      const degree = root + shape[shapeIndex] + lift;
      events.push(Object.freeze({
        channel: 'lead' as const,
        offsetSeconds: barStart + step * sixteenth,
        durationSeconds: sixteenth * 0.92,
        frequencyHz: midiToFrequency(degreeToMidi(LEAD_TONIC_MIDI, degree)),
        gain: CHIPTUNE_LEAD_GAIN * accent,
      }));
    }

    for (let step = 0; step < BASS_PATTERN.length; step += 1) {
      const accent = BASS_PATTERN[step];
      if (accent <= 0) continue;
      const midi = degreeToMidi(BASS_TONIC_MIDI, root) + BASS_OCTAVE[step];
      events.push(Object.freeze({
        channel: 'bass' as const,
        offsetSeconds: barStart + step * eighth,
        durationSeconds: eighth * 0.86,
        frequencyHz: midiToFrequency(midi),
        gain: CHIPTUNE_BASS_GAIN * accent,
      }));
    }
  }

  events.sort((left, right) => left.offsetSeconds - right.offsetSeconds);
  return Object.freeze(events);
}

/**
 * Highest number of events sounding at the same instant, per channel.
 *
 * Exists so a test can prove the composition never needs more than one voice per
 * channel. The two-voice bus cap is a budget, not a suggestion, and the honest
 * way to respect it is to show the music cannot exceed it rather than to raise it.
 */
export function chiptuneMaxConcurrency(events: readonly ChiptuneEvent[]): Readonly<Record<ChiptuneChannel, number>> {
  const peak: Record<ChiptuneChannel, number> = { lead: 0, bass: 0 };
  for (const channel of ['lead', 'bass'] as const) {
    const inChannel = events.filter((event) => event.channel === channel);
    for (const probe of inChannel) {
      const sounding = inChannel.filter((other) =>
        other.offsetSeconds <= probe.offsetSeconds
        && other.offsetSeconds + other.durationSeconds > probe.offsetSeconds).length;
      if (sounding > peak[channel]) peak[channel] = sounding;
    }
  }
  return Object.freeze(peak);
}
