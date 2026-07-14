import { describe, expect, it } from 'vitest';
import type { Point3 } from './collision';
import { createHouseArchitecture, solidBounds, type HouseArchitecture } from './house-navigation';
import { CharacterPhysics } from './physics';
import type { Team } from './protocol';

async function walkToward(physics: CharacterPhysics, target: Point3, maxSteps = 1_800): Promise<Point3> {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = physics.eyePosition();
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.14 && Math.abs(target.y - current.y) < 0.24) return current;
    const amount = Math.min(0.032, distance);
    physics.move({ x: distance > 0 ? dx / distance * amount : 0, y: -0.002, z: distance > 0 ? dz / distance * amount : 0 }, 1 / 120);
  }
  return physics.eyePosition();
}

function anchor(architecture: HouseArchitecture, id: string): Point3 {
  const value = architecture.anchors.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing route anchor ${id}`);
  return { x: value.position[0], y: value.position[1], z: value.position[2] };
}

async function traverse(architecture: HouseArchitecture, route: readonly string[], reverse = false): Promise<void> {
  const ordered = reverse ? [...route].reverse() : [...route];
  const physics = await CharacterPhysics.create(
    architecture.solids.filter((entry) => entry.collidable).map(solidBounds),
    { minX: -13, maxX: 13, minZ: -14, maxZ: 14 },
  );
  try {
    physics.teleportEye(anchor(architecture, ordered[0]));
    for (const id of ordered.slice(1)) {
      const target = anchor(architecture, id);
      const result = await walkToward(physics, target);
      const horizontalError = Math.hypot(result.x - target.x, result.z - target.z);
      expect(horizontalError, `${architecture.id}:${id}:horizontal result=${JSON.stringify(result)} target=${JSON.stringify(target)}`).toBeLessThan(0.42);
      expect(Math.abs(result.y - target.y), `${architecture.id}:${id}:vertical`).toBeLessThan(0.48);
    }
  } finally {
    physics.dispose();
  }
}

describe('authored house architecture', () => {
  it('defines distinct original identities with human-scale openings', () => {
    const aqua = createHouseArchitecture(0, 0, 0, 1);
    const coral = createHouseArchitecture(1, 0, 0, -1);
    expect(aqua.id).not.toBe(coral.id);
    expect(aqua.dimensions).toEqual({ width: 16.2, depth: 14.4, wallThickness: 0.42 });
    expect(coral.dimensions).toEqual(aqua.dimensions);
    for (const architecture of [aqua, coral]) {
      const exterior = architecture.openings.filter((entry) => entry.kind === 'exterior-door');
      const interior = architecture.openings.filter((entry) => entry.kind === 'interior-opening');
      expect(exterior.length).toBeGreaterThanOrEqual(2);
      expect(interior.length).toBeGreaterThanOrEqual(2);
      expect(exterior.every((entry) => entry.width >= 1.5 && entry.width <= 1.8)).toBe(true);
      expect(interior.every((entry) => entry.width >= 1.2 && entry.width <= 1.5)).toBe(true);
      expect(new Set(architecture.anchors.map((entry) => entry.id)).size).toBe(architecture.anchors.length);
    }
  });

  it.each([0, 1] as Team[])('traverses every declared ground route forward and backward for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const groundRoutes = Object.entries(architecture.routes).filter(([id]) => !/stair/i.test(id));
    for (const [, route] of groundRoutes) {
      await traverse(architecture, route);
      await traverse(architecture, route, true);
    }
  });

  it.each([0, 1] as Team[])('climbs and descends the declared stair route for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const stairRoute = Object.entries(architecture.routes).find(([id]) => /stair/i.test(id));
    expect(stairRoute).toBeDefined();
    await traverse(architecture, stairRoute![1]);
    await traverse(architecture, stairRoute![1], true);
  });
});
