import { describe, expect, it } from 'vitest';
import { advanceFootsteps, strideLength, type FootstepAccumulator } from './footsteps';

describe('distance-driven footsteps', () => {
  it('does not emit without applied movement', () => {
    const result = advanceFootsteps({ distance: 0.5, side: 0 }, 0, 1.6);
    expect(result.emitted).toBe(0);
    expect(result.state.distance).toBe(0.5);
  });

  it('is frame-partition independent across stride crossings', () => {
    let partitioned: FootstepAccumulator = { distance: 0, side: 0 };
    let emitted = 0;
    for (const distance of [0.4, 0.5, 0.72, 1.62]) {
      const step = advanceFootsteps(partitioned, distance, 1.62);
      partitioned = step.state;
      emitted += step.emitted;
    }
    const single = advanceFootsteps({ distance: 0, side: 0 }, 3.24, 1.62);
    expect(emitted).toBe(single.emitted);
    expect(partitioned.distance).toBeCloseTo(single.state.distance, 6);
  });

  it('authors distinct stance and sprint strides', () => {
    expect(strideLength('stand', true)).toBeGreaterThan(strideLength('stand', false));
    expect(strideLength('crouch', false)).toBeLessThan(strideLength('stand', false));
    expect(strideLength('prone', false)).toBeLessThan(strideLength('crouch', false));
  });
});
