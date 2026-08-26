export const PASS73_ADS_REVEAL_ROI_WIDTH = 512;
export const PASS73_ADS_REVEAL_ROI_HEIGHT = 640;
export const PASS73_ADS_REVEAL_PIXEL_DELTA = 6;
export const PASS73_ADS_REVEAL_MIN_CHANGED_FRACTION = 0.002;
export const PASS73_ADS_REVEAL_MAX_CHANGED_FRACTION = 0.3;
export const PASS73_ADS_REVEAL_MAX_OCCLUDED_BODY_LEAK_FRACTION = 0.0015;
export const PASS73_ADS_REVEAL_MAX_ADS_OFF_LEAK_FRACTION = 0.0015;
export const PASS73_ADS_REVEAL_MIN_ORANGE_FRACTION = 0.00005;
export const PASS73_ADS_REVEAL_MAX_ORANGE_FRACTION = 0.08;

export type Pass73AdsRevealReadbackRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}>;

export type Pass73QuantizedReadback = Readonly<{
  componentType: 'uint8' | 'float16' | 'float32';
  channels: 4;
  rgba8: Uint8Array;
  nonFiniteComponents: number;
}>;

export function pass73AdsRevealReadbackRegion(
  targetWidth: number,
  targetHeight: number,
): Pass73AdsRevealReadbackRegion {
  if (!Number.isSafeInteger(targetWidth) || !Number.isSafeInteger(targetHeight)
    || targetWidth < PASS73_ADS_REVEAL_ROI_WIDTH
    || targetHeight < PASS73_ADS_REVEAL_ROI_HEIGHT) {
    throw new Error(
      `Pass 73 ADS reveal needs at least ${PASS73_ADS_REVEAL_ROI_WIDTH}x${PASS73_ADS_REVEAL_ROI_HEIGHT} HDR pixels`,
    );
  }
  return Object.freeze({
    x: Math.floor((targetWidth - PASS73_ADS_REVEAL_ROI_WIDTH) / 2),
    y: Math.floor((targetHeight - PASS73_ADS_REVEAL_ROI_HEIGHT) / 2),
    width: PASS73_ADS_REVEAL_ROI_WIDTH,
    height: PASS73_ADS_REVEAL_ROI_HEIGHT,
    targetWidth,
    targetHeight,
  });
}

function halfFloatToNumber(value: number): number {
  const sign = (value & 0x8000) === 0 ? 1 : -1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1_024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1_024);
}

function linearHdrToByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const mapped = value / (1 + value);
  const srgb = mapped <= 0.0031308
    ? mapped * 12.92
    : 1.055 * mapped ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(srgb * 255)));
}

/**
 * Convert the renderer's bounded HDR readback into deterministic RGBA8 evidence.
 * The conversion is QA-only and never touches the presented game canvas.
 */
export function quantizePass73AdsRevealReadback(
  pixels: ArrayBufferView,
  pixelCount: number,
): Pass73QuantizedReadback {
  if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0) throw new Error('Pass 73 readback pixel count is invalid');
  const expectedComponents = pixelCount * 4;
  let componentType: Pass73QuantizedReadback['componentType'];
  let read: (index: number) => number;
  if (pixels instanceof Uint8Array) {
    componentType = 'uint8';
    if (pixels.length !== expectedComponents) throw new Error(`Pass 73 uint8 readback has ${pixels.length}/${expectedComponents} components`);
    read = (index) => pixels[index]! / 255;
  } else if (pixels instanceof Uint16Array) {
    componentType = 'float16';
    if (pixels.length !== expectedComponents) throw new Error(`Pass 73 float16 readback has ${pixels.length}/${expectedComponents} components`);
    read = (index) => halfFloatToNumber(pixels[index]!);
  } else if (pixels instanceof Float32Array) {
    componentType = 'float32';
    if (pixels.length !== expectedComponents) throw new Error(`Pass 73 float32 readback has ${pixels.length}/${expectedComponents} components`);
    read = (index) => pixels[index]!;
  } else {
    throw new Error(`Unsupported Pass 73 readback view: ${pixels.constructor.name}`);
  }

  const rgba8 = new Uint8Array(expectedComponents);
  let nonFiniteComponents = 0;
  for (let index = 0; index < expectedComponents; index += 1) {
    const value = read(index);
    if (!Number.isFinite(value)) nonFiniteComponents += 1;
    rgba8[index] = index % 4 === 3
      ? Math.max(0, Math.min(255, Math.round((Number.isFinite(value) ? value : 0) * 255)))
      : linearHdrToByte(value);
  }
  return Object.freeze({ componentType, channels: 4, rgba8, nonFiniteComponents });
}
