import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  BOT_EMISSIVE_BRIGHTNESS_SCALE,
  FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY,
  RIGGED_OPERATOR_RUNTIME_ACTION_NAMES,
  applyBotEmissiveBrightness,
  createOperatorInstanceMaterialResolver,
  enforceRiggedOperatorHandBindDeltaFloor,
  firstPersonArmHandedness,
  firstPersonArmMaterialReadabilityProfile,
  isEmbeddedWeaponObjectName,
  riggedStanceTarget,
  riggedOperatorRuntimeClips,
  suppressEmbeddedWeaponObjects,
} from './operator-model';

const RIGHT_PINKY_BIND = new THREE.Quaternion(
  0.03783833980560303,
  -0.1764165163040161,
  0.06506768614053726,
  0.9814335107803345,
);
const HAND_SENTINELS = (['left', 'right'] as const).flatMap((side) =>
  (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).map((digit) => ({ side, digit })));

function handBoneName(side: 'left' | 'right', digit: string): string {
  return `${digit[0].toUpperCase()}${digit.slice(1)}2${side === 'left' ? 'L' : 'R'}`;
}

function handSourceBoneName(side: 'left' | 'right', digit: string): string {
  return `${digit[0].toUpperCase()}${digit.slice(1)}2.${side === 'left' ? 'L' : 'R'}`;
}

function makeHandFloorRig(pinkyLocalQuaternion: THREE.Quaternion) {
  const root = new THREE.Group();
  const entries = HAND_SENTINELS.map(({ side, digit }, index) => {
    const bone = new THREE.Bone();
    bone.name = handBoneName(side, digit);
    const bindQuaternion = side === 'right' && digit === 'pinky'
      ? RIGHT_PINKY_BIND.clone()
      : new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(index + 1, index % 3 + 1, index % 5 + 1).normalize(),
        0.01 * (index + 1),
      );
    bone.quaternion.copy(side === 'right' && digit === 'pinky'
      ? pinkyLocalQuaternion
      : bindQuaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.02)));
    root.add(bone);
    return {
      side,
      digit,
      joint: 2,
      sourceBone: handSourceBoneName(side, digit),
      bone,
      quaternion: bindQuaternion,
    };
  });
  root.userData.riggedOperatorRuntime = { handBindPose: entries };
  const pinky = entries.find(({ side, digit }) => side === 'right' && digit === 'pinky')!;
  return { root, entries, pinky };
}

function shortestBindRelativeAxis(bind: THREE.Quaternion, local: THREE.Quaternion): THREE.Vector3 | null {
  const relative = bind.clone().invert().multiply(local).normalize();
  if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
  const length = Math.hypot(relative.x, relative.y, relative.z);
  return length > 1e-8 ? new THREE.Vector3(relative.x, relative.y, relative.z).divideScalar(length) : null;
}

function localAtReportedBindDelta(bind: THREE.Quaternion, axis: THREE.Vector3, reportedRadians: number): THREE.Quaternion {
  const relativeRadians = 2 * Math.acos(Math.cos(reportedRadians / 2) / bind.length());
  return bind.clone().normalize().multiply(new THREE.Quaternion().setFromAxisAngle(axis, relativeRadians));
}

function enforceRightPinkyFloor(root: THREE.Object3D) {
  return enforceRiggedOperatorHandBindDeltaFloor(root, 'right', 'pinky', 0.38, [-1, 0, 0])!;
}

