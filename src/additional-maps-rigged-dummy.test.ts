import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { WeaponId } from './protocol';

vi.mock('./art-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./art-kit')>();
  const buildTrainingOperator = (
    _team: 0 | 1,
    name = 'operator',
    _flattenMaterials = false,
    weaponId: WeaponId | null = 'carbine',
  ): THREE.Group => {
    const root = new THREE.Group();
    root.name = name;
    const visual = new THREE.Group();
    visual.name = 'rigged-operator-visual';
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    const torso = new THREE.Bone();
    torso.name = 'Torso';
    torso.position.set(0, 1.1, 0);
    hips.add(torso);
    const bone = (boneName: string, position: THREE.Vector3, parent: THREE.Bone): THREE.Bone => {
      const createdBone = new THREE.Bone();
      createdBone.name = boneName;
      createdBone.position.copy(position);
      parent.add(createdBone);
      return createdBone;
    };
    const leftShoulder = bone('UpperArmL', new THREE.Vector3(-0.24, 0.35, 0), torso);
    const leftElbow = bone('LowerArmL', new THREE.Vector3(-0.18, -0.25, 0), leftShoulder);
    const leftWrist = bone('WristL', new THREE.Vector3(0.02, -0.2, 0.08), leftElbow);
    const rightShoulder = bone('UpperArmR', new THREE.Vector3(0.24, 0.35, 0), torso);
    const rightElbow = bone('LowerArmR', new THREE.Vector3(0.18, -0.25, 0), rightShoulder);
    const rightWrist = bone('WristR', new THREE.Vector3(-0.02, -0.2, 0.08), rightElbow);
    const armBones = [
      { side: 'left' as const, role: 'shoulder' as const, sourceBone: 'UpperArm.L', bone: leftShoulder },
      { side: 'left' as const, role: 'elbow' as const, sourceBone: 'LowerArm.L', bone: leftElbow },
      { side: 'left' as const, role: 'wrist-hand' as const, sourceBone: 'Wrist.L', bone: leftWrist },
      { side: 'right' as const, role: 'shoulder' as const, sourceBone: 'UpperArm.R', bone: rightShoulder },
      { side: 'right' as const, role: 'elbow' as const, sourceBone: 'LowerArm.R', bone: rightElbow },
      { side: 'right' as const, role: 'wrist-hand' as const, sourceBone: 'Wrist.R', bone: rightWrist },
    ].map((entry) => ({ ...entry, position: entry.bone.position.clone(), quaternion: entry.bone.quaternion.clone() }));
    const digitOffsets = [
      ['thumb', -0.05], ['index', -0.025], ['middle', 0], ['ring', 0.025], ['pinky', 0.05],
    ] as const;
    const handBones = ([
      ['left', leftWrist, 'L'], ['right', rightWrist, 'R'],
    ] as const).flatMap(([side, wrist, suffix]) => digitOffsets.map(([digit, baseOffsetX]) => {
      const capitalized = `${digit[0].toUpperCase()}${digit.slice(1)}`;
      const parentName = `${capitalized}1${suffix}`;
      const boneName = `${capitalized}2${suffix}`;
      const sourceBone = `${capitalized}2.${suffix}`;
      const offsetX = side === 'left' ? baseOffsetX : -baseOffsetX;
      const first = bone(parentName, new THREE.Vector3(offsetX, -0.035, -0.045), wrist);
      const second = bone(boneName, new THREE.Vector3(0, -0.05, 0), first);
      return {
        side,
        digit,
        joint: 2 as const,
        sourceBone,
        bone: second,
        position: second.position.clone(),
        quaternion: second.quaternion.clone(),
        first,
      };
    }));
    const skeletonBones = [
      hips, torso, ...armBones.map((entry) => entry.bone),
      ...handBones.flatMap((entry) => [entry.first, entry.bone]),
    ];
    const geometry = new THREE.BoxGeometry(0.5, 1, 0.3, 4, 4, 4);
    const vertexCount = geometry.getAttribute('position').count;
    const indices = new Uint16Array(vertexCount * 4);
    const weights = new Float32Array(vertexCount * 4);
    const trackedBones = [...armBones.map((entry) => entry.bone), ...handBones.map((entry) => entry.bone)];
    for (let index = 0; index < vertexCount; index += 1) {
      const primary = trackedBones[Math.floor(index / 4) % trackedBones.length];
      indices[index * 4] = skeletonBones.indexOf(primary);
      indices[index * 4 + 1] = skeletonBones.indexOf(primary.parent as THREE.Bone);
      indices[index * 4 + 2] = skeletonBones.indexOf(torso);
      indices[index * 4 + 3] = skeletonBones.indexOf(hips);
      weights[index * 4] = 0.7;
      weights[index * 4 + 1] = 0.15;
      weights[index * 4 + 2] = 0.1;
      weights[index * 4 + 3] = 0.05;
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const body = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    body.name = 'Swat_Body';
    body.add(hips);
    body.bind(new THREE.Skeleton(skeletonBones));
    visual.add(body);
    const weaponSocket = new THREE.Group();
    weaponSocket.name = 'weapon-socket';
    if (weaponId) {
      const weapon = new THREE.Group();
      weapon.name = `operator-${weaponId}`;
      weaponSocket.add(weapon);
    }
    const hitProxyRoot = new THREE.Group();
    hitProxyRoot.name = 'authoritative-hit-proxies';
    root.add(visual, weaponSocket, hitProxyRoot);

    const mixer = new THREE.AnimationMixer(visual);
    const idle = new THREE.AnimationClip('Idle_Gun', 1, [
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const walk = new THREE.AnimationClip('Walk', 1, [
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.3826834, 0, 0.9238795]),
      ...armBones.map(({ bone, role }, index) => {
        const sign = index < 3 ? 1 : -1;
        // Reproduce the hardware gate failure: the real Walk clip can leave an
        // unarmed wrist animated, but only 0.0378 rad away from bind pose.
        const first = role === 'wrist-hand'
          ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0.032, 0, 0))
          : new THREE.Quaternion().setFromEuler(new THREE.Euler(sign * (0.18 + index * 0.01), 0.08, sign * 0.12));
        const second = role === 'wrist-hand'
          ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0.038, 0, 0))
          : new THREE.Quaternion().setFromEuler(new THREE.Euler(-sign * (0.14 + index * 0.01), -0.06, -sign * 0.09));
        return new THREE.QuaternionKeyframeTrack(
          `${bone.name}.quaternion`,
          [0, 1],
          [...first.toArray(), ...second.toArray()],
        );
      }),
      ...handBones.map(({ bone }, index) => {
        const first = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55 + index * 0.01, 0, 0));
        const second = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.68 + index * 0.01, 0, 0));
        return new THREE.QuaternionKeyframeTrack(
          `${bone.name}.quaternion`,
          [0, 1],
          [...first.toArray(), ...second.toArray()],
        );
      }),
    ]);
    const idleAction = mixer.clipAction(idle);
    idleAction.play();
    root.userData.riggedOperatorRuntime = {
      mixer,
      clips: new Map([[idle.name, idle], [walk.name, walk]]),
      actions: new Map([[idle.name, idleAction]]),
      currentBase: idle.name,
      lastUpdatedAt: performance.now() - 50,
      stancePivot: root,
      visual,
      weaponSocket,
      stance: 'stand',
      crouchBlend: 0,
      proneBlend: 0,
      speed: 0,
      poseBones: { hips, torso },
      armBindPose: armBones,
      handBindPose: handBones,
    };
    root.userData.operatorRig = {
      rigged: true,
      weaponSocket,
      hitProxyRoot,
      weaponId,
      leftShoulderBone: armBones[0].bone,
      leftElbowBone: armBones[1].bone,
      leftWristBone: armBones[2].bone,
      rightShoulderBone: armBones[3].bone,
      rightElbowBone: armBones[4].bone,
      rightWristBone: armBones[5].bone,
      armPoseBeforeIk: [],
    };
    return root;
  };
  return { ...actual, buildOperator: vi.fn(buildTrainingOperator) };
});

