import { describe, expect, it } from 'vitest';
import { STUDIO_ENVIRONMENTS, studioEnvironmentForSeed } from './environment';

describe('fresh world environment admission', () => {
  it('resolves the same environment for host and late join without a local clock', () => {
    for (const seed of [0, 1, 123456, 0xffffffff, -1]) expect(studioEnvironmentForSeed(seed)).toEqual(studioEnvironmentForSeed(seed));
    expect(studioEnvironmentForSeed(-1)).toEqual(studioEnvironmentForSeed(0xffffffff));
  });
  it('covers all authored conditions while bounding combat precipitation', () => {
    const ids = new Set(Array.from({ length: 200 }, (_, seed) => studioEnvironmentForSeed(seed).id));
    expect(ids.size).toBe(STUDIO_ENVIRONMENTS.length);
    for (const preset of STUDIO_ENVIRONMENTS) {
      expect(preset.rain).toBeLessThanOrEqual(.5);
      expect(preset.rain * preset.snow).toBe(0);
      expect(preset.hour).toBeGreaterThanOrEqual(9);
    }
    expect(STUDIO_ENVIRONMENTS.some(preset => preset.snow > 0)).toBe(true);
  });
  it('accepts only explicit known offline inspection overrides', () => {
    expect(studioEnvironmentForSeed(6, 'winter-snow').snow).toBeGreaterThan(0);
    expect(studioEnvironmentForSeed(6, 'not-a-preset')).toBe(studioEnvironmentForSeed(6));
  });
});
