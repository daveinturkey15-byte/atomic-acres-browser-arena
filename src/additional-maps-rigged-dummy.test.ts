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
    };
    root.userData.operatorRig = {
      rigged: true,
      weaponSocket,
      hitProxyRoot,
      weaponId,
      armPoseBeforeIk: [],
    };
    return root;
  };
  return { ...actual, buildOperator: vi.fn(buildTrainingOperator) };
});

import { buildGunRange, updateGunRangePresentation } from './additional-maps';

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
    const hips = operator?.getObjectByName('Hips') as THREE.Bone;
    const before = hips.quaternion.clone();

    updateGunRangePresentation(map.root, 9_000);

    expect(operator?.userData.operatorStance).toBe('stand');
    expect(presentation.root.userData.operatorStance).toBeUndefined();
    expect(hips.quaternion.equals(before)).toBe(false);
  });
});
