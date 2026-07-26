export const DRONE_GUN_PROFILE_ID = 'drone-gun-standard-v1' as const;

export type DroneGunProfile = Readonly<{
  id: typeof DRONE_GUN_PROFILE_ID;
  damage: number;
  minimumDamage: number;
  falloffStartM: number;
  cadenceMs: number;
  rpm: number;
  maximumRangeM: number;
  magazineSize: 20;
  reloadMs: number;
  falloff: 'linear';
  penetration: 'solid-occluded';
  criticalHits: false;
}>;

/**
 * One immutable combat profile is shared by both drone modes. Reserve policy,
 * lifetime, and controller are intentionally absent so they cannot drift the
 * damage, cadence, range, ammunition, reload, falloff, or penetration rules.
 */
export const DRONE_GUN_PROFILE: DroneGunProfile = Object.freeze({
  id: DRONE_GUN_PROFILE_ID,
  damage: 12,
  minimumDamage: 8,
  falloffStartM: 18,
  cadenceMs: 300,
  rpm: 200,
  maximumRangeM: 45,
  magazineSize: 20,
  reloadMs: 1_400,
  falloff: 'linear',
  penetration: 'solid-occluded',
  criticalHits: false,
});

/**
 * Swarm coordination is an activation-level pressure budget, not a second gun
 * profile. Each drone still references the byte-identical weapon above, while
 * the host admits one member of a 12-drone formation into a fire lane at a
 * time. This preserves visible, meaningful per-hit damage without turning 12
 * simultaneous barrels into an unavoidable one-frame kill.
 */
export const DRONE_SWARM_FIRE_LANE_INTERVAL_MS = 460;

export const CHOPPER_GUN_PROFILE = Object.freeze({
  id: 'chopper-gun-standard-v1',
  damage: 10,
  minimumDamage: 7,
  falloffStartM: 28,
  maximumRangeM: 78,
  cadenceMs: 280,
  rpm: 60_000 / 280,
  penetration: 'solid-occluded',
  criticalHits: false,
} as const);

export type SupportGunDamageProfile = Pick<
  DroneGunProfile,
  'damage' | 'minimumDamage' | 'falloffStartM' | 'maximumRangeM' | 'criticalHits'
>;

/** Pure host-side balance oracle shared by AI and owner-controlled fire. */
export function supportGunDamageAtDistance(profile: SupportGunDamageProfile, distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > profile.maximumRangeM) return 0;
  const falloffSpan = Math.max(0.001, profile.maximumRangeM - profile.falloffStartM);
  const alpha = Math.max(0, Math.min(1, (distanceM - profile.falloffStartM) / falloffSpan));
  return Math.max(1, Math.round(profile.damage + (profile.minimumDamage - profile.damage) * alpha));
}

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
export type StandaloneDroneController = 'ai' | 'owner-player';

export const DRONE_PRESENTATION_FAMILY_ID = 'hunter-drone-visual-family-v1' as const;

export type DroneSupportDefinition = Readonly<{
  mode: DroneSupportMode;
  gunProfileId: typeof DRONE_GUN_PROFILE_ID;
  magazineSize: 20;
  reservePolicy: 'two-magazines-total' | 'unlimited-reloads-until-expiry';
  lifetimeMs: number;
  sensorProfileId: typeof PILOTED_DRONE_SENSOR_PROFILE.id | null;
  presentationFamilyId: typeof DRONE_PRESENTATION_FAMILY_ID;
  controllerOptions: readonly StandaloneDroneController[];
}>;

export const DRONE_SUPPORT_DEFINITIONS: Readonly<Record<DroneSupportMode, DroneSupportDefinition>> = Object.freeze({
  piloted: Object.freeze({
    mode: 'piloted',
    gunProfileId: DRONE_GUN_PROFILE_ID,
    magazineSize: 20,
    reservePolicy: 'two-magazines-total',
    lifetimeMs: 30_000,
    sensorProfileId: PILOTED_DRONE_SENSOR_PROFILE.id,
    presentationFamilyId: DRONE_PRESENTATION_FAMILY_ID,
    controllerOptions: Object.freeze(['ai', 'owner-player'] as const),
  }),
  swarm: Object.freeze({
    mode: 'swarm',
    gunProfileId: DRONE_GUN_PROFILE_ID,
    magazineSize: 20,
    reservePolicy: 'unlimited-reloads-until-expiry',
    lifetimeMs: 60_000,
    sensorProfileId: null,
    presentationFamilyId: DRONE_PRESENTATION_FAMILY_ID,
    controllerOptions: Object.freeze(['ai'] as const),
  }),
});

export function droneGunProfileFor(mode: DroneSupportMode): DroneGunProfile {
  const definition = DRONE_SUPPORT_DEFINITIONS[mode];
  if (definition.gunProfileId !== DRONE_GUN_PROFILE.id) {
    throw new Error(`${mode} drone references an unknown gun profile`);
  }
  return DRONE_GUN_PROFILE;
}

export function standaloneDroneController(requested: StandaloneDroneController): StandaloneDroneController {
  if (!DRONE_SUPPORT_DEFINITIONS.piloted.controllerOptions.includes(requested)) {
    throw new Error(`standalone drone controller ${requested} is not selectable`);
  }
  return requested;
}
