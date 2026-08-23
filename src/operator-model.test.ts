import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { operatorBodyColour } from './operator-skin-catalog';
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
type HandSide = typeof HAND_SENTINELS[number]['side'];
type HandDigit = typeof HAND_SENTINELS[number]['digit'];
const INDEPENDENT_HAND_BIND_FLOORS = Object.freeze({
  thumb: 0.008,
  index: 0.2,
  middle: 0.18,
  ring: 0.22,
  pinky: 0.35,
});
const PRODUCT_HAND_BIND_FLOORS = Object.freeze({
  thumb: 0.04,
  index: 0.23,
  middle: 0.21,
  ring: 0.25,
  pinky: 0.38,
});
const PRODUCT_HAND_FALLBACK_AXIS = [-1, 0, 0] as const;

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
  return enforceRiggedOperatorHandBindDeltaFloor(root, 'right', 'pinky', 0.38, PRODUCT_HAND_FALLBACK_AXIS)!;
}

function findHandEntry(
  rig: ReturnType<typeof makeHandFloorRig>,
  side: HandSide,
  digit: HandDigit,
) {
  return rig.entries.find((entry) => entry.side === side && entry.digit === digit)!;
}

function enforceProductHandFloor(root: THREE.Object3D, side: HandSide, digit: HandDigit) {
  return enforceRiggedOperatorHandBindDeltaFloor(
    root,
    side,
    digit,
    PRODUCT_HAND_BIND_FLOORS[digit],
    PRODUCT_HAND_FALLBACK_AXIS,
  )!;
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
    // HF-366: the body colour is now the SELECTED SKIN washed with the team
    // rather than one hard-coded team constant - four skins used to arrive here
    // and leave identical, which is what "they all looked greyed out" was. The
    // pin moves to the canonical projection so a colour change still has to be
    // deliberate, and the aqua team read is asserted alongside it.
    const aquaDefault = operatorBodyColour('default', 0, 'swat');
    expect((firstMeshMaterial as THREE.MeshStandardMaterial).color.getHex()).toBe(aquaDefault);
    expect((secondOwnerMaterial as THREE.MeshStandardMaterial).color.getHex()).toBe(aquaDefault);
    // ...and the two teams must still be told apart on the same skin.
    expect(operatorBodyColour('default', 1, 'swat')).not.toBe(aquaDefault);

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
    // Pass 75 added 'Wave' as the only clip the selectable-emote catalog needs
    // beyond the controller set. The guarantee this test protects is that the
    // bound set stays SMALL and deterministic, not that it is frozen forever -
    // so it is asserted against the declared list rather than a bare number.
    expect(runtimeClips).toHaveLength(RIGGED_OPERATOR_RUNTIME_ACTION_NAMES.length);
    expect(runtimeClips.length).toBeLessThanOrEqual(14);
    expect(runtimeClips).not.toContain(authored[0]);
    expect(runtimeClips).not.toContain(authored.at(-1));
    expect(runtimeClips.every((clip) => authored.includes(clip))).toBe(true);
  });
});

