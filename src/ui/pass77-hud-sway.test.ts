import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyHudSway,
  createHudSwayState,
  releaseHudSway,
  sampleHudSway,
  shortestAngleDelta,
  type HudSwayState,
} from './pass77-hud-sway';

/**
 * The sheet this module feeds. Read here so the amplitude assertions below are
 * expressed in real screen pixels against the real CSS constants, instead of
 * against a magic number that quietly stops tracking the sheet.
 */
const sheet = readFileSync(new URL('./pass77-instrument-hud.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//gu, '');

/** Travel in px per unit of `--p77-lag`, read straight out of the sheet. */
const SWAY_TRAVEL_PX = Number(/--p77-sway-travel:\s*([0-9.]+)px/u.exec(sheet)?.[1]);
/** The largest depth rank any cluster carries. */
const MAX_LAG = Math.max(...[...sheet.matchAll(/--p77-lag:\s*([0-9.]+)/gu)].map((match) => Number(match[1])));
/** Worst-case sway displacement, in px, at full +-1 output. */
const PEAK_SWAY_PX = SWAY_TRAVEL_PX * MAX_LAG;

describe('Pass 77 HUD sway - the sheet and the maths agree', () => {
  it('reads a real travel token and a real lag ceiling out of the sheet', () => {
    expect(Number.isFinite(SWAY_TRAVEL_PX)).toBe(true);
    expect(Number.isFinite(MAX_LAG)).toBe(true);
    expect(MAX_LAG).toBeGreaterThan(0);
  });

  it('moves far enough to be noticed on a 1920px viewport', () => {
    // The audit's measurement of the old sheet: 10 lag x 1px = 10px, which is
    // 0.5% of a 1920px viewport - the "imperceptible" finding. The floor below
    // is what stops that regressing.
    expect(PEAK_SWAY_PX).toBeGreaterThanOrEqual(24);
  });

  it('does not move so far that the HUD leaves its anchor', () => {
    // Amplitude is a fix, not a licence. Past ~48px the clusters visibly
    // detach from the screen edges they are anchored to.
    expect(PEAK_SWAY_PX).toBeLessThanOrEqual(48);
  });
});

function recorder() {
  const written = new Map<string, string>();
  return {
    target: { style: { setProperty: (name: string, value: string) => { written.set(name, value); } } },
    written,
  };
}

/** Drive the filter for `frames` frames at a fixed frame rate. */
function run(
  state: HudSwayState,
  sample: { yaw: number; pitch: number; speed: number },
  frames: number,
  deltaMs: number,
) {
  let current = state;
  let last = sampleHudSway(current, { ...sample, deltaMs });
  for (let index = 0; index < frames; index += 1) {
    last = sampleHudSway(current, { ...sample, deltaMs });
    current = last.state;
  }
  return last;
}

describe('Pass 77 diegetic HUD sway', () => {
  it('reports no sway when the camera is still', () => {
    const state = createHudSwayState(1.2, -0.3);
    const out = sampleHudSway(state, { yaw: 1.2, pitch: -0.3, speed: 0, deltaMs: 16 });
    expect(out.swayX).toBe(0);
    expect(out.swayY).toBe(0);
    // Gait is zero because the player is not moving. Respiration is NOT: see
    // the stationary-breathing block below, which is the defect this fixes.
    expect(out.gait).toBe(0);
  });

  it('trails a turn in the direction of the turn and saturates at one', () => {
    const state = createHudSwayState(0, 0);
    // A large instantaneous yaw change is well past the saturation residual.
    const out = sampleHudSway(state, { yaw: 1.4, pitch: 0, speed: 0, deltaMs: 16 });
    expect(out.swayX).toBe(1);
    const back = sampleHudSway(state, { yaw: -1.4, pitch: 0, speed: 0, deltaMs: 16 });
    expect(back.swayX).toBe(-1);
  });

  it('never exceeds the +-1 contract the CSS lag multipliers assume', () => {
    for (const yaw of [50, -50, 1e9, -1e9]) {
      const out = sampleHudSway(createHudSwayState(0, 0), { yaw, pitch: yaw, speed: 1e9, deltaMs: 1e6 });
      expect(Math.abs(out.swayX)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.swayY)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.breathe)).toBeLessThanOrEqual(1);
      expect(out.gait).toBeGreaterThanOrEqual(0);
      expect(out.gait).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a flick clearly readable and decays to under a pixel within a third of a second', () => {
    // A real 15-degree flick spread over four frames, then the player holds.
    let state = createHudSwayState(0, 0);
    let out = sampleHudSway(state, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 });
    for (const yaw of [0.07, 0.14, 0.21, 0.26]) {
      out = sampleHudSway(state, { yaw, pitch: 0, speed: 0, deltaMs: 16 });
      state = out.state;
    }
    // HF-391: the owner asked for a SMOOTHER interpolation, so visibility is
    // pinned over a short window rather than demanding an instantaneous snap.
    // The peak must still be unmistakable - at least three quarters of full
    // travel - within 250 ms of the flick finishing.
    let peakWithinWindow = 0;
    for (let frame = 0; frame < 16 && peakWithinWindow < 0.75; frame += 1) {
      out = sampleHudSway(state, { yaw: 0.26, pitch: 0, speed: 0, deltaMs: 16 });
      state = out.state;
      peakWithinWindow = Math.max(peakWithinWindow, Math.abs(out.swayX));
    }
    expect(peakWithinWindow).toBeGreaterThan(0.75);

    // AGENTS.md requires HUD effects to sit at the edges and decay fast. That
    // requirement is in PIXELS, so it is measured in pixels against the real
    // CSS ceiling rather than against a normalised fraction - the previous
    // version of this test hard-coded "0.1 of full sway is 1px", which was
    // only true while the travel token was 1px and silently stopped meaning
    // anything the moment the amplitude was raised.
    const settled = run(state, { yaw: 0.26, pitch: 0, speed: 0 }, 32, 16);
    expect(Math.abs(settled.swayX) * PEAK_SWAY_PX).toBeLessThan(1);
  });

  it('is frame-rate independent: 60 fps and 144 fps settle to the same place', () => {
    // Below saturation, so the clamp cannot mask a difference.
    const at60 = run(createHudSwayState(0, 0), { yaw: 0.05, pitch: 0, speed: 0 }, 12, 16.67);
    const at144 = run(createHudSwayState(0, 0), { yaw: 0.05, pitch: 0, speed: 0 }, 29, 6.94);
    expect(Math.abs(at60.swayX)).toBeGreaterThan(0);
    expect(Math.abs(at60.swayX - at144.swayX)).toBeLessThan(0.02);
  });

  it('wraps yaw the short way across the +-PI seam', () => {
    expect(shortestAngleDelta(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(-0.1, 6);
    expect(shortestAngleDelta(-Math.PI + 0.05, Math.PI - 0.05)).toBeCloseTo(0.1, 6);
    // A seam crossing must not produce a full-amplitude flick. The 0.02 rad
    // short-way residual maps to 0.02 / SATURATION_RAD, so this threshold
    // tracks the saturation constant; what it guards is that the seam does not
    // register as the ~6.28 rad long way round, which would clamp to 1.
    const out = sampleHudSway(createHudSwayState(Math.PI - 0.01, 0), {
      yaw: -Math.PI + 0.01, pitch: 0, speed: 0, deltaMs: 16,
    });
    expect(Math.abs(out.swayX)).toBeLessThan(0.5);
  });

  it('raises gait with movement and settles it more slowly than look lag', () => {
    const moving = run(createHudSwayState(0, 0), { yaw: 0, pitch: 0, speed: 6 }, 60, 16);
    expect(moving.gait).toBeGreaterThan(0.9);
    // One frame of standing still must not drop the bob to zero.
    const oneStill = sampleHudSway(moving.state, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 });
    expect(oneStill.gait).toBeGreaterThan(0.85);
  });

  it('rejects non-finite input instead of writing NaN into a custom property', () => {
    const { target, written } = recorder();
    applyHudSway(target, createHudSwayState(0, 0), {
      yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY, speed: Number.NaN, deltaMs: Number.NaN,
    });
    for (const value of written.values()) expect(value).toMatch(/^-?\d+\.\d{3}$/);
  });

  it('writes exactly the four properties the sheet consumes', () => {
    const { target, written } = recorder();
    const next = applyHudSway(target, createHudSwayState(0, 0), {
      yaw: 0.4, pitch: 0.1, speed: 3, deltaMs: 16,
    });
    expect([...written.keys()].sort()).toEqual(['--hud-breathe', '--hud-gait', '--hud-sway-x', '--hud-sway-y']);
    expect(next.yaw).not.toBe(0);
  });

  it('releases to the neutral pose so no residual can freeze on screen', () => {
    const { target, written } = recorder();
    releaseHudSway(target);
    expect(written.get('--hud-sway-x')).toBe('0');
    expect(written.get('--hud-sway-y')).toBe('0');
    expect(written.get('--hud-breathe')).toBe('0');
    expect(written.get('--hud-gait')).toBe('0');
  });

  it('holds the last residual on a zero-delta frame rather than snapping', () => {
    const state = createHudSwayState(0, 0);
    const held = sampleHudSway(state, { yaw: 0.06, pitch: 0, speed: 0, deltaMs: 0 });
    expect(held.swayX).toBeGreaterThan(0);
    expect(held.state.yaw).toBe(state.yaw);
  });
});

/**
 * The two defects the Pass 77 audit reproduced. Both were "the maths is fine
 * but nobody can see it" faults, so both of these assert on PERCEPTIBILITY,
 * not merely on the signal being non-zero.
 */
describe('Pass 77 HUD sway - stationary breathing', () => {
  /** Peak-to-trough of the respiration signal over `seconds` of standing still. */
  function stationarySwing(seconds: number, deltaMs = 16) {
    let state = createHudSwayState(0.8, -0.2);
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += deltaMs) {
      const out = sampleHudSway(state, { yaw: 0.8, pitch: -0.2, speed: 0, deltaMs });
      state = out.state;
      low = Math.min(low, out.breathe);
      high = Math.max(high, out.breathe);
    }
    return { low, high, swing: high - low };
  }

  it('breathes at a full standstill - the exact case that used to read zero', () => {
    // Old behaviour: breathe = speed / 5.5, so speed 0 gave EXACTLY 0 forever
    // and the HUD was frozen solid whenever the player stopped. The owner
    // asked for motion "when you're breathing and when you're stationary".
    const { swing, low, high } = stationarySwing(6);
    expect(swing).toBeGreaterThan(1.9); // very nearly the full -1..1 sweep
    expect(low).toBeLessThan(-0.9);
    expect(high).toBeGreaterThan(0.9);
  });

  it('completes roughly one breath every four to five seconds', () => {
    // A respiration rate a human reads as calm, not as a pulsing UI element.
    let state = createHudSwayState(0, 0);
    let previous = 0;
    let crossings = 0;
    const seconds = 20;
    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 16) {
      const out = sampleHudSway(state, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 });
      state = out.state;
      if (previous <= 0 && out.breathe > 0) crossings += 1;
      previous = out.breathe;
    }
    // 20 s at ~4.5 s per breath is between 3 and 6 full cycles.
    expect(crossings).toBeGreaterThanOrEqual(3);
    expect(crossings).toBeLessThanOrEqual(6);
  });

  it('advances on the clock, not on distance travelled', () => {
    // Two runs of identical duration, one stationary and one sprinting, must
    // reach the same PHASE. If respiration ever gets coupled back to speed,
    // this diverges.
    let still = createHudSwayState(0, 0);
    let sprint = createHudSwayState(0, 0);
    for (let frame = 0; frame < 120; frame += 1) {
      still = sampleHudSway(still, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 }).state;
      sprint = sampleHudSway(sprint, { yaw: 0, pitch: 0, speed: 9, deltaMs: 16 }).state;
    }
    expect(still.phase).toBeCloseTo(sprint.phase, 9);
  });

  it('ducks but never silences respiration at a sprint', () => {
    // Sprinting, the gait bob should dominate - but a sprinting player is
    // breathing harder, not less, so the signal must not vanish.
    let state = createHudSwayState(0, 0);
    let peak = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      const out = sampleHudSway(state, { yaw: 0, pitch: 0, speed: 9, deltaMs: 16 });
      state = out.state;
      peak = Math.max(peak, Math.abs(out.breathe));
    }
    expect(peak).toBeGreaterThan(0.25);
    expect(peak).toBeLessThan(0.5);
  });

  it('is frame-rate independent, so breathing is not faster at 144 fps', () => {
    // Exactly equal total elapsed time on both, or the comparison measures
    // the test's own loop quantisation rather than the filter.
    const drive = (frames: number, deltaMs: number) => {
      let state = createHudSwayState(0, 0);
      for (let frame = 0; frame < frames; frame += 1) {
        state = sampleHudSway(state, { yaw: 0, pitch: 0, speed: 0, deltaMs }).state;
      }
      return state.phase;
    };
    expect(drive(180, 16.6667)).toBeCloseTo(drive(432, 6.9444), 4);
  });
});

