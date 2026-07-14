import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WeaponPresentation } from './weapon-presentation';

describe('first-person anatomical presentation', () => {
  it('uses three vertex-coloured animated assemblies per arm', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms).toBeDefined();

    for (const side of ['left', 'right'] as const) {
      for (const assemblyName of [`${side}-upper-arm`, `${side}-forearm`, `${side}-glove`]) {
        const assembly = arms!.getObjectByName(assemblyName);
        expect(assembly).toBeInstanceOf(THREE.Mesh);
        const geometry = (assembly as THREE.Mesh).geometry;
        expect(geometry.getAttribute('position')).toBeDefined();
        expect(geometry.getAttribute('normal')).toBeDefined();
        expect(geometry.getAttribute('color')).toBeDefined();
      }
      expect(arms!.getObjectByName(`${side}-wrist-joint`)).toBeInstanceOf(THREE.Group);
    }

    let meshes = 0;
    arms!.traverse((node) => { if (node instanceof THREE.Mesh) meshes += 1; });
    expect(meshes).toBe(6);
  });

  it('keeps the reduced representation at the same bounded assembly count', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, true);
    const arms = presentation.root.getObjectByName('first-person-arms');
    let meshes = 0;
    arms?.traverse((node) => { if (node instanceof THREE.Mesh) meshes += 1; });
    expect(meshes).toBe(6);
    expect((arms?.getObjectByName('left-glove') as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((arms?.getObjectByName('right-glove') as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
});
