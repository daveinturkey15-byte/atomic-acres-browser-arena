/**
 * Pass 77 / HF-375. The binding layer between the animation director and three.
 *
 * The director (`rigged-operator-animation-director`) turns gameplay state into
 * a pose DESCRIPTION and deliberately knows nothing about three. Until this file
 * existed, nothing consumed that description: every module the previous lane
 * landed was imported only by its own tests, so not one frame of the game had
 * changed. This is the consumer.
 *
 * Two jobs, kept apart on purpose:
 *
 *   1. `planOperatorMixer` - pure. Folds the director's base and additive layers
 *      into per-clip mixer commands, and - the part that matters - works out
 *      which clips must be RELEASED. The shipped runtime never released
 *      anything: `playOneShot` sets `clampWhenFinished = true` and there is no
 *      `finished` listener anywhere, and three's handling of a finished clamped
 *      action is `this.paused = true`, NOT `enabled = false`. The action stays
 *      enabled at weight 1 and keeps contributing to the mix for the rest of the
 *      operator's life. An operator that has fired, been hit and meleed is a
 *      running average of three frozen poses and whatever it is actually doing.
 *      Every clip that leaves the plan is stopped here, so that cannot happen.
 *
 *   2. `applyOperatorMixerPlan` / `applyOperatorAnimationPose` - the three-side
 *      application. Weights and playback rates onto real actions, additive bone
 *      offsets onto the post-mixer spine.
 *
 * Phase continuity is handled here rather than in the director because it needs
 * the live action clock: when a locomotion clip enters a blend that already has
 * one running, it is seeded at the same NORMALISED phase, so the two clips'
 * footfalls line up instead of the entering clip restarting from its first
 * frame mid-stride.
 */

import * as THREE from 'three';
import { smoothTowards } from './animation-additive-pose';
import { hitImpulseEnvelope } from './animation-hit-reaction';
import type { OperatorAnimationOutput } from './rigged-operator-animation-director';

/** Clips whose phase is meaningful to match across a cross-fade. */
const LOCOMOTION_CLIPS: ReadonlySet<string> = new Set([
  'Walk', 'Run', 'Run_Shoot', 'Run_Back', 'Run_Left', 'Run_Right',
]);

/**
 * Terminal clips hold their last frame instead of looping. Death is the only
 * one: a corpse that loops its own collapse is worse than no animation at all.
 */
const TERMINAL_CLIPS: ReadonlySet<string> = new Set(['Death']);

export type OperatorMixerRole = 'base' | 'accent' | 'terminal';

export type OperatorMixerCommand = Readonly<{
  clip: string;
  weight: number;
  timeScale: number;
  role: OperatorMixerRole;
  /** True on the frame the clip joins the mix; the action is reset and played. */
  enter: boolean;
  /**
   * Clip to copy the normalised playback phase from on entry, so blended
   * footfalls stay in step. Null when nothing comparable is running.
   */
  phaseSource: string | null;
}>;

export type OperatorMixerPlan = Readonly<{
  commands: readonly OperatorMixerCommand[];
  /**
   * Clips that were mixed last frame and are not in the plan this frame. These
   * MUST be stopped: three leaves a finished clamped action enabled forever.
   */
  released: readonly string[];
  active: readonly string[];
}>;

const EPSILON_WEIGHT = 1e-4;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Pure. Everything about which clip is mixed, at what weight, and - critically -
 * which clips stop being mixed, decided without touching three.
 */
