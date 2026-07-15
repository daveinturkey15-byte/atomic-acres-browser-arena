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

describe('simplified two-floor house architecture', () => {
  it('defines two rooms per floor plus front/rear ground doors and windows', () => {
    const aqua = createHouseArchitecture(0, 0, 0, 1);
    const coral = createHouseArchitecture(1, 0, 0, -1);
    expect(aqua.id).not.toBe(coral.id);
    expect(aqua.dimensions).toEqual({ width: 18.2, depth: 16.4, wallThickness: 0.42 });
    expect(coral.dimensions).toEqual(aqua.dimensions);
    for (const architecture of [aqua, coral]) {
      expect(architecture.rooms.filter((room) => room.level === 'ground')).toHaveLength(2);
      expect(architecture.rooms.filter((room) => room.level === 'upper')).toHaveLength(2);
      expect(new Set(architecture.rooms.map((room) => room.id)).size).toBe(4);
      expect(architecture.openings.filter((entry) => entry.kind === 'exterior-door')).toHaveLength(2);
      expect(architecture.openings.filter((entry) => entry.kind === 'window')).toHaveLength(3);
      expect(architecture.openings.filter((entry) => entry.kind === 'interior-opening')).toHaveLength(2);
      expect(architecture.openings.find((entry) => entry.id === 'front-door')?.route).toBe(true);
      expect(architecture.openings.find((entry) => entry.id === 'rear-door')?.route).toBe(true);
      expect(architecture.openings.find((entry) => entry.id === 'front-ground-window')?.centre[2]).not.toBe(
        architecture.openings.find((entry) => entry.id === 'rear-ground-window')?.centre[2],
      );
      expect(new Set(architecture.anchors.map((entry) => entry.id)).size).toBe(architecture.anchors.length);
    }
  });

  it('covers the interior footprint and overlaps floor joins instead of leaving sliver gaps', () => {
    const architecture = createHouseArchitecture(0, 0, 0, 1);
    const ground = architecture.solids.find((entry) => entry.name === 'ground-floor-slab');
    const rear = architecture.solids.find((entry) => entry.name === 'upper-rear-floor');
    const front = architecture.solids.find((entry) => entry.name === 'upper-front-floor');
    const landing = architecture.solids.find((entry) => entry.name === 'ramp-top-landing');
    expect(ground).toBeDefined();
    expect(rear).toBeDefined();
    expect(front).toBeDefined();
    expect(landing).toBeDefined();
    if (!ground || !rear || !front || !landing) throw new Error('Missing declared floor solid');
    expect(ground.size[0]).toBeGreaterThanOrEqual(architecture.dimensions.width - architecture.dimensions.wallThickness * 2);
    expect(ground.size[2]).toBeGreaterThanOrEqual(architecture.dimensions.depth - architecture.dimensions.wallThickness * 2);
    expect(rear.position[2] + rear.size[2] / 2).toBeGreaterThanOrEqual(front.position[2] - front.size[2] / 2);
    expect(front.position[2] + front.size[2] / 2).toBeGreaterThanOrEqual(landing.position[2] - landing.size[2] / 2);
  });

  it('keeps exterior door frames and floor seams wholly in front of wall faces', () => {
    const architecture = createHouseArchitecture(0, 0, 0, 1);
    const byName = (name: string) => {
      const entry = architecture.solids.find((solid) => solid.name === name);
      if (!entry) throw new Error(`Missing ${name}`);
      return solidBounds(entry);
    };
    const frontWall = byName('front-ground-far-left');
    const rearWall = byName('rear-ground-far-right');
    const westWall = byName('ground-west-wall');
    const eastWall = byName('ground-east-wall');
    for (const name of ['front-entry-frame-left', 'front-entry-frame-right', 'front-entry-frame-head', 'floor-seam-front']) {
      expect(byName(name).minZ, name).toBeGreaterThan(frontWall.maxZ);
    }
    for (const name of ['rear-entry-frame-left', 'rear-entry-frame-right', 'rear-entry-frame-head', 'floor-seam-rear']) {
      expect(byName(name).maxZ, name).toBeLessThan(rearWall.minZ);
    }
    expect(byName('floor-seam-west').maxX).toBeLessThan(westWall.minX);
    expect(byName('floor-seam-east').minX).toBeGreaterThan(eastWall.maxX);
  });

  it('uses one continuous rendered-and-physical ramp with no stair proxies or clutter fixtures', () => {
    for (const team of [0, 1] as Team[]) {
      const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
      const ramps = architecture.solids.filter((entry) => entry.kind === 'ramp');
      const proxies = architecture.solids.filter((entry) => (entry.kind as string) === 'ramp-proxy');
      expect(ramps).toHaveLength(1);
      expect(ramps[0]).toMatchObject({ collidable: true, surface: 'timber' });
      expect(ramps[0].size[2]).toBeGreaterThanOrEqual(2.6);
      expect(ramps[0].rotation && Math.abs(ramps[0].rotation[2])).toBeGreaterThan(0.2);
      expect(proxies).toHaveLength(0);
      expect(architecture.solids.some((entry) => (entry.kind as string) === 'stair')).toBe(false);
      expect(architecture.solids.some((entry) => (entry.kind as string) === 'fixture')).toBe(false);
      expect(architecture.solids.length).toBeLessThanOrEqual(48);
    }
  });

  it('declares stable breakable IDs for every house glass pane', () => {
    for (const team of [0, 1] as Team[]) {
      const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
      const glass = architecture.solids.filter((entry) => entry.kind === 'glass');
      expect(glass).toHaveLength(3);
      expect(new Set(glass.map((entry) => entry.id)).size).toBe(3);
      expect(glass.every((entry) => entry.breakable === true)).toBe(true);
    }
  });

  it.each([0, 1] as Team[])('traverses both downstairs rooms and exterior doors in both directions for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const groundRoute = architecture.routes['ground-room-flow'];
    expect(groundRoute).toBeDefined();
    expect(groundRoute[0]).toBe('front-yard');
    expect(groundRoute.at(-1)).toBe('rear-yard');
    await traverse(architecture, groundRoute);
    await traverse(architecture, groundRoute, true);
  });

  it.each([0, 1] as Team[])('climbs and descends the ramp between both upstairs rooms for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const rampRoute = architecture.routes['ramp-room-flow'];
    expect(rampRoute).toBeDefined();
    await traverse(architecture, rampRoute);
    await traverse(architecture, rampRoute, true);
  });
});
