import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Box2, Point3 } from './collision';
import { isBlocked, pointInsideBounds, segmentIntersectsBox } from './collision';
import {
  HIGH_SEAS_BOUNDS,
  HIGH_SEAS_ENGINE_ACCESS,
  HIGH_SEAS_LEVELS,
  HIGH_SEAS_SAFETY_FLOOR_Y,
  buildHighSeas,
  getHighSeasMaterialInventory,
  HIGH_SEAS_TILE_METRES,
  type HighSeasPortal,
  type HighSeasRouteAnchor,
} from './high-seas';
import { movementProfile, PLAYER_JUMP_GRAVITY, SIMULATION_HZ } from './gameplay';
import { CharacterPhysics, STANCE_SHAPES } from './physics';
import type { ArenaVerticalNavigation } from './vertical-navigation';
import { authoredElevationAt } from './vertical-navigation';

type PortalAudit = Readonly<{
  id: string;
  movementBlockers: number;
  shotBlockers: number;
  opaquePresentationBlockers: number;
  opaquePresentationBlockerNames: readonly string[];
}>;

type SupportAudit = Readonly<{
  version: string;
  engineFloor: Readonly<{
    y: number;
    physicsAuthority: string;
    presentationName: string;
  }>;
  platforms: readonly Readonly<{
    id: string;
    presentationName: string;
    bounds: Box2;
    y: number;
    navigation: 'bot' | 'player-only';
    movementAuthority: boolean;
    physicsAuthority: boolean;
    shotAuthority: boolean;
  }>[];
}>;

type AuthorityAuditEntry = Readonly<{
  name: string;
  bounds: Box2;
  solid: boolean;
  shots: boolean;
  movementAuthority: boolean;
  physicsAuthority: boolean;
  raycastAuthority: boolean;
  ballisticAuthority: boolean;
  ballisticSurfaceId: string | null;
  externalPhysicsAuthority: string | null;
}>;

function routeRecord(root: THREE.Object3D): Readonly<Record<string, readonly HighSeasRouteAnchor[]>> {
  return root.userData.highSeasRoutes as Readonly<Record<string, readonly HighSeasRouteAnchor[]>>;
}

function navigation(root: THREE.Object3D): ArenaVerticalNavigation {
  return root.userData.verticalNavigation as ArenaVerticalNavigation;
}

function distanceXZ(left: THREE.Vector3, right: THREE.Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function volumeIntersects(left: HighSeasPortal['aperture'], right: Box2): boolean {
  const epsilon = 1e-4;
  return left.minX < right.maxX - epsilon && left.maxX > right.minX + epsilon
    && left.minY < (right.maxY ?? Number.POSITIVE_INFINITY) - epsilon
    && left.maxY > (right.minY ?? Number.NEGATIVE_INFINITY) + epsilon
    && left.minZ < right.maxZ - epsilon && left.maxZ > right.minZ + epsilon;
}

function pointHasPlatformSupport(point: THREE.Vector3, platforms: SupportAudit['platforms']): boolean {
  return platforms.some((platform) => point.x >= platform.bounds.minX - 1e-6
    && point.x <= platform.bounds.maxX + 1e-6
    && point.z >= platform.bounds.minZ - 1e-6
    && point.z <= platform.bounds.maxZ + 1e-6
    && Math.abs(platform.y - (point.y - 1.7)) < 1e-6);
}

function visibleGeometryBudget(root: THREE.Object3D): { draws: number; triangles: number } {
  let draws = 0;
  let triangles = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((entry) => entry.visible)) return;
    draws += node instanceof THREE.InstancedMesh ? node.count : 1;
    const geometry = node.geometry;
    const primitiveTriangles = geometry.index
      ? geometry.index.count / 3
      : (geometry.getAttribute('position')?.count ?? 0) / 3;
    triangles += primitiveTriangles * (node instanceof THREE.InstancedMesh ? node.count : 1);
  });
  return { draws, triangles };
}

function eyeForFeet(position: readonly [number, number, number]): Point3 {
  const shape = STANCE_SHAPES.stand;
  const eyeHeight = shape.halfHeight + shape.radius + shape.eyeFromCenter;
  return { x: position[0], y: position[1] + eyeHeight, z: position[2] };
}

async function walkToward(physics: CharacterPhysics, target: Point3, maxSteps = 2_800): Promise<Point3> {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = physics.eyePosition();
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.17 && Math.abs(target.y - current.y) < 0.42) return current;
    const amount = Math.min(0.034, distance);
    physics.move({
      x: distance > 0 ? dx / distance * amount : 0,
      y: -0.004,
      z: distance > 0 ? dz / distance * amount : 0,
    }, 1 / 120);
  }
  return physics.eyePosition();
}

async function traverseFeetRoute(
  physics: CharacterPhysics,
  anchors: readonly HighSeasRouteAnchor[],
  reverse = false,
): Promise<void> {
  const ordered = reverse ? [...anchors].reverse() : [...anchors];
  physics.teleportEye(eyeForFeet(ordered[0].position));
  for (const anchor of ordered.slice(1)) {
    const target = eyeForFeet(anchor.position);
    const result = await walkToward(physics, target);
    expect(
      Math.hypot(result.x - target.x, result.z - target.z),
      `${anchor.id}: horizontal result=${JSON.stringify(result)} target=${JSON.stringify(target)}`,
    ).toBeLessThan(0.58);
    expect(Math.abs(result.y - target.y), `${anchor.id}: vertical result=${JSON.stringify(result)}`).toBeLessThan(0.58);
  }
}

async function sprintJump(
  physics: CharacterPhysics,
  start: Point3,
  direction: Readonly<{ x: number; z: number }>,
): Promise<Readonly<{ positions: readonly Point3[]; maximumFeetY: number }>> {
  const dt = 1 / SIMULATION_HZ;
  const profile = movementProfile({ crouched: false, ads: false, sprinting: true, grounded: true });
  const length = Math.hypot(direction.x, direction.z);
  const horizontal = {
    x: direction.x / length * profile.maxSpeed,
    z: direction.z / length * profile.maxSpeed,
  };
  physics.teleportEye(start);
  let verticalVelocity = profile.jumpVelocity;
  let maximumFeetY = start.y - 1.7;
  const positions: Point3[] = [];
  for (let frame = 0; frame < 120; frame += 1) {
    const movement = physics.move({
      x: horizontal.x * dt,
      y: verticalVelocity * dt,
      z: horizontal.z * dt,
    }, dt);
    positions.push({ ...movement.position });
    maximumFeetY = Math.max(maximumFeetY, movement.position.y - 1.7);
    verticalVelocity += PLAYER_JUMP_GRAVITY * dt;
    if (movement.grounded && frame > 4) break;
  }
  return Object.freeze({ positions: Object.freeze(positions), maximumFeetY });
}

