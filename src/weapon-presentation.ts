import * as THREE from 'three';
import { buildWeaponModel } from './art-kit';
import type { WeaponId } from './protocol';

export type WeaponPose = {
  dt: number;
  moving: boolean;
  sprinting: boolean;
  crouched: boolean;
  ads: boolean;
  phase: number;
  landingImpulse: number;
};

/** Original first-person weapon presentation with ADS, sprint, recoil, melee and staged reload motion. */
export class WeaponPresentation {
  readonly root = new THREE.Group();
  private readonly models = new Map<WeaponId, THREE.Object3D>();
  private active: WeaponId = 'carbine';
  private recoil = 0;
  private reloadStart = 0;
  private reloadDuration = 0;
  private switchBlend = 1;
  private swayX = 0;
  private swayY = 0;
  private meleeStart = 0;
  private grenadeStart = 0;
  private muzzleLight: THREE.PointLight;

  constructor(camera: THREE.Camera, private readonly flattenMaterials = false) {
    this.root.name = 'original-weapon-view';
    this.root.position.set(0.34, -0.28, -0.62);
    camera.add(this.root);
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, 4.5, 2);
    this.muzzleLight.position.set(0, 0.08, -1.15);
    this.root.add(this.muzzleLight);
  }

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const ids: WeaponId[] = ['carbine', 'smg', 'scattergun'];
    ids.forEach((id, index) => {
      const model = buildWeaponModel(id, this.flattenMaterials);
      model.visible = false;
      this.models.set(id, model);
      this.root.add(model);
      onProgress?.(index + 1, ids.length);
    });
    this.setWeapon(this.active, true);
  }

  isReady(): boolean {
    return this.models.size === 3;
  }

  setWeapon(id: WeaponId, immediate = false): void {
    this.active = id;
    this.switchBlend = immediate ? 1 : 0;
    this.reloadDuration = 0;
    for (const [weaponId, model] of this.models) model.visible = weaponId === id;
  }

  fire(amount: number): void {
    this.recoil = Math.min(1, this.recoil + 0.24 + amount * 5.2);
    this.muzzleLight.intensity = 4.8;
  }

  reload(durationSeconds: number): void {
    this.reloadStart = performance.now();
    this.reloadDuration = durationSeconds * 1000;
  }

  cancelReload(): void {
    this.reloadDuration = 0;
  }

  melee(): void {
    this.meleeStart = performance.now();
  }

  throwGrenade(): void {
    this.grenadeStart = performance.now();
  }

  addMouseDelta(x: number, y: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX + x * 0.00008, -0.025, 0.025);
    this.swayY = THREE.MathUtils.clamp(this.swayY + y * 0.00006, -0.02, 0.02);
  }

  update(pose: WeaponPose): void {
    const smoothing = (rate: number) => 1 - Math.exp(-rate * pose.dt);
    this.recoil = THREE.MathUtils.lerp(this.recoil, 0, smoothing(16));
    this.muzzleLight.intensity = THREE.MathUtils.lerp(this.muzzleLight.intensity, 0, smoothing(30));
    this.switchBlend = THREE.MathUtils.lerp(this.switchBlend, 1, smoothing(10));
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, smoothing(7));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, smoothing(7));

    const bobWeight = pose.moving ? (pose.sprinting ? 1.22 : pose.ads ? 0.18 : pose.crouched ? 0.32 : 0.56) : 0.05;
    const bobX = Math.cos(pose.phase * 0.5) * 0.017 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.019 * bobWeight;
    const adsX = pose.ads ? -0.335 : 0;
    const adsY = pose.ads ? 0.225 : 0;
    const adsZ = pose.ads ? 0.18 : 0;
    const sprintDrop = pose.sprinting ? -0.16 : 0;
    const crouchLift = pose.crouched ? 0.035 : 0;
    const switchDrop = (1 - this.switchBlend) * -0.34;

    let reloadRoll = 0;
    let reloadDrop = 0;
    if (this.reloadDuration > 0) {
      const progress = (performance.now() - this.reloadStart) / this.reloadDuration;
      if (progress >= 1) this.reloadDuration = 0;
      else {
        const arc = Math.sin(Math.PI * THREE.MathUtils.clamp(progress, 0, 1));
        reloadRoll = arc * 0.74;
        reloadDrop = arc * -0.2;
      }
    }

    const meleeProgress = THREE.MathUtils.clamp((performance.now() - this.meleeStart) / 430, 0, 1);
    const meleeArc = this.meleeStart > 0 && meleeProgress < 1 ? Math.sin(meleeProgress * Math.PI) : 0;
    const grenadeProgress = THREE.MathUtils.clamp((performance.now() - this.grenadeStart) / 620, 0, 1);
    const grenadeArc = this.grenadeStart > 0 && grenadeProgress < 1 ? Math.sin(grenadeProgress * Math.PI) : 0;

    const targetPosition = new THREE.Vector3(
      0.34 + adsX + bobX + this.swayX - meleeArc * 0.24 + grenadeArc * 0.18,
      -0.28 + adsY + bobY + sprintDrop + crouchLift + switchDrop + reloadDrop - this.recoil * 0.08 - pose.landingImpulse * 0.075,
      -0.62 + adsZ + this.recoil * 0.13 - meleeArc * 0.32 + grenadeArc * 0.24,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.recoil * 0.18 - this.swayY - grenadeArc * 0.42, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, -this.swayX * 2 + (pose.sprinting ? -0.38 : 0) - meleeArc * 0.65, smoothing(13));
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadRoll + (pose.sprinting ? -0.22 : 0) + meleeArc * 0.42, smoothing(13));
  }
}
