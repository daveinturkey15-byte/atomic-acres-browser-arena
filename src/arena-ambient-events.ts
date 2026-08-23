/**
 * Pass 75 - intermittent arena ambience ("a sense of place").
 *
 * WHY THIS EXISTS
 * Each arena's ambience was exactly two CONTINUOUS voices: a low bed tone and
 * a band-passed air tone (spatial-audio.ts ARENA_AUDIO_DEFINITIONS,
 * continuousVoices: 2). That is a drone. A drone tells a player the audio
 * system is alive; it does not tell them WHERE they are. Nothing ever happened
 * in the soundscape, so every arena sounded like the same room with a
 * different filter setting - which is what "the game needs to feel more
 * immersive" is describing.
 *
 * This module adds the missing layer: sparse, characterful, SPATIALISED
 * one-shots that give each arena an identity - gulls and hull creak at sea,
 * insects and palm rustle in the jungle, stressed metal in the rig.
 *
 * EVERYTHING IS PROCEDURAL. No sampled or licensed audio: each event is a
 * recipe (oscillator type, frequency sweep, envelope, optional noise burst)
 * synthesised at play time, exactly like the existing weapon and explosion
 * families. That keeps the project-original provenance rule intact.
 *
 * THIS FILE IS PURE. No WebAudio, no timers, no Math.random at module scope -
 * the scheduler takes time and a random source as arguments so the cadence is
 * testable and deterministic under test.
 *
 * BUDGET DISCIPLINE. Events are sparse by construction (see MIN/MAX gaps) and
 * the caller still checks the shared voice budget before synthesising, so this
 * layer can never starve combat audio. Sparseness is also an aesthetic choice:
 * ambient events that fire often stop reading as environment and start reading
 * as a loop.
 */

import type { ArenaId } from './arena-identity';

export type AmbientEventShape = 'chirp' | 'call' | 'creak' | 'clank' | 'rustle' | 'whoosh' | 'thump';

export type ArenaAmbientEvent = Readonly<{
  id: string;
  shape: AmbientEventShape;
  /** Relative likelihood within its arena. Higher fires more often. */
  weight: number;
  /** Start and end of the primary frequency sweep, in Hz. */
  sweepHz: readonly [number, number];
  /** Seconds. Kept short - long ambient one-shots read as drones. */
  durationSeconds: number;
  /** Peak gain on the ambience bus, before distance attenuation. */
  gain: number;
  /** Band-pass Q for shaped-noise events; 0 selects a tonal oscillator. */
  noiseQ: number;
  /** Metres from the listener the event is placed, on a random bearing. */
  distanceM: number;
}>;

export type ArenaAmbientProfile = Readonly<{
  arenaId: ArenaId;
  identity: string;
  /** Shortest and longest gap between events, in seconds. */
  gapSecondsRange: readonly [number, number];
  events: readonly ArenaAmbientEvent[];
}>;

const profile = (
  arenaId: ArenaId,
  identity: string,
  gapSecondsRange: readonly [number, number],
  events: readonly ArenaAmbientEvent[],
): ArenaAmbientProfile => Object.freeze({ arenaId, identity, gapSecondsRange, events: Object.freeze(events) });

const event = (
  id: string,
  shape: AmbientEventShape,
  weight: number,
  sweepHz: readonly [number, number],
  durationSeconds: number,
  gain: number,
  noiseQ: number,
  distanceM: number,
): ArenaAmbientEvent => Object.freeze({ id, shape, weight, sweepHz: Object.freeze(sweepHz), durationSeconds, gain, noiseQ, distanceM });

