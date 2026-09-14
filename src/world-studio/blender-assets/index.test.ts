import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  HERO_BUS_ASSET_PATH,
  HERO_BUS_DIMENSIONS,
  HERO_BUS_PLACEMENT,
  HERO_TRUCK_DIMENSIONS,
  HERO_TRUCK_PLACEMENT,
  createStudioBlenderAssets,
  resolveHeroBusUrl,
} from './index';

/**
 * Focused contract tests for the additive loader. They deliberately do not assert rendered
 * quality or scene playability - those belong to the root's own integration review.
 */
describe('world-studio blender assets', () => {
  it('resolves base-aware URLs rather than assuming a host root', () => {
    expect(resolveHeroBusUrl('/')).toBe(`/${HERO_BUS_ASSET_PATH}`);
    expect(resolveHeroBusUrl('/atomic-acres/')).toBe(`/atomic-acres/${HERO_BUS_ASSET_PATH}`);
    // A base without a trailing slash must still produce exactly one separator.
    expect(resolveHeroBusUrl('/nested')).toBe(`/nested/${HERO_BUS_ASSET_PATH}`);
    expect(resolveHeroBusUrl()).toContain(HERO_BUS_ASSET_PATH);
    expect(resolveHeroBusUrl('/')).not.toMatch(/^https?:/);
  });

  it('declares the brief placement and a footprint inside the 3 x 3.2 x 10 m envelope', () => {
    expect(HERO_BUS_PLACEMENT.position).toEqual([-3.5, 0, 2]);
    expect(HERO_BUS_DIMENSIONS.width).toBeLessThanOrEqual(3.0);
    expect(HERO_BUS_DIMENSIONS.height).toBeLessThanOrEqual(3.2);
    expect(HERO_BUS_DIMENSIONS.length).toBeLessThanOrEqual(10.0);
  });

  it('declares the truck placement and its about 3 x 14 m envelope', () => {
    expect(HERO_TRUCK_PLACEMENT.position).toEqual([3.5, 0, -2]);
    expect(HERO_TRUCK_DIMENSIONS.width).toBeLessThanOrEqual(3.0);
    expect(HERO_TRUCK_DIMENSIONS.length).toBeLessThanOrEqual(14.0);
    // The two props face opposite ways, as in the reference street images.
    expect(HERO_TRUCK_PLACEMENT.headingRadians).not.toBe(HERO_BUS_PLACEMENT.headingRadians);
    // They must not overlap: the bus sits at X -3.5 and the truck at X +3.5.
    const gap = Math.abs(HERO_TRUCK_PLACEMENT.position[0] - HERO_BUS_PLACEMENT.position[0]);
    expect(gap).toBeGreaterThan((HERO_BUS_DIMENSIONS.width + HERO_TRUCK_DIMENSIONS.width) / 2);
  });

  it('matches the shipped truck GLB: declared size and an origin centred along Z', () => {
    // Read the accessor bounds straight out of the binary, so the declared dimensions cannot
    // drift away from the asset the loader actually fetches.
    const glb = readFileSync(
      fileURLToPath(new URL('../../../public/assets/world-studio/blender/hero-truck.glb', import.meta.url)),
    );
    const jsonLength = glb.readUInt32LE(12);
    const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as {
      meshes: { primitives: { attributes: { POSITION: number } }[] }[];
      accessors: { min: number[]; max: number[] }[];
    };
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], accessor.min[axis]);
          max[axis] = Math.max(max[axis], accessor.max[axis]);
        }
      }
    }
    expect(max[0] - min[0]).toBeCloseTo(HERO_TRUCK_DIMENSIONS.width, 2);
    expect(max[1] - min[1]).toBeCloseTo(HERO_TRUCK_DIMENSIONS.height, 2);
    expect(max[2] - min[2]).toBeCloseTo(HERO_TRUCK_DIMENSIONS.length, 2);
    // Centred presentation: the declared placement is the middle of the envelope, not the
    // fifth wheel. Tyre contact stays on the ground plane.
    expect(min[2] + max[2]).toBeCloseTo(0, 3);
    expect(min[1]).toBeGreaterThanOrEqual(0);
    expect(min[1]).toBeLessThan(0.02);
  });

  it('returns a usable root immediately, before anything has loaded', () => {
    const assets = createStudioBlenderAssets({ baseUrl: '/' });
    expect(assets.root).toBeInstanceOf(THREE.Group);
    expect(assets.root.userData.presentationOnly).toBe(true);
    expect(assets.root.children).toHaveLength(0);
    assets.ready.catch(() => undefined);
    assets.dispose();
  });

  it('rejects visibly when the asset cannot be loaded instead of resolving empty', async () => {
    const assets = createStudioBlenderAssets({ baseUrl: '/definitely-not-a-real-base/' });
    await expect(assets.ready).rejects.toBeDefined();
    assets.dispose();
  });

  it('survives repeated dispose and dispose-before-load without throwing', async () => {
    // A distinct base per test: three's FileLoader de-duplicates in-flight requests by URL, so
    // reusing one missing URL across tests couples them.
    const assets = createStudioBlenderAssets({ baseUrl: '/definitely-not-a-real-base-2/' });
    assets.dispose();
    assets.dispose();
    assets.dispose();
    await expect(assets.ready).rejects.toBeDefined();
    expect(assets.root.children).toHaveLength(0);
  });

  it('exposes no collider, spawn or navigation authority', () => {
    const module = { HERO_BUS_ASSET_PATH, HERO_BUS_DIMENSIONS, HERO_BUS_PLACEMENT, createStudioBlenderAssets, resolveHeroBusUrl };
    for (const key of Object.keys(module)) {
      expect(key).not.toMatch(/collider|collision|spawn|navigation|solid/i);
    }
    const assets = createStudioBlenderAssets({ baseUrl: '/' });
    assets.ready.catch(() => undefined);
    expect(Object.keys(assets).sort()).toEqual(['dispose', 'ready', 'root']);
    assets.dispose();
  });
});
