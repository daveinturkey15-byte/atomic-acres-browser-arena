// CRITIC TEMP SCRIPT - deleted after run.
// Manual GLB parse: animation rotation tracks only (no mesh/meshopt needed).
import { readFileSync } from 'node:fs';

const buf = readFileSync('public/assets/original/models/operators/pass65-first-person-arms-lod0.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binChunkOff = 20 + jsonLen;
const bin = buf.slice(binChunkOff + 8, binChunkOff + 8 + buf.readUInt32LE(binChunkOff + 4));

function readAccessor(acc) {
  const view = json.bufferViews[acc.bufferView];
  if (view.extensions?.EXT_meshopt_compression) throw new Error('meshopt-compressed animation accessor');
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const compSize = { 5126: 4, 5123: 2, 5121: 1, 5120: 1, 5122: 2 }[acc.componentType];
  const count = acc.count;
  const numComp = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
  const stride = view.byteStride ?? compSize * numComp;
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = base + i * stride;
    const v = [];
    for (let c = 0; c < numComp; c++) {
      let x;
      switch (acc.componentType) {
        case 5126: x = bin.readFloatLE(o + c * 4); break;
        case 5123: x = bin.readUInt16LE(o + c * 2); break;
        case 5121: x = bin.readUInt8(o + c); break;
        case 5120: x = bin.readInt8(o + c); break;
        case 5122: x = bin.readInt16LE(o + c * 2); break;
      }
      v.push(x);
    }
    out.push(v);
  }
  if (acc.normalized) for (const v of out) for (let c = 0; c < numComp; c++) v[c] /= acc.componentType === 5123 ? 65535 : acc.componentType === 5121 ? 255 : acc.componentType === 5122 ? 32767 : 127;
  return out;
}

function quatAngle(a, b) {
  let d = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  d = Math.min(1, d);
  return 2 * Math.acos(d) * 180 / Math.PI;
}

const ARM_CHAIN = /(UpperArm|LowerArm|Wrist)[LR]$/;
for (const anim of json.animations) {
  const rotChannels = anim.channels.filter((ch) => ch.target.path === 'rotation');
  const armChans = rotChannels.filter((ch) => ARM_CHAIN.test(json.nodes[ch.target.node].name));
  let maxSpanDeg = 0; let keys = 0;
  for (const ch of armChans) {
    const samp = anim.samplers[ch.sampler];
    const vals = readAccessor(json.accessors[samp.output]);
    keys = Math.max(keys, vals.length);
    if (vals.length >= 2) maxSpanDeg = Math.max(maxSpanDeg, quatAngle(vals[0], vals[vals.length - 1]));
  }
  console.log(anim.name.padEnd(14), 'armRotTracks=' + String(armChans.length).padStart(2), 'keysPerTrack=' + keys, 'maxFirstVsLastKeyDeg=' + maxSpanDeg.toFixed(4));
}
console.log('total clips:', json.animations.length);
