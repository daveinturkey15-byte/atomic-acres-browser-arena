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
    hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.3), new THREE.MeshBasicMaterial()));
    const armBones = [
      ['left', 'shoulder', 'UpperArmL', new THREE.Vector3(-0.24, 1.45, 0)],
      ['left', 'elbow', 'LowerArmL', new THREE.Vector3(-0.38, 0, 0)],
      ['left', 'wrist-hand', 'WristL', new THREE.Vector3(-0.34, 0, 0)],
      ['right', 'shoulder', 'UpperArmR', new THREE.Vector3(0.24, 1.45, 0)],
      ['right', 'elbow', 'LowerArmR', new THREE.Vector3(0.38, 0, 0)],
      ['right', 'wrist-hand', 'WristR', new THREE.Vector3(0.34, 0, 0)],
    ].map(([side, role, boneName, position]) => {
      const bone = new THREE.Bone();
      bone.name = String(boneName);
      bone.position.copy(position as THREE.Vector3);
      hips.add(bone);
      return {
        side: side as 'left' | 'right',
        role: role as 'shoulder' | 'elbow' | 'wrist-hand',
        bone,
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
      };
    });
    visual.add(hips);
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
      poseBones: { hips },
      armBindPose: armBones,
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
    const before = armBones.map((bone) => bone.quaternion.clone());

    updateGunRangePresentation(map.root, 9_000);

    expect(operator?.userData.operatorStance).toBe('stand');
    expect(presentation.root.userData.operatorStance).toBeUndefined();
    armBones.forEach((bone, index) => expect(bone.quaternion.angleTo(before[index])).toBeGreaterThan(0));
    const telemetry = riggedOperatorTelemetry(operator!);
    expect(telemetry?.activeClip).toBe('Walk');
    expect(telemetry?.armPose).toMatchObject({
      contract: 'source-glb-bind-arm-chain-v1',
      expectedBoneCount: 6,
      allPresent: true,
      allFinite: true,
    });
    const posedBones = (telemetry?.armPose as { bones: Array<{ bindQuaternionDeltaRadians: number }> }).bones;
    expect(posedBones).toHaveLength(6);
    expect(posedBones.every(({ bindQuaternionDeltaRadians }) => bindQuaternionDeltaRadians > 0)).toBe(true);
  });
});
