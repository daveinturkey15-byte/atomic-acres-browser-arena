import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SupportPlacementGroundSampler } from './support-placement-ground';

describe('support placement ground sampler', () => {
  it('prepares the render scene once for a full 21-sample Carpet Bomber placement', () => {
    const root = new THREE.Group();
    const raisedDeck = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4));
    raisedDeck.position.y = 3;
    root.add(raisedDeck);
    let preparationCalls = 0;
    const sampler = new SupportPlacementGroundSampler({
      bounds: { minY: -1, maxY: 10 },
      ceilingY: 12,
      colliders: [{ minX: -0.25, maxX: 0.25, minY: -1, maxY: 2, minZ: -0.25, maxZ: 0.25 }],
      prepareRaycastMeshes: () => {
        preparationCalls += 1;
        root.updateWorldMatrix(true, true);
        return [raisedDeck];
      },
    });

    const heights = Array.from({ length: 21 }, () => sampler.heightAt(0, 0));

    expect(preparationCalls).toBe(1);
    expect(heights).toEqual(Array.from({ length: 21 }, () => 3.5));
  });

  it('retains collider authority when it is higher than the presentation hit', () => {
    let preparationCalls = 0;
    const sampler = new SupportPlacementGroundSampler({
      bounds: { minY: 0, maxY: 10 },
      ceilingY: 12,
      colliders: [{ minX: -1, maxX: 1, maxY: 7, minZ: -1, maxZ: 1 }],
      prepareRaycastMeshes: () => {
        preparationCalls += 1;
        return [];
      },
    });

    expect(sampler.heightAt(0, 0)).toBe(7);
    expect(sampler.heightAt(4, 4)).toBe(0);
    expect(preparationCalls).toBe(1);
  });
});
