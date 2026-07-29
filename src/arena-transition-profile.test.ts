import { describe, expect, it } from 'vitest';
import { ArenaTransitionProfiler } from './arena-transition-profile';

describe('ArenaTransitionProfiler', () => {
  it('records ordered non-overlapping phases and an exact total', () => {
    const profiler = new ArenaTransitionProfiler();
    profiler.begin(4, 'atomic-acres', 100, 'shared-gameplay-assets');
    profiler.enter('arena-construction', 125.25);
    profiler.enter('coverage-submit-fence', 170.5);
    const receipt = profiler.finish(230.75, 'committed');
    expect(receipt).toMatchObject({
      generation: 4,
      arenaId: 'atomic-acres',
      durationMs: 130.75,
      outcome: 'committed',
    });
    expect(receipt?.phases.map(({ phase, durationMs }) => [phase, durationMs])).toEqual([
      ['shared-gameplay-assets', 25.25],
      ['arena-construction', 45.25],
      ['coverage-submit-fence', 60.25],
    ]);
  });

  it('exposes an active sample without mutating the eventual receipt', () => {
    const profiler = new ArenaTransitionProfiler();
    profiler.begin(1, 'skyline-terminal', 10, 'previous-webgpu-fence');
    expect(profiler.snapshot(18)).toMatchObject({ outcome: 'active', durationMs: 8 });
    const receipt = profiler.finish(24, 'failed');
    expect(receipt?.phases).toHaveLength(1);
    expect(profiler.snapshot(100)).toBe(receipt);
  });
});
