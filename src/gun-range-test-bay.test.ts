import { describe, expect, it } from 'vitest';
import { movementProfile } from './gameplay';
import { PASS65_KILLSTREAK_CATALOG } from './killstreak-catalog';
import { WEAPON_IDS } from './protocol';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  GUN_RANGE_TEST_BAY_DOOR_OPEN_MS,
  advanceGunRangeTestBayDoor,
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicColliders,
  gunRangeTestBayDoorLeafBounds,
  gunRangeTestBayDummyPose,
  gunRangeTestBayRenderedDummyPose,
  nearestGunRangeTestBaySupportStation,
  nearestGunRangeTestBayWeaponStation,
} from './gun-range-test-bay';

describe('Gun Range grey test-bay authority', () => {
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
  });

  it('projects every canonical weapon and killstreak into one deterministic station plan', () => {
    expect(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.map(({ id }) => id)).toEqual(WEAPON_IDS);
    expect(GUN_RANGE_TEST_BAY_CONTRACT.supportStations.map(({ id }) => id)).toEqual(
      PASS65_KILLSTREAK_CATALOG.definitions.map(({ id }) => id),
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

    const opened = advanceGunRangeTestBayDoor(halfway.state, 500 + GUN_RANGE_TEST_BAY_DOOR_OPEN_MS, near);
    expect(opened.state).toMatchObject({ phase: 'open', openness: 1, thumpSequence: 1 });
    expect(gunRangeTestBayDoorDynamicColliders(opened.state)).toHaveLength(0);

    const retained = advanceGunRangeTestBayDoor(opened.state, 1_500, { x: 54.5, y: 1.7, z: 12 });
    expect(retained.state.phase).toBe('open');
    const closing = advanceGunRangeTestBayDoor(retained.state, 1_600, far);
    expect(closing.state.phase).toBe('closing');
    expect(closing.audioIntent).toBeNull();
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
        expect(pose.position.x).toBeGreaterThanOrEqual(Math.min(dummy.start.x, dummy.end.x));
        expect(pose.position.x).toBeLessThanOrEqual(Math.max(dummy.start.x, dummy.end.x));
        expect(Number.isFinite(pose.yawRadians)).toBe(true);
      }
    }
  });
});