describe('post-mixer authored-bind hand floor', () => {
  it('replays the official left-pinky and right-thumb cancellation traces on the actual rendered bones', () => {
    const traces = [
      {
        side: 'left',
        digit: 'pinky',
        bind: [0.03783821687102318, 0.17641645669937134, -0.06506747752428055, 0.9814335107803345],
        local: [-0.022799745863587184, -0.15256495255630437, 0.18767551491117984, -0.9700601720323629],
        before: 0.25253567190298776,
      },
      {
        side: 'right',
        digit: 'thumb',
        bind: [0.041727494448423386, 0.12201467901468277, -0.08518115431070328, 0.9879855513572693],
        local: [0.028280358147412754, 0.12316254666324532, -0.08350633887954156, 0.9884529547297463],
        before: 0.02855042381835995,
      },
    ] as const;

    for (const trace of traces) {
      const rig = makeHandFloorRig(RIGHT_PINKY_BIND.clone());
      const target = findHandEntry(rig, trace.side, trace.digit);
      target.quaternion.set(trace.bind[0], trace.bind[1], trace.bind[2], trace.bind[3]);
      target.bone.quaternion.set(trace.local[0], trace.local[1], trace.local[2], trace.local[3]);
      const otherBonesBefore = rig.entries.map((entry) => entry.bone.quaternion.toArray());
      const receipt = enforceProductHandFloor(rig.root, trace.side, trace.digit) as any;
      const productFloor = PRODUCT_HAND_BIND_FLOORS[trace.digit];

      expect(receipt.beforeBindDeltaRadians, `${trace.side} ${trace.digit} official cancellation`).toBeCloseTo(trace.before, 12);
      expect(receipt.afterBindDeltaRadians, `${trace.side} ${trace.digit} product floor`).toBeCloseTo(productFloor, 12);
      expect(target.bone.quaternion.angleTo(target.quaternion), `${trace.side} ${trace.digit} rendered transform`).toBeCloseTo(productFloor, 12);
      expect(receipt).toMatchObject({
        side: trace.side,
        digit: trace.digit,
        bone: target.bone.name,
        minimumBindDeltaRadians: productFloor,
        allocationContract: 'persistent-per-rendered-hand-bone-v1',
        intervened: true,
        appliedToRenderedBone: true,
        allFinite: true,
      });
      rig.entries.forEach((entry, index) => {
        if (entry !== target) expect(entry.bone.quaternion.toArray()).toEqual(otherBonesBefore[index]);
      });
    }
  });

  it('clamps every second phalanx above its independent gate and reuses persistent receipt storage', () => {
    for (const { side, digit } of HAND_SENTINELS) {
      const rig = makeHandFloorRig(RIGHT_PINKY_BIND.clone());
      const target = findHandEntry(rig, side, digit);
      const productFloor = PRODUCT_HAND_BIND_FLOORS[digit];
      const independentFloor = INDEPENDENT_HAND_BIND_FLOORS[digit];
      const adversarialDelta = (productFloor + independentFloor) / 2;
      const axis = new THREE.Vector3(
        side === 'left' ? -0.8 : 0.7,
        digit.length * 0.07,
        side === 'left' ? 0.31 : -0.29,
      ).normalize();
      const adversarialLocal = localAtReportedBindDelta(target.quaternion, axis, adversarialDelta);
      target.bone.quaternion.copy(adversarialLocal);
      const immutableBindBefore = rig.entries.map((entry) => entry.quaternion.toArray());
      const otherBonesBefore = rig.entries.map((entry) => entry.bone.quaternion.toArray());

      expect(productFloor, `${side} ${digit} product margin`).toBeGreaterThan(independentFloor);
      expect(target.bone.quaternion.angleTo(target.quaternion), `${side} ${digit} adversary clears only evidence floor`)
        .toBeGreaterThan(independentFloor);
      const first = enforceProductHandFloor(rig.root, side, digit) as any;
      const firstGeneration = first.generation;
      const firstIdentity = first;
      const bindArrayIdentity = first.bindLocalQuaternion;
      const beforeArrayIdentity = first.beforeLocalQuaternion;
      const afterArrayIdentity = first.afterLocalQuaternion;
      const axisArrayIdentity = first.appliedAxis;
      const observedAxisIdentity = first.observedShortestRelativeAxis;
      const cachedAxisIdentity = target.bone.userData.riggedHandBindFloorAxis;
      const observedAxisStorageIdentity = target.bone.userData.riggedHandBindFloorObservedAxisStorage;
      const correctedQuaternion = target.bone.quaternion.clone();

      expect(first.beforeBindDeltaRadians, `${side} ${digit} adversarial delta`).toBeCloseTo(adversarialDelta, 12);
      expect(first.afterBindDeltaRadians, `${side} ${digit} product clamp`).toBeCloseTo(productFloor, 12);
      expect(first.intervened).toBe(true);
      expect(first.generation).toBe(1);
      expect(first.allocationContract).toBe('persistent-per-rendered-hand-bone-v1');
      expect(Array.isArray(observedAxisIdentity)).toBe(true);

      const second = enforceProductHandFloor(rig.root, side, digit) as any;
      expect(second, `${side} ${digit} receipt record identity`).toBe(firstIdentity);
      expect(second.bindLocalQuaternion, `${side} ${digit} bind array identity`).toBe(bindArrayIdentity);
      expect(second.beforeLocalQuaternion, `${side} ${digit} before array identity`).toBe(beforeArrayIdentity);
      expect(second.afterLocalQuaternion, `${side} ${digit} after array identity`).toBe(afterArrayIdentity);
      expect(second.appliedAxis, `${side} ${digit} applied axis identity`).toBe(axisArrayIdentity);
      expect(second.observedShortestRelativeAxis, `${side} ${digit} observed axis identity`).toBe(observedAxisIdentity);
      expect(target.bone.userData.riggedHandBindFloorAxis, `${side} ${digit} cached axis identity`).toBe(cachedAxisIdentity);
      expect(target.bone.userData.riggedHandBindFloorObservedAxisStorage, `${side} ${digit} observed storage identity`)
        .toBe(observedAxisStorageIdentity);
      expect(second.generation).toBe(firstGeneration + 1);
      expect(second.intervened).toBe(false);
      expect(target.bone.quaternion.toArray()).toEqual(correctedQuaternion.toArray());

      expect(rig.entries.map((entry) => entry.quaternion.toArray()), `${side} ${digit} immutable authored bind`)
        .toEqual(immutableBindBefore);
      rig.entries.forEach((entry, index) => {
        if (entry !== target) expect(entry.bone.quaternion.toArray()).toEqual(otherBonesBefore[index]);
      });

      const highLocal = localAtReportedBindDelta(target.quaternion, axis, productFloor + 0.12);
      target.bone.quaternion.copy(highLocal);
      const high = enforceProductHandFloor(rig.root, side, digit) as any;
      expect(high).toBe(firstIdentity);
      expect(high.intervened, `${side} ${digit} high phase`).toBe(false);
      expect(high.renderedOrientationCorrectionRadians).toBe(0);
      expect(target.bone.quaternion.angleTo(highLocal), `${side} ${digit} high phase transform`).toBeLessThan(1e-7);
    }
  });

  it('keeps the projected floor hemisphere continuous through positive zero, signed zero, and negative zero', () => {
    const rig = makeHandFloorRig(RIGHT_PINKY_BIND.clone());
    const target = findHandEntry(rig, 'right', 'pinky');
    target.quaternion.identity();
    const fallbackAxis = new THREE.Vector3(-1, 0, 0);

    target.bone.quaternion.setFromAxisAngle(fallbackAxis, 1e-6);
    const positive = enforceProductHandFloor(rig.root, 'right', 'pinky') as any;
    const positiveProjected = target.bone.quaternion.clone();
    expect(positive.alignedObservedAxisHemisphere).toBe(false);

    target.bone.quaternion.set(+0, +0, +0, 1);
    const positiveZero = enforceProductHandFloor(rig.root, 'right', 'pinky') as any;
    const positiveZeroProjected = target.bone.quaternion.clone();
    expect(positiveZero.axisSource).toBe('previous-shortest-bind-relative');

    target.bone.quaternion.set(-0, +0, -0, 1);
    const negativeZero = enforceProductHandFloor(rig.root, 'right', 'pinky') as any;
    const negativeZeroProjected = target.bone.quaternion.clone();
    expect(negativeZero.axisSource).toBe('previous-shortest-bind-relative');

    target.bone.quaternion.setFromAxisAngle(fallbackAxis, -1e-6);
    const negative = enforceProductHandFloor(rig.root, 'right', 'pinky') as any;
    const negativeProjected = target.bone.quaternion.clone();
    expect(negative).toMatchObject({
      alignedObservedAxisHemisphere: true,
      axisSource: 'shortest-bind-relative-aligned-to-previous',
      continuityReference: 'previous-shortest-bind-relative',
      preservedShortestRelativeAxis: true,
      allFinite: true,
    });

    expect(positiveProjected.angleTo(positiveZeroProjected)).toBeLessThan(1e-9);
    expect(positiveProjected.angleTo(negativeZeroProjected)).toBeLessThan(1e-9);
    expect(positiveProjected.angleTo(negativeProjected)).toBeLessThan(1e-9);
    expect(negative.afterBindDeltaRadians).toBeCloseTo(PRODUCT_HAND_BIND_FLOORS.pinky, 12);

    const aboveFloorAxis = fallbackAxis.clone().negate();
    const aboveFloor = new THREE.Quaternion().setFromAxisAngle(
      aboveFloorAxis,
      PRODUCT_HAND_BIND_FLOORS.pinky + 0.02,
    );
    target.bone.quaternion.copy(aboveFloor);
    const high = enforceProductHandFloor(rig.root, 'right', 'pinky') as any;
    expect(high.intervened).toBe(false);
    expect(target.bone.quaternion.toArray()).toEqual(aboveFloor.toArray());
    target.bone.quaternion.setFromAxisAngle(aboveFloorAxis, 1e-6);
    const refreshed = enforceProductHandFloor(rig.root, 'right', 'pinky') as any;
    const refreshedAxis = shortestBindRelativeAxis(target.quaternion, target.bone.quaternion)!;
    expect(refreshed.alignedObservedAxisHemisphere).toBe(false);
    expect(refreshedAxis.dot(aboveFloorAxis)).toBeGreaterThan(1 - 1e-9);
  });

  it('stays finite over dense cancellation phases for all ten product floors', () => {
    for (const { side, digit } of HAND_SENTINELS) {
      const productFloor = PRODUCT_HAND_BIND_FLOORS[digit];
      for (let sample = 0; sample <= 20; sample += 1) {
        const rig = makeHandFloorRig(RIGHT_PINKY_BIND.clone());
        const target = findHandEntry(rig, side, digit);
        const angle = sample * (productFloor + 0.12) / 20;
        const axis = new THREE.Vector3(
          Math.sin(0.37 + sample * 0.11 + digit.length),
          Math.cos(0.19 + sample * 0.07 + (side === 'left' ? 0 : 1)),
          Math.sin(0.61 + sample * 0.05 + digit.charCodeAt(0) * 0.01),
        ).normalize();
        const local = localAtReportedBindDelta(target.quaternion, axis, angle);
        target.bone.quaternion.copy(local);
        const receipt = enforceProductHandFloor(rig.root, side, digit) as any;

        expect(receipt.allFinite, `${side} ${digit} dense phase ${sample}`).toBe(true);
        expect(target.bone.quaternion.angleTo(target.quaternion), `${side} ${digit} dense phase ${sample}`)
          .toBeGreaterThanOrEqual(productFloor - 1e-9);
        if (angle > 1e-8 && angle < productFloor - 1e-9) {
          const afterAxis = shortestBindRelativeAxis(target.quaternion, target.bone.quaternion)!;
          expect(Math.abs(afterAxis.dot(axis)), `${side} ${digit} dense axis ${sample}`).toBeCloseTo(1, 10);
        } else if (angle >= productFloor - 1e-9) {
          expect(target.bone.quaternion.angleTo(local), `${side} ${digit} dense unchanged ${sample}`).toBeLessThan(1e-7);
        }
      }
    }
  });

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
