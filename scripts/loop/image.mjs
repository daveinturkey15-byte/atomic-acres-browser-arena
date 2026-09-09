// Reference-grounded loop - the only module that touches sharp.
// Everything above this line in the dependency graph works on decoded planes,
// so the mathematics stays testable without a decoder and without fixtures.
//
// sharp 0.34.5 is already a devDependency and 21 scripts under scripts/qa/
// import it. This lane adds NO dependency; the raw-buffer and composite
// patterns here follow scripts/qa/diff-arena-viewpoints.mjs.

import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Analysis resolution, matching the arena viewpoint differ so the two
// instruments talk about frames at the same scale.
export const ANALYSIS_W = 640;
export const ANALYSIS_H = 360;

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Decode an image to a fixed-size 8-bit luma plane plus (where present) an
 * alpha plane at the same size.
 *
 * fit:'fill' is deliberate and is a KNOWN DISTORTION: a reference photograph
 * and a capture rarely share an aspect ratio, and stretching is the honest
 * cheap option because letterboxing would inject synthetic edges into the
 * edge-IoU. The native sizes and an aspectMismatch flag travel in the output
 * so a reader can see when the stretch was significant.
 */
export async function loadPlane(path, { width = ANALYSIS_W, height = ANALYSIS_H } = {}) {
  const image = sharp(path);
  const meta = await image.metadata();
  const { data, info } = await sharp(path)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = width * height;
  const luma = new Uint8Array(pixels);
  const alpha = new Uint8Array(pixels);
  const channels = info.channels;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * channels;
    // Rec. 601 luma, the same weighting sharp's own .grayscale() uses.
    luma[i] = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    alpha[i] = channels >= 4 ? data[o + 3] : 255;
  }
  let hasAlpha = false;
  for (let i = 0; i < pixels; i += 1) if (alpha[i] !== 255) { hasAlpha = true; break; }
  return {
    path,
    width,
    height,
    luma,
    alpha: hasAlpha ? alpha : null,
    native: { width: meta.width ?? null, height: meta.height ?? null, format: meta.format ?? null },
    sha256: sha256File(path),
  };
}

export function aspectMismatch(a, b) {
  if (!a.native.width || !a.native.height || !b.native.width || !b.native.height) return null;
  const ra = a.native.width / a.native.height;
  const rb = b.native.width / b.native.height;
  return Math.round(Math.abs(ra - rb) / Math.max(ra, rb) * 1e4) / 1e4;
}

/**
 * Stamp a probe token into a corner patch of a COPY of a capture.
 *
 * The token is rendered as a high-contrast block grid rather than as text so
 * it survives aggressive downscaling on the model side, and so that reading it
 * requires actually looking at pixels rather than at a filename. See probe.mjs
 * for the encoding.
 *
 * HARD RULE, enforced by the caller and restated here: the stamp goes on the
 * critic's copy only. It never touches the archived evidence capture, and the
 * stamped corner is excluded from every scored region (see PROBE_PATCH).
 */
// The patch is sized as a FRACTION of the frame, not in fixed pixels: a model
// downscales what it is given, and a 96 px patch on a 1920 px frame becomes
// unreadable mush at whatever resolution the projector actually uses. Black
// ink on white paper with a black keyline, because that is the highest
// contrast a downscale preserves.
export const PROBE_PATCH = Object.freeze({
  widthFraction: 0.22,
  minCell: 3,
  quietZoneCells: 2,
  marginFraction: 0.015,
  corner: 'bottom-right',
});

export async function stampProbe(sourcePath, destPath, blocks, { patch = PROBE_PATCH } = {}) {
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error(`stampProbe: cannot read dimensions of ${sourcePath}`);
  const rows = blocks.length;
  const cols = blocks[0].length;
  const quiet = patch.quietZoneCells;
  const cell = Math.max(patch.minCell, Math.round((width * patch.widthFraction) / (cols + quiet * 2)));
  const patchW = (cols + quiet * 2) * cell;
  const patchH = (rows + quiet * 2) * cell;
  if (patchW >= width || patchH >= height) throw new RangeError(`stampProbe: probe patch ${patchW}x${patchH} does not fit in ${width}x${height}`);

  const px = Buffer.alloc(patchW * patchH * 3, 255);
  const keyline = Math.max(1, Math.round(cell / 2));
  for (let y = 0; y < patchH; y += 1) {
    for (let x = 0; x < patchW; x += 1) {
      const onKeyline = x < keyline || y < keyline || x >= patchW - keyline || y >= patchH - keyline;
      const row = Math.floor(y / cell) - quiet;
      const col = Math.floor(x / cell) - quiet;
      const inGrid = row >= 0 && row < rows && col >= 0 && col < cols;
      const ink = onKeyline || (inGrid && blocks[row][col] === 1);
      const v = ink ? 0 : 255;
      const o = (y * patchW + x) * 3;
      px[o] = v; px[o + 1] = v; px[o + 2] = v;
    }
  }
  const margin = Math.round(width * patch.marginFraction);
  const patchBuffer = await sharp(px, { raw: { width: patchW, height: patchH, channels: 3 } }).png().toBuffer();
  await sharp(sourcePath)
    .composite([{ input: patchBuffer, left: width - patchW - margin, top: height - patchH - margin }])
    .png()
    .toFile(destPath);
  return { destPath, patchW, patchH, cell, margin, corner: patch.corner, width, height };
}

/**
 * Side-by-side reference | capture | edge-overlay composite, for a human to
 * check what the numbers claim. Same shape as the viewpoint differ's output.
 */
export async function writeComposite(referencePath, capturePath, edgeMaskA, edgeMaskB, destPath, { width = ANALYSIS_W, height = ANALYSIS_H } = {}) {
  const overlay = Buffer.alloc(width * height * 3, 0);
  for (let i = 0; i < width * height; i += 1) {
    const inA = edgeMaskA[i] !== 0;
    const inB = edgeMaskB[i] !== 0;
    const o = i * 3;
    // Magenta = reference only, green = capture only, white = agreement.
    if (inA && inB) { overlay[o] = 255; overlay[o + 1] = 255; overlay[o + 2] = 255; }
    else if (inA) { overlay[o] = 255; overlay[o + 2] = 255; }
    else if (inB) { overlay[o + 1] = 255; }
  }
  const overlayPng = await sharp(overlay, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const refPng = await sharp(referencePath).resize(width, height, { fit: 'fill' }).png().toBuffer();
  const capPng = await sharp(capturePath).resize(width, height, { fit: 'fill' }).png().toBuffer();
  await sharp({ create: { width, height: height * 3, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: refPng, left: 0, top: 0 },
      { input: capPng, left: 0, top: height },
      { input: overlayPng, left: 0, top: height * 2 },
    ])
    .png()
    .toFile(destPath);
  return destPath;
}

export async function toDataUri(path) {
  const meta = await sharp(path).metadata();
  const buffer = readFileSync(path);
  const mime = meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
