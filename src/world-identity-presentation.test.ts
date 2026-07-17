import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorldIdentityPresentation } from './world-identity-presentation';

describe('Pass 27 world identity presentation', () => {
  it('creates three non-shadowing route lights and nine instanced cues', () => {
    const scene = new THREE.Scene();
    const presentation = createWorldIdentityPresentation(scene, 1, false);
    expect(presentation.routeLights).toBe(3);
    expect(presentation.routeSigns).toBe(3);
    expect(presentation.cueInstances).toBe(0);
    expect(presentation.atmosphericParticles).toBe(0);
    expect(scene.getObjectByName('pass27-world-identity-presentation')).toBe(presentation.root);
    const lights = presentation.root.children.filter((node): node is THREE.PointLight => node instanceof THREE.PointLight);
    expect(lights).toHaveLength(3);
    expect(lights.every((light) => light.castShadow === false && light.intensity === 1)).toBe(true);
  });

  it('removes atmospheric particles but preserves route cues in reduced detail', () => {
    const scene = new THREE.Scene();
    const presentation = createWorldIdentityPresentation(scene, 0.38, true);
    expect(presentation.atmosphericParticles).toBe(0);
    expect(presentation.routeSigns).toBe(3);
    expect(presentation.cueInstances).toBe(0);
    expect(presentation.root.getObjectByName('sunlit-atmospheric-particulates')).toBeUndefined();
  });
});
