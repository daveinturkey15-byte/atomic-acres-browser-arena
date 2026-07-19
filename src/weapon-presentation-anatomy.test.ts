import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WeaponPresentation } from './weapon-presentation';

describe('first-person anatomical presentation', () => {
  it('preserves detailed PBR sleeve, hand and finger meshes in the quality viewmodel', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms).toBeDefined();

    for (const side of ['left', 'right'] as const) {
      for (const detailName of [`${side}-upper-arm`, `${side}-forearm`, `${side}-palm`, `${side}-thumb`, `${side}-finger-0`]) {
        const detail = arms!.getObjectByName(detailName);
        expect(detail).toBeInstanceOf(THREE.Mesh);
        expect((detail as THREE.Mesh).material).toBeInstanceOf(THREE.MeshStandardMaterial);
      }
      expect(arms!.getObjectByName(`${side}-wrist-joint`)).toBeInstanceOf(THREE.Group);
    }

    expect(presentation.presentationState().armMeshCount).toBeGreaterThanOrEqual(30);
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
