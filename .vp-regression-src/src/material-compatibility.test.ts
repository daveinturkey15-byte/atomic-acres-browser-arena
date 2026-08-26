import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tuneMaterialsForAtomicSignal } from './material-compatibility';

function texture(colorSpace: THREE.ColorSpace): THREE.Texture {
  const value = new THREE.Texture();
  value.colorSpace = colorSpace;
  value.anisotropy = 1;
  return value;
}

describe('Atomic Signal material compatibility', () => {
  it('marks colour textures as sRGB and PBR data textures as linear', () => {
    const map = texture(THREE.NoColorSpace);
    const normalMap = texture(THREE.SRGBColorSpace);
    const roughnessMap = texture(THREE.SRGBColorSpace);
    const material = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 0.1, metalness: 1 });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

    const audit = tuneMaterialsForAtomicSignal(root, null, 'blender', 16);

    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normalMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(roughnessMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(map.anisotropy).toBe(8);
    expect(normalMap.anisotropy).toBe(8);
    expect(material.roughness).toBe(0.28);
    expect(material.metalness).toBe(0.82);
    expect(audit).toMatchObject({
      materials: 1,
      colorTexturesCorrected: 1,
      dataTexturesCorrected: 2,
      roughnessAdjusted: 1,
      metalnessAdjusted: 1,
    });
  });

  it('is idempotent and protects first-person dark values from environment lift', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x050709, roughness: 0.7, metalness: 0.2 });
    const protectedRoot = new THREE.Group();
    protectedRoot.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const scene = new THREE.Scene();
    scene.add(protectedRoot);

    const first = tuneMaterialsForAtomicSignal(scene, protectedRoot, 'performance', 4);
    const second = tuneMaterialsForAtomicSignal(scene, protectedRoot, 'performance', 4);

    expect(first.darkSurfacesLifted).toBe(0);
    expect(second).toMatchObject({
      colorTexturesCorrected: 0,
      dataTexturesCorrected: 0,
      anisotropyAdjusted: 0,
      darkSurfacesLifted: 0,
      roughnessAdjusted: 0,
      metalnessAdjusted: 0,
    });
  });
});
