import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WaterSystem, sampleOceanWave } from './water-system';

describe('WaterSystem', () => {
  it('builds deep ocean under a raised Rustworks oil-rig deck', () => {
    const scene = new THREE.Scene();
    const water = new WaterSystem(scene);
    water.configure('rustworks-1v1', 'blender', { halfX: 27, halfZ: 29 }, { night: true, waterLevel: -16.5 });
    expect(water.telemetry()).toMatchObject({
      enabled: true,
      arenaId: 'rustworks-1v1',
      physicsActive: true,
      waterLevel: -16.5,
    });
    expect(water.telemetry().waveAmp).toBeGreaterThan(1);
    expect(water.telemetry().nearSize).toBe(960);
    expect(water.telemetry().horizonRadius).toBe(3_200);
    expect(water.root.children.length).toBe(2);
    expect(water.root.getObjectByName('arena-ocean-surface')).toBeTruthy();
    expect(water.root.getObjectByName('arena-ocean-horizon')).toBeTruthy();
    const horizon = water.root.getObjectByName('arena-ocean-horizon') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    expect(horizon.material.fog).toBe(false);
    water.update(1.25);
    const onDeck = water.samplePhysics(new THREE.Vector3(0, 1.5, 0));
    expect(onDeck.inWater).toBe(false);
    const inOcean = water.samplePhysics(new THREE.Vector3(40, -17, 0), 12.5);
    expect(inOcean.inWater).toBe(true);
    expect(inOcean.buoyancy).toBeGreaterThan(0);
    expect(inOcean.drag).toBeGreaterThan(0.5);
  });

  it('uses the same deterministic multi-direction wave field for rendering and physics', () => {
    const first = sampleOceanWave(42, -18, 7.25, 1.9);
    const repeat = sampleOceanWave(42, -18, 7.25, 1.9);
    const later = sampleOceanWave(42, -18, 8.25, 1.9);
    const elsewhere = sampleOceanWave(-36, 27, 7.25, 1.9);
    expect(repeat.height).toBeCloseTo(first.height, 12);
    expect(later.height).not.toBeCloseTo(first.height, 4);
    expect(elsewhere.height).not.toBeCloseTo(first.height, 4);
    expect(first.normal.length()).toBeCloseTo(1, 6);
    expect(first.normal.y).toBeGreaterThan(0.9);
  });

  it('stays off for gun range', () => {
    const water = new WaterSystem(new THREE.Scene());
    water.configure('gun-range', 'performance', { halfX: 15, halfZ: 42 });
    expect(water.telemetry().enabled).toBe(false);
    expect(water.root.visible).toBe(false);
  });
});
