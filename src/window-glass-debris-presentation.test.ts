import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
  WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
  createFracturedWindowDebrisVisual,
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
    let shardArea = 0;
    for (let offset = 0; offset < positions.count; offset += 3) {
      const a = new THREE.Vector2(positions.getX(offset), positions.getY(offset));
      const b = new THREE.Vector2(positions.getX(offset + 1), positions.getY(offset + 1));
      const c = new THREE.Vector2(positions.getX(offset + 2), positions.getY(offset + 2));
      shardArea += Math.abs(b.clone().sub(a).cross(c.clone().sub(a))) / 2;
    }
    const intactPaneArea = halfExtents.x * halfExtents.y * 4;
    expect(shardArea).toBeGreaterThan(intactPaneArea * 0.2);
    expect(shardArea).toBeLessThan(intactPaneArea * 0.6);
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
