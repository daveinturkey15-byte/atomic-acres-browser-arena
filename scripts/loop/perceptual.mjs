// Reference-grounded loop - tier 0 perceptual mathematics.
// Contract: reference-precheck-v1 (metric half). Pure JS, no dependencies at all
// (not even sharp - this module only ever sees decoded 8-bit buffers), so every
// function here is unit-testable from `node --test` with synthetic arrays.
//
// HONEST LIMIT - read this before quoting any number out of this file.
// None of these metrics is a fidelity score. A reference photograph and a
// renderer capture never share a camera, a lens, an exposure or a grade, so an
// absolute SSIM of 0.61 against a photo means nothing on its own. What these
// numbers are good for is exactly three things:
//   (a) DIRECTION OF TRAVEL across cycles of the SAME reference/capture pair,
//   (b) REGION LOCALISATION - which ninth of the frame disagrees most, so a
//       correction can be bounded to it,
//   (c) a PLATEAU signal that does not depend on a model's self-report.
// Anyone who reports "78% fidelity to the reference" from this file has
// misread it. Comparing a capture against ITSELF is the only case where 1.0
// means what it looks like, and that case exists to prove the harness.
//
// Metric directions (kept explicit so no caller has to guess):
//   ssim           1 = identical structure, 0 = unrelated.       HIGHER IS BETTER.
//   edgeIoU        1 = identical thresholded edge maps.          HIGHER IS BETTER.
//   valueEMD       0 = identical luma histograms, 1 = far apart.  LOWER IS BETTER.
//   silhouetteIoU  1 = identical alpha masks.                    HIGHER IS BETTER.

export const SSIM_C1 = (0.01 * 255) ** 2;
export const SSIM_C2 = (0.03 * 255) ** 2;
export const DEFAULT_SSIM_WINDOW = 8;
export const DEFAULT_HISTOGRAM_BINS = 32;

function assertPair(a, b, width, height, label) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError(`${label}: width/height must be positive integers, got ${width}x${height}`);
  }
  if (a.length !== width * height) throw new RangeError(`${label}: first buffer is ${a.length}, expected ${width * height}`);
  if (b.length !== width * height) throw new RangeError(`${label}: second buffer is ${b.length}, expected ${width * height}`);
}

/** Mean SSIM over non-overlapping windows of an 8-bit luma plane. */
export function ssim(a, b, width, height, { window = DEFAULT_SSIM_WINDOW } = {}) {
  assertPair(a, b, width, height, 'ssim');
  if (window < 2) throw new RangeError('ssim: window must be >= 2');
  const n = window * window;
  let total = 0;
  let blocks = 0;
  for (let by = 0; by + window <= height; by += window) {
    for (let bx = 0; bx + window <= width; bx += window) {
      let sumA = 0;
      let sumB = 0;
      for (let y = 0; y < window; y += 1) {
        const row = (by + y) * width + bx;
        for (let x = 0; x < window; x += 1) { sumA += a[row + x]; sumB += b[row + x]; }
      }
      const meanA = sumA / n;
      const meanB = sumB / n;
      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let y = 0; y < window; y += 1) {
        const row = (by + y) * width + bx;
        for (let x = 0; x < window; x += 1) {
          const dA = a[row + x] - meanA;
          const dB = b[row + x] - meanB;
          varA += dA * dA; varB += dB * dB; cov += dA * dB;
        }
      }
      const denomN = n - 1;
      varA /= denomN; varB /= denomN; cov /= denomN;
      const num = (2 * meanA * meanB + SSIM_C1) * (2 * cov + SSIM_C2);
      const den = (meanA * meanA + meanB * meanB + SSIM_C1) * (varA + varB + SSIM_C2);
      total += num / den;
      blocks += 1;
    }
  }
  // A plane smaller than one window has no structure to compare; report 1
  // rather than 0 so a degenerate crop cannot masquerade as a huge regression.
  return blocks === 0 ? 1 : total / blocks;
}

/** Sobel gradient magnitude of an 8-bit luma plane. Border pixels stay 0. */
export function sobelMagnitude(luma, width, height) {
  if (luma.length !== width * height) throw new RangeError('sobelMagnitude: buffer/size mismatch');
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const tl = luma[i - width - 1], tc = luma[i - width], tr = luma[i - width + 1];
      const ml = luma[i - 1], mr = luma[i + 1];
      const bl = luma[i + width - 1], bc = luma[i + width], br = luma[i + width + 1];
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/** Otsu threshold over a 256-bin histogram. Returns the bin index. */
export function otsuThreshold(histogram) {
  if (histogram.length !== 256) throw new RangeError('otsuThreshold: expected 256 bins');
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) { total += histogram[i]; sum += i * histogram[i]; }
  if (total === 0) return 0;
  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t += 1) {
    weightBack += histogram[t];
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;
    sumBack += t * histogram[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sum - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > bestVariance) { bestVariance = between; best = t; }
  }
  return best;
}

