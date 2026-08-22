import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_WAVES,
  RUSTWORKS_OCEAN_AUTHORITY_ID,
  RUSTWORKS_OCEAN_AMPLITUDE,
  WaterSystem,
  rustworksOceanAmplitude,
  sampleOceanWave,
} from './water-system';

describe('WaterSystem', () => {
  it('builds deep ocean under a raised Rustworks oil-rig deck', () => {
    const scene = new THREE.Scene();
    const water = new WaterSystem(scene);
    water.configure('rustworks-1v1', 'blender');
    expect(water.telemetry()).toMatchObject({
      enabled: true,
      arenaId: 'rustworks-1v1',
      physicsActive: true,
      waterLevel: -19.5,
      waveBands: OCEAN_WAVES.length,
      waveAuthority: RUSTWORKS_OCEAN_AUTHORITY_ID,
    });
    expect(water.telemetry().waveAmp).toBe(RUSTWORKS_OCEAN_AMPLITUDE.blender);
    expect(water.telemetry().nearSize).toBe(960);
    expect(water.telemetry().horizonRadius).toBe(3_200);
    expect(water.root.children.length).toBe(2);
    expect(water.root.getObjectByName('arena-ocean-surface')).toBeTruthy();
    expect(water.root.getObjectByName('arena-ocean-horizon')).toBeTruthy();
    const horizon = water.root.getObjectByName('arena-ocean-horizon') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    expect(horizon.material.fog).toBe(false);
    const surface = water.root.getObjectByName('arena-ocean-surface') as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    expect(surface.material.uniforms.uDeep.value.getHex()).toBe(0x020814);
    water.update(1.25);
    const onDeck = water.samplePhysics(new THREE.Vector3(0, 1.5, 0));
    expect(onDeck.inWater).toBe(false);
    const inOcean = water.samplePhysics(new THREE.Vector3(40, -21, 0), 12.5);
    expect(inOcean.inWater).toBe(true);
    expect(inOcean.buoyancy).toBeGreaterThan(0);
    expect(inOcean.drag).toBeGreaterThan(0.5);
    expect(Number.isFinite(inOcean.surfaceVelocityY)).toBe(true);
  });

  it('uses the same deterministic multi-direction wave field for rendering and physics', () => {
    expect(OCEAN_WAVES).toHaveLength(5);
    expect(rustworksOceanAmplitude('performance')).toBe(1.55);
    expect(rustworksOceanAmplitude('blender')).toBe(1.55);
    const first = sampleOceanWave(42, -18, 7.25, 1.9);
    const repeat = sampleOceanWave(42, -18, 7.25, 1.9);
    const later = sampleOceanWave(42, -18, 8.25, 1.9);
    const elsewhere = sampleOceanWave(-36, 27, 7.25, 1.9);
    expect(repeat.height).toBeCloseTo(first.height, 12);
    expect(later.height).not.toBeCloseTo(first.height, 4);
    expect(elsewhere.height).not.toBeCloseTo(first.height, 4);
    expect(first.normal.length()).toBeCloseTo(1, 6);
    expect(first.normal.y).toBeGreaterThan(0.9);
    expect(Number.isFinite(first.verticalVelocity)).toBe(true);

    const field = [];
    for (let time = 0; time <= 8; time += 0.5) {
      for (let x = -120; x <= 120; x += 12) {
        for (let z = -120; z <= 120; z += 12) {
          field.push(sampleOceanWave(x, z, time, RUSTWORKS_OCEAN_AMPLITUDE.blender));
        }
      }
    }
    const heights = field.map((sample) => sample.height);
    const velocities = field.map((sample) => sample.verticalVelocity);
    expect(Math.max(...heights)).toBeGreaterThan(1);
    expect(Math.min(...heights)).toBeLessThan(-1);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(2.5);
    expect(Math.max(...velocities) - Math.min(...velocities)).toBeGreaterThan(1);
  });

  it('keeps buoyancy authority byte-equivalent across graphics profiles', () => {
    const point = new THREE.Vector3(90, -19.2, 80);
    const time = 7.25;
    const samples = (['compat', 'performance', 'blender'] as const).map((profile) => {
      const water = new WaterSystem(new THREE.Scene());
      water.configure('rustworks-1v1', profile);
      return water.samplePhysics(point, time);
    });
    expect(samples[1]).toEqual(samples[0]);
    expect(samples[2]).toEqual(samples[0]);
  });

  it('stays off for gun range', () => {
    const water = new WaterSystem(new THREE.Scene());
    water.configure('gun-range', 'performance');
    expect(water.telemetry().enabled).toBe(false);
    expect(water.root.visible).toBe(false);
  });

  // HF-358: the water-authoring registry is the single source of water,
  // while presentation ownership prevents a duplicate Farcrysis surface.
  it('drives configuration and CPU authority from the per-arena registry', () => {
    const farcrysis = new WaterSystem(new THREE.Scene());
    farcrysis.configure('farcrysis', 'blender');
    expect(farcrysis.telemetry()).toMatchObject({
      enabled: true,
      physicsActive: true,
      waterLevel: -0.3,
      swimmable: true,
    });
    expect(farcrysis.body?.arenaId).toBe('farcrysis');
    expect(farcrysis.root.visible).toBe(false);

    const rustworks = new WaterSystem(new THREE.Scene());
    rustworks.configure('rustworks-1v1', 'compat');
    expect(rustworks.telemetry()).toMatchObject({ enabled: true, waterLevel: -19.5 });
    expect(rustworks.swimmable).toBe(false);

    const none = new WaterSystem(new THREE.Scene());
    none.configure('skyline-terminal', 'performance');
    expect(none.telemetry()).toMatchObject({ enabled: false, physicsActive: false });
    expect(none.root.visible).toBe(false);
  });

  // CPU buoyancy must sample the SAME frozen band table the WebGPU TSL factory
  // displaces with, rather than a second hand-synchronised copy.
  it('samples physics from the shared ocean-spectrum authority', async () => {
    const { sampleOcean, oceanSpectrumFingerprint, OCEAN_SPECTRUM_AUTHORITY_ID } = await import('./water/ocean-spectrum');
    const water = new WaterSystem(new THREE.Scene());
    water.configure('rustworks-1v1', 'performance');
    const position = new THREE.Vector3(40, -21, 0);
    const time = 12.5;
    const physics = water.samplePhysics(position, time);
    const reference = sampleOcean(position.x, position.z, time, RUSTWORKS_OCEAN_AMPLITUDE.performance);
    expect(physics.surfaceY).toBeCloseTo(-19.5 + reference.height, 12);
    expect(physics.surfaceVelocityY).toBeCloseTo(reference.verticalVelocity, 12);
    const { createOceanTslWater } = await import('./water/ocean-tsl');
    const tsl = createOceanTslWater(water.body!);
    expect(tsl.mesh.userData.oceanSpectrumFingerprint).toBe(oceanSpectrumFingerprint());
    expect(tsl.mesh.userData.waveAuthority).toBe(OCEAN_SPECTRUM_AUTHORITY_ID);
    const { OCEAN_REFERENCE_AMPLITUDE } = await import('./water/ocean-spectrum');
    expect(tsl.mesh.userData.waveAmplitudeUniform.value)
      .toBe(OCEAN_REFERENCE_AMPLITUDE * water.body!.amplitudeScale);
  });

  it('drives the High Seas ocean entirely from shared authoring', () => {
    const water = new WaterSystem(new THREE.Scene());
    water.configure('high-seas', 'blender');
    expect(water.telemetry()).toMatchObject({
      enabled: true,
      arenaId: 'high-seas',
      waterLevel: -2.2,
      nearSize: 960,
      horizonRadius: 3_200,
      physicsActive: true,
      swimmable: false,
      waveAmp: RUSTWORKS_OCEAN_AMPLITUDE.blender * 0.15,
    });
    const surface = water.root.getObjectByName('arena-ocean-surface') as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    expect(surface.position.y).toBe(-2.2);
    expect(surface.material.uniforms.uExcludeDryFootprint.value).toBe(0);
    expect(surface.material.fragmentShader).toContain('float edge = uExcludeDryFootprint *');
    const theoreticalEnvelope = water.telemetry().waveAmp
      * OCEAN_WAVES.reduce((sum, wave) => sum + wave.weight, 0);
    expect(theoreticalEnvelope).toBeCloseTo(0.3545625, 7);
    expect(water.samplePhysics(new THREE.Vector3(0, -3, 0), 0).inWater).toBe(true);
  });

  it('clears shared presentation when switching to retained Farcrysis water', () => {
    const water = new WaterSystem(new THREE.Scene());
    water.configure('high-seas', 'blender');
    water.configure('farcrysis', 'blender');
    expect(water.telemetry()).toMatchObject({
      enabled: true,
      arenaId: 'farcrysis',
      physicsActive: true,
      swimmable: true,
      waterLevel: -0.3,
      waveAmp: RUSTWORKS_OCEAN_AMPLITUDE.blender * 0.2,
      nearSize: 76,
      horizonRadius: 1_400,
    });
    expect(water.root.visible).toBe(false);
    expect(water.samplePhysics(new THREE.Vector3(40, -1, 0), 0).inWater).toBe(true);
  });
});
