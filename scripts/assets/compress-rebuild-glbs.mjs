// Texture budget pass for the rebuild asset set - 2026-09-16.
//
// WHY THIS EXISTS. scripts/qa/measure-glb-vram.mjs measured the rebuild tree at
// 128.4 MB of download decoding to 1594.7 MB of resident VRAM across 272
// textures, with 0 of 39 GLBs carrying any texture compression. The two numbers
// are decoupled, and only one of them is the defect: VRAM is a function of
// texture RESOLUTION (width x height x 4 bytes x 4/3 for the mip chain), while
// file size is a function of ENCODING. public/assets/rebuild/vehicles/semi.glb
// is 1.33 MB on disk and 138.7 MB on the GPU; crates-worn/crate-06-worn.glb
// carries nine 1024x1024 maps for 580 triangles. Re-encoding alone would have
// moved the download number and left the GPU number untouched, which is why
// this pass RESIZES first and only then applies the repo's encoding recipe.
//
// THE RESOLUTION DECISION (integrator, 2026-09-16). 512 px maximum edge for
// props, crates, wear, spread, plants, trees, furniture and vehicles; 1024 px
// only for the surfaces a player stands directly against - the `interiors` and
// `ground` texture sets. `houses` is not in either list and is treated as 512
// here: its maps are per-material tiling maps (Concrete, YellowSiding,
// ShingleBrownGrey, ...), not one atlas stretched over a building, so their
// texel density is set by UV tiling rather than by building size - and the
// directly comparable structures, props/shed.glb and spread/shed.glb, are
// explicitly in the 512 list.
//
// ONE EXCEPTION, on measured quality. `furniture` is held at 1024 rather than
// 512. Every other set carries per-material TILING maps whose texel density is
// set by UV repeat, so halving the map halves density on a surface that was
// already repeating. The five furniture GLBs instead carry ONE 2048 px atlas
// each covering the whole object (sofa, bed, bath set, kitchen counter), so 512
// is a 16x texel cut, not a 4x one - and these are interior props the player
// walks up to, the same rooms the `interiors` set was given 1024 for. Rendered
// crops of the 512 atlas next to the 2048 source show timber edges and pleats
// going blocky at close range; at 1024 they hold. The exception costs 21 MB of
// the 1232 MB this pass saves.
//
// WHY THERE IS NO MESHOPT STEP, unlike scripts/assets/compress-quality-glbs.mjs
// which encodes the same sanctioned recipe for the two Quality GLBs. That
// script's output is loaded by src/blender-environment.ts, which builds its
// loader as `new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)`. The rebuild
// tree is loaded by src/atomic-acres-rebuild-arena.ts, whose loader is a bare
// `new GLTFLoader()` with no Meshopt decoder registered, and whose kitbash()
// swallows load rejection to leave the gray placeholder massing in place.
// Meshopt-compressing these GLBs would therefore not error visibly - it would
// silently turn every rebuild prop back into gray massing, which is the exact
// defect class this pass is here to remove. Meshopt is also worth close to
// nothing here: these are 580-3740 triangle assets whose bytes are ~99%
// texture. If the decoder is ever registered in the rebuild arena loader, add
// a `meshopt` step between `webp` and `validate` below.
//
// Usage:
//   node scripts/assets/compress-rebuild-glbs.mjs [OPTIONS]
//     --dry-run          report what would change, write nothing
//     --only <substring> restrict to matching paths (e.g. --only vehicles/)
//     --backup <dir>     byte-copy each original under <dir>/public/assets/...
//                        before it is overwritten. An existing backup file is
//                        never overwritten, so re-running cannot destroy the
//                        pre-pass originals with already-compressed bytes.
//     --no-manifest      skip the assets.manifest.json hash/bytes update
//
// The 2026-09-16 run used --backup C:/Users/david/Desktop/stuff/repo-state/pre-compression-20260916.
//
// Recompressing changes the bytes that assets.manifest.json pins, so this
// script updates the sha256/bytes of every file it rewrites in the same run.
// scripts/qa/verify-public-asset-provenance.mjs must stay green afterwards.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
const rebuildRoot = join(root, 'public/assets/rebuild');
const manifestPath = join(root, 'assets.manifest.json');

// Maximum texture edge in pixels, by asset set (the directory under
// public/assets/rebuild). gltf-transform's resize never UPSIZES, so a set whose
// maps are already at or below its target passes through untouched.
const SET_MAX_EDGE = { interiors: 1024, ground: 1024, furniture: 1024 };
const DEFAULT_MAX_EDGE = 512;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1]);
const dryRun = flag('--dry-run');
const only = value('--only');
const backupRoot = value('--backup');
const updateManifest = !flag('--no-manifest');

const slash = (value) => value.split('\\').join('/');
const rel = (absolute) => slash(relative(root, absolute));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const maxEdgeFor = (relativePath) => {
  const set = relativePath.split('/')[3] ?? '';
  return SET_MAX_EDGE[set] ?? DEFAULT_MAX_EDGE;
};

