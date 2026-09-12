/**
 * Pass 77 / HF-375. Per-skin animation differentiation.
 *
 * BE PRECISE ABOUT WHAT IS AND IS NOT PER-SKIN, because the catalog forbids the
 * obvious answer. `createOperatorSkinCatalog` rejects any skin whose rig
 * contract diverges from the default's (62 joints, 24 clips,
 * `pass65-third-person-operator-family-v1`), so every archetype is animated by
 * the SAME clips on the SAME skeleton. A per-skin clip library would need new
 * authored art and a new rig contract; it is not available here.
 *
 * Genuinely per-skin (this module):
 *   - which idle the archetype prefers, from the shared corpus;
 *   - a static posture bias in radians applied to the spine chain after the
 *     mixer - the hunch, the squared shoulders, the low-profile crouch;
 *   - breathing rate and amplitude, and a stable per-operator phase offset so
 *     two operators of the same archetype do not breathe in lockstep;
 *   - aim, lean and turn response rates;
 *   - hit-reaction gain, so a plated archetype absorbs where a light one flinches;
 *   - playback-rate limits and a transition-duration scale (heavy archetypes
 *     commit to a movement, light ones change their mind faster).
 *
 * Shared by every skin (deliberately, and stated so nobody claims otherwise):
 *   - the clip corpus, the skeleton, and the locomotion calibration measured
 *     from it;
 *   - the blend-weight arithmetic, the additive-layer maths and the hit envelope.
 *
 * The phase offset is a hash of replicated identity, never `Math.random`, so
 * every peer renders the same operator with the same idle phase.
 */

import { DEFAULT_ADDITIVE_POSE_PROFILE, type AdditivePoseProfile } from './animation-additive-pose';
import { LOCOMOTION_PLAYBACK_LIMITS, type LocomotionPlaybackLimits } from './animation-locomotion';
import { OPERATOR_SKIN_SOURCES } from './operator-skin-catalog';

export type OperatorPostureBias = Readonly<{
  spinePitchRadians: number;
  chestPitchRadians: number;
  headPitchRadians: number;
  shoulderRollRadians: number;
}>;

export type OperatorSkinAnimationProfile = Readonly<{
  archetype: string;
  /** Ordered preference into the SHARED idle corpus; first bound clip wins. */
  idleClipPreference: readonly string[];
  posture: OperatorPostureBias;
  additive: AdditivePoseProfile;
  hitReactionGain: number;
  locomotionPlaybackLimits: LocomotionPlaybackLimits;
  /** Multiplier on every blend transition duration. */
  transitionScale: number;
}>;

/** No posture bias may exceed this; past it the rig reads as deformed, not styled. */
export const MAXIMUM_POSTURE_BIAS_RADIANS = 0.26;

const IDLE_CORPUS = Object.freeze(['Idle_Gun_Pointing', 'Idle_Gun', 'Idle_Gun_Shoot'] as const);

function profile(
  archetype: string,
  idleClipPreference: readonly string[],
  posture: OperatorPostureBias,
  additive: Partial<AdditivePoseProfile>,
  hitReactionGain: number,
  transitionScale: number,
  locomotionPlaybackLimits: LocomotionPlaybackLimits = LOCOMOTION_PLAYBACK_LIMITS,
): OperatorSkinAnimationProfile {
  return Object.freeze({
    archetype,
    idleClipPreference: Object.freeze([...idleClipPreference]),
    posture: Object.freeze(posture),
    additive: Object.freeze({ ...DEFAULT_ADDITIVE_POSE_PROFILE, ...additive }),
    hitReactionGain,
    locomotionPlaybackLimits: Object.freeze({ ...locomotionPlaybackLimits }),
    transitionScale,
  });
}

/**
 * Keyed by the catalog's `archetype`, not by skin id, so a future re-skin of an
 * existing archetype inherits its movement identity for free. A test asserts
 * set equality against the catalog: adding a skin without a profile fails there
 * rather than silently falling back at runtime.
 */
