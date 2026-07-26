import { MATCH_WARMUP_MS, type MatchState } from './gameplay';

export type MatchCountdownCue = '3' | '2' | '1' | 'engage';

function expectedNextCue(previous: MatchCountdownCue | null): 3 | 2 | 1 | null {
  if (previous === null) return 3;
  if (previous === '3') return 2;
  if (previous === '2') return 1;
  return null;
}

/**
 * A long single-player render/driver stall must not consume unseen countdown
 * edges. Multiplayer keeps its shared host clock; solo safely extends warmup
 * just enough to present the next required cue before simulation becomes live.
 */
export function preserveSoloCountdownCue(
  state: MatchState,
  now: number,
  previous: MatchCountdownCue | null,
  solo: boolean,
): MatchState {
  if (!solo || state.phase !== 'warmup' || !Number.isFinite(now) || !Number.isFinite(state.endsAt)) return state;
  const expected = expectedNextCue(previous);
  if (expected === null) return state;
  const displayed = Math.max(0, Math.ceil((state.endsAt - now) / 1_000));
  if (displayed >= expected) return state;
  const endsAt = now + expected * 1_000;
  return {
    ...state,
    phaseStartedAt: endsAt - MATCH_WARMUP_MS,
    endsAt,
  };
}
