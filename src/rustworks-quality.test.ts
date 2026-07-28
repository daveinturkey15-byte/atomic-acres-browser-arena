import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arenaLightingProfile } from './blender-lighting';
import {
  createRustworksQualityLights,
  enhanceRustworksQualityMaterials,
  ensureRustworksStarfield,
  rustworksLightingTint,
  rustworksQualityTelemetry,
  rustworksQualityLightOcclusion,
  setRustworksQualityPresentationActive,
} from './rustworks-quality';
import { applyRustworksPresentationProfile, buildRustworks1v1 } from './additional-maps';
import { batchStaticMeshes } from './art-kit';

describe('Rustworks Quality Graphics parity', () => {
  it('applies night oil-rig lighting only for Rustworks', () => {
    const base = arenaLightingProfile('blender');
    const rust = rustworksLightingTint(base, 'blender', 'rustworks-1v1');
    const range = rustworksLightingTint(base, 'blender', 'gun-range');
    const skyline = rustworksLightingTint(base, 'blender', 'skyline-terminal');
    const atomic = rustworksLightingTint(base, 'blender', 'atomic-acres');
    expect(atomic.fogColor).toBe(base.fogColor);
    expect(rust.fogColor).not.toBe(base.fogColor);
    // Night: darker sky and a moon/practical-light hierarchy, not broad fill.
    expect(rust.skyTop).toBeLessThan(base.skyTop);
    expect(rust.sunIntensity).toBeGreaterThan(rust.fillIntensity);
    expect(rust.ambientIntensity).toBeLessThan(0.3);
    expect(rust.sunIntensity).toBeLessThan(base.sunIntensity);
    expect(range.fogColor).not.toBe(base.fogColor);
    expect(range.sunIntensity).toBeGreaterThan(range.fillIntensity * 2.5);
    expect(range.ambientIntensity).toBeLessThan(0.45);
    expect(range.godRayStrength).toBe(0);
    expect(skyline.sunIntensity).toBeGreaterThan(skyline.hemisphereIntensity * 3);
    expect(skyline.ambientIntensity).toBeLessThan(0.3);
    expect(skyline.exposure).toBeLessThanOrEqual(1.05);
  });

  it('adds flood lights, starfield, and richer materials for the night rig', () => {
    const scene = new THREE.Scene();
    const map = buildRustworks1v1(scene);
    const lights = createRustworksQualityLights(map.root, 'blender');
    const pointLights = lights.children.filter((node) => node instanceof THREE.PointLight);
    expect(pointLights.length).toBeGreaterThanOrEqual(16);
    // Visible authored fixtures own emission; legacy volumes remain disabled and
    // audited so they cannot illuminate through deck walls or containers.
    expect(lights.children).toHaveLength(pointLights.length);
    expect(pointLights.every((light) => light.intensity === 0 && light.castShadow === false)).toBe(true);
    expect(rustworksQualityLightOcclusion()).toMatchObject({
      activeLocalLights: 0,
      emissiveOnlySources: pointLights.length,
      violations: [],
    });
    expect(lights.getObjectByName('rustworks-flood-housing-0')).toBeUndefined();
    expect(lights.getObjectByName('rustworks-work-bulb-0')).toBeUndefined();
    const enhanced = enhanceRustworksQualityMaterials(map.root, 'blender');
    expect(enhanced).toBeGreaterThan(10);
    const stars = ensureRustworksStarfield(scene, 'rustworks-1v1');
    expect(stars).not.toBeNull();
    expect(stars?.visible).toBe(true);
    setRustworksQualityPresentationActive(true, 'blender');
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1').active).toBe(true);
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1').night).toBe(true);
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1')).toMatchObject({
      activeLocalLights: 0,
      emissiveOnlySources: pointLights.length,
      occlusionViolations: [],
    });
    setRustworksQualityPresentationActive(false, 'blender');
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1').active).toBe(false);
    expect(enhanceRustworksQualityMaterials(map.root, 'performance')).toBe(0);
  });

  it('batches the enhanced static rig without retiring gameplay mesh references', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    applyRustworksPresentationProfile(map.root, 'blender');
    const visibleDraws = () => {
      let count = 0;
      map.root.traverseVisible((node) => {
        if (node instanceof THREE.Mesh) count += Array.isArray(node.material) ? node.material.length : 1;
      });
      return count;
    };
    const before = visibleDraws();
    expect(before).toBeGreaterThan(80);
    enhanceRustworksQualityMaterials(map.root, 'blender');
    const stats = batchStaticMeshes(map.root, map.root, () => '', 'preserve');
    map.root.userData.pass65StaticBatchReady = true;
    applyRustworksPresentationProfile(map.root, 'blender');

    expect(stats.sourceMeshes).toBeGreaterThan(80);
    expect(stats.batches).toBeLessThan(32);
    expect(visibleDraws()).toBeLessThan(before / 2);
    const gameplayRamp = map.root.getObjectByName('rustworks-lower-ramp') as THREE.Mesh;
    expect(gameplayRamp.visible).toBe(false);
    expect(gameplayRamp.userData.staticBatchRendered).toBe(true);
    expect(map.raycastMeshes).toContain(gameplayRamp);
    expect(map.root.getObjectByName('Rustworks arena-render-batches')?.visible).toBe(true);
  });
});
