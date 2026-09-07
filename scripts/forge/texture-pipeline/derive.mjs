#!/usr/bin/env node
/**
 * HF-536 image-generated PBR texture derivation.
 *
 * The source image is the authorized Codex image-generation output. This tool
 * owns the reproducible, CPU-side conversion to shipped maps: edge blending
 * on the torus, millimetre height with a large-scale detrend, Sobel tangent
 * normals, local-variance roughness, and optional height AO. It intentionally
 * has no runtime or Three.js dependency; the bridge consumes the resulting
 * bytes as DataTextures.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

export const FAMILY_BANDS = Object.freeze({
  asphalt: Object.freeze({ roughness: [0.72, 0.98], metresPerTile: 4.0, normalStrength: 1.0 }),
  lapSiding: Object.freeze({ roughness: [0.48, 0.90], metresPerTile: 1.76, normalStrength: 0.9 }),
  brick: Object.freeze({ roughness: [0.74, 1.0], metresPerTile: 1.8, normalStrength: 1.0 }),
  concrete: Object.freeze({ roughness: [0.78, 1.0], metresPerTile: 3.0, normalStrength: 0.9 }),
  shingle: Object.freeze({ roughness: [0.74, 1.0], metresPerTile: 3.0, normalStrength: 1.0 }),
  timber: Object.freeze({ roughness: [0.62, 0.96], metresPerTile: 1.8, normalStrength: 0.85 }),
  lawn: Object.freeze({ roughness: [0.82, 1.0], metresPerTile: 2.4, normalStrength: 0.65 }),
});

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function indexOf(x, y, size) {
  return (y * size + x) * 4;
}

function grayIndex(x, y, size) {
  return y * size + x;
}

function wrapped(value, size) {
  return (value + size) % size;
}

/**
 * Blend opposing borders and make their final texels byte-identical. The
 * duplicated edge is deliberate: RepeatWrapping then interpolates equal
 * values across the seam instead of joining two unrelated edge samples.
 */
export function seamBlend(rgba, size) {
  if (rgba.length !== size * size * 4) throw new Error(`seamBlend expected RGBA ${size}x${size}`);
  const output = new Uint8Array(rgba);
  for (let y = 0; y < size; y++) {
    const first = indexOf(0, y, size);
    const last = indexOf(size - 1, y, size);
    for (let channel = 0; channel < 4; channel++) {
      const value = Math.round((rgba[first + channel] + rgba[last + channel]) / 2);
      output[first + channel] = value;
      output[last + channel] = value;
    }
  }
  for (let x = 0; x < size; x++) {
    const first = indexOf(x, 0, size);
    const last = indexOf(x, size - 1, size);
    for (let channel = 0; channel < 4; channel++) {
      const value = Math.round((output[first + channel] + output[last + channel]) / 2);
      output[first + channel] = value;
      output[last + channel] = value;
    }
  }
  return output;
}

export function maxWrapDelta(rgba, size) {
  let maximum = 0;
  for (let y = 0; y < size; y++) {
    const first = indexOf(0, y, size);
    const last = indexOf(size - 1, y, size);
    for (let channel = 0; channel < 4; channel++) maximum = Math.max(maximum, Math.abs(rgba[first + channel] - rgba[last + channel]));
  }
  for (let x = 0; x < size; x++) {
    const first = indexOf(x, 0, size);
    const last = indexOf(x, size - 1, size);
    for (let channel = 0; channel < 4; channel++) maximum = Math.max(maximum, Math.abs(rgba[first + channel] - rgba[last + channel]));
  }
  return maximum;
}

function blendGrayEdges(values, size) {
  const output = new Uint8Array(values);
  for (let y = 0; y < size; y++) {
    const first = grayIndex(0, y, size);
    const last = grayIndex(size - 1, y, size);
    const value = Math.round((values[first] + values[last]) / 2);
    output[first] = value;
    output[last] = value;
  }
  for (let x = 0; x < size; x++) {
    const first = grayIndex(x, 0, size);
    const last = grayIndex(x, size - 1, size);
    const value = Math.round((output[first] + output[last]) / 2);
    output[first] = value;
    output[last] = value;
  }
  return output;
}

function maxGrayWrapDelta(values, size) {
  let maximum = 0;
  for (let y = 0; y < size; y++) maximum = Math.max(maximum, Math.abs(values[grayIndex(0, y, size)] - values[grayIndex(size - 1, y, size)]));
  for (let x = 0; x < size; x++) maximum = Math.max(maximum, Math.abs(values[grayIndex(x, 0, size)] - values[grayIndex(x, size - 1, size)]));
  return maximum;
}

