import { describe, expect, it } from 'vitest';
import {
  CHOPPER_GUN_DAMAGE_BEFORE,
  CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
  CHOPPER_GUN_DAMAGE_MULTIPLIER,
  CHOPPER_GUN_MINIMUM_DAMAGE_BEFORE,
  DRONE_SWARM_FIRE_RATE_MULTIPLIER,
  DRONE_SWARM_SPEED_MULTIPLIER,
  PILOTED_DRONE_FIRE_RATE_MULTIPLIER,
  PILOTED_DRONE_SPEED_MULTIPLIER,
} from './killstreak-tuning';
import {
  CHOPPER_GUN_PROFILE,
  DRONE_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE_ID,
  DRONE_SWARM_GUN_PROFILE,
  DRONE_SWARM_GUN_PROFILE_ID,
  DRONE_DEPLOYMENT_POLICY,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE,
  PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE,
  DRONE_SUPPORT_LIFETIMES_MS,
  DRONE_SUPPORT_DEFINITIONS,
  PILOTED_DRONE_SENSOR_PROFILE,
  DRONE_PRESENTATION_FAMILY_ID,
  droneGunProfileFor,
  standaloneDroneController,
  supportGunDamageAtDistance,
} from './killstreak-support-catalog';

describe('Pass 65 support catalog', () => {
  it('derives exact immutable piloted and swarm damage variants from one inspected baseline', () => {
    expect(DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId).toBe(PILOTED_DRONE_GUN_PROFILE_ID);
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId).toBe(DRONE_SWARM_GUN_PROFILE_ID);
    expect(droneGunProfileFor('piloted')).toBe(PILOTED_DRONE_GUN_PROFILE);
    expect(droneGunProfileFor('swarm')).toBe(DRONE_SWARM_GUN_PROFILE);
    expect(Object.isFrozen(DRONE_GUN_PROFILE)).toBe(true);
    expect(DRONE_GUN_PROFILE).toMatchObject({
      damage: 12,
      minimumDamage: 8,
      falloffStartM: 18,
      magazineSize: 20,
      rpm: 200,
      reloadMs: 1_400,
      falloff: 'linear',
      penetration: 'solid-occluded',
      criticalHits: false,
    });
    expect(60_000 / DRONE_GUN_PROFILE.cadenceMs).toBe(DRONE_GUN_PROFILE.rpm);
    expect(supportGunDamageAtDistance(DRONE_GUN_PROFILE, 0)).toBe(12);
    expect(supportGunDamageAtDistance(DRONE_GUN_PROFILE, 45)).toBe(8);
    expect(supportGunDamageAtDistance(DRONE_GUN_PROFILE, 46)).toBe(0);
    expect(PILOTED_DRONE_GUN_PROFILE.damage).toBe(DRONE_GUN_PROFILE.damage * 0.5);
    expect(PILOTED_DRONE_GUN_PROFILE.minimumDamage).toBe(DRONE_GUN_PROFILE.minimumDamage * 0.5);
    expect(DRONE_SWARM_GUN_PROFILE.damage).toBe(DRONE_GUN_PROFILE.damage * 2);
    expect(DRONE_SWARM_GUN_PROFILE.minimumDamage).toBe(DRONE_GUN_PROFILE.minimumDamage * 2);
    // HF-458 items 2 and 3 (owner 2026-09-02): both drone variants gained
    // "fire rate +25%", i.e. exactly 0.8x the baseline cadence. The variants
    // still derive from the one inspected baseline - they are not independently
    // authored guns - so this pins the RATIO, not a decimal.
    expect(PILOTED_DRONE_GUN_PROFILE.cadenceMs)
      .toBe(DRONE_GUN_PROFILE.cadenceMs / PILOTED_DRONE_FIRE_RATE_MULTIPLIER);
    expect(DRONE_SWARM_GUN_PROFILE.cadenceMs)
      .toBe(DRONE_GUN_PROFILE.cadenceMs / DRONE_SWARM_FIRE_RATE_MULTIPLIER);
    expect(60_000 / PILOTED_DRONE_GUN_PROFILE.cadenceMs).toBe(PILOTED_DRONE_GUN_PROFILE.rpm);
    expect(60_000 / DRONE_SWARM_GUN_PROFILE.cadenceMs).toBe(DRONE_SWARM_GUN_PROFILE.rpm);
    // The swarm's real limiter is the shared fire lane, so it moved with them.
    expect(DRONE_SWARM_FIRE_LANE_INTERVAL_MS)
      .toBe(DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE / DRONE_SWARM_FIRE_RATE_MULTIPLIER);
    expect(DRONE_SWARM_FIRE_LANE_INTERVAL_MS).toBeGreaterThan(DRONE_GUN_PROFILE.cadenceMs);
  });

  it('gives chopper fire a distinct non-critical authored profile', () => {
    // Owner 2026-08-29 retune: ~3 shells to kill a full-health hostile (the
    // 10/shell tune read as "damage doesn't work" in play).
    // HF-458 item 1 (owner 2026-09-02): "machine-gun damage -25%". The Pass
    // 66.1 numbers this scales are 34/22; the ratio is pinned rather than the
    // decimal so the owner's stated percentage is what the gate protects.
    // HF-509 (owner 2026-09-05) halves that result again, so the shipped
    // number is 34 x 0.75 x 0.5 and 22 x 0.75 x 0.5.
    expect(CHOPPER_GUN_PROFILE).toMatchObject({
      damage: CHOPPER_GUN_DAMAGE_BEFORE * CHOPPER_GUN_DAMAGE_MULTIPLIER * CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
      minimumDamage: CHOPPER_GUN_MINIMUM_DAMAGE_BEFORE
        * CHOPPER_GUN_DAMAGE_MULTIPLIER
        * CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
      criticalHits: false,
      penetration: 'solid-occluded',
    });
    expect(CHOPPER_GUN_PROFILE.damage).toBe(12.75);
    expect(CHOPPER_GUN_PROFILE.minimumDamage).toBe(8.25);
    // The shared oracle still rounds each admitted shell to an integer.
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, 0)).toBe(13);
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, CHOPPER_GUN_PROFILE.maximumRangeM)).toBe(8);
  });

  it('isolates the piloted sensor from gun and ballistic authority', () => {
    expect(PILOTED_DRONE_SENSOR_PROFILE).toEqual({
      id: 'piloted-drone-hostile-through-wall-v1',
      maximumRangeM: 50,
      forwardConeDegrees: 90,
      refreshMs: 250,
      revealPolicy: 'living-hostiles-only',
      presentationOnly: true,
      changesBallisticAuthority: false,
    });
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.sensorProfileId).toBeNull();
  });

  it('reuses one visual/gun family while the standalone deployment selects AI or owner control', () => {
    expect(DRONE_SUPPORT_DEFINITIONS.piloted.presentationFamilyId).toBe(DRONE_PRESENTATION_FAMILY_ID);
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.presentationFamilyId).toBe(DRONE_PRESENTATION_FAMILY_ID);
    expect(DRONE_SUPPORT_DEFINITIONS.piloted.controllerOptions).toEqual(['ai', 'owner-player']);
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.controllerOptions).toEqual(['ai']);
    expect(standaloneDroneController('ai')).toBe('ai');
    expect(standaloneDroneController('owner-player')).toBe('owner-player');
  });

  it('pins the later owner-corrected support lifetimes at thirty seconds', () => {
    expect(DRONE_SUPPORT_LIFETIMES_MS).toEqual({ piloted: 30_000, swarm: 30_000 });
    expect(DRONE_SUPPORT_DEFINITIONS.piloted.lifetimeMs).toBe(DRONE_SUPPORT_LIFETIMES_MS.piloted);
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.lifetimeMs).toBe(DRONE_SUPPORT_LIFETIMES_MS.swarm);
  });

  it('freezes centre-map deployment and an exactly two-times autonomous standalone speed', () => {
    expect(DRONE_DEPLOYMENT_POLICY.spawnOrigin).toBe('deterministic-valid-centre-map-volume');
    expect(DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM).toBeGreaterThan(1);
    expect(DRONE_DEPLOYMENT_POLICY.maximumAdmissionProbesPerUnit).toBe(36);
    expect(DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMultiplier).toBe(2);
    expect(DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps).toBe(
      DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps
        * DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMultiplier,
    );
    // HF-458 items 2 and 3: "+15%" on both drone families, including the swarm
    // engagement approach that used to be an unnamed literal inside the runtime.
    // The tuning helper rounds to milli-units so 3 x 1.15 reads as 3.45 rather
    // than 3.4499999999999997; the ratio is asserted to within a float epsilon
    // and the exact shipped decimal is pinned beside it.
    expect(DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps)
      .toBeCloseTo(PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE * PILOTED_DRONE_SPEED_MULTIPLIER, 10);
    expect(DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps).toBe(3.45);
    expect(DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps).toBe(6.9);
    expect(DRONE_DEPLOYMENT_POLICY.manualVerticalSpeedMps)
      .toBe(DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps);
    expect(DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps).toBeCloseTo(22 * DRONE_SWARM_SPEED_MULTIPLIER, 10);
    expect(DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps).toBe(25.3);
    expect(DRONE_DEPLOYMENT_POLICY.swarmPatrolSpeedMps).toBe(8.05);
    expect(DRONE_DEPLOYMENT_POLICY.swarmEngagementApproachSpeedMps).toBe(9.2);
  });
});
