#!/usr/bin/env node
/**
 * parse-mbstyle.mjs - pure-JS reader for MotionBricks `.mbstyle` / `support.gguf`
 * style primitives (GGUF v3), for lane HF-422's Map 3 retarget trial.
 *
 * WHY THIS EXISTS AND WHAT IT IS ALLOWED TO CONCLUDE.
 *
 * The MotionBricks style primitives are the SAME skeleton (`g1skel34`), the same
 * 30 FPS and the same conventions as the model's own output, at 0.79 MB instead of
 * 0.73 GB. Reading them answers "does a G1 skeleton retarget onto our operator rig?"
 * without a C++23/Vulkan build. It answers NOTHING about the model's generation
 * quality - this reader never touches the model.
 *
 * FALSIFIER, and the reason the script exits non-zero rather than warning. The
 * published `styles/manifest.json` gives a `parameter_count` per style. The
 * documented tensor layout implies parameter_count = 412*F + 11 (positions 34*3,
 * rotations 34*9, root 3, heading 1 -> 412 per frame; plus an 11-entry I32
 * allowed-duration mask). That arithmetic predicts a frame count per style BEFORE
 * a byte is read. If the shapes actually present in the file disagree with the
 * prediction, the layout assumption is wrong and we would be retargeting garbage,
 * so the script STOPS. A prediction that only ever agrees with itself is not a
 * falsifier; this one is checked against the file's own tensor dimensions.
 *
 * LICENCE. `.mbstyle` files are Model data under the NVIDIA Open Model License
 * Sec 3. They live in git-ignored `artifacts/` and are NEVER committed. This
 * script reads them; it does not vendor, repackage or redistribute them. The
 * derived inventory (frame counts, hip height, speeds) is measurement, not Model
 * data, and is what gets committed.
 *
 * Usage:
 *   node scripts/animation/parse-mbstyle.mjs --dir artifacts/hf422/styles \
 *        --support artifacts/hf422/support.gguf \
 *        --out docs/evidence/pass86/hf422/mbstyle-inventory.json
 */

import fs from 'node:fs';
import path from 'node:path';

/** GGUF metadata value types (gguf.md, v3). */
const GGUF_TYPE = {
  UINT8: 0, INT8: 1, UINT16: 2, INT16: 3, UINT32: 4, INT32: 5,
  FLOAT32: 6, BOOL: 7, STRING: 8, ARRAY: 9, UINT64: 10, INT64: 11, FLOAT64: 12,
};

/** ggml tensor types we accept. Anything else is a quantised block format we
 *  deliberately refuse rather than half-decode. */
const GGML_TYPE = { F32: 0, F16: 1, I8: 24, I16: 25, I32: 26, I64: 27, F64: 28 };
const GGML_TYPE_NAME = Object.fromEntries(Object.entries(GGML_TYPE).map(([k, v]) => [v, k]));

class Cursor {
  constructor(buf) { this.buf = buf; this.off = 0; }
  u8() { const v = this.buf.readUInt8(this.off); this.off += 1; return v; }
  i8() { const v = this.buf.readInt8(this.off); this.off += 1; return v; }
  u16() { const v = this.buf.readUInt16LE(this.off); this.off += 2; return v; }
  i16() { const v = this.buf.readInt16LE(this.off); this.off += 2; return v; }
  u32() { const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  i32() { const v = this.buf.readInt32LE(this.off); this.off += 4; return v; }
  f32() { const v = this.buf.readFloatLE(this.off); this.off += 4; return v; }
  f64() { const v = this.buf.readDoubleLE(this.off); this.off += 8; return v; }
  u64() { const v = this.buf.readBigUInt64LE(this.off); this.off += 8; return Number(v); }
  i64() { const v = this.buf.readBigInt64LE(this.off); this.off += 8; return Number(v); }
  str() {
    const len = this.u64();
    const s = this.buf.toString('utf8', this.off, this.off + len);
    this.off += len;
    return s;
  }
}

function readValue(c, type) {
  switch (type) {
    case GGUF_TYPE.UINT8: return c.u8();
    case GGUF_TYPE.INT8: return c.i8();
    case GGUF_TYPE.UINT16: return c.u16();
    case GGUF_TYPE.INT16: return c.i16();
    case GGUF_TYPE.UINT32: return c.u32();
    case GGUF_TYPE.INT32: return c.i32();
    case GGUF_TYPE.FLOAT32: return c.f32();
    case GGUF_TYPE.BOOL: return c.u8() !== 0;
    case GGUF_TYPE.STRING: return c.str();
    case GGUF_TYPE.UINT64: return c.u64();
    case GGUF_TYPE.INT64: return c.i64();
    case GGUF_TYPE.FLOAT64: return c.f64();
    case GGUF_TYPE.ARRAY: {
      const elemType = c.u32();
      const n = c.u64();
      const out = new Array(n);
      for (let i = 0; i < n; i += 1) out[i] = readValue(c, elemType);
      return out;
    }
    default:
      throw new Error(`unknown GGUF metadata value type ${type}`);
  }
}

/** Parse a GGUF v3 container into { kv, tensors: Map<name,{dims,type,data}> }. */
export function readGguf(buf) {
  const c = new Cursor(buf);
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'GGUF') throw new Error(`not a GGUF file (magic ${JSON.stringify(magic)})`);
  c.off = 4;
  const version = c.u32();
  if (version !== 3) throw new Error(`expected GGUF version 3, got ${version}`);
  const tensorCount = c.u64();
  const kvCount = c.u64();

