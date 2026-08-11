import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyAdditionalMapPresentationProfile, buildGunRange } from './additional-maps';
import { traceBallisticPath } from './ballistics';
import { firstSegmentBoxHit, isBlocked, sweepSphereAgainstBoxes, type Box2 } from './collision';
import { WEAPONS } from './gameplay';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  GUN_RANGE_TEST_BAY_STRUCTURE,
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicBallisticSurfaces,
  gunRangeTestBayDoorDynamicColliders,
  gunRangeTestBayStructureBounds,
} from './gun-range-test-bay';
import { WEAPON_IDS } from './protocol';
import { definition as gunRangeVisualDefinition } from './rendering/arenas/gun-range';

function sameBounds(left: Box2, right: Box2): boolean {
  return left.minX === right.minX && left.maxX === right.maxX
    && left.minY === right.minY && left.maxY === right.maxY
    && left.minZ === right.minZ && left.maxZ === right.maxZ;
}

describe('Pass 70 Gun Range test-bay world authority', () => {
  it('projects every visible core surface into movement, Rapier, and ballistic authority', () => {
    const map = buildGunRange(new THREE.Scene());
    for (const definition of GUN_RANGE_TEST_BAY_STRUCTURE) {
      const expected = gunRangeTestBayStructureBounds(definition);
      const mesh = map.root.getObjectByName(definition.id) as THREE.Mesh;
      expect(mesh, definition.id).toBeInstanceOf(THREE.Mesh);
      expect(mesh.userData).toMatchObject({
        testBayAuthority: 'visible-movement-physics-ballistic',
        testBayStructureId: definition.id,
        ballisticMaterial: definition.ballisticMaterial,
      });
      expect(map.colliders.some((bounds) => sameBounds(bounds, expected)), `${definition.id}:movement`).toBe(true);
      expect(map.physicsColliders.some((bounds) => sameBounds(bounds, expected)), `${definition.id}:rapier`).toBe(true);
      const surface = map.shotSurfaces.find((candidate) => candidate.name === definition.id);
      expect(surface, `${definition.id}:ballistic`).toMatchObject({
        material: definition.ballisticMaterial,
        classification: 'explicit',
      });
      expect(sameBounds(surface!.bounds, expected)).toBe(true);
    }
  });

  it('contains floor, ceiling, perimeter and the wall above the door without sealing the aperture', () => {
    const map = buildGunRange(new THREE.Scene());
    expect(firstSegmentBoxHit(
      { x: 75, y: 1.7, z: 6 },
      { x: 75, y: -0.5, z: 6 },
      map.physicsColliders,
      0,
    )).not.toBeNull();
    expect(firstSegmentBoxHit(
      { x: 75, y: 20, z: 6 },
      { x: 75, y: 27, z: 6 },
      map.physicsColliders,
      0,
    )).not.toBeNull();
    for (const probe of [
      { x: 100.1, y: 1.7, z: 6 },
      { x: 75, y: 1.7, z: -26.1 },
      { x: 75, y: 1.7, z: 38.1 },
      { x: 51.75, y: 12, z: 12 },
    ]) expect(isBlocked(probe, map.colliders, 0.05), JSON.stringify(probe)).toBe(true);

    const aperture = { x: 51.75, y: 2.2, z: 12 };
    expect(isBlocked(aperture, map.colliders, 0.1)).toBe(false);
    expect(map.shotSurfaces.some((surface) => (
      surface.bounds.minX <= aperture.x && surface.bounds.maxX >= aperture.x
      && surface.bounds.minZ <= aperture.z && surface.bounds.maxZ >= aperture.z
      && (surface.bounds.minY ?? -Infinity) <= aperture.y && (surface.bounds.maxY ?? Infinity) >= aperture.y
    ))).toBe(false);

    const closed = createGunRangeTestBayDoorState(0);
    expect(gunRangeTestBayDoorDynamicColliders(closed)[0]?.bounds).toEqual(GUN_RANGE_TEST_BAY_CONTRACT.door.closedBounds);
    expect(gunRangeTestBayDoorDynamicBallisticSurfaces(closed)[0]?.bounds).toEqual(GUN_RANGE_TEST_BAY_CONTRACT.door.closedBounds);
  });

  it('keeps one owned textured secure-door assembly with attached moving and practical fixtures', () => {
    const map = buildGunRange(new THREE.Scene());
    const assembly = map.root.getObjectByName('gun-range-test-bay-secure-door-assembly') as THREE.Group;
    const leaf = map.root.getObjectByName('gun-range-test-bay-secure-door-leaf') as THREE.Mesh;
    expect(assembly).toBeInstanceOf(THREE.Group);
    expect(assembly.userData).toMatchObject({
      authorityId: GUN_RANGE_TEST_BAY_CONTRACT.door.id,
      structure: 'static-frame-with-dynamic-leaf',
      practicalIds: ['test-bay-door-approach-key'],
    });
    expect(leaf.parent).toBe(assembly);
    for (const definition of GUN_RANGE_TEST_BAY_STRUCTURE.filter(({ assemblyRole }) => assemblyRole)) {
      expect(map.root.getObjectByName(definition.id)?.parent, definition.id).toBe(assembly);
    }
    for (const id of [
      'gun-range-test-bay-door-edge-north',
      'gun-range-test-bay-door-edge-south',
      'gun-range-test-bay-door-armour-range-face',
      'gun-range-test-bay-door-armour-bay-face',
      'gun-range-test-bay-door-status-range-face',
      'gun-range-test-bay-door-status-bay-face',
    ]) expect(map.root.getObjectByName(id)?.parent, id).toBe(leaf);
    const emitter = map.root.getObjectByName('gun-range-test-bay-door-practical-emitter') as THREE.Mesh;
    expect(emitter.parent).toBe(assembly);
    expect(emitter.userData).toMatchObject({
      doorAssemblyRole: 'practical-emitter',
      practicalId: 'test-bay-door-approach-key',
    });
    const leafMaterial = leaf.material as THREE.MeshStandardMaterial;
    expect(leafMaterial.name).toBe('GunRange_TestBay_SecureDoor_PanelTexture');
    expect(leafMaterial.userData.testBayDoorTextureMapping).toEqual({ pattern: 'panel', repeat: [2, 3] });
    const practical = gunRangeVisualDefinition.lighting.practicals.find(({ id }) => id === 'test-bay-door-approach-key');
    expect(practical?.light?.position).toEqual(emitter.position.toArray());
  });

  it('keeps every illuminated moving dummy grounded, bounded, and targetable by the live hit-proxy catalog', () => {
    const map = buildGunRange(new THREE.Scene());
    const dummies = map.targets.filter(({ kind }) => kind === 'training-dummy');
    expect(dummies.map(({ id }) => id)).toEqual(GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(({ id }) => id));
    for (const [index, definition] of GUN_RANGE_TEST_BAY_CONTRACT.dummies.entries()) {
      const target = dummies[index]!;
      expect(target.root.userData).toMatchObject({
        targetId: definition.id,
        targetKind: 'training-dummy',
        armed: false,
        walkSpeedMps: definition.speedMps,
      });
      const targetMeshes = target.root.userData.targetMeshes as THREE.Mesh[];
      expect(targetMeshes.length, definition.id).toBeGreaterThan(0);
      expect(targetMeshes.every((mesh) => map.raycastMeshes.includes(mesh)), `${definition.id}:raycast`).toBe(true);
      for (const endpoint of [definition.start, definition.end]) {
        expect(endpoint.x).toBeGreaterThan(GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds.minX);
        expect(endpoint.x).toBeLessThan(GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds.maxX);
        expect(endpoint.z).toBeGreaterThan(GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds.minZ);
        expect(endpoint.z).toBeLessThan(GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds.maxZ);
        expect(firstSegmentBoxHit(
          { x: endpoint.x, y: 0.25, z: endpoint.z },
          { x: endpoint.x, y: -0.25, z: endpoint.z },
          map.physicsColliders,
          0,
        ), `${definition.id}:floor`).not.toBeNull();
      }
    }
  });

  it('retains identical collision and ballistics in Performance, Quality and Compatibility', () => {
    const expected = GUN_RANGE_TEST_BAY_STRUCTURE.map((definition) => ({
      id: definition.id,
      bounds: gunRangeTestBayStructureBounds(definition),
      material: definition.ballisticMaterial,
    }));
    for (const profile of ['performance', 'blender', 'compat'] as const) {
      const map = buildGunRange(new THREE.Scene());
      applyAdditionalMapPresentationProfile(map.root, profile);
      for (const entry of expected) {
        expect(map.root.getObjectByName(entry.id)?.visible, `${profile}:${entry.id}:visible`).toBe(true);
        expect(map.physicsColliders.some((bounds) => sameBounds(bounds, entry.bounds)), `${profile}:${entry.id}:physics`).toBe(true);
        expect(map.shotSurfaces.some((surface) => (
          surface.name === entry.id && surface.material === entry.material && sameBounds(surface.bounds, entry.bounds)
        )), `${profile}:${entry.id}:shots`).toBe(true);
      }
    }
  });

  it('gives every canonical weapon truthful wallbang surfaces and the crossbow real swept collision', () => {
    const map = buildGunRange(new THREE.Scene());
    expect(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.map(({ id }) => id)).toEqual(WEAPON_IDS);
    for (const id of WEAPON_IDS) {
      const wall = traceBallisticPath(
        { x: 75, y: 1.7, z: 6 },
        { x: 1, y: 0, z: 0 },
        40,
        WEAPONS[id].penetration,
        map.shotSurfaces,
      );
      expect(wall.impacts[0]?.surface.name, `${id}:wall`).toBe('gun-range-test-bay-east-wall');
      expect(wall.impacts[0]?.surface.material, `${id}:wall-material`).toBe('structural-metal');
      expect(wall.impacts[0]?.entryDistance, `${id}:wall-distance`).toBeCloseTo(25, 6);

      const floor = traceBallisticPath(
        { x: 75, y: 1.7, z: 6 },
        { x: 0, y: -1, z: 0 },
        3,
        WEAPONS[id].penetration,
        map.shotSurfaces,
      );
      expect(floor.impacts[0]?.surface.name, `${id}:floor`).toBe('gun-range-test-bay-floor');
      expect(floor.impacts[0]?.surface.material, `${id}:floor-material`).toBe('concrete');
      expect(Number.isFinite(wall.damageMultiplier) && Number.isFinite(floor.damageMultiplier)).toBe(true);
    }
    const crossbowWall = sweepSphereAgainstBoxes(
      { x: 75, y: 1.7, z: 6 },
      { x: 30, y: 0, z: 0 },
      map.physicsColliders,
    );
    expect(crossbowWall).toMatchObject({ normal: { x: -1, y: 0, z: 0 } });
    expect(crossbowWall!.time).toBeCloseTo((100 - 0.17 - 75) / 30, 6);
    const crossbowFloor = sweepSphereAgainstBoxes(
      { x: 75, y: 1.7, z: 6 },
      { x: 0, y: -3, z: 0 },
      map.physicsColliders,
    );
    expect(crossbowFloor).not.toBeNull();
    expect(Math.abs(crossbowFloor!.normal.y)).toBe(1);
    expect(crossbowFloor!.time).toBeCloseTo((1.7 - 0.17) / 3, 6);

    const closedDoorSurfaces = gunRangeTestBayDoorDynamicBallisticSurfaces(createGunRangeTestBayDoorState(0));
    for (const id of WEAPON_IDS) {
      const door = traceBallisticPath(
        { x: 48, y: 1.7, z: 12 },
        { x: 1, y: 0, z: 0 },
        8,
        WEAPONS[id].penetration,
        closedDoorSurfaces,
      );
      expect(door.impacts[0]?.surface.name, `${id}:closed-door`).toBe('gun-range-test-bay-secure-door-leaf');
      expect(door.impacts[0]?.surface.material, `${id}:closed-door-material`).toBe('structural-metal');
    }
  });
});
