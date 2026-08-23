import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addCameraShakeTrauma,
  createCameraShakeTrauma,
  sampleCameraShakeTrauma,
} from '../camera-shake';
import {
  FEEL_CENTRE_SAFE_RADIUS_FRACTION,
  FEEL_DIRECTION_LEGIBILITY_FLOOR,
  FEEL_MAX_COMBINED_OVERLAY,
  combatSafetyReport,
  feelOverlayGeometry,
  createFeelState,
  resolveFeelScales,
  sampleFeel,
  stepFeel,
  type DamageImpactEvent,
  type FeelPreferences,
  type FeelState,
  type FeelStepInput,
} from './index';

const bullet = (overrides: Partial<DamageImpactEvent> = {}): DamageImpactEvent => ({
  amount: 28,
  bearingRadians: -2.1,
  source: 'bullet',
  healthFraction: 0.6,
  ...overrides,
});

function drive(
  steps: readonly FeelStepInput[],
  seed = 7,
  initialHealth = 1,
): { state: FeelState; frames: ReturnType<typeof stepFeel>['frame'][] } {
  let state = createFeelState(initialHealth, seed);
  const frames: ReturnType<typeof stepFeel>['frame'][] = [];
  for (const step of steps) {
    const result = stepFeel(state, step);
    state = result.state;
    frames.push(result.frame);
  }
  return { state, frames };
}

const idleStep = (healthFraction: number, dtSeconds = 1 / 60): FeelStepInput =>
  ({ dtSeconds, healthFraction });

describe('one-call reducer', () => {
  it('produces every channel the HUD, camera and audio need from a single step', () => {
    const { frames } = drive([{ dtSeconds: 1 / 60, healthFraction: 0.5, events: [bullet()] }]);
    const frame = frames[0];
    expect(frame.shakeRequests.length).toBe(1);
    expect(frame.shakeRequests[0].source).toBe('damage-taken');
    expect(frame.directions.length).toBe(1);
    expect(frame.directions[0].bearingRadians).toBeCloseTo(-2.1, 10);
    expect(frame.edgeImpact).toBeGreaterThan(0);
    expect(frame.chromatic).toBeGreaterThan(0);
    expect(frame.audioLowPass).toBeGreaterThan(0);
    expect(frame.heartbeatHz).toBeGreaterThan(0);
    expect(frame.centreSafeRadiusFraction).toBe(FEEL_CENTRE_SAFE_RADIUS_FRACTION);
    expect(frame.idle).toBe(false);
    expect(combatSafetyReport(frame)).toEqual([]);
  });

  it('returns to idle after the fight, so the overlay path can be skipped', () => {
    let state = stepFeel(createFeelState(1, 3), {
      dtSeconds: 1 / 60, healthFraction: 1, events: [bullet({ amount: 60, healthFraction: 1 })],
    }).state;
    let frame = sampleFeel(state);
    for (let index = 0; index < 900; index += 1) {
      const result = stepFeel(state, idleStep(1));
      state = result.state;
      frame = result.frame;
    }
    expect(frame.idle).toBe(true);
    expect(frame.edgeImpact).toBe(0);
    expect(frame.chromatic).toBe(0);
    expect(frame.directions).toEqual([]);
    expect(frame.shakeRequests).toEqual([]);
  });

  it('emits shake requests that the existing trauma model accepts unchanged', () => {
    const { frames } = drive([{
      dtSeconds: 1 / 60,
      healthFraction: 0.4,
      nowMs: 1_000,
      events: [bullet({ source: 'explosion', amount: 70, distanceUnits: 5 })],
    }]);
    let trauma = createCameraShakeTrauma(1_000, 11);
    for (const request of frames[0].shakeRequests) trauma = addCameraShakeTrauma(trauma, request);
    const sample = sampleCameraShakeTrauma(trauma, 1_010);
    expect(sample.trauma).toBeGreaterThan(0);
    expect(sample.amplitude).toBeGreaterThan(0);
    expect(Number.isFinite(sample.offsetX)).toBe(true);
  });

  it('a fall shakes the camera but never draws a damage arrow', () => {
    const { frames } = drive([{
      dtSeconds: 1 / 60, healthFraction: 0.7, events: [bullet({ source: 'fall', amount: 30 })],
    }]);
    expect(frames[0].shakeRequests[0].source).toBe('hard-landing');
    expect(frames[0].directions).toEqual([]);
  });
});

