import {
  PASS65_KILLSTREAK_CATALOG,
  rewardForCarePackageUnit,
  type KillstreakCatalog,
  type Pass65KillstreakId,
} from './killstreak-catalog';
import { parseKillstreakLoadout, type KillstreakLoadoutV1 } from './killstreak-catalog';
import {
  CHOPPER_GUN_PROFILE,
  CHOPPER_GUNNER_RAY_POLICY,
  DRONE_GUN_PROFILE,
  DRONE_DEPLOYMENT_POLICY,
  DRONE_SWARM_FIRE_LANE_INTERVAL_MS,
  DRONE_SUPPORT_DEFINITIONS,
  PILOTED_DRONE_SENSOR_PROFILE,
  droneGunProfileFor,
  supportGunDamageAtDistance,
  type DroneGunProfileId,
  type DroneGunProfile,
} from './killstreak-support-catalog';
import { DRONE_SWARM_ENGAGEMENT_FORMATION, droneSwarmEngagementPoint } from './killstreak-drone-formation';
import { pilotedDroneWorldVelocity } from './killstreak-drone-input';
import { supportForwardFromYawPitch, supportYawForDirection } from './support-forward-axis';
import {
  CARPET_BOMBER_COLLISION_ENVELOPE,
  supportAircraftRootClearance,
  type SupportAircraftCollisionEnvelope,
} from './support-aircraft-collision';

export const ADRENALINE_DURATION_MS = 15_000;
export const ADRENALINE_DAMAGE_MULTIPLIER = 1.1;
export const ADRENALINE_MOVEMENT_MULTIPLIER = 1.1;
export const ADRENALINE_RELOAD_DURATION_MULTIPLIER = 0.9;
export const CHOPPER_DURATION_MS = 30_000;
export const CHOPPER_HEALTH = 800;
export const PILOTED_DRONE_DURATION_MS = DRONE_SUPPORT_DEFINITIONS.piloted.lifetimeMs;
export const DRONE_SWARM_DURATION_MS = DRONE_SUPPORT_DEFINITIONS.swarm.lifetimeMs;
export const DRONE_SWARM_COUNT = 24;
export const DRONE_HEALTH = 50;
export const DRONE_MAGAZINE_SIZE = DRONE_GUN_PROFILE.magazineSize;
/** Two reserve magazines plus the loaded magazine: exactly 20 + 40 rounds. */
export const PILOTED_DRONE_RESERVE_CLIPS = 2;
export const CARE_AIRCRAFT_DURATION_MS = 7_000;
export const CARE_AIRCRAFT_DROP_DELAY_MS = 800;
export const CARE_CRATE_DESCENT_MS = 5_200;
export const CARPET_BOMBER_IMPACT_COUNT = 20;
export const CARPET_BOMB_SHELL_DROP_LEAD_MS = 420;
export const CARPET_BOMBER_PREVIOUS_MAX_DAMAGE = 80;
export const CARPET_BOMBER_DAMAGE_MULTIPLIER = 3;
export const CARPET_BOMBER_MAX_DAMAGE = CARPET_BOMBER_PREVIOUS_MAX_DAMAGE * CARPET_BOMBER_DAMAGE_MULTIPLIER;
export const CARPET_BOMBER_RESIDUAL_FIRE_DURATION_MS = 5_000;
export const CARPET_BOMBER_ROUTE_CLEARANCE_M = 0.05;
const CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M = 0.002;
const CARPET_BOMBER_ROUTE_HEADING_OFFSETS = Object.freeze([
  0,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI * 3 / 4,
  -Math.PI * 3 / 4,
  Math.PI,
] as const);
export const CARPET_BOMBER_BLAST_RADIUS_M = 4.5;
export const CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M = 1.2;
export const CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE = 3.8;
/**
 * The pooled support flash starts at 0.25m and expands by the admitted blast
 * radius, so its full presentation footprint is 4.75m for Carpet Bomber.
 */
export const CARPET_BOMBER_SUPPORT_EXPLOSION_MAXIMUM_RADIUS_M = CARPET_BOMBER_BLAST_RADIUS_M + 0.25;
export const CARPET_BOMBER_IMPACT_ORIGIN_MARGIN_M = 0.05;
/** Keeps every authoritative and presentation footprint out of walls and the secure door. */
export const CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M = (
  Math.max(
    CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M * CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE,
    CARPET_BOMBER_SUPPORT_EXPLOSION_MAXIMUM_RADIUS_M,
  ) + CARPET_BOMBER_IMPACT_ORIGIN_MARGIN_M
);
/** Recipient-snapshot presentation bounds; these are not gameplay ranges. */
export const CARE_TARGET_MARKER_MAX_LIFETIME_MS = CARE_AIRCRAFT_DROP_DELAY_MS + CARE_CRATE_DESCENT_MS;
export const CARPET_TARGET_MARKER_MAX_LIFETIME_MS = 1_000;
/** The aircraft reaches the last station when its final shell is released. */
export const CARPET_BOMBER_ROUTE_TRAVERSE_MS = CARPET_TARGET_MARKER_MAX_LIFETIME_MS
  + (CARPET_BOMBER_IMPACT_COUNT - 1) * 180
  - CARPET_BOMB_SHELL_DROP_LEAD_MS;
export const SUPPORT_TARGET_CORRIDOR_MAX_LENGTH_M = 200;
export const SUPPORT_TARGET_CORRIDOR_MAX_HALF_WIDTH_M = 12;
export const MAX_ACTIVE_SUPPORT_ENTITIES = 32;
/**
 * A Carpet activation owns one reservation until its last emitted impact and
 * every five-second residual-fire patch have expired. Aircraft expiry does not
 * release this separate authority budget.
 */
export const MAX_ACTIVE_CARPET_BOMBER_RESERVATIONS = MAX_ACTIVE_SUPPORT_ENTITIES;
export const MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP = 64;
export const MAX_REPLICATED_KILLSTREAK_STREAK = 100_000;
/** Recipient-protocol bound for a single banked reward count. */
export const MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD = 255;
/** Matches the strict recipient snapshot bound; a full queue leaves the crate claimable. */
export const MAX_RETAINED_CARE_REWARDS = 8;
export const KILLSTREAK_RUNTIME_CHECKPOINT_SCHEMA_VERSION = 1;
export const MAX_KILLSTREAK_CHECKPOINT_ACTORS = 10;
export const MAX_KILLSTREAK_CHECKPOINT_SEEN_ACTIVATIONS = 512;
const CHOPPER_GUNNER_CAMERA_ORIGIN_LOCAL = Object.freeze([
  CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[0],
  CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[1],
  CHOPPER_GUNNER_RAY_POLICY.cameraSocketLocalM[2] - CHOPPER_GUNNER_RAY_POLICY.cameraForwardNudgeM,
] as const);

export type SupportVec3 = readonly [number, number, number];

export type KillstreakTarget = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  team: 0 | 1;
  lifeId: number;
  alive: boolean;
  position: SupportVec3;
}>;

export type KillstreakWorld = Readonly<{
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number; floorY: number; ceilingY: number }>;
  targets: readonly KillstreakTarget[];
  areHostile?: (ownerId: string, ownerTeam: 0 | 1, target: KillstreakTarget) => boolean;
  hasLineOfSight?: (from: SupportVec3, to: SupportVec3) => boolean;
  /** Host-owned support-placement surface query. Client supplied Y is never authoritative. */
  groundHeightAt?: (x: number, z: number) => number;
  /** Resolves against arena static/dynamic solids, ceilings, portals and no-fly data. */
  resolveFlightPosition?: (from: SupportVec3, desired: SupportVec3, radius: number) => SupportVec3;
  /** Truthful anisotropic airframe sweep used by Carpet Bomber only. */
  resolveFlightEnvelopePosition?: (
    from: SupportVec3,
    desired: SupportVec3,
    envelope: SupportAircraftCollisionEnvelope,
  ) => SupportVec3;
  isFlightPositionValid?: (position: SupportVec3) => boolean;
  /** Collision-connected strike region around an admitted anchor. */
  supportStrikeBoundsAt?: (anchor: SupportVec3) => Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  /** Optional arena-authored support-flight centre; the host derives a bounded fallback when absent. */
  supportFlightCentreVolume?: Readonly<{ centre: SupportVec3; halfExtents: SupportVec3 }>;
}>;

export type DroneSensorContact = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  team: 0 | 1;
  lifeId: number;
  position: SupportVec3;
  relation: 'hostile';
  throughWall: true;
}>;

export type KillstreakDamageEvent = Readonly<{
  resultId: string;
  activationId: string;
  source: Pass65KillstreakId;
  ownerId: string;
  targetId: string;
  targetLifeId: number;
  /** Host-admitted impact-time anchor used only for world-space feedback. */
  targetPosition: SupportVec3;
  damage: number;
  /** Authoritative camera/damage ray origin, never a rendered socket pose. */
  origin: SupportVec3;
  /** Exact point on the admitted weapon ray used by every recipient tracer. */
  endpoint: SupportVec3;
  /** Host-derived authored muzzle socket used only as the tracer's visual start. */
  tracerOrigin: SupportVec3;
  atMs: number;
}>;

export type KillstreakImpactEvent = Readonly<{
  activationId: string;
  source: Pass65KillstreakId;
  ordinal: number;
  phase: 'drop' | 'impact';
  position: SupportVec3;
  impactAtMs: number;
  atMs: number;
}>;

type ActorAuthorityState = {
  actorId: string;
  team: 0 | 1;
  lifeId: number;
  loadout: KillstreakLoadoutV1;
  /** Continuous eligible eliminations in the current life; used by records/HUD. */
  streak: number;
  /** Progress through the currently earning five-reward ladder cycle. */
  cycleProgress: number;
  earned: Set<Pass65KillstreakId>;
  /** Banked activations survive cycle rollover and death until used or epoch end. */
  availableCharges: Map<Pass65KillstreakId, number>;
  careRewards: Pass65KillstreakId[];
  /** One test-bay reward, kept separate so training can never consume or replace a real care-package reward. */
  trainingReward: Pass65KillstreakId | null;
  adrenalineUntilMs: number;
  possession: Readonly<{ kind: 'chopper-gunner' | 'piloted-drone'; entityId: string }> | null;
  lastActivationSequence: number;
  lastControlSequence: number;
};

type EntityBase = {
  id: string;
  activationId: string;
  ownerId: string;
  team: 0 | 1;
  createdAtMs: number;
  expiresAtMs: number;
  position: [number, number, number];
  velocity: [number, number, number];
  /** Host-authored pitch, yaw, bank used by every recipient presentation. */
  attitude: [number, number, number];
  health: number;
  revision: number;
};

type AircraftEntity = EntityBase & {
  kind: 'aircraft';
  variant: 'care' | 'carpet';
  phase: 'inbound' | 'active' | 'outbound';
  seed: number;
  routeStart: [number, number, number];
  routeEnd: [number, number, number];
};

type ChopperEntity = EntityBase & {
  kind: 'chopper';
  phase: 'inbound' | 'orbiting' | 'outbound';
  seed: number;
  routeCentre: [number, number, number];
  gunController: 'ai' | Readonly<{ actorId: string; lifeId: number }>;
  nextShotAtMs: number;
  aimYaw: number;
  aimPitch: number;
  pendingPlayerFire: boolean;
};

type DroneEntity = EntityBase & {
  kind: 'drone';
  mode: 'piloted' | 'swarm';
  phase: 'active' | 'reloading';
  seed: number;
  magazine: number;
  reserveClips: number | null;
  reloadCompletesAtMs: number | null;
  nextShotAtMs: number;
  targetId: string | null;
  yaw: number;
  pitch: number;
  thrust: number;
  strafe: number;
  vertical: number;
  pendingPlayerFire: boolean;
  gunProfileId: DroneGunProfileId;
  nextSensorRefreshAtMs: number;
  sensorContacts: DroneSensorContact[];
  /** Stable host-authored formation slot; null for the standalone drone. */
  swarmOrdinal: number | null;
  /** Seeded ingress/patrol anchors keep a swarm spread out without client authority. */
  swarmIngressTarget: [number, number, number] | null;
  swarmPatrolTarget: [number, number, number] | null;
  swarmPatrolRefreshAtMs: number;
  /** Immutable admitted spawn height used to derive local terrain midpoints. */
  swarmAdmittedSpawnY: number | null;
};

type CareCrateEntity = EntityBase & {
  kind: 'care-crate';
  phase: 'inbound' | 'descending' | 'landed' | 'capturing';
  dropPosition: [number, number, number];
  descentStartPosition: [number, number, number];
  descentStartsAtMs: number;
  aircraftId: string;
  reward: Pass65KillstreakId;
  rollUnit: number;
  captureActorId: string | null;
  captureStartedAtMs: number | null;
};

export type HostSupportEntity = AircraftEntity | ChopperEntity | DroneEntity | CareCrateEntity;

type CarpetBomberActivation = {
  activationId: string;
  ownerId: string;
  team: 0 | 1;
  createdAtMs: number;
  aircraftId: string;
  authorityReleaseAtMs: number | null;
  impacts: readonly SupportVec3[];
  impactAtMs: number[];
  anchor: SupportVec3;
  pathStart: SupportVec3;
  pathEnd: SupportVec3;
  halfWidthM: number;
  nextDropOrdinal: number;
  nextImpactOrdinal: number;
  dropRouteProgress: readonly number[];
  routeCompleted: boolean;
  routeCanceled: boolean;
};

type CarpetImpactPlan = Readonly<{
  impacts: readonly SupportVec3[];
  pathStart: SupportVec3;
  pathEnd: SupportVec3;
  flightStart: SupportVec3;
  flightEnd: SupportVec3;
  dropRouteProgress: readonly number[];
  halfWidthM: number;
}>;

export type KillstreakPlacementMarkerSnapshot = Readonly<{
  id: string;
  activationId: string;
  source: 'care-package' | 'carpet-bomber';
  shape: 'ground-x' | 'corridor';
  ownerId: string;
  team: 0 | 1;
  audience: 'all-combatants' | 'owner-only';
  anchor: SupportVec3;
  pathStart: SupportVec3 | null;
  pathEnd: SupportVec3 | null;
  halfWidthM: number | null;
  expiresInMs: number;
}>;

type TimedActivation = {
  activationId: string;
  ownerId: string;
  id: Pass65KillstreakId;
  expiresAtMs: number;
};

export type KillstreakActivationIntent = Readonly<{
  by: string;
  matchEpoch: number;
  lifeId: number;
  sequence: number;
  slot: 1 | 2 | 3 | 4 | 5;
  /** Client request correlation only; the host generates the actual activation ID and seed. */
  activationId: string;
  expectedId: Pass65KillstreakId;
  anchor?: SupportVec3;
  /** Horizontal owner-facing hint used only for bounded support ingress choreography. */
  facing?: SupportVec3;
}>;

export type KillstreakControlIntent = Readonly<{
  by: string;
  matchEpoch: number;
  lifeId: number;
  sequence: number;
  entityId: string;
  action: 'toggle-chopper-gunner' | 'toggle-piloted-drone' | 'pilot-control' | 'exit-piloted-drone';
  yawQ?: number;
  pitchQ?: number;
  thrustQ?: number;
  strafeQ?: number;
  verticalQ?: number;
  fire?: boolean;
}>;

export type KillstreakAdmission = Readonly<{
  accepted: boolean;
  reason: string;
  /** Host-generated identity for the admitted activation, never supplied by a peer. */
  activationId: string | null;
  activatedId: Pass65KillstreakId | null;
  entityIds: readonly string[];
}>;

export type KillstreakTrainingGrantContext = Readonly<{
  arenaId: 'gun-range';
  stationKind: 'secure-test-bay';
  authorityRole: 'offline' | 'host';
}>;

export type KillstreakTrainingGrant = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'unknown-actor' | 'life-mismatch' | 'invalid-training-context' | 'unknown-reward';
}>;

export type CareCaptureAdmissionReason =
  | 'accepted'
  | 'identity-mismatch'
  | 'invalid-time'
  | 'reward-capacity'
  | 'crate-unavailable'
  | 'actor-already-capturing'
  | 'capture-admission-failed';

export type KillstreakAdvanceResult = Readonly<{
  damageEvents: readonly KillstreakDamageEvent[];
  impactEvents: readonly KillstreakImpactEvent[];
  expiredEntityIds: readonly string[];
}>;

export type KillstreakActorSnapshot = Readonly<{
  actorId: string;
  team: 0 | 1;
  lifeId: number;
  streak: number;
  cycleProgress: number;
  loadout: KillstreakLoadoutV1;
  available: readonly Pass65KillstreakId[];
  availableCharges: readonly Readonly<{ id: Pass65KillstreakId; count: number }>[];
  adrenalineRemainingMs: number;
  possession: ActorAuthorityState['possession'];
  revealedCareRewards: readonly Pass65KillstreakId[];
}>;

export type KillstreakEntitySnapshot = Readonly<{
  id: string;
  activationId: string;
  ownerId: string;
  team: 0 | 1;
  kind: 'aircraft' | 'chopper' | 'drone' | 'care-crate';
  mode: 'piloted' | 'swarm' | null;
  phase: string;
  position: SupportVec3;
  velocity: SupportVec3;
  attitude: SupportVec3;
  health: number;
  expiresInMs: number;
  magazine: number | null;
  reserveClips: number | null;
  gunProfileId: DroneGunProfileId | null;
  gunController: 'ai' | 'owner-player' | null;
  captureActorId: string | null;
  captureProgress: number | null;
  revealedReward: Pass65KillstreakId | null;
  revision: number;
}>;