export function planOperatorMixer(
  output: OperatorAnimationOutput,
  previouslyActive: readonly string[],
): OperatorMixerPlan {
  const previous = new Set(previouslyActive);
  const commands: OperatorMixerCommand[] = [];
  const active = new Set<string>();

  // The phase reference is an already-running locomotion clip, taken from the
  // PREVIOUS active set so an entering clip syncs to what the viewer can already
  // see rather than to a sibling that entered on the same frame.
  //
  // It must come from `previous` rather than from this frame's layers: the
  // common case is exactly the one where the outgoing clip is no longer in the
  // layers at all - a walk settling into a run drops `Walk` from the solve the
  // instant the gait blend reaches 1, while the walk action is still mid-stride
  // in the mixer. Preferring a clip that is in both keeps the reference stable
  // through a genuine two-clip blend; sorting the fallback keeps it deterministic.
  const stillMixedLocomotion = [...previous].filter((clip) => LOCOMOTION_CLIPS.has(clip)).sort();
  const phaseSource = output.layers.find((layer) => stillMixedLocomotion.includes(layer.clip))?.clip
    ?? stillMixedLocomotion[0]
    ?? null;

  for (const layer of output.layers) {
    const weight = finiteOr(layer.weight, 0);
    if (weight <= EPSILON_WEIGHT) continue;
    const role: OperatorMixerRole = TERMINAL_CLIPS.has(layer.clip) ? 'terminal' : 'base';
    const enter = !previous.has(layer.clip);
    active.add(layer.clip);
    commands.push(Object.freeze({
      clip: layer.clip,
      weight,
      timeScale: Math.max(0, finiteOr(layer.timeScale, 1)),
      role,
      // A terminal clip is played once and never re-entered; re-resetting Death
      // every frame would loop the collapse in place.
      enter: enter,
      phaseSource: enter && LOCOMOTION_CLIPS.has(layer.clip) && phaseSource !== layer.clip
        ? phaseSource
        : null,
    }));
  }

  for (const layer of output.additiveLayers) {
    const weight = finiteOr(layer.weight, 0);
    if (weight <= EPSILON_WEIGHT) continue;
    // An accent that is also carrying the base this frame would fight itself for
    // the same action; the base weight wins and the accent is dropped.
    if (active.has(layer.clip)) continue;
    active.add(layer.clip);
    commands.push(Object.freeze({
      clip: layer.clip,
      weight,
      timeScale: Math.max(0, finiteOr(layer.timeScale, 1)),
      role: 'accent',
      enter: !previous.has(layer.clip),
      phaseSource: null,
    }));
  }

  const released = [...previous].filter((clip) => !active.has(clip)).sort();
  return Object.freeze({
    commands: Object.freeze(commands),
    released: Object.freeze(released),
    active: Object.freeze([...active].sort()),
  });
}

export type MixerActionResolver = (clip: string) => THREE.AnimationAction | undefined;

export type OperatorMixerApplication = Readonly<{
  applied: number;
  released: number;
  entered: number;
  phaseSynced: number;
}>;

function normalisedPhase(action: THREE.AnimationAction): number {
  const duration = action.getClip().duration;
  if (!(duration > 0)) return 0;
  const phase = (action.time % duration) / duration;
  return phase < 0 ? phase + 1 : phase;
}

/** Applies a plan to real three actions. The only three-mutating half. */
export function applyOperatorMixerPlan(
  plan: OperatorMixerPlan,
  resolve: MixerActionResolver,
): OperatorMixerApplication {
  let applied = 0;
  let released = 0;
  let entered = 0;
  let phaseSynced = 0;

  // Phases are read BEFORE anything is released. The usual case is precisely the
  // one where the phase source is the clip being released this frame - a walk
  // handing its stride to a run - and `stop()` zeroes an action's clock, so
  // reading afterwards would silently seed every entering clip at frame zero.
  const phases = new Map<string, number>();
  for (const command of plan.commands) {
    if (!command.enter || command.phaseSource === null || phases.has(command.phaseSource)) continue;
    const source = resolve(command.phaseSource);
    if (source) phases.set(command.phaseSource, normalisedPhase(source));
  }

  for (const clip of plan.released) {
    const action = resolve(clip);
    if (!action) continue;
    // stop() is what the shipped runtime never did. It clears enabled, weight
    // and the clamped pause, so a finished one-shot stops contributing.
    action.stop();
    action.enabled = false;
    action.clampWhenFinished = false;
    released += 1;
  }

  for (const command of plan.commands) {
    const action = resolve(command.clip);
    if (!action) continue;
    if (command.enter) {
      const phase = command.phaseSource === null ? undefined : phases.get(command.phaseSource);
      action.reset();
      if (command.role === 'terminal') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }
      if (phase !== undefined) {
        action.time = phase * action.getClip().duration;
        phaseSynced += 1;
      }
      action.play();
      entered += 1;
    }
    action.enabled = true;
    action.paused = false;
    action.setEffectiveWeight(command.weight);
    action.setEffectiveTimeScale(command.timeScale);
    applied += 1;
  }

  return Object.freeze({ applied, released, entered, phaseSynced });
}

/**
 * Minimal shape of a rig bone this module writes to. Structural on purpose: the
 * offsets are plain Euler additions on top of the clean post-mixer pose, which
 * is what makes them testable without a skeleton. `position` is optional so
 * every existing fake rig without one keeps compiling; the contact-load overlay
 * writes the pelvis drop through it when present.
 */
