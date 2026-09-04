/**
 * PASS 94 — the operator POSTURE layer: stance and sprint as first-class
 * animation states, for players and bots through one code path.
 *
 * WHAT IS ACTUALLY MISSING TODAY, read out of the tree rather than guessed:
 *
 *   - `rigged-operator-animation-director.ts` has exactly four states:
 *     `idle | locomotion | turn | death`. Crouch and prone are not among them.
 *     They are applied later and separately, as raw bone offsets inside
 *     `operator-model.ts` (`hips.position.y -= 0.44 * crouch`, a whole-pelvis
 *     pivot for prone), on top of whatever STANDING clip the director chose.
 *   - so a crouch-walking operator plays the standing `Walk` at the playback
 *     rate computed for a standing stride, with its hips 0.44 m lower. The legs
 *     are compressed and the cycle is not, which is the mechanical cause of the
 *     crouch-walk skate.
 *   - `Run` is authored at 3.08 m/s and a sprint travels far faster; the
 *     playback clamp in `animation-locomotion.ts` stops at 1.75x and the
 *     residual is, correctly, reported rather than hidden. Nothing today makes
 *     a sprint read as a sprint - no lean, no arm gain, no weapon drop.
 *   - bots publish `stance: 'stand'` unconditionally
 *     (`legacy-main.ts:8310`, `:14033`), so no bot has ever crouched.
 *
 * This module owns the arithmetic for all of it and nothing else. It is pure:
 * deltas in, no clocks, no randomness, no THREE, so every rule is testable
 * without a GPU and networked peers computing the same inputs agree.
 *
 * IT REUSES, IT DOES NOT REDECLARE:
 *   - the cross-fade weights come from `animation-blend-graph.ts`, so posture
 *     inherits its proven guarantees (weights sum to 1, the incoming weight
 *     never decreases, layer count is bounded);
 *   - the transition DURATIONS are derived from `DROP_SHOT_TIMING` in
 *     `prone-transition.ts`, the timing HF-412 established for the gameplay
 *     stance change. A second hand-tuned table would let the body finish moving
 *     before or after the stance it is supposed to be showing.
 *
 * PRESENTATION ONLY. It reads gameplay stance; it never decides it, and it
 * never touches eye height, hit proxies, fire admission or anything replicated.
 */

import {
  advanceBlendGraph,
  blendGraphLayers,
  blendTransitionSeconds,
  createBlendGraph,
  requestBlendTarget,
  type BlendGraphDefinition,
  type BlendGraphState,
} from './animation-blend-graph';
import { DROP_SHOT_TIMING } from './prone-transition';

export type OperatorPostureStance = 'stand' | 'crouch' | 'prone';

export type OperatorGaitName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'crouch-idle'
  | 'crouch-walk'
  | 'prone-idle'
  | 'prone-crawl'
  | 'dead';

/**
 * Posture cross-fades, in seconds, derived from the single gameplay timing
 * source so the pose and the stance it represents finish together.
 *
 * `crouch->prone` and `prone->crouch` are the remainder of the full
 * stand<->prone move once the crouch step is spent, which is what stops a
 * crouch-to-prone drop taking as long as a stand-to-prone one.
 */
export const OPERATOR_POSTURE_TRANSITIONS: BlendGraphDefinition = Object.freeze({
  defaultTransitionS: DROP_SHOT_TIMING.crouchStepMs / 1000,
  maximumLayers: 3,
  transitions: Object.freeze({
    'stand->crouch': DROP_SHOT_TIMING.crouchStepMs / 1000,
    'crouch->stand': DROP_SHOT_TIMING.crouchStepMs / 1000,
    'stand->prone': DROP_SHOT_TIMING.standToProneMs / 1000,
    'prone->stand': DROP_SHOT_TIMING.proneToStandMs / 1000,
    'crouch->prone': Math.max(0.05, (DROP_SHOT_TIMING.standToProneMs - DROP_SHOT_TIMING.crouchStepMs) / 1000),
    'prone->crouch': Math.max(0.05, (DROP_SHOT_TIMING.proneToStandMs - DROP_SHOT_TIMING.crouchStepMs) / 1000),
  }),
});

