import { describe, expect, it } from 'vitest';
import { FramePacingSampler, cadenceWithNoProgressAge } from './frame-pacing';

describe('FramePacingSampler', () => {
  it('identifies a sustained 30 Hz presentation cap', () => {
    const sampler = new FramePacingSampler();
    for (let index = 0; index < 120; index += 1) sampler.record(index % 5 === 0 ? 34 : 33.3);
    const summary = sampler.summary();
    expect(summary.ready).toBe(true);
    expect(summary.cadenceHz).toBeCloseTo(30.03, 1);
    expect(summary.displayLimited).toBe(true);
  });

  it('keeps a paced 60 Hz presentation out of the low-refresh warning', () => {
    const sampler = new FramePacingSampler();
    for (let index = 0; index < 120; index += 1) sampler.record(index % 10 === 0 ? 18 : 16.6);
    const summary = sampler.summary();
    expect(summary.ready).toBe(true);
    expect(summary.cadenceHz).toBeGreaterThan(59);
    expect(summary.displayLimited).toBe(false);
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
    expect(sampler.summary()).toMatchObject({ sampleCount: 10, cadenceHz: 2 });
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
    expect(sampler.summary()).toMatchObject({ ready: true, sampleCount: 180, displayLimited: true });
    sampler.reset('tab visibility regained');
    expect(sampler.summary()).toMatchObject({
      ready: false, sampleCount: 0, cadenceHz: 0, displayLimited: false,
      lastResetReason: 'tab visibility regained',
    });
    for (let index = 0; index < 90; index += 1) sampler.record(6.94);
    expect(sampler.summary()).toMatchObject({ ready: true, sampleCount: 90, displayLimited: false });
    expect(sampler.summary().cadenceHz).toBeGreaterThan(140);
  });

  it('decays effective cadence when no new presentation progress arrives', () => {
    expect(cadenceWithNoProgressAge(144, 5)).toBe(144);
    expect(cadenceWithNoProgressAge(144, 500)).toBe(2);
    expect(cadenceWithNoProgressAge(60, 1_000)).toBe(1);
    expect(cadenceWithNoProgressAge(0, 500)).toBe(0);
  });
});
