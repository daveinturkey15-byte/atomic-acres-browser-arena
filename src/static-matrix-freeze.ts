// Perf (2026-08-29): in three r185, EVERY Object3D with matrixAutoUpdate=true
// recomposes its local matrix and re-multiplies its world matrix every frame
// (Object3D.updateMatrix unconditionally sets matrixWorldNeedsUpdate). With
// ~10k scene nodes - most of them idle pooled vocabulary - that was ~35% of
// main-thread time. Deep-freezing a subtree captures each node's current
// local transform into .matrix once and stops the per-frame recompose;
// force-updates (updateMatrixWorld(true)) still work because they use the
// stored local matrices.
//
// Contract: a frozen node's position/quaternion/scale writes DO NOT reach the
// renderer. Unfreeze a subtree before moving or animating anything inside it.
import * as THREE from 'three';

/** While frozen, matrix passes skip the whole subtree - INCLUDING forced
 * ones. Three's unconditional child recursion makes the walk itself the
 * dominant cost, and a per-frame-dirty ancestor (the camera above the hidden
 * weapon rigs) force-flows into children every frame, so honoring force would
 * defeat the freeze. A frozen subtree is always invisible, so its stale world
 * matrices cannot render; deepUnfreezeSubtreeMatrices catches the subtree up
 * with one forced refresh when it returns to service. */
function skipUpdateMatrixWorldWhileFrozen(this: THREE.Object3D): void {}

/** Compose every node's current local transform once, then stop the
 * per-frame recompose AND the routine walk for the whole subtree. */
export function deepFreezeSubtreeMatrices(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node.matrixAutoUpdate) node.updateMatrix();
    node.matrixAutoUpdate = false;
  });
  // No forced world refresh here: a frozen subtree is always invisible, so
  // stale world matrices cannot render, and the swap paths this rides on are
  // gated (pass65-weapon-runtime-behavior) to never walk inactive rigs.
  // deepUnfreezeSubtreeMatrices does the one catch-up refresh instead.
  root.updateMatrixWorld = skipUpdateMatrixWorldWhileFrozen;
}

/** Restore normal per-frame matrix dynamics for the whole subtree. */
export function deepUnfreezeSubtreeMatrices(root: THREE.Object3D): void {
  if (Object.prototype.hasOwnProperty.call(root, 'updateMatrixWorld')) {
    delete (root as { updateMatrixWorld?: unknown }).updateMatrixWorld;
  }
  root.traverse((node) => {
    node.matrixAutoUpdate = true;
  });
  // Catch the subtree up after the frozen blackout before anything reads or
  // renders its world matrices.
  root.updateMatrixWorld(true);
}

/**
 * HF-491 (perf lane HITL 5): stop the per-frame recompose for the parts of a
 * mounted arena that provably never move, WITHOUT the walk-skip override.
 *
 * What qualifies, and why each is safe:
 *   - meshes `batchStaticMeshes` hid (`userData.staticBatchRendered`): never
 *     rendered again, and their world matrices are read only by raycast /
 *     collision references that were baked from the same transform;
 *   - the `*-render-batches` groups it produced: world-space geometry under an
 *     identity transform by construction;
 *   - `THREE.LOD` subtrees: the LOD object stands where the thing it draws
 *     stands and the levels are baked in its local frame (vegetation).
 * Subtrees flagged `userData.dynamic` are left alone entirely, as are
 * nodes that are already frozen. Nothing here installs a walk skip - the
 * routine walk still visits every node, so a later forced refresh
 * (`updateMatrixWorld(true)`) sees a correct, once-composed local matrix.
 *
 * Measured on Nuke Town Rebuild (HITL 4 head): the arena root was 965 of the
 * scene's 3,029 auto-updating nodes and one full-scene `updateMatrixWorld()`
 * cost 0.9 ms in-page; three's renderer and the shadow / post passes walk it
 * more than once a frame.
 */
export function freezeStaticArenaMatrices(root: THREE.Object3D): number {
  let frozen = 0;
  const freezeLeaf = (node: THREE.Object3D): void => {
    if (!node.matrixAutoUpdate) return;
    node.updateMatrix();
    node.matrixAutoUpdate = false;
    frozen += 1;
  };
  const freezeSubtree = (node: THREE.Object3D): void => {
    node.traverse(freezeLeaf);
  };
  const visit = (node: THREE.Object3D): void => {
    if (node.userData.dynamic === true) return;
    if ((node as THREE.LOD).isLOD === true || /-render-batches$/.test(node.name)) {
      freezeSubtree(node);
      return;
    }
    if ((node as THREE.Mesh).isMesh === true && node.userData.staticBatchRendered === true) {
      freezeLeaf(node);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return frozen;
}
