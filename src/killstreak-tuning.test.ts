import { describe, expect, it } from 'vitest';
import {
  CHOPPER_AUTOPILOT_MISSILE_BUDGET,
  CHOPPER_GUN_DAMAGE_BEFORE,
  CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
  CHOPPER_GUN_DAMAGE_HF458,
  CHOPPER_GUN_DAMAGE_MULTIPLIER,
  CHOPPER_GUN_MINIMUM_DAMAGE_BEFORE,
  CHOPPER_GUN_MINIMUM_DAMAGE_HF458,
  CHOPPER_MISSILE_CAPACITY_AFTER,
  CHOPPER_MISSILE_CAPACITY_BEFORE,
  DRONE_SWARM_FIRE_RATE_MULTIPLIER,
  DRONE_SWARM_SPEED_MULTIPLIER,
  PILOTED_DRONE_FIRE_RATE_MULTIPLIER,
  PILOTED_DRONE_SPEED_MULTIPLIER,
  PILOTED_DRONE_TASER_CHARGES,
  TASER_PRESENTATION,
  TASER_STUN_DURATION_MS,
  cadenceForFireRateMultiplier,
  speedForMultiplier,
} from './killstreak-tuning';
import {
  CHOPPER_GUN_PROFILE,
  DRONE_DEPLOYMENT_POLICY,
  DRONE_GUN_PROFILE,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE,
  DRONE_SWARM_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE,
  PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE,
} from './killstreak-support-catalog';
import { CHOPPER_MISSILE_CAPACITY } from './killstreak-runtime';

/**
 * HF-458 (owner feedback 2026-09-02). This file is the ledger row: every number
 * the owner asked to move is pinned here against the number it replaced, so a
 * later rebalance has to argue with the owner's request rather than silently
 * drift past it.
 */