export type PoseBoneLike = { rotation: { x: number; y: number; z: number }; position?: { y: number } };

export type OperatorAdditiveBones = Readonly<{
  hips?: PoseBoneLike;
  abdomen?: PoseBoneLike;
  torso?: PoseBoneLike;
  chest?: PoseBoneLike;
  neck?: PoseBoneLike;
  head?: PoseBoneLike;
}>;

/**
 * Sign convention, recovered from the shipped stance code rather than guessed:
 * `applyStancePose` bends the crouch with POSITIVE local X on abdomen, torso and
 * chest, so +X pitches the body forward and down. Aiming up is therefore a
 * NEGATIVE X offset, and a forward-hunched posture bias is a positive one.
 */
const AIM_PITCH_SIGN = -1;

/** How much of the hit-reaction torso deflection each spine joint absorbs. */
const HIT_DEFLECTION_SHARE = Object.freeze({ abdomen: 0.3, chest: 0.45, head: 0.25 });

export type OperatorAdditivePoseApplication = Readonly<{
  bonesWritten: number;
  aimPitchRadians: number;
  postureSpineRadians: number;
  leanRollRadians: number;
  hitPitchRadians: number;
  breathOffsetRadians: number;
}>;

/**
 * Adds the director's additive channels onto the post-mixer pose. Called every
 * frame straight after `mixer.update`, and the caller restores the clean pose
 * before the next mixer evaluation, so these never accumulate.
 *
 * `contactLoad` is the CT.LOAD overlay state (fix-animation lane). Null or a
 * weight <= 0 reproduces today's behaviour exactly: the guard below skips
 * without touching a single bone, which is what makes weight 0 bit-identical
 * to the pre-lane build (acceptance A8).
 */
export function applyOperatorAnimationPose(
  bones: OperatorAdditiveBones,
  output: OperatorAnimationOutput,
  contactLoad: ContactLoadState | null = null,
): OperatorAdditivePoseApplication {
  const aim = output.aim;
  const posture = output.posture;
  const hit = output.hitReaction;
  let bonesWritten = 0;
  const add = (bone: PoseBoneLike | undefined, x: number, z: number): void => {
    if (!bone) return;
    if (x === 0 && z === 0) return;
    bone.rotation.x += x;
    bone.rotation.z += z;
    bonesWritten += 1;
  };

  // Aim pitch: the parameter `poseOperator` has always received and dropped.
  // The four joint offsets sum to the clamped pitch by contract, so the chain
  // as a whole points where the shot actually leaves.
  add(bones.abdomen, AIM_PITCH_SIGN * aim.aimJointRadians.spine + posture.spinePitchRadians
    + hit.pitchOffsetRadians * HIT_DEFLECTION_SHARE.abdomen,
    aim.leanRollRadians * 0.35 + hit.rollOffsetRadians * HIT_DEFLECTION_SHARE.abdomen);
  add(bones.chest, AIM_PITCH_SIGN * aim.aimJointRadians.chest + posture.chestPitchRadians
    + aim.breathOffsetRadians + hit.pitchOffsetRadians * HIT_DEFLECTION_SHARE.chest,
    posture.shoulderRollRadians + aim.leanRollRadians * 0.45
    + hit.rollOffsetRadians * HIT_DEFLECTION_SHARE.chest);
  add(bones.neck, AIM_PITCH_SIGN * aim.aimJointRadians.neck, 0);
  // The head counters half the breath so the gaze stays level while the chest
  // rises, and takes the remaining deflection from a hit.
  add(bones.head, AIM_PITCH_SIGN * aim.aimJointRadians.head + posture.headPitchRadians
    - aim.breathOffsetRadians * 0.5 + hit.pitchOffsetRadians * HIT_DEFLECTION_SHARE.head,
    hit.rollOffsetRadians * HIT_DEFLECTION_SHARE.head);
  add(bones.hips, 0, aim.leanRollRadians * 0.2);
  // CT.LOAD.3a — bounded whole-body response, layered over the pose above.
  // Every channel was clamped at solve time (never overshoots: smoothTowards),
  // so this is pure application. Weight <= 0 writes nothing (A8). The pelvis
  // drop goes through `position` only when the bone has one, and never through
  // the physics path — clamp the bone, never the body.
  if (contactLoad && contactLoad.weight > 0) {
    const drop = contactLoad.pelvisDropM > 0 ? contactLoad.pelvisDropM : 0;
    if (drop > 0 && bones.hips && bones.hips.position) bones.hips.position.y -= drop;
    add(bones.hips, 0, contactLoad.pelvisRollRad * 0.5);
    add(bones.abdomen, contactLoad.spineEffortRad, 0);
    add(bones.torso, 0, contactLoad.shoulderRad);
    add(bones.chest, contactLoad.chestPitchRad, contactLoad.chestRollRad);
  }
  return Object.freeze({
    bonesWritten,
    aimPitchRadians: aim.aimPitchRadians,
    postureSpineRadians: posture.spinePitchRadians,
    leanRollRadians: aim.leanRollRadians,
    hitPitchRadians: hit.pitchOffsetRadians,
    breathOffsetRadians: aim.breathOffsetRadians,
  });
}

