import * as THREE from 'three';

/**
 * Recompose only the ancestor paths needed by a viewmodel solve. Three's
 * updateWorldMatrix(..., true) is intentionally broad: it descends every
 * child, including skinned sleeves and weapon dressing. The IK solver only
 * needs the parents and the small set of bones/socket nodes it reads.
 */
export class ViewmodelMatrixPathUpdater {
  private readonly nodes: THREE.Object3D[] = [];
  private readonly seen = new Set<THREE.Object3D>();

  update(targets: readonly (THREE.Object3D | undefined | null)[], stopAt?: THREE.Object3D | null): void {
    this.nodes.length = 0;
    this.seen.clear();
    for (const target of targets) {
      let node = target ?? null;
      while (node) {
        if (!this.seen.has(node)) {
          this.seen.add(node);
          this.nodes.push(node);
        }
        if (node === stopAt) break;
        node = node.parent;
      }
    }
    this.nodes.sort((left, right) => ViewmodelMatrixPathUpdater.depth(left) - ViewmodelMatrixPathUpdater.depth(right));
    for (const node of this.nodes) node.updateWorldMatrix(false, false, true);
  }

  private static depth(node: THREE.Object3D): number {
    let depth = 0;
    for (let parent = node.parent; parent; parent = parent.parent) depth += 1;
    return depth;
  }
}
