import { describe, expect, it } from 'vitest';
import {
  HUD_IMPACT_PRESETS,
  advanceHudImpact,
  createHudImpactState,
  impactKindForShakeSource,
  isHudImpactIdle,
  pushHudImpact,
  releaseHudImpact,
  stepHudImpact,
  writeHudImpactProperties,
  type HudImpactState,
} from './hud-impact-response';
import { CAMERA_SHAKE_SOURCES } from '../camera-shake';

/** Minimal stand-in for the #hud element, recording every property write. */
function stubTarget() {
  const properties = new Map<string, string>();
  const removed: string[] = [];
  let writes = 0;
  return {
    properties,
    removed,
    get writes() { return writes; },
    dataset: {} as Record<string, string | undefined>,
    style: {
      setProperty(property: string, value: string) { writes += 1; properties.set(property, value); },
      removeProperty(property: string) { removed.push(property); properties.delete(property); },
    },
  };
}

/** Run the integrator forward in fixed frames and report the extreme values. */
function simulate(state: HudImpactState, frames: number, frameMs = 16.7) {
  let current = state;
  let peakX = 0;
  let peakY = 0;
  let peakRoll = 0;
  let overshootY = 0;
  const signOfFirstY = Math.sign(state.vy);
  for (let frame = 1; frame <= frames; frame += 1) {
    current = stepHudImpact(current, state.at + frame * frameMs);
    peakX = Math.max(peakX, Math.abs(current.x));
    peakY = Math.max(peakY, Math.abs(current.y));
    peakRoll = Math.max(peakRoll, Math.abs(current.roll));
    // An overshoot is displacement that has crossed back past centre.
    if (signOfFirstY !== 0 && Math.sign(current.y) === -signOfFirstY) {
      overshootY = Math.max(overshootY, Math.abs(current.y));
    }
  }
  return { state: current, peakX, peakY, peakRoll, overshootY };
}

/** Frames until the state reports fully settled, or `limit` if it never does. */
function framesToSettle(state: HudImpactState, limit = 600, frameMs = 16.7): number {
  let current = state;
  for (let frame = 1; frame <= limit; frame += 1) {
    current = stepHudImpact(current, state.at + frame * frameMs);
    if (isHudImpactIdle(current)) return frame;
  }
  return limit;
}

/**
 * Frames until displacement has fallen under a tenth of its own peak.
 *
 * This, not `framesToSettle`, is the number a player perceives: the tail of a
 * damped spring is sub-pixel for hundreds of milliseconds after the movement
 * has visually stopped. Asserting on full settle would be asserting on
 * something nobody can see.
 */
function framesToPerceptiblyStill(state: HudImpactState, limit = 600, frameMs = 16.7): number {
  const history: number[] = [];
  let current = state;
  for (let frame = 1; frame <= limit; frame += 1) {
    current = stepHudImpact(current, state.at + frame * frameMs);
    history.push(current.y);
    if (isHudImpactIdle(current)) break;
  }
  const peak = Math.max(...history.map(Math.abs));
  const index = history.findIndex((value) => Math.abs(value) < peak * 0.1);
  return index < 0 ? limit : index + 1;
}

/** Integrate to `until` in realistic frames rather than one clamped leap. */
function settleOver(state: HudImpactState, until: number, frameMs = 16.7): HudImpactState {
  let current = state;
  for (let clock = state.at + frameMs; clock <= until; clock += frameMs) {
    current = stepHudImpact(current, clock);
  }
  return current;
}

describe('hud impact response - the defect it closes', () => {
  it('starts settled, so an unwired build never shows a displaced HUD', () => {
    const state = createHudImpactState(1_000);
    expect(isHudImpactIdle(state)).toBe(true);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.roll).toBe(0);
    expect(state.kind).toBe('none');
  });

  it('actually moves the HUD when the player is hit', () => {
    // The whole point: before this module, trauma moved the camera and the HUD
    // did not move at all. A hit must produce non-zero displacement.
    const hit = pushHudImpact(createHudImpactState(0), {
      kind: 'bullet', severity: 0.5, bearingRadians: 0, now: 0,
    });
    const { peakY } = simulate(hit, 40);
    expect(peakY).toBeGreaterThan(0.05);
    expect(isHudImpactIdle(hit)).toBe(false);
  });
});

