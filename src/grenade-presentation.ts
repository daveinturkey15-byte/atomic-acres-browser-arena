import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { GrenadeId } from './combat/grenade-catalog';

export const FRAG_GRENADE_ASSET = './assets/original/models/frag-grenade.glb';
export const FRAG_GRENADE_MAX_DIMENSION = 0.46;
export const SEMTEX_BUNDLE_ASSET = './assets/original/models/ordnance/semtex-bundle-lod0.glb';
export const SEMTEX_BUNDLE_MAX_DIMENSION = 0.58;

export type GrenadePresentationFamily = 'frag' | 'semtex';

/**
 * Maps every canonical grenade family to its current world-model family.
 * Keeping this exhaustive prevents player, remote and bot throw paths from
 * silently choosing different silhouettes when the grenade catalog changes.
 */
export function grenadePresentationFamily(grenade: GrenadeId): GrenadePresentationFamily {
  switch (grenade) {
    case 'frag':
    case 'smoke':
    case 'flash':
      return 'frag';
    case 'semtex':
      return 'semtex';
    default: {
      const unhandled: never = grenade;
      return unhandled;
    }
  }
}

let template: THREE.Group | null = null;
let state: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
let sourceMeshCount = 0;
let sourceMaxDimension = 0;
let loadPromise: Promise<void> | null = null;
let semtexTemplate: THREE.Group | null = null;
let semtexState: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
let semtexSourceMeshCount = 0;
let semtexSourceMaxDimension = 0;

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
  semtexState = 'loading';
  const load = (asset: string, accepted: (root: THREE.Group) => void, rejected: (error: unknown) => void) => new Promise<void>((resolve) => {
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset, (gltf) => {
      accepted(gltf.scene);
      resolve();
    }, undefined, (error) => {
      rejected(error);
      resolve();
    });
  });
  loadPromise = Promise.all([
    load(FRAG_GRENADE_ASSET, (root) => {
      const gltf = { scene: root };
      template = gltf.scene;
      template.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(template);
      const size = bounds.getSize(new THREE.Vector3());
      sourceMaxDimension = Math.max(size.x, size.y, size.z);
      template.traverse((node) => {
        if (node instanceof THREE.Mesh) sourceMeshCount += 1;
      });
      state = sourceMeshCount > 0 && sourceMaxDimension > 0 ? 'ready' : 'fallback';
    }, (error) => {
      state = 'fallback';
      console.warn('[Arena] Conventional frag grenade GLB unavailable; using the lightweight fallback.', error);
    }),
    load(SEMTEX_BUNDLE_ASSET, (root) => {
      semtexTemplate = root;
      root.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      semtexSourceMaxDimension = Math.max(size.x, size.y, size.z);
      root.traverse((node) => { if (node instanceof THREE.Mesh) semtexSourceMeshCount += 1; });
      const required = ['semtex-bundle-root', 'semtex-block-1', 'semtex-block-4', 'semtex-detonator', 'semtex-wire', 'semtex-sticky-pad'];
      semtexState = semtexSourceMeshCount > 0 && semtexSourceMaxDimension > 0 && required.every((name) => root.getObjectByName(name)) ? 'ready' : 'fallback';
    }, (error) => {
      semtexState = 'fallback';
      console.warn('[Arena] Authored Semtex bundle unavailable; using the bounded bundle fallback.', error);
    }),
  ]).then(() => undefined);
  return loadPromise;
}

function fallbackGrenade(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'frag-grenade-fallback';
  root.userData.authoredGrenade = false;
  root.userData.grenadeKind = 'frag';
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

function fallbackSemtex(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'semtex-bundle-fallback';
  root.userData.authoredGrenade = false;
  root.userData.grenadeKind = 'semtex';
  const red = new THREE.MeshStandardMaterial({ color: 0x8f1412, roughness: 0.72, metalness: 0.03 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x121817, roughness: 0.82, metalness: 0.06 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x606a6d, roughness: 0.3, metalness: 0.82 });
  for (let index = 0; index < 4; index += 1) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.23, 0.5), red);
    block.name = `fallback-semtex-block-${index + 1}`;
    block.position.x = (index - 1.5) * 0.082;
    root.add(block);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.25, 0.06), tape);
  band.name = 'fallback-semtex-retaining-band';
  const detonator = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 12), steel);
  detonator.name = 'fallback-semtex-detonator';
  detonator.rotation.x = Math.PI / 2;
  detonator.position.set(0, -0.15, -0.05);
  root.add(band, detonator);
  markPresentationOnly(root);
  return root;
}

export function createGrenadePresentation(grenade: GrenadeId = 'frag'): THREE.Object3D {
  if (grenadePresentationFamily(grenade) === 'semtex') {
    if (!semtexTemplate || semtexState !== 'ready') return fallbackSemtex();
    const root = semtexTemplate.clone(true);
    root.name = 'semtex-bundle-authored-glb';
    root.userData.authoredGrenade = true;
    root.userData.grenadeKind = 'semtex';
    root.userData.asset = SEMTEX_BUNDLE_ASSET;
    root.scale.setScalar(SEMTEX_BUNDLE_MAX_DIMENSION / Math.max(0.001, semtexSourceMaxDimension));
    markPresentationOnly(root);
    return root;
  }
  if (!template || state !== 'ready') return fallbackGrenade();
  const root = template.clone(true);
  root.name = 'frag-grenade-authored-glb';
  root.userData.authoredGrenade = true;
  root.userData.asset = FRAG_GRENADE_ASSET;
  root.userData.grenadeKind = 'frag';
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
  semtex: Readonly<{ status: typeof semtexState; asset: string; sourceMeshCount: number; sourceMaxDimension: number; targetMaxDimension: number }>;
} {
  return {
    status: state,
    asset: FRAG_GRENADE_ASSET,
    sourceMeshCount,
    sourceMaxDimension,
    targetMaxDimension: FRAG_GRENADE_MAX_DIMENSION,
    semtex: Object.freeze({
      status: semtexState,
      asset: SEMTEX_BUNDLE_ASSET,
      sourceMeshCount: semtexSourceMeshCount,
      sourceMaxDimension: semtexSourceMaxDimension,
      targetMaxDimension: SEMTEX_BUNDLE_MAX_DIMENSION,
    }),
  };
}
