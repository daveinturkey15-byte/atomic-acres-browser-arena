import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const GRENADE_EXPLOSION_POOL_CAPACITY = 4;
/** HF-349: extended from 280ms so a single frame hitch cannot swallow the blast. */
export const GRENADE_EXPLOSION_DURATION_MS = 500;
/**
 * HF-349: a slot may only expire once it has been PRESENTED at least this many
 * frames AND its wall-clock lifetime has elapsed. `update()` is invoked once
 * per presented frame by the render loop immediately before the renderer draw,
 * so the presented-frame counter is counted there. A long hitch between emit()
 * and the next update() can no longer erase the effect before it was ever
 * drawn - the slot survives until three real presented frames have shown it.
 */
export const GRENADE_EXPLOSION_MIN_PRESENTED_FRAMES = 3;
/**
 * While the frame gate is unsatisfied the animation holds at this progress
 * instead of running to completion, so a faint afterglow stays visibly on
 * screen until the gate opens (rather than an invisible opacity-0 zombie).
 */
export const GRENADE_EXPLOSION_FRAME_GATE_HOLD_PROGRESS = 0.92;
/** HF-349: rings start at a clearly visible scale (previously 0.18). */
export const GRENADE_EXPLOSION_RING_START_SCALE = 0.42;
export const GRENADE_EXPLOSION_RING_END_SCALE = 2.3;
export const GRENADE_EXPLOSION_CORE_START_SCALE = 0.9;

type ExplosionSlot = {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  /** HF-349: non-additive dark smoke so the blast reads against bright sky. */
  smoke: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startedAt: number;
  expiresAt: number;
  presentedFrames: number;
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
 *
 * HF-349: slots now expire on BOTH a minimum presented-frame count and elapsed
 * time, run ~500ms with a decaying smoke/afterglow tail, start the shockwave
 * ring at a visible scale, and include a non-additive dark smoke element.
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

    // Shared geometries: created once here, never at detonation time.
    const ringGeometry = new THREE.RingGeometry(0.24, 1.45, 28);
    const coreGeometry = new THREE.SphereGeometry(0.22, 10, 8);
    const smokeGeometry = new THREE.SphereGeometry(0.34, 10, 8);
    for (let index = 0; index < GRENADE_EXPLOSION_POOL_CAPACITY; index += 1) {
      const slotRoot = new THREE.Group();
      slotRoot.name = `grenade-explosion-slot-${index}`;
      slotRoot.visible = false;
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffa13d,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.name = 'grenade-blast-ring';
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(GRENADE_EXPLOSION_RING_START_SCALE);
      const core = new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffcf78,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      core.name = 'grenade-blast-core';
      core.position.y = 0.08;
      // HF-349: deliberately NOT additive - dark smoke occludes the bright sky
      // behind the blast so the explosion silhouette reads outdoors.
      const smoke = new THREE.Mesh(
        smokeGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x23232a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: true,
          blending: THREE.NormalBlending,
        }),
      );
      smoke.name = 'grenade-blast-smoke';
      smoke.position.y = 0.14;
      slotRoot.add(ring, core, smoke);
      slotRoot.traverse((node) => {
        node.userData.presentationOnly = true;
        node.raycast = () => undefined;
      });
      this.root.add(slotRoot);
      this.slots.push({
        root: slotRoot,
        ring,
        core,
        smoke,
        startedAt: 0,
        expiresAt: 0,
        presentedFrames: 0,
        active: false,
      });
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
      materialOpacities.set(slot.smoke.material, slot.smoke.material.opacity);
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
      slot.ring.scale.setScalar(GRENADE_EXPLOSION_RING_START_SCALE);
      slot.ring.material.opacity = 0.72;
      slot.core.visible = true;
      slot.core.scale.setScalar(GRENADE_EXPLOSION_CORE_START_SCALE);
      slot.core.material.opacity = 0.85;
      slot.smoke.visible = true;
      slot.smoke.scale.setScalar(0.8);
      slot.smoke.material.opacity = 0.5;
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
    slot.ring.scale.setScalar(GRENADE_EXPLOSION_RING_START_SCALE);
    slot.core.scale.setScalar(GRENADE_EXPLOSION_CORE_START_SCALE);
    slot.smoke.scale.setScalar(0.8);
    slot.smoke.position.y = 0.14;
    slot.smoke.material.opacity = 0;
    slot.ring.material.opacity = 0.72;
    slot.core.material.opacity = 0.85;
    slot.startedAt = now;
    slot.expiresAt = now + GRENADE_EXPLOSION_DURATION_MS;
    slot.presentedFrames = 0;
    slot.active = true;
    slot.root.visible = true;
  }

  update(now: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      // HF-349: one call per presented frame (render loop invokes update()
      // directly before drawing). Count it toward the presentation gate.
      slot.presentedFrames += 1;
      const durationMs = Math.max(1, slot.expiresAt - slot.startedAt);
      const elapsed = now - slot.startedAt;
      const frameGateOpen = slot.presentedFrames >= GRENADE_EXPLOSION_MIN_PRESENTED_FRAMES;
      if (slot.presentedFrames > GRENADE_EXPLOSION_MIN_PRESENTED_FRAMES && elapsed >= durationMs) {
        slot.active = false;
        slot.root.visible = false;
        continue;
      }
      const holdCeiling = frameGateOpen ? 1 : GRENADE_EXPLOSION_FRAME_GATE_HOLD_PROGRESS;
      const progress = THREE.MathUtils.clamp(
        elapsed / durationMs,
        0,
        holdCeiling,
      );
      // Shockwave ring expands and fades linearly.
      slot.ring.scale.setScalar(
        GRENADE_EXPLOSION_RING_START_SCALE
        + progress * (GRENADE_EXPLOSION_RING_END_SCALE - GRENADE_EXPLOSION_RING_START_SCALE),
      );
      slot.ring.material.opacity = 0.72 * (1 - progress);
      // Fireball core: hot and fast, gone by mid-life.
      slot.core.scale.setScalar(GRENADE_EXPLOSION_CORE_START_SCALE + progress * 2.1);
      slot.core.material.opacity = 0.85 * Math.pow(Math.max(0, 1 - progress / 0.55), 1.4);
      // HF-349: decaying smoke/afterglow tail - ramps in through the fireball,
      // peaks just after it dies, then decays to zero across the back half.
      const smokeRamp = THREE.MathUtils.clamp(progress / 0.35, 0, 1);
      const smokeDecay = THREE.MathUtils.clamp(1 - (progress - 0.45) / 0.55, 0, 1);
      slot.smoke.scale.setScalar(0.8 + progress * 1.7);
      slot.smoke.position.y = 0.14 + progress * 0.55;
      slot.smoke.material.opacity = 0.5 * smokeRamp * smokeDecay;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.root.visible = false;
      slot.presentedFrames = 0;
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
