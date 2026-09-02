// HF-410 near-plane A/B numeric diff: near 0.02 (merged) vs near 0.08 (reverted).
// Same commit, same arenas, same authored review cameras, same 2560x1440
// viewport, same frozen time/seed/exposure. The ONLY difference between the two
// builds is the camera near plane, so every delta below is depth precision.
import sharp from 'sharp';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = 'docs/evidence/pass86/hf410-prep/frames';
// --a / --b name capture directories under frames/. The default pair is the
// decision itself (0.02 vs 0.08); pass the same build twice to measure the
// run-to-run NOISE FLOOR, without which none of these deltas mean anything.
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LABEL_A = arg('--a', 'near002');
const LABEL_B = arg('--b', 'near008');
const OUT = arg('--out', 'docs/evidence/pass86/hf410-prep/near-plane-ab-numeric.json');
const A = join(ROOT, LABEL_A);
const B = join(ROOT, LABEL_B);
const arenas = ['high-seas', 'map3', 'skyline-terminal'];
const rows = [];

for (const arena of arenas) {
  const shots = readdirSync(join(A, arena)).filter((f) => f.endsWith('.png') && !f.includes('.s'));
  for (const shot of shots) {
    const [a, b] = await Promise.all([
      sharp(resolve(A, arena, shot)).raw().toBuffer({ resolveWithObject: true }),
      sharp(resolve(B, arena, shot)).raw().toBuffer({ resolveWithObject: true }),
    ]);
    const { width, height, channels } = a.info;
    if (b.info.width !== width || b.info.height !== height) throw new Error(`size mismatch ${arena}/${shot}`);
    // The "far half" is the UPPER half of the frame: every one of these
    // cameras looks level or slightly down a sightline, so distant geometry
    // projects at and above the horizon line. Depth-precision artefacts
    // (z-fighting, shimmer on coplanar far surfaces) live there.
    const half = Math.floor(height / 2);
    let sumAll = 0, nAll = 0, gt8All = 0;
    let sumFar = 0, nFar = 0, gt8Far = 0, maxFar = 0, gt32Far = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * channels;
        // max abs channel delta = the per-pixel delta a z-fight shows up in
        const d = Math.max(
          Math.abs(a.data[i] - b.data[i]),
          Math.abs(a.data[i + 1] - b.data[i + 1]),
          Math.abs(a.data[i + 2] - b.data[i + 2]),
        );
        sumAll += d; nAll += 1; if (d > 8) gt8All += 1;
        if (y < half) {
          sumFar += d; nFar += 1;
          if (d > 8) gt8Far += 1;
          if (d > 32) gt32Far += 1;
          if (d > maxFar) maxFar = d;
        }
      }
    }
    rows.push({
      arena, camera: shot.replace(/\.png$/, ''), width, height,
      meanAbsDelta: +(sumAll / nAll).toFixed(4),
      pixelsGt8: gt8All, pixelsGt8Pct: +((100 * gt8All) / nAll).toFixed(4),
      farHalf: {
        meanAbsDelta: +(sumFar / nFar).toFixed(4),
        pixelsGt8: gt8Far, pixelsGt8Pct: +((100 * gt8Far) / nFar).toFixed(4),
        pixelsGt32: gt32Far, maxDelta: maxFar,
      },
    });
    console.log(`${arena}/${shot.padEnd(38)} mean=${(sumAll / nAll).toFixed(3)}  far>8=${gt8Far} (${((100 * gt8Far) / nFar).toFixed(3)}%)  farMax=${maxFar}`);
  }
}
const totalFarGt8 = rows.reduce((s, r) => s + r.farHalf.pixelsGt8, 0);
const summary = {
  schema: 'atomic-acres/hf410-near-plane-ab@1',
  question: 'Does FIRST_PERSON_CAMERA_NEAR_METERS 0.08 -> 0.02 cost visible depth precision on distant geometry?',
  method: 'Two builds off the same merged commit differing ONLY in the camera near plane (review cameras bridged to FIRST_PERSON_CAMERA_NEAR_METERS for the A/B so they exercise it). Installed Chrome headless, native WebGPU (nvidia/blackwell), 2560x1440, authored deterministic review cameras with frozen time/seed/exposure, HUD and viewmodel hidden, bots frozen.',
  farHalfDefinition: 'upper half of the frame (rows 0..H/2), where distant geometry projects for every camera used',
  comparison: `${LABEL_A} vs ${LABEL_B}`,
  frames: rows.length,
  totals: { farHalfPixelsGt8: totalFarGt8, farHalfPixelsGt32: rows.reduce((s, r) => s + r.farHalf.pixelsGt32, 0) },
  rows,
};
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log('\nTOTAL far-half pixels with delta > 8:', totalFarGt8, ' > 32:', summary.totals.farHalfPixelsGt32);
