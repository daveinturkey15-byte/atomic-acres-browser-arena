import { describe, expect, it } from 'vitest';
import { FramePacingSampler } from './frame-pacing';

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
});
