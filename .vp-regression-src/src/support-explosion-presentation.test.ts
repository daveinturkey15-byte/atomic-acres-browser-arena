import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  SUPPORT_EXPLOSION_DURATION_MS,
  SUPPORT_EXPLOSION_POOL_CAPACITY,
  SupportExplosionPresentation,
} from './support-explosion-presentation';

describe('SupportExplosionPresentation', () => {
  it('constructs one fixed unlit pool before any impact', () => {
    const scene = new THREE.Scene();
    const presentation = new SupportExplosionPresentation(scene, true);
    let lights = 0;
    let flashes = 0;
    presentation.root.traverse((node) => {
      if (node instanceof THREE.Light) lights += 1;
      if (node.name === 'support-blast-flash') flashes += 1;
    });

    expect(presentation.telemetry()).toEqual({
      active: 0,
      capacity: SUPPORT_EXPLOSION_POOL_CAPACITY,
      emitted: 0,
      overflowReuses: 0,
      dynamicLights: 0,
      prewarmed: false,
    });
    expect(lights).toBe(0);
    expect(flashes).toBe(SUPPORT_EXPLOSION_POOL_CAPACITY);
  });

  it('reuses preallocated slots, supports variable radii and expires without disposal', () => {
    const presentation = new SupportExplosionPresentation(new THREE.Scene(), true);
    const firstRoot = presentation.root.children[0];
    const firstFlash = firstRoot.children[0] as THREE.Mesh;
    const geometry = firstFlash.geometry;
    const material = firstFlash.material;

    presentation.emit(new THREE.Vector3(1, 2, 3), 15, 1_000);
    expect(firstRoot.visible).toBe(true);
    expect(firstRoot.position.toArray()).toEqual([1, 2, 3]);
    presentation.update(1_000 + SUPPORT_EXPLOSION_DURATION_MS / 2);
    expect(firstRoot.scale.x).toBeGreaterThan(7);
    expect(firstRoot.scale.x).toBeLessThan(9);
    expect(firstFlash.geometry).toBe(geometry);
    expect(firstFlash.material).toBe(material);

    presentation.update(1_000 + SUPPORT_EXPLOSION_DURATION_MS);
    expect(firstRoot.visible).toBe(false);
    expect(presentation.telemetry().active).toBe(0);
  });

  it('bounds simultaneous impacts and records deterministic oldest-slot reuse', () => {
    const presentation = new SupportExplosionPresentation(new THREE.Scene(), false);
    const firstRoot = presentation.root.children[0];
    for (let index = 0; index < SUPPORT_EXPLOSION_POOL_CAPACITY + 1; index += 1) {
      presentation.emit(new THREE.Vector3(index, 0, 0), 4, 2_000 + index);
    }
    expect(presentation.root.children[0]).toBe(firstRoot);
    expect(firstRoot.position.x).toBe(SUPPORT_EXPLOSION_POOL_CAPACITY);
    expect(presentation.telemetry()).toMatchObject({
      active: SUPPORT_EXPLOSION_POOL_CAPACITY,
      emitted: SUPPORT_EXPLOSION_POOL_CAPACITY + 1,
      overflowReuses: 1,
      dynamicLights: 0,
    });
  });

  it('prewarms every representative live slot in view, restores state, and serializes generations', async () => {
    const scene = new THREE.Scene();
    const presentation = new SupportExplosionPresentation(scene, false);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 120);
    camera.position.set(4, 3, 9);
    camera.lookAt(0, 1, -12);
    presentation.emit(new THREE.Vector3(1, 2, -4), 6, 1_000);
    presentation.update(1_160);
    const snapshot = () => {
      const states: unknown[] = [];
      presentation.root.traverse((node) => {
        states.push({
          visible: node.visible,
          position: node.position.toArray(),
          quaternion: node.quaternion.toArray(),
          scale: node.scale.toArray(),
          frustumCulled: node.frustumCulled,
          opacity: node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial
            ? node.material.opacity
            : null,
        });
      });
      return states;
    };
    const before = snapshot();
    let inspected = 0;
    await presentation.prewarm({
      compileAndRender: async (root, renderCamera, renderScene) => {
        inspected += 1;
        expect(root).toBe(presentation.root);
        expect(renderCamera).toBe(camera);
        expect(renderScene).toBe(scene);
        for (const slotRoot of presentation.root.children) {
          expect(slotRoot.visible).toBe(true);
          expect(slotRoot.scale.x).toBeCloseTo(2.25);
          const projected = slotRoot.getWorldPosition(new THREE.Vector3()).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          const flash = slotRoot.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
          expect(flash.visible).toBe(true);
          expect(flash.material.opacity).toBeCloseTo(0.38);
        }
      },
    }, camera, 6);
    expect(inspected).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(presentation.telemetry()).toMatchObject({ active: 1, emitted: 1, prewarmed: true });

    await presentation.prewarm({ compileAndRender: async () => { inspected += 1; } }, camera, 6);
    expect(inspected).toBe(1);

    const releases: Array<() => void> = [];
    let calls = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const runtime = {
      compileAndRender: async () => {
        calls += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => releases.push(() => { concurrent -= 1; resolve(); }));
      },
    };
    const first = presentation.prewarm(runtime, camera, 7);
    const second = presentation.prewarm(runtime, camera, 8);
    expect(calls).toBe(1);
    releases.shift()!();
    await first;
    await vi.waitFor(() => expect(calls).toBe(2));
    releases.shift()!();
    await second;
    expect(maxConcurrent).toBe(1);
    expect(snapshot()).toEqual(before);
  });
});
