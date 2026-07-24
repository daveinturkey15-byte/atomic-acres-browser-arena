import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arenaEnvironmentScale,
  arenaShadowVolume,
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
      expect(arenaEnvironmentScale(arenaId)).toBeGreaterThanOrEqual(0.15);
      expect(arenaEnvironmentScale(arenaId)).toBeLessThanOrEqual(0.3);
    }
    expect(arenaEnvironmentScale('rustworks-1v1')).toBeGreaterThan(arenaEnvironmentScale('gun-range'));
  });
});
