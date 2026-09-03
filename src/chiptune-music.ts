/**
 * chiptune-music.ts — original Atomic Acres procedural background loops & rotation.
 *
 * PROVENANCE. Project-original compositions authored entirely as procedural data.
 * No external sample, loop, soundfont or asset is imported.
 *
 * BUS BUDGET: 2 voices total (lead and bass). Concurrency strictly capped at 1
 * voice per channel, conforming to AUDIO_RUNTIME_BUDGET.perBus['game-music'] = 2.
 *
 * HF-430: 10 distinct procedural tracks (~90 s duration band [85, 95] s) with
 * varied scales, tonics, tempos, arpeggio textures, bass/drum rhythm patterns,
 * and lead waveforms. Shuffle rotation plays all 10 in random order with no
 * immediate repeat and no repeats until all 10 have played. Seamless swaps
 * commit on bar boundaries.
 *
 * Bus gain is halved to 0.027 (-6 dB) while user volume slider semantics are preserved.
 */

export const NATURAL_MINOR_SEMITONES = Object.freeze([0, 2, 3, 5, 7, 8, 10]);
export const DORIAN_SEMITONES = Object.freeze([0, 2, 3, 5, 7, 9, 10]);
export const PHRYGIAN_SEMITONES = Object.freeze([0, 1, 3, 5, 7, 8, 10]);
export const MIXOLYDIAN_SEMITONES = Object.freeze([0, 2, 4, 5, 7, 9, 10]);
export const MINOR_PENTATONIC_SEMITONES = Object.freeze([0, 3, 5, 7, 10]);

// Pinned historical constant before HF-430 halving
export const PREVIOUS_GAME_MUSIC_BUS_GAIN = 0.054;
// HF-430: -6 dB halving of music gain (0.054 -> 0.027)
export const GAME_MUSIC_BUS_GAIN = 0.027;

export type ChiptuneChannel = 'lead' | 'bass';
export type ChiptuneTrackId =
  | 'siren-groves'
  | 'fallout-drift'
  | 'cobalt-circuit'
  | 'rust-horizon'
  | 'neon-wasteland'
  | 'static-vault'
  | 'terminal-pulse'
  | 'gamma-canopy'
  | 'rad-storm-echo'
  | 'bunker-lullaby';

export const CHIPTUNE_TRACK_IDS: readonly ChiptuneTrackId[] = Object.freeze([
  'siren-groves',
  'fallout-drift',
  'cobalt-circuit',
  'rust-horizon',
  'neon-wasteland',
  'static-vault',
  'terminal-pulse',
  'gamma-canopy',
  'rad-storm-echo',
  'bunker-lullaby',
] as const);

export type ChiptuneEvent = Readonly<{
  channel: ChiptuneChannel;
  offsetSeconds: number;
  durationSeconds: number;
  frequencyHz: number;
  gain: number;
  waveform?: OscillatorType;
}>;

export type ChiptuneBar = Readonly<{ root: number; shape: readonly number[] }>;

export type ChiptuneTrack = Readonly<{
  id: ChiptuneTrackId;
  title: string;
  tempoBpm: number;
  leadTonicMidi: number;
  bassTonicMidi: number;
  scaleSemitones: readonly number[];
  progression: readonly ChiptuneBar[];
  leadAccents: readonly number[];
  bassPattern: readonly number[];
  bassOctave: readonly number[];
  leadSustain: number;
  bassSustain: number;
  leadGain: number;
  bassGain: number;
  leadWaveform?: OscillatorType;
  bassWaveform?: OscillatorType;
}>;

