/**
 * MAP3 (HF-409): the arena per-frame animation hook.
 *
 * Three properties are load-bearing and each has a failure this pins:
 *
 *  - ONLY THE ACTIVE ARENA TICKS. The arena cache holds two built arenas and a
 *    staged arena exists before it is admitted. A driver that ticked whatever it
 *    was handed would advance a hidden arena's clock behind the loading
 *    transition and burn frame time on geometry nobody can see.
 *  - AN ARENA WITHOUT A HOOK COSTS NOTHING. Every arena but Map 3 has no
 *    `update`, so the frame loop must not pay to build a context for them. The
 *    factory-invocation count is the measurement, not a comment.
 *  - THE CLOCK RESTARTS PER ARENA. Corridor water, rain and crowd motion all key
 *    off `elapsed`; inheriting the previous match's elapsed time would drop the
 *    player into a scene mid-animation with the surface already displaced.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ARENA_FRAME_DT,
  createArenaFrameAnimator,
  type AnimatableArena,
  type ArenaFrameContext,
} from './arena-frame-animation';

function context(arenaId: string): ArenaFrameContext {
  return {
    arenaId,
    cameraPosition: new THREE.Vector3(0, 1.7, 0),
    playerVelocity: new THREE.Vector3(),
  };
}

describe('arena frame animation', () => {
  it('ticks only the arena it is given as active', () => {
    const map3Update = vi.fn();
    const otherUpdate = vi.fn();
    const map3: AnimatableArena = { id: 'map3', update: map3Update };
    const other: AnimatableArena = { id: 'atomic-acres', update: otherUpdate };
    const animator = createArenaFrameAnimator();

    for (let frame = 0; frame < 5; frame += 1) animator.tick(map3, 0.016, () => context('map3'));
    expect(map3Update).toHaveBeenCalledTimes(5);
    // The second arena is BUILT and cached the whole time and is never ticked.
    expect(otherUpdate).not.toHaveBeenCalled();

    for (let frame = 0; frame < 3; frame += 1) {
      animator.tick(other, 0.016, () => context('atomic-acres'));
    }
    expect(otherUpdate).toHaveBeenCalledTimes(3);
    // And the arena that used to be active stops the instant it is not.
    expect(map3Update).toHaveBeenCalledTimes(5);
    expect(animator.telemetry().activeArenaId).toBe('atomic-acres');
    expect(animator.telemetry().arenaChanges).toBe(2);
  });

  it('costs nothing when the active arena has no hook', () => {
    // Every arena except Map 3 is in this state, so this is the common path.
    const plain: AnimatableArena = { id: 'atomic-acres' };
    const makeContext = vi.fn(() => context('atomic-acres'));
    const animator = createArenaFrameAnimator();

    for (let frame = 0; frame < 120; frame += 1) animator.tick(plain, 0.016, makeContext);

    // The context factory is where the per-frame allocation and the vector reads
    // live. Never invoked means the frame genuinely paid nothing.
    expect(makeContext).not.toHaveBeenCalled();
    const telemetry = animator.telemetry();
    expect(telemetry.ticks).toBe(0);
    expect(telemetry.skippedNoHook).toBe(120);
    expect(telemetry.elapsedSeconds).toBe(0);
  });

  it('builds the context once per ticked frame and hands it to the hook', () => {
    const seen: ArenaFrameContext[] = [];
    const map3: AnimatableArena = { id: 'map3', update: (_e, _dt, ctx) => seen.push(ctx) };
    const makeContext = vi.fn(() => context('map3'));
    const animator = createArenaFrameAnimator();

    animator.tick(map3, 0.016, makeContext);
    animator.tick(map3, 0.016, makeContext);

    expect(makeContext).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(2);
    expect(seen[0]!.arenaId).toBe('map3');
  });

  it('restarts the clock when the active arena changes, and accumulates while it does not', () => {
    const elapsed: number[] = [];
    const record = (value: number) => elapsed.push(Number(value.toFixed(4)));
    const first: AnimatableArena = { id: 'map3', update: (e) => record(e) };
    // Same id, different build - a rebuilt arena is a different world.
    const rebuilt: AnimatableArena = { id: 'map3', update: (e) => record(e) };
    const animator = createArenaFrameAnimator();

    animator.tick(first, 0.02, () => context('map3'));
    animator.tick(first, 0.02, () => context('map3'));
    animator.tick(rebuilt, 0.02, () => context('map3'));

    expect(elapsed).toEqual([0.02, 0.04, 0.02]);
    expect(animator.telemetry().arenaChanges).toBe(2);
  });

  it('clamps the frame delta so a backgrounded tab cannot integrate a minute at once', () => {
    const deltas: number[] = [];
    const map3: AnimatableArena = { id: 'map3', update: (_e, dt) => deltas.push(dt) };
    const animator = createArenaFrameAnimator();

    animator.tick(map3, 60, () => context('map3'));
    animator.tick(map3, -1, () => context('map3'));
    animator.tick(map3, Number.NaN, () => context('map3'));

    expect(deltas).toEqual([MAX_ARENA_FRAME_DT, 0, 0]);
    expect(animator.telemetry().elapsedSeconds).toBeCloseTo(MAX_ARENA_FRAME_DT, 10);
  });

  it('holds the arena across frames that pass none, instead of restarting its clock', () => {
    // Menu-open and pause frames pass no arena. Clearing on those would make the
    // water jump back to t=0 every time the player opened the menu.
    const elapsed: number[] = [];
    const map3: AnimatableArena = { id: 'map3', update: (e) => elapsed.push(Number(e.toFixed(4))) };
    const animator = createArenaFrameAnimator();

    animator.tick(map3, 0.02, () => context('map3'));
    expect(animator.tick(null, 0.02, () => context('map3'))).toBe(false);
    expect(animator.tick(undefined, 0.02, () => context('map3'))).toBe(false);
    animator.tick(map3, 0.02, () => context('map3'));

    expect(elapsed).toEqual([0.02, 0.04]);
    expect(animator.telemetry().skippedNoArena).toBe(2);
    expect(animator.telemetry().arenaChanges).toBe(1);
  });

  it('starts the next arena at zero after an explicit reset', () => {
    const elapsed: number[] = [];
    const map3: AnimatableArena = { id: 'map3', update: (e) => elapsed.push(Number(e.toFixed(4))) };
    const animator = createArenaFrameAnimator();

    animator.tick(map3, 0.02, () => context('map3'));
    animator.reset();
    expect(animator.telemetry().activeArenaId).toBeNull();
    animator.tick(map3, 0.02, () => context('map3'));

    expect(elapsed).toEqual([0.02, 0.02]);
  });
});
