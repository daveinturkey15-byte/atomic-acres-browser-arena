import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arenaLightingProfile } from './blender-lighting';
import {
  createRustworksQualityLights,
  enhanceRustworksQualityMaterials,
  rustworksLightingTint,
  rustworksQualityTelemetry,
  setRustworksQualityPresentationActive,
} from './rustworks-quality';
import { buildRustworks1v1 } from './additional-maps';

describe('Rustworks Quality Graphics parity', () => {
  it('tints industrial lighting only for Rustworks Quality mode', () => {
    const base = arenaLightingProfile('blender');
    const rust = rustworksLightingTint(base, 'blender', 'rustworks-1v1');
    const atomic = rustworksLightingTint(base, 'blender', 'atomic-acres');
    expect(atomic.fogColor).toBe(base.fogColor);
    expect(rust.fogColor).not.toBe(base.fogColor);
    expect(rust.fillIntensity).toBeGreaterThanOrEqual(base.fillIntensity);
    expect(rust.godRayStrength).toBeGreaterThanOrEqual(base.godRayStrength);
  });

  it('adds local work lights and richer materials under Quality Graphics', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    const lights = createRustworksQualityLights(map.root, 'blender');
    expect(lights.children.some((node) => node instanceof THREE.PointLight)).toBe(true);
    const enhanced = enhanceRustworksQualityMaterials(map.root, 'blender');
    expect(enhanced).toBeGreaterThan(10);
    setRustworksQualityPresentationActive(true, 'blender');
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1').active).toBe(true);
    setRustworksQualityPresentationActive(false, 'blender');
    expect(rustworksQualityTelemetry('blender', 'rustworks-1v1').active).toBe(false);
    expect(enhanceRustworksQualityMaterials(map.root, 'performance')).toBe(0);
  });
});
