import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const GRENADE_EXPLOSION_POOL_CAPACITY = 4;
export const GRENADE_EXPLOSION_DURATION_MS = 280;

type ExplosionSlot = {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startedAt: number;
  expiresAt: number;
  active: boolean;
};

export type GrenadeExplosionTelemetry = {
  active: number;
  capacity: number;
  dynamicLights: number;
  prewarmed: boolean;
};

/**
 * Fixed-capacity, unlit grenade blast pool.
 *
 * The old detonation path created a PointLight on demand. Changing Three.js's
 * light count at the exact explosion frame invalidated lit shader programs and
 * could stall the main thread while the whole arena recompiled. These roots,
 * geometries and materials are created at startup, contain no lights, and are
 * reused without detonation-time GPU resource construction.
 */
export class GrenadeExplosionPresentation {
  readonly root = new THREE.Group();
  private readonly slots: ExplosionSlot[] = [];
  private cursor = 0;
  private gpuPrewarmGeneration: number | null = null;
  private gpuPrewarmPromise: Promise<void> | null = null;

  constructor(scene: THREE.Scene) {
    this.root.name = 'grenade-explosion-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);

    const ringGeometry = new THREE.RingGeometry(0.24, 1.45, 28);
    const coreGeometry = new THREE.SphereGeometry(0.22, 10, 8);
    for (let index = 0; index < GRENADE_EXPLOSION_POOL_CAPACITY; index += 1) {
      const slotRoot = new THREE.Group();
      slotRoot.name = `grenade-explosion-slot-${index}`;
      slotRoot.visible = false;
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffa13d,
          transparent: true,
          opacity: 0.68,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.name = 'grenade-blast-ring';
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(0.18);
      const core = new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffcf78,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      core.name = 'grenade-blast-core';
      core.position.y = 0.08;
      slotRoot.add(ring, core);
      slotRoot.traverse((node) => {
        node.userData.presentationOnly = true;
        node.raycast = () => undefined;
      });
      this.root.add(slotRoot);
      this.slots.push({ root: slotRoot, ring, core, startedAt: 0, expiresAt: 0, active: false });
    }
  }

  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      const pending = this.gpuPrewarmPromise;
      try {
        await pending;
      } catch {
        if (this.gpuPrewarmPromise === pending) this.gpuPrewarmPromise = null;
      }
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
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene)) throw new Error('Grenade explosion presentation must be attached to a scene before prewarm');

    const objectStates = new Map<THREE.Object3D, Readonly<{
      visible: boolean;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      frustumCulled: boolean;
    }>>();
    const materialOpacities = new Map<THREE.Material, number>();
    this.root.traverse((node) => {
      objectStates.set(node, Object.freeze({
        visible: node.visible,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        frustumCulled: node.frustumCulled,
      }));
      node.frustumCulled = false;
    });

    camera.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const columns = 2;
    const rows = Math.ceil(this.slots.length / columns);
    this.root.visible = true;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index]!;
      materialOpacities.set(slot.ring.material, slot.ring.material.opacity);
      materialOpacities.set(slot.core.material, slot.core.material.opacity);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const target = cameraPosition.clone()
        .addScaledVector(forward, 14)
        .addScaledVector(right, (column - (columns - 1) / 2) * 3.2)
        .addScaledVector(up, ((rows - 1) / 2 - row) * 3.2);
      slot.root.position.copy(this.root.worldToLocal(target));
      slot.root.scale.setScalar(1);
      slot.root.visible = true;
      slot.ring.visible = true;
      slot.ring.scale.setScalar(0.18);
      slot.ring.material.opacity = 0.68;
      slot.core.visible = true;
      slot.core.scale.setScalar(1);
      slot.core.material.opacity = 0.82;
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      for (const [material, opacity] of materialOpacities) material.opacity = opacity;
      for (const [node, state] of objectStates) {
        node.visible = state.visible;
        node.position.copy(state.position);
        node.quaternion.copy(state.quaternion);
        node.scale.copy(state.scale);
        node.frustumCulled = state.frustumCulled;
      }
    }
  }

  emit(point: THREE.Vector3, now: number): void {
    const slot = this.slots[this.cursor++ % this.slots.length];
    slot.root.position.copy(point).y += 0.055;
    slot.root.scale.setScalar(1);
    slot.ring.scale.setScalar(0.18);
    slot.core.scale.setScalar(1);
    slot.ring.material.opacity = 0.68;
    slot.core.material.opacity = 0.82;
    slot.startedAt = now;
    slot.expiresAt = now + GRENADE_EXPLOSION_DURATION_MS;
    slot.active = true;
    slot.root.visible = true;
  }

  update(now: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      if (now >= slot.expiresAt) {
        slot.active = false;
        slot.root.visible = false;
        continue;
      }
      const progress = THREE.MathUtils.clamp(
        (now - slot.startedAt) / Math.max(1, slot.expiresAt - slot.startedAt),
        0,
        1,
      );
      slot.ring.scale.setScalar(0.18 + progress * 1.35);
      slot.core.scale.setScalar(1 + progress * 2.1);
      slot.ring.material.opacity = 0.68 * (1 - progress);
      slot.core.material.opacity = 0.82 * (1 - progress);
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.root.visible = false;
    }
  }

  telemetry(): GrenadeExplosionTelemetry {
    return {
      active: this.slots.reduce((count, slot) => count + Number(slot.active), 0),
      capacity: this.slots.length,
      dynamicLights: 0,
      prewarmed: this.gpuPrewarmGeneration !== null,
    };
  }
}