function boxMean(values, size, radius) {
  const stride = size + 1;
  const integral = new Float64Array(stride * stride);
  for (let y = 0; y < size; y++) {
    let rowSum = 0;
    for (let x = 0; x < size; x++) {
      rowSum += values[grayIndex(x, y, size)];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }
  const output = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(size - 1, y + radius);
    for (let x = 0; x < size; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(size - 1, x + radius);
      const sum = integral[(y1 + 1) * stride + x1 + 1]
        - integral[y0 * stride + x1 + 1]
        - integral[(y1 + 1) * stride + x0]
        + integral[y0 * stride + x0];
      output[grayIndex(x, y, size)] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return output;
}

function lumaFromRgba(rgba, size) {
  const output = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = indexOf(x, y, size);
      output[grayIndex(x, y, size)] = (LUMA_R * rgba[index] + LUMA_G * rgba[index + 1] + LUMA_B * rgba[index + 2]) / 255;
    }
  }
  return output;
}

function encodeNormal(height, size, mmPerPixel, strength) {
  const rgba = new Uint8Array(size * size * 4);
  let mostlyZ = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = height[grayIndex(wrapped(x - 1, size), y, size)];
      const right = height[grayIndex(wrapped(x + 1, size), y, size)];
      const up = height[grayIndex(x, wrapped(y - 1, size), size)];
      const down = height[grayIndex(x, wrapped(y + 1, size), size)];
      const gx = ((right - left) * strength) / (2 * mmPerPixel);
      const gy = ((down - up) * strength) / (2 * mmPerPixel);
      const inverseLength = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nz = inverseLength;
      if (nz > 0.92) mostlyZ++;
      const index = indexOf(x, y, size);
      rgba[index] = clamp(Math.round((-gx * inverseLength) * 127.5 + 127.5), 0, 255);
      rgba[index + 1] = clamp(Math.round((-gy * inverseLength) * 127.5 + 127.5), 0, 255);
      rgba[index + 2] = clamp(Math.round(nz * 127.5 + 127.5), 0, 255);
      rgba[index + 3] = 255;
    }
  }
  return { rgba, fractionMostlyZ: mostlyZ / (size * size) };
}

function meanAbsoluteLaplacian(values, size) {
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const center = values[grayIndex(x, y, size)];
      const left = values[grayIndex(wrapped(x - 1, size), y, size)];
      const right = values[grayIndex(wrapped(x + 1, size), y, size)];
      const up = values[grayIndex(x, wrapped(y - 1, size), size)];
      const down = values[grayIndex(x, wrapped(y + 1, size), size)];
      total += Math.abs(left + right + up + down - 4 * center);
    }
  }
  return total / (size * size);
}

function standardDeviation(values) {
  let mean = 0;
  for (const value of values) mean += value;
  mean /= values.length;
  let variance = 0;
  for (const value of values) variance += (value - mean) ** 2;
  return Math.sqrt(variance / values.length);
}

export function detailEnergy(maps, size) {
  const luma = lumaFromRgba(maps.albedo, size);
  const normalZ = new Float32Array(size * size);
  const normalSlope = new Float32Array(size * size);
  for (let i = 0; i < normalZ.length; i++) {
    normalZ[i] = maps.normal[i * 4 + 2] / 255;
    const nx = maps.normal[i * 4] / 127.5 - 1;
    const ny = maps.normal[i * 4 + 1] / 127.5 - 1;
    normalSlope[i] = Math.sqrt(nx * nx + ny * ny);
  }
  return Object.freeze({
    albedoStddev: standardDeviation(luma),
    albedoLaplace: meanAbsoluteLaplacian(luma, size),
    normalSlopeMean: normalSlope.reduce((sum, value) => sum + value, 0) / normalSlope.length,
    normalZMean: normalZ.reduce((sum, value) => sum + value, 0) / normalZ.length,
    roughnessStddev: standardDeviation(Array.from(maps.roughness, (value) => value / 255)),
  });
}

