import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SMOKE_PRESENTATION_CARD_COUNT,
  SMOKE_PRESENTATION_LIFETIME_MS,
  SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY,
  SmokeVolumePresentationPool,
  smokePresentationEnvelopeAt,
} from './smoke-volume-presentation';

describe('smoke grenade volume presentation', () => {
  it('has a deterministic dense centre, soft edge and fixed lifetime', () => {
    const start = 1_000;
    const end = start + SMOKE_PRESENTATION_LIFETIME_MS;
    expect(smokePresentationEnvelopeAt(start - 1, start, end).active).toBe(false);
    const dense = smokePresentationEnvelopeAt(start + 1_000, start, end);
    expect(dense).toMatchObject({ active: true, growth: 1 });
    expect(dense.coreOpacity).toBeGreaterThan(0.35);
    expect(dense.coreOpacity).toBeLessThan(0.5);
    expect(dense.edgeOpacity).toBeLessThan(dense.coreOpacity);
    expect(smokePresentationEnvelopeAt(end, start, end).active).toBe(false);
  });

  it('GPU-prewarms every unique smoke slot resource once and restores exact inert state', async () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 2);
    const camera = new THREE.PerspectiveCamera();
    const firstRoot = pool.root.children[0]!;
    const firstInnerCards = firstRoot.getObjectByName('smoke-grenade-inner-density-cards')!;
    firstRoot.scale.set(2, 3, 4);
    firstRoot.frustumCulled = true;
    firstInnerCards.visible = false;
    firstInnerCards.frustumCulled = true;
    const telemetryBefore = pool.telemetry();
    const compileAndRender = vi.fn(async (root: THREE.Object3D, stagedCamera: THREE.Camera, parentScene: THREE.Scene) => {
      expect(root).toBe(pool.root);
      expect(stagedCamera).toBe(camera);
      expect(parentScene).toBe(scene);
      expect(pool.root.children).toHaveLength(2);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const alphaTextures = new Set<THREE.Texture>();
      for (const presentationRoot of pool.root.children) {
        expect(presentationRoot.visible).toBe(true);
        expect(presentationRoot.scale.toArray()).toEqual([4.2, 4.2, 4.2]);
        presentationRoot.traverse((node) => {
          expect(node.visible).toBe(true);
          expect(node.frustumCulled).toBe(false);
          if (!(node instanceof THREE.Mesh)) return;
          geometries.add(node.geometry);
          const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of nodeMaterials) {
            materials.add(material);
            if (material instanceof THREE.MeshBasicMaterial) expect(material.opacity).toBeGreaterThan(0);
            if (material instanceof THREE.MeshBasicMaterial && material.alphaMap) alphaTextures.add(material.alphaMap);
          }
        });
      }
      expect(geometries.size).toBe(4);
      expect(materials.size).toBe(4);
      expect(alphaTextures.size).toBe(4);
    });
    await Promise.all([
      pool.prewarm({ compileAndRender }, camera),
      pool.prewarm({ compileAndRender }, camera),
    ]);
    await pool.prewarm({ compileAndRender }, camera);
    expect(compileAndRender).toHaveBeenCalledTimes(1);
    expect(firstRoot.visible).toBe(false);
    expect(firstRoot.scale.toArray()).toEqual([2, 3, 4]);
    expect(firstRoot.frustumCulled).toBe(true);
    expect(firstInnerCards.visible).toBe(false);
    expect(firstInnerCards.frustumCulled).toBe(true);
    expect(pool.telemetry()).toEqual(telemetryBefore);
  });

  it('restores state after a failed smoke prewarm and permits one clean retry', async () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 1);
    const camera = new THREE.PerspectiveCamera();
    const root = pool.root.children[0]!;
    const failedRuntime = { compileAndRender: vi.fn(async () => { throw new Error('compile failed'); }) };
    await expect(pool.prewarm(failedRuntime, camera)).rejects.toThrow('compile failed');
    expect(root.visible).toBe(false);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    const retryRuntime = { compileAndRender: vi.fn(async () => undefined) };
    await pool.prewarm(retryRuntime, camera);
    expect(retryRuntime.compileAndRender).toHaveBeenCalledTimes(1);
    pool.terminalDispose();
    await expect(pool.prewarm(retryRuntime, camera)).rejects.toThrow('disposed');
  });

  it('rewarms its active gameplay envelope once per arena generation', async () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 1);
    const camera = new THREE.PerspectiveCamera();
    const compileAndRender = vi.fn(async () => undefined);
    await pool.prewarm({ compileAndRender }, camera, 2);
    await pool.prewarm({ compileAndRender }, camera, 2);
    expect(compileAndRender).toHaveBeenCalledTimes(1);
    await pool.prewarm({ compileAndRender }, camera, 3);
    expect(compileAndRender).toHaveBeenCalledTimes(2);
    pool.terminalDispose();
  });

  it('defers terminal disposal until an active smoke GPU prewarm settles', async () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 1);
    const camera = new THREE.PerspectiveCamera();
    const presentationRoot = pool.root.children[0]!;
    let releasePrewarm!: () => void;
    const runtime = {
      compileAndRender: vi.fn(() => new Promise<void>((resolve) => { releasePrewarm = resolve; })),
    };
    const inFlight = pool.prewarm(runtime, camera);
    expect(presentationRoot.scale.toArray()).toEqual([4.2, 4.2, 4.2]);
    pool.terminalDispose();
    expect(pool.root.parent).toBe(scene);
    releasePrewarm();
    await inFlight;
    await Promise.resolve();
    expect(pool.root.parent).toBeNull();
    expect(presentationRoot.parent).toBeNull();
    expect(presentationRoot.scale.toArray()).toEqual([1, 1, 1]);
    expect(pool.telemetry().capacity).toBe(0);
    await expect(pool.prewarm(runtime, camera)).rejects.toThrow('disposed');
  });

  it('uses two bounded draw calls and no per-frame scene allocations', () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 2);
    const roots = [...scene.children];
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      resources.add(node.geometry);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        resources.add(material);
        if (material instanceof THREE.MeshBasicMaterial && material.alphaMap) resources.add(material.alphaMap);
      }
    });
    const disposalSpies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    const lease = pool.emit({ x: 1, y: 2, z: 3 }, 2_000, 14_000, 4.2);
    pool.update(lease, 3_000);
    pool.update(lease, 7_000);
    expect(scene.children).toEqual(roots);
    expect(scene.getObjectByName('smoke-grenade-dense-core')).toBeUndefined();
    expect(scene.getObjectByName('smoke-grenade-inner-density-cards')).toBeInstanceOf(THREE.InstancedMesh);
    expect(scene.getObjectByName('smoke-grenade-soft-edge-cards')).toBeInstanceOf(THREE.InstancedMesh);
    expect((scene.getObjectByName('smoke-grenade-inner-density-cards') as THREE.InstancedMesh).count).toBe(SMOKE_PRESENTATION_CARD_COUNT);
    expect((scene.getObjectByName('smoke-grenade-soft-edge-cards') as THREE.InstancedMesh).count).toBe(SMOKE_PRESENTATION_CARD_COUNT);
    expect(pool.telemetry()).toMatchObject({ capacity: 2, active: 1, liveDisposals: 0 });
    pool.release(lease);
    pool.clear();
    expect(pool.telemetry().active).toBe(0);
    expect(disposalSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY).toBe(12);
    vi.restoreAllMocks();
  });

  it('changes card detail without removing the authoritative smoke presentation', () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 1);
    pool.setQualityScale(0.5);
    const lease = pool.emit({ x: 0, y: 1, z: 0 }, 1_000, 13_000, 4.2);
    pool.update(lease, 2_000);
    expect(pool.telemetry()).toMatchObject({ active: 1, cardsPerVolume: 1, qualityScale: 0.5 });
    expect(scene.getObjectByName('smoke-grenade-inner-density-cards')?.visible).not.toBe(false);
    pool.setQualityScale(0.8);
    expect(pool.telemetry().cardsPerVolume).toBe(3);
  });

  it('collapses redundant cards and edges only for tightly overlapping smoke clusters', () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 4);
    pool.setQualityScale(0.8);
    const first = pool.emit({ x: 0, y: 1, z: 0 }, 1_000, 13_000, 4.2);
    const second = pool.emit({ x: 1, y: 1, z: 0 }, 1_000, 13_000, 4.2);
    const third = pool.emit({ x: 2, y: 1, z: 0 }, 1_000, 13_000, 4.2);
    pool.update(first, 2_000);
    pool.update(second, 2_000);
    pool.update(third, 2_000);
    expect(pool.telemetry()).toMatchObject({
      active: 3,
      cardsPerVolume: 3,
      crowdedVolumes: 3,
      visibleDrawCalls: 4,
    });

    pool.release(first);
    expect(pool.telemetry()).toMatchObject({
      active: 2,
      cardsPerVolume: 3,
      crowdedVolumes: 0,
      visibleDrawCalls: 4,
    });
    const distant = pool.emit({ x: 20, y: 1, z: 0 }, 1_000, 13_000, 4.2);
    pool.update(distant, 2_000);
    expect(pool.telemetry()).toMatchObject({
      active: 3,
      cardsPerVolume: 3,
      crowdedVolumes: 0,
      visibleDrawCalls: 6,
    });
  });

  it('stores every soft alpha mask in the grayscale channel sampled by Three', () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 1);
    const maps: THREE.DataTexture[] = [];
    pool.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (material instanceof THREE.MeshBasicMaterial && material.alphaMap instanceof THREE.DataTexture) {
        maps.push(material.alphaMap);
      }
    });
    expect(maps).toHaveLength(2);
    for (const map of maps) {
      const data = map.image.data as Uint8Array;
      const greenValues: number[] = [];
      for (let offset = 0; offset < data.length; offset += 4) {
        expect(data[offset]).toBe(data[offset + 1]);
        expect(data[offset + 1]).toBe(data[offset + 2]);
        expect(data[offset + 3]).toBe(255);
        greenValues.push(data[offset + 1]!);
      }
      expect(Math.min(...greenValues)).toBe(0);
      expect(Math.max(...greenValues)).toBeGreaterThan(150);
      expect(new Set(greenValues).size).toBeGreaterThan(32);
    }
    pool.terminalDispose();
  });

  it('opens and shifts pooled density when a shot disturbs smoke without allocating scene resources', () => {
    const scene = new THREE.Scene();
    const pool = new SmokeVolumePresentationPool(scene, 1);
    const inner = scene.getObjectByName('smoke-grenade-inner-density-cards') as THREE.InstancedMesh;
    const edge = scene.getObjectByName('smoke-grenade-soft-edge-cards') as THREE.InstancedMesh;
    const innerMaterial = inner.material as THREE.MeshBasicMaterial;
    const edgeMaterial = edge.material as THREE.MeshBasicMaterial;
    const rootsBefore = [...scene.children];
    const lease = pool.emit({ x: 0, y: 1, z: 0 }, 1_000, 13_000, 4.2);
    pool.update(lease, 2_000);
    const denseInnerOpacity = innerMaterial.opacity;
    const denseEdgeOpacity = edgeMaterial.opacity;
    pool.disturb(lease, { x: 1, y: 0.2, z: -0.4 }, 1, 2_000);
    pool.update(lease, 2_001);
    expect(inner.position.length()).toBeGreaterThan(0.3);
    expect(edge.position.length()).toBeGreaterThan(0.2);
    expect(inner.position.dot(edge.position)).toBeLessThan(0);
    expect(innerMaterial.opacity).toBeLessThan(denseInnerOpacity * 0.3);
    expect(edgeMaterial.opacity).toBeLessThan(denseEdgeOpacity * 0.6);
    expect(scene.children).toEqual(rootsBefore);
    expect(pool.telemetry()).toMatchObject({ active: 1, liveDisposals: 0, cardsPerVolume: 3 });
    pool.terminalDispose();
  });
});
