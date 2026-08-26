import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { estimateResidentObjectMemory } from './resident-memory';

function texturedMesh(texture: THREE.Texture): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
}

describe('resident renderer memory estimate', () => {
  it('includes detached cached roots and de-duplicates shared resources', () => {
    const activeTexture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    activeTexture.generateMipmaps = false;
    const cachedTexture = new THREE.DataTexture(new Uint8Array(8 * 8 * 4), 8, 8);
    cachedTexture.generateMipmaps = false;
    const scene = new THREE.Scene();
    const activeMesh = texturedMesh(activeTexture);
    scene.add(activeMesh);
    const cachedRoot = new THREE.Group();
    cachedRoot.add(texturedMesh(activeTexture), texturedMesh(cachedTexture));
    expect(cachedRoot.parent).toBeNull();

    const estimate = estimateResidentObjectMemory(scene, [cachedRoot, cachedRoot]);
    expect(estimate).toMatchObject({
      activeTextureBytes: 4 * 4 * 4,
      cachedTextureBytes: 8 * 8 * 4,
      totalTextureBytes: 4 * 4 * 4 + 8 * 8 * 4,
      activeTextures: 1,
      cachedTextures: 1,
      activeGeometries: 1,
      cachedGeometries: 2,
    });
    expect(estimate.totalGeometryBytes).toBe(estimate.activeGeometryBytes + estimate.cachedGeometryBytes);
    expect(estimate.cachedGeometryBytes).toBeGreaterThan(0);
  });

  it('does not count a geometry buffer shared by active and cached geometry twice', () => {
    const sharedPositions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const activeGeometry = new THREE.BufferGeometry();
    activeGeometry.setAttribute('position', new THREE.BufferAttribute(sharedPositions, 3));
    const cachedGeometry = new THREE.BufferGeometry();
    cachedGeometry.setAttribute('position', new THREE.BufferAttribute(sharedPositions, 3));
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(activeGeometry, new THREE.MeshBasicMaterial()));
    const cachedRoot = new THREE.Group();
    cachedRoot.add(new THREE.Mesh(cachedGeometry, new THREE.MeshBasicMaterial()));

    const estimate = estimateResidentObjectMemory(scene, [cachedRoot]);
    expect(estimate.activeGeometryBytes).toBe(sharedPositions.byteLength);
    expect(estimate.cachedGeometryBytes).toBe(0);
    expect(estimate.totalGeometryBytes).toBe(sharedPositions.byteLength);
    expect(estimate.cachedGeometries).toBe(1);
  });

  it('classifies hidden attached resources as resident cache instead of active presentation', () => {
    const visibleTexture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    visibleTexture.generateMipmaps = false;
    const hiddenTexture = new THREE.DataTexture(new Uint8Array(8 * 8 * 4), 8, 8);
    hiddenTexture.generateMipmaps = false;
    const scene = new THREE.Scene();
    scene.add(texturedMesh(visibleTexture));
    const hiddenPrewarmRoot = new THREE.Group();
    hiddenPrewarmRoot.visible = false;
    hiddenPrewarmRoot.add(texturedMesh(hiddenTexture));
    scene.add(hiddenPrewarmRoot);

    const estimate = estimateResidentObjectMemory(scene, []);
    expect(estimate).toMatchObject({
      activeTextureBytes: 4 * 4 * 4,
      cachedTextureBytes: 8 * 8 * 4,
      totalTextureBytes: 4 * 4 * 4 + 8 * 8 * 4,
      activeTextures: 1,
      cachedTextures: 1,
      activeGeometries: 1,
      cachedGeometries: 1,
    });
  });
});
