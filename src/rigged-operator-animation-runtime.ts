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
 * is what makes them testable without a skeleton.
 */
export type PoseBoneLike = { rotation: { x: number; y: number; z: number } };

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
 */
export function applyOperatorAnimationPose(
  bones: OperatorAdditiveBones,
  output: OperatorAnimationOutput,
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
