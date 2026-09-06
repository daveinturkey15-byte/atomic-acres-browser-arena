/**
 * nuketown2-single-sided-plate-audit.ts — HF-536 night-defects-2, JOB 3.
 *
 * See-through ASSETS, measured statically. A thin plate drawn with
 * `THREE.FrontSide` is a wall from one side and a hole from the other; from
 * behind you see straight through it to the sky or the house interior, which
 * is exactly what "textures missing you can see through floors and assets"
 * looks like from a player's chair.
 *
 * The test is geometric, so it runs in vitest with no renderer: for every
 * opaque box thinner than `PLATE_MAX_THICKNESS_M`, probe `PLATE_CLEARANCE_M`
 * out from each broad face; a side is REACHABLE when the probe stands in open
 * air rather than inside another opaque body. FrontSide + both sides
 * reachable = finding.
 *
 * See `scripts/qa/audit-nuketown2-single-sided-plates.ts` for the declared
 * limits (this walks `buildNuketown2` only; the Quality art layer is outside
 * it, exactly as with the coplanar audits).
 */
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';

/** A box thinner than this in one axis is a plate, not a solid. */
export const PLATE_MAX_THICKNESS_M = 0.12;
/** How far out from a broad face the reachability probe stands. */
export const PLATE_CLEARANCE_M = 0.45;
/** Plates smaller than this are trim, not a surface a player looks through. */
export const PLATE_MIN_AREA_M2 = 0.5;

type Solid = {
  name: string;
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
};

export type PlateFinding = {
  name: string;
  materialName: string;
  side: THREE.Side;
  /** 0 = x, 1 = y, 2 = z. */
  axis: 0 | 1 | 2;
  thickness: number;
  area: number;
  centre: [number, number, number];
};

export type PlateAudit = {
  meshes: number;
  plates: number;
  skippedNonBox: number;
  oneSided: number;
  alreadyDoubleSided: number;
  /**
   * Plates whose GEOMETRY already supplies an outward face in both broad
   * directions. `side: FrontSide` cannot make those see-through, so they are
   * censused and excluded rather than reported. See `closedFaces`.
   */
  closedBodies: number;
  findings: PlateFinding[];
};

/**
 * Directions (in the body's own world-rotated basis) in which the geometry
 * actually presents an OUTWARD-facing triangle.
 *
 * THIS IS THE PREMISE THE FIRST CUT OF THIS AUDIT SKIPPED (HF-536
 * night-defects-3a). `side: THREE.FrontSide` only produces a hole where the
 * face you are looking at is ABSENT. On a closed box every one of the six
 * faces exists and every one points outward, so a viewer on any side sees a
 * front face and the material's side mode is irrelevant. Reporting a closed
 * box as see-through is a false positive, and "fixing" it with DoubleSide buys
 * nothing but backface shading and shadow cost.
 *
 * Measured at 2320affd: all 38 findings of the first cut were closed
 * BoxGeometry, 12 triangles, 6/6 outward faces
 * (`scripts/qa/audit-nuketown2-plate-closure.ts`).
 */
export function closedFaces(mesh: THREE.Mesh): Set<number> {
  const covered = new Set<number>();
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) return covered;
  mesh.updateWorldMatrix(true, false);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  // The body's own axes, carried into world space: a stair stringer rotated
  // about z still has six faces, and classifying it against WORLD axes would
  // call a perfectly closed box open. Closure is a property of the geometry,
  // not of its orientation.
  const basis = ([0, 1, 2] as const).flatMap((axis) => ([-1, 1] as const).map((sign) => {
    const vector = new THREE.Vector3();
    vector.setComponent(axis, sign);
    return { key: axis * 2 + (sign > 0 ? 1 : 0), vector: vector.applyMatrix3(normalMatrix).normalize() };
  }));
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i + 2 < count; i += 3) {
    const i0 = index ? index.getX(i) : i;
    const i1 = index ? index.getX(i + 1) : i + 1;
    const i2 = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    normal.crossVectors(b.sub(a), c.sub(a));
    if (normal.lengthSq() === 0) continue;
    normal.applyMatrix3(normalMatrix).normalize();
    for (const entry of basis) if (normal.dot(entry.vector) > 0.99) covered.add(entry.key);
  }
  return covered;
}

/** True when the body presents an outward face on BOTH broad sides of `axis`. */
export function broadFacesClosed(mesh: THREE.Mesh, axis: 0 | 1 | 2): boolean {
  const covered = closedFaces(mesh);
  return covered.has(axis * 2) && covered.has(axis * 2 + 1);
}

function insideAny(solids: readonly Solid[], skip: Solid, x: number, y: number, z: number): boolean {
  for (const solid of solids) {
    if (solid === skip) continue;
    if (x > solid.minX && x < solid.maxX && y > solid.minY && y < solid.maxY && z > solid.minZ && z < solid.maxZ) {
      return true;
    }
  }
  return false;
}

