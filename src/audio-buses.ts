import { GAME_MUSIC_BUS_GAIN } from './chiptune-music';

export const AUDIO_BUS_IDS = Object.freeze([
  'master',
  'sfx',
  'movement',
  'ui',
  'announcements',
  'ambience',
  'menu-music',
  'game-music',
] as const);

export type AudioBusId = typeof AUDIO_BUS_IDS[number];

/**
 * PASS 95 audio-polish (HF-491 / HF-509): the five mix GROUPS a shipped
 * shooter is balanced in. Every runtime bus belongs to exactly one group; the
 * group is what the level table is authored against and what a future master
 * section (ducking, per-group limiting) hangs off. Bus IDs are the stable API
 * the killstreak-awareness lane and the settings surface both key on, so the
 * groups are a projection over them, never a replacement.
 */
export const AUDIO_MIX_GROUP_IDS = Object.freeze(['master', 'music', 'sfx', 'ui', 'voice'] as const);

export type AudioMixGroupId = typeof AUDIO_MIX_GROUP_IDS[number];

export type AudioBusLevel = Readonly<{
  group: AudioMixGroupId;
  /** Linear base gain applied before the persisted 0..100 slider. */
  gain: number;
  /** What the bus carries, so the level can be argued about. */
  carries: string;
}>;

/**
 * THE level table. One source of truth for every bus coefficient the graph
 * applies: `unlock()` creates each bus from it and `applyBusSetting()` re-reads
 * it. Two earlier regressions (2026-08-29 game-music, then menu-music) came from
 * the same number living in two places and only one of them being changed.
 *
 * Levels are linear; `audioBusLevelDb()` prints them for the report.
 */
export const AUDIO_BUS_LEVEL_TABLE: Readonly<Record<AudioBusId, AudioBusLevel>> = Object.freeze({
  master: Object.freeze({ group: 'master', gain: 0.34, carries: 'sum of every group, into the -1 dB 20:1 safety limiter' }),
  sfx: Object.freeze({ group: 'sfx', gain: 0.78, carries: 'weapon reports, impacts, explosions, doors, vehicles, glass' }),
  movement: Object.freeze({ group: 'sfx', gain: 0.3, carries: 'footsteps, landings, jumps, foley for the player and every world actor' }),
  ambience: Object.freeze({ group: 'sfx', gain: 0.12, carries: 'arena bed, air layer, intermittent ambient events, report tails' }),
  ui: Object.freeze({ group: 'ui', gain: 0.45, carries: 'hit/kill confirms, menu and match cues; restrained below gunfire' }),
  announcements: Object.freeze({ group: 'voice', gain: 0.55, carries: 'match countdown, stingers, killstreak and objective announcements' }),
  // Owner 2026-08-30: third halving alongside the game-music bus. The old
  // busBaseGain() fallthrough answered 0.18 and silently overwrote this at
  // configure() time; the table is now the only answer.
  'menu-music': Object.freeze({ group: 'music', gain: 0.045, carries: 'menu chiptune bed' }),
  'game-music': Object.freeze({ group: 'music', gain: GAME_MUSIC_BUS_GAIN, carries: 'in-match chiptune rotation, ducked to 24% under reports' }),
});

export function audioBusBaseGain(id: AudioBusId): number {
  return AUDIO_BUS_LEVEL_TABLE[id].gain;
}

export function audioBusLevelDb(id: AudioBusId): number {
  return Number((20 * Math.log10(AUDIO_BUS_LEVEL_TABLE[id].gain)).toFixed(1));
}

export function audioBusesInGroup(group: AudioMixGroupId): readonly AudioBusId[] {
  return Object.freeze(AUDIO_BUS_IDS.filter((id) => AUDIO_BUS_LEVEL_TABLE[id].group === group));
}
