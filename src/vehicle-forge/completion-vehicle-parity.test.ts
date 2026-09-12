import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import type { ArenaMap } from '../map';
import {
  WALKTHROUGH_OVERLAP_SHARE,
  auditArena,
  collectMeshCensus,
  runColliderVisualParityAudit,
} from '../../scripts/qa/collider-visual-parity-core';
import {
  FORGE_VEHICLE_ANCHOR_ATTRIBUTE,
  buildForgedVehicle,
  createForgeMaterialSet,
  createForgeSharedMaterials,
  mergeForgedPlacements,
  mergedVehicleBounds,
  partitionMergedVehicles,
} from './build';
import { quantizeVehicleAnchor } from './materials';
import { SEDAN_SPEC } from './specs';
import { NUKETOWN2_STREET_CARS, nuketown2HandedX } from '../nuketown2-layout';

// Completion 2026-09-12: the collider/visual parity audit measured a merged
// forge mesh by its whole AABB. Two saloons sharing one paint merge into one
// mesh whose box covers the road between them, so the audit reported the
// road as an unexplained body. The unit of measurement is now one entry per
// stamped vehicle anchor; thresholds, ledgers and every other arena are
// untouched. This file proves the real arena, a synthetic second vehicle
// under a transform, a missing collider and malformed / missing anchors.

const FORGE_PREFIX = 'vehicle-forge merged';
const anchorKey = (x: number, z: number): string => quantizeVehicleAnchor(x, z).map(Math.fround).join(',');

/** Two anchored unit-ish boxes in one non-indexed geometry, anchors (ax0, az0) and (ax1, az1). */
function twoAnchoredBoxes(a: [number, number], b: [number, number], height = 1.5, width = 2): THREE.BufferGeometry {
  const make = (x: number, z: number, anchor: [number, number]) => {
    const box = new THREE.BoxGeometry(width, height, width).toNonIndexed();
    box.translate(x, height / 2, z);
    const count = box.getAttribute('position').count;
    const stamp = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) { stamp[index * 2] = anchor[0]; stamp[index * 2 + 1] = anchor[1]; }
    box.setAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE, new THREE.Float32BufferAttribute(stamp, 2));
    return box;
  };
  return mergeGeometries([make(a[0], a[1], a), make(b[0], b[1], b)], false)!;
}

function syntheticMap(root: THREE.Group, colliders: ArenaMap['colliders']): Omit<ArenaMap, 'id'> {
  return {
    root, colliders, physicsColliders: [], shotSurfaces: [],
    spawns: {} as ArenaMap['spawns'],
    bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
  } as unknown as Omit<ArenaMap, 'id'>;
}

