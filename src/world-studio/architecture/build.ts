/**
 * HF-571 world-studio architecture: geometry collector.
 *
 * Everything authored by this lane is an axis-aligned box or a rotated roof slab, emitted
 * through one collector so that:
 *  - UVs are baked in WORLD METRES (the material carries `repeat = 1 / metresPerTile`), so
 *    adjacent wall segments around an aperture share one continuous siding rhythm;
 *  - contact shading is written into a vertex colour attribute instead of an aoMap, which
 *    would need a second UV set and a texture the batcher cannot merge;
 *  - static geometry is merged per (group, material) before it reaches the scene, keeping
 *    renderable draw groups far below the authored budget;
 *  - every colliding box records a WORLD-coordinate `Box2` with explicit minY/maxY.
 *
 * Solids reference the merged mesh that contains them: root batches this arena anyway, and
 * a mesh per collider would blow the draw-group budget by two orders of magnitude.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BallisticMaterialId } from '../../ballistics';
import type { Box2 } from '../../collision';
import type { StudioMaterialId, StudioMaterialKit } from './materials';

export type StudioSolid = Readonly<{
  id: string;
  mesh: THREE.Object3D;
  bounds: Box2;
  material: BallisticMaterialId;
}>;

/** Darkens vertices approaching a floor and/or a ceiling plane - cheap authored contact AO. */
export type ContactShading = Readonly<{
  floorY?: number;
  floorStrength?: number;
  floorHeight?: number;
  ceilingY?: number;
  ceilingStrength?: number;
  ceilingHeight?: number;
  /** Flat multiplier applied before the contact terms (material variation between parts). */
  tint?: number;
}>;

export type BoxSpec = Readonly<{
  id: string;
  group: string;
  material: StudioMaterialId;
  /** `null` marks non-colliding dressing: trim, gutters, pergola slats, balusters. */
  ballistic: BallisticMaterialId | null;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  contact?: ContactShading;
  /** Swaps u and v so board grain can run across a part rather than along it. */
  uvSwap?: boolean;
  /** Shifts the UV origin; used to break repetition between otherwise identical parts. */
  uvOffset?: readonly [number, number];
}>;

export type Aperture = Readonly<{
  id: string;
  /** Extent along the wall axis, in world coordinates. */
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}>;

export type WallSpec = Readonly<{
  id: string;
  group: string;
  material: StudioMaterialId;
  /** `null` for non-colliding linings whose structural wall already carries the collider. */
  ballistic: BallisticMaterialId | null;
  /** World axis the wall runs along. */
  axis: 'x' | 'z';
  /** World coordinate of the wall centre on the perpendicular axis. */
  at: number;
  thickness: number;
  from: number;
  to: number;
  y0: number;
  y1: number;
  apertures?: readonly Aperture[];
  contact?: ContactShading;
  uvSwap?: boolean;
}>;

type Bucket = {
  key: string;
  material: StudioMaterialId;
  group: string;
  geometries: THREE.BufferGeometry[];
};

type PendingSolid = {
  id: string;
  bucket: string;
  bounds: Box2;
  material: BallisticMaterialId;
};

const EPSILON = 1e-4;

function contactFactor(y: number, contact: ContactShading | undefined): number {
  let shade = contact?.tint ?? 1;
  if (contact?.floorY !== undefined) {
    const height = contact.floorHeight ?? 0.65;
    const t = Math.max(0, Math.min(1, (y - contact.floorY) / height));
    shade *= 1 - (contact.floorStrength ?? 0.22) * (1 - t) ** 2;
  }
  if (contact?.ceilingY !== undefined) {
    const height = contact.ceilingHeight ?? 0.45;
    const t = Math.max(0, Math.min(1, (contact.ceilingY - y) / height));
    shade *= 1 - (contact.ceilingStrength ?? 0.16) * (1 - t) ** 2;
  }
  return Math.max(0.25, shade);
}

