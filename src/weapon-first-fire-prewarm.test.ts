import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WeaponPresentation } from './weapon-presentation';

type InternalCasing = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  frames: number;
  active: boolean;
};

type InternalSmoke = {
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
};

type InternalPresentation = {
  casings: InternalCasing[];
  smokes: InternalSmoke[];
  smokePositions: Float32Array;
  smokeColors: Float32Array;
  smokePoints: THREE.Points;
  brassGeometry: THREE.BufferGeometry;
  shellGeometry: THREE.BufferGeometry;
  brassMaterial: THREE.Material;
  shellMaterial: THREE.Material;
  casingCursor: number;
  smokeCursor: number;
  shotsPresented: number;
  active: string;
  reloadLastProgress: number;
  models: Map<string, THREE.Object3D>;
};

function internals(presentation: WeaponPresentation): InternalPresentation {
  return presentation as unknown as InternalPresentation;
}

function smokeState(value: InternalSmoke[]) {
  return value.map((smoke) => ({
    velocity: smoke.velocity.toArray(),
    life: smoke.life,
    maxLife: smoke.maxLife,
    active: smoke.active,
  }));
}

function casingState(casing: InternalCasing) {
  return {
    geometry: casing.mesh.geometry,
    material: casing.mesh.material,
    position: casing.mesh.position.toArray(),
    quaternion: casing.mesh.quaternion.toArray(),
    scale: casing.mesh.scale.toArray(),
    visible: casing.mesh.visible,
    velocity: casing.velocity.toArray(),
    life: casing.life,
    frames: casing.frames,
    active: casing.active,
  };
}

function objectState(root: THREE.Object3D) {
  const state: Array<Readonly<{
    name: string;
    visible: boolean;
    position: number[];
    quaternion: number[];
    scale: number[];
  }>> = [];
  root.traverse((node) => state.push({
    name: node.name,
    visible: node.visible,
    position: node.position.toArray(),
    quaternion: node.quaternion.toArray(),
    scale: node.scale.toArray(),
  }));
  return state;
}

describe('retained first-fire GPU prewarm', () => {
  it('submits exact pooled smoke and brass, then restores every staged value and cursor on failure', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    await presentation.load();
    const state = internals(presentation);
    state.casingCursor = 5;
    state.smokeCursor = 6;
    state.smokePoints.visible = false;
    state.smokePositions.forEach((_, index) => { state.smokePositions[index] = index * 0.125 - 3; });
    state.smokeColors.forEach((_, index) => { state.smokeColors[index] = (index % 7) / 7; });
    state.smokes.forEach((smoke, index) => {
      smoke.velocity.set(index + 0.1, index + 0.2, index + 0.3);
      smoke.life = index + 0.4;
      smoke.maxLife = index + 0.5;
      smoke.active = index % 2 === 0;
    });
    const currentCasing = state.casings[state.casingCursor]!;
    currentCasing.mesh.geometry = state.shellGeometry;
    currentCasing.mesh.material = state.shellMaterial;
    currentCasing.mesh.position.set(4, 5, 6);
    currentCasing.mesh.rotation.set(0.7, 0.8, 0.9);
    currentCasing.mesh.scale.set(1.1, 1.2, 1.3);
    currentCasing.mesh.visible = false;
    currentCasing.velocity.set(7, 8, 9);
    currentCasing.life = 3.25;
    currentCasing.frames = 11;
    currentCasing.active = true;

    const before = {
      casingCursor: state.casingCursor,
      smokeCursor: state.smokeCursor,
      shotsPresented: state.shotsPresented,
      smokeVisible: state.smokePoints.visible,
      smokePositions: Array.from(state.smokePositions),
      smokeColors: Array.from(state.smokeColors),
      smokes: smokeState(state.smokes),
      casing: casingState(currentCasing),
    };

    await expect(presentation.prewarmBrowserWeaponFirePresentation('carbine', async (root) => {
      expect(root).toBe(presentation.root);
      expect(state.smokePoints.visible).toBe(true);
      expect(state.smokes[state.smokeCursor]?.active).toBe(true);
      expect(currentCasing.mesh.visible).toBe(true);
      expect(currentCasing.mesh.geometry).toBe(state.brassGeometry);
      expect(currentCasing.mesh.material).toBe(state.brassMaterial);
      expect(currentCasing.active).toBe(true);
      expect(state.casingCursor).toBe(before.casingCursor);
      expect(state.smokeCursor).toBe(before.smokeCursor);
      expect(state.shotsPresented).toBe(0);
      throw new Error('intentional submit failure');
    })).rejects.toThrow('intentional submit failure');

    expect({
      casingCursor: state.casingCursor,
      smokeCursor: state.smokeCursor,
      shotsPresented: state.shotsPresented,
      smokeVisible: state.smokePoints.visible,
      smokePositions: Array.from(state.smokePositions),
      smokeColors: Array.from(state.smokeColors),
      smokes: smokeState(state.smokes),
      casing: casingState(currentCasing),
    }).toEqual(before);
  });

  it('leaves casing zero and shot one for the first subsequent legal fire', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    await presentation.load();
    const state = internals(presentation);

    expect(state.casingCursor).toBe(0);
    expect(state.smokeCursor).toBe(0);
    expect(state.shotsPresented).toBe(0);
    await presentation.prewarmBrowserWeaponFirePresentation('carbine', async () => {
      expect(state.smokePoints.visible).toBe(true);
      expect(state.casings[0]?.mesh.visible).toBe(true);
      expect(state.casings[0]?.mesh.geometry).toBe(state.brassGeometry);
      expect(state.casings[1]?.mesh.visible).toBe(false);
    });
    expect(state.casingCursor).toBe(0);
    expect(state.smokeCursor).toBe(0);
    expect(state.shotsPresented).toBe(0);
    expect(state.smokePoints.visible).toBe(false);
    expect(state.casings[0]?.mesh.visible).toBe(false);

    presentation.fire(0.02);

    expect(state.casingCursor).toBe(1);
    expect(state.shotsPresented).toBe(1);
    expect(state.casings[0]).toMatchObject({ active: true });
    expect(state.casings[0]?.mesh.visible).toBe(true);
    expect(state.casings[0]?.mesh.geometry).toBe(state.brassGeometry);
    expect(state.casings[1]).toMatchObject({ active: false });
  });

  it('stages the imported flare reload pose and restores model/action state when submission throws', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    await presentation.load();
    await presentation.prepareBrowserWeapon('flare-gun');
    const state = internals(presentation);
    const model = state.models.get('flare-gun')!;
    model.position.set(0.3, 0.4, 0.5);
    model.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    model.scale.set(0.9, 1.1, 1.2);
    state.reloadLastProgress = 0.27;
    const before = {
      active: state.active,
      reloadLastProgress: state.reloadLastProgress,
      rootVisible: presentation.root.visible,
      model: objectState(model),
    };
    await expect(presentation.prewarmBrowserWeaponReloadPresentation('flare-gun', async (root) => {
      expect(root).toBe(presentation.root);
      expect(state.active).toBe('flare-gun');
      expect(state.reloadLastProgress).toBe(0.5);
      expect(model.visible).toBe(true);
      throw new Error('intentional reload submit failure');
    })).rejects.toThrow('intentional reload submit failure');
    expect({
      active: state.active,
      reloadLastProgress: state.reloadLastProgress,
      rootVisible: presentation.root.visible,
      model: objectState(model),
    }).toEqual(before);
  });
});
