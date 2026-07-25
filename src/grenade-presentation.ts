import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FRAG_GRENADE_ASSET = './assets/original/models/frag-grenade.glb';
export const FRAG_GRENADE_MAX_DIMENSION = 0.46;

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
    new GLTFLoader().load(FRAG_GRENADE_ASSET, (gltf) => {
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
      console.warn('[Arena] Conventional frag grenade GLB unavailable; using the lightweight fallback.', error);
      resolve();
    });
  });
  return loadPromise;
}

function fallbackGrenade(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'frag-grenade-fallback';
  root.userData.authoredGrenade = false;
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5525, roughness: 0.72, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x555b56, roughness: 0.36, metalness: 0.82 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), olive);
  body.name = 'fallback-frag-body';
  body.scale.set(0.92, 1.08, 0.92);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.095, 16), steel);
  fuse.name = 'fallback-frag-fuse';
  fuse.position.y = 0.19;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.19, 0.045), steel);
  lever.name = 'fallback-frag-lever';
  lever.position.set(0.045, 0.285, 0.025);
  lever.rotation.z = -0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 6, 24), steel);
  ring.name = 'fallback-frag-pin-ring';
  ring.position.set(0.15, 0.24, 0);
  ring.rotation.x = Math.PI / 2;
  root.add(body, fuse, lever, ring);
  markPresentationOnly(root);
  return root;
}

export function createGrenadePresentation(): THREE.Object3D {
  if (!template || state !== 'ready') return fallbackGrenade();
  const root = template.clone(true);
  root.name = 'frag-grenade-authored-glb';
  root.userData.authoredGrenade = true;
  root.userData.asset = FRAG_GRENADE_ASSET;
  root.scale.setScalar(FRAG_GRENADE_MAX_DIMENSION / Math.max(0.001, sourceMaxDimension));
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
    asset: FRAG_GRENADE_ASSET,
    sourceMeshCount,
    sourceMaxDimension,
    targetMaxDimension: FRAG_GRENADE_MAX_DIMENSION,
  };
}
