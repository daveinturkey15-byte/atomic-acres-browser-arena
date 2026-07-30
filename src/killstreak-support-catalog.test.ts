import { describe, expect, it } from 'vitest';
import {
  CHOPPER_GUN_PROFILE,
  DRONE_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE,
  PILOTED_DRONE_GUN_PROFILE_ID,
  DRONE_SWARM_GUN_PROFILE,
  DRONE_SWARM_GUN_PROFILE_ID,
  DRONE_DEPLOYMENT_POLICY,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS,
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
    expect(DRONE_SWARM_GUN_PROFILE.damage).toBe(DRONE_GUN_PROFILE.damage * 3);
    expect(DRONE_SWARM_GUN_PROFILE.minimumDamage).toBe(DRONE_GUN_PROFILE.minimumDamage * 3);
    expect(PILOTED_DRONE_GUN_PROFILE.cadenceMs).toBe(DRONE_GUN_PROFILE.cadenceMs);
    expect(DRONE_SWARM_GUN_PROFILE.cadenceMs).toBe(DRONE_GUN_PROFILE.cadenceMs);
    expect(DRONE_SWARM_FIRE_LANE_INTERVAL_MS).toBeGreaterThan(DRONE_GUN_PROFILE.cadenceMs);
  });

  it('gives chopper fire a distinct non-critical authored profile', () => {
    expect(CHOPPER_GUN_PROFILE).toMatchObject({
      damage: 10,
      minimumDamage: 7,
      criticalHits: false,
      penetration: 'solid-occluded',
    });
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, 0)).toBe(10);
    expect(supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, CHOPPER_GUN_PROFILE.maximumRangeM)).toBe(7);
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

  it('freezes centre-map deployment and an exactly two-times autonomous standalone speed', () => {
    expect(DRONE_DEPLOYMENT_POLICY.spawnOrigin).toBe('deterministic-valid-centre-map-volume');
    expect(DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM).toBeGreaterThan(1);
    expect(DRONE_DEPLOYMENT_POLICY.maximumAdmissionProbesPerUnit).toBe(36);
    expect(DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMultiplier).toBe(2);
    expect(DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps).toBe(
      DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps
        * DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMultiplier,
    );
  });
});
