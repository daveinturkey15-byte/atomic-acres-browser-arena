/**
 * Lightweight canonical arena identity boundary.
 *
 * Protocol and persistence validators import this module instead of the full
 * selector registry so validation cannot initialize gameplay/bot systems in a
 * partially constructed module cycle.
 */
export const ARENA_IDS = Object.freeze([
  'atomic-acres',
  'skyline-terminal',
  'rustworks-1v1',
  'gun-range',
  'farcrysis',
  'high-seas',
  'test1',
  'test2',
  // MAP3 (owner 2026-09-02, HF-405). Ships PREVIEW and solo-only, but the
  // id is the network, replay and storage boundary from the first commit:
  // promoting it later must never require moving it.
  'map3',
  // RAID2 (owner 2026-09-02, HF-408): the Raid layout rethink. Ships beside the
  // shipped Raid (`test2`), which keeps its id, so a saved match, a replay or an
  // old link that names `test2` still resolves to the map it was recorded on.
  'raid2',
] as const);

export type ArenaId = typeof ARENA_IDS[number];

const CURRENT_ARENA_IDS: ReadonlySet<string> = new Set(ARENA_IDS);

/** Strict current-id guard; routes, aliases and case variants are rejected. */
export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === 'string' && CURRENT_ARENA_IDS.has(value);
}