describe('rigged operator presentation contract', () => {
  it('bounds first-person readability fill without flattening PBR into self-lit plastic', () => {
    const profiles = [
      firstPersonArmMaterialReadabilityProfile('Skin'),
      firstPersonArmMaterialReadabilityProfile('Arms_Glove_PBR'),
      firstPersonArmMaterialReadabilityProfile('Arms_FingerGlove_PBR'),
      firstPersonArmMaterialReadabilityProfile('Arms_Sleeve_PBR'),
      firstPersonArmMaterialReadabilityProfile('Arms_ArmorPad_PBR'),
    ];
    expect(profiles.every((profile) => profile !== null)).toBe(true);
    for (const profile of profiles) {
      expect(profile!.emissiveIntensity).toBeGreaterThan(0);
      expect(profile!.emissiveIntensity).toBeLessThanOrEqual(FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
    }
    expect(firstPersonArmMaterialReadabilityProfile('Arms_Glove_PBR')?.emissiveIntensity).toBeLessThanOrEqual(0.14);
    expect(firstPersonArmMaterialReadabilityProfile('unrelated-world-operator')).toBeNull();
  });

  it('accepts the authored right-on-positive-X armature without a negative-determinant mirror', () => {
    const visual = new THREE.Group();
    const right = new THREE.Bone(); right.name = 'UpperArmR'; right.position.x = 0.24;
    const left = new THREE.Bone(); left.name = 'UpperArmL'; left.position.x = -0.24;
    visual.add(right, left);

    const authored = firstPersonArmHandedness(visual);
    expect(authored).toMatchObject({
      contract: 'authored-positive-determinant-right-on-positive-x-v1',
      valid: true,
      rightShoulderX: 0.24,
      leftShoulderX: -0.24,
    });
    expect(authored.shoulderSeparation).toBeCloseTo(0.48);
    expect(authored.visualDeterminant).toBeGreaterThan(0);

    visual.scale.x = -1;
    const reflected = firstPersonArmHandedness(visual);
    expect(reflected.valid).toBe(false);
    expect(reflected.rightShoulderX).toBeLessThan(reflected.leftShoulderX);
    expect(reflected.visualDeterminant).toBeLessThan(0);
  });

  it('halves bot emissive brightness idempotently without changing base colour', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xd85cff, emissive: 0x7d16bd, emissiveIntensity: 1.2 });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    expect(applyBotEmissiveBrightness(root)).toBe(1);
    expect(material.emissiveIntensity).toBeCloseTo(1.2 * BOT_EMISSIVE_BRIGHTNESS_SCALE);
    expect(material.color.getHex()).toBe(0xd85cff);
    applyBotEmissiveBrightness(root);
    expect(material.emissiveIntensity).toBeCloseTo(0.6);
    expect(root.userData.botEmissiveBrightnessScale).toBe(0.5);
  });

  it('suppresses embedded loadout weapons by semantic identity without hiding body meshes', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); body.name = 'Swat_Body';
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); pistol.name = 'Pistol';
    const holstered = new THREE.Group(); holstered.name = 'operator.weapon_backup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); child.name = 'embedded-prop'; holstered.add(child);
    root.add(body, pistol, holstered);

    expect(isEmbeddedWeaponObjectName('Pistol')).toBe(true);
    expect(isEmbeddedWeaponObjectName('backup-rifle.mesh')).toBe(true);
    expect(isEmbeddedWeaponObjectName('Swat_Body')).toBe(false);
    expect(suppressEmbeddedWeaponObjects(root)).toBe(2);
    expect(body.visible).toBe(true);
    expect(pistol.visible).toBe(false);
    expect(holstered.visible).toBe(false);
    expect(pistol.userData.embeddedWeaponSuppressed).toBe(true);
  });

  it('uses a pelvis-height prone pivot and bounded deterministic stance targets', () => {
    expect(riggedStanceTarget('stand')).toEqual({ pivotHeight: 0.84, pivotPitch: 0, crouch: 0, prone: 0 });
    expect(riggedStanceTarget('crouch')).toEqual({ pivotHeight: 0.84, pivotPitch: 0, crouch: 1, prone: 0 });
    const prone = riggedStanceTarget('prone');
    expect(prone.pivotHeight).toBeGreaterThan(0.35);
    expect(prone.pivotHeight).toBeLessThan(0.55);
    expect(prone.pivotPitch).toBeGreaterThan(-Math.PI / 2);
    expect(prone.pivotPitch).toBeLessThan(-1.3);
    expect(prone).toMatchObject({ crouch: 0, prone: 1 });
  });

  it('reuses one material clone inside an operator without sharing mutable ownership across operators', () => {
    const source = new THREE.MeshStandardMaterial({ color: 0x507080, roughness: 0.61, metalness: 0.17 });
    source.name = 'Swat';
    const resolveFirstOwner = createOperatorInstanceMaterialResolver(0, false, 'team');
    const resolveSecondOwner = createOperatorInstanceMaterialResolver(0, false, 'team');

    const firstMeshMaterial = resolveFirstOwner(source);
    const siblingMeshMaterial = resolveFirstOwner(source);
    const secondOwnerMaterial = resolveSecondOwner(source);

    expect(firstMeshMaterial).toBe(siblingMeshMaterial);
    expect(firstMeshMaterial).not.toBe(source);
    expect(secondOwnerMaterial).not.toBe(firstMeshMaterial);
    expect((firstMeshMaterial as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2d7882);
    expect((secondOwnerMaterial as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2d7882);

    const secondOwnerDisposed = vi.fn();
    secondOwnerMaterial.addEventListener('dispose', secondOwnerDisposed);
    firstMeshMaterial.dispose();
    expect(secondOwnerDisposed).not.toHaveBeenCalled();
  });

  it('admits only controller-reachable authored clips in deterministic prewarm order', () => {
    const authored = [
      new THREE.AnimationClip('Wave', 1, []),
      ...[...RIGGED_OPERATOR_RUNTIME_ACTION_NAMES].reverse().map((name) => new THREE.AnimationClip(name, 1, [])),
      new THREE.AnimationClip('Roll', 1, []),
    ];

    const runtimeClips = riggedOperatorRuntimeClips(authored);
    expect(runtimeClips.map((clip) => clip.name)).toEqual(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES);
    expect(runtimeClips).toHaveLength(12);
    expect(runtimeClips).not.toContain(authored[0]);
    expect(runtimeClips).not.toContain(authored.at(-1));
    expect(runtimeClips.every((clip) => authored.includes(clip))).toBe(true);
  });
});

