import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';

export const RIGGED_RGB_RASTER_WIDTH = 1_600;
export const RIGGED_RGB_RASTER_HEIGHT = 900;
export const RIGGED_RGB_RASTER_PIXEL_COUNT = RIGGED_RGB_RASTER_WIDTH * RIGGED_RGB_RASTER_HEIGHT;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAXIMUM_PNG_BYTES = 32 * 1024 * 1024;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isContained(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..' && !isAbsolute(pathFromParent));
}

export function resolveContainedRegularPng(repositoryRoot, repositoryRelativePath, expectedPath) {
  if (typeof repositoryRelativePath !== 'string'
    || repositoryRelativePath.length < 1
    || isAbsolute(repositoryRelativePath)
    || repositoryRelativePath.includes('\\')
    || repositoryRelativePath !== expectedPath
    || !repositoryRelativePath.endsWith('.png')) {
    throw new Error('raster artifact path is not the exact canonical repository-relative PNG path');
  }
  const rootPath = resolve(repositoryRoot);
  const candidate = resolve(rootPath, repositoryRelativePath);
  if (!isContained(rootPath, candidate)) throw new Error('raster artifact path escapes repository root');
  const pathFromRoot = relative(rootPath, candidate);
  let cursor = rootPath;
  for (const component of pathFromRoot.split(sep)) {
    cursor = resolve(cursor, component);
    const status = lstatSync(cursor);
    if (status.isSymbolicLink()) throw new Error('raster artifact path contains a symbolic link or junction');
  }
  const status = lstatSync(candidate);
  if (!status.isFile() || status.size < PNG_SIGNATURE.length || status.size > MAXIMUM_PNG_BYTES) {
    throw new Error('raster artifact is not a bounded regular file');
  }
  const realRoot = realpathSync(rootPath);
  const realCandidate = realpathSync(candidate);
  if (!isContained(realRoot, realCandidate)) throw new Error('raster artifact real path escapes repository root');
  const encoded = readFileSync(realCandidate);
  if (!encoded.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('raster artifact does not have the PNG signature');
  }
  return Object.freeze({ path: realCandidate, encoded, fileSha256: sha256(encoded) });
}

export function recomputeHalfOpenRasterRoi(rasterRoi) {
  const extrema = rasterRoi?.projectedPixelExtrema;
  if (!extrema || ![extrema.minX, extrema.minY, extrema.maxX, extrema.maxY].every(Number.isFinite)
    || extrema.minX > extrema.maxX || extrema.minY > extrema.maxY
    || extrema.minX < 0 || extrema.minY < 0
    || extrema.maxX >= RIGGED_RGB_RASTER_WIDTH || extrema.maxY >= RIGGED_RGB_RASTER_HEIGHT
    || rasterRoi?.deformedVertexCount < 1
    || !Number.isSafeInteger(rasterRoi.deformedVertexCount)
    || rasterRoi.frontVertexCount !== rasterRoi.deformedVertexCount
    || rasterRoi.inFrameVertexCount !== rasterRoi.deformedVertexCount
    || rasterRoi.rounding !== 'floor-min-ceil-max-half-open'
    || rasterRoi.paddingPixels !== 0
    || rasterRoi.deformedVertexProjectionDigest?.algorithm !== 'fnv1a32-pair-ordered-float64-v1'
    || !/^[a-f0-9]{16}$/u.test(rasterRoi.deformedVertexProjectionDigest?.value ?? '')) {
    throw new Error('live-deformed raster ROI extrema/counts are invalid');
  }
  const roi = Object.freeze({
    minX: Math.floor(extrema.minX),
    minY: Math.floor(extrema.minY),
    maxXExclusive: Math.ceil(extrema.maxX),
    maxYExclusive: Math.ceil(extrema.maxY),
  });
  if (![roi.minX, roi.minY, roi.maxXExclusive, roi.maxYExclusive].every(Number.isSafeInteger)
    || roi.minX < 0 || roi.minY < 0
    || roi.maxXExclusive > RIGGED_RGB_RASTER_WIDTH
    || roi.maxYExclusive > RIGGED_RGB_RASTER_HEIGHT
    || roi.minX >= roi.maxXExclusive
    || roi.minY >= roi.maxYExclusive) throw new Error('live-deformed raster ROI is empty or outside the fixed viewport');
  if (JSON.stringify(roi) !== JSON.stringify(rasterRoi.roi)) {
    throw new Error('claimed raster ROI does not equal floor-min/ceil-max live-vertex projection');
  }
  const points = [rasterRoi.anchor, ...(rasterRoi.joints ?? [])];
  if (rasterRoi?.contract !== 'rigged-live-deformed-raster-roi-v1'
    || rasterRoi?.viewport?.cssWidth !== RIGGED_RGB_RASTER_WIDTH
    || rasterRoi?.viewport?.cssHeight !== RIGGED_RGB_RASTER_HEIGHT
    || rasterRoi?.viewport?.devicePixelRatio !== 1
    || rasterRoi?.viewport?.drawingBufferWidth !== RIGGED_RGB_RASTER_WIDTH
    || rasterRoi?.viewport?.drawingBufferHeight !== RIGGED_RGB_RASTER_HEIGHT
    || !Array.isArray(rasterRoi.joints)
    || rasterRoi.joints.length !== 16
    || points.length !== 17
    || rasterRoi.anchorAndSixteenJointsInside !== true
    || points.some((point) => !Array.isArray(point?.pixel)
      || point.pixel.length !== 2
      || !point.pixel.every(Number.isFinite)
      || point.inside !== true
      || point.pixel[0] < roi.minX || point.pixel[0] >= roi.maxXExclusive
      || point.pixel[1] < roi.minY || point.pixel[1] >= roi.maxYExclusive)) {
    throw new Error('raster ROI does not cover the exact anchor and sixteen joint projections');
  }
  return roi;
}