/** Track 1 — Siren Groves: A Natural Minor, 124 BPM, 46 bars (89.03 s) */
const SIREN_GROVES_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 4; i++) {
  SIREN_GROVES_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 0, shape: [0, 2, 4, 9] },
    { root: 5, shape: [0, 2, 4, 7] },
    { root: 6, shape: [0, 2, 4, 6] },
    { root: 2, shape: [0, 2, 4, 7] },
    { root: 0, shape: [0, 2, 4, 9] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
  );
}
// Bridge & outro to reach exactly 46 bars
SIREN_GROVES_PROGRESSION.push(
  { root: 5, shape: [0, 2, 4, 7] },
  { root: 6, shape: [0, 2, 4, 6] },
  { root: 0, shape: [0, 2, 4, 7] },
  { root: 3, shape: [0, 2, 4, 7] },
  { root: 4, shape: [0, 2, 4, 6] },
  { root: 5, shape: [0, 2, 4, 7] },
  { root: 6, shape: [0, 2, 4, 6] },
  { root: 0, shape: [0, 2, 4, 7] },
  // Outro cadence (6 bars)
  { root: 3, shape: [0, 2, 4, 7] },
  { root: 4, shape: [0, 2, 4, 6] },
  { root: 5, shape: [0, 2, 4, 7] },
  { root: 6, shape: [0, 2, 4, 6] },
  { root: 0, shape: [0, 2, 4, 9] },
  { root: 0, shape: [0, 2, 4, 7] },
);

const SIREN_GROVES: ChiptuneTrack = Object.freeze({
  id: 'siren-groves',
  title: 'Siren Groves',
  tempoBpm: 124,
  leadTonicMidi: 57, // A3
  bassTonicMidi: 33, // A1
  scaleSemitones: NATURAL_MINOR_SEMITONES,
  progression: Object.freeze(SIREN_GROVES_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    1.0, 0, 0.55, 0.7, 0, 0.6, 0.85, 0,
    0.65, 0, 0.5, 0.75, 0, 0.6, 0.45, 0.35,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0.7, 0.5, 0.9, 0, 0.6, 0.45]),
  bassOctave: Object.freeze([0, 0, 0, 12, 0, 0, 12, 0]),
  leadSustain: 0.92,
  bassSustain: 0.86,
  leadGain: 0.16,
  bassGain: 0.19,
  leadWaveform: 'square',
  bassWaveform: 'square',
});

/** Track 2 — Fallout Drift: E Natural Minor, 96 BPM, 36 bars (90.00 s) */
const FALLOUT_DRIFT_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 6; i++) {
  FALLOUT_DRIFT_PROGRESSION.push(
    { root: 0, shape: [0, 4, 2, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 5, shape: [0, 4, 2, 7] },
    { root: 2, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 4, 2, 6] },
    { root: 0, shape: [0, 2, 4, 9] },
  );
}

const FALLOUT_DRIFT: ChiptuneTrack = Object.freeze({
  id: 'fallout-drift',
  title: 'Fallout Drift',
  tempoBpm: 96,
  leadTonicMidi: 64, // E4
  bassTonicMidi: 28, // E1
  scaleSemitones: NATURAL_MINOR_SEMITONES,
  progression: Object.freeze(FALLOUT_DRIFT_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.9, 0, 0, 0.5, 0, 0.65, 0, 0,
    0.7, 0, 0.45, 0, 0, 0.55, 0, 0.4,
  ]),
  bassPattern: Object.freeze([0.95, 0, 0, 0.55, 0.8, 0, 0.5, 0]),
  bassOctave: Object.freeze([0, 0, 0, 0, 12, 0, 0, 0]),
  leadSustain: 2.6,
  bassSustain: 1.7,
  leadGain: 0.15,
  bassGain: 0.18,
  leadWaveform: 'sawtooth',
  bassWaveform: 'square',
});

/** Track 3 — Cobalt Circuit: D Dorian, 128 BPM, 48 bars (90.00 s) */
const COBALT_CIRCUIT_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 6; i++) {
  COBALT_CIRCUIT_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 3, 5, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 3, 5, 7] },
    { root: 0, shape: [0, 2, 4, 6] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 6, shape: [0, 2, 4, 6] },
    { root: 3, shape: [0, 2, 4, 7] },
  );
}

