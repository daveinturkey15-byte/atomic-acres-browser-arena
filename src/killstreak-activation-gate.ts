import type { MatchPhase } from './gameplay';
import type { Pass65KillstreakId } from './killstreak-catalog';

/**
 * HF-316(b): pure pre-flight gate for in-match killstreak activation.
 *
 * Every reason here was previously an inlined bare `return` in legacy-main.ts
 * (keydown gameplayInputEnabled() gate, activateOrToggleFieldSupportSlot's
 * possession no-op, and activateFieldSupport's guard block), so a blocked
 * key-3 press produced zero feedback. This module makes each refusal an
 * enumerable, labelled outcome the HUD feed can surface. It is presentation
 * pre-flight only: the host runtime (killstreakRuntime.activate) remains the
 * sole activation authority and this gate never mutates or projects charges.
 *
 * Reason order mirrors the observed legacy gate order on the key-3 path:
 * gameplayInputEnabled compound (dead / match phase attributed first, residual
 * lock last of the three), then possession, then the activateFieldSupport
 * guard expression (arena support before tactical map), then targeting
 * overlay, then availability split — a missing host actor snapshot is
 * reported before 'not-earned' because guest availability is projected purely
 * from that snapshot and blaming the player's kill count without one would be
 * dishonest.
 */

export type KillstreakActivationDenialReason =
  | 'dead'
  | 'match-inactive'
  | 'menu-open'
  | 'possession-active'
  | 'targeting-open'
  | 'not-earned'
  | 'no-authority-snapshot'
  | 'arena-unsupported'
  | 'input-disabled';

export type KillstreakActivationGateInput = Readonly<{
  /** The killstreak occupying the pressed slot (post care-reward substitution). */
  slotId: Pass65KillstreakId;
  /** Local projection says the reward's charge is available to spend. */
  projectionEarned: boolean;
  playerAlive: boolean;
  matchPhase: MatchPhase;
  /** The tri-pass tactical map overlay is up. */
  tacticalMapOpen: boolean;
  /** The player is possessing a chopper gun or piloted drone. */
  possessionActive: boolean;
  /**
   * The pressed slot already owns a LIVE controllable platform in the world,
   * so this press is a CONTROL TOGGLE rather than an activation.
   *
   * Without this, pressing the key a second time was judged as a fresh
   * activation: the charge had just been spent spawning the platform, so
   * `projectionEarned` was false and the press was refused with NOT EARNED -
   * making it impossible to ever take control of a chopper or drone you had
   * already paid for. Toggling control costs nothing and spends nothing, so
   * neither the charge nor an active possession may refuse it.
   */
  controlTogglePress: boolean;
  /** A crosshair point/corridor targeting session is already open. */
  targetingActive: boolean;
  arenaSupportsFieldSupport: boolean;
  /** Guests: the host actor snapshot availability is projected from exists. */
  hasActorSnapshot: boolean;
  /** The compound legacy-main gameplayInputEnabled() result. */
  gameplayInputEnabled: boolean;
}>;

export type KillstreakActivationEvaluation =
  | Readonly<{ allowed: true; slotId: Pass65KillstreakId }>
  | Readonly<{
    allowed: false;
    slotId: Pass65KillstreakId;
    reason: KillstreakActivationDenialReason;
    /** Short uppercase feed string; call sites may prefix the reward label. */
    userFacingLabel: string;
  }>;

export const KILLSTREAK_ACTIVATION_DENIAL_LABELS: Readonly<Record<KillstreakActivationDenialReason, string>>
  = Object.freeze({
    'dead': 'UNAVAILABLE WHILE DOWN',
    'match-inactive': 'MATCH NOT ACTIVE',
    'menu-open': 'TACTICAL MAP OPEN',
    'possession-active': 'EXIT SUPPORT CONTROL FIRST',
    'targeting-open': 'TARGETING ALREADY OPEN',
    'not-earned': 'NOT EARNED YET',
    'no-authority-snapshot': 'AWAITING HOST SYNC',
    'arena-unsupported': 'SUPPORT OFFLINE IN THIS ARENA',
    'input-disabled': 'INPUT LOCKED',
  });

function denied(
  slotId: Pass65KillstreakId,
  reason: KillstreakActivationDenialReason,
): KillstreakActivationEvaluation {
  return Object.freeze({
    allowed: false as const,
    slotId,
    reason,
    userFacingLabel: KILLSTREAK_ACTIVATION_DENIAL_LABELS[reason],
  });
}

export function evaluateKillstreakActivation(input: KillstreakActivationGateInput): KillstreakActivationEvaluation {
  const { slotId } = input;
  if (!input.playerAlive) return denied(slotId, 'dead');
  if (input.matchPhase !== 'active') return denied(slotId, 'match-inactive');
  // Residual causes of the compound input gate (pause/settings menu surface,
  // text chat, guest awaiting canonical authority, pending world repair) are
  // not separable from the boolean; report the honest generic lock.
  if (!input.gameplayInputEnabled) return denied(slotId, 'input-disabled');
  if (!input.arenaSupportsFieldSupport) return denied(slotId, 'arena-unsupported');
  if (input.tacticalMapOpen) return denied(slotId, 'menu-open');
  if (input.targetingActive) return denied(slotId, 'targeting-open');
  // A control toggle on a platform the player already owns is exempt from the
  // possession and charge checks: entering and LEAVING the gun both arrive on
  // this path, and the charge was spent when the platform was called in.
  if (input.controlTogglePress) return Object.freeze({ allowed: true as const, slotId });
  if (input.possessionActive) return denied(slotId, 'possession-active');
  if (!input.hasActorSnapshot) return denied(slotId, 'no-authority-snapshot');
  if (!input.projectionEarned) return denied(slotId, 'not-earned');
  return Object.freeze({ allowed: true as const, slotId });
}
