import { MATCH_DURATION_MS, type MatchRules } from './gameplay';
import { MAX_SOLO_BOTS, SOLO_BOT_COUNT, soloBotTargetForDeaths } from './bot-ai';
import { GUN_RANGE_ROUND_MS } from './gun-range-rules';
import type { ArenaId } from './arena-identity';

export { ARENA_IDS, isArenaId, type ArenaId } from './arena-identity';

export type ArenaRouteId = 'nuke-town' | 'terminal' | 'rustrig' | 'gun-range' | 'farcrysis' | 'high-seas' | 'test1' | 'test2' | 'map3' | 'nuke-town-rebuild'
  // RAID2 (HF-408): a descriptive route, not `raid2`, so a shared link says
  // what it opens. `test2` keeps `test2`; nothing about the shipped Raid moves.
  | 'raid-rebuild';

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
  /**
   * WHAT KIND OF THING THIS ARENA IS. Owner 2026-09-02 16:55, on Map 3: "Just
   * keep the showcase in and it's not about combat, it's a mode you can
   * explore."
   *
   * - `'team'`    a match arena. Two sides, a clock, a score, and therefore
   *               spawn fronts that must be separated from an enemy front.
   * - `'explore'` there is no opposing side at all: no hosted lobby, no bots,
   *               no field support, no match clock. The content IS the mode.
   *
   * This is REQUIRED rather than optional on purpose. Several gates ask "does
   * this arena run team modes?" and used to answer it from an exemption list of
   * ids, which every new arena silently joined the wrong side of. Making the
   * kind a declared field means a new arena cannot be added without answering
   * the question, and `src/spawn-layout-quality.test.ts` asserts that an arena
   * declaring `'explore'` really has no lobby and no bots - so the kind cannot
   * be used to duck a gate while shipping combat.
   */
  kind: 'team' | 'explore';
  /**
   * A SECOND PAGE THIS ARENA HAS, relative to the document that links it.
   *
   * Map 3's corridors also ship as a standalone showcase page (`map3.html`, a
   * declared Vite build input) that flies a camera through them with no player
   * and no colliders. The game's own menu is the only place a player would ever
   * learn it exists, so the card links to it.
   *
   * RELATIVE, AND DELIBERATELY SO. The published site is not served from a
   * root: `scripts/release/stage-release-topology.mjs` moves index.html, the
   * assets directory and map3.html together into `channels/<pass>/`, and the
   * repository is a project Pages site under `/atomic-acres/` on top of that.
   * A leading-slash href would be `/map3.html` and 404 on every channel; the
   * value here is resolved against the game document's own URL, so it lands in
   * whichever channel the player is actually in. This is the same reason
   * `vite.config.ts` sets `base: './'`.
   *
   * Optional because most arenas have no second page, and absent means no link
   * is rendered at all - not an empty one.
   */
  showcasePath?: string;
  soloBotCount: number;
  /**
   * HOW MANY BOTS SOLO OPENS WITH, when that is not the Pass 66 default.
   *
   * HF-491 (owner, 2026-09-04, after playing Solo on the Nuke Town rebuild:
   * "the bots not in there"). Pass 66 routing fixes `soloBotCount` at one bot
   * on every bot-enabled arena, and that stays the declared default. This is
   * the per-arena opt-out for a map whose real shape wants a fuller lobby -
   * BO2's Nuke Town is a 6v6 map, and one opponent on an 84 m street reads as
   * an empty arena. Absent means "keep the Pass 66 default", so every arena
   * that does not declare it is unchanged by HF-491.
   *
   * Always read through `initialSoloBotCount`, never directly: the value is
   * clamped by this arena's own `maximumSoloBots` so a declaration can never
   * out-run the population the arena's spawn table and perf budget were sized
   * for.
   */
  initialSoloBots?: number;
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
  // HF-495 (owner, 2026-09-04): Nuke Town Rebuild is the first selectable
  // card, followed by the Raid Rebuild preview. Every other row retains its
  // relative order below these two moved previews.
  Object.freeze({
    id: 'nuketown2' as const,
    routeId: 'nuke-town-rebuild' as const,
    // NUKETOWN2 is a team arena like the shipped Nuke Town; only Map 3 is the explore kind.
    kind: 'team' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'NUKE TOWN REBUILD · PREVIEW',
    displayName: 'Nuke Town Rebuild',
    titleLead: 'NUKE TOWN',
    titleAccent: 'REBUILD',
    menuLede: 'Cross the road, not the corridor: two two-storey houses face each other over a 58 m street with a bus in the middle, garages onto the cul-de-sacs, and both teams spawning in their own back yard. Preview of the rebuilt Nuke Town.',
    summary: 'Rebuilt neighbourhood · back-yard spawns · preview',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO · PREVIEW',
    soloBotCount: SOLO_BOT_COUNT,
    // HF-533/HF-534 (owner overnight, 2026-09-05): Nuke Town fields exactly two
    // TOTAL bots in bot-enabled solo/host configurations. Two to open, pinned
    // by maximum === start through the existing clamp (the raid2 precedent),
    // so the ten-defeat ladder adds nothing here. Human capacity and every
    // non-Nuke arena are untouched. Supersedes HF-491's four-to-open on this row.
    initialSoloBots: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: true,
    overdrive: true,
    selectable: true,
    // HF-407: no Blender bake, no GLB, no imported mesh/image/font/LUT. This is
    // the whole point of the rejig - the shipped Nuke Town is the only
    // `authoring: 'import'` arena in the game.
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  // HF-495 (owner, 2026-09-04): the Raid Rebuild is the second selectable
  // card and keeps its explicit PREVIEW label.
  Object.freeze({
    id: 'raid2' as const,
    routeId: 'raid-rebuild' as const,
    // RAID2 is a team arena like the shipped Raid; only Map 3 is the explore kind.
    kind: 'team' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'RAID REBUILD · PREVIEW',
    displayName: 'Raid Rebuild',
    titleLead: 'RAID',
    titleAccent: 'REBUILD',
    menuLede: 'The hillside mansion rebuilt for its sightlines: three big rooms around an open-to-sky courtyard, the pool terrace holding one unbroken 52 m lane, and the wings joined to the house instead of fenced off it. Layout preview.',
    summary: 'Hillside mansion · layout rebuild · preview',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
    soloBotCount: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: true,
    overdrive: false,
    selectable: true,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'atomic-acres' as const,
    routeId: 'nuke-town' as const,
    kind: 'team' as const,
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
    // HF-466 (owner, 2026-09-04): park the original Nuketown from the menu.
    // The stable id remains registered for compatibility and build coverage;
    // only the player-facing selectable roster changes.
    selectable: false,
    authoring: 'import' as const,
    authoringNote: 'IMPORTED ASSETS',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'skyline-terminal' as const,
    routeId: 'terminal' as const,
    kind: 'team' as const,
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
    kind: 'team' as const,
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
    kind: 'team' as const,
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
  // Display position: seventh, after Gun Range. Stable id 'farcrysis' is the
  // network/storage boundary; owner codename aliases decode at this boundary
  // only and are never emitted as current UI text.
  Object.freeze({
    id: 'farcrysis' as const,
    routeId: 'farcrysis' as const,
    kind: 'team' as const,
    // HIDDEN 2026-08-28, owner request: "remove farcrysis for now its not ready".
    // Measured against the LIVE build through the real player path that day: the only
    // arena of six that never reached an active match - 279 s, then the tab crashed. The
    // other five reached playable in 49-69 s.
    //
    // UN-HIDDEN 2026-09-02 as a PREVIEW card (HF-423, owner: "get farcrysis sorted
    // overnight too"). What changed, all measured, none of it a relaxed threshold:
    //   - the load path (PASS 84 Lane C): every fenced WebGPU submission now completes
    //     and the arena transition COMMITS, where before it failed the first 12 s fence,
    //     rolled back, and poisoned the next arena's fence behind the same stuck
    //     submission. Cold admission MEASURED at the shipped bundle on a quiet machine,
    //     three paired runs against a same-window atomic-acres control
    //     (docs/evidence/pass87/lane-r/farcrysis-admission.json): farcrysis 30.5/34.4/31.1 s
    //     (mean 32.0), atomic-acres 25.2/26.8/24.9 s (mean 25.7), worst pair ratio 1.283
    //     over twelve pairs. Comparable to the shipped control, NOT inside the written
    //     12 s falsifier - no arena on this machine meets that - and stated as such.
    //   - the ground became real to the shared rules (HF-423): a terrain collision proxy
    //     in `raycastMeshes` took the HF-402 spawn floor rule from 6.44 % to 100 %
    //     coverage, and made the island stop bullets.
    //   - the spawn table is solved rather than authored on the beach corners, and the
    //     eye-clearance, walkable-parity and cross-browser rosters all derive from this
    //     registry, so un-hiding it here is what puts it into those gates.
    // It ships `multiplayer: false`: solo only until the owner has played it.
    //
    // PARKED AGAIN 2026-09-03 (HF-429, owner decision at the PASS 89 candidate).
    // `selectable: false` and the PREVIEW word is off the card copy, so the
    // arena is not offered and does not advertise itself as nearly-ready.
    //
    // WHAT IS *NOT* REVERTED, and why parking is not a rollback. Everything
    // Lane R landed stays exactly as it is: the solved spawn table, the terrain
    // collision proxy in `raycastMeshes` that took the HF-402 spawn-floor rule
    // from 6.44 % to 100 % coverage, the admission receipts, and the
    // admission-evidence guard. A parked build passes that guard with no
    // receipt, because the guard asks for a receipt from arenas that are
    // OFFERED. Nothing was deleted to make a gate green.
    //
    // WHAT MOVED WITH THE CARD. Every roster-dependent pin is DERIVED from this
    // registry rather than re-typed, so this one field is the only edit:
    //   * the selectable count falls 11 -> 10, and the eye-clearance and
    //     cross-browser contract FLOORS are computed from the derived roster,
    //     not from a literal (that is what made a hidden arena a silent gate
    //     hole the last two times).
    //   * `src/arena-selectability.test.ts` asserts the hidden set BY FLAG -
    //     every registry row with `selectable === false` - and never by a
    //     hardcoded id list, so the next park or un-park needs no test edit.
    //   * the walkable, collider and eye-clearance LEDGERS keep their farcrysis
    //     rows and their measured numbers. Farcrysis stays measured; it is
    //     hidden, not withdrawn, and deleting the measurements would lose the
    //     evidence that got it this far.
    selectable: false,
    legacyAliases: Object.freeze(['f4rcry515', 'farcry', 'f4rcry']),
    prototype: true,
    selectorLabel: 'FARCrySIS',
    displayName: 'Farcrysis',
    titleLead: 'FARCry',
    titleAccent: 'SIS',
    menuLede: 'Fight through a flooded jungle research station — an original beach-and-jungle homage with dense collision cover, a ruined core, and golden-hour beach light.',
    summary: 'Jungle island research station · dense cover · golden-hour beach',
    rulesLabel: '5 MIN · SOLO · 2 BOTS',
    soloBotCount: 2,
    maximumSoloBots: 2,
    // PREVIEW ships solo-only. The MP lab roster is computed as
    // `multiplayer && selectable` (tests/e2e/mp-lab-registry-contract.test.mjs),
    // so this is also what keeps farcrysis out of a multiplayer sweep nobody
    // has run against it yet. Flipping it true is a gated change, not a typo.
    multiplayer: false,
    fieldSupport: false,
    overdrive: false,
    authoring: 'code' as const,
    authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT',
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'high-seas' as const,
    routeId: 'high-seas' as const,
    kind: 'team' as const,
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
    kind: 'team' as const,
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
    kind: 'team' as const,
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
    // HF-495 (owner, 2026-09-04): park the original Raid like HF-466 parked
    // the original Nuketown. Its stable id, route, aliases, links and arena
    // implementation remain registered for in-flight rooms and history.
    selectable: false,
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
    kind: 'explore' as const,
    legacyAliases: Object.freeze([]),
    selectorLabel: 'MAP 3 · PREVIEW',
    displayName: 'Map 3',
    titleLead: 'MAP',
    titleAccent: '3',
    // EIGHT, not seven: the Rapier playground landed as a real in-arena
    // corridor (`MAP3_LANES` in src/map3-arena.ts), and a lede that undercounts
    // the content by one corridor is the same class of untruth as the matchbar
    // that called this a team deathmatch.
    menuLede: 'Walk the showcase: a paved hub with eight corridors running off it — a Gerstner shoreline with a pier and a fording rover, a raymarched SDF gallery, a shape-grammar skyline, a forest that bends as you pass, four seasons under a downpour, a colonnade cut by god rays, a Rapier physics playground you can shove around, and an overlook onto a colosseum. No bots, no timer pressure: explore.',
    summary: 'Corridor showcase · explore · no bots',
    rulesLabel: 'EXPLORE PREVIEW · NO BOTS',
    // The standalone fly-through page, resolved against the game document so it
    // lands in whichever channel the player is in. See `showcasePath` above.
    showcasePath: 'map3.html',
    soloBotCount: 0,
    maximumSoloBots: 0,
    multiplayer: false,
    fieldSupport: false,
    overdrive: false,
    // THE CARD IS BACK (PASS 86, HF-409 finish). It was withdrawn for one day
    // while the showcase was built; every gate that stood in the way was moved
    // WITH it rather than around it, and none of them was weakened.
    //
    // The arena: the showcase corridors, with 225 movement colliders and 225
    // shot surfaces authored from the corridors' own published solids.
    // Measured 2026-09-02 on this tree with
    // `npx tsx scripts/qa/audit-collider-visual-parity.ts --arenas map3`:
    // 225 colliders, 0 invisible, 130 visible meshes, 2 triaged walk-throughs.
    // (An earlier note here said 209 / 114; that was a stale intermediate
    // reading taken before the sixteen hub waymarkers existed.)
    //
    // WHAT MOVED WITH THE CARD - the ten assertions in six files that pinned it
    // hidden, each re-pointed at the truth rather than exempted:
    //   * `src/spawn-layout-quality.test.ts` now models `kind` (above). An
    //     EXPLORE arena has no second team for a spawn to be separated FROM, so
    //     the team-separation rule is vacuous for it - and the same test now
    //     asserts an explore arena really carries no lobby and no bots, which
    //     is a check that did not exist before.
    //   * `src/arena-selectability.test.ts` x2 - the hidden set is farcrysis
    //     alone again.
    //   * `src/map-selection.test.ts` - now pins the offered card and the
    //     EXPLORE shape of it.
    //   * `src/ui/pass64-shell.test.ts` - map3 joins the ordered player-facing
    //     routes.
    //   * `scripts/qa/cross-browser-gate-contract.test.mjs` x2 and
    //     `scripts/qa/eye-clearance-sweep-contract.test.mjs` x3 - the roster
    //     floors go BACK UP 7 -> 8 (they were lowered for the day the card was
    //     withdrawn; a floor is a collapsed-scrape alarm and must equal the
    //     real roster), and `docs/eye-clearance/ledger.json` carries a MEASURED
    //     map3 ceiling from the headless sweep, not the unmeasured sentinel.
    selectable: true,
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

/**
 * The canvas's accessible name. MAP3 (HF-409): an EXPLORE arena is not a
 * multiplayer arena, and a screen reader announcing one that way is the same
 * dishonesty as a TEAM DEATHMATCH banner over a bot-less walk. Derived from the
 * declared kind, so a new explore arena gets the right word for free.
 */
export function arenaCanvasLabel(selection: ArenaSelection): string {
  return `${selection.displayName} ${selection.kind === 'explore' ? 'explore' : 'multiplayer'} arena`;
}

/**
 * How many bots Solo opens with on this arena. Derived from the catalog row -
 * the declared start, clamped by the arena's own declared maximum - so no call
 * site ever has to know an arena id to answer the question.
 */
export function initialSoloBotCount(selection: ArenaSelection): number {
  const declared = selection.initialSoloBots;
  if (declared === undefined || !Number.isFinite(declared)) return selection.soloBotCount;
  return Math.min(selection.maximumSoloBots, Math.max(0, Math.floor(declared)));
}

/**
 * HF-491 (owner, 2026-09-04, after playing Solo on the Nuke Town rebuild:
 * "the bots not in there").
 *
 * Before this change the ten-defeat reinforcement ladder ran for the arena id
 * `atomic-acres` and nothing else - and HF-466 had already made that arena
 * unselectable, so the ladder was dead code for the whole selectable roster
 * and every arena the owner could actually pick fielded exactly one bot
 * forever, no matter what its `maximumSoloBots` declared.
 *
 * The rule is now derived from the catalog row instead of an arena roster: an
 * arena escalates up to whatever maximum it declares, from whatever start it
 * declares. An arena whose maximum equals its start (rustworks-1v1 at 1,
 * gun-range and map3 at 0, farcrysis/high-seas/test1/test2/raid2 at 2) is
 * pinned by its own declaration exactly as before - the clamp does that, not a
 * special case - so Pass 66's "exactly one enemy bot" still holds wherever the
 * catalog still says so.
 */
export function activeSoloBotTarget(selection: ArenaSelection, cumulativeDeaths: number): number {
  const initial = initialSoloBotCount(selection);
  return Math.min(selection.maximumSoloBots, soloBotTargetForDeaths(cumulativeDeaths, initial, selection.maximumSoloBots));
}

export function soloLaunchLabel(selection: ArenaSelection): string {
  // MAP3 (HF-409): "START RANGE" was the right words while the only bot-less
  // arena was the Gun Range, and it is the wrong words for the second one.
  // Map 3 is an explore mode, not a firing range, so the label follows what
  // the arena IS rather than what the first bot-less arena happened to be.
  // HF-491: the label states the count the match actually opens with, which is
  // the declared start clamped by the arena maximum - not the Pass 66 default.
  // A card that promises 1 and deploys 4 is the same dishonesty as one that
  // promises 4 and deploys 1.
  const initial = initialSoloBotCount(selection);
  if (initial === 0) return selection.id === 'gun-range' ? 'START RANGE' : 'START EXPLORING';
  return `${initial} BOT${initial === 1 ? '' : 'S'} SKIRMISH`;
}
