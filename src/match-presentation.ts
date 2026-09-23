import { DEFAULT_MATCH_RULES, type MatchRules, type MatchState } from './gameplay';

export type MatchPresentation = {
  timer: string;
  objective: string;
  headline: string | null;
  subline: string | null;
};

export function formatMatchClock(milliseconds: number, ceil = false): string {
  if (!Number.isFinite(milliseconds)) return '--:--';
  const seconds = Math.max(0, ceil ? Math.ceil(milliseconds / 1000) : Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const DURATION_WORD_LABELS_MS: Readonly<Record<number, string>> = Object.freeze({
  120_000: 'TWO',
  180_000: 'THREE',
  300_000: 'FIVE',
  600_000: 'TEN',
  900_000: 'FIFTEEN',
});

function rulesSummary(rules: MatchRules): string {
  if (rules.durationMs === null && rules.scoreLimit === null) return 'UNTIMED SCORE PRACTICE';
  if (rules.scoreLimit === null) {
    // HF-377: hosts can publish 2/3/5/10/15-minute matches, so the label is
    // derived from the contract instead of assuming the five-minute default.
    const minutes = Math.round((rules.durationMs ?? DEFAULT_MATCH_RULES.durationMs ?? 0) / 60_000);
    const word = DURATION_WORD_LABELS_MS[rules.durationMs ?? -1];
    return `${word ?? minutes} MINUTE${minutes === 1 ? '' : 'S'} · MOST KILLS WINS`;
  }
  return `FIRST SQUAD TO ${rules.scoreLimit}`;
}

export function matchPresentationAt(
  state: MatchState,
  now: number,
  scores: [number, number],
  playerTeam: 0 | 1,
  rules: MatchRules = DEFAULT_MATCH_RULES,
  arenaLabel = 'Nuke Town',
): MatchPresentation {
  if (state.phase === 'warmup') {
    const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
    return { timer: formatMatchClock(state.endsAt - now, true), objective: `MATCH STARTS IN ${remaining}`, headline: remaining > 0 ? String(remaining) : 'ENGAGE', subline: rulesSummary(rules) };
  }
  if (state.phase === 'ended') {
    const draw = state.winner === 'draw';
    const won = state.winner === playerTeam;
    return {
      timer: '00:00', objective: state.endReason === 'score' ? 'SCORE LIMIT REACHED' : 'TIME LIMIT REACHED',
      headline: draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT', subline: `${scores[0]} — ${scores[1]}`,
    };
  }
  const leader = scores[0] === scores[1] ? 'TIED' : scores[playerTeam] > scores[playerTeam === 0 ? 1 : 0] ? 'YOUR SQUAD LEADS' : 'HOSTILE SQUAD LEADS';
  return { timer: formatMatchClock(state.endsAt - now), objective: `${arenaLabel.toUpperCase()} · ${rulesSummary(rules)} · ${leader}`, headline: null, subline: null };
}

export function respawnPresentation(endsAt: number, now: number): string {
  return `REDEPLOYING IN ${Math.max(0, (endsAt - now) / 1000).toFixed(1)}s`;
}
