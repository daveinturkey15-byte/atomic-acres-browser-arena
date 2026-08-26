/** One-off slope probe over the farcrysis terrain authority. */
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from '../../src/farcrysis-terrain-authority';

const e = 0.35;
function slope(x: number, z: number): number {
  const dx = (farcrysisTerrainHeight(x + e, z) - farcrysisTerrainHeight(x - e, z)) / (2 * e);
  const dz = (farcrysisTerrainHeight(x, z + e) - farcrysisTerrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}
const buckets = new Map<number, number>();
let maxSlope = 0; let belowWater = 0; let total = 0;
let minH = Infinity; let maxH = -Infinity;
for (let x = -31; x <= 31; x += 0.5) {
  for (let z = -31; z <= 31; z += 0.5) {
    const s = slope(x, z);
    const h = farcrysisTerrainHeight(x, z);
    total += 1;
    if (h < FARCRYSIS_WATER_LEVEL) belowWater += 1;
    minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    maxSlope = Math.max(maxSlope, s);
    const b = Math.min(2.5, Math.floor(s * 10) / 10);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
}
console.log('water level', FARCRYSIS_WATER_LEVEL, 'terrain h range', minH.toFixed(2), maxH.toFixed(2));
console.log('samples', total, 'below water', belowWater, 'maxSlope', maxSlope.toFixed(2));
const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
let cum = 0;
for (const [b, n] of sorted) { cum += n; console.log(`slope<${(b + 0.1).toFixed(1)}: ${cum} (${((cum / total) * 100).toFixed(1)}%)`); }
