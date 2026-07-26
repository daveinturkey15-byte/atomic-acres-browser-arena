export const DRONE_GUN_PROFILE_ID = 'drone-gun-standard-v1' as const;

export type DroneGunProfile = Readonly<{
  id: typeof DRONE_GUN_PROFILE_ID;
  damage: number;
  cadenceMs: number;
  rpm: number;
  maximumRangeM: number;
  magazineSize: 20;
  reloadMs: number;
  falloff: 'none';
  penetration: 'solid-occluded';
}>;

/**
 * One immutable combat profile is shared by both drone modes. Reserve policy,
 * lifetime, and controller are intentionally absent so they cannot drift the
 * damage, cadence, range, ammunition, reload, falloff, or penetration rules.
 */
export const DRONE_GUN_PROFILE: DroneGunProfile = Object.freeze({
  id: DRONE_GUN_PROFILE_ID,
  damage: 1,
  cadenceMs: 600,
  rpm: 100,
  maximumRangeM: 28,
  magazineSize: 20,
  reloadMs: 1_400,
  falloff: 'none',
  penetration: 'solid-occluded',
});

export const PILOTED_DRONE_SENSOR_PROFILE = Object.freeze({
  id: 'piloted-drone-hostile-through-wall-v1',
  maximumRangeM: 50,
  forwardConeDegrees: 90,
  refreshMs: 250,
  revealPolicy: 'living-hostiles-only',
  presentationOnly: true,
  changesBallisticAuthority: false,
} as const);

export type DroneSupportMode = 'piloted' | 'swarm';

export type DroneSupportDefinition = Readonly<{
  mode: DroneSupportMode;
  gunProfileId: typeof DRONE_GUN_PROFILE_ID;
  magazineSize: 20;
  reservePolicy: 'two-magazines-total' | 'unlimited-reloads-until-expiry';
  lifetimeMs: number;
  sensorProfileId: typeof PILOTED_DRONE_SENSOR_PROFILE.id | null;
}>;

export const DRONE_SUPPORT_DEFINITIONS: Readonly<Record<DroneSupportMode, DroneSupportDefinition>> = Object.freeze({
  piloted: Object.freeze({
    mode: 'piloted',
    gunProfileId: DRONE_GUN_PROFILE_ID,
    magazineSize: 20,
    reservePolicy: 'two-magazines-total',
    lifetimeMs: 30_000,
    sensorProfileId: PILOTED_DRONE_SENSOR_PROFILE.id,
  }),
  swarm: Object.freeze({
    mode: 'swarm',
    gunProfileId: DRONE_GUN_PROFILE_ID,
    magazineSize: 20,
    reservePolicy: 'unlimited-reloads-until-expiry',
    lifetimeMs: 60_000,
    sensorProfileId: null,
  }),
});

export function droneGunProfileFor(mode: DroneSupportMode): DroneGunProfile {
  const definition = DRONE_SUPPORT_DEFINITIONS[mode];
  if (definition.gunProfileId !== DRONE_GUN_PROFILE.id) {
    throw new Error(`${mode} drone references an unknown gun profile`);
  }
  return DRONE_GUN_PROFILE;
}
