import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createNuketownReflectionProxy, bindNuketownVehicleReflections } from './nuketown-reflection-proxy';

describe('static Nuketown reflection neighbourhood', () => {
  it('uses finite lightweight geometry and disposes owned resources without disposing the sky', () => {
    const sky = new THREE.Texture();
    const skyDispose = vi.spyOn(sky, 'dispose');
    const proxy = createNuketownReflectionProxy(sky);
    expect(proxy.scene.children.length).toBeLessThanOrEqual(20);
    const geometries = new Set<THREE.BufferGeometry>();
    let triangles = 0;
    for (const child of proxy.scene.children) {
      expect(child).toBeInstanceOf(THREE.Mesh);
      const mesh = child as THREE.Mesh;
      geometries.add(mesh.geometry);
      triangles += mesh.geometry.index!.count / 3;
      const box = new THREE.Box3().setFromObject(mesh);
      expect([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)).toBe(true);
    }
    expect(triangles).toBeLessThanOrEqual(240);
    expect(geometries.size).toBe(1);
    const geometryDispose = vi.spyOn([...geometries][0], 'dispose');
    proxy.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(skyDispose).not.toHaveBeenCalled();
    expect(proxy.scene.children).toHaveLength(0);
  });

  it('binds, updates and removes only the vehicle reflection maps', () => {
    const scene = new THREE.Scene();
    const glass = new THREE.MeshPhysicalMaterial();
    glass.userData.forgeRole = 'glass';
    const wall = new THREE.MeshStandardMaterial();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), glass), new THREE.Mesh(new THREE.BoxGeometry(), wall));
    const texture = new THREE.Texture();
    bindNuketownVehicleReflections(scene, texture, 1);
    expect(glass.envMap).toBe(texture);
    expect(wall.envMap).toBeNull();
    const version = glass.version;
    bindNuketownVehicleReflections(scene, texture, 0.5);
    expect(glass.version).toBe(version); // scalar changes need no pipeline rebuild
    expect(glass.envMapIntensity).toBeCloseTo(0.6);
    bindNuketownVehicleReflections(scene, null, 0);
    expect(glass.envMap).toBeNull();
    expect(glass.envMapIntensity).toBe(0);
  });
});