/**
 * Local-frame decomposition of a world-space ground velocity, using the yaw
 * convention `operatorYawToward` establishes: forward is local -Z, so a body at
 * yaw t faces (-sin t, 0, -cos t) and its right is (cos t, 0, -sin t).
 *
 * This is what turns a scalar `speed` into the direction-aware input the
 * locomotion solver needs, and it is why a retreating or strafing bot can stop
 * playing a forward run.
 */
export function localGroundVelocity(
  worldDeltaX: number,
  worldDeltaZ: number,
  yawRadians: number,
  deltaSeconds: number,
): Readonly<{ forwardMps: number; strafeMps: number }> {
  const dt = finiteOr(deltaSeconds, 0);
  if (!(dt > 0)) return Object.freeze({ forwardMps: 0, strafeMps: 0 });
  const dx = finiteOr(worldDeltaX, 0) / dt;
  const dz = finiteOr(worldDeltaZ, 0) / dt;
  const yaw = finiteOr(yawRadians, 0);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return Object.freeze({
    forwardMps: dx * -sin + dz * -cos,
    strafeMps: dx * cos + dz * -sin,
  });
}

/**
 * Combines a caller-declared speed with a measured direction.
 *
 * Every `poseOperator` call site passes a scalar speed and nothing else, and one
 * of them (the frozen debug presentation route) declares a speed while the
 * operator does not move at all. Taking the MAGNITUDE from the caller and the
 * DIRECTION from measured motion keeps that route working while giving every
 * ordinary frame a real direction - so a strafing bot gets a lateral clip
 * without a single call site having to be rewritten to supply one.
 */
export function directedGroundVelocity(
  declaredSpeedMps: number,
  measured: Readonly<{ forwardMps: number; strafeMps: number }>,
  minimumMeasuredMps = 0.05,
): Readonly<{ forwardMps: number; strafeMps: number }> {
  const speed = Math.max(0, finiteOr(declaredSpeedMps, 0));
  const magnitude = Math.hypot(measured.forwardMps, measured.strafeMps);
  if (speed <= 0) return Object.freeze({ forwardMps: 0, strafeMps: 0 });
  if (magnitude < Math.max(0, minimumMeasuredMps)) {
    return Object.freeze({ forwardMps: speed, strafeMps: 0 });
  }
  const scale = speed / magnitude;
  return Object.freeze({
    forwardMps: measured.forwardMps * scale,
    strafeMps: measured.strafeMps * scale,
  });
}

/**
 * CT.LOAD contact-load overlay (fix-animation lane, CT.LOAD.1a/2a/3a/4a).
 *
 * The principle, transferred from the referenced quadruped work with the
 * authoring tool rejected: detect contact → estimate the load that contact is
 * carrying → drive a bounded whole-body response from that load, layered over
 * the pose the rig already produced. The contact lamps read identically with
 * the response on and off: this never replaces the gait, it answers it.
 *
 * Multiplayer rules (acceptance A5/A6), structural rather than hoped-for:
 * contact phase is a function of ACCUMULATED HORIZONTAL DISTANCE — in the
 * manner of `advanceFootsteps` — never of elapsed time, so 30 Hz and 240 Hz
 * clients integrate the same distance and reach the same stride phase; every
 * smoother is the critically-approached frame-rate-independent `smoothTowards`
 * form (never overshoots, fixed point depends only on replicated inputs); and
 * nothing here reads an RNG, a wall clock, or a physics world. Scalar
 * arguments throughout, so the per-frame path allocates nothing:
 * the caller owns one `ContactLoadState` per operator and this only mutates it.
 */

