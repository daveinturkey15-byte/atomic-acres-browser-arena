/**
 * HF-352 screen feedback: spring-damped camera shake for blast events.
 *
 * Pure math module: no three.js import so it stays unit-testable and
 * allocation-free per sample. The caller (legacy-main, outside this pass's
 * allowlist) applies the returned offsets to its camera each frame.
 *
 * Recipe:
 * - Each blast adds an impulse to a critically-damped-ish spring (stiffness +
 *   damping); displacement decays smoothly without oscillation tailing.
 * - Impulse magnitude scales with 1/distance (clamped), a per-family weight,
 *   and the accessibility sensory scale (reducedSensory clamps hard).
 * - Rotation jitter uses a deterministic hash of the seed so replays and
 *   property tests are reproducible.
 */

export const CAMERA_SHAKE_MIN_IMPULSE = 0.08;
export const CAMERA_SHAKE_MAX_DISPLACEMENT = 0.55;
export const CAMERA_SHAKE_REFERENCE_DISTANCE = 9;
/** Spring stiffness (higher = snappier recovery). */
export const CAMERA_SHAKE_STIFFNESS = 46;
/** Damping ratio; ~1 is critically damped (no visible oscillation tail). */
export const CAMERA_SHAKE_DAMPING_RATIO = 1.05;

export type CameraShakeFamily = 'semtex' | 'crossbow' | 'support';

export type CameraShakeImpulseInput = Readonly<{
  distanceUnits: number;
  family: CameraShakeFamily;
  /** Accessibility sensory scale, 0..1 (1 = full effect). */
  sensoryScale?: number;
  /** Deterministic seed for the rotation jitter (e.g. blast nonce). */
  seed?: number;
  now: number;
}>;

export type CameraShakeSample = Readonly<{
  offsetX: number;
  offsetY: number;
  rollRadians: number;
  /** Remaining energy 0..1; 0 means settled and safe to skip applying. */
  intensity: number;
}>;

export type CameraShakeState = Readonly<{
  displacement: number;
  velocity: number;
  lastUpdatedMs: number;
  seed: number;
}>;

