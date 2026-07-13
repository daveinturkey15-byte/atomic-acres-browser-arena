import { describe, expect, it } from 'vitest';
import { advanceMatch, createMatch } from './gameplay';
import { formatMatchClock, matchPresentationAt, respawnPresentation } from './match-presentation';

describe('match presentation', () => {
  it('formats bounded clocks and warmup countdowns', () => {
    expect(formatMatchClock(299_999)).toBe('04:59');
    expect(formatMatchClock(-5)).toBe('00:00');
    expect(matchPresentationAt(createMatch(1_000), 2_100, [0, 0], 0).headline).toBe('2');
  });

  it('states score and time endings without changing match authority', () => {
    const active = advanceMatch(createMatch(0), 3_001, [0, 0]);
    const scoreEnd = advanceMatch(active, 4_000, [25, 12]);
    expect(scoreEnd.endReason).toBe('score');
    expect(matchPresentationAt(scoreEnd, 4_000, [25, 12], 0).headline).toBe('VICTORY');
    const timeEnd = advanceMatch(active, active.endsAt, [4, 4]);
    expect(timeEnd.endReason).toBe('time');
    expect(matchPresentationAt(timeEnd, active.endsAt, [4, 4], 1).headline).toBe('DRAW');
  });

  it('reports a deterministic respawn countdown', () => {
    expect(respawnPresentation(4_000, 2_750)).toBe('REDEPLOYING IN 1.3s');
  });
});
