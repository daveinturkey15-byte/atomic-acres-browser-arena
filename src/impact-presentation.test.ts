import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ImpactPresentation } from './impact-presentation';

describe('pooled impact presentation', () => {
  it('bounds debris and marks and expires both pools', () => {
    const scene = new THREE.Scene();
    const presentation = new ImpactPresentation(scene);
    for (let index = 0; index < 40; index += 1) {
      presentation.impact(new THREE.Vector3(index * 0.01, 1, 0), new THREE.Vector3(0, 0, 1), index % 2 ? 'metal' : 'concrete');
    }
    expect(presentation.activeParticles()).toBeLessThanOrEqual(72);
    expect(presentation.activeMarks()).toBe(32);
    expect(scene.getObjectByName('pooled-surface-impact-marks')).toBe(presentation.marks);
    presentation.update(9);
    expect(presentation.activeParticles()).toBe(0);
    expect(presentation.activeMarks()).toBe(0);
  });
});
