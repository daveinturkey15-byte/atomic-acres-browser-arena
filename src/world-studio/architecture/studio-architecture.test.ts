/**
 * HF-571 world-studio architecture contract checks.
 *
 * These are the executable claims this lane makes to root: real apertures, matched stair
 * colliders, a true upper floor with a stairwell hole, world-coordinate solids, and an
 * authoring budget that leaves room for the other lanes.
 */

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { studioBoxGeometry } from './build';
import { GROUND_FLOOR_Y, RIDGE_Y, UPPER_FLOOR_Y, countDrawGroups, countTriangles, createStudioArchitecture, type StudioArchitecture } from './index';

let architecture: StudioArchitecture;

beforeAll(() => {
  architecture = createStudioArchitecture();
});

type Solid = StudioArchitecture['solids'][number];

function unrotated(solids: readonly Solid[]): Solid[] {
  return solids.filter((solid) => !solid.bounds.rotation);
}

function occupied(solids: readonly Solid[], x: number, y: number, z: number): Solid | null {
  for (const solid of unrotated(solids)) {
    const bounds = solid.bounds;
    if (x < bounds.minX || x > bounds.maxX) continue;
    if (z < bounds.minZ || z > bounds.maxZ) continue;
    if (y < (bounds.minY ?? 0) || y > (bounds.maxY ?? 0)) continue;
    return solid;
  }
  return null;
}

/** Highest colliding surface strictly below `y` at (x, z). */
function supportHeight(solids: readonly Solid[], x: number, z: number, y: number): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const solid of unrotated(solids)) {
    const bounds = solid.bounds;
    if (x < bounds.minX || x > bounds.maxX) continue;
    if (z < bounds.minZ || z > bounds.maxZ) continue;
    const top = bounds.maxY ?? 0;
    if (top <= y + 1e-6 && top > best) best = top;
  }
  return best;
}

