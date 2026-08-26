import { describe, expect, it } from 'vitest';
import {
  DIRECTIONAL_DAMAGE_LIFETIME_MS,
  LOW_HEALTH_ENTER_HP,
  LOW_HEALTH_EXIT_HP,
  MAX_CONCURRENT_DAMAGE_DIRECTIONS,
  createDirectionalDamageState,
  createLowHealthFeedbackState,
  directionalDamagePresentation,
  recordDirectionalDamage,
  sampleLowHealthFeedback,
} from './sensory-feedback';

describe('Pass 65 sensory feedback', () => {
  it('retains four concurrent directional sources, quantizes eight sectors and decays deterministically', () => {
    let state = createDirectionalDamageState();
    for (let index = 0; index < 6; index += 1) {
      state = recordDirectionalDamage(state, {
        sourceId: `attacker-${index}`,
        angleRadians: index * Math.PI / 4,
        damage: 20 + index,
        now: 100 + index,
      });
    }
    expect(state.pulses).toHaveLength(MAX_CONCURRENT_DAMAGE_DIRECTIONS);
    expect(new Set(state.pulses.map((pulse) => pulse.sector)).size).toBe(4);
    const early = directionalDamagePresentation(state, 200);
    const late = directionalDamagePresentation(state, 700);
    expect(early).toHaveLength(4);
    expect(late.every((pulse, index) => pulse.opacity < early[index]!.opacity)).toBe(true);
    expect(directionalDamagePresentation(state, 106 + DIRECTIONAL_DAMAGE_LIFETIME_MS)).toEqual([]);
  });

  it('refreshes a known attacker without duplicating its source slot', () => {
    const first = recordDirectionalDamage(createDirectionalDamageState(), {
      sourceId: 'same', angleRadians: 0, damage: 5, now: 10,
    });
    const refreshed = recordDirectionalDamage(first, {
      sourceId: 'same', angleRadians: Math.PI, damage: 40, now: 20,
    });
    expect(refreshed.pulses).toHaveLength(1);
    expect(refreshed.pulses[0]).toMatchObject({ sourceId: 'same', sector: 4, startedAt: 20 });
    expect(refreshed.pulses[0]!.strength).toBeGreaterThan(first.pulses[0]!.strength);
  });

  it('keeps indicators camera-correct while the player turns during their lifetime', () => {
    const state = recordDirectionalDamage(createDirectionalDamageState(), {
      sourceId: 'remote:a', sourceType: 'remote', angleRadians: Math.PI / 2, cameraYawRadians: 0,
      damage: 20, now: 10,
    });
    expect(directionalDamagePresentation(state, 20, 0)[0]).toMatchObject({ sector: 2, sourceType: 'remote' });
    expect(directionalDamagePresentation(state, 20, Math.PI / 2)[0]).toMatchObject({ sector: 4, sourceType: 'remote' });
  });

  it('uses low-health hysteresis and a slow non-strobing vignette', () => {
    let state = createLowHealthFeedbackState();
    let sample = sampleLowHealthFeedback(state, { health: LOW_HEALTH_ENTER_HP, alive: true, now: 1_000, reducedSensory: false });
    state = sample.state;
    expect(sample.presentation).toMatchObject({ active: true, pulseHz: 0.72 });
    sample = sampleLowHealthFeedback(state, { health: LOW_HEALTH_ENTER_HP + 5, alive: true, now: 1_500, reducedSensory: false });
    expect(sample.presentation.active).toBe(true);
    sample = sampleLowHealthFeedback(sample.state, { health: LOW_HEALTH_EXIT_HP, alive: true, now: 2_000, reducedSensory: false });
    expect(sample.presentation.active).toBe(false);
  });

  it('turns nonessential low-health audio off under reduced sensory and clears on death', () => {
    const entered = sampleLowHealthFeedback(createLowHealthFeedbackState(), {
      health: 8, alive: true, now: 500, reducedSensory: true,
    });
    expect(entered.presentation).toMatchObject({ active: true, breathingGain: 0, heartbeatGain: 0, pulseHz: 0.28 });
    expect(entered.presentation.vignetteOpacity).toBeLessThan(0.2);
    const dead = sampleLowHealthFeedback(entered.state, { health: 0, alive: false, now: 600, reducedSensory: false });
    expect(dead.presentation).toMatchObject({ active: false, vignetteOpacity: 0, breathingGain: 0, heartbeatGain: 0 });
  });
});