export type PostureGaitProfile = Readonly<{
  /**
   * Ground speed above which this posture cannot honestly go. Clip selection is
   * capped here so a prone operator never selects a full run, and anything
   * above it is reported as residual rather than absorbed by a bigger
   * `timeScale` - the same policy `animation-locomotion.ts` already applies.
   */
  maximumClipSpeedMps: number;
  /**
   * Stride length in this posture as a fraction of the authored standing
   * stride. Crouching shortens the stride roughly in proportion to the
   * shortened leg, so the SAME ground speed needs a proportionally FASTER
   * cycle. This is the number that removes the crouch-walk skate.
   */
  strideFraction: number;
  /** How much of the aim pitch range the posture can physically reach. */
  aimPitchScale: number;
}>;

/**
 * Per-stance gait constants.
 *
 * `strideFraction` is derived, not tuned by eye: the crouch pose drops the hips
 * 0.44 m on a 1.854 m bind pose whose hip sits near 0.95 m, leaving about 0.51 m
 * of standing leg, i.e. ~0.54 of the standing stride. Prone is a forearm crawl
 * with no stride at all, so its cycle is driven almost entirely by cadence and
 * the fraction is small.
 */
export const OPERATOR_POSTURE_GAITS: Readonly<Record<OperatorPostureStance, PostureGaitProfile>> = Object.freeze({
  stand: Object.freeze({ maximumClipSpeedMps: 12, strideFraction: 1, aimPitchScale: 1 }),
  crouch: Object.freeze({ maximumClipSpeedMps: 2.6, strideFraction: 0.54, aimPitchScale: 0.86 }),
  prone: Object.freeze({ maximumClipSpeedMps: 1.1, strideFraction: 0.3, aimPitchScale: 0.42 }),
});

/**
 * Sprint entry and exit speeds, with a deliberate gap. Without hysteresis an
 * operator hovering at the boundary flickers the lean on and off every frame,
 * which reads far worse than either state.
 */
export const SPRINT_ENTER_MPS = 5.2;
export const SPRINT_EXIT_MPS = 4.4;
/** Seconds for the sprint presentation to reach full strength, and to release. */
export const SPRINT_ATTACK_S = 0.22;
export const SPRINT_RELEASE_S = 0.16;
/** Forward lean at full sprint. Bounded: a bigger lean walks the feet off the floor. */
export const SPRINT_LEAN_RADIANS = 0.17;
/** Aim authority left to the additive layer at full sprint - the weapon is down. */
export const SPRINT_AIM_PITCH_SCALE = 0.25;

/** Below this an operator is standing still and the gait is an idle. */
export const POSTURE_IDLE_SPEED_MPS = 0.15;
/** Above this a standing operator is running rather than walking. */
export const POSTURE_RUN_SPEED_MPS = 2.2;

export type OperatorPostureLayerState = {
  readonly graph: BlendGraphState;
  /** 0..1 linear sprint ramp. The OUTPUT smoothsteps this; nothing else reads it. */
  sprint: number;
  /** Latched sprint intent, so hysteresis survives across frames. */
  sprinting: boolean;
};

export type OperatorPostureInput = Readonly<{
  deltaSeconds: number;
  /** The gameplay stance. This module reads it; it never decides it. */
  stance: OperatorPostureStance;
  /** Planar ground speed in m/s. */
  groundSpeedMps: number;
  /** Set when the operator is dead: posture freezes where it died. */
  dead?: boolean;
  /** Only a standing operator can sprint. */
  sprintAllowed?: boolean;
}>;

export type OperatorPostureWeights = Readonly<{ stand: number; crouch: number; prone: number }>;

