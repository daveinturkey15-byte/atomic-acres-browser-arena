import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HOLY_HAND_FRAG_ASSET = './assets/original/models/holy-hand-frag.glb';
export const HOLY_HAND_FRAG_MAX_DIMENSION = 0.46;

let template: THREE.Group | null = null;
let state: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
let sourceMeshCount = 0;
let sourceMaxDimension = 0;
let loadPromise: Promise<void> | null = null;

function markPresentationOnly(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.presentationOnly = true;
    node.raycast = () => undefined;
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = false;
    }
  });
}

export function loadGrenadePresentation(): Promise<void> {
  if (loadPromise) return loadPromise;
  state = 'loading';
  loadPromise = new Promise((resolve) => {
    new GLTFLoader().load(HOLY_HAND_FRAG_ASSET, (gltf) => {
      template = gltf.scene;
      template.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(template);
      const size = bounds.getSize(new THREE.Vector3());
      sourceMaxDimension = Math.max(size.x, size.y, size.z);
      template.traverse((node) => {
        if (node instanceof THREE.Mesh) sourceMeshCount += 1;
      });
      state = sourceMeshCount > 0 && sourceMaxDimension > 0 ? 'ready' : 'fallback';
      resolve();
    }, undefined, (error) => {
      state = 'fallback';
      console.warn('[Atomic Acres] Sanctified Frag GLB unavailable; using original fallback.', error);
      resolve();
    });
  });
  return loadPromise;
}

function fallbackGrenade(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'sanctified-frag-fallback';
  root.userData.authoredGrenade = false;
  const gold = new THREE.MeshStandardMaterial({ color: 0xd89528, roughness: 0.38, metalness: 0.64 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf2e5b5, roughness: 0.42, metalness: 0.18 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), gold);
  body.name = 'fallback-holy-orb';
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.022), ivory);
  stem.name = 'fallback-cross-stem';
  stem.position.y = 0.21;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.026, 0.024), ivory);
  arm.name = 'fallback-cross-arm';
  arm.position.y = 0.24;
  root.add(body, stem, arm);
  markPresentationOnly(root);
  return root;
}

export function createGrenadePresentation(): THREE.Object3D {
  if (!template || state !== 'ready') return fallbackGrenade();
  const root = template.clone(true);
  root.name = 'sanctified-frag-authored-glb';
  root.userData.authoredGrenade = true;
  root.userData.asset = HOLY_HAND_FRAG_ASSET;
  root.scale.setScalar(HOLY_HAND_FRAG_MAX_DIMENSION / Math.max(0.001, sourceMaxDimension));
  markPresentationOnly(root);
  return root;
}

export function disposeGrenadePresentation(root: THREE.Object3D): void {
  root.removeFromParent();
  if (root.userData.authoredGrenade === true) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    const meshMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of meshMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function grenadePresentationTelemetry(): {
  status: 'idle' | 'loading' | 'ready' | 'fallback';
  asset: string;
  sourceMeshCount: number;
  sourceMaxDimension: number;
  targetMaxDimension: number;
} {
  return {
    status: state,
    asset: HOLY_HAND_FRAG_ASSET,
    sourceMeshCount,
    sourceMaxDimension,
    targetMaxDimension: HOLY_HAND_FRAG_MAX_DIMENSION,
  };
}
