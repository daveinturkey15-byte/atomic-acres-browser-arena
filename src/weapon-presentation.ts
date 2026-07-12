import * as THREE from 'three';
import { buildWeaponModel, roundedBox } from './art-kit';
import { solveTwoBoneElbow } from './ik';
import { reloadActionEvents, reloadPoseAt, type ReloadPose, type WeaponActionEvent } from './weapon-actions';
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
type ViewSmoke = { velocity: THREE.Vector3; life: number; maxLife: number; active: boolean };
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
  private reloadLastProgress = 0;
  private switchBlend = 1;
  private swayX = 0;
  private swayY = 0;
  private meleeStart = 0;
  private grenadeStart = 0;
  private readonly muzzleLight: THREE.PointLight;
  private readonly muzzleFlash: THREE.Group;
  private readonly casings: ViewCasing[] = [];
  private readonly smokes: ViewSmoke[] = [];
  private readonly smokePositions = new Float32Array(24);
  private readonly smokeColors = new Float32Array(24);
  private readonly smokePoints: THREE.Points;
  private readonly armRigs: ViewArmRig[] = [];
  private readonly brassGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.085, 7);
  private readonly shellGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.105, 8);
  private readonly brassMaterial = new THREE.MeshStandardMaterial({ color: 0xc8a65c, roughness: 0.3, metalness: 0.78 });
  private readonly shellMaterial = new THREE.MeshStandardMaterial({ color: 0xb43f32, roughness: 0.58, metalness: 0.18 });
  private shotStarted = -10_000;
  private casingCursor = 0;
  private smokeCursor = 0;
  private pendingScattergunShell = false;
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

    const smokeGeometry = new THREE.BufferGeometry();
    this.smokePositions.fill(0);
    for (let index = 0; index < 8; index += 1) this.smokePositions[index * 3 + 1] = -10_000;
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    smokeGeometry.setAttribute('color', new THREE.BufferAttribute(this.smokeColors, 3));
    this.smokePoints = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({
      size: flattenMaterials ? 0.045 : 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.smokePoints.name = 'pooled-muzzle-smoke';
    this.smokePoints.visible = false;
    this.smokePoints.frustumCulled = false;
    this.root.add(this.smokePoints);
    for (let index = 0; index < 8; index += 1) {
      this.smokes.push({ velocity: new THREE.Vector3(), life: 0, maxLife: 0, active: false });
    }

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
    this.reloadLastProgress = 0;
    this.pendingScattergunShell = false;
    for (const [weaponId, model] of this.models) model.visible = weaponId === id;
    const activeModel = this.models.get(id);
    const muzzleSocket = activeModel?.getObjectByName('muzzle-socket');
    if (muzzleSocket) {
      this.muzzleLight.position.copy(muzzleSocket.position);
      this.muzzleFlash.position.copy(muzzleSocket.position);
    }
  }

  private ejectCasing(shell: boolean): void {
    const casing = this.casings[this.casingCursor++ % this.casings.length];
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

  fire(amount: number): void {
    this.recoil = Math.min(1, this.recoil + 0.24 + amount * 5.2);
    this.shotStarted = performance.now();
    this.muzzleLight.intensity = this.active === 'scattergun' ? 7.2 : 4.8;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(this.active === 'scattergun' ? 1.45 : this.active === 'smg' ? 0.78 : 1);
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;

    const muzzleSocket = this.models.get(this.active)?.getObjectByName('muzzle-socket');
    const smokeCount = this.active === 'scattergun' ? 2 : 1;
    for (let index = 0; index < smokeCount; index += 1) {
      const slot = this.smokeCursor++ % this.smokes.length;
      const smoke = this.smokes[slot];
      const offset = slot * 3;
      const muzzle = muzzleSocket?.position ?? new THREE.Vector3(0, 0.08, -1.15);
      this.smokePositions[offset] = muzzle.x + (Math.random() - 0.5) * 0.025;
      this.smokePositions[offset + 1] = muzzle.y + (Math.random() - 0.5) * 0.02;
      this.smokePositions[offset + 2] = muzzle.z - 0.05 - index * 0.035;
      smoke.velocity.set((Math.random() - 0.5) * 0.055, 0.1 + Math.random() * 0.06, -0.11 - Math.random() * 0.08);
      smoke.maxLife = this.active === 'scattergun' ? 0.34 : 0.22;
      smoke.life = smoke.maxLife;
      smoke.active = true;
      this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0.62;
    }
    this.smokePoints.visible = true;
    (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    if (this.active === 'scattergun') this.pendingScattergunShell = true;
    else this.ejectCasing(false);
  }

  reload(durationSeconds: number): void {
    this.reloadStart = performance.now();
    this.reloadDuration = durationSeconds * 1000;
    this.reloadLastProgress = 0;
  }

  cancelReload(): void {
    this.reloadDuration = 0;
    this.reloadLastProgress = 0;
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

  private solveArms(arms: THREE.Object3D, activeModel: THREE.Object3D | undefined, reloadPose: ReloadPose): void {
    if (!activeModel) return;
    this.root.updateMatrixWorld(true);
    for (const rig of this.armRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      const socket = activeModel.getObjectByName(socketName);
      if (!socket) continue;
      const targetWorld = socket.getWorldPosition(new THREE.Vector3());
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = activeModel.getObjectByName('reload-socket-l');
        if (reloadSocket) targetWorld.lerp(reloadSocket.getWorldPosition(new THREE.Vector3()), reloadPose.handToReload);
      }
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

  update(pose: WeaponPose): WeaponActionEvent[] {
    const actionEvents: WeaponActionEvent[] = [];
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
    let activeSmoke = 0;
    for (let slot = 0; slot < this.smokes.length; slot += 1) {
      const smoke = this.smokes[slot];
      if (!smoke.active) continue;
      const offset = slot * 3;
      smoke.life -= pose.dt;
      if (smoke.life <= 0) {
        smoke.active = false;
        this.smokePositions[offset + 1] = -10_000;
        this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0;
        continue;
      }
      activeSmoke += 1;
      this.smokePositions[offset] += smoke.velocity.x * pose.dt;
      this.smokePositions[offset + 1] += smoke.velocity.y * pose.dt;
      this.smokePositions[offset + 2] += smoke.velocity.z * pose.dt;
      const fade = Math.min(1, smoke.life / Math.max(0.001, smoke.maxLife) * 1.7) * 0.62;
      this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = fade;
    }
    this.smokePoints.visible = activeSmoke > 0;
    if (activeSmoke > 0) {
      (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }

    const activeModel = this.models.get(this.active);
    const shotAge = performance.now() - this.shotStarted;
    if (this.active === 'scattergun' && this.pendingScattergunShell && shotAge >= 230) {
      this.ejectCasing(true);
      this.pendingScattergunShell = false;
    }
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
      reloadProgress = THREE.MathUtils.clamp((performance.now() - this.reloadStart) / this.reloadDuration, 0, 1);
      actionEvents.push(...reloadActionEvents(this.active, this.reloadLastProgress, reloadProgress));
      this.reloadLastProgress = reloadProgress;
      const lower = Math.sin(Math.PI * reloadProgress);
      const seatSnap = reloadProgress > 0.65 ? Math.sin((reloadProgress - 0.65) / 0.35 * Math.PI) : 0;
      reloadRoll = lower * 0.78 - seatSnap * 0.12;
      reloadDrop = lower * -0.22 + seatSnap * 0.035;
      if (reloadProgress >= 1) {
        this.reloadDuration = 0;
        this.reloadLastProgress = 0;
      }
    }
    const reloadPose = reloadPoseAt(this.active, reloadProgress);
    const magazine = activeModel?.getObjectByName(this.active === 'carbine' ? 'curved-magazine' : 'straight-magazine');
    if (magazine) {
      if (magazine.userData.restY === undefined) {
        magazine.userData.restY = magazine.position.y;
        magazine.userData.restRotationZ = magazine.rotation.z;
      }
      magazine.position.y = Number(magazine.userData.restY) - reloadPose.magazineDrop;
      magazine.rotation.z = Number(magazine.userData.restRotationZ) + reloadPose.magazineTwist;
    }
    const reloadShell = activeModel?.getObjectByName('reload-shell');
    if (reloadShell) {
      reloadShell.visible = reloadPose.shellVisible;
      reloadShell.position.set(-0.16 + reloadPose.shellTravel * 0.13, -0.13 + reloadPose.shellTravel * 0.035, -0.02);
    }
    if (pump && reloadPose.actionPull > 0) {
      const restZ = Number(pump.userData.restZ ?? -0.48);
      pump.position.z = restZ + reloadPose.actionPull * 0.16;
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
    if (arms) this.solveArms(arms, activeModel, reloadPose);
    return actionEvents;
  }
}