describe('Pass 77 HUD sway - amplitude a human can see', () => {
  it('produces most of the range on an ORDINARY tracking turn, not only a flick', () => {
    // The audit's finding was that peak travel was 10px on a 1920px viewport.
    // Half of that was the CSS token; the other half was this filter, which
    // only approached saturation on a deliberate fast flick. A normal
    // 90 deg/s tracking turn must now read clearly.
    let state = createHudSwayState(0, 0);
    let out = sampleHudSway(state, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 });
    const perFrame = (Math.PI / 2) * (16 / 1000); // 90 deg/s
    for (let frame = 1; frame <= 8; frame += 1) {
      out = sampleHudSway(state, { yaw: perFrame * frame, pitch: 0, speed: 0, deltaMs: 16 });
      state = out.state;
    }
    expect(Math.abs(out.swayX)).toBeGreaterThan(0.5);
  });

  it('still saturates rather than exceeding the CSS ceiling on a fast flick', () => {
    const out = sampleHudSway(createHudSwayState(0, 0), { yaw: 2.5, pitch: 1.2, speed: 0, deltaMs: 16 });
    expect(out.swayX).toBe(1);
    expect(out.swayY).toBe(1);
  });
});

/**
 * HF-391 pins. The owner measured the HUD as "bouncing around maybe double
 * the speed it should" and INCONSISTENT between maps (worst on High Seas).
 * Measurement (artifacts/hf391/) showed the filter has no per-map signal
 * path - identical scripted input produces near-identical traces on
 * atomic-acres and high-seas - but heavy maps run slower frames with long
 * hitches, and a hitch frame advanced the residual by up to the full 100 ms
 * clamp, slamming the output to the opposite extreme in ONE frame. These
 * tests pin the two fixes: bounded per-frame output motion, and consistency
 * of the deflection under identical look input at different frame pacing.
 */
