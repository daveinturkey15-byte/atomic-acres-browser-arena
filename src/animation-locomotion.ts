/**
 * Pass 77 / HF-375. Speed-matched, direction-aware locomotion blending.
 *
 * The problem this exists to solve, measured rather than guessed: every operator
 * locomotion clip is played at timeScale 1, and the clip is chosen from a scalar
 * speed alone. `scripts/blender/measure-pass77-operator-locomotion.py` recovers
 * the ground speed each clip was authored for by taking the median backward
 * ankle velocity over the contact phase - the speed at which a planted foot
 * genuinely stays planted. Those measurements are the constants below.
 *
 * Against them the shipped behaviour skates badly: `Walk` is authored at
 * 1.34 m/s but the runtime plays it up to 3.2 m/s, and the run clips are
 * authored at ~3.08 m/s while a sprinting operator travels at 8.7 m/s. Nothing
 * rescales playback, so the feet slide by the whole difference.
 *
 * Two further failures this module fixes:
 *   - Direction. `Run_Back`, `Run_Left` and `Run_Right` exist in the authored
 *     corpus and are not bound at runtime, so a bot strafing at 4.05 m/s or
 *     retreating at 4.65 m/s plays a FORWARD run. It moonwalks.
 *   - Cadence sync. Cross-fading two clips of different length at independent
 *     playback rates desynchronises their footfalls. Every clip in a blend here
 *     is given the timeScale that puts it on ONE shared stride frequency.
 *
 * Pure and deterministic: no clocks, no randomness, no THREE.
 */

export type LocomotionAxis = 'forward' | 'backward' | 'left' | 'right';

export type LocomotionClipCalibration = Readonly<{
  durationS: number;
  /** Ground speed, m/s, at which this clip's stance foot does not slide. */
  authoredGroundSpeedMps: number;
  axis: LocomotionAxis;
}>;

/**
 * Measured from `public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf`,
 * the licence-vetted source the whole operator skin family is derived from. Every
 * skin shares this skeleton and clip set by catalog contract
 * (`createOperatorSkinCatalog` rejects a divergent rig), so one calibration is
 * correct for all of them. Re-derive with:
 *   python scripts/blender/measure-pass77-operator-locomotion.py
 */
export const OPERATOR_LOCOMOTION_CALIBRATION: Readonly<Record<string, LocomotionClipCalibration>> = Object.freeze({
  Walk: Object.freeze({ durationS: 1.3333, authoredGroundSpeedMps: 1.3416, axis: 'forward' as const }),
  Run: Object.freeze({ durationS: 0.8, authoredGroundSpeedMps: 3.0832, axis: 'forward' as const }),
  Run_Shoot: Object.freeze({ durationS: 0.8333, authoredGroundSpeedMps: 3.0832, axis: 'forward' as const }),
  Run_Back: Object.freeze({ durationS: 0.8333, authoredGroundSpeedMps: 3.1215, axis: 'backward' as const }),
  Run_Left: Object.freeze({ durationS: 0.8, authoredGroundSpeedMps: 3.0856, axis: 'left' as const }),
  Run_Right: Object.freeze({ durationS: 0.8, authoredGroundSpeedMps: 3.0856, axis: 'right' as const }),
});

export type LocomotionPlaybackLimits = Readonly<{ minimum: number; maximum: number }>;

/**
 * Playback rate bounds. Below ~0.55 a walk cycle reads as slow motion; above
 * ~1.75 the legs blur and the upper body judders. The residual slide outside
 * this window is reported rather than hidden, because closing it needs a faster
 * authored sprint clip, not a bigger multiplier.
 */
export const LOCOMOTION_PLAYBACK_LIMITS: LocomotionPlaybackLimits = Object.freeze({ minimum: 0.55, maximum: 1.75 });

/** Below this the operator is standing still and the caller should use idle. */
export const LOCOMOTION_IDLE_SPEED_MPS = 0.15;

export type LocomotionSample = Readonly<{
  /** Local-space velocity: +forward is the direction the body faces. */
  forwardMps: number;
  /** Local-space velocity: +strafe is the body's right. */
  strafeMps: number;
  /** Clip names the mixer has actually bound. Missing clips are never emitted. */
  availableClips: readonly string[];
  /** Armed operators prefer the shooting run so the upper body keeps the gun. */
  armed?: boolean;
  playbackLimits?: LocomotionPlaybackLimits;
}>;

export type LocomotionClipWeight = Readonly<{ clip: string; weight: number; timeScale: number }>;

