import { describe, expect, it } from 'vitest';
import {
  consumeFieldSupport,
  createFieldSupportState,
  recordSupportDeath,
  recordSupportElimination,
  triPassSchedule,
} from './field-support';

describe('field support rewards', () => {
  it('unlocks the three original rewards at bounded elimination thresholds', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 7; index += 1) state = recordSupportElimination(state);
    expect(state.streak).toBe(7);
    expect(state.available).toEqual({ 'scout-sweep': true, yardhawk: true, 'tri-pass': true });
  });

  it('resets the live streak on death without deleting already earned support', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 5; index += 1) state = recordSupportElimination(state);
    state = recordSupportDeath(state);
    expect(state.streak).toBe(0);
    expect(state.available['scout-sweep']).toBe(true);
    expect(state.available.yardhawk).toBe(true);
  });

  it('consumes each reward at most once until it is earned again', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 3; index += 1) state = recordSupportElimination(state);
    const first = consumeFieldSupport(state, 'scout-sweep');
    expect(first.activated).toBe(true);
    const fourthElimination = recordSupportElimination(first.state);
    expect(fourthElimination.available['scout-sweep']).toBe(false);
    const second = consumeFieldSupport(fourthElimination, 'scout-sweep');
    expect(second.activated).toBe(false);
  });

  it('schedules exactly three ordered bounded strike passes', () => {
    expect(triPassSchedule(1_000)).toEqual([1_650, 2_550, 3_450]);
  });
});