type FaceDefinition = {
  normal: readonly [number, number, number];
  /** Corner picks per vertex: 0 = min, 1 = max, per axis. */
  corners: ReadonlyArray<readonly [number, number, number]>;
  /** World axes (0 = x, 1 = y, 2 = z) mapped to u and v. */
  uv: readonly [number, number];
};

// Winding is counter-clockwise seen from outside the box; verified by the face-normal
// cross products in studio-architecture.test.ts rather than by eye.
const FACES: readonly FaceDefinition[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: [2, 1] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: [2, 1] },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: [0, 2] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [0, 2] },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [0, 1] },
  { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: [0, 1] },
];

/** Box geometry with metre-scaled world UVs, per-vertex contact shading and hard normals. */
export function studioBoxGeometry(spec: BoxSpec): THREE.BufferGeometry {
  const lo = spec.min;
  const hi = spec.max;
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const colors = new Float32Array(24 * 3);
  const indices: number[] = [];
  const offsetU = spec.uvOffset?.[0] ?? 0;
  const offsetV = spec.uvOffset?.[1] ?? 0;

  let vertex = 0;
  for (const face of FACES) {
    const base = vertex;
    for (const corner of face.corners) {
      const point: [number, number, number] = [
        corner[0] ? hi[0] : lo[0],
        corner[1] ? hi[1] : lo[1],
        corner[2] ? hi[2] : lo[2],
      ];
      positions[vertex * 3] = point[0];
      positions[vertex * 3 + 1] = point[1];
      positions[vertex * 3 + 2] = point[2];
      normals[vertex * 3] = face.normal[0];
      normals[vertex * 3 + 1] = face.normal[1];
      normals[vertex * 3 + 2] = face.normal[2];
      const u = point[face.uv[0]] + offsetU;
      const v = point[face.uv[1]] + offsetV;
      uvs[vertex * 2] = spec.uvSwap ? v : u;
      uvs[vertex * 2 + 1] = spec.uvSwap ? u : v;
      const shade = contactFactor(point[1], spec.contact);
      colors[vertex * 3] = shade;
      colors[vertex * 3 + 1] = shade;
      colors[vertex * 3 + 2] = shade;
      vertex++;
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

export class StudioSurfaceCollector {
  private readonly buckets = new Map<string, Bucket>();

  private readonly pending: PendingSolid[] = [];

  private readonly seenIds = new Set<string>();

  addBox(spec: BoxSpec): void {
    const min: [number, number, number] = [
      Math.min(spec.min[0], spec.max[0]),
      Math.min(spec.min[1], spec.max[1]),
      Math.min(spec.min[2], spec.max[2]),
    ];
    const max: [number, number, number] = [
      Math.max(spec.min[0], spec.max[0]),
      Math.max(spec.min[1], spec.max[1]),
      Math.max(spec.min[2], spec.max[2]),
    ];
    if (max[0] - min[0] < EPSILON || max[1] - min[1] < EPSILON || max[2] - min[2] < EPSILON) return;
    if (this.seenIds.has(spec.id)) {
      throw new Error(`world-studio architecture: duplicate part id '${spec.id}'`);
    }
    this.seenIds.add(spec.id);

    const key = `${spec.group}:${spec.material}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { key, material: spec.material, group: spec.group, geometries: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geometries.push(studioBoxGeometry({ ...spec, min, max }));

    if (spec.ballistic) {
      this.pending.push({
        id: spec.id,
        bucket: key,
        material: spec.ballistic,
        bounds: {
          minX: min[0],
          maxX: max[0],
          minY: min[1],
          maxY: max[1],
          minZ: min[2],
          maxZ: max[2],
        },
      });
    }
  }

  /**
   * Emits the exact solid wall segments left after subtracting rectangular apertures, so a
   * door or window is a real hole in both the presentation and the collision set. Apertures
   * are given in world coordinates along the wall axis.
   */
  addWall(spec: WallSpec): void {
    const from = Math.min(spec.from, spec.to);
    const to = Math.max(spec.from, spec.to);
    const half = spec.thickness / 2;
    const apertures = (spec.apertures ?? [])
      .map((aperture) => ({
        ...aperture,
        u0: Math.max(from, Math.min(aperture.u0, aperture.u1)),
        u1: Math.min(to, Math.max(aperture.u0, aperture.u1)),
      }))
      .filter((aperture) => aperture.u1 - aperture.u0 > EPSILON
        && aperture.y1 > spec.y0 + EPSILON
        && aperture.y0 < spec.y1 - EPSILON);

    const cuts = new Set<number>([from, to]);
    for (const aperture of apertures) {
      cuts.add(aperture.u0);
      cuts.add(aperture.u1);
    }
    const bands = [...cuts].sort((left, right) => left - right);

    let index = 0;
    for (let band = 0; band < bands.length - 1; band++) {
      const u0 = bands[band];
      const u1 = bands[band + 1];
      if (u1 - u0 < EPSILON) continue;
      const mid = (u0 + u1) / 2;
      const active = apertures
        .filter((aperture) => aperture.u0 <= mid && aperture.u1 >= mid)
        .sort((left, right) => left.y0 - right.y0);
      let cursor = spec.y0;
      const emit = (y0: number, y1: number): void => {
        if (y1 - y0 < EPSILON) return;
        this.addBox({
          id: `${spec.id}-${index++}`,
          group: spec.group,
          material: spec.material,
          ballistic: spec.ballistic,
          min: spec.axis === 'x' ? [u0, y0, spec.at - half] : [spec.at - half, y0, u0],
          max: spec.axis === 'x' ? [u1, y1, spec.at + half] : [spec.at + half, y1, u1],
          contact: spec.contact,
          uvSwap: spec.uvSwap,
        });
      };
      for (const aperture of active) {
        emit(cursor, Math.min(aperture.y0, spec.y1));
        cursor = Math.max(cursor, aperture.y1);
      }
      emit(Math.max(cursor, spec.y0), spec.y1);
    }
  }

  /** Adds an already-built geometry (roof slabs) under an existing bucket. */
  addGeometry(group: string, material: StudioMaterialId, geometry: THREE.BufferGeometry): void {
    const key = `${group}:${material}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { key, material, group, geometries: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geometries.push(geometry);
  }

  /** Registers a collider whose presentation is already owned by another part. */
  addCollider(id: string, bucket: string, bounds: Box2, material: BallisticMaterialId): void {
    this.pending.push({ id, bucket, bounds, material });
  }

  /** Merges every bucket into one mesh, parents them to `parent`, and resolves the solids. */
  build(parent: THREE.Object3D, materials: StudioMaterialKit): StudioSolid[] {
    const meshes = new Map<string, THREE.Mesh>();
    for (const bucket of [...this.buckets.values()].sort((left, right) => left.key.localeCompare(right.key))) {
      if (bucket.geometries.length === 0) continue;
      const merged = bucket.geometries.length === 1
        ? bucket.geometries[0]
        : mergeGeometries(bucket.geometries, false);
      if (!merged) {
        throw new Error(`world-studio architecture: failed to merge bucket '${bucket.key}'`);
      }
      if (bucket.geometries.length > 1) {
        for (const geometry of bucket.geometries) geometry.dispose();
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, materials.get(bucket.material));
      mesh.name = `world-studio-${bucket.key.replace(':', '-')}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.set(bucket.key, mesh);
      bucket.geometries.length = 0;
    }

    return this.pending.map((solid) => {
      const mesh = meshes.get(solid.bucket);
      if (!mesh) {
        throw new Error(`world-studio architecture: solid '${solid.id}' has no presentation bucket`);
      }
      return Object.freeze({ id: solid.id, mesh, bounds: solid.bounds, material: solid.material });
    });
  }

  get drawGroupCount(): number {
    return this.buckets.size;
  }
}
