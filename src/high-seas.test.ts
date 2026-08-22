import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Box2, Point3 } from './collision';
import { isBlocked, pointInsideBounds } from './collision';
import {
  HIGH_SEAS_BOUNDS,
  HIGH_SEAS_ENGINE_ACCESS,
  HIGH_SEAS_LEVELS,
  HIGH_SEAS_SAFETY_FLOOR_Y,
  buildHighSeas,
  type HighSeasPortal,
  type HighSeasRouteAnchor,
} from './high-seas';
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
    expect(portals).toHaveLength(16);
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
});
