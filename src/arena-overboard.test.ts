import { describe, expect, it } from 'vitest';
import { shouldEliminateArenaOverboard } from './arena-overboard';

describe('arena overboard authority', () => {
  it('eliminates High Seas ocean contact without changing retained water arenas', () => {
    expect(shouldEliminateArenaOverboard('high-seas', { inWater: true })).toBe(true);
    expect(shouldEliminateArenaOverboard('high-seas', { inWater: false })).toBe(false);
    expect(shouldEliminateArenaOverboard('farcrysis', { inWater: true })).toBe(false);
    expect(shouldEliminateArenaOverboard('rustworks-1v1', { inWater: true })).toBe(false);
  });
});
