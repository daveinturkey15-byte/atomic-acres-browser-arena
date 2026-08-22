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

/** Advance the spring by dt derived from now; returns updated state. */
export function integrateCameraShake(state: CameraShakeState, now: number): CameraShakeState {
  if (!Number.isFinite(now)) return state;
  const dtSeconds = clampFinite((now - state.lastUpdatedMs) / 1000, 0, 0.25);
  if (dtSeconds <= 0) return state;
  const omega = Math.sqrt(CAMERA_SHAKE_STIFFNESS);
  // Semi-implicit Euler: stable enough at frame rates >30fps for this stiffness.
  const acceleration = -CAMERA_SHAKE_STIFFNESS * state.displacement
    - 2 * CAMERA_SHAKE_DAMPING_RATIO * omega * state.velocity;
  const velocity = state.velocity + acceleration * dtSeconds;
  const displacement = state.displacement + velocity * dtSeconds;
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
