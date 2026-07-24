import { describe, expect, it } from 'vitest';
import { AdaptiveQualityController, adaptiveShadowsEnabled, classifyDisplayFrameMs } from './adaptive-quality';

describe('adaptive quality controller', () => {
  it('retains authored shadows throughout the Quality ladder and never enables them in Performance', () => {
    expect(adaptiveShadowsEnabled('blender', true, 1)).toBe(true);
    expect(adaptiveShadowsEnabled('blender', true, 0.75)).toBe(true);
    expect(adaptiveShadowsEnabled('blender', true, 0.65)).toBe(true);
    expect(adaptiveShadowsEnabled('performance', true, 0.75)).toBe(false);
  });

  it('keeps Quality Graphics within its authored resolution ladder', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1,
    });
    expect(controller.telemetry()).toMatchObject({
      profile: 'blender', levels: [0.65, 0.75, 0.85, 1], pixelRatioCap: 1,
    });
  });

  it('classifies common uncapped display cadences before heavy rendering starts', () => {
    expect(classifyDisplayFrameMs(Array(60).fill(8.3))).toBeCloseTo(1_000 / 120);
    expect(classifyDisplayFrameMs(Array(60).fill(16.7))).toBeCloseTo(1_000 / 60);
    expect(classifyDisplayFrameMs(Array(60).fill(34.7))).toBeCloseTo(1_000 / 30);
    expect(classifyDisplayFrameMs(Array(60).fill(90))).toBeCloseTo(1_000 / 60);
  });

  it('downshifts after sustained overload without leaving the public profile floor', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1,
      downshiftSamples: 10, upshiftSamples: 20, cooldownSamples: 5,
    });
    const changes = Array.from({ length: 100 }, () => controller.record(24, true)).filter((value) => value !== null);
    expect(changes).toEqual([0.85, 0.75, 0.65]);
    expect(controller.telemetry()).toMatchObject({ pixelRatioCap: 0.65, downshifts: 3, upshifts: 0 });
  });

  it('uses longer stable headroom and cooldown before recovering', () => {
    const controller = new AdaptiveQualityController({
      profile: 'performance', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 0.65,
      downshiftSamples: 5, upshiftSamples: 12, cooldownSamples: 6,
    });
    const early = Array.from({ length: 70 }, () => controller.record(16.8, true)).filter((value) => value !== null);
    expect(early).toEqual([]);
    const recovery = Array.from({ length: 150 }, () => controller.record(14, true)).filter((value) => value !== null);
    expect(recovery).toEqual([0.75]);
    expect(controller.telemetry().upshifts).toBe(1);
  });

  it('clears stale timing windows whenever sampling becomes ineligible', () => {
    const controller = new AdaptiveQualityController({
      profile: 'performance', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 0.65,
      downshiftSamples: 100, upshiftSamples: 100, cooldownSamples: 0,
    });
    for (let index = 0; index < 80; index += 1) controller.record(24, true);
    expect(controller.telemetry().samples).toBe(80);
    controller.record(24, false);
    expect(controller.telemetry()).toMatchObject({ samples: 0, p50Ms: 0, p95Ms: 0 });
    for (let index = 0; index < 44; index += 1) controller.record(24, true);
    expect(controller.telemetry()).toMatchObject({ samples: 44, downshifts: 0, pixelRatioCap: 0.65 });
  });

  it('ignores loading, hidden, paused and pathological samples supplied as ineligible', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1,
      downshiftSamples: 5, cooldownSamples: 0,
    });
    for (let index = 0; index < 100; index += 1) controller.record(80, false);
    expect(controller.telemetry()).toMatchObject({ samples: 0, downshifts: 0, pixelRatioCap: 1 });
  });
});