describe('Pass 77 HUD sway - HF-391 smoothness and cross-map consistency', () => {
  /**
   * swayX trace of a moderate 25 deg/s tracking turn with the given pacing.
   *
   * PASS 81: this used to advance yaw by `0.436 * (Math.min(deltaMs, 33) / 1000)`.
   * That cap made the test lie in the direction that hid the defect: it fed
   * the SLOW run less look travel per frame than the fast one, so the two runs
   * were not "identical look input" at all and the pacing dependence of the
   * deflection could not show up. Real input does not work that way - yaw is
   * advanced per mousemove event (`player.yaw -= event.movementX * ...`,
   * legacy-main.ts), so a long frame accumulates a full frame's worth of mouse
   * delta. The cap is gone; the same 25 deg/s turn is now delivered to every
   * pacing.
   */
  function trackingRun(deltaMsFor: (frame: number) => number, frames = 600) {
    let state = createHudSwayState(0, 0);
    const xs: number[] = [];
    let yaw = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      const deltaMs = Math.min(100, Math.max(0, deltaMsFor(frame)));
      yaw += 0.436 * (deltaMs / 1000); // one turn rate, whatever the pacing
      const out = sampleHudSway(state, { yaw, pitch: 0, speed: 0, deltaMs });
      state = out.state;
      xs.push(out.swayX);
    }
    return xs;
  }

  /** Settled peak |swayX| of a pacing, ignoring the initial ramp. */
  function settledPeak(deltaMsFor: (frame: number) => number): number {
    return Math.max(...trackingRun(deltaMsFor).slice(240).map(Math.abs));
  }

  /** The steady frame rates a player actually sees across this game's maps. */
  const STEADY_PACINGS: ReadonlyArray<readonly [string, number]> = [
    ['144 fps', 6.9], ['60 fps', 16.7], ['40 fps', 25], ['30 fps', 33.3], ['20 fps', 50],
  ];

  it('never moves the output more than 0.3 of travel in a single frame', () => {
    // A direction reversal while fully deflected used to jump the FULL range
    // (2.0 of normalised travel, ~68px at lag 10) inside one frame - the slam
    // the owner reads as bouncing at double speed. This drives a sustained
    // tracking turn that hard-reverses mid-deflection, so the output has to
    // travel from one side to the other without ever exceeding the bound.
    let state = createHudSwayState(0, 0);
    let previous = 0;
    let yaw = 0;
    const omega = 0.6 * (16 / 1000); // fast tracking turn, radians per frame
    for (let frame = 0; frame < 180; frame += 1) {
      yaw += frame < 90 ? omega : -omega;
      const out = sampleHudSway(state, { yaw, pitch: 0, speed: 0, deltaMs: 16 });
      state = out.state;
      if (frame > 0) expect(Math.abs(out.swayX - previous)).toBeLessThanOrEqual(0.301);
      previous = out.swayX;
      if (frame === 89) expect(previous).toBeGreaterThan(0.5); // deflected before the reversal
    }
    // And it must still complete the traverse: smoother, not stuck.
    expect(previous).toBeLessThan(-0.5);
  });

  it('deflects the same amount under identical look input at high-seas-like frame pacing', () => {
    // atomic-acres-like: steady ~60 fps. high-seas-like: ~40 fps with a
    // 100 ms hitch every second. Same head motion, same HUD deflection.
    const smooth = trackingRun(() => 16.7);
    const hitched = trackingRun((frame) => (frame % 48 === 0 ? 100 : 25));
    const smoothMean = smooth.slice(240).reduce((a, b) => a + Math.abs(b), 0) / (smooth.length - 240);
    const hitchedMean = hitched.slice(240).reduce((a, b) => a + Math.abs(b), 0) / (hitched.length - 240);
    // Tightened in Pass 81 (was 0.15) now that the cross-pacing gain is
    // cancelled outright: measured 0.019 between these two runs.
    expect(Math.abs(smoothMean - hitchedMean)).toBeLessThan(0.05);
    // The paced run must also obey the same per-frame bound - no slam frames.
    for (let i = 1; i < hitched.length; i += 1) {
      expect(Math.abs(hitched[i] - hitched[i - 1])).toBeLessThanOrEqual(0.301);
    }
  });

  it('deflects the SAME PEAK amount at every steady frame pacing, not just the same mean', () => {
    // HF-391 (4). The two bounds that existed were a per-frame step bound and
    // a MEAN bound. Neither can see the defect the owner actually described:
    // the same head movement produced a LARGER HUD offset on a map that runs
    // slower. Measured against the unfixed filter, an identical 25 deg/s turn
    // settled at 0.544 of travel at 144 fps and 0.682 at 20 fps - a 25% bigger
    // HUD swing for the same input, purely because the map was heavier.
    //
    // The residual of a first-order lag settles at omega * deltaMs / follow,
    // and deltaMs / follow grows with the frame time; `pacingGain` cancels it.
    const peaks = STEADY_PACINGS.map(([, deltaMs]) => settledPeak(() => deltaMs));
    const spread = Math.max(...peaks) - Math.min(...peaks);
    const labelled = STEADY_PACINGS.map(([name], index) => `${name} ${peaks[index]!.toFixed(4)}`).join(', ');
    expect(spread, `peak deflection must not depend on frame pacing: ${labelled}`).toBeLessThanOrEqual(0.01);
    // And it must still be a visible effect at every one of them, not equal-
    // because-flattened-to-nothing.
    for (const peak of peaks) expect(peak).toBeGreaterThan(0.35);
  });

  it('bounds the PEAK deflection through a hitch, not only the per-frame step', () => {
    // A hitch is the one case the pacing cancellation cannot fully remove: the
    // filter is clamped to MAX_DELTA_MS while the player's mouse kept moving
    // for the whole 100 ms, so the residual genuinely overshoots. What must
    // never come back is the SLAM: measured 0.786 peak / 0.212 per-frame step
    // before the fix, 0.667 / 0.144 after.
    const steady = settledPeak(() => 16.7);
    for (const [name, hitch] of [['40 fps + 100 ms hitch/s', (frame: number) => (frame % 48 === 0 ? 100 : 25)],
      ['144 fps + 100 ms hitch/s', (frame: number) => (frame % 145 === 0 ? 100 : 6.9)]] as const) {
      const peak = settledPeak(hitch as (frame: number) => number);
      expect(peak, `${name} peak ${peak.toFixed(4)}`).toBeLessThanOrEqual(0.7);
      expect(peak - steady, `${name} overshoot over steady ${steady.toFixed(4)}`).toBeLessThanOrEqual(0.15);
    }
  });
});