export const ARENA_AMBIENT_PROFILES: Readonly<Record<ArenaId, ArenaAmbientProfile>> = Object.freeze({
  'atomic-acres': profile('atomic-acres', 'suburban-yard-life', [7, 17], [
    event('aa.bird', 'chirp', 5, [2_100, 2_650], 0.11, 0.030, 0, 26),
    event('aa.dog-bark', 'call', 2, [420, 300], 0.20, 0.026, 0, 40),
    event('aa.wind-gust', 'whoosh', 4, [320, 140], 1.30, 0.020, 0.9, 14),
    event('aa.distant-car', 'whoosh', 2, [180, 96], 1.80, 0.016, 0.7, 52),
    event('aa.fence-tick', 'clank', 2, [1_450, 1_180], 0.09, 0.014, 0, 20),
  ]),
  'rustworks-1v1': profile('rustworks-1v1', 'stressed-rig-and-sea-metal', [6, 14], [
    event('rw.hull-creak', 'creak', 5, [148, 92], 1.10, 0.024, 0, 17),
    event('rw.pipe-clank', 'clank', 4, [1_180, 880], 0.13, 0.022, 0, 22),
    event('rw.steam-hiss', 'rustle', 3, [3_100, 2_200], 0.75, 0.017, 1.6, 19),
    event('rw.deck-thump', 'thump', 2, [78, 48], 0.34, 0.026, 0, 24),
  ]),
  'gun-range': profile('gun-range', 'indoor-range-plant', [9, 20], [
    event('gr.vent-thump', 'thump', 4, [88, 56], 0.42, 0.020, 0, 18),
    event('gr.door-clunk', 'clank', 2, [520, 300], 0.19, 0.020, 0, 34),
    event('gr.ballast-tick', 'clank', 3, [1_900, 1_650], 0.07, 0.011, 0, 12),
    event('gr.air-sweep', 'whoosh', 3, [420, 220], 1.05, 0.015, 1.1, 16),
  ]),
  'skyline-terminal': profile('skyline-terminal', 'apron-and-concourse', [7, 16], [
    event('st.jet-wash', 'whoosh', 5, [260, 120], 2.10, 0.022, 0.8, 60),
    event('st.pa-blip', 'call', 2, [980, 1_240], 0.16, 0.015, 0, 30),
    event('st.cart-rattle', 'clank', 3, [740, 560], 0.24, 0.016, 0, 28),
    event('st.hvac-swell', 'rustle', 4, [2_400, 1_700], 1.40, 0.013, 1.4, 20),
  ]),
  farcrysis: profile('farcrysis', 'golden-hour-jungle', [4, 11], [
    event('fc.insect-chirp', 'chirp', 6, [3_600, 4_200], 0.07, 0.020, 0, 12),
    event('fc.bird-call', 'call', 4, [1_650, 2_400], 0.22, 0.024, 0, 30),
    event('fc.palm-rustle', 'rustle', 5, [2_900, 1_800], 1.20, 0.019, 1.8, 15),
    event('fc.distant-surf', 'whoosh', 3, [240, 110], 2.40, 0.017, 0.9, 48),
    event('fc.branch-creak', 'creak', 2, [190, 120], 0.80, 0.014, 0, 22),
  ]),
  'high-seas': profile('high-seas', 'open-water-superyacht', [5, 13], [
    event('hs.gull-cry', 'call', 5, [1_900, 2_600], 0.26, 0.026, 0, 34),
    event('hs.hull-creak', 'creak', 4, [130, 82], 1.30, 0.023, 0, 16),
    event('hs.wave-slap', 'whoosh', 6, [300, 130], 1.05, 0.022, 1.0, 20),
    event('hs.rigging-clink', 'clank', 3, [2_050, 1_720], 0.11, 0.015, 0, 18),
    event('hs.diesel-thrum', 'thump', 2, [64, 44], 0.60, 0.020, 0, 26),
  ]),
});

/** Total weight of an arena's events; 0 when the arena has none. */
export function ambientWeightTotal(profileForArena: ArenaAmbientProfile): number {
  return profileForArena.events.reduce((total, entry) => total + Math.max(0, entry.weight), 0);
}

/**
 * Picks the next event by weight. `roll` must be in [0, 1); values outside it
 * are clamped rather than throwing, because a bad random source must degrade
 * to a valid sound rather than silencing ambience.
 */
export function selectAmbientEvent(
  profileForArena: ArenaAmbientProfile,
  roll: number,
): ArenaAmbientEvent | null {
  const total = ambientWeightTotal(profileForArena);
  if (total <= 0) return null;
  const clamped = Number.isFinite(roll) ? Math.min(0.999_999, Math.max(0, roll)) : 0;
  let cursor = clamped * total;
  for (const entry of profileForArena.events) {
    cursor -= Math.max(0, entry.weight);
    if (cursor < 0) return entry;
  }
  return profileForArena.events[profileForArena.events.length - 1] ?? null;
}

/**
 * Seconds until the next ambient event. Randomised inside the arena's gap
 * range so the layer never develops an audible period - the same reason the
 * continuous bed uses incommensurate loop lengths.
 */
export function nextAmbientGapSeconds(
  profileForArena: ArenaAmbientProfile,
  roll: number,
): number {
  const [minimum, maximum] = profileForArena.gapSecondsRange;
  const low = Math.max(0.5, Math.min(minimum, maximum));
  const high = Math.max(low, Math.max(minimum, maximum));
  const clamped = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
  return low + (high - low) * clamped;
}

/**
 * Places an event on a random bearing at its authored distance, at ear height.
 * Returned in metres relative to the listener, so the caller can offset by the
 * live listener position without this module knowing anything about the world.
 */
export function ambientEventOffset(
  entry: ArenaAmbientEvent,
  bearingRoll: number,
): Readonly<{ x: number; y: number; z: number }> {
  const clamped = Number.isFinite(bearingRoll) ? Math.min(1, Math.max(0, bearingRoll)) : 0;
  const bearing = clamped * Math.PI * 2;
  const distance = Math.max(1, entry.distanceM);
  return Object.freeze({
    x: Math.cos(bearing) * distance,
    // Slightly above ear height: overhead-ish sources (birds, gulls, vents)
    // read as environment, whereas ground-level ones read as footsteps.
    y: entry.shape === 'chirp' || entry.shape === 'call' ? 4.5 : 1.2,
    z: Math.sin(bearing) * distance,
  });
}

/** Every ambient event id, for inventory/coverage checks. */
export const ARENA_AMBIENT_EVENT_IDS: readonly string[] = Object.freeze(
  Object.values(ARENA_AMBIENT_PROFILES).flatMap((entry) => entry.events.map((item) => item.id)),
);
