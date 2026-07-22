import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GRENADE_EXPLOSION_DURATION_MS,
  GRENADE_EXPLOSION_POOL_CAPACITY,
  GrenadeExplosionPresentation,
} from './grenade-explosion-presentation';

describe('GrenadeExplosionPresentation', () => {
  it('constructs a fixed unlit pool before any detonation', () => {
    const scene = new THREE.Scene();
    const presentation = new GrenadeExplosionPresentation(scene);
    let lightCount = 0;
    let ringCount = 0;
    presentation.root.traverse((node) => {
      if (node instanceof THREE.Light) lightCount += 1;
      if (node.name === 'grenade-blast-ring') ringCount += 1;
    });

    expect(presentation.telemetry()).toEqual({
      active: 0,
      capacity: GRENADE_EXPLOSION_POOL_CAPACITY,
      dynamicLights: 0,
      prewarmed: false,
    });
    expect(lightCount).toBe(0);
    expect(ringCount).toBe(GRENADE_EXPLOSION_POOL_CAPACITY);
  });

  it('reuses slots and expires them without allocating dynamic lights', () => {
    const presentation = new GrenadeExplosionPresentation(new THREE.Scene());
    const firstRoot = presentation.root.children[0];

    presentation.emit(new THREE.Vector3(1, 2, 3), 1_000);
    expect(presentation.telemetry().active).toBe(1);
    expect(firstRoot.visible).toBe(true);
    expect(firstRoot.position.toArray()).toEqual([1, 2.055, 3]);

    presentation.update(1_000 + GRENADE_EXPLOSION_DURATION_MS);
    expect(presentation.telemetry().active).toBe(0);
    expect(firstRoot.visible).toBe(false);

    for (let index = 0; index < GRENADE_EXPLOSION_POOL_CAPACITY + 1; index += 1) {
      presentation.emit(new THREE.Vector3(index, 0, 0), 2_000 + index);
    }
    expect(presentation.root.children[0]).toBe(firstRoot);
    expect(presentation.telemetry().active).toBe(GRENADE_EXPLOSION_POOL_CAPACITY);
    expect(presentation.telemetry().dynamicLights).toBe(0);
  });
});
