/**
 * HF-422 lane diagnostic: contiguity-aware foot-contact analysis.
 *
 * This is NOT a gate and it does NOT replace
 * `scripts/animation/measure-retarget-quality.mjs`, which remains the tool the
 * repo's retarget evidence is written with. It exists because that tool's
 * "planted" filter is not contiguity-aware, and the HF-422 trial evidence was
 * originally written from its raw output as if it were.
 *
 * The defect, exactly: measure-retarget-quality.mjs keeps every frame whose
 * foot height is within 3 cm of that foot's own minimum, via `Array.filter`,
 * and then sums the horizontal distance between CONSECUTIVE SURVIVING samples.
 * Frames from two different stance phases end up adjacent in that array, so the
 * sum silently includes the swing-phase jump between them. The over-count is
 * zero for a clip with one stance phase and large for a clip with many, which
 * makes any ratio between two such clips meaningless. Worse, when a clip's feet
 * barely lift, almost every frame falls inside the 3 cm band and the metric
 * degenerates into total foot path length.
 *
 * So this reports, per foot bone:
 *   - lift            max world Y minus min world Y (how far the foot leaves the floor)
 *   - minY            lowest world Y (ground penetration, per bone, not pooled)
 *   - bandFraction    share of samples inside the 3 cm band (>0.5 means the band
 *                     has swallowed the swing phase and no slide reading is valid)
 *   - segments        number of CONTIGUOUS stance runs
 *   - slideContiguous slide summed WITHIN runs only  <- the honest slide
 *   - slideNaive      what measure-retarget-quality.mjs reports, for comparison
 *   - slidePerStanceFrame  slideContiguous / stance frames, the length-independent form
 *   - pathTotal / pathPerSecond   total horizontal path, the normalisation that
 *                     does not depend on any band at all
 *
 * It also prints the sampler's own first and last key times, because the clip's
 * export frame rate is a fact about the file and the trial got it wrong once.
 *
 * Usage:
 *   node scripts/animation/hf422-foot-contact-analysis.mjs <clip.glb> [--clip NAME] [--json]
 *   node scripts/animation/hf422-foot-contact-analysis.mjs <clip.glb> --all --json
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('usage: hf422-foot-contact-analysis.mjs <clip.glb> [--clip NAME] [--all] [--json]'); process.exit(2); }
const asJson = args.includes('--json');
const allClips = args.includes('--all');
const clipArg = args.indexOf('--clip') === -1 ? null : args[args.indexOf('--clip') + 1];
// A clip's NATIVE frame rate, for the per-second figures. It is not always the
// sampler's own rate: one Blender scene exports every action at one scene fps,
// so a file holding a 30 fps generated clip beside 24 fps authored ones must be
// read with each clip's own rate or the per-second comparison is off by 25%.
// The frame-based figures below (lift, minY, contiguous slide, per-stance-frame)
// do not depend on this at all, which is why they are the primary evidence.
const fpsArg = args.indexOf('--fps') === -1 ? null : Number(args[args.indexOf('--fps') + 1]);
if (fpsArg !== null && !(fpsArg > 0)) throw new Error('--fps must be a positive number');
const contactFractionArg = args.indexOf('--contact-fraction') === -1 ? null : Number(args[args.indexOf('--contact-fraction') + 1]);
if (contactFractionArg !== null && !(contactFractionArg > 0 && contactFractionArg < 1)) throw new Error('--contact-fraction must be between 0 and 1');

const bytes = readFileSync(file);
if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
let offset = 12; let json = null; let bin = null;
while (offset + 8 <= bytes.length) {
  const length = bytes.readUInt32LE(offset);
  const type = bytes.readUInt32LE(offset + 4);
  const start = offset + 8;
  if (type === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8', start, start + length).replace(/[\0 ]+$/u, ''));
  if (type === 0x004e4942) bin = bytes.subarray(start, start + length);
  offset = start + length;
}
if (!json) throw new Error('GLB JSON chunk missing');

// REFUSE rather than decode garbage and still print a number. The shipped
// operator GLB is meshopt-compressed with normalized SHORT accessors; read as
// raw float it yields lowestFootY -1.33e+74 and 0.0000 m of slide, which reads
// as a pass on a file the reader cannot decode.
function accessor(index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  if (json.extensionsUsed?.includes('EXT_meshopt_compression') && view.extensions?.EXT_meshopt_compression) {
    throw new Error(`accessor ${index}: bufferView is EXT_meshopt_compression-encoded and this reader only decodes raw float. Measure the uncompressed Blender export, not the shipped GLB.`);
  }
  if (acc.componentType !== 5126) {
    throw new Error(`accessor ${index}: componentType ${acc.componentType}${acc.normalized ? ' (normalized)' : ''} is not FLOAT; decoding it as float would produce garbage that still prints as a number.`);
  }
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const stride = view.byteStride ?? comps * 4;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = [];
  for (let i = 0; i < acc.count; i += 1) {
    const row = [];
    for (let c = 0; c < comps; c += 1) row.push(bin.readFloatLE(base + i * stride + c * 4));
    out.push(comps === 1 ? row[0] : row);
  }
  return out;
}

const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qRot = (q, v) => {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
};
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let e = b;
  if (d < 0) { e = b.map((v) => -v); d = -d; }
  if (d > 0.9995) {
    const r = a.map((v, i) => v + t * (e[i] - v));
    const n = Math.hypot(...r);
    return r.map((v) => v / n);
  }
  const th = Math.acos(d); const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s; const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + e[i] * wb);
};

const nodes = json.nodes ?? [];
const parentOf = new Map();
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const nameOf = (i) => nodes[i].name ?? `node${i}`;
const chainOf = (index) => { const c = []; for (let i = index; i !== undefined; i = parentOf.get(i)) c.unshift(i); return c; };

const animations = json.animations ?? [];
if (animations.length === 0) throw new Error('GLB carries no animation');

const TRACKED = ['Foot.L', 'Foot.R', 'PT.L', 'PT.R', 'Hips'];
const BAND = 0.03;

function analyse(animation) {
  const rotOf = new Map(); const posOf = new Map();
  let times = [];
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    const input = accessor(sampler.input);
    if (input.length > times.length) times = input;
    const output = accessor(sampler.output);
    if (channel.target.path === 'rotation') rotOf.set(channel.target.node, { input, output });
    if (channel.target.path === 'translation') posOf.set(channel.target.node, { input, output });
  }
  const sampleQ = (track, t) => {
    if (!track) return null;
    const { input, output } = track;
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    let i = 0; while (i < input.length - 1 && input[i + 1] < t) i += 1;
    const f = (t - input[i]) / (input[i + 1] - input[i]);
    return slerp(output[i], output[i + 1], f);
  };
  const sampleV = (track, t) => {
    if (!track) return null;
    const { input, output } = track;
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    let i = 0; while (i < input.length - 1 && input[i + 1] < t) i += 1;
    const f = (t - input[i]) / (input[i + 1] - input[i]);
    return output[i].map((v, k) => v + f * (output[i + 1][k] - v));
  };
  const worldPosition = (index, t) => {
    let pos = [0, 0, 0]; let rot = [0, 0, 0, 1];
    for (const i of chainOf(index)) {
      const n = nodes[i];
      const local = sampleV(posOf.get(i), t) ?? n.translation ?? [0, 0, 0];
      const q = sampleQ(rotOf.get(i), t) ?? n.rotation ?? [0, 0, 0, 1];
      const scaled = qRot(rot, local);
      pos = [pos[0] + scaled[0], pos[1] + scaled[1], pos[2] + scaled[2]];
      rot = qMul(rot, q);
    }
    return pos;
  };

  const t0 = times[0]; const tLast = times[times.length - 1];
  const exportedDurationS = tLast - t0;
  const dt = times.length > 1 ? (tLast - t0) / (times.length - 1) : 0;
  // Per-second figures use the declared native rate when one is given.
  const durationS = fpsArg !== null && times.length > 1
    ? (times.length - 1) / fpsArg
    : exportedDurationS;
  const bones = [];
  for (const name of TRACKED) {
    const index = nodes.findIndex((n) => n.name === name);
    if (index < 0) continue;
    const points = times.map((t) => worldPosition(index, t));
    const ys = points.map((p) => p[1]);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const inBand = points.map((p) => p[1] - minY < BAND);

    // Contiguous stance runs.
    const segments = [];
    let run = null;
    inBand.forEach((planted, i) => {
      if (planted) { if (!run) { run = { start: i, end: i }; } else { run.end = i; } }
      else if (run) { segments.push(run); run = null; }
    });
    if (run) segments.push(run);
    let slideContiguous = 0;
    let stanceFrames = 0;
    for (const seg of segments) {
      stanceFrames += seg.end - seg.start + 1;
      for (let i = seg.start + 1; i <= seg.end; i += 1) {
        slideContiguous += Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]);
      }
    }
    // What measure-retarget-quality.mjs reports: contiguity discarded.
    const kept = points.filter((p) => p[1] - minY < BAND);
    let slideNaive = 0;
    for (let i = 1; i < kept.length; i += 1) {
      slideNaive += Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][2] - kept[i - 1][2]);
    }
    let pathTotal = 0;
    for (let i = 1; i < points.length; i += 1) {
      pathTotal += Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]);
    }
    const strideSteps = Math.max(0, stanceFrames - segments.length);
    bones.push({
      name,
      parent: parentOf.has(index) ? nameOf(parentOf.get(index)) : null,
      chain: chainOf(index).map(nameOf).join(' > '),
      minY: Number(minY.toFixed(4)),
      maxY: Number(maxY.toFixed(4)),
      liftM: Number((maxY - minY).toFixed(4)),
      bandFrames: stanceFrames,
      bandFraction: Number((stanceFrames / points.length).toFixed(4)),
      segments: segments.length,
      slideContiguousM: Number(slideContiguous.toFixed(4)),
      slideNaiveM: Number(slideNaive.toFixed(4)),
      naiveOvercountPct: slideContiguous > 0 ? Number((100 * (slideNaive - slideContiguous) / slideContiguous).toFixed(1)) : null,
      slidePerStanceFrameM: strideSteps > 0 ? Number((slideContiguous / strideSteps).toFixed(4)) : null,
      pathTotalM: Number(pathTotal.toFixed(4)),
      pathPerSecondMS: durationS > 0 ? Number((pathTotal / durationS).toFixed(4)) : null,
      bandValid: stanceFrames / points.length <= 0.5,
    });
  }
  // ---- the repo's OWN foot-contact metric ---------------------------------
  // scripts/blender/measure-pass77-operator-locomotion.py already answers the
  // question "does this clip's planted foot stay planted?", and it answers it
  // in a form that is comparable between clips of different length and cadence:
  // resample to a fixed count, express each ankle relative to the hips (these
  // are in-place clips), keep only samples in the bottom 10% of the ankle-height
  // range, and take the MEDIAN backward ankle velocity. That velocity IS the
  // ground speed at which the stance foot is stationary - the speed the clip
  // was authored FOR. Its constants are frozen in
  // src/animation-locomotion.ts -> OPERATOR_LOCOMOTION_CALIBRATION.
  //
  // Reproducing it here rather than inventing a metric means the trial clip is
  // judged by the bar the shipped clips are already held to, and running it on
  // authored `Walk` reproduces the frozen 1.3416 m/s, which is what proves this
  // implementation agrees with the Python one.
  // 0.10 and 960 are pass-77's own constants. --contact-fraction exists only to
  // sweep the gate width: a recovered speed that moves when the gate widens is
  // an artifact of the gate, not a property of the clip, and must not be quoted.
  const CONTACT_HEIGHT_FRACTION = contactFractionArg ?? 0.10;
  const RESAMPLES = 960;
  const authoredSpeed = (() => {
    const iFoot = ['Foot.L', 'Foot.R'].map((n) => nodes.findIndex((x) => x.name === n));
    const iHips = nodes.findIndex((x) => x.name === 'Hips');
    if (iFoot.some((i) => i < 0) || iHips < 0 || times.length < 2) return null;
    const step = durationS / RESAMPLES;
    const rel = iFoot.map(() => []);
    for (let k = 0; k <= RESAMPLES; k += 1) {
      const t = t0 + (tLast - t0) * (k / RESAMPLES);
      const hips = worldPosition(iHips, t);
      iFoot.forEach((idx, f) => {
        const p = worldPosition(idx, t);
        rel[f].push([p[0] - hips[0], p[1], p[2] - hips[2]]);
      });
    }
    const heights = rel.flat().map((p) => p[1]);
    const lo = Math.min(...heights); const hi = Math.max(...heights);
    const threshold = lo + CONTACT_HEIGHT_FRACTION * (hi - lo);
    const fwd = []; const lat = [];
    for (const foot of rel) {
      for (let k = 1; k < foot.length; k += 1) {
        if (foot[k][1] > threshold || foot[k - 1][1] > threshold) continue;
        fwd.push(-(foot[k][2] - foot[k - 1][2]) / step);
        lat.push(-(foot[k][0] - foot[k - 1][0]) / step);
      }
    }
    if (fwd.length === 0) return null;
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const forward = median(fwd); const lateral = median(lat);
    return {
      method: 'median-contact-phase-ankle-velocity-relative-to-hips (scripts/blender/measure-pass77-operator-locomotion.py)',
      contactHeightFraction: CONTACT_HEIGHT_FRACTION,
      contactSamples: fwd.length,
      authoredForwardMps: Number(forward.toFixed(4)),
      authoredLateralMps: Number(lateral.toFixed(4)),
      authoredGroundSpeedMps: Number(Math.hypot(forward, lateral).toFixed(4)),
    };
  })();

  return {
    clip: animation.name ?? '(unnamed)',
    samples: times.length,
    firstKeyS: Number(t0.toFixed(6)),
    lastKeyS: Number(tLast.toFixed(6)),
    exportedDurationS: Number(exportedDurationS.toFixed(4)),
    sampleStepS: Number(dt.toFixed(6)),
    exportFps: dt > 0 ? Number((1 / dt).toFixed(3)) : null,
    nativeFpsUsed: fpsArg,
    durationSUsed: Number(durationS.toFixed(4)),
    authoredSpeed,
    bones,
  };
}

const chosen = allClips
  ? animations
  : [clipArg ? animations.find((a) => a.name === clipArg) : animations[0]];
if (chosen.some((a) => !a)) throw new Error(`no clip named ${clipArg}. Available: ${animations.map((a) => a.name).join(', ')}`);

const out = { file, clips: chosen.map(analyse) };
if (asJson) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
for (const c of out.clips) {
  console.log(`\nclip ${c.clip}  samples ${c.samples}  keys ${c.firstKeyS}..${c.lastKeyS}s  step ${c.sampleStepS}s  => ${c.exportFps} fps export; per-second figures use ${c.nativeFpsUsed ?? c.exportFps} fps over ${c.durationSUsed}s`);
  if (c.authoredSpeed) {
    console.log(`  authored ground speed (pass-77 method) ${c.authoredSpeed.authoredGroundSpeedMps} m/s  (forward ${c.authoredSpeed.authoredForwardMps}, lateral ${c.authoredSpeed.authoredLateralMps}, ${c.authoredSpeed.contactSamples} contact samples)`);
  }
  for (const b of c.bones) {
    console.log(`  ${b.name.padEnd(7)} minY ${String(b.minY).padStart(8)}  lift ${String(b.liftM).padStart(7)}  band ${String(b.bandFrames).padStart(3)}/${c.samples} (${(b.bandFraction * 100).toFixed(0)}%, ${b.segments} seg)  slide contiguous ${String(b.slideContiguousM).padStart(8)} vs naive ${String(b.slideNaiveM).padStart(8)}  per-stance-frame ${b.slidePerStanceFrameM}  path ${b.pathTotalM} (${b.pathPerSecondMS} m/s)${b.bandValid ? '' : '   <- BAND SWALLOWED THE SWING PHASE, slide reading not valid'}`);
    console.log(`  ${''.padEnd(7)} chain ${b.chain}`);
  }
}
