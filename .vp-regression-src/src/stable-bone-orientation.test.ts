import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stableDirectionDelta } from './stable-bone-orientation';

function rotated(direction: THREE.Vector3, delta: THREE.Quaternion): THREE.Vector3 {
  return direction.clone().applyQuaternion(delta).normalize();
}

describe('stableDirectionDelta', () => {
  it('uses the preferred bone axis for an exact anti-parallel wrist turn', () => {
    const from = new THREE.Vector3(0, 0, -1);
    const to = new THREE.Vector3(0, 0, 1);
    const preferred = new THREE.Vector3(1, 0, 0);
    const first = stableDirectionDelta(from, to, preferred);
    const second = stableDirectionDelta(from, to, preferred);

    expect(rotated(from, first).distanceTo(to)).toBeLessThan(1e-6);
    expect(first.angleTo(second)).toBeLessThan(1e-8);
    const axis = new THREE.Vector3(first.x, first.y, first.z).normalize();
    expect(Math.abs(axis.dot(preferred))).toBeGreaterThan(0.999);
  });

  it('retains the ordinary shortest arc away from the singularity', () => {
    const from = new THREE.Vector3(0, 0, -1);
    const to = new THREE.Vector3(0.3, -0.2, -0.93).normalize();
    const delta = stableDirectionDelta(from, to, new THREE.Vector3(1, 0, 0));
    expect(rotated(from, delta).distanceTo(to)).toBeLessThan(1e-6);
  });

  it('does not introduce a threshold snap on either side of anti-parallel', () => {
    const from = new THREE.Vector3(0, 0, -1);
    const preferred = new THREE.Vector3(1, 0, 0);
    const leftTarget = new THREE.Vector3(-1e-5, 0, 1).normalize();
    const rightTarget = new THREE.Vector3(1e-5, 0, 1).normalize();
    const left = stableDirectionDelta(from, leftTarget, preferred);
    const right = stableDirectionDelta(from, rightTarget, preferred);

    expect(rotated(from, left).distanceTo(leftTarget)).toBeLessThan(1e-6);
    expect(rotated(from, right).distanceTo(rightTarget)).toBeLessThan(1e-6);
    expect(left.angleTo(right)).toBeLessThan(5e-5);
  });
});
