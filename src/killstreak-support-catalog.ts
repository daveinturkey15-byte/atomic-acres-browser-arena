import {
  CHOPPER_GUN_DAMAGE_AFTER,
  CHOPPER_GUN_DAMAGE_MULTIPLIER_FROM_V2,
  CHOPPER_GUN_MINIMUM_DAMAGE_AFTER,
  DRONE_SWARM_FIRE_RATE_MULTIPLIER,
  DRONE_SWARM_SPEED_MULTIPLIER,
  PILOTED_DRONE_FIRE_RATE_MULTIPLIER,
  PILOTED_DRONE_SPEED_MULTIPLIER,
  cadenceForFireRateMultiplier,
  speedForMultiplier,
} from './killstreak-tuning';

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

/**
 * HF-458 added the second axis. Before this row both variants were pure damage
 * scalings of one baseline and shared its cadence; the owner asked for +25%
 * fire rate on BOTH drone variants, so a variant now derives its cadence from
 * the same baseline as well. `fireRateMultiplier` of 1 reproduces the previous
 * behaviour exactly, which is what keeps `DRONE_GUN_PROFILE` the single
 * inspected source rather than three independently authored guns.
 */
function scaledDroneGunProfile(
  id: DroneGunProfileId,
  multiplier: number,
  fireRateMultiplier: number,
): DroneGunProfile {
  const cadenceMs = cadenceForFireRateMultiplier(DRONE_GUN_PROFILE.cadenceMs, fireRateMultiplier);
  return Object.freeze({
    ...DRONE_GUN_PROFILE,
    id,
    damage: DRONE_GUN_PROFILE.damage * multiplier,
    minimumDamage: DRONE_GUN_PROFILE.minimumDamage * multiplier,
    cadenceMs,
    rpm: 60_000 / cadenceMs,
  });
}

/** Exact user-approved combat variants; all non-damage behavior stays baseline-identical. */
export const PILOTED_DRONE_GUN_PROFILE = scaledDroneGunProfile(
  PILOTED_DRONE_GUN_PROFILE_ID,
  0.5,
  // HF-458 item 3: Piloted Drone "fire rate +25%".
  PILOTED_DRONE_FIRE_RATE_MULTIPLIER,
);
// Pass 66.1 owner balance: swarm per-shot damage shaved by a third (3x -> 2x baseline).
export const DRONE_SWARM_GUN_PROFILE = scaledDroneGunProfile(
  DRONE_SWARM_GUN_PROFILE_ID,
  2,
  // HF-458 item 2: Drone Swarm "fire rate +25%".
  DRONE_SWARM_FIRE_RATE_MULTIPLIER,
);

/**
 * Swarm coordination is an activation-level pressure budget, not a second gun
 * profile. Each drone still references the byte-identical weapon above, while
 * the host admits one member of a 24-drone formation into a fire lane at a
 * time. This preserves visible, meaningful per-hit damage without turning 24
 * simultaneous barrels into an unavoidable one-frame kill.
 */
export const DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE = 460;
/**
 * HF-458 item 2. The lane, not the gun, is the swarm's real rate limiter - a
 * 24-drone formation fires one barrel at a time - so "fire rate +25%" has to
 * move BOTH or the owner would feel no change at all.
 */
export const DRONE_SWARM_FIRE_LANE_INTERVAL_MS = cadenceForFireRateMultiplier(
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS_BEFORE,
  DRONE_SWARM_FIRE_RATE_MULTIPLIER,
);

export const CHOPPER_GUN_PROFILE = Object.freeze({
  // Owner 2026-08-29: "its damage doesnt seem to work" - measured at 10/shell
  // a bot took ~11 shells (~3s of sustained aimed fire) to kill, which reads
  // as broken. Retuned to the reference feel: ~3 shells to drop a full-health
  // hostile, cadence tightened to keep the heavy-thump rhythm.
  // HF-458 item 1 (owner 2026-09-02): "machine-gun damage -25%". v2's 34/22
  // stays recorded in killstreak-tuning.ts as the value this scales.
  // HF-509 (owner 2026-09-05): "half the damage of the helicopter's machine
  // gun, the chopper gunner. Keep everything else the same." 25.5/16.5 ->
  // 12.75/8.25. Cadence, range, falloff and splash are untouched.
  id: 'chopper-gun-standard-v4-hf509',
  damage: CHOPPER_GUN_DAMAGE_AFTER,
  minimumDamage: CHOPPER_GUN_MINIMUM_DAMAGE_AFTER,
  damageMultiplierFromV2: CHOPPER_GUN_DAMAGE_MULTIPLIER_FROM_V2,
  falloffStartM: 28,
  maximumRangeM: 78,
  cadenceMs: 240,
  rpm: 60_000 / 240,
  penetration: 'solid-occluded',
  criticalHits: false,
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

/** HF-458 item 3: Piloted Drone "movement speed +15%" from the frozen 3 m/s. */
export const PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE = 3;
export const PILOTED_DRONE_MANUAL_SPEED_MPS = speedForMultiplier(
  PILOTED_DRONE_MANUAL_SPEED_MPS_BEFORE,
  PILOTED_DRONE_SPEED_MULTIPLIER,
);

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
  // HF-458 items 2 and 3: Piloted Drone and Drone Swarm "movement speed +15%".
  // The autonomous standalone speed stays exactly the manual speed times its
  // frozen 2x multiplier, so raising manual raises both coherently.
  manualHorizontalSpeedMps: PILOTED_DRONE_MANUAL_SPEED_MPS,
  manualVerticalSpeedMps: PILOTED_DRONE_MANUAL_SPEED_MPS,
  autonomousStandaloneSpeedMultiplier: 2,
  autonomousStandaloneSpeedMps: PILOTED_DRONE_MANUAL_SPEED_MPS * 2,
  swarmIngressSpeedMps: speedForMultiplier(22, DRONE_SWARM_SPEED_MULTIPLIER),
  swarmPatrolSpeedMps: speedForMultiplier(7, DRONE_SWARM_SPEED_MULTIPLIER),
  /**
   * HF-458: the swarm's engagement approach was an unnamed literal 8 inside
   * `advanceDrone`. A movement-speed request that missed it would have left
   * the swarm closing on its target at the old speed, which is most of the
   * movement an owner actually sees.
   */
  swarmEngagementApproachSpeedMps: speedForMultiplier(8, DRONE_SWARM_SPEED_MULTIPLIER),
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
