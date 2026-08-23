import { describe, expect, it } from 'vitest';
import {
  applyHudSway,
  createHudSwayState,
  releaseHudSway,
  sampleHudSway,
  shortestAngleDelta,
  type HudSwayState,
} from './pass77-hud-sway';

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
    expect(out.breathe).toBe(0);
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
      expect(out.breathe).toBeGreaterThanOrEqual(0);
      expect(out.breathe).toBeLessThanOrEqual(1);
    }
  });

  it('decays to under a pixel within a third of a second of the camera stopping', () => {
    // A real 15-degree flick spread over four frames, then the player holds.
    let state = createHudSwayState(0, 0);
    let out = sampleHudSway(state, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 });
    for (const yaw of [0.07, 0.14, 0.21, 0.26]) {
      out = sampleHudSway(state, { yaw, pitch: 0, speed: 0, deltaMs: 16 });
      state = out.state;
    }
    expect(Math.abs(out.swayX)).toBeGreaterThan(0.75);

    out = run(state, { yaw: 0.26, pitch: 0, speed: 0 }, 20, 16);
    // 20 frames at 16 ms is 320 ms. 0.1 of full sway is 1px at the largest
    // lag multiplier in pass77-instrument-hud.css, so this is the AGENTS.md
    // "effects sit at the edges and decay fast" requirement, measured.
    expect(Math.abs(out.swayX)).toBeLessThan(0.1);
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
    // A seam crossing must not produce a full-amplitude flick.
    const out = sampleHudSway(createHudSwayState(Math.PI - 0.01, 0), {
      yaw: -Math.PI + 0.01, pitch: 0, speed: 0, deltaMs: 16,
    });
    expect(Math.abs(out.swayX)).toBeLessThan(0.35);
  });

  it('raises breathing with movement and settles it more slowly than look lag', () => {
    const moving = run(createHudSwayState(0, 0), { yaw: 0, pitch: 0, speed: 6 }, 60, 16);
    expect(moving.breathe).toBeGreaterThan(0.9);
    // One frame of standing still must not drop the bob to zero.
    const oneStill = sampleHudSway(moving.state, { yaw: 0, pitch: 0, speed: 0, deltaMs: 16 });
    expect(oneStill.breathe).toBeGreaterThan(0.85);
  });

  it('rejects non-finite input instead of writing NaN into a custom property', () => {
    const { target, written } = recorder();
    applyHudSway(target, createHudSwayState(0, 0), {
      yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY, speed: Number.NaN, deltaMs: Number.NaN,
    });
    for (const value of written.values()) expect(value).toMatch(/^-?\d+\.\d{3}$/);
  });

  it('writes exactly the three properties the sheet consumes', () => {
    const { target, written } = recorder();
    const next = applyHudSway(target, createHudSwayState(0, 0), {
      yaw: 0.4, pitch: 0.1, speed: 3, deltaMs: 16,
    });
    expect([...written.keys()].sort()).toEqual(['--hud-breathe', '--hud-sway-x', '--hud-sway-y']);
    expect(next.yaw).not.toBe(0);
  });

  it('releases to the neutral pose so no residual can freeze on screen', () => {
    const { target, written } = recorder();
    releaseHudSway(target);
    expect(written.get('--hud-sway-x')).toBe('0');
    expect(written.get('--hud-sway-y')).toBe('0');
    expect(written.get('--hud-breathe')).toBe('0');
  });

  it('holds the last residual on a zero-delta frame rather than snapping', () => {
    const state = createHudSwayState(0, 0);
    const held = sampleHudSway(state, { yaw: 0.06, pitch: 0, speed: 0, deltaMs: 0 });
    expect(held.swayX).toBeGreaterThan(0);
    expect(held.state.yaw).toBe(state.yaw);
  });
});
