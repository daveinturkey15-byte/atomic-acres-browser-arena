import {
  PASS65_KILLSTREAK_CATALOG,
  rewardForCarePackageUnit,
  type KillstreakCatalog,
  type Pass65KillstreakId,
} from './killstreak-catalog';
import { parseKillstreakLoadout, type KillstreakLoadoutV1 } from './killstreak-catalog';
import {
  DRONE_GUN_PROFILE,
  DRONE_GUN_PROFILE_ID,
  DRONE_SUPPORT_DEFINITIONS,
  PILOTED_DRONE_SENSOR_PROFILE,
  type DroneGunProfile,
} from './killstreak-support-catalog';
import { supportForwardFromYawPitch, supportYawForDirection } from './support-forward-axis';

export const ADRENALINE_DURATION_MS = 15_000;
export const ADRENALINE_DAMAGE_MULTIPLIER = 1.1;
export const ADRENALINE_MOVEMENT_MULTIPLIER = 1.1;
export const ADRENALINE_RELOAD_DURATION_MULTIPLIER = 0.9;
export const CHOPPER_DURATION_MS = 30_000;
export const CHOPPER_HEALTH = 800;
export const PILOTED_DRONE_DURATION_MS = DRONE_SUPPORT_DEFINITIONS.piloted.lifetimeMs;
export const DRONE_SWARM_DURATION_MS = DRONE_SUPPORT_DEFINITIONS.swarm.lifetimeMs;
export const DRONE_SWARM_COUNT = 12;
export const DRONE_HEALTH = 50;
export const DRONE_MAGAZINE_SIZE = DRONE_GUN_PROFILE.magazineSize;
export const PILOTED_DRONE_RESERVE_CLIPS = 1;
export const CARE_AIRCRAFT_DURATION_MS = 7_000;
export const CARE_AIRCRAFT_DROP_DELAY_MS = 800;
export const CARE_CRATE_DESCENT_MS = 5_200;
export const CARPET_BOMBER_IMPACT_COUNT = 20;
export const MAX_ACTIVE_SUPPORT_ENTITIES = 32;
export const MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP = 64;

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
  /** Resolves against arena static/dynamic solids, ceilings, portals and no-fly data. */
  resolveFlightPosition?: (from: SupportVec3, desired: SupportVec3, radius: number) => SupportVec3;
  isFlightPositionValid?: (position: SupportVec3) => boolean;
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
  damage: number;
  origin: SupportVec3;
  atMs: number;
}>;

export type KillstreakImpactEvent = Readonly<{
  activationId: string;
  source: Pass65KillstreakId;
  ordinal: number;
  position: SupportVec3;
  atMs: number;
}>;

type ActorAuthorityState = {
  actorId: string;
  team: 0 | 1;
  lifeId: number;
  loadout: KillstreakLoadoutV1;
  streak: number;
  earned: Set<Pass65KillstreakId>;
  available: Set<Pass65KillstreakId>;
  careRewards: Pass65KillstreakId[];
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
  vertical: number;
  pendingPlayerFire: boolean;
  gunProfileId: typeof DRONE_GUN_PROFILE_ID;
  nextSensorRefreshAtMs: number;
  sensorContacts: DroneSensorContact[];
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
  expiresAtMs: number;
  impacts: readonly SupportVec3[];
  nextImpactOrdinal: number;
};

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
}>;

export type KillstreakControlIntent = Readonly<{
  by: string;
  matchEpoch: number;
  lifeId: number;
  sequence: number;
  entityId: string;
  action: 'toggle-chopper-gunner' | 'pilot-control' | 'exit-piloted-drone';
  yawQ?: number;
  pitchQ?: number;
  thrustQ?: number;
  verticalQ?: number;
  fire?: boolean;
}>;

export type KillstreakAdmission = Readonly<{
  accepted: boolean;
  reason: string;
  activatedId: Pass65KillstreakId | null;
  entityIds: readonly string[];
}>;

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
  loadout: KillstreakLoadoutV1;
  available: readonly Pass65KillstreakId[];
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
  gunProfileId: typeof DRONE_GUN_PROFILE_ID | null;
  gunController: 'ai' | 'owner-player' | null;
  captureProgress: number | null;
  revealedReward: Pass65KillstreakId | null;
  revision: number;
}>;