describe('High Seas clean-room arena geometry', () => {
  it('freezes the arena identity, bounds, elevations, yacht zones, and shared-water boundary', () => {
    const scene = new THREE.Scene();
    const map = buildHighSeas(scene);
    expect(map.id).toBe('high-seas');
    expect(map.label).toBe('High Seas');
    expect(map.bounds).toEqual(HIGH_SEAS_BOUNDS);
    expect(HIGH_SEAS_LEVELS).toEqual({ engine: 0, mainDeck: 3.2, upperDeck: 6.2, roof: 8.92, ocean: -2.2 });
    expect(scene.children).toContain(map.root);
    expect(map.root.getObjectByName('high-seas-sculpted-hull')).toBeInstanceOf(THREE.Mesh);
    expect(map.root.getObjectByName('high-seas-bow-cabin-roof')).toBeInstanceOf(THREE.Mesh);
    expect(map.root.getObjectByName('high-seas-stern-cabin-roof')).toBeInstanceOf(THREE.Mesh);
    expect(map.root.getObjectByName('high-seas-hot-tub-contained-water')?.userData.waterScope).toBe('contained-feature-only');
    expect(map.root.getObjectByName('high-seas-stern-pool-contained-water')?.userData.waterScope).toBe('contained-feature-only');
    expect(map.root.children.some((node) => node.name.includes('ocean-plane'))).toBe(false);
    expect(map.root.userData.highSeasProvenance).toMatchObject({
      ownership: 'original-procedural',
      copiedAssets: [],
      surroundingWaterAuthority: 'shared-water-authoring-path',
      expectedWaveEnvelope: { minimumY: -2.55, maximumY: -1.85 },
      safetyFloorY: HIGH_SEAS_SAFETY_FLOOR_Y,
    });
    expect(map.physicsSafetyFloorY).toBe(HIGH_SEAS_SAFETY_FLOOR_Y);
  });

  it('places six supported and well-separated opposed spawns at main-deck eye height', () => {
    const map = buildHighSeas(new THREE.Scene());
    const support = map.root.userData.highSeasSupportAudit as SupportAudit;
    expect(map.spawns[0]).toHaveLength(6);
    expect(map.spawns[1]).toHaveLength(6);
    for (const team of [0, 1] as const) {
      for (const spawn of map.spawns[team]) {
        expect(spawn.y).toBeCloseTo(4.9);
        expect(pointInsideBounds(spawn, map.bounds, 0.5)).toBe(true);
        expect(isBlocked(spawn, map.colliders, STANCE_SHAPES.stand.radius), `${team}:${spawn.toArray()}`).toBe(false);
        expect(pointHasPlatformSupport(spawn, support.platforms), `${team}:${spawn.toArray()}:support`).toBe(true);
      }
      for (let first = 0; first < map.spawns[team].length; first += 1) {
        for (let second = first + 1; second < map.spawns[team].length; second += 1) {
          expect(distanceXZ(map.spawns[team][first], map.spawns[team][second])).toBeGreaterThanOrEqual(6);
        }
      }
    }
    for (let index = 0; index < map.spawns[0].length; index += 1) {
      expect(map.spawns[1][index].x).toBeCloseTo(-map.spawns[0][index].x);
      expect(map.spawns[1][index].z).toBeCloseTo(-map.spawns[0][index].z);
    }

    // Rotational symmetry of the POINTS is not the same as symmetry of what is
    // AROUND them. The hull tapers at the bow and does not at the stern, so a
    // mirrored pair of coordinates can still hand one team a pointed funnel and
    // the other an open transom. Measure it: count how many of eight compass
    // bearings from each spawn land on walkable deck, and compare a spawn with
    // its 180-degree twin.
    //
    // At z = +/-42.2 the pair scored 5 open bearings at the stern against 4
    // (at 1.5 m) and 5 against 3 (at 2.5 m) at the bow, because the bow twins
    // stood on the 8 m tapered tip with 0.94 m to the rail. They now sit at
    // z = +/-40.2 and score an exact 6/6 at both ends.
    const openBearings = (spawn: THREE.Vector3, reach: number): number => {
      let open = 0;
      for (let step = 0; step < 8; step += 1) {
        const theta = step * Math.PI / 4;
        const probe = new THREE.Vector3(spawn.x + Math.cos(theta) * reach, spawn.y, spawn.z + Math.sin(theta) * reach);
        if (!isBlocked(probe, map.colliders, STANCE_SHAPES.stand.radius)
          && pointHasPlatformSupport(probe, support.platforms)) open += 1;
      }
      return open;
    };
    for (let index = 0; index < map.spawns[0].length; index += 1) {
      const stern = map.spawns[0][index];
      const bow = map.spawns[1][index];
      for (const reach of [1.5, 2.5]) {
        const delta = Math.abs(openBearings(stern, reach) - openBearings(bow, reach));
        // 2 is the measured residue on the OUTBOARD pair at (+/-9, +/-40),
        // where the bow-shoulder rail closes a bearing that the flat stern
        // transom leaves open. Equalising it means re-siting all six spawns
        // (that pair is exactly 6 m from its neighbour, so it cannot move
        // alone), which is a bigger change to spawn distance and flow than
        // this belongs in - it is reported rather than silently done. This
        // bound stops it getting worse.
        expect(delta, `spawn pair ${index} at reach ${reach} m: bow/stern openness must not diverge`).toBeLessThanOrEqual(2);
      }
    }
    // The pair that WAS the worst offender is now exactly fair, and that is
    // pinned so a later deck edit cannot quietly undo it.
    for (const index of [2, 3]) {
      for (const reach of [1.5, 2.5]) {
        expect(
          openBearings(map.spawns[0][index], reach),
          `inboard spawn pair ${index} must be exactly symmetric at reach ${reach} m`,
        ).toBe(openBearings(map.spawns[1][index], reach));
      }
    }
  });

  it('keeps every authored blocker aligned across movement, physics, raycast, and ballistic authority', () => {
    const map = buildHighSeas(new THREE.Scene());
    const authority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    expect(authority.length).toBeGreaterThan(80);
    expect(authority.filter((entry) => entry.solid).length).toBe(map.colliders.length);
    expect(map.physicsColliders).toHaveLength(map.colliders.length);
    expect(authority.every((entry) => entry.movementAuthority
      && entry.physicsAuthority
      && entry.raycastAuthority
      && entry.ballisticAuthority)).toBe(true);
    expect(map.shotSurfaces.every((surface) => surface.classification === 'explicit')).toBe(true);
    expect(new Set(map.shotSurfaces.map((surface) => surface.id)).size).toBe(map.shotSurfaces.length);
    expect(authority.filter((entry) => !entry.solid && entry.shots)).toEqual([]);
    expect(authority.find((entry) => entry.name === 'high-seas-platform-engine-floor')).toMatchObject({
      solid: true,
      shots: true,
      movementAuthority: true,
      physicsAuthority: true,
      externalPhysicsAuthority: null,
    });
    for (const cover of map.physicalCover) {
      expect(map.colliders).toContain(cover.bounds);
      expect(map.physicsColliders).toContain(cover.bounds);
      const entry = authority.find((candidate) => candidate.name === cover.id);
      expect(entry).toMatchObject({ solid: true, shots: true, ballisticAuthority: true });
    }
    expect(map.physicalCover.length).toBeGreaterThanOrEqual(26);
  });

  it('keeps all declared doors, sight apertures, and engine mouths genuinely open', () => {
    const map = buildHighSeas(new THREE.Scene());
    const portals = map.root.userData.highSeasPortals as readonly HighSeasPortal[];
    const audit = map.root.userData.highSeasPortalAudit as readonly PortalAudit[];
    // 14 since HF-392 (commit 220eae68): the two upper-inner end windows are
    // now glazed, shot-authoritative bays. The portal audit pins apertures as
    // genuinely open and glazed is not open, so their old 'sightline'
    // declarations were deliberately removed (16 -> 14). Their absence is
    // pinned explicitly: a bare hole must never silently return while the
    // glazing panes exist.
    expect(portals).toHaveLength(14);
    const portalIds = portals.map((portal) => portal.id);
    expect(portalIds).not.toContain('bow-upper-inner-window');
    expect(portalIds).not.toContain('stern-upper-inner-window');
    expect(audit.map((entry) => entry.id)).toEqual(portals.map((entry) => entry.id));
    for (const portal of portals) {
      expect(map.physicsColliders.filter((bounds) => volumeIntersects(portal.aperture, bounds)), portal.id).toHaveLength(0);
      expect(map.shotSurfaces.filter((surface) => volumeIntersects(portal.aperture, surface.bounds)), portal.id).toHaveLength(0);
    }
    expect(audit.every((entry) => entry.movementBlockers === 0
      && entry.shotBlockers === 0
      && entry.opaquePresentationBlockers === 0
      && entry.opaquePresentationBlockerNames.length === 0)).toBe(true);
  });

  it('retains engine, main, and upper support with all six authored vertical links', () => {
    const map = buildHighSeas(new THREE.Scene());
    const authored = navigation(map.root);
    const support = map.root.userData.highSeasSupportAudit as SupportAudit;
    expect(support.version).toBe('pass75-shared-platform-authority-v1');
    expect(support.engineFloor).toEqual({
      y: 0,
      physicsAuthority: 'high-seas-platform-engine-floor',
      presentationName: 'high-seas-platform-engine-floor',
    });
    expect(support.platforms.every((entry) => entry.movementAuthority && entry.physicsAuthority && entry.shotAuthority)).toBe(true);
    expect(support.platforms.some((entry) => entry.y === HIGH_SEAS_LEVELS.mainDeck)).toBe(true);
    expect(support.platforms.some((entry) => entry.y === HIGH_SEAS_LEVELS.upperDeck && entry.id.startsWith('bow-upper'))).toBe(true);
    expect(support.platforms.some((entry) => entry.y === HIGH_SEAS_LEVELS.upperDeck && entry.id.startsWith('stern-upper'))).toBe(true);
    expect(authored.routes.map((route) => route.id)).toEqual([
      'bow-engine-access',
      'stern-engine-access',
      'bow-internal-stair',
      'bow-external-stair',
      'stern-internal-stair',
      'stern-external-stair',
    ]);
    expect(authored.ramps.map((ramp) => ramp.id)).toEqual(authored.routes.map((route) => route.id));
    expect(authored.platforms.some((entry) => entry.y === HIGH_SEAS_LEVELS.upperDeck)).toBe(true);
    expect(map.root.userData.highSeasAccess.upperStoreys).toBe('bot-pursuit-capable-no-routine-patrols');
    expect(map.patrolPoints.every((point) => point.y === HIGH_SEAS_LEVELS.engine || point.y === HIGH_SEAS_LEVELS.mainDeck)).toBe(true);
    expect(map.patrolPoints.some((point) => point.y === HIGH_SEAS_LEVELS.upperDeck)).toBe(false);

    expect(authoredElevationAt(authored, { x: 0, y: 0, z: 0 }, 0)).toBe(0);
    expect(authoredElevationAt(authored, { x: 0, y: 1.6, z: -22.2 }, 1.6)).toBeCloseTo(1.6, 1);
    expect(authoredElevationAt(authored, { x: 8, y: 3.2, z: 8 }, 3.2)).toBeCloseTo(3.2);
  });

  it('connects engine to main deck and main deck to both upper cabins as a three-level graph', () => {
    const map = buildHighSeas(new THREE.Scene());
    const authored = navigation(map.root);
    type Node = 'engine' | 'main' | 'bow-upper' | 'stern-upper';
    const adjacency = new Map<Node, Set<Node>>([
      ['engine', new Set<Node>()],
      ['main', new Set<Node>()],
      ['bow-upper', new Set<Node>()],
      ['stern-upper', new Set<Node>()],
    ]);
    const levelNode = (id: string, y: number): Node => {
      if (y === HIGH_SEAS_LEVELS.engine) return 'engine';
      if (y === HIGH_SEAS_LEVELS.mainDeck) return 'main';
      return id.startsWith('bow-') ? 'bow-upper' : 'stern-upper';
    };
    for (const route of authored.routes) {
      const from = levelNode(route.id, route.foot[1]);
      const to = levelNode(route.id, route.top[1]);
      adjacency.get(from)?.add(to);
      adjacency.get(to)?.add(from);
    }
    const reached = new Set<Node>(['engine']);
    const pending: Node[] = ['engine'];
    while (pending.length > 0) {
      const current = pending.shift();
      if (!current) break;
      for (const next of adjacency.get(current) ?? []) {
        if (reached.has(next)) continue;
        reached.add(next);
        pending.push(next);
      }
    }
    expect([...reached].sort()).toEqual(['bow-upper', 'engine', 'main', 'stern-upper']);
    expect(adjacency.get('main')).toEqual(new Set<Node>(['engine', 'bow-upper', 'stern-upper']));
  });

  it('preserves three readable surface lanes and a full-length engine route', () => {
    const map = buildHighSeas(new THREE.Scene());
    const routes = routeRecord(map.root);
    for (const id of ['surface-port', 'surface-center', 'surface-starboard'] as const) {
      expect(routes[id].length).toBeGreaterThanOrEqual(7);
      for (const anchor of routes[id]) {
        const eye = eyeForFeet(anchor.position);
        expect(isBlocked(eye, map.colliders, STANCE_SHAPES.stand.radius), `${id}:${anchor.id}`).toBe(false);
      }
    }
    expect(routes['engine-through-route'][0].position).toEqual(HIGH_SEAS_ENGINE_ACCESS.bowTop);
    expect(routes['engine-through-route'].at(-1)?.position).toEqual(HIGH_SEAS_ENGINE_ACCESS.sternTop);
    expect(routes['engine-through-route'].filter((anchor) => anchor.position[1] === 0).length).toBeGreaterThanOrEqual(5);
  });

  it('walks the complete engine shortcut in both directions with Rapier-backed collision', async () => {
    const map = buildHighSeas(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      const route = routeRecord(map.root)['engine-through-route'];
      await traverseFeetRoute(physics, route);
      await traverseFeetRoute(physics, route, true);
    } finally {
      physics.dispose();
    }
  }, 30_000);

  it('walks an internal and external upper access for each cabin in both directions', async () => {
    const map = buildHighSeas(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      const routes = routeRecord(map.root);
      for (const id of [
        'bow-upper-internal-player',
        'bow-upper-external-player',
        'stern-upper-internal-player',
        'stern-upper-external-player',
      ] as const) {
        await traverseFeetRoute(physics, routes[id]);
        await traverseFeetRoute(physics, routes[id], true);
      }
    } finally {
      physics.dispose();
    }
  }, 45_000);

  it('closes the tapered bow shoulder and keeps the fail-safe floor below the ocean', async () => {
    const map = buildHighSeas(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      physics.teleportEye({ x: 8, y: 4.9, z: -40 });
      for (let step = 0; step < 140; step += 1) physics.move({ x: 0, y: -0.01, z: -0.02 }, 1 / 120);
      const blockedAtShoulder = physics.eyePosition();
      expect(blockedAtShoulder.z).toBeGreaterThan(-40.3);
      expect(blockedAtShoulder.y).toBeGreaterThan(4.7);

      physics.teleportEye({ x: 8, y: 4.9, z: -42.8 });
      for (let step = 0; step < 220; step += 1) physics.move({ x: 0, y: -0.04, z: 0 }, 1 / 120);
      const overboard = physics.eyePosition();
      expect(overboard.y).toBeLessThan(HIGH_SEAS_LEVELS.ocean);
      expect(overboard.y).toBeGreaterThan(HIGH_SEAS_SAFETY_FLOOR_Y);

      const underwaterEdges = [
        { start: { x: 11.2, y: -3, z: 0 }, delta: { x: 0.03, y: 0, z: 0 }, axis: 'x', maximum: HIGH_SEAS_BOUNDS.maxX },
        { start: { x: -11.2, y: -3, z: 0 }, delta: { x: -0.03, y: 0, z: 0 }, axis: 'x', minimum: HIGH_SEAS_BOUNDS.minX },
        { start: { x: 0, y: -3, z: 43.2 }, delta: { x: 0, y: 0, z: 0.03 }, axis: 'z', maximum: HIGH_SEAS_BOUNDS.maxZ },
        { start: { x: 0, y: -3, z: -43.2 }, delta: { x: 0, y: 0, z: -0.03 }, axis: 'z', minimum: HIGH_SEAS_BOUNDS.minZ },
      ] as const;
      for (const edge of underwaterEdges) {
        physics.teleportEye(edge.start);
        for (let step = 0; step < 120; step += 1) physics.move(edge.delta, 1 / 120);
        const result = physics.eyePosition()[edge.axis];
        if ('maximum' in edge) expect(result).toBeLessThan(edge.maximum);
        if ('minimum' in edge) expect(result).toBeGreaterThan(edge.minimum);
      }
    } finally {
      physics.dispose();
    }
  }, 30_000);

  it('contains real sprint-jumps at representative outer rails without invisible extensions', async () => {
    const map = buildHighSeas(new THREE.Scene());
    const visibleRailAuthority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    const renderedRails = visibleRailAuthority.filter((entry) => entry.name.startsWith('high-seas-perimeter-rail-'));
    expect(renderedRails).toHaveLength(10);
    for (const rail of renderedRails) {
      expect((rail.bounds.maxY ?? 0) - (rail.bounds.minY ?? 0)).toBeCloseTo(1.04);
      expect(rail.shots).toBe(true);
    }

    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      const cases = [
        { id: 'bow-shoulder', start: { x: 8, y: 4.9, z: -38.28 }, direction: { x: 0, z: -1 }, inside: (position: Point3) => position.z > -40.3 },
        { id: 'bow-seam-diagonal', start: { x: 7.15, y: 4.9, z: -38.45 }, direction: { x: 0.38, z: -1 }, inside: (position: Point3) => position.z > -40.3 && position.x < 10.1 },
        { id: 'starboard', start: { x: 8.08, y: 4.9, z: 8 }, direction: { x: 1, z: 0 }, inside: (position: Point3) => position.x < 10.05 },
        { id: 'port-catwalk', start: { x: -9.5, y: 4.9, z: 0 }, direction: { x: -1, z: 0 }, inside: (position: Point3) => position.x > -11.45 },
        { id: 'stern', start: { x: 0, y: 4.9, z: 41.2 }, direction: { x: 0, z: 1 }, inside: (position: Point3) => position.z < 43.2 },
      ] as const;
      for (const entry of cases) {
        const result = await sprintJump(physics, entry.start, entry.direction);
        expect(result.maximumFeetY, entry.id).toBeGreaterThan(HIGH_SEAS_LEVELS.mainDeck + 0.7);
        expect(result.positions.every(entry.inside), entry.id).toBe(true);
        expect(result.positions.at(-1)?.y, entry.id).toBeGreaterThan(HIGH_SEAS_LEVELS.ocean);
      }
    } finally {
      physics.dispose();
    }
  }, 30_000);

  it('stays beneath the geometry budget and exposes deterministic review viewpoints', () => {
    const map = buildHighSeas(new THREE.Scene());
    const budget = visibleGeometryBudget(map.root);
    expect(budget.draws).toBeLessThanOrEqual(260);
    expect(budget.triangles).toBeLessThanOrEqual(350_000);
    const cameras = map.root.userData.highSeasReviewCameras as readonly Readonly<{
      id: string;
      position: readonly number[];
      target: readonly number[];
      purpose: string;
    }>[];
    expect(new Set(cameras.map((camera) => camera.id)).size).toBe(cameras.length);
    expect(cameras.length).toBeGreaterThanOrEqual(7);
    expect(cameras.some((camera) => camera.purpose === 'light-occlusion')).toBe(true);
    expect(cameras.every((camera) => camera.position.length === 3
      && camera.target.length === 3
      && [...camera.position, ...camera.target].every(Number.isFinite))).toBe(true);
  });

  it('frames the upper side windows as glazed, shot-authoritative bays (HF-392)', () => {
    // The owner: "issues with the windows in the top of the ship". Every side
    // pane used to be rotated 90 degrees - a 2.6 m glass fin perpendicular to
    // the wall, jutting into the room and out over the water - while the bay
    // behind it stayed open air a player could walk out through, and the pane
    // itself was presentation-only so shots never interacted with it.
    const scene = new THREE.Scene();
    const map = buildHighSeas(scene);
    map.root.updateMatrixWorld(true);
    const glazing: THREE.Mesh[] = [];
    const bands: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (/-upper-(port|starboard)-glazing-/.test(node.name)) glazing.push(node);
      if (/-upper-(port|starboard)-window-(sill|header)$/.test(node.name)) bands.push(node);
    });
    // Two cabins x two sides x five bays (three between the mullions plus the
    // two strips between the outermost mullions and the end walls).
    expect(glazing).toHaveLength(20);
    // Two cabins x two sides x one sill + one header band.
    expect(bands).toHaveLength(8);
    const authority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    const materialOf = (name: string): string | undefined => {
      const entry = authority.find((candidate) => candidate.name === name);
      if (!entry?.ballisticSurfaceId) return undefined;
      return map.shotSurfaces.find((surface) => surface.id === entry.ballisticSurfaceId)?.material;
    };
    for (const pane of glazing) {
      const bounds = new THREE.Box3().setFromObject(pane);
      // A side pane lies IN the +/-x wall plane: thin across X, long along Z.
      expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(0.1);
      expect(bounds.max.z - bounds.min.z).toBeGreaterThan(1.2);
      // Glazing lives inside the aperture band between sill and header.
      expect(bounds.min.y).toBeGreaterThanOrEqual(HIGH_SEAS_LEVELS.upperDeck);
      expect(bounds.max.y).toBeLessThanOrEqual(HIGH_SEAS_LEVELS.upperDeck + 2.6);
      expect(materialOf(pane.name), pane.name).toBe('glass');
      // The pane's own centre must be movement-solid: before the fix every bay
      // centre at eye height was walk-through open air.
      const centre = bounds.getCenter(new THREE.Vector3());
      expect(
        map.colliders.some((b) => centre.x >= b.minX && centre.x <= b.maxX
          && centre.y >= (b.minY ?? Number.NEGATIVE_INFINITY) && centre.y <= (b.maxY ?? Number.POSITIVE_INFINITY)
          && centre.z >= b.minZ && centre.z <= b.maxZ),
        pane.name,
      ).toBe(true);
    }
    for (const band of bands) {
      const bounds = new THREE.Box3().setFromObject(band);
      // Each band runs the full cabin between the end walls.
      expect(bounds.max.z - bounds.min.z).toBeGreaterThan(15);
      expect(materialOf(band.name), band.name).toBe('interior-wall');
    }
    // HF-392 residual-slit closure (pass 80). The first glazing pass inset
    // every pane 3 cm per edge inside framing that did not compensate, leaving
    // eight 0.06 m open slots per cabin side (32 ship-wide) at the mullion
    // edges and a 1 cm slit above and below EVERY pane - open air with no
    // mesh, no shot surface and no collider, reading as daylight lines from
    // inside. Panes, mullions and the end-wall inner faces must now TILE each
    // aperture band: any gap between adjacent coverage may not exceed the
    // deliberate 4 mm anti-coplanar inset.
    const MAX_OPEN_GAP_M = 0.005;
    const BAND_BOTTOM = HIGH_SEAS_LEVELS.upperDeck + 0.46; // sill top
    const BAND_TOP = HIGH_SEAS_LEVELS.upperDeck + 2.6 - 0.54; // header bottom
    for (const end of ['bow', 'stern'] as const) {
      const centreZ = end === 'bow' ? -21 : 21;
      for (const side of ['port', 'starboard'] as const) {
        const segments: Array<{ minimum: number; maximum: number; name: string }> = [];
        map.root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const isPane = node.name.startsWith(`high-seas-${end}-upper-${side}-glazing`);
          const isMullion = node.name.startsWith(`high-seas-${end}-upper-${side}-mullion`);
          if (!isPane && !isMullion) return;
          const bounds = new THREE.Box3().setFromObject(node);
          segments.push({ minimum: bounds.min.z - centreZ, maximum: bounds.max.z - centreZ, name: node.name });
        });
        segments.sort((left, right) => left.minimum - right.minimum);
        let cursor = -7.89; // end-wall inner face offset from the cabin centre
        for (const segment of segments) {
          expect(segment.minimum - cursor, `gap before ${segment.name} on ${end}/${side}`).toBeLessThanOrEqual(MAX_OPEN_GAP_M);
          cursor = Math.max(cursor, segment.maximum);
        }
        expect(7.89 - cursor, `uncovered band tail on ${end}/${side}`).toBeLessThanOrEqual(MAX_OPEN_GAP_M);
      }
      // Every pane must meet BOTH frame faces within twice the inset: the old
      // panes floated a full centimetre clear of sill and header.
      map.root.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (!node.name.startsWith(`high-seas-${end}-upper-`) || !node.name.includes('glazing')) return;
        const bounds = new THREE.Box3().setFromObject(node);
        expect(bounds.min.y, `${node.name} sill-side slit`).toBeLessThanOrEqual(BAND_BOTTOM + 0.005);
        expect(bounds.max.y, `${node.name} header-side slit`).toBeGreaterThanOrEqual(BAND_TOP - 0.005);
      });
      // The forward face of each deckhouse is now a framed windscreen either
      // side of the upper external door, instead of blank solid wall.
      const windscreens: THREE.Mesh[] = [];
      map.root.traverse((node) => {
        if (node instanceof THREE.Mesh && node.name.startsWith(`high-seas-${end}-upper-windscreen-`) && node.name.includes('-glass')) windscreens.push(node);
      });
      expect(windscreens.length, `${end} windscreen panes`).toBeGreaterThanOrEqual(2);
      for (const pane of windscreens) {
        const bounds = new THREE.Box3().setFromObject(pane);
        expect(bounds.max.z - bounds.min.z, `${pane.name} lies in the end-wall plane`).toBeLessThanOrEqual(0.1);
        expect(bounds.max.x - bounds.min.x, `${pane.name} spans its flank`).toBeGreaterThan(1.2);
        expect(materialOf(pane.name), pane.name).toBe('glass');
      }
      // HF-392 pass 82: the 4.4 m inner end opening used to carry ONE
      // unbroken pane - the last mullion-free face on the ship, reading as a
      // single dead dark slab from the deck approaches while every other face
      // carries the mullion rhythm. A centre mullion now splits it into two
      // bays, and mullion + panes must TILE the opening less the deliberate
      // 4 mm anti-coplanar inset. Strictness note: this replaces the old
      // single-pane width pin (>= 4.39 m) - a two-bay split would have failed
      // that pin, so the new assertions are a contract change, not a loosening.
      const innerBays: THREE.Mesh[] = [];
      map.root.traverse((node) => {
        if (node instanceof THREE.Mesh && node.name.startsWith(`high-seas-${end}-upper-inner-glazing-`)) innerBays.push(node);
      });
      expect(innerBays, `${end} inner end bays`).toHaveLength(2);
      const innerSegments: Array<{ minimum: number; maximum: number; name: string }> = [];
      map.root.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const isPane = node.name.startsWith(`high-seas-${end}-upper-inner-glazing-`);
        const isMullion = node.name === `high-seas-${end}-upper-inner-mullion`;
        if (!isPane && !isMullion) return;
        const bounds = new THREE.Box3().setFromObject(node);
        if (isPane) {
          expect(bounds.max.x - bounds.min.x, `${node.name} bay width`).toBeGreaterThan(1.2);
          expect(materialOf(node.name), node.name).toBe('glass');
        }
        innerSegments.push({ minimum: bounds.min.x, maximum: bounds.max.x, name: node.name });
      });
      innerSegments.sort((left, right) => left.minimum - right.minimum);
      expect(innerSegments[0].minimum, `${end} inner band left edge`).toBeLessThanOrEqual(-2.2 + 0.005);
      let innerCursor = innerSegments[0].minimum;
      for (const segment of innerSegments) {
        expect(segment.minimum - innerCursor, `gap before ${segment.name} on ${end} inner end`).toBeLessThanOrEqual(0.005);
        innerCursor = Math.max(innerCursor, segment.maximum);
      }
      expect(2.2 - innerCursor, `${end} inner band right tail`).toBeLessThanOrEqual(0.005);
    }
  });

  it('keeps the deckhouse window framing bright enough to read as painted teal, not black slots (HF-392 round 3)', () => {
    // Measured on real WebGPU frames (artifacts/hf392-headless/current-*):
    // with the round-2 dielectric fix in place the trim STILL rendered
    // 0-10/255 in the cabin's shaded mounting, because albedo 0x164c58 is
    // only ~26% sRGB luminance and the sill/header/mullion bands sit in the
    // roof's shadow both inside and out - so every window frame, the roof
    // inlay and the fascia read as pure black slots. The trim must carry a
    // painted-teal albedo bright enough to answer hemisphere light, and must
    // stay dielectric so that albedo actually reaches the eye.
    const map = buildHighSeas(new THREE.Scene());
    let mat: THREE.MeshStandardMaterial | undefined;
    map.root.traverse((node) => {
      if (node instanceof THREE.Mesh && !mat) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mat = mats.find(
          (candidate): candidate is THREE.MeshStandardMaterial =>
            candidate instanceof THREE.MeshStandardMaterial && candidate.name === 'high-seas-deep-teal-trim',
        );
      }
    });
    expect(mat, 'deep-teal-trim material should exist in the scene').toBeDefined();
    const srgbLuminance =
      (0.2126 * mat!.color.r + 0.7152 * mat!.color.g + 0.0722 * mat!.color.b);
    expect(
      srgbLuminance,
      'window framing trim must stay a readable painted teal in shade',
    ).toBeGreaterThanOrEqual(0.4);
    expect(mat!.metalness, 'painted marine trim is dielectric').toBeLessThanOrEqual(0.25);
  });

  it('equips deck, hull, and superstructure with procedural PBR textures (albedo, normal, roughness)', () => {
    const map = buildHighSeas(new THREE.Scene());
    const inventory = getHighSeasMaterialInventory();
    // 15 since HF-392 (commit 220eae68): the deckhouse gained its own warm
    // lit 'cabin-ceiling' fixture material instead of letting the roof slab's
    // wall skin read as a black grid; previously 14 since HF-373 (dedicated
    // below-deck practicals). The scene-side emissive lift is pinned below.
    expect(inventory).toHaveLength(15);
    const ceilingEntry = inventory.find((entry) => entry.name === 'high-seas-cabin-ceiling');
    expect(ceilingEntry).toBeDefined();

    const materialsByName = new Map<string, THREE.MeshStandardMaterial>();
    map.root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial && mat.name.startsWith('high-seas-')) {
            materialsByName.set(mat.name, mat);
          }
        }
      }
    });

    expect(materialsByName.size).toBe(15);
    // HF-392: the ceiling fixture's deliberate emissive lift (map reused as
    // emissiveMap) is part of the contract - a plain wall material here would
    // regress the deckhouse back to a black grid.
    const ceilingSceneMaterial = materialsByName.get('high-seas-cabin-ceiling');
    expect(ceilingSceneMaterial, 'high-seas-cabin-ceiling should be used in the scene').toBeDefined();
    expect(ceilingSceneMaterial?.emissiveMap).toBeInstanceOf(THREE.DataTexture);

    for (const entry of inventory) {
      const mat = materialsByName.get(entry.name);
      expect(mat, `Material ${entry.name} should exist in scene`).toBeDefined();
      if (!mat) continue;

      expect(mat.roughness).toBeGreaterThanOrEqual(0);
      expect(mat.roughness).toBeLessThanOrEqual(1);
      expect(mat.metalness).toBeGreaterThanOrEqual(0);
      expect(mat.metalness).toBeLessThanOrEqual(1);

      if (entry.hasMap) {
        expect(mat.map).toBeInstanceOf(THREE.DataTexture);
        const map = mat.map as THREE.DataTexture;
        expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(map.wrapS).toBe(THREE.RepeatWrapping);
        expect(map.wrapT).toBe(THREE.RepeatWrapping);
        expect((map.image as { width: number; height: number }).width).toBe(256);
        expect((map.image as { width: number; height: number }).height).toBe(256);
        expect(map.generateMipmaps).toBe(true);
      }

      if (entry.hasNormalMap) {
        expect(mat.normalMap).toBeInstanceOf(THREE.DataTexture);
        const normalMap = mat.normalMap as THREE.DataTexture;
        expect(normalMap.colorSpace).toBe(THREE.NoColorSpace);
        expect(normalMap.wrapS).toBe(THREE.RepeatWrapping);
        expect(normalMap.wrapT).toBe(THREE.RepeatWrapping);
        expect((normalMap.image as { width: number; height: number }).width).toBe(256);
        expect((normalMap.image as { width: number; height: number }).height).toBe(256);
        expect(normalMap.generateMipmaps).toBe(true);

        const data = (normalMap.image as { data: Uint8Array }).data;
        expect(data).toBeDefined();
        let blueSum = 0;
        for (let i = 2; i < data.length; i += 4) {
          blueSum += data[i];
        }
        const avgBlue = blueSum / (data.length / 4);
        expect(avgBlue).toBeGreaterThan(128);
      }

      if (entry.hasRoughnessMap) {
        expect(mat.roughnessMap).toBeInstanceOf(THREE.DataTexture);
        const roughnessMap = mat.roughnessMap as THREE.DataTexture;
        expect(roughnessMap.colorSpace).toBe(THREE.NoColorSpace);
        expect(roughnessMap.wrapS).toBe(THREE.RepeatWrapping);
        expect(roughnessMap.wrapT).toBe(THREE.RepeatWrapping);
        expect((roughnessMap.image as { width: number; height: number }).width).toBe(256);
        expect((roughnessMap.image as { width: number; height: number }).height).toBe(256);
        expect(roughnessMap.generateMipmaps).toBe(true);
      }
    }

    const withMap = inventory.filter((e) => e.hasMap);
    const withNormal = inventory.filter((e) => e.hasNormalMap);
    const withRoughness = inventory.filter((e) => e.hasRoughnessMap);

    // +1 each since HF-392: the 'wall'-family cabin-ceiling entry carries the
    // full albedo/normal/roughness set like every other wall skin.
    expect(withMap).toHaveLength(13);
    expect(withNormal).toHaveLength(15);
    expect(withRoughness).toHaveLength(15);
    expect(map.root.userData.highSeasMaterialInventory).toEqual(inventory);
  });

  it('holds texel density constant in world space across every textured mesh', () => {
    // REGRESSION GUARD. The first materials pass set a fixed texture `repeat`
    // per family, so density scaled with the mesh: 1 m composite panels on a
    // large bulkhead became a 12 cm brick grid on a small crate. Density is now
    // carried by box-projected UVs, and this test pins that invariant by
    // measuring it the way a player sees it - tiles per metre of real surface.
    const map = buildHighSeas(new THREE.Scene());

    const offenders: string[] = [];
    let checked = 0;

    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const textured = mats.find((mat): mat is THREE.MeshStandardMaterial =>
        mat instanceof THREE.MeshStandardMaterial
        && typeof mat.userData?.textureFamily === 'string');
      if (!textured) return;

      const family = textured.userData.textureFamily as keyof typeof HIGH_SEAS_TILE_METRES;
      const tileMetres = HIGH_SEAS_TILE_METRES[family];
      expect(tileMetres, `family ${family} needs a tile size`).toBeGreaterThan(0);

      const geometry = node.geometry;
      const uv = geometry.getAttribute('uv');
      const position = geometry.getAttribute('position');
      if (!uv || !position) return;

      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) return;

      // Longest world axis of the mesh, and the UV span over the same axis.
      const spanX = bounds.max.x - bounds.min.x;
      const spanY = bounds.max.y - bounds.min.y;
      const spanZ = bounds.max.z - bounds.min.z;
      const worldSpan = Math.max(spanX, spanY, spanZ);
      if (worldSpan < 0.2) return;

      let minU = Infinity; let maxU = -Infinity;
      let minV = Infinity; let maxV = -Infinity;
      for (let i = 0; i < uv.count; i += 1) {
        minU = Math.min(minU, uv.getX(i));
        maxU = Math.max(maxU, uv.getX(i));
        minV = Math.min(minV, uv.getY(i));
        maxV = Math.max(maxV, uv.getY(i));
      }
      const uvSpan = Math.max(maxU - minU, maxV - minV);
      if (!Number.isFinite(uvSpan) || uvSpan <= 0) {
        offenders.push(`${node.name}: degenerate uv span`);
        return;
      }

      const tilesPerMetre = uvSpan / worldSpan;
      const expected = 1 / tileMetres;
      checked += 1;

      // Box projection is exact, so the tolerance only absorbs the case where
      // the longest UV axis and the longest world axis are different axes.
      if (Math.abs(tilesPerMetre - expected) > expected * 0.35) {
        offenders.push(
          `${node.name} (${family}): ${tilesPerMetre.toFixed(3)} tiles/m, expected ${expected.toFixed(3)}`,
        );
      }
    });

    expect(checked).toBeGreaterThan(40);
    expect(offenders, ['non-uniform texel density:', ...offenders].join(' | ')).toEqual([]);
  });

  it('seals both engine corridor ends with solid bulkheads flush to the deck underside', async () => {
    const map = buildHighSeas(new THREE.Scene());
    const solidAt = (point: Readonly<{ x: number; y: number; z: number }>): boolean =>
      map.physicsColliders.some((bounds) => point.x > bounds.minX && point.x < bounds.maxX
        && point.y > (bounds.minY ?? Number.NEGATIVE_INFINITY) && point.y < (bounds.maxY ?? Number.POSITIVE_INFINITY)
        && point.z > bounds.minZ && point.z < bounds.maxZ);

    // The below-deck envelope: end bulkheads past the ramp shoulders, side
    // walls of every section, and the shoulders at each width change.
    for (const direction of [-1, 1]) {
      for (const side of [-1, 1]) {
        expect(solidAt({ x: side * 1.43, y: 1.4, z: direction * 20.22 }), 'end bulkhead').toBe(true);
        expect(solidAt({ x: side * 1.47, y: 1.4, z: direction * 19.3 }), 'vestibule wall').toBe(true);
        expect(solidAt({ x: side * 0.84, y: 1.4, z: direction * 12.0 }), 'corridor wall').toBe(true);
        expect(solidAt({ x: side * 2.47, y: 1.4, z: direction * 3.0 }), 'engine room wall').toBe(true);
        expect(solidAt({ x: side * 1.5, y: 1.4, z: direction * 6.5 }), 'room shoulder').toBe(true);
        expect(solidAt({ x: side * 1.1, y: 1.4, z: direction * 18.6 }), 'vestibule shoulder').toBe(true);
      }
    }

    // The walls reach the deck underside (y=2.92): the previous 2.84 wall top
    // left an 0.08 m sightline seam into the hull void.
    const authority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    const belowDeckWalls = authority.filter((entry) => /high-seas-engine-(room|corridor|vestibule|end)-/.test(entry.name));
    expect(belowDeckWalls.length).toBeGreaterThanOrEqual(18);
    for (const wall of belowDeckWalls) {
      expect(wall.bounds.maxY, `${wall.name} must meet the deck underside`).toBeGreaterThanOrEqual(2.92 - 1e-6);
    }

    // Rapier regression probe: pushing out of both corridor ends must never
    // drop the player into the hull void (feet at y=-6 meant eye ~= -4.3).
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      for (const direction of [-1, 1]) {
        for (const side of [-1, 1]) {
          physics.teleportEye(eyeForFeet([0, HIGH_SEAS_LEVELS.engine, direction * 19.3]));
          const escapeTarget = eyeForFeet([side * 2.4, HIGH_SEAS_LEVELS.engine, direction * 21.6]);
          const result = await walkToward(physics, escapeTarget, 1_000);
          expect(result.y, `end ${direction} side ${side} fell below the service deck`).toBeGreaterThan(1.2);
          expect(
            Math.hypot(result.x - escapeTarget.x, result.z - escapeTarget.z),
            `end ${direction} side ${side} escaped the sealed corridor`,
          ).toBeGreaterThan(0.5);
        }
      }
    } finally {
      physics.dispose();
    }
  }, 30_000);

  it('breaks the bow-to-stern below-deck sightline without narrowing the route', () => {
    // Pass 77 layout audit. The service deck used to be a dead-straight 40 m
    // tube: a player at the bow ramp foot had an unbroken line to the stern
    // ramp foot, down the map's FASTEST lane (the engine route is 50.7 m
    // against ~68 m for each surface lane). The exhaust trunk breaks it.
    const map = buildHighSeas(new THREE.Scene());
    const authority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    const trunk = authority.find((entry) => entry.name === 'high-seas-engine-exhaust-trunk');
    expect(trunk, 'the centreline exhaust trunk').toBeDefined();
    expect(trunk!.solid && trunk!.shots, 'the trunk must block movement AND shots').toBe(true);

    // The corridor half-width is 0.72 m, so a 0.42 m capsule confines a player
    // there to |x| <= 0.30. The trunk covers |x| <= 0.45, which is wider - so
    // EVERY corridor-to-corridor line is blocked as a matter of geometry, not
    // of one lucky sample. Check the extremes and the centre anyway.
    const reach = 0.72 - STANCE_SHAPES.stand.radius;
    expect(Math.max(Math.abs(trunk!.bounds.minX), Math.abs(trunk!.bounds.maxX))).toBeGreaterThan(reach);
    const eyeY = HIGH_SEAS_LEVELS.engine + 1.7;
    for (const fromX of [-reach, 0, reach]) {
      for (const toX of [-reach, 0, reach]) {
        const start = { x: fromX, y: eyeY, z: -18.5 };
        const end = { x: toX, y: eyeY, z: 18.5 };
        const blocked = map.physicsColliders.some((bounds) => segmentIntersectsBox(start, end, bounds));
        expect(blocked, `bow x=${fromX} to stern x=${toX} must not be a clear shot`).toBe(true);
      }
    }
    // ...and it is the trunk doing it, not something incidental.
    expect(segmentIntersectsBox({ x: 0, y: eyeY, z: -18.5 }, { x: 0, y: eyeY, z: 18.5 }, trunk!.bounds)).toBe(true);

    // Blocking the lane must not choke it. The starboard bypass has to stay at
    // least as wide as the corridor players already walk, or the trunk turns a
    // through-route into a trap.
    const roomWall = authority.find((entry) => entry.name === 'high-seas-engine-room-wall-starboard');
    expect(roomWall).toBeDefined();
    const bypass = roomWall!.bounds.minX - trunk!.bounds.maxX;
    expect(bypass, 'starboard bypass around the trunk').toBeGreaterThanOrEqual(1.44);
  });

  it('closes the hatch shafts between the service deck and the deck underside', () => {
    // The end bulkheads only span |x| 1.25..1.62 - the ramp mouth is open, as
    // it must be - and past that plane the ramp shaft had no side walls at all
    // below the deck, so a player could walk up the ramp, step off it sideways
    // and drop into the hull void.
    //
    // The Rapier escape probe below used to report this sealed. It was not:
    // parking one extra collider 30 m BELOW the map, touching nothing, flipped
    // that probe to a failure with an identical end position - its pass came
    // from collider ordering, not geometry. So the seal is asserted here
    // structurally first, and the walk is kept as a second opinion.
    const map = buildHighSeas(new THREE.Scene());
    const solidAt = (point: Readonly<{ x: number; y: number; z: number }>): boolean =>
      map.physicsColliders.some((bounds) => point.x > bounds.minX && point.x < bounds.maxX
        && point.y > (bounds.minY ?? Number.NEGATIVE_INFINITY) && point.y < (bounds.maxY ?? Number.POSITIVE_INFINITY)
        && point.z > bounds.minZ && point.z < bounds.maxZ);

    for (const direction of [-1, 1]) {
      for (const side of [-1, 1]) {
        // Sample the whole shaft run, from the end bulkhead to the ramp top,
        // at three heights spanning the walkable band.
        for (const z of [20.6, 21.6, 22.6, 23.6, 24.3]) {
          for (const y of [0.4, 1.4, 2.6]) {
            expect(
              solidAt({ x: side * 1.44, y, z: direction * z }),
              `hatch shaft wall missing at side ${side} z=${direction * z} y=${y}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('authors a dry enclosed bilge under the whole below-deck footprint instead of open ocean', () => {
    const map = buildHighSeas(new THREE.Scene());
    map.root.updateMatrixWorld(true);
    const envelope = map.root.userData.highSeasProvenance.expectedWaveEnvelope as Readonly<{ maximumY: number }>;

    type FloorProvider = Readonly<{ name: string; minX: number; maxX: number; minZ: number; maxZ: number; topY: number }>;
    const providers: FloorProvider[] = [];
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.name.startsWith('high-seas-bilge-floor')) return;
      const bounds = new THREE.Box3().setFromObject(node);
      providers.push({
        name: node.name,
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
        topY: bounds.max.y,
      });
    });
    const authority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    const engineFloor = authority.find((entry) => entry.name === 'high-seas-platform-engine-floor');
    expect(engineFloor).toBeDefined();
    if (engineFloor) {
      providers.push({
        name: engineFloor.name,
        minX: engineFloor.bounds.minX,
        maxX: engineFloor.bounds.maxX,
        minZ: engineFloor.bounds.minZ,
        maxZ: engineFloor.bounds.maxZ,
        topY: engineFloor.bounds.maxY ?? 0,
      });
    }

    // Every authored dry floor must sit above the shared ocean's wave crest
    // and below the deck, or it would either read as water or clip the deck.
    expect(providers.length).toBeGreaterThanOrEqual(2);
    for (const provider of providers) {
      expect(provider.topY, `${provider.name} below wave crest`).toBeGreaterThan(envelope.maximumY);
      expect(provider.topY, `${provider.name} above deck`).toBeLessThan(HIGH_SEAS_LEVELS.mainDeck);
    }

    // ~40-point probe across the below-deck footprint: under every sample
    // there must be authored floor, never the shared ocean plane.
    const samples: Array<readonly [number, number]> = [];
    for (const x of [-7, -3.5, 0, 3.5, 7]) {
      for (const z of [-34, -20, -10, 0, 10, 20, 34]) samples.push([x, z]);
    }
    for (const x of [-3, 0, 3]) {
      for (const z of [-38, 38]) samples.push([x, z]);
    }
    expect(samples.length).toBeGreaterThanOrEqual(30);
    const uncovered = samples.filter(([x, z]) => !providers.some((provider) =>
      x >= provider.minX + 1e-6 && x <= provider.maxX - 1e-6
      && z >= provider.minZ + 1e-6 && z <= provider.maxZ - 1e-6));
    expect(uncovered, `open water under the deck at: ${JSON.stringify(uncovered)}`).toEqual([]);

    // Inner hull walls rise from the bilge to the deck underside so lateral
    // sightlines below deck terminate on hull, not ocean.
    const liner = map.root.getObjectByName('high-seas-bilge-hull-liner');
    expect(liner).toBeInstanceOf(THREE.Mesh);
    const linerBounds = new THREE.Box3().setFromObject(liner as THREE.Mesh);
    const bilgeFloorTop = Math.min(...providers
      .filter((provider) => provider.name.startsWith('high-seas-bilge-floor'))
      .map((provider) => provider.topY));
    expect(linerBounds.max.y).toBeGreaterThanOrEqual(2.92 - 1e-6);
    expect(linerBounds.min.y, 'liner walls must meet the bilge floor').toBeLessThanOrEqual(bilgeFloorTop + 1e-6);
    expect(linerBounds.max.x).toBeGreaterThanOrEqual(7.0);
    // The liner is a concave enclosing shell, excluded from the portal audit
    // by the same idiom as the sculpted hull; the exclusion must stay declared.
    expect((liner as THREE.Mesh).userData.portalAuditExcluded).toBe(true);
  });

  it('shapes the service deck as a cramped corridor with a mid-ship engine room, metal ceiling, practicals and treads', () => {
    const map = buildHighSeas(new THREE.Scene());
    const authority = map.root.userData.highSeasAuthorityAudit as readonly AuthorityAuditEntry[];
    const byName = (name: string): AuthorityAuditEntry => {
      const entry = authority.find((candidate) => candidate.name === name);
      expect(entry, name).toBeDefined();
      return entry as AuthorityAuditEntry;
    };

    // Hijacked-style proportions: shoulder-width connecting corridor, small
    // 4-5 m engine room bulge amidships.
    const corridorClear = byName('high-seas-engine-corridor-wall-stern-starboard').bounds.minX
      - byName('high-seas-engine-corridor-wall-stern-port').bounds.maxX;
    expect(corridorClear).toBeGreaterThanOrEqual(1.3);
    expect(corridorClear).toBeLessThanOrEqual(1.6);
    const roomClear = byName('high-seas-engine-room-wall-starboard').bounds.minX
      - byName('high-seas-engine-room-wall-port').bounds.maxX;
    expect(roomClear).toBeGreaterThanOrEqual(4);
    expect(roomClear).toBeLessThanOrEqual(5);

    // Machinery cover lives inside the engine room bulge and leaves a walkable
    // centre lane.
    const machinery = authority.filter((entry) => /high-seas-engine-machinery-\d/.test(entry.name));
    expect(machinery).toHaveLength(5);
    for (const block of machinery) {
      expect(block.solid && block.shots, block.name).toBe(true);
      expect(block.bounds.minZ).toBeGreaterThanOrEqual(-6.5);
      expect(block.bounds.maxZ).toBeLessThanOrEqual(6.5);
      expect(Math.max(Math.abs(block.bounds.minX), Math.abs(block.bounds.maxX))).toBeLessThanOrEqual(2.35);
      expect(Math.min(Math.abs(block.bounds.minX), Math.abs(block.bounds.maxX))).toBeGreaterThanOrEqual(0.9);
    }

    // The hatch rims close the deck slivers flush with the deck plane.
    const rimSample = (x: number, z: number): boolean =>
      map.physicsColliders.some((bounds) => x > bounds.minX && x < bounds.maxX
        && 3.06 > (bounds.minY ?? Number.NEGATIVE_INFINITY) && 3.06 < (bounds.maxY ?? Number.POSITIVE_INFINITY)
        && z > bounds.minZ && z < bounds.maxZ);
    for (const direction of [-1, 1]) {
      for (const side of [-1, 1]) {
        expect(rimSample(side * 1.43, direction * 22.15), 'hatch side sliver').toBe(true);
      }
      expect(rimSample(0, direction * 24.4), 'hatch end sliver').toBe(true);
    }

    // Metal ceiling liner (engine-bulkhead family), not the teak deck family.
    const ceiling = map.root.getObjectByName('high-seas-engine-ceiling') as THREE.Mesh;
    expect(ceiling).toBeInstanceOf(THREE.Mesh);
    const ceilingMaterial = ceiling.material as THREE.MeshStandardMaterial;
    expect(ceilingMaterial.userData.textureFamily).toBe('engine-bulkhead');

    // The strips are the visible LENS. They keep their own fixture material
    // rather than sharing the accent that also skins the deck-level hatch
    // guards - that separation is the durable part of HF-373 and is asserted
    // below. Their emissive intensity is deliberately NOT floored at the old
    // 3.4 any more: that number existed because the strips were the only light
    // source in the volume, and with the definition's practical rig doing the
    // modelling, holding it there measured as blown-out bars (room ceiling
    // 178/255 mean, 2.6% of it below 12) against the surfaces they sit above.
    // What must stay true is that they read as lit fixtures at all.
    const strips = map.root.getObjectByName('high-seas-engine-light-strips') as THREE.Mesh;
    expect(strips).toBeInstanceOf(THREE.Mesh);
    const stripMaterial = strips.material as THREE.MeshStandardMaterial;
    expect(stripMaterial.name).toBe('high-seas-engine-practical');
    expect(stripMaterial.emissiveIntensity).toBeGreaterThan(1);
    expect(stripMaterial.emissive.getHex()).toBeGreaterThan(0);

    // The engine access ramps carry stair treads like every other stair.
    expect(map.root.getObjectByName('high-seas-bow-engine-access-treads')).toBeInstanceOf(THREE.Mesh);
    expect(map.root.getObjectByName('high-seas-stern-engine-access-treads')).toBeInstanceOf(THREE.Mesh);
  });

  it('lights the sealed below-deck volume and keeps every lit material under the deck plane', () => {
    // HF-373. The owner: "too dark down at the bottom of hijacked". The volume
    // is sealed, the sun never reaches it and the arena adds no THREE lights, so
    // the fixtures and a material-carried fill ARE the lighting. The thing that
    // must not happen is the fix spilling upward, so this test proves the lit
    // materials are only ever used by geometry beneath the main deck.
    const map = buildHighSeas(new THREE.Scene());
    const deckPlaneY = HIGH_SEAS_LEVELS.mainDeck;

    const materialsByName = new Map<string, THREE.MeshStandardMaterial>();
    const meshesByMaterial = new Map<string, THREE.Mesh[]>();
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const entries = Array.isArray(node.material) ? node.material : [node.material];
      for (const entry of entries) {
        if (!(entry instanceof THREE.MeshStandardMaterial)) continue;
        materialsByName.set(entry.name, entry);
        meshesByMaterial.set(entry.name, [...(meshesByMaterial.get(entry.name) ?? []), node]);
      }
    });

    // The practicals own a dedicated fixture material. Sharing the accent was
    // the trap: engine-amber also skins the DECK-LEVEL hatch guards, so the only
    // way to brighten the strips through it was to make deck furniture glow.
    const practical = materialsByName.get('high-seas-engine-practical') as THREE.MeshStandardMaterial;
    expect(practical).toBeDefined();
    expect(practical.emissiveIntensity).toBeGreaterThan(1);
    expect(practical.emissiveMap, 'the strip glows through its diffuser pattern').toBeInstanceOf(THREE.DataTexture);
    const accent = materialsByName.get('high-seas-engine-amber') as THREE.MeshStandardMaterial;
    expect(accent).toBeDefined();
    expect(accent).not.toBe(practical);
    expect(accent.emissiveIntensity, 'the shared accent must not be cranked').toBe(0.65);

    // Both fixture runs exist and are driven by that one material instance.
    const ceilingStrips = map.root.getObjectByName('high-seas-engine-light-strips') as THREE.Mesh;
    const guideStrips = map.root.getObjectByName('high-seas-engine-floor-guide-strips') as THREE.Mesh;
    expect(ceilingStrips).toBeInstanceOf(THREE.Mesh);
    expect(guideStrips).toBeInstanceOf(THREE.Mesh);
    expect(ceilingStrips.material).toBe(practical);
    expect(guideStrips.material).toBe(practical);

    // Coverage: fixtures reach both ramp mouths, not just the engine room, and
    // the guide line hugs the floor so the deck plate has an edge to read.
    const ceilingBounds = new THREE.Box3().setFromObject(ceilingStrips);
    expect(ceilingBounds.min.z).toBeLessThanOrEqual(-19);
    expect(ceilingBounds.max.z).toBeGreaterThanOrEqual(19);
    const guideBounds = new THREE.Box3().setFromObject(guideStrips);
    expect(guideBounds.min.z).toBeLessThanOrEqual(-19);
    expect(guideBounds.max.z).toBeGreaterThanOrEqual(19);
    expect(guideBounds.max.y).toBeLessThanOrEqual(0.25);

    // The enclosed-volume fill is carried by exactly the materials that never
    // appear above deck, and it is textured so panel lines survive the lift
    // instead of flattening into a silhouette-killing slab.
    const filled = [...materialsByName.values()].filter((entry) => entry.userData.belowDeckFill === true);
    expect(filled.map((entry) => entry.name).sort()).toEqual([
      'high-seas-engine-bulkhead',
      'high-seas-engine-grating',
      'high-seas-engine-machinery',
      'high-seas-engine-practical',
    ]);
    for (const entry of filled) {
      expect(entry.emissiveIntensity, entry.name).toBeGreaterThan(0);
      expect(entry.emissiveMap, entry.name).toBeInstanceOf(THREE.DataTexture);
    }
    // The amber accent also skins the hatch guards standing ON the open deck,
    // so it must never join the fill - that shared value is the trap HF-373
    // was predicted to fall into.
    expect(materialsByName.get('high-seas-engine-amber')?.userData.belowDeckFill).toBeUndefined();
    // Grating is the one filled family with any deck-plane exposure (the hatch
    // rims and the ramp tops), so it stays the dimmest of the three. Compare
    // what actually reaches the screen, not the raw coefficient: the fill is
    // tint x emissiveMap x intensity, and each family multiplies a different
    // albedo, so emissiveIntensity alone is not comparable across them.
    const luminance = (color: THREE.Color): number => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    const effectiveLift = (entry: THREE.MeshStandardMaterial): number =>
      entry.emissiveIntensity * luminance(entry.emissive) * luminance(entry.color);
    const grating = materialsByName.get('high-seas-engine-grating') as THREE.MeshStandardMaterial;
    const bulkhead = materialsByName.get('high-seas-engine-bulkhead') as THREE.MeshStandardMaterial;
    const machinery = materialsByName.get('high-seas-engine-machinery') as THREE.MeshStandardMaterial;
    expect(effectiveLift(grating)).toBeLessThan(effectiveLift(bulkhead));
    expect(effectiveLift(grating)).toBeLessThan(effectiveLift(machinery));
    // And the fill stays a fill: the fixtures are an order brighter than any
    // surface they light, or the volume reads as fog instead of a corridor.
    expect(effectiveLift(practical)).toBeGreaterThan(effectiveLift(bulkhead) * 10);

    // THE LEAK PROOF. Not one mesh wearing a lit below-deck material may rise
    // above the deck plane, so none of this fix can be seen from up top as
    // anything other than light inside an open hatch.
    const leaks: string[] = [];
    const atDeckPlane: string[] = [];
    for (const entry of filled) {
      for (const mesh of meshesByMaterial.get(entry.name) ?? []) {
        const bounds = new THREE.Box3().setFromObject(mesh);
        if (bounds.max.y > deckPlaneY + 1e-3) leaks.push(`${mesh.name} (${entry.name}) reaches y=${bounds.max.y.toFixed(3)}`);
        else if (bounds.max.y > deckPlaneY - 1e-2) atDeckPlane.push(mesh.name);
      }
    }
    expect(leaks, 'below-deck lighting must not touch geometry above the deck plane').toEqual([]);
    // Everything that comes all the way up to the plane is hatch-shaft
    // structure, which is exactly where corridor light is supposed to show.
    expect(atDeckPlane.length).toBeGreaterThan(0);
    expect(atDeckPlane.every((name) => /hatch-rim|ramp-(bow|stern)-engine-access/.test(name)), atDeckPlane.join(', ')).toBe(true);

    const lighting = map.root.userData.highSeasBelowDeckLighting as Readonly<{
      policy: string;
      arenaRootAddsThreeLights: boolean;
      metalness: Readonly<Record<string, number>>;
      deckPlaneY: number;
      practical: Readonly<{ material: string; emissiveIntensity: number; fixtures: readonly string[] }>;
      fill: readonly Readonly<{ material: string; emissiveIntensity: number; texturedEmissive: boolean }>[];
      sharedAccent: Readonly<{ material: string; emissiveIntensity: number }>;
    }>;
    expect(lighting.policy).toBe('definition-shadowed-local-practicals-plus-residual-emissive-fill');
    expect(lighting.arenaRootAddsThreeLights).toBe(false);
    expect(lighting.deckPlaneY).toBe(deckPlaneY);
    expect(lighting.practical.material).toBe('high-seas-engine-practical');
    expect(lighting.practical.fixtures).toEqual(['high-seas-engine-light-strips', 'high-seas-engine-floor-guide-strips']);
    expect(lighting.fill.every((entry) => entry.emissiveIntensity > 0 && entry.texturedEmissive)).toBe(true);
    expect(lighting.sharedAccent.emissiveIntensity).toBe(0.65);

    // The service deck HAS real lights now, but they are not in here: they are
    // authored on the arena visual definition and owned, shadowed and disposed
    // by ArenaContrastLighting (see rendering/arenas/high-seas.test.ts for the
    // containment proof). The arena root stays a pure geometry root, so a build
    // of the map outside the renderer carries no orphan lights and nothing here
    // can leak past the root disposer.
    const lights: THREE.Object3D[] = [];
    map.root.traverse((node) => { if ((node as THREE.Light).isLight) lights.push(node); });
    expect(lights).toEqual([]);

    // Surfaces have to be able to answer a light. The families were authored
    // at metalness 0.58-0.74 over a 2-5% albedo, which is why the deck plate
    // still measured 20/255 mean and 94% crushed with a full rig injected -
    // a metal surface has almost no diffuse response. Painted marine steel is
    // a dielectric; the walkable plate and the bulkheads belong near zero.
    for (const name of ['high-seas-engine-grating', 'high-seas-engine-bulkhead'] as const) {
      const entry = materialsByName.get(name) as THREE.MeshStandardMaterial;
      expect(entry.metalness, `${name} must stay diffuse enough to be lit`).toBeLessThanOrEqual(0.25);
    }
    expect((materialsByName.get('high-seas-engine-machinery') as THREE.MeshStandardMaterial).metalness)
      .toBeLessThanOrEqual(0.4);
  });

  it('gives every texture family a physically sensible tile size', () => {
    // A tile smaller than ~0.5 m reads as noise at play distance; larger than
    // ~8 m and the normal map stops carrying any surface detail at all.
    for (const [family, metres] of Object.entries(HIGH_SEAS_TILE_METRES)) {
      expect(metres, `${family} tile too small`).toBeGreaterThanOrEqual(0.5);
      expect(metres, `${family} tile too large`).toBeLessThanOrEqual(8);
    }

    const inventory = getHighSeasMaterialInventory();
    for (const entry of inventory) {
      expect(entry.tileMetres).toBe(HIGH_SEAS_TILE_METRES[entry.family]);
    }
  });
});
