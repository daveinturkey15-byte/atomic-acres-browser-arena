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

  it('does not reinterpret an enclosing roof or full-height wall as ground', () => {
    const sampler = new SupportPlacementGroundSampler({
      bounds: { minY: 0, maxY: 26 },
      ceilingY: 18,
      colliders: [
        { minX: -10, maxX: 10, minY: 25.175, maxY: 25.525, minZ: -10, maxZ: 10 },
        { minX: 9.5, maxX: 10, minY: 0, maxY: 25.525, minZ: -10, maxZ: 10 },
        { minX: -10, maxX: 10, minY: -0.2, maxY: 0, minZ: -10, maxZ: 10 },
      ],
      prepareRaycastMeshes: () => [],
    });
    expect(sampler.heightAt(0, 0)).toBe(0);
    expect(sampler.heightAt(9.75, 0)).toBe(0);
  });

  it('skips a presentation-only enclosing roof even when it sits below the flight ceiling', () => {
    const root = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12));
    floor.name = 'gun-range-test-bay-floor';
    floor.position.y = -0.1;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 12));
    roof.name = 'gun-range-test-bay-ceiling';
    roof.position.y = 17;
    root.add(floor, roof);
    root.updateWorldMatrix(true, true);
    const sampler = new SupportPlacementGroundSampler({
      bounds: { minY: 0, maxY: 18 },
      ceilingY: 18,
      colliders: [],
      prepareRaycastMeshes: () => [root],
    });
    expect(sampler.heightAt(0, 0)).toBeCloseTo(0, 8);
  });
});
