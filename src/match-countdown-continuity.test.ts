import { describe, expect, it } from 'vitest';
import { preserveSoloCountdownCue } from './match-countdown-continuity';

const warmup = { phase: 'warmup' as const, phaseStartedAt: 0, endsAt: 3_000, winner: null };

describe('single-player countdown continuity', () => {
  it('restores 3 when first presentation arrives after a startup stall', () => {
    const state = preserveSoloCountdownCue(warmup, 2_400, null, true);
    expect(state).toMatchObject({ phaseStartedAt: 2_400, endsAt: 5_400 });
    expect(Math.ceil((state.endsAt - 2_400) / 1_000)).toBe(3);
  });

  it('does not skip 2 or 1 across multi-second render stalls', () => {
    const two = preserveSoloCountdownCue(warmup, 3_500, '3', true);
    expect(Math.ceil((two.endsAt - 3_500) / 1_000)).toBe(2);
    const one = preserveSoloCountdownCue(two, 6_000, '2', true);
    expect(Math.ceil((one.endsAt - 6_000) / 1_000)).toBe(1);
  });

  it('never moves the synchronized multiplayer clock or delays ENGAGE after 1', () => {
    expect(preserveSoloCountdownCue(warmup, 3_500, '3', false)).toBe(warmup);
    expect(preserveSoloCountdownCue(warmup, 3_500, '1', true)).toBe(warmup);
  });

  it('does not rewrite a healthy next cue', () => {
    expect(preserveSoloCountdownCue(warmup, 1_100, '3', true)).toBe(warmup);
    expect(preserveSoloCountdownCue(warmup, 2_100, '2', true)).toBe(warmup);
  });
});

/**
 * THE EXPLORE WARMUP DEADLOCK (HF-409 finisher 3).
 *
 * This helper holds warmup open until the next 3-2-1 edge has been presented,
 * so a solo render stall cannot swallow one. It decides "not yet" from
 * `previous === null` meaning "'3' has not been shown".
 *
 * An EXPLORE arena never shows '3' - it counts nothing in - so `previous`
 * stays null forever and the hold never lifts. `advanceMatch` only leaves
 * warmup when `now >= endsAt`, and this pushes `endsAt` forward every frame, so
 * the match stays in warmup permanently. Because `gameplayInputEnabled()`
 * requires `phase === 'active'`, Map 3 rendered correctly at 53 fps, showed a
 * correct explore HUD, and refused every movement input - forever.
 *
 * The caller now passes `solo && countdownCueAllowed`, so an arena with no
 * countdown is not held for one. These pin both directions.
 */
describe('warmup must not be held for a countdown that will never play', () => {
  const warmup = { phase: 'warmup', phaseStartedAt: 0, endsAt: 3_000, winner: null } as const;

  it('holds warmup while a countdown IS expected, as before', () => {
    // now = 2500 leaves 0.5 s displayed, below the expected '3', so the helper
    // pushes endsAt out - the behaviour that protects a stalled solo boot.
    const held = preserveSoloCountdownCue(warmup, 2_500, null, true);
    expect(held.endsAt).toBeGreaterThan(warmup.endsAt);
  });

  it('does NOT hold warmup when the arena presents no countdown', () => {
    // The explore case: the caller passes false, and warmup is returned
    // untouched so advanceMatch can end it on schedule.
    const free = preserveSoloCountdownCue(warmup, 2_500, null, false);
    expect(free).toBe(warmup);
    expect(free.endsAt).toBe(warmup.endsAt);
  });

  it('would otherwise hold warmup open indefinitely - the actual deadlock', () => {
    // Simulate frames advancing with no cue ever presented. Each call pushes
    // endsAt past `now` again, so `now >= endsAt` is never reached.
    let state: typeof warmup | ReturnType<typeof preserveSoloCountdownCue> = warmup;
    for (let now = 2_500; now < 120_000; now += 2_500) {
      state = preserveSoloCountdownCue(state, now, null, true);
      expect(state.endsAt).toBeGreaterThan(now);
    }
  });
});
