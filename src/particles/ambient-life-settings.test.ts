/**
 * Pass 79 — the player's AIRBORNE DETAIL row.
 *
 * The failure this suite exists to make impossible is the one this project has
 * already paid for three times: a control that resolves, publishes, tests green
 * and reaches no runtime. So the resolver is pinned here and the WIRING is
 * pinned in index.test.ts against the live particle population.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_LIFE_RANGE,
  DEFAULT_AMBIENT_LIFE,
  activeAmbientLife,
  publishAmbientLife,
  resetAmbientLife,
  resolveAmbientLife,
} from './ambient-life-settings';

afterEach(() => { resetAmbientLife(); });

describe('ambient life settings', () => {
  it('defaults to the authored air when nothing has been chosen', () => {
    expect(resolveAmbientLife({})).toEqual({ density: 1, enabled: true });
    expect(DEFAULT_AMBIENT_LIFE.density).toBe(1);
    expect(activeAmbientLife()).toEqual(DEFAULT_AMBIENT_LIFE);
  });

  it('reaches both ends of a real change, and no further', () => {
    expect(resolveAmbientLife({ ambientLife: 0 })).toEqual({ density: 0, enabled: false });
    expect(resolveAmbientLife({ ambientLife: AMBIENT_LIFE_RANGE.maximum }).density)
      .toBe(AMBIENT_LIFE_RANGE.maximum);
    // The row must be able to ask for MORE than the arenas author, or "more
    // dust" is not a thing a player can say.
    expect(AMBIENT_LIFE_RANGE.maximum).toBeGreaterThan(1);
    expect(AMBIENT_LIFE_RANGE.minimum).toBe(0);
  });

  it('degrades a hostile persisted value to playable air, never to a throw', () => {
    for (const hostile of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity, '2' as unknown as number, null as unknown as number]) {
      const resolved = resolveAmbientLife({ ambientLife: hostile });
      expect(Number.isFinite(resolved.density)).toBe(true);
      expect(resolved.density).toBeGreaterThanOrEqual(AMBIENT_LIFE_RANGE.minimum);
      expect(resolved.density).toBeLessThanOrEqual(AMBIENT_LIFE_RANGE.maximum);
    }
    expect(resolveAmbientLife({ ambientLife: 900 }).density).toBe(AMBIENT_LIFE_RANGE.maximum);
    expect(resolveAmbientLife({ ambientLife: -900 }).density).toBe(AMBIENT_LIFE_RANGE.minimum);
  });

  it('is a pure function of its settings, so publishing twice publishes the same numbers', () => {
    const first = resolveAmbientLife({ ambientLife: 1.35 });
    const second = resolveAmbientLife({ ambientLife: 1.35 });
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    publishAmbientLife(first);
    expect(activeAmbientLife()).toEqual(first);
    publishAmbientLife(second);
    expect(activeAmbientLife()).toEqual(first);
  });

  it('resets cleanly so one suite cannot leak air into the next', () => {
    publishAmbientLife(resolveAmbientLife({ ambientLife: 0 }));
    expect(activeAmbientLife().enabled).toBe(false);
    resetAmbientLife();
    expect(activeAmbientLife()).toEqual(DEFAULT_AMBIENT_LIFE);
  });
});
