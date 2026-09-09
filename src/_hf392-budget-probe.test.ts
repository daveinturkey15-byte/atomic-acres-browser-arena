import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildHighSeas } from './high-seas.js';

describe('HF-392 budget probe', () => {
  it('reports draws and triangles', () => {
    const map = buildHighSeas(new THREE.Scene());
    let draws = 0;
    let triangles = 0;
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.visible) return;
      let visible = true;
      for (let p = node.parent; p; p = p.parent) {
        if (!p.visible) { visible = false; break; }
      }
      if (!visible) return;
      draws += (node as unknown as { isInstancedMesh?: boolean; count?: number }).isInstancedMesh
        ? ((node as unknown as { count?: number }).count ?? 1)
        : 1;
      const g = node.geometry;
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    console.log('[hf392-budget]', JSON.stringify({ draws, triangles: Math.round(triangles) }));
    expect(true).toBe(true);
  });
});
