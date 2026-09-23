/**
 * HF-571 world-studio vehicles: authored detail parts.
 *
 * The vehicle forge lofts the painted bodies; everything a loft cannot express (a ribbed
 * box trailer, chassis rails, fuel tanks, roof marker lamps, a school-bus stop arm) is
 * authored here as non-indexed box and lathe parts in the SAME vehicle frame and the SAME
 * material buckets, then handed to `mergeForgedPlacements` as a second "vehicle" at the
 * same placement so it folds into the forge's per-material meshes without a new draw.
 *
 * Attribute set is position/normal/uv, matching the forge's own parts, so the static merge
 * stays valid. Glass is never added here: the forge stamps its glass with a shade attribute
 * and mixing attribute sets in one bucket would break the merge.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ForgedVehicle, ForgedVehicleMaterials } from '../../vehicle-forge';

export type PartBucket = Exclude<keyof ForgedVehicleMaterials, 'glass'>;

type Vec3 = readonly [number, number, number];

export class PartSink {
  private readonly parts = new Map<PartBucket, THREE.BufferGeometry[]>();

  private readonly counts: Record<string, number> = {};

  add(bucket: PartBucket, part: string, geometry: THREE.BufferGeometry): void {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (nonIndexed !== geometry) geometry.dispose();
    for (const name of [...Object.keys(nonIndexed.attributes)]) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') nonIndexed.deleteAttribute(name);
    }
    let list = this.parts.get(bucket);
    if (!list) {
      list = [];
      this.parts.set(bucket, list);
    }
    list.push(nonIndexed);
    this.counts[part] = (this.counts[part] ?? 0) + 1;
  }

  /** Axis-aligned box from `min` to `max` in the vehicle frame. */
  box(bucket: PartBucket, part: string, min: Vec3, max: Vec3): void {
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as const;
    if (size[0] <= 0 || size[1] <= 0 || size[2] <= 0) return;
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
      (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2,
    ));
    this.add(bucket, part, geometry);
  }

  /** Mirrored pair of boxes: `min`/`max` describe the +x part, x is reflected for the other. */
  boxPair(bucket: PartBucket, part: string, min: Vec3, max: Vec3): void {
    this.box(bucket, part, min, max);
    this.box(bucket, part, [-max[0], min[1], min[2]], [-min[0], max[1], max[2]]);
  }

  /** Cylinder whose axis runs along `axis`, centred at `centre`. */
  cylinder(
    bucket: PartBucket,
    part: string,
    axis: 'x' | 'y' | 'z',
    centre: Vec3,
    radius: number,
    length: number,
    segments = 12,
    radiusTop = radius,
  ): void {
    const geometry = new THREE.CylinderGeometry(radiusTop, radius, length, segments, 1, false);
    const matrix = new THREE.Matrix4();
    if (axis === 'x') matrix.makeRotationZ(Math.PI / 2);
    else if (axis === 'z') matrix.makeRotationX(Math.PI / 2);
    geometry.applyMatrix4(matrix);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(centre[0], centre[1], centre[2]));
    this.add(bucket, part, geometry);
  }

  /** A shallow round lamp: chrome bezel ring plus lens disc facing `facing` along z. */
  roundLamp(part: string, lens: 'headLamp' | 'tailLamp', centre: Vec3, radius: number, facing: 1 | -1): void {
    const depth = 0.05;
    this.cylinder('chrome', `${part}-bezel`, 'z', [centre[0], centre[1], centre[2] - facing * depth / 2], radius, depth, 14);
    this.cylinder(lens, `${part}-lens`, 'z', [centre[0], centre[1], centre[2] + facing * 0.004], radius * 0.84, 0.008, 14);
  }

  /** Folds every bucket into one mesh, tagged the way `mergeForgedPlacements` expects. */
  build(id: string, materials: ForgedVehicleMaterials): ForgedVehicle {
    const group = new THREE.Group();
    group.name = `world-studio-vehicle-parts ${id}`;
    group.userData.presentationOnly = true;
    let drawCalls = 0;
    let triangles = 0;
    const partCounts: Record<string, number> = { ...this.counts };
    const partTriangles: Record<string, number> = {};
    for (const [bucket, geometries] of this.parts) {
      if (geometries.length === 0) continue;
      const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
      if (!merged) throw new Error(`world-studio vehicles: bucket '${bucket}' of '${id}' failed to merge`);
      if (geometries.length > 1) for (const geometry of geometries) geometry.dispose();
      const mesh = new THREE.Mesh(merged, materials[bucket]);
      mesh.name = `world-studio-vehicle-parts ${id} ${bucket}`;
      mesh.castShadow = bucket !== 'headLamp' && bucket !== 'tailLamp';
      mesh.receiveShadow = true;
      mesh.userData.presentationOnly = true;
      mesh.userData.forgeBucket = bucket;
      group.add(mesh);
      drawCalls += 1;
      const count = (merged.getAttribute('position')?.count ?? 0) / 3;
      triangles += count;
      partTriangles[bucket] = count;
    }
    this.parts.clear();
    return { group, drawCalls, triangles, stations: 0, partCounts, partTriangles, partBounds: [] };
  }
}