export type KillstreakRecipientSnapshot = Readonly<{
  schemaVersion: 1;
  matchEpoch: number;
  revision: number;
  actors: readonly KillstreakActorSnapshot[];
  entities: readonly KillstreakEntitySnapshot[];
  sensorContacts: readonly DroneSensorContact[];
}>;

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
  const radiusX = Math.max(2, (bounds.maxX - bounds.minX) * 0.36)
    * (1 + Math.sin(seconds * 0.31 + phase(13)) * CHOPPER_MOTION_VARIANCE.maximumRadiusScaleDelta);
  const radiusZ = Math.max(2, (bounds.maxZ - bounds.minZ) * 0.36)
    * (1 + Math.sin(seconds * 0.27 + phase(14)) * CHOPPER_MOTION_VARIANCE.maximumRadiusScaleDelta);
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
  private revision = 0;
  private entityCounter = 0;
  private activationCounter = 0;
  private resultCounter = 0;
  private readonly seenActivationRequestIds = new Set<string>();
  private lastAdvancedAtMs = 0;

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
      earned: new Set(),
      available: new Set(),
      careRewards: [],
      adrenalineUntilMs: 0,
      possession: null,
      lastActivationSequence: -1,
      lastControlSequence: -1,
    });
    this.revision += 1;
  }

  recordEligibleElimination(actorId: string, source: 'weapon' | 'ordnance' | 'killstreak'): readonly Pass65KillstreakId[] {
    const actor = this.actors.get(actorId);
    if (!actor || source === 'killstreak') return [];
    actor.streak += 1;
    const newlyEarned: Pass65KillstreakId[] = [];
    for (const id of actor.loadout.slots) {
      const definition = exactDefinition(id, this.catalog);
      if (!definition || actor.earned.has(id) || actor.streak < definition.cost) continue;
      actor.earned.add(id);
      actor.available.add(id);
      newlyEarned.push(id);
    }
    if (newlyEarned.length > 0) this.revision += 1;
    return Object.freeze(newlyEarned);
  }

  recordActorDeath(actorId: string, nextLifeId: number): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.lifeId = nextLifeId;
    actor.streak = 0;
    actor.earned.clear();
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

  private nextEntityId(kind: string): string {
    this.entityCounter += 1;
    return `ks-${this.matchEpoch}-${kind}-${this.entityCounter}`;
  }

  private nextActivationId(): string {
    this.activationCounter += 1;
    return `ks-activation-${this.matchEpoch}-${this.activationCounter}`;
  }

  private actualActivationId(actor: ActorAuthorityState, slot: 1 | 2 | 3 | 4 | 5): Pass65KillstreakId {
    if (slot === 1 && actor.careRewards.length > 0) return actor.careRewards[0];
    return actor.loadout.slots[slot - 1];
  }

  activate(intent: KillstreakActivationIntent, nowMs: number, world: KillstreakWorld): KillstreakAdmission {
    const actor = this.actors.get(intent.by);
    const reject = (reason: string): KillstreakAdmission => Object.freeze({ accepted: false, reason, activatedId: null, entityIds: [] });
    if (!actor) return reject('unknown-actor');
    if (intent.matchEpoch !== this.matchEpoch) return reject('match-epoch-mismatch');
    if (intent.lifeId !== actor.lifeId) return reject('life-mismatch');
    if (!Number.isSafeInteger(intent.sequence) || intent.sequence <= actor.lastActivationSequence) return reject('replayed-sequence');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(intent.activationId)) return reject('invalid-activation-id');
    if (!Number.isFinite(nowMs)) return reject('invalid-time');
    const actualId = this.actualActivationId(actor, intent.slot);
    if (actualId !== intent.expectedId) return reject('selection-mismatch');
    const fromCare = intent.slot === 1 && actor.careRewards[0] === actualId;
    if (!fromCare && !actor.available.has(actualId)) return reject('reward-not-earned');
    if (this.seenActivationRequestIds.has(intent.activationId)) return reject('duplicate-activation-id');
    const entityNeed = actualId === 'drone-swarm' ? DRONE_SWARM_COUNT
      : actualId === 'care-package' ? 2
      : actualId === 'chopper' || actualId === 'piloted-drone' ? 1 : 0;
    if (this.entities.size + entityNeed > MAX_ACTIVE_SUPPORT_ENTITIES) return reject('support-entity-cap');
    if ([...this.entities.values()].some((entity) => entity.ownerId === actor.actorId
      && (actualId === 'chopper' && entity.kind === 'chopper'
        || actualId === 'piloted-drone' && entity.kind === 'drone' && entity.mode === 'piloted'
        || actualId === 'drone-swarm' && entity.kind === 'drone' && entity.mode === 'swarm'))) return reject('duplicate-owner-support-kind');

    actor.lastActivationSequence = intent.sequence;
    this.seenActivationRequestIds.add(intent.activationId);
    if (fromCare) actor.careRewards.shift();
    else actor.available.delete(actualId);
    const activationId = this.nextActivationId();
    const seed = hashText(`${this.matchEpoch}:${activationId}:${actualId}`);
    const entityIds: string[] = [];
    const anchor = finiteTuple(intent.anchor) ? this.clampAnchor(intent.anchor, world) : this.defaultAnchor(actor.actorId, world);

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
        position: routeStart, velocity: [0, 0, 0], attitude: [0, direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
        health: 1, revision: 0, kind: 'aircraft', phase: 'inbound', seed, routeStart, routeEnd,
      });
      this.entities.set(id, {
        id, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + 60_000,
        position: [...routeStart], velocity: [0, 0, 0], attitude: [0, 0, 0], health: 100, revision: 0,
        kind: 'care-crate', phase: 'inbound', dropPosition: [anchor[0], world.bounds.floorY + 0.45, anchor[2]],
        descentStartPosition, descentStartsAtMs: nowMs + CARE_AIRCRAFT_DROP_DELAY_MS, aircraftId,
        reward, rollUnit, captureActorId: null, captureStartedAtMs: null,
      });
      entityIds.push(id, aircraftId);
    } else if (actualId === 'carpet-bomber') {
      const impacts = this.carpetImpactPattern(anchor, seed, world);
      this.carpetBombers.set(activationId, {
        activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + 12_000, impacts, nextImpactOrdinal: 0,
      });
    } else if (actualId === 'chopper') {
      const id = this.nextEntityId('chopper');
      const centre: [number, number, number] = [
        (world.bounds.minX + world.bounds.maxX) / 2,
        Math.min(world.bounds.ceilingY - 2, world.bounds.floorY + 18),
        (world.bounds.minZ + world.bounds.maxZ) / 2,
      ];
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
      const spawn: [number, number, number] = [anchor[0], Math.min(world.bounds.ceilingY - 1, anchor[1] + 2.5), anchor[2]];
      const admittedSpawn = resolveFlightPosition(anchor, spawn, 0.35, world);
      this.entities.set(id, {
        id, activationId, ownerId: actor.actorId, team: actor.team,
        createdAtMs: nowMs, expiresAtMs: nowMs + PILOTED_DRONE_DURATION_MS,
        position: admittedSpawn, velocity: [0, 0, 0], attitude: [0, 0, 0], health: DRONE_HEALTH, revision: 0,
        kind: 'drone', mode: 'piloted', phase: 'active', seed,
        magazine: DRONE_MAGAZINE_SIZE, reserveClips: PILOTED_DRONE_RESERVE_CLIPS,
        reloadCompletesAtMs: null, nextShotAtMs: nowMs, targetId: null,
        yaw: 0, pitch: 0, thrust: 0, vertical: 0, pendingPlayerFire: false,
        gunProfileId: DRONE_SUPPORT_DEFINITIONS.piloted.gunProfileId,
        nextSensorRefreshAtMs: nowMs,
        sensorContacts: [],
      });
      actor.possession = Object.freeze({ kind: 'piloted-drone', entityId: id });
      entityIds.push(id);
    } else if (actualId === 'drone-swarm') {
      for (let index = 0; index < DRONE_SWARM_COUNT; index += 1) {
        const id = this.nextEntityId('swarm-drone');
        const angle = index / DRONE_SWARM_COUNT * Math.PI * 2;
        const spawn: [number, number, number] = [
          clamp(anchor[0] + Math.cos(angle) * 4, world.bounds.minX + 0.5, world.bounds.maxX - 0.5),
          Math.min(world.bounds.ceilingY - 1, Math.max(world.bounds.floorY + 2, anchor[1] + 4 + index % 3)),
          clamp(anchor[2] + Math.sin(angle) * 4, world.bounds.minZ + 0.5, world.bounds.maxZ - 0.5),
        ];
        const admittedSpawn = resolveFlightPosition(anchor, spawn, 0.35, world);
        this.entities.set(id, {
          id, activationId, ownerId: actor.actorId, team: actor.team,
          createdAtMs: nowMs, expiresAtMs: nowMs + DRONE_SWARM_DURATION_MS,
          position: admittedSpawn, velocity: [0, 0, 0], attitude: [0, angle + Math.PI / 2, 0], health: DRONE_HEALTH, revision: 0,
          kind: 'drone', mode: 'swarm', phase: 'active', seed: seed ^ index,
          magazine: DRONE_MAGAZINE_SIZE, reserveClips: null,
          reloadCompletesAtMs: null, nextShotAtMs: nowMs + 500 + index * 35, targetId: null,
          yaw: 0, pitch: 0, thrust: 0, vertical: 0, pendingPlayerFire: false,
          gunProfileId: DRONE_SUPPORT_DEFINITIONS.swarm.gunProfileId,
          nextSensorRefreshAtMs: Number.POSITIVE_INFINITY,
          sensorContacts: [],
        });
        entityIds.push(id);
      }
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
    return Object.freeze({ accepted: true, reason: 'accepted', activatedId: actualId, entityIds: Object.freeze(entityIds) });
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

  private carpetImpactPattern(anchor: SupportVec3, seed: number, world: KillstreakWorld): readonly SupportVec3[] {
    const angle = unit(seed, 1) * Math.PI * 2;
    const forward: readonly [number, number] = [Math.cos(angle), Math.sin(angle)];
    const side: readonly [number, number] = [-forward[1], forward[0]];
    return Object.freeze(Array.from({ length: CARPET_BOMBER_IMPACT_COUNT }, (_, index) => {
      const along = (index / (CARPET_BOMBER_IMPACT_COUNT - 1) - 0.5) * 34;
      const zigzag = (index % 2 === 0 ? -1 : 1) * (3.4 + unit(seed, index + 2) * 2.2);
      return Object.freeze([
        clamp(anchor[0] + forward[0] * along + side[0] * zigzag, world.bounds.minX, world.bounds.maxX),
        world.bounds.floorY,
        clamp(anchor[2] + forward[1] * along + side[1] * zigzag, world.bounds.minZ, world.bounds.maxZ),
      ] as const);
    }));
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
    } else if (intent.action === 'exit-piloted-drone') {
      if (entity.kind !== 'drone' || entity.mode !== 'piloted') return reject('wrong-entity-kind');
      entity.pendingPlayerFire = false;
      entity.thrust = 0;
      entity.vertical = 0;
      this.restoreActorControl(actor, false);
    } else {
      if (![intent.yawQ, intent.pitchQ, intent.thrustQ, intent.verticalQ].every((value) => value === undefined || Number.isFinite(value))) {
        return reject('invalid-control-value');
      }
      if (entity.kind === 'chopper') {
        if (entity.gunController === 'ai' || entity.gunController.actorId !== actor.actorId || entity.gunController.lifeId !== actor.lifeId) return reject('not-gun-controller');
        entity.aimYaw = clamp(intent.yawQ ?? entity.aimYaw, -Math.PI, Math.PI);
        entity.aimPitch = clamp(intent.pitchQ ?? entity.aimPitch, -1.2, 0.5);
        entity.pendingPlayerFire ||= intent.fire === true;
      } else if (entity.kind === 'drone' && entity.mode === 'piloted') {
        if (actor.possession?.kind !== 'piloted-drone' || actor.possession.entityId !== entity.id) return reject('not-drone-controller');
        entity.yaw = clamp(intent.yawQ ?? entity.yaw, -Math.PI, Math.PI);
        entity.pitch = clamp(intent.pitchQ ?? entity.pitch, -1.2, 1.2);
        entity.thrust = clamp(intent.thrustQ ?? entity.thrust, -1, 1);
        entity.vertical = clamp(intent.verticalQ ?? entity.vertical, -1, 1);
        entity.pendingPlayerFire ||= intent.fire === true;
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
        drone.vertical = 0;
      }
    }
    actor.possession = null;
  }

  beginCareCapture(actorId: string, lifeId: number, crateId: string, nowMs: number, world: KillstreakWorld): Readonly<{ accepted: boolean; reason: string }> {
    const actor = this.actors.get(actorId);
    const entity = this.entities.get(crateId);
    if (!actor || actor.lifeId !== lifeId) return Object.freeze({ accepted: false, reason: 'identity-mismatch' });
    if (!entity || entity.kind !== 'care-crate' || entity.phase !== 'landed') return Object.freeze({ accepted: false, reason: 'crate-unavailable' });
    const position = actorPosition(world, actorId);
    if (!position || distance(position, entity.position) > 2.75 || !lineOfSight(world, position, entity.position)) {
      return Object.freeze({ accepted: false, reason: 'capture-admission-failed' });
    }
    entity.phase = 'capturing';
    entity.captureActorId = actorId;
    entity.captureStartedAtMs = nowMs;
    entity.revision += 1;
    this.revision += 1;
    return Object.freeze({ accepted: true, reason: 'accepted' });
  }

  interruptCareCapture(actorId: string, lifeId: number): void {
    if (this.actors.get(actorId)?.lifeId !== lifeId) return;
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'care-crate' || entity.captureActorId !== actorId) continue;
      entity.phase = 'landed';
      entity.captureActorId = null;
      entity.captureStartedAtMs = null;
      entity.revision += 1;
      this.revision += 1;
    }
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
    const previousAt = this.lastAdvancedAtMs === 0 ? nowMs : this.lastAdvancedAtMs;
    const dt = clamp((nowMs - previousAt) / 1_000, 0, 0.1);
    this.lastAdvancedAtMs = Math.max(previousAt, nowMs);
    const damageEvents: KillstreakDamageEvent[] = [];
    const impactEvents: KillstreakImpactEvent[] = [];
    const expiredEntityIds: string[] = [];

    for (const [activationId, activation] of this.timedActivations) {
      if (nowMs >= activation.expiresAtMs) this.timedActivations.delete(activationId);
    }
    for (const [activationId, bomber] of this.carpetBombers) {
      while (bomber.nextImpactOrdinal < bomber.impacts.length
        && nowMs >= bomber.createdAtMs + 1_000 + bomber.nextImpactOrdinal * 180
        && impactEvents.length < CARPET_BOMBER_IMPACT_COUNT) {
        const ordinal = bomber.nextImpactOrdinal;
        const position = bomber.impacts[ordinal];
        bomber.nextImpactOrdinal += 1;
        impactEvents.push(Object.freeze({ activationId, source: 'carpet-bomber', ordinal, position, atMs: nowMs }));
        const owner = this.actors.get(bomber.ownerId);
        if (owner) this.damageAround(owner, activationId, 'carpet-bomber', position, 4.5, 80, nowMs, world, damageEvents);
      }
      if (nowMs >= bomber.expiresAtMs || bomber.nextImpactOrdinal >= bomber.impacts.length) this.carpetBombers.delete(activationId);
    }

    for (const entity of [...this.entities.values()]) {
      if (nowMs >= entity.expiresAtMs || entity.health <= 0) {
        expiredEntityIds.push(entity.id);
        this.expireEntity(entity.id);
        continue;
      }
      if (entity.kind === 'aircraft') this.advanceAircraft(entity, nowMs, dt, world);
      else if (entity.kind === 'care-crate') this.advanceCareCrate(entity, nowMs, dt, world);
      else if (entity.kind === 'chopper') this.advanceChopper(entity, nowMs, dt, world, damageEvents);
      else this.advanceDrone(entity, nowMs, dt, world, damageEvents);
    }
    return Object.freeze({
      damageEvents: Object.freeze(damageEvents.slice(0, MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP)),
      impactEvents: Object.freeze(impactEvents),
      expiredEntityIds: Object.freeze(expiredEntityIds),
    });
  }

  private advanceAircraft(entity: AircraftEntity, nowMs: number, dt: number, world: KillstreakWorld): void {
    const progress = clamp((nowMs - entity.createdAtMs) / CARE_AIRCRAFT_DURATION_MS, 0, 1);
    entity.phase = progress < 0.12 ? 'inbound' : progress > 0.82 ? 'outbound' : 'active';
    const eased = progress * progress * (3 - 2 * progress);
    const desired: SupportVec3 = [
      entity.routeStart[0] + (entity.routeEnd[0] - entity.routeStart[0]) * eased,
      entity.routeStart[1] + Math.sin(progress * Math.PI + unit(entity.seed, 33) * Math.PI) * 0.28,
      entity.routeStart[2] + (entity.routeEnd[2] - entity.routeStart[2]) * eased,
    ];
    const previous: SupportVec3 = [...entity.position];
    const next = resolveFlightPosition(previous, desired, 1.25, world);
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
      return;
    }
    const requiredMs = captureActor.team === entity.team ? 1_250 : 2_500;
    if (nowMs - entity.captureStartedAtMs < requiredMs) return;
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
    const target = entity.gunController === 'ai'
      ? this.nearestVisibleTarget(entity.position, owner.actorId, owner.team, world)
      : this.aimedVisibleTarget(entity.position, entity.aimYaw, entity.aimPitch, owner.actorId, owner.team, world);
    if (target) damageEvents.push(this.damageEvent(entity.activationId, 'chopper', owner.actorId, target, 8, entity.position, nowMs));
    entity.nextShotAtMs = nowMs + 300;
    entity.pendingPlayerFire = false;
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
    if (entity.gunProfileId !== DRONE_GUN_PROFILE_ID) throw new Error(`unknown drone gun profile ${entity.gunProfileId}`);
    const gunProfile: DroneGunProfile = DRONE_GUN_PROFILE;
    if (entity.mode === 'piloted') this.updatePilotedDroneSensor(entity, owner, nowMs, world);
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
    if (entity.mode === 'piloted') {
      const forward = supportForwardFromYawPitch(entity.yaw, entity.pitch);
      const speed = 10 * entity.thrust;
      const desired: [number, number, number] = [
        clamp(entity.position[0] + forward[0] * speed * dt, world.bounds.minX + 0.35, world.bounds.maxX - 0.35),
        clamp(entity.position[1] + (forward[1] * Math.abs(speed) + entity.vertical * 7) * dt, world.bounds.floorY + 0.5, world.bounds.ceilingY - 0.5),
        clamp(entity.position[2] + forward[2] * speed * dt, world.bounds.minZ + 0.35, world.bounds.maxZ - 0.35),
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
          if (target) damageEvents.push(this.damageEvent(
            entity.activationId,
            'piloted-drone',
            owner.actorId,
            target,
            gunProfile.damage,
            entity.position,
            nowMs,
          ));
          entity.magazine -= 1;
        }
        entity.nextShotAtMs = nowMs + gunProfile.cadenceMs;
        entity.pendingPlayerFire = false;
      }
    } else {
      let target = hostileTargets(world, owner.actorId, owner.team).find((candidate) => candidate.id === entity.targetId) ?? null;
      if (!target) {
        const candidates = hostileTargets(world, owner.actorId, owner.team).sort((left, right) => left.id.localeCompare(right.id));
        target = candidates.length > 0 ? candidates[entity.seed % candidates.length] : null;
        entity.targetId = target?.id ?? null;
      }
      if (target) {
        const dx = target.position[0] - entity.position[0];
        const dy = target.position[1] + 1.5 - entity.position[1];
        const dz = target.position[2] - entity.position[2];
        const range = Math.max(0.001, Math.hypot(dx, dy, dz));
        if (range > 7) {
          const desired: [number, number, number] = [
            clamp(entity.position[0] + dx / range * 8 * dt, world.bounds.minX + 0.35, world.bounds.maxX - 0.35),
            clamp(entity.position[1] + dy / range * 8 * dt, world.bounds.floorY + 1, world.bounds.ceilingY - 0.5),
            clamp(entity.position[2] + dz / range * 8 * dt, world.bounds.minZ + 0.35, world.bounds.maxZ - 0.35),
          ];
          const previous: SupportVec3 = [...entity.position];
          const next = resolveFlightPosition(previous, desired, 0.35, world);
          entity.velocity = [(next[0] - previous[0]) / Math.max(dt, 0.001), (next[1] - previous[1]) / Math.max(dt, 0.001), (next[2] - previous[2]) / Math.max(dt, 0.001)];
          entity.position = next;
          entity.attitude = attitudeFromMotion(previous, next, entity.attitude);
        }
        if (range <= gunProfile.maximumRangeM && lineOfSight(world, entity.position, target.position) && nowMs >= entity.nextShotAtMs && entity.magazine > 0) {
          damageEvents.push(this.damageEvent(entity.activationId, 'drone-swarm', owner.actorId, target, gunProfile.damage, entity.position, nowMs));
          entity.magazine -= 1;
          entity.nextShotAtMs = nowMs + gunProfile.cadenceMs;
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
    entity.sensorContacts = hostileTargets(world, owner.actorId, owner.team)
      .filter((target) => {
        const dx = target.position[0] - entity.position[0];
        const dy = target.position[1] - entity.position[1];
        const dz = target.position[2] - entity.position[2];
        const range = Math.hypot(dx, dy, dz);
        if (range <= 0.001 || range > PILOTED_DRONE_SENSOR_PROFILE.maximumRangeM) return false;
        return (dx * direction[0] + dy * direction[1] + dz * direction[2]) / range >= minimumDot;
      })
      .sort((left, right) => left.id.localeCompare(right.id))
      .filter((target, index, targets) => index === 0 || target.id !== targets[index - 1].id)
      .slice(0, 16)
      .map((target) => Object.freeze({
        id: target.id,
        kind: target.kind,
        team: target.team,
        lifeId: target.lifeId,
        position: Object.freeze([...target.position]) as unknown as SupportVec3,
        relation: 'hostile' as const,
        throughWall: true as const,
      }));
    entity.nextSensorRefreshAtMs = nowMs + PILOTED_DRONE_SENSOR_PROFILE.refreshMs;
  }

  private nearestVisibleTarget(origin: SupportVec3, ownerId: string, team: 0 | 1, world: KillstreakWorld): KillstreakTarget | null {
    return hostileTargets(world, ownerId, team)
      .filter((target) => lineOfSight(world, origin, target.position))
      .sort((left, right) => distance(origin, left.position) - distance(origin, right.position) || left.id.localeCompare(right.id))[0] ?? null;
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
    return hostileTargets(world, ownerId, team).filter((target) => {
      if (!lineOfSight(world, origin, target.position)) return false;
      const delta = [target.position[0] - origin[0], target.position[1] - origin[1], target.position[2] - origin[2]] as const;
      const length = Math.max(0.001, Math.hypot(...delta));
      if (length > maximumRange) return false;
      const dot = (delta[0] * direction[0] + delta[1] * direction[1] + delta[2] * direction[2]) / length;
      return dot >= Math.cos(8 * Math.PI / 180);
    }).sort((left, right) => distance(origin, left.position) - distance(origin, right.position))[0] ?? null;
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
  ): void {
    for (const target of hostileTargets(world, owner.actorId, owner.team)) {
      const range = distance(origin, target.position);
      if (range > radius || !lineOfSight(world, origin, target.position) || output.length >= MAX_SUPPORT_DAMAGE_EVENTS_PER_STEP) continue;
      const damage = Math.max(1, Math.round(maximum * (1 - range / radius * 0.75)));
      output.push(this.damageEvent(activationId, source, owner.actorId, target, damage, origin, nowMs));
    }
  }

  private damageEvent(
    activationId: string,
    source: Pass65KillstreakId,
    ownerId: string,
    target: KillstreakTarget,
    damage: number,
    origin: SupportVec3,
    nowMs: number,
  ): KillstreakDamageEvent {
    this.resultCounter += 1;
    return Object.freeze({
      resultId: `ks-result-${this.matchEpoch}-${this.resultCounter}`,
      activationId,
      source,
      ownerId,
      targetId: target.id,
      targetLifeId: target.lifeId,
      damage,
      origin: Object.freeze([...origin]) as unknown as SupportVec3,
      atMs: nowMs,
    });
  }

  private expireEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    this.entities.delete(entityId);
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
      loadout: parseKillstreakLoadout(actor.loadout),
      available: Object.freeze(actor.loadout.slots.filter((id) => actor.available.has(id))),
      adrenalineRemainingMs: Math.max(0, actor.adrenalineUntilMs - nowMs),
      possession: actor.possession,
      revealedCareRewards: Object.freeze(actor.actorId === recipientActorId ? [...actor.careRewards] : []),
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
    return Object.freeze({
      schemaVersion: 1,
      matchEpoch: this.matchEpoch,
      revision: this.revision,
      actors: Object.freeze(actors),
      entities: Object.freeze(entities),
      sensorContacts: Object.freeze(sensorContacts),
    });
  }
}