export function auditNuketown2SingleSidedPlates(root?: THREE.Object3D): PlateAudit {
  let target = root;
  if (target === undefined) {
    const scene = new THREE.Scene();
    target = buildNuketown2(scene).root;
  }
  target.updateMatrixWorld(true);
  const solids: Solid[] = [];
  const candidates: Array<{ solid: Solid; mesh: THREE.Mesh; material: THREE.Material }> = [];
  let meshes = 0;
  let skippedNonBox = 0;
  target.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (mesh.userData.sourceMeshes !== undefined) return;
    if (mesh.userData.collisionOnly === true) return;
    meshes += 1;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) { skippedNonBox += 1; return; }
    // HF-536 night-defects-3a: the first cut admitted BoxGeometry ONLY, which
    // meant the audit could not see the very class it was invented for - a
    // single-sided PLANE standing in as a wall or a floor. Every geometry with
    // a position attribute is now censused; closure is decided from the
    // triangles (see `closedFaces`), not from a constructor's parameters.
    if ((mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined) === undefined) {
      skippedNonBox += 1;
      return;
    }
    // Rotated plates exist (the stair stringers); their world AABB is a safe
    // envelope for a reachability probe, which is a coarse question.
    const box = new THREE.Box3().setFromObject(mesh);
    const solid: Solid = {
      name: mesh.name || mesh.type,
      minX: box.min.x, maxX: box.max.x,
      minY: box.min.y, maxY: box.max.y,
      minZ: box.min.z, maxZ: box.max.z,
    };
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
    if (material.transparent !== true) solids.push(solid);
    candidates.push({ solid, mesh, material });
  });

  const findings: PlateFinding[] = [];
  let plates = 0;
  let oneSided = 0;
  let alreadyDoubleSided = 0;
  let closedBodies = 0;
  for (const candidate of candidates) {
    const { solid, mesh, material } = candidate;
    if (material.transparent === true) continue;
    const size: [number, number, number] = [
      solid.maxX - solid.minX,
      solid.maxY - solid.minY,
      solid.maxZ - solid.minZ,
    ];
    let axis: 0 | 1 | 2 = 0;
    for (const index of [1, 2] as const) if (size[index] < size[axis]) axis = index;
    if (size[axis] > PLATE_MAX_THICKNESS_M) continue;
    const broad = ([0, 1, 2] as const).filter((index) => index !== axis);
    const area = size[broad[0]!]! * size[broad[1]!]!;
    if (area < PLATE_MIN_AREA_M2) continue;
    plates += 1;
    if (material.side !== THREE.FrontSide) { alreadyDoubleSided += 1; continue; }
    // THE PREMISE, TESTED (HF-536 night-defects-3a). A FrontSide body is only
    // see-through where the face is missing. If the geometry already presents
    // an outward face on both broad sides, no viewer can ever see through it
    // and there is nothing to fix.
    if (broadFacesClosed(mesh, axis)) { closedBodies += 1; continue; }
    const centre: [number, number, number] = [
      (solid.minX + solid.maxX) / 2,
      (solid.minY + solid.maxY) / 2,
      (solid.minZ + solid.maxZ) / 2,
    ];
    let reachable = 0;
    for (const sign of [-1, 1] as const) {
      const face = axis === 0 ? (sign < 0 ? solid.minX : solid.maxX)
        : axis === 1 ? (sign < 0 ? solid.minY : solid.maxY)
          : (sign < 0 ? solid.minZ : solid.maxZ);
      // MARCH, do not jump. The first cut probed only the far endpoint, so a
      // 20 mm drywall lining on a 0.3 m wall "reached" the open air on the
      // OTHER side of that wall and every interior lining reported as a
      // finding. A side is reachable only when the whole corridor from the
      // face out to PLATE_CLEARANCE_M is open air.
      let clear = true;
      for (let step = 0.05; step <= PLATE_CLEARANCE_M + 1e-9; step += 0.05) {
        const probe: [number, number, number] = [...centre];
        probe[axis] = face + sign * step;
        // Under the ground slab is not a place a player stands, so an
        // up-facing plate's buried underside is not a see-through surface.
        if (probe[1] < 0.02) { clear = false; break; }
        if (insideAny(solids, solid, probe[0], probe[1], probe[2])) { clear = false; break; }
      }
      if (clear) reachable += 1;
    }
    if (reachable === 2) {
      findings.push({
        name: solid.name,
        materialName: (material as THREE.Material & { name?: string }).name || material.type,
        side: material.side,
        axis,
        thickness: size[axis]!,
        area,
        centre,
      });
    } else {
      oneSided += 1;
    }
    void mesh;
  }
  findings.sort((left, right) => right.area - left.area);
  return { meshes, plates, skippedNonBox, oneSided, alreadyDoubleSided, closedBodies, findings };
}
