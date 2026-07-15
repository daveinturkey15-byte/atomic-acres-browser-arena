import { describe, expect, it } from 'vitest';
import type { Point3 } from './collision';
import { movementProfile } from './gameplay';
import { createHouseArchitecture, solidBounds, type HouseArchitecture, type HouseOpening } from './house-navigation';
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
    { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
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

async function windowTraversal(
  architecture: HouseArchitecture,
  opening: HouseOpening,
  outwardZ: 1 | -1,
  reverse = false,
): Promise<{ standingDistance: number; crouchedDistance: number }> {
  const physics = await CharacterPhysics.create(
    architecture.solids.filter((entry) => entry.collidable).map(solidBounds),
    { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
  );
  const outside = { x: opening.centre[0], y: 1.7, z: opening.centre[2] + outwardZ * 1.8 };
  const inside = { x: opening.centre[0], y: 1.7, z: opening.centre[2] - outwardZ * 1.8 };
  const start = reverse ? inside : outside;
  const destination = reverse ? outside : inside;
  try {
    physics.teleportEye(start);
    const blocked = await walkToward(physics, destination, 360);
    const standingDistance = Math.hypot(blocked.x - destination.x, blocked.z - destination.z);

    physics.teleportEye(start);
    physics.setStance('stand');
    const dt = 1 / 120;
    let verticalVelocity = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true }).jumpVelocity;
    let result = physics.eyePosition();
    for (let step = 0; step < 300; step += 1) {
      if (step === 4) expect(physics.setStance('crouch')).toBe(true);
      verticalVelocity -= 22 * dt;
      const dx = destination.x - result.x;
      const dz = destination.z - result.z;
      const distance = Math.hypot(dx, dz);
      const speed = 3.15;
      const moved = physics.move({
        x: distance > 0 ? dx / distance * speed * dt : 0,
        y: verticalVelocity * dt,
        z: distance > 0 ? dz / distance * speed * dt : 0,
      }, dt);
      result = moved.position;
      if (moved.grounded && verticalVelocity < 0) verticalVelocity = 0;
      if (Math.hypot(result.x - destination.x, result.z - destination.z) < 0.28) break;
    }
    return {
      standingDistance,
      crouchedDistance: Math.hypot(result.x - destination.x, result.z - destination.z),
    };
  } finally {
    physics.dispose();
  }
}

