import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HIP_VIEWMODEL_POSITION, HIP_VIEWMODEL_SCALE, WeaponPresentation } from './weapon-presentation';

const REST_POSE = {
  dt: 1 / 60,
  moving: false,
  sprinting: false,
  crouched: false,
  prone: false,
  ads: false,
  phase: 0,
  landingImpulse: 0,
  lateralSpeed: 0,
  reloadProgress: null,
};

describe('first-person anatomical presentation', () => {
  it('starts materially smaller, lower and farther right at the hip', () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    expect(presentation.root.scale.x).toBeCloseTo(HIP_VIEWMODEL_SCALE, 8);
    expect(presentation.root.scale.y).toBeCloseTo(HIP_VIEWMODEL_SCALE, 8);
    expect(presentation.root.scale.z).toBeCloseTo(HIP_VIEWMODEL_SCALE, 8);
    expect(presentation.root.position.toArray()).toEqual([
      HIP_VIEWMODEL_POSITION.x,
      HIP_VIEWMODEL_POSITION.y,
      HIP_VIEWMODEL_POSITION.z,
    ]);
  });

  it('returns to the full-size dynamically centred sight picture in ADS', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    for (let frame = 0; frame < 180; frame += 1) presentation.update({ ...REST_POSE, ads: true });
    const state = presentation.presentationState();
    expect(state.adsProgress).toBeGreaterThan(0.999);
    expect(presentation.root.scale.x).toBeCloseTo(0.64, 3);
    expect(state.sightOffset?.[0]).toBeCloseTo(0, 3);
    expect(state.sightOffset?.[1]).toBeCloseTo(0, 3);
  });

  it('preserves detailed PBR sleeve, hand and finger meshes in the quality viewmodel', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms).toBeDefined();

    for (const side of ['left', 'right'] as const) {
      for (const detailName of [`${side}-upper-arm`, `${side}-forearm`, `${side}-palm`, `${side}-thumb`, `${side}-finger-articulated-cluster`]) {
        const detail = arms!.getObjectByName(detailName);
        expect(detail).toBeInstanceOf(THREE.Mesh);
        expect((detail as THREE.Mesh).material).toBeInstanceOf(THREE.MeshStandardMaterial);
      }
      expect(arms!.getObjectByName(`${side}-finger-articulated-cluster`)?.userData.segmentCount).toBe(8);
      expect(arms!.getObjectByName(`${side}-wrist-joint`)).toBeInstanceOf(THREE.Group);
    }

    expect(presentation.presentationState().armMeshCount).toBeGreaterThanOrEqual(16);
  });

  it('pins a readable fire cycle for deterministic visual evidence', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    presentation.fire(0.02);
    presentation.setFireCaptureAgeMs(18);
    presentation.update({
      dt: 1 / 60,
      moving: false,
      sprinting: false,
      crouched: false,
      prone: false,
      ads: false,
      phase: 0,
      landingImpulse: 0,
      lateralSpeed: 0,
      reloadProgress: null,
    });
    expect(presentation.presentationState().fireCycle.flash).toBeGreaterThan(0.1);
    expect(presentation.presentationState().fireCycle.boltTravel).toBeGreaterThan(0.5);
    expect(presentation.presentationState().muzzleFlashMeshCount).toBe(1);
    presentation.setFireCaptureAgeMs(null);
  });

  it('makes a non-scattergun casing visible at the accepted shot boundary', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);

    expect(presentation.presentationState().activeCasings).toBe(0);
    presentation.fire(0.02);

    expect(presentation.presentationState().activeCasings).toBe(1);
  });

  it('shows the knife immediately when melee is accepted', () => {
    const camera = new THREE.PerspectiveCamera();
    const presentation = new WeaponPresentation(camera, false);

    presentation.melee();
    const state = presentation.presentationState();

    expect(state.knifeVisible).toBe(true);
    expect(state.actionContract.meleeProgress).toBe(0);
    expect(state.armsVisible).toBe(true);
    expect(state.meleeArmSource).toBe('headless-procedural-fallback');
    expect(state.proceduralMeleeArmVisible).toBe(true);
    expect(state.browserProceduralMeleeArmViolation).toBe(false);
  });

  it('never floats a passive knife beside a firearm', () => {
    const camera = new THREE.PerspectiveCamera();
    const presentation = new WeaponPresentation(camera, false);
    const initial = presentation.presentationState();
    expect(initial.passiveKnifeVisible).toBe(false);
    expect(initial.passiveKnifeModel).toBe(true);
    expect(presentation.root.getObjectByName('field-knife-blade')).toBeInstanceOf(THREE.Mesh);

    presentation.melee();
    presentation.fire(0.02);
    presentation.update({ ...REST_POSE });
    const fired = presentation.presentationState();
    expect(fired.shotsPresented).toBe(1);
    expect(fired.knifeVisible).toBe(false);
    expect(fired.passiveKnifeVisible).toBe(false);
  });

  it('keeps every visible arm mesh opaque throughout ADS', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    await presentation.load();
    for (let frame = 0; frame < 180; frame += 1) presentation.update({ ...REST_POSE, ads: true });
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms?.visible).toBe(true);
    arms?.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        expect(material.transparent).toBe(false);
        expect(material.opacity).toBe(1);
        expect(material.depthWrite).toBe(true);
      }
    });
  });

  it('rotates the authored minigun barrel cluster before the first legal shot', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false);
    await presentation.load();
    presentation.setWeapon('minigun', true);
    const barrels = presentation.root.getObjectByName('minigun-barrel-cluster');
    expect(barrels).toBeDefined();
    const startingAngle = barrels!.rotation.z;
    for (let frame = 0; frame < 12; frame += 1) {
      presentation.update({ ...REST_POSE, triggerHeld: true });
    }
    expect(presentation.presentationState().minigunSpool).toMatchObject({ phase: 'spooling-up' });
    expect(presentation.minigunSpoolFraction()).toBeGreaterThan(0);
    expect(barrels!.rotation.z).not.toBe(startingAngle);
    expect(presentation.presentationState().shotsPresented).toBe(0);
  });

  it('keeps the complete articulated hand silhouette in the reduced presentation', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, true);
    const arms = presentation.root.getObjectByName('first-person-arms');
    let meshes = 0;
    arms?.traverse((node) => { if (node instanceof THREE.Mesh) meshes += 1; });
    expect(meshes).toBe(6);
    expect((arms?.getObjectByName('left-glove') as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((arms?.getObjectByName('right-glove') as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    for (const side of ['left', 'right'] as const) {
      const glove = arms?.getObjectByName(`${side}-glove`) as THREE.Mesh;
      expect(glove.geometry.getAttribute('position').count).toBeGreaterThan(300);
      expect(glove.userData.style).toBe('atomic-tactical-v3-detailed');
      expect(glove.userData.cuffConnected).toBe(true);
      expect(glove.userData.sourcePartCount).toBeGreaterThanOrEqual(10);
      const material = glove.material as THREE.MeshBasicMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(1);
      const colors = glove.geometry.getAttribute('color') as THREE.BufferAttribute;
      const uniqueColors = new Set<string>();
      for (let index = 0; index < colors.count; index += 1) {
        uniqueColors.add(`${colors.getX(index).toFixed(3)}:${colors.getY(index).toFixed(3)}:${colors.getZ(index).toFixed(3)}`);
      }
      expect(uniqueColors.size).toBeGreaterThanOrEqual(3);
    }
  });
});
