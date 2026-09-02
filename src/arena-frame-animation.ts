/**
 * MAP3: the arena per-frame animation hook (HF-409).
 *
 * WHY THIS EXISTS.
 *
 * `ArenaMap` describes a built arena as geometry plus authority: a root, its
 * colliders, its shot surfaces, its spawns. Nothing in it moves. That is true
 * of every arena shipped before Map 3 because their motion belongs to systems
 * that already own a frame - grass, weather, water, glass, targets - and none
 * of it is arena-authored.
 *
 * The Map 3 showcase is the first arena content that animates itself. Its eight
 * corridors each publish an `update(elapsed, dt, cameraPosition, playerVelocity)`
 * and drive every time-varying uniform from it: the water surface and its
 * buoyancy, rain and its splashes, the god-ray volume, the physics bay, the
 * colosseum crowd. Dropped into an arena root with no per-frame call, all eight
 * would arrive FROZEN - still water, still rain, static god rays - which looks
 * exactly like broken content and is one of the three reasons the showcase was
 * not imported into the arena in the first place.
 *
 * WHAT THIS DELIBERATELY IS NOT.
 *
 * It is not a general update bus, and arenas do not get to schedule work. There
 * is exactly one call per frame, from one site in the frame loop, on exactly one
 * arena: the ACTIVE one. That matters because the arena cache holds up to two
 * built arenas at once (`ARENA_CACHE_BOUND`) and a staged arena is constructed
 * into a detached scene before it is admitted; ticking either would burn frame
 * time on geometry nobody is looking at and, worse, would advance a not-yet-
 * admitted arena's clock behind the loading transition. The animator therefore
 * refuses to tick anything but the arena it was handed as active, and restarts
 * its clock from zero whenever that identity changes, so an arena always begins
 * its animation at t=0 on entry rather than inheriting the previous match's
 * elapsed time.
 *
 * COSTS NOTHING WHEN ABSENT is a property, not an aspiration: for an arena
 * without an `update`, `tick` does one optional-property read and returns. The
 * context is built by a callback the animator invokes ONLY when a hook exists,
 * so an arena with no hook does not pay for the vectors, the object literal or
 * the reads that fill it. `arena-frame-animation.test.ts` asserts exactly that
 * by counting factory invocations.
 */
import type * as THREE from 'three';

/** What an arena's animation is allowed to know about the frame it is drawing. */
export type ArenaFrameContext = {
  /** The active arena's id, so one shared hook implementation can branch. */
  readonly arenaId: string;
  /** The camera's world position this frame. Read-only to the arena. */
  readonly cameraPosition: THREE.Vector3;
  /** The local player's world velocity in m/s. Read-only to the arena. */
  readonly playerVelocity: THREE.Vector3;
};

/**
 * `elapsedSeconds` counts from the moment this arena became active, and
 * `dtSeconds` is the clamped frame delta - never negative, never larger than
 * `MAX_ARENA_FRAME_DT`.
 */
export type ArenaFrameUpdate = (
  elapsedSeconds: number,
  dtSeconds: number,
  context: ArenaFrameContext,
) => void;

/** The part of an `ArenaMap` this driver needs. Structural, so tests need no arena. */
export type AnimatableArena = {
  readonly id: string;
  readonly update?: ArenaFrameUpdate;
};

/**
 * Frame-delta clamp, in seconds.
 *
 * 0.05 s = the value the showcase's own loop uses, and the value the game's
 * frame loop already clamps `frameDt` to. It is not a smoothing choice: a tab
 * that was backgrounded for a minute returns one enormous delta, and an
 * unclamped arena animation would integrate a minute of rain, water and crowd
 * motion inside a single frame. The camera-shake divergence on 2026-08-31 was
 * this exact class of bug with a looser clamp.
 */
export const MAX_ARENA_FRAME_DT = 0.05;

export type ArenaFrameAnimatorTelemetry = {
  /** Frames on which an arena hook actually ran. */
  readonly ticks: number;
  /** Frames on which the active arena had no hook: the zero-cost path. */
  readonly skippedNoHook: number;
  /** Frames on which there was no active arena at all (menu, teardown). */
  readonly skippedNoArena: number;
  /** Times the active arena changed identity and the clock restarted. */
  readonly arenaChanges: number;
  /** Seconds the CURRENT active arena has been animating. */
  readonly elapsedSeconds: number;
  /** Id of the arena the animator considers active, or null. */
  readonly activeArenaId: string | null;
};

export type ArenaFrameAnimator = {
  /**
   * Advance the active arena's animation by one frame.
   *
   * `makeContext` is invoked at most once, and only when the active arena has
   * an `update`. Returns true when a hook ran, so a caller can account for it.
   */
  tick(
    active: AnimatableArena | null | undefined,
    dtSeconds: number,
    makeContext: () => ArenaFrameContext,
  ): boolean;
  /** Forget the current arena, so the next one starts its clock at zero. */
  reset(): void;
  telemetry(): ArenaFrameAnimatorTelemetry;
};

export function createArenaFrameAnimator(): ArenaFrameAnimator {
  // Identity, not id: two builds of the same arena id are different worlds with
  // different uniforms, and the second must not inherit the first's clock.
  let activeArena: AnimatableArena | null = null;
  let elapsedSeconds = 0;
  let ticks = 0;
  let skippedNoHook = 0;
  let skippedNoArena = 0;
  let arenaChanges = 0;

  return {
    tick(active, dtSeconds, makeContext) {
      if (!active) {
        // Do NOT clear activeArena here. A paused or menu frame passes nothing
        // for a few frames and the same arena comes back; restarting its clock
        // on every such gap would make the water jump every time the menu opens.
        skippedNoArena += 1;
        return false;
      }
      if (active !== activeArena) {
        activeArena = active;
        elapsedSeconds = 0;
        arenaChanges += 1;
      }
      if (typeof active.update !== 'function') {
        skippedNoHook += 1;
        return false;
      }
      const dt = Number.isFinite(dtSeconds) ? Math.min(Math.max(dtSeconds, 0), MAX_ARENA_FRAME_DT) : 0;
      elapsedSeconds += dt;
      ticks += 1;
      active.update(elapsedSeconds, dt, makeContext());
      return true;
    },
    reset() {
      activeArena = null;
      elapsedSeconds = 0;
    },
    telemetry() {
      return {
        ticks,
        skippedNoHook,
        skippedNoArena,
        arenaChanges,
        elapsedSeconds,
        activeArenaId: activeArena?.id ?? null,
      };
    },
  };
}
