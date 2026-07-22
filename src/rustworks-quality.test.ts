import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arenaLightingProfile } from './blender-lighting';
import {
  createRustworksQualityLights,
  enhanceRustworksQualityMaterials,
  ensureRustworksStarfield,
  rustworksLightingTint,
  rustworksQualityTelemetry,
  setRustworksQualityPresentationActive,
} from './rustworks-quality';
import { buildRustworks1v1 } from './additional-maps';

describe('Rustworks Quality Graphics parity', () => {
  it('applies night oil-rig lighting only for Rustworks', () => {
    const base = arenaLightingProfile('blender');
    const rust = rustworksLightingTint(base, 'blender', 'rustworks-1v1');
    const range = rustworksLightingTint(base, 'blender', 'gun-range');
    const skyline = rustworksLightingTint(base, 'blender', 'skyline-terminal');
    const atomic = rustworksLightingTint(base, 'blender', 'atomic-acres');
    expect(atomic.fogColor).toBe(base.fogColor);
    expect(rust.fogColor).not.toBe(base.fogColor);
    // Night: darker sky, stronger warm fill floods, soft moon key.
    expect(rust.skyTop).toBeLessThan(base.skyTop);
    expect(rust.fillIntensity).toBeGreaterThanOrEqual(base.fillIntensity);
    expect(rust.sunIntensity).toBeLessThan(base.sunIntensity);
    expect(range.fogColor).not.toBe(base.fogColor);
    expect(range.fillIntensity).toBeGreaterThan(range.sunIntensity);
    expect(range.godRayStrength).toBe(0);
    expect(skyline.ambientIntensity).toBeGreaterThan(base.ambientIntensity);
    expect(skyline.hemisphereIntensity).toBeGreaterThanOrEqual(base.hemisphereIntensity);
    expect(skyline.exposure).toBeGreaterThanOrEqual(1.2);
  });

  it('adds flood lights, starfield, and richer materials for the night rig', () => {
    const scene = new THREE.Scene();
    const map = buildRustworks1v1(scene);
    const lights = createRustworksQualityLights(map.root, 'blender');
    const pointLights = lights.children.filter((node) => node instanceof THREE.PointLight);
    expect(pointLights.length).toBeGreaterThanOrEqual(16);
    // Light emitters are invisible; no unsupported fixture cubes/bulbs float in the sky.
    expect(lights.children).toHaveLength(pointLights.length);
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
    setRustworksQualityPresentationActive(false, 'blender');
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1').active).toBe(false);
    expect(enhanceRustworksQualityMaterials(map.root, 'performance')).toBe(0);
  });
});
