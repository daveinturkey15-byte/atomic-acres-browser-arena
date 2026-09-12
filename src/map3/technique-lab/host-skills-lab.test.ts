/**
 * src/map3/technique-lab/host-skills-lab.test.ts — CPU falsifiers for the
 * SKILLS LAB pure modules: URL classification and embed allowlist, tolerant
 * source/Blender catalog parsing, curated ordering, blocker plans for every
 * blocked register row, and GLB viewer race/dispose behaviour with a fake
 * loader (no GPU, no network, no DOM).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PUBLIC_RECORDS } from './manifest';
import { blockerPlan, classifyUrl, mappingState, parseSourceCatalog, routeToShowcase } from './gallery/sources';
import {
  BUILTIN_BLENDER_ASSETS,
  laneFromCatalogKey,
  mergeAssets,
  parseBlenderCatalog,
  sortCurated,
} from './gallery/blender-catalog';
import { createBlenderViewer, disposeObject } from './gallery/blender-viewer';

const BLOCKED_AT_BASELINE = [15, 22, 24, 25, 30, 32, 44];

describe('URL provided tab helpers', () => {
  it('classifies every recorded URL of all 50 rows without throwing and never embeds X/GitHub', () => {
    expect(PUBLIC_RECORDS).toHaveLength(50);
    let count = 0;
    for (const record of PUBLIC_RECORDS) {
      for (const url of record.sources) {
        const c = classifyUrl(url);
        count += 1;
        if (c.kind === 'x-post' || c.kind === 'x-profile' || c.kind === 'github') expect(c.embed).toBeNull();
      }
    }
    expect(count).toBeGreaterThan(90);
    expect(classifyUrl('https://x.com/a/status/1').kind).toBe('x-post');
    expect(classifyUrl('not a url').kind).toBe('non-http');
    expect(classifyUrl('javascript:alert(1)').kind).toBe('non-http');
  });

  it('embeds only allowlisted players/images with a link fallback otherwise', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').embed).toEqual({
      type: 'iframe',
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
    expect(classifyUrl('https://youtu.be/dQw4w9WgXcQ').embed?.type).toBe('iframe');
    expect(classifyUrl('https://example.com/render.png').embed).toEqual({ type: 'img', src: 'https://example.com/render.png' });
    expect(classifyUrl('http://example.com/render.png').embed).toBeNull();
    expect(classifyUrl('https://taken-game.com/play').embed).toBeNull();
  });

  it('parses a tolerant source catalog and rejects unsafe embed URLs', () => {
    const parsed = parseSourceCatalog({
      schemaVersion: 1,
      updatedAt: '2026-09-12',
      sources: [
        { sourceId: 3, urls: [{ url: 'https://a.example', embedUrl: 'https://evil.example/x' }], skillMappings: [{ skill: 'threejs-game-development', relation: 'informs' }] },
        { sourceId: 3, title: 'dup' },
        { sourceId: 99 },
        'junk',
        { sourceId: 15, blocker: { reason: 'r', unblockAction: 'u', experiment: 'e', test: 't', resources: 'x' } },
      ],
    });
    expect(parsed.sources.size).toBe(2);
    expect(parsed.ignored).toHaveLength(3);
    expect(parsed.sources.get(3)?.urls[0].embedUrl).toBeNull();
    expect(mappingState(parsed.sources.get(3), false, false).label).toBe('mapped to skill');
    expect(mappingState(undefined, true, false).label).toBe('experiment needed');
    expect(mappingState(undefined, false, false).label).toBe('ingestion needed');
    expect(blockerPlan(15, 'lim', parsed.sources.get(15)).origin).toBe('sources-lane catalog');
    expect(parseSourceCatalog(null).sources.size).toBe(0);
  });

  it('gives every baseline-blocked row a concrete unblock action, test and showcase route', () => {
    for (const id of BLOCKED_AT_BASELINE) {
      const plan = blockerPlan(id, 'BLOCKED: recorded limitation', undefined);
      expect(plan.origin).toBe('host default plan');
      expect(plan.reason).toBe('BLOCKED: recorded limitation');
      expect(plan.unblockAction.length).toBeGreaterThan(20);
      expect(plan.test.length).toBeGreaterThan(20);
      expect(routeToShowcase(id)).toContain(`sourceId ${id}`);
    }
    expect(blockerPlan(7, undefined, undefined).origin).toBe('none');
  });
});

describe('Blender catalog', () => {
  it('reads tolerant per-lane catalogs, drops unsafe rows and never invents thumbnails', () => {
    const result = parseBlenderCatalog('houses', {
      schemaVersion: 1,
      assets: [
        { id: 'teal', assetUrl: 'assets/world-studio/blender/houses/teal.glb', qualityRank: 80 },
        { id: 'bad', assetUrl: 'C:/Users/x/file.glb' },
        { id: 'teal', assetUrl: 'assets/world-studio/blender/houses/teal2.glb' },
        { id: 'thumbless', assetUrl: 'assets/world-studio/blender/houses/t.glb', thumbnailUrl: 'https://cdn/x.png' },
        { assetUrl: 'assets/world-studio/blender/houses/noid.glb' },
        7,
      ],
    });
    expect(result.assets.map((a) => a.id)).toEqual(['teal', 'thumbless']);
    expect(result.assets[1].thumbnailUrl).toBeNull();
    expect(result.assets[0].qualityRank).toBe(80);
    expect(result.ignored).toHaveLength(4);
    expect(parseBlenderCatalog('x', { default: { assets: [] } }).assets).toEqual([]);
    expect(parseBlenderCatalog('x', 'nope').ignored).toHaveLength(1);
  });

  it('orders by curated rank, keeps the shipped bus/truck, and refuses duplicate assetUrls across lanes', () => {
    const lane = parseBlenderCatalog('nature', {
      assets: [
        { id: 'rock', assetUrl: 'assets/world-studio/blender/nature/rock.glb', qualityRank: 90 },
        { id: 'weed', assetUrl: 'assets/world-studio/blender/nature/weed.glb' },
        { id: 'bus-copy', assetUrl: 'assets/world-studio/blender/hero-bus.glb', qualityRank: 100 },
      ],
    });
    const merged = mergeAssets([BUILTIN_BLENDER_ASSETS, lane.assets]);
    expect(merged.assets.map((a) => a.id)).toEqual(['rock', 'hero-bus', 'hero-truck', 'weed']);
    expect(merged.ignored[0]).toContain('bus-copy');
    expect(sortCurated([]).length).toBe(0);
    expect(laneFromCatalogKey('/public/assets/world-studio/blender/props/catalog.json')).toBe('props');
    for (const asset of BUILTIN_BLENDER_ASSETS) expect(asset.thumbnailUrl).toBeNull();
  });
});

describe('Blender viewer race and disposal', () => {
  function fakeModel(): { scene: THREE.Group; geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; tex: THREE.Texture } {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const tex = new THREE.Texture();
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geo, mat));
    return { scene, geo, mat, tex };
  }

  it('attaches only the latest request, disposes superseded and replaced models exactly once', async () => {
    const scene = new THREE.Scene();
    const pending = new Map<string, (m: { scene: THREE.Object3D }) => void>();
    const loader = { loadAsync: (url: string) => new Promise<{ scene: THREE.Object3D }>((resolve) => pending.set(url, resolve)) };
    const viewer = createBlenderViewer(scene, loader);
    const a = fakeModel();
    const b = fakeModel();
    const disposed: string[] = [];
    a.geo.dispose = () => disposed.push('a-geo');
    a.tex.dispose = () => disposed.push('a-tex');
    b.geo.dispose = () => disposed.push('b-geo');

    const first = viewer.load('a.glb');
    const second = viewer.load('b.glb');
    pending.get('b.glb')!({ scene: b.scene });
    expect(await second).not.toBeNull();
    expect(scene.children).toContain(b.scene);
    pending.get('a.glb')!({ scene: a.scene });
    expect(await first).toBeNull(); // superseded: never attached, freed immediately
    expect(disposed).toEqual(['a-geo', 'a-tex']);
    expect(scene.children).not.toContain(a.scene);

    viewer.clear();
    expect(disposed).toContain('b-geo');
    expect(scene.children).toHaveLength(0);
    viewer.dispose();
    expect(await viewer.load('c.glb')).toBeNull();
  });

  it('disposeObject frees geometry, materials and texture slots', () => {
    const m = fakeModel();
    const calls: string[] = [];
    m.geo.dispose = () => calls.push('geo');
    m.mat.dispose = () => calls.push('mat');
    m.tex.dispose = () => calls.push('tex');
    disposeObject(m.scene);
    expect(calls.sort()).toEqual(['geo', 'mat', 'tex']);
  });

  function gatedLoader() {
    const pending = new Map<string, { resolve: (m: { scene: THREE.Object3D }) => void; reject: (e: Error) => void }>();
    const loader = {
      loadAsync: (url: string) =>
        new Promise<{ scene: THREE.Object3D }>((resolve, reject) => pending.set(url, { resolve, reject })),
    };
    return { loader, pending };
  }

  function countingModel() {
    const m = fakeModel();
    const counts = { geo: 0, mat: 0, tex: 0 };
    m.geo.dispose = () => void (counts.geo += 1);
    m.mat.dispose = () => void (counts.mat += 1);
    m.tex.dispose = () => void (counts.tex += 1);
    return { ...m, counts };
  }

  it('public clear() invalidates a pending load: it never attaches, frees exactly once, and later loads still work', async () => {
    const scene = new THREE.Scene();
    const { loader, pending } = gatedLoader();
    const viewer = createBlenderViewer(scene, loader);
    const a = countingModel();
    const first = viewer.load('a.glb');
    viewer.clear(); // nothing attached yet — the pending request itself must be cancelled
    pending.get('a.glb')!.resolve({ scene: a.scene });
    expect(await first).toBeNull();
    expect(a.scene.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(viewer.current()).toBeNull();
    expect(a.counts).toEqual({ geo: 1, mat: 1, tex: 1 });

    const b = countingModel();
    const second = viewer.load('b.glb');
    pending.get('b.glb')!.resolve({ scene: b.scene });
    expect(await second).not.toBeNull();
    expect(scene.children).toContain(b.scene);
    expect(b.counts).toEqual({ geo: 0, mat: 0, tex: 0 });
    viewer.clear();
    viewer.clear(); // repeated public clear is resource-neutral
    expect(b.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
    expect(scene.children).toHaveLength(0);
  });

  it('a rejected stale load still surfaces its error but leaves the current model attached', async () => {
    const scene = new THREE.Scene();
    const { loader, pending } = gatedLoader();
    const viewer = createBlenderViewer(scene, loader);
    const first = viewer.load('a.glb');
    const second = viewer.load('b.glb');
    const b = countingModel();
    pending.get('b.glb')!.resolve({ scene: b.scene });
    expect(await second).not.toBeNull();
    pending.get('a.glb')!.reject(new Error('a exploded'));
    await expect(first).rejects.toThrow('a exploded');
    expect(viewer.current()?.root).toBe(b.scene);
    expect(scene.children).toEqual([b.scene]);
    expect(b.counts).toEqual({ geo: 0, mat: 0, tex: 0 });
    viewer.dispose();
    expect(b.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
  });

  it('disposes each resource exactly once across model.dispose, clear, replace and repeated viewer.dispose', async () => {
    const scene = new THREE.Scene();
    const { loader, pending } = gatedLoader();
    const viewer = createBlenderViewer(scene, loader);
    const a = countingModel();
    const first = viewer.load('a.glb');
    pending.get('a.glb')!.resolve({ scene: a.scene });
    const model = await first;
    expect(model).not.toBeNull();
    model!.dispose();
    model!.dispose(); // consumer double-dispose is a no-op
    expect(a.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
    viewer.clear(); // viewer release after consumer dispose must not free again
    expect(a.counts).toEqual({ geo: 1, mat: 1, tex: 1 });

    const b = countingModel();
    const c = countingModel();
    const second = viewer.load('b.glb');
    pending.get('b.glb')!.resolve({ scene: b.scene });
    await second;
    const third = viewer.load('c.glb');
    pending.get('c.glb')!.resolve({ scene: c.scene });
    await third; // replacing b frees it exactly once
    expect(b.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
    expect(scene.children).toEqual([c.scene]);
    viewer.dispose();
    viewer.dispose();
    expect(c.counts).toEqual({ geo: 1, mat: 1, tex: 1 });
    expect(await viewer.load('d.glb')).toBeNull();
    expect(pending.has('d.glb')).toBe(false); // disposed viewer never even starts a request
  });

  it('disposeObject frees a texture shared by several material slots and materials exactly once', () => {
    const tex = new THREE.Texture();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m1 = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex });
    const m2 = new THREE.MeshStandardMaterial({ map: tex });
    const counts = { tex: 0, geo: 0, m1: 0, m2: 0 };
    tex.dispose = () => void (counts.tex += 1);
    geo.dispose = () => void (counts.geo += 1);
    m1.dispose = () => void (counts.m1 += 1);
    m2.dispose = () => void (counts.m2 += 1);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, m1), new THREE.Mesh(geo, [m1, m2]));
    disposeObject(root);
    expect(counts).toEqual({ tex: 1, geo: 1, m1: 1, m2: 1 });
  });
});
