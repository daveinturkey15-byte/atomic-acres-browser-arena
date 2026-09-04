#!/usr/bin/env tsx
/**
 * RAID2 surface bake budget.
 *
 * The forge short-circuits when there is no readable 2D canvas, so a headless
 * vitest run pays nothing and CANNOT measure this. The cost that matters is the
 * CPU rasterisation, and it is measured here the same way `src/test-maps-art.ts`
 * records its own ("test2Materials() 666 / 630 ms"): in its own process, twice,
 * so the second reading shows the JIT-warm cost the game actually pays on the
 * second arena load.
 *
 * The ceiling is the arena's ~1.2 s boot budget. Eight sets at the shipped
 * Raid's measured ~102 ms/set would be ~0.82 s, which is the number this lane
 * is holding itself to.
 *
 * CLI: npx tsx scripts/qa/raid2-bake-budget.ts
 */
import { RAID2_SURFACES, raid2TexelBudget } from '../../src/raid2-art';
import { rasterizeSurface } from '../../src/rendering/surface-forge';

function bakeAll(): { total: number; each: Array<{ id: string; ms: number }> } {
  const each: Array<{ id: string; ms: number }> = [];
  const start = performance.now();
  for (const { id, description, options } of RAID2_SURFACES) {
    const at = performance.now();
    rasterizeSurface(description, options);
    each.push({ id, ms: performance.now() - at });
  }
  return { total: performance.now() - start, each };
}

const first = bakeAll();
const second = bakeAll();

console.log('raid2 surface bake budget (CPU rasterisation, own process, two runs)\n');
console.log('  set                   run 1 ms   run 2 ms   mm/texel   finest feature (texels)');
for (const [index, { id }] of RAID2_SURFACES.entries()) {
  const budget = raid2TexelBudget()[index];
  console.log(`  ${id.padEnd(20)}  ${first.each[index].ms.toFixed(1).padStart(8)}   ${second.each[index].ms.toFixed(1).padStart(8)}`
    + `   ${budget.mmPerTexel.toFixed(2).padStart(8)}   ${budget.finestFeatureTexels.toFixed(1).padStart(6)}`);
}
console.log(`\n  raid2Materials() bake: ${first.total.toFixed(0)} / ${second.total.toFixed(0)} ms`
  + `  (ceiling ~1200 ms)  -> ${Math.max(first.total, second.total) <= 1200 ? 'INSIDE' : 'OVER'}`);
process.exit(Math.max(first.total, second.total) <= 1200 ? 0 : 1);
