import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ArenaId } from './map-selection';
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
    water.configure('rustworks-1v1', 'blender', { halfX: 27, halfZ: 29 }, { night: true, waterLevel: -19.5 });
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
      water.configure('rustworks-1v1', profile, { halfX: 27, halfZ: 29 });
      return water.samplePhysics(point, time);
    });
    expect(samples[1]).toEqual(samples[0]);
    expect(samples[2]).toEqual(samples[0]);
  });

  it('stays off for gun range', () => {
    const water = new WaterSystem(new THREE.Scene());
    water.configure('gun-range', 'performance', { halfX: 15, halfZ: 42 });
    expect(water.telemetry().enabled).toBe(false);
    expect(water.root.visible).toBe(false);
  });

  // HF-358: the water-authoring registry replaces the hard-coded rustworks
  // gate as the single source of which arenas have water.
  it('drives configuration from the per-arena water body registry (HF-358)', () => {
    // HF-358 audit correction: farcrysis is deliberately NOT registered. It authors
    // its own three water layers, so registering it built a SECOND ocean 20mm below
    // the real one - and because the runtime always supplies oceanWaveAmplitude, the
    // authored amplitudeScale of 0.2 never applied and the arena inherited RustRig's
    // storm, cresting ~2m above a play space with a ~1.6m eye height. Registering it
    // again requires replacing the arena's own layers first, not duplicating them.
    const farcrysis = new WaterSystem(new THREE.Scene());
    farcrysis.configure('farcrysis' as ArenaId, 'blender', { halfX: 32, halfZ: 32 });
    expect(farcrysis.body).toBeNull();
    expect(farcrysis.telemetry().enabled).toBe(false);

    // RustRig regression guard: exact pre-HF-358 behaviour preserved.
    const rustworks = new WaterSystem(new THREE.Scene());
    rustworks.configure('rustworks-1v1', 'compat', { halfX: 27, halfZ: 29 });
    expect(rustworks.telemetry()).toMatchObject({ enabled: true, waterLevel: -19.5 });
    expect(rustworks.swimmable).toBe(false);

    // Arenas absent from the registry have no water.
    const none = new WaterSystem(new THREE.Scene());
    none.configure('skyline-terminal', 'performance', { halfX: 34, halfZ: 34 });
    expect(none.telemetry().enabled).toBe(false);
  });

  // HF-358: CPU buoyancy must sample the SAME frozen band table the WebGPU TSL
  // factory displaces with (ocean-spectrum), not a second hand-synced copy.
  it('samples physics from the shared ocean-spectrum authority (HF-358)', async () => {
    const { sampleOcean, oceanSpectrumFingerprint, OCEAN_SPECTRUM_AUTHORITY_ID } = await import('./water/ocean-spectrum');
    const water = new WaterSystem(new THREE.Scene());
    water.configure('rustworks-1v1', 'performance', { halfX: 27, halfZ: 29 });
    const position = new THREE.Vector3(40, -21, 0);
    const time = 12.5;
    const physics = water.samplePhysics(position, time);
    const reference = sampleOcean(position.x, position.z, time, RUSTWORKS_OCEAN_AMPLITUDE.performance);
    expect(physics.surfaceY).toBeCloseTo(-19.5 + reference.height, 12);
    expect(physics.surfaceVelocityY).toBeCloseTo(reference.verticalVelocity, 12);
    // The WebGPU mesh stamps the fingerprint of the table it consumed; both
    // sides reading one frozen table means these strings are identical.
    const { createOceanTslWater } = await import('./water/ocean-tsl');
    const tsl = createOceanTslWater(water.body!);
    expect(tsl.mesh.userData.oceanSpectrumFingerprint).toBe(oceanSpectrumFingerprint());
    expect(tsl.mesh.userData.waveAuthority).toBe(OCEAN_SPECTRUM_AUTHORITY_ID);
    // Authored body amplitude = reference amplitude x host-authoritative scale.
    const { OCEAN_REFERENCE_AMPLITUDE } = await import('./water/ocean-spectrum');
    const { waterBodyForArena } = await import('./water/water-authoring');
    const rustworksBody = waterBodyForArena('rustworks-1v1')!;
    expect(tsl.mesh.userData.waveAmplitudeUniform.value)
      .toBe(OCEAN_REFERENCE_AMPLITUDE * rustworksBody.amplitudeScale);
  });

  // HF-358 fix: the WebGL2 GLSL presentation must displace with the SAME
  // Gerstner band table the CPU buoyancy sampler reads — previously it used
  // the legacy warped-sine field and drifted ~1m from the drawn surface.
  // This parses the band constants injected into the built vertex shader and
  // re-evaluates them against sampleOcean() so the two cannot silently drift.
  it('builds the WebGL2 surface from the buoyancy spectrum, not the legacy warped sine (HF-358)', async () => {
    const { sampleOcean } = await import('./water/ocean-spectrum');
    const scene = new THREE.Scene();
    const water = new WaterSystem(scene);
    water.configure('rustworks-1v1', 'compat', { halfX: 27, halfZ: 29 });
    const mesh = scene.getObjectByName('arena-ocean-surface') as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const vertexShader = mesh.material.vertexShader;
    // The legacy warp terms must be gone from the presentation path.
    expect(vertexShader).not.toContain('warpPhase');
    expect(vertexShader).toContain('sampleBand');
    // Re-evaluate every injected band call exactly as GLSL would.
    const calls = [...vertexShader.matchAll(/sampleBand\(p,\s*vec2\(([-\d.]+), ([-\d.]+)\),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*vec2\(([-\d.]+), ([-\d.]+)\)\)/g)].map((m) => m.slice(1).map(Number));
    expect(calls).toHaveLength(5);
    const amp = mesh.material.uniforms.uAmp.value;
    const time = 12.5;
    for (const [x, z] of [[40, 0], [-120, 80], [7, -333], [210, 210]] as const) {
      let height = 0;
      let slopeX = 0;
      let slopeZ = 0;
      for (const [dx, dz, k, omega, weight, phase] of calls) {
        const ph = (x * dx + z * dz) * k - time * omega + phase;
        height += Math.sin(ph) * weight * amp;
        slopeX += Math.cos(ph) * weight * amp * k * dx;
        slopeZ += Math.cos(ph) * weight * amp * k * dz;
      }
      const cpu = sampleOcean(x, z, time, amp);
      expect(height).toBeCloseTo(cpu.height, 9);
      expect(slopeX).toBeCloseTo(cpu.slopeX, 9);
      expect(slopeZ).toBeCloseTo(cpu.slopeZ, 9);
    }
    // Gameplay contract: identical gameplay surface height for the same input
    // regardless of render profile (WebGL2 compat vs any other profile).
    const point = new THREE.Vector3(64, -20, -48);
    const profiles = (['compat', 'performance', 'blender'] as const).map((profile) => {
      const w = new WaterSystem(new THREE.Scene());
      w.configure('rustworks-1v1', profile, { halfX: 27, halfZ: 29 });
      return w.samplePhysics(point, time);
    });
    expect(profiles[1].surfaceY).toBe(profiles[0].surfaceY);
    expect(profiles[2].surfaceY).toBe(profiles[0].surfaceY);
    expect(profiles[1].buoyancy).toBe(profiles[0].buoyancy);
  });
});
