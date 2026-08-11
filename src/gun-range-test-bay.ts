import type { Box2, Point3 } from './collision';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import { movementProfile } from './gameplay';
import { PASS65_KILLSTREAK_CATALOG, type Pass65KillstreakId } from './killstreak-catalog';
import { WEAPON_IDS, type WeaponId } from './protocol';
import type { DynamicWorldCollider } from './physics';

export const GUN_RANGE_TEST_BAY_DOOR_ID = 'gun-range:test-bay-secure-door';
export const GUN_RANGE_TEST_BAY_DOOR_OPEN_MS = 720;
export const GUN_RANGE_TEST_BAY_DOOR_TRIGGER_RADIUS_M = 4.2;
export const GUN_RANGE_TEST_BAY_DOOR_RELEASE_RADIUS_M = 6.4;
export const GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M = 2.8;
export const GUN_RANGE_TEST_BAY_DOOR_BALLISTIC_ID = `${GUN_RANGE_TEST_BAY_DOOR_ID}:ballistic`;

export type GunRangeTestBayStructureMaterial = 'wall' | 'floor' | 'ceiling' | 'door-frame';

export type GunRangeTestBayStructureDefinition = Readonly<{
  id: string;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  material: GunRangeTestBayStructureMaterial;
  ballisticMaterial: BallisticMaterialId;
  assemblyRole?: 'jamb' | 'header' | 'bulkhead';
}>;

const structureDefinition = (
  definition: GunRangeTestBayStructureDefinition,
): GunRangeTestBayStructureDefinition => Object.freeze(definition);

/**
 * One source of truth for the annex's visible mass, player/Rapier collision,
 * and ballistic surfaces. Every entry is core geometry in every presentation
 * profile; decorative skins and lights may vary without changing this list.
 */