const COBALT_CIRCUIT: ChiptuneTrack = Object.freeze({
  id: 'cobalt-circuit',
  title: 'Cobalt Circuit',
  tempoBpm: 128,
  leadTonicMidi: 50, // D3
  bassTonicMidi: 26, // D1
  scaleSemitones: DORIAN_SEMITONES,
  progression: Object.freeze(COBALT_CIRCUIT_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.85, 0.4, 0.85, 0, 0.7, 0.5, 0.9, 0,
    0.6, 0.4, 0.8, 0, 0.7, 0.6, 0.5, 0,
  ]),
  bassPattern: Object.freeze([1.0, 0.3, 0.8, 0.3, 1.0, 0.3, 0.8, 0.4]),
  bassOctave: Object.freeze([0, 0, 12, 0, 0, 0, 12, 0]),
  leadSustain: 0.65,
  bassSustain: 0.75,
  leadGain: 0.15,
  bassGain: 0.18,
  leadWaveform: 'square',
  bassWaveform: 'square',
});

/** Track 4 — Rust Horizon: C Natural Minor, 100 BPM, 37 bars (88.80 s) */
const RUST_HORIZON_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 4; i++) {
  RUST_HORIZON_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 5, shape: [0, 2, 4, 7] },
    { root: 2, shape: [0, 2, 4, 7] },
    { root: 6, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 5, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
  );
}
RUST_HORIZON_PROGRESSION.push(
  { root: 0, shape: [0, 2, 4, 7] },
  { root: 5, shape: [0, 2, 4, 7] },
  { root: 3, shape: [0, 2, 4, 7] },
  { root: 4, shape: [0, 2, 4, 6] },
  { root: 0, shape: [0, 2, 4, 7] },
);

const RUST_HORIZON: ChiptuneTrack = Object.freeze({
  id: 'rust-horizon',
  title: 'Rust Horizon',
  tempoBpm: 100,
  leadTonicMidi: 60, // C4
  bassTonicMidi: 36, // C2
  scaleSemitones: NATURAL_MINOR_SEMITONES,
  progression: Object.freeze(RUST_HORIZON_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.95, 0, 0, 0.7, 0, 0.5, 0.8, 0,
    0, 0.6, 0, 0.75, 0.5, 0, 0.4, 0,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0.4, 0, 0.9, 0, 0.5, 0]),
  bassOctave: Object.freeze([0, 0, 0, 12, 0, 0, 0, 12]),
  leadSustain: 1.8,
  bassSustain: 1.2,
  leadGain: 0.16,
  bassGain: 0.19,
  leadWaveform: 'triangle',
  bassWaveform: 'square',
});

/** Track 5 — Neon Wasteland: F# Phrygian, 120 BPM, 45 bars (90.00 s) */
const NEON_WASTELAND_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 5; i++) {
  NEON_WASTELAND_PROGRESSION.push(
    { root: 0, shape: [0, 1, 3, 5] },
    { root: 1, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 1, shape: [0, 2, 4, 7] },
    { root: 0, shape: [0, 1, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
  );
}
NEON_WASTELAND_PROGRESSION.push(
  { root: 0, shape: [0, 1, 3, 5] },
  { root: 1, shape: [0, 2, 4, 6] },
  { root: 3, shape: [0, 2, 4, 7] },
  { root: 1, shape: [0, 2, 4, 7] },
  { root: 0, shape: [0, 2, 4, 7] },
);

const NEON_WASTELAND: ChiptuneTrack = Object.freeze({
  id: 'neon-wasteland',
  title: 'Neon Wasteland',
  tempoBpm: 120,
  leadTonicMidi: 54, // F#3
  bassTonicMidi: 30, // F#1
  scaleSemitones: PHRYGIAN_SEMITONES,
  progression: Object.freeze(NEON_WASTELAND_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.8, 0.5, 0.7, 0.6, 0.85, 0, 0.6, 0.4,
    0.75, 0.5, 0.9, 0, 0.5, 0.6, 0.7, 0.4,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0.6, 0, 0.7, 0.8, 0, 0.5]),
  bassOctave: Object.freeze([0, 12, 0, 0, 12, 0, 0, 12]),
  leadSustain: 0.85,
  bassSustain: 0.90,
  leadGain: 0.15,
  bassGain: 0.18,
  leadWaveform: 'sawtooth',
  bassWaveform: 'square',
});

/** Track 6 — Static Vault: G Mixolydian, 112 BPM, 42 bars (90.00 s) */
const STATIC_VAULT_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 6; i++) {
  STATIC_VAULT_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 6] },
    { root: 6, shape: [0, 2, 4, 6] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 0, shape: [0, 2, 4, 6] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
  );
}

