import { MATCH_DURATION_MS, type MatchRules } from './gameplay';
import { MAX_SOLO_BOTS, SOLO_BOT_COUNT, soloBotTargetForDeaths } from './bot-ai';
import { GUN_RANGE_ROUND_MS } from './gun-range-rules';

export type ArenaId = 'atomic-acres' | 'rustworks-1v1' | 'gun-range' | 'skyline-terminal' | 'farcrysis';

export type ArenaRouteId = 'nuke-town' | 'terminal' | 'rustrig' | 'gun-range' | 'farcrysis';

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
    matchRules: Object.freeze({ durationMs: GUN_RANGE_ROUND_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'farcrysis' as const,
    routeId: 'farcrysis' as const,
    legacyAliases: Object.freeze(['f4rcry515', 'farcry', 'farcrysis', 'f4rcry']),
    selectorLabel: 'FARCrySIS',
    displayName: 'Farcrysis',
    titleLead: 'FARCry',
    titleAccent: 'SIS',
    menuLede: 'Fight through a flooded jungle research station — beach and jungle inspired by the Far Cry / Crysis family, with dense collision cover, a ruined core, and golden-hour beach light.',
    summary: 'Jungle island research station · dense cover · HITL test lane',
    rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
    soloBotCount: 2,
    maximumSoloBots: 2,
    multiplayer: true,
    fieldSupport: false,
    overdrive: false,
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
]);

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

export function activeSoloBotTarget(selection: ArenaSelection, cumulativeDeaths: number): number {
  if (selection.id !== 'atomic-acres') return selection.soloBotCount;
  return Math.min(selection.maximumSoloBots, soloBotTargetForDeaths(cumulativeDeaths));
}

export function soloLaunchLabel(selection: ArenaSelection): string {
  if (selection.soloBotCount === 0) return 'START RANGE';
  return `${selection.soloBotCount} BOT${selection.soloBotCount === 1 ? '' : 'S'} SKIRMISH`;
}