export type KillstreakRecipientSnapshot = Readonly<{
  schemaVersion: 2;
  matchEpoch: number;
  revision: number;
  actors: readonly KillstreakActorSnapshot[];
  entities: readonly KillstreakEntitySnapshot[];
  sensorContacts: readonly DroneSensorContact[];
  placementMarkers: readonly KillstreakPlacementMarkerSnapshot[];
}>;

export type KillstreakActorCheckpoint = Readonly<{
  actorId: string;
  team: 0 | 1;
  lifeId: number;
  loadout: KillstreakLoadoutV1;
  streak: number;
  cycleProgress: number;
  earned: readonly Pass65KillstreakId[];
  availableCharges: readonly Readonly<{ id: Pass65KillstreakId; count: number }>[];
  careRewards: readonly Pass65KillstreakId[];
  adrenalineRemainingMs: number;
  lastActivationSequence: number;
  lastControlSequence: number;
}>;

/**
 * Crash-recovery state for the actor-owned reward ladder only. Active support
 * entities and possession are deliberately excluded: a replacement document
 * cannot safely continue their frame-time physics or input ownership.
 */
export type KillstreakRuntimeCheckpoint = Readonly<{
  schemaVersion: typeof KILLSTREAK_RUNTIME_CHECKPOINT_SCHEMA_VERSION;
  matchEpoch: number;
  revision: number;
  entityCounter: number;
  activationCounter: number;
  resultCounter: number;
  seenActivationRequestIds: readonly string[];
  actors: readonly KillstreakActorCheckpoint[];
}>;

function isCheckpointRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasCheckpointKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isCheckpointInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isCheckpointKillstreakId(value: unknown): value is Pass65KillstreakId {
  return typeof value === 'string'
    && PASS65_KILLSTREAK_CATALOG.definitions.some((definition) => definition.id === value);
}

function isKillstreakActorCheckpoint(value: unknown): value is KillstreakActorCheckpoint {
  if (!isCheckpointRecord(value) || !hasCheckpointKeys(value, [
    'actorId', 'team', 'lifeId', 'loadout', 'streak', 'cycleProgress', 'earned',
    'availableCharges', 'careRewards', 'adrenalineRemainingMs',
    'lastActivationSequence', 'lastControlSequence',
  ])) return false;
  let loadout: KillstreakLoadoutV1;
  try {
    loadout = parseKillstreakLoadout(value.loadout);
  } catch {
    return false;
  }
  if (typeof value.actorId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.actorId)
    || value.team !== 0 && value.team !== 1
    || !isCheckpointInteger(value.lifeId, 0, 1_000_000_000)
    || !isCheckpointInteger(value.streak, 0, MAX_REPLICATED_KILLSTREAK_STREAK)
    || !isCheckpointInteger(value.cycleProgress, 0, MAX_REPLICATED_KILLSTREAK_STREAK)
    || !Number.isFinite(value.adrenalineRemainingMs)
    || Number(value.adrenalineRemainingMs) < 0
    || Number(value.adrenalineRemainingMs) > ADRENALINE_DURATION_MS
    || !isCheckpointInteger(value.lastActivationSequence, -1, 1_000_000_000)
    || !isCheckpointInteger(value.lastControlSequence, -1, 1_000_000_000)
    || !Array.isArray(value.earned)
    || !Array.isArray(value.availableCharges)
    || !Array.isArray(value.careRewards)
    || value.careRewards.length > MAX_RETAINED_CARE_REWARDS) return false;

  const finalThreshold = Math.max(...loadout.slots.map((id) => exactDefinition(id, PASS65_KILLSTREAK_CATALOG)?.cost ?? 0));
  if (Number(value.cycleProgress) >= finalThreshold || Number(value.streak) < Number(value.cycleProgress)) return false;
  const earned = value.earned as unknown[];
  if (earned.length > loadout.slots.length || !earned.every(isCheckpointKillstreakId)
    || new Set(earned).size !== earned.length
    || earned.some((id) => !loadout.slots.includes(id as Pass65KillstreakId))) return false;
  const expectedEarned = loadout.slots.filter((id) => (
    (exactDefinition(id, PASS65_KILLSTREAK_CATALOG)?.cost ?? Number.POSITIVE_INFINITY) <= Number(value.cycleProgress)
  ));
  if (earned.length !== expectedEarned.length || expectedEarned.some((id) => !earned.includes(id))) return false;

  const charges = value.availableCharges as unknown[];
  const chargeIds: Pass65KillstreakId[] = [];
  for (const charge of charges) {
    if (!isCheckpointRecord(charge) || !hasCheckpointKeys(charge, ['id', 'count'])
      || !isCheckpointKillstreakId(charge.id) || !loadout.slots.includes(charge.id)
      || !isCheckpointInteger(charge.count, 1, MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD)) return false;
    chargeIds.push(charge.id);
  }
  return new Set(chargeIds).size === chargeIds.length
    && (value.careRewards as unknown[]).every(isCheckpointKillstreakId);
}

export function isKillstreakRuntimeCheckpoint(value: unknown): value is KillstreakRuntimeCheckpoint {
  if (!isCheckpointRecord(value) || !hasCheckpointKeys(value, [
    'schemaVersion', 'matchEpoch', 'revision', 'entityCounter', 'activationCounter',
    'resultCounter', 'seenActivationRequestIds', 'actors',
  ])) return false;
  if (value.schemaVersion !== KILLSTREAK_RUNTIME_CHECKPOINT_SCHEMA_VERSION
    || !isCheckpointInteger(value.matchEpoch, 0, 999_999_999)
    || !isCheckpointInteger(value.revision, 0, 1_000_000_000)
    || !isCheckpointInteger(value.entityCounter, 0, 1_000_000_000)
    || !isCheckpointInteger(value.activationCounter, 0, 1_000_000_000)
    || !isCheckpointInteger(value.resultCounter, 0, 1_000_000_000)
    || !Array.isArray(value.seenActivationRequestIds)
    || value.seenActivationRequestIds.length > MAX_KILLSTREAK_CHECKPOINT_SEEN_ACTIVATIONS
    || !value.seenActivationRequestIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id))
    || new Set(value.seenActivationRequestIds).size !== value.seenActivationRequestIds.length
    || !Array.isArray(value.actors)
    || value.actors.length > MAX_KILLSTREAK_CHECKPOINT_ACTORS
    || !value.actors.every(isKillstreakActorCheckpoint)) return false;
  const actorIds = (value.actors as KillstreakActorCheckpoint[]).map((actor) => actor.actorId);
  return new Set(actorIds).size === actorIds.length;
}

export const CHOPPER_MOTION_VARIANCE = Object.freeze({
  maximumPitchRadians: 0.12,
  maximumYawOffsetRadians: 0.14,
  maximumBankRadians: 0.18,
  maximumAltitudeOffsetM: 1.25,
  maximumRadiusScaleDelta: 0.045,
} as const);

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteTuple(value: SupportVec3 | undefined): value is SupportVec3 {
  return value !== undefined && value.length === 3 && value.every(Number.isFinite);
}

function distance(left: SupportVec3, right: SupportVec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export type ChopperGunnerAuthoritativeRay = Readonly<{
  origin: SupportVec3;
  direction: SupportVec3;
  tracerOrigin: SupportVec3;
}>;

type SupportRayTargetHit = Readonly<{
  target: KillstreakTarget;
  endpoint: SupportVec3;
  distance: number;
  /** True when the centre ray was occluded but the wallbang rule admits the shot at reduced damage. */
  wallbanged: boolean;
}>;

function rotateSupportOffsetYXZ(offset: SupportVec3, attitude: SupportVec3): SupportVec3 {
  const [pitch, yaw, bank] = attitude;
  const c1 = Math.cos(pitch / 2);
  const c2 = Math.cos(yaw / 2);
  const c3 = Math.cos(bank / 2);
  const s1 = Math.sin(pitch / 2);
  const s2 = Math.sin(yaw / 2);
  const s3 = Math.sin(bank / 2);
  const qx = s1 * c2 * c3 + c1 * s2 * s3;
  const qy = c1 * s2 * c3 - s1 * c2 * s3;
  const qz = c1 * c2 * s3 - s1 * s2 * c3;
  const qw = c1 * c2 * c3 + s1 * s2 * s3;
  const uvx = qy * offset[2] - qz * offset[1];
  const uvy = qz * offset[0] - qx * offset[2];
  const uvz = qx * offset[1] - qy * offset[0];
  const uuvx = qy * uvz - qz * uvy;
  const uuvy = qz * uvx - qx * uvz;
  const uuvz = qx * uvy - qy * uvx;
  return Object.freeze([
    offset[0] + 2 * (qw * uvx + uuvx),
    offset[1] + 2 * (qw * uvy + uuvy),
    offset[2] + 2 * (qw * uvz + uuvz),
  ] as const);
}

function translatedSupportOffset(position: SupportVec3, attitude: SupportVec3, offset: SupportVec3): SupportVec3 {
  const rotated = rotateSupportOffsetYXZ(offset, attitude);
  return Object.freeze([
    position[0] + rotated[0],
    position[1] + rotated[1],
    position[2] + rotated[2],
  ] as const);
}

/**
 * One pure host/client geometry contract for the possessed gunner camera and
 * visual muzzle. Both derive from the immutable support snapshot; neither may
 * read the interpolated presentation hierarchy.
 */
export function chopperGunnerCameraOrigin(position: SupportVec3, attitude: SupportVec3): SupportVec3 {
  return translatedSupportOffset(position, attitude, CHOPPER_GUNNER_CAMERA_ORIGIN_LOCAL);
}

export function chopperGunnerAuthoritativeRay(
  position: SupportVec3,
  attitude: SupportVec3,
  aimYaw: number,
  aimPitch: number,
): ChopperGunnerAuthoritativeRay {
  return Object.freeze({
    origin: chopperGunnerCameraOrigin(position, attitude),
    direction: supportForwardFromYawPitch(aimYaw, aimPitch),
    tracerOrigin: translatedSupportOffset(position, attitude, CHOPPER_GUNNER_RAY_POLICY.muzzleSocketLocalM),
  });
}

function hostileTargets(world: KillstreakWorld, ownerId: string, team: 0 | 1): KillstreakTarget[] {
  return world.targets.filter((target) => target.alive
    && target.id !== ownerId
    && (world.areHostile?.(ownerId, team, target) ?? target.team !== team)
    && (target.kind === 'player' || target.kind === 'bot'));
}
function lineOfSight(world: KillstreakWorld, from: SupportVec3, to: SupportVec3): boolean {
  return world.hasLineOfSight?.(from, to) ?? true;
}

function actorPosition(world: KillstreakWorld, actorId: string): SupportVec3 | null {
  return world.targets.find((target) => target.id === actorId && target.alive)?.position ?? null;
}

function supportGroundHeight(world: KillstreakWorld, x: number, z: number): number {
  const queried = world.groundHeightAt?.(x, z);
  return clamp(Number.isFinite(queried) ? queried! : world.bounds.floorY, world.bounds.floorY, world.bounds.ceilingY - 0.5);
}

/**
 * Dynamic terrain/roof clearance for a swarm step. Both ends are sampled so a
 * raised surface between snapshots cannot be crossed using a stale flat-ground
 * floor. The nominal floor is exactly halfway to the admitted spawn height.
 */
export function droneSwarmStepMinimumAltitudeY(
  admittedSpawnY: number,
  current: SupportVec3,
  desired: SupportVec3,
  world: KillstreakWorld,
): number {
  const midpointAt = (x: number, z: number) => {
    const surfaceY = supportGroundHeight(world, x, z);
    return clamp(
      surfaceY + Math.max(1, (admittedSpawnY - surfaceY) * 0.5),
      world.bounds.floorY + 1,
      world.bounds.ceilingY - 0.5,
    );
  };
  return Math.max(midpointAt(current[0], current[2]), midpointAt(desired[0], desired[2]));
}

function exactDefinition(id: string, catalog: KillstreakCatalog<string>) {
  return catalog.definitions.find((definition) => definition.id === id);
}

type SupportBounds = KillstreakWorld['bounds'];

export type ChopperRoutePose = Readonly<{
  position: SupportVec3;
  attitude: SupportVec3;
}>;

function chopperPositionAt(
  seed: number,
  createdAtMs: number,
  nowMs: number,
  routeCentre: SupportVec3,
  bounds: SupportBounds,
): [number, number, number] {
  const seconds = clamp((nowMs - createdAtMs) / 1_000, 0, CHOPPER_DURATION_MS / 1_000);
  const progress = seconds / (CHOPPER_DURATION_MS / 1_000);
  const phase = (salt: number) => unit(seed, salt) * Math.PI * 2;
  const directionVariance = Math.sin(seconds * 0.61 + phase(11)) * 0.09
    + Math.sin(seconds * 0.23 + phase(12)) * 0.045;
  const angle = progress * Math.PI * 2 * 1.35 + phase(10) + directionVariance;
  const radiusX = Math.max(2, Math.min(
    (bounds.maxX - bounds.minX) * 0.36
      * (1 + Math.sin(seconds * 0.31 + phase(13)) * CHOPPER_MOTION_VARIANCE.maximumRadiusScaleDelta),
    routeCentre[0] - bounds.minX - 1,
    bounds.maxX - routeCentre[0] - 1,
  ));
  const radiusZ = Math.max(2, Math.min(
    (bounds.maxZ - bounds.minZ) * 0.36
      * (1 + Math.sin(seconds * 0.27 + phase(14)) * CHOPPER_MOTION_VARIANCE.maximumRadiusScaleDelta),
    routeCentre[2] - bounds.minZ - 1,
    bounds.maxZ - routeCentre[2] - 1,
  ));
  const altitudeVariance = Math.sin(seconds * 0.47 + phase(15)) * 0.8
    + Math.sin(seconds * 0.19 + phase(16)) * 0.45;
  return [
    clamp(routeCentre[0] + Math.cos(angle) * radiusX, bounds.minX + 1, bounds.maxX - 1),
    clamp(routeCentre[1] + altitudeVariance, bounds.floorY + 6, bounds.ceilingY - 1),
    clamp(routeCentre[2] + Math.sin(angle) * radiusZ, bounds.minZ + 1, bounds.maxZ - 1),
  ];
}

/** Pure host route pose used for deterministic two-peer convergence evidence. */
export function chopperRoutePose(
  seed: number,
  createdAtMs: number,
  nowMs: number,
  routeCentre: SupportVec3,
  bounds: SupportBounds,
): ChopperRoutePose {
  const position = chopperPositionAt(seed, createdAtMs, nowMs, routeCentre, bounds);
  const next = chopperPositionAt(seed, createdAtMs, Math.min(createdAtMs + CHOPPER_DURATION_MS, nowMs + 50), routeCentre, bounds);
  const dx = next[0] - position[0];
  const dy = next[1] - position[1];
  const dz = next[2] - position[2];
  const horizontal = Math.max(0.001, Math.hypot(dx, dz));
  const seconds = clamp((nowMs - createdAtMs) / 1_000, 0, CHOPPER_DURATION_MS / 1_000);
  const phase = (salt: number) => unit(seed, salt) * Math.PI * 2;
  const pitch = clamp(
    Math.atan2(dy, horizontal) + Math.sin(seconds * 0.43 + phase(21)) * 0.025,
    -CHOPPER_MOTION_VARIANCE.maximumPitchRadians,
    CHOPPER_MOTION_VARIANCE.maximumPitchRadians,
  );
  const yaw = supportYawForDirection(dx, dz);
  const bank = clamp(
    Math.sin(seconds * 0.36 + phase(22)) * 0.11 + Math.sin(seconds * 0.17 + phase(23)) * 0.05,
    -CHOPPER_MOTION_VARIANCE.maximumBankRadians,
    CHOPPER_MOTION_VARIANCE.maximumBankRadians,
  );
  return Object.freeze({
    position: Object.freeze(position),
    attitude: Object.freeze([pitch, yaw, bank] as const),
  });
}

function clampFlightPosition(position: SupportVec3, world: KillstreakWorld, radius: number): [number, number, number] {
  return [
    clamp(position[0], world.bounds.minX + radius, world.bounds.maxX - radius),
    clamp(position[1], world.bounds.floorY + radius, world.bounds.ceilingY - radius),
    clamp(position[2], world.bounds.minZ + radius, world.bounds.maxZ - radius),
  ];
}

function resolveFlightPosition(
  from: SupportVec3,
  desired: SupportVec3,
  radius: number,
  world: KillstreakWorld,
): [number, number, number] {
  const clamped = clampFlightPosition(desired, world, radius);
  const resolved = world.resolveFlightPosition?.(from, clamped, radius) ?? clamped;
  if (!finiteTuple(resolved)) return [...from];
  const bounded = clampFlightPosition(resolved, world, radius);
  if (world.isFlightPositionValid?.(bounded) === false) return [...from];
  return bounded;
}

function clampFlightEnvelopePosition(
  position: SupportVec3,
  world: KillstreakWorld,
  envelope: SupportAircraftCollisionEnvelope,
): [number, number, number] {
  const clearance = supportAircraftRootClearance(envelope);
  const boundedAxis = (value: number, minimum: number, maximum: number): number => (
    minimum <= maximum ? clamp(value, minimum, maximum) : (minimum + maximum) / 2
  );
  return [
    boundedAxis(position[0], world.bounds.minX + clearance.negativeX, world.bounds.maxX - clearance.positiveX),
    boundedAxis(position[1], world.bounds.floorY + clearance.negativeY, world.bounds.ceilingY - clearance.positiveY),
    boundedAxis(position[2], world.bounds.minZ + clearance.negativeZ, world.bounds.maxZ - clearance.positiveZ),
  ];
}

function resolveFlightEnvelopePosition(
  from: SupportVec3,
  desired: SupportVec3,
  envelope: SupportAircraftCollisionEnvelope,
  world: KillstreakWorld,
): [number, number, number] {
  const clamped = clampFlightEnvelopePosition(desired, world, envelope);
  const resolved = world.resolveFlightEnvelopePosition?.(from, clamped, envelope) ?? clamped;
  if (!finiteTuple(resolved)) return clampFlightEnvelopePosition(from, world, envelope);
  return clampFlightEnvelopePosition(resolved, world, envelope);
}

function supportVec3Distance(left: SupportVec3, right: SupportVec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

/**
 * Admission uses the same host-provided continuous swept-envelope resolver as
 * live movement. Checking both directions also proves that neither endpoint is
 * an already-overlapping hold position. A missing resolver means the arena has
 * no authored aircraft solids and the clamped route remains authoritative.
 */
function carpetFlightRouteAdmitted(
  start: SupportVec3,
  end: SupportVec3,
  envelope: SupportAircraftCollisionEnvelope,
  world: KillstreakWorld,
): boolean {
  if (!world.resolveFlightEnvelopePosition) return supportVec3Distance(start, end) > 0.5;
  const admittedStart = resolveFlightEnvelopePosition(start, start, envelope, world);
  const admittedForward = resolveFlightEnvelopePosition(start, end, envelope, world);
  const admittedEnd = resolveFlightEnvelopePosition(end, end, envelope, world);
  const admittedReverse = resolveFlightEnvelopePosition(end, start, envelope, world);
  return supportVec3Distance(start, end) > 0.5
    && supportVec3Distance(admittedStart, start) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M
    && supportVec3Distance(admittedForward, end) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M
    && supportVec3Distance(admittedEnd, end) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M
    && supportVec3Distance(admittedReverse, start) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M;
}

function admittedAircraftRouteProgress(entity: AircraftEntity): number | null {
  const dx = entity.routeEnd[0] - entity.routeStart[0];
  const dz = entity.routeEnd[2] - entity.routeStart[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-8) return null;
  const rawProgress = ((entity.position[0] - entity.routeStart[0]) * dx
    + (entity.position[2] - entity.routeStart[2]) * dz) / lengthSquared;
  const progress = clamp(rawProgress, 0, 1);
  const lateralX = entity.position[0] - (entity.routeStart[0] + dx * progress);
  const lateralZ = entity.position[2] - (entity.routeStart[2] + dz * progress);
  return Math.hypot(lateralX, lateralZ) <= CARPET_BOMBER_ROUTE_ADMISSION_EPSILON_M * 4
    ? progress
    : null;
}

export type DroneCentreSpawnPlan = Readonly<{
  centre: SupportVec3;
  positions: readonly SupportVec3[];
}>;

function supportFlightCentreVolume(world: KillstreakWorld): Readonly<{ centre: SupportVec3; halfExtents: SupportVec3 }> {
  const width = Math.max(1, world.bounds.maxX - world.bounds.minX);
  const depth = Math.max(1, world.bounds.maxZ - world.bounds.minZ);
  const height = Math.max(1, world.bounds.ceilingY - world.bounds.floorY);
  const fallbackCentre: SupportVec3 = Object.freeze([
    (world.bounds.minX + world.bounds.maxX) / 2,
    clamp(world.bounds.floorY + height * 0.45, world.bounds.floorY + 1, world.bounds.ceilingY - 0.5),
    (world.bounds.minZ + world.bounds.maxZ) / 2,
  ] as const);
  const requested = world.supportFlightCentreVolume;
  const centre = finiteTuple(requested?.centre)
    ? clampFlightPosition(requested!.centre, world, 0.35)
    : fallbackCentre;
  const requestedExtents = requested?.halfExtents;
  const halfExtents: SupportVec3 = Object.freeze([
    clamp(finiteTuple(requestedExtents) ? Math.abs(requestedExtents[0]) : width * 0.12, 1.5, Math.min(8, width * 0.32)),
    clamp(finiteTuple(requestedExtents) ? Math.abs(requestedExtents[1]) : height * 0.05, 0.6, Math.min(2.5, height * 0.2)),
    clamp(finiteTuple(requestedExtents) ? Math.abs(requestedExtents[2]) : depth * 0.12, 1.5, Math.min(8, depth * 0.32)),
  ] as const);
  return Object.freeze({ centre: Object.freeze([...centre]) as unknown as SupportVec3, halfExtents });
}

/**
 * Host-only deterministic centre-map deployment. The first candidate is a
 * separated 6x4 formation; bounded seeded probes recover individual slots from
 * colliders without accepting a caller-provided anchor or collapsing units.
 */
export function planDroneCentreSpawns(world: KillstreakWorld, count: number, seed: number): DroneCentreSpawnPlan {
  if (!Number.isSafeInteger(count) || count < 1 || count > DRONE_SWARM_COUNT) {
    throw new Error('drone centre spawn count must be between 1 and 24');
  }
  const volume = supportFlightCentreVolume(world);
  const columns = count === 1 ? 1 : 6;
  const rows = Math.ceil(count / columns);
  const positions: SupportVec3[] = [];
  const rotation = count === 1 ? 0 : (seed % 4) * Math.PI / 2;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const rotate = (x: number, z: number): readonly [number, number] => Object.freeze([
    x * cosine - z * sine,
    x * sine + z * cosine,
  ] as const);
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const baseX = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * volume.halfExtents[0] * 2;
    const baseZ = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * volume.halfExtents[2] * 2;
    const [rotatedX, rotatedZ] = rotate(baseX, baseZ);
    let admitted: SupportVec3 | null = null;
    for (let attempt = 0; attempt < DRONE_DEPLOYMENT_POLICY.maximumAdmissionProbesPerUnit; attempt += 1) {
      const probeAngle = unit(seed ^ index, 300 + attempt) * Math.PI * 2;
      const probeRadius = attempt === 0 ? 0 : Math.min(
        Math.min(volume.halfExtents[0], volume.halfExtents[2]) * 0.72,
        0.48 * Math.ceil(attempt / 4),
      );
      const raw: SupportVec3 = Object.freeze([
        clamp(volume.centre[0] + rotatedX + Math.cos(probeAngle) * probeRadius, world.bounds.minX + 0.35, world.bounds.maxX - 0.35),
        clamp(
          volume.centre[1] + ((index % 3) - 1) * Math.min(0.8, volume.halfExtents[1])
            + Math.sin(probeAngle * 0.5) * Math.min(0.35, volume.halfExtents[1] * 0.25),
          world.bounds.floorY + 0.5,
          world.bounds.ceilingY - 0.5,
        ),
        clamp(volume.centre[2] + rotatedZ + Math.sin(probeAngle) * probeRadius, world.bounds.minZ + 0.35, world.bounds.maxZ - 0.35),
      ] as const);
      const candidate = world.resolveFlightPosition?.(raw, raw, 0.35) ?? raw;
      if (!finiteTuple(candidate)) continue;
      const resolved = clampFlightPosition(candidate, world, 0.35);
      if (world.isFlightPositionValid?.(resolved) === false) continue;
      if (positions.some((position) => distance(position, resolved) < DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM)) continue;
      admitted = Object.freeze([...resolved]) as unknown as SupportVec3;
      break;
    }
    if (!admitted) return Object.freeze({ centre: volume.centre, positions: Object.freeze([]) });
    positions.push(admitted);
  }
  return Object.freeze({ centre: volume.centre, positions: Object.freeze(positions) });
}

function attitudeFromMotion(
  from: SupportVec3,
  to: SupportVec3,
  fallback: SupportVec3,
): [number, number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-5 && Math.abs(dy) < 1e-5) return [...fallback];
  return [
    clamp(Math.atan2(dy, Math.max(0.001, horizontal)), -0.35, 0.35),
    horizontal >= 1e-5 ? supportYawForDirection(dx, dz, fallback[1]) : fallback[1],
    fallback[2],
  ];
}

