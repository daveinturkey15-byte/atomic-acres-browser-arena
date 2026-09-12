import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  HERO_BUS_ASSET_PATH,
  HERO_BUS_DIMENSIONS,
  HERO_BUS_PLACEMENT,
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
