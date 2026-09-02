import { MATCH_DURATION_MS, type MatchRules } from './gameplay';
import { MAX_SOLO_BOTS, SOLO_BOT_COUNT, soloBotTargetForDeaths } from './bot-ai';
import { GUN_RANGE_ROUND_MS } from './gun-range-rules';
import type { ArenaId } from './arena-identity';

export { ARENA_IDS, isArenaId, type ArenaId } from './arena-identity';

export type ArenaRouteId = 'nuke-town' | 'terminal' | 'rustrig' | 'gun-range' | 'farcrysis' | 'high-seas' | 'test1' | 'test2' | 'map3';

export type ArenaSelection = Readonly<{
  id: ArenaId;
  routeId: ArenaRouteId;
  legacyAliases: readonly string[];
  selectorLabel: string;
  displayName: string;
  titleLead: string;
  titleAccent: string;
  menuLede: string;
  summary: string;
  rulesLabel: string;
  soloBotCount: number;
  maximumSoloBots: number;
  multiplayer: boolean;
  fieldSupport: boolean;
  overdrive: boolean;
  matchRules: MatchRules;
  /**
   * WHERE THIS MAP'S GEOMETRY COMES FROM. Owner question 2026-08-31: "are these
   * just made by you generating code, or did you have to make blender assets
   * and import etc ... ensure its listed against the map".
   *
   * - `'code'`   every wall, floor and prop in the playable space is built by
   *              TypeScript at runtime. No mesh file is downloaded for the map.
   * - `'import'` the playable space is an authored mesh file loaded at runtime.
   *
   * This describes the ARENA ONLY. Weapons, operators, grenades and killstreak
   * vehicles are authored `.glb` on every map without exception, so naming them
   * here would make every row read the same and tell the reader nothing.
   */
  authoring: 'code' | 'import';
  /** One line for the menu card, naming the asset when there is one. */
  authoringNote: string;
  /**
   * Marks an arena as unfinished on the card itself. Owner 2026-08-31: "have
   * Farycrsis labelled as 'prototype' whereas the otheres are now". A player
   * who picks it should know before they load it, not after.
   */
  prototype?: boolean;
  /**
   * Whether the arena is offered in the menu. Absent means yes.
   *
   * This is deliberately NOT the same thing as existing. A hidden arena keeps its stable
   * id, so old room links, saved loadouts, replays and network payloads naming it still
   * decode - the id is the network and storage boundary and must never move for a
   * presentation decision.
   */
  selectable?: boolean;
}>;

/**
 * The one player-facing arena registry. Stable IDs remain the network,
 * replay, storage and asset boundary; route IDs and labels may evolve.
 */
