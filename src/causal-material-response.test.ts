import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  createForgeGlassMaterial,
  FORGE_GLASS_BASE_REFLECTANCE,
  FORGE_GLASS_SKY_HORIZON_SRGB,
  FORGE_GLASS_SKY_SHEEN,
  FORGE_GLASS_SKY_ZENITH_SRGB,
} from './vehicle-forge/materials';

function containsNode(root: unknown, target: unknown, seen = new Set<object>()): boolean {
  if (root === target) return true;
  if (!root || typeof root !== 'object' || seen.has(root)) return false;
  seen.add(root);
  if (Array.isArray(root)) return root.some((value) => containsNode(value, target, seen));
  if ((root as { isNode?: boolean }).isNode !== true) return false;
  return Object.values(root).some((value) => containsNode(value, target, seen));
}

function linearMaxChannel(hex: number): number {
  const color = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return Math.max(color.r, color.g, color.b);
}

describe('causal material response: analytic glass sky-sheen', () => {
  it('adds an emissive sky reflection while keeping the dielectric and render state', () => {
    const material = createForgeGlassMaterial('causal-glass');
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(0.06);
    expect(material.clearcoat).toBe(1);
    expect(material.clearcoatRoughness).toBe(0.04);
    expect(material.ior).toBe(1.52);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.emissiveNode).toBeDefined();
    expect(material.opacityNode).toBeDefined();
    expect(material.roughnessNode).toBeDefined();
  });

  it('keys the sheen on world-up sky gradient times view-space Fresnel reflectance', () => {
    const material = createForgeGlassMaterial('causal-graph');
    // Sky gradient follows the world up; the reflectance follows the existing
    // view-space Fresnel, so opacity stays yaw-invariant while the reflection
    // answers the physical grazing angle.
    expect(containsNode(material.emissiveNode, TSL.normalWorld)).toBe(true);
    expect(containsNode(material.emissiveNode, TSL.normalView)).toBe(true);
    expect(containsNode(material.emissiveNode, TSL.positionViewDirection)).toBe(true);
    // The opacity graph itself is untouched: still no world-space term.
    expect(containsNode(material.opacityNode, TSL.normalWorld)).toBe(false);
  });

  it('adds no texture samplers and keeps the grazing peak below the bloom threshold', () => {
    const material = createForgeGlassMaterial('causal-budget') as unknown as Record<string, unknown>;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'envMap']) {
      expect(material[key]).toBeFalsy();
    }
    expect(FORGE_GLASS_BASE_REFLECTANCE).toBeGreaterThan(0);
    expect(FORGE_GLASS_BASE_REFLECTANCE).toBeLessThan(0.2);
    expect(FORGE_GLASS_SKY_SHEEN).toBeGreaterThan(0);
    const grazingPeak =
      Math.max(linearMaxChannel(FORGE_GLASS_SKY_HORIZON_SRGB), linearMaxChannel(FORGE_GLASS_SKY_ZENITH_SRGB)) *
      1.0 *
      FORGE_GLASS_SKY_SHEEN;
    expect(grazingPeak).toBeLessThan(1.02);
  });
});
