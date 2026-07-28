import * as THREE from 'three';

/**
 * Forces every visible arena renderable through one admitted submission even
 * when the deployment camera cannot see it. WebGPU otherwise defers pipeline
 * creation until a player or review camera first turns toward that material.
 */
export async function withArenaFrustumCullingDisabled(
  root: THREE.Object3D,
  submitAndFence: () => Promise<void>,
): Promise<number> {
  const prior = new Map<THREE.Object3D, boolean>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) return;
    prior.set(node, node.frustumCulled);
    node.frustumCulled = false;
  });
  try {
    await submitAndFence();
  } finally {
    for (const [node, frustumCulled] of prior) node.frustumCulled = frustumCulled;
  }
  return prior.size;
}
