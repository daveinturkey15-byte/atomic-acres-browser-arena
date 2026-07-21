/** In-game release notes shown from the main-menu "Last updated" control. */

export type ChangelogEntry = Readonly<{
  id: string;
  pass: string;
  title: string;
  updatedAt: string; // ISO timestamp with offset: YYYY-MM-DDTHH:mm:ss±HH:mm
  summary: string;
  highlights: readonly string[];
}>;

/**
 * Newest first. Keep this short and player-facing — not an internal commit log.
 * Update when promoting a player-visible build.
 */
export const CHANGELOG: readonly ChangelogEntry[] = Object.freeze([
  Object.freeze({
    id: 'pass51',
    pass: 'PASS 51',
    title: 'Rustworks cleanup & horizon ocean',
    updatedAt: '2026-07-21T18:20:38+01:00',
    summary: 'Cleaner tower, collision-backed shipping cover, and ocean to the horizon.',
    highlights: Object.freeze([
      'Removed floating light fixtures and disconnected crane/cable pieces',
      'Simplified the tower middle and crown without changing climb routes',
      'Added four shipping containers and pallet stacks with full collision',
      'Extended the animated sea into a far-ocean horizon ring',
    ]),
  }),
  Object.freeze({
    id: 'pass50',
    pass: 'PASS 50',
    title: 'Last Updated menu',
    updatedAt: '2026-07-21T18:00:01+01:00',
    summary: 'Main-menu release notes now show what changed on the live build.',
    highlights: Object.freeze([
      'Top-right Last Updated button opens recent player-facing changes',
    ]),
  }),
  Object.freeze({
    id: 'pass49',
    pass: 'PASS 49',
    title: 'Headshot damage contract',
    updatedAt: '2026-07-21T17:41:26+01:00',
    summary: 'Bullet headshots are true 1.5× body damage — not free instakills.',
    highlights: Object.freeze([
      'SMG body 23 · head 35 (needs 3 heads from full HP)',
      'Combat hits use shared hit-boxes only (fairer head/body)',
      'Damage feed shows HEADSHOT · XX DMG (and OD×4 if Overdrive finishes)',
      'Sniper head and close scattergun remain the intentional one-shots',
    ]),
  }),
  Object.freeze({
    id: 'pass48',
    pass: 'PASS 48',
    title: 'Scores & Gun Range board',
    updatedAt: '2026-07-21T17:37:30+01:00',
    summary: 'Global streaks unlock past 100; Gun Range gets its own leaderboard.',
    highlights: Object.freeze([
      'Global leaderboard ceiling raised to 9,999 kills/streak',
      'Gun Range: 2-minute rounds, score · hits · accuracy board',
      'No grenades on the range — pure gun score attack',
    ]),
  }),
  Object.freeze({
    id: 'pass47',
    pass: 'PASS 47',
    title: 'Rustworks night oil rig',
    updatedAt: '2026-07-21T17:29:37+01:00',
    summary: 'Raised rig at night — cleaner lanes, deeper sea, floods + stars.',
    highlights: Object.freeze([
      'Sparse cover and open pathing (less collider mess)',
      'Ocean lower under the deck with bigger rolling waves',
      'Night sky, starfield, and flood lighting (no pitch-black pockets)',
    ]),
  }),
  Object.freeze({
    id: 'pass45',
    pass: 'PASS 45',
    title: 'Rustworks flow + ocean',
    updatedAt: '2026-07-21T17:13:32+01:00',
    summary: 'Earlier Rustworks water/flow pass (superseded visually by Pass 47).',
    highlights: Object.freeze([
      'Flow lanes and ocean foundation for the industrial map',
    ]),
  }),
  Object.freeze({
    id: 'pass44',
    pass: 'PASS 44',
    title: 'Rustworks Quality plant',
    updatedAt: '2026-07-21T16:45:10+01:00',
    summary: 'Sol-depth Blender industrial plant for Quality Graphics.',
    highlights: Object.freeze([
      'High-detail central plant asset for Quality mode',
    ]),
  }),
]);

export function latestChangelogEntry(entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry {
  return entries[0] ?? {
    id: 'none',
    pass: 'BUILD',
    title: 'Atomic Acres',
    updatedAt: '2026-07-21T18:00:01+01:00',
    summary: 'No changelog entries yet.',
    highlights: Object.freeze([] as string[]),
  };
}

export function formatChangelogTimestamp(isoTimestamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.exec(isoTimestamp);
  if (!match) return isoTimestamp;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[Number(match[2]) - 1] ?? match[2];
  return `${Number(match[3])} ${month} ${match[1]} · ${match[4]}:${match[5]}`;
}

export function lastUpdatedButtonLabel(entry: ChangelogEntry = latestChangelogEntry()): string {
  return `LAST UPDATED · ${formatChangelogTimestamp(entry.updatedAt)}`;
}
