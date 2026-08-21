import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FRAG_GRENADE_ASSET,
  FRAG_GRENADE_MAX_DIMENSION,
  GRENADE_WORLD_PRESENTATION_POOL_CAPACITY_PER_FAMILY,
  GrenadeWorldPresentationPool,
  SEMTEX_BUNDLE_ASSET,
  SEMTEX_BUNDLE_MAX_DIMENSION,
  createGrenadePresentation,
  disposeGrenadePresentation,
  grenadePresentationFamily,
  grenadePresentationTelemetry,
} from './grenade-presentation';

function glbJson(path: string): { nodes?: Array<{ name?: string }>; materials?: Array<{ name?: string }> } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

describe('conventional fragmentation grenade presentation', () => {
  it('ships an authored Blender GLB with a normal frag silhouette and mechanical parts', () => {
    expect(FRAG_GRENADE_ASSET).toBe('./assets/original/models/frag-grenade.glb');
    const gltf = glbJson('public/assets/original/models/frag-grenade.glb');
    const nodeNames = (gltf.nodes ?? []).map((node) => node.name);
    const materialNames = (gltf.materials ?? []).map((material) => material.name);
    expect(nodeNames).toContain('AtomicAcres_FragGrenade');
    expect(nodeNames).toContain('Frag_Body');
    expect(nodeNames).toContain('Frag_FuseHead');
    expect(nodeNames).toContain('Frag_PullRing');
    expect(nodeNames).toContain('Frag_SafetyLever');
    expect(materialNames).toEqual(expect.arrayContaining(['Olive cast steel', 'Phosphate fuse', 'Safety lever', 'Pull pin']));
    expect(nodeNames.some((name) => /cross|holy|jewel|crown/i.test(name ?? ''))).toBe(false);
  });

  it('keeps a small original fallback while the GLB is unavailable or loading', () => {
    expect(grenadePresentationTelemetry().status).toBe('idle');
    expect(FRAG_GRENADE_MAX_DIMENSION).toBeLessThanOrEqual(0.5);
    const root = createGrenadePresentation();
    expect(root.name).toBe('frag-grenade-fallback');
    expect(root.userData.authoredGrenade).toBe(false);
    expect(root.getObjectByName('fallback-frag-body')).toBeTruthy();
    expect(root.getObjectByName('fallback-frag-lever')).toBeTruthy();
    expect(root.getObjectByName('fallback-frag-pin-ring')).toBeTruthy();
    disposeGrenadePresentation(root);
    expect(root.parent).toBeNull();
  });
});

describe('Semtex bundle presentation', () => {
  it('uses one exhaustive presentation mapping for player, remote and bot grenade paths', () => {
    expect(grenadePresentationFamily('frag')).toBe('frag');
    expect(grenadePresentationFamily('smoke')).toBe('frag');
    expect(grenadePresentationFamily('flash')).toBe('frag');
    expect(grenadePresentationFamily('semtex')).toBe('semtex');
  });

  it('ships three decreasing authored Blender LODs with bundle semantics and PBR materials', () => {
    expect(SEMTEX_BUNDLE_ASSET).toBe('./assets/original/models/ordnance/semtex-bundle-lod0.glb');
    const lods = [0, 1, 2].map((lod) => glbJson(`public/assets/original/models/ordnance/semtex-bundle-lod${lod}.glb`));
    for (const gltf of lods) {
      const nodeNames = (gltf.nodes ?? []).map((node) => node.name);
      expect(nodeNames).toEqual(expect.arrayContaining([
        'semtex-bundle-root', 'semtex-block-1', 'semtex-block-2', 'semtex-block-3', 'semtex-block-4',
        'semtex-detonator', 'semtex-wire', 'semtex-sticky-pad', 'semtex-held-socket', 'semtex-world-socket',
      ]));
      expect((gltf.materials ?? []).map((material) => material.name)).toContain('Semtex red PBR');
    }
    expect(SEMTEX_BUNDLE_MAX_DIMENSION).toBeLessThanOrEqual(0.6);
  });

  it('never substitutes the frag silhouette while the Semtex GLB is loading', () => {
    const root = createGrenadePresentation('semtex');
    expect(root.name).toBe('semtex-bundle-fallback');
    expect(root.userData.grenadeKind).toBe('semtex');
    expect(root.getObjectByName('fallback-semtex-block-4')).toBeTruthy();
    expect(root.getObjectByName('fallback-semtex-detonator')).toBeTruthy();
    disposeGrenadePresentation(root);
  });

  it('applies the canonical mapping inside the presentation factory', () => {
    const smoke = createGrenadePresentation('smoke');
    const flash = createGrenadePresentation('flash');
    const semtex = createGrenadePresentation('semtex');
    expect(smoke.userData.grenadeKind).toBe('frag');
    expect(flash.userData.grenadeKind).toBe('frag');
    expect(semtex.userData.grenadeKind).toBe('semtex');
    disposeGrenadePresentation(smoke);
    disposeGrenadePresentation(flash);
    disposeGrenadePresentation(semtex);
  });
});