  const kv = {};
  for (let i = 0; i < kvCount; i += 1) {
    const key = c.str();
    const type = c.u32();
    kv[key] = readValue(c, type);
  }

  const infos = [];
  for (let i = 0; i < tensorCount; i += 1) {
    const name = c.str();
    const nDims = c.u32();
    const dims = [];
    for (let d = 0; d < nDims; d += 1) dims.push(c.u64());
    const type = c.u32();
    const offset = c.u64();
    infos.push({ name, dims, type, offset });
  }

  const alignment = kv['general.alignment'] ?? 32;
  const dataStart = Math.ceil(c.off / alignment) * alignment;

  const tensors = new Map();
  for (const info of infos) {
    const count = info.dims.reduce((a, b) => a * b, 1);
    const base = dataStart + info.offset;
    let data;
    switch (info.type) {
      case GGML_TYPE.F32: data = new Float32Array(count); for (let i = 0; i < count; i += 1) data[i] = buf.readFloatLE(base + i * 4); break;
      case GGML_TYPE.F64: data = new Float64Array(count); for (let i = 0; i < count; i += 1) data[i] = buf.readDoubleLE(base + i * 8); break;
      case GGML_TYPE.I32: data = new Int32Array(count); for (let i = 0; i < count; i += 1) data[i] = buf.readInt32LE(base + i * 4); break;
      case GGML_TYPE.I64: data = new Float64Array(count); for (let i = 0; i < count; i += 1) data[i] = Number(buf.readBigInt64LE(base + i * 8)); break;
      case GGML_TYPE.I16: data = new Int16Array(count); for (let i = 0; i < count; i += 1) data[i] = buf.readInt16LE(base + i * 2); break;
      case GGML_TYPE.I8: data = new Int8Array(count); for (let i = 0; i < count; i += 1) data[i] = buf.readInt8(base + i); break;
      default:
        throw new Error(`tensor ${info.name}: unsupported ggml type ${info.type} (${GGML_TYPE_NAME[info.type] ?? 'quantised/unknown'}) - refusing to half-decode`);
    }
    tensors.set(info.name, { dims: info.dims, type: info.type, data });
  }

  return { version, kv, tensors, dataStart, headerEnd: c.off };
}

/** GGUF dims are little-end-first: a [F,34,3] logical tensor is stored [3,34,F]. */
function logicalShape(dims) { return [...dims].reverse(); }

const JOINTS = 34;
const FLOATS_PER_FRAME = JOINTS * 3 + JOINTS * 9 + 3 + 1; // 412
const MASK_ENTRIES = 11;

