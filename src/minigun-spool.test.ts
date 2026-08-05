import { describe, expect, it } from 'vitest';
import {
  MINIGUN_PRESENTATION_SPIN_DOWN_MS,
  MINIGUN_PRESENTATION_SPIN_UP_MS,
  advanceMinigunSpool,
  createMinigunSpoolState,
} from './minigun-spool';

describe('minigun presentation spool', () => {
  it('visibly advances before the host-authoritative first-shot deadline', () => {
    const state = createMinigunSpoolState();
    for (let frame = 0; frame < 12; frame += 1) {
      advanceMinigunSpool(state, { dt: 1 / 60, triggerHeld: true, equipped: true });
    }
    expect(MINIGUN_PRESENTATION_SPIN_UP_MS).toBe(1_200);
    expect(state.phase).toBe('spooling-up');
    expect(state.fraction).toBeGreaterThan(0.15);
    expect(state.fraction).toBeLessThan(1);
    expect(state.angleRadians).toBeGreaterThan(0);
  });

  it('reaches ready, then decays to idle after release without snapping', () => {
    const state = createMinigunSpoolState();
    for (let frame = 0; frame < 80; frame += 1) {
      advanceMinigunSpool(state, { dt: 1 / 60, triggerHeld: true, equipped: true });
    }
    expect(state.phase).toBe('ready');
    const readyAngle = state.angleRadians;
    advanceMinigunSpool(state, { dt: 1 / 60, triggerHeld: false, equipped: true });
    expect(state.phase).toBe('spooling-down');
    expect(state.fraction).toBeGreaterThan(0.9);
    expect(state.angleRadians).not.toBe(readyAngle);
    for (let frame = 0; frame < 50; frame += 1) {
      advanceMinigunSpool(state, { dt: 1 / 60, triggerHeld: false, equipped: true });
    }
    expect(MINIGUN_PRESENTATION_SPIN_DOWN_MS).toBe(720);
    expect(state).toMatchObject({ phase: 'idle', fraction: 0, radiansPerSecond: 0 });
  });
});
