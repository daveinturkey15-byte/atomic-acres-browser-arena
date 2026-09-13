import { describe, expect, it } from 'vitest';
import {
  CAMERA_SHAKE_MAX_TRAUMA,
  CAMERA_SHAKE_SOURCES,
  CAMERA_SHAKE_SOURCE_PRESETS,
  CAMERA_SHAKE_TRAUMA_EXPONENT,
  addCameraShakeTrauma,
  createCameraShakeTrauma,
  decayCameraShakeTrauma,
  sampleCameraShakeTrauma,
  seededShakeNoise,
  type CameraShakeSource,
  type CameraShakeTraumaSample,
} from './camera-shake';

const FRAME_MS = 16;

function advance(
  state: ReturnType<typeof createCameraShakeTrauma>,
  fromMs: number,
  frames: number,
): { state: ReturnType<typeof createCameraShakeTrauma>; now: number } {
  let current = state;
  let now = fromMs;
  for (let frame = 0; frame < frames; frame += 1) {
    now += FRAME_MS;
    current = decayCameraShakeTrauma(current, now);
  }
  return { state: current, now };
}

function maximumChannel(sample: CameraShakeTraumaSample): number {
  return Math.max(
    Math.abs(sample.offsetX), Math.abs(sample.offsetY), Math.abs(sample.offsetZ),
    Math.abs(sample.pitchRadians), Math.abs(sample.yawRadians), Math.abs(sample.rollRadians),
  );
}

