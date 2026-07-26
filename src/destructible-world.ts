import { canonicalSha256 } from './canonical-state';
import type { Point3 } from './collision';

export const SHED_MAX_APERTURES = 32;
export const SHED_MAX_DENTS = 24;
export const SHED_MAX_MAJOR_CHUNKS = 6;
export const ARENA_MAX_AWAKE_SHED_BODIES = 18;
export const SHED_DOOR_TRAVEL_TICKS = 60;
export const SHED_ANGLE_Q = 10_000;
export const SHED_PANEL_COORD_Q = 10_000;
export const SHED_MAX_INTERACTION_ACTORS = 12;

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
export type ShedArenaId = 'atomic-acres' | 'skyline-terminal' | 'rustworks-1v1' | 'gun-range';
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
    | 'flat-contact-rejected';
  state: ShedState;
}>;

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
    if (surface.detachableChunkId !== null && !definition.preauthoredChunkIds.includes(surface.detachableChunkId)) {
      errors.push(`${surface.id}: unknown detachable chunk`);
    }
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
  });
  return { accepted: true, reason: 'accepted', state: withRevision(state, { door }) };
}

export function resumeShedDoorWhenClear(
  state: ShedState,
  request: Readonly<{ isHost: boolean; expectedRevision: number; tick: number }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (state.door.phase !== 'blocked' || !finiteInteger(request.tick)) return { accepted: false, reason: 'invalid-blocker', state };
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
  return {
    accepted: true,
    reason: 'accepted',
    state: withRevision(state, { surfaces, nextApertureId, nextDentId }),
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
  }>,
): ShedMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.matchEpoch !== state.matchEpoch) return { accepted: false, reason: 'stale-epoch', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  const surface = state.surfaces.find((candidate) => candidate.surfaceId === request.surfaceId);
  if (!surface) return { accepted: false, reason: 'unknown-surface', state };
  if (!finiteInteger(request.damageQ, 1, 1_000_000)) return { accepted: false, reason: 'invalid-impact', state };
  if (surface.stage === 'detached') return { accepted: false, reason: 'already-detached', state };
  const healthQ = Math.min(1_000_000, surface.healthQ + request.damageQ);
  if (healthQ < definition.thresholds.detachDamageQ || surface.attachedChunkId === null) {
    const surfaces = replaceSurface(state, surface.surfaceId, (candidate) => Object.freeze({ ...candidate, healthQ }));
    return { accepted: true, reason: 'accepted', state: withRevision(state, { surfaces }) };
  }
  if (state.detachedChunkIds.length >= definition.caps.majorChunks) return { accepted: false, reason: 'chunk-cap', state };
  const chunkId = surface.attachedChunkId;
  const surfaceDefinition = definition.surfaces.find((candidate) => candidate.id === surface.surfaceId);
  if (!surfaceDefinition) return { accepted: false, reason: 'unknown-surface', state };
  const detachedChunkIds = Object.freeze([...state.detachedChunkIds, chunkId]);
  const surfaces = replaceSurface(state, surface.surfaceId, (candidate) => Object.freeze({
    ...candidate,
    healthQ,
    stage: 'detached',
    attachedChunkId: null,
  }));
  const majorDebris = Object.freeze([...state.majorDebris, Object.freeze({
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
    velocityQ: ZERO_VECTOR,
    angularVelocityQ: ZERO_VECTOR,
    sleeping: false,
    flat: false,
  })]);
  return {
    accepted: true,
    reason: 'accepted',
    state: withRevision(state, { surfaces, detachedChunkIds, majorDebris }),
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
  if (!components.every((value) => finiteInteger(value, -50_000, 50_000))) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const majorDebris = Object.freeze(state.majorDebris.map((candidate) => candidate.chunkId === request.chunkId
    ? Object.freeze({ ...candidate, sleeping: false, velocityQ: Object.freeze({ ...request.impulseQ }) })
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
    || !['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'].includes(String(value.arenaId))
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