describe('hud impact response - direction', () => {
  it('kicks away from the source on both axes', () => {
    const base = createHudImpactState(0);
    // Dead ahead -> shoved down (+y), no lateral component.
    const ahead = pushHudImpact(base, { kind: 'bullet', severity: 1, bearingRadians: 0, now: 0 });
    expect(ahead.vy).toBeGreaterThan(0);
    expect(Math.abs(ahead.vx)).toBeLessThan(1e-9);

    // From the right -> shoved left (-x).
    const right = pushHudImpact(base, { kind: 'bullet', severity: 1, bearingRadians: Math.PI / 2, now: 0 });
    expect(right.vx).toBeLessThan(0);

    // From the left -> shoved right (+x). Mirrored magnitude.
    const left = pushHudImpact(base, { kind: 'bullet', severity: 1, bearingRadians: -Math.PI / 2, now: 0 });
    expect(left.vx).toBeGreaterThan(0);
    expect(left.vx).toBeCloseTo(-right.vx, 6);

    // From behind -> shoved up (-y).
    const behind = pushHudImpact(base, { kind: 'bullet', severity: 1, bearingRadians: Math.PI, now: 0 });
    expect(behind.vy).toBeLessThan(0);
  });

  it('rolls with the lateral shove, and barely rolls on a head-on hit', () => {
    const base = createHudImpactState(0);
    const side = pushHudImpact(base, { kind: 'melee', severity: 1, bearingRadians: Math.PI / 2, now: 0 });
    const head = pushHudImpact(base, { kind: 'melee', severity: 1, bearingRadians: 0, now: 0 });
    expect(Math.abs(side.vroll)).toBeGreaterThan(Math.abs(head.vroll));
    expect(Math.abs(head.vroll)).toBeLessThan(1e-9);
  });

  it('treats a missing bearing as a straight-down impact rather than as zero', () => {
    // A fall has no source. It must still be felt, and it must not be
    // indistinguishable from "hit from dead ahead" in the retained bearing.
    const fall = pushHudImpact(createHudImpactState(0), { kind: 'fall', severity: 0.8, now: 0 });
    expect(fall.vy).toBeGreaterThan(0);
    expect(fall.vx).toBe(0);
  });

  it('retains the last bearing for the directional wash', () => {
    const hit = pushHudImpact(createHudImpactState(0), {
      kind: 'bullet', severity: 0.4, bearingRadians: 1.2, now: 0,
    });
    expect(hit.bearingRadians).toBeCloseTo(1.2, 6);
    // A later sourceless impact must not silently reset the wash to "ahead".
    expect(pushHudImpact(hit, { kind: 'fall', severity: 0.3, now: 10 }).bearingRadians).toBeCloseTo(1.2, 6);
  });
});