describe('frame-rate independence', () => {
  it('the same elapsed time in 1 step and in 10 gives the same frame', () => {
    const event = bullet({ source: 'explosion', amount: 80, healthFraction: 0.35 });
    const seeded = stepFeel(createFeelState(0.35, 5), {
      dtSeconds: 1 / 120, healthFraction: 0.35, events: [event], nowMs: 0,
    }).state;

    const single = stepFeel(seeded, { dtSeconds: 0.6, healthFraction: 0.35 }).frame;
    let manyState = seeded;
    let many = single;
    for (let index = 0; index < 10; index += 1) {
      const result = stepFeel(manyState, { dtSeconds: 0.06, healthFraction: 0.35 });
      manyState = result.state;
      many = result.frame;
    }
    // Decaying levels are exactly composable; only the oscillator phases carry
    // a (second-order, sub-microsecond-of-beat) integration tolerance.
    expect(many.edgeImpact).toBeCloseTo(single.edgeImpact, 10);
    expect(many.chromatic).toBeCloseTo(single.chromatic, 10);
    expect(many.desaturation).toBeCloseTo(single.desaturation, 10);
    expect(many.audioLowPass).toBeCloseTo(single.audioLowPass, 10);
    expect(many.vignette).toBeCloseTo(single.vignette, 10);
    expect(many.overlayLoad).toBeCloseTo(single.overlayLoad, 10);
    expect(many.directions[0].intensity).toBeCloseTo(single.directions[0].intensity, 10);
    expect(many.heartbeatHz).toBeCloseTo(single.heartbeatHz, 10);
    expect(many.heartbeatGain).toBeCloseTo(single.heartbeatGain, 4);
  });

  it('an uneven partition of the same elapsed time also agrees', () => {
    const seeded = stepFeel(createFeelState(0.5, 2), {
      dtSeconds: 1 / 120, healthFraction: 0.5, events: [bullet({ amount: 40 })],
    }).state;
    const single = stepFeel(seeded, { dtSeconds: 0.48, healthFraction: 0.5 }).frame;
    let state = seeded;
    let frame = single;
    for (const dtSeconds of [0.004, 0.021, 0.1, 0.05, 0.05, 0.15, 0.008, 0.097]) {
      const result = stepFeel(state, { dtSeconds, healthFraction: 0.5 });
      state = result.state;
      frame = result.frame;
    }
    expect(frame.edgeImpact).toBeCloseTo(single.edgeImpact, 10);
    expect(frame.audioLowPass).toBeCloseTo(single.audioLowPass, 10);
    expect(frame.directions[0].intensity).toBeCloseTo(single.directions[0].intensity, 10);
  });
});

describe('intensity caps under damage spam', () => {
  const spam = (count: number, event: Partial<DamageImpactEvent>) => {
    let state = createFeelState(0.5, 9);
    let frame = sampleFeel(state);
    for (let index = 0; index < count; index += 1) {
      const result = stepFeel(state, {
        dtSeconds: 1 / 120,
        healthFraction: 0.5,
        events: [bullet({ ...event, bearingRadians: index })],
      });
      state = result.state;
      frame = result.frame;
    }
    return frame;
  };

  it('more hits read louder, up to the cap and never past it', () => {
    const light = { amount: 14, healthFraction: 0.5 } as const;
    const one = spam(1, light);
    const three = spam(3, light);
    const thirty = spam(30, light);
    expect(three.overlayLoad).toBeGreaterThan(one.overlayLoad);
    expect(thirty.overlayLoad).toBeGreaterThanOrEqual(three.overlayLoad);
    for (const frame of [one, three, thirty]) {
      expect(combatSafetyReport(frame)).toEqual([]);
      expect(frame.overlayLoad).toBeLessThanOrEqual(FEEL_MAX_COMBINED_OVERLAY + 1e-9);
    }
  });

  it('three point-blank explosions are no worse than one: the cap absorbs them', () => {
    const blast = { source: 'explosion', amount: 90, healthFraction: 0.2 } as const;
    const one = spam(1, blast);
    const three = spam(3, blast);
    const thirty = spam(30, blast);
    // A point-blank grenade already saturates the combined budget, so the
    // second and thirtieth cannot add a single pixel of opacity on top.
    expect(one.overlayLoad).toBeCloseTo(FEEL_MAX_COMBINED_OVERLAY, 9);
    expect(thirty.overlayLoad).toBeCloseTo(one.overlayLoad, 9);
    for (const frame of [one, three, thirty]) {
      expect(combatSafetyReport(frame)).toEqual([]);
      expect(frame.edgeImpact).toBeLessThan(0.55);
      expect(frame.desaturation).toBeLessThan(0.45);
    }
  });

  it('holds the cap while critical, which is when every channel is loudest', () => {
    let state = createFeelState(0.08, 4);
    for (let index = 0; index < 240; index += 1) {
      const result = stepFeel(state, {
        dtSeconds: 1 / 60,
        healthFraction: 0.08,
        events: index % 6 === 0
          ? [bullet({ source: 'fire', amount: 6, healthFraction: 0.08, bearingRadians: 1.4 })]
          : [],
      });
      state = result.state;
      expect(combatSafetyReport(result.frame)).toEqual([]);
    }
  });

  it('the global intensity scale is monotonic and 0 silences every effect channel', () => {
    const at = (intensityScale: number) => stepFeel(createFeelState(0.3, 1), {
      dtSeconds: 1 / 60,
      healthFraction: 0.3,
      events: [bullet({ source: 'explosion', amount: 80, healthFraction: 0.3 })],
      preferences: { intensityScale },
    }).frame;
    let previous = -1;
    for (const scale of [0, 0.25, 0.5, 0.75, 1]) {
      const frame = at(scale);
      expect(frame.overlayLoad).toBeGreaterThanOrEqual(previous);
      previous = frame.overlayLoad;
    }
    const silent = at(0);
    expect(silent.edgeImpact).toBe(0);
    expect(silent.chromatic).toBe(0);
    expect(silent.desaturation).toBe(0);
    expect(silent.audioLowPass).toBe(0);
    expect(silent.shakeRequests).toEqual([]);
    // ...but the information survives.
    expect(silent.directions.length).toBe(1);
    expect(silent.directions[0].intensity).toBeGreaterThan(0);
  });
});

