// node --test scripts/loop/perceptual.test.mjs
// Pins the tier-0 mathematics. These tests use synthetic planes, so they run
// without sharp, without fixtures and without a GPU.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ssim, sobelMagnitude, otsuThreshold, binariseByOtsu, maskIoU, edgeIoU,
  lumaHistogram, histogramEMD, cropPlane, gridRegions, comparePlanes, regionDisagreement,
} from './perceptual.mjs';

const W = 64;
const H = 64;

function noise(seed) {
  const out = new Uint8Array(W * H);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s >>> 24) & 0xff;
  }
  return out;
}

function halfSplit(left, right) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) out[y * W + x] = x < W / 2 ? left : right;
  return out;
}

test('ssim of a plane against itself is exactly 1', () => {
  const a = noise(7);
  assert.equal(ssim(a, a, W, H), 1);
});

test('ssim of a flat plane against itself is 1, and of two different flats is below 1', () => {
  const flatA = new Uint8Array(W * H).fill(120);
  const flatB = new Uint8Array(W * H).fill(20);
  assert.equal(ssim(flatA, flatA, W, H), 1);
  assert.ok(ssim(flatA, flatB, W, H) < 0.5, 'a 100-level luminance gap must not read as structurally identical');
});

test('ssim of independent noise is far below a self-comparison', () => {
  assert.ok(ssim(noise(1), noise(2), W, H) < 0.2);
});

test('ssim rejects a buffer/size mismatch rather than comparing garbage', () => {
  assert.throws(() => ssim(new Uint8Array(10), new Uint8Array(10), W, H), /first buffer/);
});

test('sobel finds the edge of a half-split and leaves the flat sides at zero', () => {
  const mag = sobelMagnitude(halfSplit(0, 255), W, H);
  const mid = Math.floor(H / 2) * W + Math.floor(W / 2);
  assert.ok(mag[mid] > 0, 'the seam must produce gradient');
  assert.equal(mag[Math.floor(H / 2) * W + 4], 0, 'a flat region must produce none');
});

test('otsu separates a bimodal histogram: the low mode falls below the threshold, the high mode above', () => {
  const hist = new Float64Array(256);
  hist[20] = 500;
  hist[200] = 500;
  const t = otsuThreshold(hist);
  // Binarisation is `value > t`, so t == 20 is a correct answer here: any t in
  // [20, 199] maximises between-class variance identically and the first one
  // wins. Assert the SEPARATION rather than the index, which is the property
  // that actually matters downstream.
  assert.ok(!(20 > t), `low mode 20 must not be foreground under >${t}`);
  assert.ok(200 > t, `high mode 200 must be foreground under >${t}`);
});

test('otsu on an empty histogram returns 0 instead of throwing', () => {
  assert.equal(otsuThreshold(new Float64Array(256)), 0);
});

test('edge IoU of a plane against itself is 1', () => {
  const a = halfSplit(10, 240);
  assert.equal(edgeIoU(a, a, W, H).value, 1);
});

test('edge IoU of two flat planes is 1 - both agree there are no edges', () => {
  const flat = new Uint8Array(W * H).fill(90);
  assert.equal(edgeIoU(flat, flat, W, H).value, 1);
});

test('edge IoU of a flat plane against an edged one is 0 - total disagreement', () => {
  const flat = new Uint8Array(W * H).fill(90);
  assert.equal(edgeIoU(flat, halfSplit(0, 255), W, H).value, 0);
});

test('edge IoU drops when the edge moves', () => {
  const a = halfSplit(0, 255);
  const b = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) b[y * W + x] = x < W / 4 ? 0 : 255;
  assert.ok(edgeIoU(a, b, W, H).value < 0.5, 'a displaced silhouette edge must not score as agreement');
});

test('maskIoU: two empty masks agree, one empty against one populated does not', () => {
  const empty = new Uint8Array(16);
  const populated = new Uint8Array(16).fill(1);
  assert.equal(maskIoU(empty, empty), 1);
  assert.equal(maskIoU(empty, populated), 0);
  assert.equal(maskIoU(populated, populated), 1);
});

test('binariseByOtsu on an all-zero field returns an empty mask, not a full one', () => {
  const { mask, max } = binariseByOtsu(new Float32Array(64));
  assert.equal(max, 0);
  assert.equal(mask.reduce((s, v) => s + v, 0), 0);
});

test('histogram EMD is 0 for identical planes and rises with a value shift', () => {
  const a = lumaHistogram(new Uint8Array(W * H).fill(100));
  const b = lumaHistogram(new Uint8Array(W * H).fill(100));
  const c = lumaHistogram(new Uint8Array(W * H).fill(200));
  assert.equal(histogramEMD(a, b), 0);
  assert.ok(histogramEMD(a, c) > 0.2, 'a 100-level value shift must register');
});

test('cropPlane extracts the right rectangle and refuses one outside the frame', () => {
  const plane = new Uint8Array(W * H);
  plane[10 * W + 5] = 77;
  const crop = cropPlane(plane, W, H, { x: 4, y: 9, w: 4, h: 4 });
  assert.equal(crop[1 * 4 + 1], 77);
  assert.throws(() => cropPlane(plane, W, H, { x: 60, y: 0, w: 10, h: 4 }), /outside/);
});

test('gridRegions tiles the frame exactly, with no gap and no overlap', () => {
  const regions = gridRegions(640, 360, 3, 3);
  assert.equal(regions.length, 9);
  assert.deepEqual(regions.map((r) => r.id), ['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'r1c2', 'r2c0', 'r2c1', 'r2c2']);
  assert.equal(regions.reduce((sum, r) => sum + r.w * r.h, 0), 640 * 360);
});

test('comparePlanes on identical input reports perfect agreement on every metric', () => {
  const a = noise(3);
  const m = comparePlanes(a, a, W, H);
  assert.equal(m.ssim, 1);
  assert.equal(m.edgeIoU, 1);
  assert.equal(m.valueEMD, 0);
  assert.equal(m.silhouetteIoU, null, 'no alpha supplied means no silhouette claim');
});

test('comparePlanes reports silhouetteIoU only when both alphas are supplied', () => {
  const a = noise(3);
  const alpha = new Uint8Array(W * H).fill(255);
  for (let i = 0; i < 100; i += 1) alpha[i] = 0;
  assert.equal(comparePlanes(a, a, W, H, { alphaA: alpha, alphaB: alpha }).silhouetteIoU, 1);
  assert.equal(comparePlanes(a, a, W, H, { alphaA: alpha, alphaB: null }).silhouetteIoU, null);
});

test('regionDisagreement is 0 for a perfect region and rises as metrics fall', () => {
  assert.equal(regionDisagreement({ ssim: 1, edgeIoU: 1, valueEMD: 0 }), 0);
  assert.ok(regionDisagreement({ ssim: 0.4, edgeIoU: 0.2, valueEMD: 0.5 }) > 0.5);
});
