import * as THREE from 'three';

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
  private wasPrewarmed = false;

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

  async prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<void> {
    if (this.wasPrewarmed) return;
    for (const slot of this.slots) {
      slot.root.visible = true;
      slot.root.scale.setScalar(0.0001);
    }
    try {
      await renderer.compileAsync(this.root.parent as THREE.Scene, camera);
      renderer.render(this.root.parent as THREE.Scene, camera);
      this.wasPrewarmed = true;
    } finally {
      for (const slot of this.slots) {
        slot.root.visible = false;
        slot.root.scale.setScalar(1);
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
      prewarmed: this.wasPrewarmed,
    };
  }
}