describe('completion parity: merged forge meshes are measured per vehicle', () => {
  it('nuketown2: the merged saloon paint is two saloons on their own colliders, road excluded', async () => {
    const [result] = await runColliderVisualParityAudit(['nuketown2']);
    expect(result.error).toBeUndefined();
    expect(result.invisibleColliders).toEqual([]);
    expect(result.meshComponents?.malformedAnchorMeshes).toBe(0);
    expect(result.meshComponents?.partitionedMeshes).toBeGreaterThan(0);
    const forgeWalkThrough = (result.walkThroughMeshes ?? []).filter((row) => String(row.name).startsWith(FORGE_PREFIX));
    const forgeGhost = (result.ballisticGhostMeshes ?? []).filter((row) => String(row.name).startsWith(FORGE_PREFIX));
    expect(forgeWalkThrough, 'forge vehicles explained by their own colliders').toEqual([]);
    // Direction C: the reported paint surface is rated by its own body box.
    // Whatever remains unrated is measured per vehicle (never wider than one
    // saloon, never the road) and printed for triage; it is NOT accepted here.
    // Measured 2026-09-12: four sedan chrome components (0.03..1.79 m) against
    // a body box 0.22..1.22 m plus a glass cabin above it: no single surface
    // covers 60% of the chrome's height. That is a spec/ledger decision.
    expect(forgeGhost.filter((row) => row.name === `${FORGE_PREFIX} paint`), 'paint rated per vehicle').toEqual([]);
    for (const row of forgeGhost) {
      expect(row.component, `${row.name} ghost row is one vehicle`).toBeDefined();
      const [w, , d] = row.size as number[];
      expect(Math.max(w!, d!)).toBeLessThanOrEqual(SEDAN_SPEC.length + 0.45);
    }
    console.log(JSON.stringify({ arena: 'nuketown2', meshComponents: result.meshComponents, forgeGhostRows: forgeGhost.map((row) => ({ name: row.name, centre: row.centre, size: row.size, component: row.component })) }));

    // Direct proof on the constructed graph: the saloon paint mesh carries
    // exactly the two street-saloon anchors, each box is one 4.4 x 1.9 saloon
    // (nosed along x, so plan length lies on x), their footprints do not touch,
    // and the whole-mesh AABB is what covered the road between them.
    const { buildNuketown2 } = await import('../nuketown2-arena');
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    map.root.updateMatrixWorld(true);
    const expectedKeys = [NUKETOWN2_STREET_CARS.saloon, NUKETOWN2_STREET_CARS.classic]
      .map((seat) => anchorKey(nuketown2HandedX(seat.x + SEDAN_SPEC.length / 2), seat.z)).sort();
    const paints: THREE.Mesh[] = [];
    scene.traverse((object) => { if (object instanceof THREE.Mesh && object.name === `${FORGE_PREFIX} paint`) paints.push(object); });
    expect(paints.length).toBeGreaterThan(0);
    const saloon = paints.map((mesh) => ({ mesh, partition: partitionMergedVehicles(mesh.geometry, mesh.matrixWorld) }))
      .find(({ partition }) => partition.kind === 'partitioned' && partition.components.map((c) => c.key).sort().join('|') === expectedKeys.join('|'));
    expect(saloon, `a merged paint mesh carries exactly the saloon anchors ${expectedKeys.join(' | ')}`).toBeDefined();
    const partition = saloon!.partition;
    if (partition.kind !== 'partitioned') throw new Error('unreachable');
    expect(partition.components.reduce((sum, c) => sum + c.vertices, 0)).toBe(saloon!.mesh.geometry.getAttribute('position').count);
    const [first, second] = partition.components;
    for (const component of partition.components) {
      const size = component.box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThanOrEqual(SEDAN_SPEC.length + 0.45);
      expect(size.z).toBeLessThanOrEqual(NUKETOWN2_STREET_CARS.saloon.width + 0.45);
    }
    const planGap = Math.max(first!.box.min.x - second!.box.max.x, second!.box.min.x - first!.box.max.x,
      first!.box.min.z - second!.box.max.z, second!.box.min.z - first!.box.max.z);
    expect(planGap, 'the two saloons do not touch in plan: the road between them is not a body').toBeGreaterThan(0);
    const whole = new THREE.Box3().setFromObject(saloon!.mesh).getSize(new THREE.Vector3());
    expect(whole.x).toBeGreaterThan(SEDAN_SPEC.length + 0.45);
    // Each saloon's own box is explained by a real movement collider at the
    // audit's unchanged footprint share.
    for (const component of partition.components) {
      const area = (component.box.max.x - component.box.min.x) * (component.box.max.z - component.box.min.z);
      const bestShare = Math.max(...map.colliders.map((box) => {
        const ix = Math.min(box.maxX, component.box.max.x) - Math.max(box.minX, component.box.min.x);
        const iz = Math.min(box.maxZ, component.box.max.z) - Math.max(box.minZ, component.box.min.z);
        return (Math.max(0, ix) * Math.max(0, iz)) / area;
      }));
      expect(bestShare, `saloon at anchor ${component.key} sits on its collider`).toBeGreaterThanOrEqual(WALKTHROUGH_OVERLAP_SHARE);
    }
    // Every vertex of every merged mesh is accounted for by its components.
    let merged = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith(FORGE_PREFIX)) return;
      merged += 1;
      const part = partitionMergedVehicles(object.geometry, object.matrixWorld);
      expect(part.kind).toBe('partitioned');
      if (part.kind !== 'partitioned') return;
      expect(part.components.reduce((sum, c) => sum + c.vertices, 0)).toBe(object.geometry.getAttribute('position').count);
      expect(mergedVehicleBounds(object.geometry).size).toBe(part.components.length);
    });
    expect(result.meshComponents?.partitionedMeshes).toBe(merged);
  }, 120_000);

  it('synthetic second vehicle: two forged saloons sharing a paint partition by placement anchor', () => {
    const shared = createForgeSharedMaterials();
    const paint = createForgeMaterialSet(0x173451, 'synthetic-saloon', 0xf4eee0, 0.2, shared);
    const placements = [
      { built: buildForgedVehicle(SEDAN_SPEC, { wheelStyle: 'cover' }, paint), x: 3, z: -2, yaw: Math.PI / 2 },
      { built: buildForgedVehicle(SEDAN_SPEC, { wheelStyle: 'cover' }, paint), x: -9, z: 6, yaw: 0 },
    ];
    const merged = mergeForgedPlacements(placements, 'synthetic merged');
    const paintMesh = merged.meshes.find((mesh) => mesh.name === 'synthetic merged paint')!;
    const partition = partitionMergedVehicles(paintMesh.geometry);
    expect(partition.kind).toBe('partitioned');
    if (partition.kind !== 'partitioned') return;
    expect(partition.components.map((c) => c.key).sort()).toEqual(placements.map((p) => anchorKey(p.x, p.z)).sort());
    const yawed = partition.components.find((c) => c.key === anchorKey(3, -2))!;
    const straight = partition.components.find((c) => c.key === anchorKey(-9, 6))!;
    const yawedSize = yawed.box.getSize(new THREE.Vector3());
    const straightSize = straight.box.getSize(new THREE.Vector3());
    // Yaw 90 degrees swaps the plan axes: the yawed saloon is long on x, the straight one long on z.
    expect(yawedSize.x).toBeGreaterThan(yawedSize.z);
    expect(straightSize.z).toBeGreaterThan(straightSize.x);
    // A forged body runs 0..length along its local +z from the anchor, so the
    // plan centre sits half a length ahead: along +x after yaw +90, along +z at yaw 0.
    expect(yawed.box.getCenter(new THREE.Vector3()).x).toBeCloseTo(3 + SEDAN_SPEC.length / 2, 0);
    expect(straight.box.getCenter(new THREE.Vector3()).z).toBeCloseTo(6 + SEDAN_SPEC.length / 2, 0);
  });

  it('handles the mesh transform: per-vehicle world boxes follow the parent group', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.set(10, 0, 5);
    group.rotation.y = Math.PI / 2;
    const mesh = new THREE.Mesh(twoAnchoredBoxes([0, 0], [8, 0]), new THREE.MeshBasicMaterial());
    mesh.name = 'anchored pair';
    group.add(mesh);
    scene.add(group);
    const census = collectMeshCensus(scene);
    expect(census.visibleMeshes).toBe(1);
    expect(census.meshComponents).toEqual({ partitionedMeshes: 1, components: 2, partitionedVertices: 72, malformedAnchorMeshes: 0 });
    expect(census.meshes).toHaveLength(2);
    expect(census.meshes.reduce((sum, entry) => sum + entry.vertices, 0)).toBe(72);
    // Local (8, 0) under yaw +90 degrees maps to (10 + 0, 5 - 8) = (10, -3).
    const far = census.meshes.find((entry) => entry.component?.anchor[0] === 8)!;
    const centre = far.box.getCenter(new THREE.Vector3());
    expect(centre.x).toBeCloseTo(10, 5);
    expect(centre.z).toBeCloseTo(-3, 5);
    expect(far.component).toEqual({ anchor: [8, 0], index: 1, of: 2 });
  });

  it('missing collider: the vehicle without one is reported, and the whole-mesh unit would have hidden it', async () => {
    const buildWith = (anchored: boolean) => (scene: THREE.Scene) => {
      const root = new THREE.Group();
      const geometry = twoAnchoredBoxes([0, 0], [10, 0]);
      if (!anchored) geometry.deleteAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.name = 'synthetic merged pair';
      root.add(mesh);
      scene.add(root);
      return syntheticMap(root, [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0, maxY: 1.5 }]);
    };
    const partitioned = await auditArena('synthetic-anchored', buildWith(true));
    expect(partitioned.error).toBeUndefined();
    expect(partitioned.invisibleColliders).toEqual([]);
    expect(partitioned.walkThroughMeshes).toHaveLength(1);
    expect(partitioned.walkThroughMeshes![0]).toMatchObject({ name: 'synthetic merged pair', centre: [10, 0.75, 0], component: { anchor: [10, 0], index: 1, of: 2 } });
    // The same street measured as one 12 m box is "shell-scale" and the one
    // collider is contained in it, so nothing was reported: the defect.
    const whole = await auditArena('synthetic-unanchored', buildWith(false));
    expect(whole.walkThroughMeshes).toEqual([]);
    expect(whole.meshComponents).toEqual({ partitionedMeshes: 0, components: 0, partitionedVertices: 0, malformedAnchorMeshes: 0 });
  });

  it('malformed or missing anchor metadata falls back to whole-mesh checking and is counted, never dropped', async () => {
    const cases: Array<[string, (geometry: THREE.BufferGeometry) => void, MergedKind]> = [
      ['itemSize 1', (g) => g.setAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE, new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count), 1)), 'malformed'],
      ['count mismatch', (g) => g.setAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE, new THREE.Float32BufferAttribute(new Float32Array(4), 2)), 'malformed'],
      ['non-finite value', (g) => { (g.getAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE) as THREE.BufferAttribute).setX(5, Number.NaN); }, 'malformed'],
      ['missing attribute', (g) => g.deleteAttribute(FORGE_VEHICLE_ANCHOR_ATTRIBUTE), 'unanchored'],
    ];
    for (const [label, corrupt, kind] of cases) {
      const geometry = twoAnchoredBoxes([0, 0], [10, 0]);
      corrupt(geometry);
      expect(partitionMergedVehicles(geometry).kind, label).toBe(kind);
      expect(partitionMergedVehicles(geometry).vertices, label).toBe(72);
      expect(mergedVehicleBounds(geometry).size, label).toBe(0);
      const result = await auditArena(`synthetic-${label}`, (scene) => {
        const root = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        mesh.name = `synthetic ${label}`;
        root.add(mesh);
        scene.add(root);
        return syntheticMap(root, []);
      });
      expect(result.error, label).toBeUndefined();
      expect(result.visibleMeshes, label).toBe(1);
      expect(result.meshComponents?.malformedAnchorMeshes, label).toBe(kind === 'malformed' ? 1 : 0);
      // No collider at all: the whole 12 m mesh is still checked and reported.
      expect(result.walkThroughMeshes, label).toHaveLength(1);
      expect(result.walkThroughMeshes![0], label).toMatchObject({ name: `synthetic ${label}`, vertices: 72 });
      expect(result.walkThroughMeshes![0]).not.toHaveProperty('component');
    }
  });
});

type MergedKind = ReturnType<typeof partitionMergedVehicles>['kind'];
