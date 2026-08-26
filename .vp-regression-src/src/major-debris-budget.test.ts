import { describe, expect, it } from 'vitest';
import {
  MAX_MAJOR_DEBRIS_BODIES,
  SHARED_MAJOR_DEBRIS_BUDGET,
  canAdmitMajorDebris,
  validMajorDebrisCounts,
} from './major-debris-budget';

describe('shared major-debris admission budget', () => {
  it('freezes deterministic shed/house/window partitions at the Rapier cap', () => {
    expect(SHARED_MAJOR_DEBRIS_BUDGET).toEqual({
      total: 18,
      shed: 12,
      house: 4,
      window: 2,
      policy: 'reject-newest-no-eviction',
      order: ['shed', 'house', 'window'],
    });
    expect(SHARED_MAJOR_DEBRIS_BUDGET.shed
      + SHARED_MAJOR_DEBRIS_BUDGET.house
      + SHARED_MAJOR_DEBRIS_BUDGET.window).toBe(MAX_MAJOR_DEBRIS_BODIES);
  });

  it('rejects the newest source without evicting admitted bodies', () => {
    expect(canAdmitMajorDebris({ shed: 11, house: 4, window: 2 }, 'shed')).toBe(true);
    expect(canAdmitMajorDebris({ shed: 12, house: 3, window: 2 }, 'shed')).toBe(false);
    expect(canAdmitMajorDebris({ shed: 12, house: 4, window: 1 }, 'window')).toBe(true);
    expect(canAdmitMajorDebris({ shed: 12, house: 4, window: 2 }, 'window')).toBe(false);
    expect(validMajorDebrisCounts({ shed: 12, house: 4, window: 3 })).toBe(false);
    expect(canAdmitMajorDebris({ shed: 13, house: 0, window: 0 }, 'house')).toBe(false);
  });
});
