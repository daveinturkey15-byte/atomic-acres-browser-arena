import { describe, expect, it } from 'vitest';
import { advanceRangeScore, hasUnlimitedRangeAmmo, reloadSupply, reserveAfterCompletedReload, reserveHudValue } from './gun-range-rules';

describe('Gun Range practice rules', () => {
  it('provides virtual reload supply without placing Infinity in player state', () => {
    expect(hasUnlimitedRangeAmmo('gun-range')).toBe(true);
    expect(reloadSupply('gun-range', 0, 30)).toBe(30);
    expect(reserveAfterCompletedReload('gun-range', 0, 0)).toBe(0);
    expect(reserveHudValue('gun-range', 0)).toBe('∞');
  });

  it('leaves finite ammunition semantics unchanged outside the range', () => {
    expect(hasUnlimitedRangeAmmo('atomic-acres')).toBe(false);
    expect(reloadSupply('atomic-acres', 7, 30)).toBe(7);
    expect(reserveAfterCompletedReload('atomic-acres', 7, 2)).toBe(2);
    expect(reserveHudValue('atomic-acres', 7)).toBe('7');
  });

  it('keeps awarding each destroyed target with no gameplay score cap', () => {
    let score = 0;
    for (let destruction = 0; destruction < 10_000; destruction += 1) score = advanceRangeScore(score, 300);
    expect(score).toBe(3_000_000);
    expect(advanceRangeScore(score, 100)).toBe(3_000_100);
  });
});