describe('HF-458 killstreak tuning', () => {
  it('doubles the Chopper payload to twelve and reserves half of it from the autopilot', () => {
    expect(CHOPPER_MISSILE_CAPACITY_BEFORE).toBe(6);
    expect(CHOPPER_MISSILE_CAPACITY_AFTER).toBe(12);
    expect(CHOPPER_MISSILE_CAPACITY).toBe(12);
    // Owner: "on autopilot it fires only 6; a human who takes control can use
    // the extra 6". The budget is on AI-fired rockets, so a human who takes
    // the gun immediately still has all twelve.
    expect(CHOPPER_AUTOPILOT_MISSILE_BUDGET).toBe(6);
    expect(CHOPPER_AUTOPILOT_MISSILE_BUDGET).toBeLessThan(CHOPPER_MISSILE_CAPACITY);
    expect(CHOPPER_MISSILE_CAPACITY - CHOPPER_AUTOPILOT_MISSILE_BUDGET).toBe(6);
  });

  it('cuts Chopper machine-gun damage by exactly a quarter (HF-458), then halves it (HF-509)', () => {
    // HF-458's ratio is still pinned against the value it produced, so the
    // owner's "-25%" remains the thing the gate protects.
    expect(CHOPPER_GUN_DAMAGE_MULTIPLIER).toBe(0.75);
    expect(CHOPPER_GUN_DAMAGE_HF458).toBe(CHOPPER_GUN_DAMAGE_BEFORE * CHOPPER_GUN_DAMAGE_MULTIPLIER);
    expect(CHOPPER_GUN_MINIMUM_DAMAGE_HF458)
      .toBe(CHOPPER_GUN_MINIMUM_DAMAGE_BEFORE * CHOPPER_GUN_DAMAGE_MULTIPLIER);
    expect(CHOPPER_GUN_DAMAGE_HF458).toBe(25.5);
    expect(CHOPPER_GUN_MINIMUM_DAMAGE_HF458).toBe(16.5);

    // HF-509: "half the damage of the helicopter's machine gun".
    expect(CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER).toBe(0.5);
    expect(CHOPPER_GUN_PROFILE.damage).toBe(CHOPPER_GUN_DAMAGE_HF458 * 0.5);
    expect(CHOPPER_GUN_PROFILE.minimumDamage).toBe(CHOPPER_GUN_MINIMUM_DAMAGE_HF458 * 0.5);
    expect(CHOPPER_GUN_PROFILE.damage).toBe(12.75);
    expect(CHOPPER_GUN_PROFILE.minimumDamage).toBe(8.25);

    // Range, cadence and penetration were NOT part of either request.
    expect(CHOPPER_GUN_PROFILE.cadenceMs).toBe(240);
    expect(CHOPPER_GUN_PROFILE.maximumRangeM).toBe(78);
  });

  it('raises Drone Swarm fire rate 25% and movement 15%', () => {
    expect(DRONE_SWARM_FIRE_RATE_MULTIPLIER).toBe(1.25);
    expect(DRONE_SWARM_SPEED_MULTIPLIER).toBe(1.15);
    expect(DRONE_SWARM_GUN_PROFILE.cadenceMs)
      .toBe(cadenceForFireRateMultiplier(DRONE_GUN_PROFILE.cadenceMs, DRONE_SWARM_FIRE_RATE_MULTIPLIER));
    expect(DRONE_SWARM_GUN_PROFILE.cadenceMs).toBe(240);
    // The lane, not the gun, is the swarm's real limiter; both had to move.
    expect(DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE).toBe(460);
    expect(DRONE_SWARM_FIRE_LANE_INTERVAL_MS).toBe(368);
    expect(DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE / DRONE_SWARM_FIRE_LANE_INTERVAL_MS)
      .toBeCloseTo(DRONE_SWARM_FIRE_RATE_MULTIPLIER, 10);
    expect(DRONE_SWARM_GUN_PROFILE.damage).toBe(DRONE_GUN_PROFILE.damage * 2);

    expect(DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps).toBe(speedForMultiplier(22, DRONE_SWARM_SPEED_MULTIPLIER));
    expect(DRONE_DEPLOYMENT_POLICY.swarmPatrolSpeedMps).toBe(speedForMultiplier(7, DRONE_SWARM_SPEED_MULTIPLIER));
    expect(DRONE_DEPLOYMENT_POLICY.swarmEngagementApproachSpeedMps)
      .toBe(speedForMultiplier(8, DRONE_SWARM_SPEED_MULTIPLIER));
    expect(DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps / 22).toBeCloseTo(1.15, 10);
    expect(DRONE_DEPLOYMENT_POLICY.swarmPatrolSpeedMps / 7).toBeCloseTo(1.15, 10);
    expect(DRONE_DEPLOYMENT_POLICY.swarmEngagementApproachSpeedMps / 8).toBeCloseTo(1.15, 10);
  });

  it('raises Piloted Drone fire rate 25% and movement 15%', () => {
    expect(PILOTED_DRONE_FIRE_RATE_MULTIPLIER).toBe(1.25);
    expect(PILOTED_DRONE_SPEED_MULTIPLIER).toBe(1.15);
    expect(PILOTED_DRONE_GUN_PROFILE.cadenceMs)
      .toBe(cadenceForFireRateMultiplier(DRONE_GUN_PROFILE.cadenceMs, PILOTED_DRONE_FIRE_RATE_MULTIPLIER));
    expect(PILOTED_DRONE_GUN_PROFILE.cadenceMs).toBe(240);
    expect(DRONE_GUN_PROFILE.cadenceMs / PILOTED_DRONE_GUN_PROFILE.cadenceMs).toBeCloseTo(1.25, 10);
    // Damage was not part of the request; the half-baseline variant stands.
    expect(PILOTED_DRONE_GUN_PROFILE.damage).toBe(DRONE_GUN_PROFILE.damage * 0.5);

    expect(PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE).toBe(3);
    expect(DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps).toBe(3.45);
    expect(DRONE_DEPLOYMENT_POLICY.manualVerticalSpeedMps).toBe(3.45);
    expect(DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps / PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE)
      .toBeCloseTo(1.15, 10);
    // The frozen 2x autonomous relationship survives the raise.
    expect(DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps).toBe(6.9);
  });

  it('gives the taser three charges, a one-second stun and a look distinct from the flashbang', () => {
    expect(PILOTED_DRONE_TASER_CHARGES).toBe(3);
    expect(TASER_STUN_DURATION_MS).toBe(1_000);
    expect(TASER_PRESENTATION.overlayElementId).toBe('taser-shock');
    expect(TASER_PRESENTATION.overlayElementId).not.toBe('ordnance-flash');
    expect(TASER_PRESENTATION.style).toBe('edge-vignette-with-arc-crackle');
    expect(TASER_PRESENTATION.arcColorCss).toBe('#5ad8ff');
    // A camera jitter the flashbang never applies is half of "clearly tasered".
    expect(TASER_PRESENTATION.cameraJitterAmplitudeM).toBeGreaterThan(0);
  });

  it('refuses nonsense tuning inputs rather than silently producing Infinity', () => {
    expect(() => cadenceForFireRateMultiplier(300, 0)).toThrow();
    expect(() => cadenceForFireRateMultiplier(0, 1.25)).toThrow();
    expect(() => speedForMultiplier(3, 0)).toThrow();
    expect(cadenceForFireRateMultiplier(300, 1)).toBe(300);
    expect(speedForMultiplier(3, 1)).toBe(3);
  });
});
