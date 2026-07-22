import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';
import { grassBypassReason, grassProfileConfig, GrassSystem } from './grass-system';

const source = readFileSync(new URL('./grass-system.ts', import.meta.url), 'utf8');
const signalSource = readFileSync(new URL('./atomic-signal.ts', import.meta.url), 'utf8');

describe('Pass 30 living-grass system', () => {
  it('freezes explicit profile budgets and bypasses Compatibility, software renderers and query opt-out', () => {
    expect(grassProfileConfig('blender')).toMatchObject({
      enabled: true,
      instanceLimit: 2_400,
      bladeLimit: 7_200,
      triangleLimit: 43_200,
      chunkLimit: 4,
      maximumDistance: 54,
      interactionRadius: 2.65,
    });
    expect(grassProfileConfig('performance')).toMatchObject({
      enabled: true,
      instanceLimit: 1_200,
      bladeLimit: 3_600,
      triangleLimit: 21_600,
      chunkLimit: 4,
      maximumDistance: 38,
    });
    expect(grassProfileConfig('compat').enabled).toBe(false);
    expect(grassBypassReason('blender', 'NVIDIA GeForce RTX', null)).toBeNull();
    expect(grassBypassReason('blender', 'Google SwiftShader', null)).toBe('software-renderer');
    expect(grassBypassReason('blender', 'Google SwiftShader', 'on')).toBeNull();
    expect(grassBypassReason('performance', 'NVIDIA GeForce RTX', 'off')).toBe('query-disabled');
  });

  it('creates bounded presentation-only chunks and samples the actual collider-filtered instances', () => {
    const scene = new THREE.Scene();
    const exclusion = { minX: -33.35, maxX: -24, minZ: -42.35, maxZ: -20 };
    const system = new GrassSystem(
      scene,
      'blender',
      'NVIDIA GeForce RTX',
      null,
      [exclusion],
      arenaLightingProfile('blender'),
    );
    system.update(3.25, new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(10_000, 1.7, 10_000), true);
    const telemetry = system.telemetry();
    expect(telemetry).toMatchObject({
      pass: 30,
      enabled: true,
      instances: 2_400,
      blades: 7_200,
      chunks: 4,
      triangles: 43_200,
      triangleLimit: 43_200,
      perFrameAllocations: 0,
      authoritative: false,
    });
    expect(telemetry.rejectedByStructure).toBeGreaterThan(0);
    expect(system.root.userData).toMatchObject({ presentationOnly: true, blocksShots: false });
    expect(system.root.children.every((node) => node.userData.presentationOnly === true && node.userData.blocksShots === false)).toBe(true);

    const remote = system.sampleDebugBend(0)!;
    expect(remote.flatten).toBe(0);
    expect(
      remote.x < exclusion.minX || remote.x > exclusion.maxX
      || remote.z < exclusion.minZ || remote.z > exclusion.maxZ,
    ).toBe(true);
    system.setDebugInteraction(remote.x, remote.z);
    system.update(3.25, new THREE.Vector3(remote.x, 1.7, remote.z), new THREE.Vector3(10_000, 1.7, 10_000), false);
    expect(system.sampleDebugBend(0)!.flatten).toBeGreaterThan(0.99);
    system.setDebugInteraction(null, null);
    system.update(3.25, new THREE.Vector3(remote.x, 1.7, remote.z), new THREE.Vector3(remote.x, 1.7, remote.z), true);
    expect(system.sampleDebugBend(0)!.flatten).toBeGreaterThan(0.99);
    system.update(3.25, new THREE.Vector3(10_000, 1.7, 10_000), new THREE.Vector3(remote.x, 1.7, remote.z), true);
    expect(system.telemetry().visibleChunks).toBe(0);
    system.dispose();
    expect(scene.getObjectByName('pass30-living-grass')).toBeUndefined();
  });

  it('keeps output chunks renderer-conditional so Atomic Signal receives linear scene color and direct render receives one transform', () => {
    expect(source).toContain('toneMapped: true');
    expect(source).toContain('#include <tonemapping_fragment>');
    expect(source).toContain('#include <colorspace_fragment>');
    // Three injects instanceColor for coloured InstancedMesh programs. An
    // explicit duplicate declaration is rejected by WebKit's strict compiler.
    expect(source).not.toContain('attribute vec3 instanceColor');
    expect(source).toContain('vInstanceColor = instanceColor');
    expect(source).toContain('mesh.setColorAt(index, tint)');
    expect(signalSource).toContain('renderer.toneMapping = THREE.NoToneMapping');
    expect(signalSource).toContain('this.renderer.toneMapping = this.screenToneMapping');
  });

  it('reports a truthful inert system on software rendering', () => {
    const scene = new THREE.Scene();
    const system = new GrassSystem(scene, 'blender', 'Google SwiftShader', null, [], arenaLightingProfile('blender'));
    expect(system.telemetry()).toMatchObject({ enabled: false, bypassReason: 'software-renderer', blades: 0, chunks: 0, triangles: 0 });
    expect(system.sampleDebugBend(0)).toBeNull();
    system.dispose();
  });
});
