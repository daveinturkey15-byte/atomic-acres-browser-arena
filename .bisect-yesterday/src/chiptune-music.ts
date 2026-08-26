/**
 * chiptune-music.ts — the original Atomic Acres background loops.
 *
 * PROVENANCE. These are project-original compositions, written as data in this
 * file. No third-party melody, recording, sample, transcription or asset enters
 * the repository, in keeping with the same clean-room boundary the arena and
 * operator-skin lanes hold. Nothing here was captured, downloaded or converted
 * from anyone else's audio. The owner supplied reference videos for the FEEL he
 * wanted; the notes below are written, not borrowed.
 *
 * WHY IT IS SHAPED LIKE THIS. The `game-music` bus is capped at TWO voices
 * (AUDIO_RUNTIME_BUDGET.perBus, spatial-audio.ts). That cap is a real budget and
 * is not something to widen for background music, so every track is written for
 * two channels the way early 2-channel hardware actually worked: one LEAD and one
 * BASS. The runtime holds exactly two long-lived oscillators and automates their
 * frequency and gain, rather than creating an oscillator per note. So the whole
 * soundtrack costs two voices total, allocates nothing per note, and cannot churn
 * the voice budget during a firefight.
 *
 * This module is PURE. It knows nothing about Web Audio: it turns an authored
 * pattern into a list of timed events, which makes the compositions testable
 * without an AudioContext and keeps the scheduler in audio.ts trivial.
 */

/** Semitone offsets from the tonic for the natural-minor scale both tracks use. */
const NATURAL_MINOR_SEMITONES = Object.freeze([0, 2, 3, 5, 7, 8, 10]);

export type ChiptuneChannel = 'lead' | 'bass';
export type ChiptuneTrackId = 'siren-groves' | 'fallout-drift';

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

type ChiptuneBar = Readonly<{ root: number; shape: readonly number[] }>;

type ChiptuneTrack = Readonly<{
  id: ChiptuneTrackId;
  /** Human name, used in telemetry and tests rather than in the mix. */
  title: string;
  tempoBpm: number;
  /** MIDI note of the lead's tonic. */
  leadTonicMidi: number;
  /** MIDI note of the bass tonic. */
  bassTonicMidi: number;
  progression: readonly ChiptuneBar[];
  /** Sixteenth-note velocity mask for one bar of lead; 0 is a rest. */
  leadAccents: readonly number[];
  /** Eighth-note velocity mask for the bass; 0 is a rest. */
  bassPattern: readonly number[];
  /** Semitone lift applied to the bass on each eighth, so one channel implies two. */
  bassOctave: readonly number[];
  /** Fraction of a sixteenth a lead note sounds for; lower is more staccato. */
  leadSustain: number;
  /** Fraction of an eighth a bass note sounds for. */
  bassSustain: number;
  leadGain: number;
  bassGain: number;
}>;

/**
 * Track A — "Siren Groves". A minor, 124 BPM, eight bars.
 *
 * Driving sixteenth arpeggios with deliberate rests. The gaps are the point: a
 * wall of continuous sixteenths competes with footsteps and gunfire for the
 * listener's attention, and this has to sit UNDER the game rather than beside it.
 */
const SIREN_GROVES: ChiptuneTrack = Object.freeze({
  id: 'siren-groves',
  title: 'Siren Groves',
  tempoBpm: 124,
  leadTonicMidi: 57, // A3
  bassTonicMidi: 33, // A1
  progression: Object.freeze([
    Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 7]) }), // i
    Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 9]) }), // i, reaching
    Object.freeze({ root: 5, shape: Object.freeze([0, 2, 4, 7]) }), // VI
    Object.freeze({ root: 6, shape: Object.freeze([0, 2, 4, 6]) }), // VII
    Object.freeze({ root: 2, shape: Object.freeze([0, 2, 4, 7]) }), // III
    Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 9]) }), // i
    Object.freeze({ root: 3, shape: Object.freeze([0, 2, 4, 7]) }), // iv
    Object.freeze({ root: 4, shape: Object.freeze([0, 2, 4, 6]) }), // v
  ]),
  leadAccents: Object.freeze([
    1.0, 0, 0.55, 0.7, 0, 0.6, 0.85, 0,
    0.65, 0, 0.5, 0.75, 0, 0.6, 0.45, 0.35,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0.7, 0.5, 0.9, 0, 0.6, 0.45]),
  bassOctave: Object.freeze([0, 0, 0, 12, 0, 0, 12, 0]),
  leadSustain: 0.92,
  bassSustain: 0.86,
  leadGain: 0.085,
  bassGain: 0.105,
});