describe('reduced motion', () => {
  const shot: FeelStepInput = {
    dtSeconds: 1 / 60,
    healthFraction: 0.18,
    events: [bullet({ amount: 55, bearingRadians: 2.4, healthFraction: 0.18 })],
  };

  const both: readonly FeelPreferences[] = [
    { reducedMotion: true },
    { reducedSensory: true },
    { reducedMotion: true, reducedSensory: true },
  ];

  it('either switch alone is enough to gate every motion effect', () => {
    for (const preferences of both) {
      const scales = resolveFeelScales(preferences);
      expect(scales.reducedMotion).toBe(true);
      expect(scales.motionScale).toBe(0);
      const frame = stepFeel(createFeelState(0.18, 6), { ...shot, preferences }).frame;
      expect(frame.shakeRequests).toEqual([]);
      expect(frame.hudPulse).toBe(0);
      expect(frame.criticalPulse).toBe(0);
      expect(combatSafetyReport(frame)).toEqual([]);
    }
  });

  it('zeroes motion but keeps the direction you were shot from', () => {
    const full = stepFeel(createFeelState(0.18, 6), shot).frame;
    for (const preferences of both) {
      const reduced = stepFeel(createFeelState(0.18, 6), { ...shot, preferences }).frame;
      expect(reduced.directions.length).toBe(full.directions.length);
      // The bearing is never scaled, dimmed or rounded away.
      expect(reduced.directions[0].bearingRadians).toBe(full.directions[0].bearingRadians);
      expect(reduced.directions[0].source).toBe(full.directions[0].source);
      expect(reduced.directions[0].intensity).toBeGreaterThanOrEqual(
        full.directions[0].intensity * FEEL_DIRECTION_LEGIBILITY_FLOOR,
      );
      // And the critical state stays readable as a steady level.
      expect(reduced.criticalLevel).toBe(full.criticalLevel);
      expect(reduced.critical).toBe(full.critical);
    }
  });

  it('keeps direction legible even at intensityScale 0 with reduced motion on', () => {
    const frame = stepFeel(createFeelState(0.18, 6), {
      ...shot,
      preferences: { reducedMotion: true, reducedSensory: true, intensityScale: 0 },
    }).frame;
    expect(frame.directions.length).toBe(1);
    expect(frame.directions[0].intensity).toBeGreaterThan(0.3);
    expect(frame.directions[0].bearingRadians).toBeCloseTo(2.4, 10);
    expect(frame.shakeRequests).toEqual([]);
    expect(frame.hudPulse).toBe(0);
  });

  it('reduced sensory silences the heartbeat mix, reduced motion alone does not', () => {
    const script = (preferences?: FeelPreferences) => {
      let state = createFeelState(0.12, 8);
      let frame = sampleFeel(state, preferences);
      for (let index = 0; index < 300; index += 1) {
        const result = stepFeel(state, { dtSeconds: 1 / 60, healthFraction: 0.12, preferences });
        state = result.state;
        if (result.frame.heartbeatGain > frame.heartbeatGain) frame = result.frame;
      }
      return frame;
    };
    expect(script().heartbeatGain).toBeGreaterThan(0);
    expect(script({ reducedMotion: true }).heartbeatGain).toBeGreaterThan(0);
    expect(script({ reducedSensory: true }).heartbeatGain).toBe(0);
  });
});

