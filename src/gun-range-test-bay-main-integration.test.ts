import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Gun Range test-bay match timer integration', () => {
  it('freezes continuously while inside instead of only resetting on entry', () => {
    const start = source.indexOf('function updateHud(now: number): void {');
    const end = source.indexOf('\n  const spec = WEAPONS[player.weapon];', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('if (inBay && gunRangeTestBayPlayerWasInside) {');
    expect(block).toContain('...gunRangeTestBayFrozenTimer(matchState, elapsedSinceLastHudMs)');
    expect(block).toContain('gunRangeTestBayPlayerWasInside = inBay;');
    expect(block).toContain('else gunRangeTestBayPlayerWasInside = false;');
    expect(block.indexOf('gunRangeTestBayFrozenTimer(matchState, elapsedSinceLastHudMs)'))
      .toBeLessThan(block.indexOf('updateMatchState(now)'));
  });
});