/** Frame count predicted from the manifest, before any byte is read. */
export function predictFramesFromParameterCount(parameterCount) {
  const numerator = parameterCount - MASK_ENTRIES;
  if (numerator % FLOATS_PER_FRAME !== 0) return null;
  return numerator / FLOATS_PER_FRAME;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Largest deviation of R^T R from identity, over every frame and joint. */
function worstOrthonormalityError(rot, frames) {
  let worst = 0;
  for (let f = 0; f < frames; f += 1) {
    for (let j = 0; j < JOINTS; j += 1) {
      const b = (f * JOINTS + j) * 9;
      for (let r = 0; r < 3; r += 1) {
        for (let cIdx = 0; cIdx < 3; cIdx += 1) {
          let dot = 0;
          for (let k = 0; k < 3; k += 1) dot += rot[b + k * 3 + r] * rot[b + k * 3 + cIdx];
          const target = r === cIdx ? 1 : 0;
          worst = Math.max(worst, Math.abs(dot - target));
        }
      }
    }
  }
  return worst;
}

function unwrapHeadingStep(headings) {
  let worst = 0;
  for (let i = 1; i < headings.length; i += 1) {
    let d = headings[i] - headings[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    worst = Math.max(worst, Math.abs(d));
  }
  return worst;
}

export function analyseStyle(buf, { name, parameterCount, fps = 30 }) {
  const gguf = readGguf(buf);
  const t = (n) => {
    const v = gguf.tensors.get(n);
    if (!v) throw new Error(`${name}: missing tensor ${n}`);
    return v;
  };

  const positions = t('global_joint_positions');
  const rotations = t('global_joint_rotations');
  const roots = t('global_root_positions');
  const headings = t('global_headings');
  const mask = t('allowed_tokens');

  const posShape = logicalShape(positions.dims);
  const rotShape = logicalShape(rotations.dims);
  const rootShape = logicalShape(roots.dims);
  const headShape = logicalShape(headings.dims);
  const maskShape = logicalShape(mask.dims);

  // Shapes as read from the FILE. These are what the prediction is tested against.
  const framesFromBytes = posShape[0];
  const predictedFrames = predictFramesFromParameterCount(parameterCount);

  const problems = [];
  if (posShape.length !== 3 || posShape[1] !== JOINTS || posShape[2] !== 3) problems.push(`global_joint_positions shape ${posShape.join('x')} != Fx${JOINTS}x3`);
  if (rotShape.length !== 3 || rotShape[0] !== framesFromBytes || rotShape[1] !== JOINTS || rotShape[2] !== 9) problems.push(`global_joint_rotations shape ${rotShape.join('x')} != ${framesFromBytes}x${JOINTS}x9`);
  if (rootShape.length !== 2 || rootShape[0] !== framesFromBytes || rootShape[1] !== 3) problems.push(`global_root_positions shape ${rootShape.join('x')} != ${framesFromBytes}x3`);
  if (headShape.length !== 1 || headShape[0] !== framesFromBytes) problems.push(`global_headings shape ${headShape.join('x')} != ${framesFromBytes}`);
  if (maskShape.length !== 1 || maskShape[0] !== MASK_ENTRIES) problems.push(`allowed_tokens shape ${maskShape.join('x')} != ${MASK_ENTRIES}`);
  if (predictedFrames === null) problems.push(`parameter_count ${parameterCount} is not 412*F+11 for any integer F`);
  else if (predictedFrames !== framesFromBytes) problems.push(`FRAME TABLE MISMATCH: manifest predicts ${predictedFrames} frames, bytes carry ${framesFromBytes}`);

  const totalFloats = positions.data.length + rotations.data.length + roots.data.length + headings.data.length;
  const totalParams = totalFloats + mask.data.length;
  if (totalParams !== parameterCount) problems.push(`element total ${totalParams} != manifest parameter_count ${parameterCount}`);

  // Finiteness across every element.
  for (const [tn, tv] of [['positions', positions], ['rotations', rotations], ['roots', roots], ['headings', headings]]) {
    for (let i = 0; i < tv.data.length; i += 1) {
      if (!Number.isFinite(tv.data[i])) { problems.push(`${tn} element ${i} is not finite`); break; }
    }
  }

  const orthoError = worstOrthonormalityError(rotations.data, framesFromBytes);
  if (orthoError > 1e-4) problems.push(`rotation matrices not orthonormal to 1e-4 (worst ${orthoError.toExponential(3)})`);

  // MEASURED CONVENTION, not assumed. `global_root_positions` is the GROUND-
  // PROJECTED trajectory: its Y component is exactly 0 in every frame of all 15
  // styles, and `global_joint_positions` is root-relative (pelvis XZ pinned at 0
  // every frame) with the ground plane at Y ~ 0. A first cut of this reader took
  // hip height from root Y and flagged all 15 styles; the frame-table falsifier
  // had already passed, which is what said the READER's assumption was wrong and
  // not the layout. Both conventions are now asserted rather than assumed.
  const rootY = [];
  const rootX = [];
  const rootZ = [];
  for (let f = 0; f < framesFromBytes; f += 1) {
    rootX.push(roots.data[f * 3 + 0]);
    rootY.push(roots.data[f * 3 + 1]);
    rootZ.push(roots.data[f * 3 + 2]);
  }
  const worstRootY = Math.max(...rootY.map(Math.abs));
  if (worstRootY > 1e-6) problems.push(`global_root_positions Y is not a ground projection (worst |Y| ${worstRootY.toExponential(3)})`);

  // Hip height is the pelvis (joint 0) Y in the root-relative joint tensor.
  const pelvisY = [];
  let worstPelvisPlanar = 0;
  for (let f = 0; f < framesFromBytes; f += 1) {
    const b = f * JOINTS * 3;
    pelvisY.push(positions.data[b + 1]);
    worstPelvisPlanar = Math.max(worstPelvisPlanar, Math.abs(positions.data[b]), Math.abs(positions.data[b + 2]));
  }
  if (worstPelvisPlanar > 1e-5) problems.push(`global_joint_positions is not root-relative: pelvis XZ wanders by ${worstPelvisPlanar.toExponential(3)}`);
  const hipHeight = median(pelvisY);
  if (!(hipHeight > 0.15 && hipHeight < 1.6)) problems.push(`median pelvis Y ${hipHeight.toFixed(4)} m outside plausible G1 pelvis band 0.15-1.6 m`);

  const headingStep = unwrapHeadingStep(Array.from(headings.data));
  if (headingStep > Math.PI / 2) problems.push(`heading discontinuity: worst step ${(headingStep * 180 / Math.PI).toFixed(1)} deg between adjacent frames`);

  // Ground-plane travel and mean speed (the calibration constants).
  let travel = 0;
  for (let f = 1; f < framesFromBytes; f += 1) {
    const dx = rootX[f] - rootX[f - 1];
    const dz = rootZ[f] - rootZ[f - 1];
    travel += Math.hypot(dx, dz);
  }
  const netTravel = Math.hypot(rootX[framesFromBytes - 1] - rootX[0], rootZ[framesFromBytes - 1] - rootZ[0]);
  const duration = framesFromBytes / fps;
  const meanSpeed = framesFromBytes > 1 ? travel / ((framesFromBytes - 1) / fps) : 0;

  // Frame-0 rest offsets: each joint's global position relative to the pelvis.
  const restOffsets = [];
  const p0x = positions.data[0]; const p0y = positions.data[1]; const p0z = positions.data[2];
  for (let j = 0; j < JOINTS; j += 1) {
    restOffsets.push([
      Number((positions.data[j * 3 + 0] - p0x).toFixed(6)),
      Number((positions.data[j * 3 + 1] - p0y).toFixed(6)),
      Number((positions.data[j * 3 + 2] - p0z).toFixed(6)),
    ]);
  }

  // Frame-0 stature: highest joint Y minus lowest joint Y.
  let minY = Infinity; let maxY = -Infinity;
  for (let j = 0; j < JOINTS; j += 1) {
    const y = positions.data[j * 3 + 1];
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }

  return {
    name,
    styleName: gguf.kv['motionbricks.style_name'] ?? null,
    skeleton: gguf.kv['motionbricks.skeleton'] ?? null,
    component: gguf.kv['motionbricks.component'] ?? null,
    formatVersion: gguf.kv['motionbricks.format_version'] ?? null,
    upstreamRevision: gguf.kv['motionbricks.upstream_revision'] ?? null,
    sourceSha256: gguf.kv['motionbricks.source_sha256'] ?? null,
    styleSpeedMetadata: gguf.kv['motionbricks.style_speed'] ?? null,
    styleFramesMetadata: gguf.kv['motionbricks.style_frames'] ?? null,
    parameterCountManifest: parameterCount,
    parameterCountFromBytes: totalParams,
    predictedFrames,
    framesFromBytes,
    fps,
    durationS: Number(duration.toFixed(4)),
    hipHeightM: Number(hipHeight.toFixed(5)),
    pelvisYMinM: Number(Math.min(...pelvisY).toFixed(5)),
    pelvisYMaxM: Number(Math.max(...pelvisY).toFixed(5)),
    dominantTravelAxis: Math.abs(rootX[framesFromBytes - 1] - rootX[0]) >= Math.abs(rootZ[framesFromBytes - 1] - rootZ[0]) ? 'x' : 'z',
    netTravelXM: Number((rootX[framesFromBytes - 1] - rootX[0]).toFixed(5)),
    netTravelZM: Number((rootZ[framesFromBytes - 1] - rootZ[0]).toFixed(5)),
    frame0StatureM: Number((maxY - minY).toFixed(5)),
    pathTravelM: Number(travel.toFixed(5)),
    netTravelM: Number(netTravel.toFixed(5)),
    meanGroundSpeedMS: Number(meanSpeed.toFixed(5)),
    worstOrthonormalityError: Number(orthoError.toExponential(4)),
    worstHeadingStepDeg: Number((headingStep * 180 / Math.PI).toFixed(4)),
    allowedDurationMask: Array.from(mask.data),
    restOffsetsFrame0: restOffsets,
    problems,
  };
}

/** Read the 34 joint names and parent indices from support.gguf's metadata. */
export function readSupportSkeleton(buf) {
  const gguf = readGguf(buf);
  const raw = gguf.kv['motionbricks.joint_names'];
  if (typeof raw !== 'string') throw new Error('support.gguf: motionbricks.joint_names missing or not a string');
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const parentsTensor = gguf.tensors.get('joint_parents');
  if (!parentsTensor) throw new Error('support.gguf: joint_parents tensor missing');
  const parents = Array.from(parentsTensor.data, (v) => Number(v));
  const neutral = gguf.tensors.get('neutral_joints');
  return {
    skeleton: gguf.kv['motionbricks.skeleton'] ?? null,
    upstreamRevision: gguf.kv['motionbricks.upstream_revision'] ?? null,
    sourceSha256: gguf.kv['motionbricks.source_sha256'] ?? null,
    names,
    parents,
    parentsDims: logicalShape(parentsTensor.dims),
    neutralDims: neutral ? logicalShape(neutral.dims) : null,
    neutral: neutral ? Array.from(neutral.data, (v) => Number(v.toFixed(6))) : null,
    tensorNames: [...gguf.tensors.keys()],
  };
}

function parseArgs(argv) {
  const out = { dir: 'artifacts/hf422/styles', support: 'artifacts/hf422/support.gguf', out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') out.dir = argv[++i];
    else if (a === '--support') out.support = argv[++i];
    else if (a === '--out') out.out = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.join(args.dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const skeleton = readSupportSkeleton(fs.readFileSync(args.support));
  console.log(`skeleton ${skeleton.skeleton}: ${skeleton.names.length} joint names, ${skeleton.parents.length} parents (tensors: ${skeleton.tensorNames.join(', ')})`);

  const styles = [];
  let failures = 0;
  for (const [name, entry] of Object.entries(manifest.styles).sort(([a], [b]) => a.localeCompare(b))) {
    const buf = fs.readFileSync(path.join(args.dir, entry.path));
    const a = analyseStyle(buf, { name, parameterCount: entry.parameter_count });
    styles.push(a);
    const verdict = a.problems.length === 0 ? 'OK ' : 'FAIL';
    console.log(`${verdict} ${name.padEnd(18)} frames predicted ${String(a.predictedFrames).padStart(3)} / bytes ${String(a.framesFromBytes).padStart(3)}  ${a.durationS.toFixed(2)}s  hip ${a.hipHeightM.toFixed(3)}m  travel ${a.pathTravelM.toFixed(3)}m  speed ${a.meanGroundSpeedMS.toFixed(3)} m/s  ortho ${a.worstOrthonormalityError}`);
    for (const p of a.problems) { console.log(`     ! ${p}`); failures += 1; }
  }

  const report = {
    lane: 'HF-422',
    generatedAt: new Date().toISOString(),
    source: {
      repo: 'https://huggingface.co/LocalAI-io/MotionBricks-G1-GGML',
      commit: 'cc2a47603dbc203a4f18f35dd06ed3611833f506',
      licence: 'NVIDIA Open Model License (weights) / Apache-2.0 (port code)',
      note: 'Style primitives are Model data under NVIDIA OML Sec 3. They are NOT committed; only these derived measurements are.',
    },
    layoutAssumption: {
      floatsPerFrame: FLOATS_PER_FRAME,
      maskEntries: MASK_ENTRIES,
      formula: 'parameter_count = 412*F + 11',
    },
    skeleton,
    styles,
    allStylesClean: failures === 0,
  };
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nwrote ${args.out}`);
  }
  if (failures > 0) {
    console.error(`\nPHASE STOPS: ${failures} layout/validity problem(s). The docs layout assumption is wrong; do not retarget.`);
    process.exit(1);
  }
  console.log(`\nall ${styles.length} styles agree with the manifest-derived frame table.`);
}

const IS_CLI = Boolean(process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/animation/parse-mbstyle.mjs'));

if (IS_CLI && !process.argv.includes('--emit-motion')) {
  main();
}

// ---------------------------------------------------------------------------
// Motion export: `.mbstyle` -> the `.f32` pair `retarget-kimodo-motion.py`
// already consumes, so the Blender retarget is REUSED rather than forked.
//
// Three conventions here are MEASURED, not assumed, and each was checked
// against the file before anything was written:
//
//  1. `global_joint_rotations` is ROW-MAJOR 3x3. Reconstructing the published
//     `global_joint_positions` by forward kinematics from `neutral_joints` and
//     the parent chain agrees to 5.005e-7 row-major and is out by 6.930e-1
//     column-major. That same reconstruction also proves the parent list and
//     that the G1 rest rotations are IDENTITY - the property the global-delta
//     retarget depends on, and the one SOMA-30 has too.
//  2. `global_joint_positions` is world-ORIENTED and root-TRANSLATED: the
//     pelvis XZ is pinned at 0 while the shoulder line still tracks
//     `global_headings`, so the figure's yaw is inside the data, not factored
//     out of it.
//  3. Forward is the CLIP's own travel direction, not a fixed axis. In
//     `walk_gun` the left ankle swings 0.371 m along X and 0.097 m along Z
//     while the root travels to -X: the stride axis is X, so a fixed "+Z is
//     forward" assumption would have produced a soldier strafing sideways for
//     2.5 seconds with every joint angle correct. The clip is therefore yawed
//     about Y by its own measured travel heading so that forward lands on +Z,
//     which is the convention the Blender script already implements for
//     SOMA-30. Rotating about Y changes only the ROOT's local rotation - every
//     child's local rotation is R_parent^T R_child, in which the yaw cancels.
// ---------------------------------------------------------------------------

function matToQuatXyzw(m) {
  // m is row-major 3x3: m[r*3+c].
  const trace = m[0] + m[4] + m[8];
  let x; let y; let z; let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / s; x = 0.25 * s; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = 0.25 * s; z = (m[5] + m[7]) / s;
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w);
  return [x / n, y / n, z / n, w / n];
}

const matMul = (a, b) => {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
};
const matTranspose = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];

/**
 * Emit `root_positions.f32` + `local_rotations_xyzw.f32` + `skeleton.json` for
 * one style. The rotation round-trip (global -> local -> recomposed global) is
 * asserted here rather than trusted, because a wrong parent-chain order is the
 * defect that produces a plausible-looking wrong answer.
 */
export function emitMotion({ styleBuf, supportBuf, styleName, outDir, inPlace = false }) {
  const gguf = readGguf(styleBuf);
  const skeleton = readSupportSkeleton(supportBuf);
  const N = skeleton.names.length;
  const positions = gguf.tensors.get('global_joint_positions').data;
  const rotations = gguf.tensors.get('global_joint_rotations').data;
  const roots = gguf.tensors.get('global_root_positions').data;
  const frames = logicalShape(gguf.tensors.get('global_joint_positions').dims)[0];

  const travelYaw = Math.atan2(roots[(frames - 1) * 3] - roots[0], roots[(frames - 1) * 3 + 2] - roots[2]);
  const cy = Math.cos(travelYaw); const sy = Math.sin(travelYaw);
  // Ry(travelYaw) row-major: maps a vector at yaw a to yaw a - travelYaw.
  const yawMat = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];

  const rootOut = new Float32Array(frames * 3);
  const localOut = new Float32Array(frames * N * 4);
  let worstRoundTrip = 0;

  for (let f = 0; f < frames; f += 1) {
    // IN-PLACE is the default comparison form, and this is not a convenience.
    // The runtime owns root motion: `animation-locomotion.ts` speed-matches an
    // IN-PLACE cycle against the character's actual velocity, so a clip carrying
    // its own travel double-applies it. It also makes the foot-slide metric
    // meaningless - the measurer reports world foot displacement, so 2.8 m of
    // baked travel reads as 3.3 m of "slide" while every contact is perfect.
    // That is exactly how `Kimodo_Walk_Forward` measured 4.20 m and was
    // rejected. The travelling form is kept behind a flag because the eventual
    // native build will want it for seam analysis.
    const rx = inPlace ? 0 : roots[f * 3]; const rz = inPlace ? 0 : roots[f * 3 + 2];
    rootOut[f * 3 + 0] = rx * cy + rz * sy;
    rootOut[f * 3 + 1] = positions[f * N * 3 + 1]; // pelvis height above ground
    rootOut[f * 3 + 2] = -rx * sy + rz * cy;

    const globals = [];
    for (let j = 0; j < N; j += 1) {
      const b = (f * N + j) * 9;
      globals.push(Array.from(rotations.slice(b, b + 9)));
    }
    const locals = [];
    for (let j = 0; j < N; j += 1) {
      const parent = skeleton.parents[j];
      const local = parent < 0 ? matMul(yawMat, globals[j]) : matMul(matTranspose(globals[parent]), globals[j]);
      locals.push(local);
      localOut.set(matToQuatXyzw(local), (f * N + j) * 4);
    }
    // Round-trip: recompose the locals back up the chain and compare with the
    // yawed source globals.
    const recomposed = [];
    for (let j = 0; j < N; j += 1) {
      const parent = skeleton.parents[j];
      recomposed.push(parent < 0 ? locals[j] : matMul(recomposed[parent], locals[j]));
      const expected = matMul(yawMat, globals[j]);
      for (let k = 0; k < 9; k += 1) worstRoundTrip = Math.max(worstRoundTrip, Math.abs(recomposed[j][k] - expected[k]));
    }
  }
  if (worstRoundTrip > 1e-4) throw new Error(`global -> local -> global round trip failed (worst ${worstRoundTrip.toExponential(3)}); the parent chain is wrong`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'root_positions.f32'), Buffer.from(rootOut.buffer));
  fs.writeFileSync(path.join(outDir, 'local_rotations_xyzw.f32'), Buffer.from(localOut.buffer));
  const restOffsets = skeleton.names.map((_, j) => {
    const parent = skeleton.parents[j];
    const at = (i) => [skeleton.neutral[i * 3], skeleton.neutral[i * 3 + 1], skeleton.neutral[i * 3 + 2]];
    if (parent < 0) return [0, 0, 0];
    const a = at(j); const b = at(parent);
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  });
  const meta = {
    style: styleName,
    inPlace,
    skeleton: skeleton.skeleton,
    frames,
    fps: 30,
    joints: N,
    names: skeleton.names,
    parents: skeleton.parents,
    restOffsets,
    restHipHeightM: -skeleton.neutral[skeleton.names.indexOf('left_toe_base') * 3 + 1],
    travelYawRad: Number(travelYaw.toFixed(6)),
    worstRoundTrip: Number(worstRoundTrip.toExponential(4)),
    upAxis: 'y',
    forwardAxis: 'z',
    note: 'Derived from NVIDIA Open Model License model data in git-ignored artifacts/. This directory is scratch and is never committed.',
  };
  fs.writeFileSync(path.join(outDir, 'skeleton.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

if (IS_CLI && process.argv.includes('--emit-motion')) {
  const argv = process.argv;
  const style = argv[argv.indexOf('--emit-motion') + 1];
  const dir = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'artifacts/hf422/styles';
  const support = argv.includes('--support') ? argv[argv.indexOf('--support') + 1] : 'artifacts/hf422/support.gguf';
  const outDir = argv.includes('--motion-out') ? argv[argv.indexOf('--motion-out') + 1] : `artifacts/motion/raw/hf422-${style}`;
  const meta = emitMotion({
    styleBuf: fs.readFileSync(path.join(dir, `${style}.mbstyle`)),
    supportBuf: fs.readFileSync(support),
    styleName: style,
    outDir,
    inPlace: argv.includes('--in-place'),
  });
  console.log(JSON.stringify(meta, (k, v) => (k === 'restOffsets' || k === 'names' || k === 'parents' ? undefined : v), 2));
  console.log(`wrote ${outDir}`);
}