/**
 * PASS 81 / HF-391 (1) and (2). The owner's report was two things: the HUD
 * bounces about twice as fast as it should, AND it bounces INCONSISTENTLY
 * across maps. The look-lag channel was addressed in Pass 79; these pin the
 * two VERTICAL terms, which are most of what "bounce" means on screen
 * (`pass77-instrument-hud.css`: the vertical offset is the sway-y lag term
 * PLUS `--hud-breathe * 2.6px` PLUS `--hud-gait * 1.8px`).
 */
describe('Pass 77 HUD sway - the vertical bounce terms', () => {
  /** Settled gait after a second of holding one speed. */
  function settledGait(speed: number, maxSpeed?: number): number {
    let state = createHudSwayState(0, 0);
    let gait = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      const out = sampleHudSway(state, { yaw: 0, pitch: 0, speed, maxSpeed, deltaMs: 16.7 });
      state = out.state;
      gait = out.gait;
    }
    return gait;
  }

  it('HF-391: normalises gait against the top speed THIS PLAYER can reach, so identical input bobs identically on every map', () => {
    // The one genuine per-map signal path the HF-391 measurement found. `speed`
    // is a raw world-units-per-second value and it was divided by a FIXED 5.5,
    // so every scale the game applies to the player's own top speed - wading
    // and swimming (High Seas, the map the owner named as worst), a killstreak
    // movement modifier, a heavy weapon's movement multiplier - came straight
    // out as a different amount of vertical bob for the same stick/key input.
    //
    // Against the fixed reference these four cases read 1.000 / 0.727 and
    // 0.559 / 0.364: walking at half your available speed produced 54% more
    // bob on dry land than in water. Normalised, they are equal by construction.
    const dryLandTop = 6.15; // movementProfile({}).maxSpeed, standing, no modifiers
    const wadingTop = 4.0; // the same stance with a wade/swim speed scale applied
    expect(settledGait(dryLandTop, dryLandTop)).toBeCloseTo(settledGait(wadingTop, wadingTop), 6);
    expect(settledGait(dryLandTop / 2, dryLandTop)).toBeCloseTo(settledGait(wadingTop / 2, wadingTop), 6);
    expect(settledGait(dryLandTop / 2, dryLandTop)).toBeCloseTo(0.5, 3);

    // A degenerate reference falls back to the fixed constant rather than
    // dividing a shuffle by ~nothing and reporting a full-amplitude bob.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(settledGait(1, bad), `maxSpeed ${String(bad)}`).toBeCloseTo(settledGait(1), 6);
    }
    expect(settledGait(1)).toBeCloseTo(1 / 5.5, 3);
    // And omitting it keeps the previous fixed reference, so the module stays
    // callable (and honest) from anywhere that has no movement profile to hand.
    expect(settledGait(5.5)).toBeCloseTo(1, 3);
    expect(settledGait(2.75)).toBeCloseTo(0.5, 3);
  });

  it('HF-391: bounds a single frame of BREATHE and GAIT, which had no output bound at all', () => {
    // Only `swayX`/`swayY` went through the Pass 79 output stage; `breathe`
    // and `gait` were returned raw, so the two terms the owner actually reads
    // as bounce were the two with nothing bounding them. Worst single-frame
    // step under a pathological pacing (every frame a 100 ms hitch) with the
    // player slamming between a standstill and a full walk: measured 0.0948
    // breathe / 0.1749 gait unbounded, 0.0677 / 0.1145 through the stage.
    let state = createHudSwayState(0, 0);
    let previousBreathe = 0;
    let previousGait = 0;
    let worstBreathe = 0;
    let worstGait = 0;
    for (let frame = 0; frame < 900; frame += 1) {
      const speed = Math.floor(frame / 4) % 2 ? 6.15 : 0;
      const out = sampleHudSway(state, { yaw: 0, pitch: 0, speed, maxSpeed: 6.15, deltaMs: 100 });
      state = out.state;
      if (frame > 0) {
        worstBreathe = Math.max(worstBreathe, Math.abs(out.breathe - previousBreathe));
        worstGait = Math.max(worstGait, Math.abs(out.gait - previousGait));
      }
      previousBreathe = out.breathe;
      previousGait = out.gait;
    }
    expect(worstBreathe, `breathe step ${worstBreathe.toFixed(4)}`).toBeLessThanOrEqual(0.08);
    expect(worstGait, `gait step ${worstGait.toFixed(4)}`).toBeLessThanOrEqual(0.13);
  });

  it('keeps gait inside 0..1 through the new output stage', () => {
    let state = createHudSwayState(0, 0);
    for (let frame = 0; frame < 400; frame += 1) {
      const out = sampleHudSway(state, {
        yaw: 0, pitch: 0, speed: frame % 3 === 0 ? 40 : 0, maxSpeed: 6.15, deltaMs: 100,
      });
      state = out.state;
      expect(out.gait).toBeGreaterThanOrEqual(0);
      expect(out.gait).toBeLessThanOrEqual(1);
      expect(Math.abs(out.breathe)).toBeLessThanOrEqual(1);
    }
  });
});

