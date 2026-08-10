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
    const handBones = ([
      ['left', 'middle', 'Middle1L', 'Middle2L', 'Middle2.L', leftWrist, -0.025],
      ['left', 'ring', 'Ring1L', 'Ring2L', 'Ring2.L', leftWrist, 0.025],
      ['right', 'middle', 'Middle1R', 'Middle2R', 'Middle2.R', rightWrist, 0.025],
      ['right', 'ring', 'Ring1R', 'Ring2R', 'Ring2.R', rightWrist, -0.025],
    ] as const).map(([side, digit, parentName, boneName, sourceBone, wrist, offsetX]) => {
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
    });
    const geometry = new THREE.BoxGeometry(0.5, 1, 0.3);
    const vertexCount = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
    const weights = new Float32Array(vertexCount * 4);
    for (let index = 0; index < vertexCount; index += 1) weights[index * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const body = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    body.name = 'Swat_Body';
    body.add(hips);
    body.bind(new THREE.Skeleton([
      hips, torso, ...armBones.map((entry) => entry.bone),
      ...handBones.flatMap((entry) => [entry.first, entry.bone]),
    ]));
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
      ...armBones.map(({ bone }, index) => {
        const sign = index < 3 ? 1 : -1;
        const first = new THREE.Quaternion().setFromEuler(new THREE.Euler(sign * (0.18 + index * 0.01), 0.08, sign * 0.12));
        const second = new THREE.Quaternion().setFromEuler(new THREE.Euler(-sign * (0.14 + index * 0.01), -0.06, -sign * 0.09));
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
import { riggedOperatorTelemetry } from './operator-model';

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
    const telemetry = riggedOperatorTelemetry(operator!);
    expect(telemetry?.activeClip).toBe('Walk');
    expect(telemetry?.armPose).toMatchObject({
      contract: 'source-glb-skinned-anti-t-arm-chain-v2',
      expectedBoneCount: 6,
      allPresent: true,
      allFinite: true,
      allHierarchyValid: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allAntiTPoseGeometry: true,
    });
    expect(telemetry?.handPose).toMatchObject({
      contract: 'source-glb-animated-middle-ring-finger-descendants-v1',
      expectedBoneCount: 4,
      allPresent: true,
      allDescendantOfWrist: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allFinite: true,
    });
    const armPose = telemetry?.armPose as {
      bones: Array<{ bindQuaternionDeltaRadians: number; inEffectivelyVisibleSkinnedMesh: boolean }>;
      chains: Array<{ hierarchyPath: string[]; antiTPoseGeometry: boolean; shoulderToWristVerticalDrop: number; elbowFlexRadians: number }>;
      commonEffectiveSkinnedMeshes: string[];
    };
    const posedBones = armPose.bones;
    expect(posedBones).toHaveLength(6);
    expect(posedBones.every(({ bindQuaternionDeltaRadians }) => bindQuaternionDeltaRadians > 0.05)).toBe(true);
    expect(posedBones.every(({ inEffectivelyVisibleSkinnedMesh }) => inEffectivelyVisibleSkinnedMesh)).toBe(true);
    expect(armPose.commonEffectiveSkinnedMeshes).toContain('Swat_Body');
    expect(armPose.chains.map(({ hierarchyPath }) => hierarchyPath)).toEqual([
      ['UpperArmL', 'LowerArmL', 'WristL'],
      ['UpperArmR', 'LowerArmR', 'WristR'],
    ]);
    expect(armPose.chains.every(({ antiTPoseGeometry, shoulderToWristVerticalDrop, elbowFlexRadians }) => (
      antiTPoseGeometry && shoulderToWristVerticalDrop >= 0.08 && elbowFlexRadians >= 0.12
    ))).toBe(true);
    const handPose = telemetry?.handPose as {
      bones: Array<{ bone: string; wristDescendantPath: string[]; bindQuaternionDeltaRadians: number }>;
    };
    expect(handPose.bones.map(({ bone }) => bone)).toEqual(['Middle2L', 'Ring2L', 'Middle2R', 'Ring2R']);
    expect(handPose.bones.every(({ wristDescendantPath, bindQuaternionDeltaRadians }) => (
      wristDescendantPath.length === 3 && bindQuaternionDeltaRadians >= 0.12
    ))).toBe(true);
  });
});
