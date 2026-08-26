import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { withArenaFrustumCullingDisabled } from './arena-coverage-prewarm';

describe('WebGPU arena coverage prewarm', () => {
  it('submits every renderable with culling disabled and restores exact state', async () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    const nested = new THREE.Group();
    mesh.frustumCulled = true;
    points.frustumCulled = false;
    nested.add(points);
    root.add(mesh, nested);
    const submit = vi.fn(async () => {
      expect(mesh.frustumCulled).toBe(false);
      expect(points.frustumCulled).toBe(false);
      expect(nested.frustumCulled).toBe(true);
    });

    await expect(withArenaFrustumCullingDisabled(root, submit)).resolves.toBe(2);
    expect(submit).toHaveBeenCalledOnce();
    expect(mesh.frustumCulled).toBe(true);
    expect(points.frustumCulled).toBe(false);
  });

  it('restores culling when the admitted submission fails', async () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(mesh);

    await expect(withArenaFrustumCullingDisabled(root, async () => {
      expect(mesh.frustumCulled).toBe(false);
      throw new Error('synthetic submission failure');
    })).rejects.toThrow('synthetic submission failure');
    expect(mesh.frustumCulled).toBe(true);
  });
});
