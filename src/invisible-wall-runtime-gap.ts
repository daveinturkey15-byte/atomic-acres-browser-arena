/**
 * Pass 80: pure decision rule for the invisible-wall regression-window guard
 * wired into legacy-main.ts activeWorldColliders(). The early-return branch of
 * that function serves the pre-runtime path by re-exposing the authored arena
 * colliders verbatim — including houseDestruction.staticColliders, which the
 * interactive runtime normally REPLACES with visible dynamic bodies. If that
 * branch runs on the LIVE arena while interactiveWorldRuntime is null, those
 * hidden house colliders come back live as invisible walls.
 *
 * Kept pure (no three.js, no DOM, no module state beyond the caller's latch)
 * so a unit test can simulate the null-runtime state without booting the
 * 33k-line game module.
 */
export type InvisibleWallRuntimeGapInput = {
  /** activeArena === arena — the guard only speaks for the LIVE arena. */
  sameArena: boolean;
  /** activeArena.houseDestruction?.staticColliders.length ?? 0 */
  runtimeReplacedStaticCount: number;
  /** interactiveWorldRuntime !== null */
  hasInteractiveRuntime: boolean;
  /**
   * Module-level one-shot latch owned by legacy-main.ts: the error logs at
   * most once per session so a hot frame loop cannot flood the console.
   */
  alreadyLogged: boolean;
};

export const INVISIBLE_WALL_RUNTIME_GAP_MESSAGE =
  '[invisible-wall] active arena has runtime-replaced statics but no interactive runtime; hidden house colliders are live';

export function evaluateInvisibleWallRuntimeGap(
  input: InvisibleWallRuntimeGapInput,
): { shouldLog: boolean } {
  return {
    shouldLog: input.sameArena
      && !input.hasInteractiveRuntime
      && input.runtimeReplacedStaticCount > 0
      && !input.alreadyLogged,
  };
}