describe('overlay geometry', () => {
  // The AGENTS.md visual-review viewports.
  const VIEWPORTS = [
    { name: '1280x720', width: 1280, height: 720 },
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '3440x1440-ultrawide', width: 3440, height: 1440 },
  ] as const;

  it('keeps the aiming zone clear and the indicator ring inside the tint at every viewport', () => {
    for (const viewport of VIEWPORTS) {
      const geometry = feelOverlayGeometry(viewport.width, viewport.height);
      expect(geometry.centreXPx, viewport.name).toBe(viewport.width / 2);
      expect(geometry.centreYPx, viewport.name).toBe(viewport.height / 2);
      // Nothing is drawn inside the crosshair zone...
      expect(geometry.crosshairClearRadiusPx, viewport.name).toBeGreaterThan(0);
      // ...the indicator ring is outside it...
      expect(geometry.directionRingRadiusPx, viewport.name)
        .toBeGreaterThan(geometry.crosshairClearRadiusPx * 2);
      // ...and the tint starts outside the ring, so an indicator is never
      // drawn on top of blood spatter or vice versa.
      expect(geometry.innerRadiusPx, viewport.name).toBeGreaterThan(geometry.directionRingRadiusPx);
      expect(geometry.outerRadiusPx, viewport.name).toBeGreaterThan(geometry.innerRadiusPx);
    }
  });

  it('is keyed to half-height, so ultrawide gets side tint and not centre tint', () => {
    const wide = feelOverlayGeometry(3440, 1440);
    const standard = feelOverlayGeometry(1920, 1080);
    // Same height class => same inner radius regardless of how wide the display
    // is. A diagonal-keyed gradient would fail this and creep into the frame.
    expect(feelOverlayGeometry(5120, 1440).innerRadiusPx).toBe(wide.innerRadiusPx);
    expect(wide.innerRadiusPx / 720).toBeCloseTo(standard.innerRadiusPx / 540, 12);
    // The vertical centre band stays untinted all the way to the side edges.
    expect(wide.innerRadiusPx).toBeLessThan(3440 / 2);
  });

  it('survives a degenerate viewport instead of emitting NaN into CSS', () => {
    for (const geometry of [feelOverlayGeometry(0, 0), feelOverlayGeometry(Number.NaN, -5)]) {
      for (const value of Object.values(geometry)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(geometry.outerRadiusPx).toBeGreaterThan(geometry.innerRadiusPx);
    }
  });
});

describe('determinism', () => {
  it('identical input sequences produce identical states and frames', () => {
    const script = (): { state: FeelState; frames: unknown[] } => {
      const steps: FeelStepInput[] = [];
      for (let index = 0; index < 120; index += 1) {
        steps.push({
          dtSeconds: 1 / 60,
          healthFraction: Math.max(0.05, 1 - index / 130),
          nowMs: index * (1000 / 60),
          events: index % 17 === 0
            ? [bullet({
              amount: 18 + index,
              bearingRadians: index * 0.37 - Math.PI,
              source: index % 34 === 0 ? 'explosion' : 'bullet',
              healthFraction: Math.max(0.05, 1 - index / 130),
            })]
            : [],
        });
      }
      const result = drive(steps, 42);
      return { state: result.state, frames: result.frames };
    };
    expect(script()).toEqual(script());
  });

  it('uses no ambient randomness or clock of its own', () => {
    for (const file of ['index.ts', 'impact-response.ts', 'health-state.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toContain('Math.random');
      expect(source).not.toContain('Date.now');
      expect(source).not.toContain('performance.now');
    }
  });

  it('carries no aim, position or input channel that could affect a shot', () => {
    const frame = stepFeel(createFeelState(0.5, 1), {
      dtSeconds: 1 / 60, healthFraction: 0.5, events: [bullet()],
    }).frame;
    for (const key of Object.keys(frame)) {
      expect(/yaw|pitch|aim|recoil|sensitivit|offset/i.test(key), key).toBe(false);
    }
  });
});