describe('camera shake trauma model (HF-365)', () => {
  it('starts at rest and samples exactly zero on every channel', () => {
    const state = createCameraShakeTrauma(1_000, 7);
    expect(state.trauma).toBe(0);
    const sample = sampleCameraShakeTrauma(state, 1_000);
    expect(sample).toEqual({
      offsetX: 0, offsetY: 0, offsetZ: 0,
      pitchRadians: 0, yawRadians: 0, rollRadians: 0,
      trauma: 0, amplitude: 0,
    });
  });

  it('exposes no aim channel - the sample is presentation only', () => {
    let state = createCameraShakeTrauma(1_000, 3);
    state = addCameraShakeTrauma(state, { source: 'nuke', now: 1_000, seed: 3 });
    const sample = sampleCameraShakeTrauma(state, 1_050);
    // Pinned exactly: adding a yaw/pitch AIM output here would silently start
    // moving the shot away from the crosshair. The camera-facing channels are
    // rotations of the presented view, applied after the authoritative pose.
    expect(Object.keys(sample).sort()).toEqual([
      'amplitude', 'offsetX', 'offsetY', 'offsetZ',
      'pitchRadians', 'rollRadians', 'trauma', 'yawRadians',
    ]);
    expect(Object.isFrozen(sample)).toBe(true);
  });

  describe('decay curve', () => {
    it('bleeds linearly at the source decay rate and reaches exactly zero', () => {
      const preset = CAMERA_SHAKE_SOURCE_PRESETS['damage-taken'];
      let state = createCameraShakeTrauma(1_000);
      state = addCameraShakeTrauma(state, { source: 'damage-taken', now: 1_000 });
      expect(state.trauma).toBeCloseTo(preset.trauma, 6);
      expect(state.decayPerSecond).toBe(preset.decayPerSecond);

      // Linear: after 40ms exactly 40ms worth of trauma is gone.
      const afterOneStep = decayCameraShakeTrauma(state, 1_040);
      expect(afterOneStep.trauma).toBeCloseTo(preset.trauma - preset.decayPerSecond * 0.04, 9);
      const afterTwoSteps = decayCameraShakeTrauma(afterOneStep, 1_080);
      expect(afterTwoSteps.trauma).toBeCloseTo(preset.trauma - preset.decayPerSecond * 0.08, 9);

      // A single step is clamped to 250ms, so a backgrounded tab cannot decay a
      // fresh impulse away in one frame the way an unclamped dt would.
      const slowSource = addCameraShakeTrauma(createCameraShakeTrauma(0), { source: 'nuke', now: 0 });
      const afterOneMinuteGap = decayCameraShakeTrauma(slowSource, 60_000);
      expect(afterOneMinuteGap.trauma)
        .toBeCloseTo(1 - CAMERA_SHAKE_SOURCE_PRESETS.nuke.decayPerSecond * 0.25, 9);

      const settled = advance(state, 1_000, 200);
      expect(settled.state.trauma).toBe(0);
      expect(sampleCameraShakeTrauma(settled.state, settled.now).amplitude).toBe(0);
    });

    it('decays monotonically frame over frame and never goes negative', () => {
      let state = createCameraShakeTrauma(0);
      state = addCameraShakeTrauma(state, { source: 'near-explosion', now: 0, distanceUnits: 0 });
      let previous = state.trauma;
      let now = 0;
      for (let frame = 0; frame < 120; frame += 1) {
        now += FRAME_MS;
        state = decayCameraShakeTrauma(state, now);
        expect(state.trauma).toBeLessThanOrEqual(previous);
        expect(state.trauma).toBeGreaterThanOrEqual(0);
        previous = state.trauma;
      }
      expect(state.trauma).toBe(0);
    });

    it('never exceeds the trauma ceiling however many events land', () => {
      let state = createCameraShakeTrauma(0);
      let now = 0;
      for (let event = 0; event < 40; event += 1) {
        now += 5;
        state = addCameraShakeTrauma(state, { source: 'nuke', now });
        expect(state.trauma).toBeLessThanOrEqual(CAMERA_SHAKE_MAX_TRAUMA);
      }
      // A light source may not push trauma past its own ceiling either.
      let light = createCameraShakeTrauma(0);
      for (let event = 0; event < 40; event += 1) {
        now += 5;
        light = addCameraShakeTrauma(light, { source: 'heavy-weapon-fire', now });
      }
      expect(light.trauma).toBeLessThanOrEqual(CAMERA_SHAKE_SOURCE_PRESETS['heavy-weapon-fire'].maximumTrauma);
    });
  });

  describe('amplitude versus trauma', () => {
    it('is the squared response, not a linear one', () => {
      expect(CAMERA_SHAKE_TRAUMA_EXPONENT).toBe(2);
      let full = createCameraShakeTrauma(0, 11);
      full = addCameraShakeTrauma(full, { source: 'nuke', now: 0, strength: 1, seed: 11 });
      let half = createCameraShakeTrauma(0, 11);
      half = addCameraShakeTrauma(half, { source: 'nuke', now: 0, strength: 0.5, seed: 11 });

      expect(full.trauma).toBeCloseTo(1, 6);
      expect(half.trauma).toBeCloseTo(0.5, 6);
      const fullSample = sampleCameraShakeTrauma(full, 0);
      const halfSample = sampleCameraShakeTrauma(half, 0);
      // Squared: half the trauma is a QUARTER of the motion. A linear model
      // would put this ratio at 0.5 and small hits would read as noise.
      expect(halfSample.amplitude / fullSample.amplitude).toBeCloseTo(0.25, 6);
    });

    it('is strictly monotonic in trauma across the whole range', () => {
      const samples = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((strength) => {
        let state = createCameraShakeTrauma(0, 5);
        state = addCameraShakeTrauma(state, { source: 'nuke', now: 0, strength, seed: 5 });
        return sampleCameraShakeTrauma(state, 0);
      });
      for (let index = 1; index < samples.length; index += 1) {
        expect(samples[index].trauma).toBeGreaterThan(samples[index - 1].trauma);
        expect(samples[index].amplitude).toBeGreaterThan(samples[index - 1].amplitude);
      }
    });

    it('keeps a small source subtle and a big source large at the same seed', () => {
      const at = (source: CameraShakeSource): number => {
        let state = createCameraShakeTrauma(0, 21);
        state = addCameraShakeTrauma(state, { source, now: 0, seed: 21 });
        return maximumChannel(sampleCameraShakeTrauma(state, 8));
      };
      // The whole point of the trauma^2 curve: rifle fire must not read as
      // ordnance, and a nuke must be in a different league entirely.
      expect(at('heavy-weapon-fire')).toBeLessThan(at('damage-taken'));
      expect(at('damage-taken')).toBeLessThan(at('near-explosion'));
      expect(at('near-explosion')).toBeLessThan(at('nuke'));
      expect(at('far-explosion')).toBeLessThan(at('near-explosion'));
    });
  });

  describe('per-source presets', () => {
    it('covers every source with a finite, bounded, frozen preset', () => {
      expect(new Set(CAMERA_SHAKE_SOURCES)).toEqual(new Set(Object.keys(CAMERA_SHAKE_SOURCE_PRESETS)));
      for (const source of CAMERA_SHAKE_SOURCES) {
        const preset = CAMERA_SHAKE_SOURCE_PRESETS[source];
        expect(Object.isFrozen(preset)).toBe(true);
        expect(preset.trauma).toBeGreaterThan(0);
        expect(preset.trauma).toBeLessThanOrEqual(CAMERA_SHAKE_MAX_TRAUMA);
        expect(preset.maximumTrauma).toBeGreaterThanOrEqual(preset.trauma);
        expect(preset.maximumTrauma).toBeLessThanOrEqual(CAMERA_SHAKE_MAX_TRAUMA);
        expect(preset.decayPerSecond).toBeGreaterThan(0);
        for (const value of [preset.positional.x, preset.positional.y, preset.positional.z]) {
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThanOrEqual(0.55);
        }
        for (const value of [preset.rotational.pitch, preset.rotational.yaw, preset.rotational.roll]) {
          expect(value).toBeGreaterThan(0);
          // Roughly 4.6 degrees: a bigger view rotation would fight the player.
          expect(value).toBeLessThanOrEqual(0.08);
        }
        expect(preset.positionalFrequencyHz).toBeGreaterThan(preset.rotationalFrequencyHz);
      }
    });

    it('separates positional from rotational motion instead of scaling one scalar', () => {
      let landing = createCameraShakeTrauma(0, 9);
      landing = addCameraShakeTrauma(landing, { source: 'hard-landing', now: 0, seed: 9 });
      const preset = CAMERA_SHAKE_SOURCE_PRESETS['hard-landing'];
      // A landing is vertical. If one scalar drove every axis this could not hold.
      expect(preset.positional.y).toBeGreaterThan(preset.positional.x * 4);
      expect(preset.positional.y).toBeGreaterThan(preset.positional.z * 4);
      const flinch = CAMERA_SHAKE_SOURCE_PRESETS['damage-taken'];
      // Taking a hit tilts more than it shoves.
      expect(flinch.rotational.roll / flinch.positional.x)
        .toBeGreaterThan(preset.rotational.roll / preset.positional.y);
      expect(landing.positionalFrequencyHz).toBe(preset.positionalFrequencyHz);
    });

    it('falls off with distance only for positional sources', () => {
      const traumaAt = (source: CameraShakeSource, distanceUnits: number): number =>
        addCameraShakeTrauma(createCameraShakeTrauma(0), { source, now: 0, distanceUnits }).trauma;

      expect(traumaAt('near-explosion', 0)).toBeGreaterThan(traumaAt('near-explosion', 9));
      expect(traumaAt('near-explosion', 9)).toBeGreaterThan(traumaAt('near-explosion', 40));
      expect(traumaAt('near-explosion', 9))
        .toBeCloseTo(CAMERA_SHAKE_SOURCE_PRESETS['near-explosion'].trauma * 0.5, 6);
      // A nuke and your own wounds are felt wherever you are standing.
      expect(traumaAt('nuke', 0)).toBe(traumaAt('nuke', 400));
      expect(traumaAt('damage-taken', 0)).toBe(traumaAt('damage-taken', 400));
    });
  });

  describe('seeded determinism', () => {
    it('reproduces identical samples for identical seeds and timelines', () => {
      const run = (): CameraShakeTraumaSample[] => {
        let state = createCameraShakeTrauma(1_000, 1234);
        state = addCameraShakeTrauma(state, {
          source: 'near-explosion', now: 1_000, distanceUnits: 4, seed: 1234,
        });
        const collected: CameraShakeTraumaSample[] = [];
        let now = 1_000;
        for (let frame = 0; frame < 20; frame += 1) {
          now += FRAME_MS;
          state = decayCameraShakeTrauma(state, now);
          collected.push(sampleCameraShakeTrauma(state, now));
        }
        return collected;
      };
      expect(run()).toEqual(run());
    });

    it('produces different motion for different seeds', () => {
      const sampleForSeed = (seed: number): CameraShakeTraumaSample => {
        let state = createCameraShakeTrauma(0, seed);
        state = addCameraShakeTrauma(state, { source: 'near-explosion', now: 0, seed });
        return sampleCameraShakeTrauma(state, 40);
      };
      const first = sampleForSeed(1);
      const second = sampleForSeed(2);
      expect(first.trauma).toBeCloseTo(second.trauma, 9);
      expect(first.offsetX).not.toBe(second.offsetX);
      expect(first.rollRadians).not.toBe(second.rollRadians);
    });

    it('uses smooth seeded noise rather than a per-frame hash', () => {
      // Continuity is the property that separates shake from buzz: a small step
      // in time must produce a small step in value.
      const step = 1 / 64;
      let previous = seededShakeNoise(77, 0);
      for (let index = 1; index <= 256; index += 1) {
        const value = seededShakeNoise(77, index * step);
        expect(Math.abs(value - previous)).toBeLessThan(0.25);
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
        previous = value;
      }
      // And it must be a function of (seed, time) alone.
      expect(seededShakeNoise(77, 3.25)).toBe(seededShakeNoise(77, 3.25));
      expect(seededShakeNoise(77, 3.25)).not.toBe(seededShakeNoise(78, 3.25));
    });
  });

  describe('accessibility', () => {
    it('produces exactly zero motion under reduced motion', () => {
      let state = createCameraShakeTrauma(0, 42);
      state = addCameraShakeTrauma(state, { source: 'nuke', now: 0, seed: 42 });
      for (const now of [0, 8, 40, 120, 400]) {
        const sample = sampleCameraShakeTrauma(state, now, { reducedMotion: true });
        expect(maximumChannel(sample)).toBe(0);
        expect(sample.amplitude).toBe(0);
        expect(sample.trauma).toBe(0);
      }
    });

    it('refuses to accumulate trauma at all under reduced motion or zero intensity', () => {
      const idle = createCameraShakeTrauma(0, 42);
      expect(addCameraShakeTrauma(idle, {
        source: 'nuke', now: 0, preferences: { reducedMotion: true },
      })).toBe(idle);
      expect(addCameraShakeTrauma(idle, {
        source: 'nuke', now: 0, preferences: { intensityScale: 0 },
      })).toBe(idle);
    });

    it('scales every channel by the intensity scale without changing its shape', () => {
      let state = createCameraShakeTrauma(0, 8);
      state = addCameraShakeTrauma(state, { source: 'near-explosion', now: 0, seed: 8 });
      const full = sampleCameraShakeTrauma(state, 24);
      const quarter = sampleCameraShakeTrauma(state, 24, { intensityScale: 0.25 });
      expect(quarter.amplitude).toBeCloseTo(full.amplitude * 0.25, 12);
      expect(quarter.offsetX).toBeCloseTo(full.offsetX * 0.25, 12);
      expect(quarter.offsetY).toBeCloseTo(full.offsetY * 0.25, 12);
      expect(quarter.rollRadians).toBeCloseTo(full.rollRadians * 0.25, 12);
      // Out-of-range scales are clamped rather than trusted.
      expect(sampleCameraShakeTrauma(state, 24, { intensityScale: 9 })).toEqual(full);
      expect(maximumChannel(sampleCameraShakeTrauma(state, 24, { intensityScale: -3 }))).toBe(0);
    });
  });

  it('survives non-finite inputs without throwing or corrupting state', () => {
    const state = createCameraShakeTrauma(1_000, 4);
    expect(addCameraShakeTrauma(state, { source: 'nuke', now: Number.NaN })).toBe(state);
    expect(decayCameraShakeTrauma(state, Number.NaN)).toBe(state);
    const withJunkDistance = addCameraShakeTrauma(state, {
      source: 'near-explosion', now: 1_000, distanceUnits: Number.NaN,
    });
    expect(Number.isFinite(withJunkDistance.trauma)).toBe(true);
    const sample = sampleCameraShakeTrauma(withJunkDistance, 1_020);
    for (const value of Object.values(sample)) expect(Number.isFinite(value)).toBe(true);
    expect(seededShakeNoise(1, Number.NaN)).toBe(0);
  });
});