describe('simplified two-floor house architecture', () => {
  it('defines two rooms per floor plus front/rear ground doors and windows', () => {
    const aqua = createHouseArchitecture(0, 0, 0, 1);
    const coral = createHouseArchitecture(1, 0, 0, -1);
    expect(aqua.id).not.toBe(coral.id);
    expect(aqua.dimensions).toEqual({ width: 20.2, depth: 16.4, wallThickness: 0.42 });
    expect(coral.dimensions).toEqual(aqua.dimensions);
    for (const architecture of [aqua, coral]) {
      expect(architecture.rooms.filter((room) => room.level === 'ground')).toHaveLength(2);
      expect(architecture.rooms.filter((room) => room.level === 'upper')).toHaveLength(2);
      expect(new Set(architecture.rooms.map((room) => room.id)).size).toBe(4);
      expect(architecture.openings.filter((entry) => entry.kind === 'exterior-door')).toHaveLength(2);
      expect(architecture.openings.filter((entry) => entry.kind === 'ramp-entry')).toHaveLength(1);
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

  it('covers the interior footprint with one upper slab and a positively overlapping exterior landing', () => {
    const architecture = createHouseArchitecture(0, 0, 0, 1);
    const ground = architecture.solids.find((entry) => entry.name === 'ground-floor-slab');
    const upper = architecture.solids.find((entry) => entry.name === 'upper-floor-slab');
    const landing = architecture.solids.find((entry) => entry.name === 'ramp-top-landing');
    expect(ground).toBeDefined();
    expect(upper).toBeDefined();
    expect(landing).toBeDefined();
    if (!ground || !upper || !landing) throw new Error('Missing declared floor solid');
    expect(ground.size[0]).toBeGreaterThanOrEqual(architecture.dimensions.width - architecture.dimensions.wallThickness * 2);
    expect(ground.size[2]).toBeGreaterThanOrEqual(architecture.dimensions.depth - architecture.dimensions.wallThickness * 2);
    expect(upper.size[0]).toBeGreaterThanOrEqual(architecture.dimensions.width - architecture.dimensions.wallThickness * 2);
    expect(upper.size[2]).toBeGreaterThanOrEqual(architecture.dimensions.depth - architecture.dimensions.wallThickness * 2);
    const upperBounds = solidBounds(upper);
    const landingBounds = solidBounds(landing);
    const overlapX = Math.min(upperBounds.maxX, landingBounds.maxX) - Math.max(upperBounds.minX, landingBounds.minX);
    const overlapZ = Math.min(upperBounds.maxZ, landingBounds.maxZ) - Math.max(upperBounds.minZ, landingBounds.minZ);
    expect(overlapX).toBeGreaterThan(0.3);
    expect(overlapZ).toBeGreaterThan(2);
  });

  it('keeps exterior door frames and floor seams wholly in front of wall faces', () => {
    const architecture = createHouseArchitecture(0, 0, 0, 1);
    const byName = (name: string) => {
      const entry = architecture.solids.find((candidate) => candidate.name === name);
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

  it('uses one exterior continuous rendered-and-physical ramp clear of both ground doors', () => {
    for (const team of [0, 1] as Team[]) {
      const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
      const ramps = architecture.solids.filter((entry) => entry.kind === 'ramp');
      const proxies = architecture.solids.filter((entry) => (entry.kind as string) === 'ramp-proxy');
      expect(ramps).toHaveLength(1);
      expect(ramps[0]).toMatchObject({ collidable: true, surface: 'timber' });
      expect(ramps[0].size[0]).toBeGreaterThanOrEqual(2.8);
      expect(ramps[0].rotation && Math.abs(ramps[0].rotation[0])).toBeGreaterThan(0.2);
      const rampBounds = solidBounds(ramps[0]);
      const halfWidth = architecture.dimensions.width / 2;
      expect(rampBounds.maxX < architecture.origin.x - halfWidth || rampBounds.minX > architecture.origin.x + halfWidth).toBe(true);
      for (const door of architecture.openings.filter((entry) => entry.kind === 'exterior-door')) {
        expect(Math.abs(ramps[0].position[0] - door.centre[0])).toBeGreaterThan(5);
      }
      expect(proxies).toHaveLength(0);
      expect(architecture.solids.some((entry) => (entry.kind as string) === 'stair')).toBe(false);
      expect(architecture.solids.some((entry) => (entry.kind as string) === 'fixture')).toBe(false);
      expect(architecture.solids.length).toBeLessThanOrEqual(52);
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

  it.each([0, 1] as Team[])('climbs and descends the exterior ramp between both upstairs rooms for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const rampRoute = architecture.routes['ramp-room-flow'];
    expect(rampRoute).toBeDefined();
    await traverse(architecture, rampRoute);
    await traverse(architecture, rampRoute, true);
  });

  it.each([0, 1] as Team[])('jump-crouches through every broken ground window in both directions for team %s', async (team) => {
    const facing = team === 0 ? 1 : -1;
    const architecture = createHouseArchitecture(team, 0, 0, facing);
    for (const id of ['front-ground-window', 'rear-ground-window']) {
      const opening = architecture.openings.find((entry) => entry.id === id);
      if (!opening) throw new Error(`Missing ${id}`);
      const outwardZ = (id.startsWith('front') ? facing : -facing) as 1 | -1;
      for (const reverse of [false, true]) {
        const result = await windowTraversal(architecture, opening, outwardZ, reverse);
        expect(result.standingDistance, `${architecture.id}:${id}:${reverse}:standing`).toBeGreaterThan(1.2);
        expect(result.crouchedDistance, `${architecture.id}:${id}:${reverse}:jump-crouch`).toBeLessThan(0.42);
      }
    }
  });
});
