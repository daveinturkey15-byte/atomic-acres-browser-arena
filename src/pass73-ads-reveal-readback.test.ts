import { describe, expect, it } from 'vitest';
import {
  PASS73_ADS_REVEAL_ROI_HEIGHT,
  PASS73_ADS_REVEAL_ROI_WIDTH,
  pass73AdsRevealReadbackRegion,
  quantizePass73AdsRevealReadback,
} from './pass73-ads-reveal-readback';

describe('Pass 73 native ADS reveal readback', () => {
  it('owns one exact centered 512x640 HDR region and fails below it', () => {
    expect(pass73AdsRevealReadbackRegion(2_560, 1_440)).toEqual({
      x: 1_024,
      y: 400,
      width: PASS73_ADS_REVEAL_ROI_WIDTH,
      height: PASS73_ADS_REVEAL_ROI_HEIGHT,
      targetWidth: 2_560,
      targetHeight: 1_440,
    });
    expect(() => pass73AdsRevealReadbackRegion(511, 1_440)).toThrow(/at least 512x640/u);
    expect(() => pass73AdsRevealReadbackRegion(2_560, 639)).toThrow(/at least 512x640/u);
  });

  it('quantizes native uint8, float16, and float32 RGBA without changing pixel count', () => {
    expect(quantizePass73AdsRevealReadback(new Uint8Array([255, 0, 0, 255]), 1)).toMatchObject({
      componentType: 'uint8', channels: 4, nonFiniteComponents: 0,
    });
    expect([...quantizePass73AdsRevealReadback(new Uint16Array([0x3c00, 0, 0, 0x3c00]), 1).rgba8])
      .toEqual([188, 0, 0, 255]);
    expect([...quantizePass73AdsRevealReadback(new Float32Array([1, 0.5, 0, 1]), 1).rgba8])
      .toEqual([188, 156, 0, 255]);
    expect(() => quantizePass73AdsRevealReadback(new Uint16Array(3), 1)).toThrow(/3\/4 components/u);
  });

  it('records non-finite HDR components instead of silently certifying them', () => {
    const evidence = quantizePass73AdsRevealReadback(
      new Float32Array([Number.NaN, Number.POSITIVE_INFINITY, 0, 1]),
      1,
    );
    expect(evidence.nonFiniteComponents).toBe(2);
    expect([...evidence.rgba8]).toEqual([0, 0, 0, 255]);
  });
});
