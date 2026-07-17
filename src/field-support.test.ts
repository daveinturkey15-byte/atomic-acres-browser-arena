import { describe, expect, it } from 'vitest';
import {
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
  consumeFieldSupport,
  createFieldSupportState,
  createTriPassTargeting,
  registerTriPassTarget,
  recordSupportDeath,
  recordSupportElimination,
  triPassSchedule,
} from './field-support';

describe('field support rewards', () => {
  it('unlocks the three original rewards at bounded elimination thresholds', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 7; index += 1) state = recordSupportElimination(state);
    expect(state.streak).toBe(7);
    expect(state.rewardCycle).toBe(0);
    expect(state.available).toEqual({ 'scout-sweep': true, yardhawk: true, 'tri-pass': true });
  });

  it('starts a fresh reward cycle immediately after the final streak without requiring death', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 3; index += 1) state = recordSupportElimination(state);
    state = consumeFieldSupport(state, 'scout-sweep').state;
    for (let index = 0; index < 4; index += 1) state = recordSupportElimination(state);
    expect(state.streak).toBe(7);
    expect(state.rewardCycle).toBe(0);
    expect(state.available['tri-pass']).toBe(true);
    for (let index = 0; index < 3; index += 1) state = recordSupportElimination(state);
    expect(state.streak).toBe(10);
    expect(state.rewardCycle).toBe(3);
    expect(state.available['scout-sweep']).toBe(true);
  });

  it('resets the live streak on death without deleting already earned support', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 5; index += 1) state = recordSupportElimination(state);
    state = recordSupportDeath(state);
    expect(state.streak).toBe(0);
    expect(state.rewardCycle).toBe(0);
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

  it('gives the owner-approved Tri-Pass a decisive blast contract', () => {
    expect(TRI_PASS_BLAST_RADIUS).toBe(7.5);
    expect(TRI_PASS_MAX_DAMAGE).toBe(225);
  });

  it('accepts exactly three in-bounds tactical-map points and refuses a fourth', () => {
    const bounds = { minX: -34, maxX: 34, minZ: -43, maxZ: 43 };
    let targeting = createTriPassTargeting();
    targeting = registerTriPassTarget(targeting, { x: -20, z: -30 }, bounds);
    targeting = registerTriPassTarget(targeting, { x: 0, z: 0 }, bounds);
    targeting = registerTriPassTarget(targeting, { x: 20, z: 30 }, bounds);
    const unchanged = registerTriPassTarget(targeting, { x: 10, z: 10 }, bounds);
    expect(targeting.points).toHaveLength(3);
    expect(targeting.complete).toBe(true);
    expect(unchanged).toEqual(targeting);
  });

  it('rejects out-of-bounds tactical-map points', () => {
    const targeting = registerTriPassTarget(createTriPassTargeting(), { x: 99, z: 0 }, { minX: -34, maxX: 34, minZ: -43, maxZ: 43 });
    expect(targeting.points).toHaveLength(0);
    expect(targeting.complete).toBe(false);
  });

  it('schedules exactly three simultaneous missile impacts one second after confirmation', () => {
    expect(triPassSchedule(1_000)).toEqual([2_000, 2_000, 2_000]);
  });
});
