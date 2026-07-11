import { afterEach, describe, expect, it } from 'vitest';
import type { Box2 } from './collision';
import { CharacterPhysics } from './physics';

const bounds: Box2 = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
let active: CharacterPhysics | undefined;

afterEach(() => {
  active?.dispose();
  active = undefined;
});

describe('CharacterPhysics', () => {
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
});