const STATIC_VAULT: ChiptuneTrack = Object.freeze({
  id: 'static-vault',
  title: 'Static Vault',
  tempoBpm: 112,
  leadTonicMidi: 55, // G3
  bassTonicMidi: 31, // G1
  scaleSemitones: MIXOLYDIAN_SEMITONES,
  progression: Object.freeze(STATIC_VAULT_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.9, 0, 0.6, 0.4, 0.8, 0, 0.5, 0,
    0.7, 0, 0.6, 0.5, 0.85, 0, 0.4, 0,
  ]),
  bassPattern: Object.freeze([0.9, 0, 0.7, 0, 0.85, 0, 0.6, 0.4]),
  bassOctave: Object.freeze([0, 0, 7, 0, 0, 0, 7, 12]),
  leadSustain: 1.1,
  bassSustain: 0.95,
  leadGain: 0.16,
  bassGain: 0.18,
  leadWaveform: 'square',
  bassWaveform: 'square',
});

/** Track 7 — Terminal Pulse: B Minor Pentatonic, 135 BPM, 51 bars (90.67 s) */
const TERMINAL_PULSE_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 6; i++) {
  TERMINAL_PULSE_PROGRESSION.push(
    { root: 0, shape: [0, 1, 2, 3] },
    { root: 0, shape: [0, 2, 3, 4] },
    { root: 2, shape: [0, 1, 2, 4] },
    { root: 2, shape: [0, 2, 3, 4] },
    { root: 0, shape: [0, 1, 2, 3] },
    { root: 3, shape: [0, 1, 2, 4] },
    { root: 4, shape: [0, 1, 2, 3] },
    { root: 2, shape: [0, 1, 2, 4] },
  );
}
TERMINAL_PULSE_PROGRESSION.push(
  { root: 0, shape: [0, 1, 2, 3] },
  { root: 2, shape: [0, 1, 2, 4] },
  { root: 0, shape: [0, 1, 2, 3] },
);

const TERMINAL_PULSE: ChiptuneTrack = Object.freeze({
  id: 'terminal-pulse',
  title: 'Terminal Pulse',
  tempoBpm: 135,
  leadTonicMidi: 59, // B3
  bassTonicMidi: 35, // B1
  scaleSemitones: MINOR_PENTATONIC_SEMITONES,
  progression: Object.freeze(TERMINAL_PULSE_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    1.0, 0.6, 0, 0.8, 0.5, 0, 0.9, 0.7,
    0, 0.6, 0.8, 0, 0.5, 0.7, 0.4, 0,
  ]),
  bassPattern: Object.freeze([0.95, 0.6, 0.9, 0.6, 0.95, 0.6, 0.8, 0.7]),
  bassOctave: Object.freeze([0, 12, 0, 12, 0, 12, 0, 12]),
  leadSustain: 0.70,
  bassSustain: 0.80,
  leadGain: 0.14,
  bassGain: 0.17,
  leadWaveform: 'sawtooth',
  bassWaveform: 'square',
});

/** Track 8 — Gamma Canopy: F Natural Minor, 106 BPM, 40 bars (90.57 s) */
const GAMMA_CANOPY_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 5; i++) {
  GAMMA_CANOPY_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 2, shape: [0, 2, 4, 7] },
    { root: 5, shape: [0, 2, 4, 7] },
    { root: 6, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
  );
}

