/** In-game release notes shown from the main-menu "Last release" control. */

export type ChangelogEntry = Readonly<{
  id: string;
  pass: string;
  title: string;
  releasedAt: string; // Protected production-build timestamp, with UTC offset, or the pending sentinel.
  areas: readonly string[];
  summary: string;
  highlights: readonly string[];
}>;

export const PENDING_PRODUCTION_RELEASE = 'PENDING_PRODUCTION';

/**
 * A new top entry may use PENDING_PRODUCTION in source. The protected release
 * workflow injects one immutable build timestamp into the production bundle,
 * avoiding a second metadata PR and a second deployment of identical gameplay.
 * The next substantive pass freezes the previous receipt timestamp in source.
 */
export function resolveProductionReleasedAt(
  sourceReleasedAt: string,
  injectedReleasedAt = import.meta.env.VITE_RELEASED_AT?.trim(),
): string {
  if (sourceReleasedAt !== PENDING_PRODUCTION_RELEASE) return sourceReleasedAt;
  if (!injectedReleasedAt) return sourceReleasedAt;
  if (Number.isNaN(Date.parse(injectedReleasedAt))) {
    throw new Error(`Invalid VITE_RELEASED_AT: ${injectedReleasedAt}`);
  }
  return injectedReleasedAt;
}

/**
 * Newest first. Keep this player-facing rather than turning it into an internal
 * commit log. Historical `releasedAt` values come from protected production
 * receipts, not implementation or review-build time. A new top entry can use
 * the pending sentinel until the production workflow injects its build time.
 */