export function adrenalineModifiers(activeUntilMs: number, nowMs: number): Readonly<{
  active: boolean;
  damage: number;
  movement: number;
  reloadDuration: number;
}> {
  const active = Number.isFinite(activeUntilMs) && Number.isFinite(nowMs) && nowMs < activeUntilMs;
  return Object.freeze({
    active,
    damage: active ? ADRENALINE_DAMAGE_MULTIPLIER : 1,
    movement: active ? ADRENALINE_MOVEMENT_MULTIPLIER : 1,
    reloadDuration: active ? ADRENALINE_RELOAD_DURATION_MULTIPLIER : 1,
  });
}

export class HostKillstreakRuntime {
  readonly matchEpoch: number;
  private readonly catalog: KillstreakCatalog<string>;
  private readonly actors = new Map<string, ActorAuthorityState>();
  private readonly entities = new Map<string, HostSupportEntity>();
  private readonly carpetBombers = new Map<string, CarpetBomberActivation>();
  private readonly timedActivations = new Map<string, TimedActivation>();
  private readonly swarmFireLanes = new Map<string, { nextAtMs: number; cursor: number }>();
  private revision = 0;
  private entityCounter = 0;
  private activationCounter = 0;
  private resultCounter = 0;
  private readonly seenActivationRequestIds = new Set<string>();
  private lastAdvancedAtMs = 0;
  private readonly hostileTargetCache = new Map<string, readonly KillstreakTarget[]>();
  private readonly sortedHostileTargetCache = new Map<string, readonly KillstreakTarget[]>();

  constructor(matchEpoch: number, catalog: KillstreakCatalog<string> = PASS65_KILLSTREAK_CATALOG) {
    if (!Number.isSafeInteger(matchEpoch) || matchEpoch < 0) throw new Error('match epoch must be a non-negative safe integer');
    this.matchEpoch = matchEpoch;
    this.catalog = catalog;
  }

