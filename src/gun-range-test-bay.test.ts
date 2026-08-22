import { describe, expect, it } from 'vitest';
import { movementProfile } from './gameplay';
import { PASS65_KILLSTREAK_CATALOG } from './killstreak-catalog';
import { WEAPON_IDS } from './protocol';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  GUN_RANGE_TEST_BAY_DOOR_BALLISTIC_ID,
  GUN_RANGE_TEST_BAY_DOOR_OPEN_MS,
  GUN_RANGE_TEST_BAY_STRUCTURE,
  advanceGunRangeTestBayDoor,
  advanceGunRangeTestBayDoorForObservers,
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicBallisticSurfaces,
  gunRangeTestBayDoorDynamicColliders,
  gunRangeTestBayDoorLeafBounds,
  gunRangeTestBayDummyPose,
  gunRangeTestBayRenderedDummyPose,
  gunRangeTestBayFrozenTimer,
  gunRangeTestBayStructureBounds,
  isGunRangeTestBayDoorState,
  nearestGunRangeTestBaySupportStation,
  nearestGunRangeTestBayWeaponStation,
  projectGunRangeTestBayDoorState,
} from './gun-range-test-bay';

describe('Gun Range grey test-bay authority', () => {
  it('re-anchors the existing timer window without changing remaining duration', () => {
    const initial = { phaseStartedAt: 1_000, endsAt: 121_000 };
    const frozen = gunRangeTestBayFrozenTimer(initial, 8_250);
    expect(frozen).toEqual({ phaseStartedAt: 9_250, endsAt: 129_250 });
    expect(frozen.endsAt - frozen.phaseStartedAt).toBe(120_000);
    expect(() => gunRangeTestBayFrozenTimer(initial, Number.NaN)).toThrow(TypeError);
    expect(() => gunRangeTestBayFrozenTimer({ phaseStartedAt: 2, endsAt: 1 }, 0)).toThrow(TypeError);
  });

  it('authors a five-second ordinary-walk corridor from the existing range shell', () => {
    const ordinaryWalk = movementProfile({
      crouched: false,
      prone: false,
      ads: false,
      sprinting: false,
      grounded: true,
    }).maxSpeed;
    expect(GUN_RANGE_TEST_BAY_CONTRACT.corridor.canonicalWalkSpeedMps).toBe(ordinaryWalk);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.corridor.lengthM).toBeCloseTo(ordinaryWalk * 5, 8);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.corridor.nominalTraversalSeconds).toBeCloseTo(5, 8);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.corridor.clearWidthM).toBeGreaterThanOrEqual(7);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.corridor.clearHeightM).toBeGreaterThanOrEqual(4.5);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.bay.clearFloorAreaM2).toBeGreaterThan(3_000);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds).toEqual({
      minX: 52, maxX: 100, minY: 0, maxY: 25.175, minZ: -26, maxZ: 38,
    });
  });

  it('defines unique finite core structure with no authority-only duplicate list', () => {
    expect(new Set(GUN_RANGE_TEST_BAY_STRUCTURE.map(({ id }) => id)).size).toBe(GUN_RANGE_TEST_BAY_STRUCTURE.length);
    for (const definition of GUN_RANGE_TEST_BAY_STRUCTURE) {
      const bounds = gunRangeTestBayStructureBounds(definition);
      expect(Object.values(bounds).every(Number.isFinite), definition.id).toBe(true);
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY!).toBeGreaterThan(bounds.minY!);
      expect(bounds.maxZ).toBeGreaterThan(bounds.minZ);
    }
    expect(GUN_RANGE_TEST_BAY_STRUCTURE.filter(({ material }) => material === 'floor').map(({ id }) => id)).toEqual([
      'gun-range-test-bay-corridor-floor',
      'gun-range-test-bay-floor',
    ]);
    expect(GUN_RANGE_TEST_BAY_STRUCTURE.some(({ id }) => id === 'gun-range-test-bay-door-bulkhead')).toBe(true);
  });

  it('projects every canonical weapon and killstreak into one deterministic station plan', () => {
    expect(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.map(({ id }) => id)).toEqual(WEAPON_IDS);
    // HF-334: care-package-only weapon rewards are not trainable streaks, so
    // the bay dispenses exactly the selectable set.
    expect(GUN_RANGE_TEST_BAY_CONTRACT.supportStations.map(({ id }) => id)).toEqual(
      PASS65_KILLSTREAK_CATALOG.definitions
        .filter(({ availability }) => availability !== 'care-only')
        .map(({ id }) => id),
    );
    expect(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.every(
      ({ runtimeStatus }) => runtimeStatus === 'active-training-station',
    )).toBe(true);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.supportStations.every(
      ({ runtimeStatus }) => runtimeStatus === 'active-training-station',
    )).toBe(true);
  });

  it('selects one deterministic nearby weapon or support station and rejects invalid probes', () => {
    const weapon = GUN_RANGE_TEST_BAY_CONTRACT.weaponStations[7]!;
    const support = GUN_RANGE_TEST_BAY_CONTRACT.supportStations[3]!;
    expect(nearestGunRangeTestBayWeaponStation({
      x: weapon.position.x + 0.4,
      y: 1.7,
      z: weapon.position.z,
    })).toMatchObject({ station: { id: weapon.id } });
    expect(nearestGunRangeTestBaySupportStation({
      x: support.position.x,
      y: 1.7,
      z: support.position.z - 0.5,
    })).toMatchObject({ station: { id: support.id } });
    expect(nearestGunRangeTestBayWeaponStation({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(nearestGunRangeTestBaySupportStation({ x: Number.NaN, y: 0, z: 0 })).toBeNull();
  });

  it('opens on proximity with one thump intent, hysteresis, and moving collision parity', () => {
    let state = createGunRangeTestBayDoorState(0);
    const far = { x: 20.5, y: 1.7, z: 12 };
    const near = GUN_RANGE_TEST_BAY_CONTRACT.door.trigger;

    const idle = advanceGunRangeTestBayDoor(state, 500, far);
    expect(idle).toMatchObject({ audioIntent: null, collisionChanged: false });
    expect(idle.state.phase).toBe('closed');

    const release = advanceGunRangeTestBayDoor(idle.state, 500, near);
    expect(release.audioIntent).toBe('secure-door-opening-thump');
    expect(release.state.thumpSequence).toBe(1);
    state = release.state;

    const halfway = advanceGunRangeTestBayDoor(state, 500 + GUN_RANGE_TEST_BAY_DOOR_OPEN_MS / 2, near);
    expect(halfway.state).toMatchObject({ phase: 'opening', openness: 0.5, thumpSequence: 1 });
    const closedBounds = GUN_RANGE_TEST_BAY_CONTRACT.door.closedBounds;
    const movingBounds = gunRangeTestBayDoorLeafBounds(halfway.state);
    expect(movingBounds.minY).toBeCloseTo((closedBounds.minY ?? 0) + GUN_RANGE_TEST_BAY_CONTRACT.door.travelM / 2);
    expect(gunRangeTestBayDoorDynamicColliders(halfway.state)).toHaveLength(1);
    expect(gunRangeTestBayDoorDynamicBallisticSurfaces(halfway.state)).toEqual([
      expect.objectContaining({
        id: GUN_RANGE_TEST_BAY_DOOR_BALLISTIC_ID,
        name: 'gun-range-test-bay-secure-door-leaf',
        material: 'structural-metal',
        classification: 'explicit',
        bounds: movingBounds,
      }),
    ]);

    const opened = advanceGunRangeTestBayDoor(halfway.state, 500 + GUN_RANGE_TEST_BAY_DOOR_OPEN_MS, near);
    expect(opened.state).toMatchObject({ phase: 'open', openness: 1, thumpSequence: 1 });
    expect(gunRangeTestBayDoorDynamicColliders(opened.state)).toHaveLength(0);
    expect(gunRangeTestBayDoorDynamicBallisticSurfaces(opened.state)).toHaveLength(0);

    const retained = advanceGunRangeTestBayDoor(opened.state, 1_500, { x: 54.5, y: 1.7, z: 12 });
    expect(retained.state.phase).toBe('open');
    const closing = advanceGunRangeTestBayDoor(retained.state, 1_600, far);
    expect(closing.state.phase).toBe('closing');
    expect(closing.audioIntent).toBeNull();
  });

  it('lets any admitted observer open one shared door and projects replicas without local authorship', () => {
    const initial = createGunRangeTestBayDoorState(1_000);
    const started = advanceGunRangeTestBayDoorForObservers(initial, 1_000, [
      { x: 20, y: 1.7, z: 0 },
      GUN_RANGE_TEST_BAY_CONTRACT.door.trigger,
    ]);
    expect(started).toMatchObject({ audioIntent: 'secure-door-opening-thump' });
    expect(started.state).toMatchObject({ phase: 'opening', openness: 0, thumpSequence: 1 });

    const projected = projectGunRangeTestBayDoorState(
      started.state,
      1_000 + GUN_RANGE_TEST_BAY_DOOR_OPEN_MS / 2,
    );
    expect(projected).toMatchObject({ phase: 'opening', openness: 0.5, thumpSequence: 1 });
    expect(gunRangeTestBayDoorDynamicColliders(projected)[0]?.bounds).toEqual(
      gunRangeTestBayDoorDynamicBallisticSurfaces(projected)[0]?.bounds,
    );
    expect(projectGunRangeTestBayDoorState(projected, 1_000 + GUN_RANGE_TEST_BAY_DOOR_OPEN_MS)).toMatchObject({
      phase: 'open', openness: 1, thumpSequence: 1,
    });

    const noObservers = advanceGunRangeTestBayDoorForObservers(projected, 1_500, []);
    expect(noObservers.state.phase).toBe('closing');
    expect(isGunRangeTestBayDoorState(noObservers.state)).toBe(true);
    expect(isGunRangeTestBayDoorState({ ...noObservers.state, callerPosition: [0, 0, 0] })).toBe(false);
  });

  it('keeps slow unarmed dummies continuous, bounded, and below walking speed', () => {
    const walkSpeed = GUN_RANGE_TEST_BAY_CONTRACT.corridor.canonicalWalkSpeedMps;
    for (let index = 0; index < GUN_RANGE_TEST_BAY_CONTRACT.dummies.length; index += 1) {
      const dummy = GUN_RANGE_TEST_BAY_CONTRACT.dummies[index];
      expect(dummy.armed).toBe(false);
      expect(dummy.speedMps).toBeGreaterThan(0.5);
      expect(dummy.speedMps).toBeLessThan(walkSpeed * 0.15);
      const start = gunRangeTestBayDummyPose(dummy, 0);
      const renderedStart = gunRangeTestBayRenderedDummyPose(dummy, index, 0);
      expect(renderedStart.position.y).toBeCloseTo(start.position.y + Math.abs(Math.sin(index)) * 0.025, 12);
      const next = gunRangeTestBayDummyPose(dummy, 16);
      expect(Math.hypot(
        next.position.x - start.position.x,
        next.position.y - start.position.y,
        next.position.z - start.position.z,
      )).toBeLessThanOrEqual(dummy.speedMps * 0.016 + 1e-9);
      for (const now of [0, 1_000, 5_000, 15_000, 30_000]) {
        const pose = gunRangeTestBayDummyPose(dummy, now);
        const nextPose = gunRangeTestBayDummyPose(dummy, now + 1);
        const motionX = nextPose.position.x - pose.position.x;
        const motionZ = nextPose.position.z - pose.position.z;
        const motionLength = Math.hypot(motionX, motionZ);
        const operatorForwardX = -Math.sin(pose.yawRadians);
        const operatorForwardZ = -Math.cos(pose.yawRadians);
        expect(pose.position.x).toBeGreaterThanOrEqual(Math.min(dummy.start.x, dummy.end.x));
        expect(pose.position.x).toBeLessThanOrEqual(Math.max(dummy.start.x, dummy.end.x));
        expect(Number.isFinite(pose.yawRadians)).toBe(true);
        expect(motionLength).toBeGreaterThan(0);
        expect((operatorForwardX * motionX + operatorForwardZ * motionZ) / motionLength).toBeGreaterThan(0.999999);
      }
    }
  });
});
