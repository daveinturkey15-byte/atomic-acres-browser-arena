import { describe, expect, it } from 'vitest';
import { GUN_RANGE_NUKE_WARNING_POSITION, sampleNukeWarningPresentation } from './nuke-warning-presentation';

describe('Pass 71 Nuke warning presentation', () => {
  it('places the pre-detonation beacon inside the Gun Range killstreak room', () => {
    const [x, y, z] = GUN_RANGE_NUKE_WARNING_POSITION;
    expect(x).toBeGreaterThan(52);
    expect(x).toBeLessThan(99.9);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(25);
    expect(z).toBeGreaterThan(-25.9);
    expect(z).toBeLessThan(37.9);
  });

  it('builds a monotonically larger, brighter and more threatening five-second charge', () => {
    const samples = [0, 1_250, 2_500, 3_750, 5_000]
      .map((elapsed) => sampleNukeWarningPresentation(elapsed, 5_000, false));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].charge).toBeGreaterThan(samples[index - 1].charge);
      expect(samples[index].scale).toBeGreaterThan(samples[index - 1].scale);
      expect(samples[index].rotationY).toBeGreaterThan(samples[index - 1].rotationY);
      expect(samples[index].coreOpacity).toBeGreaterThan(samples[index - 1].coreOpacity);
      expect(samples[index].ringOpacity).toBeGreaterThan(samples[index - 1].ringOpacity);
      expect(samples[index].lightIntensity).toBeGreaterThan(samples[index - 1].lightIntensity);
      expect(samples[index].fogBlend).toBeGreaterThan(samples[index - 1].fogBlend);
    }
    expect(samples.at(-1)).toMatchObject({ charge: 1, scale: 2.2, ringOpacity: 0.76, lightIntensity: 17.5 });
    expect(samples.at(-1)?.coreOpacity).toBeCloseTo(0.86, 10);
  });

  it('keeps the same warning duration and shape while reducing sensory intensity', () => {
    const full = sampleNukeWarningPresentation(5_000, 5_000, false);
    const reduced = sampleNukeWarningPresentation(5_000, 5_000, true);
    expect(reduced.charge).toBe(1);
    expect(reduced.lightIntensity).toBeLessThan(full.lightIntensity / 2);
    expect(reduced.coreOpacity).toBeLessThan(full.coreOpacity / 2);
    expect(reduced.rotationY).toBeLessThan(full.rotationY);
    expect(reduced.scale).toBeGreaterThan(1);
  });
});
