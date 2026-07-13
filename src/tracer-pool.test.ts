import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_TRACERS, TracerPool } from './tracer-pool';

describe('tracer pool', () => {
  it('keeps emissions fixed-capacity and expires them without scene allocation', () => {
    const scene = new THREE.Scene();
    const pool = new TracerPool(scene);
    const childCount = scene.children.length;
    for (let index = 0; index < MAX_TRACERS + 7; index += 1) {
      pool.emit(new THREE.Vector3(index, 1, 0), new THREE.Vector3(index, 1, -10), 0xffcc66);
    }
    expect(pool.activeCount()).toBe(MAX_TRACERS);
    expect(scene.children.length).toBe(childCount);
    expect(scene.getObjectByName('pooled-combat-tracers')).toBe(pool.lines);
    pool.update(0.2);
    expect(pool.activeCount()).toBe(0);
  });

  it('rejects non-finite endpoints', () => {
    const pool = new TracerPool(new THREE.Scene());
    pool.emit(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(), 0xffffff);
    expect(pool.activeCount()).toBe(0);
  });
});
