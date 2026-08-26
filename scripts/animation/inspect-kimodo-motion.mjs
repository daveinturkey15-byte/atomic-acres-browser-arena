/**
 * Inspect a raw Kimodo motion export before anything retargets it.
 *
 * `kmd-generate` writes two headerless float32 arrays and nothing else:
 *
 *   root_positions.f32        T x 3
 *   local_rotations_xyzw.f32  T x J x 4   (parent-local quaternions, xyzw)
 *
 * There is no shape metadata in either file, so J is recovered from the two
 * byte counts. That matters: every retarget defect in this lane starts with
 * someone assuming a joint count, an axis convention or a rotation order and
 * batch-processing a hundred clips before looking at one.
 *
 * This tool asserts nothing and fixes nothing. It reports what is actually in
 * the bytes - frame count, joint count, quaternion normalisation, which axis
 * gravity runs along, how far the root travelled, and whether the clip loops -
 * so the calibration decisions afterwards are made against measurements.
 *
 * Usage:
 *   node scripts/animation/inspect-kimodo-motion.mjs <dir-from-kmd-generate>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/animation/inspect-kimodo-motion.mjs <output-dir>');
  process.exit(2);
}

const rootPath = join(dir, 'root_positions.f32');
const rotPath = join(dir, 'local_rotations_xyzw.f32');
for (const p of [rootPath, rotPath]) {
  if (!existsSync(p)) { console.error(`missing ${p}`); process.exit(2); }
}

const asFloats = (p) => {
  const b = readFileSync(p);
  if (b.byteLength % 4 !== 0) throw new Error(`${p}: not a whole number of float32 values`);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};

const root = asFloats(rootPath);
const rot = asFloats(rotPath);

if (root.length % 3 !== 0) throw new Error('root_positions.f32 is not a multiple of 3');
const frames = root.length / 3;
if (rot.length % (frames * 4) !== 0) {
  throw new Error(`rotation buffer (${rot.length}) does not divide by frames*4 (${frames * 4})`);
}
const joints = rot.length / (frames * 4);

console.log(`frames        ${frames}`);
console.log(`joints        ${joints}   (recovered from byte counts, not assumed)`);
console.log(`rot values    ${rot.length}   root values ${root.length}`);

// --- quaternion sanity. A drifting norm means the decode or the read is wrong.
let minNorm = Infinity, maxNorm = -Infinity, nonFinite = 0;
for (let i = 0; i < rot.length; i += 4) {
  const [x, y, z, w] = [rot[i], rot[i + 1], rot[i + 2], rot[i + 3]];
  if (![x, y, z, w].every(Number.isFinite)) { nonFinite += 1; continue; }
  const n = Math.hypot(x, y, z, w);
  if (n < minNorm) minNorm = n;
  if (n > maxNorm) maxNorm = n;
}
console.log(`quat norm     ${minNorm.toFixed(6)} .. ${maxNorm.toFixed(6)}  nonFinite=${nonFinite}`);
if (nonFinite > 0) console.log('  WARNING: non-finite rotations present - do not retarget this clip.');
if (maxNorm - minNorm > 1e-3) console.log('  WARNING: quaternion norms drift; check the read stride.');

// --- root trajectory. Which axis is up is a measurement, not a convention.
const axis = ['x', 'y', 'z'].map((name, c) => {
  let lo = Infinity, hi = -Infinity, first = root[c], last = root[(frames - 1) * 3 + c];
  for (let t = 0; t < frames; t += 1) {
    const v = root[t * 3 + c];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { name, lo, hi, span: hi - lo, first, last, net: last - first };
});
for (const a of axis) {
  console.log(`root ${a.name}        ${a.lo.toFixed(3)} .. ${a.hi.toFixed(3)}  span=${a.span.toFixed(3)}  net=${a.net.toFixed(3)}`);
}
// The vertical axis is the one that stays in a NARROW BAND WELL ABOVE ZERO:
// a walking figure bobs a few centimetres around hip height while the other
// axes either travel metres or hover around zero. Ranking on span alone is
// not enough - a clip that walks dead straight has a near-zero span on the
// lateral axis too, and that axis is centred on zero, not on ~1 m. Score by
// how far the band sits off the floor relative to how much it moves.
const upGuess = [...axis]
  .map((a) => ({ ...a, mid: (a.lo + a.hi) / 2 }))
  .sort((p, q) => (Math.abs(q.mid) / (q.span + 1e-6)) - (Math.abs(p.mid) / (p.span + 1e-6)))[0];
console.log(`up axis       likely '${upGuess.name}' (band ${upGuess.lo.toFixed(3)}..${upGuess.hi.toFixed(3)}, `
  + `centred ${upGuess.mid.toFixed(3)} m off the floor with only ${upGuess.span.toFixed(3)} m of travel)`);

// --- planar travel, for the root-motion decision.
const planar = axis.filter((a) => a.name !== upGuess.name);
const netPlanar = Math.hypot(...planar.map((a) => a.net));
console.log(`planar travel net=${netPlanar.toFixed(3)} m over ${frames} frames`);
console.log(`              -> ${netPlanar > 0.05 ? 'ROOT MOTION present: decide in-place vs driven before retarget' : 'effectively in place'}`);

// --- loop seam. Reported, never asserted: most prompts are not loops.
let seam = 0;
for (let j = 0; j < joints; j += 1) {
  const a = j * 4;
  const b = (frames - 1) * joints * 4 + j * 4;
  const dot = Math.abs(rot[a] * rot[b] + rot[a + 1] * rot[b + 1] + rot[a + 2] * rot[b + 2] + rot[a + 3] * rot[b + 3]);
  seam = Math.max(seam, 2 * Math.acos(Math.min(1, dot)));
}
console.log(`loop seam     worst joint delta first->last = ${(seam * 180 / Math.PI).toFixed(2)} deg`);
console.log(`              -> ${seam * 180 / Math.PI < 8 ? 'close enough to consider looping' : 'NOT a loop; author transitions explicitly'}`);
