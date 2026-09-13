import { describe, expect, it } from 'vitest';
import { GamepadRumble, INITIAL_RUMBLE_STATE, RUMBLE_EFFECTS, padActuator, planRumble } from './rumble';

describe('rumble planning', () => {
  it('plays nothing while switched off and records nothing as suppressed', () => {
    const plan = planRumble(INITIAL_RUMBLE_STATE, 'fire', 100, false);
    expect(plan.effect).toBeNull();
    expect(plan.state).toBe(INITIAL_RUMBLE_STATE);
  });

  it('throttles repeats of one kind and lets higher priority interrupt lower', () => {
    const first = planRumble(INITIAL_RUMBLE_STATE, 'fire', 100, true);
    expect(first.effect?.kind).toBe('fire');
    const tooSoon = planRumble(first.state, 'fire', 100 + RUMBLE_EFFECTS.fire.minIntervalMs - 1, true);
    expect(tooSoon.effect).toBeNull();
    expect(tooSoon.state.suppressed).toBe(1);
    const later = planRumble(first.state, 'fire', 100 + RUMBLE_EFFECTS.fire.minIntervalMs, true);
    expect(later.effect?.kind).toBe('fire');
    // Damage (priority 3) interrupts a playing fire pulse.
    const damage = planRumble(first.state, 'damage', 110, true);
    expect(damage.effect?.kind).toBe('damage');
    // A fire pulse cannot interrupt the still-playing damage pulse...
    const fireDuringDamage = planRumble(damage.state, 'fire', 160, true);
    expect(fireDuringDamage.effect).toBeNull();
    // ...but can play once the damage pulse has ended.
    const fireAfterDamage = planRumble(damage.state, 'fire', 110 + RUMBLE_EFFECTS.damage.durationMs + 1, true);
    expect(fireAfterDamage.effect?.kind).toBe('fire');
    expect(fireAfterDamage.state.played).toBe(3);
  });

  it('effects are bounded magnitudes and durations', () => {
    for (const effect of Object.values(RUMBLE_EFFECTS)) {
      expect(effect.strongMagnitude).toBeGreaterThanOrEqual(0);
      expect(effect.strongMagnitude).toBeLessThanOrEqual(1);
      expect(effect.weakMagnitude).toBeGreaterThanOrEqual(0);
      expect(effect.weakMagnitude).toBeLessThanOrEqual(1);
      expect(effect.durationMs).toBeGreaterThan(0);
      expect(effect.durationMs).toBeLessThanOrEqual(250);
    }
    expect(RUMBLE_EFFECTS.damage.priority).toBeGreaterThan(RUMBLE_EFFECTS.hit.priority);
    expect(RUMBLE_EFFECTS.hit.priority).toBeGreaterThan(RUMBLE_EFFECTS.fire.priority);
  });
});

describe('GamepadRumble adapter', () => {
  it('drives vibrationActuator.playEffect, honours the off switch and survives a missing actuator', async () => {
    const calls: Array<{ type: string; params: { duration: number; strongMagnitude: number; weakMagnitude: number } }> = [];
    let pad: { vibrationActuator?: { playEffect: (type: string, params: { duration: number; strongMagnitude: number; weakMagnitude: number }) => Promise<string> } } | null = {
      vibrationActuator: { playEffect: async (type, params) => { calls.push({ type, params }); return 'complete'; } },
    };
    const rumble = new GamepadRumble(() => pad);
    expect(rumble.pulse('fire', 0)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: 'dual-rumble', params: { duration: RUMBLE_EFFECTS.fire.durationMs } });
    rumble.setEnabled(false);
    expect(rumble.pulse('damage', 500)).toBe(false);
    expect(calls).toHaveLength(1);
    rumble.setEnabled(true);
    expect(rumble.pulse('damage', 500)).toBe(true);
    expect(rumble.telemetry()).toMatchObject({ enabled: true, lastEffect: 'damage', played: 2, actuatorCalls: 2 });
    pad = null;
    expect(rumble.pulse('hit', 1000)).toBe(false);
    pad = {};
    expect(rumble.pulse('hit', 1000)).toBe(false);
    expect(padActuator(pad)).toBeNull();
  });

  it('falls back to a pulse-only actuator and swallows rejections', async () => {
    let pulses = 0;
    const pad = { hapticActuators: [{ pulse: async () => { pulses += 1; throw new Error('nope'); } }] };
    const rumble = new GamepadRumble(() => pad);
    expect(rumble.pulse('hit', 0)).toBe(true);
    await Promise.resolve();
    expect(pulses).toBe(1);
  });
});
