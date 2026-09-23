import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Box2 } from './collision';
import type { ArenaMap } from './map';
import { buildArena } from './map';
import {
  PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES,
  PASS73_ROUTE_STANCES,
  assertPass73CollisionRouteAuthority,
  auditPass73CollisionRouteAuthority,
} from './pass73-collision-route-authority';
import { CHARACTER_PHYSICS_CONFIG, CharacterPhysics, STANCE_SHAPES } from './physics';

let physics: CharacterPhysics | null = null;

afterEach(() => {
  physics?.dispose();
  physics = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function realPerformance(): { arena: ArenaMap; report: ReturnType<typeof auditPass73CollisionRouteAuthority> } {
  const arena = buildArena(new THREE.Scene());
  return { arena, report: auditPass73CollisionRouteAuthority(arena, arena.root, 'performance') };
}

function syntheticQuality(arena: ArenaMap): THREE.Group {
  const performance = auditPass73CollisionRouteAuthority(arena, arena.root, 'performance');
  const root = new THREE.Group();
  root.name = 'synthetic-pass73-quality-root';
  for (const entry of performance.entries) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = entry.expectedBounds;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ),
      new THREE.MeshBasicMaterial(),
    );
    mesh.name = `quality-owner:${entry.solidId}`;
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    mesh.userData.atomic_semantic = 'collision-visual-owner';
    mesh.userData.atomic_house_id = entry.houseId;
    mesh.userData.atomic_solid_id = entry.solidId;
    mesh.userData.atomic_route_role = entry.role;
    mesh.userData.atomic_collision_bounds = [...entry.expectedBounds];
    root.add(mesh);
  }
  return root;
}

function sameBounds(box: Box2, tuple: readonly number[]): boolean {
  return [box.minX, box.minY ?? 0, box.minZ, box.maxX, box.maxY ?? 8, box.maxZ]
    .every((value, index) => Math.abs(value - tuple[index]!) <= 1e-6);
}

function mutateAuthority(
  arena: ArenaMap,
  field: 'colliders' | 'physicsColliders' | 'shotSurfaces',
  tuple: readonly number[],
): ArenaMap {
  if (field === 'shotSurfaces') {
    let changed = false;
    return {
      ...arena,
      shotSurfaces: arena.shotSurfaces.map((surface) => {
        if (changed || !sameBounds(surface.bounds, tuple)) return surface;
        changed = true;
        return Object.freeze({ ...surface, bounds: Object.freeze({ ...surface.bounds, maxY: (surface.bounds.maxY ?? 8) - 0.04 }) });
      }),
    };
  }
  let changed = false;
  return {
    ...arena,
    [field]: arena[field].map((box) => {
      if (changed || !sameBounds(box, tuple)) return box;
      changed = true;
      return Object.freeze({ ...box, minY: (box.minY ?? 0) + 0.04 });
    }),
  };
}

