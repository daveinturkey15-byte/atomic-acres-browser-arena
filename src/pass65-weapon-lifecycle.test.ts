import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  capturePass65PresentationGeneration,
  invalidatePass65PresentationTree,
  isPass65PresentationGenerationCurrent,
  releasePass65WeaponModelsIn,
} from './weapon-model';

describe('Pass 65 weapon presentation lifecycle', () => {
  it('invalidates every pending continuation in a retired presentation tree', () => {
    const root = new THREE.Group();
    const operator = new THREE.Group();
    const weapon = new THREE.Group();
    operator.userData.pass65PresentationGeneration = 4;
    const captured = capturePass65PresentationGeneration(operator);
    root.add(operator);
    operator.add(weapon);

    expect(invalidatePass65PresentationTree(root)).toBe(3);
    expect(root.userData.pass65PresentationRetired).toBe(true);
    expect(operator.userData.pass65PresentationRetired).toBe(true);
    expect(weapon.userData.pass65PresentationRetired).toBe(true);
    expect(operator.userData.pass65PresentationGeneration).toBe(5);
    expect(isPass65PresentationGenerationCurrent(operator, captured)).toBe(false);
  });

  it('releases every nested managed cache ref exactly once after a fence', () => {
    const root = new THREE.Group();
    const first = new THREE.Group();
    const second = new THREE.Group();
    first.userData.pass65ManagedCacheKey = 'world:carbine';
    second.userData.pass65ManagedCacheKey = 'world:mp5';
    root.add(first, second);

    expect(releasePass65WeaponModelsIn(root)).toBe(2);
    expect(first.userData.pass65ManagedCacheReleased).toBe(true);
    expect(second.userData.pass65ManagedCacheReleased).toBe(true);
    expect(releasePass65WeaponModelsIn(root)).toBe(0);
  });
});