function walk(directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`gltf-transform ${args[0]} failed with status ${result.status}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

// gltf-transform validate exits 0 even when the report contains errors, so the
// report itself is the gate: anything other than a clean ERROR section fails
// the file. Warnings are printed with the failure but do not fail on their own;
// MESH_PRIMITIVE_GENERATED_TANGENT_SPACE is present on these assets before this
// pass and is a property of the source meshes, not of the compression.
function validate(file) {
  const report = run(['validate', file]);
  if (!report.includes('No errors found')) {
    process.stderr.write(report);
    throw new Error(`gltf-transform validate reported errors for ${rel(file)}`);
  }
}

// GLB texture census, read straight out of the container, so the receipt states
// measured dimensions rather than the dimensions the resize was asked for.
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const MIP_CHAIN_FACTOR = 4 / 3;
const BYTES_PER_TEXEL = 4;

function parseGlb(buffer) {
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_JSON_CHUNK) json = JSON.parse(body.toString('utf8'));
    else if (type === GLB_BIN_CHUNK) bin = body;
    offset += 8 + length;
  }
  return { json, bin };
}

// PNG, JPEG and WebP headers. The WebP reader is required BECAUSE of this pass:
// once a texture is WebP a PNG/JPEG-only reader cannot see its dimensions, and
// an unmeasured texture must never be allowed to read as a free one.
function imageSize(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const format = bytes.toString('ascii', 12, 16);
    // VP8X (extended) stores 24-bit minus-one dimensions; VP8L (lossless) packs
    // 14 bits each into a 32-bit little-endian field; VP8 (lossy) is 16-bit.
    if (format === 'VP8X') {
      return {
        width: (bytes.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (bytes.readUIntLE(27, 3) & 0xffffff) + 1,
      };
    }
    if (format === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (format === 'VP8 ') {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}

function census(file) {
  const { json, bin } = parseGlb(readFileSync(file));
  let vram = 0;
  let unreadable = 0;
  let longestEdge = 0;
  let nonWebp = 0;
  const edges = new Set();
  for (const image of json?.images ?? []) {
    const view = json.bufferViews[image.bufferView];
    if (!view) continue;
    if (image.mimeType !== 'image/webp') nonWebp += 1;
    const start = view.byteOffset ?? 0;
    const size = imageSize(bin.subarray(start, start + view.byteLength));
    if (!size) { unreadable += 1; continue; }
    edges.add(`${size.width}x${size.height}`);
    longestEdge = Math.max(longestEdge, size.width, size.height);
    vram += size.width * size.height * BYTES_PER_TEXEL * MIP_CHAIN_FACTOR;
  }
  return { images: (json?.images ?? []).length, vram, unreadable, longestEdge, nonWebp, dimensions: [...edges].sort() };
}

const glbs = walk(rebuildRoot)
  .filter((file) => file.endsWith('.glb'))
  .map(rel)
  .filter((file) => only === null || file.includes(only))
  .sort();

const results = [];
for (const relativePath of glbs) {
  const source = join(root, relativePath);
  const maxEdge = maxEdgeFor(relativePath);
  const before = { bytes: statSync(source).size, ...census(source) };

  // Each stage is skipped when it has nothing to do, which is what makes a
  // second run a no-op instead of a quality loss: gltf-transform's resize
  // decodes and re-encodes every texture it touches, and re-encoding a WebP
  // texture goes through sharp's LOSSY WebP defaults. Running the unguarded
  // pipeline twice measurably degraded these assets (worst map 24.90 -> 23.84
  // dB against the authored original) while reporting a smaller download, so a
  // file already at its target edge and already WebP is now left untouched.
  // Re-targeting an already-WebP set to a SMALLER edge is the one case this
  // cannot make safe - run that from the pre-pass originals, not from the
  // compressed artefacts.
  const needsResize = before.longestEdge > maxEdge;
  const needsWebp = before.nonWebp > 0;
  if (!needsResize && !needsWebp) {
    results.push({
      path: relativePath,
      maxEdge,
      images: before.images,
      skipped: 'already at target edge and already WebP',
      dimensionsBefore: before.dimensions,
      dimensionsAfter: before.dimensions,
      bytesBefore: before.bytes,
      bytesAfter: before.bytes,
      vramBytesBefore: before.vram,
      vramBytesAfter: before.vram,
      sha256: null,
    });
    continue;
  }

  const resized = `${source}.rebuild-resize.glb`;
  const encoded = `${source}.rebuild-webp.glb`;
  try {
    // The webp command's --formats takes ONE format, so a file holding both
    // WebP and PNG/JPEG textures cannot be encoded without running the WebP
    // ones back through a lossy default re-encode. No asset in this tree is
    // mixed; refuse rather than quietly degrade if one ever is.
    if (!needsResize && before.nonWebp < before.images) {
      throw new Error(`${relativePath}: mixed WebP and PNG/JPEG textures; re-run from the pre-pass original instead`);
    }
    const input = needsResize ? resized : source;
    if (needsResize) run(['resize', source, resized, '--width', String(maxEdge), '--height', String(maxEdge)]);
    run(['webp', input, encoded, '--lossless']);
    validate(encoded);
    const after = { bytes: statSync(encoded).size, ...census(encoded) };
    if (before.images !== after.images) {
      throw new Error(`${relativePath}: image count changed ${before.images} -> ${after.images}`);
    }
    if (after.unreadable > 0) {
      throw new Error(`${relativePath}: ${after.unreadable} texture header(s) unreadable after encoding`);
    }

    if (!dryRun) {
      if (backupRoot !== null) {
        const backup = join(resolve(backupRoot), relativePath);
        mkdirSync(dirname(backup), { recursive: true });
        // Never overwrite an existing backup: a second run would otherwise
        // replace the pre-pass originals with already-compressed bytes.
        if (!existsSync(backup)) copyFileSync(source, backup);
        else if (sha256(backup) !== sha256(source)) {
          console.warn(`note: backup already present and differs from the current file, kept: ${rel(backup)}`);
        }
      }
      copyFileSync(encoded, source);
    }

    results.push({
      path: relativePath,
      maxEdge,
      images: before.images,
      dimensionsBefore: before.dimensions,
      dimensionsAfter: after.dimensions,
      bytesBefore: before.bytes,
      bytesAfter: after.bytes,
      vramBytesBefore: before.vram,
      vramBytesAfter: after.vram,
      sha256: dryRun ? null : sha256(source),
    });
  } finally {
    rmSync(resized, { force: true });
    rmSync(encoded, { force: true });
  }
}

// Loose textures under the rebuild tree are read-only here: they are referenced
// by filename from src/, so re-encoding them to .webp would break those
// references. They are censused only to prove they honour the same per-set
// resolution decision this pass applies to the GLBs.
const looseTextures = walk(rebuildRoot)
  .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
  .map((file) => {
    const relativePath = rel(file);
    const size = imageSize(readFileSync(file));
    return {
      path: relativePath,
      maxEdge: maxEdgeFor(relativePath),
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  });
const looseOverBudget = looseTextures.filter((t) => t.width === null || Math.max(t.width, t.height) > t.maxEdge);

const rewritten = results.filter((result) => result.skipped === undefined);
let manifestUpdates = [];
// The manifest is synced from the files ON DISK, not from this run's outputs,
// and covers skipped files too - so a run that rewrites nothing still leaves
// assets.manifest.json agreeing with the tree, and a half-finished earlier run
// is repaired rather than compounded.
if (updateManifest && !dryRun && results.length > 0) {
  const original = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  const handled = new Set(results.map((result) => result.path));
  const touchedAssets = new Set();
  for (const asset of manifest.assets ?? []) {
    if (!Array.isArray(asset.files)) continue;
    for (const entry of asset.files) {
      if (entry === null || typeof entry !== 'object' || !handled.has(entry.path)) continue;
      const absolute = join(root, entry.path);
      entry.sha256 = sha256(absolute);
      entry.bytes = statSync(absolute).size;
      manifestUpdates.push(entry.path);
      touchedAssets.add(asset);
    }
  }
  const raised = Object.entries({ ...SET_MAX_EDGE }).filter(([, edge]) => edge !== DEFAULT_MAX_EDGE);
  for (const asset of touchedAssets) {
    asset.postProcess = 'Texture budget pass 2026-09-16 (scripts/assets/compress-rebuild-glbs.mjs): '
      + `gltf-transform resize to a maximum texture edge of ${DEFAULT_MAX_EDGE} px, `
      + `${raised.map(([set, edge]) => `${edge} px for ${set}`).join(', ')}, `
      + 'followed by lossless WebP encoding. Geometry, materials, node names and extras are unchanged; '
      + 'only the embedded texture resolution and encoding differ from the authored asset.';
  }
  // Every rewritten file must be pinned, or verify-public-asset-provenance.mjs
  // is left failing by this pass.
  const unpinned = results.map((result) => result.path).filter((path) => !manifestUpdates.includes(path));
  if (unpinned.length > 0) throw new Error(`rewrote files with no assets.manifest.json entry:\n  ${unpinned.join('\n  ')}`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}${original.endsWith('\n') ? '\n' : ''}`, 'utf8');
}

const MB = 1048576;
const sum = (key) => results.reduce((total, result) => total + result[key], 0);
console.log(JSON.stringify({
  schemaVersion: 1,
  mode: dryRun ? 'dry-run' : 'applied',
  compressor: '@gltf-transform/cli 4.4.1 (resize lanczos3 -> webp --lossless -> validate)',
  maxEdgeBySet: { ...SET_MAX_EDGE, default: DEFAULT_MAX_EDGE },
  totals: {
    glbs: results.length,
    rewritten: rewritten.length,
    skipped: results.length - rewritten.length,
    downloadMbBefore: Number((sum('bytesBefore') / MB).toFixed(1)),
    downloadMbAfter: Number((sum('bytesAfter') / MB).toFixed(1)),
    vramMbBefore: Number((sum('vramBytesBefore') / MB).toFixed(1)),
    vramMbAfter: Number((sum('vramBytesAfter') / MB).toFixed(1)),
  },
  manifestUpdated: manifestUpdates.length,
  looseTextures: { total: looseTextures.length, overBudget: looseOverBudget },
  models: results,
}, null, 2));
