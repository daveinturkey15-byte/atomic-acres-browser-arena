import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import { FlamethrowerStreamSystem } from './flamethrower-stream-system';

describe('flamethrower stream presentation', () => {
  it('uses one fixed presentation root and clamps the authored stream to 18 m', () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, false);
    const childCount = scene.children.length;
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -40), 10)).toBe(true);
    expect(scene.children).toHaveLength(childCount);
    expect(system.telemetry()).toMatchObject({
      capacity: FLAMETHROWER_EFFECT.poolCapacity,
      active: 8,
      emissions: 1,
      particlesSpawned: 8,
      lastDistanceM: 18,
      childCount: 2,
    });
  });

  it('bounds active particles and expires them without allocating scene children', () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, true);
    const childCount = scene.children.length;
    for (let index = 0; index < 30; index += 1) {
      system.emit(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -12), index);
    }
    expect(system.telemetry().active).toBeLessThanOrEqual(FLAMETHROWER_EFFECT.maximumActiveParticles);
    expect(system.telemetry().maximumActive).toBeLessThanOrEqual(FLAMETHROWER_EFFECT.maximumActiveParticles);
    expect(system.telemetry().poolExhaustions).toBeGreaterThan(0);
    expect(scene.children).toHaveLength(childCount);
    for (let step = 0; step < 8; step += 1) system.update(0.1);
    expect(system.telemetry().active).toBe(0);
    expect(scene.children).toHaveLength(childCount);
  });

  it('fails closed on invalid/degenerate emissions and clears active presentation', () => {
    const system = new FlamethrowerStreamSystem(new THREE.Scene(), false);
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -0.1), 0)).toBe(false);
    expect(system.emit(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(0, 0, -2), 0)).toBe(false);
    expect(system.telemetry().active).toBe(0);
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -4), 1)).toBe(true);
    system.clear();
    expect(system.telemetry().active).toBe(0);
  });
});