export const CHANGELOG: readonly ChangelogEntry[] = Object.freeze([
  Object.freeze({
    id: 'pass60',
    pass: 'PASS 60',
    title: 'Fast-feedback combat, HUD & diagnostics pass',
    releasedAt: PENDING_PRODUCTION_RELEASE,
    areas: Object.freeze(['COMBAT', 'HUD', 'DIAGNOSTICS', 'MAPS', 'GUN RANGE']),
    summary: 'The first Pass 60 feedback slice prioritises player-visible combat and interface fixes, actionable post-match reports, and targeted arena repairs while preserving Pass 59 as the exact stable fallback.',
    highlights: Object.freeze([
      'Sniper headshots deal 3x damage and scoped players retain the full HUD and match status',
      'Damage activity sits lower without duplicate hit notifications, while Field Support is 25% larger in the same compact format',
      'Every completed match exposes a human per-player scoreboard and timestamped damage timeline plus a separate large agent-readable diagnostics ledger',
      'Both upstairs house windows now break; Quality and Performance share collision for all substantial Atomic Acres terrain and authored props',
      'Gun Range is a bot-free six-player FFA with real wallbang player damage, plus a 100 HP flying black cat worth 500 points that respawns after 30 seconds',
    ]),
  }),
  Object.freeze({
    id: 'pass59',
    pass: 'PASS 59',
    title: 'Fairer private matches, safer spawns & arena repairs',
    releasedAt: '2026-07-23T11:17:26+01:00',
    areas: Object.freeze(['MULTIPLAYER', 'HOSTED BOTS', 'MAPS', 'HUD', 'DIAGNOSTICS']),
    summary: 'Private matches gain host-owned bots and tighter combat authority, while all four arenas receive safer spawns, targeted collision and layout repairs, and clearer combat feedback.',
    highlights: Object.freeze([
      'Hosts can add exactly two or four authoritative bots whose movement, combat, health, score, deaths, and restarts stay synchronized for guests',
      'Quad Damage, grenades, support effects, damage, kill credit, and gun-only streak progress now follow explicit replicated authority and provenance rules',
      'Bounded timestamp and sequence admission improves host-versus-guest fairness while rejecting stale, future, duplicate, and excessive-gap combat events',
      'Atomic Acres, Rustworks, and Skyline Terminal receive targeted collision, floating-prop, doorway, cover, and central-layout repairs without changing profile gameplay semantics',
      'Map-aware spawn scoring, corrected LMG sights, separate damage feeds, a single-column support HUD, and private post-match diagnostic downloads improve play and troubleshooting',
    ]),
  }),
  Object.freeze({
    id: 'pass58',
    pass: 'PASS 58',
    title: 'Three arena overhauls & combat polish',
    releasedAt: '2026-07-22T21:25:35+01:00',
    areas: Object.freeze(['COMBAT', 'ATOMIC ACRES', 'SKYLINE', 'RUSTWORKS', 'LEADERBOARD']),
    summary: 'Combat feels clearer and more physical, three arenas receive major authored overhauls, and the global streak board starts a clean season.',
    highlights: Object.freeze([
      'Weapon and operator presentation now stays coherent through standing, crouching, prone movement, knife use, death, and respawn',
      'Damage feedback, headshot callouts, round statistics, collision authority, and score-reset handling are clearer and more reliable',
      'Atomic Acres gains a rebuilt model home, furnished interiors, denser garden life, richer materials, grass, and tuned lighting',
      'Skyline Terminal gains a more readable concourse, active aircraft cabin route, improved doors and aisles, apron detail, cover, and airport identity',
      'Rustworks gains a 15.8-metre derrick, two-axis undercroft, four-exit service trench, and 16-container cargo ring with four walk-through routes',
      'The global leaderboard now uses the new season-aware Worker and a clean reset board while retaining browser-local fallback records',
    ]),
  }),
  Object.freeze({
    id: 'pass57',
    pass: 'PASS 57',
    title: 'Rustworks rolling ocean & symmetric cargo ring',
    releasedAt: '2026-07-22T15:43:16+01:00',
    areas: Object.freeze(['RUSTWORKS', 'WATER', 'FLOW', 'VISUALS']),
    summary: 'Rustworks now has a lower, broader rolling ocean, a tidy central rig, and evenly distributed shipping cover around every side.',
    highlights: Object.freeze([
      'Five warped swell bands create larger pseudo-random wave patterns with matched visual height, buoyancy, and vertical water velocity',
      'The sea sits lower beneath the platform, reaches a wider horizon, and uses improved crest foam, normals, Fresnel, and specular lighting',
      'Six evenly spaced shipping containers line each of the north, south, east, and west sides',
      'Loose tanks, pallets, barriers, and other central clutter were removed from both Performance and Quality layouts',
      'Quality geometry was rebuilt and the lower and upper ramps now align cleanly with their walkable collision',
    ]),
  }),
  Object.freeze({
    id: 'pass56',
    pass: 'PASS 56',
    title: 'Operator rigs, weapon finishes & HUD spacing',
    releasedAt: '2026-07-22T15:06:07+01:00',
    areas: Object.freeze(['OPERATORS', 'WEAPONS', 'HUD']),
    summary: 'Operators hold their weapons cleanly through every stance, all seven guns have distinct authored finishes, and the combat HUD has more breathing room.',
    highlights: Object.freeze([
      'Standing, sprinting, crouched, and prone operators keep a forward-facing weapon with both hands connected',
      'Duplicate embedded weapons are suppressed and crouched feet stay planted instead of folding through the floor',
      'Carbine, SMG, scattergun, sniper, pistol, machine pistol, and LMG each use a distinct authored material finish',
      'Weapon, equipment, and match HUD groups have cleaner spacing without hiding combat information',
    ]),
  }),
  Object.freeze({
    id: 'pass55',
    pass: 'PASS 55',
    title: 'Multiplayer combat, wall penetration & indoor range',
    releasedAt: '2026-07-22T13:14:45+01:00',
    areas: Object.freeze(['MULTIPLAYER', 'COMBAT', 'GUN RANGE', 'SKYLINE']),
    summary: 'The reconciled combat release improves private matches, adds material-aware penetration, polishes Skyline, and turns Gun Range into a full indoor armory.',
    highlights: Object.freeze([
      'Host-selected maps, lobby state, respawns, and combat telemetry stay synchronized through private matches',
      'Bullets can penetrate supported thin surfaces with weapon, material, angle, and distance-aware damage loss',
      'Skyline Terminal gains refined routes, authored detail, lighting, collision, and multiplayer navigation',
      'Gun Range is now an indoor score-attack space with walk-up weapon pickups and the Mastiff 63 LMG',
      'Focus loss no longer pauses an active solo or multiplayer match or replaces play with the menu',
    ]),
  }),
  Object.freeze({
    id: 'pass53',
    pass: 'PASS 53',
    title: 'Skyline Terminal, repeatable streaks & lobby copy',
    releasedAt: '2026-07-22T09:27:28+01:00',
    areas: Object.freeze(['MAP', 'STREAKS', 'MULTIPLAYER']),
    summary: 'A fourth airport arena joins the rotation, high-tier streaks recycle during long lives, and lobby codes copy reliably.',
    highlights: Object.freeze([
      'Skyline Terminal is selectable for bot skirmishes and private matches',
      'Terminal, mezzanine, escalator, jetbridge, jetliner, and airstair routes use real collision and multilevel bot navigation',
      'Hunter Swarm returns at 8, 16, 24… kills without dying',
      'Nuke returns at 15, 30, 45… kills without dying',
      'Copy Code writes the actual 36-character lobby code and falls back on browsers that block the modern Clipboard API',
      'Multiplayer lifecycle, verification, and cross-platform asset checks include the reconciled Desky backlog',
    ]),
  }),
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
