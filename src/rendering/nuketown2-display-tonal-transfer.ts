/**
 * HF-536 day-2 tonal transfer.
 *
 * This is a display-referred, hue-preserving monotone curve. It is deliberately
 * a single shared luma remap: the RGB vector is scaled by the same factor, so
 * the warm sun disc and golden-hour flare keep their chroma while mid-grey is
 * pulled toward the board value.
 */

import type { Rgb } from './filmic-grade-chain';

export const NUKETOWN2_DISPLAY_TRANSFER_INPUT_8BIT = Object.freeze([
  0, 10, 16, 32, 64, 96, 125, 140, 160, 180, 192, 203, 211, 235, 255,
] as const);

export const NUKETOWN2_DISPLAY_TRANSFER_OUTPUT_8BIT = Object.freeze([
  10, 12, 18, 28, 45, 68, 93, 115, 160, 190, 205, 211, 216, 235, 255,
] as const);

export type DisplayTonalTransfer = Readonly<{
  input8Bit: typeof NUKETOWN2_DISPLAY_TRANSFER_INPUT_8BIT;
  output8Bit: typeof NUKETOWN2_DISPLAY_TRANSFER_OUTPUT_8BIT;
}>;

export const NUKETOWN2_DISPLAY_TONAL_TRANSFER: DisplayTonalTransfer = Object.freeze({
  input8Bit: NUKETOWN2_DISPLAY_TRANSFER_INPUT_8BIT,
  output8Bit: NUKETOWN2_DISPLAY_TRANSFER_OUTPUT_8BIT,
});

export const DISPLAY_TRANSFER_LUMA = Object.freeze([0.2126, 0.7152, 0.0722] as const);

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Re-derives the fit by interpolation, with no renderer dependency. */
export function interpolateDisplayTransfer(
  value: number,
  transfer: DisplayTonalTransfer = NUKETOWN2_DISPLAY_TONAL_TRANSFER,
): number {
  const x = clamp01(value) * 255;
  const input = transfer.input8Bit;
  const output = transfer.output8Bit;
  for (let index = 0; index < input.length - 1; index += 1) {
    if (x <= input[index + 1]) {
      const t = (x - input[index]) / (input[index + 1] - input[index]);
      return (output[index] + (output[index + 1] - output[index]) * t) / 255;
    }
  }
  return output[output.length - 1] / 255;
}

/** Hue-preserving display transfer used by the CPU safety/reference path. */
export function applyDisplayTonalTransfer(
  rgb: Rgb,
  transfer: DisplayTonalTransfer | null = NUKETOWN2_DISPLAY_TONAL_TRANSFER,
): Rgb {
  if (transfer === null) return rgb;
  const luma = Math.max(0, rgb[0] * DISPLAY_TRANSFER_LUMA[0]
    + rgb[1] * DISPLAY_TRANSFER_LUMA[1]
    + rgb[2] * DISPLAY_TRANSFER_LUMA[2]);
  const mapped = interpolateDisplayTransfer(luma, transfer);
  if (luma <= 1e-6) return Object.freeze([mapped, mapped, mapped] as const);
  const scale = mapped / luma;
  return Object.freeze([rgb[0] * scale, rgb[1] * scale, rgb[2] * scale] as const);
}
