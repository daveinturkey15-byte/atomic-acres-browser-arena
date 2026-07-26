import { describe, expect, it } from 'vitest';
import {
  CHOPPER_GUN_PROFILE,
  DRONE_GUN_PROFILE,
  DRONE_GUN_PROFILE_ID,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS,
  DRONE_SUPPORT_DEFINITIONS,
  PILOTED_DRONE_SENSOR_PROFILE,
  DRONE_PRESENTATION_FAMILY_ID,
  droneGunProfileFor,
  standaloneDroneController,
  supportGunDamageAtDistance,
} from './killstreak-support-catalog';

describe('Pass 65 support catalog', () => {
  it('gives piloted and swarm drones the exact same immutable gun profile', () => {
    expect(DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId).toBe(DRONE_GUN_PROFILE_ID);
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId).toBe(DRONE_GUN_PROFILE_ID);
    expect(droneGunProfileFor('piloted')).toBe(DRONE_GUN_PROFILE);
    expect(droneGunProfileFor('swarm')).toBe(DRONE_GUN_PROFILE);
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
    const representativeDamage = supportGunDamageAtDistance(DRONE_GUN_PROFILE, 31.5);
    const coordinatedSwarmOpenExposureSeconds = 100 / (representativeDamage * (1_000 / DRONE_SWARM_FIRE_LANE_INTERVAL_MS));
    expect(coordinatedSwarmOpenExposureSeconds).toBeGreaterThan(4);
    expect(coordinatedSwarmOpenExposureSeconds).toBeLessThan(6);
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
});
