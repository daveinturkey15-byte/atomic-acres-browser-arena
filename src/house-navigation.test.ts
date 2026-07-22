import { describe, expect, it } from 'vitest';
import type { Point3 } from './collision';
import { integrateHorizontalVelocity, movementProfile } from './gameplay';
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

async function sprintUpRamp(
  architecture: HouseArchitecture,
  footId: 'ramp-foot' | 'indoor-ramp-foot',
  topId: 'ramp-top' | 'indoor-ramp-top',
): Promise<{ elapsedSeconds: number; horizontalSpeed: number; final: Point3 }> {
  const foot = anchor(architecture, footId);
  const top = anchor(architecture, topId);
  const dx = top.x - foot.x;
  const dz = top.z - foot.z;
  const rampRun = Math.hypot(dx, dz);
  const uphill = { x: dx / rampRun, z: dz / rampRun };
  const approach = 0.65;
  const start = { x: foot.x - uphill.x * approach, y: 1.7, z: foot.z - uphill.z * approach };
  const physics = await CharacterPhysics.create(
    architecture.solids.filter((entry) => entry.collidable).map(solidBounds),
    { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
  );
  const dt = 1 / 120;
  let grounded = false;
  let velocity = { x: 0, y: 0, z: 0 };
  try {
    physics.teleportEye(start);
    for (let step = 0; step < 30; step += 1) {
      const settled = physics.move({ x: 0, y: -24.5 * dt * dt, z: 0 }, dt);
      grounded = settled.grounded;
    }
    const settledStart = physics.eyePosition();
    for (let step = 1; step <= 360; step += 1) {
      const profile = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded });
      const integrated = integrateHorizontalVelocity(
        { x: velocity.x, z: velocity.z },
        uphill,
        profile,
        dt,
      );
      velocity.x = integrated.x;
      velocity.z = integrated.z;
      velocity.y -= 24.5 * dt;
      if (grounded) velocity.y = Math.max(0, velocity.y);
      const moved = physics.move({ x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt }, dt);
      grounded = moved.grounded;
      if (moved.blockedX && !moved.slopeAdjusted) velocity.x = moved.appliedDelta.x / dt;
      if (moved.blockedY && velocity.y < 0) velocity.y = 0;
      if (moved.blockedZ && !moved.slopeAdjusted) velocity.z = moved.appliedDelta.z / dt;
      const progress = (moved.position.x - settledStart.x) * uphill.x + (moved.position.z - settledStart.z) * uphill.z;
      if (progress >= rampRun + approach - 0.2 && moved.position.y >= top.y - 0.48) {
        const elapsedSeconds = step * dt;
        return { elapsedSeconds, horizontalSpeed: progress / elapsedSeconds, final: moved.position };
      }
    }
    return { elapsedSeconds: 3, horizontalSpeed: 0, final: physics.eyePosition() };
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

  it('keeps sealed edge-abutting upper floors and landings without coplanar top overlaps', () => {
    for (const team of [0, 1] as Team[]) {
      const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
      const ground = architecture.solids.find((entry) => entry.name === 'ground-floor-slab');
      const platforms = architecture.solids.filter((entry) =>
        (entry.kind === 'floor' || entry.kind === 'landing') && entry.position[1] > 3);
      expect(ground).toBeDefined();
      expect(platforms.filter((entry) => entry.kind === 'floor').map((entry) => entry.name).sort()).toEqual([
        'upper-floor-main', 'upper-floor-ramp-front', 'upper-floor-ramp-rear',
      ]);
      expect(platforms.filter((entry) => entry.kind === 'landing').map((entry) => entry.name).sort()).toEqual([
        'interior-ramp-top-landing', 'ramp-top-landing',
      ]);
      if (!ground) throw new Error('Missing declared ground floor solid');
      expect(ground.size[0]).toBeGreaterThanOrEqual(architecture.dimensions.width - 0.2);
      expect(ground.size[2]).toBeGreaterThanOrEqual(architecture.dimensions.depth - 0.2);
      for (let first = 0; first < platforms.length; first += 1) {
        for (let second = first + 1; second < platforms.length; second += 1) {
          const a = solidBounds(platforms[first]);
          const b = solidBounds(platforms[second]);
          const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
          const overlapZ = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
          expect(overlapX * overlapZ, `${architecture.id}:${platforms[first].name}:${platforms[second].name}`).toBeLessThan(1e-8);
        }
      }
    }
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

  it('uses distinct continuous exterior and smaller indoor rendered-and-physical ramps', () => {
    for (const team of [0, 1] as Team[]) {
      const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
      const ramps = architecture.solids.filter((entry) => entry.kind === 'ramp');
      const exterior = ramps.find((entry) => entry.name === 'exterior-access-ramp');
      const interior = ramps.find((entry) => entry.name === 'interior-access-ramp');
      const proxies = architecture.solids.filter((entry) => (entry.kind as string) === 'ramp-proxy');
      expect(ramps).toHaveLength(2);
      expect(exterior).toMatchObject({ collidable: true, surface: 'timber' });
      expect(interior).toMatchObject({ collidable: true, surface: 'timber' });
      if (!exterior || !interior) throw new Error('Missing exterior or indoor ramp');
      expect(exterior.size[0]).toBeGreaterThanOrEqual(2.8);
      expect(interior.size[0]).toBeGreaterThanOrEqual(2.2);
      expect(interior.size[0]).toBeLessThan(exterior.size[0]);
      expect(exterior.rotation && Math.abs(exterior.rotation[0])).toBeGreaterThan(0.2);
      expect(interior.rotation && Math.abs(interior.rotation[0])).toBeGreaterThan(0.3);
      const exteriorBounds = solidBounds(exterior);
      const interiorBounds = solidBounds(interior);
      const exteriorLanding = architecture.solids.find((entry) => entry.name === 'ramp-top-landing');
      const interiorLanding = architecture.solids.find((entry) => entry.name === 'interior-ramp-top-landing');
      if (!exteriorLanding || !interiorLanding) throw new Error('Missing ramp landing');
      for (const [ramp, landing] of [[exterior, exteriorLanding], [interior, interiorLanding]] as const) {
        const angle = Math.abs(ramp.rotation?.[0] ?? 0);
        const uphillZ = -Math.sign(ramp.rotation?.[0] ?? 1);
        const horizontalHalfRun = Math.cos(angle) * ramp.size[2] / 2;
        const rampTopZ = ramp.position[2] + uphillZ * horizontalHalfRun;
        const landingBounds = solidBounds(landing);
        const downhillEdge = uphillZ < 0 ? landingBounds.maxZ : landingBounds.minZ;
        const overlap = Math.abs(downhillEdge - rampTopZ);
        const rampTopSurface = ramp.position[1] + Math.sin(angle) * ramp.size[2] / 2 + Math.cos(angle) * ramp.size[1] / 2;
        const landingTop = landing.position[1] + landing.size[1] / 2;
        const transitionLip = landingTop - (rampTopSurface - Math.tan(angle) * overlap);
        expect(overlap, `${architecture.id}:${ramp.name}:landing-overlap`).toBeLessThanOrEqual(0.08);
        expect(transitionLip, `${architecture.id}:${ramp.name}:landing-lip`).toBeLessThan(0.1);
      }
      const halfWidth = architecture.dimensions.width / 2;
      expect(exteriorBounds.maxX < architecture.origin.x - halfWidth || exteriorBounds.minX > architecture.origin.x + halfWidth).toBe(true);
      expect(interiorBounds.minX).toBeGreaterThan(architecture.origin.x - halfWidth);
      expect(interiorBounds.maxX).toBeLessThan(architecture.origin.x + halfWidth);
      const indoorRails = architecture.solids.filter((entry) => entry.name.startsWith('interior-ramp-rail-'));
      expect(indoorRails).toHaveLength(2);
      for (const rail of indoorRails) {
        const sideGap = Math.abs(rail.position[0] - interior.position[0]) - (rail.size[0] + interior.size[0]) / 2;
        expect(sideGap, `${architecture.id}:${rail.name}:ramp-side-gap`).toBeGreaterThanOrEqual(0.025);
      }
      for (const door of architecture.openings.filter((entry) => entry.kind === 'exterior-door')) {
        expect(Math.abs(exterior.position[0] - door.centre[0])).toBeGreaterThan(5);
      }
      expect(proxies).toHaveLength(0);
      expect(architecture.solids.some((entry) => (entry.kind as string) === 'stair')).toBe(false);
      expect(architecture.solids.some((entry) => (entry.kind as string) === 'fixture')).toBe(false);
      expect(architecture.solids.length).toBeLessThanOrEqual(60);
    }
  });

  it('keeps ground windows breakable while sealing the dark upper facade panel', () => {
    for (const team of [0, 1] as Team[]) {
      const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
      const glass = architecture.solids.filter((entry) => entry.kind === 'glass');
      expect(glass).toHaveLength(3);
      expect(new Set(glass.map((entry) => entry.id)).size).toBe(3);
      expect(glass.filter((entry) => entry.breakable)).toHaveLength(2);
      const upper = glass.find((entry) => entry.name === 'upper-window-glass');
      expect(upper).toMatchObject({ collidable: true, breakable: false });
      expect(architecture.openings.find((entry) => entry.id === 'upper-window')?.route).toBe(false);
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

  it.each([0, 1] as Team[])('climbs and descends the smaller indoor ramp for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const rampRoute = architecture.routes['indoor-ramp-room-flow'];
    expect(rampRoute).toBeDefined();
    await traverse(architecture, rampRoute);
    await traverse(architecture, rampRoute, true);
  });

  it.each([0, 1] as Team[])('preserves responsive sprint speed up both ramps for team %s', async (team) => {
    const architecture = createHouseArchitecture(team, 0, 0, team === 0 ? 1 : -1);
    const exterior = await sprintUpRamp(architecture, 'ramp-foot', 'ramp-top');
    const interior = await sprintUpRamp(architecture, 'indoor-ramp-foot', 'indoor-ramp-top');
    expect(exterior.elapsedSeconds, `${architecture.id}:exterior:${JSON.stringify(exterior)}`).toBeLessThan(1.9);
    expect(exterior.horizontalSpeed, `${architecture.id}:exterior`).toBeGreaterThan(6.5);
    expect(interior.elapsedSeconds, `${architecture.id}:interior:${JSON.stringify(interior)}`).toBeLessThan(1.5);
    expect(interior.horizontalSpeed, `${architecture.id}:interior`).toBeGreaterThan(5.6);
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
