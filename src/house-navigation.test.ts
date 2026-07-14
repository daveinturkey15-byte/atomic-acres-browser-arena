import { describe, expect, it } from 'vitest';
import type { Point3 } from './collision';
import { houseCollisionSolids, solidBounds } from './house-navigation';
import { CharacterPhysics } from './physics';

function overlapsXZ(a: ReturnType<typeof solidBounds>, b: ReturnType<typeof solidBounds>): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

async function walkToward(physics: CharacterPhysics, target: Point3, maxSteps = 1_000): Promise<Point3> {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = physics.eyePosition();
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.16 && Math.abs(target.y - current.y) < 0.18) return current;
    const amount = Math.min(0.036, distance);
    physics.move({
      x: distance > 0 ? dx / distance * amount : 0,
      y: -0.002,
      z: distance > 0 ? dz / distance * amount : 0,
    }, 1 / 120);
  }
  return physics.eyePosition();
}

describe('house navigation solids', () => {
  it.each([1, -1] as const)('keeps the stair hall clear for facing %s', (facing) => {
    const solids = houseCollisionSolids(0, 0, facing);
    const divider = solidBounds(solids.find((solid) => solid.name === 'interior-divider')!);
    const stairs = solids.filter((solid) => solid.name === 'interior-stair').map(solidBounds);
    expect(stairs.some((stair) => overlapsXZ(divider, stair))).toBe(false);
    const deck = solids.find((solid) => solid.name === 'rear-deck')!;
    expect(deck.position[1] + deck.size[1] / 2).toBeLessThanOrEqual(0.42);
  });

  it.each([1, -1] as const)('walks through the lower-room hall and across the rear threshold for facing %s', async (facing) => {
    const solids = houseCollisionSolids(0, 0, facing);
    const physics = await CharacterPhysics.create(
      solids.map(solidBounds),
      { minX: -12, maxX: 12, minZ: -13, maxZ: 13 },
    );
    try {
      physics.teleportEye({ x: 0, y: 1.7, z: facing * 5 });
      const throughRooms = await walkToward(physics, { x: 0, y: 1.7, z: -facing * 7.8 });
      expect(throughRooms.z * facing).toBeLessThan(-7.3);
      const acrossDeck = await walkToward(physics, { x: 0, y: 2.05, z: -facing * 10.5 });
      expect(acrossDeck.z * facing).toBeLessThan(-10);
      expect(acrossDeck.y).toBeGreaterThan(1.9);
    } finally {
      physics.dispose();
    }
  });

  it.each([1, -1] as const)('walks the real character controller from stair foot to upstairs for facing %s', async (facing) => {
    const solids = houseCollisionSolids(0, 0, facing);
    const physics = await CharacterPhysics.create(
      solids.map(solidBounds),
      { minX: -12, maxX: 12, minZ: -12, maxZ: 12 },
    );
    try {
      physics.teleportEye({ x: 4.85, y: 1.7, z: -facing * 4.2 });
      const result = await walkToward(physics, { x: 4.85, y: 5.25, z: facing * 3.0 });
      expect(result.z * facing).toBeGreaterThan(2.5);
      expect(result.y).toBeGreaterThan(4.75);
    } finally {
      physics.dispose();
    }
  });

  it.each([1, -1] as const)('supports reverse traversal from rear deck through the front door for facing %s', async (facing) => {
    const solids = houseCollisionSolids(0, 0, facing);
    const physics = await CharacterPhysics.create(solids.map(solidBounds), { minX: -12, maxX: 12, minZ: -13, maxZ: 13 });
    try {
      physics.teleportEye({ x: 0, y: 2.05, z: -facing * 10.5 });
      const inside = await walkToward(physics, { x: 0, y: 1.7, z: facing * 5 });
      expect(inside.z * facing).toBeGreaterThan(4.5);
      const outsideFront = await walkToward(physics, { x: 0, y: 1.7, z: facing * 9.5 });
      expect(outsideFront.z * facing).toBeGreaterThan(9);
    } finally {
      physics.dispose();
    }
  });

  it.each([1, -1] as const)('reaches both upstairs firing positions and returns down the stairs for facing %s', async (facing) => {
    const solids = houseCollisionSolids(0, 0, facing);
    const physics = await CharacterPhysics.create(solids.map(solidBounds), { minX: -12, maxX: 12, minZ: -12, maxZ: 12 });
    try {
      physics.teleportEye({ x: 4.85, y: 1.7, z: -facing * 4.2 });
      const rightWindow = await walkToward(physics, { x: 3.75, y: 5.25, z: facing * 5.6 });
      expect(rightWindow.y).toBeGreaterThan(4.75);
      expect(rightWindow.x).toBeLessThan(4.1);
      const leftWindow = await walkToward(physics, { x: -3.75, y: 5.25, z: facing * 5.6 });
      expect(leftWindow.y).toBeGreaterThan(4.75);
      expect(leftWindow.x).toBeLessThan(-3.35);
      const stairFoot = await walkToward(physics, { x: 4.85, y: 1.7, z: -facing * 4.2 }, 1_600);
      expect(stairFoot.y).toBeLessThan(2.15);
      expect(stairFoot.z * facing).toBeLessThan(-3.7);
    } finally {
      physics.dispose();
    }
  });
});
