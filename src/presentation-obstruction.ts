/**
 * Owner 2026-08-30 (playtest: "arms still clip through everything"): the
 * viewmodel contact probes test movement colliders, so PRESENTATION dressing
 * (street poles, furniture, yard props, interior pieces) never folded the
 * weapon and the gun rendered straight through it.
 *
 * This walks a presentation root once per arena generation and derives world
 * AABBs for every dressing mesh substantial enough to matter on screen. The
 * result feeds ONLY the viewmodel POSE fold (and never the fire-admission
 * gate): guns visually fold against a lamp post, but decoration can never
 * refuse the trigger - blocking fire stays a movement-collider decision.
 */
import * as THREE from 'three';
import type { Box2 } from './collision';

/** Dressing shorter than this cannot cross the weapon on screen. */
const MINIMUM_HEIGHT_M = 1.05;
/** Dressing thinner than this reads as clip-forgivable (wires, stems). */
const MINIMUM_THICKNESS_M = 0.16;
/** Safety valve: a pathological root cannot flood the per-frame probe list. */
const MAXIMUM_BOXES = 420;

const scratchBox = new THREE.Box3();

export function collectPresentationObstructionBoxes(roots: ReadonlyArray<THREE.Object3D | null | undefined>): Box2[] {
  const boxes: Box2[] = [];
  for (const root of roots) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (boxes.length >= MAXIMUM_BOXES) return;
      if (!(node instanceof THREE.Mesh) || !node.visible) return;
      // Batched sources stay hidden but their merged batch mesh would produce
      // one giant AABB; skip anything merged and anything instanced (tufts,
      // shrubs - individually thin).
      if (node.userData.staticBatchRendered === true) return;
      if ((node as THREE.InstancedMesh).isInstancedMesh) return;
      const geometry = node.geometry as THREE.BufferGeometry | undefined;
      if (!geometry) return;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      scratchBox.copy(geometry.boundingBox).applyMatrix4(node.matrixWorld);
      const width = scratchBox.max.x - scratchBox.min.x;
      const height = scratchBox.max.y - scratchBox.min.y;
      const depth = scratchBox.max.z - scratchBox.min.z;
      if (height < MINIMUM_HEIGHT_M) return;
      if (Math.min(width, depth) < MINIMUM_THICKNESS_M) return;
      // A merged batch or backdrop shell spanning a huge area would fold the
      // weapon everywhere; obstruction is for discrete props.
      if (width > 12 || depth > 12) return;
      boxes.push({
        minX: scratchBox.min.x,
        maxX: scratchBox.max.x,
        minY: scratchBox.min.y,
        maxY: scratchBox.max.y,
        minZ: scratchBox.min.z,
        maxZ: scratchBox.max.z,
      });
    });
  }
  return boxes;
}
