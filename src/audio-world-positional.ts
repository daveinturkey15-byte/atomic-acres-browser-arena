/**
 * PASS 95 audio-polish, HF-509 ("all the audio should have proximity too").
 *
 * The pure half of world-sound positioning. ArenaAudio owns the PannerNodes;
 * this module owns the answers a test can check without an AudioContext:
 *
 *  - how loud a world sound of a given FAMILY is at a distance (the level
 *    curve lives here, in code, so it is one documented function per family
 *    rather than a PannerNode rolloff nobody can read back);
 *  - the panner profile the runtime applies (pan and HRTF only - rolloff is
 *    zero so the code-side curve is the only attenuation and cannot compound
 *    with a second one);
 *  - the reverb send/return per acoustic zone, so walking from the street
 *    into a house audibly changes the room, not just the report tail.
 *
 * Everything is procedural numbers. No assets.
 */

import type { AcousticSpace } from './audio-immersion';

export const WORLD_SOUND_FAMILIES = Object.freeze([
  'weapon-report', 'impact', 'door', 'vehicle', 'glass', 'footstep',
] as const);

export type WorldSoundFamily = (typeof WORLD_SOUND_FAMILIES)[number];

export type WorldSoundAttenuationProfile = Readonly<{
  /** Full level inside this radius. */
  refDistanceM: number;
  /** Silent (and not scheduled) beyond this radius. */
  maxDistanceM: number;
  /** Shape of the fall between the two; larger = steeper knee. */
  exponent: number;
}>;

/**
 * Audible ranges are gameplay statements: a rifle report carries across the
 * whole of Nuke Town (36 m street), a boot does not. Ranges are per family
 * rather than per weapon so bots and remote players read identically.
 */
export const WORLD_SOUND_ATTENUATION: Readonly<Record<WorldSoundFamily, WorldSoundAttenuationProfile>> = Object.freeze({
  'weapon-report': Object.freeze({ refDistanceM: 2, maxDistanceM: 180, exponent: 1.35 }),
  impact: Object.freeze({ refDistanceM: 1.5, maxDistanceM: 60, exponent: 1.5 }),
  door: Object.freeze({ refDistanceM: 1.5, maxDistanceM: 42, exponent: 1.5 }),
  vehicle: Object.freeze({ refDistanceM: 2, maxDistanceM: 80, exponent: 1.4 }),
  glass: Object.freeze({ refDistanceM: 1.5, maxDistanceM: 60, exponent: 1.5 }),
  footstep: Object.freeze({ refDistanceM: 1, maxDistanceM: 32, exponent: 1.65 }),
});

/**
 * Level scale for a world sound at `distanceM`. 1 inside the reference radius,
 * a smooth inverse fall past it, exactly 0 at and beyond the family's maximum
 * so a caller can skip scheduling silent voices. Non-finite and negative
 * distances read as the near field, matching the immersion module.
 */
export function worldSoundAttenuation(distanceM: number, family: WorldSoundFamily): number {
  const profile = WORLD_SOUND_ATTENUATION[family];
  const distance = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  if (distance >= profile.maxDistanceM) return 0;
  if (distance <= profile.refDistanceM) return 1;
  const inverse = 1 / (1 + Math.pow((distance - profile.refDistanceM) / profile.refDistanceM, profile.exponent) * 0.18);
  // Fade the last quarter of the range to a true zero rather than leaving a
  // faint floor that never quite ends.
  const fadeStart = profile.maxDistanceM * 0.75;
  const edge = distance > fadeStart ? 1 - (distance - fadeStart) / (profile.maxDistanceM - fadeStart) : 1;
  return Number((inverse * edge).toFixed(5));
}

/**
 * The PannerNode profile for every pooled world voice. `rolloffFactor: 0`
 * makes the inverse model return 1 at every distance, so the panner
 * contributes direction (HRTF, cone-less) and nothing else; level is
 * `worldSoundAttenuation`, above, and distance muffling is the immersion
 * module's lowpass. One attenuation, in one place.
 */
export const WORLD_PANNER_PROFILE = Object.freeze({
  panningModel: 'HRTF' as PanningModelType,
  distanceModel: 'inverse' as DistanceModelType,
  refDistance: 1,
  maxDistance: 10_000,
  rolloffFactor: 0,
  /** Milliseconds a pooled panner is held after its last voice is scheduled. */
  holdMs: 520,
});

export type ReverbZoneProfile = Readonly<{
  space: AcousticSpace;
  earlyDelaySeconds: number;
  lateDelaySeconds: number;
  feedback: number;
  returnGain: number;
}>;

/**
 * Reverb return keyed by the listener's acoustic zone. Interiors are short,
 * dense and loud; the street is the shipped urban-yard return; open ground and
 * water barely answer. The runtime retunes the ONE shared feedback-delay
 * return in place, so the zone change is four AudioParam writes, never a new
 * graph.
 */
export const REVERB_ZONE_PROFILES: Readonly<Record<AcousticSpace, ReverbZoneProfile>> = Object.freeze({
  'open-field': Object.freeze({ space: 'open-field', earlyDelaySeconds: 0.049, lateDelaySeconds: 0.118, feedback: 0.22, returnGain: 0.07 }),
  'open-water': Object.freeze({ space: 'open-water', earlyDelaySeconds: 0.058, lateDelaySeconds: 0.131, feedback: 0.16, returnGain: 0.045 }),
  'urban-yard': Object.freeze({ space: 'urban-yard', earlyDelaySeconds: 0.037, lateDelaySeconds: 0.089, feedback: 0.31, returnGain: 0.12 }),
  'industrial-hall': Object.freeze({ space: 'industrial-hall', earlyDelaySeconds: 0.031, lateDelaySeconds: 0.097, feedback: 0.4, returnGain: 0.17 }),
  'interior-room': Object.freeze({ space: 'interior-room', earlyDelaySeconds: 0.019, lateDelaySeconds: 0.053, feedback: 0.44, returnGain: 0.21 }),
});

export function reverbZoneProfile(space: AcousticSpace): ReverbZoneProfile {
  return REVERB_ZONE_PROFILES[space] ?? REVERB_ZONE_PROFILES['urban-yard'];
}
