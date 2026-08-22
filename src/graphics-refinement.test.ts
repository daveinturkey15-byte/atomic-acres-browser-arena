import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arenaEnvironmentScale,
  arenaShadowVolume,
  effectivePbrRoughness,
  GraphicsRefinementSystem,
  graphicsEffectsBudget,
  SELECTIVE_BLOOM_LAYER,
} from './graphics-refinement';
import { ARENA_SELECTIONS } from './map-selection';

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
    for (const { id: arenaId } of ARENA_SELECTIONS) {
      expect(arenaEnvironmentScale(arenaId)).toBeGreaterThanOrEqual(0.1);
      expect(arenaEnvironmentScale(arenaId)).toBeLessThanOrEqual(0.3);
    }
    expect(arenaEnvironmentScale('rustworks-1v1')).toBeLessThan(arenaEnvironmentScale('atomic-acres'));
    expect(arenaEnvironmentScale('gun-range')).toBeLessThan(arenaEnvironmentScale('rustworks-1v1'));
    expect(arenaShadowVolume('high-seas')).toEqual({ halfWidth: 32, halfHeight: 58, near: 4, far: 190 });
  });

  it('applies requested anisotropy and reflection scaling to real material properties', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.8, roughness: 0.24, envMapIntensity: 1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    scene.add(mesh);
    const refinement = new GraphicsRefinementSystem(null, scene, 'blender', false, 1, 16, 0.62);
    refinement.refine(scene, 8);
    expect(texture.anisotropy).toBe(8);
    expect(material.envMapIntensity).toBeCloseTo(0.62);
    expect(material.roughness).toBeCloseTo(0.5288);
    expect(refinement.telemetry()).toMatchObject({ requestedAnisotropy: 16, reflectionScale: 0.62 });
    refinement.dispose();
  });

  it('keeps reflection tiers visibly distinct on WebGPU without an environment map', () => {
    expect(effectivePbrRoughness(0.24, false, 1)).toBeCloseTo(0.24);
    expect(effectivePbrRoughness(0.24, false, 0.62)).toBeCloseTo(0.5288);
    expect(effectivePbrRoughness(0.24, false, 0)).toBe(1);

    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ metalness: 0.72, roughness: 0.24 });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const webGpuRefinement = new GraphicsRefinementSystem(null, scene, 'blender', true, 1, 8, 0);
    webGpuRefinement.refine(scene, 8);
    expect(scene.environment).toBeNull();
    expect(material.roughness).toBe(1);
    expect(material.envMapIntensity).toBe(0);
    expect(webGpuRefinement.telemetry()).toMatchObject({ environmentEnabled: false, reflectionScale: 0 });
    webGpuRefinement.dispose();
  });
});
