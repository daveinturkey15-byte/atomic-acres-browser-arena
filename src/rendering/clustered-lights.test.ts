import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CLUSTERED_LIGHTING_PRECOMPILE_REACH,
  LOCAL_LIGHT_DUSK_START_HOUR,
  LOCAL_LIGHT_FULL_HOUR,
  NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS,
  NUKETOWN2_LOCAL_LIGHT_CATALOG,
  NUKETOWN2_LOCAL_LIGHT_COUNT,
  assertNuketown2ClusteredLightCatalog,
  createNuketown2LocalLights,
  duskLocalLightFade,
} from './clustered-lights';

describe('Nuke Town clustered light catalog', () => {
  it('is derived, mirrored and within the fixed arena budget', () => {
    assertNuketown2ClusteredLightCatalog();
    expect(NUKETOWN2_LOCAL_LIGHT_COUNT).toBe(30);
    expect(NUKETOWN2_LOCAL_LIGHT_COUNT).toBeLessThanOrEqual(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerArena);
    expect(NUKETOWN2_LOCAL_LIGHT_COUNT).toBeGreaterThan(NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerTile);
    for (const pairId of new Set(NUKETOWN2_LOCAL_LIGHT_CATALOG.map((entry) => entry.pairId).filter((id): id is string => id !== null))) {
      const entries = NUKETOWN2_LOCAL_LIGHT_CATALOG.filter((entry) => entry.pairId === pairId);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.position[0]).toBe(-entries[1]!.position[0]);
      expect(entries[0]!.position[1]).toBe(entries[1]!.position[1]);
      expect(entries[0]!.position[2]).toBe(-entries[1]!.position[2]);
    }
    expect(new Set(NUKETOWN2_LOCAL_LIGHT_CATALOG.map((entry) => entry.kind))).toEqual(
      new Set(['window', 'porch', 'garage', 'street', 'appliance', 'vehicle']),
    );
  });

  it('uses a monotone dusk fade curve', () => {
    expect(duskLocalLightFade(LOCAL_LIGHT_DUSK_START_HOUR)).toBe(0);
    expect(duskLocalLightFade(LOCAL_LIGHT_FULL_HOUR)).toBe(1);
    let previous = duskLocalLightFade(0);
    for (let hour = 0.25; hour <= 24; hour += 0.25) {
      const next = duskLocalLightFade(hour);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('keeps per-light values as existing object data and never enables local shadows', () => {
    const scene = new THREE.Scene();
    const rig = createNuketown2LocalLights(scene, true);
    rig.applyLighting('nuketown2', LOCAL_LIGHT_FULL_HOUR);
    expect(rig.lights).toHaveLength(NUKETOWN2_LOCAL_LIGHT_COUNT);
    expect(rig.lights.every((light) => light.castShadow === false && light.intensity > 0)).toBe(true);
    const source = readFileSync(new URL('./clustered-lights.ts', import.meta.url), 'utf8');
    const addonSource = readFileSync(new URL('../../node_modules/three/examples/jsm/tsl/lighting/ClusteredLightsNode.js', import.meta.url), 'utf8');
    expect(source).toContain('binding.light.intensity = binding.baseIntensity * fade;');
    expect(source).not.toContain('light.visible =');
    expect(source).not.toContain('light.castShadow = true');
    expect(addonSource).toContain('new DataTexture(');
    expect(addonSource).toContain('Loop( this.maxLightsPerCluster');
  });

  it('off switch preserves the existing scene path and creates no local lights', () => {
    const scene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambient);
    const rig = createNuketown2LocalLights(scene, false);
    rig.applyLighting('nuketown2', LOCAL_LIGHT_FULL_HOUR);
    expect(rig.enabled).toBe(false);
    expect(rig.lights).toHaveLength(0);
    expect(scene.children.filter((child) => child instanceof THREE.PointLight)).toHaveLength(0);
    expect(ambient.parent).toBe(scene);
    expect(ambient.intensity).toBe(1);
  });

  it('registers the clustered manager before init and reaches the exact cold precompile', () => {
    const runtimeSource = readFileSync(new URL('./render-runtime.ts', import.meta.url), 'utf8');
    const legacySource = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    expect(CLUSTERED_LIGHTING_PRECOMPILE_REACH.beforeCombat).toBe(true);
    expect(CLUSTERED_LIGHTING_PRECOMPILE_REACH.owner).toBe('pass64-exact-scene-pass');
    expect(runtimeSource.indexOf('renderer.lighting = createNuketown2ClusteredLighting();'))
      .toBeLessThan(runtimeSource.indexOf('await renderer.init();'));
    expect(legacySource).toContain('await exactScenePass.precompileExactScenePass(scene);');
  });
});
