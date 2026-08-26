/**
 * Measure a retargeted clip in the SHIPPED GLB.
 *
 * A retarget that "looks fine" in Blender proves nothing about the file the
 * game loads, and the failure modes here are quiet ones: a limb frozen because
 * its channel was dropped, a fist opened because the finger chains were
 * written, feet skating because scale was assumed. All three are invisible in a
 * single still and obvious in a number.
 *
 * This walks the GLB's own node hierarchy, evaluates the animation at every
 * sampled time, and reports:
 *
 *   - channel coverage: which joints are actually animated
 *   - grip safety: whether ANY finger or thumb joint was written
 *   - foot slide: how far a planted foot travels while it is planted
 *   - vertical sanity: lowest foot height across the clip
 *
 * Grip safety is checked as VARIATION, not presence. Blender bakes every bone
 * into an exported action, so a finger channel existing proves nothing; a
 * finger channel whose value CHANGES over the clip is the actual defect,
 * because that is a generated hand overriding the authored weapon grip.
 *
 * Usage:
 *   node scripts/animation/measure-retarget-quality.mjs <clip.glb> [--clip NAME] [--json]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: measure-retarget-quality.mjs <clip.glb> [--json]'); process.exit(2); }
const asJson = process.argv.includes('--json');
const clipArg = process.argv.indexOf('--clip') === -1 ? null : process.argv[process.argv.indexOf('--clip') + 1];

// ---- GLB container -------------------------------------------------------
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

function accessor(index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
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

// ---- maths ---------------------------------------------------------------
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

// ---- node graph ----------------------------------------------------------
const nodes = json.nodes ?? [];
const parentOf = new Map();
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const nameOf = (i) => nodes[i].name ?? `node${i}`;

const animations = json.animations ?? [];
if (animations.length === 0) throw new Error('GLB carries no animation');
// Selecting by NAME matters: this rig ships 24 authored clips, so animations[0]
// is somebody else's clip and measuring it says nothing about the retarget.
const animation = clipArg ? animations.find((a) => a.name === clipArg) : animations[0];
if (!animation) {
  throw new Error(`no clip named ${clipArg}. Available: ${animations.map((a) => a.name).join(', ')}`);
}

// Sample times and per-node channels.
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

function worldPosition(index, t) {
  const chain = [];
  for (let i = index; i !== undefined; i = parentOf.get(i)) chain.unshift(i);
  let pos = [0, 0, 0]; let rot = [0, 0, 0, 1];
  for (const i of chain) {
    const n = nodes[i];
    const local = sampleV(posOf.get(i), t) ?? n.translation ?? [0, 0, 0];
    const q = sampleQ(rotOf.get(i), t) ?? n.rotation ?? [0, 0, 0, 1];
    const scaled = qRot(rot, local);
    pos = [pos[0] + scaled[0], pos[1] + scaled[1], pos[2] + scaled[2]];
    rot = qMul(rot, q);
  }
  return pos;
}

// ---- report --------------------------------------------------------------
const animatedNames = [...new Set([...rotOf.keys(), ...posOf.keys()])].map(nameOf).sort();
const GRIP = /^(Index|Middle|Ring|Pinky|Thumb)\d/;
// A baked-but-constant channel is harmless; a VARYING one is a generated hand
// overriding the authored grip. Measure the spread, do not just detect presence.
const gripVarying = [];
for (const [node, track] of rotOf) {
  if (!GRIP.test(nameOf(node))) continue;
  let spread = 0;
  const first = track.output[0];
  for (const q of track.output) {
    const dot = Math.abs(first[0] * q[0] + first[1] * q[1] + first[2] * q[2] + first[3] * q[3]);
    spread = Math.max(spread, 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI);
  }
  if (spread > 0.5) gripVarying.push({ joint: nameOf(node), degrees: Number(spread.toFixed(2)) });
}
const gripWritten = gripVarying.map((g) => g.joint).sort();

// Per-joint rotation variation. A retarget that silently produced a STATIC
// pose reports perfect foot slide and perfect grip safety while being useless,
// so movement has to be measured too, not inferred from the absence of faults.
const variation = [];
for (const [node, track] of rotOf) {
  let spread = 0;
  const first = track.output[0];
  for (const q of track.output) {
    const dot = Math.abs(first[0] * q[0] + first[1] * q[1] + first[2] * q[2] + first[3] * q[3]);
    spread = Math.max(spread, 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI);
  }
  variation.push({ joint: nameOf(node), degrees: Number(spread.toFixed(2)) });
}
variation.sort((a, b) => b.degrees - a.degrees);
const moving = variation.filter((v) => v.degrees > 0.5);

const findNode = (name) => nodes.findIndex((n) => n.name === name);
const feet = ['Foot.L', 'Foot.R', 'PT.L', 'PT.R'].map((n) => ({ name: n, index: findNode(n) })).filter((f) => f.index >= 0);

const trace = feet.map((f) => ({ name: f.name, points: times.map((t) => worldPosition(f.index, t)) }));
let lowest = Infinity;
for (const f of trace) for (const p of f.points) lowest = Math.min(lowest, p[1]);

// Foot slide: over the frames where a foot is within 3 cm of its own lowest
// point (i.e. planted), how far does it travel horizontally?
const slides = trace.map((f) => {
  const low = Math.min(...f.points.map((p) => p[1]));
  const planted = f.points.filter((p) => p[1] - low < 0.03);
  if (planted.length < 2) return { name: f.name, plantedFrames: planted.length, slideM: 0 };
  let slide = 0;
  for (let i = 1; i < planted.length; i += 1) {
    slide += Math.hypot(planted[i][0] - planted[i - 1][0], planted[i][2] - planted[i - 1][2]);
  }
  return { name: f.name, plantedFrames: planted.length, slideM: slide };
});

const result = {
  file,
  clip: animation.name ?? '(unnamed)',
  sampledTimes: times.length,
  animatedJointCount: animatedNames.length,
  gripChannelsVarying: gripVarying.sort((a, b) => b.degrees - a.degrees),
  movingJointCount: moving.length,
  topMovingJoints: variation.slice(0, 8),
  lowestFootY: Number(lowest.toFixed(4)),
  footSlide: slides.map((s) => ({ ...s, slideM: Number(s.slideM.toFixed(4)) })),
};

if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

console.log(`clip              ${result.clip}`);
console.log(`sampled times     ${result.sampledTimes}`);
console.log(`animated joints   ${result.animatedJointCount}`);
console.log(`grip variation    ${gripWritten.length === 0 ? 'NONE (correct - authored weapon grip is intact)' : `${gripWritten.length} joint(s) MOVE: ${gripVarying.slice(0, 6).map((g) => `${g.joint} ${g.degrees}deg`).join(', ')}`}`);
console.log(`moving joints     ${moving.length} of ${variation.length} vary by >0.5 deg`);
console.log(`top movers        ${variation.slice(0, 6).map((v) => `${v.joint} ${v.degrees}`).join(', ')}`);
if (moving.length === 0) console.log('  WARNING: nothing moves - this clip is a static pose.');
console.log(`lowest foot Y     ${result.lowestFootY} m`);
for (const s of result.footSlide) {
  console.log(`foot slide        ${s.name.padEnd(6)} ${s.slideM.toFixed(4)} m over ${s.plantedFrames} planted frames`);
}
if (gripWritten.length > 0) process.exitCode = 1;
