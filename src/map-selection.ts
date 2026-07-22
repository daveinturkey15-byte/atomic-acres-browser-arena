import { MATCH_DURATION_MS, type MatchRules } from './gameplay';
import { MAX_SOLO_BOTS, SOLO_BOT_COUNT, soloBotTargetForDeaths } from './bot-ai';
import { GUN_RANGE_ROUND_MS } from './gun-range-rules';

export type ArenaId = 'atomic-acres' | 'rustworks-1v1' | 'gun-range';

export type ArenaSelection = Readonly<{
  id: ArenaId;
  selectorLabel: string;
  displayName: string;
  summary: string;
  rulesLabel: string;
  soloBotCount: number;
  maximumSoloBots: number;
  multiplayer: boolean;
  fieldSupport: boolean;
  overdrive: boolean;
  matchRules: MatchRules;
}>;

export const ARENA_SELECTIONS: readonly ArenaSelection[] = Object.freeze([
  Object.freeze({
    id: 'atomic-acres' as const,
    selectorLabel: 'ATOMIC ACRES',
    displayName: 'Atomic Acres',
    summary: 'Authored neighbourhood team arena',
    rulesLabel: '5 MIN · NO KILL LIMIT',
    soloBotCount: SOLO_BOT_COUNT,
    maximumSoloBots: MAX_SOLO_BOTS,
    multiplayer: true,
    fieldSupport: true,
    overdrive: true,
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'rustworks-1v1' as const,
    selectorLabel: 'RUSTWORKS',
    displayName: 'Rustworks',
    summary: 'Industrial tower · private lobbies up to 6 · one-bot solo',
    rulesLabel: '5 MIN · HOST UP TO 6 · 1 BOT SOLO',
    soloBotCount: 1,
    maximumSoloBots: 1,
    multiplayer: true,
    fieldSupport: false,
    overdrive: false,
    matchRules: Object.freeze({ durationMs: MATCH_DURATION_MS, scoreLimit: null }),
  }),
  Object.freeze({
    id: 'gun-range' as const,
    selectorLabel: 'GUN RANGE',
    displayName: 'Acres Gun Range',
    summary: 'Timed solo lane · score, hits, accuracy',
    rulesLabel: '2 MIN · NO GRENADES · SCORE ATTACK',
    soloBotCount: 0,
    maximumSoloBots: 0,
    multiplayer: false,
    fieldSupport: false,
    overdrive: false,
    matchRules: Object.freeze({ durationMs: GUN_RANGE_ROUND_MS, scoreLimit: null }),
  }),
]);

export function arenaSelection(id: string | null | undefined): ArenaSelection {
  return ARENA_SELECTIONS.find((entry) => entry.id === id) ?? ARENA_SELECTIONS[0];
}

export function activeSoloBotTarget(selection: ArenaSelection, cumulativeDeaths: number): number {
  if (selection.id !== 'atomic-acres') return selection.soloBotCount;
  return Math.min(selection.maximumSoloBots, soloBotTargetForDeaths(cumulativeDeaths));
}