describe('post-mixer authored-bind hand floor', () => {
  it('minimally clamps both independently observed cancellation phases and preserves their shortest axes', () => {
    const traces = [
      {
        label: 'second official cancellation phase',
        local: [-0.06157356889928739, 0.14493789798255466, -0.19362636538984757, -0.9683724807055973],
        before: 0.2701489666915341,
        correction: 0.1098510333084659,
      },
      {
        label: 'first official near-floor phase',
        local: [-0.14530507857983138, 0.1276035513223795, -0.20546410230402973, -0.9593867832703411],
        before: 0.36981904581827996,
        correction: 0.01018095418172004,
      },
    ] as const;

    for (const trace of traces) {
      const before = new THREE.Quaternion(...trace.local);
      const expectedAxis = shortestBindRelativeAxis(RIGHT_PINKY_BIND, before)!;
      const { root, pinky } = makeHandFloorRig(before);
      const receipt = enforceRightPinkyFloor(root);
      const afterAxis = shortestBindRelativeAxis(RIGHT_PINKY_BIND, pinky.bone.quaternion)!;

      expect(receipt.beforeBindDeltaRadians, trace.label).toBeCloseTo(trace.before, 12);
      expect(receipt.afterBindDeltaRadians, trace.label).toBeCloseTo(0.38, 12);
      expect(receipt.intervened, trace.label).toBe(true);
      expect(receipt.reportedBindDeltaCorrectionRadians, trace.label).toBeCloseTo(trace.correction, 12);
      expect(receipt.renderedOrientationCorrectionRadians, trace.label).toBeGreaterThan(0);
      expect(receipt.renderedOrientationCorrectionRadians, trace.label).toBeLessThanOrEqual(trace.correction + 0.001);
      expect(Math.abs(afterAxis.dot(expectedAxis)), trace.label).toBeCloseTo(1, 12);
      expect(receipt).toMatchObject({
        axisSource: 'shortest-bind-relative',
        preservedShortestRelativeAxis: true,
        appliedToRenderedBone: true,
        allFinite: true,
      });
    }
  });

  it('leaves a high Walk phase unchanged and honors the 0.379999/0.38 boundary', () => {
    const highPhase = new THREE.Quaternion(
      -0.5417796855187491,
      -0.23911234215831756,
      0.0792161689019715,
      0.801899553957991,
    );
    const highRig = makeHandFloorRig(highPhase);
    const highReceipt = enforceRightPinkyFloor(highRig.root);
    expect(highReceipt.beforeBindDeltaRadians).toBeCloseTo(1.2401019755382803, 12);
    expect(highReceipt.intervened).toBe(false);
    expect(highReceipt.renderedOrientationCorrectionRadians).toBe(0);
    expect(highRig.pinky.bone.quaternion.toArray()).toEqual(highPhase.toArray());

    const axis = new THREE.Vector3(0.2, -0.9, 0.38).normalize();
    const localAt = (angle: number) => localAtReportedBindDelta(RIGHT_PINKY_BIND, axis, angle);
    const belowRig = makeHandFloorRig(localAt(0.379999));
    const belowReceipt = enforceRightPinkyFloor(belowRig.root);
    expect(belowReceipt.beforeBindDeltaRadians).toBeCloseTo(0.379999, 12);
    expect(belowReceipt.intervened).toBe(true);
    expect(belowRig.pinky.bone.quaternion.angleTo(RIGHT_PINKY_BIND)).toBeCloseTo(0.38, 12);

    const boundary = localAt(0.38);
    const boundaryRig = makeHandFloorRig(boundary);
    const boundaryReceipt = enforceRightPinkyFloor(boundaryRig.root);
    expect(boundaryReceipt.beforeBindDeltaRadians).toBeCloseTo(0.38, 12);
    expect(boundaryReceipt.intervened).toBe(false);
    expect(boundaryReceipt.renderedOrientationCorrectionRadians).toBe(0);
    expect(boundaryRig.pinky.bone.quaternion.toArray()).toEqual(boundary.toArray());
  });

  it('is hemisphere-invariant, finite at exact bind, and idempotent', () => {
    const input = new THREE.Quaternion(
      -0.06157356889928739,
      0.14493789798255466,
      -0.19362636538984757,
      -0.9683724807055973,
    );
    const positiveRig = makeHandFloorRig(input);
    const negativeRig = makeHandFloorRig(new THREE.Quaternion(-input.x, -input.y, -input.z, -input.w));
    const positive = enforceRightPinkyFloor(positiveRig.root);
    const negative = enforceRightPinkyFloor(negativeRig.root);
    expect(positive.beforeBindDeltaRadians).toBeCloseTo(negative.beforeBindDeltaRadians as number, 12);
    expect(positiveRig.pinky.bone.quaternion.angleTo(negativeRig.pinky.bone.quaternion)).toBeLessThan(1e-7);

    const bindRig = makeHandFloorRig(RIGHT_PINKY_BIND.clone());
    const first = enforceRightPinkyFloor(bindRig.root);
    const firstQuaternion = bindRig.pinky.bone.quaternion.clone();
    expect(first).toMatchObject({
      intervened: true,
      axisSource: 'authored-curl-fallback',
      usedFallbackAxis: true,
      observedShortestRelativeAxis: null,
      preservedShortestRelativeAxis: null,
      allFinite: true,
    });
    expect(first.afterBindDeltaRadians).toBeCloseTo(0.38, 12);
    const second = enforceRightPinkyFloor(bindRig.root);
    expect(second.intervened).toBe(false);
    expect(bindRig.pinky.bone.quaternion.toArray()).toEqual(firstQuaternion.toArray());
    expect(second.afterBindDeltaRadians).toBeCloseTo(0.38, 12);
  });

  it('stays finite over dense cancellation poses while retaining immutable bind data and the other nine joints', () => {
    for (let sample = 0; sample <= 80; sample += 1) {
      const angle = sample * 0.01;
      const axis = new THREE.Vector3(
        Math.sin(0.37 + sample * 0.11),
        Math.cos(0.19 + sample * 0.07),
        Math.sin(0.61 + sample * 0.05),
      ).normalize();
      const local = localAtReportedBindDelta(RIGHT_PINKY_BIND, axis, angle);
      const rig = makeHandFloorRig(local);
      const bindSnapshot = rig.entries.map((entry) => entry.quaternion.toArray());
      const otherBoneSnapshot = rig.entries.map((entry) => entry.bone.quaternion.toArray());
      const receipt = enforceRightPinkyFloor(rig.root);

      expect(receipt.allFinite, `dense phase ${sample}`).toBe(true);
      expect(rig.pinky.bone.quaternion.angleTo(RIGHT_PINKY_BIND), `dense phase ${sample}`).toBeGreaterThanOrEqual(0.38 - 1e-9);
      if (angle > 1e-8 && angle < 0.38 - 1e-9) {
        const afterAxis = shortestBindRelativeAxis(RIGHT_PINKY_BIND, rig.pinky.bone.quaternion)!;
        expect(Math.abs(afterAxis.dot(axis)), `dense phase ${sample}`).toBeCloseTo(1, 10);
      } else if (angle >= 0.38 - 1e-9) {
        expect(rig.pinky.bone.quaternion.angleTo(local), `dense phase ${sample}`).toBeLessThan(1e-7);
      }
      expect(rig.entries.map((entry) => entry.quaternion.toArray()), `immutable bind phase ${sample}`).toEqual(bindSnapshot);
      rig.entries.forEach((entry, index) => {
        if (entry !== rig.pinky) {
          expect(entry.bone.quaternion.toArray(), `${entry.bone.name} phase ${sample}`).toEqual(otherBoneSnapshot[index]);
        }
      });
    }
  });
});