/** Derive all maps from one already-decoded RGBA source image. */
export function derivePixels(sourceRgba, size, options = {}) {
  const family = options.family ?? 'asphalt';
  const band = FAMILY_BANDS[family];
  if (!band) throw new Error(`unknown texture family '${family}'`);
  if (sourceRgba.length !== size * size * 4) throw new Error(`derivePixels expected RGBA ${size}x${size}`);
  const albedo = seamBlend(sourceRgba, size);
  const luma = lumaFromRgba(albedo, size);
  const trend = boxMean(luma, size, Math.max(2, Math.round(size * 0.025)));
  const heightMm = new Float32Array(size * size);
  for (let i = 0; i < heightMm.length; i++) heightMm[i] = clamp((luma[i] - trend[i]) * 18, -8, 8);
  const localMean = boxMean(luma, size, Math.max(1, Math.round(size * 0.008)));
  const squared = new Float32Array(size * size);
  for (let i = 0; i < squared.length; i++) squared[i] = luma[i] ** 2;
  const localSquared = boxMean(squared, size, Math.max(1, Math.round(size * 0.008)));
  const roughness = new Uint8Array(size * size);
  const [roughnessMin, roughnessMax] = band.roughness;
  for (let i = 0; i < roughness.length; i++) {
    const variance = Math.max(0, localSquared[i] - localMean[i] ** 2);
    const varianceScore = clamp(Math.sqrt(variance) * 5, 0, 1);
    const inverseLuma = 1 - luma[i];
    const normalized = clamp(0.50 + varianceScore * 0.32 + inverseLuma * 0.18, 0, 1);
    roughness[i] = Math.round((roughnessMin + (roughnessMax - roughnessMin) * normalized) * 255);
  }
  const mmPerPixel = (options.metresPerTile ?? band.metresPerTile) * 1000 / size;
  const normal = encodeNormal(heightMm, size, mmPerPixel, options.normalStrength ?? band.normalStrength);
  const ao = new Uint8Array(size * size);
  for (let i = 0; i < ao.length; i++) ao[i] = Math.round(clamp(0.92 + heightMm[i] / 80, 0.78, 1) * 255);
  const wrappedRoughness = blendGrayEdges(roughness, size);
  const wrappedAo = blendGrayEdges(ao, size);
  const maps = Object.freeze({ albedo, normal: normal.rgba, roughness: wrappedRoughness, ao: wrappedAo, heightMm });
  // Normal derivatives are evaluated with wrapped neighbours; unlike color
  // and scalar maps, the two border texels need not be identical because they
  // encode the slope on opposite sides of the periodic boundary. The source
  // seam contract is therefore measured on the sampled color/scalar maps.
  const wrapDelta = Math.max(maxWrapDelta(albedo, size), maxGrayWrapDelta(wrappedRoughness, size), maxGrayWrapDelta(wrappedAo, size));
  if (wrapDelta > 1) throw new Error(`derived ${family} map seam exceeds 1/255: ${wrapDelta}`);
  return Object.freeze({
    family,
    size,
    metresPerTile: options.metresPerTile ?? band.metresPerTile,
    mmPerPixel,
    normalStrength: options.normalStrength ?? band.normalStrength,
    maps,
    fractionMostlyZ: normal.fractionMostlyZ,
    wrapDelta,
    detail: detailEnergy(maps, size),
  });
}

async function decodeSource(input, size) {
  const decoded = await sharp(input)
    .resize({ width: size, height: size, fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer();
  return new Uint8Array(decoded);
}

async function writeRawPng(bytes, size, channels, output) {
  await mkdir(path.dirname(output), { recursive: true });
  const image = sharp(Buffer.from(bytes), { raw: { width: size, height: size, channels } });
  if (channels === 1) image.greyscale();
  await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
}

export async function deriveCandidate(options) {
  const family = options.family;
  const band = FAMILY_BANDS[family];
  if (!band) throw new Error(`unknown texture family '${family}'`);
  const candidate = options.candidate ?? 'candidate-01';
  const resolutions = options.resolutions ?? [512, 1024];
  const candidateRoot = path.join(options.outDir, family, candidate);
  const reports = [];
  for (const size of resolutions) {
    const source = await decodeSource(options.input, size);
    const result = derivePixels(source, size, {
      family,
      metresPerTile: options.metresPerTile ?? band.metresPerTile,
      normalStrength: options.normalStrength ?? band.normalStrength,
    });
    const mapRoot = path.join(candidateRoot, String(size));
    await writeRawPng(result.maps.albedo, size, 4, path.join(mapRoot, 'albedo.png'));
    await writeRawPng(result.maps.normal, size, 4, path.join(mapRoot, 'normal.png'));
    await writeRawPng(result.maps.roughness, size, 1, path.join(mapRoot, 'roughness.png'));
    await writeRawPng(result.maps.ao, size, 1, path.join(mapRoot, 'ao.png'));
    reports.push({
      size,
      family,
      metresPerTile: result.metresPerTile,
      mmPerPixel: result.mmPerPixel,
      normalStrength: result.normalStrength,
      wrapDelta: result.wrapDelta,
      fractionMostlyZ: result.fractionMostlyZ,
      roughnessBand: band.roughness,
      detail: result.detail,
    });
  }
  const report = Object.freeze({
    family,
    candidate,
    input: path.relative(process.cwd(), options.input).replaceAll('\\', '/'),
    route: 'codex-built-in-image-generation',
    licence: 'owner-authorised AI texture 2026-09-07',
    allowedUse: 'shipped',
    resolutions: reports,
  });
  await writeFile(path.join(candidateRoot, 'derive-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function readArg(argv, name, fallback = undefined) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const input = readArg(argv, '--input');
  const outDir = readArg(argv, '--out', 'docs/forge/textures');
  const family = readArg(argv, '--family');
  if (!input || !family) throw new Error('usage: derive.mjs --input <png> --family <family> [--out <dir>] [--candidate <id>] [--report]');
  const report = await deriveCandidate({
    input,
    outDir,
    family,
    candidate: readArg(argv, '--candidate', 'candidate-01'),
    metresPerTile: Number(readArg(argv, '--metres-per-tile', FAMILY_BANDS[family]?.metresPerTile)),
    normalStrength: Number(readArg(argv, '--normal-strength', FAMILY_BANDS[family]?.normalStrength)),
    resolutions: (readArg(argv, '--resolutions', '512,1024')).split(',').map(Number),
  });
  if (argv.includes('--report')) console.log(JSON.stringify(report, null, 2));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
