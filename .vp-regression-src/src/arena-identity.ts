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
] as const);

export type ArenaId = typeof ARENA_IDS[number];

const CURRENT_ARENA_IDS: ReadonlySet<string> = new Set(ARENA_IDS);

/** Strict current-id guard; routes, aliases and case variants are rejected. */
export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === 'string' && CURRENT_ARENA_IDS.has(value);
}
