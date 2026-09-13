import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  farcrysisTerrainHeight,
  farcrysisTerrainPhysicsTiles,
} from './farcrysis-terrain-authority';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';

describe('elev probe', () => {
  it('reports max height, worst grade, plate count', () => {
    const half = FARCRYSIS_BOUNDS.maxX;
    let maxH = -Infinity;
    let minH = Infinity;
    let maxX = 0;
    let maxZ = 0;
    for (let x = -half; x <= half; x += 0.5) {
      for (let z = -half; z <= half; z += 0.5) {
        const h = farcrysisTerrainHeight(x, z);
        if (h > maxH) { maxH = h; maxX = x; maxZ = z; }
        if (h < minH) minH = h;
      }
    }
    // Worst grade on 1 m steps across the interior (dist > 24 from shore band).
    let worstGrade = 0;
    let worstAt = '';
    for (let x = -half + 1; x < half; x += 1) {
      for (let z = -half + 1; z < half; z += 1) {
        const cheb = Math.max(Math.abs(x), Math.abs(z));
        if (half - cheb < 26) continue; // inland only; shore band has its own contract
        const gx = Math.abs(farcrysisTerrainHeight(x + 1, z) - farcrysisTerrainHeight(x, z));
        const gz = Math.abs(farcrysisTerrainHeight(x, z + 1) - farcrysisTerrainHeight(x, z));
        const g = Math.max(gx, gz);
        if (g > worstGrade) { worstGrade = g; worstAt = `(${x},${z})`; }
      }
    }
    const plates = farcrysisTerrainPhysicsTiles();
    writeFileSync('artifacts/elev-probe.json', JSON.stringify({
      maxH: +maxH.toFixed(2), at: [maxX, maxZ], minH: +minH.toFixed(2),
      worstGradeInland: +worstGrade.toFixed(2), worstAt,
      plateCount: plates.length,
    }, null, 2));
  }, 300_000);
});