const GAMMA_CANOPY: ChiptuneTrack = Object.freeze({
  id: 'gamma-canopy',
  title: 'Gamma Canopy',
  tempoBpm: 106,
  leadTonicMidi: 53, // F3
  bassTonicMidi: 29, // F1
  scaleSemitones: NATURAL_MINOR_SEMITONES,
  progression: Object.freeze(GAMMA_CANOPY_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.85, 0, 0.5, 0.7, 0.9, 0, 0.6, 0.4,
    0.75, 0, 0.6, 0.8, 0.5, 0.4, 0.6, 0,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0, 0.6, 0.8, 0, 0.5, 0.4]),
  bassOctave: Object.freeze([0, 0, 0, 0, 12, 0, 0, 0]),
  leadSustain: 1.5,
  bassSustain: 1.4,
  leadGain: 0.15,
  bassGain: 0.19,
  leadWaveform: 'triangle',
  bassWaveform: 'square',
});

/** Track 9 — Rad-Storm Echo: C# Natural Minor, 116 BPM, 44 bars (91.03 s) */
const RAD_STORM_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 5; i++) {
  RAD_STORM_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 0, shape: [0, 2, 4, 9] },
    { root: 5, shape: [0, 2, 4, 7] },
    { root: 6, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 4, shape: [0, 2, 4, 6] },
  );
}
RAD_STORM_PROGRESSION.push(
  { root: 0, shape: [0, 2, 4, 7] },
  { root: 5, shape: [0, 2, 4, 7] },
  { root: 4, shape: [0, 2, 4, 6] },
  { root: 0, shape: [0, 2, 4, 7] },
);

const RAD_STORM_ECHO: ChiptuneTrack = Object.freeze({
  id: 'rad-storm-echo',
  title: 'Rad-Storm Echo',
  tempoBpm: 116,
  leadTonicMidi: 61, // C#4
  bassTonicMidi: 37, // C#2
  scaleSemitones: NATURAL_MINOR_SEMITONES,
  progression: Object.freeze(RAD_STORM_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.9, 0.5, 0, 0.7, 0, 0.8, 0.4, 0,
    0.85, 0, 0.6, 0.5, 0, 0.75, 0.4, 0,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0.5, 0.8, 0, 0.6, 0.9, 0]),
  bassOctave: Object.freeze([0, 0, 12, 0, 0, 12, 0, 12]),
  leadSustain: 1.2,
  bassSustain: 0.85,
  leadGain: 0.15,
  bassGain: 0.18,
  leadWaveform: 'square',
  bassWaveform: 'square',
});

/** Track 10 — Bunker Lullaby: G# Natural Minor, 88 BPM, 33 bars (90.00 s) */
const BUNKER_LULLABY_PROGRESSION: ChiptuneBar[] = [];
for (let i = 0; i < 4; i++) {
  BUNKER_LULLABY_PROGRESSION.push(
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
    { root: 0, shape: [0, 2, 4, 7] },
    { root: 5, shape: [0, 2, 4, 7] },
    { root: 2, shape: [0, 2, 4, 7] },
    { root: 3, shape: [0, 2, 4, 7] },
    { root: 4, shape: [0, 2, 4, 6] },
  );
}
BUNKER_LULLABY_PROGRESSION.push({ root: 0, shape: [0, 2, 4, 7] });

const BUNKER_LULLABY: ChiptuneTrack = Object.freeze({
  id: 'bunker-lullaby',
  title: 'Bunker Lullaby',
  tempoBpm: 88,
  leadTonicMidi: 56, // G#3
  bassTonicMidi: 32, // G#1
  scaleSemitones: NATURAL_MINOR_SEMITONES,
  progression: Object.freeze(BUNKER_LULLABY_PROGRESSION.map((b) => Object.freeze({ root: b.root, shape: Object.freeze(b.shape) }))),
  leadAccents: Object.freeze([
    0.95, 0, 0, 0, 0.7, 0, 0.5, 0,
    0.8, 0, 0, 0.6, 0.4, 0, 0.5, 0,
  ]),
  bassPattern: Object.freeze([1.0, 0, 0, 0, 0.7, 0, 0, 0]),
  bassOctave: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
  leadSustain: 2.2,
  bassSustain: 2.0,
  leadGain: 0.15,
  bassGain: 0.17,
  leadWaveform: 'triangle',
  bassWaveform: 'triangle',
});

