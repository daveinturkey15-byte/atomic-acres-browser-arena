import { describe, expect, it } from 'vitest';
import {
  applyDisplayTonalTransfer,
  interpolateDisplayTransfer,
  NUKETOWN2_DISPLAY_TONAL_TRANSFER,
} from './nuketown2-display-tonal-transfer';

describe('HF-536 Nuke Town display tonal transfer', () => {
  it('keeps the frozen anchors monotone and lands on the measured fit', () => {
    const { input8Bit, output8Bit } = NUKETOWN2_DISPLAY_TONAL_TRANSFER;
    for (let index = 1; index < input8Bit.length; index += 1) {
      expect(input8Bit[index]).toBeGreaterThan(input8Bit[index - 1]);
      expect(output8Bit[index]).toBeGreaterThanOrEqual(output8Bit[index - 1]);
    }
    expect(interpolateDisplayTransfer(0)).toBeCloseTo(10 / 255, 12);
    expect(interpolateDisplayTransfer(125 / 255)).toBeCloseTo(93 / 255, 12);
    expect(interpolateDisplayTransfer(211 / 255)).toBeCloseTo(216 / 255, 12);
    expect(interpolateDisplayTransfer(1)).toBeCloseTo(1, 12);
  });

  it('remaps luma with one common RGB scale, preserving chroma', () => {
    const input = [0.2, 0.4, 0.1] as const;
    const output = applyDisplayTonalTransfer(input);
    const inputRatio = input[0] / input[1];
    const outputRatio = output[0] / output[1];
    expect(outputRatio).toBeCloseTo(inputRatio, 12);
    expect(output[0] * 0.2126 + output[1] * 0.7152 + output[2] * 0.0722)
      .toBeCloseTo(interpolateDisplayTransfer(0.2 * 0.2126 + 0.4 * 0.7152 + 0.1 * 0.0722), 12);
  });

  it('maps the achromatic black point to the measured 10/255 toe', () => {
    expect(applyDisplayTonalTransfer([0, 0, 0])).toEqual([10 / 255, 10 / 255, 10 / 255]);
  });
});
