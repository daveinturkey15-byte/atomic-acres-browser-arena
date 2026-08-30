import { describe, expect, it } from 'vitest';
import {
  DOMINATION_CAPTURE_MS,
  DOMINATION_TICK_MS,
  DOMINATION_TIME_LIMIT_MS,
  DOMINATION_WIN_SCORE,
  advanceDomination,
  createDominationState,
  dominationObjectiveFor,
  dominationWinner,
  type DominationPresence,
} from './domination-mode';

const SEEDS = [
  { id: 'A', centre: [-20, 0, 10] as const },
  { id: 'B', centre: [0, 0, 0] as const },
  { id: 'C', centre: [20, 0, -10] as const },
] as const;

const at = (team: 0 | 1, x: number, z: number, alive = true): DominationPresence => (
  { team, alive, position: [x, 1.7, z] as const }
);

describe('Domination core (owner 2026-08-30, Test2)', () => {
  it('captures a neutral zone after exactly the capture window of sole presence', () => {
    const state = createDominationState(SEEDS, 0);
    expect(advanceDomination(state, [at(0, 0, 0)], DOMINATION_CAPTURE_MS - 1)).toEqual([]);
    const events = advanceDomination(state, [at(0, 0, 0)], DOMINATION_CAPTURE_MS);
    expect(events).toEqual([{ kind: 'captured', zone: 'B', by: 0 }]);
    expect(state.zones[1]!.owner).toBe(0);
  });

  it('freezes progress while contested and resumes cleanly', () => {
    const state = createDominationState(SEEDS, 0);
    advanceDomination(state, [at(0, 0, 0)], 3_000);
    const frozen = state.zones[1]!.progress;
    advanceDomination(state, [at(0, 0, 0), at(1, 1, 1)], 9_000);
    expect(state.zones[1]!.progress).toBe(frozen);
    expect(state.zones[1]!.contested).toBe(true);
    const events = advanceDomination(state, [at(0, 0, 0)], 9_000 + (DOMINATION_CAPTURE_MS - frozen * DOMINATION_CAPTURE_MS));
    expect(events).toEqual([{ kind: 'captured', zone: 'B', by: 0 }]);
  });

  it('decays abandoned capture progress instead of remembering it forever', () => {
    const state = createDominationState(SEEDS, 0);
    advanceDomination(state, [at(0, 0, 0)], 3_000);
    advanceDomination(state, [], 6_000);
    expect(state.zones[1]!.progress).toBe(0);
    expect(state.zones[1]!.capturingTeam).toBeNull();
  });

  it('flips an owned zone through neutral (double window) and ticks the new owner', () => {
    const state = createDominationState(SEEDS, 0);
    advanceDomination(state, [at(0, 0, 0)], DOMINATION_CAPTURE_MS);
    expect(state.zones[1]!.owner).toBe(0);
    const neutralized = advanceDomination(state, [at(1, 0, 0)], DOMINATION_CAPTURE_MS * 2);
    expect(neutralized).toContainEqual({ kind: 'neutralized', zone: 'B', by: 1 });
    expect(state.zones[1]!.owner).toBeNull();
    const captured = advanceDomination(state, [at(1, 0, 0)], DOMINATION_CAPTURE_MS * 3);
    expect(captured).toContainEqual({ kind: 'captured', zone: 'B', by: 1 });
    const afterTick = advanceDomination(state, [], DOMINATION_CAPTURE_MS * 3 + DOMINATION_TICK_MS);
    expect(afterTick).toContainEqual({ kind: 'tick', zone: 'B', team: 1, points: 1 });
    expect(state.scores).toEqual([0, 1]);
  });

  it('dead bodies inside the zone neither capture nor contest', () => {
    const state = createDominationState(SEEDS, 0);
    advanceDomination(state, [at(0, 0, 0), at(1, 0.5, 0.5, false)], DOMINATION_CAPTURE_MS);
    expect(state.zones[1]!.owner).toBe(0);
  });

  it('declares the winner at the score cap and at the timer', () => {
    const state = createDominationState(SEEDS, 0);
    state.scores = [DOMINATION_WIN_SCORE, 3];
    expect(dominationWinner(state, 1_000)).toBe(0);
    const timed = createDominationState(SEEDS, 0);
    timed.scores = [4, 9];
    expect(dominationWinner(timed, DOMINATION_TIME_LIMIT_MS)).toBe(1);
    expect(dominationWinner(createDominationState(SEEDS, 0), 1_000)).toBeNull();
  });

  it('sends bots to the nearest zone their team does not own', () => {
    const state = createDominationState(SEEDS, 0);
    advanceDomination(state, [at(0, 20, -10)], DOMINATION_CAPTURE_MS); // team 0 owns C
    const objective = dominationObjectiveFor(state, 0, [20, 0, -10]);
    expect(objective?.id).toBe('B');
    const enemyObjective = dominationObjectiveFor(state, 1, [19, 0, -9]);
    expect(enemyObjective?.id).toBe('C');
  });
});