export const ARENA_SELECTIONS: readonly ArenaSelection[] = Object.freeze([
  Object.freeze({
    id: 'atomic-acres' as const,
    routeId: 'nuke-town' as const,
    legacyAliases: Object.freeze(['nuketown']),
    selectorLabel: 'NUKE TOWN',
    displayName: 'Nuke Town',
    titleLead: 'NUKE',
    titleAccent: 'TOWN',
    menuLede: 'Fight through an authored living neighbourhood with physical transit cover, tactical viewmodels, atmospheric dust and a contested 2× Damage Core.',
    summary: 'Authored neighbourhood team arena',
    rulesLabel: '5 MIN · 1 BOT · +1 / 10 DEFEATS · MAX 6',
    soloBotCount: SOLO_BOT_COUNT,
    maximumSoloBots: MAX_SOLO_BOTS,
    multiplayer: true,
    fieldSupport: true,
    overdrive: true,
    authoring: 'import' as const,
    authoringNote: 'IMPORTED ASSETS',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'skyline-terminal' as const,
    routeId: 'terminal' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'TERMINAL',
    displayName: 'Terminal',
    titleLead: 'TERMINAL',
    titleAccent: '',
    menuLede: 'Fight through an original airport concourse and jetliner apron with security chokes, a narrow gangway, and open tarmac sightlines.',
    summary: 'Airport terminal & jetliner apron · private lobbies up to 6',
    rulesLabel: '5 MIN · HOST UP TO 6 · 1 BOT SOLO',
    soloBotCount: SOLO_BOT_COUNT,
    maximumSoloBots: MAX_SOLO_BOTS,
    multiplayer: true,
    fieldSupport: true,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'rustworks-1v1' as const,
    routeId: 'rustrig' as const,
    legacyAliases: Object.freeze(['rustworks', 'rust-rig']),
    selectorLabel: 'RUSTRIG',
    displayName: 'RustRig',
    titleLead: 'RustRig',
    titleAccent: '',
    menuLede: 'Host private industrial tower matches for up to six, or solo a single bot through the climbable central plant and yard cover.',
    summary: 'Industrial tower · private lobbies up to 6 · one-bot solo',
    rulesLabel: '5 MIN · HOST UP TO 6 · 1 BOT SOLO',
    soloBotCount: 1,
    maximumSoloBots: 1,
    multiplayer: true,
    fieldSupport: true,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'gun-range' as const,
    routeId: 'gun-range' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'GUN RANGE',
    displayName: 'Gun Range',
    titleLead: 'GUN',
    titleAccent: 'RANGE',
    menuLede: 'Explore the indoor armory, pick a weapon from a bench, then work the 100 / 200 / 300 point lanes.',
    summary: 'Solo or 6-player FFA · live fire, wallbang testing, score and accuracy',
    rulesLabel: '2 MIN · 6P FFA · NO BOTS',
    soloBotCount: 0,
    maximumSoloBots: 0,
    multiplayer: true,
    // Support rewards are not earned in the range, but the secure test bay
    // grants one host-authoritative training activation at a time.
    fieldSupport: true,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: GUN_RANGE_ROUND_MS, scoreLimit: null }),
  }),
  // HF-359 (Pass 74): revived Pass 69 hidden-lane arena (branch
  // contrib/dave-gaming-pc/hermes/pass69-hidden-farcrysis @ 83395da4).
  // Display position: fifth, after Gun Range. Stable id 'farcrysis' is the
  // network/storage boundary; owner codename aliases decode at this boundary
  // only and are never emitted as current UI text.
  Object.freeze({
    id: 'farcrysis' as const,
    routeId: 'farcrysis' as const,
    // HIDDEN 2026-08-28, owner request: "remove farcrysis for now its not ready".
    // Measured against the LIVE build through the real player path the same day: the only
    // arena of six that never reaches an active match - 279 s, then the tab crashes. The
    // other five reach playable in 49-69 s. Restore by deleting this one line once the
    // farcrysis lanes land and verify-player-path-cdp.mjs passes it.
    selectable: false,
    legacyAliases: Object.freeze(['f4rcry515', 'farcry', 'f4rcry']),
    prototype: true,
    selectorLabel: 'FARCrySIS',
    displayName: 'Farcrysis',
    titleLead: 'FARCry',
    titleAccent: 'SIS',
    menuLede: 'Fight through a flooded jungle research station — an original beach-and-jungle homage with dense collision cover, a ruined core, and golden-hour beach light.',
    summary: 'Jungle island research station · dense cover · golden-hour beach',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
    soloBotCount: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: false,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'high-seas' as const,
    routeId: 'high-seas' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'HIGH SEAS',
    displayName: 'High Seas',
    titleLead: 'HIGH',
    titleAccent: 'SEAS',
    menuLede: 'Board an original superyacht arena where layered decks, compact interiors, and exposed bow-to-stern lanes reward constant movement.',
    summary: 'Original superyacht · layered decks · close-quarters lanes',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
    soloBotCount: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: true,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'test1' as const,
    routeId: 'test1' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'FIRING RANGE',
    displayName: 'Firing Range',
    titleLead: 'FIRING',
    titleAccent: 'RANGE',
    menuLede: 'Fight across a sun-bleached range training ground — sandbag firing lanes, a two-storey range tower, and a container-yard flank.',
    summary: 'Range training ground · tower · container yard',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
    soloBotCount: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: true,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'test2' as const,
    routeId: 'test2' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'RAID',
    displayName: 'Raid',
    titleLead: 'RAID',
    titleAccent: '',
    menuLede: 'Storm a hillside mansion — pool deck, sunken court and garden terraces, with three-zone Domination as the headline mode.',
    summary: 'Hillside mansion · three lanes · Domination',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
    soloBotCount: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: true,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  // MAP3 (owner 2026-09-02, HF-405 then HF-409): Map 3 is the corridor
  // SHOWCASE, and it is an EXPLORE mode, not a match.
  //
  // The owner settled both halves in one afternoon. At 16:25: "it was full of
  // rich code based asset tests and now its just a square map of stone?" - so
  // the card that was withdrawn earlier today comes back, and what it launches
  // is now the real showcase corridors (`src/map3-arena.ts`), not the authored
  // stone gallery it launched this morning. At 16:55: "Just keep the showcase
  // in and it's not about combat, it's a mode you can explore."
  //
  // Which is why every combat field below is ZERO rather than small. Bots,
  // field support and overdrive are not scaled down for a preview - they are
  // absent, because the content IS the mode. `multiplayer: false` stays for
  // the same reason it was set: this arena has never had a two-client lane run
  // against it, and the id is already the network and storage boundary, so
  // promoting it later is one field.
  Object.freeze({
    id: 'map3' as const,
    routeId: 'map3' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'MAP 3 · PREVIEW',
    displayName: 'Map 3',
    titleLead: 'MAP',
    titleAccent: '3',
    menuLede: 'Walk the showcase: a paved hub with seven corridors running off it — a Gerstner shoreline with a pier and a fording rover, a raymarched SDF gallery, a shape-grammar skyline, a forest that bends as you pass, four seasons under a downpour, a colonnade cut by god rays, and an overlook onto a colosseum. No bots, no timer pressure: explore.',
    summary: 'Corridor showcase · explore · no bots',
    rulesLabel: 'EXPLORE PREVIEW · NO BOTS',
    soloBotCount: 0,
    maximumSoloBots: 0,
    multiplayer: false,
    fieldSupport: false,
    overdrive: false,
    // THE CARD IS STILL WITHDRAWN, AND EXACTLY ONE THING IS IN THE WAY.
    //
    // The arena itself is finished and green: the showcase corridors are in
    // it, 209 colliders and shot surfaces authored from the corridors' own
    // solids, zero invisible colliders, zero unrated ghosts, and an authored
    // spawn ring every one of whose ten points the spawn-quality measure
    // passes (36.8 m spread, 4.6 m to cover, 36.8 m cross-team).
    //
    // What is not green is ONE meta-assertion in a gate this lane does not
    // own: `src/spawn-layout-quality.test.ts` asserts that every SELECTABLE
    // arena either runs team modes or is the free-for-all Gun Range. Map 3 is
    // the first arena with no hosted lobby AND no bots, so there is no second
    // team for its spawns to be separated FROM and the assertion's premise no
    // longer holds. Flipping this field without that gate change would land a
    // RED gate on the integration branch, which is worse than a hidden arena.
    //
    // The exact patch (a 16-line branch in that one test, pinned to the
    // registry so an arena that gains a lobby or a single bot re-enters the
    // rule) is in the lane report, and was measured green: 102/102. Landing it
    // plus flipping this one field to `true` is the whole remaining step.
    selectable: false,
    // HF-405: Map 3 is entirely procedural (no imported mesh, image, font or LUT).
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
]);

/**
 * The arenas the menu offers. Every other consumer - audio, spawn safety, replay,
 * the compatibility decoder below - keeps using ARENA_SELECTIONS, because a hidden
 * arena is still a real arena that a saved match or an old link can name.
 */
export const SELECTABLE_ARENAS: readonly ArenaSelection[] = Object.freeze(
  ARENA_SELECTIONS.filter((entry) => entry.selectable !== false),
);

const ARENA_COMPATIBILITY_DECODER = new Map<string, ArenaId>(ARENA_SELECTIONS.flatMap((entry) => [
  [entry.id, entry.id] as const,
  [entry.routeId, entry.id] as const,
  ...entry.legacyAliases.map((alias) => [alias, entry.id] as const),
]));

export function decodeArenaId(value: string | null | undefined): ArenaId {
  const normalized = value?.trim().toLowerCase();
  return (normalized && ARENA_COMPATIBILITY_DECODER.get(normalized)) || ARENA_SELECTIONS[0]!.id;
}

export function arenaSelection(id: string | null | undefined): ArenaSelection {
  const decoded = decodeArenaId(id);
  return ARENA_SELECTIONS.find((entry) => entry.id === decoded) ?? ARENA_SELECTIONS[0]!;
}

/** The menu copy and every hosted authority path share this one round clock. */
export function hostedArenaDurationMs(selection: ArenaSelection): number {
  return selection.matchRules.durationMs ?? MATCH_DURATION_MS;
}

export function arenaCanvasLabel(selection: ArenaSelection): string {
  return `${selection.displayName} multiplayer arena`;
}

export function activeSoloBotTarget(selection: ArenaSelection, cumulativeDeaths: number): number {
  if (selection.id !== 'atomic-acres') return selection.soloBotCount;
  return Math.min(selection.maximumSoloBots, soloBotTargetForDeaths(cumulativeDeaths));
}

export function soloLaunchLabel(selection: ArenaSelection): string {
  // MAP3 (HF-409): "START RANGE" was the right words while the only bot-less
  // arena was the Gun Range, and it is the wrong words for the second one.
  // Map 3 is an explore mode, not a firing range, so the label follows what
  // the arena IS rather than what the first bot-less arena happened to be.
  if (selection.soloBotCount === 0) return selection.id === 'gun-range' ? 'START RANGE' : 'START EXPLORING';
  return `${selection.soloBotCount} BOT${selection.soloBotCount === 1 ? '' : 'S'} SKIRMISH`;
}
