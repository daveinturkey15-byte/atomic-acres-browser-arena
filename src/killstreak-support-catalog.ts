/** Frozen inspected baseline; variants derive exact multipliers from this row. */
export const DRONE_GUN_PROFILE_ID = 'drone-gun-inspected-baseline-v1' as const;
export const PILOTED_DRONE_GUN_PROFILE_ID = 'piloted-drone-gun-half-baseline-v1' as const;
export const DRONE_SWARM_GUN_PROFILE_ID = 'drone-swarm-gun-double-baseline-v1' as const;
export type DroneGunProfileId = typeof DRONE_GUN_PROFILE_ID
  | typeof PILOTED_DRONE_GUN_PROFILE_ID
  | typeof DRONE_SWARM_GUN_PROFILE_ID;

export type DroneGunProfile = Readonly<{
  id: DroneGunProfileId;
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

function scaledDroneGunProfile(id: DroneGunProfileId, multiplier: number): DroneGunProfile {
  return Object.freeze({
    ...DRONE_GUN_PROFILE,
    id,
    damage: DRONE_GUN_PROFILE.damage * multiplier,
    minimumDamage: DRONE_GUN_PROFILE.minimumDamage * multiplier,
  });
}

/** Exact user-approved combat variants; all non-damage behavior stays baseline-identical. */
export const PILOTED_DRONE_GUN_PROFILE = scaledDroneGunProfile(PILOTED_DRONE_GUN_PROFILE_ID, 0.5);
// Pass 66.1 owner balance: swarm per-shot damage shaved by a third (3x -> 2x baseline).
export const DRONE_SWARM_GUN_PROFILE = scaledDroneGunProfile(DRONE_SWARM_GUN_PROFILE_ID, 2);

/**
 * Swarm coordination is an activation-level pressure budget, not a second gun
 * profile. Each drone still references the byte-identical weapon above, while
 * the host admits one member of a 24-drone formation into a fire lane at a
 * time. This preserves visible, meaningful per-hit damage without turning 24
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

/**
 * Pass 71 preserves the previous one-metre direct capsule as the immutable
 * comparator, then admits a bounded radial autocannon impact exactly three
 * times wider. The splash still uses host-owned LOS and hostile relations.
 */
export const CHOPPER_GUNNER_SPLASH_POLICY = Object.freeze({
  precedingDirectHitRadiusM: 1,
  linearRadiusMultiplier: 3,
  splashRadiusM: 3,
  radialMinimumDamageMultiplier: 0.25,
} as const);

/**
 * Host-owned geometry for the possessed Chopper Gunner fire contract. These
 * offsets are the authored LOD0 socket transforms after Blender-to-glTF axis
 * conversion; gameplay never reads a rendered/interpolated Object3D pose.
 */
export const CHOPPER_GUNNER_RAY_POLICY = Object.freeze({
  cameraSocketLocalM: Object.freeze([0, 0.74, -0.38] as const),
  cameraForwardNudgeM: 0.08,
  muzzleSocketLocalM: Object.freeze([0, -0.82, -3.32] as const),
  /**
   * HF-135 replaced a forgiving cone with a centre-ray capsule so off-crosshair
   * targets can never register. The owner reported twice that a 0.62 m capsule
   * made held fire from orbit altitude feel completely dead, so this is widened
   * to one torso width. It remains a centre-ray capsule: a target a full 2 m off
   * the crosshair is still rejected, and it must never become a cone again.
   */
  targetRadiusM: 1,
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

/**
 * Shared deployment and movement policy for both drone variants. Spawn origin
 * is authority, not presentation: callers cannot relocate either variant by
 * supplying an activation anchor. The standalone AI is deliberately twice as
 * quick as direct owner control while the 24-unit Swarm retains its separately
 * pressure-calibrated ingress and patrol speeds.
 */
export const DRONE_DEPLOYMENT_POLICY = Object.freeze({
  spawnOrigin: 'deterministic-valid-centre-map-volume',
  minimumSpawnSeparationM: 1.15,
  maximumAdmissionProbesPerUnit: 36,
  manualHorizontalSpeedMps: 3,
  manualVerticalSpeedMps: 3,
  autonomousStandaloneSpeedMultiplier: 2,
  autonomousStandaloneSpeedMps: 6,
  swarmIngressSpeedMps: 22,
  swarmPatrolSpeedMps: 7,
} as const);

export type DroneSupportDefinition = Readonly<{
  mode: DroneSupportMode;
  gunProfileId: DroneGunProfileId;
  magazineSize: 20;
  reservePolicy: 'three-magazines-total' | 'unlimited-reloads-until-expiry';
  lifetimeMs: number;
  sensorProfileId: typeof PILOTED_DRONE_SENSOR_PROFILE.id | null;
  presentationFamilyId: typeof DRONE_PRESENTATION_FAMILY_ID;
  controllerOptions: readonly StandaloneDroneController[];
}>;

/** Later owner correction: both standalone and 24-unit swarm support expire after 30 seconds. */
export const DRONE_SUPPORT_LIFETIMES_MS = Object.freeze({
  piloted: 30_000,
  swarm: 30_000,
} as const satisfies Readonly<Record<DroneSupportMode, number>>);

export const DRONE_SUPPORT_DEFINITIONS: Readonly<Record<DroneSupportMode, DroneSupportDefinition>> = Object.freeze({
  piloted: Object.freeze({
    mode: 'piloted',
    gunProfileId: PILOTED_DRONE_GUN_PROFILE_ID,
    magazineSize: 20,
    reservePolicy: 'three-magazines-total',
    lifetimeMs: DRONE_SUPPORT_LIFETIMES_MS.piloted,
    sensorProfileId: PILOTED_DRONE_SENSOR_PROFILE.id,
    presentationFamilyId: DRONE_PRESENTATION_FAMILY_ID,
    controllerOptions: Object.freeze(['ai', 'owner-player'] as const),
  }),
  swarm: Object.freeze({
    mode: 'swarm',
    gunProfileId: DRONE_SWARM_GUN_PROFILE_ID,
    magazineSize: 20,
    reservePolicy: 'unlimited-reloads-until-expiry',
    lifetimeMs: DRONE_SUPPORT_LIFETIMES_MS.swarm,
    sensorProfileId: null,
    presentationFamilyId: DRONE_PRESENTATION_FAMILY_ID,
    controllerOptions: Object.freeze(['ai'] as const),
  }),
});

export function droneGunProfileFor(mode: DroneSupportMode): DroneGunProfile {
  const definition = DRONE_SUPPORT_DEFINITIONS[mode];
  const profile = mode === 'piloted' ? PILOTED_DRONE_GUN_PROFILE : DRONE_SWARM_GUN_PROFILE;
  if (definition.gunProfileId !== profile.id) throw new Error(`${mode} drone references an unknown gun profile`);
  return profile;
}

export function standaloneDroneController(requested: StandaloneDroneController): StandaloneDroneController {
  if (!DRONE_SUPPORT_DEFINITIONS.piloted.controllerOptions.includes(requested)) {
    throw new Error(`standalone drone controller ${requested} is not selectable`);
  }
  return requested;
}
