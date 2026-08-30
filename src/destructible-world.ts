import { canonicalSha256 } from './canonical-state';
import type { Point3 } from './collision';
import { isArenaId, type ArenaId } from './arena-identity';

export const SHED_MAX_APERTURES = 96;
export const SHED_MAX_DENTS = 64;
export const SHED_MAX_MAJOR_CHUNKS = 6;
export const ARENA_MAX_AWAKE_SHED_BODIES = 18;
export const SHED_DOOR_TRAVEL_TICKS = 60;
export const SHED_ANGLE_Q = 10_000;
export const SHED_PANEL_COORD_Q = 10_000;
export const SHED_MAX_INTERACTION_ACTORS = 12;
export const SHED_MAJOR_DEBRIS_HALF_THICKNESS = 0.06;
export const SHED_CORNER_ZONE_Q = 6_500;
export const SHED_CORNER_COLLAPSE_MARKS = 3;
export const SHED_DAMAGE_REGION_RADIUS_Q = 1_800;
export const SHED_EXPLOSION_DENT_MIN_RADIUS_Q = 900;
export const SHED_EXPLOSION_DENT_MAX_RADIUS_Q = 3_200;

export const WORLD_COLLISION_CONSUMERS = Object.freeze([
  'movement',
  'ballistics',
  'grenades',
  'ai-los',
  'support-targeting',
  'spawn-nav',
  'rendering',
] as const);

export type WorldCollisionConsumer = typeof WORLD_COLLISION_CONSUMERS[number];
export type ShedArenaId = ArenaId;
export type DamageableSheetRole = 'wall' | 'roof' | 'door' | 'detached-chunk';
export type ShedDoorBlockerKind = 'player' | 'major-debris' | 'bullet';

export type QuantizedVector = Readonly<{ xQ: number; yQ: number; zQ: number }>;
export type QuantizedPose = Readonly<{
  position: QuantizedVector;
  rotation: Readonly<{ xQ: number; yQ: number; zQ: number; wQ: number }>;
}>;

export type BallisticAperture = Readonly<{
  id: number;
  surfaceId: string;
  uQ: number;
  vQ: number;
  radiusUQ: number;
  radiusVQ: number;
}>;

export type SheetDent = Readonly<{
  id: number;
  surfaceId: string;
  uQ: number;
  vQ: number;
  radiusQ: number;
  depthQ: number;
}>;

export type DamageableSheetSurfaceState = Readonly<{
  surfaceId: string;
  role: DamageableSheetRole;
  attachedChunkId: string | null;
  healthQ: number;
  stage: 'intact' | 'dented' | 'perforated' | 'detached';
  apertures: readonly BallisticAperture[];
  dents: readonly SheetDent[];
}>;

export type ShedRegionalDamage = Readonly<{
  apertureCount: number;
  dentCount: number;
  markCount: number;
  maximumDentDepthQ: number;
}>;

export type ShedDoorState = Readonly<{
  surfaceId: string;
  commandId: string;
  commandSequence: number;
  angleQ: number;
  motionOriginAngleQ: number;
  desiredAngleQ: 0 | typeof SHED_ANGLE_Q;
  direction: 'opening' | 'closing' | 'stationary';
  phase: 'closed' | 'opening' | 'open' | 'closing' | 'blocked';
  startedAtTick: number;
  completesAtTick: number;
  blockedAtTick: number | null;
  blockedBy: Readonly<{ kind: ShedDoorBlockerKind; entityId: string }> | null;
  resumePolicy: 'remain-blocked-until-new-command' | 'resume-when-clear';
}>;

export type MajorDebrisState = Readonly<{
  chunkId: string;
  poseQ: QuantizedPose;
  velocityQ: QuantizedVector;
  angularVelocityQ: QuantizedVector;
  sleeping: boolean;
  flat: boolean;
}>;

export type ShedState = Readonly<{
  schemaVersion: 1;
  shedId: string;
  placementId: string;
  arenaId: ShedArenaId;
  matchEpoch: number;
  revision: number;
  nextApertureId: number;
  nextDentId: number;
  door: ShedDoorState;
  surfaces: readonly DamageableSheetSurfaceState[];
  detachedChunkIds: readonly string[];
  majorDebris: readonly MajorDebrisState[];
  interactionSequences: readonly Readonly<{ actorId: string; sequence: number }>[];
}>;

export type SheetSurfaceDefinition = Readonly<{
  id: string;
  role: Exclude<DamageableSheetRole, 'detached-chunk'>;
  /** World-space centre and orthonormal axes used by both presentation masking and ballistics. */
  frame: Readonly<{
    centre: Point3;
    uAxis: Point3;
    vAxis: Point3;
    halfU: number;
    halfV: number;
    /**
     * Owner 2026-08-30 ("i keep seeing through its walls"): a surface whose
     * RENDERED outline is not its bounding rectangle. Points are in frame
     * units quantised by SHED_PANEL_COORD_Q (+/-Q maps to +/-halfU / +/-halfV),
     * matching how apertures are already quantised. Ballistics and movement
     * keep using the bounding frame - only presentation clips - so a gable
     * triangle cannot become a hole you can shoot through.
     */
    outlineUVQ?: readonly Readonly<{ uQ: number; vQ: number }>[];
  }>;
  detachableChunkId: string | null;
}>;

export type DestructibleShedDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  doorSurfaceId: string;
  surfaces: readonly SheetSurfaceDefinition[];
  preauthoredChunkIds: readonly string[];
  thresholds: Readonly<{
    dentDamageQ: number;
    perforateEnergyQ: number;
    detachDamageQ: number;
  }>;
  caps: Readonly<{
    apertures: typeof SHED_MAX_APERTURES;
    dents: typeof SHED_MAX_DENTS;
    majorChunks: typeof SHED_MAX_MAJOR_CHUNKS;
    arenaAwakeMajorBodies: typeof ARENA_MAX_AWAKE_SHED_BODIES;
  }>;
  consumers: readonly WorldCollisionConsumer[];
}>;

export type ShedPlacement = Readonly<{
  id: string;
  definitionId: string;
  arenaId: Exclude<ShedArenaId, 'gun-range'>;
  zone: 'whole-arena' | 'terminal-apron';
  position: Point3;
  yaw: number;
}>;

export type ShedMajorChunkExtents = Readonly<{
  halfU: number;
  halfV: number;
  halfThickness: typeof SHED_MAJOR_DEBRIS_HALF_THICKNESS;
}>;

export type WorldCollisionSnapshot = Readonly<{
  schemaVersion: 1;
  arenaId: ShedArenaId;
  matchEpoch: number;
  revision: number;
  staticDefinitionId: string;
  consumers: readonly WorldCollisionConsumer[];
  sheds: readonly ShedState[];
  hashAlgorithm: 'sha256';
  hash: string;
}>;

export type ShedMutationResult = Readonly<{
  accepted: boolean;
  reason:
    | 'accepted'
    | 'not-host'
    | 'stale-epoch'
    | 'stale-revision'
    | 'invalid-sequence'
    | 'actor-dead'
    | 'out-of-range'
    | 'line-of-sight-blocked'
    | 'unknown-surface'
    | 'invalid-impact'
    | 'aperture-cap'
    | 'dent-cap'
    | 'already-detached'
    | 'invalid-blocker'
    | 'chunk-cap'
    | 'shared-major-body-cap'
    | 'flat-contact-rejected';
  state: ShedState;
}>;

/** Shared physical bounds for every authored debris throw, push and birth kick. */
const SHED_DEBRIS_MAX_SPEED = 9;
const SHED_DEBRIS_MAX_ANGULAR = 9;
/** Velocity/impulse quantisation: one Q unit is a millimetre (or milliradian) per second. */
const SHED_DEBRIS_VELOCITY_Q = 1_000;
/** Bound the impulse request is validated against, and therefore the bound it accumulates into. */
export const SHED_DEBRIS_IMPULSE_MAX_Q = 50_000;
/**
 * Detach kick (owner 2026-08-30, "its physics to destruction and push need some
 * help"): a panel that lets go leaves the frame along its own outward normal
 * with a slight downward bias. Small enough to read as a slump off the shell,
 * not a launch.
 */
const SHED_DEBRIS_DETACH_MIN_SPEED = 1.2;
const SHED_DEBRIS_DETACH_SPEED_SPREAD = 0.8;
const SHED_DEBRIS_DETACH_SLUMP = 0.6;
const SHED_DEBRIS_DETACH_SPIN = 1.8;
/** A grenade collapse throws with the same shape as the bomber, at under half the speed. */
const SHED_GRENADE_THROW_SCALE = 0.45;
/** Radians per second of tumble per metre per second of push. Panels are ~1-2 m half-extents. */
const SHED_DEBRIS_IMPULSE_SPIN = 0.5;