export const CHIPTUNE_TRACKS: Readonly<Record<ChiptuneTrackId, ChiptuneTrack>> = Object.freeze({
  'siren-groves': SIREN_GROVES,
  'fallout-drift': FALLOUT_DRIFT,
  'cobalt-circuit': COBALT_CIRCUIT,
  'rust-horizon': RUST_HORIZON,
  'neon-wasteland': NEON_WASTELAND,
  'static-vault': STATIC_VAULT,
  'terminal-pulse': TERMINAL_PULSE,
  'gamma-canopy': GAMMA_CANOPY,
  'rad-storm-echo': RAD_STORM_ECHO,
  'bunker-lullaby': BUNKER_LULLABY,
});

/** Equal-tempered frequency of a MIDI note number. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI note for a scale degree, wrapping octaves as the degree passes scale length. */
export function degreeToMidi(
  tonicMidi: number,
  degree: number,
  scale: readonly number[] = NATURAL_MINOR_SEMITONES,
): number {
  const octave = Math.floor(degree / scale.length);
  const step = ((degree % scale.length) + scale.length) % scale.length;
  return tonicMidi + octave * 12 + scale[step];
}

function beatSeconds(track: ChiptuneTrack): number {
  return 60 / track.tempoBpm;
}

/** Seconds in one bar of a track. */
export function chiptuneBarSeconds(id: ChiptuneTrackId): number {
  return beatSeconds(CHIPTUNE_TRACKS[id]) * 4;
}

/** Seconds in one full loop of a track (~90 seconds band [85, 95] s). */
export function chiptuneLoopSeconds(id: ChiptuneTrackId): number {
  return chiptuneBarSeconds(id) * CHIPTUNE_TRACKS[id].progression.length;
}

/**
 * Expands an authored track into one loop of timed events.
 */
export function chiptuneLoopEvents(id: ChiptuneTrackId): readonly ChiptuneEvent[] {
  const track = CHIPTUNE_TRACKS[id];
  const events: ChiptuneEvent[] = [];
  const beat = beatSeconds(track);
  const sixteenth = beat / 4;
  const eighth = beat / 2;
  const barSeconds = beat * 4;
  const scale = track.scaleSemitones ?? NATURAL_MINOR_SEMITONES;

  for (let bar = 0; bar < track.progression.length; bar += 1) {
    const { root, shape } = track.progression[bar];
    const barStart = bar * barSeconds;

    for (let step = 0; step < track.leadAccents.length; step += 1) {
      const accent = track.leadAccents[step];
      if (accent <= 0) continue;
      const shapeIndex = step % shape.length;
      const lift = Math.floor(step / shape.length) % 2 === 1 ? scale.length : 0;
      const degree = root + shape[shapeIndex] + lift;
      const offsetSeconds = barStart + step * sixteenth;
      events.push(Object.freeze({
        channel: 'lead' as const,
        offsetSeconds,
        durationSeconds: leadDuration(track, step, sixteenth),
        frequencyHz: midiToFrequency(degreeToMidi(track.leadTonicMidi, degree, scale)),
        gain: track.leadGain * accent,
        waveform: track.leadWaveform ?? 'square',
      }));
    }

    for (let step = 0; step < track.bassPattern.length; step += 1) {
      const accent = track.bassPattern[step];
      if (accent <= 0) continue;
      const midi = degreeToMidi(track.bassTonicMidi, root, scale) + track.bassOctave[step];
      events.push(Object.freeze({
        channel: 'bass' as const,
        offsetSeconds: barStart + step * eighth,
        durationSeconds: bassDuration(track, step, eighth),
        frequencyHz: midiToFrequency(midi),
        gain: track.bassGain * accent,
        waveform: track.bassWaveform ?? 'square',
      }));
    }
  }

  events.sort((left, right) => left.offsetSeconds - right.offsetSeconds);
  return Object.freeze(events);
}

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
 * Backward compatibility track selector: chooses next track avoiding an immediate repeat.
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
 * Deterministic pseudo-random number generator (Mulberry32).
 */