const FAMILY_WEIGHT: Record<CameraShakeFamily, number> = Object.freeze({
  semtex: 1,
  crossbow: 0.72,
  support: 1.35,
});

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Deterministic 32-bit hash → [-1, 1]; same seed always yields same value. */
function seededJitter(seed: number): number {
  let x = (seed | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

export function createCameraShakeState(now = 0): CameraShakeState {
  return Object.freeze({ displacement: 0, velocity: 0, lastUpdatedMs: now, seed: 0 });
}

/** Add a blast impulse; farther blasts shake less, accessibility scales it down. */
export function addCameraShakeImpulse(
  state: CameraShakeState,
  input: CameraShakeImpulseInput,
): CameraShakeState {
  if (!Number.isFinite(input.now)) return state;
  const sensoryScale = clampFinite(input.sensoryScale ?? 1, 0, 1);
  if (sensoryScale <= 0) return state;
  const distance = Math.max(0.01, input.distanceUnits || 0.01);
  // Linear falloff to zero at ~5x reference distance, clamped near-field boost.
  const falloff = clampFinite(CAMERA_SHAKE_REFERENCE_DISTANCE / distance, 0.12, 1.6);
  const magnitude =
    FAMILY_WEIGHT[input.family] * falloff * sensoryScale * CAMERA_SHAKE_MAX_DISPLACEMENT;
  const impulse = Math.max(0, magnitude);
  // Integrate any pending physics first so impulses land on fresh state.
  const integrated = integrateCameraShake(state, input.now);
  return Object.freeze({
    ...integrated,
    velocity: integrated.velocity + impulse,
    seed: input.seed ?? input.now,
  });
}

/**
 * Longest step this integrator may take in one go, in seconds.
 *
 * THE CAMERA THAT FLEW THE PLAYER ACROSS THE MAP. Owner 2026-08-31, on the
 * Chopper Gunner: "when u exit it flies you around like crazy then back to ur
 * body". This constant is why.
 *
 * Semi-implicit Euler on a stiffness-46, ratio-1.05 spring is only stable while
 * the step is small. Measured spectral radius of the state-transition matrix:
 *
 *     dt = 1/120 s   0.962    stable
 *     dt = 1/60  s   0.928    stable
 *     dt = 1/30  s   0.871    stable
 *     dt = 0.05  s   0.823    stable
 *     dt = 0.10  s   0.712    stable
 *     dt = 0.25  s   4.953    DIVERGES
 *
 * The old code clamped dt to 0.25 s, which is on the wrong side of that line.
 * The clamp existed to survive long gaps between frames - and while possessing
 * a killstreak there is nothing BUT long gaps, because `updatePhysics` (which
 * owns the only per-frame integrate/sample call) early-returns for the whole
 * ride while missile impacts keep adding impulses. Each impulse then integrated
 * once at the 0.25 s ceiling and was amplified about fivefold instead of damped.
 * Eight impacts - one chopper ride at the 1 s missile cadence - reach 32,933 m
 * of displacement. On exit that lands in `camera.position` in one frame, then
 * rings back down: exactly "flies you around like crazy then back to ur body".
 *
 * Clamping lower would fix today's symptom and leave the trap armed for the next
 * long gap (an alt-tabbed tab, a loading hitch, a dead player). Substepping
 * removes it: any gap is walked in stable slices, so the spring is stable for
 * every dt by construction.
 */
export const CAMERA_SHAKE_MAX_SUBSTEP_SECONDS = 1 / 120;
/** Longest total gap integrated. Beyond this the spring has long since settled. */
export const CAMERA_SHAKE_MAX_GAP_SECONDS = 0.25;

/** Advance the spring by dt derived from now; returns updated state. */
export function integrateCameraShake(state: CameraShakeState, now: number): CameraShakeState {
  if (!Number.isFinite(now)) return state;
  const dtSeconds = clampFinite((now - state.lastUpdatedMs) / 1000, 0, CAMERA_SHAKE_MAX_GAP_SECONDS);
  if (dtSeconds <= 0) return state;
  const omega = Math.sqrt(CAMERA_SHAKE_STIFFNESS);
  // Walk the gap in slices no larger than the stability bound. At a normal
  // frame time this is a single iteration and behaves exactly as before.
  const steps = Math.max(1, Math.ceil(dtSeconds / CAMERA_SHAKE_MAX_SUBSTEP_SECONDS));
  const step = dtSeconds / steps;
  let displacement = state.displacement;
  let velocity = state.velocity;
  for (let index = 0; index < steps; index += 1) {
    const acceleration = -CAMERA_SHAKE_STIFFNESS * displacement
      - 2 * CAMERA_SHAKE_DAMPING_RATIO * omega * velocity;
    velocity += acceleration * step;
    displacement += velocity * step;
  }
  // Snap tiny residuals to rest so the system actually settles.
  const settled = Math.abs(displacement) < 1e-4 && Math.abs(velocity) < 1e-3;
  return Object.freeze({
    displacement: settled ? 0 : displacement,
    velocity: settled ? 0 : velocity,
    lastUpdatedMs: now,
    seed: state.seed,
  });
}

/** Sample the current offset for rendering; decays to exact zeros when settled. */
export function sampleCameraShake(state: CameraShakeState, now: number): CameraShakeSample {
  const integrated = integrateCameraShake(state, now);
  const intensity = clampFinite(Math.abs(integrated.displacement) / CAMERA_SHAKE_MAX_DISPLACEMENT, 0, 1);
  if (intensity === 0) {
    return Object.freeze({ offsetX: 0, offsetY: 0, rollRadians: 0, intensity: 0 });
  }
  const seedBase = integrated.seed | 0;
  const offsetX = integrated.displacement * seededJitter(seedBase) * 0.6;
  const offsetY = integrated.displacement * seededJitter(seedBase + 101) * 0.45;
  const rollRadians = integrated.displacement * seededJitter(seedBase + 211) * 0.035;
  return Object.freeze({ offsetX, offsetY, rollRadians, intensity });
}

/* ===========================================================================
 * Trauma model (HF-365).
 *
 * The spring above is a single scalar with one impulse shape: every source
 * shakes the same way and only louder. That reads fine for a semtex at 9 m and
 * badly for everything else - a rifle report and a nuke are the same motion.
 *
 * This is the deeper model that presentation should move to. It is ADDITIVE:
 * the spring API stays exactly as it was because legacy-main still drives it,
 * and switching over is a wiring change in a file this pass does not own.
 *
 * Design, in the order it matters:
 *  - TRAUMA, not displacement. One 0..1 energy value that decays linearly to
 *    exactly zero, so the system provably settles and cheap frames can skip it.
 *  - AMPLITUDE = trauma^2. A quadratic response is the whole point: a chip of
 *    trauma from a distant rifle stays a whisper, while a nuke at trauma 1 is
 *    ~11x the motion of the same source at trauma 0.3. Linear response makes
 *    small hits feel noisy and big hits feel small.
 *  - SEEDED NOISE, not per-frame random. Value noise over elapsed time, one
 *    lattice per axis, so the same (seed, elapsed) always yields the same
 *    offsets. Per-frame Math.random cannot be replayed, cannot agree between
 *    networked peers, and produces high-frequency buzz rather than shake.
 *  - POSITIONAL and ROTATIONAL are separate axes with separate frequencies.
 *    A blast punches the camera; a hit tilts it. Driving both from one scalar
 *    is what made every source feel identical.
 *  - PRESENTATION ONLY. The sample carries no aim channel by construction, and
 *    a test pins its exact key set. The shot goes where the crosshair was.
 * ======================================================================== */

/** Amplitude exponent. Squared response is the trauma model's defining property. */
export const CAMERA_SHAKE_TRAUMA_EXPONENT = 2;
/** Hard ceiling on accumulated trauma; nothing may drive the camera past this. */
export const CAMERA_SHAKE_MAX_TRAUMA = 1;

export type CameraShakeSource =
  | 'near-explosion'
  | 'far-explosion'
  | 'heavy-weapon-fire'
  | 'damage-taken'
  | 'hard-landing'
  | 'nuke';

export const CAMERA_SHAKE_SOURCES = Object.freeze([
  'near-explosion', 'far-explosion', 'heavy-weapon-fire', 'damage-taken', 'hard-landing', 'nuke',
] as const);

export type CameraShakeAxisAmplitudes = Readonly<{ x: number; y: number; z: number }>;
export type CameraShakeRotationAmplitudes = Readonly<{ pitch: number; yaw: number; roll: number }>;

export type CameraShakeSourcePreset = Readonly<{
  /** Trauma added by one event at full strength, before falloff and scaling. */
  trauma: number;
  /** Ceiling this source alone may drive trauma to, so rifle fire cannot stack to nuke. */
  maximumTrauma: number;
  /** Linear trauma bleed per second; higher = shorter shake. */
  decayPerSecond: number;
  /** Positional amplitude in world units at trauma 1. */
  positional: CameraShakeAxisAmplitudes;
  /** Rotational amplitude in radians at trauma 1. */
  rotational: CameraShakeRotationAmplitudes;
  /** Noise rate for the positional axes; low = rumble, high = rattle. */
  positionalFrequencyHz: number;
  /** Rotational axes run slower than positional so tilt reads as weight, not buzz. */
  rotationalFrequencyHz: number;
  /**
   * Distance at which a positional source is at half strength, or null when the
   * event is felt by the player regardless of where it happened.
   */
  falloffReferenceUnits: number | null;
}>;

/**
 * Per-source presets. Values are authored against the existing spring ceiling
 * (CAMERA_SHAKE_MAX_DISPLACEMENT 0.55) so the loudest source lands in the same
 * neighbourhood the HUD and viewmodel were already tuned around.
 */
export const CAMERA_SHAKE_SOURCE_PRESETS: Readonly<Record<CameraShakeSource, CameraShakeSourcePreset>> = Object.freeze({
  // A blast inside lethal radius: hard, fast, mostly a shove plus a roll snap.
  'near-explosion': Object.freeze({
    trauma: 0.72, maximumTrauma: 0.95, decayPerSecond: 1.65,
    positional: Object.freeze({ x: 0.30, y: 0.24, z: 0.14 }),
    rotational: Object.freeze({ pitch: 0.030, yaw: 0.024, roll: 0.052 }),
    positionalFrequencyHz: 24, rotationalFrequencyHz: 15,
    falloffReferenceUnits: 9,
  }),
  // Heard-not-felt ordnance. Low frequency, small amplitude, long-ish tail: a
  // rumble that tells you where the fight is without stealing your aim.
  'far-explosion': Object.freeze({
    trauma: 0.26, maximumTrauma: 0.45, decayPerSecond: 1.05,
    positional: Object.freeze({ x: 0.075, y: 0.065, z: 0.05 }),
    rotational: Object.freeze({ pitch: 0.008, yaw: 0.007, roll: 0.011 }),
    positionalFrequencyHz: 11, rotationalFrequencyHz: 7,
    falloffReferenceUnits: 34,
  }),
  // Railgun / minigun class. Decay is deliberately fast so consecutive rounds
  // read as separate punches instead of smearing into one continuous wobble.
  'heavy-weapon-fire': Object.freeze({
    trauma: 0.15, maximumTrauma: 0.38, decayPerSecond: 4.2,
    positional: Object.freeze({ x: 0.055, y: 0.07, z: 0.10 }),
    rotational: Object.freeze({ pitch: 0.016, yaw: 0.009, roll: 0.010 }),
    positionalFrequencyHz: 32, rotationalFrequencyHz: 22,
    falloffReferenceUnits: null,
  }),
  // Taking a hit is a flinch, not a shove: rotation dominates so the frame
  // tilts, and amplitude stays low enough that a return shot is still fair.
  'damage-taken': Object.freeze({
    trauma: 0.30, maximumTrauma: 0.60, decayPerSecond: 2.7,
    positional: Object.freeze({ x: 0.045, y: 0.040, z: 0.030 }),
    rotational: Object.freeze({ pitch: 0.026, yaw: 0.014, roll: 0.034 }),
    positionalFrequencyHz: 19, rotationalFrequencyHz: 13,
    falloffReferenceUnits: null,
  }),
  // Landing is almost entirely vertical; horizontal wobble on a landing reads
  // as a bug rather than as weight.
  'hard-landing': Object.freeze({
    trauma: 0.33, maximumTrauma: 0.55, decayPerSecond: 3.1,
    positional: Object.freeze({ x: 0.030, y: 0.16, z: 0.025 }),
    rotational: Object.freeze({ pitch: 0.022, yaw: 0.005, roll: 0.008 }),
    positionalFrequencyHz: 21, rotationalFrequencyHz: 12,
    falloffReferenceUnits: null,
  }),
  // The only source allowed to reach trauma 1, with the slowest decay in the
  // table. Everything else is calibrated as a fraction of this.
  nuke: Object.freeze({
    trauma: 1, maximumTrauma: 1, decayPerSecond: 0.42,
    positional: Object.freeze({ x: 0.42, y: 0.36, z: 0.26 }),
    rotational: Object.freeze({ pitch: 0.048, yaw: 0.040, roll: 0.070 }),
    positionalFrequencyHz: 9, rotationalFrequencyHz: 6,
    falloffReferenceUnits: null,
  }),
});

export type CameraShakeMotionPreferences = Readonly<{
  /** True when prefers-reduced-motion is set or the player disabled shake. */
  reducedMotion?: boolean;
  /** Player-facing shake strength, 0..1. 0 is equivalent to reduced motion. */
  intensityScale?: number;
}>;

export type CameraShakeTraumaState = Readonly<{
  trauma: number;
  /** Decay inherited from the loudest contributing source, so a nuke stays long. */
  decayPerSecond: number;
  /** Seconds since the state was created; the noise time axis. */
  elapsedSeconds: number;
  /** Noise lattice seed. Deterministic per event, never random. */
  seed: number;
  /** Amplitudes are blended per source so a rifle never inherits a nuke's shape. */
  positional: CameraShakeAxisAmplitudes;
  rotational: CameraShakeRotationAmplitudes;
  positionalFrequencyHz: number;
  rotationalFrequencyHz: number;
  lastUpdatedMs: number;
}>;

export type CameraShakeTraumaSample = Readonly<{
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  pitchRadians: number;
  yawRadians: number;
  rollRadians: number;
  /** Remaining trauma 0..1 after preferences; 0 means safe to skip applying. */
  trauma: number;
  /** trauma^2 after the intensity scale - the value every channel is scaled by. */
  amplitude: number;
}>;

export type CameraShakeTraumaInput = Readonly<{
  source: CameraShakeSource;
  now: number;
  /** Distance to the event; ignored by sources with no falloff reference. */
  distanceUnits?: number;
  /** Event-specific strength 0..1 (e.g. fraction of health lost). */
  strength?: number;
  /** Deterministic seed, e.g. a blast nonce. Never a random number. */
  seed?: number;
  preferences?: CameraShakeMotionPreferences;
}>;

const ZERO_POSITIONAL: CameraShakeAxisAmplitudes = Object.freeze({ x: 0, y: 0, z: 0 });
const ZERO_ROTATIONAL: CameraShakeRotationAmplitudes = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });

