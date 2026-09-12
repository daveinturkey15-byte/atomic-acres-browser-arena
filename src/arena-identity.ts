/**
 * Lightweight canonical arena identity boundary.
 *
 * Protocol and persistence validators import this module instead of the full
 * selector registry so validation cannot initialize gameplay/bot systems in a
 * partially constructed module cycle.
 */
export const ARENA_IDS = Object.freeze([
  // HF-495 (owner, 2026-09-04): the canonical arena catalog now opens with
  // Nuke Town Rebuild and Raid Rebuild; the remaining stable ids retain order.
  'nuketown2',
  'raid2',
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
] as const);

export type ArenaId = typeof ARENA_IDS[number];

const CURRENT_ARENA_IDS: ReadonlySet<string> = new Set(ARENA_IDS);

/** Strict current-id guard; routes, aliases and case variants are rejected. */
export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === 'string' && CURRENT_ARENA_IDS.has(value);
}
