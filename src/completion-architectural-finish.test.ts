import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import { lapSidingParts, type FacadeFacing, type FacadePart } from './forge-kit/facade';
import { facadeElevationParts, type FacadeElevationOptions } from './forge-kit/facade-elevation';

// Frozen by two CPU builds BEFORE the finish change at c710fc3deff03438ba487b9c995c6959ed741b58.
// These cover values and geometry, not merely counts. See the accompanying recipe.
const BASELINE = {
  authority: '90887b6cbcbf8f57d81999580a84e869f40e9ec9cb60806343adca957ac66724',
  sourceGeometry: 'ef31bd11a86f973dd62c8a1dab77c8bdf14564c28d8583289e07d3da5f5254d9',
  renderedTriangles: '02464c9c1efe450342ad1506de2fcf6b47f354e490ebaec4bcd6b10fbf390db6',
  instances: 'f7f8c9ad5c56db234cf1f354c0e3ea6b2cf97c035786630e5ecbb7fb43a03acb',
  materialNames: 'ea587261b5171ce432280ad3b5a17eef8f3d88e55afaaf8ee4e84d6ca7df5e7b',
};
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function geometryRecord(g: THREE.BufferGeometry) {
  return {
    attributes: Object.fromEntries(Object.entries(g.attributes).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, a]) => [key, { itemSize: a.itemSize, normalized: a.normalized, array: Array.from(a.array) }])),
    index: g.index ? Array.from(g.index.array) : null,
    groups: g.groups, drawRange: g.drawRange,
    morphAttributes: g.morphAttributes, morphTargetsRelative: g.morphTargetsRelative,
  };
}

function objectRecord(o: THREE.Object3D): unknown {
  const m = o as THREE.Mesh;
  return {
    name: o.name, type: o.type, matrix: o.matrixWorld.toArray(), visible: o.visible,
    layers: o.layers.mask, castShadow: o.castShadow, receiveShadow: o.receiveShadow,
    renderOrder: o.renderOrder, userData: o.userData,
    geometry: m.isMesh ? digest(geometryRecord(m.geometry)) : undefined,
    children: o.children.map(objectRecord),
  };
}

// Material changes regroup static batches. Compare their complete triangle
// attributes without batch order, preserving vertex order (and thus winding).
function renderedTriangleRecord(root: THREE.Object3D) {
  const triangles: string[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const keys = Object.keys(g.attributes).sort();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const vector = new THREE.Vector3();
    const vertices = Array.from({ length: g.attributes.position.count }, (_, index) => keys.map((key) => {
      const attribute = g.attributes[key]!;
      const values = Array.from({ length: attribute.itemSize }, (_, component) => attribute.array[index * attribute.itemSize + component]!);
      if (key === 'position') return vector.fromArray(values).applyMatrix4(mesh.matrixWorld).toArray();
      if (key === 'normal') return vector.fromArray(values).applyNormalMatrix(normalMatrix).toArray();
      return values;
    }));
    const count = g.index?.count ?? g.attributes.position.count;
    for (let index = 0; index < count; index += 3) {
      const triangle = [0, 1, 2].map((corner) => vertices[g.index ? g.index.getX(index + corner) : index + corner]);
      triangles.push(JSON.stringify({
        attributes: keys, vertices: triangle, layers: mesh.layers.mask,
        castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, renderOrder: mesh.renderOrder,
      }));
    }
  });
  return { count: triangles.length, digest: digest(triangles.sort()) };
}

