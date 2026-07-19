import { describe, expect, it } from 'vitest';
import {
  HUNTER_SWARM_COUNT,
  NUKE_DAMAGE,
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
  assignHunterSwarmTargets,
  consumeFieldSupport,
  createFieldSupportState,
  createTriPassTargeting,
  cycleFieldSupportSelection,
  hunterSwarmDamage,
  nukeDamageForTarget,
  registerTriPassTarget,
  recordSupportDeath,
  recordSupportElimination,
  remoteExplosiveHitMaximumDistance,
  triPassSchedule,
} from './field-support';

describe('field support rewards', () => {
  it('unlocks the three original rewards at bounded elimination thresholds', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 7; index += 1) state = recordSupportElimination(state);
    expect(state.streak).toBe(7);
    expect(state.rewardCycle).toBe(0);
    expect(state.available).toEqual({
      'scout-sweep': true,
      yardhawk: true,
      'tri-pass': true,
      'hunter-swarm': false,
      nuke: false,
    });
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

  it('drops unused one-use-per-life rewards on death so they cannot be carried and earned twice', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 15; index += 1) state = recordSupportElimination(state);
    expect(state.available['hunter-swarm']).toBe(true);
    expect(state.available.nuke).toBe(true);
    state = recordSupportDeath(state);
    expect(state.available['hunter-swarm']).toBe(false);
    expect(state.available.nuke).toBe(false);
    expect(consumeFieldSupport(state, 'hunter-swarm').activated).toBe(false);
    for (let index = 0; index < 8; index += 1) state = recordSupportElimination(state);
    expect(consumeFieldSupport(state, 'hunter-swarm').activated).toBe(true);
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
    expect(TRI_PASS_BLAST_RADIUS).toBe(15);
    expect(TRI_PASS_MAX_DAMAGE).toBe(450);
    expect(remoteExplosiveHitMaximumDistance('tri-pass')).toBeGreaterThan(15);
    expect(remoteExplosiveHitMaximumDistance('grenade')).toBe(6.2);
  });

  it('cycles every support for standard-gamepad selection', () => {
    expect(cycleFieldSupportSelection('scout-sweep', -1)).toBe('nuke');
    expect(cycleFieldSupportSelection('tri-pass', 1)).toBe('hunter-swarm');
    expect(cycleFieldSupportSelection('hunter-swarm', 1)).toBe('nuke');
  });

  it('unlocks Hunter Swarm and Nuke once per uninterrupted life while keeping 3/5/7 repeatable', () => {
    let state = createFieldSupportState();
    for (let index = 0; index < 15; index += 1) state = recordSupportElimination(state);
    expect(state.streak).toBe(15);
    expect(state.available['hunter-swarm']).toBe(true);
    expect(state.available.nuke).toBe(true);
    state = consumeFieldSupport(consumeFieldSupport(state, 'hunter-swarm').state, 'nuke').state;
    for (let index = 0; index < 7; index += 1) state = recordSupportElimination(state);
    expect(state.available['hunter-swarm']).toBe(false);
    expect(state.available.nuke).toBe(false);
    expect(state.available['tri-pass']).toBe(true);
    state = recordSupportDeath(state);
    for (let index = 0; index < 8; index += 1) state = recordSupportElimination(state);
    expect(state.available['hunter-swarm']).toBe(true);
  });

  it('assigns exactly five deterministic hostile Hunter Swarm targets and excludes friendlies/dead targets', () => {
    const assignments = assignHunterSwarmTargets([
      { id: 'friend', team: 0, alive: true, distanceFromCentreSq: 1 },
      { id: 'dead', team: 1, alive: false, distanceFromCentreSq: 0 },
      { id: 'far', team: 1, alive: true, distanceFromCentreSq: 25 },
      { id: 'near', team: 1, alive: true, distanceFromCentreSq: 4 },
    ], 0);
    expect(assignments).toHaveLength(HUNTER_SWARM_COUNT);
    expect(assignments).toEqual(['near', 'far', 'near', 'far', 'near']);
  });

  it('makes direct Hunter hits lethal unless prone and bounds splash damage', () => {
    expect(hunterSwarmDamage(0.2, 'stand')).toBe(200);
    expect(hunterSwarmDamage(0.2, 'crouch')).toBe(200);
    expect(hunterSwarmDamage(0.2, 'prone')).toBe(18);
    expect(hunterSwarmDamage(2, 'stand')).toBe(100);
    expect(hunterSwarmDamage(2, 'prone')).toBe(9);
    expect(hunterSwarmDamage(0.2, 'prone') * HUNTER_SWARM_COUNT).toBeLessThan(100);
    expect(hunterSwarmDamage(5, 'stand')).toBe(0);
  });

  it('applies nuke damage once to living hostiles only', () => {
    expect(nukeDamageForTarget(0, 1, true)).toBe(NUKE_DAMAGE);
    expect(nukeDamageForTarget(0, 0, true)).toBe(0);
    expect(nukeDamageForTarget(0, 1, false)).toBe(0);
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
