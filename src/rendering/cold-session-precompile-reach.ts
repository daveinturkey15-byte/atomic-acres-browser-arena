import { ARENA_IDS, type ArenaId } from '../arena-identity';

/**
 * Arenas whose OWN vocabulary has been MEASURED to exceed the 12 s admission
 * fence when it is realised inside a cold session's first fenced submission.
 *
 * WHY THIS EXISTS AS AN AUTHORITY RATHER THAN AN `id ===` IN THE TRANSITION
 * -----------------------------------------------------------------------
 * Pass 84 (lane C) discovered that farcrysis loses that race: its warm frame
 * realised 134-217 cold render pipelines synchronously inside submission 1 and
 * reported "WebGPU queue completion exceeded 12000 ms for submission 1 ...
 * fenced draws 1017", the selection rolled back, and the stuck submission then
 * failed the NEXT arena's fence as well. Atomic Acres compiles 75 there and
 * passes. So the relief was gated on the arena id, inline in the transition.
 *
 * Pass 85 lane H removed that gate entirely, on the correct observation that
 * HF-417 - the same failure on an IN-SESSION SWITCH - is not arena-specific at
 * all: whichever arena is entered second pays for its whole cold vocabulary
 * inside one fenced submission. That fix is right and it took the 56-pair
 * switch matrix from 55/56 to 56/56.
 *
 * But it also applied the relief to COLD SESSIONS, where it is not free and
 * mostly not needed. Measured 2026-09-03 (lane H2), interleaved A/B on the same
 * machine minutes apart, internal control x0.99-x1.02:
 *
 *   gun-range first load, `visual-definition` phase
 *     PASS 86 baseline                     4 398 / 4 404 ms
 *     relief over the whole scene         12 981 ms   (+8 583)
 *     relief over the arena root only     10 049 ms   (+5 645)
 *
 * and `coverage-submit-fence` did not fall to pay for either (x1.00), so on a
 * cold session the work is ADDED, not moved: the coverage precompile downstream
 * realises the same set off the fence anyway, and the warm frame in between
 * clears 12 s comfortably on every arena but the one below.
 *
 * So the cold-session relief goes back to being scoped - but to a NAMED,
 * TESTED, EVIDENCED authority instead of an `id ===` buried in a 35 000-line
 * transition. The transition asks this module; `src/presentation-prewarm-
 * contract.test.ts` still pins that the region contains ZERO arena-id branches;
 * and `cold-session-precompile-reach.test.ts` pins that every member here is a
 * real arena id and that the set is non-empty, so a rename cannot silently empty
 * it the way a hand-typed roster does.
 *
 * TO REMOVE AN ENTRY you need the measurement that removing the gate did not
 * reintroduce the fence failure on a COLD boot of that arena, not an argument.
 */
const MEASURED_COLD_SESSION_FENCE_LOSERS: readonly string[] = Object.freeze(['farcrysis']);

export const COLD_SESSION_PRECOMPILE_ARENAS: readonly ArenaId[] = Object.freeze(
  ARENA_IDS.filter((id) => MEASURED_COLD_SESSION_FENCE_LOSERS.includes(id)),
);

/**
 * True when this arena's first fenced submission of a cold session must find its
 * vocabulary already realised. An in-session switch never asks this: there the
 * relief is unconditional, because the renderer's cache holds a DIFFERENT
 * arena's permutations and any arena can lose that race.
 */
export function arenaNeedsColdSessionPrecompile(arena: { readonly id: string }): boolean {
  return (COLD_SESSION_PRECOMPILE_ARENAS as readonly string[]).includes(arena.id);
}
