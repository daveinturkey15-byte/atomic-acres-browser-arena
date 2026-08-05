import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const SUPPORT_EXPLOSION_POOL_CAPACITY = 12;
export const SUPPORT_EXPLOSION_DURATION_MS = 460;

type SupportExplosionSlot = {
  root: THREE.Group;
  flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startedAt: number;
  expiresAt: number;
  radius: number;
  active: boolean;
};

export type SupportExplosionTelemetry = {
  active: number;
  capacity: number;
  emitted: number;
  overflowReuses: number;
  dynamicLights: number;
  prewarmed: boolean;
};

/**
 * Fixed-capacity, unlit presentation for Yardhawk, Tri-Pass and Hunter Swarm
 * impacts. Every GPU resource exists before combat starts; emit() only mutates
 * an existing slot, so simultaneous impacts cannot trigger shader compilation,
 * geometry upload, disposal, or one requestAnimationFrame closure per blast.
 */
export class SupportExplosionPresentation {
  readonly root = new THREE.Group();
  private readonly slots: SupportExplosionSlot[] = [];
  private cursor = 0;
  private emitted = 0;
  private overflowReuses = 0;
  private gpuPrewarmGeneration: number | null = null;
  private gpuPrewarmPromise: Promise<void> | null = null;

  constructor(scene: THREE.Scene, reducedDetail: boolean) {
    this.root.name = 'support-explosion-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);

    const geometry = new THREE.SphereGeometry(1, reducedDetail ? 10 : 18, reducedDetail ? 7 : 12);
    for (let index = 0; index < SUPPORT_EXPLOSION_POOL_CAPACITY; index += 1) {
      const root = new THREE.Group();
      root.name = `support-explosion-slot-${index}`;
      root.visible = false;
      const flash = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0xffb24c,
          transparent: true,
          opacity: 0.76,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      flash.name = 'support-blast-flash';
      root.add(flash);
      root.traverse((node) => {
        node.userData.presentationOnly = true;
        node.raycast = () => undefined;
      });
      this.root.add(root);
      this.slots.push({ root, flash, startedAt: 0, expiresAt: 0, radius: 1, active: false });
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
    if (!(parentScene instanceof THREE.Scene)) throw new Error('Support explosion presentation must be attached to a scene before prewarm');

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
    const columns = 4;
    const rows = Math.ceil(this.slots.length / columns);
    const representativeRadius = 4;
    const representativeProgress = 0.5;
    this.root.visible = true;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index]!;
      materialOpacities.set(slot.flash.material, slot.flash.material.opacity);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const target = cameraPosition.clone()
        .addScaledVector(forward, 24)
        .addScaledVector(right, (column - (columns - 1) / 2) * 5.2)
        .addScaledVector(up, ((rows - 1) / 2 - row) * 5.2);
      slot.root.position.copy(this.root.worldToLocal(target));
      slot.root.scale.setScalar(0.25 + representativeProgress * representativeRadius);
      slot.root.visible = true;
      slot.flash.visible = true;
      slot.flash.material.opacity = 0.76 * (1 - representativeProgress);
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

  emit(point: THREE.Vector3, radius: number, now: number): void {
    const slot = this.slots[this.cursor++ % this.slots.length];
    if (slot.active) this.overflowReuses += 1;
    slot.root.position.copy(point);
    slot.radius = Math.max(0.25, Number.isFinite(radius) ? radius : 0.25);
    slot.root.scale.setScalar(0.25);
    slot.flash.material.opacity = 0.76;
    slot.startedAt = now;
    slot.expiresAt = now + SUPPORT_EXPLOSION_DURATION_MS;
    slot.active = true;
    slot.root.visible = true;
    this.emitted += 1;
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
      slot.root.scale.setScalar(0.25 + progress * slot.radius);
      slot.flash.material.opacity = 0.76 * (1 - progress);
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.root.visible = false;
    }
  }

  telemetry(): SupportExplosionTelemetry {
    return {
      active: this.slots.reduce((count, slot) => count + Number(slot.active), 0),
      capacity: this.slots.length,
      emitted: this.emitted,
      overflowReuses: this.overflowReuses,
      dynamicLights: 0,
      prewarmed: this.gpuPrewarmGeneration !== null,
    };
  }
}
