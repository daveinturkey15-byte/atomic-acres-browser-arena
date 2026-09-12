import { describe, expect, it } from 'vitest';
import {
  FramePacingSampler,
  SMOOTH_PRESENTATION_FLOOR_HZ,
  cadenceWithNoProgressAge,
  presentationIsDisplayLimited,
} from './frame-pacing';

describe('FramePacingSampler', () => {
  it('reports a sustained 30 Hz stream as 30 frames per second', () => {
    const sampler = new FramePacingSampler();
    for (let index = 0; index < 120; index += 1) sampler.record(index % 5 === 0 ? 34 : 33.3);
    const summary = sampler.summary();
    expect(summary.ready).toBe(true);
    expect(summary.rateHz).toBeCloseTo(29.9, 1);
    expect(summary.cadenceHz).toBeCloseTo(30.03, 1);
  });

  it('refuses to call a bursty stream fast just because its median gap is short', () => {
    // THE BUG THIS ENCODES. Two frames are admitted back to back, the third is
    // refused, and the queue fence retires 40 ms later. The gaps are
    // [8, 40, 8, 40, ...]; their MEDIAN is 8 ms, which the HUD published as
    // "125 fps" while the stream was actually presenting about 42.
    const sampler = new FramePacingSampler();
    for (let index = 0; index < 120; index += 1) sampler.record(index % 2 === 0 ? 8 : 40);
    const summary = sampler.summary();
    expect(summary.cadenceHz).toBeGreaterThan(100);
    expect(summary.rateHz).toBeCloseTo(41.7, 1);
    expect(summary.meanMs).toBeCloseTo(24, 1);
  });

  it('ignores invalid samples and bounds retained history', () => {
    const sampler = new FramePacingSampler();
    sampler.record(Number.NaN);
    sampler.record(0);
    sampler.record(1_500);
    for (let index = 0; index < 240; index += 1) sampler.record(10 + (index % 2));
    expect(sampler.summary().sampleCount).toBe(180);
  });

  it('reports very slow rendered frames instead of leaving the FPS HUD in a warming state', () => {
    const sampler = new FramePacingSampler();
    for (let index = 0; index < 10; index += 1) sampler.record(500);
    expect(sampler.summary()).toMatchObject({ sampleCount: 10, cadenceHz: 2, rateHz: 2 });
  });

  it('reports tail latency and every fixed long-frame threshold', () => {
    const sampler = new FramePacingSampler();
    for (const sample of [8, 12, 20, 20.1, 33, 33.1, 50, 50.1, 100, 100.1]) sampler.record(sample);
    expect(sampler.summary()).toMatchObject({
      sampleCount: 10,
      p99Ms: 100,
      maxMs: 100.1,
      longFrames: { over20Ms: 7, over33Ms: 5, over50Ms: 3, over100Ms: 1 },
    });
  });

  it('drops stale hidden-tab cadence immediately on visibility recovery', () => {
    const sampler = new FramePacingSampler();
    for (let index = 0; index < 180; index += 1) sampler.record(22.2);
    expect(sampler.summary()).toMatchObject({ ready: true, sampleCount: 180 });
    expect(sampler.summary().rateHz).toBeCloseTo(45, 1);
    sampler.reset('tab visibility regained');
    expect(sampler.summary()).toMatchObject({
      ready: false, sampleCount: 0, cadenceHz: 0, rateHz: 0,
      lastResetReason: 'tab visibility regained',
    });
    for (let index = 0; index < 90; index += 1) sampler.record(6.94);
    expect(sampler.summary()).toMatchObject({ ready: true, sampleCount: 90 });
    expect(sampler.summary().rateHz).toBeGreaterThan(140);
  });

  it('decays effective cadence when no new presentation progress arrives', () => {
    expect(cadenceWithNoProgressAge(144, 5)).toBe(144);
    expect(cadenceWithNoProgressAge(144, 500)).toBe(2);
    expect(cadenceWithNoProgressAge(60, 1_000)).toBe(1);
    expect(cadenceWithNoProgressAge(0, 500)).toBe(0);
  });
});

describe('presentationIsDisplayLimited', () => {
  const sample = (overrides: Partial<Parameters<typeof presentationIsDisplayLimited>[0]> = {}) =>
    presentationIsDisplayLimited({ sampleCount: 180, presentedCadenceHz: 59.9, callbackRefreshHz: 59.9, ...overrides });

  it('fires at the 59.9 Hz the owner is actually running', () => {
    // The whole point. A 180 Hz panel set to 59 Hz in Windows presents at 59.9,
    // and the old `cadenceHz < 55` test could never reach it - the one surface
    // that would have explained his frame rate was unreachable at exactly the
    // refresh that needed it.
    expect(sample()).toBe(true);
  });

  it('fires for a genuinely low refresh', () => {
    expect(sample({ presentedCadenceHz: 30, callbackRefreshHz: 30 })).toBe(true);
  });

  it('stays silent through a renderer hitch that drags the callback rate down with it', () => {
    // The instantaneous callback rate falls WITH the presented rate during a
    // hitch, so comparing the two called a 33 fps stutter on a 60 Hz monitor a
    // "33 Hz display limit". The refresh ceiling comes from the fastest frames
    // in the window, which a hitch does not move.
    expect(sample({ presentedCadenceHz: 33, callbackRefreshHz: 60 })).toBe(false);
  });

  it('stays silent when the renderer, not the display, is the limit', () => {
    // 40 presented against 60 callbacks is a renderer that cannot keep up. No
    // Windows display setting fixes that, so saying "display limit" would be a
    // lie - and the old test said it anyway.
    expect(sample({ presentedCadenceHz: 40, callbackRefreshHz: 60 })).toBe(false);
  });

  it('stays silent above the smooth presentation floor', () => {
    expect(sample({ presentedCadenceHz: 144, callbackRefreshHz: 144 })).toBe(false);
    expect(sample({
      presentedCadenceHz: SMOOTH_PRESENTATION_FLOOR_HZ,
      callbackRefreshHz: SMOOTH_PRESENTATION_FLOOR_HZ,
    })).toBe(false);
  });

  it('stays silent before it has seen enough presented frames', () => {
    expect(sample({ sampleCount: 59 })).toBe(false);
    expect(sample({ sampleCount: 60 })).toBe(true);
  });

  it('stays silent on a stopped or nonsense stream', () => {
    expect(sample({ presentedCadenceHz: 0, callbackRefreshHz: 0 })).toBe(false);
    expect(sample({ callbackRefreshHz: Number.NaN })).toBe(false);
    expect(sample({ presentedCadenceHz: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('tolerates a small shortfall but not a large one', () => {
    expect(sample({ presentedCadenceHz: 55, callbackRefreshHz: 59.9 })).toBe(true);
    expect(sample({ presentedCadenceHz: 51, callbackRefreshHz: 59.9 })).toBe(false);
  });
});
