import { describe, expect, it } from 'vitest';
import { preserveSoloCountdownCue } from './match-countdown-continuity';

const warmup = { phase: 'warmup' as const, phaseStartedAt: 0, endsAt: 3_000, winner: null };

describe('single-player countdown continuity', () => {
  it('restores 3 when first presentation arrives after a startup stall', () => {
    const state = preserveSoloCountdownCue(warmup, 2_400, null, true);
    expect(state).toMatchObject({ phaseStartedAt: 2_400, endsAt: 5_400 });
    expect(Math.ceil((state.endsAt - 2_400) / 1_000)).toBe(3);
  });

  it('does not skip 2 or 1 across multi-second render stalls', () => {
    const two = preserveSoloCountdownCue(warmup, 3_500, '3', true);
    expect(Math.ceil((two.endsAt - 3_500) / 1_000)).toBe(2);
    const one = preserveSoloCountdownCue(two, 6_000, '2', true);
    expect(Math.ceil((one.endsAt - 6_000) / 1_000)).toBe(1);
  });

  it('never moves the synchronized multiplayer clock or delays ENGAGE after 1', () => {
    expect(preserveSoloCountdownCue(warmup, 3_500, '3', false)).toBe(warmup);
    expect(preserveSoloCountdownCue(warmup, 3_500, '1', true)).toBe(warmup);
  });

  it('does not rewrite a healthy next cue', () => {
    expect(preserveSoloCountdownCue(warmup, 1_100, '3', true)).toBe(warmup);
    expect(preserveSoloCountdownCue(warmup, 2_100, '2', true)).toBe(warmup);
  });
});
