import { describe, expect, it } from 'vitest';
import {
  AdaptiveQualityController,
  DeferredAdaptivePixelRatio,
  adaptiveShadowsEnabled,
  assertWebGpuAdmissionCompletionLatency,
  classifyDisplayFrameMs,
  configuredAdaptiveQualityLevels,
  shouldFreezeAdaptiveQualityForMatch,
} from './adaptive-quality';

describe('adaptive quality controller', () => {
  it('rejects a catastrophic admission completion without adapting from queue latency', () => {
    expect(() => assertWebGpuAdmissionCompletionLatency('Initial match', 11_000)).toThrow(
      'Initial match presentation completion latency 11000.0ms exceeded the 4000ms admission limit',
    );
    expect(() => assertWebGpuAdmissionCompletionLatency('Initial match', 4_000)).not.toThrow();
    expect(() => assertWebGpuAdmissionCompletionLatency('Initial match', null)).toThrow(
      'Initial match presentation completed without a valid queue-latency sample',
    );
  });

  it('freezes the admitted tier only for WebGPU and preserves WebGL2 live adaptation', () => {
    expect(shouldFreezeAdaptiveQualityForMatch('webgpu')).toBe(true);
    expect(shouldFreezeAdaptiveQualityForMatch('webgl2')).toBe(false);
  });

  it('retains explicitly authored shadows throughout every non-compatibility ladder', () => {
    expect(adaptiveShadowsEnabled('blender', true, 1)).toBe(true);
    expect(adaptiveShadowsEnabled('blender', true, 0.75)).toBe(true);
    expect(adaptiveShadowsEnabled('performance', true, 0.5)).toBe(true);
    expect(adaptiveShadowsEnabled('performance', false, 0.75)).toBe(false);
    expect(adaptiveShadowsEnabled('compat', true, 0.2)).toBe(false);
  });

  it('never constructs an adaptive tier above the selected Custom render scale', () => {
    expect(configuredAdaptiveQualityLevels('performance', 0.75, true)).toEqual([0.55, 0.65, 0.75]);
    expect(configuredAdaptiveQualityLevels('blender', 1, true)).toEqual([0.55, 0.65, 0.75, 0.85, 1]);
    expect(configuredAdaptiveQualityLevels('performance', 0.5, true)).toEqual([0.5]);
    expect(configuredAdaptiveQualityLevels('performance', 1.25, true)).toEqual([0.91, 1.09, 1.25]);
    expect(configuredAdaptiveQualityLevels('blender', 0.9, false)).toEqual([0.9]);
  });

  it('keeps Quality Graphics within its authored resolution ladder', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1,
    });
    expect(controller.telemetry()).toMatchObject({
      profile: 'blender', levels: [0.55, 0.65, 0.75, 0.85, 1], pixelRatioCap: 1,
    });
  });

  it('classifies common uncapped display cadences before heavy rendering starts', () => {
    expect(classifyDisplayFrameMs(Array(60).fill(8.3))).toBeCloseTo(1_000 / 120);
    expect(classifyDisplayFrameMs(Array(60).fill(16.7))).toBeCloseTo(1_000 / 60);
    expect(classifyDisplayFrameMs(Array(60).fill(34.7))).toBeCloseTo(1_000 / 30);
    expect(classifyDisplayFrameMs(Array(60).fill(90))).toBeCloseTo(1_000 / 60);
  });

  it('keeps genuine high-refresh cadences instead of bucketing them down', () => {
    expect(classifyDisplayFrameMs(Array(60).fill(1_000 / 144))).toBeCloseTo(1_000 / 144);
    expect(classifyDisplayFrameMs(Array(60).fill(1_000 / 165))).toBeCloseTo(1_000 / 165);
    expect(classifyDisplayFrameMs(Array(60).fill(1_000 / 180))).toBeCloseTo(1_000 / 180);
    expect(classifyDisplayFrameMs(Array(60).fill(1_000 / 240))).toBeCloseTo(1_000 / 240);
    // Unusual/VRR cadence: trust the measured median instead of snapping.
    expect(classifyDisplayFrameMs(Array(60).fill(9.5))).toBeCloseTo(9.5);
  });

  it('drops throttled background evidence on refocus without changing tier', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 180, initialPixelRatioCap: 1,
      downshiftSamples: 100, upshiftSamples: 200, cooldownSamples: 500,
    });
    for (let index = 0; index < 60; index += 1) controller.record(22, true);
    controller.resetSampling('tab visibility regained');
    expect(controller.telemetry()).toMatchObject({
      samples: 0, p50Ms: 0, p95Ms: 0, cooldownFrames: 0,
      pixelRatioCap: 1, downshifts: 0,
      lastReason: 'tab visibility regained',
    });
  });

  it('keeps a healthy admitted-submission window at the selected tier without live hysteresis', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 144, initialPixelRatioCap: 1,
    });
    expect(controller.calibrateSevereAdmissionDownshift(Array(60).fill(9), 'Initial match')).toBeNull();
    expect(controller.telemetry()).toMatchObject({
      pixelRatioCap: 1,
      downshifts: 0,
      p50Ms: 9,
      p95Ms: 9,
      cooldownFrames: 0,
      lastReason: 'Initial match: p50 9.0ms/p95 9.0ms within severe 25.0ms/50.0ms limits',
    });
    expect(controller.calibrateSevereAdmissionDownshift(Array(60).fill(7), 'Initial match')).toBeNull();
    expect(controller.telemetry()).toMatchObject({
      pixelRatioCap: 1,
      downshifts: 0,
      p50Ms: 7,
      p95Ms: 7,
      lastReason: 'Initial match: p50 7.0ms/p95 7.0ms within severe 25.0ms/50.0ms limits',
    });
  });

  it('allows only one admission downshift for severe submitted-frame under-performance', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 180, initialPixelRatioCap: 1,
    });
    expect(controller.calibrateSevereAdmissionDownshift([
      ...Array(56).fill(26), ...Array(4).fill(55),
    ], 'Initial match')).toBe(0.85);
    expect(controller.telemetry()).toMatchObject({
      pixelRatioCap: 0.85,
      downshifts: 1,
      p50Ms: 26,
      p95Ms: 55,
      lastReason: 'Initial match: p50 26.0ms/p95 55.0ms exceeded severe 25.0ms/50.0ms limits',
    });
  });

  it('reports an over-budget minimum tier truthfully instead of claiming it met budget', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 144, initialPixelRatioCap: 0.55,
    });
    expect(controller.calibrateSevereAdmissionDownshift(Array(60).fill(55), 'Initial match')).toBeNull();
    expect(controller.telemetry()).toMatchObject({
      pixelRatioCap: 0.55,
      downshifts: 0,
      p95Ms: 55,
      lastReason: 'Initial match: p50 55.0ms/p95 55.0ms exceeded severe 25.0ms/50.0ms limits at minimum tier',
    });
  });

  it('re-seeds every match at the selected preset cap without manufacturing an upshift', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 144, initialPixelRatioCap: 1,
    });
    expect(controller.calibrateSevereAdmissionDownshift(Array(60).fill(55), 'First match')).toBe(0.85);
    expect(controller.seedPixelRatioCap(1, 'Quality preset match seed')).toBe(1);
    expect(controller.telemetry()).toMatchObject({
      pixelRatioCap: 1,
      samples: 0,
      p50Ms: 0,
      p95Ms: 0,
      downshifts: 1,
      upshifts: 0,
      lastReason: 'Quality preset match seed',
    });
  });

  it('seeds Performance at its deterministic authored cap', () => {
    const controller = new AdaptiveQualityController({
      profile: 'performance', targetFrameMs: 1_000 / 144, initialPixelRatioCap: 0.75,
      levels: configuredAdaptiveQualityLevels('performance', 0.75, true),
    });
    expect(controller.seedPixelRatioCap(0.75, 'Performance preset match seed')).toBe(0.75);
    expect(controller.telemetry()).toMatchObject({ levels: [0.55, 0.65, 0.75], pixelRatioCap: 0.75 });
  });

  it('uses the bounded timeout minimum and never treats a shorter sample as downshift evidence', () => {
    const controller = new AdaptiveQualityController({
      profile: 'performance', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 0.75,
    });
    expect(controller.calibrateSevereAdmissionDownshift([...Array(23).fill(55), 300, 0, Number.NaN], 'Initial match')).toBeNull();
    expect(controller.telemetry()).toMatchObject({
      pixelRatioCap: 0.75,
      downshifts: 0,
      samples: 23,
      lastReason: 'Initial match: 23/24 valid calibration samples',
    });
    expect(controller.calibrateSevereAdmissionDownshift(Array(24).fill(34), 'Initial match')).toBe(0.65);
    expect(controller.telemetry()).toMatchObject({ pixelRatioCap: 0.65, downshifts: 1, samples: 24 });
  });

  it('downshifts after sustained overload without leaving the public profile floor', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1,
      downshiftSamples: 10, upshiftSamples: 20, cooldownSamples: 5,
    });
    const changes = Array.from({ length: 100 }, () => controller.record(24, true)).filter((value) => value !== null);
    expect(changes).toEqual([0.85, 0.75, 0.65, 0.55]);
    expect(controller.telemetry()).toMatchObject({ pixelRatioCap: 0.55, downshifts: 4, upshifts: 0 });
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

  it('discards a deferred renderer resize when presentation ownership changes', () => {
    const deferred = new DeferredAdaptivePixelRatio();
    deferred.request(0.65);
    expect(deferred.pending()).toBe(0.65);
    deferred.clear();
    expect(deferred.pending()).toBeNull();
    expect(deferred.takeWhenPresentationIdle({
      submissionSequence: 4, completedSequence: 4, pendingSince: null,
    })).toBeNull();
  });

  it('ignores loading, hidden, paused and pathological samples supplied as ineligible', () => {
    const controller = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1,
      downshiftSamples: 5, cooldownSamples: 0,
    });
    for (let index = 0; index < 100; index += 1) controller.record(80, false);
    expect(controller.telemetry()).toMatchObject({ samples: 0, downshifts: 0, pixelRatioCap: 1 });
  });

  it('supports bounded user-selected ladders and a genuine fixed Max mode', () => {
    const custom = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 90, initialPixelRatioCap: 0.9, levels: [0.6, 0.75, 0.9],
    });
    expect(custom.telemetry()).toMatchObject({ enabled: true, levels: [0.6, 0.75, 0.9], pixelRatioCap: 0.9 });
    const fixed = new AdaptiveQualityController({
      profile: 'blender', targetFrameMs: 1_000 / 60, initialPixelRatioCap: 1, enabled: false, levels: [1],
    });
    for (let index = 0; index < 200; index += 1) fixed.record(40, true);
    expect(fixed.telemetry()).toMatchObject({ enabled: false, levels: [1], pixelRatioCap: 1, downshifts: 0 });
  });

  it('defers one adaptive renderer mutation until the WebGPU frontier is fully idle', () => {
    const deferred = new DeferredAdaptivePixelRatio();
    deferred.request(0.75);
    expect(deferred.takeWhenPresentationIdle({
      submissionSequence: 4, completedSequence: 3, pendingSince: 100,
    })).toBeNull();
    expect(deferred.pending()).toBe(0.75);
    expect(deferred.takeWhenPresentationIdle({
      submissionSequence: 4, completedSequence: 4, pendingSince: 100,
    })).toBeNull();
    expect(deferred.takeWhenPresentationIdle({
      submissionSequence: 4, completedSequence: 4, pendingSince: null,
    })).toBe(0.75);
    expect(deferred.takeWhenPresentationIdle({
      submissionSequence: 4, completedSequence: 4, pendingSince: null,
    })).toBeNull();
  });
});