/**
 * Track B — "Fallout Drift". E minor, 96 BPM, six bars.
 *
 * Deliberately the opposite character to Siren Groves: slower, sparser, longer
 * sustains, and a six-bar loop so the two tracks never feel like sections of one
 * piece. Rotation is only worth having if the alternatives are actually
 * distinguishable, so the contrast is in tempo, key, loop length AND density
 * rather than in the melody alone.
 */
const FALLOUT_DRIFT: ChiptuneTrack = Object.freeze({
  id: 'fallout-drift',
  title: 'Fallout Drift',
  tempoBpm: 96,
  leadTonicMidi: 64, // E4, a fifth above Siren Groves' register
  bassTonicMidi: 28, // E1
  progression: Object.freeze([
    Object.freeze({ root: 0, shape: Object.freeze([0, 4, 2, 7]) }), // i
    Object.freeze({ root: 4, shape: Object.freeze([0, 2, 4, 6]) }), // v
    Object.freeze({ root: 5, shape: Object.freeze([0, 4, 2, 7]) }), // VI
    Object.freeze({ root: 2, shape: Object.freeze([0, 2, 4, 7]) }), // III
    Object.freeze({ root: 3, shape: Object.freeze([0, 4, 2, 6]) }), // iv
    Object.freeze({ root: 0, shape: Object.freeze([0, 2, 4, 9]) }), // i
  ]),
  // Far sparser than track A: eight sounding sixteenths per bar against A's ten,
  // and clustered so the bar breathes in its second half.
  leadAccents: Object.freeze([
    0.9, 0, 0, 0.5, 0, 0.65, 0, 0,
    0.7, 0, 0.45, 0, 0, 0.55, 0, 0.4,
  ]),
  bassPattern: Object.freeze([0.95, 0, 0, 0.55, 0.8, 0, 0.5, 0]),
  bassOctave: Object.freeze([0, 0, 0, 0, 12, 0, 0, 0]),
  leadSustain: 2.6, // longer than a sixteenth: notes ring into the following rest
  bassSustain: 1.7,
  leadGain: 0.078,
  bassGain: 0.098,
});

export const CHIPTUNE_TRACKS: Readonly<Record<ChiptuneTrackId, ChiptuneTrack>> = Object.freeze({
  'siren-groves': SIREN_GROVES,
  'fallout-drift': FALLOUT_DRIFT,
});

export const CHIPTUNE_TRACK_IDS: readonly ChiptuneTrackId[] =
  Object.freeze(['siren-groves', 'fallout-drift'] as const);

/** Equal-tempered frequency of a MIDI note number. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI note for a scale degree, wrapping octaves as the degree passes 7. */
function degreeToMidi(tonicMidi: number, degree: number): number {
  const octave = Math.floor(degree / NATURAL_MINOR_SEMITONES.length);
  const step = degree - octave * NATURAL_MINOR_SEMITONES.length;
  return tonicMidi + octave * 12 + NATURAL_MINOR_SEMITONES[step];
}

function beatSeconds(track: ChiptuneTrack): number {
  return 60 / track.tempoBpm;
}

/** Seconds in one bar of a track. */
export function chiptuneBarSeconds(id: ChiptuneTrackId): number {
  return beatSeconds(CHIPTUNE_TRACKS[id]) * 4;
}

/** Seconds in one full loop of a track. */
export function chiptuneLoopSeconds(id: ChiptuneTrackId): number {
  return chiptuneBarSeconds(id) * CHIPTUNE_TRACKS[id].progression.length;
}

/**
 * Expands an authored track into one loop of timed events.
 *
 * Pure and deterministic: the same call always returns the same events, which is
 * what lets the scheduler in audio.ts re-request any loop iteration without
 * keeping composition state, and what lets the tests assert the music without an
 * AudioContext.
 */
