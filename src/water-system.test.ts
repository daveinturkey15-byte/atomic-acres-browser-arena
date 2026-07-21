import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WaterSystem } from './water-system';

describe('WaterSystem', () => {
  it('builds ocean for Rustworks and hides under the island pad', () => {
    const scene = new THREE.Scene();
    const water = new WaterSystem(scene);
    water.configure('rustworks-1v1', 'blender', { halfX: 27, halfZ: 29 });
    expect(water.telemetry()).toMatchObject({ enabled: true, arenaId: 'rustworks-1v1', physicsActive: true });
    expect(water.root.children.length).toBe(1);
    water.update(1.25);
    const inside = water.samplePhysics(new THREE.Vector3(0, 1.5, 0));
    expect(inside.inWater).toBe(false);
    const outside = water.samplePhysics(new THREE.Vector3(40, -0.5, 0));
    expect(outside.inWater).toBe(true);
    expect(outside.buoyancy).toBeGreaterThan(0);
    expect(outside.drag).toBeGreaterThan(0.5);
  });

  it('stays off for gun range', () => {
    const water = new WaterSystem(new THREE.Scene());
    water.configure('gun-range', 'performance', { halfX: 15, halfZ: 42 });
    expect(water.telemetry().enabled).toBe(false);
    expect(water.root.visible).toBe(false);
  });
});
