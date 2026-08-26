import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  firstPersonArmAnimationState,
  playFirstPersonArmAction,
  resetFirstPersonArmAnimations,
} from './operator-model';
import {
  fireImportedWeapon,
  meleeImportedWeapon,
  reloadImportedWeapon,
  resetImportedWeaponAnimations,
} from './weapon-model';

function actionFixture(names: readonly string[]) {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(names.map((name) => {
    const clip = new THREE.AnimationClip(name, 1, [
      new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]),
    ]);
    return [name, mixer.clipAction(clip)] as const;
  }));
  return { root, mixer, actions };
}

describe('retained presentation animation reset', () => {
  it('stops every imported firearm action without advancing its mixer', () => {
    const fixture = actionFixture(['fire', 'reload', 'melee']);
    fixture.root.userData.importedWeaponRuntime = {
      mixer: fixture.mixer,
      actions: fixture.actions,
      weapon: 'carbine',
    };
    fireImportedWeapon(fixture.root);
    reloadImportedWeapon(fixture.root);
    meleeImportedWeapon(fixture.root);
    fixture.mixer.update(0.2);
    expect([...fixture.actions.values()].filter((action) => action.isRunning())).toHaveLength(3);

    resetImportedWeaponAnimations(fixture.root);

    expect([...fixture.actions.values()].filter((action) => action.isRunning())).toHaveLength(0);
    expect(fixture.mixer.time).toBe(0);
  });

  it('clears the authored arm action identity and mixer pose', () => {
    const fixture = actionFixture(['fire', 'reload', 'melee']);
    fixture.root.userData.firstPersonArmsRuntime = {
      mixer: fixture.mixer,
      actions: fixture.actions,
      activeAction: null,
    };
    expect(playFirstPersonArmAction(fixture.root, 'melee')).toBe(true);
    fixture.mixer.update(0.2);
    expect(firstPersonArmAnimationState(fixture.root)?.activeAction).toBe('melee');

    resetFirstPersonArmAnimations(fixture.root);

    expect(firstPersonArmAnimationState(fixture.root)?.activeAction).toBeNull();
    expect(fixture.actions.get('melee')?.isRunning()).toBe(false);
    expect(fixture.mixer.time).toBe(0);
  });
});
