import * as THREE from 'three';
import { buildWeaponModel, roundedBox } from './art-kit';
import { solveTwoBoneElbow } from './ik';
import type { WeaponId } from './protocol';

export type WeaponPose = {
  dt: number;
  moving: boolean;
  sprinting: boolean;
  crouched: boolean;
  prone: boolean;
  ads: boolean;
  phase: number;
  landingImpulse: number;
  lateralSpeed: number;
};

type ViewCasing = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; active: boolean };
type ViewArmRig = {
  side: 'left' | 'right';
  shoulder: THREE.Group;
  elbow: THREE.Group;
  upperLength: number;
  lowerLength: number;
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
  private readonly muzzleLight: THREE.PointLight;
  private readonly muzzleFlash: THREE.Group;
  private readonly casings: ViewCasing[] = [];
  private readonly armRigs: ViewArmRig[] = [];
  private readonly brassGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.085, 7);
  private readonly shellGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.105, 8);
  private readonly brassMaterial = new THREE.MeshStandardMaterial({ color: 0xc8a65c, roughness: 0.3, metalness: 0.78 });
  private readonly shellMaterial = new THREE.MeshStandardMaterial({ color: 0xb43f32, roughness: 0.58, metalness: 0.18 });
  private shotStarted = -10_000;
  private casingCursor = 0;
  private adsBlend = 0;
  private sprintBlend = 0;

  constructor(camera: THREE.Camera, private readonly flattenMaterials = false) {
    this.root.name = 'original-weapon-view';
    this.root.position.set(0.36, -0.38, -0.78);
    this.root.scale.setScalar(0.6);
    camera.add(this.root);

    const sleeve = new THREE.MeshStandardMaterial({ color: 0x263c38, roughness: 0.9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x12181b, roughness: 0.94 });
    const arms = new THREE.Group(); arms.name = 'first-person-arms';
    const makeArm = (side: 'left' | 'right') => {
      const sign = side === 'left' ? -1 : 1;
      const upperLength = 0.56;
      const lowerLength = 0.58;
      const shoulder = new THREE.Group(); shoulder.name = `${side}-shoulder-joint`;
      shoulder.position.set(sign * 0.25, side === 'right' ? -0.17 : -0.12, side === 'right' ? 0.52 : 0.45);
      const upper = roundedBox(`${side}-upper-arm`, [0.19, 0.19, upperLength], sleeve, 0.075, 3);
      upper.position.z = -upperLength / 2; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.name = `${side}-elbow-joint`; elbow.position.z = -upperLength; shoulder.add(elbow);
      const forearm = roundedBox(`${side}-forearm`, [0.18, 0.18, lowerLength], sleeve, 0.075, 3);
      forearm.position.z = -lowerLength / 2; elbow.add(forearm);
      const hand = roundedBox(`${side}-glove`, [0.17, 0.15, 0.22], glove, 0.06, 3);
      hand.position.set(sign * -0.015, -0.01, -lowerLength); hand.rotation.x = -0.12; elbow.add(hand);
      const thumb = roundedBox(`${side}-thumb`, [0.07, 0.1, 0.16], glove, 0.028, 2);
      thumb.position.set(sign * -0.1, -0.04, -lowerLength + 0.02); thumb.rotation.z = sign * 0.32; elbow.add(thumb);
      this.armRigs.push({ side, shoulder, elbow, upperLength, lowerLength });
      return shoulder;
    };
    arms.add(makeArm('right'), makeArm('left'));
    arms.scale.setScalar(0.74);
    arms.position.set(0, -0.08, 0.02);
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

    for (let index = 0; index < 16; index += 1) {
      const mesh = new THREE.Mesh(this.brassGeometry, this.brassMaterial);
      mesh.name = `pooled-casing-${index}`;
      mesh.visible = false;
      mesh.rotation.z = Math.PI / 2;
      this.root.add(mesh);
      this.casings.push({ mesh, velocity: new THREE.Vector3(), life: 0, active: false });
    }
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
    const activeModel = this.models.get(id);
    const muzzleSocket = activeModel?.getObjectByName('muzzle-socket');
    if (muzzleSocket) {
      this.muzzleLight.position.copy(muzzleSocket.position);
      this.muzzleFlash.position.copy(muzzleSocket.position);
    }
  }

  fire(amount: number): void {
    this.recoil = Math.min(1, this.recoil + 0.24 + amount * 5.2);
    this.shotStarted = performance.now();
    this.muzzleLight.intensity = this.active === 'scattergun' ? 7.2 : 4.8;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(this.active === 'scattergun' ? 1.45 : this.active === 'smg' ? 0.78 : 1);
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;

    const casing = this.casings[this.casingCursor++ % this.casings.length];
    const shell = this.active === 'scattergun';
    casing.mesh.geometry = shell ? this.shellGeometry : this.brassGeometry;
    casing.mesh.material = shell ? this.shellMaterial : this.brassMaterial;
    const ejectSocket = this.models.get(this.active)?.getObjectByName('eject-socket');
    casing.mesh.position.copy(ejectSocket?.position ?? new THREE.Vector3(0.12, 0.04, -0.48));
    casing.mesh.rotation.set(Math.random() * 0.4, 0, Math.PI / 2);
    casing.mesh.visible = true;
    casing.velocity.set(
      shell ? 0.72 : 0.95 + Math.random() * 0.25,
      shell ? 0.55 : 0.75 + Math.random() * 0.2,
      shell ? 0.16 : 0.1,
    );
    casing.life = shell ? 0.62 : 0.42;
    casing.active = true;
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

  private solveArms(arms: THREE.Object3D, activeModel: THREE.Object3D | undefined): void {
    if (!activeModel) return;
    this.root.updateMatrixWorld(true);
    for (const rig of this.armRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      const socket = activeModel.getObjectByName(socketName);
      if (!socket) continue;
      const targetWorld = socket.getWorldPosition(new THREE.Vector3());
      const targetInArms = arms.worldToLocal(targetWorld.clone());
      const hint = new THREE.Vector3(rig.side === 'left' ? -0.48 : 0.48, -1, 0.22);
      const elbowPoint = solveTwoBoneElbow(rig.shoulder.position, targetInArms, rig.upperLength, rig.lowerLength, hint);
      const upperDirection = elbowPoint.sub(rig.shoulder.position).normalize();
      rig.shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), upperDirection);
      rig.elbow.position.set(0, 0, -rig.upperLength);
      rig.shoulder.updateWorldMatrix(true, true);
      const targetInShoulder = rig.shoulder.worldToLocal(targetWorld.clone());
      const lowerDirection = targetInShoulder.sub(rig.elbow.position).normalize();
      rig.elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), lowerDirection);
    }
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
    const arms = this.root.getObjectByName('first-person-arms');
    if (arms) arms.position.y = THREE.MathUtils.lerp(-0.08, -0.3, this.adsBlend);

    for (const casing of this.casings) {
      if (!casing.active) continue;
      casing.life -= pose.dt;
      casing.velocity.y -= 4.5 * pose.dt;
      casing.mesh.position.addScaledVector(casing.velocity, pose.dt);
      casing.mesh.rotation.x += pose.dt * 18;
      casing.mesh.rotation.z += pose.dt * 11;
      if (casing.life <= 0) {
        casing.active = false;
        casing.mesh.visible = false;
      }
    }

    const activeModel = this.models.get(this.active);
    const shotAge = performance.now() - this.shotStarted;
    const bolt = activeModel?.getObjectByName('bolt-or-slide');
    if (bolt) {
      const restZ = Number(bolt.userData.restZ ?? 0);
      const cycleMs = this.active === 'smg' ? 44 : 62;
      const cycle = THREE.MathUtils.clamp(shotAge / cycleMs, 0, 1);
      bolt.position.z = restZ + Math.sin(cycle * Math.PI) * (this.active === 'smg' ? 0.09 : 0.075);
    }
    const pump = activeModel?.getObjectByName('pump');
    if (pump) {
      const restZ = Number(pump.userData.restZ ?? -0.48);
      const pumpProgress = THREE.MathUtils.clamp((shotAge - 180) / 440, 0, 1);
      pump.position.z = restZ + Math.sin(pumpProgress * Math.PI) * 0.22;
    }

    const bobWeight = pose.moving ? (pose.sprinting ? 1.22 : pose.ads ? 0.12 : pose.prone ? 0.12 : pose.crouched ? 0.32 : 0.56) : 0.05;
    const bobX = Math.cos(pose.phase * 0.5) * 0.017 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.019 * bobWeight;
    const breath = Math.sin(performance.now() * 0.0017) * (pose.ads ? 0.0015 : 0.0045);
    const adsX = this.adsBlend * -0.36;
    // The authored sight axes are y=.215. This offsets the 0.6 view scale so
    // the physical sight—not a HUD approximation—lands on camera centre.
    const adsY = this.adsBlend * 0.251;
    const adsZ = this.adsBlend * -0.04;
    const sprintDrop = this.sprintBlend * -0.16;
    const stanceHipBlend = 1 - this.adsBlend;
    const crouchLift = pose.crouched ? 0.035 * stanceHipBlend : 0;
    const proneLift = pose.prone ? 0.018 * stanceHipBlend : 0;
    const switchDrop = (1 - this.switchBlend) * -0.34;

    let reloadRoll = 0;
    let reloadDrop = 0;
    let reloadProgress = 0;
    if (this.reloadDuration > 0) {
      const progress = (performance.now() - this.reloadStart) / this.reloadDuration;
      if (progress >= 1) this.reloadDuration = 0;
      else {
        const p = THREE.MathUtils.clamp(progress, 0, 1);
        reloadProgress = p;
        const lower = Math.sin(Math.PI * p);
        const seatSnap = p > 0.65 ? Math.sin((p - 0.65) / 0.35 * Math.PI) : 0;
        reloadRoll = lower * 0.78 - seatSnap * 0.12;
        reloadDrop = lower * -0.22 + seatSnap * 0.035;
      }
    }
    const magazine = activeModel?.getObjectByName(this.active === 'carbine' ? 'curved-magazine' : 'straight-magazine');
    if (magazine) {
      const restY = this.active === 'carbine' ? -0.24 : -0.26;
      const exchange = reloadProgress > 0 ? Math.sin(reloadProgress * Math.PI) : 0;
      magazine.position.y = restY - exchange * 0.38;
      magazine.rotation.z = exchange * 0.18;
    }

    const meleeProgress = THREE.MathUtils.clamp((performance.now() - this.meleeStart) / 430, 0, 1);
    const meleeArc = this.meleeStart > 0 && meleeProgress < 1 ? Math.sin(meleeProgress * Math.PI) : 0;
    const grenadeProgress = THREE.MathUtils.clamp((performance.now() - this.grenadeStart) / 620, 0, 1);
    const grenadeArc = this.grenadeStart > 0 && grenadeProgress < 1 ? Math.sin(grenadeProgress * Math.PI) : 0;

    const targetPosition = new THREE.Vector3(
      0.36 + adsX + bobX + this.swayX - pose.lateralSpeed * 0.012 - meleeArc * 0.24 + grenadeArc * 0.18,
      -0.38 + adsY + bobY + breath + sprintDrop + crouchLift + proneLift + switchDrop + reloadDrop - this.recoil * 0.08 - pose.landingImpulse * 0.075,
      -0.78 + adsZ + this.recoil * 0.13 - meleeArc * 0.32 + grenadeArc * 0.24,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.recoil * 0.18 - this.swayY - grenadeArc * 0.42, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, -this.swayX * 2 - this.sprintBlend * 0.38 - meleeArc * 0.65, smoothing(13));
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadRoll - this.sprintBlend * 0.22 - pose.lateralSpeed * (pose.prone ? 0.01 : 0.025) + meleeArc * 0.42, smoothing(13));
    if (arms) this.solveArms(arms, activeModel);
  }
}
