/**
 * HF-366 immersive audio: the pure acoustics behind ArenaAudio's world mix.
 *
 * Everything here is arithmetic over numbers - no AudioContext, no three.js, no
 * raycasting. ArenaAudio owns the nodes; this module owns the answer to "how
 * should a report at this distance, in this space, behind this much geometry,
 * actually sound?". Keeping the two apart is what makes the model testable and
 * what keeps the occlusion HOOK honest: the runtime samples geometry and feeds
 * a scalar in, and the audio module never learns about the world.
 *
 * Four behaviours, in the order a listener notices them:
 *
 * 1. AIR ABSORPTION. High frequencies die with distance long before level
 *    does, which is the actual reason a rifle at 60 m sounds like a thud and
 *    the same rifle at 5 m sounds like a crack. Modelled as an exponential
 *    cutoff decay per metre, per space.
 * 2. OCCLUSION. Geometry between listener and source ducks and muffles the
 *    DIRECT path while leaving the reflected tail nearly intact - that
 *    asymmetry is what makes a wall read as a wall rather than as distance.
 * 3. TAIL. Indoors, reflections come back fast, close and bright. Outdoors
 *    they come back late, sparse and dark, or not at all over open water. The
 *    arena picks the default space; the runtime may override it when the
 *    player walks inside.
 * 4. LAYERING. A report is not one sound scaled by distance. Near, the
 *    supersonic crack dominates and there is barely any tail. Far, the crack
 *    is gone entirely and what is left is body plus a rolling tail. That
 *    crossover is the whole reason the same weapon reads different at range.
 *
 * All of it is procedural by construction - these are filter and gain numbers,
 * never asset selectors. The repo's no-sampled-audio rule holds trivially.
 */

import type { ArenaId } from './arena-identity';

export const ACOUSTIC_SPACES = Object.freeze([
  'open-field', 'open-water', 'urban-yard', 'industrial-hall', 'interior-room',
] as const);

export type AcousticSpace = (typeof ACOUSTIC_SPACES)[number];

export type AcousticProfile = Readonly<{
  space: AcousticSpace;
  /** Cutoff of a source right at the listener; the brightest this space gets. */
  nearFieldCutoffHz: number;
  /** Floor the distance lowpass may not fall below, so far shots stay audible. */
  farFieldCutoffHz: number;
  /** Exponential cutoff decay per metre. Larger = muffles faster with range. */
  absorptionPerMetre: number;
  /** Delay before the first reflection arrives. Small rooms slap, fields wait. */
  tailDelaySeconds: number;
  /** How long the reflected energy takes to die. */
  tailDurationSeconds: number;
  /** Tail level relative to the direct body layer. */
  tailGain: number;
  /** Band centre of the reflected energy; hard rooms ring brighter than fields. */
  tailCentreHz: number;
  /** Tail band Q. Rooms are resonant, open ground is not. */
  tailQ: number;
}>;

/**
 * Five spaces, ordered from most open to most enclosed. The numbers are
 * relative to each other rather than measured: what matters is that walking
 * from a yard into a room audibly shortens and brightens the tail.
 */
