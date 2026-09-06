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
  findings: PlateFinding[];
};

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
    const parameters = (mesh.geometry as THREE.BoxGeometry).parameters as
      { width?: number; height?: number; depth?: number } | undefined;
    if (parameters?.width === undefined || parameters.height === undefined || parameters.depth === undefined) {
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
  return { meshes, plates, skippedNonBox, oneSided, alreadyDoubleSided, findings };
}
