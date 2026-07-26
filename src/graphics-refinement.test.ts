import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arenaEnvironmentScale,
  arenaShadowVolume,
  GraphicsRefinementSystem,
  graphicsEffectsBudget,
  SELECTIVE_BLOOM_LAYER,
} from './graphics-refinement';

describe('Pass 62 graphics refinement budgets', () => {
  it('degrades individual effects before exhausting resolution tiers', () => {
    const full = graphicsEffectsBudget('blender', 1);
    const balanced = graphicsEffectsBudget('blender', 0.75);
    const low = graphicsEffectsBudget('blender', 0.65);
    expect(full.tier).toBe('full');
    expect(full.contactShadowStrength).toBeGreaterThan(balanced.contactShadowStrength);
    expect(balanced.bloomStrength).toBeGreaterThan(low.bloomStrength);
    expect(balanced.environmentIntensity).toBeGreaterThan(low.environmentIntensity);
    expect(balanced.particleDensityScale).toBeGreaterThan(low.particleDensityScale);
    expect(low.bloomStrength).toBeGreaterThan(0);
  });

  it('keeps Performance restrained and Compatibility post-free', () => {
    const performance = graphicsEffectsBudget('performance', 0.75);
    const compat = graphicsEffectsBudget('compat', 0.2);
    expect(performance.contactShadowStrength).toBe(0);
    expect(performance.bloomStrength).toBeLessThan(0.06);
    expect(compat.environmentIntensity).toBe(0);
    expect(compat.bloomStrength).toBe(0);
    expect(compat.depthFogStrength).toBe(0);
  });

  it('fits distinct shadow volumes per arena and reserves a presentation-only bloom layer', () => {
    expect(arenaShadowVolume('gun-range').halfHeight).toBeGreaterThan(arenaShadowVolume('rustworks-1v1').halfHeight);
    expect(arenaShadowVolume('atomic-acres')).not.toEqual(arenaShadowVolume('skyline-terminal'));
    const layers = new THREE.Layers();
    layers.enable(SELECTIVE_BLOOM_LAYER);
    expect(layers.isEnabled(SELECTIVE_BLOOM_LAYER)).toBe(true);
  });

  it('keeps neutral IBL subordinate to authored key lights in every arena', () => {
    for (const arenaId of ['atomic-acres', 'rustworks-1v1', 'gun-range', 'skyline-terminal'] as const) {
      expect(arenaEnvironmentScale(arenaId)).toBeGreaterThanOrEqual(0.1);
      expect(arenaEnvironmentScale(arenaId)).toBeLessThanOrEqual(0.3);
    }
    expect(arenaEnvironmentScale('rustworks-1v1')).toBeLessThan(arenaEnvironmentScale('atomic-acres'));
    expect(arenaEnvironmentScale('gun-range')).toBeLessThan(arenaEnvironmentScale('rustworks-1v1'));
  });

  it('applies requested anisotropy and reflection scaling to real material properties', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.8, envMapIntensity: 1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    scene.add(mesh);
    const refinement = new GraphicsRefinementSystem(null, scene, 'blender', false, 1, 16, 0.62);
    refinement.refine(scene, 8);
    expect(texture.anisotropy).toBe(8);
    expect(material.envMapIntensity).toBeCloseTo(0.62);
    expect(refinement.telemetry()).toMatchObject({ requestedAnisotropy: 16, reflectionScale: 0.62 });
    refinement.dispose();
  });
});
