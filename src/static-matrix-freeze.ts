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
  root.updateMatrixWorld(true);
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