export const ACOUSTIC_PROFILES: Readonly<Record<AcousticSpace, AcousticProfile>> = Object.freeze({
  // Suburban ground: some slapback off houses and fences, mostly air.
  'open-field': Object.freeze({
    space: 'open-field',
    nearFieldCutoffHz: 12_000, farFieldCutoffHz: 380, absorptionPerMetre: 0.041,
    tailDelaySeconds: 0.032, tailDurationSeconds: 0.62, tailGain: 0.55,
    tailCentreHz: 240, tailQ: 0.5,
  }),
  // Deck and open sea: nothing to reflect off, so the tail is a short wash and
  // the air eats the top end fastest of any space here.
  'open-water': Object.freeze({
    space: 'open-water',
    nearFieldCutoffHz: 11_000, farFieldCutoffHz: 300, absorptionPerMetre: 0.048,
    tailDelaySeconds: 0.048, tailDurationSeconds: 0.44, tailGain: 0.34,
    tailCentreHz: 195, tailQ: 0.42,
  }),
  // Containers, walls and hard corners: the classic close-quarters slapback.
  'urban-yard': Object.freeze({
    space: 'urban-yard',
    nearFieldCutoffHz: 12_500, farFieldCutoffHz: 430, absorptionPerMetre: 0.034,
    tailDelaySeconds: 0.026, tailDurationSeconds: 0.86, tailGain: 0.78,
    tailCentreHz: 330, tailQ: 0.72,
  }),
  // Big enclosed volume: long, loud, ringing. Terminal and rig interiors.
  'industrial-hall': Object.freeze({
    space: 'industrial-hall',
    nearFieldCutoffHz: 13_000, farFieldCutoffHz: 470, absorptionPerMetre: 0.028,
    tailDelaySeconds: 0.020, tailDurationSeconds: 1.25, tailGain: 0.92,
    tailCentreHz: 410, tailQ: 0.95,
  }),
  // Small hard room: the tail is immediate and bright but over quickly.
  'interior-room': Object.freeze({
    space: 'interior-room',
    nearFieldCutoffHz: 13_500, farFieldCutoffHz: 520, absorptionPerMetre: 0.022,
    tailDelaySeconds: 0.012, tailDurationSeconds: 0.48, tailGain: 0.86,
    tailCentreHz: 520, tailQ: 1.15,
  }),
});

/**
 * The arena parameter. Each arena's default space, chosen to match how the map
 * actually plays rather than what it is called: Gun Range is an indoor bay,
 * RustRig is enclosed steel, High Seas is deck over open water.
 */
export const ARENA_ACOUSTIC_SPACES: Readonly<Record<ArenaId, AcousticSpace>> = Object.freeze({
  'atomic-acres': 'open-field',
  'skyline-terminal': 'industrial-hall',
  'rustworks-1v1': 'urban-yard',
  'gun-range': 'interior-room',
  'farcrysis': 'open-field',
  'high-seas': 'open-water',
});

export const DEFAULT_ACOUSTIC_SPACE: AcousticSpace = 'open-field';

/** Range beyond which the supersonic crack has fully given way to body+tail. */
export const REPORT_CRACK_RANGE_METRES = 42;
/** Range at which the tail has grown to its full share of the report. */
export const REPORT_TAIL_FULL_RANGE_METRES = 55;
/** Speed of sound; the tail's extra delay at range is real propagation spread. */
export const SPEED_OF_SOUND_METRES_PER_SECOND = 343;

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function safeDistance(distanceMetres: number): number {
  return Number.isFinite(distanceMetres) ? Math.max(0, distanceMetres) : 0;
}

export function acousticProfile(space: AcousticSpace): AcousticProfile {
  return ACOUSTIC_PROFILES[space] ?? ACOUSTIC_PROFILES[DEFAULT_ACOUSTIC_SPACE];
}

export function arenaAcousticSpace(arenaId: ArenaId | null | undefined): AcousticSpace {
  if (!arenaId) return DEFAULT_ACOUSTIC_SPACE;
  return ARENA_ACOUSTIC_SPACES[arenaId] ?? DEFAULT_ACOUSTIC_SPACE;
}

/**
 * Cutoff for the direct path at a distance. Strictly decreasing in distance
 * until it reaches the space's floor - that monotonicity is the property a
 * listener actually perceives as "further away", so it is pinned by test.
 */
export function distanceLowpassHz(distanceMetres: number, space: AcousticSpace): number {
  const profile = acousticProfile(space);
  const decayed = profile.nearFieldCutoffHz * Math.exp(-profile.absorptionPerMetre * safeDistance(distanceMetres));
  return clamp(decayed, profile.farFieldCutoffHz, profile.nearFieldCutoffHz);
}

export type OcclusionResponse = Readonly<{
  /** Multiplier on the direct path's level. */
  directGainScale: number;
  /** Ceiling the direct path's cutoff is pulled down toward. */
  directCutoffCeilingHz: number;
  /**
   * Multiplier on the tail. Deliberately close to 1: reflected energy reaches
   * the listener around the obstruction, so a wall makes the direct sound
   * disappear into its own reverb rather than making everything quieter.
   */
  tailGainScale: number;
}>;

