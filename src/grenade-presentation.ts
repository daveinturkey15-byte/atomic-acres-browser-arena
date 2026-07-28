import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { GrenadeId } from './combat/grenade-catalog';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const FRAG_GRENADE_ASSET = './assets/original/models/frag-grenade.glb';
export const FRAG_GRENADE_MAX_DIMENSION = 0.46;
export const SEMTEX_BUNDLE_ASSET = './assets/original/models/ordnance/semtex-bundle-lod0.glb';
export const SEMTEX_BUNDLE_MAX_DIMENSION = 0.58;
export const GRENADE_WORLD_PRESENTATION_POOL_CAPACITY_PER_FAMILY = 24;

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

type GrenadeWorldPresentationSlot = {
  family: GrenadePresentationFamily;
  root: THREE.Object3D;
  inUse: boolean;
};

/**
 * Fixed projectile-object residency for WebGPU. Three's render objects and
 * bindings are keyed by Object3D, so warming a disposable clone does not warm
 * the clone created by the first live throw. Every projectile that can become
 * visible in a supported lobby is created once, rendered behind the deployment
 * surface, and returned to this pool after detonation.
 */
export class GrenadeWorldPresentationPool {
  readonly root = new THREE.Group();
  private readonly slots: GrenadeWorldPresentationSlot[] = [];
  private readonly capacityPerFamily: number;
  private initialized = false;
  private disposed = false;
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;
  private acquisitions = 0;
  private releases = 0;
  private exhaustions = 0;
  private highWater = 0;
  private prewarmBlockedAcquisitions = 0;
  private readonly exhaustionsByFamily: Record<GrenadePresentationFamily, number> = { frag: 0, semtex: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    capacityPerFamily = GRENADE_WORLD_PRESENTATION_POOL_CAPACITY_PER_FAMILY,
  ) {
    this.capacityPerFamily = Math.max(
      1,
      Math.min(GRENADE_WORLD_PRESENTATION_POOL_CAPACITY_PER_FAMILY, Math.floor(capacityPerFamily)),
    );
    this.root.name = 'grenade-world-presentation-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    if (this.disposed) throw new Error('Cannot initialize a disposed grenade presentation pool');
    for (const family of ['frag', 'semtex'] as const) {
      for (let index = 0; index < this.capacityPerFamily; index += 1) {
        const root = createGrenadePresentation(family === 'semtex' ? 'semtex' : 'frag');
        root.userData.presentationPoolFamily = family;
        root.userData.presentationPoolSlot = index;
        root.userData.presentationPoolInUse = false;
        root.visible = false;
        this.root.add(root);
        this.slots.push({ family, root, inUse: false });
      }
    }
    this.initialized = true;
  }

  acquire(grenade: GrenadeId): THREE.Object3D | null {
    if (this.disposed) return null;
    if (this.gpuPrewarmPromise) {
      this.prewarmBlockedAcquisitions += 1;
      return null;
    }
    this.ensureInitialized();
    const family = grenadePresentationFamily(grenade);
    const slot = this.slots.find((candidate) => candidate.family === family && !candidate.inUse);
    if (!slot) {
      this.exhaustions += 1;
      this.exhaustionsByFamily[family] += 1;
      return null;
    }
    slot.inUse = true;
    slot.root.userData.presentationPoolInUse = true;
    slot.root.userData.grenadeSelection = grenade;
    slot.root.visible = true;
    slot.root.position.set(0, 0, 0);
    slot.root.quaternion.identity();
    this.acquisitions += 1;
    this.highWater = Math.max(this.highWater, this.slots.filter((candidate) => candidate.inUse).length);
    return slot.root;
  }

  release(root: THREE.Object3D): boolean {
    const slot = this.slots.find((candidate) => candidate.root === root);
    if (!slot || !slot.inUse) return false;
    slot.inUse = false;
    slot.root.userData.presentationPoolInUse = false;
    slot.root.visible = false;
    slot.root.position.set(0, -10_000, 0);
    slot.root.quaternion.identity();
    this.releases += 1;
    return true;
  }

