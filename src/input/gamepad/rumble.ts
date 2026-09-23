/**
 * Rumble through `gamepad.vibrationActuator` (PASS 84 Lane E). Three
 * gameplay pulses — fire, hit, damage taken — with an off switch, per-kind
 * throttling and priority so a hit pulse cannot cancel the heavier damage
 * pulse mid-play. `planRumble` is the pure decision; `GamepadRumble` is the
 * thin browser adapter around it.
 */

export type RumbleKind = 'fire' | 'hit' | 'damage';

export type RumbleEffect = Readonly<{
  kind: RumbleKind;
  durationMs: number;
  strongMagnitude: number;
  weakMagnitude: number;
  priority: number;
  /** Minimum gap between two pulses of this kind. */
  minIntervalMs: number;
}>;

export const RUMBLE_EFFECTS: Readonly<Record<RumbleKind, RumbleEffect>> = Object.freeze({
  fire: Object.freeze({ kind: 'fire', durationMs: 70, strongMagnitude: 0.22, weakMagnitude: 0.6, priority: 1, minIntervalMs: 45 }),
  hit: Object.freeze({ kind: 'hit', durationMs: 90, strongMagnitude: 0.4, weakMagnitude: 0.7, priority: 2, minIntervalMs: 60 }),
  damage: Object.freeze({ kind: 'damage', durationMs: 190, strongMagnitude: 0.85, weakMagnitude: 0.45, priority: 3, minIntervalMs: 120 }),
});

export type RumbleState = Readonly<{
  lastKind: RumbleKind | null;
  lastStartedAt: number;
  lastEndsAt: number;
  lastByKind: Readonly<Record<RumbleKind, number>>;
  played: number;
  suppressed: number;
}>;

export const INITIAL_RUMBLE_STATE: RumbleState = Object.freeze({
  lastKind: null,
  lastStartedAt: -1e9,
  lastEndsAt: -1e9,
  lastByKind: Object.freeze({ fire: -1e9, hit: -1e9, damage: -1e9 }),
  played: 0,
  suppressed: 0,
});

export type RumblePlan = Readonly<{ state: RumbleState; effect: RumbleEffect | null }>;

/**
 * Decides whether a pulse plays now. Rules, in order:
 *  1. Off switch: nothing plays, nothing is recorded as suppressed.
 *  2. Same-kind throttle: a kind cannot repeat inside its `minIntervalMs`.
 *  3. Priority: a lower-priority pulse never interrupts a higher one that is
 *     still playing; an equal or higher one replaces it.
 */
export function planRumble(state: RumbleState, kind: RumbleKind, now: number, enabled: boolean): RumblePlan {
  const effect = RUMBLE_EFFECTS[kind];
  if (!enabled) return Object.freeze({ state, effect: null });
  const suppress = (): RumblePlan => Object.freeze({ state: Object.freeze({ ...state, suppressed: state.suppressed + 1 }), effect: null });
  if (now - state.lastByKind[kind] < effect.minIntervalMs) return suppress();
  const playing = state.lastKind !== null && now < state.lastEndsAt;
  if (playing && state.lastKind !== null && RUMBLE_EFFECTS[state.lastKind].priority > effect.priority) return suppress();
  return Object.freeze({
    state: Object.freeze({
      lastKind: kind,
      lastStartedAt: now,
      lastEndsAt: now + effect.durationMs,
      lastByKind: Object.freeze({ ...state.lastByKind, [kind]: now }),
      played: state.played + 1,
      suppressed: state.suppressed,
    }),
    effect,
  });
}

/** Minimal actuator surface; the DOM lib's typing lags the shipped API. */
export type HapticActuatorLike = {
  playEffect?: (type: string, params: { duration: number; strongMagnitude: number; weakMagnitude: number; startDelay?: number }) => Promise<unknown>;
  pulse?: (value: number, duration: number) => Promise<unknown>;
};

export type RumblePadLike = { vibrationActuator?: HapticActuatorLike | null; hapticActuators?: readonly HapticActuatorLike[] };

export function padActuator(pad: RumblePadLike | null | undefined): HapticActuatorLike | null {
  if (!pad) return null;
  if (pad.vibrationActuator && (pad.vibrationActuator.playEffect || pad.vibrationActuator.pulse)) return pad.vibrationActuator;
  const first = pad.hapticActuators?.[0];
  return first && (first.playEffect || first.pulse) ? first : null;
}

export class GamepadRumble {
  private state: RumbleState = INITIAL_RUMBLE_STATE;
  private enabled = true;
  private lastEffect: RumbleKind | null = null;
  private actuatorCalls = 0;

  constructor(private readonly activePad: () => RumblePadLike | null) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Fires one pulse if the plan allows it; safe when no pad or actuator exists. */
  pulse(kind: RumbleKind, now: number): boolean {
    const pad = this.activePad();
    const actuator = padActuator(pad);
    if (!actuator) return false;
    const plan = planRumble(this.state, kind, now, this.enabled);
    this.state = plan.state;
    if (!plan.effect) return false;
    this.lastEffect = kind;
    this.actuatorCalls += 1;
    try {
      const result = actuator.playEffect
        ? actuator.playEffect('dual-rumble', {
          duration: plan.effect.durationMs,
          strongMagnitude: plan.effect.strongMagnitude,
          weakMagnitude: plan.effect.weakMagnitude,
        })
        : actuator.pulse?.(Math.max(plan.effect.strongMagnitude, plan.effect.weakMagnitude), plan.effect.durationMs);
      void result?.catch?.(() => undefined);
    } catch {
      // A pad that advertises haptics but rejects them must never break input.
    }
    return true;
  }

  telemetry(): Readonly<{ enabled: boolean; lastEffect: RumbleKind | null; played: number; suppressed: number; actuatorCalls: number }> {
    return Object.freeze({
      enabled: this.enabled,
      lastEffect: this.lastEffect,
      played: this.state.played,
      suppressed: this.state.suppressed,
      actuatorCalls: this.actuatorCalls,
    });
  }
}
