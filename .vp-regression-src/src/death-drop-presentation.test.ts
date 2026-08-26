import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DeathDropPresentationPool } from './death-drop-presentation';

describe('DeathDropPresentationPool', () => {
  it('allocates a fixed unlit pool and reuses released slots', () => {
    const scene = new THREE.Scene();
    const pool = new DeathDropPresentationPool(scene, 2);
    expect(pool.telemetry()).toEqual({ capacity: 2, active: 0, prewarmed: false, dynamicLights: 0 });
    expect(scene.getObjectsByProperty('isLight', true)).toHaveLength(0);

    const first = pool.acquire('drop-a', 0xff5533, new THREE.Vector3(1, 2, 3));
    const second = pool.acquire('drop-b', 0x33ccff, new THREE.Vector3(-1, 0, 4));
    expect(pool.telemetry().active).toBe(2);
    expect(() => pool.acquire('drop-c', 0xffffff, new THREE.Vector3())).toThrow('pool exhausted');

    pool.release(first);
    const reused = pool.acquire('drop-c', 0xffffff, new THREE.Vector3(9, 1, -2));
    expect(reused).toBe(first);
    expect(reused.position.toArray()).toEqual([9, 1, -2]);
    expect(second.visible).toBe(true);
  });
});