  clearActive(): void {
    for (const slot of this.slots) {
      if (slot.inUse) this.release(slot.root);
    }
  }

  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.disposed) throw new Error('Cannot prewarm a disposed grenade presentation pool');
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      await this.gpuPrewarmPromise;
      if (this.gpuPrewarmGeneration === sceneGeneration) return;
    }
    const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
    this.gpuPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
    }
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
  ): Promise<void> {
    await loadGrenadePresentation();
    this.ensureInitialized();
    if (this.slots.some((slot) => slot.inUse)) {
      throw new Error('Grenade presentation prewarm cannot overlap active projectile leases');
    }
    if (this.root.parent !== this.scene) {
      throw new Error('Grenade presentation pool must be attached to its scene before prewarm');
    }
    const states = new Map<THREE.Object3D, Readonly<{
      visible: boolean;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      frustumCulled: boolean;
    }>>();
    const rootVisible = this.root.visible;
    const rootFrustumCulled = this.root.frustumCulled;
    this.root.visible = true;
    this.root.frustumCulled = false;
    camera.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const columns = 6;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index]!;
      slot.root.traverse((node) => {
        states.set(node, Object.freeze({
          visible: node.visible,
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          scale: node.scale.clone(),
          frustumCulled: node.frustumCulled,
        }));
        node.visible = true;
        node.frustumCulled = false;
      });
      const column = index % columns;
      const row = Math.floor(index / columns);
      const target = cameraPosition.clone()
        .addScaledVector(forward, 7)
        .addScaledVector(right, (column - 2.5) * 0.42)
        .addScaledVector(up, (1.5 - row) * 0.42);
      slot.root.position.copy(this.root.worldToLocal(target));
    }
    try {
      await runtime.compileAndRender(this.root, camera, this.scene);
      if (!this.disposed) this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      for (const [node, state] of states) {
        node.visible = state.visible;
        node.position.copy(state.position);
        node.quaternion.copy(state.quaternion);
        node.scale.copy(state.scale);
        node.frustumCulled = state.frustumCulled;
      }
      for (const slot of this.slots) {
        slot.inUse = false;
        slot.root.userData.presentationPoolInUse = false;
        slot.root.visible = false;
      }
      this.root.visible = rootVisible;
      this.root.frustumCulled = rootFrustumCulled;
    }
  }

  telemetry(): Readonly<{
    capacityPerFamily: number;
    total: number;
    active: number;
    acquisitions: number;
    releases: number;
    exhaustions: number;
    highWater: number;
    activeByFamily: Readonly<Record<GrenadePresentationFamily, number>>;
    exhaustionsByFamily: Readonly<Record<GrenadePresentationFamily, number>>;
    prewarmBlockedAcquisitions: number;
    gpuPrewarmGeneration: number;
  }> {
    return Object.freeze({
      capacityPerFamily: this.capacityPerFamily,
      total: this.slots.length,
      active: this.slots.filter((slot) => slot.inUse).length,
      acquisitions: this.acquisitions,
      releases: this.releases,
      exhaustions: this.exhaustions,
      highWater: this.highWater,
      activeByFamily: Object.freeze({
        frag: this.slots.filter((slot) => slot.family === 'frag' && slot.inUse).length,
        semtex: this.slots.filter((slot) => slot.family === 'semtex' && slot.inUse).length,
      }),
      exhaustionsByFamily: Object.freeze({ ...this.exhaustionsByFamily }),
      prewarmBlockedAcquisitions: this.prewarmBlockedAcquisitions,
      gpuPrewarmGeneration: this.gpuPrewarmGeneration,
    });
  }

  /** Terminal renderer teardown only; live expiry must release slots instead. */
  terminalDispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) disposeGrenadePresentation(slot.root);
    this.slots.length = 0;
    this.root.removeFromParent();
    this.root.visible = false;
  }
}