export const GUN_RANGE_TEST_BAY_STRUCTURE = Object.freeze([
  structureDefinition({ id: 'gun-range-test-bay-corridor-floor', position: [36, -0.1, 12], size: [31.5, 0.2, 8.5], material: 'floor', ballisticMaterial: 'concrete' }),
  structureDefinition({ id: 'gun-range-test-bay-corridor-north-wall', position: [36, 2.6, 7.75], size: [31.5, 5.2, 0.5], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-corridor-south-wall', position: [36, 2.6, 16.25], size: [31.5, 5.2, 0.5], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-corridor-ceiling', position: [36, 5.15, 12], size: [31.5, 0.35, 9], material: 'ceiling', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-floor', position: [75.75, -0.1, 6], size: [48.5, 0.2, 64], material: 'floor', ballisticMaterial: 'concrete' }),
  structureDefinition({ id: 'gun-range-test-bay-ceiling', position: [75.75, 25.35, 6], size: [48.5, 0.35, 64], material: 'ceiling', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-east-wall', position: [100.25, 12.7625, 6], size: [0.5, 25.525, 64.5], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-north-wall', position: [75.75, 12.7625, -26.25], size: [49, 25.525, 0.5], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-south-wall', position: [75.75, 12.7625, 38.25], size: [49, 25.525, 0.5], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-west-wall-north', position: [51.75, 12.7625, -9.1], size: [0.5, 25.525, 33.8], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-west-wall-south', position: [51.75, 12.7625, 27.1], size: [0.5, 25.525, 21.8], material: 'wall', ballisticMaterial: 'structural-metal' }),
  structureDefinition({ id: 'gun-range-test-bay-door-jamb-north', position: [51.75, 3.25, 8], size: [0.5, 6.5, 0.4], material: 'door-frame', ballisticMaterial: 'structural-metal', assemblyRole: 'jamb' }),
  structureDefinition({ id: 'gun-range-test-bay-door-jamb-south', position: [51.75, 3.25, 16], size: [0.5, 6.5, 0.4], material: 'door-frame', ballisticMaterial: 'structural-metal', assemblyRole: 'jamb' }),
  structureDefinition({ id: 'gun-range-test-bay-door-frame-top', position: [51.75, 7.45, 12], size: [0.5, 1.9, 7.6], material: 'door-frame', ballisticMaterial: 'structural-metal', assemblyRole: 'header' }),
  structureDefinition({ id: 'gun-range-test-bay-door-bulkhead', position: [51.75, 16.9625, 12], size: [0.5, 17.125, 7.6], material: 'wall', ballisticMaterial: 'structural-metal', assemblyRole: 'bulkhead' }),
]);

export function gunRangeTestBayStructureBounds(
  definition: GunRangeTestBayStructureDefinition,
): Readonly<Box2> {
  return Object.freeze({
    minX: definition.position[0] - definition.size[0] / 2,
    maxX: definition.position[0] + definition.size[0] / 2,
    minY: definition.position[1] - definition.size[1] / 2,
    maxY: definition.position[1] + definition.size[1] / 2,
    minZ: definition.position[2] - definition.size[2] / 2,
    maxZ: definition.position[2] + definition.size[2] / 2,
  });
}

const WALK_SPEED_MPS = movementProfile({
  crouched: false,
  prone: false,
  ads: false,
  sprinting: false,
  grounded: true,
}).maxSpeed;

export type GunRangeTestBayDummyDefinition = Readonly<{
  id: string;
  start: Readonly<Point3>;
  end: Readonly<Point3>;
  speedMps: number;
  phase: number;
  armed: false;
}>;

export type GunRangeTestBayStation<Id extends string> = Readonly<{
  id: Id;
  position: Readonly<Point3>;
  runtimeStatus: 'active-training-station';
}>;

export type GunRangeTestBayStationProximity<Id extends string> = Readonly<{
  station: GunRangeTestBayStation<Id>;
  distanceM: number;
}>;

const corridorEntry = Object.freeze({ x: 20.5, y: 1.7, z: 12 });
const doorApproach = Object.freeze({ x: 51.25, y: 1.7, z: 12 });
const corridorLengthM = doorApproach.x - corridorEntry.x;

const supportStations = Object.freeze(PASS65_KILLSTREAK_CATALOG.definitions.map((definition, index) => Object.freeze({
  id: definition.id,
  position: Object.freeze({
    x: 92 - Math.floor(index / 6) * 8,
    y: 0.08,
    z: -19 + (index % 6) * 9.6,
  }),
  runtimeStatus: 'active-training-station' as const,
}))) as readonly GunRangeTestBayStation<Pass65KillstreakId>[];

const weaponStations = Object.freeze(WEAPON_IDS.map((weaponId, index) => Object.freeze({
  id: weaponId,
  position: Object.freeze({
    x: 59 + (index % 6) * 6.2,
    y: 0.08,
    z: 31 - Math.floor(index / 6) * 4.2,
  }),
  runtimeStatus: 'active-training-station' as const,
}))) as readonly GunRangeTestBayStation<WeaponId>[];

export const GUN_RANGE_TEST_BAY_CONTRACT = Object.freeze({
  schemaVersion: 1,
  corridor: Object.freeze({
    entry: corridorEntry,
    doorApproach,
    lengthM: corridorLengthM,
    canonicalWalkSpeedMps: WALK_SPEED_MPS,
    nominalTraversalSeconds: corridorLengthM / WALK_SPEED_MPS,
    clearWidthM: 7.5,
    clearHeightM: 4.8,
  }),
  bay: Object.freeze({
    // Interior faces of the four authored walls and the ceiling. This volume
    // is also the match-timer pause authority, so it must not extend into the
    // corridor or beyond the visible room.
    bounds: Object.freeze({ minX: 52, maxX: 100, minY: 0, maxY: 25.175, minZ: -26, maxZ: 38 }),
    clearFloorAreaM2: (100 - 52) * (38 - -26),
  }),
  door: Object.freeze({
    id: GUN_RANGE_TEST_BAY_DOOR_ID,
    trigger: Object.freeze({ x: 48.75, y: 1.7, z: 12 }),
    closedBounds: Object.freeze({ minX: 51.15, maxX: 51.85, minY: 0, maxY: 6.5, minZ: 8.2, maxZ: 15.8 }),
    travelM: 7,
    openDurationMs: GUN_RANGE_TEST_BAY_DOOR_OPEN_MS,
    thumpIntent: 'secure-door-opening-thump' as const,
  }),
  dummies: Object.freeze([
    Object.freeze({ id: 'test-dummy-alpha', start: Object.freeze({ x: 63, y: 0, z: -16 }), end: Object.freeze({ x: 77, y: 0, z: -16 }), speedMps: 0.72, phase: 0, armed: false as const }),
    Object.freeze({ id: 'test-dummy-bravo', start: Object.freeze({ x: 62, y: 0, z: -6 }), end: Object.freeze({ x: 78, y: 0, z: -6 }), speedMps: 0.68, phase: 0.33, armed: false as const }),
    Object.freeze({ id: 'test-dummy-charlie', start: Object.freeze({ x: 63, y: 0, z: 4 }), end: Object.freeze({ x: 77, y: 0, z: 4 }), speedMps: 0.76, phase: 0.66, armed: false as const }),
    Object.freeze({ id: 'test-dummy-delta', start: Object.freeze({ x: 62, y: 0, z: 14 }), end: Object.freeze({ x: 78, y: 0, z: 14 }), speedMps: 0.7, phase: 0.91, armed: false as const }),
  ] as const satisfies readonly GunRangeTestBayDummyDefinition[]),
  supportStations,
  weaponStations,
  provenance: Object.freeze({
    policy: 'repository-procedural-original' as const,
    authority: 'src/gun-range-test-bay.ts+src/additional-maps.ts',
    assetDependencies: Object.freeze([] as string[]),
  }),
});

export type GunRangeTestBayDoorPhase = 'closed' | 'opening' | 'open' | 'closing';

export type GunRangeTestBayDoorState = Readonly<{
  phase: GunRangeTestBayDoorPhase;
  openness: number;
  updatedAtMs: number;
  thumpSequence: number;
}>;

export type GunRangeTestBayDoorStep = Readonly<{
  state: GunRangeTestBayDoorState;
  audioIntent: 'secure-door-opening-thump' | null;
  collisionChanged: boolean;
}>;

const GUN_RANGE_TEST_BAY_DOOR_STATE_KEYS = Object.freeze([
  'phase', 'openness', 'updatedAtMs', 'thumpSequence',
] as const);

export type GunRangeTestBayFrozenTimer = Readonly<{
  phaseStartedAt: number;
  endsAt: number;
}>;

/** Shift the active timer window so no match time elapses while the player is in the test bay. */
export function gunRangeTestBayFrozenTimer(
  timer: GunRangeTestBayFrozenTimer,
  elapsedInsideMs: number,
): GunRangeTestBayFrozenTimer {
  if (![timer.phaseStartedAt, timer.endsAt, elapsedInsideMs].every(Number.isFinite)
    || timer.endsAt < timer.phaseStartedAt || elapsedInsideMs < 0) {
    throw new TypeError('test-bay timer requires a finite ordered window and non-negative elapsed time');
  }
  return Object.freeze({
    phaseStartedAt: timer.phaseStartedAt + elapsedInsideMs,
    endsAt: timer.endsAt + elapsedInsideMs,
  });
}

function distanceToDoorTrigger(position: Readonly<Point3>): number {
  const trigger = GUN_RANGE_TEST_BAY_CONTRACT.door.trigger;
  return Math.hypot(position.x - trigger.x, position.y - trigger.y, position.z - trigger.z);
}

export function isGunRangeTestBayDoorState(value: unknown): value is GunRangeTestBayDoorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return Object.keys(state).length === GUN_RANGE_TEST_BAY_DOOR_STATE_KEYS.length
    && GUN_RANGE_TEST_BAY_DOOR_STATE_KEYS.every((key) => Object.hasOwn(state, key))
    && (state.phase === 'closed' || state.phase === 'opening' || state.phase === 'open' || state.phase === 'closing')
    && Number.isFinite(state.openness) && Number(state.openness) >= 0 && Number(state.openness) <= 1
    && Number.isFinite(state.updatedAtMs) && Number(state.updatedAtMs) >= 0
    && Number.isSafeInteger(state.thumpSequence) && Number(state.thumpSequence) >= 0
    && Number(state.thumpSequence) <= 1_000_000_000
    && (state.phase !== 'closed' || state.openness === 0)
    && (state.phase !== 'open' || state.openness === 1);
}

export function createGunRangeTestBayDoorState(nowMs = 0): GunRangeTestBayDoorState {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new TypeError('door time must be finite and non-negative');
  return Object.freeze({ phase: 'closed', openness: 0, updatedAtMs: nowMs, thumpSequence: 0 });
}

export function advanceGunRangeTestBayDoor(
  state: GunRangeTestBayDoorState,
  nowMs: number,
  observerPosition: Readonly<Point3>,
): GunRangeTestBayDoorStep {
  return advanceGunRangeTestBayDoorForObservers(state, nowMs, [observerPosition]);
}

export function advanceGunRangeTestBayDoorForObservers(
  state: GunRangeTestBayDoorState,
  nowMs: number,
  observerPositions: readonly Readonly<Point3>[],
): GunRangeTestBayDoorStep {
  if (!Number.isFinite(nowMs) || nowMs < state.updatedAtMs
    || !isGunRangeTestBayDoorState(state)
    || !Array.isArray(observerPositions)
    || !observerPositions.every((position) => (
      [position.x, position.y, position.z].every(Number.isFinite)
    ))) {
    throw new TypeError('door step requires monotonic finite time and finite observer positions');
  }
  const threshold = state.openness > 0
    ? GUN_RANGE_TEST_BAY_DOOR_RELEASE_RADIUS_M
    : GUN_RANGE_TEST_BAY_DOOR_TRIGGER_RADIUS_M;
  const wantsOpen = observerPositions.some((position) => distanceToDoorTrigger(position) <= threshold);
  const delta = (nowMs - state.updatedAtMs) / GUN_RANGE_TEST_BAY_DOOR_OPEN_MS;
  const openness = Math.min(1, Math.max(0, state.openness + (wantsOpen ? delta : -delta)));
  const phase: GunRangeTestBayDoorPhase = openness <= 0
    ? wantsOpen ? 'opening' : 'closed'
    : openness >= 1
      ? 'open'
      : wantsOpen ? 'opening' : 'closing';
  const openingStarted = wantsOpen && state.phase !== 'opening' && state.phase !== 'open';
  const collisionChanged = Math.abs(openness - state.openness) > Number.EPSILON;
  const next = Object.freeze({
    phase,
    openness,
    updatedAtMs: nowMs,
    thumpSequence: state.thumpSequence + (openingStarted ? 1 : 0),
  });
  return Object.freeze({
    state: next,
    audioIntent: openingStarted ? GUN_RANGE_TEST_BAY_CONTRACT.door.thumpIntent : null,
    collisionChanged,
  });
}

/** Advance a host-authored transition on a replica without admitting any
 * local observer. The phase is the authority decision; only its bounded leaf
 * travel is projected through the host-to-guest monotonic clock mapping. */
export function projectGunRangeTestBayDoorState(
  state: GunRangeTestBayDoorState,
  nowMs: number,
): GunRangeTestBayDoorState {
  if (!isGunRangeTestBayDoorState(state) || !Number.isFinite(nowMs) || nowMs < state.updatedAtMs) {
    throw new TypeError('door projection requires valid state and monotonic mapped time');
  }
  const delta = (nowMs - state.updatedAtMs) / GUN_RANGE_TEST_BAY_DOOR_OPEN_MS;
  const openness = state.phase === 'opening'
    ? Math.min(1, state.openness + delta)
    : state.phase === 'closing'
      ? Math.max(0, state.openness - delta)
      : state.openness;
  return Object.freeze({
    phase: openness <= 0 ? 'closed' : openness >= 1 ? 'open' : state.phase,
    openness,
    updatedAtMs: nowMs,
    thumpSequence: state.thumpSequence,
  });
}

export function gunRangeTestBayDoorLeafBounds(state: GunRangeTestBayDoorState): Readonly<Box2> {
  const closed = GUN_RANGE_TEST_BAY_CONTRACT.door.closedBounds;
  const offsetY = GUN_RANGE_TEST_BAY_CONTRACT.door.travelM * state.openness;
  return Object.freeze({
    minX: closed.minX,
    maxX: closed.maxX,
    minY: closed.minY + offsetY,
    maxY: closed.maxY + offsetY,
    minZ: closed.minZ,
    maxZ: closed.maxZ,
  });
}

export function gunRangeTestBayDoorDynamicColliders(
  state: GunRangeTestBayDoorState,
): readonly DynamicWorldCollider[] {
  if (state.openness >= 1) return Object.freeze([]);
  const bounds = gunRangeTestBayDoorLeafBounds(state);
  return Object.freeze([Object.freeze({ id: GUN_RANGE_TEST_BAY_DOOR_ID, bounds })]);
}

/** Hitscan authority for the same moving secure leaf used by Rapier/projectiles. */
export function gunRangeTestBayDoorDynamicBallisticSurfaces(
  state: GunRangeTestBayDoorState,
): readonly BallisticSurface[] {
  if (state.openness >= 1) return Object.freeze([]);
  return Object.freeze([createBallisticSurface(
    GUN_RANGE_TEST_BAY_DOOR_BALLISTIC_ID,
    'gun-range-test-bay-secure-door-leaf',
    gunRangeTestBayDoorLeafBounds(state),
    { impactSurface: 'metal', material: 'structural-metal' },
  )]);
}

function nearestTrainingStation<Id extends string>(
  stations: readonly GunRangeTestBayStation<Id>[],
  position: Readonly<Point3>,
  maximumDistance: number,
): GunRangeTestBayStationProximity<Id> | null {
  if (![position.x, position.y, position.z, maximumDistance].every(Number.isFinite) || maximumDistance < 0) return null;
  let nearest: GunRangeTestBayStationProximity<Id> | null = null;
  for (const station of stations) {
    const distanceM = Math.hypot(
      position.x - station.position.x,
      position.y - station.position.y,
      position.z - station.position.z,
    );
    if (distanceM > maximumDistance || nearest && distanceM >= nearest.distanceM) continue;
    nearest = Object.freeze({ station, distanceM });
  }
  return nearest;
}

export function nearestGunRangeTestBayWeaponStation(
  position: Readonly<Point3>,
  maximumDistance = GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M,
): GunRangeTestBayStationProximity<WeaponId> | null {
  return nearestTrainingStation(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations, position, maximumDistance);
}

export function nearestGunRangeTestBaySupportStation(
  position: Readonly<Point3>,
  maximumDistance = GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M,
): GunRangeTestBayStationProximity<Pass65KillstreakId> | null {
  return nearestTrainingStation(GUN_RANGE_TEST_BAY_CONTRACT.supportStations, position, maximumDistance);
}

/** Deterministic unarmed walking-target pose. The triangle wave has no teleport at either turn. */
export function gunRangeTestBayDummyPose(
  definition: GunRangeTestBayDummyDefinition,
  nowMs: number,
): Readonly<{ position: Readonly<Point3>; yawRadians: number }> {
  if (!Number.isFinite(nowMs)) throw new TypeError('dummy time must be finite');
  const dx = definition.end.x - definition.start.x;
  const dy = definition.end.y - definition.start.y;
  const dz = definition.end.z - definition.start.z;
  const distance = Math.hypot(dx, dy, dz);
  const oneWaySeconds = distance / definition.speedMps;
  const cycle = (((nowMs / 1_000) / (oneWaySeconds * 2) + definition.phase) % 1 + 1) % 1;
  const forward = cycle < 0.5;
  const alpha = forward ? cycle * 2 : (1 - cycle) * 2;
  const travelX = forward ? dx : -dx;
  const travelZ = forward ? dz : -dz;
  return Object.freeze({
    position: Object.freeze({
      x: definition.start.x + dx * alpha,
      y: definition.start.y + dy * alpha,
      z: definition.start.z + dz * alpha,
    }),
    // Atomic Acres operators face local -Z. Point that authored forward axis
    // along the current leg of the route instead of using Three's +Z basis.
    yawRadians: Math.atan2(-travelX, -travelZ),
  });
}

/** Full rendered root transform, including the bounded presentation-only foot bob. */
export function gunRangeTestBayRenderedDummyPose(
  definition: GunRangeTestBayDummyDefinition,
  index: number,
  nowMs: number,
): Readonly<{ position: Readonly<Point3>; yawRadians: number }> {
  if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('dummy index must be a non-negative integer');
  const pose = gunRangeTestBayDummyPose(definition, nowMs);
  return Object.freeze({
    position: Object.freeze({
      x: pose.position.x,
      y: pose.position.y + Math.abs(Math.sin(nowMs * 0.004 + index)) * 0.025,
      z: pose.position.z,
    }),
    yawRadians: pose.yawRadians,
  });
}
