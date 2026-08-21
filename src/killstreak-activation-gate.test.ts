import { describe, expect, it } from 'vitest';
import {
  KILLSTREAK_ACTIVATION_DENIAL_LABELS,
  evaluateKillstreakActivation,
  type KillstreakActivationDenialReason,
  type KillstreakActivationGateInput,
} from './killstreak-activation-gate';

// HF-316(b): every previously-silent in-match activation refusal must be an
// enumerable, labelled outcome. The gate is pure presentation pre-flight; host
// authority (killstreakRuntime.activate) is not modelled here.

const CLEAR: KillstreakActivationGateInput = Object.freeze({
  slotId: 'care-package',
  projectionEarned: true,
  playerAlive: true,
  matchPhase: 'active',
  tacticalMapOpen: false,
  possessionActive: false,
  targetingActive: false,
  arenaSupportsFieldSupport: true,
  hasActorSnapshot: true,
  gameplayInputEnabled: true,
} as const);

function blocked(overrides: Partial<KillstreakActivationGateInput>): KillstreakActivationGateInput {
  return { ...CLEAR, ...overrides };
}

describe('HF-316(b) killstreak activation pre-flight gate', () => {
  it('allows activation when every gate is clear and echoes the slot id', () => {
    const result = evaluateKillstreakActivation(CLEAR);
    expect(result).toEqual({ allowed: true, slotId: 'care-package' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('maps every blocking input to its single denial reason', () => {
    const matrix: ReadonlyArray<[Partial<KillstreakActivationGateInput>, KillstreakActivationDenialReason]> = [
      [{ playerAlive: false }, 'dead'],
      [{ matchPhase: 'warmup' }, 'match-inactive'],
      [{ matchPhase: 'ended' }, 'match-inactive'],
      [{ gameplayInputEnabled: false }, 'input-disabled'],
      [{ possessionActive: true }, 'possession-active'],
      [{ arenaSupportsFieldSupport: false }, 'arena-unsupported'],
      [{ tacticalMapOpen: true }, 'menu-open'],
      [{ targetingActive: true }, 'targeting-open'],
      [{ hasActorSnapshot: false }, 'no-authority-snapshot'],
      [{ projectionEarned: false }, 'not-earned'],
    ];
    for (const [overrides, reason] of matrix) {
      const result = evaluateKillstreakActivation(blocked(overrides));
      expect(result).toEqual({
        allowed: false,
        slotId: 'care-package',
        reason,
        userFacingLabel: KILLSTREAK_ACTIVATION_DENIAL_LABELS[reason],
      });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('keeps the observed legacy gate precedence when several gates block at once', () => {
    // Order mirrors legacy-main: gameplayInputEnabled compound (dead, then
    // match phase, then residual lock), possession, then the
    // activateFieldSupport guard (arena before tactical map), targeting
    // overlay, then the availability split (snapshot before earned).
    const worstCase = blocked({
      playerAlive: false,
      matchPhase: 'ended',
      gameplayInputEnabled: false,
      possessionActive: true,
      arenaSupportsFieldSupport: false,
      tacticalMapOpen: true,
      targetingActive: true,
      hasActorSnapshot: false,
      projectionEarned: false,
    });
    const order: KillstreakActivationDenialReason[] = [];
    let input = worstCase;
    for (let step = 0; step < 16; step += 1) {
      const result = evaluateKillstreakActivation(input);
      if (result.allowed) break;
      order.push(result.reason);
      input = {
        ...input,
        ...(result.reason === 'dead' ? { playerAlive: true } : {}),
        ...(result.reason === 'match-inactive' ? { matchPhase: 'active' as const } : {}),
        ...(result.reason === 'input-disabled' ? { gameplayInputEnabled: true } : {}),
        ...(result.reason === 'possession-active' ? { possessionActive: false } : {}),
        ...(result.reason === 'arena-unsupported' ? { arenaSupportsFieldSupport: true } : {}),
        ...(result.reason === 'menu-open' ? { tacticalMapOpen: false } : {}),
        ...(result.reason === 'targeting-open' ? { targetingActive: false } : {}),
        ...(result.reason === 'no-authority-snapshot' ? { hasActorSnapshot: true } : {}),
        ...(result.reason === 'not-earned' ? { projectionEarned: true } : {}),
      };
    }
    expect(order).toEqual([
      'dead', 'match-inactive', 'input-disabled', 'possession-active',
      'arena-unsupported', 'menu-open', 'targeting-open',
      'no-authority-snapshot', 'not-earned',
    ]);
    expect(evaluateKillstreakActivation(input)).toEqual({ allowed: true, slotId: 'care-package' });
  });

  it('attributes death and inactive phase before the generic input lock', () => {
    // gameplayInputEnabled() is false whenever the player is dead or the match
    // phase is not active; the specific cause must win over 'input-disabled'.
    expect(evaluateKillstreakActivation(blocked({ playerAlive: false, gameplayInputEnabled: false })))
      .toMatchObject({ reason: 'dead' });
    expect(evaluateKillstreakActivation(blocked({ matchPhase: 'warmup', gameplayInputEnabled: false })))
      .toMatchObject({ reason: 'match-inactive' });
  });

  it('never blames the kill count while the host actor snapshot is missing', () => {
    // Guests project availability purely from the host snapshot; without one,
    // 'not-earned' would be a lie about the player's progress.
    expect(evaluateKillstreakActivation(blocked({ hasActorSnapshot: false, projectionEarned: false })))
      .toMatchObject({ reason: 'no-authority-snapshot', userFacingLabel: 'AWAITING HOST SYNC' });
  });

  it('ships a short uppercase feed label for every denial reason', () => {
    const reasons: KillstreakActivationDenialReason[] = [
      'dead', 'match-inactive', 'menu-open', 'possession-active', 'targeting-open',
      'not-earned', 'no-authority-snapshot', 'arena-unsupported', 'input-disabled',
    ];
    expect(Object.keys(KILLSTREAK_ACTIVATION_DENIAL_LABELS).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      const label = KILLSTREAK_ACTIVATION_DENIAL_LABELS[reason];
      expect(label).toBe(label.toUpperCase());
      expect(label.length).toBeGreaterThan(4);
      expect(label.length).toBeLessThanOrEqual(32);
    }
    expect(Object.isFrozen(KILLSTREAK_ACTIVATION_DENIAL_LABELS)).toBe(true);
  });
});