export type LocomotionSolution = Readonly<{
  /** Clip weights within the locomotion state; sum to 1 when `moving`. */
  clips: readonly LocomotionClipWeight[];
  moving: boolean;
  groundSpeedMps: number;
  /** Weighted authored speed of the emitted blend, before playback scaling. */
  authoredGroundSpeedMps: number;
  playbackRate: number;
  /** Shared stride frequency every emitted clip is driven at. */
  strideFrequencyHz: number;
  /** Residual sliding after speed matching, in m/s and as a fraction of speed. */
  footSlideMps: number;
  footSlideRatio: number;
  /** 0 when the blend faces the way the body moves, 1 when it is exactly wrong. */
  directionMismatch: number;
  /** True when at least one non-forward cardinal clip was available and used. */
  directional: boolean;
}>;

const AXIS_UNIT: Readonly<Record<LocomotionAxis, Readonly<{ forward: number; strafe: number }>>> = Object.freeze({
  forward: Object.freeze({ forward: 1, strafe: 0 }),
  backward: Object.freeze({ forward: -1, strafe: 0 }),
  left: Object.freeze({ forward: 0, strafe: -1 }),
  right: Object.freeze({ forward: 0, strafe: 1 }),
});

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The playback rate that makes a clip authored for `authoredMps` carry a body
 * travelling at `desiredMps`. Clamped, because an unbounded rate trades foot
 * sliding for a rig that vibrates.
 */
export function playbackRateForGroundSpeed(
  authoredMps: number,
  desiredMps: number,
  limits: LocomotionPlaybackLimits = LOCOMOTION_PLAYBACK_LIMITS,
): number {
  const authored = finiteOr(authoredMps, 0);
  const desired = Math.abs(finiteOr(desiredMps, 0));
  const minimum = Math.max(0.01, finiteOr(limits.minimum, LOCOMOTION_PLAYBACK_LIMITS.minimum));
  const maximum = Math.max(minimum, finiteOr(limits.maximum, LOCOMOTION_PLAYBACK_LIMITS.maximum));
  if (authored <= 0) return 1;
  return clamp(desired / authored, minimum, maximum);
}

/** Metres per second of ground the planted foot slips after speed matching. */
export function footSlideMetresPerSecond(authoredMps: number, desiredMps: number, playbackRate: number): number {
  const authored = Math.abs(finiteOr(authoredMps, 0));
  const desired = Math.abs(finiteOr(desiredMps, 0));
  return Math.abs(desired - authored * Math.max(0, finiteOr(playbackRate, 0)));
}

function pickForwardRun(available: ReadonlySet<string>, armed: boolean): string | null {
  const order = armed ? ['Run_Shoot', 'Run'] : ['Run', 'Run_Shoot'];
  return order.find((clip) => available.has(clip)) ?? null;
}

/**
 * Cardinal weights from an L1 normalisation of the local velocity. L1 is used
 * deliberately: the four weights then sum to exactly 1 with no square roots and
 * no renormalisation step, which is what keeps the emitted blend exact.
 */
function cardinalWeights(forwardMps: number, strafeMps: number): Record<LocomotionAxis, number> {
  const total = Math.abs(forwardMps) + Math.abs(strafeMps);
  if (total <= 0) return { forward: 1, backward: 0, left: 0, right: 0 };
  return {
    forward: Math.max(0, forwardMps) / total,
    backward: Math.max(0, -forwardMps) / total,
    right: Math.max(0, strafeMps) / total,
    left: Math.max(0, -strafeMps) / total,
  };
}

