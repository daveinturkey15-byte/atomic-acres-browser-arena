import { describe, expect, it } from 'vitest';
import {
  MELEE_KNIFE_PRESENTATION_SCALE,
  MELEE_VIEWMODEL_PEAK_SCALE_LIFT,
  viewmodelMeleeLateralOffset,
  viewmodelViewportScale,
} from './weapon-presentation';

describe('Pass 66 first-person viewport framing', () => {
  it('keeps 1440p and 4K framing identical at the same aspect ratio', () => {
    const at1440p = viewmodelViewportScale(2560 / 1440, 75);
    const at4k = viewmodelViewportScale(3840 / 2160, 75);
    expect(at1440p).toBeCloseTo(1, 8);
    expect(at4k).toBeCloseTo(at1440p, 8);
  });

  it('uses bounded ultrawide compensation instead of full aspect multiplication', () => {
    const standard = viewmodelViewportScale(2560 / 1440, 75);
    const ultrawide = viewmodelViewportScale(3440 / 1440, 75);
    expect(ultrawide).toBeGreaterThan(standard);
    expect(ultrawide).toBeLessThanOrEqual(standard * 1.12);
    expect(ultrawide).toBeLessThan((3440 / 1440) / (16 / 9));
  });

  it('falls back safely for invalid dimensions and bounds FOV compensation', () => {
    expect(viewmodelViewportScale(Number.NaN, Number.NaN)).toBeCloseTo(1, 8);
    expect(viewmodelViewportScale(16 / 9, 1)).toBeCloseTo(1, 8);
    expect(viewmodelViewportScale(16 / 9, 140)).toBeLessThanOrEqual(2.4);
  });

  it('keeps the melee entry point fixed in screen space across 16:9 and ultrawide', () => {
    const standard = viewmodelMeleeLateralOffset(2560 / 1440);
    const fourK = viewmodelMeleeLateralOffset(3840 / 2160);
    const ultrawide = viewmodelMeleeLateralOffset(3440 / 1440);
    expect(standard).toBeCloseTo(0.58, 8);
    expect(fourK).toBeCloseTo(standard, 8);
    expect(ultrawide).toBeGreaterThan(standard);
    expect(ultrawide).toBeLessThanOrEqual(0.98);
  });

  it('keeps the knife itself readable without distorting the complete viewmodel root', () => {
    expect(MELEE_KNIFE_PRESENTATION_SCALE).toBeGreaterThanOrEqual(1.5);
    expect(MELEE_KNIFE_PRESENTATION_SCALE).toBeLessThanOrEqual(1.65);
    expect(MELEE_VIEWMODEL_PEAK_SCALE_LIFT).toBe(0);
  });
});