const IDLE_TRAUMA_SAMPLE: CameraShakeTraumaSample = Object.freeze({
  offsetX: 0, offsetY: 0, offsetZ: 0,
  pitchRadians: 0, yawRadians: 0, rollRadians: 0,
  trauma: 0, amplitude: 0,
});

/** Deterministic 32-bit lattice value in [-1, 1]; the noise building block. */
function latticeValue(seed: number, lattice: number): number {
  let x = Math.imul((seed | 0) ^ 0x27d4eb2d, 0x165667b1) + (lattice | 0);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

/**
 * Smoothed 1-D value noise. Interpolating between lattice values with a
 * smoothstep is what turns a hash into shake: raw hashes per frame are white
 * noise, which reads as a buzzing camera rather than a shaken one.
 */
export function seededShakeNoise(seed: number, time: number): number {
  if (!Number.isFinite(time)) return 0;
  const lattice = Math.floor(time);
  const fraction = time - lattice;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const low = latticeValue(seed, lattice);
  const high = latticeValue(seed, lattice + 1);
  return low + (high - low) * eased;
}

function resolveIntensityScale(preferences: CameraShakeMotionPreferences | undefined): number {
  if (preferences?.reducedMotion) return 0;
  return clampFinite(preferences?.intensityScale ?? 1, 0, 1);
}

export function createCameraShakeTrauma(now = 0, seed = 0): CameraShakeTraumaState {
  return Object.freeze({
    trauma: 0,
    decayPerSecond: CAMERA_SHAKE_SOURCE_PRESETS['damage-taken'].decayPerSecond,
    elapsedSeconds: 0,
    seed: seed | 0,
    positional: ZERO_POSITIONAL,
    rotational: ZERO_ROTATIONAL,
    positionalFrequencyHz: 0,
    rotationalFrequencyHz: 0,
    lastUpdatedMs: Number.isFinite(now) ? now : 0,
  });
}

/** Advance trauma to `now`. Linear bleed reaches exactly zero, so it settles. */
export function decayCameraShakeTrauma(state: CameraShakeTraumaState, now: number): CameraShakeTraumaState {
  if (!Number.isFinite(now)) return state;
  // Clamped like the spring integrator: a tab that was backgrounded for a
  // minute must not decay a fresh impulse away, nor integrate a huge step.
  const dtSeconds = clampFinite((now - state.lastUpdatedMs) / 1000, 0, 0.25);
  if (dtSeconds <= 0) return state;
  const trauma = Math.max(0, state.trauma - state.decayPerSecond * dtSeconds);
  return Object.freeze({
    ...state,
    trauma,
    elapsedSeconds: state.elapsedSeconds + dtSeconds,
    lastUpdatedMs: now,
  });
}

/**
 * Add trauma from one source. Amplitudes blend toward the incoming source in
 * proportion to how much of the resulting trauma it contributed, so a rifle
 * shot during a nuke does not inherit the nuke's shape and vice versa.
 */
export function addCameraShakeTrauma(
  state: CameraShakeTraumaState,
  input: CameraShakeTraumaInput,
): CameraShakeTraumaState {
  if (!Number.isFinite(input.now)) return state;
  const preset = CAMERA_SHAKE_SOURCE_PRESETS[input.source];
  if (!preset) return state;
  // Reduced motion refuses the trauma outright rather than only zeroing the
  // sample: state that can never be seen is state that should not accumulate.
  if (resolveIntensityScale(input.preferences) <= 0) return state;
  const decayed = decayCameraShakeTrauma(state, input.now);
  const strength = clampFinite(input.strength ?? 1, 0, 1);
  const falloff = preset.falloffReferenceUnits === null
    ? 1
    // Half strength at the reference distance, near zero by 4x it. Positional
    // sources only: a nuke, or a bullet in your own chest, is felt anywhere.
    // clampFinite, not Math.max: a NaN distance from a half-initialised
    // emitter must read as "at the listener", never poison trauma with NaN.
    : 1 / (1 + Math.pow(clampFinite(input.distanceUnits ?? 0, 0, 1e6) / preset.falloffReferenceUnits, 1.6));
  const added = preset.trauma * strength * falloff;
  if (added <= 0) return decayed;
  const trauma = Math.min(
    CAMERA_SHAKE_MAX_TRAUMA,
    Math.max(decayed.trauma, Math.min(preset.maximumTrauma, decayed.trauma + added)),
  );
  const blend = trauma <= 0 ? 1 : clampFinite(added / trauma, 0, 1);
  const mix = (previous: number, next: number): number => previous + (next - previous) * blend;
  return Object.freeze({
    trauma,
    // The loudest contributor owns the tail; a rifle must not cut a nuke short.
    decayPerSecond: blend >= 0.5 ? preset.decayPerSecond : Math.min(decayed.decayPerSecond, preset.decayPerSecond),
    elapsedSeconds: decayed.elapsedSeconds,
    seed: (input.seed ?? decayed.seed) | 0,
    positional: Object.freeze({
      x: mix(decayed.positional.x, preset.positional.x),
      y: mix(decayed.positional.y, preset.positional.y),
      z: mix(decayed.positional.z, preset.positional.z),
    }),
    rotational: Object.freeze({
      pitch: mix(decayed.rotational.pitch, preset.rotational.pitch),
      yaw: mix(decayed.rotational.yaw, preset.rotational.yaw),
      roll: mix(decayed.rotational.roll, preset.rotational.roll),
    }),
    positionalFrequencyHz: mix(decayed.positionalFrequencyHz, preset.positionalFrequencyHz),
    rotationalFrequencyHz: mix(decayed.rotationalFrequencyHz, preset.rotationalFrequencyHz),
    lastUpdatedMs: input.now,
  });
}

/**
 * Sample presentation offsets. This is the only place amplitude is computed,
 * and it carries no aim channel by construction: shake is applied to the camera
 * after the authoritative yaw/pitch have already resolved the shot.
 */
export function sampleCameraShakeTrauma(
  state: CameraShakeTraumaState,
  now: number,
  preferences?: CameraShakeMotionPreferences,
): CameraShakeTraumaSample {
  const intensityScale = resolveIntensityScale(preferences);
  if (intensityScale <= 0) return IDLE_TRAUMA_SAMPLE;
  const decayed = decayCameraShakeTrauma(state, now);
  const trauma = clampFinite(decayed.trauma, 0, CAMERA_SHAKE_MAX_TRAUMA);
  if (trauma <= 0) return IDLE_TRAUMA_SAMPLE;
  const amplitude = Math.pow(trauma, CAMERA_SHAKE_TRAUMA_EXPONENT) * intensityScale;
  const seed = decayed.seed | 0;
  const positionalTime = decayed.elapsedSeconds * decayed.positionalFrequencyHz;
  const rotationalTime = decayed.elapsedSeconds * decayed.rotationalFrequencyHz;
  // Distinct seed offsets per axis; sharing one lattice would make every axis
  // move in lockstep, which reads as a zoom rather than a shake.
  return Object.freeze({
    offsetX: amplitude * decayed.positional.x * seededShakeNoise(seed + 17, positionalTime),
    offsetY: amplitude * decayed.positional.y * seededShakeNoise(seed + 101, positionalTime),
    offsetZ: amplitude * decayed.positional.z * seededShakeNoise(seed + 211, positionalTime),
    pitchRadians: amplitude * decayed.rotational.pitch * seededShakeNoise(seed + 307, rotationalTime),
    yawRadians: amplitude * decayed.rotational.yaw * seededShakeNoise(seed + 401, rotationalTime),
    rollRadians: amplitude * decayed.rotational.roll * seededShakeNoise(seed + 509, rotationalTime),
    trauma,
    amplitude,
  });
}
