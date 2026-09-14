/**
 * Pass 77 / HF-375. The composed operator animation director.
 *
 * One call per operator per frame turns gameplay state into a POSE DESCRIPTION:
 * which clips to mix, at what weight, at what playback rate, plus the additive
 * bone offsets to apply after the mixer has written the pose. It deliberately
 * knows nothing about THREE, the scene graph or bone names - that binding lives
 * in the runtime that owns the rig - which is what makes every rule in here
 * testable without a GPU.
 *
 * What it replaces, concretely:
 *   - one 0.14 s fade for every transition -> a per-transition table, scaled per
 *     archetype, with weights that provably sum to 1 through the blend;
 *   - clip choice from a scalar speed -> a direction-aware, speed-matched blend;
 *   - a dropped aim pitch -> a smoothed, clamped spine distribution;
 *   - one-shots left clamped at full weight forever -> bounded envelopes that
 *     return to exactly zero and never fully hide locomotion.
 *
 * Deterministic by construction: deltas in, no clock reads, no `Math.random`.
 */

import {
  advanceAdditivePose,
  createAdditivePoseState,
  type AdditivePoseOutput,
  type AdditivePoseState,
} from './animation-additive-pose';
import {
  advanceBlendGraph,
  blendGraphLayers,
  blendTransitionSeconds,
  createBlendGraph,
  requestBlendTarget,
  type BlendGraphDefinition,
  type BlendGraphState,
} from './animation-blend-graph';
import {
  solveLocomotion,
  type LocomotionPlaybackLimits,
  type LocomotionSolution,
} from './animation-locomotion';
import type { OperatorPostureOutput } from './operator-posture-layer';
import {
  advanceHitReaction,
  createHitReactionState,
  hitImpulseEnvelope,
  pushHitImpulse,
  type HitImpulse,
  type HitReactionOutput,
  type HitReactionShape,
  type HitReactionState,
} from './animation-hit-reaction';
import {
  clampedPostureBias,
  operatorIdlePhase,
  resolveOperatorIdleClip,
  resolveOperatorSkinAnimationProfile,
  type OperatorPostureBias,
  type OperatorSkinAnimationProfile,
} from './rigged-operator-skin-animation';

export type OperatorAnimationStateName = 'idle' | 'locomotion' | 'turn' | 'death';

/**
 * Per-transition durations. These are not decoration: leaving idle needs to be
 * quicker than settling into it or the operator looks like it is wading, a pivot
 * is quicker still, and death has to be near-instant so the ragdoll-less corpse
 * does not glide out of its run.
 */
export const OPERATOR_ANIMATION_TRANSITIONS: BlendGraphDefinition = Object.freeze({
  defaultTransitionS: 0.16,
  maximumLayers: 3,
  transitions: Object.freeze({
    'idle->locomotion': 0.16,
    'locomotion->idle': 0.26,
    'idle->turn': 0.1,
    'turn->idle': 0.16,
    'locomotion->turn': 0.12,
    'turn->locomotion': 0.12,
    '*->death': 0.06,
  }),
});

export type OperatorOneShotKind = 'fire' | 'melee' | 'emote-wave' | 'emote-punch' | 'emote-boot';

/**
 * Bounded one-shot envelopes. Peaks stay well below 1 so the layer reads as an
 * accent on top of locomotion, and each has a hard end, unlike the shipped
 * `clampWhenFinished` one-shots that never stop contributing.
 */
export const OPERATOR_ONE_SHOT_SHAPES: Readonly<Record<OperatorOneShotKind, HitReactionShape>> = Object.freeze({
  fire: Object.freeze({ riseSeconds: 0.025, decaySeconds: 0.13, peak: 0.5 }),
  melee: Object.freeze({ riseSeconds: 0.07, decaySeconds: 0.38, peak: 0.9 }),
  // Emotes are deliberate gestures, not combat accents: near-full weight so the
  // clip reads across the map, slower decay so the gesture completes, and the
  // same hard end as every other one-shot - nothing clamps forever.
  'emote-wave': Object.freeze({ riseSeconds: 0.08, decaySeconds: 1.05, peak: 0.95 }),
  'emote-punch': Object.freeze({ riseSeconds: 0.06, decaySeconds: 0.6, peak: 0.95 }),
  'emote-boot': Object.freeze({ riseSeconds: 0.06, decaySeconds: 0.7, peak: 0.95 }),
});