/** Unique string proving the overlay ships in the built bundle (lane rule). */
export const CONTACT_LOAD_OVERLAY_MARKER = 'CT_LOAD_CONTACT_OVERLAY_V1';

/** Ceiling on total carried load: full support (1) plus peak landing impulse (1.6), with margin. Per-foot shares stay normalized (≤ 1); the ceiling binds only the impulse stack. */
export const LOAD_CEILING = 3;
export const CONTACT_LOAD_IDLE_SPEED_MPS = 0.15;

/** Hysteresis half-gap on stride phase: enter early, release late, never flicker inside one stride. */
export const CONTACT_LOAD_PHASE_MARGIN = 0.06;

/** Critically-approached response rates (Hz): contacts track fast, loads and offsets settle. */
export const CONTACT_LOAD_CONTACT_HZ = 10;
export const CONTACT_LOAD_RESPONSE_HZ = 7;

/** Pelvis drop per unit total load, and its hard ceiling (brief: ≤ 0.06 m). The solve cap keeps a float margin under the clamp. */
export const PELVIS_DROP_PER_LOAD_M = 0.018;
export const PELVIS_DROP_MAX_M = 0.06;
export const PELVIS_DROP_SOLVE_CAP_M = 0.059;

/** Pelvis roll toward the loaded foot (brief: ≤ 5°). */
export const PELVIS_ROLL_MAX_RAD = 0.08727;
/** Chest counter-rotation keeping the head level (brief: ≤ 6°). Without it the pelvis drop reads as a bug. */
export const CHEST_COUNTER_MAX_RAD = 0.10472;
/** Contra-lateral shoulder response on the torso roll channel (brief: ≤ 4°; no shoulder bones exist in `OperatorAdditiveBones`). */
export const SHOULDER_RESPONSE_MAX_RAD = 0.06981;
/** Sprint-effort spine pitch from the residual the corpus cannot represent (brief 4a: ≤ 4°, folded into the SPRINT_LEAN budget at the call site, never on top). */
export const SPRINT_EFFORT_MAX_RAD = 0.06981;
export const SPRINT_EFFORT_GAIN_RAD_PER_MPS = 0.021;

/** Landing impulse reuses the hit-reaction envelope: one agreed settle, not two hand-tuned decays. */
export const CONTACT_LOAD_LANDING_SHAPE = Object.freeze({ riseSeconds: 0.06, decaySeconds: 0.28, peak: 1 });
export const CONTACT_LOAD_IMPULSE_GAIN = 1.6;
/** A smoothed channel whose target is exactly 0 snaps inside this epsilon, so accumulators return to exactly 0, not dust. */
export const CONTACT_LOAD_SNAP_EPSILON = 1e-3;

/** Lowest tier runs the overlay at 0 beyond this distance, at a reduced ceiling inside it (A8 doubles as the revert row). */
export const CONTACT_LOAD_LOW_TIER_DISTANCE_M = 25;
export const CONTACT_LOAD_LOW_TIER_NEAR_WEIGHT = 0.5;

/** Vertical-speed bounds marking fast leave/return: the only flight signal available without a physics query. */
export const CONTACT_LOAD_AIRBORNE_EXIT_MPS = 2.5;
export const CONTACT_LOAD_AIRBORNE_ENTER_MPS = -2;