describe('grenade world presentation residency', () => {
  it('bounds both families and reuses the exact warmed Object3D after release', () => {
    const scene = new THREE.Scene();
    const pool = new GrenadeWorldPresentationPool(scene, 2);
    const firstFrag = pool.acquire('smoke');
    const secondFrag = pool.acquire('flash');
    const firstSemtex = pool.acquire('semtex');
    const secondSemtex = pool.acquire('semtex');

    expect(firstFrag).toBeTruthy();
    expect(secondFrag).toBeTruthy();
    expect(firstSemtex).toBeTruthy();
    expect(secondSemtex).toBeTruthy();
    expect(pool.acquire('frag')).toBeNull();
    expect(pool.acquire('semtex')).toBeNull();
    expect(pool.telemetry()).toMatchObject({
      capacityPerFamily: 2,
      total: 4,
      active: 4,
      exhaustions: 2,
      highWater: 4,
      activeByFamily: { frag: 2, semtex: 2 },
      exhaustionsByFamily: { frag: 1, semtex: 1 },
    });

    expect(pool.release(firstFrag!)).toBe(true);
    expect(pool.acquire('frag')).toBe(firstFrag);
    expect(firstFrag!.parent).toBe(pool.root);
    expect(firstFrag!.name).toBe('frag-grenade-fallback');
    expect(firstFrag!.userData.presentationPoolSlot).toBe(0);
    // Six humans can each retain three 5.2 s sticky grenades across the 1.8 s
    // respawn interval; one extra slot covers the globally bounded solo bot.
    expect(GRENADE_WORLD_PRESENTATION_POOL_CAPACITY_PER_FAMILY).toBeGreaterThanOrEqual(19);
    pool.terminalDispose();
    expect(pool.root.parent).toBeNull();
  });

  it('stages the first slot of both families without consuming a live acquisition', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 100);
    camera.position.set(2, 3, 4);
    camera.lookAt(2, 3, 0);
    const pool = new GrenadeWorldPresentationPool(scene, 2);
    let stagedNames: string[] = [];

    await pool.withStagedFirstAcquisitionVocabulary(camera, async () => {
      stagedNames = pool.root.children.filter((root) => root.visible).map((root) => root.name);
      expect(pool.telemetry()).toMatchObject({
        active: 2,
        acquisitions: 0,
        releases: 0,
        exhaustions: 0,
        activeByFamily: { frag: 1, semtex: 1 },
      });
    });

    expect(stagedNames).toEqual(['frag-grenade-fallback', 'semtex-bundle-fallback']);
    expect(pool.root.children.every((root) => root.visible === false)).toBe(true);
    expect(pool.telemetry()).toMatchObject({
      active: 0,
      acquisitions: 0,
      releases: 0,
      exhaustions: 0,
      highWater: 0,
    });
    pool.terminalDispose();
  });
});