export type OperatorAnimationInput = Readonly<{
  deltaSeconds: number;
  /** Local-space velocity, +forward along the body's facing. */
  forwardMps: number;
  /** Local-space velocity, +right. */
  strafeMps: number;
  aimPitchRadians: number;
  /** Signed shortest angle from the body's yaw to the yaw it wants. */
  yawErrorRadians: number;
  dead: boolean;
  armed?: boolean;
  /** Clip names the mixer has bound. Nothing outside this set is ever emitted. */
  availableClips: readonly string[];
  /**
   * PASS 94. The posture layer's output for this operator this frame, from
   * `operator-posture-layer.ts`. Optional, and omitting it reproduces the
   * pre-PASS-94 behaviour exactly: clip selection on the raw ground speed, no
   * cadence correction, full aim authority.
   *
   * When present it does three things and nothing else:
   *   - clip selection sees the speed the POSTURE can honestly show, so a prone
   *     operator never selects a full run;
   *   - every emitted `timeScale` is multiplied by the posture's cadence scale
   *     and re-clamped to the profile's playback limits, which is what stops a
   *     crouch-walk skating on a standing stride;
   *   - the additive aim pitch is scaled by what the posture can reach.
   */
  stance?: OperatorPostureOutput | null;
}>;

export type OperatorAnimationLayer = Readonly<{ clip: string; weight: number; timeScale: number }>;

export type OperatorAnimationOutput = Readonly<{
  state: OperatorAnimationStateName;
  /**
   * The clip the CONTROLLER has selected, independent of how far the cross-fade
   * to it has progressed. `layers` describes what the mixer should render right
   * now - part-way through a transition its heaviest entry is still the clip
   * being left behind - so anything asking "what is this operator doing" wants
   * this, not `layers[0]`.
   */
  selectedClip: string | null;
  /** Base pose layers. Weights sum to 1 whenever any clip is available. */
  layers: readonly OperatorAnimationLayer[];
  /** Additive accents. Weights are independent of the base and never reach 1. */
  additiveLayers: readonly OperatorAnimationLayer[];
  aim: AdditivePoseOutput;
  posture: OperatorPostureBias;
  hitReaction: HitReactionOutput;
  locomotion: LocomotionSolution;
  /** The posture layer this frame was solved against, or null when none was supplied. */
  stance: OperatorPostureOutput | null;
}>;

export type OperatorAnimationDirector = {
  readonly profile: OperatorSkinAnimationProfile;
  readonly graph: BlendGraphState;
  readonly pose: AdditivePoseState;
  readonly hits: HitReactionState;
  oneShots: { kind: OperatorOneShotKind; ageSeconds: number }[];
};

const EMPTY_LAYERS: readonly OperatorAnimationLayer[] = Object.freeze([]);

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createOperatorAnimationDirector(skinId: string, operatorName: string): OperatorAnimationDirector {
  const profile = resolveOperatorSkinAnimationProfile(skinId);
  return {
    profile,
    graph: createBlendGraph(OPERATOR_ANIMATION_TRANSITIONS, 'idle'),
    // The idle phase is hashed from replicated identity, so two operators of the
    // same archetype are visibly out of sync and every peer agrees on how.
    pose: createAdditivePoseState(operatorIdlePhase(skinId, operatorName)),
    hits: createHitReactionState(),
    oneShots: [],
  };
}

export function pushOperatorHitImpulse(director: OperatorAnimationDirector, impulse: HitImpulse): void {
  pushHitImpulse(director.hits, impulse);
}

/** Retriggering restarts the envelope rather than stacking a second copy. */
export function pushOperatorOneShot(director: OperatorAnimationDirector, kind: OperatorOneShotKind): void {
  const existing = director.oneShots.find((entry) => entry.kind === kind);
  if (existing) {
    existing.ageSeconds = 0;
    return;
  }
  director.oneShots.push({ kind, ageSeconds: 0 });
}

function selectIdleClip(director: OperatorAnimationDirector, availableClips: readonly string[]): string | null {
  return resolveOperatorIdleClip(director.profile, availableClips);
}

/**
 * The pivot state. The corpus has no authored turn-in-place, but it does have
 * lateral runs, and a lateral run at a low playback rate is exactly the shuffle
 * a pivot is made of. Without them the state still exists and still rate-limits
 * the body yaw - it just has no shuffle under it, which is honest degradation
 * rather than a snap.
 */
function turnClips(
  turning: -1 | 0 | 1,
  availableClips: readonly string[],
  idleClip: string | null,
): OperatorAnimationLayer[] {
  const available = new Set(availableClips);
  const lateral = turning > 0 ? 'Run_Right' : 'Run_Left';
  if (available.has(lateral)) return [{ clip: lateral, weight: 1, timeScale: 0.62 }];
  return idleClip ? [{ clip: idleClip, weight: 1, timeScale: 1 }] : [];
}