describe('hud impact response - bullet and explosion are distinct signatures', () => {
  const base = createHudImpactState(0);
  const bullet = pushHudImpact(base, { kind: 'bullet', severity: 1, bearingRadians: 0, now: 0 });
  const blast = pushHudImpact(base, { kind: 'explosion', severity: 1, bearingRadians: 0, now: 0 });

  it('gives the explosion a bigger heave than the bullet', () => {
    expect(simulate(blast, 90).peakY).toBeGreaterThan(simulate(bullet, 90).peakY * 1.5);
  });

  it('settles the bullet fast and lets the explosion ring', () => {
    // Perceptible movement: a flinch is visually done inside ~300 ms.
    expect(framesToPerceptiblyStill(bullet) * 16.7).toBeLessThan(300);
    // Full ring-down: the blast is still moving long after the bullet stopped.
    const bulletFrames = framesToSettle(bullet);
    const blastFrames = framesToSettle(blast);
    expect(blastFrames).toBeGreaterThan(bulletFrames * 1.5);
    // Neither may ring forever - a HUD stuck oscillating is worse than a still one.
    expect(blastFrames * 16.7).toBeLessThan(2_500);
  });

  it('gives a bullet a displacement a human can actually see', () => {
    // The regression this guards: the first draft peaked at 0.073 for a
    // full-severity hit, which is under two pixels at the CSS multiplier - the
    // same "imperceptible" defect the owner reported about HUD sway.
    expect(simulate(bullet, 120).peakY).toBeGreaterThan(0.15);
    // ...and a single round still must not throw the HUD across the screen.
    expect(simulate(bullet, 120).peakY).toBeLessThan(0.45);
  });

  it('overshoots on a blast and does not on a bullet', () => {
    // Underdamped vs near-critically damped. This is the felt difference
    // between "heaved and recovered" and "flinched".
    expect(simulate(blast, 120).overshootY).toBeGreaterThan(0.01);
    expect(simulate(bullet, 120).overshootY).toBeLessThan(0.01);
  });

  it('reserves the flash and the colour split for blasts', () => {
    expect(blast.flash).toBeGreaterThan(bullet.flash * 2);
    expect(blast.chroma).toBeGreaterThan(bullet.chroma * 2);
  });

  it('publishes the signature so CSS can style the two differently', () => {
    expect(bullet.kind).toBe('bullet');
    expect(blast.kind).toBe('explosion');
  });

  it('keeps every preset underdamped-or-better and none of them unstable', () => {
    for (const [kind, preset] of Object.entries(HUD_IMPACT_PRESETS)) {
      expect(preset.stiffness, kind).toBeGreaterThan(0);
      expect(preset.damping, kind).toBeGreaterThan(0);
      // Damping must be positive but below the runaway point; an overdamped
      // spring this stiff would read as a jump-cut rather than as a movement.
      expect(preset.damping, kind).toBeLessThan(2 * Math.sqrt(preset.stiffness) * 1.6);
    }
  });
});

describe('hud impact response - impulses compound', () => {
  it('makes a burst of fire shove harder than a single round', () => {
    // Events add velocity, so they accumulate. If this ever regressed to
    // setting position, three rounds would look identical to one.
    let one = pushHudImpact(createHudImpactState(0), { kind: 'bullet', severity: 0.3, bearingRadians: 0, now: 0 });
    let three = one;
    three = pushHudImpact(three, { kind: 'bullet', severity: 0.3, bearingRadians: 0, now: 0 });
    three = pushHudImpact(three, { kind: 'bullet', severity: 0.3, bearingRadians: 0, now: 0 });
    expect(simulate(three, 40).peakY).toBeGreaterThan(simulate(one, 40).peakY * 2);
  });

  it('scales with severity', () => {
    const base = createHudImpactState(0);
    const graze = pushHudImpact(base, { kind: 'bullet', severity: 0.1, bearingRadians: 0, now: 0 });
    const heavy = pushHudImpact(base, { kind: 'bullet', severity: 0.9, bearingRadians: 0, now: 0 });
    expect(simulate(heavy, 40).peakY).toBeGreaterThan(simulate(graze, 40).peakY * 4);
  });
});

