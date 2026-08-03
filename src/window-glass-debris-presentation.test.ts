import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
  WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
  createFracturedWindowDebrisVisual,
  prewarmFracturedWindowDebrisVisual,
} from './window-glass-debris-presentation';

describe('persistent window glass debris presentation', () => {
  it('renders separated triangular shards instead of an intact falling pane', () => {
    const halfExtents = { x: 0.7, y: 0.6, z: 0.03 };
    const root = createFracturedWindowDebrisVisual({
      id: 'window-debris:test-pane',
      halfExtents,
      reducedRenderMode: false,
    });
    const shards = root.getObjectByName('window-debris:test-pane:shard-cluster');
    expect(root.userData).toMatchObject({
      windowGlassDebrisContract: WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
      fragmentCount: WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
      intactPaneMeshCount: 0,
    });
    expect(shards).toBeInstanceOf(THREE.Mesh);
    const geometry = (shards as THREE.Mesh).geometry;
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(geometry).not.toBeInstanceOf(THREE.BoxGeometry);
    expect(geometry.getAttribute('position').count).toBe(WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT * 3);
    expect(geometry.userData).toMatchObject({
      fragmentCount: WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
      intactPane: false,
    });

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const shardScale = (shards as THREE.Mesh).scale;
    let shardArea = 0;
    for (let offset = 0; offset < positions.count; offset += 3) {
      const a = new THREE.Vector2(positions.getX(offset) * shardScale.x, positions.getY(offset) * shardScale.y);
      const b = new THREE.Vector2(positions.getX(offset + 1) * shardScale.x, positions.getY(offset + 1) * shardScale.y);
      const c = new THREE.Vector2(positions.getX(offset + 2) * shardScale.x, positions.getY(offset + 2) * shardScale.y);
      shardArea += Math.abs(b.clone().sub(a).cross(c.clone().sub(a))) / 2;
    }
    const intactPaneArea = halfExtents.x * halfExtents.y * 4;
    expect(shardArea).toBeGreaterThan(intactPaneArea * 0.2);
    expect(shardArea).toBeLessThan(intactPaneArea * 0.6);
  });

  it('reuses analysed shard buffers and submits them during deployment prewarm', async () => {
    const first = createFracturedWindowDebrisVisual({
      id: 'window-debris:first', halfExtents: { x: 0.7, y: 0.6, z: 0.03 }, reducedRenderMode: false,
    });
    const second = createFracturedWindowDebrisVisual({
      id: 'window-debris:second', halfExtents: { x: 0.5, y: 0.4, z: 0.02 }, reducedRenderMode: false,
    });
    expect((first.getObjectByName('window-debris:first:shard-cluster') as THREE.Mesh).geometry)
      .toBe((second.getObjectByName('window-debris:second:shard-cluster') as THREE.Mesh).geometry);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(camera);
    let submittedRoot: THREE.Object3D | null = null;
    await prewarmFracturedWindowDebrisVisual({
      compileAndRender: async (root, submittedCamera, submittedScene) => {
        expect(root.parent).toBe(scene);
        expect(submittedCamera).toBe(camera);
        expect(submittedScene).toBe(scene);
        submittedRoot = root;
      },
    }, camera, scene, false);
    expect(submittedRoot).not.toBeNull();
    expect(submittedRoot!.parent).toBeNull();
  });

  it('wires the authoritative window breach to the fractured visual helper', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const start = source.indexOf('function spawnPersistentWindowDebris');
    const end = source.indexOf('function clearPersistentWindowDebris', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toContain('createFracturedWindowDebrisVisual({');
    expect(block).not.toContain('new THREE.BoxGeometry');
  });
});
