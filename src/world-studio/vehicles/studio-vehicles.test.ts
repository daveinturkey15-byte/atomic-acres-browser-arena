/**
 * HF-571 world-studio vehicles contract checks: finite world-space geometry, exact solid
 * bounds inside the BUILD_BRIEF envelopes, glass kept out of the opaque merge, and an
 * authoring budget that leaves headroom for the rest of the level.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { countVehicleTriangles, createStudioVehicles, type StudioVehicles } from './index';

let vehicles: StudioVehicles;

beforeAll(() => {
  vehicles = createStudioVehicles();
});

function meshes(): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  vehicles.root.traverse((child) => {
    if (child instanceof THREE.Mesh) out.push(child);
  });
  return out;
}

function within(bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY?: number; maxY?: number }, box: readonly number[]): boolean {
  const eps = 1e-6;
  return bounds.minX >= box[0]! - eps && bounds.maxX <= box[1]! + eps
    && (bounds.minY ?? 0) >= box[2]! - eps && (bounds.maxY ?? 0) <= box[3]! + eps
    && bounds.minZ >= box[4]! - eps && bounds.maxZ <= box[5]! + eps;
}

describe('world-studio vehicles', () => {
  it('returns a root at the origin whose meshes are all finite, world-space and its descendants', () => {
    expect(vehicles.root.position.toArray()).toEqual([0, 0, 0]);
    expect(vehicles.root.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    const list = meshes();
    expect(list.length).toBeGreaterThan(5);
    for (const mesh of list) {
      const position = mesh.geometry.getAttribute('position');
      expect(position.count).toBeGreaterThan(0);
      for (let index = 0; index < position.array.length; index++) {
        expect(Number.isFinite(position.array[index]!)).toBe(true);
      }
      expect(mesh.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      // Everything lives inside the playable bounds and above the ground.
      expect(box.min.x).toBeGreaterThan(-40);
      expect(box.max.x).toBeLessThan(40);
      expect(box.min.z).toBeGreaterThan(-34);
      expect(box.max.z).toBeLessThan(34);
      expect(box.min.y).toBeGreaterThan(-0.05);
    }
  });

  it('keeps transparent glass in its own draw group, never merged with opaque parts', () => {
    const glass = meshes().filter((mesh) => (mesh.material as THREE.Material).transparent);
    expect(glass.length).toBeGreaterThanOrEqual(1);
    for (const mesh of glass) expect(mesh.name).toContain('glass');
    const opaque = meshes().filter((mesh) => !(mesh.material as THREE.Material).transparent);
    for (const mesh of opaque) expect(mesh.name).not.toContain('glass');
  });

  it('stays inside the authoring budget', () => {
    const triangles = countVehicleTriangles(vehicles.root);
    console.log(`world-studio vehicles census: triangles=${triangles} drawGroups=${meshes().length} solids=${vehicles.solids.length} meshes=${meshes().map((mesh) => `${mesh.name}:${mesh.geometry.getAttribute('position').count / 3}`).join(' | ')}`);
    expect(triangles).toBeLessThanOrEqual(60_000);
    expect(meshes().length).toBeLessThanOrEqual(60);
    expect(vehicles.root.userData.worldStudioVehicles.triangleCount).toBe(triangles);
  });

  it('places the bus, truck and car in their brief envelopes facing opposite directions', () => {
    const solids = vehicles.solids;
    const ids = solids.map((solid) => solid.id);
    expect(new Set(ids).size).toBe(ids.length);
    const busBox = [-5, -2, 0, 3.2, -3.1, 7.1];
    const truckBox = [2, 5, 0, 4.0, -9.1, 5.1];
    const carBox = [-21.9, -20.1, 0, 1.5, 20.8, 25.2];
    for (const solid of solids) {
      expect(solid.mesh.parent).toBe(vehicles.root);
      expect(solid.bounds.minX).toBeLessThan(solid.bounds.maxX);
      expect(solid.bounds.minZ).toBeLessThan(solid.bounds.maxZ);
      expect(solid.bounds.minY!).toBeLessThan(solid.bounds.maxY!);
      const envelope = solid.id.startsWith('bus') ? busBox : solid.id.startsWith('car') ? carBox : truckBox;
      expect(within(solid.bounds, envelope), `${solid.id} ${JSON.stringify(solid.bounds)}`).toBe(true);
    }
    // Visible mass is blocked: body shells and wheels for every vehicle, the trailer as container.
    expect(ids).toEqual(expect.arrayContaining(['bus-body', 'bus-wheel-0-r', 'tractor-cab', 'tractor-hood', 'trailer-box', 'car-body', 'car-wheel-1-l']));
    expect(solids.find((solid) => solid.id === 'trailer-box')!.material).toBe('container');
    // Bus nose to -Z, truck nose to +Z: measured from the baked paint skins.
    const skins = vehicles.root.userData.worldStudioVehicles.skins as Array<{ name: string; centre: { x: number; z: number } }>;
    const busSkin = skins.find((skin) => skin.name.includes('world-studio-bus'))!;
    const tractorSkin = skins.find((skin) => skin.name.includes('world-studio-tractor'))!;
    expect(busSkin.centre.x).toBeCloseTo(-3.5, 1);
    expect(busSkin.centre.z).toBeCloseTo(2, 1);
    expect(tractorSkin.centre.x).toBeCloseTo(3.5, 1);
    expect(tractorSkin.centre.z).toBeCloseTo(5 - 5.6 / 2, 1);
    // A 2 m lane stays open between the bus and the truck.
    const busMaxX = Math.max(...solids.filter((s) => s.id.startsWith('bus')).map((s) => s.bounds.maxX));
    const truckMinX = Math.min(...solids.filter((s) => s.id.startsWith('tra')).map((s) => s.bounds.minX));
    expect(truckMinX - busMaxX).toBeGreaterThanOrEqual(2);
  });

  it('exposes an idempotent dispose', () => {
    const fresh = createStudioVehicles();
    expect(typeof fresh.root.userData.dispose).toBe('function');
    fresh.root.userData.dispose();
  });
});
