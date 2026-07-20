import * as THREE from 'three';

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
  private wasPrewarmed = false;

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
      prewarmed: this.wasPrewarmed,
    };
  }
}