export function analyzeRawRgbaPair(controlRgba, visibleRgba, width, height, roi) {
  const expectedBytes = width * height * 4;
  if (!Buffer.isBuffer(controlRgba) || !Buffer.isBuffer(visibleRgba)
    || controlRgba.length !== expectedBytes || visibleRgba.length !== expectedBytes
    || width !== RIGGED_RGB_RASTER_WIDTH || height !== RIGGED_RGB_RASTER_HEIGHT) {
    throw new Error('raw RGBA buffers do not match the exact fixed raster');
  }
  const mask = Buffer.alloc(width * height);
  const controlRgb = Buffer.alloc(width * height * 3);
  const visibleRgb = Buffer.alloc(width * height * 3);
  let changedPixelCount = 0;
  let insideChangedPixelCount = 0;
  let outsideChangedPixelCount = 0;
  let alphaChangedPixelCount = 0;
  let maxRgbChannelDelta = 0;
  let minX = width;
  let minY = height;
  let maxXExclusive = 0;
  let maxYExclusive = 0;
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const rgbaOffset = pixelIndex * 4;
    const rgbOffset = pixelIndex * 3;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    let changed = false;
    for (let channel = 0; channel < 3; channel += 1) {
      const control = controlRgba[rgbaOffset + channel];
      const visible = visibleRgba[rgbaOffset + channel];
      controlRgb[rgbOffset + channel] = control;
      visibleRgb[rgbOffset + channel] = visible;
      const delta = Math.abs(control - visible);
      if (delta !== 0) changed = true;
      maxRgbChannelDelta = Math.max(maxRgbChannelDelta, delta);
    }
    if (controlRgba[rgbaOffset + 3] !== visibleRgba[rgbaOffset + 3]) alphaChangedPixelCount += 1;
    if (!changed) continue;
    mask[pixelIndex] = 1;
    changedPixelCount += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxXExclusive = Math.max(maxXExclusive, x + 1);
    maxYExclusive = Math.max(maxYExclusive, y + 1);
    if (x >= roi.minX && x < roi.maxXExclusive && y >= roi.minY && y < roi.maxYExclusive) {
      insideChangedPixelCount += 1;
    } else {
      outsideChangedPixelCount += 1;
    }
  }
  return Object.freeze({
    contract: 'lossless-rgba-rgb-diff-v1',
    width,
    height,
    changedPixelDefinition: 'any-rgb-byte-differs',
    changedPixelCount,
    insideChangedPixelCount,
    outsideChangedPixelCount,
    alphaChangedPixelCount,
    maxRgbChannelDelta,
    changedPixelBbox: changedPixelCount === 0 ? null : Object.freeze({ minX, minY, maxXExclusive, maxYExclusive }),
    diffMaskSha256: sha256(mask),
    controlRawRgbSha256: sha256(controlRgb),
    visibleRawRgbSha256: sha256(visibleRgb),
    controlRawRgbaSha256: sha256(controlRgba),
    visibleRawRgbaSha256: sha256(visibleRgba),
  });
}

async function decodeLosslessRgba(encoded) {
  const image = sharp(encoded, { failOn: 'error', limitInputPixels: RIGGED_RGB_RASTER_PIXEL_COUNT });
  const metadata = await image.metadata();
  if (metadata.format !== 'png'
    || metadata.width !== RIGGED_RGB_RASTER_WIDTH
    || metadata.height !== RIGGED_RGB_RASTER_HEIGHT
    || metadata.depth !== 'uchar'
    || (metadata.channels !== 3 && metadata.channels !== 4)
    || (metadata.pages ?? 1) !== 1) throw new Error('PNG metadata is not exact 1600x900 single-page 8-bit RGB/RGBA');
  const decoded = await sharp(encoded, { failOn: 'error', limitInputPixels: RIGGED_RGB_RASTER_PIXEL_COUNT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== RIGGED_RGB_RASTER_WIDTH
    || decoded.info.height !== RIGGED_RGB_RASTER_HEIGHT
    || decoded.info.channels !== 4
    || decoded.info.size !== RIGGED_RGB_RASTER_PIXEL_COUNT * 4) {
    throw new Error('lossless raw PNG decode does not match exact RGBA byte count');
  }
  return decoded.data;
}

export async function recomputeProductionRgbRasterProof({
  repositoryRoot,
  controlPath,
  visiblePath,
  expectedControlPath,
  expectedVisiblePath,
  rasterRoi,
}) {
  const roi = recomputeHalfOpenRasterRoi(rasterRoi);
  const controlArtifact = resolveContainedRegularPng(repositoryRoot, controlPath, expectedControlPath);
  const visibleArtifact = resolveContainedRegularPng(repositoryRoot, visiblePath, expectedVisiblePath);
  if (controlArtifact.path === visibleArtifact.path) throw new Error('control and visible raster artifacts resolve to the same file');
  const [controlRgba, visibleRgba] = await Promise.all([
    decodeLosslessRgba(controlArtifact.encoded),
    decodeLosslessRgba(visibleArtifact.encoded),
  ]);
  return Object.freeze({
    contract: 'independent-production-rgb-raster-recompute-v1',
    controlFileSha256: controlArtifact.fileSha256,
    visibleFileSha256: visibleArtifact.fileSha256,
    roi,
    diff: analyzeRawRgbaPair(
      controlRgba,
      visibleRgba,
      RIGGED_RGB_RASTER_WIDTH,
      RIGGED_RGB_RASTER_HEIGHT,
      roi,
    ),
  });
}