function stateClips(
  name: OperatorAnimationStateName,
  director: OperatorAnimationDirector,
  input: OperatorAnimationInput,
  locomotion: LocomotionSolution,
  idleClip: string | null,
): OperatorAnimationLayer[] {
  if (name === 'death') {
    return input.availableClips.includes('Death') ? [{ clip: 'Death', weight: 1, timeScale: 1 }] : [];
  }
  if (name === 'locomotion' && locomotion.clips.length > 0) {
    return locomotion.clips.map((entry) => ({ clip: entry.clip, weight: entry.weight, timeScale: entry.timeScale }));
  }
  if (name === 'turn') return turnClips(director.pose.turning, input.availableClips, idleClip);
  return idleClip ? [{ clip: idleClip, weight: 1, timeScale: 1 }] : [];
}

/**
 * Folds the blend graph's state weights into per-clip weights. A clip reachable
 * from two states is merged once, with its playback rate weight-averaged, so the
 * mixer is never handed the same action twice with contradictory rates.
 */
function mergeLayers(contributions: readonly (readonly [number, readonly OperatorAnimationLayer[]])[]): readonly OperatorAnimationLayer[] {
  const totals = new Map<string, { weight: number; rateWeight: number }>();
  for (const [stateWeight, layers] of contributions) {
    for (const layer of layers) {
      const weight = stateWeight * layer.weight;
      if (weight <= 0) continue;
      const entry = totals.get(layer.clip) ?? { weight: 0, rateWeight: 0 };
      entry.weight += weight;
      entry.rateWeight += weight * layer.timeScale;
      totals.set(layer.clip, entry);
    }
  }
  const total = [...totals.values()].reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return EMPTY_LAYERS;
  return Object.freeze([...totals.entries()]
    .map(([clip, entry]) => Object.freeze({
      clip,
      // Renormalising absorbs any state weight that had no clip behind it (an
      // unbound Death, say), so the emitted base always sums to exactly 1.
      weight: entry.weight / total,
      timeScale: entry.rateWeight / entry.weight,
    }))
    .sort((left, right) => (right.weight - left.weight) || left.clip.localeCompare(right.clip)));
}

function advanceOneShots(
  director: OperatorAnimationDirector,
  deltaSeconds: number,
): { kind: OperatorOneShotKind; weight: number }[] {
  const live: { kind: OperatorOneShotKind; weight: number }[] = [];
  const surviving: { kind: OperatorOneShotKind; ageSeconds: number }[] = [];
  for (const entry of director.oneShots) {
    entry.ageSeconds += deltaSeconds;
    const shape = OPERATOR_ONE_SHOT_SHAPES[entry.kind];
    if (entry.ageSeconds >= shape.riseSeconds + shape.decaySeconds) continue;
    surviving.push(entry);
    const weight = hitImpulseEnvelope(entry.ageSeconds, shape) * shape.peak;
    if (weight > 0) live.push({ kind: entry.kind, weight });
  }
  director.oneShots = surviving;
  return live;
}

const ONE_SHOT_CLIPS: Readonly<Record<OperatorOneShotKind, readonly string[]>> = Object.freeze({
  fire: Object.freeze(['Gun_Shoot', 'Idle_Gun_Shoot']),
  melee: Object.freeze(['Punch_Right', 'Kick_Right']),
  'emote-wave': Object.freeze(['Wave']),
  'emote-punch': Object.freeze(['Punch_Right']),
  'emote-boot': Object.freeze(['Kick_Right']),
});

const HIT_CLIPS = Object.freeze(['HitRecieve', 'HitRecieve_2'] as const);

/**
 * PASS 94. Re-times the emitted base layers for the posture.
 *
 * A shorter stride covers less ground per cycle, so the same ground speed needs
 * a faster cycle to keep the planted foot planted. The result is re-clamped to
 * the SAME playback limits `animation-locomotion.ts` already enforces - the
 * bounds exist because a walk below 0.55x reads as slow motion and above 1.75x
 * the legs blur, and a posture correction is not a reason to leave that window.
 * Weights are untouched, so the base still sums to exactly 1.
 */
function applyCadence(
  layers: readonly OperatorAnimationLayer[],
  stance: OperatorPostureOutput | null,
  limits: LocomotionPlaybackLimits,
): readonly OperatorAnimationLayer[] {
  if (stance === null || !(stance.cadenceScale > 1)) return layers;
  return Object.freeze(layers.map((layer) => Object.freeze({
    clip: layer.clip,
    weight: layer.weight,
    timeScale: Math.min(limits.maximum, Math.max(limits.minimum, layer.timeScale * stance.cadenceScale)),
  })));
}

