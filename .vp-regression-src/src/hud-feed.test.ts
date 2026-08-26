import { describe, expect, it } from 'vitest';
import { DAMAGE_FEED_LIMIT, DAMAGE_FEED_VISIBLE_MS, accessibleFeedLabel, feedDestination } from './hud-feed';

describe('separate bounded damage feeds', () => {
  it('routes done and taken deltas to distinct labelled regions', () => {
    expect(feedDestination({ damageDealt: 31 })).toBe('damage-done');
    expect(feedDestination({ damageTaken: 14 })).toBe('damage-taken');
    expect(feedDestination()).toBe('events');
    expect(accessibleFeedLabel('damage-done', '+31')).toBe('Damage done: +31');
    expect(accessibleFeedLabel('damage-taken', '+14')).toBe('Damage taken: +14');
  });

  it('keeps the enlarged history bounded and readable longer', () => {
    expect(DAMAGE_FEED_LIMIT).toBe(8);
    expect(DAMAGE_FEED_VISIBLE_MS).toBeGreaterThanOrEqual(6_500);
    expect(DAMAGE_FEED_VISIBLE_MS).toBeLessThanOrEqual(8_000);
  });
});