import { buildGunRange, updateGunRangePresentation } from './additional-maps';
import { poseUnarmedRiggedOperatorHands, riggedOperatorTelemetry } from './operator-model';

describe('Gun Range rigged training-dummy presentation', () => {
  it('poses the retained operator child and advances its runtime bone instead of posing the wrapper', () => {
    const map = buildGunRange(new THREE.Scene());
    const presentations = map.root.userData.gunRangeTestDummies as Array<{
      root: THREE.Group;
      riggedOperator: THREE.Group | null;
    }>;
    expect(presentations).toHaveLength(4);
    const presentation = presentations[0];
    const operator = presentation.riggedOperator;
    expect(operator).toBeInstanceOf(THREE.Group);
    expect(operator?.parent).toBe(presentation.root);
    expect(operator?.userData.operatorRig.weaponId).toBeNull();
    expect(operator?.getObjectByName('weapon-socket')?.children).toHaveLength(0);
    const armBones = ['UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR']
      .map((name) => operator?.getObjectByName(name) as THREE.Bone);
    expect(armBones[1].parent).toBe(armBones[0]);
    expect(armBones[2].parent).toBe(armBones[1]);
    expect(armBones[4].parent).toBe(armBones[3]);
    expect(armBones[5].parent).toBe(armBones[4]);
    const before = armBones.map((bone) => bone.quaternion.clone());

    updateGunRangePresentation(map.root, 9_000);

    expect(operator?.userData.operatorStance).toBe('stand');
    expect(presentation.root.userData.operatorStance).toBeUndefined();
    armBones.forEach((bone, index) => expect(bone.quaternion.angleTo(before[index])).toBeGreaterThan(0));
    const unarmedHandPose = operator?.userData.operatorUnarmedHandPose as {
      contract: string;
      entries: Array<{
        bone: string;
        beforeBindDeltaRadians: number;
        afterBindDeltaRadians: number;
        intervened: boolean;
        preservedAnimatedAxis: boolean;
        usedMirroredFallbackAxis: boolean;
        appliedToRenderedBone: boolean;
      }>;
      allApplied: boolean;
      allAtOrAboveFloor: boolean;
    };
    expect(unarmedHandPose).toMatchObject({
      contract: 'post-mixer-unarmed-wrist-rest-v1',
      allApplied: true,
      allAtOrAboveFloor: true,
    });
    expect(unarmedHandPose.entries).toHaveLength(2);
    expect(unarmedHandPose.entries.every(({ beforeBindDeltaRadians }) => beforeBindDeltaRadians < 0.05)).toBe(true);
    expect(unarmedHandPose.entries.every(({ afterBindDeltaRadians }) => afterBindDeltaRadians >= 0.075 - 1e-9)).toBe(true);
    // This is the rendered bone itself, not a telemetry-only replacement.
    expect(armBones[2].quaternion.angleTo(before[2])).toBeGreaterThanOrEqual(0.075 - 1e-9);
    expect(armBones[5].quaternion.angleTo(before[5])).toBeGreaterThanOrEqual(0.075 - 1e-9);

    const aboveFloorAxis = new THREE.Vector3(0.3, 0.8, -0.2).normalize();
    armBones[2].quaternion.copy(before[2]).multiply(
      new THREE.Quaternion().setFromAxisAngle(aboveFloorAxis, 0.12),
    );
    const aboveFloorQuaternion = armBones[2].quaternion.clone();
    const aboveFloorPose = poseUnarmedRiggedOperatorHands(operator!) as typeof unarmedHandPose;
    const aboveFloorLeft = aboveFloorPose.entries.find(({ bone }) => bone === 'WristL')!;
    expect(aboveFloorLeft).toMatchObject({ intervened: false, usedMirroredFallbackAxis: false });
    expect(armBones[2].quaternion.angleTo(aboveFloorQuaternion)).toBeLessThan(1e-9);

    const belowFloorAxis = new THREE.Vector3(-0.25, 0.4, 0.7).normalize();
    armBones[2].quaternion.copy(before[2]).multiply(
      new THREE.Quaternion().setFromAxisAngle(belowFloorAxis, 0.04),
    );
    const belowFloorPose = poseUnarmedRiggedOperatorHands(operator!) as typeof unarmedHandPose;
    const belowFloorLeft = belowFloorPose.entries.find(({ bone }) => bone === 'WristL')!;
    expect(belowFloorLeft).toMatchObject({ intervened: true, preservedAnimatedAxis: true, usedMirroredFallbackAxis: false });
    expect(armBones[2].quaternion.angleTo(before[2])).toBeCloseTo(0.075, 9);
    const enforcedRelative = before[2].clone().invert().multiply(armBones[2].quaternion).normalize();
    const enforcedAxis = new THREE.Vector3(enforcedRelative.x, enforcedRelative.y, enforcedRelative.z).normalize();
    expect(Math.abs(enforcedAxis.dot(belowFloorAxis))).toBeGreaterThan(0.999999);

    armBones[2].quaternion.copy(before[2]);
    armBones[5].quaternion.copy(before[5]);
    const exactBindPose = poseUnarmedRiggedOperatorHands(operator!) as typeof unarmedHandPose;
    const exactBindLeft = exactBindPose.entries.find(({ bone }) => bone === 'WristL')!;
    const exactBindRight = exactBindPose.entries.find(({ bone }) => bone === 'WristR')!;
    expect(exactBindLeft).toMatchObject({ intervened: true, preservedAnimatedAxis: false, usedMirroredFallbackAxis: true });
    expect(exactBindRight).toMatchObject({ intervened: true, preservedAnimatedAxis: false, usedMirroredFallbackAxis: true });
    expect(exactBindLeft.afterBindDeltaRadians).toBeCloseTo(0.075, 9);
    expect(exactBindRight.afterBindDeltaRadians).toBeCloseTo(0.075, 9);
    const fallbackLeft = before[2].clone().invert().multiply(armBones[2].quaternion).normalize();
    const fallbackRight = before[5].clone().invert().multiply(armBones[5].quaternion).normalize();
    const fallbackLeftAxis = new THREE.Vector3(fallbackLeft.x, fallbackLeft.y, fallbackLeft.z).normalize();
    const fallbackRightAxis = new THREE.Vector3(fallbackRight.x, fallbackRight.y, fallbackRight.z).normalize();
    expect(fallbackLeftAxis.x).toBeCloseTo(fallbackRightAxis.x, 9);
    expect(fallbackLeftAxis.y).toBeCloseTo(-fallbackRightAxis.y, 9);
    expect(fallbackLeftAxis.z).toBeCloseTo(-fallbackRightAxis.z, 9);
    expect([...armBones[2].quaternion.toArray(), ...armBones[5].quaternion.toArray()].every(Number.isFinite)).toBe(true);
    const telemetry = riggedOperatorTelemetry(operator!);
    expect(telemetry?.activeClip).toBe('Walk');
    expect(telemetry?.armPose).toMatchObject({
      contract: 'source-glb-skinned-anti-t-arm-chain-v2',
      expectedBoneCount: 6,
      allPresent: true,
      allFinite: true,
      allHierarchyValid: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allHaveRenderedVertexInfluence: true,
      allAntiTPoseGeometry: true,
    });
    expect(telemetry?.handPose).toMatchObject({
      contract: 'source-glb-weighted-five-digit-sentinels-v2',
      expectedBoneCount: 10,
      allPresent: true,
      allDescendantOfWrist: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allHaveRenderedVertexInfluence: true,
      allFinite: true,
    });
    const armPose = telemetry?.armPose as {
      bones: Array<{
        bindQuaternionDeltaRadians: number;
        inEffectivelyVisibleSkinnedMesh: boolean;
        vertexInfluence: { influencedVertexCount: number; maximumNormalizedWeight: number; passes: boolean };
      }>;
      chains: Array<{ hierarchyPath: string[]; antiTPoseGeometry: boolean; shoulderToWristVerticalDrop: number; elbowFlexRadians: number }>;
      commonEffectiveSkinnedMeshes: string[];
      renderedInfluenceCache: { generation: number; computedBones: number; reusedBones: number; cachedBones: number };
    };
    const posedBones = armPose.bones;
    expect(posedBones).toHaveLength(6);
    expect(posedBones.every(({ bindQuaternionDeltaRadians }) => bindQuaternionDeltaRadians > 0.05)).toBe(true);
    expect(posedBones.every(({ inEffectivelyVisibleSkinnedMesh }) => inEffectivelyVisibleSkinnedMesh)).toBe(true);
    expect(posedBones.every(({ vertexInfluence }) => vertexInfluence.passes
      && vertexInfluence.influencedVertexCount >= 4 && vertexInfluence.maximumNormalizedWeight >= 0.2)).toBe(true);
    expect(armPose.commonEffectiveSkinnedMeshes).toContain('Swat_Body');
    expect(armPose.chains.map(({ hierarchyPath }) => hierarchyPath)).toEqual([
      ['UpperArmL', 'LowerArmL', 'WristL'],
      ['UpperArmR', 'LowerArmR', 'WristR'],
    ]);
    expect(armPose.chains.every(({ antiTPoseGeometry, shoulderToWristVerticalDrop, elbowFlexRadians }) => (
      antiTPoseGeometry && shoulderToWristVerticalDrop >= 0.08 && elbowFlexRadians >= 0.3
    ))).toBe(true);
    const handPose = telemetry?.handPose as {
      bones: Array<{
        bone: string;
        wristDescendantPath: string[];
        bindQuaternionDeltaRadians: number;
        vertexInfluence: { influencedVertexCount: number; maximumNormalizedWeight: number; passes: boolean };
      }>;
    };
    expect(handPose.bones.map(({ bone }) => bone)).toEqual([
      'Thumb2L', 'Index2L', 'Middle2L', 'Ring2L', 'Pinky2L',
      'Thumb2R', 'Index2R', 'Middle2R', 'Ring2R', 'Pinky2R',
    ]);
    expect(handPose.bones.every(({ wristDescendantPath, bindQuaternionDeltaRadians }) => (
      wristDescendantPath.length === 3 && bindQuaternionDeltaRadians >= 0.12
    ))).toBe(true);
    expect(handPose.bones.every(({ vertexInfluence }) => vertexInfluence.passes
      && vertexInfluence.influencedVertexCount >= 4 && vertexInfluence.maximumNormalizedWeight >= 0.2)).toBe(true);
    expect(armPose.renderedInfluenceCache).toMatchObject({
      generation: 1,
      computedBones: 16,
      reusedBones: 0,
      cachedBones: 16,
    });
    const repeatedTelemetry = riggedOperatorTelemetry(operator!);
    expect((repeatedTelemetry?.armPose as { renderedInfluenceCache: Record<string, number> }).renderedInfluenceCache)
      .toMatchObject({ generation: 1, computedBones: 0, reusedBones: 16, cachedBones: 16 });

    // A skeleton palette and JOINTS_0 entry are not rendered influence. Retain
    // both while zeroing every UpperArmL WEIGHTS_0 contribution, then assert
    // the telemetry fails closed.
    const body = operator?.getObjectByName('Swat_Body') as THREE.SkinnedMesh;
    const targetJoint = body.skeleton.bones.indexOf(armBones[0]);
    const skinIndex = body.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    const skinWeight = body.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    for (let vertex = 0; vertex < skinIndex.count; vertex += 1) {
      const joints = [skinIndex.getX(vertex), skinIndex.getY(vertex), skinIndex.getZ(vertex), skinIndex.getW(vertex)];
      const weights = [skinWeight.getX(vertex), skinWeight.getY(vertex), skinWeight.getZ(vertex), skinWeight.getW(vertex)];
      let displacedWeight = 0;
      for (let slot = 0; slot < 4; slot += 1) {
        if (joints[slot] !== targetJoint) continue;
        displacedWeight += weights[slot];
        weights[slot] = 0;
      }
      weights[3] += displacedWeight;
      skinWeight.setXYZW(vertex, weights[0], weights[1], weights[2], weights[3]);
    }
    skinWeight.needsUpdate = true;
    expect(Array.from({ length: skinIndex.count }, (_, vertex) => (
      [skinIndex.getX(vertex), skinIndex.getY(vertex), skinIndex.getZ(vertex), skinIndex.getW(vertex)]
        .includes(targetJoint)
    )).some(Boolean)).toBe(true);
    const zeroWeightTelemetry = riggedOperatorTelemetry(operator!);
    const zeroWeightArm = (zeroWeightTelemetry?.armPose as {
      allHaveRenderedVertexInfluence: boolean;
      bones: Array<{ bone: string; vertexInfluence: { influencedVertexCount: number; passes: boolean } }>;
      renderedInfluenceCache: { generation: number; computedBones: number; reusedBones: number; cachedBones: number };
    });
    expect(zeroWeightArm.allHaveRenderedVertexInfluence).toBe(false);
    expect(zeroWeightArm.renderedInfluenceCache).toMatchObject({
      generation: 2,
      computedBones: 16,
      reusedBones: 0,
      cachedBones: 16,
    });
    expect(zeroWeightArm.bones.find(({ bone }) => bone === 'UpperArmL')?.vertexInfluence)
      .toMatchObject({ influencedVertexCount: 0, passes: false });
  });
});