/** Level the direct path retains when fully occluded; never silent, just buried. */
export const OCCLUSION_FULL_DIRECT_GAIN = 0.28;
/** Cutoff a fully occluded direct path is dragged down to. */
export const OCCLUSION_FULL_CUTOFF_HZ = 420;

/**
 * Occlusion 0..1 in, filter/gain numbers out. The runtime supplies the scalar
 * from its own budgeted raycasts (see AudioOcclusionBudget in spatial-audio);
 * this module deliberately cannot see geometry.
 */
export function occlusionResponse(occlusion: number): OcclusionResponse {
  const amount = clamp(occlusion, 0, 1);
  return Object.freeze({
    directGainScale: 1 - (1 - OCCLUSION_FULL_DIRECT_GAIN) * amount,
    directCutoffCeilingHz: OCCLUSION_FULL_CUTOFF_HZ,
    tailGainScale: 1 - 0.18 * amount,
  });
}

export type WeaponReportLayering = Readonly<{
  /** Supersonic snap. Near-field only; gone well before the tail takes over. */
  crackGainScale: number;
  /** The pressure body of the report. */
  bodyGainScale: number;
  /** Cutoff applied to the body, after distance AND occlusion. */
  bodyCutoffHz: number;
  /** Reflected energy. Grows with distance until it dominates the report. */
  tailGainScale: number;
  tailDelaySeconds: number;
  tailDurationSeconds: number;
  tailCentreHz: number;
  tailQ: number;
  /** Level applied to the whole report by occlusion; exposed for telemetry. */
  directGainScale: number;
}>;

/**
 * The layering answer for one report.
 *
 * The crossover is the point: at 5 m crackGainScale is near 1 and the tail is a
 * trace, at 60 m the crack is zero and the tail is the loudest layer. Same
 * weapon, same profile, two different sounds - which is what the owner meant by
 * "the same weapon reads different at 5 m and 60 m".
 */
export function weaponReportLayering(
  distanceMetres: number,
  space: AcousticSpace,
  occlusion = 0,
): WeaponReportLayering {
  const profile = acousticProfile(space);
  const distance = safeDistance(distanceMetres);
  const occluded = occlusionResponse(occlusion);
  const crackFalloff = clamp(1 - distance / REPORT_CRACK_RANGE_METRES, 0, 1);
  const tailShare = clamp(distance / REPORT_TAIL_FULL_RANGE_METRES, 0, 1);
  const directCutoff = distanceLowpassHz(distance, space);
  const occlusionAmount = clamp(occlusion, 0, 1);
  return Object.freeze({
    // Cubed so the crack collapses fast: it is a near-field detail, and a
    // linear falloff left it audibly present at ranges where it should not be.
    crackGainScale: Math.pow(crackFalloff, 3) * occluded.directGainScale,
    // Inverse-distance body with a soft knee, so the near field is not a cliff.
    bodyGainScale: (1 / (1 + Math.pow(distance / 18, 1.35))) * occluded.directGainScale,
    // Occlusion pulls the cutoff toward its ceiling rather than replacing it,
    // so a wall and 60 m of air compound instead of one overriding the other.
    bodyCutoffHz: directCutoff + (Math.min(occluded.directCutoffCeilingHz, directCutoff) - directCutoff) * occlusionAmount,
    tailGainScale: profile.tailGain * (0.18 + 0.82 * tailShare) * occluded.tailGainScale,
    // Reflections spread as the source recedes: the far tail arrives later and
    // rings longer, which is what makes distant fire read as "rolling".
    tailDelaySeconds: profile.tailDelaySeconds + Math.min(0.2, distance / SPEED_OF_SOUND_METRES_PER_SECOND),
    tailDurationSeconds: profile.tailDurationSeconds * (0.72 + 0.58 * tailShare),
    tailCentreHz: profile.tailCentreHz,
    tailQ: profile.tailQ,
    directGainScale: occluded.directGainScale,
  });
}
