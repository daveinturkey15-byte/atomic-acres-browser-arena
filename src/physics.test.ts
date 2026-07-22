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
    expect(active.eyePosition().y).toBeCloseTo(0.5, 2);
    for (let frame = 0; frame < 70; frame += 1) {
      active.move({ x: -0.035, y: -0.01, z: 0 }, 1 / 120);
    }
    expect(active.eyePosition().x).toBeLessThan(0.5);
    expect(active.setStance('stand')).toBe(false);
    expect(active.currentStance()).toBe('prone');
  });
});