export function solveLocomotion(sample: LocomotionSample): LocomotionSolution {
  const forwardMps = finiteOr(sample.forwardMps, 0);
  const strafeMps = finiteOr(sample.strafeMps, 0);
  const groundSpeedMps = Math.hypot(forwardMps, strafeMps);
  const available = new Set(sample.availableClips);
  const armed = sample.armed !== false;
  const limits = sample.playbackLimits ?? LOCOMOTION_PLAYBACK_LIMITS;

  const walk = available.has('Walk') ? 'Walk' : null;
  const forwardRun = pickForwardRun(available, armed);
  const back = available.has('Run_Back') ? 'Run_Back' : null;
  const left = available.has('Run_Left') ? 'Run_Left' : null;
  const right = available.has('Run_Right') ? 'Run_Right' : null;
  const directional = back !== null || left !== null || right !== null;

  const idle: LocomotionSolution = Object.freeze({
    clips: Object.freeze([]),
    moving: false,
    groundSpeedMps,
    authoredGroundSpeedMps: 0,
    playbackRate: 1,
    strideFrequencyHz: 0,
    footSlideMps: 0,
    footSlideRatio: 0,
    directionMismatch: 0,
    directional,
  });
  if (groundSpeedMps < LOCOMOTION_IDLE_SPEED_MPS || (walk === null && forwardRun === null && !directional)) return idle;

  // With no directional corpus every cardinal collapses onto the forward ladder;
  // the resulting mismatch is reported, not silently accepted.
  const cardinals = directional
    ? cardinalWeights(forwardMps, strafeMps)
    : { forward: 1, backward: 0, left: 0, right: 0 } as Record<LocomotionAxis, number>;

  const walkSpeed = OPERATOR_LOCOMOTION_CALIBRATION.Walk!.authoredGroundSpeedMps;
  const runSpeed = forwardRun ? OPERATOR_LOCOMOTION_CALIBRATION[forwardRun]!.authoredGroundSpeedMps : walkSpeed;
  // Gait blend across the forward ladder only; the authored corpus has no slow
  // variant of the backward or lateral runs, so those cardinals are single-clip.
  const gait = walk === null ? 1 : forwardRun === null ? 0
    : smoothstep01((groundSpeedMps - walkSpeed) / Math.max(1e-6, runSpeed - walkSpeed));

  const raw: { clip: string; weight: number }[] = [];
  const push = (clip: string | null, weight: number): void => {
    if (clip !== null && weight > 0) raw.push({ clip, weight });
  };
  push(walk, cardinals.forward * (1 - gait));
  push(forwardRun, cardinals.forward * gait);
  push(back ?? forwardRun, cardinals.backward);
  push(left ?? forwardRun, cardinals.left);
  push(right ?? forwardRun, cardinals.right);

  // Two cardinals can resolve to the same clip when a directional variant is
  // missing; merge so a clip never appears twice in the emitted blend.
  const merged = new Map<string, number>();
  for (const entry of raw) merged.set(entry.clip, (merged.get(entry.clip) ?? 0) + entry.weight);
  const total = [...merged.values()].reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return idle;

  let authoredGroundSpeedMps = 0;
  let naturalCycleHz = 0;
  let axisForward = 0;
  let axisStrafe = 0;
  const normalized = [...merged.entries()]
    .map(([clip, weight]) => ({ clip, weight: weight / total }))
    // Stable emission order: heaviest first, ties by name, so two peers with the
    // same inputs produce byte-identical telemetry.
    .sort((leftEntry, rightEntry) => (rightEntry.weight - leftEntry.weight) || leftEntry.clip.localeCompare(rightEntry.clip));
  for (const entry of normalized) {
    const calibration = OPERATOR_LOCOMOTION_CALIBRATION[entry.clip]!;
    authoredGroundSpeedMps += entry.weight * calibration.authoredGroundSpeedMps;
    naturalCycleHz += entry.weight / calibration.durationS;
    axisForward += entry.weight * AXIS_UNIT[calibration.axis].forward;
    axisStrafe += entry.weight * AXIS_UNIT[calibration.axis].strafe;
  }

  const playbackRate = playbackRateForGroundSpeed(authoredGroundSpeedMps, groundSpeedMps, limits);
  const strideFrequencyHz = naturalCycleHz * playbackRate;
  // One shared stride frequency: each clip's timeScale is whatever puts ITS
  // cycle length on that frequency, so blended footfalls stay in phase.
  const clips = Object.freeze(normalized.map((entry) => Object.freeze({
    clip: entry.clip,
    weight: entry.weight,
    timeScale: strideFrequencyHz * OPERATOR_LOCOMOTION_CALIBRATION[entry.clip]!.durationS,
  })));

  const footSlideMps = footSlideMetresPerSecond(authoredGroundSpeedMps, groundSpeedMps, playbackRate);
  const axisLength = Math.hypot(axisForward, axisStrafe);
  const alignment = axisLength <= 1e-9
    ? 0
    : (axisForward * forwardMps + axisStrafe * strafeMps) / (axisLength * groundSpeedMps);

  return Object.freeze({
    clips,
    moving: true,
    groundSpeedMps,
    authoredGroundSpeedMps,
    playbackRate,
    strideFrequencyHz,
    footSlideMps,
    footSlideRatio: footSlideMps / Math.max(LOCOMOTION_IDLE_SPEED_MPS, groundSpeedMps),
    directionMismatch: clamp((1 - alignment) / 2, 0, 1),
    directional,
  });
}