export type OperatorPostureOutput = Readonly<{
  weights: OperatorPostureWeights;
  /** The posture the controller has selected, however far the blend has got. */
  target: OperatorPostureStance;
  /** The posture currently carrying the most weight. */
  dominant: OperatorPostureStance;
  sprint: number;
  /**
   * Multiply every locomotion `timeScale` by this. Above 1 in crouch and prone,
   * because a shortened stride needs a faster cycle for the same ground speed.
   */
  cadenceScale: number;
  /**
   * Feed this, not the raw speed, to clip selection. Capped at what the posture
   * can honestly show.
   */
  clipSelectionSpeedMps: number;
  /** Ground speed the posture cannot represent. Reported, never hidden. */
  residualSpeedMps: number;
  /** Scale for the additive aim pitch, folding stance and sprint together. */
  aimPitchScale: number;
  /** Forward body lean in radians, from the sprint blend. */
  leanRadians: number;
  gait: OperatorGaitName;
}>;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Strictly increasing on [0,1], zero-derivative at both ends. */
function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createOperatorPostureLayer(initial: OperatorPostureStance = 'stand'): OperatorPostureLayerState {
  return {
    graph: createBlendGraph(OPERATOR_POSTURE_TRANSITIONS, initial),
    sprint: 0,
    sprinting: false,
  };
}

function weightsFrom(layers: readonly { state: string; weight: number }[]): OperatorPostureWeights {
  let stand = 0;
  let crouch = 0;
  let prone = 0;
  for (const layer of layers) {
    if (layer.state === 'crouch') crouch += layer.weight;
    else if (layer.state === 'prone') prone += layer.weight;
    else stand += layer.weight;
  }
  return Object.freeze({ stand, crouch, prone });
}

function dominantOf(weights: OperatorPostureWeights): OperatorPostureStance {
  if (weights.prone >= weights.crouch && weights.prone >= weights.stand) return 'prone';
  if (weights.crouch >= weights.stand) return 'crouch';
  return 'stand';
}

/** Blends the per-stance gait constants by the live posture weights. */
export function blendedGaitProfile(weights: OperatorPostureWeights): PostureGaitProfile {
  const total = weights.stand + weights.crouch + weights.prone;
  if (!(total > 0)) return OPERATOR_POSTURE_GAITS.stand;
  const w = {
    stand: weights.stand / total,
    crouch: weights.crouch / total,
    prone: weights.prone / total,
  };
  return Object.freeze({
    maximumClipSpeedMps:
      OPERATOR_POSTURE_GAITS.stand.maximumClipSpeedMps * w.stand
      + OPERATOR_POSTURE_GAITS.crouch.maximumClipSpeedMps * w.crouch
      + OPERATOR_POSTURE_GAITS.prone.maximumClipSpeedMps * w.prone,
    strideFraction:
      OPERATOR_POSTURE_GAITS.stand.strideFraction * w.stand
      + OPERATOR_POSTURE_GAITS.crouch.strideFraction * w.crouch
      + OPERATOR_POSTURE_GAITS.prone.strideFraction * w.prone,
    aimPitchScale:
      OPERATOR_POSTURE_GAITS.stand.aimPitchScale * w.stand
      + OPERATOR_POSTURE_GAITS.crouch.aimPitchScale * w.crouch
      + OPERATOR_POSTURE_GAITS.prone.aimPitchScale * w.prone,
  });
}

/**
 * Names the gait for evidence captures, debug HUDs and the per-state screenshot
 * corpus. Purely descriptive; nothing branches on it.
 */
export function gaitNameFor(
  dominant: OperatorPostureStance,
  groundSpeedMps: number,
  sprint: number,
  dead: boolean,
): OperatorGaitName {
  if (dead) return 'dead';
  const moving = groundSpeedMps > POSTURE_IDLE_SPEED_MPS;
  if (dominant === 'prone') return moving ? 'prone-crawl' : 'prone-idle';
  if (dominant === 'crouch') return moving ? 'crouch-walk' : 'crouch-idle';
  if (!moving) return 'idle';
  if (sprint >= 0.5) return 'sprint';
  return groundSpeedMps >= POSTURE_RUN_SPEED_MPS ? 'run' : 'walk';
}