export const OPERATOR_SKIN_ANIMATION_PROFILES: Readonly<Record<string, OperatorSkinAnimationProfile>> = Object.freeze({
  standard: profile(
    'standard',
    IDLE_CORPUS,
    { spinePitchRadians: 0, chestPitchRadians: 0, headPitchRadians: 0, shoulderRollRadians: 0 },
    {},
    1,
    1,
  ),
  // Light, mobile, unarmoured: reads forward-leaning, breathes hardest, turns
  // fastest, and takes the most visible flinch.
  explorer: profile(
    'explorer',
    ['Idle_Gun', 'Idle_Gun_Pointing', 'Idle_Gun_Shoot'],
    { spinePitchRadians: 0.05, chestPitchRadians: 0.03, headPitchRadians: -0.02, shoulderRollRadians: -0.03 },
    {
      aimResponseHz: 7,
      leanResponseHz: 5,
      leanGainRadiansPerMps: 0.038,
      maximumLeanRadians: 0.24,
      turnRateRadiansPerSecond: 4.2,
      breathHz: 0.32,
      breathAmplitudeRadians: 0.026,
    },
    1.25,
    0.86,
    Object.freeze({ minimum: 0.6, maximum: 1.9 }),
  ),
  // Plated and heavy: hunched, slow to commit, barely flinches, and refuses the
  // fastest playback rates because the mass should read in the stride.
  symbiote: profile(
    'symbiote',
    ['Idle_Gun_Pointing', 'Idle_Gun_Shoot', 'Idle_Gun'],
    { spinePitchRadians: 0.12, chestPitchRadians: 0.06, headPitchRadians: -0.07, shoulderRollRadians: 0.08 },
    {
      aimResponseHz: 4.2,
      leanResponseHz: 2.8,
      leanGainRadiansPerMps: 0.018,
      maximumLeanRadians: 0.13,
      turnEnterRadians: 0.68,
      turnRateRadiansPerSecond: 2.4,
      movingTurnRateScale: 2,
      breathHz: 0.19,
      breathAmplitudeRadians: 0.031,
    },
    0.6,
    1.24,
    Object.freeze({ minimum: 0.5, maximum: 1.5 }),
  ),
  // Trained and economical: low profile, minimal sway, snappiest aim, turns
  // early so it is never caught facing the wrong way.
  navalops: profile(
    'navalops',
    ['Idle_Gun_Pointing', 'Idle_Gun', 'Idle_Gun_Shoot'],
    { spinePitchRadians: 0.07, chestPitchRadians: 0.02, headPitchRadians: -0.03, shoulderRollRadians: 0.02 },
    {
      aimResponseHz: 8.5,
      leanResponseHz: 4.6,
      leanGainRadiansPerMps: 0.024,
      maximumLeanRadians: 0.16,
      turnEnterRadians: 0.62,
      turnExitRadians: 0.07,
      turnRateRadiansPerSecond: 3.9,
      breathHz: 0.22,
      breathAmplitudeRadians: 0.013,
    },
    0.85,
    0.92,
  ),
});

export const DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE = OPERATOR_SKIN_ANIMATION_PROFILES.standard!;

const ARCHETYPE_BY_SKIN_ID: ReadonlyMap<string, string> = new Map(
  OPERATOR_SKIN_SOURCES.map((source) => [source.id, source.archetype]),
);

/** Falls back to the standard profile rather than throwing: a skin that loads is presentation-only. */
export function resolveOperatorSkinAnimationProfile(skinId: string): OperatorSkinAnimationProfile {
  const archetype = ARCHETYPE_BY_SKIN_ID.get(skinId);
  return (archetype ? OPERATOR_SKIN_ANIMATION_PROFILES[archetype] : undefined)
    ?? DEFAULT_OPERATOR_SKIN_ANIMATION_PROFILE;
}

/** First preferred idle the mixer has actually bound, or null when none is. */
export function resolveOperatorIdleClip(
  profileForSkin: OperatorSkinAnimationProfile,
  availableClips: readonly string[],
): string | null {
  const available = new Set(availableClips);
  return profileForSkin.idleClipPreference.find((clip) => available.has(clip)) ?? null;
}

/**
 * FNV-1a over the replicated identity. Deterministic across peers and runs,
 * which `Math.random` would not be - two clients must not disagree about where
 * in its breathing cycle a remote operator is.
 */
export function operatorIdlePhase(skinId: string, operatorName: string): number {
  const key = `${skinId}:${operatorName}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 8) / 0x01000000;
}

/** Posture bias clamped to the sane band, ready to add to post-mixer bones. */
export function clampedPostureBias(posture: OperatorPostureBias): OperatorPostureBias {
  const bound = (value: number): number => {
    const finite = Number.isFinite(value) ? value : 0;
    return Math.max(-MAXIMUM_POSTURE_BIAS_RADIANS, Math.min(MAXIMUM_POSTURE_BIAS_RADIANS, finite));
  };
  return Object.freeze({
    spinePitchRadians: bound(posture.spinePitchRadians),
    chestPitchRadians: bound(posture.chestPitchRadians),
    headPitchRadians: bound(posture.headPitchRadians),
    shoulderRollRadians: bound(posture.shoulderRollRadians),
  });
}
