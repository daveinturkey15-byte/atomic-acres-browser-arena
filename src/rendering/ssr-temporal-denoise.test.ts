import { describe, expect, it, vi } from 'vitest';
import {
  SSR_DENOISE_DEPTH_EDGE_FAR,
  SSR_DENOISE_DEPTH_EDGE_NEAR,
  SSR_DENOISE_VELOCITY_DEAD_ZONE_UV,
  SSR_DENOISE_VELOCITY_KNEE_UV,
  SSR_TEMPORAL_DENOISE_DEFAULT_STRENGTH,
  SSR_TEMPORAL_DENOISE_HISTORY_TARGETS,
  SSR_TEMPORAL_DENOISE_MAX_TAPS,
  SSR_TEMPORAL_DENOISE_MAXIMUM_STRENGTH,
  SSR_TEMPORAL_DENOISE_PIPELINE_COUNT,
  createSsrTemporalDenoiseHistory,
  resolveSsrTemporalDenoiseTuning,
  ssrDenoiseBlendWeight,
  ssrDenoiseClampSample,
  ssrDenoiseDepthGate,
  ssrDenoiseHistoryUvValid,
  ssrDenoiseMix,
  ssrDenoiseNeighbourhoodBox,
  ssrDenoiseReprojectUv,
  ssrDenoiseVelocityGate,
} from './ssr-temporal-denoise';

describe('SSR temporal-denoise budgets', () => {
  it('adds at most one pipeline and exactly one history buffer', () => {
    expect(SSR_TEMPORAL_DENOISE_PIPELINE_COUNT).toBeLessThanOrEqual(1);
    expect(SSR_TEMPORAL_DENOISE_HISTORY_TARGETS).toBe(1);
    expect(SSR_TEMPORAL_DENOISE_MAX_TAPS).toBeLessThanOrEqual(8);
  });

  it('keeps a fresh-frame floor: the history weight can never reach 1', () => {
    expect(SSR_TEMPORAL_DENOISE_MAXIMUM_STRENGTH).toBeLessThan(1);
    expect(ssrDenoiseBlendWeight(1, true, 1, 1)).toBe(SSR_TEMPORAL_DENOISE_MAXIMUM_STRENGTH);
    expect(SSR_TEMPORAL_DENOISE_DEFAULT_STRENGTH).toBeLessThanOrEqual(SSR_TEMPORAL_DENOISE_MAXIMUM_STRENGTH);
  });
});

describe('SSR temporal-denoise reprojection math', () => {
  it('walks a pixel back along its velocity into the previous frame', () => {
    expect(ssrDenoiseReprojectUv({ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.05 })).toEqual({ x: 0.4, y: 0.45 });
    expect(ssrDenoiseReprojectUv({ x: 0.25, y: 0.75 }, { x: 0, y: 0 })).toEqual({ x: 0.25, y: 0.75 });
  });

  it('rejects reprojected UVs outside the history buffer (disocclusion fallback)', () => {
    expect(ssrDenoiseHistoryUvValid({ x: 0, y: 0 })).toBe(true);
    expect(ssrDenoiseHistoryUvValid({ x: 1, y: 1 })).toBe(true);
    expect(ssrDenoiseHistoryUvValid({ x: 0.5, y: 0.5 })).toBe(true);
    expect(ssrDenoiseHistoryUvValid({ x: -0.01, y: 0.5 })).toBe(false);
    expect(ssrDenoiseHistoryUvValid({ x: 0.5, y: 1.01 })).toBe(false);
  });
});

describe('SSR temporal-denoise neighbourhood clamp', () => {
  const box = ssrDenoiseNeighbourhoodBox([
    { r: 0.2, g: 0.3, b: 0.4 },
    { r: 0.4, g: 0.1, b: 0.5 },
    { r: 0.3, g: 0.5, b: 0.3 },
    { r: 0.1, g: 0.2, b: 0.6 },
    { r: 0.35, g: 0.4, b: 0.35 },
  ]);

  it('bounds every channel by the neighbourhood min/max', () => {
    expect(box.min).toEqual({ r: 0.1, g: 0.1, b: 0.3 });
    expect(box.max).toEqual({ r: 0.4, g: 0.5, b: 0.6 });
  });

  it('clamps runaway history into the box and leaves inside samples alone', () => {
    expect(ssrDenoiseClampSample({ r: 0.9, g: -0.2, b: 0.45 }, box))
      .toEqual({ r: 0.4, g: 0.1, b: 0.45 });
    expect(ssrDenoiseClampSample({ r: 0.3, g: 0.3, b: 0.4 }, box))
      .toEqual({ r: 0.3, g: 0.3, b: 0.4 });
  });
});

