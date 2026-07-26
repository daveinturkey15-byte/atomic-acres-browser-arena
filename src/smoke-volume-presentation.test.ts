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
    expect(dense.coreOpacity).toBeGreaterThan(0.7);
    expect(dense.edgeOpacity).toBeLessThan(dense.coreOpacity);
    expect(smokePresentationEnvelopeAt(end, start, end).active).toBe(false);
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
    expect(scene.getObjectByName('smoke-grenade-dense-core')).toBeInstanceOf(THREE.Mesh);
    expect(scene.getObjectByName('smoke-grenade-soft-edge-cards')).toBeInstanceOf(THREE.InstancedMesh);
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
    expect(scene.getObjectByName('smoke-grenade-dense-core')?.visible).not.toBe(false);
    pool.setQualityScale(0.8);
    expect(pool.telemetry().cardsPerVolume).toBe(2);
  });
});
