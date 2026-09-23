/**
 * Pass 79 — the shaft registry, and the orphan it closes.
 *
 * `farcrysisLightShafts()` and `ParticleRuntime.setLightShafts()` were both
 * authored, both bounded and both green, and nothing connected them: live
 * telemetry read `particles.lightShafts: 0` on every arena. These tests pin the
 * connection itself, not either end of it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  activeLightShafts,
  publishLightShafts,
  resetLightShafts,
  type ParticleLightShaft,
} from './light-shaft-registry';

afterEach(() => { resetLightShafts(); });

const shaft = (x: number): ParticleLightShaft => Object.freeze({
  x, y: 6, z: -2, axisX: 0.2, axisY: -0.95, axisZ: 0.1, radiusM: 1.8,
});

describe('light shaft registry', () => {
  it('starts empty and belonging to no arena', () => {
    const published = activeLightShafts();
    expect(published.arenaId).toBeNull();
    expect(published.shafts).toHaveLength(0);
  });

  it('bumps a revision on every publish so a subscriber can skip cheaply', () => {
    const before = activeLightShafts().revision;
    const first = publishLightShafts('farcrysis', [shaft(1)]);
    expect(first.revision).toBe(before + 1);
    const second = publishLightShafts('farcrysis', [shaft(1)]);
    // Republishing the SAME shafts still bumps: a subscriber that skipped on
    // equal revisions would be correct, and one that skipped on equal contents
    // would need a deep compare on the frame path.
    expect(second.revision).toBe(before + 2);
  });

  it('keeps the arena with the shafts, because shafts never cross arenas', () => {
    publishLightShafts('farcrysis', [shaft(1), shaft(4)]);
    expect(activeLightShafts().arenaId).toBe('farcrysis');
    expect(activeLightShafts().shafts).toHaveLength(2);
    publishLightShafts('gun-range', []);
    expect(activeLightShafts().arenaId).toBe('gun-range');
    expect(activeLightShafts().shafts).toHaveLength(0);
  });

  it('copies and freezes, so a publisher mutating its own array cannot reach in', () => {
    const mutable: ParticleLightShaft[] = [shaft(1)];
    publishLightShafts('farcrysis', mutable);
    mutable.push(shaft(9));
    expect(activeLightShafts().shafts).toHaveLength(1);
    expect(Object.isFrozen(activeLightShafts())).toBe(true);
    expect(Object.isFrozen(activeLightShafts().shafts)).toBe(true);
  });

  it('resets cleanly so one suite cannot leak shafts into the next', () => {
    publishLightShafts('farcrysis', [shaft(1)]);
    resetLightShafts();
    expect(activeLightShafts().arenaId).toBeNull();
    expect(activeLightShafts().shafts).toHaveLength(0);
  });
});