describe('Pass 73 exact collision/visual route authority', () => {
  it('passes one exact visible Performance owner plus movement, physics, shot and support bounds', () => {
    const { report } = realPerformance();
    expect(report).toMatchObject({
      pass: true,
      expectedOwners: 10,
      passedOwners: 10,
      expectedRouteClearances: 48,
      passedRouteClearances: 48,
      issues: [],
      axisToleranceMetres: PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES,
    });
    expect(report.entries.every((entry) => entry.visibleOwnerCount === 1)).toBe(true);
    expect(report.entries.every((entry) => entry.movementBoundsCount === 1)).toBe(true);
    expect(report.entries.every((entry) => entry.physicsBoundsCount === 1)).toBe(true);
    expect(report.entries.every((entry) => entry.shotBoundsCount === 1)).toBe(true);
    expect(report.entries.filter((entry) => entry.supportBoundsCount !== null)
      .every((entry) => entry.supportBoundsCount === 1)).toBe(true);
    expect(() => assertPass73CollisionRouteAuthority(report)).not.toThrow();
  });

  it('passes the same exact contract for a separately owned Quality presentation', () => {
    const { arena } = realPerformance();
    const quality = syntheticQuality(arena);
    const report = auditPass73CollisionRouteAuthority(arena, quality, 'quality');
    expect(report).toMatchObject({ pass: true, expectedOwners: 10, passedOwners: 10, issues: [] });
  });

  it('passes the shipped compressed Quality GLB rather than only a synthetic root', async () => {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('ProgressEvent', class ProgressEvent {
      readonly type: string;
      constructor(type: string) { this.type = type; }
    });
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1,
      height: 1,
      close: () => undefined,
    }) as unknown as ImageBitmap);
    const bytes = await readFile('public/assets/original/models/atomic-acres-blender-arena.glb');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const asset = await new Promise<GLTF>((resolveAsset, rejectAsset) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(arrayBuffer, '', resolveAsset, rejectAsset);
    });
    const arena = buildArena(new THREE.Scene());
    const report = auditPass73CollisionRouteAuthority(arena, asset.scene, 'quality');
    expect(report).toMatchObject({
      pass: true,
      profile: 'quality',
      expectedOwners: 10,
      passedOwners: 10,
      issues: [],
    });
  }, 30_000);

  it('fails every owner when removed, shifted on Y, or resized on any profile', () => {
    const baseline = realPerformance();
    for (const profile of ['performance', 'quality'] as const) {
      for (const entry of baseline.report.entries) {
        for (const mutation of ['remove', 'shift-y', 'resize'] as const) {
          const arena = buildArena(new THREE.Scene());
          const root = profile === 'performance' ? arena.root : syntheticQuality(arena);
          const owner = root.children.find((node) => (
            node.userData.pass73SolidId === entry.solidId || node.userData.atomic_solid_id === entry.solidId
          )) as THREE.Mesh | undefined;
          expect(owner, `${profile}:${entry.solidId}`).toBeDefined();
          if (mutation === 'remove') owner!.parent!.remove(owner!);
          else if (mutation === 'shift-y') owner!.position.y += 0.01;
          else owner!.scale.y = 0.94;
          const report = auditPass73CollisionRouteAuthority(arena, root, profile);
          expect(report.pass, `${profile}:${entry.solidId}:${mutation}`).toBe(false);
          expect(report.issues.some((issue) => issue.startsWith(`${entry.solidId}:`))).toBe(true);
        }
      }
    }
  });

  it('fails a Y/size perturbation or removal from every authority tuple', () => {
    const { arena, report } = realPerformance();
    for (const entry of report.entries) {
      for (const field of ['colliders', 'physicsColliders', 'shotSurfaces'] as const) {
        const mutated = mutateAuthority(arena, field, entry.expectedBounds);
        const mutation = auditPass73CollisionRouteAuthority(mutated, arena.root, 'performance');
        expect(mutation.pass, `${entry.solidId}:${field}`).toBe(false);
        expect(mutation.issues.some((issue) => issue.startsWith(`${entry.solidId}:`))).toBe(true);
      }
    }
  });

  it('retains capsule support and wall clearance for both teams in every stance', async () => {
    const { arena, report } = realPerformance();
    physics = await CharacterPhysics.create(arena.physicsColliders, arena.bounds);
    for (const entry of report.entries) {
      if (entry.role !== 'floor' && entry.role !== 'canopy' && entry.role !== 'wall') continue;
      const house = arena.houses.find((candidate) => candidate.id === entry.houseId)!;
      const [minX, , minZ, maxX, maxY, maxZ] = entry.expectedBounds;
      for (const stance of PASS73_ROUTE_STANCES) {
        // Staging point must be open road clear of the central bus at the origin.
        physics.teleportEye({ x: -16, y: 4, z: 0 });
        expect(physics.setStance('stand'), `${entry.solidId}:reset`).toBe(true);
        expect(physics.setStance(stance), `${entry.solidId}:${stance}`).toBe(true);
        const shape = STANCE_SHAPES[stance];
        const eyeAboveFoot = shape.halfHeight + shape.radius + shape.eyeFromCenter;
        if (entry.role === 'wall') {
          physics.teleportEye({ x: maxX + shape.radius + 0.8, y: eyeAboveFoot, z: (minZ + maxZ) / 2 });
          let position = physics.eyePosition();
          for (let frame = 0; frame < 100; frame += 1) {
            position = physics.move({ x: -0.035, y: -0.01, z: 0 }, 1 / 120).position;
          }
          expect(position.x - shape.radius, `${entry.solidId}:${stance}:visible wall penetration`)
            .toBeGreaterThanOrEqual(maxX - CHARACTER_PHYSICS_CONFIG.controllerOffset - 0.002);
          continue;
        }
        const upperOpening = house.anchors.find((anchor) => anchor.id === 'upper-opening');
        const x = entry.role === 'floor' ? upperOpening!.position[0] : (minX + maxX) / 2;
        const z = entry.role === 'floor' ? upperOpening!.position[2] + house.origin.facing * 1.3 : (minZ + maxZ) / 2;
        physics.teleportEye({ x, y: maxY + eyeAboveFoot + 0.65, z });
        let position = physics.eyePosition();
        let groundedFrames = 0;
        for (let frame = 0; frame < 100; frame += 1) {
          const movement = physics.move({ x: 0, y: -0.035, z: 0 }, 1 / 120);
          position = movement.position;
          if (movement.grounded) groundedFrames += 1;
        }
        const footY = position.y - eyeAboveFoot;
        expect(groundedFrames, `${entry.solidId}:${stance}:fall-through`).toBeGreaterThan(25);
        expect(footY, `${entry.solidId}:${stance}:visible support penetration`)
          .toBeGreaterThanOrEqual(maxY - CHARACTER_PHYSICS_CONFIG.controllerOffset - 0.002);
        expect(footY, `${entry.solidId}:${stance}:floating support`).toBeLessThan(maxY + 0.06);
      }
    }
  }, 30_000);
});
