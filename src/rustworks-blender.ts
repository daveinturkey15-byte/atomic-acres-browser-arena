import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const RUSTWORKS_BLENDER_ASSET = './assets/original/models/rustworks-central-tower.glb';
export const RUSTWORKS_BLENDER_EXPECTED_VERSION = 'pass43-v1';

type RustworksBlenderTelemetry = {
  status: 'idle' | 'loading' | 'ready' | 'fallback';
  asset: string;
  assetVersion: string | null;
  meshCount: number;
  materialCount: number;
  texturedMaterials: number;
  pbrMaterials: number;
  textureCount: number;
  triangleCount: number;
  semanticParts: number;
  authoredHeight: number;
  error: string | null;
};

const telemetry: RustworksBlenderTelemetry = {
  status: 'idle',
  asset: RUSTWORKS_BLENDER_ASSET,
  assetVersion: null,
  meshCount: 0,
  materialCount: 0,
  texturedMaterials: 0,
  pbrMaterials: 0,
  textureCount: 0,
  triangleCount: 0,
  semanticParts: 0,
  authoredHeight: 0,
  error: null,
};

let blenderRoot: THREE.Group | null = null;

export function rustworksBlenderTelemetry(): RustworksBlenderTelemetry {
  return { ...telemetry };
}

export function markRustworksBlenderFallback(error: unknown): void {
  telemetry.status = 'fallback';
  telemetry.error = error instanceof Error ? error.message : String(error);
}

/** Hide duplicated procedural presentation once the authored Quality kit is live. */
export function setRustworksProceduralPresentationVisible(arenaRoot: THREE.Object3D, visible: boolean): void {
  arenaRoot.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.blenderAuthoredEnvironment) return;
    if (String(node.name).startsWith('rustworks-quality-') || String(node.name).startsWith('rustworks-work-')) return;
    if (String(node.parent?.name ?? '').startsWith('rustworks-quality')) return;
    // Keep ground plane ray target always available for shots into dirt.
    if (node.name === 'rustworks-compacted-earth') {
      node.visible = true;
      return;
    }
    node.visible = visible;
  });
  // Re-hide static-batch source meshes if we just re-showed them incorrectly.
  if (visible) {
    arenaRoot.traverse((node) => {
      if (node.userData.staticBatchRendered === true && !String(node.name).startsWith('rustworks-presentation-batch-')) {
        node.visible = false;
      }
    });
  }
}

export function rustworksBlenderRoot(): THREE.Group | null {
  return blenderRoot;
}

export async function loadRustworksBlenderTower(arenaRoot: THREE.Group): Promise<THREE.Group> {
  telemetry.status = 'loading';
  telemetry.error = null;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(RUSTWORKS_BLENDER_ASSET);
  const root = gltf.scene;
  root.name = 'Rustworks Blender central tower';
  root.userData.presentationOnly = true;
  root.userData.blocksShots = false;
  root.userData.blenderAuthoredEnvironment = true;

  let meshCount = 0;
  let triangleCount = 0;
  let semanticParts = 0;
  let authoredHeight = 0;
  let assetVersion: string | null = null;
  const materials = new Set<THREE.Material>();
  const texturedMaterials = new Set<THREE.Material>();
  const pbrMaterials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((node) => {
    node.userData.presentationOnly = true;
    node.userData.blocksShots = false;
    node.userData.blenderAuthoredEnvironment = true;
    if (node.userData.rustworks_asset_class === 'authored-central-tower') semanticParts += 1;
    if (typeof node.userData.asset_version === 'string') assetVersion = node.userData.asset_version;
    if (typeof node.userData.authored_height_metres === 'number') authoredHeight = node.userData.authored_height_metres;
    if (!(node instanceof THREE.Mesh)) return;
    meshCount += 1;
    node.castShadow = true;
    node.receiveShadow = true;
    node.raycast = () => undefined;
    const geometry = node.geometry;
    triangleCount += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.forEach((material) => {
      materials.add(material);
      if (material instanceof THREE.MeshStandardMaterial) {
        // Authored industrial PBR should read under arena lighting.
        material.envMapIntensity = Math.max(material.envMapIntensity || 1, 1.05);
        material.needsUpdate = true;
        if (material.map) {
          texturedMaterials.add(material);
          textures.add(material.map);
        }
        if (material.normalMap) textures.add(material.normalMap);
        if (material.roughnessMap) textures.add(material.roughnessMap);
        if (material.normalMap && (material.roughnessMap || material.map)) pbrMaterials.add(material);
      }
    });
  });

  arenaRoot.add(root);
  blenderRoot = root;
  setRustworksProceduralPresentationVisible(arenaRoot, false);

  telemetry.status = 'ready';
  telemetry.assetVersion = assetVersion;
  telemetry.meshCount = meshCount;
  telemetry.materialCount = materials.size;
  telemetry.texturedMaterials = texturedMaterials.size;
  telemetry.pbrMaterials = pbrMaterials.size;
  telemetry.textureCount = textures.size;
  telemetry.triangleCount = Math.round(triangleCount);
  telemetry.semanticParts = semanticParts;
  telemetry.authoredHeight = authoredHeight;
  return root;
}
