import { afterEach, describe, expect, it } from 'vitest';
import type { Box2 } from './collision';
import { CharacterPhysics, WORLD_BOUNDARY_MAX_Y, WORLD_BOUNDARY_MIN_Y, worldBoundaryColliders } from './physics';

const bounds: Box2 = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
let active: CharacterPhysics | undefined;

afterEach(() => {
  active?.dispose();
  active = undefined;
});

describe('CharacterPhysics', () => {
  it('builds four full-height physics-only walls exactly outside arena bounds', () => {
    const walls = worldBoundaryColliders(bounds);
    expect(walls).toHaveLength(4);
    expect(walls.every((wall) => wall.minY === WORLD_BOUNDARY_MIN_Y && wall.maxY === WORLD_BOUNDARY_MAX_Y)).toBe(true);
    expect(walls).toContainEqual(expect.objectContaining({ maxX: bounds.minX, minZ: bounds.minZ, maxZ: bounds.maxZ }));
    expect(walls).toContainEqual(expect.objectContaining({ minX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }));
    expect(walls).toContainEqual(expect.objectContaining({ maxZ: bounds.minZ, minX: bounds.minX, maxX: bounds.maxX }));
    expect(walls).toContainEqual(expect.objectContaining({ minZ: bounds.maxZ, minX: bounds.minX, maxX: bounds.maxX }));
  });

  it('stands on the ground instead of falling through it', async () => {
    active = await CharacterPhysics.create([], bounds);
    active.teleportEye({ x: 0, y: 2.4, z: 0 });
    let grounded = false;
    let y = 2.4;
    for (let step = 0; step < 180; step += 1) {
      const result = active.move({ x: 0, y: -6 / 120, z: 0 }, 1 / 120);
      grounded = result.grounded;
      y = result.position.y;
    }
    expect(grounded).toBe(true);
    expect(y).toBeGreaterThan(1.55);
    expect(y).toBeLessThan(1.8);
  });

  it('slides along a wall without crossing it', async () => {
    const wall: Box2 = { minX: 0.8, maxX: 1.2, minZ: -4, maxZ: 4, minY: 0, maxY: 3 };
    active = await CharacterPhysics.create([wall], bounds);
    active.teleportEye({ x: 0, y: 1.7, z: -2 });
    let position = active.eyePosition();
    for (let step = 0; step < 120; step += 1) {
      position = active.move({ x: 0.04, y: -0.01, z: 0.03 }, 1 / 120).position;
    }
    expect(position.x).toBeLessThan(0.43);
    expect(position.z).toBeGreaterThan(-1);
  });

  it('cannot sprint, jump, crouch, or prone through any playable-bound edge', async () => {
    active = await CharacterPhysics.create([], bounds);
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      for (const direction of [
        { x: 0.08, z: 0 }, { x: -0.08, z: 0 }, { x: 0, z: 0.08 }, { x: 0, z: -0.08 },
      ]) {
        active.teleportEye({ x: 0, y: 1.7, z: 0 });
        expect(active.setStance(stance)).toBe(true);
        let position = active.eyePosition();
        for (let frame = 0; frame < 240; frame += 1) {
          const vertical = frame < 20 ? 0.05 : -0.01;
          position = active.move({ x: direction.x, y: vertical, z: direction.z }, 1 / 120).position;
        }
        expect(position.x).toBeGreaterThan(bounds.minX);
        expect(position.x).toBeLessThan(bounds.maxX);
        expect(position.z).toBeGreaterThan(bounds.minZ);
        expect(position.z).toBeLessThan(bounds.maxZ);
        expect(position.y).toBeGreaterThan(0.45);
      }
    }
  });

  it('automatically steps onto low authored collision', async () => {
    const stepBox: Box2 = { minX: -1, maxX: 1, minZ: -0.2, maxZ: 1.4, minY: 0, maxY: 0.3 };
    active = await CharacterPhysics.create([stepBox], bounds);
    active.teleportEye({ x: 0, y: 1.7, z: -1.1 });
    let position = active.eyePosition();
    for (let frame = 0; frame < 80; frame += 1) {
      position = active.move({ x: 0, y: -0.01, z: 0.035 }, 1 / 120).position;
    }
    expect(position.z).toBeGreaterThan(0.1);
    expect(position.y).toBeGreaterThan(1.82);
  });

  it('uses a real low prone collider and refuses to stand through a ceiling', async () => {
    const ceiling: Box2 = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0.82, maxY: 1.05 };
    active = await CharacterPhysics.create([ceiling], bounds);
    active.teleportEye({ x: 2, y: 1.7, z: 0 });
    expect(active.setStance('prone')).toBe(true);
    expect(active.eyePosition().y).toBeCloseTo(0.61, 2);
    for (let frame = 0; frame < 70; frame += 1) {
      active.move({ x: -0.035, y: -0.01, z: 0 }, 1 / 120);
    }
    expect(active.eyePosition().x).toBeLessThan(0.5);
    expect(active.setStance('stand')).toBe(false);
    expect(active.currentStance()).toBe('prone');
  });

  it('returns from prone to standing on an unobstructed floor', async () => {
    active = await CharacterPhysics.create([], bounds);
    active.teleportEye({ x: 0, y: 1.7, z: 0 });
    expect(active.setStance('prone')).toBe(true);
    expect(active.setStance('stand')).toBe(true);
    expect(active.currentStance()).toBe('stand');
    expect(active.eyePosition().y).toBeCloseTo(1.7, 2);
  });

  it('reconciles revisioned dynamic door/panel colliders without rebuilding the world', async () => {
    active = await CharacterPhysics.create([], bounds);
    active.teleportEye({ x: 0, y: 1.7, z: 0 });
    active.syncDynamicColliders([{
      id: 'shed-a:door-south',
      bounds: { minX: 0.8, maxX: 1.0, minZ: -2, maxZ: 2, minY: 0, maxY: 2.4 },
    }]);
    expect(active.dynamicColliderCount()).toBe(1);
    let blocked = active.eyePosition();
    for (let frame = 0; frame < 80; frame += 1) {
      blocked = active.move({ x: 0.04, y: -0.01, z: 0 }, 1 / 120).position;
    }
    expect(blocked.x).toBeLessThan(0.43);

    active.syncDynamicColliders([]);
    expect(active.dynamicColliderCount()).toBe(0);
    let released = active.eyePosition();
    for (let frame = 0; frame < 80; frame += 1) {
      released = active.move({ x: 0.04, y: -0.01, z: 0 }, 1 / 120).position;
    }
    expect(released.x).toBeGreaterThan(2);
  });

  it('rejects duplicate or non-canonical dynamic collider identities', async () => {
    active = await CharacterPhysics.create([], bounds);
    const boundsA: Box2 = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    expect(() => active!.syncDynamicColliders([
      { id: 'shed-a:door', bounds: boundsA },
      { id: 'shed-a:door', bounds: boundsA },
    ])).toThrow(/unique canonical/);
    expect(() => active!.syncDynamicColliders([{ id: '../unsafe', bounds: boundsA }])).toThrow(/unique canonical/);
  });

  it('bounds, wakes, impulses, snapshots, and removes host-simulated major debris', async () => {
    active = await CharacterPhysics.create([], bounds);
    active.teleportEye({ x: -5, y: 1.7, z: -5 });
    active.syncMajorDebrisBodies([{
      id: 'shed-a:debris:chunk-west',
      position: { x: 0, y: 0.18, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      halfExtents: { x: 0.55, y: 0.08, z: 0.7 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      sleeping: true,
    }]);
    expect(active.majorDebrisBodyCount()).toBe(1);
    expect(active.majorDebrisSnapshots()[0]).toMatchObject({ id: 'shed-a:debris:chunk-west', sleeping: true });
    expect(active.applyMajorDebrisImpulse('shed-a:debris:chunk-west', { x: 12, y: 1, z: 0 })).toBe(true);
    for (let frame = 0; frame < 30; frame += 1) active.move({ x: 0, y: -0.01, z: 0 }, 1 / 120);
    const moved = active.majorDebrisSnapshots()[0]!;
    expect(moved.sleeping).toBe(false);
    expect(moved.position.x).toBeGreaterThan(0.1);
    expect(active.applyMajorDebrisImpulse('shed-a:debris:chunk-west', { x: 100, y: 0, z: 0 })).toBe(false);
    active.syncMajorDebrisBodies([]);
    expect(active.majorDebrisBodyCount()).toBe(0);
  });

  it('rejects arena-wide major debris cap overflow', async () => {
    active = await CharacterPhysics.create([], bounds);
    const entries = Array.from({ length: 19 }, (_, index) => ({
      id: `shed-a:debris:chunk-${index}`,
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      halfExtents: { x: 0.5, y: 0.1, z: 0.5 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      sleeping: true,
    }));
    expect(() => active!.syncMajorDebrisBodies(entries)).toThrow(/exceed cap/);
  });

  it('admits the exact shared 12 shed + 4 house + 2 window physical-body partition', async () => {
    active = await CharacterPhysics.create([], bounds);
    const ids = [
      ...Array.from({ length: 12 }, (_, index) => `shed-${Math.floor(index / 6)}:debris:chunk-${index}`),
      ...Array.from({ length: 4 }, (_, index) => `house-debris:atomic-house:fragment-${index}`),
      ...Array.from({ length: 2 }, (_, index) => `window-debris:atomic-window-${index}`),
    ];
    active.syncMajorDebrisBodies(ids.map((id, index) => ({
      id,
      position: { x: -4 + index % 9, y: 0.25 + Math.floor(index / 9) * 0.6, z: index < 9 ? -2 : 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      halfExtents: { x: 0.16, y: 0.16, z: 0.16 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      sleeping: true,
    })));
    expect(active.majorDebrisBodyCount()).toBe(18);
    expect(active.majorDebrisSnapshots().map((snapshot) => snapshot.id)).toEqual([...ids].sort());
  });

  it('keeps multiple major fragments physical so they collide with each other and the world floor', async () => {
    active = await CharacterPhysics.create([], bounds);
    active.teleportEye({ x: -7, y: 1.7, z: -7 });
    const fragments = [{
      id: 'shed-a:debris:chunk-east',
      position: { x: -1.1, y: 0.42, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      halfExtents: { x: 0.32, y: 0.3, z: 0.42 },
      linearVelocity: { x: 5.5, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0.4, z: 0 },
      sleeping: false,
    }, {
      id: 'window-debris:atomic-blue-window-a',
      position: { x: 0, y: 0.42, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      halfExtents: { x: 0.32, y: 0.3, z: 0.42 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      sleeping: false,
    }] as const;
    active.syncMajorDebrisBodies(fragments);
    for (let frame = 0; frame < 180; frame += 1) active.move({ x: 0, y: -0.01, z: 0 }, 1 / 120);
    const snapshots = new Map(active.majorDebrisSnapshots().map((snapshot) => [snapshot.id, snapshot]));
    const shed = snapshots.get('shed-a:debris:chunk-east')!;
    const window = snapshots.get('window-debris:atomic-blue-window-a')!;
    expect(window.position.x).toBeGreaterThan(0.05);
    expect(shed.position.x).toBeLessThan(window.position.x);
    expect(shed.position.y).toBeGreaterThan(0.2);
    expect(window.position.y).toBeGreaterThan(0.2);

    const priorWindowX = window.position.x;
    active.syncMajorDebrisBodies(fragments);
    expect(active.majorDebrisBodyCount()).toBe(2);
    expect(active.majorDebrisSnapshots().find((snapshot) => snapshot.id === window.id)?.position.x)
      .toBeCloseTo(priorWindowX, 4);
  });
});
