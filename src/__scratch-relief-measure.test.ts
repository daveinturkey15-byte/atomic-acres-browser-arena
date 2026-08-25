/** SCRATCH measurement harness for the HF-398 relief lane — DELETE BEFORE HANDOFF. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  farcrysisTerrainHeight,
  farcrysisTerrainPhysicsTiles,
} from './farcrysis-terrain-authority';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { buildFarcrysisGrassField } from './farcrysis-grass-field';
import { buildFarcrysis } from './farcrysis';


function interiorGradeWorst(): { worst: number; at: string; maxH: number; minH: number } {
  const half = FARCRYSIS_BOUNDS.maxX;
  let worst = 0;
  let at = '';
  let maxH = -Infinity;
  let minH = Infinity;
  // Interior only: chebyshev < half - 22 (outside shore blend band).
  for (let x = -(half - 23); x <= half - 23; x += 0.5) {
    for (let z = -(half - 23); z <= half - 23; z += 0.5) {
      const h = farcrysisTerrainHeight(x, z);
      if (h > maxH) maxH = h;
      if (h < minH) minH = h;
      const gx = (farcrysisTerrainHeight(x + 0.25, z) - farcrysisTerrainHeight(x - 0.25, z)) / 0.5;
      const gz = (farcrysisTerrainHeight(x, z + 0.25) - farcrysisTerrainHeight(x, z - 0.25)) / 0.5;
      const g = Math.hypot(gx, gz);
      if (g > worst) { worst = g; at = `${x.toFixed(1)},${z.toFixed(1)}`; }
    }
  }
  return { worst, at, maxH, minH };
}

describe('scratch relief measurements', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports baseline numbers', () => {
    const plates = farcrysisTerrainPhysicsTiles();
    console.log('PLATES', plates.length);

    const grade = interiorGradeWorst();
    console.log('INTERIOR', JSON.stringify(grade));
    const scene = new THREE.Scene();
    const t0 = performance.now();
    const stats = buildFarcrysisGrassField(scene);
    const t1 = performance.now();
    console.log('GRASS', JSON.stringify(stats), 'buildMs', (t1 - t0).toFixed(0));

    const scene2 = new THREE.Scene();
    const t2 = performance.now();
    const arena = buildFarcrysis(scene2);
    const t3 = performance.now();
    console.log('BUILD_MS', (t3 - t2).toFixed(0));
    const nav = arena.root.userData.verticalNavigation as { platforms: unknown[] };
    console.log('BOT_PLATFORMS', nav.platforms.length);

    expect(true).toBe(true);
  }, 300_000);
});
