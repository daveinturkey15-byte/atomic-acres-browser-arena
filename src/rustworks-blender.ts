import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const RUSTWORKS_BLENDER_ASSET = './assets/original/models/rustworks-central-tower.glb?v=pass62-20260724-1';
export const RUSTWORKS_BLENDER_EXPECTED_VERSION = 'rustworks-pass60-feedback-v3';
export const RUSTWORKS_BLENDER_OVERLAY_RETIRED = true;

type RustworksBlenderTelemetry = {
  status: 'idle' | 'loading' | 'ready' | 'fallback';
  asset: string;
  overlayRetired: boolean;
  overlayVisible: boolean;
  assetVersion: string | null;
  meshCount: number;
  materialCount: number;
  texturedMaterials: number;
  pbrMaterials: number;
  textureCount: number;
  triangleCount: number;
  semanticParts: number;
  authoredHeight: number;
  containerTotal: number;
  containerClosed: number;
  containerOpenBothEnds: number;
  containerOpenOneEnd: number;
  forbiddenFloatingParts: number;
  oversizedHandrailSlabs: number;
  error: string | null;
};

const telemetry: RustworksBlenderTelemetry = {
  status: 'idle',
  asset: RUSTWORKS_BLENDER_ASSET,
  overlayRetired: RUSTWORKS_BLENDER_OVERLAY_RETIRED,
  overlayVisible: false,
  assetVersion: null,
  meshCount: 0,
  materialCount: 0,
  texturedMaterials: 0,
  pbrMaterials: 0,
  textureCount: 0,
  triangleCount: 0,
  semanticParts: 0,
  authoredHeight: 0,
  containerTotal: 0,
  containerClosed: 0,
  containerOpenBothEnds: 0,
  containerOpenOneEnd: 0,
  forbiddenFloatingParts: 0,
  oversizedHandrailSlabs: 0,
  error: null,
};

let blenderRoot: THREE.Group | null = null;

export function rustworksBlenderTelemetry(): RustworksBlenderTelemetry {
  return { ...telemetry, overlayVisible: blenderRoot?.visible === true };
}

export function markRustworksBlenderFallback(error: unknown): void {
  telemetry.status = 'fallback';
  telemetry.error = error instanceof Error ? error.message : String(error);
}

/** Keep the retired GLB hidden while toggling the single procedural authority. */
export function setRustworksProceduralPresentationVisible(arenaRoot: THREE.Object3D, visible: boolean): void {
  arenaRoot.traverse((node) => {
    if (node.userData.blenderAuthoredEnvironment) {
      node.visible = false;
      return;
    }
    if (!(node instanceof THREE.Mesh)) return;
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
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(RUSTWORKS_BLENDER_ASSET);
  const root = gltf.scene;
  root.name = 'Rustworks Blender central tower';
  root.visible = false;
  root.userData.presentationOnly = true;
  root.userData.blocksShots = false;
  root.userData.blenderAuthoredEnvironment = true;
  root.userData.rustworksOverlayRetired = RUSTWORKS_BLENDER_OVERLAY_RETIRED;

  let meshCount = 0;
  let triangleCount = 0;
  let semanticParts = 0;
  let authoredHeight = 0;
  let containerTotal = 0;
  let containerClosed = 0;
  let containerOpenBothEnds = 0;
  let containerOpenOneEnd = 0;
  let forbiddenFloatingParts = 0;
  let oversizedHandrailSlabs = 0;
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
    if (/centre_cover|service_trench_crossover|pallet|freight_crate/i.test(node.name)) forbiddenFloatingParts += 1;
    if (node.userData.rustworks_semantic === 'yard-container-placement') {
      containerTotal += 1;
      if (node.userData.rustworks_opening === 'closed') containerClosed += 1;
      if (node.userData.rustworks_opening === 'open-both') containerOpenBothEnds += 1;
      if (node.userData.rustworks_opening === 'open-one') containerOpenOneEnd += 1;
    }
    if (!(node instanceof THREE.Mesh)) return;
    meshCount += 1;
    node.castShadow = true;
    node.receiveShadow = true;
    node.raycast = () => undefined;
    const geometry = node.geometry;
    if (/RW_(upper|lower)_handrail/i.test(node.name)) {
      geometry.computeBoundingBox();
      const dimensions = geometry.boundingBox?.getSize(new THREE.Vector3()).toArray().sort((a: number, b: number) => b - a) ?? [];
      if ((dimensions[1] ?? 0) > 0.5) oversizedHandrailSlabs += 1;
    }
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
  setRustworksProceduralPresentationVisible(arenaRoot, true);

  telemetry.status = 'ready';
  telemetry.overlayVisible = false;
  telemetry.assetVersion = assetVersion;
  telemetry.meshCount = meshCount;
  telemetry.materialCount = materials.size;
  telemetry.texturedMaterials = texturedMaterials.size;
  telemetry.pbrMaterials = pbrMaterials.size;
  telemetry.textureCount = textures.size;
  telemetry.triangleCount = Math.round(triangleCount);
  telemetry.semanticParts = semanticParts;
  telemetry.authoredHeight = authoredHeight;
  telemetry.containerTotal = containerTotal;
  telemetry.containerClosed = containerClosed;
  telemetry.containerOpenBothEnds = containerOpenBothEnds;
  telemetry.containerOpenOneEnd = containerOpenOneEnd;
  telemetry.forbiddenFloatingParts = forbiddenFloatingParts;
  telemetry.oversizedHandrailSlabs = oversizedHandrailSlabs;
  return root;
}
