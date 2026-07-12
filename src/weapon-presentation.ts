import * as THREE from 'three';
import { buildWeaponModel, roundedBox } from './art-kit';
import type { WeaponId } from './protocol';

export type WeaponPose = {
  dt: number;
  moving: boolean;
  sprinting: boolean;
  crouched: boolean;
  ads: boolean;
  phase: number;
  landingImpulse: number;
  lateralSpeed: number;
};

type ViewCasing = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number };

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
  private readonly muzzleLight: THREE.PointLight;
  private readonly muzzleFlash: THREE.Group;
  private readonly casings: ViewCasing[] = [];
  private adsBlend = 0;
  private sprintBlend = 0;

  constructor(camera: THREE.Camera, private readonly flattenMaterials = false) {
    this.root.name = 'original-weapon-view';
    this.root.position.set(0.31, -0.31, -0.7);
    this.root.scale.setScalar(0.78);
    camera.add(this.root);

    const sleeve = new THREE.MeshStandardMaterial({ color: 0x263c38, roughness: 0.9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x12181b, roughness: 0.94 });
    const arms = new THREE.Group(); arms.name = 'first-person-arms';
    const rightForearm = roundedBox('right-forearm', [0.18, 0.18, 0.68], sleeve, 0.08, 4);
    rightForearm.position.set(0.18, -0.2, 0.3); rightForearm.rotation.set(-0.2, -0.12, -0.12);
    const rightGlove = roundedBox('right-glove', [0.2, 0.19, 0.25], glove, 0.075, 4);
    rightGlove.position.set(0.1, -0.15, -0.02); rightGlove.rotation.x = -0.12;
    const leftForearm = roundedBox('left-forearm', [0.19, 0.19, 0.75], sleeve, 0.08, 4);
    leftForearm.position.set(-0.24, -0.23, 0.12); leftForearm.rotation.set(-0.42, 0.28, 0.08);
    const leftGlove = roundedBox('left-glove', [0.21, 0.2, 0.27], glove, 0.075, 4);
    leftGlove.position.set(-0.08, -0.07, -0.43); leftGlove.rotation.set(-0.18, 0.15, 0);
    arms.add(rightForearm, rightGlove, leftForearm, leftGlove);
    this.root.add(arms);
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, 4.5, 2);
    this.muzzleLight.position.set(0, 0.08, -1.15);
    this.root.add(this.muzzleLight);

    this.muzzleFlash = new THREE.Group();
    this.muzzleFlash.position.set(0, 0.08, -1.15);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd38a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.42, 8), flashMaterial);
    core.rotation.x = -Math.PI / 2;
    core.position.z = -0.2;
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMaterial.clone());
    flare.rotation.z = Math.PI / 4;
    this.muzzleFlash.add(core, flare);
    this.muzzleFlash.visible = false;
    this.root.add(this.muzzleFlash);
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
    this.muzzleLight.intensity = this.active === 'scattergun' ? 7.2 : 4.8;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(this.active === 'scattergun' ? 1.45 : this.active === 'smg' ? 0.78 : 1);
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;

    const casingMaterial = new THREE.MeshStandardMaterial({ color: 0xc8a65c, roughness: 0.3, metalness: 0.78 });
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.085, 7), casingMaterial);
    casing.rotation.z = Math.PI / 2;
    casing.position.set(0.12, 0.04, -0.48);
    this.root.add(casing);
    this.casings.push({
      mesh: casing,
      velocity: new THREE.Vector3(0.95 + Math.random() * 0.25, 0.75 + Math.random() * 0.2, 0.1),
      life: 0.42,
    });
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
    this.adsBlend = THREE.MathUtils.lerp(this.adsBlend, pose.ads ? 1 : 0, smoothing(pose.ads ? 18 : 15));
    this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend, pose.sprinting ? 1 : 0, smoothing(13));
    this.muzzleFlash.visible = this.muzzleLight.intensity > 0.45;

    for (let index = this.casings.length - 1; index >= 0; index -= 1) {
      const casing = this.casings[index];
      casing.life -= pose.dt;
      casing.velocity.y -= 4.5 * pose.dt;
      casing.mesh.position.addScaledVector(casing.velocity, pose.dt);
      casing.mesh.rotation.x += pose.dt * 18;
      casing.mesh.rotation.z += pose.dt * 11;
      if (casing.life <= 0) {
        this.root.remove(casing.mesh);
        casing.mesh.geometry.dispose();
        (casing.mesh.material as THREE.Material).dispose();
        this.casings.splice(index, 1);
      }
    }

    const bobWeight = pose.moving ? (pose.sprinting ? 1.22 : pose.ads ? 0.18 : pose.crouched ? 0.32 : 0.56) : 0.05;
    const bobX = Math.cos(pose.phase * 0.5) * 0.017 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.019 * bobWeight;
    const breath = Math.sin(performance.now() * 0.0017) * (pose.ads ? 0.0015 : 0.0045);
    const adsX = this.adsBlend * -0.305;
    const adsY = this.adsBlend * 0.255;
    const adsZ = this.adsBlend * 0.22;
    const sprintDrop = this.sprintBlend * -0.16;
    const crouchLift = pose.crouched ? 0.035 : 0;
    const switchDrop = (1 - this.switchBlend) * -0.34;

    let reloadRoll = 0;
    let reloadDrop = 0;
    if (this.reloadDuration > 0) {
      const progress = (performance.now() - this.reloadStart) / this.reloadDuration;
      if (progress >= 1) this.reloadDuration = 0;
      else {
        const p = THREE.MathUtils.clamp(progress, 0, 1);
        const lower = Math.sin(Math.PI * p);
        const seatSnap = p > 0.65 ? Math.sin((p - 0.65) / 0.35 * Math.PI) : 0;
        reloadRoll = lower * 0.78 - seatSnap * 0.12;
        reloadDrop = lower * -0.22 + seatSnap * 0.035;
      }
    }

    const meleeProgress = THREE.MathUtils.clamp((performance.now() - this.meleeStart) / 430, 0, 1);
    const meleeArc = this.meleeStart > 0 && meleeProgress < 1 ? Math.sin(meleeProgress * Math.PI) : 0;
    const grenadeProgress = THREE.MathUtils.clamp((performance.now() - this.grenadeStart) / 620, 0, 1);
    const grenadeArc = this.grenadeStart > 0 && grenadeProgress < 1 ? Math.sin(grenadeProgress * Math.PI) : 0;

    const targetPosition = new THREE.Vector3(
      0.31 + adsX + bobX + this.swayX - pose.lateralSpeed * 0.012 - meleeArc * 0.24 + grenadeArc * 0.18,
      -0.31 + adsY + bobY + breath + sprintDrop + crouchLift + switchDrop + reloadDrop - this.recoil * 0.08 - pose.landingImpulse * 0.075,
      -0.7 + adsZ + this.recoil * 0.13 - meleeArc * 0.32 + grenadeArc * 0.24,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.recoil * 0.18 - this.swayY - grenadeArc * 0.42, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, -this.swayX * 2 - this.sprintBlend * 0.38 - meleeArc * 0.65, smoothing(13));
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadRoll - this.sprintBlend * 0.22 - pose.lateralSpeed * 0.025 + meleeArc * 0.42, smoothing(13));
  }
}
