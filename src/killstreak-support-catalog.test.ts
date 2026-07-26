import { describe, expect, it } from 'vitest';
import {
  DRONE_GUN_PROFILE,
  DRONE_GUN_PROFILE_ID,
  DRONE_SUPPORT_DEFINITIONS,
  PILOTED_DRONE_SENSOR_PROFILE,
  DRONE_PRESENTATION_FAMILY_ID,
  droneGunProfileFor,
  standaloneDroneController,
} from './killstreak-support-catalog';

describe('Pass 65 support catalog', () => {
  it('gives piloted and swarm drones the exact same immutable gun profile', () => {
    expect(DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId).toBe(DRONE_GUN_PROFILE_ID);
    expect(DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId).toBe(DRONE_GUN_PROFILE_ID);
    expect(droneGunProfileFor('piloted')).toBe(DRONE_GUN_PROFILE);
    expect(droneGunProfileFor('swarm')).toBe(DRONE_GUN_PROFILE);
    expect(Object.isFrozen(DRONE_GUN_PROFILE)).toBe(true);
    expect(DRONE_GUN_PROFILE).toMatchObject({
      magazineSize: 20,
      rpm: 100,
      reloadMs: 1_400,
      falloff: 'none',
      penetration: 'solid-occluded',
    });
    expect(60_000 / DRONE_GUN_PROFILE.cadenceMs).toBe(DRONE_GUN_PROFILE.rpm);
    const fullSwarmOpenExposureSeconds = 100 / (12 * DRONE_GUN_PROFILE.damage * (1_000 / DRONE_GUN_PROFILE.cadenceMs));
    expect(fullSwarmOpenExposureSeconds).toBeCloseTo(5, 5);
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
