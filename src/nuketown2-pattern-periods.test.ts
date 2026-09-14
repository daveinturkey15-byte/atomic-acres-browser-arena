/**
 * nuketown2-pattern-periods.test.ts — HF-536 row-6 pattern-artifact gate.
 *
 * Each strange-asset pattern (fence scallops, concrete rings, hob size,
 * sunlit-fence swirl) traced to one authored constant and pinned here with
 * the direction of its fix, so a future tune that restores the aliasing
 * pitch or the oversized radius fails this file instead of a capture.
 *
 * Pixel math uses the arena's own camera model (`featurePixels`: 37 degrees
 * over 1080 lines); the review capture is 1280x720, where a feature at the
 * 2 px floor renders at 1.33 px.
 */
import { describe, expect, it } from 'vitest';

import { BROOM_PERIOD_M } from './nuketown2-materials/families/concrete';
import { LATEWOOD_PERIOD_M, TIMBER_SILVER_LIFT } from './nuketown2-materials/families/timber';
import { HOB_RING_EDGE_M, HOB_RING_OUTER_M, HOB_RING_PITCH_M } from './nuketown2-yard-props';
import { MIN_ALBEDO_WEAR_STEP, MIN_FEATURE_PIXELS, featurePixels } from './nuketown2-materials/spec';

describe('nuketown2 pattern periods — row-6 artifact pins', () => {
  it('latewood runs at a 2.2 mm pitch that is sub-pixel at every fence read distance', () => {
    expect(LATEWOOD_PERIOD_M).toBe(0.0022);
    // Arm's length: the bands are real close detail (above the floor).
    expect(featurePixels(LATEWOOD_PERIOD_M, 1.0)).toBeGreaterThan(MIN_FEATURE_PIXELS);
    // garden-pod-north-close reads its fence from ~3-6 m: sub-pixel there,
    // which is what aliased into dotted scallops before the 1.2-3 m fade.
    expect(featurePixels(LATEWOOD_PERIOD_M, 3.0)).toBeLessThan(MIN_FEATURE_PIXELS);
    expect(featurePixels(LATEWOOD_PERIOD_M, 5.4)).toBeLessThan(1);
  });

  it('broom grating runs at a 2.5 mm pitch that is sub-pixel past ~2 m', () => {
    expect(BROOM_PERIOD_M).toBe(0.0025);
    // The concrete header's own calibration is 2 px at 1.35 m on the 720-line
    // review capture; featurePixels models 1080 lines, where that is 3 px.
    expect(featurePixels(BROOM_PERIOD_M, 1.35)).toBeCloseTo(3.0, 0);
    // border-path-close reads ground from ~2-15 m: sub-pixel there, which is
    // what moired into concentric rings before the 1.2-3 m albedo fade.
    expect(featurePixels(BROOM_PERIOD_M, 3.0)).toBeLessThan(MIN_FEATURE_PIXELS);
  });

  it('hob rings sit mid-band for a domestic cooker top', () => {
    // A domestic ring is 0.14-0.22 m across on a 0.6 m top.
    const diameterM = HOB_RING_OUTER_M * 2;
    expect(diameterM).toBeGreaterThanOrEqual(0.14);
    expect(diameterM).toBeLessThanOrEqual(0.22);
    expect(diameterM).toBeCloseTo(0.172, 3);
    // Annulus edges ascend and the ring fills just over half its cell.
    const [e0, e1, e2, e3] = HOB_RING_EDGE_M;
    expect([e0, e1, e2, e3]).toEqual([...[e0, e1, e2, e3]].sort((a, b) => a - b));
    expect(HOB_RING_OUTER_M).toBe(e3);
    expect(diameterM / HOB_RING_PITCH_M).toBeLessThan(0.6);
  });

  it('timber silvering stays a visible lift without the sunlit blotch', () => {
    // Bounded down from the shipped 0.55 that laid metre-scale swirls on the
    // sunlit fence, still well above a visible wear step.
    expect(TIMBER_SILVER_LIFT).toBeLessThan(0.55);
    expect(TIMBER_SILVER_LIFT).toBeGreaterThanOrEqual(MIN_ALBEDO_WEAR_STEP * 2);
    expect(TIMBER_SILVER_LIFT).toBeCloseTo(0.36, 5);
  });
});