export const OPERATOR_GAIT_NAMES: readonly OperatorGaitName[] = Object.freeze([
  'idle', 'walk', 'run', 'sprint', 'crouch-idle', 'crouch-walk', 'prone-idle', 'prone-crawl', 'dead',
]);

/**
 * One call per operator per frame. Advances the posture cross-fade and the
 * sprint envelope and returns everything the director needs to make a standing
 * clip corpus read as a crouched, prone or sprinting body.
 */
export function advanceOperatorPosture(
  state: OperatorPostureLayerState,
  input: OperatorPostureInput,
): OperatorPostureOutput {
  // Same clamp the director uses: a recovered background tab must not teleport
  // every blend to its destination in one frame.
  const deltaSeconds = Math.min(0.05, Math.max(0, finiteOr(input.deltaSeconds, 0)));
  const groundSpeedMps = Math.max(0, finiteOr(input.groundSpeedMps, 0));
  const dead = input.dead === true;

  // Death freezes the posture: a corpse keeps the shape it fell in, and nothing
  // re-targets the graph afterwards.
  if (!dead) {
    const target: OperatorPostureStance =
      input.stance === 'crouch' || input.stance === 'prone' ? input.stance : 'stand';
    const duration = blendTransitionSeconds(OPERATOR_POSTURE_TRANSITIONS, state.graph.target, target);
    requestBlendTarget(state.graph, target, duration);
  }

  const layers = deltaSeconds > 0 ? advanceBlendGraph(state.graph, deltaSeconds) : blendGraphLayers(state.graph);
  const weights = weightsFrom(layers);
  const dominant = dominantOf(weights);

  // Sprint: latched intent with a speed gap, then a smoothed envelope so the
  // lean arrives and leaves over time rather than on the frame the threshold
  // is crossed.
  const sprintAllowed = input.sprintAllowed !== false && !dead && state.graph.target === 'stand';
  if (!sprintAllowed) state.sprinting = false;
  else if (state.sprinting) state.sprinting = groundSpeedMps > SPRINT_EXIT_MPS;
  else state.sprinting = groundSpeedMps >= SPRINT_ENTER_MPS;

  // A rate-limited ramp rather than an exponential approach, so the envelope
  // genuinely ARRIVES at full strength in the declared time instead of getting
  // asymptotically close to it forever. The stored ramp is linear; what leaves
  // this module is smoothstepped, so the lean has no velocity step at either
  // end while still reaching exactly 0 and exactly 1.
  const step = deltaSeconds / (state.sprinting ? SPRINT_ATTACK_S : SPRINT_RELEASE_S);
  state.sprint = state.sprinting
    ? Math.min(1, state.sprint + step)
    : Math.max(0, state.sprint - step);
  const sprint = smoothstep01(state.sprint);

  const gait = blendedGaitProfile(weights);
  const clipSelectionSpeedMps = Math.min(groundSpeedMps, gait.maximumClipSpeedMps);
  const residualSpeedMps = Math.max(0, groundSpeedMps - gait.maximumClipSpeedMps);
  // A shorter stride covers less ground per cycle, so the cycle must run faster
  // to keep the planted foot planted. Bounded so a degenerate stride fraction
  // can never produce a blurred leg cycle.
  const cadenceScale = clamp(1 / Math.max(0.2, gait.strideFraction), 1, 3.4);
  const aimPitchScale = clamp(
    gait.aimPitchScale * (1 - sprint * (1 - SPRINT_AIM_PITCH_SCALE)),
    0,
    1,
  );

  return Object.freeze({
    weights,
    target: state.graph.target as OperatorPostureStance,
    dominant,
    sprint,
    cadenceScale,
    clipSelectionSpeedMps,
    residualSpeedMps,
    aimPitchScale,
    leanRadians: SPRINT_LEAN_RADIANS * sprint,
    gait: gaitNameFor(dominant, groundSpeedMps, sprint, dead),
  });
}