const map = buildNuketown2(new THREE.Scene());
map.root.updateMatrixWorld(true);
const meshes: THREE.Mesh[] = [];
map.root.traverse((object) => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
const mesh = (name: string): THREE.Mesh => {
  const found = map.root.getObjectByName(`nuketown2 ${name}`);
  expect(found).toBeInstanceOf(THREE.Mesh);
  return found as THREE.Mesh;
};
const material = (name: string): THREE.Material => mesh(name).material as THREE.Material;
const dimensions = (parts: readonly FacadePart[]) => parts.map(({ suffix, offset, size }) => ({ suffix, offset, size }));

describe('architectural finish: unchanged structure, reusable material roles', () => {
  it('keeps default lap output and changes only requested joint roles on every facing', () => {
    for (const facing of ['x+', 'x-', 'z+', 'z-'] as FacadeFacing[]) {
      for (const height of [0.3, 0.9, 2.9, 3.2]) {
        const options = { run: 3.7, height, facing, courseOffset: 20 };
        const original = lapSidingParts(options);
        expect(lapSidingParts({ ...options, jointRole: 'reveal' })).toEqual(original);
        const revised = lapSidingParts({ ...options, jointRole: 'sidingJoint' });
        expect(dimensions(revised)).toEqual(dimensions(original));
        for (let i = 0; i < original.length; i += 1) {
          expect(revised[i]!.role).toBe(original[i]!.role === 'reveal' ? 'sidingJoint' : original[i]!.role);
        }
      }
    }
  });

  it('passes the optional role through piers without recolouring window or door reveals', () => {
    const options: FacadeElevationOptions = {
      id: 'mixed elevation', extent: [0, 12], height: 3.2, facing: 'z+', wallThickness: 0.3,
      openings: [
        { kind: 'window', along: [1, 2], sill: 1, head: 2.1 },
        { kind: 'door', along: [4, 6], head: 2.4 },
      ],
    };
    for (const door of ['parked-leaf', 'sectional-head'] as const) {
      const original = facadeElevationParts({ ...options, style: { door } });
      const revised = facadeElevationParts({ ...options, style: { door, jointRole: 'sidingJoint' } });
      expect(revised.map((g) => ({ prop: g.prop, parts: dimensions(g.parts) })))
        .toEqual(original.map((g) => ({ prop: g.prop, parts: dimensions(g.parts) })));
      // Three real pier groups precede the window and door groups.
      expect(revised.slice(3)).toEqual(original.slice(3));
      expect(revised.slice(0, 3).every((g) => g.parts.some((p) => p.role === 'sidingJoint'))).toBe(true);
    }
  });

  it('uses existing finishes in two distinct real elevations and on all four lamp shafts', () => {
    const sign = material('north verge sign board');
    const timber = material('north house living art frame');
    for (const side of ['north', 'south']) {
      const house = mesh(`${side} house front siding 0 reveal 0`);
      const garage = mesh(`${side} garage front siding 0 reveal 0`);
      expect(house.material).toBe(sign);
      expect(garage.material).toBe(sign);
      expect(geometryRecord(house.geometry)).not.toEqual(geometryRecord(garage.geometry));
      expect(material(`${side} house upper front siding 0 reveal 20`)).toBe(side === 'north' ? timber : sign);
      for (const part of [house, garage]) {
        expect(part.userData.presentationOnly).toBe(true);
        expect(part.userData.ballisticSurfaceId).toBeUndefined();
      }
      for (const id of ['west', 'east']) {
        const shaft = mesh(`${side} verge ${id} lamp post`);
        expect(shaft.material).toBe(sign);
        expect(shaft.userData.presentationOnly).toBe(true);
        expect(shaft.geometry.index!.count / 3).toBe(12);
      }
      expect(material(`${side} house front window reveal 0 reveal head`).name).toBe('nuketown2-roof-shingles');
      expect(material(`${side} garage door panels reveal 0`).name).toBe('nuketown2-roof-shingles');
    }
    expect(sign.name).toBe('nuketown2-sign');
    expect((sign as THREE.MeshStandardMaterial).roughness).toBe(0.62);
    expect((sign as THREE.MeshStandardMaterial).metalness).toBe(0.08);
  });

  it('retains complete baseline authority and geometry, including normals, UVs and transforms', () => {
    const authority = {
      ...map, root: undefined,
      raycastMeshes: map.raycastMeshes.map(objectRecord),
      breakableWindows: map.breakableWindows.map(({ mesh: windowMesh, ...rest }) => ({ ...rest, mesh: objectRecord(windowMesh) })),
    };
    expect(digest(authority)).toBe(BASELINE.authority);
    const authored = meshes.filter((m) => !(m.userData.staticBatchRendered && typeof m.userData.sourceMeshes === 'number'));
    expect(authored.length).toBe(3803);
    expect(digest(authored.map(objectRecord))).toBe(BASELINE.sourceGeometry);
    expect(renderedTriangleRecord(map.root)).toEqual({ count: 148028, digest: BASELINE.renderedTriangles });
    expect(map.update).toBeUndefined();
    // Instanced meshes share geometry; additionally pin every instance transform
    // and colour so a matching base-mesh hash cannot hide moved vegetation.
    const instances = meshes.filter((m): m is THREE.InstancedMesh => (m as THREE.InstancedMesh).isInstancedMesh === true)
      .map((m) => ({ name: m.name, count: m.count, matrix: Array.from(m.instanceMatrix.array), color: m.instanceColor ? Array.from(m.instanceColor.array) : null }));
    expect(instances.length).toBe(49);
    expect(digest(instances)).toBe(BASELINE.instances);
    const materials = new Set(meshes.flatMap((m) => Array.isArray(m.material) ? m.material : [m.material]));
    expect(digest([...materials].map((m) => m.name).sort())).toBe(BASELINE.materialNames);
    expect({
      meshes: meshes.length,
      triangles: meshes.reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0),
      geometries: new Set(meshes.map((m) => m.geometry)).size,
      materials: materials.size,
    }).toEqual({ meshes: 3858, triangles: 188480, geometries: 3826, materials: 94 });
  });
});