describe('Pass 77 HUD sway - the frame-delta clamp matches the rest of the frame', () => {
  // legacy-main.ts feeds this filter `deltaMs: rawFrameMs` - the RAW frame
  // time - while every other consumer in the same loop clamps to 50 ms
  // (`const frameDt = Math.min(0.05, rawFrameMs / 1000)`). The module must
  // therefore treat any delta above 50 ms EXACTLY as 50 ms, so a hitch frame
  // cannot advance the carried orientation, the gait or the respiration phase
  // further than the rest of the frame would allow. Before the HF-391 clamp
  // tightening this failed: MAX_DELTA_MS was 100, so a 120 ms hitch advanced
  // the filter twice as far as the clamped equivalent.
  const HITCH_MS = 120;
  const SAMPLE = { yaw: 0.3, pitch: -0.12, speed: 6 };

  it('advances a raw hitch frame exactly as far as its 50 ms clamped equivalent', () => {
    const raw = sampleHudSway(createHudSwayState(0, 0), { ...SAMPLE, deltaMs: HITCH_MS });
    const clamped = sampleHudSway(createHudSwayState(0, 0), { ...SAMPLE, deltaMs: 50 });
    expect(raw.swayX).toBe(clamped.swayX);
    expect(raw.swayY).toBe(clamped.swayY);
    expect(raw.breathe).toBe(clamped.breathe);
    expect(raw.gait).toBeCloseTo(clamped.gait, 12);
    expect(raw.state.yaw).toBeCloseTo(clamped.state.yaw, 12);
    expect(raw.state.phase).toBeCloseTo(clamped.state.phase, 12);
  });

  it('a mid-turn hitch leaves the same state as the clamped frame would have', () => {
    // Sixty smooth frames of tracking, then one hitch. Whatever the raw delta
    // says, the retained state after it must equal the state the clamped
    // value produces - otherwise hitchy maps visibly snap the HUD further
    // than smooth maps can ever move it.
    let yaw = 0;
    let hitchedState = createHudSwayState(0, 0);
    let clampedState = createHudSwayState(0, 0);
    for (let frame = 0; frame < 60; frame += 1) {
      yaw += 0.25 * (16 / 1000);
      hitchedState = sampleHudSway(hitchedState, { yaw, pitch: 0, speed: 4, deltaMs: 16 }).state;
      clampedState = sampleHudSway(clampedState, { yaw, pitch: 0, speed: 4, deltaMs: 16 }).state;
    }
    const afterHitch = sampleHudSway(hitchedState, { yaw, pitch: 0, speed: 4, deltaMs: HITCH_MS }).state;
    const afterClamped = sampleHudSway(clampedState, { yaw, pitch: 0, speed: 4, deltaMs: 50 }).state;
    expect(afterHitch.yaw).toBeCloseTo(afterClamped.yaw, 12);
    expect(afterHitch.outX ?? 0).toBeCloseTo(afterClamped.outX ?? 0, 12);
    expect(afterHitch.phase).toBeCloseTo(afterClamped.phase, 12);
  });
});