describe('world-studio architecture contract', () => {
  it('returns a root at the origin whose meshes are all descendants', () => {
    expect(architecture.root.position.toArray()).toEqual([0, 0, 0]);
    expect(architecture.root.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(architecture.root.scale.toArray()).toEqual([1, 1, 1]);
    expect(architecture.solids.length).toBeGreaterThan(200);
    for (const solid of architecture.solids) {
      let found = false;
      architecture.root.traverse((child) => {
        if (child === solid.mesh) found = true;
      });
      expect(found, `${solid.id} presentation is parented to the root`).toBe(true);
    }
  });

  it('publishes world-coordinate bounds with explicit vertical extents', () => {
    for (const solid of architecture.solids) {
      const bounds = solid.bounds;
      expect(bounds.minY, `${solid.id} minY`).toBeTypeOf('number');
      expect(bounds.maxY, `${solid.id} maxY`).toBeTypeOf('number');
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxZ).toBeGreaterThan(bounds.minZ);
      expect(bounds.maxY as number).toBeGreaterThan(bounds.minY as number);
      expect(bounds.minX).toBeGreaterThanOrEqual(-40);
      expect(bounds.maxX).toBeLessThanOrEqual(40);
      expect(bounds.minZ).toBeGreaterThanOrEqual(-34);
      expect(bounds.maxZ).toBeLessThanOrEqual(34);
      expect(bounds.maxY as number).toBeLessThanOrEqual(RIDGE_Y + 1.5);
    }
  });

  it('keeps both houses on their contracted footprints and fronts', () => {
    const teal = architecture.solids.filter((solid) => solid.id.startsWith('teal-house-'));
    const yellow = architecture.solids.filter((solid) => solid.id.startsWith('yellow-house-'));
    expect(teal.length).toBeGreaterThan(100);
    expect(teal.length).toBe(yellow.length);
    const tealX = teal.map((solid) => [solid.bounds.minX, solid.bounds.maxX]).flat();
    const yellowX = yellow.map((solid) => [solid.bounds.minX, solid.bounds.maxX]).flat();
    // Nothing authored here may reach the road corridor at X = +-10.
    expect(Math.max(...tealX)).toBeLessThan(-10.5);
    expect(Math.min(...yellowX)).toBeGreaterThan(10.5);
    // Mirrored about the road: the teal front wall and the yellow front wall are equidistant.
    expect(Math.max(...tealX) + Math.min(...yellowX)).toBeCloseTo(0, 6);
  });

  it('leaves street and yard entrances physically open', () => {
    const probes: ReadonlyArray<readonly [string, number, number, number]> = [
      ['teal front door', -13.11, 1.2, 3.95],
      ['teal front door head', -13.11, 2.0, 3.95],
      ['yellow front door', 13.11, 1.2, 3.95],
      ['teal rear slider open leaf', -26.89, 1.4, -2.6],
      ['yellow rear slider open leaf', 26.89, 1.4, -2.6],
      ['teal balcony door open leaf', -26.89, 4.2, -2.9],
      ['teal garage roof door open leaf', -22.5, 4.2, 8.89],
      ['teal garage link', -24.05, 1.2, 8.89],
      ['yellow garage link', 24.05, 1.2, 8.89],
      ['teal garage vehicle door', -20, 1.5, 18.9],
      ['yellow garage vehicle door', 20, 1.5, 18.9],
    ];
    for (const [label, x, y, z] of probes) {
      const blocker = occupied(architecture.solids, x, y, z);
      expect(blocker?.id ?? null, `${label} is open (blocked by ${blocker?.id})`).toBeNull();
    }
  });

  it('connects every ground room and both storeys', () => {
    const interior: ReadonlyArray<readonly [string, number, number, number]> = [
      ['living room', -16.5, 1.2, -4.5],
      ['entry hall', -16.5, 1.2, 5],
      ['dining room', -23.5, 1.2, -4.5],
      ['kitchen', -23.5, 1.2, 5.5],
      ['living to dining opening', -20, 1.2, -6.4],
      ['hall to kitchen door', -20, 1.2, 5.45],
      ['living to hall arch', -15, 1.2, 0],
      ['dining to kitchen opening', -24.6, 1.2, 2],
      ['upper landing', -16.5, 4.4, 4],
      ['master bedroom', -16, 4.4, -5],
      ['study', -24.5, 4.4, -5],
      ['bedroom two', -24, 4.4, 6.5],
      ['landing to bedroom door', -15.2, 4.4, 1],
      ['landing to bath door', -20, 4.4, 2],
      ['bath to study door', -25.4, 4.4, -1],
    ];
    for (const [label, x, y, z] of interior) {
      const blocker = occupied(architecture.solids, x, y, z);
      expect(blocker?.id ?? null, `${label} is clear (blocked by ${blocker?.id})`).toBeNull();
    }
  });

  it('gives every visible stair tread a matching physical step', () => {
    const centreX = -20 + 0.745;
    let previous = GROUND_FLOOR_Y;
    for (let step = 0; step < 16; step++) {
      const z = 2.2 + (step + 0.5) * 0.28125;
      const expected = GROUND_FLOOR_Y + (step + 1) * ((UPPER_FLOOR_Y - GROUND_FLOOR_Y) / 16);
      // Queried from just above the tread: the first treads run under the upper floor, so a
      // query from storey height would report the slab above rather than the step below.
      const support = supportHeight(architecture.solids, centreX, z, expected + 0.001);
      expect(support, `tread ${step} collider`).toBeCloseTo(expected, 5);
      // A climbable rise: no step may exceed the usual half-metre step-up allowance.
      expect(support - previous).toBeLessThan(0.5);
      previous = support;
    }
    // The stairwell is a real hole: nothing spans it at head height above the lower treads.
    expect(occupied(architecture.solids, centreX, UPPER_FLOOR_Y - 0.15, 3.2)?.id ?? null).toBeNull();
  });

  it('supports a player on the upper floor away from the stairwell', () => {
    const samples: ReadonlyArray<readonly [number, number]> = [
      [-16, -5],
      [-24, -5],
      [-24, 6.5],
      [-16, 4],
      [16, -5],
      [24, 6.5],
    ];
    for (const [x, z] of samples) {
      expect(supportHeight(architecture.solids, x, z, UPPER_FLOOR_Y + 0.02), `upper floor at ${x},${z}`).toBeCloseTo(UPPER_FLOOR_Y, 5);
    }
  });

  it('publishes vertical navigation for both houses', () => {
    const { routes, ramps, platforms } = architecture.verticalNavigation;
    expect(routes.map((route) => route.id)).toEqual(expect.arrayContaining([
      'teal-house-interior-stair',
      'teal-house-external-stair',
      'yellow-house-interior-stair',
      'yellow-house-external-stair',
    ]));
    expect(ramps.length).toBeGreaterThanOrEqual(4);
    for (const ramp of ramps) expect(ramp.width).toBeGreaterThan(1);
    for (const route of routes) {
      expect(route.top[1]).toBeGreaterThan(route.foot[1]);
    }
    const upper = platforms.filter((platform) => Math.abs(platform.y - UPPER_FLOOR_Y) < 1e-6);
    expect(upper.length).toBeGreaterThanOrEqual(4);
  });

  it('stays inside the authored geometry budget', () => {
    const triangles = countTriangles(architecture.root);
    const groups = countDrawGroups(architecture.root);
    const census = architecture.root.userData.worldStudioArchitecture as { triangleCount: number; drawGroupCount: number; solidCount: number };
    expect(census.triangleCount).toBe(triangles);
    expect(census.drawGroupCount).toBe(groups);
    expect(census.solidCount).toBe(architecture.solids.length);
    expect(triangles).toBeLessThanOrEqual(100_000);
    expect(groups).toBeLessThanOrEqual(80);
    expect(groups).toBeGreaterThan(0);
  });

  it('uses only MeshStandardMaterial with shared generated maps', () => {
    const materials = new Set<THREE.Material>();
    architecture.root.traverse((child) => {
      if (child instanceof THREE.Mesh) materials.add(child.material as THREE.Material);
    });
    expect(materials.size).toBeGreaterThan(3);
    const images = new Set<unknown>();
    for (const material of materials) {
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
      const standard = material as THREE.MeshStandardMaterial;
      expect(standard.vertexColors).toBe(true);
      if (standard.map) {
        const image = standard.map.image as { width: number; data: ArrayBufferView };
        expect(image.width).toBe(512);
        images.add(image.data);
      }
    }
    // One albedo buffer per texture family, shared by every material that tints it.
    expect(images.size).toBeLessThanOrEqual(4);
  });

  it('publishes furniture anchors and review cameras for the other lanes', () => {
    const anchors = architecture.root.userData.furnitureAnchors as ReadonlyArray<{ id: string; position: [number, number, number] }>;
    expect(anchors.length).toBeGreaterThanOrEqual(20);
    for (const entry of anchors) {
      expect(Math.abs(entry.position[0])).toBeLessThan(40);
      expect(Math.abs(entry.position[2])).toBeLessThan(34);
    }
    expect(architecture.reviewPoints?.length ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('builds box faces with outward winding and metre-scaled world uvs', () => {
    const geometry = studioBoxGeometry({
      id: 'probe',
      group: 'probe',
      material: 'trim',
      ballistic: null,
      min: [1, 0, 2],
      max: [3, 1, 6],
    });
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let triangle = 0; triangle < (index as THREE.BufferAttribute).count / 3; triangle++) {
      const i0 = (index as THREE.BufferAttribute).getX(triangle * 3);
      const i1 = (index as THREE.BufferAttribute).getX(triangle * 3 + 1);
      const i2 = (index as THREE.BufferAttribute).getX(triangle * 3 + 2);
      a.fromBufferAttribute(position as THREE.BufferAttribute, i0);
      b.fromBufferAttribute(position as THREE.BufferAttribute, i1);
      c.fromBufferAttribute(position as THREE.BufferAttribute, i2);
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const authored = new THREE.Vector3().fromBufferAttribute(normal as THREE.BufferAttribute, i0);
      expect(face.dot(authored)).toBeGreaterThan(0.99);
    }
    const uv = geometry.getAttribute('uv');
    let maxU = 0;
    for (let vertex = 0; vertex < uv.count; vertex++) maxU = Math.max(maxU, uv.getX(vertex));
    // UVs are world metres, so the +X face reaches the box's world Z extent.
    expect(maxU).toBeCloseTo(6, 6);
  });
});
