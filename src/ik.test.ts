import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solveTwoBoneElbow } from './ik';

describe('two-bone arm solver', () => {
  it('keeps both authored segment lengths for a reachable target', () => {
    const shoulder = new THREE.Vector3(0, 0, 0);
    const target = new THREE.Vector3(0.45, -0.2, -0.55);
    const elbow = solveTwoBoneElbow(shoulder, target, 0.56, 0.58, new THREE.Vector3(0.4, -1, 0.2));
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(0.56, 5);
    expect(elbow.distanceTo(target)).toBeCloseTo(0.58, 5);
  });

  it('stays finite and reaches toward targets beyond the chain limit', () => {
    const shoulder = new THREE.Vector3(0, 0, 0);
    const target = new THREE.Vector3(0, 0, -5);
    const elbow = solveTwoBoneElbow(shoulder, target, 0.56, 0.58, new THREE.Vector3(1, -1, 0));
    expect(elbow.toArray().every(Number.isFinite)).toBe(true);
    expect(elbow.z).toBeLessThan(-0.5);
    expect(elbow.length()).toBeCloseTo(0.56, 5);
  });

  it('uses the authored bend hint instead of flipping across the aim ray', () => {
    const shoulder = new THREE.Vector3();
    const target = new THREE.Vector3(0, 0, -0.7);
    const left = solveTwoBoneElbow(shoulder, target, 0.56, 0.58, new THREE.Vector3(-1, -1, 0));
    const right = solveTwoBoneElbow(shoulder, target, 0.56, 0.58, new THREE.Vector3(1, -1, 0));
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });
});
