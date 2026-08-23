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
  controlTogglePress: false,
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
    // match phase, then residual lock), then the activateFieldSupport guard
    // (arena before tactical map), targeting overlay, POSSESSION, then the
    // availability split (snapshot before earned).
    //
    // Possession moved after the arena/map/targeting group so the
    // control-toggle exemption can sit in front of it while those three still
    // refuse a toggle: you should not be able to jump into a chopper gun with
    // the tactical map or a targeting overlay open, and gun-range supports no
    // field support at all. That ordering change is deliberate and is what
    // made it possible to take control of a platform whose charge was already
    // spent (the owner's "can't take control when I press the key again").
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
      'dead', 'match-inactive', 'input-disabled',
      'arena-unsupported', 'menu-open', 'targeting-open', 'possession-active',
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

// HF-316 residual: the keydown handler must route killstreak slot keys through
// the gate BEFORE the HF-324 blanket gameplay-input return, so a player who is
// dead or in warmup gets the gate's denial feed instead of a silent no-op.
// Source-level pin because the wiring lives in the orchestrator-owned
// legacy-main keydown listener, which has no unit seam of its own.
describe('HF-316 keydown denial-feedback wiring', () => {
  it('evaluates slot keys ahead of the blanket gameplay-input guard', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const preCheck = main.indexOf('if (!gameplayInputEnabled() && gameStarted && !event.repeat) {');
    const blanketGuard = main.indexOf("if (!gameplayInputEnabled() && (event.code !== 'Tab' || !gameStarted)) return;");
    expect(preCheck).toBeGreaterThan(-1);
    expect(blanketGuard).toBeGreaterThan(-1);
    expect(preCheck).toBeLessThan(blanketGuard);
    // The pre-check must route through the gated activation path, never a
    // bespoke feed message or a direct activation.
    const preCheckBlock = main.slice(preCheck, blanketGuard);
    expect(preCheckBlock).toContain('activateOrToggleFieldSupportSlot(candidateSlot)');
  });
});

describe('control-toggle press (HITL: cannot take control of a chopper you own)', () => {
  /**
   * Owner report: "i cant take control of chopper gunner or piloted drone when
   * i press the key again".
   *
   * The second press was judged as a fresh ACTIVATION. The charge had just been
   * spent calling the platform in, so projectionEarned was false and the gate
   * refused with NOT EARNED before the toggle code below it could ever run -
   * making a platform you had already paid for permanently uncontrollable.
   * Toggling control spends nothing, so neither the charge nor an active
   * possession may refuse it.
   */
  const toggling = (overrides: Record<string, unknown> = {}) => evaluateKillstreakActivation({
    ...CLEAR,
    slotId: 'chopper',
    controlTogglePress: true,
    projectionEarned: false,
    ...overrides,
  } as Parameters<typeof evaluateKillstreakActivation>[0]);

  it('allows the toggle after the charge has been spent', () => {
    expect(toggling()).toMatchObject({ allowed: true, slotId: 'chopper' });
  });

  it('allows the toggle back OUT while possessing', () => {
    expect(toggling({ possessionActive: true })).toMatchObject({ allowed: true });
  });

  it('still refuses a toggle when the player is down or the match is not active', () => {
    expect(toggling({ playerAlive: false })).toMatchObject({ allowed: false, reason: 'dead' });
    expect(toggling({ matchPhase: 'warmup' })).toMatchObject({ allowed: false, reason: 'match-inactive' });
  });

  it('still refuses a toggle behind an open targeting overlay or tactical map', () => {
    expect(toggling({ targetingActive: true })).toMatchObject({ allowed: false, reason: 'targeting-open' });
    expect(toggling({ tacticalMapOpen: true })).toMatchObject({ allowed: false, reason: 'menu-open' });
  });

  it('leaves a normal activation press judged on the charge exactly as before', () => {
    const activation = evaluateKillstreakActivation({
      ...CLEAR, slotId: 'chopper', controlTogglePress: false, projectionEarned: false,
    } as Parameters<typeof evaluateKillstreakActivation>[0]);
    expect(activation).toMatchObject({ allowed: false, reason: 'not-earned' });
  });
});
