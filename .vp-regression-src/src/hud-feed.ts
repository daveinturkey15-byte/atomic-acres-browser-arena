export type DamageFeedDetails = Readonly<{ damageDealt?: number; damageTaken?: number }>;
export type FeedDestination = 'events' | 'damage-done' | 'damage-taken';

export const EVENT_FEED_LIMIT = 6;
export const DAMAGE_FEED_LIMIT = 8;
export const DAMAGE_FEED_VISIBLE_MS = 7_000;

export function feedDestination(details?: DamageFeedDetails): FeedDestination {
  if (details?.damageDealt !== undefined && details.damageTaken === undefined) return 'damage-done';
  if (details?.damageTaken !== undefined && details.damageDealt === undefined) return 'damage-taken';
  return 'events';
}

export function accessibleFeedLabel(destination: FeedDestination, text: string): string {
  if (destination === 'damage-done') return `Damage done: ${text}`;
  if (destination === 'damage-taken') return `Damage taken: ${text}`;
  return text;
}