describe('hud impact response - it always returns to centre', () => {
  it('settles from every preset and every bearing', () => {
    for (const kind of ['bullet', 'explosion', 'fall', 'melee'] as const) {
      for (const bearing of [0, Math.PI / 3, Math.PI / 2, Math.PI, -Math.PI / 4]) {
        const hit = pushHudImpact(createHudImpactState(0), { kind, severity: 1, bearingRadians: bearing, now: 0 });
        // Stepped in frames, not in one leap: a single huge step is clamped to
        // MAX_DELTA_MS by design, so it would prove nothing about settling.
        const settled = settleOver(hit, 4_000);
        expect(isHudImpactIdle(settled), `${kind}@${bearing}`).toBe(true);
        expect(settled.kind, `${kind}@${bearing}`).toBe('none');
      }
    }
  });

  it('stays stable at a terrible frame rate', () => {
    // 15 fps. The bullet preset is stiff enough that an unsubstepped explicit
    // integrator diverges here; the sub-stepping is what stops it.
    const hit = pushHudImpact(createHudImpactState(0), { kind: 'bullet', severity: 1, bearingRadians: 0, now: 0 });
    const { peakY, state } = simulate(hit, 60, 66);
    expect(Number.isFinite(state.x)).toBe(true);
    expect(peakY).toBeLessThanOrEqual(1);
    expect(isHudImpactIdle(state)).toBe(true);
  });

  it('clamps a long stall instead of integrating a whole tab-away', () => {
    const hit = pushHudImpact(createHudImpactState(0), { kind: 'explosion', severity: 1, bearingRadians: 0, now: 0 });
    const stalled = stepHudImpact(hit, 30_000);
    expect(Number.isFinite(stalled.x)).toBe(true);
    expect(Math.abs(stalled.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(stalled.y)).toBeLessThanOrEqual(1);
  });

  it('never reports a value outside the range the CSS is written against', () => {
    let state = createHudImpactState(0);
    // Twenty simultaneous blasts: far beyond anything the game can produce.
    for (let index = 0; index < 20; index += 1) {
      state = pushHudImpact(state, { kind: 'explosion', severity: 1, bearingRadians: index, now: 0 });
    }
    for (let frame = 1; frame <= 200; frame += 1) {
      state = stepHudImpact(state, frame * 16.7);
      expect(Math.abs(state.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(state.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(state.roll)).toBeLessThanOrEqual(1);
      expect(state.chroma).toBeLessThanOrEqual(1);
      expect(state.flash).toBeLessThanOrEqual(1);
    }
  });
});

describe('hud impact response - hostile input cannot break the HUD', () => {
  it('drops non-finite events rather than poisoning the state', () => {
    const base = createHudImpactState(0);
    for (const event of [
      { kind: 'bullet' as const, severity: Number.NaN, bearingRadians: 0, now: 0 },
      { kind: 'bullet' as const, severity: 1, bearingRadians: 0, now: Number.NaN },
      { kind: 'bullet' as const, severity: Number.POSITIVE_INFINITY, bearingRadians: Number.NaN, now: 0 },
      { kind: 'nonsense' as never, severity: 1, bearingRadians: 0, now: 0 },
    ]) {
      const next = pushHudImpact(base, event);
      expect(Number.isFinite(next.vx)).toBe(true);
      expect(Number.isFinite(next.vy)).toBe(true);
      expect(Number.isFinite(next.bearingRadians)).toBe(true);
    }
  });

  it('treats an infinite severity as a full-strength hit, not as infinity', () => {
    const hit = pushHudImpact(createHudImpactState(0), {
      kind: 'bullet', severity: Number.POSITIVE_INFINITY, bearingRadians: 0, now: 0,
    });
    expect(Number.isFinite(hit.vy)).toBe(true);
    expect(hit.vy).toBeLessThanOrEqual(HUD_IMPACT_PRESETS.bullet.kick);
  });

  it('ignores a zero or negative severity', () => {
    const base = createHudImpactState(0);
    expect(pushHudImpact(base, { kind: 'bullet', severity: 0, bearingRadians: 0, now: 0 })).toBe(base);
    expect(pushHudImpact(base, { kind: 'bullet', severity: -5, bearingRadians: 0, now: 0 })).toBe(base);
  });

  it('survives a clock that goes backwards', () => {
    const hit = pushHudImpact(createHudImpactState(1_000), { kind: 'bullet', severity: 1, bearingRadians: 0, now: 1_000 });
    const back = stepHudImpact(hit, 200);
    expect(Number.isFinite(back.x)).toBe(true);
    expect(back.at).toBe(200);
  });
});

describe('hud impact response - the property contract', () => {
  it('writes exactly the six documented properties plus the signature', () => {
    const target = stubTarget();
    const hit = pushHudImpact(createHudImpactState(0), {
      kind: 'explosion', severity: 1, bearingRadians: Math.PI / 2, now: 0,
    });
    writeHudImpactProperties(target, stepHudImpact(hit, 16));
    expect([...target.properties.keys()].sort()).toEqual([
      '--hud-impact-bearing', '--hud-impact-chroma', '--hud-impact-flash',
      '--hud-impact-roll', '--hud-impact-x', '--hud-impact-y',
    ]);
    expect(target.dataset.hudImpact).toBe('explosion');
    // The bearing is the one property with a unit, because CSS rotates by it.
    expect(target.properties.get('--hud-impact-bearing')).toBe('90.0deg');
  });

  it('costs ZERO writes per frame while the HUD is settled', () => {
    // This is the reason the frame loop can call it unconditionally: an idle
    // HUD - almost every frame of a match - touches no style at all.
    const target = stubTarget();
    let state = createHudImpactState(0);
    for (let frame = 1; frame <= 100; frame += 1) state = advanceHudImpact(target, state, frame * 16.7);
    expect(target.writes).toBe(0);
  });

  it('clears the properties exactly once on the settling edge', () => {
    const target = stubTarget();
    let state = pushHudImpact(createHudImpactState(0), { kind: 'bullet', severity: 1, bearingRadians: 0, now: 0 });
    for (let frame = 1; frame <= 300; frame += 1) state = advanceHudImpact(target, state, frame * 16.7);
    expect(isHudImpactIdle(state)).toBe(true);
    // Six properties removed, once - not once per frame for the rest of the match.
    expect(target.removed).toHaveLength(6);
    expect(target.properties.size).toBe(0);
    expect(target.dataset.hudImpact).toBe('none');
  });

  it('writes while ringing', () => {
    const target = stubTarget();
    let state = pushHudImpact(createHudImpactState(0), { kind: 'explosion', severity: 1, bearingRadians: 0, now: 0 });
    state = advanceHudImpact(target, state, 16.7);
    expect(target.writes).toBeGreaterThan(0);
    expect(Number(target.properties.get('--hud-impact-y'))).toBeGreaterThan(0);
  });

  it('serialises every unitless property as a bare number CSS can multiply', () => {
    const target = stubTarget();
    const hit = pushHudImpact(createHudImpactState(0), { kind: 'explosion', severity: 0.7, bearingRadians: 0.5, now: 0 });
    writeHudImpactProperties(target, stepHudImpact(hit, 16));
    for (const property of ['--hud-impact-x', '--hud-impact-y', '--hud-impact-roll', '--hud-impact-chroma', '--hud-impact-flash']) {
      expect(target.properties.get(property)).toMatch(/^-?\d+\.\d{3}$/u);
    }
  });

  it('releases cleanly on demand, for pause, death and possession handover', () => {
    const target = stubTarget();
    writeHudImpactProperties(target, pushHudImpact(createHudImpactState(0), {
      kind: 'bullet', severity: 1, bearingRadians: 0, now: 0,
    }));
    releaseHudImpact(target);
    expect(target.properties.size).toBe(0);
    expect(target.dataset.hudImpact).toBe('none');
  });

  it('works against a target with no dataset', () => {
    const properties = new Map<string, string>();
    const bare = {
      style: {
        setProperty: (key: string, value: string) => { properties.set(key, value); },
        removeProperty: (key: string) => { properties.delete(key); },
      },
    };
    expect(() => writeHudImpactProperties(bare, createHudImpactState(0))).not.toThrow();
    expect(() => releaseHudImpact(bare)).not.toThrow();
  });
});

describe('hud impact response - shake-source classification', () => {
  it('maps every camera-shake source the runtime emits', () => {
    // These six names are CAMERA_SHAKE_SOURCES in src/camera-shake.ts. Keeping
    // the mapping total is what stops a new blast type from silently being
    // felt as a bullet.
    expect(impactKindForShakeSource('near-explosion')).toBe('explosion');
    expect(impactKindForShakeSource('far-explosion')).toBe('explosion');
    expect(impactKindForShakeSource('nuke')).toBe('explosion');
    expect(impactKindForShakeSource('hard-landing')).toBe('fall');
    expect(impactKindForShakeSource('damage-taken')).toBe('bullet');
    expect(impactKindForShakeSource('heavy-weapon-fire')).toBe('bullet');
  });

  it('classifies every declared CAMERA_SHAKE_SOURCES member without guessing', () => {
    // The taxonomy in src/camera-shake.ts is the single authority: every
    // member must resolve through the gate, and the set it covers must stay
    // the six names the runtime emits.
    expect(CAMERA_SHAKE_SOURCES).toEqual([
      'near-explosion', 'far-explosion', 'heavy-weapon-fire', 'damage-taken', 'hard-landing', 'nuke',
    ]);
    for (const source of CAMERA_SHAKE_SOURCES) {
      expect(['bullet', 'explosion', 'fall', 'melee']).toContain(impactKindForShakeSource(source));
    }
  });

  it('falls back to the safest signature for an unknown source', () => {
    expect(impactKindForShakeSource('something-new')).toBe('bullet');
  });
});
