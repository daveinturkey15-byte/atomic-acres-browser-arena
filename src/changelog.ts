/** In-game release notes shown from the main-menu "Last release" control. */

export type ChangelogEntry = Readonly<{
  id: string;
  pass: string;
  title: string;
  releasedAt: string; // First successful public production promotion, with UTC offset.
  areas: readonly string[];
  summary: string;
  highlights: readonly string[];
}>;

/**
 * Newest first. Keep this player-facing rather than turning it into an internal
 * commit log. `releasedAt` is the first successful public production promotion,
 * not the earlier implementation or review-build time.
 */
export const CHANGELOG: readonly ChangelogEntry[] = Object.freeze([
  Object.freeze({
    id: 'pass52',
    pass: 'PASS 52',
    title: 'Private-match map sync & combat telemetry',
    releasedAt: '2026-07-21T19:47:24+01:00',
    areas: Object.freeze(['MULTIPLAYER', 'COMBAT']),
    summary: 'Private matches now carry the host-selected arena cleanly through lobby, start, respawn, and live diagnostics.',
    highlights: Object.freeze([
      'Host arena selection is synchronized to every guest before the match starts',
      'Map selection locks in the lobby; Ready and Start wait for map collision sync',
      'Respawns use the active map bounds, including wide and non-square arenas',
      'Team and free-for-all spawn choices keep safer separation from opponents',
      'Combat telemetry now reports kills, deaths, damage dealt, damage taken, and ping',
      'Release notes now distinguish the actual public release time from implementation time',
    ]),
  }),
  Object.freeze({
    id: 'pass51',
    pass: 'PASS 51',
    title: 'Rustworks cleanup & horizon ocean',
    releasedAt: '2026-07-21T19:17:57+01:00',
    areas: Object.freeze(['RUSTWORKS', 'MAP']),
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
    title: 'Release notes menu',
    releasedAt: '2026-07-21T18:00:21+01:00',
    areas: Object.freeze(['MENU', 'RELEASE NOTES']),
    summary: 'Main-menu release notes now show what changed on the live build.',
    highlights: Object.freeze([
      'Top-right Last Release button opens recent player-facing changes',
      'Every entry now records its first successful public production time',
    ]),
  }),
  Object.freeze({
    id: 'pass49',
    pass: 'PASS 49',
    title: 'Headshot damage contract',
    releasedAt: '2026-07-21T17:55:17+01:00',
    areas: Object.freeze(['COMBAT', 'DAMAGE']),
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
    releasedAt: '2026-07-21T17:37:44+01:00',
    areas: Object.freeze(['SCORES', 'GUN RANGE']),
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
    releasedAt: '2026-07-21T17:29:52+01:00',
    areas: Object.freeze(['RUSTWORKS', 'LIGHTING']),
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
    releasedAt: '2026-07-21T17:13:48+01:00',
    areas: Object.freeze(['RUSTWORKS', 'FLOW']),
    summary: 'Earlier Rustworks water/flow pass (superseded visually by Pass 47).',
    highlights: Object.freeze([
      'Flow lanes and ocean foundation for the industrial map',
    ]),
  }),
  Object.freeze({
    id: 'pass44',
    pass: 'PASS 44',
    title: 'Rustworks Quality plant',
    releasedAt: '2026-07-21T16:43:42+01:00',
    areas: Object.freeze(['RUSTWORKS', 'QUALITY']),
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
    releasedAt: '2026-07-21T19:47:24+01:00',
    areas: Object.freeze(['GAME']),
    summary: 'No changelog entries yet.',
    highlights: Object.freeze([] as string[]),
  };
}

type ParsedReleaseTimestamp = Readonly<{
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  offset: string;
}>;

function parseReleaseTimestamp(isoTimestamp: string): ParsedReleaseTimestamp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(isoTimestamp);
  if (!match) return null;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    second: match[6],
    offset: match[7],
  };
}

function releaseZoneLabel(offset: string): string {
  if (offset === '+01:00') return 'BST';
  if (offset === 'Z' || offset === '+00:00') return 'GMT';
  return `UTC${offset}`;
}

function compactOffsetLabel(offset: string): string {
  if (offset === 'Z' || offset === '+00:00') return 'UTC';
  const sign = offset.startsWith('-') ? '-' : '+';
  const [hours, minutes] = offset.slice(1).split(':');
  return minutes === '00' ? `UTC${sign}${Number(hours)}` : `UTC${sign}${Number(hours)}:${minutes}`;
}

export function formatChangelogTimestamp(isoTimestamp: string): string {
  const parsed = parseReleaseTimestamp(isoTimestamp);
  if (!parsed) return isoTimestamp;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[Number(parsed.month) - 1] ?? parsed.month;
  return `${Number(parsed.day)} ${month} ${parsed.year} · ${parsed.hour}:${parsed.minute} ${releaseZoneLabel(parsed.offset)}`;
}

export function formatChangelogTimestampDetail(isoTimestamp: string): string {
  const parsed = parseReleaseTimestamp(isoTimestamp);
  if (!parsed) return isoTimestamp;
  return `${formatChangelogTimestamp(isoTimestamp)} · ${compactOffsetLabel(parsed.offset)} · ${parsed.hour}:${parsed.minute}:${parsed.second}`;
}

export function lastUpdatedButtonLabel(entry: ChangelogEntry = latestChangelogEntry()): string {
  return `LAST RELEASE · ${formatChangelogTimestamp(entry.releasedAt)}`;
}
