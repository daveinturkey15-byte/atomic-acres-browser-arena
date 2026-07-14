import * as THREE from 'three';
import { buildWeaponModel, roundedBox } from './art-kit';
import type { FirstPersonArmChain } from './operator-model';
import { solveTwoBoneElbow } from './ik';
import { reloadActionEvents, reloadPoseAt, type ReloadPose, type WeaponActionEvent } from './weapon-actions';
import { advanceWeaponHeat, fireCycleAt } from './weapon-presentation-state';
import { weaponFamilyPresentation } from './weapon-family-presentation';
import { fireImportedWeapon, importedWeaponTelemetry, reloadImportedWeapon, updateImportedWeapon } from './weapon-model';
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
  /** Authoritative gameplay reload progress. Null means no active reload. */
  reloadProgress: number | null;
};

type ViewCasing = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; active: boolean };
type ViewSmoke = { velocity: THREE.Vector3; life: number; maxLife: number; active: boolean };
type RiggedViewArm = FirstPersonArmChain & {
  bindShoulder: THREE.Quaternion;
  bindElbow: THREE.Quaternion;
  bindWrist: THREE.Quaternion;
};

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
  private readonly riggedArmRigs: RiggedViewArm[] = [];
  private riggedArmDiagnostics: Array<Record<string, unknown>> = [];
  private readonly meleeKnife = new THREE.Group();
  private readonly meleeRig = new THREE.Group();
  private readonly brassGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.085, 7);
  private readonly shellGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.105, 8);
  private readonly brassMaterial = new THREE.MeshStandardMaterial({ color: 0xc8a65c, roughness: 0.3, metalness: 0.78 });
  private readonly shellMaterial = new THREE.MeshStandardMaterial({ color: 0xb43f32, roughness: 0.58, metalness: 0.18 });
  private shotStarted = -10_000;
  private casingCursor = 0;
  private smokeCursor = 0;
  private pendingScattergunShell = false;
  private pendingCasing = false;
  private adsBlend = 0;
  private sprintBlend = 0;
  private weaponHeat = 0;
  private shotsPresented = 0;

  constructor(private readonly camera: THREE.Camera, private readonly flattenMaterials = false) {
    this.root.name = 'original-weapon-view';
    this.root.position.set(0.36, -0.38, -0.78);
    this.root.scale.setScalar(0.6);
    camera.add(this.root);

    const sleeve: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x3f7771 })
      : new THREE.MeshStandardMaterial({ color: 0x31544f, roughness: 0.84 });
    const sleeveTrim: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0xd4ad48 })
      : new THREE.MeshStandardMaterial({ color: 0xb9963f, roughness: 0.62, metalness: 0.12 });
    const glove: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x3c4b4c })
      : new THREE.MeshStandardMaterial({ color: 0x252d2e, roughness: 0.88 });
    // The licensed full-body derivative remains available for future authored
    // grip poses, but its current bind/IK calibration fails the viewmodel
    // acceptance gate (detached hands and sleeves outside the viewport). Keep
    // the readable original two-bone arms as the public presentation rather
    // than shipping a technically rigged but visibly broken pose.
    const arms = new THREE.Group(); arms.name = 'first-person-arms';
    const makeArm = (side: 'left' | 'right') => {
      const sign = side === 'left' ? -1 : 1;
      const upperLength = 0.56;
      const lowerLength = 0.58;
      const shoulder = new THREE.Group(); shoulder.name = `${side}-shoulder-joint`;
      shoulder.position.set(sign * 0.25, side === 'right' ? -0.17 : -0.12, side === 'right' ? 0.52 : 0.45);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, upperLength - 0.19, 5, 9), sleeve);
      upper.name = `${side}-upper-arm`;
      upper.rotation.x = -Math.PI / 2;
      upper.position.z = -upperLength / 2;
      upper.castShadow = true;
      shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.name = `${side}-elbow-joint`; elbow.position.z = -upperLength; shoulder.add(elbow);
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, lowerLength - 0.18, 5, 9), sleeve);
      forearm.name = `${side}-forearm`;
      forearm.rotation.x = -Math.PI / 2;
      forearm.position.z = -lowerLength / 2;
      forearm.castShadow = true;
      elbow.add(forearm);
      const cuff = roundedBox(`${side}-glove-cuff`, [0.205, 0.195, 0.14], sleeveTrim, 0.045, 2);
      cuff.position.z = -lowerLength + 0.075; elbow.add(cuff);
      const hand = roundedBox(`${side}-glove`, [0.18, 0.155, 0.235], glove, 0.055, 3);
      hand.position.set(sign * -0.015, -0.01, -lowerLength - 0.055); hand.rotation.x = -0.12; elbow.add(hand);
      const thumb = roundedBox(`${side}-thumb`, [0.075, 0.1, 0.17], glove, 0.028, 2);
      thumb.position.set(sign * -0.105, -0.04, -lowerLength - 0.035); thumb.rotation.z = sign * 0.32; elbow.add(thumb);
      const fingerCount = flattenMaterials ? 1 : 3;
      for (let finger = 0; finger < fingerCount; finger += 1) {
        const ridge = roundedBox(`${side}-finger-${finger}`, [0.036, 0.025, 0.14], glove, 0.01, 1);
        ridge.position.set(sign * (0.052 - finger * 0.052), -0.09, -lowerLength - 0.1);
        ridge.rotation.x = -0.18;
        elbow.add(ridge);
      }
      const sleeveBand = roundedBox(`${side}-sleeve-band`, [0.202, 0.202, 0.055], sleeveTrim, 0.016, 2);
      sleeveBand.position.z = -upperLength * 0.72;
      shoulder.add(sleeveBand);
      this.armRigs.push({ side, shoulder, elbow, upperLength, lowerLength });
      return shoulder;
    };
    arms.add(makeArm('right'), makeArm('left'));
    arms.scale.setScalar(0.74);
    arms.position.set(0, -0.08, 0.02);
    arms.visible = true;
    this.root.add(arms);

    // Original compact field knife. It is a camera-space presentation prop;
    // authoritative melee range and occlusion remain in gameplay/main.
    this.meleeKnife.name = 'field-knife-presentation';
    const knifeHandle = roundedBox('field-knife-handle', [0.15, 0.42, 0.14], glove, 0.035, 2);
    knifeHandle.position.set(0, -0.24, 0);
    const knifeGuard = roundedBox('field-knife-guard', [0.36, 0.075, 0.11], sleeveTrim, 0.018, 2);
    knifeGuard.position.set(0, 0, 0);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.095, 0);
    bladeShape.lineTo(0.095, 0);
    bladeShape.lineTo(0.072, 0.82);
    bladeShape.lineTo(0, 1.04);
    bladeShape.lineTo(-0.072, 0.82);
    bladeShape.closePath();
    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bladeShape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }),
      flattenMaterials
        ? new THREE.MeshBasicMaterial({ color: 0xe4eeee })
        : new THREE.MeshStandardMaterial({ color: 0xd5e0e0, roughness: 0.24, metalness: 0.8 }),
    );
    blade.name = 'field-knife-blade';
    blade.position.set(0, 0.02, -0.03);
    this.meleeKnife.add(knifeHandle, knifeGuard, blade);
    this.meleeRig.name = 'field-knife-arm-rig';
    const meleeForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.46, 5, 9), sleeve);
    meleeForearm.name = 'knife-forearm';
    meleeForearm.position.set(0.38, -0.42, 0.08);
    meleeForearm.rotation.z = 0.42;
    const meleeCuff = roundedBox('knife-glove-cuff', [0.21, 0.18, 0.15], sleeveTrim, 0.04, 2);
    meleeCuff.position.set(0.24, -0.13, -0.04);
    meleeCuff.rotation.z = 0.3;
    const meleeHand = roundedBox('knife-glove', [0.19, 0.21, 0.24], glove, 0.055, 3);
    meleeHand.position.set(0.19, -0.02, -0.14);
    meleeHand.rotation.set(-0.18, 0.08, -0.42);
    this.meleeKnife.position.set(0.19, 0.1, -0.2);
    this.meleeKnife.rotation.set(0.04, -0.06, -0.48);
    this.meleeKnife.visible = true;
    this.meleeRig.add(meleeForearm, meleeCuff, meleeHand, this.meleeKnife);
    this.meleeRig.visible = false;
    this.root.add(this.meleeRig);
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, 4.5, 2);
    this.muzzleLight.position.set(0, 0.08, -1.15);
    if (!flattenMaterials) this.root.add(this.muzzleLight);

    this.muzzleFlash = new THREE.Group();
    this.muzzleFlash.position.set(0, 0.08, -1.15);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd38a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.46, 7), flashMaterial);
    core.name = 'muzzle-flash-core';
    core.rotation.x = -Math.PI / 2;
    core.position.z = -0.22;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 6), flashMaterial.clone());
    crown.name = 'muzzle-flash-crown';
    crown.rotation.x = -Math.PI / 2;
    crown.position.z = -0.1;
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), flashMaterial.clone());
    flare.name = 'muzzle-flash-flare';
    flare.rotation.z = Math.PI / 4;
    this.muzzleFlash.add(core, crown, flare);
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
    const ids: WeaponId[] = ['carbine', 'smg', 'scattergun', 'pistol'];
    ids.forEach((id, index) => {
      const model = buildWeaponModel(id, this.flattenMaterials);
      if (id === 'carbine') {
        model.traverse((node) => {
          if (node.name === 'stock-shoulder-pad' || node.name === 'stock-cheek-rest' || node.name === 'stock-support-rod') node.visible = false;
        });
        const reticle = model.getObjectByName('optic-reticle');
        if (reticle instanceof THREE.Mesh && reticle.material instanceof THREE.MeshBasicMaterial) {
          reticle.material = reticle.material.clone();
          reticle.material.depthTest = false;
          reticle.material.depthWrite = false;
          reticle.renderOrder = 1_000;
        }
      }
      model.visible = false;
      this.models.set(id, model);
      this.root.add(model);
      onProgress?.(index + 1, ids.length);
    });
    this.setWeapon(this.active, true);
  }

  isReady(): boolean {
    return this.models.size === 4;
  }

  setWeapon(id: WeaponId, immediate = false): void {
    this.active = id;
    this.switchBlend = immediate ? 1 : 0;
    this.reloadLastProgress = 0;
    this.pendingScattergunShell = false;
    this.pendingCasing = false;
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
    const activeModel = this.models.get(this.active);
    if (activeModel) fireImportedWeapon(activeModel);
    const profile = weaponFamilyPresentation(this.active);
    this.weaponHeat = advanceWeaponHeat(this.weaponHeat, true, 0, this.active);
    this.shotsPresented += 1;
    this.recoil = Math.min(1, this.recoil + 0.24 + amount * 5.2);
    this.shotStarted = performance.now();
    this.muzzleLight.intensity = this.flattenMaterials ? 0 : this.active === 'scattergun' ? 7.2 : 4.8;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(profile.flashScale);
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;

    const muzzleSocket = this.models.get(this.active)?.getObjectByName('muzzle-socket');
    const smokeCount = Math.min(this.smokes.length, profile.smokeBase + (this.weaponHeat > 0.56 ? 1 : 0));
    const cycle = fireCycleAt(this.active, 0, this.weaponHeat);
    for (let index = 0; index < smokeCount; index += 1) {
      const slot = this.smokeCursor++ % this.smokes.length;
      const smoke = this.smokes[slot];
      const offset = slot * 3;
      const muzzle = muzzleSocket?.position ?? new THREE.Vector3(0, 0.08, -1.15);
      this.smokePositions[offset] = muzzle.x + (Math.random() - 0.5) * 0.025;
      this.smokePositions[offset + 1] = muzzle.y + (Math.random() - 0.5) * 0.02;
      this.smokePositions[offset + 2] = muzzle.z - 0.05 - index * 0.035;
      smoke.velocity.set(
        (Math.random() - 0.5) * 0.055 * cycle.smokeScale,
        (0.1 + Math.random() * 0.06) * cycle.smokeScale,
        (-0.11 - Math.random() * 0.08) * cycle.smokeScale,
      );
      smoke.maxLife = (this.active === 'scattergun' ? 0.38 : 0.2 + this.weaponHeat * 0.12);
      smoke.life = smoke.maxLife;
      smoke.active = true;
      this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0.62;
    }
    this.smokePoints.visible = true;
    (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    if (this.active === 'scattergun') this.pendingScattergunShell = true;
    else this.pendingCasing = true;
  }

  reload(): void {
    const activeModel = this.models.get(this.active);
    if (activeModel) reloadImportedWeapon(activeModel);
    this.reloadLastProgress = 0;
  }

  cancelReload(): void {
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

  muzzleWorldPosition(target = new THREE.Vector3()): THREE.Vector3 | null {
    const socket = this.models.get(this.active)?.getObjectByName('muzzle-socket');
    return socket ? socket.getWorldPosition(target) : null;
  }

  adsProgress(): number {
    return this.adsBlend;
  }

  presentationState(): { weapon: WeaponId; heat: number; shotsPresented: number; activeCasings: number; activeSmoke: number; detailsReady: boolean; modelKind: 'licensed-imported' | 'original-authored'; adsProgress: number; sightOffset: [number, number] | null; armsVisible: boolean; armMeshCount: number; armBounds: { center: [number, number, number]; size: [number, number, number]; projected: [number, number, number] } | null; riggedArms: Array<Record<string, unknown>>; knifeVisible: boolean; importedModel: ReturnType<typeof importedWeaponTelemetry> } {
    const model = this.models.get(this.active);
    const requiredDetails = weaponFamilyPresentation(this.active).requiredDetails;
    const sightName = this.active === 'carbine'
      ? 'optic-reticle'
      : this.active === 'smg'
        ? 'smg-aperture'
        : this.active === 'pistol'
          ? 'pistol-rear-sight'
          : 'ghost-ring';
    const sight = model?.getObjectByName(sightName);
    this.camera.updateMatrixWorld(true);
    sight?.updateWorldMatrix(true, false);
    const projected = sight?.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const arms = this.root.getObjectByName('first-person-arms');
    let armMeshCount = 0;
    if (arms?.visible) arms.traverse((child) => { if (child.visible && child instanceof THREE.Mesh) armMeshCount += 1; });
    if (this.meleeRig.visible) this.meleeRig.traverse((child) => {
      if (child.visible && child instanceof THREE.Mesh && (child.name.includes('forearm') || child.name.includes('glove'))) armMeshCount += 1;
    });
    const armBox = arms ? new THREE.Box3().setFromObject(arms) : null;
    const armCenter = armBox && !armBox.isEmpty() ? armBox.getCenter(new THREE.Vector3()) : null;
    const armSize = armBox && !armBox.isEmpty() ? armBox.getSize(new THREE.Vector3()) : null;
    const armProjected = armCenter?.clone().project(this.camera) ?? null;
    const importedModel = importedWeaponTelemetry(model);
    const detailsReady = importedModel
      ? importedModel.socketContractReady && importedModel.meshes > 0
        && (importedModel.sightForwardDot ?? -1) > 0.995
        && (importedModel.muzzleForwardDot ?? -1) > 0.85
      : requiredDetails.every((name) => model?.getObjectByName(name) !== undefined);
    return {
      weapon: this.active,
      heat: this.weaponHeat,
      shotsPresented: this.shotsPresented,
      activeCasings: this.casings.filter((casing) => casing.active).length,
      activeSmoke: this.smokes.reduce((count, smoke) => count + Number(smoke.active), 0),
      detailsReady,
      modelKind: importedModel ? 'licensed-imported' : 'original-authored',
      adsProgress: this.adsBlend,
      sightOffset: projected ? [projected.x, projected.y] : null,
      armsVisible: arms?.visible === true || this.meleeRig.visible,
      armMeshCount,
      armBounds: armCenter && armSize && armProjected ? {
        center: armCenter.toArray(),
        size: armSize.toArray(),
        projected: armProjected.toArray(),
      } : null,
      riggedArms: this.riggedArmDiagnostics,
      knifeVisible: this.meleeRig.visible,
      importedModel,
    };
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

  private orientRiggedBone(bone: THREE.Bone, child: THREE.Bone, targetWorld: THREE.Vector3): void {
    bone.updateWorldMatrix(true, true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const currentDirection = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const desiredDirection = targetWorld.clone().sub(origin).normalize();
    if (currentDirection.lengthSq() < 1e-6 || desiredDirection.lengthSq() < 1e-6) return;
    const currentWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    const desiredWorld = new THREE.Quaternion().setFromUnitVectors(currentDirection, desiredDirection).multiply(currentWorld);
    const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
    bone.updateWorldMatrix(false, true);
  }

  private solveRiggedArms(activeModel: THREE.Object3D | undefined, reloadPose: ReloadPose): void {
    if (!activeModel || this.riggedArmRigs.length === 0) return;
    for (const rig of this.riggedArmRigs) {
      rig.shoulder.quaternion.copy(rig.bindShoulder);
      rig.elbow.quaternion.copy(rig.bindElbow);
      rig.wrist.quaternion.copy(rig.bindWrist);
    }
    this.root.updateMatrixWorld(true);
    const cameraRotation = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const diagnostics: Array<Record<string, unknown>> = [];
    for (const rig of this.riggedArmRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      const socket = activeModel.getObjectByName(socketName);
      if (!socket) continue;
      const target = socket.getWorldPosition(new THREE.Vector3());
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = activeModel.getObjectByName('reload-socket-l');
        if (reloadSocket) target.lerp(reloadSocket.getWorldPosition(new THREE.Vector3()), reloadPose.handToReload);
      }
      const shoulderPosition = rig.shoulder.getWorldPosition(new THREE.Vector3());
      const elbowPosition = rig.elbow.getWorldPosition(new THREE.Vector3());
      const wristPosition = rig.wrist.getWorldPosition(new THREE.Vector3());
      const upperLength = shoulderPosition.distanceTo(elbowPosition);
      const lowerLength = elbowPosition.distanceTo(wristPosition);
      const bendHint = new THREE.Vector3(rig.side === 'left' ? -0.7 : 0.7, -1, 0.25).applyQuaternion(cameraRotation);
      const elbowTarget = solveTwoBoneElbow(shoulderPosition, target, upperLength, lowerLength, bendHint);
      this.orientRiggedBone(rig.shoulder, rig.elbow, elbowTarget);
      this.orientRiggedBone(rig.elbow, rig.wrist, target);
      const handDirection = new THREE.Vector3(
        rig.side === 'left' ? 0.55 : 0.12,
        -1,
        rig.side === 'left' ? -0.15 : 0.08,
      ).normalize().applyQuaternion(cameraRotation);
      this.orientRiggedBone(rig.wrist, rig.finger, rig.wrist.getWorldPosition(new THREE.Vector3()).add(handDirection));
      diagnostics.push({
        side: rig.side,
        upperLength,
        lowerLength,
        shoulder: rig.shoulder.getWorldPosition(new THREE.Vector3()).toArray(),
        elbow: rig.elbow.getWorldPosition(new THREE.Vector3()).toArray(),
        wrist: rig.wrist.getWorldPosition(new THREE.Vector3()).toArray(),
        target: target.toArray(),
        shoulderQuaternion: rig.shoulder.quaternion.toArray(),
        elbowQuaternion: rig.elbow.quaternion.toArray(),
      });
    }
    this.riggedArmDiagnostics = diagnostics;
  }

  update(pose: WeaponPose): WeaponActionEvent[] {
    const actionEvents: WeaponActionEvent[] = [];
    const smoothing = (rate: number) => 1 - Math.exp(-rate * pose.dt);
    this.weaponHeat = advanceWeaponHeat(this.weaponHeat, false, pose.dt, this.active);
    this.recoil = THREE.MathUtils.lerp(this.recoil, 0, smoothing(16));
    this.muzzleLight.intensity = THREE.MathUtils.lerp(this.muzzleLight.intensity, 0, smoothing(30));
    this.switchBlend = THREE.MathUtils.lerp(this.switchBlend, 1, smoothing(10));
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, smoothing(7));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, smoothing(7));
    this.adsBlend = THREE.MathUtils.lerp(this.adsBlend, pose.ads ? 1 : 0, smoothing(pose.ads ? 18 : 15));
    this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend, pose.sprinting ? 1 : 0, smoothing(13));
    this.muzzleFlash.visible = this.muzzleLight.intensity > 0.45;
    const arms = this.root.getObjectByName('first-person-arms');
    if (arms) arms.position.y = THREE.MathUtils.lerp(0.12, -0.08, this.adsBlend);

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
    if (activeModel) updateImportedWeapon(activeModel, pose.dt);
    const profile = weaponFamilyPresentation(this.active);
    const shotAge = performance.now() - this.shotStarted;
    const fireCycle = fireCycleAt(this.active, shotAge, this.weaponHeat);
    this.muzzleFlash.visible = fireCycle.flash > 0.015;
    if (this.muzzleFlash.visible) {
      this.muzzleFlash.scale.setScalar(profile.flashScale * (0.72 + fireCycle.flash * 0.38));
    }
    if (this.active === 'scattergun' && this.pendingScattergunShell && fireCycle.casingReady) {
      this.ejectCasing(true);
      this.pendingScattergunShell = false;
    } else if (this.active !== 'scattergun' && this.pendingCasing && fireCycle.casingReady) {
      this.ejectCasing(false);
      this.pendingCasing = false;
    }
    const bolt = activeModel?.getObjectByName('bolt-or-slide');
    if (bolt) {
      const restZ = Number(bolt.userData.restZ ?? 0);
      bolt.position.z = restZ + fireCycle.boltTravel * profile.actionTravel;
    }
    const pump = activeModel?.getObjectByName('pump');
    if (pump) {
      const restZ = Number(pump.userData.restZ ?? -0.48);
      pump.position.z = restZ + fireCycle.boltTravel * profile.actionTravel;
    }

    const bobWeight = pose.moving ? (pose.sprinting ? 1.22 : pose.ads ? 0.12 : pose.prone ? 0.12 : pose.crouched ? 0.32 : 0.56) : 0.05;
    const bobX = Math.cos(pose.phase * 0.5) * 0.017 * bobWeight;
    const bobY = Math.sin(pose.phase) * 0.019 * bobWeight;
    const breath = Math.sin(performance.now() * 0.0017) * (pose.ads ? 0.0015 : 0.0045);
    const adsX = this.adsBlend * profile.adsX;
    // Each original weapon family declares its physical sight axis. The 0.6
    // view scale is included in the profile so no HUD approximation is used.
    const adsY = this.adsBlend * profile.adsY;
    const adsZ = this.adsBlend * profile.adsZ;
    const sprintDrop = this.sprintBlend * -0.16;
    const stanceHipBlend = 1 - this.adsBlend;
    const crouchLift = pose.crouched ? 0.035 * stanceHipBlend : 0;
    const proneLift = pose.prone ? 0.018 * stanceHipBlend : 0;
    const switchDrop = (1 - this.switchBlend) * -0.34;

    let reloadRoll = 0;
    let reloadDrop = 0;
    const reloadProgress = pose.reloadProgress ?? 0;
    if (pose.reloadProgress !== null) {
      actionEvents.push(...reloadActionEvents(this.active, this.reloadLastProgress, reloadProgress));
      this.reloadLastProgress = reloadProgress;
      const lower = Math.sin(Math.PI * reloadProgress);
      const seatSnap = reloadProgress > 0.65 ? Math.sin((reloadProgress - 0.65) / 0.35 * Math.PI) : 0;
      reloadRoll = lower * 0.78 - seatSnap * 0.12;
      reloadDrop = lower * -0.22 + seatSnap * 0.035;
    } else if (this.reloadLastProgress > 0) {
      this.reloadLastProgress = 0;
    }
    const reloadPose = reloadPoseAt(this.active, reloadProgress);
    const magazineName = this.active === 'carbine'
      ? 'curved-magazine'
      : this.active === 'pistol'
        ? 'pistol-magazine'
        : 'straight-magazine';
    const magazine = activeModel?.getObjectByName(magazineName);
    if (magazine) {
      if (magazine.userData.restY === undefined) {
        magazine.userData.restX = magazine.position.x;
        magazine.userData.restY = magazine.position.y;
        magazine.userData.restZ = magazine.position.z;
        magazine.userData.restRotationZ = magazine.rotation.z;
      }
      magazine.position.x = Number(magazine.userData.restX) + reloadPose.magazineLateral;
      magazine.position.y = Number(magazine.userData.restY) - reloadPose.magazineDrop;
      magazine.position.z = Number(magazine.userData.restZ) + reloadPose.magazineForward;
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
    if (bolt && reloadPose.actionPull > 0) {
      const restZ = Number(bolt.userData.restZ ?? 0);
      bolt.position.z = restZ + reloadPose.actionPull * (this.active === 'smg' ? 0.1 : 0.12);
    }

    const meleeProgress = THREE.MathUtils.clamp((performance.now() - this.meleeStart) / 430, 0, 1);
    const meleeArc = this.meleeStart > 0 && meleeProgress < 1 ? Math.sin(meleeProgress * Math.PI) : 0;
    const meleeActive = this.meleeStart > 0 && meleeProgress < 1;
    this.meleeRig.visible = meleeActive;
    if (arms) arms.visible = !meleeActive;
    if (activeModel) activeModel.visible = !meleeActive;
    if (meleeActive) {
      const contact = THREE.MathUtils.smoothstep(meleeProgress, 0.12, 0.48);
      const recover = 1 - THREE.MathUtils.smoothstep(meleeProgress, 0.55, 1);
      this.meleeRig.position.set(0.28 - contact * 0.34, -0.12 + contact * 0.22, -0.2 - contact * 0.46);
      this.meleeRig.rotation.set(-contact * 0.25, -contact * 0.42, contact * 0.52 * recover);
    }
    const grenadeProgress = THREE.MathUtils.clamp((performance.now() - this.grenadeStart) / 620, 0, 1);
    const grenadeArc = this.grenadeStart > 0 && grenadeProgress < 1 ? Math.sin(grenadeProgress * Math.PI) : 0;

    const targetPosition = new THREE.Vector3(
      0.36 + adsX + bobX + this.swayX - pose.lateralSpeed * 0.012 - meleeArc * 0.24 + grenadeArc * 0.18,
      -0.38 + adsY + bobY + breath + sprintDrop + crouchLift + proneLift + switchDrop + reloadDrop - this.recoil * 0.08 - pose.landingImpulse * 0.075,
      -0.78 + adsZ + this.recoil * profile.recoilTranslation - meleeArc * 0.32 + grenadeArc * 0.24,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.recoil * profile.recoilRotation - this.swayY - grenadeArc * 0.42, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, -this.swayX * 2 - this.sprintBlend * 0.38 - meleeArc * 0.65, smoothing(13));
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadRoll - this.sprintBlend * 0.22 - pose.lateralSpeed * (pose.prone ? 0.01 : 0.025) + meleeArc * 0.42, smoothing(13));
    if (arms) this.solveArms(arms, activeModel, reloadPose);
    this.solveRiggedArms(activeModel, reloadPose);
    return actionEvents;
  }
}
