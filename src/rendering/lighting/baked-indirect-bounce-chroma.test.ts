import { describe, expect, it } from 'vitest';

import {
  BOUNCE_CHROMA_RETENTION,
  desaturateBounce,
} from './baked-indirect-node';

const LUMA = (c: readonly [number, number, number]): number =>
  c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

const saturation = (c: readonly [number, number, number]): number => {
  const hi = Math.max(...c);
  const lo = Math.min(...c);
  return hi <= 0 ? 0 : (hi - lo) / hi;
};

describe('bounce chroma retention', () => {
  it('keeps the bounce luma exactly, which is the readability win', () => {
    // The shade level the baked bounce won on shadow-side walls is a luma
    // effect. Desaturation must not spend any of it.
    const olive: [number, number, number] = [0.42, 0.38, 0.11];
    expect(LUMA(desaturateBounce(olive))).toBeCloseTo(LUMA(olive), 12);
  });

  it('cuts the yellow-green cast, which is the fault', () => {
    // Nuke Town's proxy lawn and orange siding are what paint the roadway.
    const olive: [number, number, number] = [0.42, 0.38, 0.11];
    const before = saturation(olive);
    const after = saturation(desaturateBounce(olive));
    expect(after).toBeLessThan(before);
    // The exact invariant is on the chroma RANGE, not on saturation: saturation
    // divides by the max channel, which also moves toward the luma, so its ratio
    // is not the retention factor. The range scales by it exactly.
    const range = (c: readonly [number, number, number]): number =>
      Math.max(...c) - Math.min(...c);
    expect(range(desaturateBounce(olive)) / range(olive)).toBeCloseTo(
      BOUNCE_CHROMA_RETENTION,
      12,
    );
  });

  it('is a partial desaturation, not a greyscale and not a no-op', () => {
    // A retention of 0 would throw away the bounce's identity; 1 would leave
    // the measured cast in place. Both were rejected.
    expect(BOUNCE_CHROMA_RETENTION).toBeGreaterThan(0);
    expect(BOUNCE_CHROMA_RETENTION).toBeLessThan(1);
  });

  it('leaves an already-neutral bounce untouched', () => {
    const grey: [number, number, number] = [0.3, 0.3, 0.3];
    desaturateBounce(grey).forEach((v) => expect(v).toBeCloseTo(0.3, 12));
  });

  it('never darkens a channel below zero', () => {
    // The node adds this and is clamped above, never below; a negative
    // channel here would be a subtractive light.
    const harsh: [number, number, number] = [1.6, 0.05, 0.0];
    desaturateBounce(harsh).forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });
});