const ZERO_VECTOR: QuantizedVector = Object.freeze({ xQ: 0, yQ: 0, zQ: 0 });
const IDENTITY_POSE: QuantizedPose = Object.freeze({
  position: ZERO_VECTOR,
  rotation: Object.freeze({ xQ: 0, yQ: 0, zQ: 0, wQ: SHED_PANEL_COORD_Q }),
});

function frameRotationQ(frame: SheetSurfaceDefinition['frame']): QuantizedPose['rotation'] {
  const normal = {
    x: frame.uAxis.y * frame.vAxis.z - frame.uAxis.z * frame.vAxis.y,
    y: frame.uAxis.z * frame.vAxis.x - frame.uAxis.x * frame.vAxis.z,
    z: frame.uAxis.x * frame.vAxis.y - frame.uAxis.y * frame.vAxis.x,
  };
  const m00 = frame.uAxis.x; const m01 = frame.vAxis.x; const m02 = normal.x;
  const m10 = frame.uAxis.y; const m11 = frame.vAxis.y; const m12 = normal.y;
  const m20 = frame.uAxis.z; const m21 = frame.vAxis.z; const m22 = normal.z;
  const trace = m00 + m11 + m22;
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    w = scale / 4;
    x = (m21 - m12) / scale;
    y = (m02 - m20) / scale;
    z = (m10 - m01) / scale;
  } else if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / scale;
    x = scale / 4;
    y = (m01 + m10) / scale;
    z = (m02 + m20) / scale;
  } else if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / scale;
    x = (m01 + m10) / scale;
    y = scale / 4;
    z = (m12 + m21) / scale;
  } else {
    const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / scale;
    x = (m02 + m20) / scale;
    y = (m12 + m21) / scale;
    z = scale / 4;
  }
  const length = Math.hypot(x, y, z, w) || 1;
  return Object.freeze({
    xQ: Math.round(x / length * SHED_PANEL_COORD_Q),
    yQ: Math.round(y / length * SHED_PANEL_COORD_Q),
    zQ: Math.round(z / length * SHED_PANEL_COORD_Q),
    wQ: Math.round(w / length * SHED_PANEL_COORD_Q),
  });
}