describe('SSR temporal-denoise disocclusion gates', () => {
  it('trusts static pixels fully and fast ones not at all', () => {
    expect(ssrDenoiseVelocityGate(0)).toBe(1);
    expect(ssrDenoiseVelocityGate(SSR_DENOISE_VELOCITY_DEAD_ZONE_UV)).toBe(1);
    expect(ssrDenoiseVelocityGate(SSR_DENOISE_VELOCITY_KNEE_UV)).toBe(0);
    expect(ssrDenoiseVelocityGate(0.1)).toBe(0);
    const mid = (SSR_DENOISE_VELOCITY_DEAD_ZONE_UV + SSR_DENOISE_VELOCITY_KNEE_UV) / 2;
    expect(ssrDenoiseVelocityGate(mid)).toBeCloseTo(0.5, 5);
  });

  it('collapses history across depth silhouettes', () => {
    expect(ssrDenoiseDepthGate(0)).toBe(1);
    expect(ssrDenoiseDepthGate(SSR_DENOISE_DEPTH_EDGE_NEAR)).toBe(1);
    expect(ssrDenoiseDepthGate(SSR_DENOISE_DEPTH_EDGE_FAR)).toBe(0);
    expect(ssrDenoiseDepthGate(0.05)).toBe(0);
  });

  it('vetoes history on any single disocclusion signal (old path fallback)', () => {
    expect(ssrDenoiseBlendWeight(0.55, false, 1, 1)).toBe(0);
    expect(ssrDenoiseBlendWeight(0.55, true, 0, 1)).toBe(0);
    expect(ssrDenoiseBlendWeight(0.55, true, 1, 0)).toBe(0);
    expect(ssrDenoiseBlendWeight(0.55, true, 0.5, 0.5)).toBeCloseTo(0.55 * 0.25, 10);
    expect(ssrDenoiseBlendWeight(0, true, 1, 1)).toBe(0);
  });

  it('blends fresh and clamped history by the gated weight', () => {
    const current = { r: 0.2, g: 0.4, b: 0.6 };
    const history = { r: 0.4, g: 0.2, b: 0.8 };
    expect(ssrDenoiseMix(current, history, 0)).toEqual(current);
    const mid = ssrDenoiseMix(current, history, 0.5);
    expect(mid.r).toBeCloseTo(0.3, 10);
    expect(mid.g).toBeCloseTo(0.3, 10);
    expect(mid.b).toBeCloseTo(0.7, 10);
  });
});

describe('SSR temporal-denoise tuning', () => {
  it('rides SSR with an off switch that restores the old path', () => {
    const on = resolveSsrTemporalDenoiseTuning(true, true);
    expect(on).toEqual({ enabled: true, strength: SSR_TEMPORAL_DENOISE_DEFAULT_STRENGTH });
    expect(resolveSsrTemporalDenoiseTuning(true, false).enabled).toBe(false);
    expect(resolveSsrTemporalDenoiseTuning(false, true).enabled).toBe(false);
    expect(resolveSsrTemporalDenoiseTuning(false, false).enabled).toBe(false);
  });
});

describe('SSR temporal-denoise history buffer', () => {
  const sizedSource = (width: number, height: number) => ({ image: { width, height } });

  function fakeRenderer() {
    const copies: Array<readonly [unknown, unknown]> = [];
    return {
      copies,
      renderer: { copyTextureToTexture: vi.fn((source: unknown, target: unknown) => { copies.push([source, target]); }) },
    };
  }

  it('starts empty: zero targets, invalid, nothing to sample', () => {
    const history = createSsrTemporalDenoiseHistory();
    expect(history.targetCount()).toBe(0);
    expect(history.isValid()).toBe(false);
    expect(history.texture()).toBeNull();
  });

  it('primes for exactly one frame: copy lands, sampling waits a full frame', () => {
    const history = createSsrTemporalDenoiseHistory();
    const { copies, renderer } = fakeRenderer();
    const source = sizedSource(960, 540);
    const first = history.refresh(renderer, source);
    expect(first).toEqual({ copied: true, valid: false, targetCount: 1 });
    expect(history.isValid()).toBe(false);
    expect(copies).toHaveLength(1);
    const second = history.refresh(renderer, source);
    expect(second).toEqual({ copied: true, valid: true, targetCount: 1 });
    expect(history.isValid()).toBe(true);
    expect(history.texture()).not.toBeNull();
  });

  it('never holds more than one target across resizes and invalidations', () => {
    const history = createSsrTemporalDenoiseHistory();
    const { renderer } = fakeRenderer();
    history.refresh(renderer, sizedSource(960, 540));
    history.refresh(renderer, sizedSource(960, 540));
    expect(history.targetCount()).toBe(1);
    const before = history.texture();
    const resized = history.refresh(renderer, sizedSource(1280, 720));
    expect(resized).toEqual({ copied: true, valid: false, targetCount: 1 });
    expect(history.targetCount()).toBe(1);
    expect(history.isValid()).toBe(false);
    // Resize is in place: same target object, no second buffer allocated.
    expect(history.texture()).toBe(before);
    history.invalidate();
    expect(history.isValid()).toBe(false);
    expect(history.targetCount()).toBe(1);
    history.dispose();
    expect(history.targetCount()).toBe(0);
    expect(history.texture()).toBeNull();
    expect(history.isValid()).toBe(false);
  });

  it('copies nothing without a sized source and allocates nothing', () => {
    const history = createSsrTemporalDenoiseHistory();
    const { copies, renderer } = fakeRenderer();
    expect(history.refresh(renderer, {})).toEqual({ copied: false, valid: false, targetCount: 0 });
    expect(copies).toHaveLength(0);
    expect(history.targetCount()).toBe(0);
  });
});