/** Binarise a magnitude field by its own Otsu threshold. */
export function binariseByOtsu(magnitude) {
  let max = 0;
  for (let i = 0; i < magnitude.length; i += 1) if (magnitude[i] > max) max = magnitude[i];
  const out = new Uint8Array(magnitude.length);
  if (max <= 0) return { mask: out, threshold: 0, max: 0 };
  const histogram = new Float64Array(256);
  const scale = 255 / max;
  for (let i = 0; i < magnitude.length; i += 1) histogram[Math.min(255, Math.round(magnitude[i] * scale))] += 1;
  const threshold = otsuThreshold(histogram);
  for (let i = 0; i < magnitude.length; i += 1) out[i] = Math.round(magnitude[i] * scale) > threshold ? 1 : 0;
  return { mask: out, threshold, max };
}

/**
 * Intersection over union of two binary masks.
 * Two EMPTY masks agree perfectly (both say "no edges here"), so they score 1.
 * One empty against one populated is total disagreement, so it scores 0.
 */
export function maskIoU(a, b) {
  if (a.length !== b.length) throw new RangeError('maskIoU: mask length mismatch');
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    const inA = a[i] !== 0;
    const inB = b[i] !== 0;
    if (inA && inB) intersection += 1;
    if (inA || inB) union += 1;
  }
  if (union === 0) return 1;
  return intersection / union;
}

/** Edge-map IoU of two luma planes: Sobel, per-side Otsu, IoU of the masks. */
export function edgeIoU(a, b, width, height) {
  assertPair(a, b, width, height, 'edgeIoU');
  const ea = binariseByOtsu(sobelMagnitude(a, width, height));
  const eb = binariseByOtsu(sobelMagnitude(b, width, height));
  return { value: maskIoU(ea.mask, eb.mask), thresholds: [ea.threshold, eb.threshold], masks: [ea.mask, eb.mask] };
}

/** Normalised luma histogram (sums to 1). */
export function lumaHistogram(luma, bins = DEFAULT_HISTOGRAM_BINS) {
  const out = new Float64Array(bins);
  if (luma.length === 0) return out;
  const scale = bins / 256;
  for (let i = 0; i < luma.length; i += 1) out[Math.min(bins - 1, Math.floor(luma[i] * scale))] += 1;
  for (let i = 0; i < bins; i += 1) out[i] /= luma.length;
  return out;
}

/** 1-D earth-mover distance between two normalised histograms, scaled to [0,1]. */
export function histogramEMD(a, b) {
  if (a.length !== b.length) throw new RangeError('histogramEMD: bin count mismatch');
  let carry = 0;
  let work = 0;
  for (let i = 0; i < a.length; i += 1) { carry += a[i] - b[i]; work += Math.abs(carry); }
  return a.length <= 1 ? 0 : work / (a.length - 1);
}

/** Crop an 8-bit plane. rect = {x, y, w, h}. */
export function cropPlane(plane, width, height, rect) {
  const { x, y, w, h } = rect;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height) {
    throw new RangeError(`cropPlane: rect ${JSON.stringify(rect)} outside ${width}x${height}`);
  }
  const out = new Uint8Array(w * h);
  for (let row = 0; row < h; row += 1) {
    out.set(plane.subarray((y + row) * width + x, (y + row) * width + x + w), row * w);
  }
  return out;
}

/** Default 3x3 named region grid: r0c0 .. r2c2, remainder folded into last row/col. */
export function gridRegions(width, height, rows = 3, cols = 3) {
  const regions = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = Math.floor((c * width) / cols);
      const y = Math.floor((r * height) / rows);
      const x2 = c === cols - 1 ? width : Math.floor(((c + 1) * width) / cols);
      const y2 = r === rows - 1 ? height : Math.floor(((r + 1) * height) / rows);
      regions.push({ id: `r${r}c${c}`, x, y, w: x2 - x, h: y2 - y });
    }
  }
  return regions;
}

/** All tier-0 metrics for one luma pair, optionally with alpha silhouettes. */
export function comparePlanes(a, b, width, height, { alphaA = null, alphaB = null, bins = DEFAULT_HISTOGRAM_BINS } = {}) {
  const structural = ssim(a, b, width, height);
  const edges = edgeIoU(a, b, width, height);
  const valueEMD = histogramEMD(lumaHistogram(a, bins), lumaHistogram(b, bins));
  const result = {
    ssim: round4(structural),
    edgeIoU: round4(edges.value),
    valueEMD: round4(valueEMD),
    silhouetteIoU: null,
  };
  if (alphaA && alphaB) {
    if (alphaA.length !== alphaB.length) throw new RangeError('comparePlanes: alpha length mismatch');
    const maskA = new Uint8Array(alphaA.length);
    const maskB = new Uint8Array(alphaB.length);
    for (let i = 0; i < alphaA.length; i += 1) maskA[i] = alphaA[i] > 127 ? 1 : 0;
    for (let i = 0; i < alphaB.length; i += 1) maskB[i] = alphaB[i] > 127 ? 1 : 0;
    result.silhouetteIoU = round4(maskIoU(maskA, maskB));
  }
  return result;
}

/**
 * Rank regions worst-first. The composite is deliberately simple and is NOT a
 * score: it exists only to pick which region a bounded correction should aim at.
 * Weighting reflects what each metric survives across a photo/render pair -
 * edge agreement survives a lighting difference, SSIM and value do not.
 */
export function regionDisagreement(metrics) {
  return round4(0.5 * (1 - metrics.edgeIoU) + 0.3 * (1 - metrics.ssim) + 0.2 * metrics.valueEMD);
}

export function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}
