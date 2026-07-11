import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponId } from './protocol';

const MODEL_PATHS: Record<WeaponId, string> = {
  carbine: './assets/kenney/blaster/blaster-p.glb',
  smg: './assets/kenney/blaster/blaster-g.glb',
  scattergun: './assets/kenney/blaster/blaster-a.glb',
};

export type WeaponPose = {
  dt: number;
  moving: boolean;
  sprinting: boolean;
  ads: boolean;
  phase: number;
};

/** First-person authored weapon presentation with ADS, sprint, recoil and reload motion. */
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

  constructor(camera: THREE.Camera) {
    this.root.name = 'authored-weapon-view';
    this.root.position.set(0.34, -0.28, -0.62);
    camera.add(this.root);
  }

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    let loaded = 0;
    const entries = Object.entries(MODEL_PATHS) as Array<[WeaponId, string]>;
    const loadedModels = await Promise.all(entries.map(async ([id, path]) => {
      const gltf = await loader.loadAsync(path);
      loaded += 1;
      onProgress?.(loaded, entries.length);
      return [id, this.prepareModel(gltf.scene, id)] as const;
    }));
    for (const [id, model] of loadedModels) {
      this.models.set(id, model);
      this.root.add(model);
    }
    this.setWeapon(this.active, true);
  }

  isReady(): boolean {
    return this.models.size === Object.keys(MODEL_PATHS).length;
  }

  setWeapon(id: WeaponId, immediate = false): void {
    this.active = id;
    this.switchBlend = immediate ? 1 : 0;
    for (const [weaponId, model] of this.models) model.visible = weaponId === id;
  }

  fire(amount: number): void {
    this.recoil = Math.min(1, this.recoil + 0.28 + amount * 5);
  }

  reload(durationSeconds: number): void {
    this.reloadStart = performance.now();
    this.reloadDuration = durationSeconds * 1000;
  }

  addMouseDelta(x: number, y: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX + x * 0.00008, -0.025, 0.025);
    this.swayY = THREE.MathUtils.clamp(this.swayY + y * 0.00006, -0.02, 0.02);
  }

  update(pose: WeaponPose): void {
    const smoothing = (rate: number) => 1 - Math.exp(-rate * pose.dt);
    this.recoil = THREE.MathUtils.lerp(this.recoil, 0, smoothing(16));
    this.switchBlend = THREE.MathUtils.lerp(this.switchBlend, 1, smoothing(10));
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, smoothing(7));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, smoothing(7));

    const bobWeight = pose.moving ? (pose.sprinting ? 1.35 : pose.ads ? 0.22 : 0.62) : 0.08;
    const bobX = Math.cos(pose.phase * 0.5) * 0.018 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.022 * bobWeight;
    const adsX = pose.ads ? -0.335 : 0;
    const adsY = pose.ads ? 0.225 : 0;
    const adsZ = pose.ads ? 0.18 : 0;
    const sprintDrop = pose.sprinting ? -0.16 : 0;
    const switchDrop = (1 - this.switchBlend) * -0.34;

    let reloadRoll = 0;
    let reloadDrop = 0;
    if (this.reloadDuration > 0) {
      const progress = (performance.now() - this.reloadStart) / this.reloadDuration;
      if (progress >= 1) this.reloadDuration = 0;
      else {
        const arc = Math.sin(Math.PI * THREE.MathUtils.clamp(progress, 0, 1));
        reloadRoll = arc * 0.7;
        reloadDrop = arc * -0.16;
      }
    }

    const targetPosition = new THREE.Vector3(
      0.34 + adsX + bobX + this.swayX,
      -0.28 + adsY + bobY + sprintDrop + switchDrop + reloadDrop - this.recoil * 0.08,
      -0.62 + adsZ + this.recoil * 0.13,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.recoil * 0.18 - this.swayY, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, -this.swayX * 2 + (pose.sprinting ? -0.38 : 0), smoothing(13));
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadRoll + (pose.sprinting ? -0.22 : 0), smoothing(13));
  }

  private prepareModel(scene: THREE.Object3D, id: WeaponId): THREE.Object3D {
    const model = scene.clone(true);
    model.name = `${id}-authored-model`;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const entry of materials) {
        if (entry instanceof THREE.MeshStandardMaterial) {
          entry.roughness = Math.min(entry.roughness, 0.72);
          entry.metalness = Math.max(entry.metalness, 0.12);
        }
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const targetLength = id === 'scattergun' ? 0.92 : id === 'smg' ? 0.72 : 0.86;
    const scale = targetLength / Math.max(size.x, size.y, size.z, 0.001);
    model.scale.setScalar(scale);
    model.position.copy(center.multiplyScalar(-scale));
    model.rotation.y = Math.PI;
    model.rotation.x = -0.06;
    model.visible = false;
    return model;
  }
}