  registerActor(actorId: string, team: 0 | 1, lifeId: number, loadout: KillstreakLoadoutV1): void {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(actorId)) throw new Error('invalid support actor ID');
    if (!Number.isSafeInteger(lifeId) || lifeId < 0) throw new Error('invalid actor life ID');
    this.actors.set(actorId, {
      actorId,
      team,
      lifeId,
      loadout: parseKillstreakLoadout(loadout),
      streak: 0,
      cycleProgress: 0,
      earned: new Set(),
      availableCharges: new Map(),
      careRewards: [],
      trainingReward: null,
      adrenalineUntilMs: 0,
      possession: null,
      lastActivationSequence: -1,
      lastControlSequence: -1,
    });
    this.revision += 1;
  }

  /** Host-owned attribution retained through the final residual-fire expiry. */
  carpetBomberOwner(activationId: string): Readonly<{ ownerId: string; team: 0 | 1 }> | null {
    const activation = this.carpetBombers.get(activationId);
    if (activation) return Object.freeze({ ownerId: activation.ownerId, team: activation.team });
    for (const entity of this.entities.values()) {
      if (entity.activationId === activationId && entity.kind === 'aircraft') {
        return Object.freeze({ ownerId: entity.ownerId, team: entity.team });
      }
    }
    return null;
  }

  carpetBomberReservationCount(): number {
    return this.carpetBombers.size;
  }

  /**
   * Creates canonical, collision-free damage receipts for hosted humans inside
   * one admitted Carpet Bomber ground-fire patch. The caller supplies only the
   * host's remote-human snapshot; local-player and bot lanes remain unchanged.
   */
  carpetGroundFireDamageEvents(input: Readonly<{
    activationId: string;
    ownerId: string;
    point: SupportVec3;
    radiusM: number;
    damage: number;
    atMs: number;
  }>, targets: readonly KillstreakTarget[], hasLineOfSight: (
    from: SupportVec3,
    to: SupportVec3,
  ) => boolean = () => true): readonly KillstreakDamageEvent[] {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.activationId)
      || !/^[A-Za-z0-9_-]{1,80}$/.test(input.ownerId)
      || !finiteTuple(input.point)
      || !Number.isFinite(input.radiusM) || input.radiusM <= 0
      || !Number.isFinite(input.damage) || input.damage <= 0
      || !Number.isFinite(input.atMs) || input.atMs < 0) return Object.freeze([]);
    const radiusSquared = input.radiusM * input.radiusM;
    const events: KillstreakDamageEvent[] = [];
    for (const target of [...targets].sort((left, right) => left.id.localeCompare(right.id))) {
      if (target.kind !== 'player' || !target.alive || !finiteTuple(target.position)) continue;
      const dx = target.position[0] - input.point[0];
      const dz = target.position[2] - input.point[2];
      if (dx * dx + dz * dz >= radiusSquared || !hasLineOfSight(input.point, target.position)) continue;
      events.push(this.damageEvent(
        input.activationId,
        'carpet-bomber',
        input.ownerId,
        target,
        input.damage,
        input.point,
        input.atMs,
        target.position,
        input.point,
      ));
      if (events.length >= MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP) break;
    }
    return Object.freeze(events);
  }

  checkpoint(nowMs: number): KillstreakRuntimeCheckpoint | null {
    if (!Number.isFinite(nowMs)
      || this.actors.size > MAX_KILLSTREAK_CHECKPOINT_ACTORS
      || this.seenActivationRequestIds.size > MAX_KILLSTREAK_CHECKPOINT_SEEN_ACTIVATIONS) return null;
    const actors = [...this.actors.values()]
      .sort((left, right) => left.actorId.localeCompare(right.actorId))
      .map((actor): KillstreakActorCheckpoint => Object.freeze({
        actorId: actor.actorId,
        team: actor.team,
        lifeId: actor.lifeId,
        loadout: parseKillstreakLoadout(actor.loadout),
        streak: actor.streak,
        cycleProgress: actor.cycleProgress,
        earned: Object.freeze(actor.loadout.slots.filter((id) => actor.earned.has(id))),
        availableCharges: Object.freeze(actor.loadout.slots.flatMap((id) => {
          const count = actor.availableCharges.get(id) ?? 0;
          return count > 0 ? [Object.freeze({ id, count })] : [];
        })),
        careRewards: Object.freeze([...actor.careRewards]),
        adrenalineRemainingMs: Math.max(0, actor.adrenalineUntilMs - nowMs),
        lastActivationSequence: actor.lastActivationSequence,
        lastControlSequence: actor.lastControlSequence,
      }));
    const checkpoint: KillstreakRuntimeCheckpoint = Object.freeze({
      schemaVersion: KILLSTREAK_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
      matchEpoch: this.matchEpoch,
      revision: this.revision,
      entityCounter: this.entityCounter,
      activationCounter: this.activationCounter,
      resultCounter: this.resultCounter,
      seenActivationRequestIds: Object.freeze([...this.seenActivationRequestIds].sort()),
      actors: Object.freeze(actors),
    });
    return isKillstreakRuntimeCheckpoint(checkpoint) ? checkpoint : null;
  }

  /** Restore once into a fresh runtime; caller resets disconnected transport sequences afterwards. */
  restoreCheckpoint(checkpoint: unknown, nowMs: number, downtimeMs = 0): boolean {
    if (!Number.isFinite(nowMs)
      || !Number.isFinite(downtimeMs)
      || downtimeMs < 0
      || !isKillstreakRuntimeCheckpoint(checkpoint)
      || checkpoint.matchEpoch !== this.matchEpoch
      || this.actors.size !== 0
      || this.entities.size !== 0
      || this.carpetBombers.size !== 0
      || this.timedActivations.size !== 0
      || this.swarmFireLanes.size !== 0
      || this.seenActivationRequestIds.size !== 0
      || this.revision !== 0
      || this.entityCounter !== 0
      || this.activationCounter !== 0
      || this.resultCounter !== 0
      || this.lastAdvancedAtMs !== 0) return false;

    const restoredActors = checkpoint.actors.map((actor): ActorAuthorityState => ({
      actorId: actor.actorId,
      team: actor.team,
      lifeId: actor.lifeId,
      loadout: parseKillstreakLoadout(actor.loadout),
      streak: actor.streak,
      cycleProgress: actor.cycleProgress,
      earned: new Set(actor.earned),
      availableCharges: new Map(actor.availableCharges.map((charge) => [charge.id, charge.count])),
      careRewards: [...actor.careRewards],
      trainingReward: null,
      adrenalineUntilMs: nowMs + Math.max(0, actor.adrenalineRemainingMs - downtimeMs),
      possession: null,
      lastActivationSequence: actor.lastActivationSequence,
      lastControlSequence: actor.lastControlSequence,
    }));
    for (const actor of restoredActors) this.actors.set(actor.actorId, actor);
    for (const requestId of checkpoint.seenActivationRequestIds) this.seenActivationRequestIds.add(requestId);
    this.revision = checkpoint.revision;
    this.entityCounter = checkpoint.entityCounter;
    this.activationCounter = checkpoint.activationCounter;
    this.resultCounter = checkpoint.resultCounter;
    this.lastAdvancedAtMs = nowMs;
    return true;
  }

  recordEligibleElimination(actorId: string, source: 'weapon' | 'ordnance' | 'killstreak'): readonly Pass65KillstreakId[] {
    const actor = this.actors.get(actorId);
    if (!actor || source === 'killstreak') return [];
    actor.streak = Math.min(MAX_REPLICATED_KILLSTREAK_STREAK, actor.streak + 1);
    const nextCycleProgress = actor.cycleProgress + 1;
    const unlocks = actor.loadout.slots.filter((id) => {
      const definition = exactDefinition(id, this.catalog);
      return definition && !actor.earned.has(id) && nextCycleProgress >= definition.cost;
    });
    // Backpressure is explicit: never advance past an unlock whose bank cannot
    // accept another charge. Spending one charge resumes progression on a later
    // eligible elimination, so an earned reward is never silently discarded.
    if (unlocks.some((id) => (
      actor.availableCharges.get(id) ?? 0
    ) >= MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD)) {
      this.revision += 1;
      return Object.freeze([]);
    }
    actor.cycleProgress = nextCycleProgress;
    const newlyEarned: Pass65KillstreakId[] = [];
    for (const id of unlocks) {
      actor.earned.add(id);
      actor.availableCharges.set(id, (actor.availableCharges.get(id) ?? 0) + 1);
      newlyEarned.push(id);
    }
    const finalThreshold = Math.max(...actor.loadout.slots.map((id) => exactDefinition(id, this.catalog)?.cost ?? 0));
    if (finalThreshold > 0 && actor.cycleProgress >= finalThreshold) {
      actor.cycleProgress = 0;
      actor.earned.clear();
    }
    // Streak is replicated authority too. Advancing the revision on every
    // eligible elimination lets recipients reject an older reward projection
    // even when neither snapshot crossed an unlock threshold.
    this.revision += 1;
    return Object.freeze(newlyEarned);
  }

  /** Host-owned life identity used to rebind an authenticated replacement transport. */
  actorLifeId(actorId: string): number | null {
    return this.actors.get(actorId)?.lifeId ?? null;
  }

  recordActorDeath(actorId: string, nextLifeId: number): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.lifeId = nextLifeId;
    actor.streak = 0;
    actor.cycleProgress = 0;
    actor.earned.clear();
    actor.trainingReward = null;
    actor.adrenalineUntilMs = 0;
    actor.lastActivationSequence = -1;
    actor.lastControlSequence = -1;
    this.restoreActorControl(actor, true);
    for (const entity of this.entities.values()) {
      if (entity.kind === 'chopper' && entity.ownerId === actorId && entity.gunController !== 'ai') {
        entity.gunController = 'ai';
        entity.pendingPlayerFire = false;
        entity.revision += 1;
      } else if (entity.kind === 'care-crate' && entity.captureActorId === actorId) {
        entity.phase = 'landed';
        entity.captureActorId = null;
        entity.captureStartedAtMs = null;
        entity.revision += 1;
      }
    }
    this.revision += 1;
  }

  /**
   * A transport disconnect ends possession immediately without deleting earned
   * rewards or per-match progress. Sequence domains restart on the replacement
   * transport, while activation request IDs remain globally replay-protected.
   */
  recordActorDisconnect(actorId: string): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.lastActivationSequence = -1;
    actor.lastControlSequence = -1;
    actor.trainingReward = null;
    this.restoreActorControl(actor, true);
    for (const entity of this.entities.values()) {
      if (entity.kind === 'chopper' && entity.ownerId === actorId && entity.gunController !== 'ai') {
        entity.gunController = 'ai';
        entity.pendingPlayerFire = false;
        entity.revision += 1;
      } else if (entity.kind === 'care-crate' && entity.captureActorId === actorId) {
        entity.phase = 'landed';
        entity.captureActorId = null;
        entity.captureStartedAtMs = null;
        entity.revision += 1;
      }
    }
    this.revision += 1;
  }

  /** Permanently removes an actor and every support resource it owns. */
  unregisterActor(actorId: string): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    this.recordActorDisconnect(actorId);
    for (const entity of [...this.entities.values()]) {
      if (entity.ownerId === actorId) this.expireEntity(entity.id);
    }
    for (const [activationId, activation] of this.carpetBombers) {
      if (activation.ownerId !== actorId) continue;
      if (activation.authorityReleaseAtMs === null) {
        this.carpetBombers.delete(activationId);
        continue;
      }
      // Permanently leaving cancels deferred ordnance, but an already-emitted
      // residual-fire lane retains its owner and reservation until expiry.
      activation.nextDropOrdinal = activation.impacts.length;
      activation.nextImpactOrdinal = activation.impacts.length;
    }
    for (const [activationId, activation] of this.timedActivations) {
      if (activation.ownerId === actorId) this.timedActivations.delete(activationId);
    }
    this.actors.delete(actorId);
    this.revision += 1;
  }

  /** Ends the epoch's active support while retaining a final, non-possessed projection. */
  endMatch(): readonly string[] {
    for (const actor of this.actors.values()) {
      actor.adrenalineUntilMs = 0;
      actor.trainingReward = null;
      this.restoreActorControl(actor, true);
    }
    const expired = [...this.entities.keys()];
    for (const entityId of expired) this.expireEntity(entityId);
    this.carpetBombers.clear();
    this.timedActivations.clear();
    this.swarmFireLanes.clear();
    this.revision += 1;
    return Object.freeze(expired);
  }

  private nextEntityId(kind: string): string {
    this.entityCounter += 1;
    return `ks-${this.matchEpoch}-${kind}-${this.entityCounter}`;
  }

  private nextActivationId(): string {
    this.activationCounter += 1;
    return `ks-activation-${this.matchEpoch}-${this.activationCounter}`;
  }

  private actualActivationId(actor: ActorAuthorityState, slot: 1 | 2 | 3 | 4 | 5): Pass65KillstreakId {
    if (slot === 1 && actor.trainingReward) return actor.trainingReward;
    if (slot === 1 && actor.careRewards.length > 0) return actor.careRewards[0];
    return actor.loadout.slots[slot - 1];
  }

  /**
   * Host/offline-only bridge for the secure Gun Range test bay. The next
   * activation still traverses the normal activation admission, entity caps,
   * placement, damage and replication path; this grants no client authority.
   */
  grantTrainingReward(
    actorId: string,
    lifeId: number,
    id: Pass65KillstreakId,
    context: KillstreakTrainingGrantContext,
  ): KillstreakTrainingGrant {
    const reject = (reason: KillstreakTrainingGrant['reason']): KillstreakTrainingGrant => Object.freeze({ accepted: false, reason });
    if (context.arenaId !== 'gun-range' || context.stationKind !== 'secure-test-bay'
      || context.authorityRole !== 'offline' && context.authorityRole !== 'host') return reject('invalid-training-context');
    const actor = this.actors.get(actorId);
    if (!actor) return reject('unknown-actor');
    if (actor.lifeId !== lifeId) return reject('life-mismatch');
    if (!exactDefinition(id, this.catalog)) return reject('unknown-reward');
    actor.trainingReward = id;
    this.revision += 1;
    return Object.freeze({ accepted: true, reason: 'accepted' });
  }

  activate(intent: KillstreakActivationIntent, nowMs: number, world: KillstreakWorld): KillstreakAdmission {
    const actor = this.actors.get(intent.by);
    const reject = (reason: string): KillstreakAdmission => Object.freeze({
      accepted: false, reason, activationId: null, activatedId: null, entityIds: [],
    });
    if (!actor) return reject('unknown-actor');
    if (intent.matchEpoch !== this.matchEpoch) return reject('match-epoch-mismatch');
    if (intent.lifeId !== actor.lifeId) return reject('life-mismatch');
    if (!Number.isSafeInteger(intent.sequence) || intent.sequence <= actor.lastActivationSequence) return reject('replayed-sequence');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(intent.activationId)) return reject('invalid-activation-id');
    if (!Number.isFinite(nowMs)) return reject('invalid-time');
    const actualId = this.actualActivationId(actor, intent.slot);
    if (actualId !== intent.expectedId) return reject('selection-mismatch');
    const fromTraining = intent.slot === 1 && actor.trainingReward === actualId;
    const fromCare = !fromTraining && intent.slot === 1 && actor.careRewards[0] === actualId;
    if (!fromTraining && !fromCare && (actor.availableCharges.get(actualId) ?? 0) < 1) return reject('reward-not-earned');
    if (this.seenActivationRequestIds.has(intent.activationId)) return reject('duplicate-activation-id');
    const entityNeed = actualId === 'drone-swarm' ? DRONE_SWARM_COUNT
      : actualId === 'care-package' ? 2
      : actualId === 'chopper' || actualId === 'piloted-drone' || actualId === 'carpet-bomber' ? 1 : 0;
    if (this.entities.size + entityNeed > MAX_ACTIVE_SUPPORT_ENTITIES) return reject('support-entity-cap');
    if (actualId === 'carpet-bomber'
      && this.carpetBombers.size >= MAX_ACTIVE_CARPET_BOMBER_RESERVATIONS) return reject('carpet-reservation-cap');
    if ([...this.entities.values()].some((entity) => entity.ownerId === actor.actorId
      && (actualId === 'chopper' && entity.kind === 'chopper'
        || actualId === 'piloted-drone' && entity.kind === 'drone' && entity.mode === 'piloted'
        || actualId === 'drone-swarm' && entity.kind === 'drone' && entity.mode === 'swarm'))) return reject('duplicate-owner-support-kind');

    const activationId = this.nextActivationId();
    const seed = hashText(`${this.matchEpoch}:${activationId}:${actualId}`);
    const requestedAnchor = finiteTuple(intent.anchor) ? this.clampAnchor(intent.anchor, world) : this.defaultAnchor(actor.actorId, world);
    const anchor: [number, number, number] = actualId === 'care-package' || actualId === 'carpet-bomber'
      ? [requestedAnchor[0], supportGroundHeight(world, requestedAnchor[0], requestedAnchor[2]), requestedAnchor[2]]
      : requestedAnchor;
    const carpetPlan = actualId === 'carpet-bomber'
      ? this.carpetImpactPattern(anchor, seed, world, intent.facing)
      : null;
    // Route admission precedes request replay state and reward consumption. A
    // blocked room/roof topology therefore leaves the earned streak retryable.
    if (actualId === 'carpet-bomber' && carpetPlan === null) return reject('no-clear-carpet-route');
    const droneSpawnPlan = actualId === 'piloted-drone'
      ? planDroneCentreSpawns(world, 1, seed)
      : actualId === 'drone-swarm'
        ? planDroneCentreSpawns(world, DRONE_SWARM_COUNT, seed)
        : null;
    if (droneSpawnPlan && droneSpawnPlan.positions.length !== (actualId === 'drone-swarm' ? DRONE_SWARM_COUNT : 1)) {
      return reject('no-valid-centre-drone-spawn-volume');
    }
    actor.lastActivationSequence = intent.sequence;
    this.seenActivationRequestIds.add(intent.activationId);
    if (fromTraining) actor.trainingReward = null;
    else if (fromCare) actor.careRewards.shift();
    else {
      const remainingCharges = (actor.availableCharges.get(actualId) ?? 0) - 1;
      if (remainingCharges > 0) actor.availableCharges.set(actualId, remainingCharges);
      else actor.availableCharges.delete(actualId);
    }
    const entityIds: string[] = [];

    if (actualId === 'adrenaline') {
      actor.adrenalineUntilMs = nowMs + ADRENALINE_DURATION_MS;
      this.timedActivations.set(activationId, { activationId, ownerId: actor.actorId, id: actualId, expiresAtMs: actor.adrenalineUntilMs });
    } else if (actualId === 'care-package') {
      const rollUnit = seed % this.catalog.carePackagePool.totalWeightUnits;
      const reward = rewardForCarePackageUnit(this.catalog, rollUnit) as Pass65KillstreakId;
      const id = this.nextEntityId('care');
      const aircraftId = this.nextEntityId('care-aircraft');
      const top = Math.min(world.bounds.ceilingY - 1, Math.max(world.bounds.floorY + 12, world.bounds.floorY + 24));
      const direction = unit(seed, 31) < 0.5 ? -1 : 1;
      const lateral = (unit(seed, 32) - 0.5) * 2.4;
      const routeStart: [number, number, number] = [
        clamp(anchor[0] - direction * 18, world.bounds.minX + 1.5, world.bounds.maxX - 1.5),
        top,
        clamp(anchor[2] + lateral, world.bounds.minZ + 1.5, world.bounds.maxZ - 1.5),
      ];
      const routeEnd: [number, number, number] = [
        clamp(anchor[0] + direction * 90, world.bounds.minX + 1.5, world.bounds.maxX - 1.5),
        top,
        clamp(anchor[2] - lateral, world.bounds.minZ + 1.5, world.bounds.maxZ - 1.5),
      ];
      const dropProgress = CARE_AIRCRAFT_DROP_DELAY_MS / CARE_AIRCRAFT_DURATION_MS;
      const dropEased = dropProgress * dropProgress * (3 - 2 * dropProgress);
      const descentStartPosition: [number, number, number] = [
        routeStart[0] + (routeEnd[0] - routeStart[0]) * dropEased,
        routeStart[1] + Math.sin(dropProgress * Math.PI + unit(seed, 33) * Math.PI) * 0.28 - 0.9,
        routeStart[2] + (routeEnd[2] - routeStart[2]) * dropEased,
      ];
      this.entities.set(aircraftId, {
        id: aircraftId, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + CARE_AIRCRAFT_DURATION_MS,
        position: routeStart, velocity: [0, 0, 0],
        attitude: [0, supportYawForDirection(routeEnd[0] - routeStart[0], routeEnd[2] - routeStart[2]), 0],
        health: 1, revision: 0, kind: 'aircraft', variant: 'care', phase: 'inbound', seed, routeStart, routeEnd,
      });
      this.entities.set(id, {
        id, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + 60_000,
        position: [...routeStart], velocity: [0, 0, 0], attitude: [0, 0, 0], health: 100, revision: 0,
        kind: 'care-crate', phase: 'inbound', dropPosition: [anchor[0], anchor[1] + 0.45, anchor[2]],
        descentStartPosition, descentStartsAtMs: nowMs + CARE_AIRCRAFT_DROP_DELAY_MS, aircraftId,
        reward, rollUnit, captureActorId: null, captureStartedAtMs: null,
      });
      entityIds.push(id, aircraftId);
    } else if (actualId === 'carpet-bomber') {
      const plan = carpetPlan!;
      const impacts = plan.impacts;
      const groundAnchor: SupportVec3 = Object.freeze([...anchor] as [number, number, number]);
      const aircraftId = this.nextEntityId('carpet-aircraft');
      const pathStart: SupportVec3 = plan.pathStart;
      const pathEnd: SupportVec3 = plan.pathEnd;
      this.carpetBombers.set(activationId, {
        activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, aircraftId, authorityReleaseAtMs: null, impacts,
        impactAtMs: impacts.map((_, ordinal) => nowMs + CARPET_TARGET_MARKER_MAX_LIFETIME_MS + ordinal * 180),
        anchor: groundAnchor, pathStart, pathEnd, halfWidthM: plan.halfWidthM,
        nextDropOrdinal: 0, nextImpactOrdinal: 0,
        dropRouteProgress: plan.dropRouteProgress, routeCompleted: false, routeCanceled: false,
      });
      const flightStart = plan.flightStart;
      const flightEnd = plan.flightEnd;
      this.entities.set(aircraftId, {
        id: aircraftId, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + CARE_AIRCRAFT_DURATION_MS,
        position: [...flightStart], velocity: [0, 0, 0], attitude: [0, supportYawForDirection(flightEnd[0] - flightStart[0], flightEnd[2] - flightStart[2]), 0],
        health: 1, revision: 0, kind: 'aircraft', variant: 'carpet', phase: 'inbound', seed, routeStart: [...flightStart], routeEnd: [...flightEnd],
      });
      entityIds.push(aircraftId);
    } else if (actualId === 'chopper') {
      const id = this.nextEntityId('chopper');
      const authoredCentre = supportFlightCentreVolume(world).centre;
      const centre: [number, number, number] = [...authoredCentre];
      const chopper: ChopperEntity = {
        id, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + CHOPPER_DURATION_MS,
        position: [centre[0], centre[1], centre[2]], velocity: [0, 0, 0], attitude: [0, 0, 0], health: CHOPPER_HEALTH, revision: 0,
        kind: 'chopper', phase: 'inbound', seed, routeCentre: centre, gunController: 'ai',
        nextShotAtMs: nowMs + 600, aimYaw: 0, aimPitch: 0, pendingPlayerFire: false,
      };
      const pose = chopperRoutePose(seed, nowMs, nowMs, centre, world.bounds);
      chopper.position = resolveFlightPosition(centre, pose.position, 1.25, world);
      chopper.attitude = attitudeFromMotion(centre, chopper.position, pose.attitude);
      this.entities.set(id, chopper);
      entityIds.push(id);
    } else if (actualId === 'piloted-drone') {
      this.restoreActorControl(actor, true);
      const id = this.nextEntityId('pilot-drone');
      const admittedSpawn = [...droneSpawnPlan!.positions[0]!] as [number, number, number];
      this.entities.set(id, {
        id, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + PILOTED_DRONE_DURATION_MS,
        position: admittedSpawn, velocity: [0, 0, 0], attitude: [0, 0, 0], health: DRONE_HEALTH, revision: 0,
        kind: 'drone', mode: 'piloted', phase: 'active', seed,
        magazine: DRONE_MAGAZINE_SIZE, reserveClips: PILOTED_DRONE_RESERVE_CLIPS,
        reloadCompletesAtMs: null, nextShotAtMs: nowMs, targetId: null,
        yaw: 0, pitch: 0, thrust: 0, strafe: 0, vertical: 0, pendingPlayerFire: false,
        gunProfileId: DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId,
        nextSensorRefreshAtMs: nowMs,
        sensorContacts: [],
        swarmOrdinal: null,
        swarmIngressTarget: null,
        swarmPatrolTarget: null,
        swarmPatrolRefreshAtMs: Number.POSITIVE_INFINITY,
        swarmAdmittedSpawnY: null,
      });
      entityIds.push(id);
    } else if (actualId === 'drone-swarm') {
      for (let index = 0; index < DRONE_SWARM_COUNT; index += 1) {
        const id = this.nextEntityId('swarm-drone');
        const group = index % 6;
        const row = Math.floor(index / 6);
        const admittedSpawn = [...droneSpawnPlan!.positions[index]!] as [number, number, number];
        const routeAngle = group / 6 * Math.PI * 2
          + (row - 1.5) * 0.11
          + (unit(seed ^ index, 71) - 0.5) * 0.16;
        const routeDistance = Math.min(
          (world.bounds.maxX - world.bounds.minX) * 0.31,
          (world.bounds.maxZ - world.bounds.minZ) * 0.31,
        ) * (0.72 + row * 0.06);
        const rawIngressTarget: [number, number, number] = [
          clamp(droneSpawnPlan!.centre[0] + Math.cos(routeAngle) * routeDistance, world.bounds.minX + 0.5, world.bounds.maxX - 0.5),
          clamp(admittedSpawn[1] + ((index % 3) - 1) * 0.7, world.bounds.floorY + 1, world.bounds.ceilingY - 0.5),
          clamp(droneSpawnPlan!.centre[2] + Math.sin(routeAngle) * routeDistance, world.bounds.minZ + 0.5, world.bounds.maxZ - 0.5),
        ];
        const ingressTarget = resolveFlightPosition(admittedSpawn, rawIngressTarget, 0.35, world);
        const ingressDx = ingressTarget[0] - admittedSpawn[0];
        const ingressDy = ingressTarget[1] - admittedSpawn[1];
        const ingressDz = ingressTarget[2] - admittedSpawn[2];
        const ingressRange = Math.max(0.001, Math.hypot(ingressDx, ingressDy, ingressDz));
        const inboundSpeed = DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps;
        this.entities.set(id, {
          id, activationId, ownerId: actor.actorId, team: actor.team,
          createdAtMs: nowMs, expiresAtMs: nowMs + DRONE_SWARM_DURATION_MS,
          position: admittedSpawn,
          velocity: [ingressDx / ingressRange * inboundSpeed, ingressDy / ingressRange * inboundSpeed, ingressDz / ingressRange * inboundSpeed],
          attitude: [0, supportYawForDirection(ingressDx, ingressDz), 0], health: DRONE_HEALTH, revision: 0,
          kind: 'drone', mode: 'swarm', phase: 'active', seed: seed ^ index,
          magazine: DRONE_MAGAZINE_SIZE, reserveClips: null,
          reloadCompletesAtMs: null, nextShotAtMs: nowMs + 500 + index * 35, targetId: null,
          yaw: 0, pitch: 0, thrust: 0, strafe: 0, vertical: 0, pendingPlayerFire: false,
          gunProfileId: DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId,
          nextSensorRefreshAtMs: Number.POSITIVE_INFINITY,
          sensorContacts: [],
          swarmOrdinal: index,
          swarmIngressTarget: [...ingressTarget],
          swarmPatrolTarget: null,
          swarmPatrolRefreshAtMs: nowMs + 2_000,
          swarmAdmittedSpawnY: admittedSpawn[1],
        });
        entityIds.push(id);
      }
      this.swarmFireLanes.set(activationId, { nextAtMs: nowMs + 500, cursor: 0 });
    } else {
      const definition = exactDefinition(actualId, this.catalog);
      this.timedActivations.set(activationId, {
        activationId,
        ownerId: actor.actorId,
        id: actualId,
        expiresAtMs: nowMs + Math.max(1, definition?.durationMs ?? 1),
      });
    }
    this.revision += 1;
    return Object.freeze({
      accepted: true,
      reason: 'accepted',
      activationId,
      activatedId: actualId,
      entityIds: Object.freeze(entityIds),
    });
  }

  private clampAnchor(anchor: SupportVec3, world: KillstreakWorld): [number, number, number] {
    return [
      clamp(anchor[0], world.bounds.minX, world.bounds.maxX),
      clamp(anchor[1], world.bounds.floorY, world.bounds.ceilingY),
      clamp(anchor[2], world.bounds.minZ, world.bounds.maxZ),
    ];
  }

  private defaultAnchor(actorId: string, world: KillstreakWorld): [number, number, number] {
    const actor = actorPosition(world, actorId);
    return this.clampAnchor(actor ?? [
      (world.bounds.minX + world.bounds.maxX) / 2,
      world.bounds.floorY,
      (world.bounds.minZ + world.bounds.maxZ) / 2,
    ], world);
  }

  private carpetImpactPattern(
    anchor: SupportVec3,
    seed: number,
    world: KillstreakWorld,
    requestedFacing?: SupportVec3,
    headingAttempt = 0,
    admittedBaseAngle?: number,
  ): CarpetImpactPlan | null {
    const requestedStrikeBounds = world.supportStrikeBoundsAt?.(anchor);
    const strikeBounds = requestedStrikeBounds
      && [requestedStrikeBounds.minX, requestedStrikeBounds.maxX, requestedStrikeBounds.minZ, requestedStrikeBounds.maxZ].every(Number.isFinite)
      && requestedStrikeBounds.minX <= anchor[0] && anchor[0] <= requestedStrikeBounds.maxX
      && requestedStrikeBounds.minZ <= anchor[2] && anchor[2] <= requestedStrikeBounds.maxZ
      && requestedStrikeBounds.minX >= world.bounds.minX && requestedStrikeBounds.maxX <= world.bounds.maxX
      && requestedStrikeBounds.minZ >= world.bounds.minZ && requestedStrikeBounds.maxZ <= world.bounds.maxZ
      ? requestedStrikeBounds
      : world.bounds;
    const requestedLength = requestedFacing ? Math.hypot(requestedFacing[0], requestedFacing[2]) : 0;
    const baseAngle = admittedBaseAngle ?? (requestedFacing && Number.isFinite(requestedLength) && requestedLength > 0.001
      ? Math.atan2(requestedFacing[2] / requestedLength, requestedFacing[0] / requestedLength)
      : unit(seed, 1) * Math.PI * 2);
    const angle = baseAngle + (CARPET_BOMBER_ROUTE_HEADING_OFFSETS[headingAttempt] ?? 0);
    const forward: readonly [number, number] = [Math.cos(angle), Math.sin(angle)];
    const side: readonly [number, number] = [-forward[1], forward[0]];
    const impactInsetM = CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M;
    const impactMinX = strikeBounds.maxX - strikeBounds.minX >= impactInsetM * 2
      ? strikeBounds.minX + impactInsetM
      : (strikeBounds.minX + strikeBounds.maxX) / 2;
    const impactMaxX = strikeBounds.maxX - strikeBounds.minX >= impactInsetM * 2
      ? strikeBounds.maxX - impactInsetM
      : impactMinX;
    const impactMinZ = strikeBounds.maxZ - strikeBounds.minZ >= impactInsetM * 2
      ? strikeBounds.minZ + impactInsetM
      : (strikeBounds.minZ + strikeBounds.maxZ) / 2;
    const impactMaxZ = strikeBounds.maxZ - strikeBounds.minZ >= impactInsetM * 2
      ? strikeBounds.maxZ - impactInsetM
      : impactMinZ;
    const impactCentre: SupportVec3 = Object.freeze([
      clamp(anchor[0], impactMinX, impactMaxX),
      anchor[1],
      clamp(anchor[2], impactMinZ, impactMaxZ),
    ] as const);
    const impacts = Object.freeze(Array.from({ length: CARPET_BOMBER_IMPACT_COUNT }, (_, index) => {
      const along = (index / (CARPET_BOMBER_IMPACT_COUNT - 1) - 0.5) * 34;
      const zigzag = (index % 2 === 0 ? -1 : 1) * (3.4 + unit(seed, index + 2) * 2.2);
      const deltaX = forward[0] * along + side[0] * zigzag;
      const deltaZ = forward[1] * along + side[1] * zigzag;
      let boundaryScale = 1;
      if (deltaX > 0) boundaryScale = Math.min(boundaryScale, (impactMaxX - impactCentre[0]) / deltaX);
      else if (deltaX < 0) boundaryScale = Math.min(boundaryScale, (impactMinX - impactCentre[0]) / deltaX);
      if (deltaZ > 0) boundaryScale = Math.min(boundaryScale, (impactMaxZ - impactCentre[2]) / deltaZ);
      else if (deltaZ < 0) boundaryScale = Math.min(boundaryScale, (impactMinZ - impactCentre[2]) / deltaZ);
      boundaryScale = clamp(boundaryScale, 0, 1);
      const x = impactCentre[0] + deltaX * boundaryScale;
      const z = impactCentre[2] + deltaZ * boundaryScale;
      return Object.freeze([
        x,
        supportGroundHeight(world, x, z),
        z,
      ] as const);
    }));
    // Keep the corridor faithful to the seeded aircraft run. Clipping an
    // impact at a map edge can move its projection slightly, so use the
    // admitted payload's min/max forward projections for finite end caps.
    const projections = impacts.map((impact) => (
      (impact[0] - impactCentre[0]) * forward[0] + (impact[2] - impactCentre[2]) * forward[1]
    ));
    const minimumProjection = Math.min(...projections);
    const maximumProjection = Math.max(...projections);
    const start: SupportVec3 = Object.freeze([
      impactCentre[0] + forward[0] * minimumProjection,
      anchor[1],
      impactCentre[2] + forward[1] * minimumProjection,
    ] as const);
    const end: SupportVec3 = Object.freeze([
      impactCentre[0] + forward[0] * maximumProjection,
      anchor[1],
      impactCentre[2] + forward[1] * maximumProjection,
    ] as const);
    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const length = Math.max(0.001, Math.hypot(dx, dz));
    let maximumPerpendicular = 0;
    for (const impact of impacts) {
      const perpendicular = Math.abs((impact[0] - start[0]) * dz - (impact[2] - start[2]) * dx) / length;
      maximumPerpendicular = Math.max(maximumPerpendicular, perpendicular);
    }
    const yaw = supportYawForDirection(forward[0], forward[1]);
    const flightEnvelope: SupportAircraftCollisionEnvelope = {
      ...CARPET_BOMBER_COLLISION_ENVELOPE,
      yaw,
    };
    const clearance = supportAircraftRootClearance(flightEnvelope);
    const safeMinX = strikeBounds.minX + clearance.negativeX + CARPET_BOMBER_ROUTE_CLEARANCE_M;
    const safeMaxX = strikeBounds.maxX - clearance.positiveX - CARPET_BOMBER_ROUTE_CLEARANCE_M;
    const safeMinZ = strikeBounds.minZ + clearance.negativeZ + CARPET_BOMBER_ROUTE_CLEARANCE_M;
    const safeMaxZ = strikeBounds.maxZ - clearance.positiveZ - CARPET_BOMBER_ROUTE_CLEARANCE_M;
    const flightCentreX = safeMinX <= safeMaxX ? clamp(impactCentre[0], safeMinX, safeMaxX) : impactCentre[0];
    const flightCentreZ = safeMinZ <= safeMaxZ ? clamp(impactCentre[2], safeMinZ, safeMaxZ) : impactCentre[2];
    let minimumFlightProjection = minimumProjection;
    let maximumFlightProjection = maximumProjection;
    const restrictProjection = (direction: number, centre: number, minimum: number, maximum: number): void => {
      if (Math.abs(direction) < 1e-8) return;
      const first = (minimum - centre) / direction;
      const second = (maximum - centre) / direction;
      minimumFlightProjection = Math.max(minimumFlightProjection, Math.min(first, second));
      maximumFlightProjection = Math.min(maximumFlightProjection, Math.max(first, second));
    };
    restrictProjection(forward[0], flightCentreX, safeMinX, safeMaxX);
    restrictProjection(forward[1], flightCentreZ, safeMinZ, safeMaxZ);
    if (minimumFlightProjection > maximumFlightProjection) {
      minimumFlightProjection = 0;
      maximumFlightProjection = 0;
    }
    const flightY = Math.min(world.bounds.ceilingY - 1, Math.max(world.bounds.floorY + 12, world.bounds.floorY + 24));
    const flightStart: SupportVec3 = Object.freeze([
      flightCentreX + forward[0] * minimumFlightProjection,
      flightY,
      flightCentreZ + forward[1] * minimumFlightProjection,
    ] as const);
    const flightEnd: SupportVec3 = Object.freeze([
      flightCentreX + forward[0] * maximumFlightProjection,
      flightY,
      flightCentreZ + forward[1] * maximumFlightProjection,
    ] as const);
    if (!carpetFlightRouteAdmitted(flightStart, flightEnd, flightEnvelope, world)) {
      const nextAttempt = headingAttempt + 1;
      return nextAttempt < CARPET_BOMBER_ROUTE_HEADING_OFFSETS.length
        ? this.carpetImpactPattern(anchor, seed, world, requestedFacing, nextAttempt, baseAngle)
        : null;
    }
    // Payload ordinals are authored along the admitted corridor, but boundary
    // insets can fold their ground projections toward a wall. Bind them to
    // monotonic stations on the aircraft route using the exact movement ease
    // at each canonical release time instead of reordering by clipped ground X/Z.
    const dropRouteProgress = Object.freeze(impacts.map((_, ordinal) => {
      const raw = clamp((CARPET_TARGET_MARKER_MAX_LIFETIME_MS + ordinal * 180
        - CARPET_BOMB_SHELL_DROP_LEAD_MS) / CARPET_BOMBER_ROUTE_TRAVERSE_MS, 0, 1);
      return raw * raw * (3 - 2 * raw);
    }));
    return Object.freeze({
      impacts,
      pathStart: start,
      pathEnd: end,
      flightStart,
      flightEnd,
      dropRouteProgress,
      halfWidthM: Math.max(0.5, maximumPerpendicular + 0.35),
    });
  }

  control(intent: KillstreakControlIntent, nowMs: number): Readonly<{ accepted: boolean; reason: string }> {
    const actor = this.actors.get(intent.by);
    const reject = (reason: string) => Object.freeze({ accepted: false, reason });
    if (!actor) return reject('unknown-actor');
    if (!Number.isFinite(nowMs)) return reject('invalid-time');
    if (intent.matchEpoch !== this.matchEpoch || intent.lifeId !== actor.lifeId) return reject('identity-mismatch');
    if (!Number.isSafeInteger(intent.sequence) || intent.sequence <= actor.lastControlSequence) return reject('replayed-sequence');
    const entity = this.entities.get(intent.entityId);
    if (!entity || entity.ownerId !== actor.actorId || nowMs >= entity.expiresAtMs || entity.health <= 0) return reject('entity-unavailable');
    actor.lastControlSequence = intent.sequence;
    if (intent.action === 'toggle-chopper-gunner') {
      if (entity.kind !== 'chopper') return reject('wrong-entity-kind');
      if (entity.gunController === 'ai') {
        this.restoreActorControl(actor, true);
        entity.gunController = Object.freeze({ actorId: actor.actorId, lifeId: actor.lifeId });
        actor.possession = Object.freeze({ kind: 'chopper-gunner', entityId: entity.id });
      } else {
        entity.gunController = 'ai';
        entity.pendingPlayerFire = false;
        this.restoreActorControl(actor, false);
      }
      entity.revision += 1;
    } else if (intent.action === 'toggle-piloted-drone') {
      if (entity.kind !== 'drone' || entity.mode !== 'piloted') return reject('wrong-entity-kind');
      if (actor.possession?.kind === 'piloted-drone' && actor.possession.entityId === entity.id) {
        entity.pendingPlayerFire = false;
        entity.thrust = 0;
        entity.strafe = 0;
        entity.vertical = 0;
        entity.velocity = [0, 0, 0];
        entity.targetId = null;
        entity.sensorContacts.length = 0;
        this.restoreActorControl(actor, false);
      } else {
        this.restoreActorControl(actor, true);
        actor.possession = Object.freeze({ kind: 'piloted-drone', entityId: entity.id });
        entity.thrust = 0;
        entity.strafe = 0;
        entity.vertical = 0;
        entity.velocity = [0, 0, 0];
        entity.targetId = null;
        entity.nextSensorRefreshAtMs = Math.min(entity.nextSensorRefreshAtMs, nowMs);
      }
      entity.revision += 1;
    } else if (intent.action === 'exit-piloted-drone') {
      if (entity.kind !== 'drone' || entity.mode !== 'piloted') return reject('wrong-entity-kind');
      entity.pendingPlayerFire = false;
      entity.thrust = 0;
      entity.strafe = 0;
      entity.vertical = 0;
      entity.velocity = [0, 0, 0];
      entity.targetId = null;
      entity.sensorContacts.length = 0;
      this.restoreActorControl(actor, false);
    } else {
      if (![intent.yawQ, intent.pitchQ, intent.thrustQ, intent.strafeQ, intent.verticalQ].every((value) => value === undefined || Number.isFinite(value))) {
        return reject('invalid-control-value');
      }
      if (entity.kind === 'chopper') {
        if (entity.gunController === 'ai' || entity.gunController.actorId !== actor.actorId || entity.gunController.lifeId !== actor.lifeId) return reject('not-gun-controller');
        entity.aimYaw = clamp(intent.yawQ ?? entity.aimYaw, -Math.PI, Math.PI);
        entity.aimPitch = clamp(intent.pitchQ ?? entity.aimPitch, -1.2, 0.5);
        // Fire is a held-state intent. Assignment (rather than OR-latching)
        // makes release authoritative and lets the host apply the slow cadence.
        entity.pendingPlayerFire = intent.fire === true;
      } else if (entity.kind === 'drone' && entity.mode === 'piloted') {
        if (actor.possession?.kind !== 'piloted-drone' || actor.possession.entityId !== entity.id) return reject('not-drone-controller');
        entity.yaw = clamp(intent.yawQ ?? entity.yaw, -Math.PI, Math.PI);
        entity.pitch = clamp(intent.pitchQ ?? entity.pitch, -1.2, 1.2);
        entity.thrust = clamp(intent.thrustQ ?? entity.thrust, -1, 1);
        entity.strafe = clamp(intent.strafeQ ?? entity.strafe, -1, 1);
        entity.vertical = clamp(intent.verticalQ ?? entity.vertical, -1, 1);
        entity.pendingPlayerFire = intent.fire === true;
        entity.nextSensorRefreshAtMs = Math.min(entity.nextSensorRefreshAtMs, nowMs);
      } else return reject('wrong-entity-kind');
      entity.revision += 1;
    }
    this.revision += 1;
    return Object.freeze({ accepted: true, reason: 'accepted' });
  }

  private restoreActorControl(actor: ActorAuthorityState, forceAll: boolean): void {
    const possession = actor.possession;
    if (possession?.kind === 'chopper-gunner') {
      const chopper = this.entities.get(possession.entityId);
      if (chopper?.kind === 'chopper') {
        chopper.gunController = 'ai';
        chopper.pendingPlayerFire = false;
      }
    }
    if (forceAll && possession?.kind === 'piloted-drone') {
      const drone = this.entities.get(possession.entityId);
      if (drone?.kind === 'drone') {
        drone.pendingPlayerFire = false;
        drone.thrust = 0;
        drone.strafe = 0;
        drone.vertical = 0;
        drone.velocity = [0, 0, 0];
        drone.targetId = null;
        drone.sensorContacts.length = 0;
      }
    }
    actor.possession = null;
  }

  beginCareCapture(actorId: string, lifeId: number, crateId: string, nowMs: number, world: KillstreakWorld): Readonly<{
    accepted: boolean;
    reason: CareCaptureAdmissionReason;
  }> {
    const actor = this.actors.get(actorId);
    const entity = this.entities.get(crateId);
    if (!actor || actor.lifeId !== lifeId) return Object.freeze({ accepted: false, reason: 'identity-mismatch' });
    if (!Number.isFinite(nowMs)) return Object.freeze({ accepted: false, reason: 'invalid-time' });
    if (actor.careRewards.length >= MAX_RETAINED_CARE_REWARDS) {
      return Object.freeze({ accepted: false, reason: 'reward-capacity' });
    }
    if (!entity || entity.kind !== 'care-crate' || entity.phase !== 'landed') return Object.freeze({ accepted: false, reason: 'crate-unavailable' });
    if ([...this.entities.values()].some((candidate) => candidate.kind === 'care-crate'
      && candidate.id !== entity.id && candidate.captureActorId === actorId)) {
      return Object.freeze({ accepted: false, reason: 'actor-already-capturing' });
    }
    const position = actorPosition(world, actorId);
    if (!position || distance(position, entity.position) > 2.75 || !lineOfSight(world, position, entity.position)) {
      return Object.freeze({ accepted: false, reason: 'capture-admission-failed' });
    }
    // Owner/team pickup is a tap interaction: once the host has admitted the
    // prompt's range and LOS contract, the reward transfers immediately and
    // exactly once. Enemy theft retains the longer continuous-hold lifecycle
    // below.
    if (actor.team === entity.team) {
      actor.careRewards.push(entity.reward);
      this.entities.delete(entity.id);
      this.revision += 1;
      return Object.freeze({ accepted: true, reason: 'accepted' });
    }
    entity.phase = 'capturing';
    entity.captureActorId = actorId;
    entity.captureStartedAtMs = nowMs;
    entity.revision += 1;
    this.revision += 1;
    return Object.freeze({ accepted: true, reason: 'accepted' });
  }

  interruptCareCapture(actorId: string, lifeId: number): boolean {
    if (this.actors.get(actorId)?.lifeId !== lifeId) return false;
    let interrupted = false;
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'care-crate' || entity.captureActorId !== actorId) continue;
      entity.phase = 'landed';
      entity.captureActorId = null;
      entity.captureStartedAtMs = null;
      entity.revision += 1;
      this.revision += 1;
      interrupted = true;
    }
    return interrupted;
  }

  recordActorDamage(actorId: string): boolean {
    const actor = this.actors.get(actorId);
    return actor ? this.interruptCareCapture(actorId, actor.lifeId) : false;
  }

  damageEntity(entityId: string, damage: number): Readonly<{ applied: boolean; destroyed: boolean; health: number }> {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind === 'aircraft' || entity.kind === 'care-crate' || !Number.isFinite(damage) || damage <= 0) {
      return Object.freeze({ applied: false, destroyed: false, health: entity?.health ?? 0 });
    }
    entity.health = Math.max(0, entity.health - damage);
    entity.revision += 1;
    const destroyed = entity.health === 0;
    if (destroyed) this.expireEntity(entityId);
    this.revision += 1;
    return Object.freeze({ applied: true, destroyed, health: entity.health });
  }

  advance(nowMs: number, world: KillstreakWorld): KillstreakAdvanceResult {
    if (!Number.isFinite(nowMs)) return Object.freeze({
      damageEvents: Object.freeze([]), impactEvents: Object.freeze([]), expiredEntityIds: Object.freeze([]),
    });
    if (this.lastAdvancedAtMs !== 0 && nowMs < this.lastAdvancedAtMs) return Object.freeze({
      damageEvents: Object.freeze([]), impactEvents: Object.freeze([]), expiredEntityIds: Object.freeze([]),
    });
    const canonicalNowMs = Math.max(this.lastAdvancedAtMs, nowMs);
    const previousAt = this.lastAdvancedAtMs === 0 ? canonicalNowMs : this.lastAdvancedAtMs;
    const dt = clamp((canonicalNowMs - previousAt) / 1_000, 0, 0.1);
    this.lastAdvancedAtMs = canonicalNowMs;
    const hadRuntimeState = this.entities.size > 0 || this.carpetBombers.size > 0 || this.timedActivations.size > 0;
    const damageEvents: KillstreakDamageEvent[] = [];
    const impactEvents: KillstreakImpactEvent[] = [];
    const expiredEntityIds: string[] = [];
    // One host step may advance all 24 swarm drones for the same owner. Build
    // and sort that owner's hostile set once instead of allocating it again
    // for every target lookup, sensor scan and area-damage query.
    this.hostileTargetCache.clear();
    this.sortedHostileTargetCache.clear();

    // Move each admitted Carpet airframe before evaluating its payload. This
    // binds shell authority to the position that is actually replicated for
    // this host step, including coarse/stalled advances.
    for (const bomber of this.carpetBombers.values()) {
      const aircraft = this.entities.get(bomber.aircraftId);
      if (!aircraft || aircraft.kind !== 'aircraft' || aircraft.variant !== 'carpet'
        || canonicalNowMs > aircraft.expiresAtMs || aircraft.health <= 0) {
        if (!bomber.routeCompleted) bomber.routeCanceled = bomber.nextDropOrdinal < bomber.impacts.length;
        continue;
      }
      this.advanceAircraft(aircraft, canonicalNowMs, dt, world);
      bomber.routeCompleted = (admittedAircraftRouteProgress(aircraft) ?? 0) >= 1 - 1e-6;
    }

    for (const [activationId, activation] of this.timedActivations) {
      if (canonicalNowMs >= activation.expiresAtMs) this.timedActivations.delete(activationId);
    }
    for (const [activationId, bomber] of this.carpetBombers) {
      const aircraft = this.entities.get(bomber.aircraftId);
      const routeProgress = aircraft?.kind === 'aircraft' && aircraft.variant === 'carpet'
        ? admittedAircraftRouteProgress(aircraft)
        : bomber.routeCompleted ? 1 : null;
      while (!bomber.routeCanceled
        && routeProgress !== null
        && bomber.nextDropOrdinal < bomber.impacts.length
        && routeProgress + 0.002 >= bomber.dropRouteProgress[bomber.nextDropOrdinal]!
        && canonicalNowMs >= bomber.impactAtMs[bomber.nextDropOrdinal]! - CARPET_BOMB_SHELL_DROP_LEAD_MS
        && impactEvents.length < CARPET_BOMBER_IMPACT_COUNT * 2) {
        const ordinal = bomber.nextDropOrdinal;
        const minimumImpactAtMs = canonicalNowMs + CARPET_BOMB_SHELL_DROP_LEAD_MS;
        const scheduleShiftMs = Math.max(0, minimumImpactAtMs - bomber.impactAtMs[ordinal]!);
        if (scheduleShiftMs > 0) {
          for (let pending = ordinal; pending < bomber.impactAtMs.length; pending += 1) {
            bomber.impactAtMs[pending] += scheduleShiftMs;
          }
        }
        const impactAtMs = bomber.impactAtMs[ordinal]!;
        bomber.nextDropOrdinal += 1;
        impactEvents.push(Object.freeze({
          activationId,
          source: 'carpet-bomber',
          ordinal,
          phase: 'drop',
          position: bomber.impacts[ordinal],
          impactAtMs,
          atMs: impactAtMs - CARPET_BOMB_SHELL_DROP_LEAD_MS,
        }));
      }
      while (bomber.nextImpactOrdinal < bomber.nextDropOrdinal
        && canonicalNowMs >= bomber.impactAtMs[bomber.nextImpactOrdinal]!
        && impactEvents.length < CARPET_BOMBER_IMPACT_COUNT * 2) {
        const ordinal = bomber.nextImpactOrdinal;
        const position = bomber.impacts[ordinal];
        const impactAtMs = bomber.impactAtMs[ordinal]!;
        bomber.nextImpactOrdinal += 1;
        bomber.authorityReleaseAtMs = canonicalNowMs + CARPET_BOMBER_RESIDUAL_FIRE_DURATION_MS;
        impactEvents.push(Object.freeze({
          activationId,
          source: 'carpet-bomber',
          ordinal,
          phase: 'impact',
          position,
          impactAtMs,
          atMs: impactAtMs,
        }));
        const owner = this.actors.get(bomber.ownerId);
        if (owner) this.damageAround(
          owner,
          activationId,
          'carpet-bomber',
          position,
          CARPET_BOMBER_BLAST_RADIUS_M,
          CARPET_BOMBER_MAX_DAMAGE,
          canonicalNowMs,
          world,
          damageEvents,
          true,
        );
      }
      if (bomber.routeCanceled && bomber.nextImpactOrdinal >= bomber.nextDropOrdinal) {
        if (bomber.authorityReleaseAtMs === null || canonicalNowMs >= bomber.authorityReleaseAtMs) {
          this.carpetBombers.delete(activationId);
        }
      } else if (bomber.nextImpactOrdinal >= bomber.impacts.length
        && bomber.authorityReleaseAtMs !== null
        && canonicalNowMs >= bomber.authorityReleaseAtMs) this.carpetBombers.delete(activationId);
    }

    for (const entity of this.entities.values()) {
      if (canonicalNowMs >= entity.expiresAtMs || entity.health <= 0) {
        expiredEntityIds.push(entity.id);
        this.expireEntity(entity.id);
        continue;
      }
      if (entity.kind === 'aircraft') {
        if (entity.variant !== 'carpet') this.advanceAircraft(entity, canonicalNowMs, dt, world);
      } else if (entity.kind === 'care-crate') this.advanceCareCrate(entity, canonicalNowMs, dt, world);
      else if (entity.kind === 'chopper') this.advanceChopper(entity, canonicalNowMs, dt, world, damageEvents);
      else this.advanceDrone(entity, canonicalNowMs, dt, world, damageEvents);
    }
    this.enforceSwarmSeparation(dt, world);
    // Recipient admission is keyed by this aggregate revision. Every mutable
    // host step advances it so reordered snapshots cannot roll pose/ammo/fuel
    // backwards while carrying an equal top-level revision.
    if (hadRuntimeState) this.revision += 1;
    return Object.freeze({
      damageEvents: Object.freeze(damageEvents.slice(0, MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP)),
      impactEvents: Object.freeze(impactEvents),
      expiredEntityIds: Object.freeze(expiredEntityIds),
    });
  }

  private advanceAircraft(entity: AircraftEntity, nowMs: number, dt: number, world: KillstreakWorld): void {
    const routeDurationMs = entity.variant === 'carpet'
      ? CARPET_BOMBER_ROUTE_TRAVERSE_MS
      : CARE_AIRCRAFT_DURATION_MS;
    const progress = clamp((nowMs - entity.createdAtMs) / routeDurationMs, 0, 1);
    entity.phase = progress < 0.12 ? 'inbound' : progress > 0.82 ? 'outbound' : 'active';
    const eased = progress * progress * (3 - 2 * progress);
    const desired: SupportVec3 = [
      entity.routeStart[0] + (entity.routeEnd[0] - entity.routeStart[0]) * eased,
      entity.routeStart[1] + Math.sin(progress * Math.PI + unit(entity.seed, 33) * Math.PI) * 0.28,
      entity.routeStart[2] + (entity.routeEnd[2] - entity.routeStart[2]) * eased,
    ];
    const previous: SupportVec3 = [...entity.position];
    const next = entity.variant === 'carpet'
      ? resolveFlightEnvelopePosition(previous, desired, {
          ...CARPET_BOMBER_COLLISION_ENVELOPE,
          yaw: entity.attitude[1],
        }, world)
      : resolveFlightPosition(previous, desired, 1.25, world);
    const inverseDt = dt > 0 ? 1 / dt : 0;
    entity.velocity = [
      (next[0] - previous[0]) * inverseDt,
      (next[1] - previous[1]) * inverseDt,
      (next[2] - previous[2]) * inverseDt,
    ];
    entity.position = next;
    entity.attitude = attitudeFromMotion(previous, next, entity.attitude);
    entity.revision += 1;
  }

  private advanceCareCrate(entity: CareCrateEntity, nowMs: number, dt: number, world: KillstreakWorld): void {
    const previous: SupportVec3 = [...entity.position];
    if (nowMs < entity.descentStartsAtMs) {
      entity.phase = 'inbound';
      const aircraft = this.entities.get(entity.aircraftId);
      if (aircraft?.kind === 'aircraft') {
        entity.position = [aircraft.position[0], aircraft.position[1] - 0.9, aircraft.position[2]];
      }
    } else if (nowMs < entity.descentStartsAtMs + CARE_CRATE_DESCENT_MS) {
      entity.phase = 'descending';
      const rawProgress = clamp((nowMs - entity.descentStartsAtMs) / CARE_CRATE_DESCENT_MS, 0, 1);
      const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
      entity.position = [
        entity.descentStartPosition[0] + (entity.dropPosition[0] - entity.descentStartPosition[0]) * progress,
        entity.descentStartPosition[1] + (entity.dropPosition[1] - entity.descentStartPosition[1]) * progress,
        entity.descentStartPosition[2] + (entity.dropPosition[2] - entity.descentStartPosition[2]) * progress,
      ];
    } else if (entity.phase !== 'capturing') {
      entity.phase = 'landed';
      entity.position = [...entity.dropPosition];
    }
    const inverseDt = dt > 0 ? 1 / dt : 0;
    entity.velocity = [
      (entity.position[0] - previous[0]) * inverseDt,
      (entity.position[1] - previous[1]) * inverseDt,
      (entity.position[2] - previous[2]) * inverseDt,
    ];
    entity.attitude = [0, entity.attitude[1], 0];
    entity.revision += 1;
    if (entity.phase !== 'capturing' || !entity.captureActorId || entity.captureStartedAtMs === null) return;
    const captureActor = this.actors.get(entity.captureActorId);
    const position = actorPosition(world, entity.captureActorId);
    if (!captureActor || !position || distance(position, entity.position) > 2.75 || !lineOfSight(world, position, entity.position)) {
      entity.phase = 'landed';
      entity.captureActorId = null;
      entity.captureStartedAtMs = null;
      entity.revision += 1;
      this.revision += 1;
      return;
    }
    const requiredMs = captureActor.team === entity.team ? 1_250 : 2_500;
    if (nowMs - entity.captureStartedAtMs < requiredMs) return;
    if (captureActor.careRewards.length >= MAX_RETAINED_CARE_REWARDS) {
      entity.phase = 'landed';
      entity.captureActorId = null;
      entity.captureStartedAtMs = null;
      entity.revision += 1;
      this.revision += 1;
      return;
    }
    captureActor.careRewards.push(entity.reward);
    this.entities.delete(entity.id);
    this.revision += 1;
  }

  private advanceChopper(
    entity: ChopperEntity,
    nowMs: number,
    dt: number,
    world: KillstreakWorld,
    damageEvents: KillstreakDamageEvent[],
  ): void {
    const elapsed = clamp((nowMs - entity.createdAtMs) / CHOPPER_DURATION_MS, 0, 1);
    entity.phase = elapsed < 0.08 ? 'inbound' : elapsed > 0.9 ? 'outbound' : 'orbiting';
    // The accepted gun intent was authored against the last recipient snapshot
    // and its exact possessed camera pose. Resolve that shot before integrating
    // this frame's AI-flight movement; movement-first made a 10-15 m/s platform
    // miss a centre-ray target every low-FPS frame even while the crosshair was
    // correctly tracking it. Authority, LOS and cadence remain host-owned.
    const firingPosition: SupportVec3 = [...entity.position];
    const firingAttitude: SupportVec3 = [...entity.attitude];
    const pose = chopperRoutePose(entity.seed, entity.createdAtMs, nowMs, entity.routeCentre, world.bounds);
    const previous: SupportVec3 = [...entity.position];
    const next = resolveFlightPosition(previous, pose.position, 1.25, world);
    const inverseDt = dt > 0 ? 1 / dt : 0;
    entity.velocity = [
      (next[0] - previous[0]) * inverseDt,
      (next[1] - previous[1]) * inverseDt,
      (next[2] - previous[2]) * inverseDt,
    ];
    entity.position = next;
    entity.attitude = attitudeFromMotion(previous, next, pose.attitude);
    entity.revision += 1;
    const shouldFire = entity.gunController === 'ai' ? nowMs >= entity.nextShotAtMs : entity.pendingPlayerFire && nowMs >= entity.nextShotAtMs;
    if (!shouldFire || damageEvents.length >= MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP) return;
    const owner = this.actors.get(entity.ownerId);
    if (!owner) return;
    if (entity.gunController === 'ai') {
      const target = this.nearestVisibleTarget(firingPosition, owner.actorId, owner.team, world);
      if (target) {
        const admittedDamage = supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, distance(firingPosition, target.position));
        if (admittedDamage > 0) damageEvents.push(this.damageEvent(
          entity.activationId,
          'chopper',
          owner.actorId,
          target,
          admittedDamage,
          firingPosition,
          nowMs,
        ));
      }
    } else {
      const ray = chopperGunnerAuthoritativeRay(firingPosition, firingAttitude, entity.aimYaw, entity.aimPitch);
      const hit = this.visibleTargetAlongRay(
        ray.origin,
        ray.direction,
        owner.actorId,
        owner.team,
        world,
        CHOPPER_GUN_PROFILE.maximumRangeM,
        true,
      );
      if (hit) {
        const distanceDamage = supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, hit.distance);
        // Through-wall admission costs half the autocannon damage; clear
        // centre-ray shots deal the full profile damage.
        const admittedDamage = hit.wallbanged ? distanceDamage * 0.5 : distanceDamage;
        if (admittedDamage > 0) damageEvents.push(this.damageEvent(
          entity.activationId,
          'chopper',
          owner.actorId,
          hit.target,
          admittedDamage,
          ray.origin,
          nowMs,
          hit.endpoint,
          ray.tracerOrigin,
        ));
      }
    }
    entity.nextShotAtMs = nowMs + CHOPPER_GUN_PROFILE.cadenceMs;
    if (entity.gunController === 'ai') entity.pendingPlayerFire = false;
  }

  private advanceDrone(
    entity: DroneEntity,
    nowMs: number,
    dt: number,
    world: KillstreakWorld,
    damageEvents: KillstreakDamageEvent[],
  ): void {
    const owner = this.actors.get(entity.ownerId);
    if (!owner) return;
    const gunProfile: DroneGunProfile = droneGunProfileFor(entity.mode);
    if (entity.gunProfileId !== gunProfile.id) throw new Error(`unknown ${entity.mode} drone gun profile ${entity.gunProfileId}`);
    const playerControlled = entity.mode === 'piloted'
      && owner.possession?.kind === 'piloted-drone'
      && owner.possession.entityId === entity.id;
    if (playerControlled) this.updatePilotedDroneSensor(entity, owner, nowMs, world);
    if (entity.phase === 'reloading') {
      if (entity.reloadCompletesAtMs !== null && nowMs >= entity.reloadCompletesAtMs) {
        if (entity.reserveClips === null || entity.reserveClips > 0) {
          if (entity.reserveClips !== null) entity.reserveClips -= 1;
          entity.magazine = gunProfile.magazineSize;
        }
        entity.reloadCompletesAtMs = null;
        entity.phase = 'active';
        entity.revision += 1;
      }
      return;
    }
    if (playerControlled) {
      const velocity = pilotedDroneWorldVelocity({
        yaw: entity.yaw,
        pitch: entity.pitch,
        axes: { thrust: entity.thrust, strafe: entity.strafe, vertical: entity.vertical },
        maximumSpeedMps: DRONE_DEPLOYMENT_POLICY.manualHorizontalSpeedMps,
      });
      const desired: [number, number, number] = [
        clamp(entity.position[0] + velocity[0] * dt, world.bounds.minX + 0.35, world.bounds.maxX - 0.35),
        clamp(entity.position[1] + velocity[1] * dt, world.bounds.floorY + 0.5, world.bounds.ceilingY - 0.5),
        clamp(entity.position[2] + velocity[2] * dt, world.bounds.minZ + 0.35, world.bounds.maxZ - 0.35),
      ];
      const previous: SupportVec3 = [...entity.position];
      const next = resolveFlightPosition(previous, desired, 0.35, world);
      entity.velocity = [(next[0] - previous[0]) / Math.max(dt, 0.001), (next[1] - previous[1]) / Math.max(dt, 0.001), (next[2] - previous[2]) / Math.max(dt, 0.001)];
      entity.position = next;
      entity.attitude = [entity.pitch, entity.yaw, 0];
      if (entity.pendingPlayerFire && nowMs >= entity.nextShotAtMs) {
        if (entity.magazine > 0) {
          const target = this.aimedVisibleTarget(
            entity.position,
            entity.yaw,
            entity.pitch,
            owner.actorId,
            owner.team,
            world,
            gunProfile.maximumRangeM,
          );
          if (target) {
            const admittedDamage = supportGunDamageAtDistance(gunProfile, distance(entity.position, target.position));
            if (admittedDamage > 0) damageEvents.push(this.damageEvent(
              entity.activationId,
              'piloted-drone',
              owner.actorId,
              target,
              admittedDamage,
              entity.position,
              nowMs,
            ));
          }
          entity.magazine -= 1;
        }
        entity.nextShotAtMs = nowMs + gunProfile.cadenceMs;
      }
    } else {
      const ingressActive = entity.mode === 'swarm'
        && entity.swarmIngressTarget !== null
        && nowMs - entity.createdAtMs < 2_000;
      if (ingressActive && entity.swarmIngressTarget) {
        this.moveDroneToward(entity, entity.swarmIngressTarget, DRONE_DEPLOYMENT_POLICY.swarmIngressSpeedMps, 0.25, dt, world);
      } else {
        entity.swarmIngressTarget = null;
        const hostiles = this.hostileTargets(world, owner.actorId, owner.team);
        let target = hostiles.find((candidate) => candidate.id === entity.targetId) ?? null;
        if (!target) {
          const candidates = this.sortedHostileTargets(world, owner.actorId, owner.team);
          let pick = candidates.length > 0 ? candidates[entity.seed % candidates.length] : null;
          if (entity.mode === 'swarm' && entity.swarmOrdinal !== null && candidates.length > 0) {
            const groupOrdinal = entity.swarmOrdinal % 4;
            const cx = (world.bounds.minX + world.bounds.maxX) / 2;
            const cz = (world.bounds.minZ + world.bounds.maxZ) / 2;
            let matchingQuadrantCount = 0;
            for (const candidate of candidates) {
              const dx = candidate.position[0] - cx;
              const dz = candidate.position[2] - cz;
              const candidateQuadrant = (dx >= 0 ? 1 : 0) | (dz >= 0 ? 2 : 0);
              if (candidateQuadrant === groupOrdinal) matchingQuadrantCount += 1;
            }
            if (matchingQuadrantCount > 0) {
              let matchingOrdinal = entity.seed % matchingQuadrantCount;
              for (const candidate of candidates) {
                const dx = candidate.position[0] - cx;
                const dz = candidate.position[2] - cz;
                const candidateQuadrant = (dx >= 0 ? 1 : 0) | (dz >= 0 ? 2 : 0);
                if (candidateQuadrant !== groupOrdinal) continue;
                if (matchingOrdinal === 0) {
                  pick = candidate;
                  break;
                }
                matchingOrdinal -= 1;
              }
            }
          }
          target = pick;
          entity.targetId = target?.id ?? null;
        }
        if (target) {
          const dx = target.position[0] - entity.position[0];
          const dy = target.position[1] + 1.5 - entity.position[1];
          const dz = target.position[2] - entity.position[2];
          const range = Math.max(0.001, Math.hypot(dx, dy, dz));
          if (entity.mode === 'swarm' && entity.swarmOrdinal !== null) {
            const engagementPoint = droneSwarmEngagementPoint(target.position, {
              activationId: entity.activationId,
              targetId: target.id,
              ordinal: entity.swarmOrdinal,
            });
            const minimumY = droneSwarmStepMinimumAltitudeY(
              entity.swarmAdmittedSpawnY ?? entity.position[1],
              entity.position,
              engagementPoint,
              world,
            );
            this.moveDroneToward(
              entity,
              [engagementPoint[0], Math.max(engagementPoint[1], minimumY), engagementPoint[2]],
              8,
              1,
              dt,
              world,
            );
          } else if (range > 7) {
            this.moveDroneToward(
              entity,
              [target.position[0], target.position[1] + 1.5, target.position[2]],
              DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps,
              7,
              dt,
              world,
            );
          }
          const canHit = range <= gunProfile.maximumRangeM && lineOfSight(world, entity.position, target.position);
          const canFireOwnGun = canHit && nowMs >= entity.nextShotAtMs && entity.magazine > 0;
          const fireLaneAdmitted = entity.mode !== 'swarm' || this.claimSwarmFireLane(entity, nowMs, canFireOwnGun);
          if (canFireOwnGun && fireLaneAdmitted) {
            const admittedDamage = supportGunDamageAtDistance(gunProfile, range);
            if (admittedDamage > 0) damageEvents.push(this.damageEvent(
              entity.activationId,
              entity.mode === 'piloted' ? 'piloted-drone' : 'drone-swarm',
              owner.actorId,
              target,
              admittedDamage,
              entity.position,
              nowMs,
            ));
            entity.magazine -= 1;
            entity.nextShotAtMs = nowMs + gunProfile.cadenceMs;
          }
        } else {
          const reachedWaypoint = entity.swarmPatrolTarget
            ? distance(entity.position, entity.swarmPatrolTarget) <= 2
            : true;
          if (entity.mode === 'swarm' && entity.swarmOrdinal !== null && (reachedWaypoint || nowMs >= entity.swarmPatrolRefreshAtMs)) {
            const epoch = Math.max(0, Math.floor((nowMs - entity.createdAtMs - 2_000) / 6_000));
            const group = entity.swarmOrdinal % 6;
            const column = group % 3;
            const row = Math.floor(group / 3);
            const xAlpha = 0.16 + column * 0.34 + (unit(entity.seed, 100 + epoch * 2) - 0.5) * 0.12;
            const zAlpha = 0.24 + row * 0.52 + (unit(entity.seed, 101 + epoch * 2) - 0.5) * 0.16;
            const patrolX = clamp(world.bounds.minX + (world.bounds.maxX - world.bounds.minX) * xAlpha, world.bounds.minX + 0.5, world.bounds.maxX - 0.5);
            const patrolZ = clamp(world.bounds.minZ + (world.bounds.maxZ - world.bounds.minZ) * zAlpha, world.bounds.minZ + 0.5, world.bounds.maxZ - 0.5);
            const desiredPatrol: SupportVec3 = [patrolX, entity.position[1], patrolZ];
            entity.swarmPatrolTarget = [
              patrolX,
              droneSwarmStepMinimumAltitudeY(
                entity.swarmAdmittedSpawnY ?? entity.position[1],
                entity.position,
                desiredPatrol,
                world,
              ),
              patrolZ,
            ];
            entity.swarmPatrolRefreshAtMs = nowMs + 6_000;
          } else if (entity.mode === 'piloted' && (reachedWaypoint || nowMs >= entity.swarmPatrolRefreshAtMs)) {
            const epoch = Math.max(0, Math.floor((nowMs - entity.createdAtMs) / 6_000));
            const angle = unit(entity.seed, 200 + epoch) * Math.PI * 2;
            const radius = Math.min(
              world.bounds.maxX - world.bounds.minX,
              world.bounds.maxZ - world.bounds.minZ,
            ) * 0.28;
            entity.swarmPatrolTarget = [
              clamp((world.bounds.minX + world.bounds.maxX) / 2 + Math.cos(angle) * radius, world.bounds.minX + 0.5, world.bounds.maxX - 0.5),
              clamp(world.bounds.floorY + (world.bounds.ceilingY - world.bounds.floorY) * 0.45, world.bounds.floorY + 1, world.bounds.ceilingY - 0.5),
              clamp((world.bounds.minZ + world.bounds.maxZ) / 2 + Math.sin(angle) * radius, world.bounds.minZ + 0.5, world.bounds.maxZ - 0.5),
            ];
            entity.swarmPatrolRefreshAtMs = nowMs + 6_000;
          }
          if (entity.swarmPatrolTarget) this.moveDroneToward(
            entity,
            entity.swarmPatrolTarget,
            entity.mode === 'piloted'
              ? DRONE_DEPLOYMENT_POLICY.autonomousStandaloneSpeedMps
              : DRONE_DEPLOYMENT_POLICY.swarmPatrolSpeedMps,
            1.5,
            dt,
            world,
          );
        }
      }
    }
    if (entity.magazine === 0 && entity.reloadCompletesAtMs === null) {
      if (entity.reserveClips === null || entity.reserveClips > 0) {
        entity.phase = 'reloading';
        entity.reloadCompletesAtMs = nowMs + gunProfile.reloadMs;
      } else {
        const actor = this.actors.get(entity.ownerId);
        if (actor?.possession?.entityId === entity.id) this.restoreActorControl(actor, false);
      }
    }
    entity.revision += 1;
  }

  private moveDroneToward(
    entity: DroneEntity,
    target: SupportVec3,
    speed: number,
    stopDistance: number,
    dt: number,
    world: KillstreakWorld,
  ): void {
    const dx = target[0] - entity.position[0];
    const dy = target[1] - entity.position[1];
    const dz = target[2] - entity.position[2];
    const range = Math.max(0.001, Math.hypot(dx, dy, dz));
    if (range <= stopDistance) {
      entity.velocity = [0, 0, 0];
      return;
    }
    const desired: SupportVec3 = [
      clamp(entity.position[0] + dx / range * speed * dt, world.bounds.minX + 0.35, world.bounds.maxX - 0.35),
      clamp(entity.position[1] + dy / range * speed * dt, world.bounds.floorY + 1, world.bounds.ceilingY - 0.5),
      clamp(entity.position[2] + dz / range * speed * dt, world.bounds.minZ + 0.35, world.bounds.maxZ - 0.35),
    ];
    const previous: SupportVec3 = [...entity.position];
    const next = resolveFlightPosition(previous, desired, 0.35, world);
    entity.velocity = [
      (next[0] - previous[0]) / Math.max(dt, 0.001),
      (next[1] - previous[1]) / Math.max(dt, 0.001),
      (next[2] - previous[2]) / Math.max(dt, 0.001),
    ];
    entity.position = [...next];
    entity.attitude = attitudeFromMotion(previous, next, entity.attitude);
  }

  private enforceSwarmSeparation(dt: number, world: KillstreakWorld): void {
    if (dt <= 0) return;
    const swarms = new Map<string, DroneEntity[]>();
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'drone' || entity.mode !== 'swarm' || entity.swarmOrdinal === null) continue;
      const group = swarms.get(entity.activationId) ?? [];
      group.push(entity);
      swarms.set(entity.activationId, group);
    }
    const minimum = DRONE_SWARM_ENGAGEMENT_FORMATION.minimumDesignedSeparationM;
    for (const members of swarms.values()) {
      members.sort((left, right) => left.swarmOrdinal! - right.swarmOrdinal! || left.id.localeCompare(right.id));
      // A bounded deterministic relaxation prevents converging flight paths
      // from stacking even before every drone reaches its authored slot.
      for (let pass = 0; pass < 6; pass += 1) {
        let adjusted = false;
        for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
            const left = members[leftIndex]!;
            const right = members[rightIndex]!;
            let dx = right.position[0] - left.position[0];
            let dy = right.position[1] - left.position[1];
            let dz = right.position[2] - left.position[2];
            let range = Math.hypot(dx, dy, dz);
            if (range >= minimum) continue;
            adjusted = true;
            if (range < 0.0001) {
              const phase = ((left.swarmOrdinal! * 17 + right.swarmOrdinal! * 31) % DRONE_SWARM_COUNT)
                / DRONE_SWARM_COUNT * Math.PI * 2;
              dx = Math.cos(phase);
              dy = 0;
              dz = Math.sin(phase);
              range = 1;
            }
            const correction = (minimum - Math.min(range, minimum)) * 0.5;
            const nx = dx / range;
            const ny = dy / range;
            const nz = dz / range;
            const leftBefore: SupportVec3 = [...left.position];
            const rightBefore: SupportVec3 = [...right.position];
            const leftNext = resolveFlightPosition(leftBefore, [
              left.position[0] - nx * correction,
              left.position[1] - ny * correction,
              left.position[2] - nz * correction,
            ], 0.35, world);
            const rightNext = resolveFlightPosition(rightBefore, [
              right.position[0] + nx * correction,
              right.position[1] + ny * correction,
              right.position[2] + nz * correction,
            ], 0.35, world);
            const inverseDt = 1 / Math.max(dt, 0.001);
            left.velocity = [
              left.velocity[0] + (leftNext[0] - leftBefore[0]) * inverseDt,
              left.velocity[1] + (leftNext[1] - leftBefore[1]) * inverseDt,
              left.velocity[2] + (leftNext[2] - leftBefore[2]) * inverseDt,
            ];
            right.velocity = [
              right.velocity[0] + (rightNext[0] - rightBefore[0]) * inverseDt,
              right.velocity[1] + (rightNext[1] - rightBefore[1]) * inverseDt,
              right.velocity[2] + (rightNext[2] - rightBefore[2]) * inverseDt,
            ];
            left.position = leftNext;
            right.position = rightNext;
          }
        }
        if (!adjusted) break;
      }
    }
  }

  private claimSwarmFireLane(entity: DroneEntity, nowMs: number, canHit: boolean): boolean {
    if (entity.mode !== 'swarm' || entity.swarmOrdinal === null) return true;
    const lane = this.swarmFireLanes.get(entity.activationId);
    if (!lane || nowMs < lane.nextAtMs || entity.swarmOrdinal !== lane.cursor) return false;
    lane.cursor = (lane.cursor + 1) % DRONE_SWARM_COUNT;
    // Rotate quickly past a covered/invalid member, but bound admitted hostile
    // pressure to one meaningful shot per formation lane when a shot can land.
    lane.nextAtMs = nowMs + (canHit ? DRONE_SWARM_FIRE_LANE_INTERVAL_MS : 80);
    return canHit;
  }

  private updatePilotedDroneSensor(
    entity: DroneEntity,
    owner: ActorAuthorityState,
    nowMs: number,
    world: KillstreakWorld,
  ): void {
    if (entity.mode !== 'piloted' || nowMs < entity.nextSensorRefreshAtMs) return;
    if (owner.possession?.kind !== 'piloted-drone' || owner.possession.entityId !== entity.id) {
      entity.sensorContacts.length = 0;
      entity.nextSensorRefreshAtMs = nowMs + PILOTED_DRONE_SENSOR_PROFILE.refreshMs;
      return;
    }
    const direction = supportForwardFromYawPitch(entity.yaw, entity.pitch);
    const minimumDot = Math.cos(PILOTED_DRONE_SENSOR_PROFILE.forwardConeDegrees / 2 * Math.PI / 180);
    const contacts: DroneSensorContact[] = [];
    let previousTargetId: string | null = null;
    for (const target of this.sortedHostileTargets(world, owner.actorId, owner.team)) {
      if (target.id === previousTargetId) continue;
      const dx = target.position[0] - entity.position[0];
      const dy = target.position[1] - entity.position[1];
      const dz = target.position[2] - entity.position[2];
      const range = Math.hypot(dx, dy, dz);
      if (range <= 0.001 || range > PILOTED_DRONE_SENSOR_PROFILE.maximumRangeM) continue;
      if ((dx * direction[0] + dy * direction[1] + dz * direction[2]) / range < minimumDot) continue;
      previousTargetId = target.id;
      contacts.push(Object.freeze({
        id: target.id,
        kind: target.kind,
        team: target.team,
        lifeId: target.lifeId,
        position: Object.freeze([...target.position]) as unknown as SupportVec3,
        relation: 'hostile' as const,
        throughWall: true as const,
      }));
      if (contacts.length === 16) break;
    }
    entity.sensorContacts = contacts;
    entity.nextSensorRefreshAtMs = nowMs + PILOTED_DRONE_SENSOR_PROFILE.refreshMs;
  }

  private nearestVisibleTarget(origin: SupportVec3, ownerId: string, team: 0 | 1, world: KillstreakWorld): KillstreakTarget | null {
    let nearest: KillstreakTarget | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const target of this.hostileTargets(world, ownerId, team)) {
      if (!lineOfSight(world, origin, target.position)) continue;
      const candidateDistance = distance(origin, target.position);
      if (candidateDistance < nearestDistance
        || candidateDistance === nearestDistance && (nearest === null || target.id.localeCompare(nearest.id) < 0)) {
        nearest = target;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }

  private aimedVisibleTarget(
    origin: SupportVec3,
    yaw: number,
    pitch: number,
    ownerId: string,
    team: 0 | 1,
    world: KillstreakWorld,
    maximumRange = Number.POSITIVE_INFINITY,
  ): KillstreakTarget | null {
    const direction = supportForwardFromYawPitch(yaw, pitch);
    const minimumDot = Math.cos(8 * Math.PI / 180);
    let nearest: KillstreakTarget | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const target of this.hostileTargets(world, ownerId, team)) {
      if (!lineOfSight(world, origin, target.position)) continue;
      const dx = target.position[0] - origin[0];
      const dy = target.position[1] - origin[1];
      const dz = target.position[2] - origin[2];
      const length = Math.max(0.001, Math.hypot(dx, dy, dz));
      if (length > maximumRange) continue;
      const dot = (dx * direction[0] + dy * direction[1] + dz * direction[2]) / length;
      if (dot < minimumDot || length >= nearestDistance) continue;
      nearest = target;
      nearestDistance = length;
    }
    return nearest;
  }

  private visibleTargetAlongRay(
    origin: SupportVec3,
    direction: SupportVec3,
    ownerId: string,
    team: 0 | 1,
    world: KillstreakWorld,
    maximumRange: number,
    wallbang = false,
  ): SupportRayTargetHit | null {
    const radiusSquared = CHOPPER_GUNNER_RAY_POLICY.targetRadiusM ** 2;
    const hits: SupportRayTargetHit[] = [];
    for (const target of hostileTargets(world, ownerId, team)) {
      const dx = target.position[0] - origin[0];
      const dy = target.position[1] - origin[1];
      const dz = target.position[2] - origin[2];
      const centreDistance = dx * direction[0] + dy * direction[1] + dz * direction[2];
      if (centreDistance <= 0 || centreDistance - CHOPPER_GUNNER_RAY_POLICY.targetRadiusM > maximumRange) continue;
      const perpendicularSquared = Math.max(0, dx * dx + dy * dy + dz * dz - centreDistance * centreDistance);
      if (perpendicularSquared > radiusSquared) continue;
      const entryDistance = Math.max(0, centreDistance - Math.sqrt(radiusSquared - perpendicularSquared));
      if (entryDistance > maximumRange) continue;
      const endpoint: SupportVec3 = Object.freeze([
        origin[0] + direction[0] * entryDistance,
        origin[1] + direction[1] * entryDistance,
        origin[2] + direction[2] * entryDistance,
      ] as const);
      const clear = lineOfSight(world, origin, endpoint);
      // Owner rule: the Chopper Gunner's heavy autocannon must hit reliably
      // from orbit. LOS is still evaluated from the camera origin (so a wall
      // edge that occludes the aircraft root doesn't eat the shot), but an
      // occluded centre ray is not a miss: the through-wall rule admits the
      // target at 50% damage. Without this, hits felt random because a low
      // wall or corner silently swallowed the ray.
      if (!clear && !wallbang) continue;
      hits.push(Object.freeze({ target, endpoint, distance: entryDistance, wallbanged: !clear }));
    }
    return hits.sort((left, right) => left.distance - right.distance || left.target.id.localeCompare(right.target.id))[0] ?? null;
  }

  private damageAround(
    owner: ActorAuthorityState,
    activationId: string,
    source: Pass65KillstreakId,
    origin: SupportVec3,
    radius: number,
    maximum: number,
    nowMs: number,
    world: KillstreakWorld,
    output: KillstreakDamageEvent[],
    friendlyFire = false,
  ): void {
    // Carpet Bomber saturation blast ignores team affiliation AND ownership: it
    // damages every living combatant inside the blast radius, including the
    // caller who dropped it. The owner previously walked through their own
    // bombs unharmed; the owner directive is that the blast hurts everyone.
    const candidates = friendlyFire
      ? world.targets.filter((target) => target.alive && (target.kind === 'player' || target.kind === 'bot'))
      : this.hostileTargets(world, owner.actorId, owner.team);
    // Ground impacts sit exactly on the floor collider. Lift only the LOS
    // query so the floor cannot self-occlude the blast; the event keeps the
    // exact admitted impact origin for presentation and recipient validation.
    const visibilityOrigin: SupportVec3 = source === 'carpet-bomber'
      ? [origin[0], Math.min(world.bounds.ceilingY, origin[1] + 0.08), origin[2]]
      : origin;
    for (const target of candidates) {
      const range = distance(origin, target.position);
      if (range > radius || !lineOfSight(world, visibilityOrigin, target.position) || output.length >= MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP) continue;
      const damage = Math.max(1, Math.round(maximum * (1 - range / radius * 0.75)));
      output.push(this.damageEvent(activationId, source, owner.actorId, target, damage, origin, nowMs));
    }
  }

  private hostileTargets(world: KillstreakWorld, ownerId: string, team: 0 | 1): readonly KillstreakTarget[] {
    const key = `${ownerId}\u0000${team}`;
    const cached = this.hostileTargetCache.get(key);
    if (cached) return cached;
    const targets: KillstreakTarget[] = [];
    for (const target of world.targets) {
      if (!target.alive || target.id === ownerId || (target.kind !== 'player' && target.kind !== 'bot')) continue;
      if (!(world.areHostile?.(ownerId, team, target) ?? target.team !== team)) continue;
      targets.push(target);
    }
    this.hostileTargetCache.set(key, targets);
    return targets;
  }

  private sortedHostileTargets(world: KillstreakWorld, ownerId: string, team: 0 | 1): readonly KillstreakTarget[] {
    const key = `${ownerId}\u0000${team}`;
    const cached = this.sortedHostileTargetCache.get(key);
    if (cached) return cached;
    const targets = [...this.hostileTargets(world, ownerId, team)]
      .sort((left, right) => left.id.localeCompare(right.id));
    this.sortedHostileTargetCache.set(key, targets);
    return targets;
  }

  private damageEvent(
    activationId: string,
    source: Pass65KillstreakId,
    ownerId: string,
    target: KillstreakTarget,
    damage: number,
    origin: SupportVec3,
    nowMs: number,
    endpoint: SupportVec3 = target.position,
    tracerOrigin: SupportVec3 = origin,
  ): KillstreakDamageEvent {
    this.resultCounter += 1;
    return Object.freeze({
      resultId: `ks-result-${this.matchEpoch}-${this.resultCounter}`,
      activationId,
      source,
      ownerId,
      targetId: target.id,
      targetLifeId: target.lifeId,
      targetPosition: Object.freeze([...target.position]) as unknown as SupportVec3,
      damage,
      origin: Object.freeze([...origin]) as unknown as SupportVec3,
      endpoint: Object.freeze([...endpoint]) as unknown as SupportVec3,
      tracerOrigin: Object.freeze([...tracerOrigin]) as unknown as SupportVec3,
      atMs: nowMs,
    });
  }

  private expireEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    this.entities.delete(entityId);
    if (entity.kind === 'drone' && entity.mode === 'swarm'
      && ![...this.entities.values()].some((candidate) => candidate.kind === 'drone'
        && candidate.mode === 'swarm' && candidate.activationId === entity.activationId)) {
      this.swarmFireLanes.delete(entity.activationId);
    }
    const actor = this.actors.get(entity.ownerId);
    if (actor?.possession?.entityId === entityId) this.restoreActorControl(actor, false);
    if (entity.kind === 'chopper' && entity.gunController !== 'ai') entity.gunController = 'ai';
    this.revision += 1;
  }

  modifiersForActor(actorId: string, nowMs: number) {
    return adrenalineModifiers(this.actors.get(actorId)?.adrenalineUntilMs ?? 0, nowMs);
  }

  snapshotFor(recipientActorId: string | null, nowMs: number): KillstreakRecipientSnapshot {
    const actors = [...this.actors.values()].sort((left, right) => left.actorId.localeCompare(right.actorId)).map((actor) => Object.freeze({
      actorId: actor.actorId,
      team: actor.team,
      lifeId: actor.lifeId,
      streak: actor.streak,
      cycleProgress: actor.cycleProgress,
      loadout: parseKillstreakLoadout(actor.loadout),
      available: Object.freeze(actor.loadout.slots.filter((id) => (actor.availableCharges.get(id) ?? 0) > 0)),
      availableCharges: Object.freeze(actor.loadout.slots.flatMap((id) => {
        const count = actor.availableCharges.get(id) ?? 0;
        return count > 0 ? [Object.freeze({ id, count })] : [];
      })),
      adrenalineRemainingMs: Math.max(0, actor.adrenalineUntilMs - nowMs),
      possession: actor.possession,
      revealedCareRewards: Object.freeze(actor.actorId === recipientActorId
        ? [...(actor.trainingReward ? [actor.trainingReward] : []), ...actor.careRewards]
        : []),
    }));
    const entities = [...this.entities.values()].sort((left, right) => left.id.localeCompare(right.id)).map((entity): KillstreakEntitySnapshot => {
      const captureProgress = entity.kind === 'care-crate' && entity.captureStartedAtMs !== null && entity.captureActorId
        ? clamp((nowMs - entity.captureStartedAtMs) / ((this.actors.get(entity.captureActorId)?.team === entity.team) ? 1_250 : 2_500), 0, 1)
        : null;
      return Object.freeze({
        id: entity.id,
        activationId: entity.activationId,
        ownerId: entity.ownerId,
        team: entity.team,
        kind: entity.kind,
        mode: entity.kind === 'drone' ? entity.mode : null,
        phase: entity.phase,
        position: Object.freeze([...entity.position]) as unknown as SupportVec3,
        velocity: Object.freeze([...entity.velocity]) as unknown as SupportVec3,
        attitude: Object.freeze([...entity.attitude]) as unknown as SupportVec3,
        health: entity.health,
        expiresInMs: Math.max(0, entity.expiresAtMs - nowMs),
        magazine: entity.kind === 'drone' ? entity.magazine : null,
        reserveClips: entity.kind === 'drone' ? entity.reserveClips : null,
        gunProfileId: entity.kind === 'drone' ? entity.gunProfileId : null,
        gunController: entity.kind === 'chopper' ? entity.gunController === 'ai' ? 'ai' : 'owner-player' : null,
        captureActorId: entity.kind === 'care-crate' ? entity.captureActorId : null,
        captureProgress,
        revealedReward: null,
        revision: entity.revision,
      });
    });
    const recipient = recipientActorId ? this.actors.get(recipientActorId) : null;
    const sensorEntity = recipient?.possession?.kind === 'piloted-drone'
      ? this.entities.get(recipient.possession.entityId)
      : null;
    const sensorContacts = sensorEntity?.kind === 'drone' && sensorEntity.mode === 'piloted'
      ? sensorEntity.sensorContacts.map((contact) => Object.freeze({
        ...contact,
        position: Object.freeze([...contact.position]) as unknown as SupportVec3,
      }))
      : [];
    const placementMarkers: KillstreakPlacementMarkerSnapshot[] = [];
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'care-crate' || (entity.phase !== 'inbound' && entity.phase !== 'descending')) continue;
      placementMarkers.push(Object.freeze({
        id: `${entity.activationId}:care-target`, activationId: entity.activationId, source: 'care-package', shape: 'ground-x',
        ownerId: entity.ownerId, team: entity.team, audience: 'all-combatants',
        anchor: Object.freeze([entity.dropPosition[0], entity.dropPosition[1] - 0.45, entity.dropPosition[2]]) as unknown as SupportVec3,
        pathStart: null, pathEnd: null,
        halfWidthM: null,
        expiresInMs: Math.max(0, entity.createdAtMs + CARE_TARGET_MARKER_MAX_LIFETIME_MS - nowMs),
      }));
    }
    for (const activation of this.carpetBombers.values()) {
      const prestrikeRemainingMs = Math.max(0, activation.createdAtMs + CARPET_TARGET_MARKER_MAX_LIFETIME_MS - nowMs);
      if (prestrikeRemainingMs <= 0) continue;
      placementMarkers.push(Object.freeze({
        id: `${activation.activationId}:carpet-target`, activationId: activation.activationId, source: 'carpet-bomber', shape: 'ground-x',
        ownerId: activation.ownerId, team: activation.team, audience: 'all-combatants',
        anchor: Object.freeze([...activation.anchor]) as unknown as SupportVec3,
        pathStart: null, pathEnd: null, expiresInMs: prestrikeRemainingMs,
        halfWidthM: null,
      }));
      if (activation.ownerId === recipientActorId) placementMarkers.push(Object.freeze({
        id: `${activation.activationId}:carpet-corridor`, activationId: activation.activationId, source: 'carpet-bomber', shape: 'corridor',
        ownerId: activation.ownerId, team: activation.team, audience: 'owner-only',
        anchor: Object.freeze([...activation.anchor]) as unknown as SupportVec3,
        pathStart: Object.freeze([...activation.pathStart]) as unknown as SupportVec3,
        pathEnd: Object.freeze([...activation.pathEnd]) as unknown as SupportVec3,
        halfWidthM: activation.halfWidthM,
        expiresInMs: prestrikeRemainingMs,
      }));
    }
    return Object.freeze({
      schemaVersion: 2,
      matchEpoch: this.matchEpoch,
      revision: this.revision,
      actors: Object.freeze(actors),
      entities: Object.freeze(entities),
      sensorContacts: Object.freeze(sensorContacts),
      placementMarkers: Object.freeze(placementMarkers),
    });
  }
}
