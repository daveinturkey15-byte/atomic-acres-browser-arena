import * as THREE from 'three';
import { presentationRandom } from './runtime-random';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWeaponModel, optimizeAttachedWeapon, roundedBox, texturedMaterial } from './art-kit';
import type { FirstPersonArmChain } from './operator-model';
import { solveTwoBoneElbow } from './ik';
import { reloadActionEvents, reloadPoseAt, viewmodelReloadStageAt, type ReloadPose, type WeaponActionEvent } from './weapon-actions';
import { advanceAdsBlend, advanceWeaponHeat, fireCycleAt } from './weapon-presentation-state';
import { weaponFamilyPresentation } from './weapon-family-presentation';
import { fireImportedWeapon, importedWeaponTelemetry, reloadImportedWeapon, updateImportedWeapon } from './weapon-model';
import { WEAPONS } from './gameplay';
import type { WeaponId } from './protocol';
import { characterActionContract, measureCameraFraming, resolveSocketWorld, type CharacterActionContract } from './character-presentation-contract';

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

type ViewCasing = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; frames: number; active: boolean };
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
  hand: THREE.Group;
  upperLength: number;
  lowerLength: number;
};

type HandRotationSet = { left: [number, number, number]; right: [number, number, number] };

const WEAPON_HAND_ROTATIONS: Record<WeaponId, HandRotationSet> = {
  carbine: { left: [-0.32, 0.12, -0.22], right: [-0.22, -0.06, 0.26] },
  smg: { left: [-0.36, 0.14, -0.22], right: [-0.18, -0.02, 0.16] },
  lmg: { left: [-0.31, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  scattergun: { left: [-0.26, 0.08, -0.16], right: [-0.14, -0.04, 0.12] },
  sniper: { left: [-0.3, 0.1, -0.2], right: [-0.22, -0.06, 0.24] },
  pistol: { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
  'machine-pistol': { left: [-0.5, 0.2, -0.32], right: [-0.24, 0.02, 0.1] },
};

const VIEWMODEL_GRIP_OFFSETS: Record<WeaponId, HandRotationSet> = {
  carbine: { left: [-0.06, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  smg: { left: [-0.055, -0.02, 0.02], right: [0.08, -0.025, 0.015] },
  lmg: { left: [-0.06, -0.025, 0.02], right: [0.08, -0.025, 0.015] },
  scattergun: { left: [-0.055, -0.025, 0.015], right: [0.08, -0.025, 0.015] },
  sniper: { left: [-0.055, -0.02, 0.015], right: [0.08, -0.025, 0.015] },
  pistol: { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
  'machine-pistol': { left: [0.035, -0.02, 0.04], right: [0.07, -0.025, 0.015] },
};

const RELOAD_HAND_ROTATIONS: Record<WeaponId, [number, number, number]> = {
  carbine: [-0.72, 0.32, -0.5],
  smg: [-0.82, 0.38, -0.58],
  lmg: [-0.78, 0.35, -0.54],
  scattergun: [-0.58, 0.18, -0.42],
  sniper: [-0.76, 0.34, -0.52],
  pistol: [-0.92, 0.42, -0.68],
  'machine-pistol': [-0.92, 0.42, -0.68],
};

const MELEE_PRESENTATION_MS = 620;

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
  private meleePresentationFrames = 0;
  private debugMeleeProgress: number | null = null;
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
  private debugFireAgeMs: number | null = null;
  private presentedFireCycle = fireCycleAt('carbine', 10_000, 0);
  private casingCursor = 0;
  private smokeCursor = 0;
  private pendingScattergunShell = false;
  private adsBlend = 0;
  private sprintBlend = 0;
  private weaponHeat = 0;
  private shotsPresented = 0;
  private actionContract: CharacterActionContract = characterActionContract({
    weapon: 'carbine', aimBlend: 0, sprintBlend: 0, reloadProgress: null, meleeProgress: null,
  });

  constructor(private readonly camera: THREE.Camera, private readonly flattenMaterials = false) {
    this.root.name = 'original-weapon-view';
    this.root.position.set(0.28, -0.34, -0.88);
    this.root.scale.setScalar(0.64);
    camera.add(this.root);
    const viewmodelFill = new THREE.PointLight(0xe6f2ef, flattenMaterials ? 0 : 1.05, 2.6, 2);
    viewmodelFill.name = 'first-person-viewmodel-fill';
    viewmodelFill.position.set(-0.48, 0.72, 0.4);
    viewmodelFill.castShadow = false;
    viewmodelFill.userData.presentationOnly = true;
    this.root.add(viewmodelFill);

    const fabricMaterial = (color: number, roughness: number, repeatX: number, repeatY: number, normalScale: number): THREE.MeshStandardMaterial => {
      if (typeof document === 'undefined') return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      return texturedMaterial('./assets/original/textures/fabric-weave.png', {
        color, roughness, repeatX, repeatY,
        normalPath: './assets/original/textures/fabric-weave-normal.png',
        roughnessPath: './assets/original/textures/fabric-weave-roughness.png', normalScale,
      });
    };

    const sleeve: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x4a6870 })
      : fabricMaterial(0x78979d, 0.96, 5, 2, 0.32);
    const sleeveTrim: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x9c8c62 })
      : fabricMaterial(0xa99a70, 0.9, 6, 3, 0.24);
    const glove: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x514b40 })
      : fabricMaterial(0x625b4c, 0.98, 7, 4, 0.38);
    const glovePalm: THREE.Material = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x766d5c })
      : fabricMaterial(0x8a806c, 0.91, 8, 5, 0.3);
    // The licensed full-body derivative remains available for future authored
    // grip poses, but its current bind/IK calibration fails the viewmodel
    // acceptance gate (detached hands and sleeves outside the viewport). Keep
    // the readable original two-bone arms as the public presentation rather
    // than shipping a technically rigged but visibly broken pose.
    const arms = new THREE.Group(); arms.name = 'first-person-arms';
    const anatomicalLimb = (
      name: string,
      length: number,
      profile: Array<[position: number, radius: number]>,
    ): THREE.Mesh => {
      const points = profile.map(([position, radius]) => new THREE.Vector2(radius, position * length - length / 2));
      const geometry = new THREE.LatheGeometry(points, flattenMaterials ? 8 : 12);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, sleeve);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.z = -length / 2;
      mesh.castShadow = true;
      return mesh;
    };
    const mergeArmAssembly = (parent: THREE.Object3D, sources: THREE.Mesh[], name: string): THREE.Mesh => {
      const geometries = sources.map((source) => {
        source.updateMatrix();
        const clone = source.geometry.clone();
        const geometry = clone.index ? clone.toNonIndexed() : clone;
        if (geometry !== clone) clone.dispose();
        geometry.applyMatrix4(source.matrix);
        for (const attribute of Object.keys(geometry.attributes)) {
          if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
        }
        const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
        const color = 'color' in sourceMaterial && sourceMaterial.color instanceof THREE.Color
          ? sourceMaterial.color
          : new THREE.Color(0xffffff);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let index = 0; index < colors.length; index += 3) {
          colors[index] = color.r;
          colors[index + 1] = color.g;
          colors[index + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
      });
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((item) => item.dispose());
      if (!geometry) throw new Error(`Unable to merge ${name}`);
      const material = this.flattenMaterials
        ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 1 })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, transparent: true, opacity: 1 });
      const merged = new THREE.Mesh(geometry, material);
      merged.name = name;
      sources.forEach((source) => parent.remove(source));
      parent.add(merged);
      return merged;
    };
    const makeArm = (side: 'left' | 'right') => {
      const sign = side === 'left' ? -1 : 1;
      // Preserve the total reach while restoring human upper/forearm proportion.
      // Profile bulges create a deltoid/biceps and brachioradialis silhouette
      // without adding meshes or draw calls.
      const upperLength = 0.66;
      const lowerLength = 0.63;
      const shoulder = new THREE.Group(); shoulder.name = `${side}-shoulder-joint`;
      shoulder.position.set(side === 'right' ? 0.48 : -0.36, side === 'right' ? -0.08 : -0.04, side === 'right' ? 0.58 : 0.52);
      const radialSegments = flattenMaterials ? 8 : 12;
      const upper = anatomicalLimb(`${side}-upper-arm`, upperLength, [
        [0, 0.1], [0.26, 0.112], [0.63, 0.091], [1, 0.071],
      ]);
      upper.scale.set(1.04, 0.9, 1);
      shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.name = `${side}-elbow-joint`; elbow.position.z = -upperLength; shoulder.add(elbow);
      const forearm = anatomicalLimb(`${side}-forearm`, lowerLength, [
        [0, 0.082], [0.28, 0.097], [0.68, 0.073], [1, 0.055],
      ]);
      forearm.scale.set(1, 0.84, 1);
      elbow.add(forearm);
      const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.086, radialSegments, 7), sleeve);
      elbowCap.name = `${side}-elbow-cap`;
      elbowCap.scale.set(1, 0.92, 1.04);
      elbow.add(elbowCap);
      const wrist = new THREE.Group();
      wrist.name = `${side}-wrist-joint`;
      wrist.position.z = -lowerLength;
      wrist.rotation.set(-0.12, 0, sign * 0.08);
      elbow.add(wrist);
      // Reduced profiles retain every articulated glove part while trimming only
      // bevel subdivision; this preserves anatomy and rigging without spending
      // the full Quality-profile viewmodel triangle budget.
      const cuff = roundedBox(`${side}-glove-cuff`, [0.21, 0.15, 0.14], glove, 0.038, flattenMaterials ? 1 : 3);
      cuff.position.z = 0.045;
      wrist.add(cuff);
      const cuffAccent = roundedBox(`${side}-cuff-accent`, [0.178, 0.15, 0.032], sleeveTrim, 0.009, 2);
      cuffAccent.position.z = 0.098;
      wrist.add(cuffAccent);
      const wristGuard = roundedBox(`${side}-wrist-guard`, [0.19, 0.075, 0.12], glove, 0.022, flattenMaterials ? 1 : 3);
      wristGuard.position.set(0, -0.045, 0.018);
      wrist.add(wristGuard);
      const hand = roundedBox(`${side}-palm`, [0.2, 0.13, 0.21], glovePalm, 0.048, flattenMaterials ? 2 : 4);
      hand.position.set(sign * -0.014, -0.002, -0.035);
      wrist.add(hand);
      const palmHeel = roundedBox(`${side}-palm-heel`, [0.142, 0.032, 0.095], glove, 0.014, 2);
      palmHeel.position.set(sign * -0.014, 0.058, -0.012);
      palmHeel.rotation.x = -0.08;
      wrist.add(palmHeel);
      const knucklePad = roundedBox(`${side}-knuckle-pad`, [0.158, 0.038, 0.09], glove, 0.016, flattenMaterials ? 1 : 3);
      knucklePad.position.set(sign * -0.014, -0.062, -0.085);
      wrist.add(knucklePad);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.088, 5, flattenMaterials ? 6 : 9), glove);
      thumb.name = `${side}-thumb`;
      thumb.position.set(sign * -0.094, -0.018, -0.052);
      thumb.rotation.set(-Math.PI / 2 - 0.38, sign * 0.12, sign * 0.54);
      wrist.add(thumb);
      const fingers: THREE.Mesh[] = [];
      for (let finger = 0; finger < 4; finger += 1) {
        const proximal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0225, 0.054 - finger * 0.002, 4, flattenMaterials ? 6 : 9), glove);
        proximal.name = `${side}-finger-${finger}-proximal`;
        proximal.position.set(sign * (0.055 - finger * 0.037), -0.062, -0.121 + finger * 0.004);
        proximal.rotation.set(Math.PI / 2 + 0.28 + finger * 0.025, 0, sign * (finger - 1.5) * 0.045);
        const distal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0195, 0.034 - finger * 0.0015, 4, flattenMaterials ? 6 : 9), glove);
        distal.name = `${side}-finger-${finger}-distal`;
        distal.position.set(sign * (0.055 - finger * 0.037), -0.047, -0.176 + finger * 0.004);
        distal.rotation.set(Math.PI / 2 + 0.64 + finger * 0.03, 0, sign * (finger - 1.5) * 0.052);
        wrist.add(proximal, distal);
        fingers.push(proximal, distal);
      }
      // Preserve all eight authored phalange shapes while collapsing them into
      // one material-compatible draw per hand. Geometry is transformed into
      // glove-local space before merging, so the silhouette stays unchanged.
      const fingerGeometries = fingers.map((fingerMesh) => {
        fingerMesh.updateMatrix();
        const geometry = fingerMesh.geometry.clone();
        geometry.applyMatrix4(fingerMesh.matrix);
        return geometry;
      });
      const mergedFingerGeometry = mergeGeometries(fingerGeometries, false);
      fingerGeometries.forEach((geometry) => geometry.dispose());
      if (mergedFingerGeometry) {
        for (const fingerMesh of fingers) {
          wrist.remove(fingerMesh);
          fingerMesh.geometry.dispose();
        }
        const fingerCluster = new THREE.Mesh(mergedFingerGeometry, glove);
        fingerCluster.name = `${side}-finger-articulated-cluster`;
        fingerCluster.castShadow = true;
        fingerCluster.receiveShadow = true;
        fingerCluster.userData.segmentCount = 8;
        fingerCluster.userData.anatomy = 'four articulated two-segment fingers';
        wrist.add(fingerCluster);
        fingers.splice(0, fingers.length, fingerCluster);
      }
      const sleeveBand = roundedBox(`${side}-sleeve-band`, [0.166, 0.166, 0.048], sleeveTrim, 0.014, 2);
      sleeveBand.position.z = -upperLength * 0.72;
      shoulder.add(sleeveBand);
      const sleevePatch = roundedBox(`${side}-sleeve-patch`, [0.115, 0.035, 0.15], sleeveTrim, 0.012, 2);
      sleevePatch.position.set(sign * 0.068, -0.07, -upperLength * 0.44);
      sleevePatch.rotation.z = sign * 0.09;
      shoulder.add(sleevePatch);
      if (this.flattenMaterials) {
        mergeArmAssembly(shoulder, [upper, sleeveBand, sleevePatch], `${side}-upper-arm`);
        mergeArmAssembly(elbow, [forearm, elbowCap], `${side}-forearm`);
      } else {
        upper.userData.anatomicalSleeve = true;
        forearm.userData.anatomicalSleeve = true;
      }
      const wristExtras: THREE.Mesh[] = [];
      if (side === 'left') {
        const displayHousing = roundedBox('left-wrist-display-housing', [0.13, 0.045, 0.1], glove, 0.012, 2);
        displayHousing.position.set(-0.015, -0.09, 0.035);
        const display = roundedBox(
          'left-wrist-display', [0.094, 0.01, 0.064],
          flattenMaterials
            ? new THREE.MeshBasicMaterial({ color: 0x6ef5e8 })
            : new THREE.MeshStandardMaterial({ color: 0x74f4e7, emissive: 0x167e77, emissiveIntensity: 0.82, roughness: 0.2 }),
          0.006, 2,
        );
        display.position.set(-0.015, -0.116, 0.03);
        display.rotation.x = -0.05;
        wrist.add(displayHousing, display);
        wristExtras.push(displayHousing, display);
      }
      const gloveSources = [cuff, cuffAccent, wristGuard, hand, palmHeel, knucklePad, thumb, ...fingers, ...wristExtras];
      const silhouetteOffset = new THREE.Vector3(sign * 0.02, -0.012, 0);
      gloveSources.forEach((part) => part.position.add(silhouetteOffset));
      const gloveAssembly = this.flattenMaterials
        ? mergeArmAssembly(wrist, gloveSources, `${side}-glove`)
        : wrist;
      gloveAssembly.userData.style = 'atomic-tactical-v3-detailed';
      gloveAssembly.userData.cuffConnected = true;
      gloveAssembly.userData.sourcePartCount = gloveSources.length
        + Math.max(0, (fingers[0]?.userData.segmentCount ?? 1) - 1);

      this.armRigs.push({ side, shoulder, elbow, hand: wrist, upperLength, lowerLength });
      return shoulder;
    };
    arms.add(makeArm('right'), makeArm('left'));
    arms.scale.setScalar(this.flattenMaterials ? 0.76 : 0.74);
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
    const bladeDetailMaterial = flattenMaterials
      ? new THREE.MeshBasicMaterial({ color: 0x59696d })
      : new THREE.MeshStandardMaterial({ color: 0x56666a, roughness: 0.34, metalness: 0.74 });
    const bladeFuller = roundedBox('field-knife-fuller', [0.035, 0.64, 0.018], bladeDetailMaterial, 0.008, 2);
    bladeFuller.position.set(0, 0.43, 0.022);
    const pommel = roundedBox('field-knife-pommel', [0.18, 0.1, 0.16], sleeveTrim, 0.028, 3);
    pommel.position.set(0, -0.49, 0);
    this.meleeKnife.add(knifeHandle, knifeGuard, blade, bladeFuller, pommel);
    for (let ridge = 0; ridge < 6; ridge += 1) {
      const wrap = roundedBox(`field-knife-grip-ridge-${ridge}`, [0.164, 0.026, 0.152], sleeveTrim, 0.01, 2);
      wrap.position.set(0, -0.075 - ridge * 0.062, 0);
      wrap.rotation.z = ridge % 2 === 0 ? 0.08 : -0.08;
      this.meleeKnife.add(wrap);
    }
    this.meleeRig.name = 'field-knife-arm-rig';
    const meleeForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.82, 8, 16), sleeve);
    meleeForearm.name = 'field-knife-forearm';
    meleeForearm.position.set(0.56, -0.58, 0.12);
    meleeForearm.rotation.z = 0.55;
    const meleeUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.17, 1.4, 14, 1, false), sleeve);
    meleeUpperArm.name = 'field-knife-upper-arm';
    meleeUpperArm.position.set(0.82, -1.55, 0.14);
    meleeUpperArm.rotation.z = 0.08;
    const meleeElbow = roundedBox('field-knife-elbow-guard', [0.25, 0.2, 0.18], glove, 0.055, 3);
    meleeElbow.position.set(0.73, -0.92, 0.13);
    meleeElbow.rotation.z = 0.52;
    const meleeCuff = roundedBox('knife-glove-cuff', [0.21, 0.18, 0.15], sleeveTrim, 0.04, 2);
    meleeCuff.position.set(0.24, -0.13, -0.04);
    meleeCuff.rotation.z = 0.3;
    const meleeHand = roundedBox('knife-glove', [0.19, 0.21, 0.24], glove, 0.055, 3);
    meleeHand.position.set(0.19, -0.02, -0.14);
    meleeHand.rotation.set(-0.18, 0.08, -0.42);
    this.meleeKnife.position.set(0.19, 0.1, -0.2);
    this.meleeKnife.rotation.set(0.04, -0.06, -0.48);
    this.meleeKnife.visible = true;
    this.meleeRig.add(meleeUpperArm, meleeElbow, meleeForearm, meleeCuff, meleeHand, this.meleeKnife);
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
    const coreGeometry = new THREE.ConeGeometry(0.052, 0.5, 7, 1, true);
    coreGeometry.rotateX(-Math.PI / 2);
    coreGeometry.translate(0, 0, -0.25);
    const crownGeometry = new THREE.CircleGeometry(0.052, 10);
    crownGeometry.translate(0, 0, -0.006);
    const flareShape = new THREE.Shape();
    const flarePoints = 16;
    for (let index = 0; index < flarePoints; index += 1) {
      const angle = (index / flarePoints) * Math.PI * 2 + Math.PI / 16;
      const spoke = index % 2 === 0;
      const radius = spoke ? (index % 4 === 0 ? 0.2 : 0.14) : 0.044;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) flareShape.moveTo(x, y);
      else flareShape.lineTo(x, y);
    }
    flareShape.closePath();
    const flareGeometry = new THREE.ShapeGeometry(flareShape);
    const burstGeometry = mergeGeometries([coreGeometry, crownGeometry, flareGeometry], false);
    coreGeometry.dispose();
    crownGeometry.dispose();
    flareGeometry.dispose();
    if (!burstGeometry) throw new Error('Unable to merge muzzle flash burst');
    const burst = new THREE.Mesh(burstGeometry, flashMaterial);
    burst.name = 'muzzle-flash-burst';
    this.muzzleFlash.add(burst);
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
      this.casings.push({ mesh, velocity: new THREE.Vector3(), life: 0, frames: 0, active: false });
    }
  }

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const ids = Object.keys(WEAPONS) as WeaponId[];
    ids.forEach((id, index) => {
      // Camera-space weapons use the project-authored high-detail model. The
      // imported low-poly assets remain suitable for distant world operators.
      // The low-poly imported pickups remain valid world assets, but first
      // person needs the authored PBR receiver, functional action parts and
      // calibrated sockets rather than a camera-close pickup mesh.
      const model = buildWeaponModel(id, this.flattenMaterials, false);
      model.userData.firstPersonSource = 'authored-pbr-v6-seven-unique-finishes';
      const firstPersonHidden: Record<WeaponId, Set<string>> = {
        carbine: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        smg: new Set(['smg-stock-rod', 'wire-stock-pad']),
        lmg: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        scattergun: new Set(['stock', 'stock-cheek-panel']),
        sniper: new Set(['stock-shoulder-pad', 'stock-cheek-rest', 'stock-support-rod']),
        pistol: new Set(),
        'machine-pistol': new Set(),
      };
      model.traverse((node) => {
        if (firstPersonHidden[id].has(node.name)) node.visible = false;
      });
      if (id === 'carbine') {
        const reticle = model.getObjectByName('optic-reticle');
        if (reticle instanceof THREE.Mesh && reticle.material instanceof THREE.MeshBasicMaterial) {
          reticle.material = reticle.material.clone();
          reticle.material.depthTest = false;
          reticle.material.depthWrite = false;
          reticle.renderOrder = 1_000;
        }
      }
      // Preserve the authored PBR materials, normal/roughness maps and small
      // receiver parts in the quality viewmodel. Reduced profiles retain the
      // bounded merged path.
      if (this.flattenMaterials) optimizeAttachedWeapon(model, 'palette-basic');
      model.visible = false;
      this.models.set(id, model);
      this.root.add(model);
      onProgress?.(index + 1, ids.length);
    });
    this.setWeapon(this.active, true);
  }

  isReady(): boolean {
    return this.models.size === Object.keys(WEAPONS).length;
  }

  setWeapon(id: WeaponId, immediate = false): void {
    this.active = id;
    this.switchBlend = immediate ? 1 : 0;
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
    casing.mesh.rotation.set(presentationRandom() * 0.4, 0, Math.PI / 2);
    casing.mesh.visible = true;
    casing.velocity.set(
      shell ? 0.72 : 0.95 + presentationRandom() * 0.25,
      shell ? 0.55 : 0.75 + presentationRandom() * 0.2,
      shell ? 0.16 : 0.1,
    );
    casing.life = shell ? 0.62 : 0.42;
    casing.frames = 0;
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
    this.muzzleFlash.rotation.z = (this.shotsPresented * 2.399963229728653) % Math.PI;

    const muzzleSocket = this.models.get(this.active)?.getObjectByName('muzzle-socket');
    const smokeCount = Math.min(this.smokes.length, profile.smokeBase + (this.weaponHeat > 0.56 ? 1 : 0));
    const cycle = fireCycleAt(this.active, 0, this.weaponHeat);
    for (let index = 0; index < smokeCount; index += 1) {
      const slot = this.smokeCursor++ % this.smokes.length;
      const smoke = this.smokes[slot];
      const offset = slot * 3;
      const muzzle = muzzleSocket?.position ?? new THREE.Vector3(0, 0.08, -1.15);
      this.smokePositions[offset] = muzzle.x + (presentationRandom() - 0.5) * 0.025;
      this.smokePositions[offset + 1] = muzzle.y + (presentationRandom() - 0.5) * 0.02;
      this.smokePositions[offset + 2] = muzzle.z - 0.05 - index * 0.035;
      smoke.velocity.set(
        (presentationRandom() - 0.5) * 0.055 * cycle.smokeScale,
        (0.1 + presentationRandom() * 0.06) * cycle.smokeScale,
        (-0.11 - presentationRandom() * 0.08) * cycle.smokeScale,
      );
      smoke.maxLife = (this.active === 'scattergun' ? 0.38 : 0.2 + this.weaponHeat * 0.12);
      smoke.life = smoke.maxLife;
      smoke.active = true;
      this.smokeColors[offset] = this.smokeColors[offset + 1] = this.smokeColors[offset + 2] = 0.62;
    }
    this.smokePoints.visible = true;
    (this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    // Rifle and pistol actions eject with the accepted shot. Doing this at the
    // action boundary keeps the pooled casing visible even when a software-
    // rendered frame takes longer than the authored bolt marker. Scattergun
    // shells remain tied to the delayed pump cycle below.
    if (this.active === 'scattergun') this.pendingScattergunShell = true;
    else this.ejectCasing(false);
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
    this.meleePresentationFrames = 0;
    this.meleeRig.visible = true;
    const arms = this.root.getObjectByName('first-person-arms');
    if (arms) arms.visible = false;
    const activeModel = this.models.get(this.active);
    if (activeModel) activeModel.visible = false;
    this.actionContract = characterActionContract({
      weapon: this.active,
      aimBlend: this.adsBlend,
      sprintBlend: this.sprintBlend,
      reloadProgress: null,
      meleeProgress: 0,
    });
  }

  setMeleeCaptureProgress(progress: number | null): void {
    this.debugMeleeProgress = progress === null ? null : THREE.MathUtils.clamp(progress, 0, 0.999);
  }

  setFireCaptureAgeMs(ageMs: number | null): void {
    this.debugFireAgeMs = ageMs === null ? null : THREE.MathUtils.clamp(ageMs, 0, 1_000);
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

  private sightReference(model: THREE.Object3D | undefined): THREE.Object3D | undefined {
    const sightName = this.active === 'carbine'
      ? 'optic-reticle'
      : this.active === 'sniper'
        ? 'sniper-scope'
      : this.active === 'lmg'
        ? 'rear-sight-socket'
      : this.active === 'smg'
        ? 'smg-aperture'
        : this.active === 'pistol' || this.active === 'machine-pistol'
          ? 'pistol-rear-sight'
          : 'ghost-ring';
    return model?.getObjectByName(sightName);
  }

  private centerSightReference(model: THREE.Object3D | undefined): void {
    const lock = THREE.MathUtils.smoothstep(this.adsBlend, 0.72, 0.98);
    if (lock <= 0) return;
    const sight = this.sightReference(model);
    if (!sight) return;
    this.camera.updateMatrixWorld(true);
    this.root.updateWorldMatrix(true, true);
    const cameraLocal = this.camera.worldToLocal(sight.getWorldPosition(new THREE.Vector3()));
    this.root.position.x -= cameraLocal.x * lock;
    this.root.position.y -= cameraLocal.y * lock;
    this.root.updateWorldMatrix(true, true);
  }

  presentationState() {
    const model = this.models.get(this.active);
    const requiredDetails = weaponFamilyPresentation(this.active).requiredDetails;
    const sight = this.sightReference(model);
    this.camera.updateMatrixWorld(true);
    sight?.updateWorldMatrix(true, false);
    const projected = sight?.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const arms = this.root.getObjectByName('first-person-arms');
    let modelVisibleMeshCount = 0;
    model?.traverse((child) => { if (child.visible && child instanceof THREE.Mesh) modelVisibleMeshCount += 1; });
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
      fireCycle: this.presentedFireCycle,
      muzzleFlashMeshCount: (() => {
        let count = 0;
        this.muzzleFlash.traverse((node) => { if (node instanceof THREE.Mesh) count += 1; });
        return count;
      })(),
      activeCasings: this.casings.filter((casing) => casing.active).length,
      activeSmoke: this.smokes.reduce((count, smoke) => count + Number(smoke.active), 0),
      detailsReady,
      modelKind: importedModel ? 'licensed-imported' : 'original-authored',
      firstPersonSource: model?.userData.firstPersonSource ?? 'unknown',
      weaponModelId: model?.userData.weaponModelId ?? null,
      weaponFinishId: model?.userData.weaponFinishId ?? null,
      modelVisibleMeshCount,
      attachedWeaponBatchStats: model?.userData.attachedWeaponBatchStats ?? null,
      adsProgress: this.adsBlend,
      sightOffset: projected ? [projected.x, projected.y] : null,
      armsVisible: arms?.visible === true || this.meleeRig.visible,
      armMeshCount,
      armBounds: armCenter && armSize && armProjected ? {
        center: armCenter.toArray(),
        size: armSize.toArray(),
        projected: armProjected.toArray(),
      } : null,
      armFraming: arms?.visible
        ? measureCameraFraming(arms, this.camera, (mesh) => mesh.name.endsWith('-glove'))
        : null,
      weaponFraming: model?.visible ? measureCameraFraming(model, this.camera) : null,
      actionContract: this.actionContract,
      riggedArms: this.riggedArmDiagnostics,
      knifeVisible: this.meleeRig.visible,
      importedModel,
    };
  }

  private solveArms(arms: THREE.Object3D, activeModel: THREE.Object3D | undefined, reloadPose: ReloadPose): void {
    if (!activeModel) return;
    this.root.updateMatrixWorld(true);
    const diagnostics: Array<Record<string, unknown>> = [];
    for (const rig of this.armRigs) {
      const socketName = rig.side === 'right' ? 'grip-socket-r' : 'support-socket-l';
      const socket = activeModel.getObjectByName(socketName);
      if (!socket) continue;
      const socketTargetWorld = resolveSocketWorld(socket);
      const targetWorld = socketTargetWorld.clone();
      const gripOffset = new THREE.Vector3(...VIEWMODEL_GRIP_OFFSETS[this.active][rig.side])
        .multiplyScalar(rig.side === 'left' ? 1 - reloadPose.handToReload : 1)
        .multiplyScalar(1 - this.adsBlend * 0.9);
      if (gripOffset.lengthSq() > 0) {
        const modelOrigin = activeModel.localToWorld(new THREE.Vector3());
        const modelOffset = activeModel.localToWorld(gripOffset).sub(modelOrigin);
        targetWorld.add(modelOffset);
      }
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadSocket = activeModel.getObjectByName('reload-socket-l');
        if (reloadSocket) targetWorld.lerp(resolveSocketWorld(reloadSocket), reloadPose.handToReload);
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
      const gripRotation = WEAPON_HAND_ROTATIONS[this.active][rig.side];
      const gripQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...gripRotation, 'XYZ'));
      if (rig.side === 'left' && reloadPose.handToReload > 0) {
        const reloadQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...RELOAD_HAND_ROTATIONS[this.active], 'XYZ'));
        rig.hand.quaternion.copy(gripQuaternion).slerp(reloadQuaternion, reloadPose.handToReload);
      } else {
        rig.hand.quaternion.copy(gripQuaternion);
      }
      rig.elbow.updateWorldMatrix(true, true);
      const handWorld = rig.hand.getWorldPosition(new THREE.Vector3());
      diagnostics.push({
        side: rig.side,
        socket: socketName,
        socketParent: socket.parent?.name ?? null,
        socketTarget: socketTargetWorld.toArray(),
        target: targetWorld.toArray(),
        hand: handWorld.toArray(),
        contactError: handWorld.distanceTo(targetWorld),
        reachRatio: rig.shoulder.position.distanceTo(targetInArms) / (rig.upperLength + rig.lowerLength),
        bindOffsetsPreserved: rig.elbow.position.equals(new THREE.Vector3(0, 0, -rig.upperLength)),
        finite: [...targetWorld.toArray(), ...handWorld.toArray()].every(Number.isFinite),
      });
    }
    this.riggedArmDiagnostics = diagnostics;
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
    this.adsBlend = advanceAdsBlend(this.adsBlend, pose.ads, pose.dt, this.active);
    this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend, pose.sprinting ? 1 : 0, smoothing(13));
    this.muzzleFlash.visible = this.muzzleLight.intensity > 0.45;
    const arms = this.root.getObjectByName('first-person-arms');
    const armAdsOpacity = 1 - THREE.MathUtils.smoothstep(this.adsBlend, 0.72, 0.98);
    if (arms) {
      arms.position.y = THREE.MathUtils.lerp(-0.075, -0.19, this.adsBlend);
      arms.scale.setScalar(THREE.MathUtils.lerp(1, 0.82, this.adsBlend));
      arms.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const material = node.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        material.opacity = armAdsOpacity;
        material.depthWrite = armAdsOpacity > 0.45;
      });
    }

    for (const casing of this.casings) {
      if (!casing.active) continue;
      casing.frames += 1;
      const casingDt = Math.min(pose.dt, 1 / 20);
      casing.life -= casingDt;
      casing.velocity.y -= 4.5 * casingDt;
      casing.mesh.position.addScaledVector(casing.velocity, casingDt);
      casing.mesh.rotation.x += casingDt * 18;
      casing.mesh.rotation.z += casingDt * 11;
      if (casing.life <= 0 && casing.frames >= 3) {
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
    const hipYaw = this.active === 'carbine'
      ? 0.18
      : this.active === 'scattergun'
        ? 0.16
        : this.active === 'smg'
          ? 0.14
          : 0.1;
    const shotAge = this.debugFireAgeMs ?? performance.now() - this.shotStarted;
    const fireCycle = fireCycleAt(this.active, shotAge, this.weaponHeat);
    this.presentedFireCycle = fireCycle;
    const presentedRecoil = this.debugFireAgeMs === null
      ? this.recoil
      : Math.max(this.recoil, fireCycle.flash * 0.35 + fireCycle.boltTravel * 0.65);
    const presentationKick = Math.max(presentedRecoil, fireCycle.kick * 0.9);
    const shotRoll = fireCycle.kick * (this.shotsPresented % 2 === 0 ? -0.018 : 0.018);
    this.muzzleFlash.visible = fireCycle.flash > 0.015;
    if (this.muzzleFlash.visible) {
      this.muzzleFlash.scale.setScalar(profile.flashScale * (0.78 + fireCycle.flash * 0.42 + fireCycle.kick * 0.12));
    }
    if (this.active === 'scattergun' && this.pendingScattergunShell && fireCycle.casingReady) {
      this.ejectCasing(true);
      this.pendingScattergunShell = false;
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

    const reloadProgress = pose.reloadProgress ?? 0;
    if (pose.reloadProgress !== null) {
      actionEvents.push(...reloadActionEvents(this.active, this.reloadLastProgress, reloadProgress));
      this.reloadLastProgress = reloadProgress;
    } else if (this.reloadLastProgress > 0) {
      this.reloadLastProgress = 0;
    }
    const reloadStage = viewmodelReloadStageAt(this.active, reloadProgress);
    const reloadPose = reloadPoseAt(this.active, reloadProgress);
    const magazineName = this.active === 'carbine'
      ? 'curved-magazine'
      : this.active === 'lmg'
        ? 'lmg-box-magazine'
      : this.active === 'pistol' || this.active === 'machine-pistol'
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

    if (this.meleeStart > 0) this.meleePresentationFrames += 1;
    const timedMeleeProgress = THREE.MathUtils.clamp((performance.now() - this.meleeStart) / MELEE_PRESENTATION_MS, 0, 1);
    // A software-rendered frame may take longer than the authored 620 ms arc.
    // Preserve at least three presented frames so a valid knife action cannot
    // disappear entirely while keeping authoritative melee timing unchanged.
    const presentedMeleeProgress = this.meleeStart > 0 && this.meleePresentationFrames <= 3
      ? Math.min(timedMeleeProgress, 0.98)
      : timedMeleeProgress;
    const meleeProgress = this.debugMeleeProgress ?? presentedMeleeProgress;
    const meleeArc = this.meleeStart > 0 && meleeProgress < 1 ? Math.sin(meleeProgress * Math.PI) : 0;
    const meleeActive = this.debugMeleeProgress !== null || (this.meleeStart > 0 && meleeProgress < 1);
    this.actionContract = characterActionContract({
      weapon: this.active,
      aimBlend: this.adsBlend,
      sprintBlend: this.sprintBlend,
      reloadProgress: pose.reloadProgress,
      meleeProgress: meleeActive ? meleeProgress : null,
    });
    this.meleeRig.visible = meleeActive;
    if (arms) arms.visible = !meleeActive && armAdsOpacity > 0.02;
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
      0.28 + adsX + bobX + this.swayX - pose.lateralSpeed * 0.012 - meleeArc * 0.24 + grenadeArc * 0.18 + reloadStage.lateral,
      -0.34 + adsY + bobY + breath + sprintDrop + crouchLift + proneLift + switchDrop + reloadStage.lift - presentationKick * 0.095 - pose.landingImpulse * 0.075,
      -0.88 + adsZ + presentationKick * profile.recoilTranslation * 1.12 - meleeArc * 0.32 + grenadeArc * 0.24,
    );
    this.root.position.lerp(targetPosition, smoothing(18));
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, presentationKick * profile.recoilRotation * 1.15 - this.swayY - grenadeArc * 0.42 + reloadStage.pitch, smoothing(22));
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y,
      hipYaw * (1 - this.adsBlend) - this.swayX * 2 - this.sprintBlend * 0.38 - meleeArc * 0.65,
      smoothing(13),
    );
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, reloadStage.roll - this.sprintBlend * 0.22 - pose.lateralSpeed * (pose.prone ? 0.01 : 0.025) + meleeArc * 0.42 + shotRoll, smoothing(13));
    this.centerSightReference(activeModel);
    if (arms) this.solveArms(arms, activeModel, reloadPose);
    this.solveRiggedArms(activeModel, reloadPose);
    return actionEvents;
  }
}