export type ContactLoadState = {
  distanceM: number;
  leftLatched: boolean;
  rightLatched: boolean;
  leftContact: number;
  rightContact: number;
  leftLoad: number;
  rightLoad: number;
  impulseAgeS: number;
  impulseArmed: boolean;
  wasAirborne: boolean;
  /** Monotonic latch-flip count: A5 asserts integer equality across frame rates. */
  contactEvents: number;
  pelvisDropM: number;
  pelvisRollRad: number;
  chestPitchRad: number;
  chestRollRad: number;
  shoulderRad: number;
  spineEffortRad: number;
  weight: number;
  /** Version stamp: also keeps CONTACT_LOAD_OVERLAY_MARKER referenced from the shipped path so the bundler cannot shake it out (lane bundle-proof rule). */
  contract: typeof CONTACT_LOAD_OVERLAY_MARKER;
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampRange(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

function snapTo(v: number, target: number): number {
  if (target === 0 && Math.abs(v) < CONTACT_LOAD_SNAP_EPSILON) return 0;
  if (target === 1 && Math.abs(1 - v) < CONTACT_LOAD_SNAP_EPSILON) return 1;
  return v;
}

/** Allocated once at operator create; never in the per-frame path. */
export function createContactLoadState(): ContactLoadState {
  return {
    distanceM: 0,
    leftLatched: false,
    rightLatched: false,
    leftContact: 0,
    rightContact: 0,
    leftLoad: 0,
    rightLoad: 0,
    impulseAgeS: 0,
    impulseArmed: false,
    wasAirborne: false,
    contactEvents: 0,
    pelvisDropM: 0,
    pelvisRollRad: 0,
    chestPitchRad: 0,
    chestRollRad: 0,
    shoulderRad: 0,
    spineEffortRad: 0,
    weight: 1,
    contract: CONTACT_LOAD_OVERLAY_MARKER,
  };
}

/** Epoch reset: death, respawn or continuity bump reads exactly 0 on the first frame of the new epoch (A9). */
export function resetContactLoadState(state: ContactLoadState): void {
  state.distanceM = 0;
  state.leftLatched = false;
  state.rightLatched = false;
  state.leftContact = 0;
  state.rightContact = 0;
  state.leftLoad = 0;
  state.rightLoad = 0;
  state.impulseAgeS = 0;
  state.impulseArmed = false;
  state.wasAirborne = false;
  state.contactEvents = 0;
  state.pelvisDropM = 0;
  state.pelvisRollRad = 0;
  state.chestPitchRad = 0;
  state.chestRollRad = 0;
  state.shoulderRad = 0;
  state.spineEffortRad = 0;
  state.weight = 1;
}

/**
 * CT.LOAD.1a/2a advance. Mutates `state` in place, allocates nothing, reads no
 * clock, no randomness, no physics. Phase comes from accumulated distance; `dt`
 * feeds only the frame-rate-independent smoothers A5 proves convergent.
 */
export function advanceContactLoad(
  state: ContactLoadState,
  distanceDeltaM: number,
  strideLengthM: number,
  groundSpeedMps: number,
  slideMps: number,
  deltaSeconds: number,
  airborne: boolean,
  weight: number,
): void {
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const w = clamp01(Number.isFinite(weight) ? weight : 1);
  state.weight = w;
  const dist = Math.max(0, Number.isFinite(distanceDeltaM) ? distanceDeltaM : 0);
  state.distanceM += dist;
  const stride = Number.isFinite(strideLengthM) && strideLengthM > 0.2 ? strideLengthM : 1.62;
  const speed = Math.max(0, Number.isFinite(groundSpeedMps) ? groundSpeedMps : 0);
  const slide = Math.max(0, Number.isFinite(slideMps) ? slideMps : 0);
  const standing = speed < CONTACT_LOAD_IDLE_SPEED_MPS;
  const phase = (((state.distanceM / stride) % 1) + 1) % 1;
  const margin = CONTACT_LOAD_PHASE_MARGIN;
  let leftTarget: number;
  let rightTarget: number;
  if (airborne) {
    leftTarget = 0;
    rightTarget = 0;
  } else if (standing) {
    leftTarget = 1;
    rightTarget = 1;
  } else {
    // Left stance window is [0, 0.5): enter 0.06 early, release 0.06 late.
    // Right stance window is [0.5, 1): enter 0.06 early, hold 0.06 past the wrap.
    const leftHold = phase < 0.5 + margin || phase >= 1 - margin;
    const leftEnter = phase < 0.5 - margin || phase >= 1 - margin;
    const rightHold = phase >= 0.5 - margin || phase < margin;
    const rightEnter = phase >= 0.5 - margin;
    leftTarget = (state.leftLatched ? leftHold : leftEnter) ? 1 : 0;
    rightTarget = (state.rightLatched ? rightHold : rightEnter) ? 1 : 0;
  }
  if ((leftTarget === 1) !== state.leftLatched) {
    state.leftLatched = leftTarget === 1;
    state.contactEvents += 1;
  }
  if ((rightTarget === 1) !== state.rightLatched) {
    state.rightLatched = rightTarget === 1;
    state.contactEvents += 1;
  }
  state.leftContact = snapTo(smoothTowards(state.leftContact, leftTarget, dt, CONTACT_LOAD_CONTACT_HZ), leftTarget);
  state.rightContact = snapTo(smoothTowards(state.rightContact, rightTarget, dt, CONTACT_LOAD_CONTACT_HZ), rightTarget);
  // Landing impulse: the frame support returns after flight. Critically-damped
  // release via the shared hit envelope — never a second decay.
  if (state.wasAirborne && !airborne) {
    state.impulseAgeS = 0;
    state.impulseArmed = true;
  }
  state.wasAirborne = airborne;
  let impulse = 0;
  if (state.impulseArmed) {
    state.impulseAgeS += dt;
    impulse = hitImpulseEnvelope(state.impulseAgeS, CONTACT_LOAD_LANDING_SHAPE) * CONTACT_LOAD_IMPULSE_GAIN;
    if (impulse <= 0) state.impulseArmed = false;
  }
  const contactSum = state.leftContact + state.rightContact;
  const rawLeft = contactSum > 1e-9 ? state.leftContact / contactSum : 0;
  const rawRight = contactSum > 1e-9 ? state.rightContact / contactSum : 0;
  state.leftLoad = snapTo(smoothTowards(state.leftLoad, rawLeft, dt, CONTACT_LOAD_RESPONSE_HZ), rawLeft);
  state.rightLoad = snapTo(smoothTowards(state.rightLoad, rawRight, dt, CONTACT_LOAD_RESPONSE_HZ), rawRight);
  const loadSum = state.leftLoad + state.rightLoad;
  const total = Math.min(LOAD_CEILING, Math.max(0, loadSum) + Math.max(0, impulse));
  const asym = loadSum > 1e-9 ? clampRange((state.rightLoad - state.leftLoad) / loadSum, -1, 1) : 0;
  // CT.LOAD.4a honesty note: `slide` drives effort (spine pitch), not pinning —
  // the residual still reads in the feet, but as strain rather than skate.
  const dropTarget = Math.min(PELVIS_DROP_SOLVE_CAP_M, PELVIS_DROP_PER_LOAD_M * total);
  const rollTarget = clampRange(asym * PELVIS_ROLL_MAX_RAD, -PELVIS_ROLL_MAX_RAD, PELVIS_ROLL_MAX_RAD);
  const chestRollTarget = clampRange(rollTarget * -0.7, -CHEST_COUNTER_MAX_RAD, CHEST_COUNTER_MAX_RAD);
  const chestPitchTarget = clampRange(dropTarget * -1.1, -CHEST_COUNTER_MAX_RAD, CHEST_COUNTER_MAX_RAD);
  const shoulderTarget = clampRange(asym * -0.8 * SHOULDER_RESPONSE_MAX_RAD, -SHOULDER_RESPONSE_MAX_RAD, SHOULDER_RESPONSE_MAX_RAD);
  const spineTarget = Math.min(SPRINT_EFFORT_MAX_RAD, slide * SPRINT_EFFORT_GAIN_RAD_PER_MPS);
  const hz = CONTACT_LOAD_RESPONSE_HZ;
  state.pelvisDropM = snapTo(smoothTowards(state.pelvisDropM, dropTarget, dt, hz), dropTarget) * w;
  state.pelvisRollRad = snapTo(smoothTowards(state.pelvisRollRad, rollTarget, dt, hz), rollTarget) * w;
  state.chestPitchRad = snapTo(smoothTowards(state.chestPitchRad, chestPitchTarget, dt, hz), chestPitchTarget) * w;
  state.chestRollRad = snapTo(smoothTowards(state.chestRollRad, chestRollTarget, dt, hz), chestRollTarget) * w;
  state.shoulderRad = snapTo(smoothTowards(state.shoulderRad, shoulderTarget, dt, hz), shoulderTarget) * w;
  state.spineEffortRad = snapTo(smoothTowards(state.spineEffortRad, spineTarget, dt, hz), spineTarget) * w;
}

/**
 * Tier weight hook for the graphics owner: `low` runs 0 beyond
 * `CONTACT_LOAD_LOW_TIER_DISTANCE_M` and a reduced ceiling inside it; every
 * other tier runs full weight. Weight 0 reproduces the pre-lane pose bit-for-bit.
 */
export function contactLoadWeightForTier(
  tier: 'low' | 'high' | 'ultra',
  distanceM: number,
): number {
  const d = Number.isFinite(distanceM) ? distanceM : 0;
  if (tier === 'low') return d > CONTACT_LOAD_LOW_TIER_DISTANCE_M ? 0 : CONTACT_LOAD_LOW_TIER_NEAR_WEIGHT;
  return 1;
}
