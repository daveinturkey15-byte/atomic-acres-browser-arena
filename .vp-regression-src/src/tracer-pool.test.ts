import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
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

  it('prewarms every fixed-buffer segment in view at live scale and restores active state', async () => {
    const scene = new THREE.Scene();
    const pool = new TracerPool(scene);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
    camera.position.set(4, 3, 8);
    camera.lookAt(0, 1, -10);
    camera.updateProjectionMatrix();
    pool.lines.position.set(1.5, -0.25, 0.75);
    pool.lines.rotation.set(0.05, -0.1, 0.02);
    pool.lines.scale.setScalar(1.15);
    pool.lines.updateMatrix();
    pool.lines.frustumCulled = true;
    pool.emit(new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6), 0x99ccff, 0.12);

    const positionAttribute = pool.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttribute = pool.lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positionsBefore = Array.from(positionAttribute.array);
    const colorsBefore = Array.from(colorAttribute.array);
    const transformBefore = pool.lines.matrix.clone();
    const activeBefore = pool.activeCount();
    const visibleBefore = pool.lines.visible;

    let calls = 0;
    await pool.prewarm({
      compileAndRender: async (root, renderCamera, renderScene) => {
        calls += 1;
        expect(root).toBe(pool.lines);
        expect(renderCamera).toBe(camera);
        expect(renderScene).toBe(scene);
        expect(pool.lines.visible).toBe(true);
        expect(pool.lines.frustumCulled).toBe(false);

        const positions = positionAttribute.array as Float32Array;
        const colors = colorAttribute.array as Float32Array;
        expect(positions).toHaveLength(MAX_TRACERS * 6);
        expect(colors).toHaveLength(MAX_TRACERS * 6);
        for (let slot = 0; slot < MAX_TRACERS; slot += 1) {
          const offset = slot * 6;
          const start = pool.lines.localToWorld(new THREE.Vector3(
            positions[offset],
            positions[offset + 1],
            positions[offset + 2],
          ));
          const end = pool.lines.localToWorld(new THREE.Vector3(
            positions[offset + 3],
            positions[offset + 4],
            positions[offset + 5],
          ));
          expect(start.distanceTo(end)).toBeCloseTo(5.5, 4);
          const projected = start.clone().add(end).multiplyScalar(0.5).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          expect(projected.z).toBeGreaterThan(-1);
          expect(projected.z).toBeLessThan(1);
          for (let channel = 0; channel < 6; channel += 1) {
            expect(colors[offset + channel]).toBeGreaterThan(0);
          }
        }
      },
    }, camera, 7);

    expect(calls).toBe(1);
    expect(Array.from(positionAttribute.array)).toEqual(positionsBefore);
    expect(Array.from(colorAttribute.array)).toEqual(colorsBefore);
    expect(pool.activeCount()).toBe(activeBefore);
    expect(pool.lines.visible).toBe(visibleBefore);
    expect(pool.lines.frustumCulled).toBe(true);
    expect(pool.lines.matrix.equals(transformBefore)).toBe(true);

    await pool.prewarm({ compileAndRender: async () => { calls += 1; } }, camera, 7);
    expect(calls).toBe(1);
    await pool.prewarm({ compileAndRender: async () => { calls += 1; } }, camera, 8);
    expect(calls).toBe(2);
  });

  it('serializes different scene generations and retries a failed generation', async () => {
    const pool = new TracerPool(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const releases: Array<() => void> = [];
    let calls = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const runtime = {
      compileAndRender: async () => {
        calls += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => {
          releases.push(() => {
            concurrent -= 1;
            resolve();
          });
        });
      },
    };

    const first = pool.prewarm(runtime, camera, 1);
    const second = pool.prewarm(runtime, camera, 2);
    expect(calls).toBe(1);
    releases.shift()!();
    await first;
    await vi.waitFor(() => expect(calls).toBe(2));
    releases.shift()!();
    await second;
    expect(maxConcurrent).toBe(1);

    let attempts = 0;
    const flakyRuntime = {
      compileAndRender: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('synthetic GPU failure');
      },
    };
    await expect(pool.prewarm(flakyRuntime, camera, 3)).rejects.toThrow('synthetic GPU failure');
    await expect(pool.prewarm(flakyRuntime, camera, 3)).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });
});
