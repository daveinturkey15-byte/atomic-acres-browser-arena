import type { Box2, Point3 } from './collision';
import { movementProfile } from './gameplay';
import { PASS65_KILLSTREAK_CATALOG, type Pass65KillstreakId } from './killstreak-catalog';
import { WEAPON_IDS, type WeaponId } from './protocol';
import type { DynamicWorldCollider } from './physics';

export const GUN_RANGE_TEST_BAY_DOOR_ID = 'gun-range:test-bay-secure-door';
export const GUN_RANGE_TEST_BAY_DOOR_OPEN_MS = 720;
export const GUN_RANGE_TEST_BAY_DOOR_TRIGGER_RADIUS_M = 4.2;
export const GUN_RANGE_TEST_BAY_DOOR_RELEASE_RADIUS_M = 6.4;
export const GUN_RANGE_TEST_BAY_STATION_INTERACTION_RANGE_M = 2.8;

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
    bounds: Object.freeze({ minX: 51.5, maxX: 100, minY: 0, maxY: 8.5, minZ: -52, maxZ: 64 }),
    clearFloorAreaM2: (100 - 51.5) * (64 - -52),
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

function distanceToDoorTrigger(position: Readonly<Point3>): number {
  const trigger = GUN_RANGE_TEST_BAY_CONTRACT.door.trigger;
  return Math.hypot(position.x - trigger.x, position.y - trigger.y, position.z - trigger.z);
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
  if (!Number.isFinite(nowMs) || nowMs < state.updatedAtMs
    || ![observerPosition.x, observerPosition.y, observerPosition.z].every(Number.isFinite)) {
    throw new TypeError('door step requires monotonic finite time and observer position');
  }
  const distance = distanceToDoorTrigger(observerPosition);
  const wantsOpen = distance <= (state.openness > 0
    ? GUN_RANGE_TEST_BAY_DOOR_RELEASE_RADIUS_M
    : GUN_RANGE_TEST_BAY_DOOR_TRIGGER_RADIUS_M);
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
  return Object.freeze({
    position: Object.freeze({
      x: definition.start.x + dx * alpha,
      y: definition.start.y + dy * alpha,
      z: definition.start.z + dz * alpha,
    }),
    yawRadians: Math.atan2(forward ? dx : -dx, forward ? dz : -dz),
  });
}