function finiteInteger(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function validId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function magnitude(vector: Point3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function shedSurfaceNormal(frame: SheetSurfaceDefinition['frame']): Point3 {
  return Object.freeze({
    x: frame.uAxis.y * frame.vAxis.z - frame.uAxis.z * frame.vAxis.y,
    y: frame.uAxis.z * frame.vAxis.x - frame.uAxis.x * frame.vAxis.z,
    z: frame.uAxis.x * frame.vAxis.y - frame.uAxis.y * frame.vAxis.x,
  });
}

/**
 * Deterministic per-chunk noise. Host and guest replay the same detach and
 * throw maths from replicated state, so every "random" component has to come
 * from the chunk id instead of a PRNG. FNV-1a over the id, sampled as 16-bit
 * windows; offsets at or above 32 alias back onto the low windows because JS
 * shifts are taken modulo 32, which the authored throw offsets already rely on.
 */
function chunkNoise(chunkId: string): (bitOffset: number) => number {
  let hash = 0x811c9dc5 ^ (chunkId.length + 1);
  for (let index = 0; index < chunkId.length; index += 1) {
    hash = Math.imul(hash ^ chunkId.charCodeAt(index), 0x01000193);
  }
  hash >>>= 0;
  return (bitOffset: number): number => ((hash >>> bitOffset) & 0xffff) / 0xffff;
}

function clampSpeed(value: number, maximum: number): number {
  return Math.max(-maximum, Math.min(maximum, value));
}

/**
 * Quantise to an integer that is never negative zero. Canonical state is JSON
 * round-tripped on every join and JSON writes -0 as 0, so a host holding -0
 * would never deep-equal the guest that parsed the host's own envelope. An axis
 * component of exactly zero times a negative spin produces -0, so this is
 * reachable from ordinary authored geometry.
 */
function roundQ(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

function quantizedVelocity(vector: Point3, maximum = SHED_DEBRIS_MAX_SPEED): QuantizedVector {
  return Object.freeze({
    xQ: roundQ(clampSpeed(vector.x, maximum) * SHED_DEBRIS_VELOCITY_Q),
    yQ: roundQ(clampSpeed(vector.y, maximum) * SHED_DEBRIS_VELOCITY_Q),
    zQ: roundQ(clampSpeed(vector.z, maximum) * SHED_DEBRIS_VELOCITY_Q),
  });
}

function accumulateVelocityQ(base: QuantizedVector, delta: QuantizedVector, maximumQ: number): QuantizedVector {
  return Object.freeze({
    xQ: roundQ(clampSpeed(base.xQ + delta.xQ, maximumQ)),
    yQ: roundQ(clampSpeed(base.yQ + delta.yQ, maximumQ)),
    zQ: roundQ(clampSpeed(base.zQ + delta.zQ, maximumQ)),
  });
}

function validFrame(frame: SheetSurfaceDefinition['frame']): boolean {
  const uLength = magnitude(frame.uAxis);
  const vLength = magnitude(frame.vAxis);
  const dot = frame.uAxis.x * frame.vAxis.x + frame.uAxis.y * frame.vAxis.y + frame.uAxis.z * frame.vAxis.z;
  return [frame.centre.x, frame.centre.y, frame.centre.z, frame.halfU, frame.halfV].every(Number.isFinite)
    && frame.halfU > 0
    && frame.halfV > 0
    && Math.abs(uLength - 1) <= 1e-4
    && Math.abs(vLength - 1) <= 1e-4
    && Math.abs(dot) <= 1e-4;
}

export function validateDestructibleShedDefinition(definition: DestructibleShedDefinition): readonly string[] {
  const errors: string[] = [];
  if (definition.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!validId(definition.id)) errors.push('definition id invalid');
  if (definition.caps.apertures !== SHED_MAX_APERTURES) errors.push('aperture cap mismatch');
  if (definition.caps.dents !== SHED_MAX_DENTS) errors.push('dent cap mismatch');
  if (definition.caps.majorChunks !== SHED_MAX_MAJOR_CHUNKS) errors.push('major chunk cap mismatch');
  if (definition.caps.arenaAwakeMajorBodies !== ARENA_MAX_AWAKE_SHED_BODIES) errors.push('arena awake-body cap mismatch');
  if (definition.preauthoredChunkIds.length !== SHED_MAX_MAJOR_CHUNKS || !unique(definition.preauthoredChunkIds)) {
    errors.push('exactly six unique pre-authored chunks required');
  }
  if (!definition.preauthoredChunkIds.every(validId)) errors.push('pre-authored chunk id invalid');
  const surfaceIds = definition.surfaces.map((surface) => surface.id);
  if (definition.surfaces.length < 4 || !unique(surfaceIds) || !surfaceIds.every(validId)) errors.push('surface ids invalid');
  if (!surfaceIds.includes(definition.doorSurfaceId)) errors.push('door surface missing');
  if (definition.surfaces.filter((surface) => surface.role === 'door').length !== 1) errors.push('exactly one door surface required');
  for (const surface of definition.surfaces) {
    if (!validFrame(surface.frame)) errors.push(`${surface.id}: invalid frame`);
    const normal = shedSurfaceNormal(surface.frame);
    const horizontalOutward = normal.x * surface.frame.centre.x + normal.z * surface.frame.centre.z;
    if (surface.role === 'roof') {
      if (normal.y < 0.5 || horizontalOutward <= 0.05) errors.push(`${surface.id}: roof normal must face up and outward`);
    } else if (horizontalOutward <= 0.05) {
      errors.push(`${surface.id}: wall/door normal must face outward`);
    }
    if (surface.detachableChunkId !== null && !definition.preauthoredChunkIds.includes(surface.detachableChunkId)) {
      errors.push(`${surface.id}: unknown detachable chunk`);
    }
    const outline = surface.frame.outlineUVQ;
    if (outline !== undefined) {
      if (outline.length < 3) {
        errors.push(`${surface.id}: outlineUVQ needs at least three points`);
      } else if (!outline.every((point) => Number.isSafeInteger(point.uQ) && Number.isSafeInteger(point.vQ)
        && Math.abs(point.uQ) <= SHED_PANEL_COORD_Q && Math.abs(point.vQ) <= SHED_PANEL_COORD_Q)) {
        errors.push(`${surface.id}: outlineUVQ points must be integers within +/-${SHED_PANEL_COORD_Q}`);
      }
    }
  }
  const usedChunkIds = definition.surfaces
    .map((surface) => surface.detachableChunkId)
    .filter((chunkId): chunkId is string => chunkId !== null);
  if (!unique(usedChunkIds)
    || usedChunkIds.length !== definition.preauthoredChunkIds.length
    || !definition.preauthoredChunkIds.every((chunkId) => usedChunkIds.includes(chunkId))) {
    errors.push('pre-authored chunks must map one-to-one to detachable sheet surfaces');
  }
  const { dentDamageQ, perforateEnergyQ, detachDamageQ } = definition.thresholds;
  if (![dentDamageQ, perforateEnergyQ, detachDamageQ].every((value) => finiteInteger(value, 1, 1_000_000))) {
    errors.push('damage thresholds must be bounded integers');
  } else if (!(dentDamageQ < perforateEnergyQ && perforateEnergyQ < detachDamageQ)) {
    errors.push('thresholds must increase dent < perforate < detach');
  }
  if (definition.consumers.length !== WORLD_COLLISION_CONSUMERS.length
    || !WORLD_COLLISION_CONSUMERS.every((consumer) => definition.consumers.includes(consumer))) {
    errors.push('world collision consumer parity incomplete');
  }
  return Object.freeze(errors);
}

/**
 * Canonical sheet dimensions shared by presentation, movement, ballistics and
 * Rapier. Keeping these dimensions definition-derived prevents a detached roof
 * or wall from becoming the old one-size-fits-all box in another consumer.
 */
export function shedMajorChunkExtents(
  definition: DestructibleShedDefinition,
  chunkId: string,
): ShedMajorChunkExtents {
  const surface = definition.surfaces.find((candidate) => candidate.detachableChunkId === chunkId);
  if (!surface) throw new TypeError(`Unknown shed chunk: ${chunkId}`);
  return Object.freeze({
    halfU: surface.frame.halfU,
    halfV: surface.frame.halfV,
    halfThickness: SHED_MAJOR_DEBRIS_HALF_THICKNESS,
  });
}

export function createInitialShedState(
  definition: DestructibleShedDefinition,
  placement: ShedPlacement,
  matchEpoch: number,
): ShedState {
  const definitionErrors = validateDestructibleShedDefinition(definition);
  if (definitionErrors.length > 0) throw new TypeError(definitionErrors.join('; '));
  if (placement.definitionId !== definition.id || !validId(placement.id)) throw new TypeError('Invalid shed placement');
  if (!finiteInteger(matchEpoch, 1)) throw new TypeError('Invalid match epoch');
  const surfaces = definition.surfaces.map<DamageableSheetSurfaceState>((surface) => Object.freeze({
    surfaceId: surface.id,
    role: surface.role,
    attachedChunkId: surface.detachableChunkId,
    healthQ: 0,
    stage: 'intact',
    apertures: Object.freeze([]),
    dents: Object.freeze([]),
  }));
  return Object.freeze({
    schemaVersion: 1,
    shedId: definition.id,
    placementId: placement.id,
    arenaId: placement.arenaId,
    matchEpoch,
    revision: 0,
    nextApertureId: 1,
    nextDentId: 1,
    door: Object.freeze({
      surfaceId: definition.doorSurfaceId,
      commandId: 'initial',
      commandSequence: 0,
      angleQ: 0,
      motionOriginAngleQ: 0,
      desiredAngleQ: 0,
      direction: 'stationary',
      phase: 'closed',
      startedAtTick: 0,
      completesAtTick: 0,
      blockedAtTick: null,
      blockedBy: null,
      resumePolicy: 'remain-blocked-until-new-command',
    }),
    surfaces: Object.freeze(surfaces),
    detachedChunkIds: Object.freeze([]),
    majorDebris: Object.freeze([]),
    interactionSequences: Object.freeze([]),
  });
}

function withRevision(state: ShedState, update: Omit<Partial<ShedState>, 'revision'>): ShedState {
  return Object.freeze({ ...state, ...update, revision: state.revision + 1 });
}

function doorAngleAt(door: ShedDoorState, tick: number): number {
  if (door.phase === 'blocked' || door.direction === 'stationary') return door.angleQ;
  const duration = Math.max(1, door.completesAtTick - door.startedAtTick);
  const progress = Math.max(0, Math.min(1, (tick - door.startedAtTick) / duration));
  return Math.round(door.motionOriginAngleQ + (door.desiredAngleQ - door.motionOriginAngleQ) * progress);
}

export function advanceShedDoor(state: ShedState, tick: number): ShedState {
  if (!finiteInteger(tick) || state.door.phase === 'blocked' || state.door.direction === 'stationary') return state;
  const angleQ = doorAngleAt(state.door, tick);
  const complete = tick >= state.door.completesAtTick;
  if (angleQ === state.door.angleQ && !complete) return state;
  const door: ShedDoorState = complete
    ? Object.freeze({
      ...state.door,
      angleQ: state.door.desiredAngleQ,
      motionOriginAngleQ: state.door.desiredAngleQ,
      direction: 'stationary',
      phase: state.door.desiredAngleQ === SHED_ANGLE_Q ? 'open' : 'closed',
      blockedAtTick: null,
      blockedBy: null,
    })
    : Object.freeze({ ...state.door, angleQ });
  return withRevision(state, { door });
}

export type DoorInteractionRequest = Readonly<{
  isHost: boolean;
  matchEpoch: number;
  expectedRevision: number;
  actorId: string;
  actorAlive: boolean;
  sequence: number;
  distance: number;
  hasLineOfSight: boolean;
  tick: number;
}>;

export function admitShedDoorInteraction(state: ShedState, request: DoorInteractionRequest): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.matchEpoch !== state.matchEpoch) return { accepted: false, reason: 'stale-epoch', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (!request.actorAlive) return { accepted: false, reason: 'actor-dead', state };
  if (!Number.isFinite(request.distance) || request.distance > 2.35) return { accepted: false, reason: 'out-of-range', state };
  if (!request.hasLineOfSight) return { accepted: false, reason: 'line-of-sight-blocked', state };
  const prior = state.interactionSequences.find((entry) => entry.actorId === request.actorId)?.sequence ?? 0;
  const newActor = !state.interactionSequences.some((entry) => entry.actorId === request.actorId);
  if (!validId(request.actorId)
    || request.sequence !== prior + 1
    || !finiteInteger(request.tick)
    || (newActor && state.interactionSequences.length >= SHED_MAX_INTERACTION_ACTORS)) {
    return { accepted: false, reason: 'invalid-sequence', state };
  }
  const currentAngleQ = doorAngleAt(state.door, request.tick);
  const desiredAngleQ: 0 | typeof SHED_ANGLE_Q = state.door.desiredAngleQ === SHED_ANGLE_Q ? 0 : SHED_ANGLE_Q;
  const distanceQ = Math.abs(desiredAngleQ - currentAngleQ);
  const duration = Math.max(1, Math.round(SHED_DOOR_TRAVEL_TICKS * distanceQ / SHED_ANGLE_Q));
  const commandSequence = state.door.commandSequence + 1;
  const door: ShedDoorState = Object.freeze({
    ...state.door,
    commandId: `${state.placementId}-door-${commandSequence}`,
    commandSequence,
    angleQ: currentAngleQ,
    motionOriginAngleQ: currentAngleQ,
    desiredAngleQ,
    direction: desiredAngleQ === SHED_ANGLE_Q ? 'opening' : 'closing',
    phase: desiredAngleQ === SHED_ANGLE_Q ? 'opening' : 'closing',
    startedAtTick: request.tick,
    completesAtTick: request.tick + duration,
    blockedAtTick: null,
    blockedBy: null,
  });
  const interactionSequences = Object.freeze([
    ...state.interactionSequences.filter((entry) => entry.actorId !== request.actorId),
    Object.freeze({ actorId: request.actorId, sequence: request.sequence }),
  ].sort((left, right) => left.actorId.localeCompare(right.actorId)));
  return { accepted: true, reason: 'accepted', state: withRevision(state, { door, interactionSequences }) };
}

/**
 * Host-owned contact response for an intact door. Walking into a closed or
 * closing leaf pushes it towards open without forging an F-interaction
 * sequence. Repeated overlap while it is already opening is a no-op, which
 * keeps one physical contact from manufacturing revisions every simulation
 * tick.
 */
export function pushShedDoorFromPlayerContact(
  state: ShedState,
  request: Readonly<{
    isHost: boolean;
    expectedRevision: number;
    actorId: string;
    tick: number;
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (!validId(request.actorId) || !finiteInteger(request.tick)) return { accepted: false, reason: 'invalid-blocker', state };
  const doorSurface = state.surfaces.find((surface) => surface.surfaceId === state.door.surfaceId);
  if (!doorSurface || doorSurface.stage === 'detached') return { accepted: false, reason: 'already-detached', state };
  if (state.door.phase === 'open' || state.door.phase === 'opening') {
    return { accepted: false, reason: 'invalid-blocker', state };
  }
  const currentAngleQ = doorAngleAt(state.door, request.tick);
  const distanceQ = SHED_ANGLE_Q - currentAngleQ;
  if (distanceQ <= 0) return { accepted: false, reason: 'invalid-blocker', state };
  const duration = Math.max(1, Math.round(SHED_DOOR_TRAVEL_TICKS * distanceQ / SHED_ANGLE_Q));
  const commandSequence = state.door.commandSequence + 1;
  const door: ShedDoorState = Object.freeze({
    ...state.door,
    commandId: `${state.placementId}-door-contact-${commandSequence}`,
    commandSequence,
    angleQ: currentAngleQ,
    motionOriginAngleQ: currentAngleQ,
    desiredAngleQ: SHED_ANGLE_Q,
    direction: 'opening',
    phase: 'opening',
    startedAtTick: request.tick,
    completesAtTick: request.tick + duration,
    blockedAtTick: null,
    blockedBy: null,
    resumePolicy: 'resume-when-clear',
  });
  return { accepted: true, reason: 'accepted', state: withRevision(state, { door }) };
}

export function blockShedDoor(
  state: ShedState,
  request: Readonly<{
    isHost: boolean;
    expectedRevision: number;
    tick: number;
    blocker: Readonly<{ kind: ShedDoorBlockerKind; entityId: string }>;
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (!finiteInteger(request.tick) || !validId(request.blocker.entityId)) return { accepted: false, reason: 'invalid-blocker', state };
  if (state.door.direction === 'stationary' || state.door.phase === 'blocked') return { accepted: false, reason: 'invalid-blocker', state };
  const angleQ = doorAngleAt(state.door, request.tick);
  const door = Object.freeze({
    ...state.door,
    angleQ,
    motionOriginAngleQ: angleQ,
    phase: 'blocked' as const,
    blockedAtTick: request.tick,
    blockedBy: Object.freeze({ ...request.blocker }),
    resumePolicy: request.blocker.kind === 'bullet'
      ? 'remain-blocked-until-new-command' as const
      : 'resume-when-clear' as const,
  });
  return { accepted: true, reason: 'accepted', state: withRevision(state, { door }) };
}

export function resumeShedDoorWhenClear(
  state: ShedState,
  request: Readonly<{ isHost: boolean; expectedRevision: number; tick: number }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (state.door.phase !== 'blocked'
    || state.door.resumePolicy !== 'resume-when-clear'
    || !finiteInteger(request.tick)) return { accepted: false, reason: 'invalid-blocker', state };
  const distanceQ = Math.abs(state.door.desiredAngleQ - state.door.angleQ);
  const duration = Math.max(1, Math.round(SHED_DOOR_TRAVEL_TICKS * distanceQ / SHED_ANGLE_Q));
  const opening = state.door.desiredAngleQ === SHED_ANGLE_Q;
  const door: ShedDoorState = Object.freeze({
    ...state.door,
    motionOriginAngleQ: state.door.angleQ,
    direction: opening ? 'opening' : 'closing',
    phase: opening ? 'opening' : 'closing',
    startedAtTick: request.tick,
    completesAtTick: request.tick + duration,
    blockedAtTick: null,
    blockedBy: null,
  });
  return { accepted: true, reason: 'accepted', state: withRevision(state, { door }) };
}

export type SheetImpactRequest = Readonly<{
  isHost: boolean;
  matchEpoch: number;
  expectedRevision: number;
  surfaceId: string;
  uQ: number;
  vQ: number;
  radiusUQ: number;
  radiusVQ: number;
  damageQ: number;
  penetrationEnergyQ: number;
}>;

function validPanelCoordinate(value: number): boolean {
  return finiteInteger(value, -SHED_PANEL_COORD_Q, SHED_PANEL_COORD_Q);
}

function replaceSurface(
  state: ShedState,
  surfaceId: string,
  update: (surface: DamageableSheetSurfaceState) => DamageableSheetSurfaceState,
): readonly DamageableSheetSurfaceState[] {
  return Object.freeze(state.surfaces.map((surface) => surface.surfaceId === surfaceId ? update(surface) : surface));
}

function cornerSign(value: number): -1 | 1 {
  return value < 0 ? -1 : 1;
}

function markOccupiesCorner(
  mark: Readonly<{ uQ: number; vQ: number }>,
  uSign: -1 | 1,
  vSign: -1 | 1,
): boolean {
  return Math.abs(mark.uQ) >= SHED_CORNER_ZONE_Q
    && Math.abs(mark.vQ) >= SHED_CORNER_ZONE_Q
    && cornerSign(mark.uQ) === uSign
    && cornerSign(mark.vQ) === vSign;
}

function markInsideDamageRegion(
  mark: Readonly<{ uQ: number; vQ: number }>,
  centre: Readonly<{ uQ: number; vQ: number }>,
  radiusQ = SHED_DAMAGE_REGION_RADIUS_Q,
): boolean {
  const du = mark.uQ - centre.uQ;
  const dv = mark.vQ - centre.vQ;
  return du * du + dv * dv <= radiusQ * radiusQ;
}

/**
 * Canonical bounded regional damage query. It derives exclusively from the
 * persistent aperture/dent state, so clients cannot invent a separate visual
 * degradation field and late join reconstructs the same result.
 */
export function shedRegionalDamageAt(
  surface: DamageableSheetSurfaceState,
  uQ: number,
  vQ: number,
  radiusQ = SHED_DAMAGE_REGION_RADIUS_Q,
): ShedRegionalDamage {
  if (!validPanelCoordinate(uQ) || !validPanelCoordinate(vQ)
    || !finiteInteger(radiusQ, 1, SHED_PANEL_COORD_Q)) {
    throw new TypeError('Invalid shed regional-damage query');
  }
  const centre = { uQ, vQ };
  const apertures = surface.apertures.filter((mark) => markInsideDamageRegion(mark, centre, radiusQ));
  const dents = surface.dents.filter((mark) => markInsideDamageRegion(mark, centre, radiusQ));
  return Object.freeze({
    apertureCount: apertures.length,
    dentCount: dents.length,
    markCount: apertures.length + dents.length,
    maximumDentDepthQ: Math.max(0, ...dents.map((dent) => dent.depthQ)),
  });
}

function cornerWeakeningTriggersCollapse(
  definition: DestructibleShedDefinition,
  surface: DamageableSheetSurfaceState,
  impact: Pick<SheetImpactRequest, 'uQ' | 'vQ'>,
): boolean {
  if (surface.attachedChunkId === null
    || Math.abs(impact.uQ) < SHED_CORNER_ZONE_Q
    || Math.abs(impact.vQ) < SHED_CORNER_ZONE_Q
    || surface.healthQ < definition.thresholds.detachDamageQ) return false;
  const uSign = cornerSign(impact.uQ);
  const vSign = cornerSign(impact.vQ);
  const localMarks = surface.apertures.filter((mark) => (
    markOccupiesCorner(mark, uSign, vSign) && markInsideDamageRegion(mark, impact)
  )).length + surface.dents.filter((mark) => (
    markOccupiesCorner(mark, uSign, vSign) && markInsideDamageRegion(mark, impact)
  )).length;
  return localMarks >= SHED_CORNER_COLLAPSE_MARKS;
}

function detachSurfaceUpdate(
  definition: DestructibleShedDefinition,
  state: ShedState,
  surfaces: readonly DamageableSheetSurfaceState[],
  surfaceId: string,
  healthQ: number,
): Readonly<Pick<ShedState, 'surfaces' | 'detachedChunkIds' | 'majorDebris'>> | null {
  const surface = surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!surface || surface.stage === 'detached' || surface.attachedChunkId === null
    || state.detachedChunkIds.length >= definition.caps.majorChunks) return null;
  const surfaceDefinition = definition.surfaces.find((candidate) => candidate.id === surfaceId);
  if (!surfaceDefinition) return null;
  const chunkId = surface.attachedChunkId;
  // Owner 2026-08-30 ("the shed is buggy ... its physics to destruction and
  // push need some help"): a blasted panel used to be born at rest, so it
  // dropped straight down as if it had been placed there rather than shot off.
  // It now leaves the frame along its own outward normal with a downward bias,
  // rolling about its long axis. Everything derives from the chunk id through
  // the same FNV noise the blast throws use, so the replicated host state stays
  // deterministic and a guest reconstructs the identical body.
  const noise = chunkNoise(chunkId);
  const normal = shedSurfaceNormal(surfaceDefinition.frame);
  const speed = SHED_DEBRIS_DETACH_MIN_SPEED + noise(0) * SHED_DEBRIS_DETACH_SPEED_SPREAD;
  const spin = (noise(16) * 2 - 1) * SHED_DEBRIS_DETACH_SPIN;
  const uAxis = surfaceDefinition.frame.uAxis;
  return Object.freeze({
    surfaces: Object.freeze(surfaces.map((candidate) => candidate.surfaceId === surfaceId
      ? Object.freeze({ ...candidate, healthQ, stage: 'detached' as const, attachedChunkId: null })
      : candidate)),
    detachedChunkIds: Object.freeze([...state.detachedChunkIds, chunkId]),
    majorDebris: Object.freeze([...state.majorDebris, Object.freeze({
      chunkId,
      poseQ: Object.freeze({
        ...IDENTITY_POSE,
        position: Object.freeze({
          xQ: Math.round(surfaceDefinition.frame.centre.x * 1_000),
          yQ: Math.round(surfaceDefinition.frame.centre.y * 1_000),
          zQ: Math.round(surfaceDefinition.frame.centre.z * 1_000),
        }),
        rotation: frameRotationQ(surfaceDefinition.frame),
      }),
      velocityQ: quantizedVelocity({
        x: normal.x * speed,
        y: normal.y * speed - SHED_DEBRIS_DETACH_SLUMP,
        z: normal.z * speed,
      }),
      angularVelocityQ: quantizedVelocity({
        x: uAxis.x * spin,
        y: uAxis.y * spin,
        z: uAxis.z * spin,
      }, SHED_DEBRIS_MAX_ANGULAR),
      sleeping: false,
      flat: false,
    })]),
  });
}

export function applyShedSheetImpact(
  definition: DestructibleShedDefinition,
  state: ShedState,
  request: SheetImpactRequest,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.matchEpoch !== state.matchEpoch) return { accepted: false, reason: 'stale-epoch', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  const surface = state.surfaces.find((candidate) => candidate.surfaceId === request.surfaceId);
  if (!surface) return { accepted: false, reason: 'unknown-surface', state };
  if (surface.stage === 'detached') return { accepted: false, reason: 'already-detached', state };
  if (!validPanelCoordinate(request.uQ) || !validPanelCoordinate(request.vQ)
    || !finiteInteger(request.radiusUQ, 1, SHED_PANEL_COORD_Q / 2)
    || !finiteInteger(request.radiusVQ, 1, SHED_PANEL_COORD_Q / 2)
    || !finiteInteger(request.damageQ, 0, 1_000_000)
    || !finiteInteger(request.penetrationEnergyQ, 0, 1_000_000)) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const apertureCount = state.surfaces.reduce((sum, candidate) => sum + candidate.apertures.length, 0);
  const dentCount = state.surfaces.reduce((sum, candidate) => sum + candidate.dents.length, 0);
  const perforates = request.penetrationEnergyQ >= definition.thresholds.perforateEnergyQ;
  const dents = request.damageQ >= definition.thresholds.dentDamageQ;
  if (perforates && apertureCount >= definition.caps.apertures) return { accepted: false, reason: 'aperture-cap', state };
  if (!perforates && dents && dentCount >= definition.caps.dents) return { accepted: false, reason: 'dent-cap', state };
  const healthQ = Math.min(1_000_000, surface.healthQ + request.damageQ);
  let nextApertureId = state.nextApertureId;
  let nextDentId = state.nextDentId;
  const apertures = perforates
    ? Object.freeze([...surface.apertures, Object.freeze({
      id: nextApertureId++,
      surfaceId: surface.surfaceId,
      uQ: request.uQ,
      vQ: request.vQ,
      radiusUQ: request.radiusUQ,
      radiusVQ: request.radiusVQ,
    })])
    : surface.apertures;
  const dentList = !perforates && dents
    ? Object.freeze([...surface.dents, Object.freeze({
      id: nextDentId++,
      surfaceId: surface.surfaceId,
      uQ: request.uQ,
      vQ: request.vQ,
      radiusQ: Math.max(request.radiusUQ, request.radiusVQ),
      depthQ: Math.min(2_500, Math.max(1, Math.round(request.damageQ / 4))),
    })])
    : surface.dents;
  const stage = perforates || apertures.length > 0 ? 'perforated' : dentList.length > 0 ? 'dented' : 'intact';
  const surfaces = replaceSurface(state, surface.surfaceId, (candidate) => Object.freeze({
    ...candidate,
    healthQ,
    stage,
    apertures,
    dents: dentList,
  }));
  const weakenedSurface = surfaces.find((candidate) => candidate.surfaceId === surface.surfaceId)!;
  const collapse = cornerWeakeningTriggersCollapse(definition, weakenedSurface, request)
    ? detachSurfaceUpdate(definition, state, surfaces, surface.surfaceId, healthQ)
    : null;
  return {
    accepted: true,
    reason: 'accepted',
    state: withRevision(state, {
      surfaces: collapse?.surfaces ?? surfaces,
      nextApertureId,
      nextDentId,
      ...(collapse ? {
        detachedChunkIds: collapse.detachedChunkIds,
        majorDebris: collapse.majorDebris,
      } : {}),
    }),
  };
}

export function applyShedExplosion(
  definition: DestructibleShedDefinition,
  state: ShedState,
  request: Readonly<{
    isHost: boolean;
    matchEpoch: number;
    expectedRevision: number;
    surfaceId: string;
    damageQ: number;
    uQ?: number;
    vQ?: number;
    radiusQ?: number;
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.matchEpoch !== state.matchEpoch) return { accepted: false, reason: 'stale-epoch', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  const surface = state.surfaces.find((candidate) => candidate.surfaceId === request.surfaceId);
  if (!surface) return { accepted: false, reason: 'unknown-surface', state };
  if (surface.stage === 'detached') return { accepted: false, reason: 'already-detached', state };
  const uQ = request.uQ ?? 0;
  const vQ = request.vQ ?? 0;
  const radiusQ = request.radiusQ ?? Math.min(
    SHED_EXPLOSION_DENT_MAX_RADIUS_Q,
    SHED_EXPLOSION_DENT_MIN_RADIUS_Q + Math.round(request.damageQ * 8),
  );
  if (!finiteInteger(request.damageQ, 1, 1_000_000)
    || !validPanelCoordinate(uQ)
    || !validPanelCoordinate(vQ)
    || !finiteInteger(radiusQ, 1, SHED_PANEL_COORD_Q / 2)) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const healthQ = Math.min(1_000_000, surface.healthQ + request.damageQ);
  const globalDentCount = state.surfaces.reduce((sum, candidate) => sum + candidate.dents.length, 0);
  const createsDent = request.damageQ >= definition.thresholds.dentDamageQ
    && globalDentCount < definition.caps.dents;
  let nextDentId = state.nextDentId;
  const dents = createsDent
    ? Object.freeze([...surface.dents, Object.freeze({
      id: nextDentId++,
      surfaceId: surface.surfaceId,
      uQ,
      vQ,
      radiusQ,
      depthQ: Math.min(2_500, Math.max(1, Math.round(request.damageQ * 5))),
    })])
    : surface.dents;
  const stage = surface.stage === 'perforated'
    ? 'perforated' as const
    : dents.length > 0 ? 'dented' as const : surface.stage;
  const surfaces = replaceSurface(state, surface.surfaceId, (candidate) => Object.freeze({
    ...candidate,
    healthQ,
    stage,
    dents,
  }));
  if (healthQ < definition.thresholds.detachDamageQ || surface.attachedChunkId === null) {
    return { accepted: true, reason: 'accepted', state: withRevision(state, { surfaces, nextDentId }) };
  }
  if (state.detachedChunkIds.length >= definition.caps.majorChunks) return { accepted: false, reason: 'chunk-cap', state };
  const collapse = detachSurfaceUpdate(definition, state, surfaces, surface.surfaceId, healthQ);
  if (!collapse) return { accepted: false, reason: 'unknown-surface', state };
  return {
    accepted: true,
    reason: 'accepted',
    state: withRevision(state, { ...collapse, nextDentId }),
  };
}

export type ShedStructuralBlastClass = 'grenade-major-collapse' | 'carpet-bomber-obliteration';

function openedDetachedDoor(door: ShedDoorState): ShedDoorState {
  return Object.freeze({
    ...door,
    angleQ: SHED_ANGLE_Q,
    motionOriginAngleQ: SHED_ANGLE_Q,
    desiredAngleQ: SHED_ANGLE_Q,
    direction: 'stationary',
    phase: 'open',
    blockedAtTick: null,
    blockedBy: null,
  });
}

/**
 * Owner requirement: a blast must knock the shed over by itself. Detached
 * panels get an outward throw from the blast origin plus a pitch so they
 * visibly fly out and settle flat as wreckage instead of standing upright
 * waiting for a player push. All values derive from the chunk id so the
 * replicated host state stays deterministic; `scale` is the only difference
 * between a grenade collapse and a Carpet Bomber obliteration.
 */
function throwDetachedChunks(
  bodies: readonly MajorDebrisState[],
  originLocal: Point3,
  scale: number,
  thrown: (chunkId: string) => boolean,
): readonly MajorDebrisState[] {
  return Object.freeze(bodies.map((body) => {
    if (!thrown(body.chunkId)) return body;
    const noise = chunkNoise(body.chunkId);
    const awayX = body.poseQ.position.xQ / SHED_DEBRIS_VELOCITY_Q - originLocal.x;
    const awayZ = body.poseQ.position.zQ / SHED_DEBRIS_VELOCITY_Q - originLocal.z;
    const away = Math.hypot(awayX, awayZ);
    const outward = away > 0.05 ? 1 / away : 0;
    return Object.freeze({
      ...body,
      velocityQ: quantizedVelocity({
        x: awayX * outward * (3.0 + noise(0) * 1.4) * scale,
        y: (2.2 + noise(8) * 1.8) * scale,
        z: awayZ * outward * (3.0 + noise(16) * 1.4) * scale,
      }),
      angularVelocityQ: quantizedVelocity({
        x: (noise(24) * 2 - 1) * 4.2 * scale,
        y: (noise(32) * 2 - 1) * 1.6 * scale,
        z: (noise(40) * 2 - 1) * 4.2 * scale,
      }, SHED_DEBRIS_MAX_ANGULAR),
      flat: false,
      sleeping: false,
    });
  }));
}

/**
 * One host mutation owns door, supports, panels and debris. A grenade admits a
 * major three-chunk collapse; Carpet Bomber removes the entire shell while the
 * preauthored six-body cap keeps persistent debris bounded.
 */
export function applyShedStructuralBlast(
  definition: DestructibleShedDefinition,
  state: ShedState,
  request: Readonly<{
    isHost: boolean;
    matchEpoch: number;
    expectedRevision: number;
    blastId: string;
    blastClass: ShedStructuralBlastClass;
    originLocal: Point3;
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.matchEpoch !== state.matchEpoch) return { accepted: false, reason: 'stale-epoch', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (!validId(request.blastId) || !['grenade-major-collapse', 'carpet-bomber-obliteration'].includes(request.blastClass)
    || ![request.originLocal.x, request.originLocal.y, request.originLocal.z].every(Number.isFinite)) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const detachable = definition.surfaces
    .filter((surface) => surface.detachableChunkId !== null)
    .filter((surface) => !state.detachedChunkIds.includes(surface.detachableChunkId!))
    .sort((left, right) => {
      const leftDistance = magnitude({
        x: left.frame.centre.x - request.originLocal.x,
        y: left.frame.centre.y - request.originLocal.y,
        z: left.frame.centre.z - request.originLocal.z,
      });
      const rightDistance = magnitude({
        x: right.frame.centre.x - request.originLocal.x,
        y: right.frame.centre.y - request.originLocal.y,
        z: right.frame.centre.z - request.originLocal.z,
      });
      return leftDistance - rightDistance || left.id.localeCompare(right.id);
    });
  const targetCount = request.blastClass === 'carpet-bomber-obliteration'
    ? definition.caps.majorChunks
    : Math.min(3, definition.caps.majorChunks);
  const targets = detachable.slice(0, Math.max(0, targetCount - state.detachedChunkIds.length));
  if (request.blastClass === 'carpet-bomber-obliteration'
    && state.surfaces.every((surface) => surface.stage === 'detached')) {
    return { accepted: false, reason: 'already-detached', state };
  }
  if (targets.length === 0 && request.blastClass !== 'carpet-bomber-obliteration') {
    return { accepted: false, reason: 'already-detached', state };
  }

  // A panel is born with its own detach kick now, so "already moving" can no
  // longer stand in for "not part of this blast". Track the two body sets the
  // throw is allowed to overwrite explicitly: the chunks this call detached,
  // and wreckage that was already lying still when the blast arrived.
  const restingBeforeBlast = new Set(state.majorDebris
    .filter((body) => body.velocityQ.xQ === 0 && body.velocityQ.yQ === 0 && body.velocityQ.zQ === 0)
    .map((body) => body.chunkId));
  const detachedByBlast = new Set<string>();
  let surfaces = state.surfaces;
  let detachedChunkIds = state.detachedChunkIds;
  let majorDebris = state.majorDebris;
  for (const target of targets) {
    const interim = Object.freeze({ ...state, surfaces, detachedChunkIds, majorDebris });
    const detached = detachSurfaceUpdate(definition, interim, surfaces, target.id, 1_000_000);
    if (!detached) continue;
    surfaces = detached.surfaces;
    detachedChunkIds = detached.detachedChunkIds;
    majorDebris = detached.majorDebris;
    if (target.detachableChunkId !== null) detachedByBlast.add(target.detachableChunkId);
  }

  if (request.blastClass === 'carpet-bomber-obliteration') {
    majorDebris = throwDetachedChunks(
      majorDebris,
      request.originLocal,
      1,
      (chunkId) => detachedByBlast.has(chunkId) || restingBeforeBlast.has(chunkId),
    );
    // Every remaining surface (including non-detachable fixed panels) is
    // forced to detached so the intact shell cannot linger beside the
    // thrown wreckage.
    surfaces = Object.freeze(surfaces.map((surface) => surface.stage === 'detached' ? surface : Object.freeze({
      ...surface,
      healthQ: 1_000_000,
      stage: 'detached' as const,
      attachedChunkId: null,
    })));
  } else {
    // Owner 2026-08-30: the grenade collapse detached its three panels and then
    // let them fall at rest, so a frag looked weaker than a single bullet. It
    // throws with the bomber's shape at under half the speed - a shed that
    // buckles outward, not one that is obliterated. Only the chunks this
    // grenade brought down are thrown; wreckage already settled on the ground
    // stays where the physics left it.
    majorDebris = throwDetachedChunks(
      majorDebris,
      request.originLocal,
      SHED_GRENADE_THROW_SCALE,
      (chunkId) => detachedByBlast.has(chunkId),
    );
    // Fixed frame/support pieces share the same lifecycle revision and retain
    // visible damage without creating unbounded arbitrary rigid bodies.
    surfaces = Object.freeze(surfaces.map((surface) => surface.stage === 'intact' ? Object.freeze({
      ...surface,
      healthQ: Math.max(surface.healthQ, definition.thresholds.detachDamageQ),
    }) : surface));
  }
  const doorDetached = surfaces.find((surface) => surface.surfaceId === state.door.surfaceId)?.stage === 'detached';
  return {
    accepted: true,
    reason: 'accepted',
    state: withRevision(state, {
      surfaces,
      detachedChunkIds,
      majorDebris,
      ...(doorDetached ? { door: openedDetachedDoor(state.door) } : {}),
    }),
  };
}

export function impulseMajorShedDebris(
  state: ShedState,
  request: Readonly<{
    isHost: boolean;
    expectedRevision: number;
    chunkId: string;
    source: 'player-contact' | 'bullet' | 'explosion';
    impulseQ: QuantizedVector;
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  const debris = state.majorDebris.find((candidate) => candidate.chunkId === request.chunkId);
  if (!debris) return { accepted: false, reason: 'unknown-surface', state };
  if (request.source === 'player-contact' && debris.flat) return { accepted: false, reason: 'flat-contact-rejected', state };
  const components = [request.impulseQ.xQ, request.impulseQ.yQ, request.impulseQ.zQ];
  if (!components.every((value) => finiteInteger(value, -SHED_DEBRIS_IMPULSE_MAX_Q, SHED_DEBRIS_IMPULSE_MAX_Q))) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  // Owner 2026-08-30 ("push need some help"): this used to REPLACE the
  // velocity, so a second shove - or a shot landing while the panel was already
  // sliding - cancelled the first instead of adding to it. Accumulate into the
  // same bound the request is validated against. The spin is derived from the
  // impulse rather than hashed: a push acts about the axis perpendicular to it
  // and to local up (placements are yaw-only, so local Y is world up), which is
  // what topples a panel instead of skating it flat across the ground.
  const spinQ: QuantizedVector = Object.freeze({
    xQ: roundQ(request.impulseQ.zQ * SHED_DEBRIS_IMPULSE_SPIN),
    yQ: 0,
    zQ: roundQ(-request.impulseQ.xQ * SHED_DEBRIS_IMPULSE_SPIN),
  });
  const majorDebris = Object.freeze(state.majorDebris.map((candidate) => candidate.chunkId === request.chunkId
    ? Object.freeze({
      ...candidate,
      sleeping: false,
      velocityQ: accumulateVelocityQ(candidate.velocityQ, request.impulseQ, SHED_DEBRIS_IMPULSE_MAX_Q),
      angularVelocityQ: accumulateVelocityQ(
        candidate.angularVelocityQ,
        spinQ,
        SHED_DEBRIS_MAX_ANGULAR * SHED_DEBRIS_VELOCITY_Q,
      ),
    })
    : candidate));
  return { accepted: true, reason: 'accepted', state: withRevision(state, { majorDebris }) };
}

export function synchronizeMajorShedDebris(
  state: ShedState,
  request: Readonly<{
    isHost: boolean;
    expectedRevision: number;
    bodies: readonly MajorDebrisState[];
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (request.bodies.length > SHED_MAX_MAJOR_CHUNKS
    || !request.bodies.every(isMajorDebrisState)
    || !unique(request.bodies.map((body) => body.chunkId))
    || request.bodies.some((body) => !state.detachedChunkIds.includes(body.chunkId))
    || request.bodies.length !== state.majorDebris.length
    || state.majorDebris.some((body) => !request.bodies.some((candidate) => candidate.chunkId === body.chunkId))) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const majorDebris = Object.freeze([...request.bodies].sort((left, right) => left.chunkId.localeCompare(right.chunkId)));
  if (canonicalSha256(majorDebris) === canonicalSha256([...state.majorDebris].sort((left, right) => left.chunkId.localeCompare(right.chunkId)))) {
    return { accepted: true, reason: 'accepted', state };
  }
  return { accepted: true, reason: 'accepted', state: withRevision(state, { majorDebris }) };
}

export function apertureContainsPanelPoint(aperture: BallisticAperture, uQ: number, vQ: number): boolean {
  if (!Number.isFinite(uQ) || !Number.isFinite(vQ)) return false;
  const du = (uQ - aperture.uQ) / aperture.radiusUQ;
  const dv = (vQ - aperture.vQ) / aperture.radiusVQ;
  return du * du + dv * dv <= 1;
}

export function worldPointToPanelCoordinates(
  definition: DestructibleShedDefinition,
  placement: ShedPlacement,
  surfaceId: string,
  point: Point3,
): Readonly<{ uQ: number; vQ: number }> | null {
  const surface = definition.surfaces.find((candidate) => candidate.id === surfaceId);
  if (!surface || placement.definitionId !== definition.id || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  const translatedX = point.x - placement.position.x;
  const translatedZ = point.z - placement.position.z;
  const cosYaw = Math.cos(placement.yaw);
  const sinYaw = Math.sin(placement.yaw);
  const localPoint = {
    x: translatedX * cosYaw - translatedZ * sinYaw,
    y: point.y - placement.position.y,
    z: translatedX * sinYaw + translatedZ * cosYaw,
  };
  const offset = {
    x: localPoint.x - surface.frame.centre.x,
    y: localPoint.y - surface.frame.centre.y,
    z: localPoint.z - surface.frame.centre.z,
  };
  const u = offset.x * surface.frame.uAxis.x + offset.y * surface.frame.uAxis.y + offset.z * surface.frame.uAxis.z;
  const v = offset.x * surface.frame.vAxis.x + offset.y * surface.frame.vAxis.y + offset.z * surface.frame.vAxis.z;
  return Object.freeze({
    uQ: Math.round(u / surface.frame.halfU * SHED_PANEL_COORD_Q),
    vQ: Math.round(v / surface.frame.halfV * SHED_PANEL_COORD_Q),
  });
}

/** Exact query consumed by both the alpha mask and the canonical ballistic trace. */
export function shedApertureContainsWorldPoint(
  definition: DestructibleShedDefinition,
  placement: ShedPlacement,
  state: ShedState,
  surfaceId: string,
  point: Point3,
): boolean {
  const coordinates = worldPointToPanelCoordinates(definition, placement, surfaceId, point);
  if (!coordinates) return false;
  const surface = state.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  return surface?.apertures.some((aperture) => apertureContainsPanelPoint(aperture, coordinates.uQ, coordinates.vQ)) ?? false;
}

export function createWorldCollisionSnapshot(
  arenaId: ShedArenaId,
  staticDefinitionId: string,
  sheds: readonly ShedState[],
  emptyMatchEpoch = 0,
): WorldCollisionSnapshot {
  if (!validId(staticDefinitionId)) throw new TypeError('Invalid static world definition id');
  if (sheds.some((shed) => shed.arenaId !== arenaId)) throw new TypeError('Shed arena mismatch');
  const matchEpoch = sheds[0]?.matchEpoch ?? emptyMatchEpoch;
  if (!finiteInteger(matchEpoch, sheds.length > 0 ? 1 : 0)) throw new TypeError('Invalid world collision epoch');
  if (sheds.some((shed) => shed.matchEpoch !== matchEpoch)) throw new TypeError('Shed epoch mismatch');
  const revision = sheds.reduce((sum, shed) => sum + shed.revision, 0);
  const body = Object.freeze({
    schemaVersion: 1 as const,
    arenaId,
    matchEpoch,
    revision,
    staticDefinitionId,
    consumers: WORLD_COLLISION_CONSUMERS,
    sheds: Object.freeze([...sheds].sort((left, right) => left.placementId.localeCompare(right.placementId))),
  });
  return Object.freeze({ ...body, hashAlgorithm: 'sha256', hash: canonicalSha256(body) });
}

export function resetShedState(state: ShedState, nextMatchEpoch: number, definition: DestructibleShedDefinition, placement: ShedPlacement): ShedState {
  if (!finiteInteger(nextMatchEpoch, state.matchEpoch + 1)) throw new TypeError('Reset epoch must advance');
  return createInitialShedState(definition, placement, nextMatchEpoch);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQuantizedVector(value: unknown): value is QuantizedVector {
  return isRecord(value)
    && exactKeys(value, ['xQ', 'yQ', 'zQ'])
    && [value.xQ, value.yQ, value.zQ].every((component) => finiteInteger(Number(component), -50_000_000, 50_000_000));
}

function isQuantizedPose(value: unknown): value is QuantizedPose {
  return isRecord(value)
    && exactKeys(value, ['position', 'rotation'])
    && isQuantizedVector(value.position)
    && isRecord(value.rotation)
    && exactKeys(value.rotation, ['xQ', 'yQ', 'zQ', 'wQ'])
    && [value.rotation.xQ, value.rotation.yQ, value.rotation.zQ, value.rotation.wQ]
      .every((component) => finiteInteger(Number(component), -SHED_PANEL_COORD_Q, SHED_PANEL_COORD_Q));
}

function isBallisticAperture(value: unknown): value is BallisticAperture {
  return isRecord(value)
    && exactKeys(value, ['id', 'surfaceId', 'uQ', 'vQ', 'radiusUQ', 'radiusVQ'])
    && finiteInteger(Number(value.id), 1)
    && typeof value.surfaceId === 'string'
    && validId(value.surfaceId)
    && validPanelCoordinate(Number(value.uQ))
    && validPanelCoordinate(Number(value.vQ))
    && finiteInteger(Number(value.radiusUQ), 1, SHED_PANEL_COORD_Q / 2)
    && finiteInteger(Number(value.radiusVQ), 1, SHED_PANEL_COORD_Q / 2);
}

function isSheetDent(value: unknown): value is SheetDent {
  return isRecord(value)
    && exactKeys(value, ['id', 'surfaceId', 'uQ', 'vQ', 'radiusQ', 'depthQ'])
    && finiteInteger(Number(value.id), 1)
    && typeof value.surfaceId === 'string'
    && validId(value.surfaceId)
    && validPanelCoordinate(Number(value.uQ))
    && validPanelCoordinate(Number(value.vQ))
    && finiteInteger(Number(value.radiusQ), 1, SHED_PANEL_COORD_Q / 2)
    && finiteInteger(Number(value.depthQ), 1, 2_500);
}

function isSheetSurfaceState(value: unknown): value is DamageableSheetSurfaceState {
  if (!isRecord(value)
    || !exactKeys(value, ['surfaceId', 'role', 'attachedChunkId', 'healthQ', 'stage', 'apertures', 'dents'])
    || typeof value.surfaceId !== 'string'
    || !validId(value.surfaceId)
    || !['wall', 'roof', 'door', 'detached-chunk'].includes(String(value.role))
    || !(value.attachedChunkId === null || (typeof value.attachedChunkId === 'string' && validId(value.attachedChunkId)))
    || !finiteInteger(Number(value.healthQ), 0, 1_000_000)
    || !['intact', 'dented', 'perforated', 'detached'].includes(String(value.stage))
    || !Array.isArray(value.apertures)
    || !Array.isArray(value.dents)
    || !value.apertures.every(isBallisticAperture)
    || !value.dents.every(isSheetDent)) return false;
  return value.apertures.every((aperture) => aperture.surfaceId === value.surfaceId)
    && value.dents.every((dent) => dent.surfaceId === value.surfaceId);
}

function isDoorBlocker(value: unknown): value is NonNullable<ShedDoorState['blockedBy']> {
  return isRecord(value)
    && exactKeys(value, ['kind', 'entityId'])
    && ['player', 'major-debris', 'bullet'].includes(String(value.kind))
    && typeof value.entityId === 'string'
    && validId(value.entityId);
}

function isShedDoorState(value: unknown): value is ShedDoorState {
  if (!(isRecord(value)
    && exactKeys(value, [
      'surfaceId', 'commandId', 'commandSequence', 'angleQ', 'motionOriginAngleQ', 'desiredAngleQ', 'direction', 'phase',
      'startedAtTick', 'completesAtTick', 'blockedAtTick', 'blockedBy', 'resumePolicy',
    ])
    && typeof value.surfaceId === 'string'
    && validId(value.surfaceId)
    && typeof value.commandId === 'string'
    && validId(value.commandId)
    && finiteInteger(Number(value.commandSequence))
    && finiteInteger(Number(value.angleQ), 0, SHED_ANGLE_Q)
    && finiteInteger(Number(value.motionOriginAngleQ), 0, SHED_ANGLE_Q)
    && (value.desiredAngleQ === 0 || value.desiredAngleQ === SHED_ANGLE_Q)
    && ['opening', 'closing', 'stationary'].includes(String(value.direction))
    && ['closed', 'opening', 'open', 'closing', 'blocked'].includes(String(value.phase))
    && finiteInteger(Number(value.startedAtTick))
    && finiteInteger(Number(value.completesAtTick))
    && (value.blockedAtTick === null || finiteInteger(Number(value.blockedAtTick)))
    && (value.blockedBy === null || isDoorBlocker(value.blockedBy))
    && ['remain-blocked-until-new-command', 'resume-when-clear'].includes(String(value.resumePolicy)))) return false;
  const blocked = value.phase === 'blocked';
  if (blocked !== (value.blockedBy !== null && value.blockedAtTick !== null)) return false;
  if (Number(value.completesAtTick) < Number(value.startedAtTick)) return false;
  if (value.phase === 'closed') return value.direction === 'stationary' && value.angleQ === 0 && value.desiredAngleQ === 0;
  if (value.phase === 'open') return value.direction === 'stationary' && value.angleQ === SHED_ANGLE_Q && value.desiredAngleQ === SHED_ANGLE_Q;
  if (value.phase === 'opening') return value.direction === 'opening' && value.desiredAngleQ === SHED_ANGLE_Q;
  if (value.phase === 'closing') return value.direction === 'closing' && value.desiredAngleQ === 0;
  return value.direction !== 'stationary';
}

function isMajorDebrisState(value: unknown): value is MajorDebrisState {
  return isRecord(value)
    && exactKeys(value, ['chunkId', 'poseQ', 'velocityQ', 'angularVelocityQ', 'sleeping', 'flat'])
    && typeof value.chunkId === 'string'
    && validId(value.chunkId)
    && isQuantizedPose(value.poseQ)
    && isQuantizedVector(value.velocityQ)
    && isQuantizedVector(value.angularVelocityQ)
    && typeof value.sleeping === 'boolean'
    && typeof value.flat === 'boolean';
}

function isInteractionSequence(value: unknown): value is ShedState['interactionSequences'][number] {
  return isRecord(value)
    && exactKeys(value, ['actorId', 'sequence'])
    && typeof value.actorId === 'string'
    && validId(value.actorId)
    && finiteInteger(Number(value.sequence), 1);
}

/** Strict network/storage parser: unknown keys and cap overflow fail closed. */
export function isShedState(value: unknown): value is ShedState {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion', 'shedId', 'placementId', 'arenaId', 'matchEpoch', 'revision', 'nextApertureId', 'nextDentId',
    'door', 'surfaces', 'detachedChunkIds', 'majorDebris', 'interactionSequences',
  ])) return false;
  if (value.schemaVersion !== 1 || typeof value.shedId !== 'string' || !validId(value.shedId)
    || typeof value.placementId !== 'string' || !validId(value.placementId)
    || !isArenaId(value.arenaId)
    || !finiteInteger(Number(value.matchEpoch), 1) || !finiteInteger(Number(value.revision))
    || !finiteInteger(Number(value.nextApertureId), 1) || !finiteInteger(Number(value.nextDentId), 1)
    || !Array.isArray(value.surfaces) || !Array.isArray(value.detachedChunkIds)
    || !Array.isArray(value.majorDebris) || !Array.isArray(value.interactionSequences)
    || value.interactionSequences.length > SHED_MAX_INTERACTION_ACTORS
    || value.detachedChunkIds.length > SHED_MAX_MAJOR_CHUNKS || value.majorDebris.length > SHED_MAX_MAJOR_CHUNKS) return false;
  if (!isShedDoorState(value.door)
    || !value.surfaces.every(isSheetSurfaceState)
    || !value.detachedChunkIds.every((chunkId) => typeof chunkId === 'string' && validId(chunkId))
    || !value.majorDebris.every(isMajorDebrisState)
    || !value.interactionSequences.every(isInteractionSequence)) return false;
  const surfaceIds = value.surfaces.map((surface) => surface.surfaceId);
  const detachedChunkIds = value.detachedChunkIds as string[];
  const debrisIds = value.majorDebris.map((debris) => debris.chunkId);
  const actorIds = value.interactionSequences.map((entry) => entry.actorId);
  if (!unique(surfaceIds) || !unique(detachedChunkIds) || !unique(debrisIds) || !unique(actorIds)
    || !surfaceIds.includes(value.door.surfaceId)
    || debrisIds.some((chunkId) => !detachedChunkIds.includes(chunkId))) return false;
  let apertures = 0;
  let dents = 0;
  const apertureIds: number[] = [];
  const dentIds: number[] = [];
  for (const entry of value.surfaces) {
    apertures += entry.apertures.length;
    dents += entry.dents.length;
    apertureIds.push(...entry.apertures.map((aperture) => aperture.id));
    dentIds.push(...entry.dents.map((dent) => dent.id));
    if (entry.stage === 'intact' && (entry.apertures.length > 0 || entry.dents.length > 0)) return false;
    if (entry.stage === 'dented' && (entry.dents.length === 0 || entry.apertures.length > 0)) return false;
    if (entry.stage === 'perforated' && entry.apertures.length === 0) return false;
    if (entry.stage === 'detached' && entry.attachedChunkId !== null) return false;
  }
  return apertures <= SHED_MAX_APERTURES
    && dents <= SHED_MAX_DENTS
    && unique(apertureIds.map(String))
    && unique(dentIds.map(String))
    && Number(value.nextApertureId) > Math.max(0, ...apertureIds)
    && Number(value.nextDentId) > Math.max(0, ...dentIds);
}
