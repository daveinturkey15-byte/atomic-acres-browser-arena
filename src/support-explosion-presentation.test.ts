import { describe, expect, it } from 'vitest';
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
});