export function createDeterministicRng(seed: number = 1337): () => number {
  let s = (seed | 0) || 1337;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffles an array of track IDs ensuring:
 * 1. All tracks are present exactly once in the shuffled result.
 * 2. The first track does not equal previousTrack (no immediate repeat across cycles).
 */
export function shuffleTracks(
  tracks: readonly ChiptuneTrackId[] = CHIPTUNE_TRACK_IDS,
  rng: () => number = Math.random,
  previousTrack: ChiptuneTrackId | null = null,
): ChiptuneTrackId[] {
  const result = [...tracks];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  if (previousTrack !== null && result.length > 1 && result[0] === previousTrack) {
    const swapIdx = 1 + Math.floor(rng() * (result.length - 1));
    const tmp = result[0];
    result[0] = result[swapIdx];
    result[swapIdx] = tmp;
  }
  return result;
}

/**
 * Shuffle rotation manager:
 * - Plays all 10 tracks in random order.
 * - No repeat until all 10 tracks have played.
 * - No immediate repeat across cycles (track N+1 !== track N).
 * - Deterministic under a seed.
 */
export class ChiptuneRotation {
  private queue: ChiptuneTrackId[] = [];
  private lastTrack: ChiptuneTrackId | null = null;
  private readonly rng: () => number;
  private readonly tracks: readonly ChiptuneTrackId[];

  constructor(options: {
    seed?: number;
    rng?: () => number;
    tracks?: readonly ChiptuneTrackId[];
    initialLastTrack?: ChiptuneTrackId | null;
  } = {}) {
    this.rng = options.rng ?? (options.seed !== undefined ? createDeterministicRng(options.seed) : Math.random);
    this.tracks = options.tracks ?? CHIPTUNE_TRACK_IDS;
    this.lastTrack = options.initialLastTrack ?? null;
  }

  get currentLastTrack(): ChiptuneTrackId | null {
    return this.lastTrack;
  }

  get remainingInCurrentCycle(): number {
    return this.queue.length;
  }

  nextTrack(): ChiptuneTrackId {
    if (this.queue.length === 0) {
      this.queue = shuffleTracks(this.tracks, this.rng, this.lastTrack);
    }
    const next = this.queue.shift()!;
    this.lastTrack = next;
    return next;
  }

  peekNextTrack(): ChiptuneTrackId {
    if (this.queue.length === 0) {
      this.queue = shuffleTracks(this.tracks, this.rng, this.lastTrack);
    }
    return this.queue[0];
  }
}

/**
 * Calculates the exact timestamp of the next bar boundary.
 */
export function nextBarBoundarySeconds(
  trackId: ChiptuneTrackId,
  trackStartedAtSeconds: number,
  currentTimeSeconds: number,
): number {
  const bar = chiptuneBarSeconds(trackId);
  const elapsed = Math.max(0, currentTimeSeconds - trackStartedAtSeconds);
  const nextBarIndex = Math.floor(elapsed / bar + 1e-6) + 1;
  return trackStartedAtSeconds + nextBarIndex * bar;
}

/** Highest concurrency assertion helper. */
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

/** Lookahead scheduler step for a single track loop. */
export function advanceChiptuneSchedule(
  track: ChiptuneTrackId,
  scheduledUntilSeconds: number,
  loopStartedAtSeconds: number,
  horizonSeconds: number,
): { events: Array<{ event: ChiptuneEvent; atSeconds: number }>; scheduledUntilSeconds: number } {
  const loopMicros = Math.round(chiptuneLoopSeconds(track) * 1e6);
  const untilMicros = Math.max(0, Math.round((scheduledUntilSeconds - loopStartedAtSeconds) * 1e6));
  const horizonMicros = Math.round((horizonSeconds - loopStartedAtSeconds) * 1e6);
  const eventMicros = chiptuneLoopEvents(track).map((event) => ({
    event,
    offsetMicros: Math.round(event.offsetSeconds * 1e6),
  }));
  const toSchedule: Array<{ event: ChiptuneEvent; atSeconds: number }> = [];
  let cursor = untilMicros;
  let guard = 0;
  while (cursor < horizonMicros && guard < 512) {
    guard += 1;
    const iteration = Math.floor(cursor / loopMicros);
    const base = iteration * loopMicros;
    for (const { event, offsetMicros } of eventMicros) {
      const atMicros = base + offsetMicros;
      if (atMicros < cursor || atMicros >= horizonMicros) continue;
      toSchedule.push({ event, atSeconds: loopStartedAtSeconds + atMicros / 1e6 });
    }
    cursor = Math.min(horizonMicros, base + loopMicros);
  }
  return { events: toSchedule, scheduledUntilSeconds: loopStartedAtSeconds + cursor / 1e6 };
}

export type MultiTrackScheduleState = {
  currentTrackId: ChiptuneTrackId;
  trackStartedAtSeconds: number;
  scheduledUntilSeconds: number;
  rotation: ChiptuneRotation;
};

/**
 * Pure multi-track lookahead scheduler that seamlessly rotates tracks on bar boundaries.
 */
export function advanceMultiTrackSchedule(
  state: MultiTrackScheduleState,
  horizonSeconds: number,
  forcedSwapAtBarBoundarySeconds?: number | null,
): {
  events: Array<{ trackId: ChiptuneTrackId; event: ChiptuneEvent; atSeconds: number }>;
  state: MultiTrackScheduleState;
  swaps: Array<{ from: ChiptuneTrackId; to: ChiptuneTrackId; atSeconds: number }>;
} {
  const outEvents: Array<{ trackId: ChiptuneTrackId; event: ChiptuneEvent; atSeconds: number }> = [];
  const swaps: Array<{ from: ChiptuneTrackId; to: ChiptuneTrackId; atSeconds: number }> = [];

  let currentTrack = state.currentTrackId;
  let trackStartedAt = state.trackStartedAtSeconds;
  let scheduledUntil = state.scheduledUntilSeconds;
  let guard = 0;

  while (scheduledUntil < horizonSeconds && guard < 128) {
    guard += 1;
    const duration = chiptuneLoopSeconds(currentTrack);
    const naturalEnd = trackStartedAt + duration;
    const boundary = forcedSwapAtBarBoundarySeconds != null ? forcedSwapAtBarBoundarySeconds : naturalEnd;
    const subHorizon = Math.min(horizonSeconds, boundary);

    const step = advanceChiptuneSchedule(currentTrack, scheduledUntil, trackStartedAt, subHorizon);
    for (const item of step.events) {
      outEvents.push({ trackId: currentTrack, event: item.event, atSeconds: item.atSeconds });
    }
    scheduledUntil = step.scheduledUntilSeconds;

    if (scheduledUntil >= boundary - 1e-6) {
      const nextTrack = state.rotation.nextTrack();
      swaps.push({ from: currentTrack, to: nextTrack, atSeconds: boundary });
      currentTrack = nextTrack;
      trackStartedAt = boundary;
      scheduledUntil = boundary;
      forcedSwapAtBarBoundarySeconds = null;
    } else {
      break;
    }
  }

  return {
    events: outEvents,
    state: {
      currentTrackId: currentTrack,
      trackStartedAtSeconds: trackStartedAt,
      scheduledUntilSeconds: scheduledUntil,
      rotation: state.rotation,
    },
    swaps,
  };
}
