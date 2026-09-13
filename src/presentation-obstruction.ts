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
const MAXIMUM_BOXES = 1_200;

/**
 * HF-536 - THE STAIRS DEFECT. Owner, 2026-09-06, after playing Nuke Town
 * Rebuild: "the gun still lifts up and looks bad and hard to use on stairs".
 *
 * An axis-aligned box is only an honest stand-in for a mesh while the mesh is
 * itself axis-aligned. Nuke Town's two house flights and two yard flights are
 * ONE slab each, 0.16 m thick, rotated about X by the pitch of the stair. The
 * arena author already knew that and removed those slabs from
 * `builder.colliders` in so many words ("the lightweight `colliders` channel is
 * intentionally axis-aligned ... retain the exact rotated OBBs in
 * physicsColliders") - but this collector walks the VISIBLE MESH TREE, so it
 * re-derived the same AABB the arena had just thrown away and handed it to the
 * viewmodel fold as a solid dressing box.
 *
 * That box is 1.65 x 3.35 x 4.53 m: it does not describe a 1.2 m^3 slab, it
 * fills the entire stairwell the player walks up. MEASURED on the shipped
 * build with `scripts/qa/probe-viewmodel-stairs-cdp.mjs`: on the lower two
 * thirds of both house flights, in both directions, the eye reads
 * `eyeInsideDressingBox: true` against exactly this box, `surfaceRetreat`
 * saturates at its 0.740 m cap, `contactFold.foldPitchRadians` is 1.45 rad
 * (83 degrees - the weapon folds to near vertical), `highReadyBlend` is 1.00,
 * and `fireAdmission.fireBlocked` is true with reason `full-stow`. The gun
 * lifts up, and the trigger is refused. Both halves of the owner's sentence.
 *
 * The rule is therefore stated as the thing that is actually wrong: an AABB
 * that claims materially more volume than the mesh inside it is not a
 * description of that mesh, and may not fold the weapon. A slab rotated by the
 * pitch of a staircase claims ~21x its own volume; a prop standing square
 * claims 1.0x, and a lamp post leaning a few degrees stays under the bound and
 * keeps folding exactly as it did. Anything this rejects has an exact
 * representation in the physics collider set already.
 */
export const PRESENTATION_OBSTRUCTION_AABB_VOLUME_RATIO_CAP = 1.5;

const scratchBox = new THREE.Box3();
const scratchScale = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchSize = new THREE.Vector3();
const scratchAabbSize = new THREE.Vector3();

/**
 * How many times its own oriented volume this mesh's world AABB claims.
 * 1 for an axis-aligned box; grows without bound as a flat slab tilts.
 * Returns 1 for degenerate geometry so a zero-thickness plane is judged by the
 * existing thickness filter rather than by a division by zero.
 */
export function presentationObstructionVolumeRatio(
  localSize: THREE.Vector3,
  worldScale: THREE.Vector3,
  worldAabbSize: THREE.Vector3,
): number {
  const oriented = Math.abs(localSize.x * worldScale.x)
    * Math.abs(localSize.y * worldScale.y)
    * Math.abs(localSize.z * worldScale.z);
  const aabb = worldAabbSize.x * worldAabbSize.y * worldAabbSize.z;
  if (!(oriented > 1e-6) || !(aabb > 0)) return 1;
  return aabb / oriented;
}

export function collectPresentationObstructionBoxes(roots: ReadonlyArray<THREE.Object3D | null | undefined>): Box2[] {
  const boxes: Box2[] = [];
  for (const root of roots) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (boxes.length >= MAXIMUM_BOXES) return;
      if (!(node instanceof THREE.Mesh)) return;
      // A merged batch mesh carries `sourceMeshes` and would contribute ONE
      // enormous AABB spanning everything it merged; skip it.
      const mergedBatch = node.userData.staticBatchRendered === true
        && typeof node.userData.sourceMeshes === 'number';
      if (mergedBatch) return;
      // Measured 2026-08-31: batching hides its SOURCE meshes
      // (mesh.visible = false, staticBatchRendered = true) and draws the merge
      // instead - so an invisibility test alone discarded the entire batched
      // art layer, which on atomic-acres is most of the dressing there is. A
      // batched source is on screen; it just is not the object drawing it.
      const batchedSource = node.userData.staticBatchRendered === true;
      if (!node.visible && !batchedSource) return;
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
      // HF-536: reject an AABB that is not a description of its mesh. See
      // PRESENTATION_OBSTRUCTION_AABB_VOLUME_RATIO_CAP.
      node.matrixWorld.decompose(scratchPosition, scratchQuaternion, scratchScale);
      geometry.boundingBox.getSize(scratchSize);
      scratchBox.getSize(scratchAabbSize);
      if (presentationObstructionVolumeRatio(scratchSize, scratchScale, scratchAabbSize)
        > PRESENTATION_OBSTRUCTION_AABB_VOLUME_RATIO_CAP) return;
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
