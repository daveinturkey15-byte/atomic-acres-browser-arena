import { describe, expect, it } from 'vitest';
import {
  HUNTER_SWARM_COUNT,
  NUKE_DAMAGE,
  SCOUT_SWEEP_PULSE_INTERVAL_MS,
  SCOUT_SWEEP_PULSE_VISIBLE_MS,
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
  assignHunterSwarmTargets,
  createTriPassTargeting,
  cycleFieldSupportSelection,
  hunterSwarmDamage,
  nukeDamageForTarget,
  projectFieldSupportActor,
  registerTriPassTarget,
  remoteExplosiveHitMaximumDistance,
  scoutSweepPulseVisible,
  selectTriPassHostiles,
  triPassSchedule,
} from './field-support';

describe('field support rewards', () => {
  it('reveals hostiles only during bounded Scout Sweep radar pulses', () => {
    const until = 12_000;
    expect(SCOUT_SWEEP_PULSE_INTERVAL_MS).toBe(3_000);
    expect(SCOUT_SWEEP_PULSE_VISIBLE_MS).toBe(1_500);
    expect(scoutSweepPulseVisible(100, until)).toBe(true);
    expect(scoutSweepPulseVisible(1_499, until)).toBe(true);
    expect(scoutSweepPulseVisible(1_500, until)).toBe(false);
    expect(scoutSweepPulseVisible(2_999, until)).toBe(false);
    expect(scoutSweepPulseVisible(3_000, until)).toBe(true);
    expect(scoutSweepPulseVisible(4_499, until)).toBe(true);
    expect(scoutSweepPulseVisible(4_500, until)).toBe(false);
    expect(scoutSweepPulseVisible(until, until)).toBe(false);
  });
  it('projects canonical actor rewards for legacy HUD/input without owning mutable reward state', () => {
    const loadout = {
      schemaVersion: 1 as const,
      slots: ['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke'] as const,
    };
    const projection = projectFieldSupportActor({
      streak: 17,
      loadout,
      available: ['yardhawk', 'tri-pass'],
      revealedCareRewards: ['nuke'],
    });
    expect(projection.streak).toBe(17);
    expect(projection.rewardCycle).toBe(3);
    expect(projection.available).toMatchObject({
      'care-package': true,
      'scout-sweep': false,
      yardhawk: true,
      'tri-pass': true,
      adrenaline: false,
      'piloted-drone': false,
      'carpet-bomber': false,
      'hunter-swarm': false,
      chopper: false,
      'drone-swarm': false,
      nuke: true,
    });
    expect(projection.revealedCareReward).toBe('nuke');
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.available)).toBe(true);
  });

  it('gives the owner-approved Tri-Pass a decisive blast contract', () => {
    expect(TRI_PASS_BLAST_RADIUS).toBe(15);
    expect(TRI_PASS_MAX_DAMAGE).toBe(450);
    expect(remoteExplosiveHitMaximumDistance('tri-pass')).toBeGreaterThan(15);
    expect(remoteExplosiveHitMaximumDistance('grenade')).toBe(17.3);
  });

  it('cycles every support for standard-gamepad selection', () => {
    expect(cycleFieldSupportSelection('scout-sweep', -1)).toBe('nuke');
    expect(cycleFieldSupportSelection('tri-pass', 1)).toBe('chopper');
    expect(cycleFieldSupportSelection('chopper', 1)).toBe('nuke');
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

  it('reveals only finite living hostiles while Tri-Pass targeting is active', () => {
    expect(selectTriPassHostiles([
      { id: 'friendly', kind: 'remote', team: 0, alive: true, x: 1, z: 2 },
      { id: 'dead', kind: 'bot', team: 1, alive: false, x: 3, z: 4 },
      { id: 'bad-position', kind: 'remote', team: 1, alive: true, x: Number.NaN, z: 4 },
      { id: 'remote-z', kind: 'remote', team: 1, alive: true, x: 7, z: 8 },
      { id: 'bot-a', kind: 'bot', team: 1, alive: true, x: -5, z: 6 },
    ], 0)).toEqual([
      { id: 'bot-a', kind: 'bot', x: -5, z: 6 },
      { id: 'remote-z', kind: 'remote', x: 7, z: 8 },
    ]);
  });

  it('reveals every other living contact in free-for-all targeting', () => {
    expect(selectTriPassHostiles([
      { id: 'self-side', kind: 'remote', team: 0, alive: true, x: 1, z: 2 },
      { id: 'enemy-side', kind: 'bot', team: 1, alive: true, x: 3, z: 4 },
    ], 0, { freeForAll: true })).toEqual([
      { id: 'enemy-side', kind: 'bot', x: 3, z: 4 },
      { id: 'self-side', kind: 'remote', x: 1, z: 2 },
    ]);
  });

  it('schedules exactly three simultaneous missile impacts one second after confirmation', () => {
    expect(triPassSchedule(1_000)).toEqual([2_000, 2_000, 2_000]);
  });
});