export function advanceOperatorAnimation(
  director: OperatorAnimationDirector,
  input: OperatorAnimationInput,
): OperatorAnimationOutput {
  // A stalled tab can hand back an enormous delta; clamping here is what keeps a
  // recovered frame from teleporting every blend to its destination at once.
  const deltaSeconds = Math.min(0.05, Math.max(0, finiteOr(input.deltaSeconds, 0)));
  const available = new Set(input.availableClips);
  const idleClip = selectIdleClip(director, input.availableClips);

  const stance = input.stance ?? null;
  // Clip selection sees the speed the posture can show. The direction is
  // untouched: a crouched operator strafing still picks the lateral run, it just
  // picks it at a speed a crouch can reach.
  const rawSpeed = Math.hypot(finiteOr(input.forwardMps, 0), finiteOr(input.strafeMps, 0));
  const selectionScale = stance !== null && rawSpeed > 1e-4
    ? Math.min(1, stance.clipSelectionSpeedMps / rawSpeed)
    : 1;

  const locomotion = solveLocomotion({
    forwardMps: finiteOr(input.forwardMps, 0) * selectionScale,
    strafeMps: finiteOr(input.strafeMps, 0) * selectionScale,
    availableClips: input.availableClips,
    armed: input.armed,
    playbackLimits: director.profile.locomotionPlaybackLimits,
  });

  const aim = advanceAdditivePose(director.pose, {
    deltaSeconds,
    desiredAimPitchRadians: input.aimPitchRadians * (stance?.aimPitchScale ?? 1),
    yawErrorRadians: input.yawErrorRadians,
    strafeMps: input.strafeMps,
    groundSpeedMps: locomotion.groundSpeedMps,
  }, director.profile.additive);

  const next: OperatorAnimationStateName = input.dead
    ? 'death'
    : locomotion.moving ? 'locomotion'
      : director.pose.turning !== 0 ? 'turn' : 'idle';
  // Death is terminal: once the corpse pose owns the graph nothing re-targets it.
  if (director.graph.target !== 'death') {
    const base = blendTransitionSeconds(OPERATOR_ANIMATION_TRANSITIONS, director.graph.target, next);
    requestBlendTarget(director.graph, next, base * Math.max(0.1, director.profile.transitionScale));
  }
  const graphLayers = deltaSeconds > 0 ? advanceBlendGraph(director.graph, deltaSeconds) : blendGraphLayers(director.graph);

  const layers = applyCadence(mergeLayers(graphLayers.map((layer) => [
    layer.weight,
    stateClips(layer.state as OperatorAnimationStateName, director, input, locomotion, idleClip),
  ] as const)), stance, director.profile.locomotionPlaybackLimits);

  const hitReaction = advanceHitReaction(director.hits, deltaSeconds, director.profile.hitReactionGain);
  const additiveLayers: OperatorAnimationLayer[] = [];
  if (hitReaction.clipWeight > 0) {
    const preferred = hitReaction.alternate ? [HIT_CLIPS[1], HIT_CLIPS[0]] : [HIT_CLIPS[0], HIT_CLIPS[1]];
    const clip = preferred.find((candidate) => available.has(candidate));
    if (clip) additiveLayers.push({ clip, weight: hitReaction.clipWeight, timeScale: 1 });
  }
  for (const entry of advanceOneShots(director, deltaSeconds)) {
    const clip = ONE_SHOT_CLIPS[entry.kind].find((candidate) => available.has(candidate));
    if (clip) additiveLayers.push({ clip, weight: entry.weight, timeScale: 1 });
  }

  const selected = stateClips(
    director.graph.target as OperatorAnimationStateName,
    director,
    input,
    locomotion,
    idleClip,
  ).reduce<OperatorAnimationLayer | null>(
    (best, layer) => (best === null || layer.weight > best.weight ? layer : best),
    null,
  );

  return Object.freeze({
    state: director.graph.target as OperatorAnimationStateName,
    selectedClip: selected?.clip ?? null,
    layers,
    additiveLayers: Object.freeze(additiveLayers
      .sort((left, right) => (right.weight - left.weight) || left.clip.localeCompare(right.clip))),
    aim,
    posture: clampedPostureBias(director.profile.posture),
    hitReaction,
    locomotion,
    stance,
  });
}
