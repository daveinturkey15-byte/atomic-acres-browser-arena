import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const RUSTWORKS_BLENDER_ASSET = './assets/original/models/rustworks-central-tower.glb';

export type RustworksBlenderTelemetry = {
  status: 'idle' | 'loading' | 'ready' | 'fallback';
  asset: string;
  meshCount: number;
  triangleCount: number;
  authoredHeight: number;
  semanticParts: number;
  error: string | null;
};

const telemetry: RustworksBlenderTelemetry = {
  status: 'idle',
  asset: RUSTWORKS_BLENDER_ASSET,
  meshCount: 0,
  triangleCount: 0,
  authoredHeight: 0,
  semanticParts: 0,
  error: null,
};

export function rustworksBlenderTelemetry(): RustworksBlenderTelemetry {
  return { ...telemetry };
}

export function markRustworksBlenderFallback(error: unknown): void {
  telemetry.status = 'fallback';
  telemetry.error = error instanceof Error ? error.message : String(error);
}

export async function loadRustworksBlenderTower(arenaRoot: THREE.Group): Promise<THREE.Group> {
  telemetry.status = 'loading';
  telemetry.error = null;
  const gltf = await new GLTFLoader().loadAsync(RUSTWORKS_BLENDER_ASSET);
  const root = gltf.scene;
  root.name = 'Rustworks Blender central tower detail kit';
  let meshCount = 0;
  let triangleCount = 0;
  let semanticParts = 0;
  root.traverse((node) => {
    node.userData.blenderAuthoredEnvironment = true;
    node.userData.presentationOnly = true;
    node.userData.blocksShots = false;
    if (node.userData.rustworks_asset_class === 'authored-central-tower') semanticParts += 1;
    node.raycast = () => undefined;
    if (!(node instanceof THREE.Mesh)) return;
    meshCount += 1;
    node.castShadow = true;
    node.receiveShadow = true;
    const geometry = node.geometry;
    triangleCount += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
  });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const authoredHeight = bounds.max.y - bounds.min.y;
  if (meshCount < 20 || semanticParts < 20 || authoredHeight < 13) {
    throw new Error(`Rustworks Blender tower contract failed: meshes=${meshCount}, semanticParts=${semanticParts}, height=${authoredHeight.toFixed(2)}`);
  }
  arenaRoot.add(root);
  telemetry.status = 'ready';
  telemetry.meshCount = meshCount;
  telemetry.triangleCount = Math.round(triangleCount);
  telemetry.authoredHeight = authoredHeight;
  telemetry.semanticParts = semanticParts;
  return root;
}