export function chiptuneLoopEvents(id: ChiptuneTrackId): readonly ChiptuneEvent[] {
  const track = CHIPTUNE_TRACKS[id];
  const events: ChiptuneEvent[] = [];
  const beat = beatSeconds(track);
  const sixteenth = beat / 4;
  const eighth = beat / 2;
  const barSeconds = beat * 4;

  for (let bar = 0; bar < track.progression.length; bar += 1) {
    const { root, shape } = track.progression[bar];
    const barStart = bar * barSeconds;

    for (let step = 0; step < track.leadAccents.length; step += 1) {
      const accent = track.leadAccents[step];
      if (accent <= 0) continue;
      // Walk up the chord shape, lifting an octave every time the shape wraps,
      // so the arpeggio climbs across the bar instead of circling one register.
      const shapeIndex = step % shape.length;
      const lift = Math.floor(step / shape.length) % 2 === 1 ? 7 : 0;
      const degree = root + shape[shapeIndex] + lift;
      const offsetSeconds = barStart + step * sixteenth;
      events.push(Object.freeze({
        channel: 'lead' as const,
        offsetSeconds,
        // A sustain longer than its own step is allowed, but never past the note
        // that follows it on the same channel - one oscillator cannot play two
        // pitches, and an overrun would silently truncate the next note instead.
        durationSeconds: leadDuration(track, step, sixteenth),
        frequencyHz: midiToFrequency(degreeToMidi(track.leadTonicMidi, degree)),
        gain: track.leadGain * accent,
      }));
    }

    for (let step = 0; step < track.bassPattern.length; step += 1) {
      const accent = track.bassPattern[step];
      if (accent <= 0) continue;
      const midi = degreeToMidi(track.bassTonicMidi, root) + track.bassOctave[step];
      events.push(Object.freeze({
        channel: 'bass' as const,
        offsetSeconds: barStart + step * eighth,
        durationSeconds: bassDuration(track, step, eighth),
        frequencyHz: midiToFrequency(midi),
        gain: track.bassGain * accent,
      }));
    }
  }

  events.sort((left, right) => left.offsetSeconds - right.offsetSeconds);
  return Object.freeze(events);
}

/** Steps until the next sounding entry in a cyclic mask, wrapping at the bar. */
function stepsToNext(mask: readonly number[], from: number): number {
  for (let ahead = 1; ahead <= mask.length; ahead += 1) {
    if (mask[(from + ahead) % mask.length] > 0) return ahead;
  }
  return mask.length;
}

function leadDuration(track: ChiptuneTrack, step: number, sixteenth: number): number {
  const room = stepsToNext(track.leadAccents, step) * sixteenth;
  return Math.min(sixteenth * track.leadSustain, room * 0.94);
}

function bassDuration(track: ChiptuneTrack, step: number, eighth: number): number {
  const room = stepsToNext(track.bassPattern, step) * eighth;
  return Math.min(eighth * track.bassSustain, room * 0.94);
}

/**
 * Chooses the next track, avoiding an immediate repeat.
 *
 * Pure, so rotation is testable without touching Math.random: the caller supplies
 * the roll. Straight random selection would replay the same track back to back
 * about half the time, which reads as "the music never changed" rather than as
 * variety - so the previous track is excluded whenever there is an alternative.
 */
export function selectChiptuneTrack(
  previous: ChiptuneTrackId | null,
  roll: number,
): ChiptuneTrackId {
  const candidates = previous === null
    ? CHIPTUNE_TRACK_IDS
    : CHIPTUNE_TRACK_IDS.filter((id) => id !== previous);
  const pool = candidates.length > 0 ? candidates : CHIPTUNE_TRACK_IDS;
  const bounded = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  return pool[Math.floor(bounded * pool.length)];
}

/**
 * Highest number of events sounding at the same instant, per channel.
 *
 * Exists so a test can prove a composition never needs more than one voice per
 * channel. The two-voice bus cap is a budget, not a suggestion, and the honest
 * way to respect it is to show the music cannot exceed it rather than to raise it.
 */
export function chiptuneMaxConcurrency(
  events: readonly ChiptuneEvent[],
): Readonly<Record<ChiptuneChannel, number>> {
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
