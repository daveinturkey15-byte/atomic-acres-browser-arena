import { combatConfirmEnvelope, type FootstepSurface, type ImpactSurface } from './combat-feedback';
import type { ArenaZone } from './arena-storytelling';
import type { WeaponActionEvent } from './weapon-actions';
import type { WeaponId } from './protocol';
import { presentationRandom } from './runtime-random';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { ArenaId } from './map-selection';
import type { LowHealthFeedbackPresentation } from './sensory-feedback';
import { AUDIO_BUS_IDS, type AudioBusId, type AudioSettings } from './pass65-settings';
import {
  CHIPTUNE_TRACKS,
  ChiptuneRotation,
  type ChiptuneEvent,
  type ChiptuneTrackId,
  GAME_MUSIC_COMBAT_DUCK_GAIN,
  GAME_MUSIC_NOTE_GAIN_SCALE,
  advanceMultiTrackSchedule,
} from './chiptune-music';
import { ARENA_AUDIO_DEFINITIONS, AUDIO_RUNTIME_BUDGET, selectVoiceToSteal, type FootstepMovement, type FootstepSurface as SpatialFootstepSurface, type SpatialPoint } from './spatial-audio';
// Pass 75: the intermittent "sense of place" layer above the continuous bed.
import {
  ARENA_AMBIENT_PROFILES,
  ambientEventOffset,
  nextAmbientGapSeconds,
  selectAmbientEvent,
  type AmbientEventShape,
  type ArenaAmbientEvent,
} from './arena-ambient-events';
import { EXPLOSIVE_BOLT_ARM_DELAY_MS } from './combat/ordnance';
import type { MinigunSpoolPhase } from './minigun-spool';
import {
  MATCH_COUNTDOWN_AUDIO_LIMITS,
  matchCountdownAudioCue,
  type MatchCountdownAudioCueId,
} from './match-countdown-audio';
import { WEAPON_REPORT_PROFILES } from './weapon-audio-profiles';
// HF-376: the source-synthesis vocabulary. See audio-synthesis.ts for why an
// instant-attack single exponential is the thing that made every voice in this
// game read as a beep.
import {
  METALLIC_PARTIAL_RATIOS,
  NOISE_TEXTURES,
  centsToRatio,
  fillNoiseTexture,
  pitchFallStages,
  roundRobinDetune,
  saturationCurve,
  transientEnvelope,
  type EnvelopeStage,
  type NoiseTexture,
} from './audio-synthesis';
import {
  DEFAULT_ACOUSTIC_SPACE,
  acousticProfile,
  arenaAcousticSpace,
  distanceLowpassHz,
  weaponReportLayering,
  type AcousticSpace,
} from './audio-immersion';
// PASS 95 audio-polish: one level table for every bus, pan-only pooled world
// panners with a documented per-family range, and a reverb return keyed by
// the listener's acoustic zone.
import { audioBusBaseGain } from './audio-buses';
import { WORLD_PANNER_PROFILE, reverbZoneProfile, worldSoundAttenuation, type WorldSoundFamily } from './audio-world-positional';
import { acousticSpaceOverrideFor } from './audio-zone-map';

const WEAPON_REPORT_GAIN = Object.freeze(Object.fromEntries(
  WEAPON_CATALOG.map((weapon) => [weapon.id, weapon.effects.reportGain]),
) as Record<WeaponId, number>);

export const EXPLOSION_AUDIO_COALESCE_MS = 90;

/**
 * HF-351 spatial explosion families.
 *
 * Procedural recipes (no sampled or proprietary audio):
 * - semtex: sharper high-frequency crack plus a delayed debris-patter band;
 * - crossbow: metallic ringing partials (inharmonic pair) on a short body;
 * - support: deeper 30-40Hz pressure weight with a long low tail.
 */
export const EXPLOSION_SPATIAL_PROFILES = Object.freeze({
  semtex: Object.freeze({ crackHz: 3_400, crackEndRatio: 0.42, crackVolume: 0.2, crackDuration: 0.05, debrisDelay: 0.075, debrisVolume: 0.14, bodySweep: Object.freeze([120, 30] as const), bodyDuration: 0.5, bodyVolume: 0.6, ringPartialHz: 0, ringVolume: 0, subHz: 44, subEndHz: 26, subVolume: 0.34, subDuration: 0.55, refDistance: 10, rolloff: 0.28 }),
  crossbow: Object.freeze({ crackHz: 1_900, crackEndRatio: 0.55, crackVolume: 0.12, crackDuration: 0.04, debrisDelay: 0.06, debrisVolume: 0.08, bodySweep: Object.freeze([96, 34] as const), bodyDuration: 0.38, bodyVolume: 0.45, ringPartialHz: 1_240, ringVolume: 0.09, subHz: 52, subEndHz: 30, subVolume: 0.2, subDuration: 0.4, refDistance: 9, rolloff: 0.32 }),
  support: Object.freeze({ crackHz: 1_450, crackEndRatio: 0.4, crackVolume: 0.15, crackDuration: 0.07, debrisDelay: 0.11, debrisVolume: 0.16, bodySweep: Object.freeze([84, 22] as const), bodyDuration: 0.72, bodyVolume: 0.66, ringPartialHz: 0, ringVolume: 0, subHz: 38, subEndHz: 21, subVolume: 0.46, subDuration: 0.95, refDistance: 12, rolloff: 0.22 }),
} satisfies Record<'semtex' | 'crossbow' | 'support', {
  crackHz: number; crackEndRatio: number; crackVolume: number; crackDuration: number;
  debrisDelay: number; debrisVolume: number;
  bodySweep: readonly [number, number]; bodyDuration: number; bodyVolume: number;
  ringPartialHz: number; ringVolume: number;
  subHz: number; subEndHz: number; subVolume: number; subDuration: number;
  refDistance: number; rolloff: number;
}>);

export type ExplosionSpatialFamily = keyof typeof EXPLOSION_SPATIAL_PROFILES;

/**
 * HF-376 per-surface impact identity.
 *
 * The old impact() gave each material two numbers - a band-pass frequency and
 * a tone pitch - so concrete, wood and metal were the same click transposed.
 * A material is identified by three things instead: the grain of the strike
 * (does it shatter, does it rasp, does it absorb), the resonance and decay of
 * the body it sets ringing, and the debris it throws.
 */
type ImpactMaterialProfile = Readonly<{
  strikeHz: number;
  strikeQ: number;
  strikeSeconds: number;
  strikeVolume: number;
  strikeTexture: NoiseTexture;
  /** The strike band falls to this fraction of its start over the burst. */
  strikeFallRatio: number;
  resonanceHz: number;
  resonanceQ: number;
  resonanceGainDb: number;
  drive: number;
  bodyHz: number;
  bodySeconds: number;
  bodyVolume: number;
  bodyWave: OscillatorType;
  bodyPunch: number;
  /** Inharmonic second partial, or 0 where the material does not ring. */
  ringRatio: number;
  debrisHz: number;
  debrisSeconds: number;
  debrisVolume: number;
  debrisDelay: number;
}>;

const IMPACT_MATERIAL_PROFILES: Readonly<Record<ImpactSurface, ImpactMaterialProfile>> = Object.freeze({
  // Shatters. Bright crackle grains, a long inharmonic ring, and shards that
  // keep falling well after the round has gone.
  glass: Object.freeze({
    strikeHz: 5_200, strikeQ: 1, strikeSeconds: 0.095, strikeVolume: 0.105, strikeTexture: 'crackle',
    strikeFallRatio: 0.5, resonanceHz: 7_600, resonanceQ: 6, resonanceGainDb: 8, drive: 0.35,
    bodyHz: 1_460, bodySeconds: 0.11, bodyVolume: 0.034, bodyWave: 'triangle', bodyPunch: 0.32,
    ringRatio: METALLIC_PARTIAL_RATIOS[2]!, debrisHz: 3_600, debrisSeconds: 0.28, debrisVolume: 0.05, debrisDelay: 0.03,
  }),
  // Rings. Hard white strike into a tight resonance, then an inharmonic pair -
  // a harmonic pair would be heard as a musical note, not as a steel plate.
  metal: Object.freeze({
    strikeHz: 3_150, strikeQ: 1.6, strikeSeconds: 0.065, strikeVolume: 0.09, strikeTexture: 'white',
    strikeFallRatio: 0.55, resonanceHz: 2_400, resonanceQ: 8, resonanceGainDb: 11, drive: 0.5,
    bodyHz: 960, bodySeconds: 0.14, bodyVolume: 0.033, bodyWave: 'square', bodyPunch: 0.26,
    ringRatio: METALLIC_PARTIAL_RATIOS[1]!, debrisHz: 4_200, debrisSeconds: 0.1, debrisVolume: 0.016, debrisDelay: 0.018,
  }),
  // Knocks hollow and dies. Grit for the fibre tearing, a fast-decaying low
  // body, and splinters.
  wood: Object.freeze({
    strikeHz: 980, strikeQ: 1, strikeSeconds: 0.075, strikeVolume: 0.075, strikeTexture: 'grit',
    strikeFallRatio: 0.42, resonanceHz: 620, resonanceQ: 5, resonanceGainDb: 9, drive: 0.4,
    bodyHz: 240, bodySeconds: 0.075, bodyVolume: 0.032, bodyWave: 'triangle', bodyPunch: 0.22,
    ringRatio: 0, debrisHz: 1_800, debrisSeconds: 0.16, debrisVolume: 0.028, debrisDelay: 0.022,
  }),
  // Absorbs. Brown strike, almost no resonance, and a scatter of thrown dirt.
  soil: Object.freeze({
    strikeHz: 460, strikeQ: 0.7, strikeSeconds: 0.09, strikeVolume: 0.07, strikeTexture: 'brown',
    strikeFallRatio: 0.5, resonanceHz: 180, resonanceQ: 2, resonanceGainDb: 6, drive: 0.3,
    bodyHz: 120, bodySeconds: 0.1, bodyVolume: 0.03, bodyWave: 'sine', bodyPunch: 0.38,
    ringRatio: 0, debrisHz: 900, debrisSeconds: 0.2, debrisVolume: 0.03, debrisDelay: 0.03,
  }),
  // Spalls. Crackle strike with a dusty mid resonance and a chip scatter; the
  // most common surface in the game, so the one worth getting exactly right.
  concrete: Object.freeze({
    strikeHz: 1_780, strikeQ: 1.1, strikeSeconds: 0.07, strikeVolume: 0.082, strikeTexture: 'crackle',
    strikeFallRatio: 0.45, resonanceHz: 1_100, resonanceQ: 4, resonanceGainDb: 8, drive: 0.45,
    bodyHz: 410, bodySeconds: 0.07, bodyVolume: 0.03, bodyWave: 'triangle', bodyPunch: 0.24,
    ringRatio: 0, debrisHz: 2_600, debrisSeconds: 0.22, debrisVolume: 0.034, debrisDelay: 0.024,
  }),
});

/**
 * HF-376 per-surface footstep identity.
 *
 * A step is not one noise burst: it is a heel strike, the weight of the body
 * arriving through the material, and the scuff of the sole leaving it. Which
 * of those three dominates is what tells a player whether the man they cannot
 * see is on steel deck or in long grass - and the old single band-pass could
 * only ever say "somewhere, quietly".
 */
type FootstepMaterialProfile = Readonly<{
  /** Heel: the sharp part. Texture is the surface's own grain. */
  heelHz: number;
  heelQ: number;
  heelTexture: NoiseTexture;
  heelVolume: number;
  /** Body: how much low weight the surface transmits into the floor. */
  bodyHz: number;
  bodyVolume: number;
  bodyWave: OscillatorType;
  /** Resonance the step excites: deck plate, hollow boards, packed earth. */
  resonanceHz: number;
  resonanceQ: number;
  /** Scuff: the sole dragging off. Loud on grit, near silent on wet soil. */
  scuffHz: number;
  scuffVolume: number;
  scuffTexture: NoiseTexture;
}>;

const FOOTSTEP_MATERIAL_PROFILES: Readonly<Record<SpatialFootstepSurface, FootstepMaterialProfile>> = Object.freeze({
  asphalt: Object.freeze({
    heelHz: 1_050, heelQ: 1.05, heelTexture: 'crackle', heelVolume: 1,
    bodyHz: 72, bodyVolume: 1, bodyWave: 'triangle', resonanceHz: 420, resonanceQ: 2.2,
    scuffHz: 2_600, scuffVolume: 0.5, scuffTexture: 'grit',
  }),
  concrete: Object.freeze({
    heelHz: 1_420, heelQ: 1.3, heelTexture: 'crackle', heelVolume: 0.98,
    bodyHz: 86, bodyVolume: 0.9, bodyWave: 'triangle', resonanceHz: 560, resonanceQ: 2.8,
    scuffHz: 3_100, scuffVolume: 0.55, scuffTexture: 'grit',
  }),
  // Hollow: the loudest resonance of any surface, and the reason wooden decks
  // give a defender away through a wall.
  wood: Object.freeze({
    heelHz: 720, heelQ: 0.9, heelTexture: 'white', heelVolume: 0.92,
    bodyHz: 118, bodyVolume: 1.1, bodyWave: 'triangle', resonanceHz: 235, resonanceQ: 5.5,
    scuffHz: 1_500, scuffVolume: 0.3, scuffTexture: 'grit',
  }),
  // Steel deck: bright, ringing, and the most locatable surface in the game.
  metal: Object.freeze({
    heelHz: 1_900, heelQ: 1.5, heelTexture: 'white', heelVolume: 1.05,
    bodyHz: 142, bodyVolume: 0.85, bodyWave: 'square', resonanceHz: 1_180, resonanceQ: 7.5,
    scuffHz: 4_200, scuffVolume: 0.35, scuffTexture: 'white',
  }),
  // Soft and broadband: almost no body, almost all scuff. Grass should be the
  // surface you can sneak on.
  grass: Object.freeze({
    heelHz: 330, heelQ: 0.6, heelTexture: 'grit', heelVolume: 0.68,
    bodyHz: 42, bodyVolume: 0.55, bodyWave: 'sine', resonanceHz: 160, resonanceQ: 1.2,
    scuffHz: 2_100, scuffVolume: 0.85, scuffTexture: 'grit',
  }),
  soil: Object.freeze({
    heelHz: 430, heelQ: 0.7, heelTexture: 'brown', heelVolume: 0.78,
    bodyHz: 48, bodyVolume: 0.8, bodyWave: 'sine', resonanceHz: 190, resonanceQ: 1.5,
    scuffHz: 1_250, scuffVolume: 0.6, scuffTexture: 'grit',
  }),
});


/** HF-350: ambience bed ducks for this long after any explosion mix. */
export const AMBIENCE_EXPLOSION_DUCK_MS = 4_000;
/** HF-350: duck target multiplier and setTargetAtTime smoothing constant. */
export const AMBIENCE_EXPLOSION_DUCK_GAIN = 0.4;
export const AMBIENCE_EXPLOSION_DUCK_TIME_CONSTANT_S = 0.18;
/**
 * HF-351 (owner-supplied technique): give ambient bed loops MUTUALLY
 * INCOMMENSURATE periods so the summed ambience never audibly repeats. Each
 * bed voice drifts against the others; the combined pattern's repetition
 * period is effectively unbounded. Values are prime-ish, irrational-ratio
 * seconds and must never be integer multiples of each other.
 */
export const AMBIENCE_INCOMMENSURATE_PERIODS_SECONDS = Object.freeze([9.31, 11.73, 16.41] as const);

export const GRENADE_FUSE_BEEP_START_MS = 1_450;

export const FLASHBANG_AUDIO_PROFILE = Object.freeze({
  impactDurationSeconds: 0.085,
  impactVolume: 0.48,
  firstRecoveryDelaySeconds: 0.025,
  firstRecoveryDurationSeconds: 0.72,
  firstRecoveryVolume: 0.12,
  secondRecoveryDelaySeconds: 0.09,
  secondRecoveryDurationSeconds: 0.48,
  secondRecoveryVolume: 0.065,
  maximumTailMs: 745,
  scheduledBeeps: 0,
  onsetDelayMs: 0,
} as const);

/**
 * HF-351 near-blast tinnitus tail (reuses the flashbang recovery envelope
 * pattern): soft sine sweeps that fade over ~2.4s when a blast detonates
 * within NEAR_BLAST_TINNITUS_DISTANCE of the listener. Accessibility scaling
 * multiplies the volume; reduced-sensory callers pass scale 0.
 */
export const NEAR_BLAST_TINNITUS_DISTANCE = 7;
export const NEAR_BLAST_TINNITUS_TAIL_MS = 2_400;
export const NEAR_BLAST_TINNITUS_PROFILE = Object.freeze({
  firstFromHz: 5_200,
  firstToHz: 2_300,
  firstDurationSeconds: FLASHBANG_AUDIO_PROFILE.firstRecoveryDurationSeconds,
  firstVolume: 0.05,
  secondFromHz: 6_800,
  secondToHz: 3_100,
  secondDurationSeconds: FLASHBANG_AUDIO_PROFILE.secondRecoveryDurationSeconds,
  secondVolume: 0.032,
});

export type FlashbangAudioEnvelope = Readonly<{
  audioGain: number;
  impactVolume: number;
  firstRecoveryVolume: number;
  secondRecoveryVolume: number;
  maximumTailMs: number;
  scheduledBeeps: 0;
  onsetDelayMs: 0;
}>;

type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext;

export type BrowserAudioContextResolution = Readonly<{
  constructor: AudioContextConstructor | null;
  source: 'standard' | 'webkit' | 'unavailable';
}>;

export type AudioListenerPoseMode = 'modern-audio-param' | 'legacy-setters' | 'hybrid' | 'unavailable';

type AudioListenerAudioParam = { value: number };

type CompatibleAudioListener = Readonly<{
  positionX?: unknown;
  positionY?: unknown;
  positionZ?: unknown;
  forwardX?: unknown;
  forwardY?: unknown;
  forwardZ?: unknown;
  upX?: unknown;
  upY?: unknown;
  upZ?: unknown;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (x: number, y: number, z: number, xUp: number, yUp: number, zUp: number) => void;
}>;

function isMutableAudioParam(value: unknown): value is AudioListenerAudioParam {
  return typeof value === 'object' && value !== null
    && 'value' in value && typeof (value as { value?: unknown }).value === 'number';
}

/**
 * AudioListener's per-axis AudioParams remain optional in shipping engines.
 * Resolve the complete position and orientation capabilities before writing so
 * a partially implemented listener cannot receive half a pose. Setter errors
 * deliberately propagate to the frame error surface; only absent optional APIs
 * select the legacy or silent compatibility path.
 */
export function updateBrowserAudioListenerPose(
  listener: AudioListener | CompatibleAudioListener,
  position: SpatialPoint,
  yawRadians: number,
): AudioListenerPoseMode {
  if (![position.x, position.y, position.z, yawRadians].every(Number.isFinite)) return 'unavailable';
  const compatible = listener as CompatibleAudioListener;
  const modernPosition = [compatible.positionX, compatible.positionY, compatible.positionZ]
    .every(isMutableAudioParam);
  const modernOrientation = [
    compatible.forwardX, compatible.forwardY, compatible.forwardZ,
    compatible.upX, compatible.upY, compatible.upZ,
  ].every(isMutableAudioParam);
  const legacyPosition = typeof compatible.setPosition === 'function';
  const legacyOrientation = typeof compatible.setOrientation === 'function';
  if ((!modernPosition && !legacyPosition) || (!modernOrientation && !legacyOrientation)) return 'unavailable';

  const forwardX = -Math.sin(yawRadians);
  const forwardZ = -Math.cos(yawRadians);
  if (modernPosition) {
    (compatible.positionX as AudioListenerAudioParam).value = position.x;
    (compatible.positionY as AudioListenerAudioParam).value = position.y;
    (compatible.positionZ as AudioListenerAudioParam).value = position.z;
  } else {
    compatible.setPosition!(position.x, position.y, position.z);
  }
  if (modernOrientation) {
    (compatible.forwardX as AudioListenerAudioParam).value = forwardX;
    (compatible.forwardY as AudioListenerAudioParam).value = 0;
    (compatible.forwardZ as AudioListenerAudioParam).value = forwardZ;
    (compatible.upX as AudioListenerAudioParam).value = 0;
    (compatible.upY as AudioListenerAudioParam).value = 1;
    (compatible.upZ as AudioListenerAudioParam).value = 0;
  } else {
    compatible.setOrientation!(forwardX, 0, forwardZ, 0, 1, 0);
  }
  if (modernPosition && modernOrientation) return 'modern-audio-param';
  if (!modernPosition && !modernOrientation) return 'legacy-setters';
  return 'hybrid';
}

export type AudioOutputProbe = Readonly<{
  available: boolean;
  sampleRate: number;
  fftSize: number;
  rms: number;
  peak: number;
  crestFactor: number;
  spectralFlatness: number;
  highFrequencyEnergyRatio: number;
  suspiciousBroadbandHiss: boolean;
}>;

const EMPTY_AUDIO_OUTPUT_PROBE: AudioOutputProbe = Object.freeze({
  available: false,
  sampleRate: 0,
  fftSize: 0,
  rms: 0,
  peak: 0,
  crestFactor: 0,
  spectralFlatness: 0,
  highFrequencyEnergyRatio: 0,
  suspiciousBroadbandHiss: false,
});

/**
 * Measures the final compressed mix, not source counts or configured gains.
 * Persistent broadband hiss has a materially flatter spectrum and more energy
 * above 3 kHz than the two intentional low-frequency arena oscillators.
 */
export function analyzeAudioOutput(
  timeDomain: Float32Array,
  frequencyDb: Float32Array,
  sampleRate: number,
): AudioOutputProbe {
  if (timeDomain.length === 0 || frequencyDb.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return EMPTY_AUDIO_OUTPUT_PROBE;
  }
  let squared = 0;
  let peak = 0;
  for (const sample of timeDomain) {
    const finite = Number.isFinite(sample) ? sample : 0;
    squared += finite * finite;
    peak = Math.max(peak, Math.abs(finite));
  }
  const rms = Math.sqrt(squared / timeDomain.length);
  const nyquist = sampleRate / 2;
  const binWidth = nyquist / frequencyDb.length;
  let spectralCount = 0;
  let logarithmicPower = 0;
  let totalPower = 0;
  let highFrequencyPower = 0;
  for (let index = 0; index < frequencyDb.length; index += 1) {
    const frequency = index * binWidth;
    if (frequency < 80 || frequency > Math.min(12_000, nyquist)) continue;
    const db = Number.isFinite(frequencyDb[index]) ? frequencyDb[index]! : -120;
    const power = Math.pow(10, Math.max(-120, Math.min(0, db)) / 10);
    totalPower += power;
    if (frequency >= 3_000) highFrequencyPower += power;
    logarithmicPower += Math.log(Math.max(power, 1e-12));
    spectralCount += 1;
  }
  const arithmeticMean = spectralCount > 0 ? totalPower / spectralCount : 0;
  const geometricMean = spectralCount > 0 ? Math.exp(logarithmicPower / spectralCount) : 0;
  const spectralFlatness = arithmeticMean > 1e-12 ? Math.min(1, geometricMean / arithmeticMean) : 0;
  const highFrequencyEnergyRatio = totalPower > 1e-12 ? Math.min(1, highFrequencyPower / totalPower) : 0;
  const crestFactor = rms > 1e-9 ? peak / rms : 0;
  return Object.freeze({
    available: true,
    sampleRate,
    fftSize: timeDomain.length,
    rms: Number(rms.toFixed(8)),
    peak: Number(peak.toFixed(8)),
    crestFactor: Number(crestFactor.toFixed(6)),
    spectralFlatness: Number(spectralFlatness.toFixed(8)),
    highFrequencyEnergyRatio: Number(highFrequencyEnergyRatio.toFixed(8)),
    suspiciousBroadbandHiss: rms >= 0.002
      && spectralFlatness >= 0.5
      && highFrequencyEnergyRatio >= 0.18,
  });
}

/**
 * Safari/WebKit exposed Web Audio through webkitAudioContext before the
 * standard constructor. Resolve both without evaluating an absent global
 * binding; engines with neither capability deliberately remain silent.
 */
export function resolveBrowserAudioContext(
  scope: Readonly<{
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  }> = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor },
): BrowserAudioContextResolution {
  if (typeof scope.AudioContext === 'function') {
    return Object.freeze({ constructor: scope.AudioContext, source: 'standard' });
  }
  if (typeof scope.webkitAudioContext === 'function') {
    return Object.freeze({ constructor: scope.webkitAudioContext, source: 'webkit' });
  }
  return Object.freeze({ constructor: null, source: 'unavailable' });
}

export function flashbangAudioEnvelope(requestedAudioGain: number): FlashbangAudioEnvelope {
  const audioGain = Math.max(0, Math.min(1, Number.isFinite(requestedAudioGain) ? requestedAudioGain : 0));
  return Object.freeze({
    audioGain,
    impactVolume: FLASHBANG_AUDIO_PROFILE.impactVolume * audioGain,
    firstRecoveryVolume: FLASHBANG_AUDIO_PROFILE.firstRecoveryVolume * audioGain,
    secondRecoveryVolume: FLASHBANG_AUDIO_PROFILE.secondRecoveryVolume * audioGain,
    maximumTailMs: FLASHBANG_AUDIO_PROFILE.maximumTailMs,
    scheduledBeeps: 0,
    onsetDelayMs: 0,
  });
}

export const RAILGUN_REPORT_PROFILE = Object.freeze({
  ...WEAPON_REPORT_PROFILES.railgun,
  pressureDuration: 0.62,
  layerCount: 10,
});

/** Tonal-only 2x-core spawn cue. No broadband/noise layer may regress here. */
export const OVERDRIVE_AVAILABLE_CUE_PROFILE = Object.freeze({
  broadbandNoiseLayers: 0,
  maximumDurationSeconds: 0.55,
  announcementTones: Object.freeze([
    Object.freeze({ frequencyHz: 330, durationSeconds: 0.16, volume: 0.04, wave: 'square' as const, delaySeconds: 0 }),
    Object.freeze({ frequencyHz: 495, durationSeconds: 0.20, volume: 0.05, wave: 'triangle' as const, delaySeconds: 0.12 }),
  ]),
  ambienceTone: Object.freeze({ frequencyHz: 660, durationSeconds: 0.30, volume: 0.06, wave: 'sine' as const, delaySeconds: 0.25 }),
  transient: Object.freeze({ startFrequencyHz: 1_650, endFrequencyHz: 2_350, durationSeconds: 0.13, volume: 0.025, wave: 'triangle' as const, delaySeconds: 0.05 }),
} as const);

/** Dedicated secure test-bay door identity; it must never alias shed motion. */
export const TEST_BAY_DOOR_THUMP_PROFILE = Object.freeze({
  maximumDistanceM: 42,
  maximumDurationSeconds: 0.24,
  layers: Object.freeze({
    latch: Object.freeze({ frequencyHz: 188, durationSeconds: 0.045, volume: 0.055, wave: 'square' as const, delaySeconds: 0 }),
    pressure: Object.freeze({ frequencyHz: 72, durationSeconds: 0.22, volume: 0.09, wave: 'triangle' as const, delaySeconds: 0.012 }),
    mechanism: Object.freeze({ startFrequencyHz: 108, endFrequencyHz: 38, durationSeconds: 0.2, volume: 0.068, wave: 'triangle' as const, delaySeconds: 0.018 }),
    body: Object.freeze({ frequencyHz: 620, durationSeconds: 0.09, volume: 0.052, filter: 'bandpass' as const, q: 0.72, delaySeconds: 0.006 }),
  }),
  shedEmitterReused: false,
} as const);

export function railgunReportAttenuation(remote: boolean, distance: number): number {
  return remote ? Math.max(0.1, 0.68 * (1 - Math.min(1, Math.max(0, distance) / 130))) : 1;
}

export function grenadeFuseBeepIntervalMs(remainingMs: number): number {
  const bounded = Math.min(GRENADE_FUSE_BEEP_START_MS, Math.max(0, Number.isFinite(remainingMs) ? remainingMs : 0));
  return Math.round(90 + bounded * 0.19);
}

export function crossbowFuseBeepIntervalMs(remainingMs: number): number {
  const bounded = Math.min(EXPLOSIVE_BOLT_ARM_DELAY_MS, Math.max(0, Number.isFinite(remainingMs) ? remainingMs : 0));
  return Math.round(70 + bounded * 0.2);
}

export type ExplosionAudioGate = {
  lastMixAt: number;
  requests: number;
  mixes: number;
  coalesced: number;
};

export function createExplosionAudioGate(): ExplosionAudioGate {
  return { lastMixAt: Number.NEGATIVE_INFINITY, requests: 0, mixes: 0, coalesced: 0 };
}

export function admitExplosionAudioMix(state: ExplosionAudioGate, now: number): { state: ExplosionAudioGate; admitted: boolean } {
  const requestedAt = Number.isFinite(now) ? now : state.lastMixAt;
  const requests = state.requests + 1;
  if (requestedAt - state.lastMixAt < EXPLOSION_AUDIO_COALESCE_MS) {
    return { state: { ...state, requests, coalesced: state.coalesced + 1 }, admitted: false };
  }
  return {
    state: { ...state, lastMixAt: requestedAt, requests, mixes: state.mixes + 1 },
    admitted: true,
  };
}

/**
 * HF-366: the tail baseline. Open ground at 0 m is the mix the weapon profiles
 * were authored against, so every space and distance is expressed as a ratio to
 * it. Computed once at module load - the layering call is pure, and doing it
 * per shot would be arithmetic in the hot fire path for a constant.
 */
const SHOT_TAIL_REFERENCE = Object.freeze({
  gain: weaponReportLayering(0, 'open-field', 0).tailGainScale,
  duration: weaponReportLayering(0, 'open-field', 0).tailDurationSeconds,
});

/**
 * HF-366: hard ceiling on when a report's tail must be finished, measured from
 * the shot. A reflective space multiplies the tail, and the railgun's tail is
 * already 0.9 s before any multiplier - unbounded, one distant railgun report
 * would hold a voice for most of two seconds and the bounded mix would start
 * stealing combat audio. Light weapons never reach this ceiling, so only the
 * case that actually threatens the budget is clipped.
 */
const SHOT_TAIL_BUDGET_SECONDS = 1;

/** Final-stage dynamics: a true safety limiter, not a colour compressor. */
export const MASTER_LIMITER_PROFILE = Object.freeze({
  thresholdDb: -1,
  kneeDb: 0,
  ratio: 20,
  attackSeconds: 0.001,
  releaseSeconds: 0.1,
});

/** Two short feedback delays and allpass diffusion; no convolution or assets. */
export const SHARED_REVERB_PROFILE = Object.freeze({
  earlyDelaySeconds: 0.037,
  lateDelaySeconds: 0.089,
  feedback: 0.31,
  returnGain: 0.12,
  sends: Object.freeze({ sfx: 0.075, movement: 0.09, announcements: 0.08, ambience: 0.16 }),
});

type WeaponAcousticClass = 'pistol' | 'rifle' | 'shotgun' | 'machine-gun' | 'special';
type WeaponAcousticCharacter = Readonly<{
  kind: WeaponAcousticClass;
  clickHz: number;
  crackGain: number;
  bodyGain: number;
  tailGain: number;
  bodyCutoffScale: number;
}>;

/** Numeric voice characters keep the report distinct without changing the
 * weapon profile audit's all-positive numeric schema. */
const WEAPON_ACOUSTIC_CHARACTERS: Readonly<Record<WeaponId, WeaponAcousticCharacter>> = Object.freeze({
  carbine: { kind: 'rifle', clickHz: 3_900, crackGain: 1.02, bodyGain: 1, tailGain: 1, bodyCutoffScale: 1 },
  smg: { kind: 'machine-gun', clickHz: 4_800, crackGain: 0.88, bodyGain: 0.82, tailGain: 0.72, bodyCutoffScale: 1.1 },
  lmg: { kind: 'machine-gun', clickHz: 3_300, crackGain: 0.93, bodyGain: 1.06, tailGain: 1.2, bodyCutoffScale: 0.92 },
  scattergun: { kind: 'shotgun', clickHz: 2_700, crackGain: 1.16, bodyGain: 1.2, tailGain: 1.3, bodyCutoffScale: 0.78 },
  sniper: { kind: 'rifle', clickHz: 3_100, crackGain: 1.14, bodyGain: 1.2, tailGain: 1.42, bodyCutoffScale: 0.84 },
  railgun: { kind: 'special', clickHz: 2_200, crackGain: 1, bodyGain: 1, tailGain: 1, bodyCutoffScale: 1 },
  pistol: { kind: 'pistol', clickHz: 5_400, crackGain: 0.8, bodyGain: 0.68, tailGain: 0.52, bodyCutoffScale: 1.18 },
  magnum: { kind: 'pistol', clickHz: 3_600, crackGain: 1.04, bodyGain: 1.12, tailGain: 0.92, bodyCutoffScale: 0.94 },
  'machine-pistol': { kind: 'machine-gun', clickHz: 4_900, crackGain: 0.86, bodyGain: 0.78, tailGain: 0.68, bodyCutoffScale: 1.08 },
  'mini-uzi': { kind: 'machine-gun', clickHz: 5_100, crackGain: 0.84, bodyGain: 0.8, tailGain: 0.64, bodyCutoffScale: 1.12 },
  mp5: { kind: 'machine-gun', clickHz: 4_600, crackGain: 0.9, bodyGain: 0.84, tailGain: 0.72, bodyCutoffScale: 1.08 },
  m4a1: { kind: 'rifle', clickHz: 4_100, crackGain: 1, bodyGain: 0.98, tailGain: 0.95, bodyCutoffScale: 1 },
  'ak-47': { kind: 'rifle', clickHz: 3_450, crackGain: 1.05, bodyGain: 1.08, tailGain: 1.1, bodyCutoffScale: 0.94 },
  minigun: { kind: 'machine-gun', clickHz: 4_200, crackGain: 0.78, bodyGain: 0.74, tailGain: 0.66, bodyCutoffScale: 1.14 },
  'm14-ebr': { kind: 'rifle', clickHz: 3_700, crackGain: 1.08, bodyGain: 1.04, tailGain: 1.12, bodyCutoffScale: 0.93 },
  'slug-shotgun': { kind: 'shotgun', clickHz: 2_500, crackGain: 1.12, bodyGain: 1.16, tailGain: 1.22, bodyCutoffScale: 0.8 },
  'flashlight-pistol': { kind: 'pistol', clickHz: 5_000, crackGain: 0.84, bodyGain: 0.72, tailGain: 0.58, bodyCutoffScale: 1.15 },
  'explosive-crossbow': { kind: 'special', clickHz: 2_900, crackGain: 0.68, bodyGain: 0.58, tailGain: 0.5, bodyCutoffScale: 1.2 },
  flamethrower: { kind: 'special', clickHz: 1_900, crackGain: 0.5, bodyGain: 0.62, tailGain: 0.75, bodyCutoffScale: 0.9 },
  'crimson-flamethrower': { kind: 'special', clickHz: 2_100, crackGain: 0.52, bodyGain: 0.66, tailGain: 0.8, bodyCutoffScale: 0.88 },
  'flare-gun': { kind: 'pistol', clickHz: 3_200, crackGain: 0.72, bodyGain: 0.86, tailGain: 0.9, bodyCutoffScale: 0.95 },
});

type ReverbGraph = Readonly<{
  input: GainNode;
  returnGain: GainNode;
  earlyDelay: DelayNode;
  lateDelay: DelayNode;
  earlyFeedback: GainNode;
  lateFeedback: GainNode;
  nodes: readonly AudioNode[];
}>;

/** Footstep chains pre-built at unlock; a two-bot skirmish uses at most this many at once. */
const WORLD_FOOTSTEP_CHAIN_PREWARM = 4;

/** One pooled, pan-only world panner. Created before the fence, reused in combat. */
type WorldPannerSlot = {
  panner: PannerNode;
  busy: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * HF-376 shaping shared by both transient primitives. Every field is optional
 * and every default reproduces a plain, well-behaved one-shot, so a call site
 * that does not care reads exactly as it did before this pass.
 */
type VoiceShaping = {
  /** Seconds to peak. Defaults to a sub-millisecond ramp - never a step. */
  attack?: number;
  /** Level the body holds at, as a fraction of peak. 1 is a plain decay. */
  punch?: number;
  /** Seconds the collapse from peak to body takes. */
  punchSeconds?: number;
  /** 0..1 WaveShaper drive. Adds the harmonics that read as loudness. */
  drive?: number;
};

/** Shaping for the oscillator primitives, which additionally own a pitch contour. */
type PitchedShaping = VoiceShaping & {
  /** Per-voice detune so repeated shots are never bit-identical. */
  detuneCents?: number;
  /** How front-loaded the pitch fall is; see pitchFallStages(). */
  pitchBias?: number;
};

type NoiseOptions = VoiceShaping & {
  duration: number;
  volume: number;
  filter: BiquadFilterType;
  frequency: number;
  q?: number;
  delay?: number;
  /** Spectral character of the burst. Defaults to the historical white buffer. */
  texture?: NoiseTexture;
  /** Glide the band to this frequency across the burst (air, debris fall, scuff). */
  frequencyEndHz?: number;
  /** Optional resonant peak: barrel, cabinet, hull, shell casing. */
  resonanceHz?: number;
  resonanceQ?: number;
  resonanceGainDb?: number;
};

type SpatialFootstepChain = {
  filter: BiquadFilterNode;
  /** HF-376: the surface resonance a boot excites (deck plate, board, earth). */
  resonance: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  busy: boolean;
};

type MinigunDriveLoop = {
  source: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
};

type ChopperRotorLoop = MinigunDriveLoop & {
  panner: PannerNode;
  /** Numeric history avoids allocating a position object in the frame sync. */
  lastX: number;
  lastY: number;
  lastZ: number;
  lastUpdateSeconds: number;
};

type ContinuousVoiceScope = 'arena' | 'combat-feedback';

type ContinuousVoiceOwnership = Readonly<{
  scope: ContinuousVoiceScope;
  nodes: readonly AudioNode[];
  gains: readonly GainNode[];
}>;

/** Layered, original procedural arena mix. No sampled or proprietary game audio is used. */
export class ArenaAudio {
  private context: AudioContext | null = null;
  private contextSource: 'uninitialized' | 'failed' | BrowserAudioContextResolution['source'] = 'uninitialized';
  private listenerPoseMode: AudioListenerPoseMode = 'unavailable';
  private master: GainNode | null = null;
  private gameMusicDucker: GainNode | null = null;
  private reverbGraph: ReverbGraph | null = null;
  private readonly reverbSendGains = new Map<AudioBusId, GainNode>();
  private outputAnalyser: AnalyserNode | null = null;
  private outputTimeDomain: Float32Array<ArrayBuffer> | null = null;
  private outputFrequencyDb: Float32Array<ArrayBuffer> | null = null;
  private weapons: GainNode | null = null;
  private feedback: GainNode | null = null;
  private movement: GainNode | null = null;
  private ui: GainNode | null = null;
  private announcements: GainNode | null = null;
  private ambience: GainNode | null = null;
  /**
   * How far ahead the chiptune commits notes to the audio clock, in seconds.
   * Comfortably longer than a dropped frame or a GC pause, short enough that a
   * stop takes effect promptly.
   */
  private static readonly MUSIC_LOOKAHEAD_SECONDS = 0.75;

  /** How many rotation entries `debugMusicState()` keeps. ~40 per playing hour. */
  private static readonly MUSIC_HISTORY_LIMIT = 128;

  private readonly buses = new Map<AudioBusId, GainNode>();
  // Background chiptune. Exactly TWO long-lived oscillators for the whole track,
  // one per channel, matching AUDIO_RUNTIME_BUDGET.perBus['game-music'] = 2 by
  // construction. They are deliberately NOT put through registerVoice(): that path
  // is built for one-shot sources it may steal, and a stolen oscillator would kill
  // the music permanently rather than drop a single note. The cap is respected
  // because two is all that can ever exist, which chiptune-music.test.ts proves.
  private musicChannels: Readonly<Record<'lead' | 'bass', { osc: OscillatorNode; gain: GainNode }>> | null = null;
  private musicArenaFilter: BiquadFilterNode | null = null;
  private musicLoopStartedAtSeconds = 0;
  private musicScheduledUntilSeconds = 0;
  private musicRunning = false;
  private musicRotation = new ChiptuneRotation();
  private musicTrack: ChiptuneTrackId | null = null;
  private musicTrackHistory: Array<{ track: ChiptuneTrackId; atSeconds: number }> = [];
  /** Waveform pair owed to a swap whose bar boundary has not yet been reached. */
  private pendingMusicWaveform: { atSeconds: number; lead: OscillatorType; bass: OscillatorType } | null = null;
  private readonly busIdentity = new Map<AudioNode, AudioBusId>();
  private audioSettings: AudioSettings | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /**
   * HF-376: one shared white buffer had to serve gunfire, blasts, boots and
   * debris, so a shotgun and a footstep on gravel drew from the same spectrum.
   * Each texture is generated once at unlock from the seeded presentation
   * stream - still fully procedural, still no sampled audio.
   */
  private readonly noiseTextures = new Map<NoiseTexture, AudioBuffer>();
  /** Cached WaveShaper curves, keyed by quantised drive. */
  private readonly saturationCurves = new Map<number, Float32Array<ArrayBuffer>>();
  private saturationSupported: boolean | null = null;
  private stepVariant = 0;
  /** HF-376 per-shot round-robin index, so no two reports are bit-identical. */
  private reportVariant = 0;
  private lastNearMissAt = -10_000;
  private arenaZone: ArenaZone | null = null;
  private lastZoneCueAt = -10_000;
  private lastGrenadeFuseBeepAt = Number.NEGATIVE_INFINITY;
  private grenadeFuseBeeps = 0;
  private lastCrossbowFuseBeepAt = Number.NEGATIVE_INFINITY;
  private crossbowFuseBeeps = 0;
  private crossbowFuseLastRemainingMs = 0;
  private crossbowFuseLastDistanceM = 0;
  private minigunDriveLoop: MinigunDriveLoop | null = null;
  private minigunDriveStarts = 0;
  private minigunDriveStops = 0;
  private minigunDriveFraction = 0;
  private minigunDrivePhase: MinigunSpoolPhase = 'idle';
  private minigunDriveLastUpdateAt = Number.NEGATIVE_INFINITY;
  private readonly chopperRotorLoops = new Map<string, ChopperRotorLoop>();
  private readonly liveChopperRotorIds = new Set<string>();
  private chopperRotorStarts = 0;
  private chopperRotorStops = 0;
  private supportCuePlays = 0;
  private matchCountdownCuePlays = 0;
  private lastMatchCountdownCue: MatchCountdownAudioCueId | null = null;
  private explosionAudioGate = createExplosionAudioGate();
  // HF-350: bounded ambience-duck bookkeeping. The duck is a single
  // setTargetAtTime automation on the ambience bus; recovery is armed by wall
  // clock and re-checked on each explosion mix (no timers to leak).
  private ambienceDuckArmed = false;
  private ambienceDuckStartedAtSeconds = Number.NEGATIVE_INFINITY;
  private ambienceDuckCount = 0;
  private lastAmbienceDuckRecoverySeconds = -1;
  // HF-351: near-blast tinnitus tail counters (flashbang-pattern envelope).
  private tinnitusTails = 0;
  private lastTinnitusDistanceM = Number.NaN;
  /** HF-351 accessibility scale for the tinnitus tail (0 mutes it entirely). */
  private tinnitusAccessibilityScale: number | null = null;
  // HF-351: last spatial explosion mix summary (telemetry + tests).
  private lastSpatialExplosion: Readonly<{
    family: ExplosionSpatialFamily;
    distanceM: number;
    spatial: boolean;
    layers: number;
    atSeconds: number;
  }> | null = null;
  /**
   * HF-350/HF-351: observable explosion-audio ownership. The buzzing report can
   * only be closed with evidence about what is actually running, so the duck,
   * tinnitus and spatial-mix counters are readable rather than write-only.
   */
  explosionAudioDiagnostics(): Readonly<{
    ambienceDucks: number;
    lastAmbienceDuckRecoverySeconds: number;
    tinnitusTails: number;
    lastTinnitusDistanceM: number;
    lastSpatialExplosion: ArenaAudio['lastSpatialExplosion'];
  }> {
    return Object.freeze({
      ambienceDucks: this.ambienceDuckCount,
      lastAmbienceDuckRecoverySeconds: this.lastAmbienceDuckRecoverySeconds,
      tinnitusTails: this.tinnitusTails,
      lastTinnitusDistanceM: this.lastTinnitusDistanceM,
      lastSpatialExplosion: this.lastSpatialExplosion,
    });
  }

  private railgunReports = {
    local: 0,
    replicated: 0,
    lastAttenuation: 0,
    lastDistanceM: 0,
    lastSpatial: false,
    lastEmitter: null as SpatialPoint | null,
  };
  private readonly spatialReportDestinations = new WeakSet<AudioNode>();
  private readonly spatialReportDistances = new WeakMap<AudioNode, number>();
  private readonly railgunSpatialNodes: AudioNode[] = [];
  private readonly railgunSpatialTimers: ReturnType<typeof setTimeout>[] = [];
  private railgunSpatialChainCount = 0;
  /** HF-351: timers owning explosion spatial panner chains (railgun pattern). */
  private readonly explosionSpatialTimers: ReturnType<typeof setTimeout>[] = [];
  private flashbangs = { plays: 0, lastAudioGain: 0, immediateOnsets: 0, scheduledBeeps: 0 };
  private activeVoices = new Map<AudioScheduledSourceNode, { id: number; bus: AudioBusId; startedAt: number; priority: number; spatial: boolean; distance: number; protectedContinuous: boolean }>();
  private readonly continuousVoiceOwners = new Map<AudioScheduledSourceNode, ContinuousVoiceOwnership>();
  private nextVoiceId = 1;
  private voicesDropped = 0;
  private voicesStolen = 0;
  private activeArena: ArenaId | null = null;
  private arenaSources: AudioScheduledSourceNode[] = [];
  private arenaNodes: AudioNode[] = [];
  private combatFeedbackSources: AudioScheduledSourceNode[] = [];
  private combatFeedbackNodes: AudioNode[] = [];
  private lowHealthGains: GainNode[] = [];
  private damageFeedbackSource: OscillatorNode | null = null;
  private damageFeedbackGain: GainNode | null = null;
  private combatFeedbackPrepared = false;
  private combatFeedbackPrepareRuns = 0;
  private glassImpactPrepared = false;
  private glassImpactPrepareRuns = 0;
  private grenadeEffectsPrepared = false;
  private grenadeEffectsPrepareRuns = 0;
  private grenadeEffectWarmupSources = 0;
  private grenadeEffectWarmupNodes = 0;
  // HF-332: Interactive-destruction / collapse-debris audio prewarm state
  private destructionEffectsPrepared = false;
  private destructionEffectsPrepareRuns = 0;
  private destructionEffectWarmupSources = 0;
  private destructionEffectWarmupNodes = 0;
  private lowHealthFeedbackActive = false;
  private lowHealthFeedbackAudible = false;
  private lowHealthAppliedState: Readonly<{
    active: boolean;
    breathingGain: number;
    heartbeatGain: number;
  }> | null = null;
  private lowHealthAutomationWrites = 0;
  private damageFeedbackPulses = 0;
  private spatialChains = 0;
  private footstepChains: SpatialFootstepChain[] = [];
  /** PASS 95: pooled world panners; see prepareWorldPanners(). */
  private worldPanners: WorldPannerSlot[] = [];
  private worldPannerAcquisitions = 0;
  private worldPannerStarved = 0;
  private listenerPosition = { x: 0, y: 0, z: 0 };
  /** Pass 75: context time at which the next ambient one-shot may fire. */
  private nextAmbientEventAtSeconds = Number.POSITIVE_INFINITY;
  private ambientEventsPlayed = 0;
  // HF-366 immersion. The arena picks the default space; the runtime may
  // override it while the player is inside geometry the arena parameter cannot
  // know about (a house on Atomic Acres is not an open field).
  private acousticSpace: AcousticSpace = DEFAULT_ACOUSTIC_SPACE;
  private acousticSpaceOverride: AcousticSpace | null = null;
  /**
   * Occlusion HOOK. The runtime raycasts under its own per-frame budget and
   * feeds a 0..1 scalar back; this module never touches world geometry, so an
   * arena change can never make audio raycast against a stale collider set.
   */
  private occlusionSampler: ((emitter: SpatialPoint | null) => number) | null = null;
  private occludedReports = 0;

  configure(settings: AudioSettings): void {
    this.audioSettings = settings;
    if (!this.context) return;
    for (const id of AUDIO_BUS_IDS) this.applyBusSetting(id);
  }

  unlock(): void {
    if (!this.context) {
      if (this.contextSource === 'unavailable' || this.contextSource === 'failed') return;
      const resolution = resolveBrowserAudioContext();
      this.contextSource = resolution.source;
      if (!resolution.constructor) return;
      let candidate: AudioContext | null = null;
      try {
        candidate = new resolution.constructor();
        this.context = candidate;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = MASTER_LIMITER_PROFILE.thresholdDb;
        compressor.knee.value = MASTER_LIMITER_PROFILE.kneeDb;
        compressor.ratio.value = MASTER_LIMITER_PROFILE.ratio;
        compressor.attack.value = MASTER_LIMITER_PROFILE.attackSeconds;
        compressor.release.value = MASTER_LIMITER_PROFILE.releaseSeconds;
        this.master = this.context.createGain();
        this.master.gain.value = audioBusBaseGain('master');
        this.master.connect(compressor);
        if (typeof this.context.createAnalyser === 'function') {
          this.outputAnalyser = this.context.createAnalyser();
          this.outputAnalyser.fftSize = 2_048;
          this.outputAnalyser.smoothingTimeConstant = 0;
          this.outputAnalyser.minDecibels = -100;
          this.outputAnalyser.maxDecibels = -20;
          this.outputTimeDomain = new Float32Array(this.outputAnalyser.fftSize);
          this.outputFrequencyDb = new Float32Array(this.outputAnalyser.frequencyBinCount);
          compressor.connect(this.outputAnalyser).connect(this.context.destination);
        } else {
          compressor.connect(this.context.destination);
        }
        this.buses.set('master', this.master);
        this.busIdentity.set(this.master, 'master');
        this.createSharedReverb();
        // Every coefficient comes from AUDIO_BUS_LEVEL_TABLE (audio-buses.ts);
        // the table is the level document and the runtime at once.
        this.weapons = this.createBus('sfx');
        this.feedback = this.weapons;
        this.movement = this.createBus('movement');
        this.ui = this.createBus('ui');
        this.announcements = this.createBus('announcements');
        this.ambience = this.createBus('ambience');
        this.createBus('menu-music');
        this.createBus('game-music');
        this.noiseBuffer = this.createNoiseBuffer(1.2);
        this.noiseTextures.clear();
        this.noiseTextures.set('white', this.noiseBuffer);
        for (const name of NOISE_TEXTURES) {
          if (name === 'white') continue;
          // Crackle needs length to hold enough independent grains that a
          // debris burst never repeats a recognisable pattern; the rest reuse
          // the white buffer's length so their random start offsets have the
          // same amount of room to move in.
          this.noiseTextures.set(name, this.createNoiseBuffer(name === 'crackle' ? 1.8 : 1.2, name));
        }
        for (const id of AUDIO_BUS_IDS) this.applyBusSetting(id);
        this.prepareCombat();
        this.prepareWorldPanners();
        this.applyReverbZone();
        if (this.activeArena) this.startArenaBed(this.activeArena);
      } catch {
        // Audio is optional. A sandbox/device policy may expose a constructor
        // that still throws, or reject one of the initial graph nodes. Tear
        // down the partial graph and keep gameplay admission error-free.
        for (const source of this.arenaSources.splice(0)) {
          try { source.stop(); } catch { /* source may not have started */ }
          try { source.disconnect(); } catch { /* partial browser node */ }
        }
        this.stopSources(this.combatFeedbackSources);
        this.disconnectNodes(this.combatFeedbackNodes);
        if (this.reverbGraph) {
          for (const node of this.reverbGraph.nodes) {
            try { node.disconnect(); } catch { /* partial browser node */ }
          }
        }
        try { this.gameMusicDucker?.disconnect(); } catch { /* partial browser node */ }
        this.resetCombatFeedbackState();
        for (const node of [...this.buses.values()]) {
          try { node.disconnect(); } catch { /* partial browser node */ }
        }
        this.context = null;
        this.master = null;
        this.gameMusicDucker = null;
        this.reverbGraph = null;
        this.reverbSendGains.clear();
        this.outputAnalyser = null;
        this.outputTimeDomain = null;
        this.outputFrequencyDb = null;
        this.weapons = null;
        this.feedback = null;
        this.movement = null;
        this.ui = null;
        this.announcements = null;
        this.ambience = null;
        this.buses.clear();
        this.busIdentity.clear();
        this.noiseBuffer = null;
        this.noiseTextures.clear();
        this.saturationCurves.clear();
        this.contextSource = 'failed';
        if (candidate && candidate.state !== 'closed') void candidate.close().catch(() => undefined);
        return;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend();
  }

  /** Resumes an already-unlocked context (tab refocus). Never creates one. */
  resume(): void {
    if (this.context?.state === 'suspended') void this.context.resume();
  }

  dispose(): void {
    this.stopGameMusic();
    this.stopMinigunDrive();
    this.stopAllChopperRotors();
    this.stopSources(this.arenaSources);
    this.disconnectNodes(this.arenaNodes);
    this.ambienceDuckArmed = false;
    for (const timer of this.explosionSpatialTimers.splice(0)) clearTimeout(timer);
    this.stopSources(this.combatFeedbackSources);
    this.disconnectNodes(this.combatFeedbackNodes);
    for (const source of [...this.activeVoices.keys()]) this.stopSource(source);
    for (const timer of this.railgunSpatialTimers.splice(0)) clearTimeout(timer);
    for (const node of this.railgunSpatialNodes.splice(0)) {
      this.busIdentity.delete(node);
      node.disconnect();
    }
    this.spatialChains = Math.max(0, this.spatialChains - this.railgunSpatialChainCount);
    this.railgunSpatialChainCount = 0;
    for (const slot of this.worldPanners.splice(0)) {
      if (slot.timer) clearTimeout(slot.timer);
      if (slot.busy) this.spatialChains = Math.max(0, this.spatialChains - 1);
      this.spatialReportDestinations.delete(slot.panner);
      this.spatialReportDistances.delete(slot.panner);
      this.busIdentity.delete(slot.panner);
      try { slot.panner.disconnect(); } catch { /* partial browser node */ }
    }
    const context = this.context;
    this.context = null;
    this.contextSource = 'uninitialized';
    this.listenerPoseMode = 'unavailable';
    this.master = null;
    this.outputAnalyser = null;
    this.outputTimeDomain = null;
    this.outputFrequencyDb = null;
    this.weapons = null;
    this.feedback = null;
    this.movement = null;
    this.ui = null;
    this.announcements = null;
    this.ambience = null;
    this.gameMusicDucker = null;
    if (this.reverbGraph) {
      for (const node of this.reverbGraph.nodes) {
        try { node.disconnect(); } catch { /* partial browser node */ }
      }
    }
    this.reverbGraph = null;
    this.reverbSendGains.clear();
    this.buses.clear();
    this.busIdentity.clear();
    for (const chain of this.footstepChains) {
      chain.filter.disconnect();
      chain.gain.disconnect();
      chain.panner.disconnect();
    }
    this.footstepChains = [];
    this.resetCombatFeedbackState();
    this.destructionEffectsPrepared = false;
    this.destructionEffectWarmupSources = 0;
    this.destructionEffectWarmupNodes = 0;
    this.noiseBuffer = null;
    this.noiseTextures.clear();
    this.saturationCurves.clear();
    if (context && context.state !== 'closed') void context.close();
  }

  setArena(arenaId: ArenaId): void {
    if (this.activeArena === arenaId) return;
    this.activeArena = arenaId;
    // HF-366: the arena is the acoustic parameter. Set it before the bed
    // starts so the first report of a match already has the right tail, and
    // clear any interior override left over from the previous arena.
    this.acousticSpace = arenaAcousticSpace(arenaId);
    this.acousticSpaceOverride = null;
    this.applyReverbZone();
    this.stopSources(this.arenaSources);
    this.disconnectNodes(this.arenaNodes);
    this.startArenaBed(arenaId);
  }

  /**
   * HF-366: override the arena's default acoustic space, e.g. while the player
   * is inside a house or a container. Pass null to fall back to the arena.
   * Lifecycle only - it emits nothing, it changes how the next report sounds.
   */
  setAcousticSpace(space: AcousticSpace | null): void {
    const next = space && acousticProfile(space).space === space ? space : null;
    if (next === this.acousticSpaceOverride) return;
    this.acousticSpaceOverride = next;
    this.applyReverbZone();
  }

  /**
   * PASS 95: retune the ONE shared reverb return to the current acoustic
   * zone. Four AudioParam writes with a short ramp - never a new graph, so
   * crossing a doorway mid-firefight costs nothing on the audio thread.
   */
  private applyReverbZone(): void {
    const graph = this.reverbGraph;
    const context = this.context;
    if (!graph || !context) return;
    const zone = reverbZoneProfile(this.currentAcousticSpace());
    const now = context.currentTime;
    const ramp = 0.08;
    graph.earlyDelay.delayTime.setTargetAtTime(zone.earlyDelaySeconds, now, ramp);
    graph.lateDelay.delayTime.setTargetAtTime(zone.lateDelaySeconds, now, ramp);
    graph.earlyFeedback.gain.setTargetAtTime(zone.feedback, now, ramp);
    graph.lateFeedback.gain.setTargetAtTime(zone.feedback * 0.82, now, ramp);
    graph.returnGain.gain.setTargetAtTime(zone.returnGain, now, ramp);
  }

  /**
   * PASS 95: pre-create the pooled world panners so combat never constructs
   * a PannerNode (HRTF panner construction is the classic first-shot hitch).
   * Idempotent; feature-detected so partial test contexts stay dry.
   */
  private prepareWorldPanners(): void {
    const context = this.context;
    if (!context || !this.weapons || this.worldPanners.length > 0 || typeof context.createPanner !== 'function') return;
    for (let index = 0; index < AUDIO_RUNTIME_BUDGET.spatialVoices; index += 1) {
      const panner = context.createPanner();
      panner.panningModel = WORLD_PANNER_PROFILE.panningModel;
      panner.distanceModel = WORLD_PANNER_PROFILE.distanceModel;
      panner.refDistance = WORLD_PANNER_PROFILE.refDistance;
      panner.maxDistance = WORLD_PANNER_PROFILE.maxDistance;
      panner.rolloffFactor = WORLD_PANNER_PROFILE.rolloffFactor;
      panner.connect(this.weapons);
      this.busIdentity.set(panner, 'sfx');
      this.worldPanners.push({ panner, busy: false, timer: null });
    }
    // Footstep chains were allocated lazily on the first world step of a
    // match; warm the steady-state set so a bot's first sprint is not the
    // frame that constructs four HRTF panners.
    const warmChains: SpatialFootstepChain[] = [];
    for (let index = 0; index < WORLD_FOOTSTEP_CHAIN_PREWARM; index += 1) {
      const chain = this.acquireFootstepChain();
      if (!chain) break;
      warmChains.push(chain);
    }
    for (const chain of warmChains) chain.busy = false;
  }

  /**
   * PASS 95: a pan-only pooled panner at `emitter` for a world sound of
   * `family`, or null when the sound is out of the family's range, the pool
   * is exhausted, or the spatial budget is full. Level is the caller's; the
   * panner contributes direction only (see WORLD_PANNER_PROFILE).
   */
  private acquireWorldPanner(emitter: SpatialPoint, distance: number, family: WorldSoundFamily): PannerNode | null {
    if (!this.context || ![emitter.x, emitter.y, emitter.z, distance].every(Number.isFinite)) return null;
    if (worldSoundAttenuation(distance, family) <= 0) return null;
    if (this.spatialChains + 1 > AUDIO_RUNTIME_BUDGET.spatialVoices) {
      this.voicesDropped += 1;
      return null;
    }
    const slot = this.worldPanners.find((entry) => !entry.busy);
    if (!slot) {
      this.worldPannerStarved += 1;
      return null;
    }
    const { panner } = slot;
    panner.positionX.value = emitter.x;
    panner.positionY.value = emitter.y;
    panner.positionZ.value = emitter.z;
    slot.busy = true;
    this.worldPannerAcquisitions += 1;
    this.spatialReportDestinations.add(panner);
    this.spatialReportDistances.set(panner, distance);
    this.spatialChains += 1;
    slot.timer = setTimeout(() => {
      slot.timer = null;
      slot.busy = false;
      this.spatialReportDestinations.delete(panner);
      this.spatialReportDistances.delete(panner);
      this.spatialChains = Math.max(0, this.spatialChains - 1);
    }, WORLD_PANNER_PROFILE.holdMs);
    return panner;
  }

  /** Bus destination for a world one-shot: the pooled panner when positioned, else the dry sfx bus. */
  private worldDestination(emitter: SpatialPoint | undefined, distance: number, family: WorldSoundFamily): AudioNode | null {
    return (emitter ? this.acquireWorldPanner(emitter, distance, family) : null) ?? this.feedback;
  }

  /** PASS 95 world-panner pool telemetry, for the headless routing test and the report. */
  worldPannerTelemetry(): Readonly<{ pooled: number; busy: number; acquisitions: number; starved: number; spatialChains: number }> {
    return Object.freeze({
      pooled: this.worldPanners.length,
      busy: this.worldPanners.filter((slot) => slot.busy).length,
      acquisitions: this.worldPannerAcquisitions,
      starved: this.worldPannerStarved,
      spatialChains: this.spatialChains,
    });
  }

  /**
   * HF-366: install the runtime's occlusion probe. The sampler returns 0 for a
   * clear line and 1 for fully blocked; anything in between is partial cover.
   * It is called at most once per world report, on the emitting thread, so the
   * runtime is free to answer from a cached, budgeted raycast rather than a
   * fresh one. Pass null to remove it (reports then read as unoccluded).
   */
  setOcclusionSampler(sampler: ((emitter: SpatialPoint | null) => number) | null): void {
    this.occlusionSampler = typeof sampler === 'function' ? sampler : null;
  }

  /** Current acoustic space: the runtime override when set, else the arena's. */
  private currentAcousticSpace(): AcousticSpace {
    return this.acousticSpaceOverride ?? this.acousticSpace;
  }

  /**
   * Sample the occlusion hook, failing soft. A sampler that throws or returns
   * nonsense must never take the report down with it - a missing duck is a
   * cosmetic loss, a thrown exception mid-mix is a silent match.
   */
  private sampleOcclusion(emitter: SpatialPoint | null): number {
    if (!this.occlusionSampler) return 0;
    let value = 0;
    try {
      value = this.occlusionSampler(emitter);
    } catch {
      return 0;
    }
    if (!Number.isFinite(value)) return 0;
    const occlusion = Math.min(1, Math.max(0, value));
    if (occlusion > 0) this.occludedReports += 1;
    return occlusion;
  }

  /**
   * Pass 75: drive the intermittent ambience. Called from the frame loop; it
   * is deliberately cheap on the common path (one clock comparison) because it
   * runs every frame.
   *
   * Everything here fails soft: no context, no arena, a full voice budget or a
   * ducked ambience bus all simply mean no event this tick.
   */
  updateArenaAmbience(): void {
    const context = this.context;
    const arenaId = this.activeArena;
    if (!context || !arenaId || !this.ambience) return;
    const now = context.currentTime;
    if (now < this.nextAmbientEventAtSeconds) return;
    const profileForArena = ARENA_AMBIENT_PROFILES[arenaId];
    this.nextAmbientEventAtSeconds = now + nextAmbientGapSeconds(profileForArena, Math.random());
    // Never let ambience crowd out combat audio.
    if (this.spatialChains + this.arenaSources.length >= AUDIO_RUNTIME_BUDGET.spatialVoices) return;
    const entry = selectAmbientEvent(profileForArena, Math.random());
    if (entry) this.playAmbientEvent(entry);
  }

  /**
   * HF-376 shape character for an ambient one-shot.
   *
   * Pass 75 placed sparse, spatialised events around each arena, which is the
   * right structure - but every one of them was a single sine sweep or a single
   * band of the shared white buffer, so a gull, a hull creak and a pipe clank
   * were the same voice at three pitches. What identifies each of those in the
   * real world is its texture, its resonance and its amplitude behaviour over
   * time, so those are what this table carries.
   */
  private ambientShapeCharacter(shape: AmbientEventShape): Readonly<{
    texture: NoiseTexture;
    tonalWave: OscillatorType;
    resonanceQ: number;
    resonanceGainDb: number;
    /** Peak-relative level the body holds after its initial fall. */
    punch: number;
    /** Attack as a fraction of the event's length. */
    attackFraction: number;
    /** Stick-slip / trill segments; 0 means a smooth envelope. */
    segments: number;
  }> {
    switch (shape) {
      // Insects and small birds: a fast trill, not a tone. The segments are
      // what make it read as a living thing rather than as a test signal.
      case 'chirp': return { texture: 'white', tonalWave: 'triangle', resonanceQ: 9, resonanceGainDb: 12, punch: 0.7, attackFraction: 0.06, segments: 5 };
      // Gulls, dogs, tannoy: a formant with a slow onset and a vibrato-ish
      // wobble from the segment count.
      case 'call': return { texture: 'white', tonalWave: 'sawtooth', resonanceQ: 6, resonanceGainDb: 14, punch: 0.72, attackFraction: 0.12, segments: 3 };
      // Stressed wood and steel: stick-slip. A creak is a sequence of tiny
      // releases, which is exactly what the segmented envelope produces, and
      // is why a smooth ramp could never sound like one.
      case 'creak': return { texture: 'grit', tonalWave: 'triangle', resonanceQ: 11, resonanceGainDb: 13, punch: 0.6, attackFraction: 0.18, segments: 7 };
      // Struck metal: hard attack, inharmonic ring, gone quickly.
      case 'clank': return { texture: 'crackle', tonalWave: 'square', resonanceQ: 10, resonanceGainDb: 13, punch: 0.16, attackFraction: 0.01, segments: 0 };
      // Foliage, steam, air handling: no attack to speak of, a long swell.
      case 'rustle': return { texture: 'grit', tonalWave: 'sine', resonanceQ: 1.4, resonanceGainDb: 5, punch: 0.8, attackFraction: 0.34, segments: 0 };
      // Wind, surf, jet wash: the slowest swell of all, and the darkest.
      case 'whoosh': return { texture: 'pink', tonalWave: 'sine', resonanceQ: 1.1, resonanceGainDb: 4, punch: 0.85, attackFraction: 0.4, segments: 0 };
      // Machinery and hull impacts: weight, then a held low body.
      default: return { texture: 'brown', tonalWave: 'triangle', resonanceQ: 2.2, resonanceGainDb: 9, punch: 0.42, attackFraction: 0.03, segments: 0 };
    }
  }

  /**
   * Amplitude contour for one ambient one-shot. Smooth shapes delegate to the
   * shared transient envelope; segmented shapes (creak stick-slip, chirp trill)
   * get an alternating contour that a single ramp pair cannot express.
   */
  private ambientEnvelopeStages(
    shape: AmbientEventShape,
    peak: number,
    playSeconds: number,
  ): readonly EnvelopeStage[] {
    const character = this.ambientShapeCharacter(shape);
    const attack = Math.max(0.004, playSeconds * character.attackFraction);
    if (character.segments <= 0) {
      return transientEnvelope({
        peak,
        durationSeconds: playSeconds,
        attackSeconds: attack,
        punch: character.punch,
        punchSeconds: playSeconds * 0.22,
      });
    }
    const stages: EnvelopeStage[] = [
      { atSeconds: 0, value: 0.0001, ramp: 'linear' },
      { atSeconds: attack, value: peak, ramp: 'linear' },
    ];
    const bodySeconds = Math.max(0.001, playSeconds - attack);
    for (let index = 1; index <= character.segments; index += 1) {
      const at = attack + (bodySeconds * index) / (character.segments + 1);
      // Alternating hard/soft with an overall decay: a creak loses energy as
      // it slips, and a trill fades as the animal runs out of breath.
      const fade = 1 - (index / (character.segments + 1)) * 0.55;
      const level = index % 2 === 0 ? peak * fade : peak * fade * character.punch;
      stages.push({ atSeconds: at, value: Math.max(0.0002, level), ramp: 'exponential' });
    }
    stages.push({ atSeconds: playSeconds, value: 0.0001, ramp: 'exponential' });
    return Object.freeze(stages);
  }

  /**
   * Synthesises one ambient one-shot. Tonal shapes use an oscillator sweep;
   * textured shapes (rustle/whoosh) use a shaped noise buffer through a
   * band-pass, which is the same construction the weapon and explosion
   * families use - no sampled audio enters the project.
   *
   * HF-376 gave each shape its own texture, resonance and amplitude behaviour
   * (see ambientShapeCharacter) so that the arenas stop sharing one voice.
   */
  private playAmbientEvent(entry: ArenaAmbientEvent): void {
    const context = this.context;
    if (!context || !this.ambience) return;
    const now = context.currentTime;
    const offset = ambientEventOffset(entry, Math.random());
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 6;
    panner.maxDistance = 140;
    panner.rolloffFactor = 0.6;
    panner.positionX.value = this.listenerPosition.x + offset.x;
    panner.positionY.value = offset.y;
    panner.positionZ.value = this.listenerPosition.z + offset.z;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    // Envelope is scheduled after the clamp below so it always matches the
    // sound's real length.

    const character = this.ambientShapeCharacter(entry.shape);
    const [startHz, endHz] = entry.sweepHz;
    let source: AudioScheduledSourceNode;
    const extraNodes: AudioNode[] = [gain, panner];
    const textureBuffer = this.noiseTextures.get(character.texture) ?? this.noiseBuffer;
    // A non-looping noise event cannot outlive its buffer; clamping here keeps
    // the envelope and the audible sound the same length.
    const textured = entry.noiseQ > 0 && textureBuffer !== null;
    const playSeconds = textured
      ? Math.min(entry.durationSeconds, textureBuffer!.duration)
      : entry.durationSeconds;

    if (textured) {
      const noise = context.createBufferSource();
      noise.buffer = textureBuffer;
      // HF-165/HF-282: NEVER loop a noise buffer. An indefinite broadband loop
      // is exactly the recurring hiss those rows exist to prevent, and a
      // source-text contract forbids enabling looping in this file. Textured
      // events are therefore bounded by the buffer's own length.
      noise.loop = false;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = entry.noiseQ;
      band.frequency.setValueAtTime(startHz, now);
      band.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), now + playSeconds);
      // The resonance is what turns a band of noise into an object: a hull
      // plate, a pipe, a palm frond stack.
      const resonance = context.createBiquadFilter();
      resonance.type = 'peaking';
      resonance.frequency.setValueAtTime(startHz * 1.6, now);
      resonance.Q.value = character.resonanceQ;
      const resonanceGain = (resonance as Partial<BiquadFilterNode>).gain;
      if (resonanceGain) resonanceGain.value = character.resonanceGainDb;
      noise.connect(band).connect(resonance).connect(gain).connect(panner).connect(this.ambience);
      extraNodes.push(band, resonance);
      source = noise;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = character.tonalWave;
      oscillator.frequency.setValueAtTime(startHz, now);
      // HF-376: a formant. A gull is a harmonically rich source through a
      // strong vocal-tract resonance; the old bare sine had no way to be
      // anything but a whistle.
      const formant = context.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(startHz * 1.35, now);
      formant.frequency.exponentialRampToValueAtTime(Math.max(60, endHz * 1.35), now + playSeconds);
      formant.Q.value = character.resonanceQ * 0.35;
      if (character.segments > 0) {
        // Trill / wobble: the pitch moves in steps within the event, which is
        // what separates a bird from a test tone.
        for (let index = 1; index <= character.segments; index += 1) {
          const at = now + (playSeconds * index) / (character.segments + 1);
          const target = index % 2 === 0 ? startHz : endHz;
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, target), at);
        }
      }
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endHz), now + playSeconds);
      oscillator.connect(formant).connect(gain).connect(panner).connect(this.ambience);
      extraNodes.push(formant);
      source = oscillator;
    }

    if (!this.registerContinuousVoice(source, this.ambience, 1, 'arena', extraNodes)) {
      for (const node of extraNodes) node.disconnect();
      return;
    }
    this.applyEnvelope(gain.gain, now, this.ambientEnvelopeStages(
      entry.shape,
      Math.max(0.0002, entry.gain),
      playSeconds,
    ));
    source.start(now);
    source.stop(now + playSeconds + 0.05);
    this.ambientEventsPlayed += 1;
    this.arenaSources.push(source);
    this.arenaNodes.push(...extraNodes);
  }

  /**
   * Starts the background chiptune on the `game-music` bus.
   *
   * Safe to call repeatedly; a second call while running is a no-op rather than a
   * second track. Silently does nothing when audio is unavailable, which keeps
   * gameplay admission error-free on a device that refused an AudioContext.
   */
  startGameMusic(): void {
    if (this.musicRunning || !this.context) return;
    const bus = this.buses.get('game-music');
    if (!bus) return;
    try {
      const arenaDefinition = ARENA_AUDIO_DEFINITIONS[this.activeArena ?? 'atomic-acres'];
      const arenaFilter = this.context.createBiquadFilter();
      arenaFilter.type = 'lowpass';
      arenaFilter.frequency.value = arenaDefinition.airLowpassHz;
      arenaFilter.Q.value = 0.42;
      arenaFilter.connect(bus);
      this.musicArenaFilter = arenaFilter;
      const build = (wave: OscillatorType): { osc: OscillatorNode; gain: GainNode } => {
        const gain = this.context!.createGain();
        gain.gain.value = 0;
        gain.connect(arenaFilter);
        const osc = this.context!.createOscillator();
        osc.type = wave;
        // A real starting frequency matters: an oscillator left at its 440 Hz
        // default would sound the instant its gain envelope first opens, before
        // the first scheduled note sets a pitch.
        osc.frequency.value = 220;
        osc.connect(gain);
        osc.start();
        return { osc, gain };
      };
      // Pick this match's track BEFORE the oscillators are built: each track
      // authors its own lead/bass shapes, and building both channels as squares
      // first meant the opening track of every session - a third of the roster
      // is triangle- or sawtooth-led - played on the wrong timbre until the
      // first swap ~90 s later. The bass still sits two octaves down so the two
      // channels never mask each other.
      this.musicTrack = this.musicRotation.nextTrack();
      const waveforms = ArenaAudio.musicWaveforms(this.musicTrack);
      this.musicChannels = Object.freeze({ lead: build(waveforms.lead), bass: build(waveforms.bass) });
      this.pendingMusicWaveform = null;
      this.musicRunning = true;
      this.musicLoopStartedAtSeconds = this.context.currentTime + 0.12;
      this.musicScheduledUntilSeconds = this.musicLoopStartedAtSeconds;
      this.musicTrackHistory = [{ track: this.musicTrack, atSeconds: this.musicLoopStartedAtSeconds }];
      this.pumpGameMusic();
    } catch {
      // A device policy can still reject nodes after the context exists.
      this.stopGameMusic();
    }
  }

  /** Stops the chiptune and releases both oscillators. */
  stopGameMusic(): void {
    const channels = this.musicChannels;
    this.musicChannels = null;
    this.musicRunning = false;
    this.musicScheduledUntilSeconds = 0;
    this.pendingMusicWaveform = null;
    // The ROTATION deliberately survives a stop: `musicRotation` carries the
    // remainder of the current shuffle cycle plus the track that just finished,
    // so the next match neither replays it nor re-rolls the cycle from nothing.
    this.musicTrack = null;
    if (channels) {
      for (const channel of [channels.lead, channels.bass]) {
        try { channel.osc.stop(); } catch { /* may not have started */ }
        try { channel.osc.disconnect(); } catch { /* partial browser node */ }
        try { channel.gain.disconnect(); } catch { /* partial browser node */ }
      }
    }
    try { this.musicArenaFilter?.disconnect(); } catch { /* partial browser node */ }
    this.musicArenaFilter = null;
  }

  /**
   * QA graph bisection (2026-08-29): inject a half-second sine at a KNOWN
   * gain either directly into the master or through a named bus, so the
   * output analyser can attribute attenuation to a specific graph segment.
   * Debug-only; returns false when the graph is unavailable.
   */
  debugProbeTone(target: 'master' | Exclude<AudioBusId, 'master'>, gain = 0.2): boolean {
    if (!this.context || !this.master) return false;
    const destination = target === 'master' ? this.master : this.buses.get(target);
    if (!destination) return false;
    try {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      const envelope = this.context.createGain();
      envelope.gain.value = gain;
      oscillator.connect(envelope).connect(destination);
      const now = this.context.currentTime;
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      oscillator.onended = () => {
        try { oscillator.disconnect(); envelope.disconnect(); } catch { /* torn down */ }
      };
      return true;
    } catch {
      return false;
    }
  }

  /** QA: live music channel state - proves whether the notes reach the
   * channel gain params at authored amplitude (input side) or die between
   * the channel and the bus (graph side). */
  debugMusicState(): {
    running: boolean;
    leadGain: number;
    bassGain: number;
    leadHz: number;
    scheduledAhead: number;
    track: ChiptuneTrackId | null;
    history: ReadonlyArray<{ track: ChiptuneTrackId; atSeconds: number }>;
  } | null {
    const channels = this.musicChannels;
    if (!channels || !this.context) return null;
    return {
      running: this.musicRunning,
      leadGain: channels.lead.gain.gain.value,
      bassGain: channels.bass.gain.gain.value,
      leadHz: channels.lead.osc.frequency.value,
      scheduledAhead: Number((this.musicScheduledUntilSeconds - this.context.currentTime).toFixed(3)),
      track: this.musicTrack,
      history: Object.freeze([...this.musicTrackHistory]),
    };
  }

  /** True while the background chiptune is scheduling. */
  get gameMusicRunning(): boolean {
    return this.musicRunning;
  }

  /** The track currently playing, or null when the music is stopped. */
  get gameMusicTrack(): ChiptuneTrackId | null {
    return this.musicTrack;
  }

  /**
   * Schedules the next window of chiptune notes. Called every frame.
   *
   * Look-ahead scheduling rather than a per-note timer: Web Audio's clock is
   * sample-accurate but JavaScript timers are not, so notes are committed to the
   * audio clock ahead of time and the frame loop only tops the window up. A frame
   * hitch therefore cannot make the music stutter, which matters because a hitch
   * during a firefight is exactly when it would be most audible.
   *
   * HF-430: Automatically swaps tracks seamlessly on bar boundaries when each ~90 s
   * track finishes its loop, following the 10-track shuffle rotation.
   */
  private pumpGameMusic(): void {
    const channels = this.musicChannels;
    const track = this.musicTrack;
    if (!this.musicRunning || !this.context || !channels || !track) return;

    // A waveform change is committed at the boundary it belongs to, never when
    // the boundary is SCHEDULED. `OscillatorNode.type` is not an AudioParam, so
    // it cannot be automated - assigning it takes effect the instant it is
    // assigned. Doing that inside the scheduling loop set the incoming track's
    // timbre up to MUSIC_LOOKAHEAD_SECONDS (0.75 s) before the incoming track
    // was audible, so the outgoing track's last bar played on the wrong
    // oscillator and, if a note was sounding, the reassignment was a waveform
    // discontinuity - an audible click on exactly the transition this feature
    // exists to make seamless. Deferring to `currentTime >= atSeconds` bounds
    // the error to one frame (<= ~17 ms) and puts it inside the first note's
    // 6 ms attack ramp instead of across a whole bar.
    this.applyDueMusicWaveform();

    const advanced = advanceMultiTrackSchedule(
      {
        currentTrackId: track,
        trackStartedAtSeconds: this.musicLoopStartedAtSeconds,
        scheduledUntilSeconds: this.musicScheduledUntilSeconds,
        rotation: this.musicRotation,

      },
      this.context.currentTime + ArenaAudio.MUSIC_LOOKAHEAD_SECONDS,
    );

    for (const { event, atSeconds } of advanced.events) {
      this.scheduleChiptuneNote(channels[event.channel], event, atSeconds);
    }
    this.musicTrack = advanced.state.currentTrackId;
    this.musicLoopStartedAtSeconds = advanced.state.trackStartedAtSeconds;
    this.musicScheduledUntilSeconds = advanced.state.scheduledUntilSeconds;

    for (const swap of advanced.swaps) {
      this.musicTrackHistory.push({ track: swap.to, atSeconds: swap.atSeconds });
      this.pendingMusicWaveform = { atSeconds: swap.atSeconds, ...ArenaAudio.musicWaveforms(swap.to) };
    }
    // Bounded so a long session cannot grow this without limit; QA reads the
    // tail (a 5 minute run produces 4 entries, an hour produces ~40).
    if (this.musicTrackHistory.length > ArenaAudio.MUSIC_HISTORY_LIMIT) {
      this.musicTrackHistory.splice(0, this.musicTrackHistory.length - ArenaAudio.MUSIC_HISTORY_LIMIT);
    }
    this.applyDueMusicWaveform();
  }

  /** The authored oscillator shapes for a track, with the palette default. */
  private static musicWaveforms(track: ChiptuneTrackId): { lead: OscillatorType; bass: OscillatorType } {
    return {
      lead: CHIPTUNE_TRACKS[track].leadWaveform ?? 'square',
      bass: CHIPTUNE_TRACKS[track].bassWaveform ?? 'square',
    };
  }

  /** Commits a queued waveform change once its bar boundary has actually arrived. */
  private applyDueMusicWaveform(): void {
    const pending = this.pendingMusicWaveform;
    const channels = this.musicChannels;
    if (!pending || !channels || !this.context) return;
    if (this.context.currentTime < pending.atSeconds) return;
    this.pendingMusicWaveform = null;
    try {
      if (channels.lead.osc.type !== pending.lead) channels.lead.osc.type = pending.lead;
      if (channels.bass.osc.type !== pending.bass) channels.bass.osc.type = pending.bass;
    } catch { /* a partial browser node can reject the assignment */ }
  }

  /** Commits one note to a channel's oscillator: pitch, then a short envelope. */
  private scheduleChiptuneNote(
    channel: { osc: OscillatorNode; gain: GainNode },
    event: ChiptuneEvent,
    atSeconds: number,
  ): void {
    const attack = 0.006;
    const release = Math.max(0.02, event.durationSeconds * 0.35);
    const peak = atSeconds + attack;
    const end = atSeconds + event.durationSeconds;
    try {
      channel.osc.frequency.setValueAtTime(event.frequencyHz, atSeconds);
      channel.gain.gain.setValueAtTime(0, atSeconds);
      const noteGain = Math.min(0.72, event.gain * GAME_MUSIC_NOTE_GAIN_SCALE);
      channel.gain.gain.linearRampToValueAtTime(noteGain, peak);
      // Ramp to a small floor rather than 0: exponential ramps reject zero, and a
      // hard cut to silence on a square wave clicks audibly.
      channel.gain.gain.setValueAtTime(noteGain, Math.max(peak, end - release));
      channel.gain.gain.linearRampToValueAtTime(0.0001, end);
    } catch {
      // A browser can reject a param schedule if the time has already passed.
    }
  }

  updateListener(position: SpatialPoint, yawRadians: number): void {
    // PASS 95: the listener's position is also the acoustic-zone probe. A
    // handful of AABB tests per frame; setAcousticSpace early-outs unchanged.
    this.setAcousticSpace(acousticSpaceOverrideFor(this.activeArena, position));
    if (!this.context || ![position.x, position.y, position.z, yawRadians].every(Number.isFinite)) return;
    this.listenerPosition.x = position.x;
    this.listenerPosition.y = position.y;
    this.listenerPosition.z = position.z;
    this.listenerPoseMode = updateBrowserAudioListenerPose(this.context.listener, position, yawRadians);
    this.pumpGameMusic();
  }

  /**
   * HF-376: an enemy's footstep, heard from wherever they are.
   *
   * This is the most tactically loaded sound in the game and it was one static
   * band of white noise fading out - the same burst for a boot on steel deck
   * and a boot in long grass, at four different cutoffs. It now draws the
   * surface's own texture, excites the surface's resonance, and uses the same
   * heel/settle envelope as the local step so a remote footstep and your own
   * are recognisably the same physical event.
   *
   * The pooled chain is unchanged in shape apart from one extra resonance
   * stage, so the spatial-voice budget and the occlusion behaviour still hold.
   */
  worldFootstep(position: SpatialPoint, surface: SpatialFootstepSurface, movement: FootstepMovement, occluded = false): boolean {
    if (!this.context || !this.movement
      || this.spatialChains + this.arenaSources.length >= AUDIO_RUNTIME_BUDGET.spatialVoices) {
      this.voicesDropped += 1;
      return false;
    }
    const profile = FOOTSTEP_MATERIAL_PROFILES[surface];
    const buffer = this.noiseTextures.get(profile.heelTexture) ?? this.noiseBuffer;
    if (!buffer) return false;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const chain = this.acquireFootstepChain();
    if (!chain) {
      this.voicesDropped += 1;
      return false;
    }
    const { filter, resonance, gain, panner } = chain;
    // Per-step variation. Two identical steps in a row is what turns an enemy
    // walking into a metronome, which is both unconvincing and unreadable.
    this.stepVariant = (this.stepVariant + 1) % 4;
    const variation = [0.94, 1.04, 0.98, 1.08][this.stepVariant]!;
    filter.type = surface === 'soil' || surface === 'grass' ? 'lowpass' : 'bandpass';
    const openFrequency = profile.heelHz * variation;
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setValueAtTime(openFrequency * (occluded ? 0.45 : 1), now);
    // The band closes over the step: contact, then settle. A fixed band is the
    // reason the old step read as a burst of hiss rather than as a boot.
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, openFrequency * (occluded ? 0.45 : 1) * 0.5),
      now + 0.085,
    );
    filter.Q.value = profile.heelQ;
    // The surface's own resonance - the deck plate, the hollow board, the
    // packed earth. Occluded steps lose it first, because a wall removes a
    // narrow resonance long before it removes broadband energy.
    resonance.type = 'peaking';
    resonance.frequency.value = profile.resonanceHz;
    resonance.Q.value = profile.resonanceQ;
    const resonanceGain = (resonance as Partial<BiquadFilterNode>).gain;
    if (resonanceGain) resonanceGain.value = occluded ? 3 : 9;
    gain.gain.cancelScheduledValues(now);
    const movementGain = movement === 'sprint' ? 0.048 : movement === 'crouch' || movement === 'prone' ? 0.016 : 0.032;
    // Heel then settle, rather than an instant peak into a single decay.
    this.applyEnvelope(gain.gain, now, transientEnvelope({
      peak: movementGain * profile.heelVolume * (occluded ? 0.65 : 1),
      durationSeconds: 0.085,
      attackSeconds: 0.0008,
      punch: 0.24,
      punchSeconds: 0.008,
    }));
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    source.connect(filter);
    const listenerDistance = Math.hypot(
      position.x - this.listenerPosition.x,
      position.y - this.listenerPosition.y,
      position.z - this.listenerPosition.z,
    );
    if (!this.registerVoice(source, this.movement, 3, true, listenerDistance)) {
      chain.busy = false;
      return false;
    }
    this.spatialChains += 1;
    const previousEnded = source.onended;
    source.onended = (event) => {
      this.spatialChains = Math.max(0, this.spatialChains - 1);
      chain.busy = false;
      previousEnded?.call(source, event);
    };
    source.start(now, presentationRandom() * Math.max(0.001, buffer.duration - 0.085), 0.085);
    return true;
  }

  /**
   * Owns the combat-feedback graph before match admission. All sources start
   * once at zero gain and are reused until audio-session disposal, so first
   * damage and first low-health entry perform parameter automation only.
   */
  prepareCombat(): boolean {
    if (this.combatFeedbackPrepared) return true;
    if (!this.context || !this.feedback) return false;
    this.combatFeedbackPrepareRuns += 1;
    const now = this.context.currentTime;
    const createdSources: AudioScheduledSourceNode[] = [];
    const createdNodes: AudioNode[] = [];
    const register = (
      source: OscillatorNode,
      nodes: readonly AudioNode[],
      gains: readonly GainNode[] = [],
    ): boolean => {
      if (!this.registerContinuousVoice(source, this.feedback!, 5, 'combat-feedback', nodes, gains)) return false;
      // Registration mutates the voice/owner registries before start(). Track
      // ownership first so a browser start failure is fully transactional.
      source.start(now);
      this.combatFeedbackSources.push(source);
      this.combatFeedbackNodes.push(...nodes);
      return true;
    };
    try {
      // HF-280: the prior breathing voice was an indefinite looping white-
      // noise AudioBufferSource. A quiet filtered triangle retains the paced
      // low-health cue without any continuous broadband source.
      const breath = this.context.createOscillator();
      createdSources.push(breath);
      const breathFilter = this.context.createBiquadFilter();
      createdNodes.push(breathFilter);
      const breathGain = this.context.createGain();
      createdNodes.push(breathGain);
      breath.type = 'triangle';
      breath.frequency.value = 196;
      breathFilter.type = 'bandpass';
      breathFilter.frequency.value = 520;
      breathFilter.Q.value = 1.4;
      breathGain.gain.value = 0;
      breath.connect(breathFilter).connect(breathGain).connect(this.feedback);
      if (!register(breath, [breathFilter, breathGain], [breathGain])) throw new Error('combat-breath-voice-budget');

      const heartbeat = this.context.createOscillator();
      createdSources.push(heartbeat);
      const heartbeatGain = this.context.createGain();
      createdNodes.push(heartbeatGain);
      heartbeat.type = 'sine';
      heartbeat.frequency.value = 54;
      heartbeatGain.gain.value = 0;
      heartbeat.connect(heartbeatGain).connect(this.feedback);
      if (!register(heartbeat, [heartbeatGain], [heartbeatGain])) throw new Error('combat-heartbeat-voice-budget');

      // Damage feedback is a retained muted pressure voice. Reusing it removes
      // first-hit oscillator/filter construction and the old broadband burst.
      const damage = this.context.createOscillator();
      createdSources.push(damage);
      const damageFilter = this.context.createBiquadFilter();
      createdNodes.push(damageFilter);
      const damageGain = this.context.createGain();
      createdNodes.push(damageGain);
      damage.type = 'triangle';
      damage.frequency.value = 180;
      damageFilter.type = 'bandpass';
      damageFilter.frequency.value = 520;
      damageFilter.Q.value = 1.2;
      damageGain.gain.value = 0;
      damage.connect(damageFilter).connect(damageGain).connect(this.feedback);
      if (!register(damage, [damageFilter, damageGain], [damageGain])) throw new Error('combat-damage-voice-budget');

      this.lowHealthGains = [breathGain, heartbeatGain];
      this.damageFeedbackSource = damage;
      this.damageFeedbackGain = damageGain;
      this.combatFeedbackPrepared = true;
      this.lowHealthAppliedState = Object.freeze({ active: false, breathingGain: 0, heartbeatGain: 0 });
      return true;
    } catch {
      // stopSource is safe for registered, partially registered and never-
      // registered sources. It releases both voice maps before disconnecting.
      for (const source of createdSources) this.stopSource(source);
      for (const node of createdNodes) {
        const index = this.combatFeedbackNodes.indexOf(node);
        if (index >= 0) this.combatFeedbackNodes.splice(index, 1);
        try { node.disconnect(); } catch { /* partial browser node */ }
      }
      this.combatFeedbackSources = this.combatFeedbackSources.filter((source) => !createdSources.includes(source));
      this.resetCombatFeedbackState();
      return false;
    }
  }

  /**
   * Exercises the exact live glass-impact source/filter/gain graph at zero
   * gain during match admission. The one-shot sources are intentionally not
   * retained as broadband loops; browser node factories and the destination
   * graph are warm before the first pane breaks, with full rollback on any
   * partial Web Audio failure.
   */
  prepareGlassImpact(): boolean {
    if (this.glassImpactPrepared) return true;
    if (!this.context || !this.noiseBuffer || !this.feedback) return false;
    this.glassImpactPrepareRuns += 1;
    const now = this.context.currentTime;
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    try {
      const noise = this.context.createBufferSource();
      sources.push(noise);
      noise.buffer = this.noiseBuffer;
      const filter = this.context.createBiquadFilter();
      nodes.push(filter);
      filter.type = 'bandpass';
      filter.frequency.value = 5_200;
      filter.Q.value = 1.25;
      const noiseGain = this.context.createGain();
      nodes.push(noiseGain);
      noiseGain.gain.value = 0;
      noise.connect(filter).connect(noiseGain).connect(this.feedback);
      if (!this.registerVoice(noise, this.feedback, 3)) throw new Error('glass-impact-noise-voice-budget');
      const priorNoiseEnded = noise.onended;
      noise.onended = (event) => {
        priorNoiseEnded?.call(noise, event);
        filter.disconnect();
        noiseGain.disconnect();
      };

      const tone = this.context.createOscillator();
      sources.push(tone);
      tone.type = 'triangle';
      tone.frequency.value = 1_460;
      const toneGain = this.context.createGain();
      nodes.push(toneGain);
      toneGain.gain.value = 0;
      tone.connect(toneGain).connect(this.feedback);
      if (!this.registerVoice(tone, this.feedback, 3)) throw new Error('glass-impact-tone-voice-budget');
      const priorToneEnded = tone.onended;
      tone.onended = (event) => {
        priorToneEnded?.call(tone, event);
        toneGain.disconnect();
      };

      noise.start(now, 0, 0.095);
      tone.start(now + 0.006);
      tone.stop(now + 0.034);
      this.glassImpactPrepared = true;
      return true;
    } catch {
      for (const source of sources) this.stopSource(source);
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* partially connected browser node */ }
      }
      this.glassImpactPrepared = false;
      return false;
    }
  }

  /**
   * Exercises every grenade cue factory at zero gain before match admission.
   * The live bounce/fuse/blast recipe remains byte-for-byte unchanged: in
   * particular, explosions retain both broadband layers and their authored
   * sawtooth pressure sweep instead of degrading into persistent tonal loops.
   */
  prepareGrenadeEffects(): boolean {
    if (this.grenadeEffectsPrepared) return true;
    if (!this.context || !this.feedback || !this.weapons || !this.noiseBuffer) return false;
    this.grenadeEffectsPrepareRuns += 1;
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    const now = this.context.currentTime;
    try {
      // Bounce/fuse cover all four live oscillator waveforms. The silent blast
      // sweep exercises the same oscillator/gain path used by explosion().
      for (const [type, frequency] of [
        ['triangle', 310], ['square', 185], ['square', 920], ['sine', 1_840], ['sawtooth', 96],
      ] as const) {
        const source = this.context.createOscillator();
        const gain = this.context.createGain();
        sources.push(source);
        nodes.push(gain);
        source.type = type;
        source.frequency.value = frequency;
        gain.gain.value = 0;
        source.connect(gain).connect(type === 'sawtooth' ? this.weapons : this.feedback);
        source.onended = () => {
          try { source.disconnect(); } catch { /* silent warmup already released */ }
          try { gain.disconnect(); } catch { /* silent warmup already released */ }
        };
        source.start(now);
        source.stop(now + 0.001);
      }
      // The live broadband layers share the retained noise sample but own
      // distinct filter/gain/source nodes. Warm those exact constructors and
      // connections without registering or emitting a live voice.
      //
      // HF-376 added two filter types to the live grenade path: `bandpass` for
      // the metallic bounce contact and `peaking` for the resonant stage under
      // the blast body. They are warmed here for the same reason the original
      // two were - the first grenade of a match must not be the call that
      // cold-allocates a node class.
      for (const [filterType, frequency] of [
        ['lowpass', 2_100], ['peaking', 1_150], ['bandpass', 744], ['highpass', 3_100],
      ] as const) {
        const source = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        sources.push(source);
        nodes.push(filter, gain);
        source.buffer = this.noiseBuffer;
        filter.type = filterType;
        filter.frequency.value = frequency;
        gain.gain.value = 0;
        // HF-376: the blast body is saturated, so the WaveShaper and its curve
        // are warmed too. createSaturator() returns null where the platform has
        // no such node, in which case the chain is simply the original one.
        const saturator = filterType === 'lowpass' ? this.createSaturator(0.6) : null;
        if (saturator) {
          nodes.push(saturator);
          source.connect(filter).connect(saturator).connect(gain).connect(this.weapons);
        } else source.connect(filter).connect(gain).connect(this.weapons);
        source.onended = () => {
          try { source.disconnect(); } catch { /* silent warmup already released */ }
          try { filter.disconnect(); } catch { /* silent warmup already released */ }
          try { gain.disconnect(); } catch { /* silent warmup already released */ }
        };
        source.start(now, 0, 0.001);
        source.stop(now + 0.002);
      }
      this.grenadeEffectWarmupSources = sources.length;
      this.grenadeEffectWarmupNodes = nodes.length;
      this.grenadeEffectsPrepared = true;
      return true;
    } catch {
      for (const source of sources) {
        try { source.stop(); } catch { /* partially started silent warmup */ }
        try { source.disconnect(); } catch { /* partially connected silent warmup */ }
      }
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* partially connected silent warmup */ }
      }
      this.grenadeEffectWarmupSources = 0;
      this.grenadeEffectWarmupNodes = 0;
      this.grenadeEffectsPrepared = false;
      return false;
    }
  }

  /**
   * HF-332: Prewarms interactive-destruction and collapse-debris audio graphs at
   * zero gain before match admission. Prewarms metal, wood, and concrete impact
   * filters/gains and structural sweep oscillators without retaining broadband loops.
   */
  prepareDestructionEffects(): boolean {
    if (this.destructionEffectsPrepared) return true;
    if (!this.context || !this.feedback || !this.noiseBuffer) return false;
    this.destructionEffectsPrepareRuns += 1;
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    const now = this.context.currentTime;
    try {
      for (const [filterType, frequency, q] of [
        ['bandpass', 3_150, 1.25],
        ['bandpass', 980, 1.25],
        ['bandpass', 1_780, 1.25],
      ] as const) {
        const source = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        sources.push(source);
        nodes.push(filter, gain);
        source.buffer = this.noiseBuffer;
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(this.feedback);
        source.onended = () => {
          try { source.disconnect(); } catch { /* silent warmup already released */ }
          try { filter.disconnect(); } catch { /* silent warmup already released */ }
          try { gain.disconnect(); } catch { /* silent warmup already released */ }
        };
        source.start(now, 0, 0.001);
        source.stop(now + 0.002);
      }
      for (const [type, frequency] of [
        ['square', 960], ['triangle', 240], ['triangle', 410], ['triangle', 118],
      ] as const) {
        const source = this.context.createOscillator();
        const gain = this.context.createGain();
        sources.push(source);
        nodes.push(gain);
        source.type = type as OscillatorType;
        source.frequency.value = frequency;
        gain.gain.value = 0;
        source.connect(gain).connect(this.feedback);
        source.onended = () => {
          try { source.disconnect(); } catch { /* silent warmup already released */ }
          try { gain.disconnect(); } catch { /* silent warmup already released */ }
        };
        source.start(now);
        source.stop(now + 0.001);
      }
      this.destructionEffectWarmupSources = sources.length;
      this.destructionEffectWarmupNodes = nodes.length;
      this.destructionEffectsPrepared = true;
      return true;
    } catch {
      for (const source of sources) {
        try { source.stop(); } catch { /* partially started silent warmup */ }
        try { source.disconnect(); } catch { /* partially connected silent warmup */ }
      }
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* partially connected silent warmup */ }
      }
      this.destructionEffectWarmupSources = 0;
      this.destructionEffectWarmupNodes = 0;
      this.destructionEffectsPrepared = false;
      return false;
    }
  }

  setLowHealthFeedback(presentation: LowHealthFeedbackPresentation): void {
    if (!this.context || !this.combatFeedbackPrepared || this.lowHealthGains.length !== 2) return;
    const applied = Object.freeze({
      active: presentation.active,
      // Pass 74: keep the prewarmed low-health voices and their state/telemetry
      // path, but suppress the player-facing breathing/heartbeat presentation.
      // The sensory layer still owns severity, hysteresis, and the vignette.
      breathingGain: 0,
      heartbeatGain: 0,
    });
    const gainsUnchanged = this.lowHealthAppliedState?.breathingGain === applied.breathingGain
      && this.lowHealthAppliedState.heartbeatGain === applied.heartbeatGain;
    if (this.lowHealthAppliedState?.active === applied.active && gainsUnchanged) return;
    this.lowHealthAppliedState = applied;
    this.lowHealthFeedbackActive = applied.active;
    this.lowHealthFeedbackAudible = applied.breathingGain > 0 || applied.heartbeatGain > 0;
    if (gainsUnchanged) return;
    const now = this.context.currentTime;
    const gains = [applied.breathingGain, applied.heartbeatGain];
    for (let index = 0; index < this.lowHealthGains.length; index += 1) {
      const parameter = this.lowHealthGains[index]!.gain;
      parameter.cancelScheduledValues(now);
      parameter.setTargetAtTime(Math.max(0, gains[index] ?? 0), now, 0.012);
      this.lowHealthAutomationWrites += 1;
    }
  }

  setArenaZone(zone: ArenaZone): void {
    if (!this.context || !this.ambience) {
      this.arenaZone = null;
      return;
    }
    if (zone === this.arenaZone) return;
    this.arenaZone = zone;
    const now = performance.now();
    if (now - this.lastZoneCueAt < 1_200) return;
    this.lastZoneCueAt = now;
    const frequency = zone === 'east-service' ? 720 : zone === 'west-garden' ? 330 : zone === 'central-transit' ? 510 : 420;
    this.tone(frequency, 0.12, 0.018, 'sine', this.ambience);
    this.tone(frequency * 1.5, 0.08, 0.012, 'triangle', this.ambience, 0.09);
  }

  shot(weapon: WeaponId, remote = false, distance = 0, emitter?: SpatialPoint): void {
    if (!this.context || !this.weapons) return;
    this.duckGameMusicForCombat(0.18);
    const railgunSpatial = weapon === 'railgun' && remote && emitter
      ? this.createRailgunSpatialDestinations(emitter, distance)
      : null;
    // PASS 95 (HF-509): every other player's and bot's report is positioned
    // through a pooled pan-only panner. Beyond the family's range the report
    // is not scheduled at all rather than played at a floor level.
    if (weapon !== 'railgun' && remote && emitter && worldSoundAttenuation(distance, 'weapon-report') <= 0) return;
    const worldPanner = weapon !== 'railgun' && remote && emitter
      ? this.acquireWorldPanner(emitter, distance, 'weapon-report')
      : null;
    const weaponDestination = railgunSpatial?.weapons ?? worldPanner ?? this.weapons;
    const ambienceDestination = railgunSpatial?.ambience ?? this.ambience;
    // HF-366: the report is layered rather than uniformly scaled. `layering`
    // answers how much crack, body and tail this distance and space deserve;
    // every factor it returns is 1 (or the previous constant) for a local shot
    // at 0 m on open ground, so the player's own weapon is unchanged and only
    // the world reads differently.
    const occlusion = this.sampleOcclusion(emitter ?? null);
    const layering = weaponReportLayering(distance, this.currentAcousticSpace(), occlusion);
    const spatialAttenuation = railgunSpatial ? layering.directGainScale : weapon === 'railgun'
      ? railgunReportAttenuation(remote, distance) * layering.directGainScale
      // The old term was a straight linear fade to 80 m. The layered body
      // falloff replaces it so that muffling and level fall together, which is
      // the difference between "quieter" and "further away".
      : remote ? Math.max(0.08, 0.55 * layering.bodyGainScale) : layering.directGainScale;
    const attenuation = spatialAttenuation * WEAPON_REPORT_GAIN[weapon];
    const profile = WEAPON_REPORT_PROFILES[weapon];
    const character = WEAPON_ACOUSTIC_CHARACTERS[weapon];
    // Tail factors are expressed relative to open ground at 0 m, so that case
    // reproduces the previous mix and every space reads only as a difference
    // from it. Clamped because a runaway tail would both dominate the mix and
    // hold a voice long enough to starve combat audio.
    const tailReference = SHOT_TAIL_REFERENCE;
    const tailGainScale = Math.min(6, Math.max(0.4, layering.tailGainScale / tailReference.gain));
    const tailDurationScale = Math.min(2.5, Math.max(0.5, layering.tailDurationSeconds / tailReference.duration));

    // HF-376: every report is a NEW draw from the round-robin, so no two shots
    // in a burst are bit-identical. The old reports were sample-for-sample the
    // same voice repeated at the fire rate, which is the single loudest "this
    // is a synthesiser" tell an automatic weapon can have.
    this.reportVariant = (this.reportVariant + 1) % 8;
    const variant = this.reportVariant;
    const detuneCents = roundRobinDetune(variant, 42);
    const variantGain = 1 + roundRobinDetune(variant + 3, 0.07);

    // LAYER 0 - mechanism / muzzle click. It is intentionally absent from the
    // railgun path: that report has a pinned ten-voice contract. Small arms
    // need this dry high-frequency event before the crack or body arrives;
    // otherwise every class starts as the same low synth sweep.
    if (weapon !== 'railgun') {
      this.noise({
        duration: character.kind === 'shotgun' ? 0.009 : 0.006,
        volume: (remote ? 0.055 : 0.075) * attenuation * variantGain,
        filter: 'highpass',
        frequency: character.clickHz,
        q: character.kind === 'machine-gun' ? 0.65 : 1.05,
        texture: 'crackle',
        attack: 0.0002,
        punch: 0.1,
        punchSeconds: 0.0015,
        drive: 0.42,
      }, weaponDestination);
    }

    // LAYER 1 - pressure body. Sawtooth into saturation, with the pitch fall
    // front-loaded so it lands as a thump that has a pitch rather than as a
    // pitch that slides. `punch` is what gives it a discernible attack and a
    // shorter, denser body than the old flat exponential.
    this.sweep(
      profile.body,
      profile.bodyEnd,
      profile.duration,
      0.22 * attenuation * character.bodyGain * variantGain,
      'sawtooth',
      weaponDestination,
      0,
      { attack: 0.0008, punch: 0.3, punchSeconds: profile.duration * 0.14, drive: 0.55, detuneCents, pitchBias: 0.7 },
    );
    // The supersonic crack is a near-field event: past REPORT_CRACK_RANGE_METRES
    // its scale is zero and the layer is silent. The voice is still scheduled
    // rather than skipped, because the replicated report's LAYER COUNT is a
    // pinned budget contract (audio-railgun.test.ts, owned elsewhere) and a
    // conditional layer would make that count distance-dependent.
    //
    // LAYER 2 - the crack itself. Hard drive and a near-zero attack: this is
    // the shock front, and anything slower than a fraction of a millisecond
    // reads as a tone instead of as a snap.
    this.sweep(
      profile.crack,
      profile.crack * profile.crackEndRatio,
      profile.crackDuration,
      0.075 * attenuation * character.crackGain * layering.crackGainScale * variantGain,
      'square',
      weaponDestination,
      0,
      { attack: 0.0003, punch: 0.12, punchSeconds: profile.crackDuration * 0.2, drive: 0.72, detuneCents: detuneCents * 1.4, pitchBias: 0.82 },
    );
    // LAYER 3 - the body's broadband half. Pink rather than white: a report's
    // spectrum falls with frequency, and the flat buffer is why every weapon
    // used to sit in the same bright band. The peaking stage is the barrel -
    // a resonance an octave or two above the body fundamental is what makes
    // one weapon sound like a short tube and another like a long one.
    this.noise({
      duration: profile.duration,
      volume: profile.noise * attenuation * character.bodyGain * variantGain,
      filter: 'lowpass',
      // Air absorption compounds with the weapon's own voicing rather than
      // replacing it: a muffled LMG is still an LMG.
      frequency: Math.min(profile.lowpass, layering.bodyCutoffHz * character.bodyCutoffScale),
      q: 0.7,
      texture: 'pink',
      // The band closes as the burst decays, which is the muzzle gas cooling
      // and the reflections taking over from the direct sound.
      frequencyEndHz: Math.min(profile.lowpass, layering.bodyCutoffHz) * 0.42,
      resonanceHz: profile.body * 3.4,
      resonanceQ: 2.6,
      resonanceGainDb: 7,
      attack: 0.0006,
      punch: 0.26,
      punchSeconds: profile.duration * 0.16,
      drive: 0.45,
    }, weaponDestination);
    // LAYER 4 - the muzzle transient: the click of the gas leaving the barrel.
    // White, essentially zero attack, collapsing inside 4 ms. This is the layer
    // the ear uses to localise the shot and to judge how close it was.
    this.noise({
      duration: profile.transientDuration,
      // The muzzle transient belongs to the near field with the crack, but it
      // never disappears entirely the way the crack does.
      volume: 0.17 * attenuation * (0.35 + 0.65 * layering.crackGainScale) * variantGain,
      filter: 'highpass',
      frequency: profile.transientHighpass,
      q: 0.4,
      texture: 'white',
      attack: 0.0003,
      punch: 0.18,
      punchSeconds: 0.004,
      drive: 0.6,
      resonanceHz: profile.transientHighpass * 1.7,
      resonanceQ: 1.8,
      resonanceGainDb: 5,
    }, weaponDestination);
    // Q and delay come from the space: a hard room rings tight and early, a
    // deck over open water barely answers at all.
    const tailDelaySeconds = Math.min(0.3, layering.tailDelaySeconds);
    // LAYER 5 - the tail: reflections, not the weapon. It gets the only slow
    // attack in the report (reflections arrive spread out, they do not snap on)
    // and it holds far longer after its initial fall than the direct layers do,
    // which is what makes a shot sound like it happened SOMEWHERE.
    const tailSeconds = Math.max(0.04, Math.min(
      profile.tailDuration * tailDurationScale,
      SHOT_TAIL_BUDGET_SECONDS - tailDelaySeconds,
    ));
    this.noise({
      duration: tailSeconds,
      volume: (remote ? 0.055 : 0.082) * attenuation * character.tailGain * tailGainScale,
      filter: 'bandpass',
      frequency: profile.tail,
      q: layering.tailQ,
      delay: tailDelaySeconds,
      texture: 'pink',
      frequencyEndHz: profile.tail * 0.55,
      attack: 0.012,
      punch: 0.55,
      punchSeconds: tailSeconds * 0.3,
    }, ambienceDestination);
    if (weapon === 'carbine') {
      // Original HK416 pressure and yard-reflection layers; short enough to stay readable at full RPM.
      this.sweep(74, 38, 0.16, 0.052 * attenuation, 'triangle', weaponDestination, 0.008, { punch: 0.34, drive: 0.4, detuneCents });
      this.noise({
        duration: 0.14, volume: 0.046 * attenuation, filter: 'bandpass', frequency: 830, q: 0.62, delay: 0.058,
        texture: 'pink', attack: 0.008, punch: 0.5,
      }, this.ambience);
      if (!remote) {
        this.noise({
          duration: 0.022, volume: 0.046, filter: 'highpass', frequency: 4200, q: 0.55, delay: 0.043,
          texture: 'crackle', attack: 0.0004, punch: 0.2, punchSeconds: 0.003,
        }, this.feedback);
      }
    }

    if (weapon === 'railgun') {
      // An authored pressure report, supersonic snap and long structural tail.
      // It remains on the existing compressed weapon/ambience buses, so local
      // and replicated shots are large without bypassing the bounded mix.
      //
      // HF-376 re-voiced these five in place. The replicated report's layer
      // COUNT is pinned at ten (audio-railgun.test.ts), so the quality had to
      // come from the shape of each layer, not from adding more of them.
      this.sweep(36, 10, RAILGUN_REPORT_PROFILE.pressureDuration, 0.2 * attenuation, 'sawtooth', weaponDestination, 0.008, {
        attack: 0.002, punch: 0.42, punchSeconds: 0.09, drive: 0.66, pitchBias: 0.72,
      });
      this.sweep(118, 24, 0.38, 0.12 * attenuation, 'triangle', weaponDestination, 0.026, {
        attack: 0.001, punch: 0.3, drive: 0.5, detuneCents, pitchBias: 0.75,
      });
      // Brown noise for the structural tail: the rail's discharge shakes the
      // deck plate, and that is a sub-100 Hz event, not a band of hiss.
      this.noise({
        duration: 0.7, volume: 0.2 * attenuation, filter: 'bandpass', frequency: 165, q: 0.5, delay: 0.045,
        texture: 'brown', frequencyEndHz: 95, attack: 0.014, punch: 0.5, punchSeconds: 0.16,
      }, ambienceDestination);
      this.noise({
        duration: 0.08, volume: 0.16 * attenuation, filter: 'highpass', frequency: 4_800, q: 0.32, delay: 0.006,
        texture: 'white', attack: 0.0003, punch: 0.14, punchSeconds: 0.006, drive: 0.7,
      }, remote ? weaponDestination : this.feedback);
      this.tone(92, 0.42, 0.13 * attenuation, 'triangle', ambienceDestination, 0.075, {
        attack: 0.01, punch: 0.46, drive: 0.35,
      });
    }

    if (!remote) {
      // HF-376 local mechanism: the player's own weapon is the one sound they
      // hear thousands of times, so it gets the parts a report actually has -
      // a bolt carrier slamming forward, and a brass case hitting the ground.
      // Neither exists on the replicated path, so the pinned world layer count
      // is untouched.
      //
      // Sub thump: the pressure you feel rather than hear. Local only, because
      // at range this is the first thing the air removes.
      this.sweep(
        profile.body * 0.52,
        Math.max(24, profile.bodyEnd * 0.45),
        Math.min(0.26, profile.duration * 1.5),
        0.13,
        'sine',
        this.feedback,
        0.002,
        { attack: 0.003, punch: 0.4, drive: 0.25, detuneCents, pitchBias: 0.6 },
      );
      // Bolt carrier: a hard metal-on-metal clack, not a tone. Crackle texture
      // through a tight resonance is a struck part; the old square-wave beep
      // at the same frequency was a note.
      this.noise({
        duration: 0.026,
        volume: 0.05,
        filter: 'bandpass',
        frequency: profile.mechanismPrimaryHz * 2.6,
        q: 1.1,
        delay: profile.mechanismDelay,
        texture: 'crackle',
        attack: 0.0004,
        punch: 0.2,
        punchSeconds: 0.004,
        resonanceHz: profile.mechanismPrimaryHz * METALLIC_PARTIAL_RATIOS[1]!,
        resonanceQ: 7,
        resonanceGainDb: 10,
        drive: 0.4,
      }, this.feedback);
      this.tone(profile.mechanismPrimaryHz, 0.028, 0.026, 'square', this.feedback, profile.mechanismDelay, {
        attack: 0.0004, punch: 0.22, drive: 0.3, detuneCents,
      });
      // Ejected case: bright, inharmonic, and it lands slightly late and at a
      // different pitch every shot.
      this.tone(
        profile.mechanismSecondaryHz * METALLIC_PARTIAL_RATIOS[1]!,
        0.018,
        0.02,
        'triangle',
        this.feedback,
        profile.mechanismDelay + 0.025 + variant * 0.0018,
        { attack: 0.0004, punch: 0.16, detuneCents: detuneCents * 2.5 },
      );
    }
  }

  railgunReport(remote = false, emitter: number | SpatialPoint = 0): void {
    const position = typeof emitter === 'number' ? null : emitter;
    const distance = typeof emitter === 'number' ? emitter : Math.hypot(
      emitter.x - this.listenerPosition.x,
      emitter.y - this.listenerPosition.y,
      emitter.z - this.listenerPosition.z,
    );
    if (remote) this.railgunReports.replicated += 1;
    else this.railgunReports.local += 1;
    this.railgunReports.lastAttenuation = railgunReportAttenuation(remote, distance);
    this.railgunReports.lastDistanceM = distance;
    this.railgunReports.lastSpatial = remote && position !== null;
    this.railgunReports.lastEmitter = position ? { ...position } : null;
    this.shot('railgun', remote, distance, position ?? undefined);
  }

  hit(headshot = false): void {
    const cue = combatConfirmEnvelope(headshot ? 'head' : 'body');
    // HF-376: a hit marker has to arrive before the player consciously reads
    // it, so it gets the hardest attack and shortest body of any cue in the
    // game. The old flat exponential blurred the onset, which is why hits at
    // full fire rate smeared into one continuous tone.
    this.tone(cue.frequencyHz[0], 0.045, headshot ? 0.11 : 0.075, 'sine', this.ui, 0, {
      attack: 0.0004, punch: 0.2, punchSeconds: 0.006, drive: headshot ? 0.35 : 0.2,
    });
    this.tone(cue.frequencyHz[1], 0.028, headshot ? 0.07 : 0.035, 'triangle', this.ui, 0.018, {
      attack: 0.0004, punch: 0.18, punchSeconds: 0.004,
    });
  }

  kill(): void {
    const cue = combatConfirmEnvelope('kill');
    // HF-376: three rising partials, each snapping in and holding, so the cue
    // reads as one deliberate three-part confirmation rather than as a chord
    // fading up. The hold is what makes it audible over a firefight.
    this.tone(cue.frequencyHz[0], 0.06, 0.055, 'triangle', this.ui, 0, {
      attack: 0.0005, punch: 0.4, punchSeconds: 0.008, drive: 0.25,
    });
    this.tone(cue.frequencyHz[1], 0.075, 0.07, 'sine', this.ui, 0.045, {
      attack: 0.0005, punch: 0.45, punchSeconds: 0.01,
    });
    this.tone(cue.frequencyHz[2], 0.09, 0.075, 'sine', this.ui, 0.095, {
      attack: 0.0006, punch: 0.5, punchSeconds: 0.012,
    });
  }

  damage(): void {
    if (!this.context || !this.combatFeedbackPrepared || !this.damageFeedbackSource || !this.damageFeedbackGain) return;
    const now = this.context.currentTime;
    this.damageFeedbackSource.frequency.cancelScheduledValues(now);
    // HF-376 continuation: the same front-loaded fall every report body uses.
    // One exponential glide reads as a descending "boop"; a real body blow
    // drops most of its pitch inside the first few milliseconds and settles.
    this.damageFeedbackSource.frequency.setValueAtTime(180, now);
    for (const stage of pitchFallStages(180, 72, 0.14)) {
      this.damageFeedbackSource.frequency.exponentialRampToValueAtTime(Math.max(1, stage.hz), now + stage.atSeconds);
    }
    this.damageFeedbackGain.gain.cancelScheduledValues(now);
    // HF-376 continuation: attack, collapse to a held body, then decay - the
    // three-region contour - instead of an 8 ms linear rise into one straight
    // linear fall, which read as a soft tone rather than as being hit.
    // Parameter-only automation: the retained combat voice gains no factories.
    this.applyEnvelope(this.damageFeedbackGain.gain, now, transientEnvelope({
      peak: 0.085,
      durationSeconds: 0.14,
      attackSeconds: 0.0015,
      punch: 0.42,
      punchSeconds: 0.02,
      floorValue: 0.0001,
    }));
    this.damageFeedbackPulses += 1;
  }

  /**
   * HF-376 per-surface impact character.
   *
   * A bullet strike used to be one band-passed noise burst plus one tone,
   * with the surface changing only two numbers - which is why concrete, wood
   * and metal all read as the same click at different pitches. Each material
   * now gets the three things that actually identify it: a strike transient
   * with its own texture, a resonant body with the right decay, and material
   * debris (dust, splinters, shards, dirt) that arrives slightly late.
   */
  impact(surface: ImpactSurface, distance = 0, emitter?: SpatialPoint): void {
    const safeDistance = Math.max(0, Number.isFinite(distance) ? distance : 0);
    this.impactInto(surface, safeDistance, this.worldDestination(emitter, safeDistance, surface === 'glass' ? 'glass' : 'impact'));
  }

  /** The material strike itself, into an already-resolved (pooled or dry) destination. */
  private impactInto(surface: ImpactSurface, safeDistance: number, destination: AudioNode | null): void {
    this.duckGameMusicForCombat(0.12);
    const attenuation = Math.max(0.08, 1 - Math.min(1, safeDistance / 34));
    const variant = (this.stepVariant + this.reportVariant) % 8;
    const detuneCents = roundRobinDetune(variant, 90);
    const profile = IMPACT_MATERIAL_PROFILES[surface];
    const directCutoffHz = distanceLowpassHz(safeDistance, this.currentAcousticSpace());
    // Strike: the moment of contact. Texture is the material's grain - glass
    // and concrete shatter into grains, metal and wood do not.
    this.noise({
      duration: profile.strikeSeconds,
      volume: profile.strikeVolume * attenuation,
      filter: 'bandpass',
      frequency: Math.min(profile.strikeHz, directCutoffHz),
      q: profile.strikeQ,
      texture: profile.strikeTexture,
      frequencyEndHz: profile.strikeHz * profile.strikeFallRatio,
      attack: 0.0003,
      punch: 0.16,
      punchSeconds: 0.003,
      drive: profile.drive,
      resonanceHz: profile.resonanceHz,
      resonanceQ: profile.resonanceQ,
      resonanceGainDb: profile.resonanceGainDb,
    }, destination);
    // Body: what the material does after being hit. Metal rings on inharmonic
    // partials, wood knocks hollow and dies, soil just absorbs.
    this.tone(
      profile.bodyHz,
      profile.bodySeconds,
      profile.bodyVolume * attenuation,
      profile.bodyWave,
      destination,
      0.004,
      { attack: 0.0006, punch: profile.bodyPunch, drive: profile.drive * 0.5, detuneCents },
    );
    if (profile.ringRatio > 0) {
      // Second, inharmonic partial. This is the whole difference between
      // "metal" and "a note at a metal-ish pitch".
      this.tone(
        profile.bodyHz * profile.ringRatio,
        profile.bodySeconds * 0.7,
        profile.bodyVolume * 0.45 * attenuation,
        'sine',
        destination,
        0.006,
        { attack: 0.001, punch: 0.5, detuneCents: detuneCents * 1.6 },
      );
    }
    if (profile.debrisVolume > 0) {
      // Spall: dust off concrete, splinters off wood, shards off glass. It
      // arrives after the strike because it has to travel.
      this.noise({
        duration: profile.debrisSeconds,
        volume: profile.debrisVolume * attenuation,
        filter: 'bandpass',
        frequency: profile.debrisHz,
        q: 0.8,
        delay: profile.debrisDelay,
        texture: 'crackle',
        frequencyEndHz: profile.debrisHz * 0.45,
        attack: 0.002,
        punch: 0.4,
        punchSeconds: profile.debrisSeconds * 0.25,
      }, destination);
    }
  }

  coverImpact(distance = 0, emitter?: SpatialPoint): void {
    this.impact('concrete', distance, emitter);
  }

  shedDoorMotion(distance = 0, emitter?: SpatialPoint): void {
    const attenuation = Math.max(0.08, 1 - Math.min(1, distance / 34));
    // One pooled panner for the whole door event: strike, perforation and
    // hinge flex all come from the same place.
    const destination = this.worldDestination(emitter, Math.max(0, distance), 'door');
    this.impactInto('metal', Math.max(0, distance), destination);
    this.shedPerforationInto(distance, destination);
    this.sweep(118, 72, 0.13, 0.032 * attenuation, 'triangle', destination, 0.012);
  }

  /** Thin sheet perforation: sharp puncture, flexing panel and falling chips. */
  shedPerforation(distance = 0, emitter?: SpatialPoint): void {
    this.shedPerforationInto(distance, this.worldDestination(emitter, Math.max(0, distance), 'door'));
  }

  private shedPerforationInto(distance: number, destination: AudioNode | null): void {
    const attenuation = Math.max(0.08, 1 - Math.min(1, Math.max(0, distance) / 42));
    this.metallicClick(2_900, 0.012, 0.052 * attenuation, { resonanceQ: 10, drive: 0.58, destination });
    this.noise({
      duration: 0.18,
      volume: 0.046 * attenuation,
      filter: 'bandpass',
      frequency: 1_350,
      q: 1.8,
      texture: 'grit',
      frequencyEndHz: 520,
      delay: 0.016,
      attack: 0.001,
      punch: 0.42,
      punchSeconds: 0.028,
    }, destination);
    this.noise({
      duration: 0.12,
      volume: 0.022 * attenuation,
      filter: 'highpass',
      frequency: 3_800,
      q: 0.55,
      texture: 'crackle',
      delay: 0.052,
      attack: 0.002,
      punch: 0.36,
    }, destination);
  }

  /** Vehicle body hit: low panel flex under a bright metal contact. */
  vehicleHit(distance = 0, emitter?: SpatialPoint): void {
    const attenuation = Math.max(0.08, 1 - Math.min(1, Math.max(0, distance) / 60));
    const destination = this.worldDestination(emitter, Math.max(0, distance), 'vehicle');
    this.impactInto('metal', Math.max(0, distance), destination);
    this.sweep(92, 38, 0.28, 0.11 * attenuation, 'sine', destination, 0.008, {
      attack: 0.003,
      punch: 0.46,
      punchSeconds: 0.06,
      drive: 0.28,
      pitchBias: 0.64,
    });
  }

  glassShatter(distance = 0, emitter?: SpatialPoint): void {
    this.impact('glass', distance, emitter);
  }

  testBayDoorThump(distance = 0, emitter?: SpatialPoint): void {
    const profile = TEST_BAY_DOOR_THUMP_PROFILE;
    const attenuation = Math.max(0.08, 1 - Math.min(1, Math.max(0, distance) / profile.maximumDistanceM));
    const destination = this.worldDestination(emitter, Math.max(0, distance), 'door');
    // HF-376: the layer identities and volumes are the authored profile and are
    // pinned by audio-test-bay-door.test.ts; what changed is their shape. A
    // heavy door is a latch releasing, air moving, gear driving and a mass
    // arriving - four events with four different attacks, not four beeps.
    this.tone(
      profile.layers.latch.frequencyHz,
      profile.layers.latch.durationSeconds,
      profile.layers.latch.volume * attenuation,
      profile.layers.latch.wave,
      destination,
      profile.layers.latch.delaySeconds,
      { attack: 0.0004, punch: 0.18, drive: 0.45 },
    );
    this.tone(
      profile.layers.pressure.frequencyHz,
      profile.layers.pressure.durationSeconds,
      profile.layers.pressure.volume * attenuation,
      profile.layers.pressure.wave,
      destination,
      profile.layers.pressure.delaySeconds,
      { attack: 0.004, punch: 0.45, drive: 0.3 },
    );
    this.sweep(
      profile.layers.mechanism.startFrequencyHz,
      profile.layers.mechanism.endFrequencyHz,
      profile.layers.mechanism.durationSeconds,
      profile.layers.mechanism.volume * attenuation,
      profile.layers.mechanism.wave,
      destination,
      profile.layers.mechanism.delaySeconds,
      { attack: 0.002, punch: 0.5, pitchBias: 0.45 },
    );
    this.noise({
      duration: profile.layers.body.durationSeconds,
      volume: profile.layers.body.volume * attenuation,
      filter: profile.layers.body.filter,
      frequency: profile.layers.body.frequencyHz,
      q: profile.layers.body.q,
      delay: profile.layers.body.delaySeconds,
      texture: 'brown',
      frequencyEndHz: profile.layers.body.frequencyHz * 0.4,
      attack: 0.0015,
      punch: 0.34,
      drive: 0.4,
      resonanceHz: profile.layers.body.frequencyHz * 0.55,
      resonanceQ: 3,
      resonanceGainDb: 8,
    }, destination);
  }

  nearMiss(strength: number): void {
    const now = performance.now();
    if (strength <= 0 || now - this.lastNearMissAt < 85) return;
    this.lastNearMissAt = now;
    const level = Math.min(1, Math.max(0.1, strength));
    // HF-376: a supersonic round passing close is a shock cone, not a laser
    // zap. The crack is near-instantaneous and the trailing whip falls away
    // behind it, which is why the band sweeps down as well as the pitch.
    this.sweep(5_200, 1_350, 0.085, 0.055 * level, 'sawtooth', this.feedback, 0, {
      attack: 0.0002, punch: 0.13, punchSeconds: 0.006, drive: 0.7, pitchBias: 0.85,
    });
    this.noise({
      duration: 0.14, volume: 0.045 * level, filter: 'highpass', frequency: 2_600, q: 0.85, delay: 0.008,
      texture: 'white', frequencyEndHz: 900, attack: 0.0005, punch: 0.24, punchSeconds: 0.012, drive: 0.4,
    }, this.feedback);
  }

  /**
   * HF-376 weapon mechanics.
   *
   * These were square-wave beeps at plausible frequencies, which is why a
   * magazine change sounded like a menu. Every event below is now built the
   * way the real part sounds: a crackle-textured metal-on-metal contact
   * through a tight inharmonic resonance, plus whatever else the part does -
   * a spring, a latch, the weight of a full magazine seating.
   */
  weaponAction(weapon: WeaponId, event: WeaponActionEvent): void {
    const scattergun = weapon === 'scattergun';
    // Real handling is never twice the same; without this the reload cadence
    // reads as a drum machine.
    this.reportVariant = (this.reportVariant + 1) % 8;
    const detuneCents = roundRobinDetune(this.reportVariant, 70);
    if (event === 'mag-release') {
      // Catch lets go: one small sprung click, no body behind it.
      this.metallicClick(620, 0.018, 0.03, { detuneCents, resonanceQ: 9, texture: 'crackle' });
      this.tone(1_240, 0.012, 0.012, 'triangle', this.feedback, 0.004, { attack: 0.0004, punch: 0.18, detuneCents });
    } else if (event === 'mag-out') {
      // The magazine sliding clear: a rasp down the mag well, not a click.
      this.noise({
        duration: 0.075, volume: 0.032, filter: 'bandpass', frequency: 1_050, q: 0.9,
        texture: 'grit', frequencyEndHz: 520, attack: 0.004, punch: 0.55, punchSeconds: 0.02,
      }, this.feedback);
    } else if (event === 'mag-in') {
      // Going in: the same rasp rising, because it is now travelling the other
      // way, with the first contact of the lips against the well at the end.
      this.noise({
        duration: 0.07, volume: 0.036, filter: 'bandpass', frequency: 780, q: 1,
        texture: 'grit', frequencyEndHz: 1_500, attack: 0.005, punch: 0.6, punchSeconds: 0.018,
      }, this.feedback);
      this.metallicClick(1_320, 0.014, 0.022, { detuneCents, resonanceQ: 6, texture: 'white', delay: 0.055 });
    } else if (event === 'mag-seat') {
      // Seating a loaded magazine is the heaviest handling sound a rifle makes:
      // a hard contact, the mass of the rounds behind it, and the catch.
      this.metallicClick(weapon === 'smg' ? 470 : 390, 0.03, 0.055, { detuneCents, resonanceQ: 7, drive: 0.5 });
      this.sweep(150, 88, 0.06, 0.03, 'triangle', this.feedback, 0.004, { attack: 0.001, punch: 0.3, drive: 0.35 });
      this.noise({
        duration: 0.03, volume: 0.026, filter: 'highpass', frequency: 2_400, q: 0.8, delay: 0.014,
        texture: 'crackle', attack: 0.0004, punch: 0.2, punchSeconds: 0.003,
      }, this.feedback);
    } else if (event === 'shell-insert') {
      // Brass into a tube: a bright rim contact, then the shell sliding home.
      this.metallicClick(740, 0.016, 0.03, { detuneCents, resonanceQ: 8, texture: 'crackle' });
      this.noise({
        duration: 0.05, volume: 0.024, filter: 'bandpass', frequency: 1_600, q: 1.2, delay: 0.008,
        texture: 'grit', frequencyEndHz: 760, attack: 0.003, punch: 0.5,
      }, this.feedback);
      this.tone(260, 0.03, 0.026, 'square', this.feedback, 0.015, { attack: 0.0005, punch: 0.25, detuneCents });
    } else if (event === 'bolt-release') {
      // The loudest mechanical event on any weapon: a sprung mass slamming into
      // a steel shoulder. Two partials and a spring ring, driven hard.
      this.metallicClick(scattergun ? 310 : 520, 0.04, 0.06, { detuneCents, resonanceQ: 6, drive: 0.6 });
      this.noise({
        duration: 0.04, volume: 0.034, filter: 'highpass', frequency: scattergun ? 1_200 : 1_900, q: 0.75,
        texture: 'crackle', frequencyEndHz: scattergun ? 620 : 950, attack: 0.0004, punch: 0.22, punchSeconds: 0.005,
        drive: 0.45,
      }, this.feedback);
      // Recoil-spring ring: high, quiet, and slightly late, and the single most
      // recognisable detail of a bolt going forward.
      this.tone(scattergun ? 2_100 : 2_900, 0.07, 0.011, 'sine', this.feedback, 0.02, {
        attack: 0.002, punch: 0.6, detuneCents: detuneCents * 2,
      });
    }
  }

  /**
   * HF-376: one metal part striking another. Crackle grains through a tight
   * inharmonic peak, with a near-zero attack and a body that is gone in a few
   * milliseconds. Every mechanical detail in the game routes through here so
   * that bolts, catches, latches and casings share one physical identity.
   */
  private metallicClick(
    hz: number,
    duration: number,
    volume: number,
    options: Readonly<{
      detuneCents?: number;
      resonanceQ?: number;
      drive?: number;
      delay?: number;
      texture?: NoiseTexture;
      destination?: AudioNode | null;
    }> = {},
  ): void {
    const destination = options.destination ?? this.feedback;
    this.noise({
      duration,
      volume,
      filter: 'bandpass',
      frequency: hz * 2.4,
      q: 1.2,
      delay: options.delay ?? 0,
      texture: options.texture ?? 'crackle',
      attack: 0.0003,
      punch: 0.18,
      punchSeconds: Math.min(0.004, duration * 0.2),
      drive: options.drive ?? 0.42,
      resonanceHz: hz * METALLIC_PARTIAL_RATIOS[1]!,
      resonanceQ: options.resonanceQ ?? 7,
      resonanceGainDb: 11,
    }, destination);
    this.tone(hz, Math.max(0.012, duration * 0.7), volume * 0.55, 'square', destination, options.delay ?? 0, {
      attack: 0.0004,
      punch: 0.2,
      drive: (options.drive ?? 0.42) * 0.7,
      detuneCents: options.detuneCents ?? 0,
    });
  }

  empty(): void {
    // HF-376: a dry fire is a firing pin hitting nothing. It should be a small,
    // dead, entirely mechanical sound with no tail whatsoever - the absence of
    // a report is the information.
    this.metallicClick(170, 0.022, 0.05, { resonanceQ: 5, drive: 0.5 });
    this.tone(112, 0.03, 0.03, 'triangle', this.feedback, 0.028, { attack: 0.0005, punch: 0.24 });
  }

  reload(): void {
    // Only the initial handling sound lives here; mechanical events are emitted
    // from the same normalized timeline that drives hands and weapon parts.
    // HF-376: a hand taking hold of a weapon is cloth and grip on polymer -
    // a grit rasp that opens and closes, not a band of hiss.
    this.noise({
      duration: 0.09, volume: 0.026, filter: 'bandpass', frequency: 720, q: 0.7,
      texture: 'grit', frequencyEndHz: 1_150, attack: 0.008, punch: 0.62, punchSeconds: 0.03,
    }, this.feedback);
  }

  weaponSwitch(): void {
    // HF-376: a sling and a weapon coming off the shoulder, then the new
    // weapon's weight settling into the hands.
    this.noise({
      duration: 0.085, volume: 0.026, filter: 'bandpass', frequency: 760, q: 0.8,
      texture: 'grit', frequencyEndHz: 420, attack: 0.006, punch: 0.55, punchSeconds: 0.025,
    }, this.feedback);
    this.metallicClick(560, 0.016, 0.018, { resonanceQ: 8, delay: 0.03 });
    this.tone(190, 0.045, 0.026, 'triangle', this.feedback, 0.055, { attack: 0.002, punch: 0.4, drive: 0.25 });
  }

  melee(): void {
    // Blade slash: a fast high whoosh that tears downward, a low body thump and
    // a brief metallic ring so the knife reads as a real cutting edge.
    //
    // HF-376: the whoosh is now air moving - a band that opens and closes over
    // the arc rather than a fixed band gated on and off - and the ring is an
    // inharmonic pair off a struck edge instead of a single sine.
    this.noise({
      duration: 0.11, volume: 0.062, filter: 'bandpass', frequency: 1_400, q: 1.2,
      texture: 'white', frequencyEndHz: 3_400, attack: 0.012, punch: 0.7, punchSeconds: 0.035,
    }, this.feedback);
    this.sweep(1_900, 320, 0.1, 0.05, 'sawtooth', this.feedback, 0, {
      attack: 0.004, punch: 0.4, drive: 0.35, pitchBias: 0.6,
    });
    this.noise({
      duration: 0.12, volume: 0.05, filter: 'bandpass', frequency: 420, q: 0.7,
      texture: 'brown', attack: 0.001, punch: 0.3, punchSeconds: 0.02, drive: 0.45,
    }, this.feedback);
    this.tone(1_240, 0.06, 0.016, 'triangle', this.feedback, 0.028, { attack: 0.001, punch: 0.55 });
    this.tone(1_240 * METALLIC_PARTIAL_RATIOS[1]!, 0.045, 0.008, 'sine', this.feedback, 0.031, {
      attack: 0.0015, punch: 0.5, detuneCents: 24,
    });
  }

  /**
   * HF-376 footsteps: heel, weight and scuff per surface (see
   * FOOTSTEP_MATERIAL_PROFILES), with every layer varied per step.
   *
   * The old step was one band-passed burst plus one downward sweep, identical
   * every fourth step. A step you hear five times a second is the sound in a
   * shooter least able to survive being a loop, so the round-robin now moves
   * the pitch, the timing of the scuff and the gain of every layer.
   */
  footstep(
    surface: FootstepSurface | SpatialFootstepSurface,
    sprinting = false,
    crouched = false,
    velocity = sprinting ? 1 : crouched ? 0.32 : 0.72,
  ): void {
    this.stepVariant = (this.stepVariant + 1) % 4;
    const variation = [0.94, 1.04, 0.98, 1.08][this.stepVariant]!;
    const detuneCents = roundRobinDetune(this.stepVariant, 120);
    // The runtime can provide normalized horizontal velocity, while the gait
    // defaults preserve the existing call sites. A slow walk has less heel
    // energy and a shorter body; velocity is part of the sound, not just the
    // interval at which legacy-main requests it.
    const speed = Math.max(0, Math.min(1.25, Number.isFinite(velocity) ? velocity : 0));
    const speedScale = 0.42 + speed * 0.58;
    const base = (sprinting ? 82 : crouched ? 54 : 68) * variation * speedScale;
    const profile = FOOTSTEP_MATERIAL_PROFILES[surface];
    // Heel strike. Sprinting lands harder and brighter; crouching barely lands
    // at all, which is the stealth affordance the old flat scalar blurred.
    this.noise({
      duration: sprinting ? 0.075 : 0.055,
      volume: (crouched ? 0.022 : sprinting ? 0.052 : 0.034) * profile.heelVolume * speedScale,
      filter: surface === 'soil' || surface === 'grass' ? 'lowpass' : 'bandpass',
      frequency: profile.heelHz * variation,
      q: profile.heelQ,
      texture: profile.heelTexture,
      frequencyEndHz: profile.heelHz * variation * 0.55,
      attack: 0.0005,
      punch: 0.22,
      punchSeconds: 0.006,
      drive: 0.3,
      resonanceHz: profile.resonanceHz,
      resonanceQ: profile.resonanceQ,
      resonanceGainDb: crouched ? 5 : 9,
    }, this.movement);
    // Body weight arriving through the surface.
    this.sweep(
      base + profile.bodyHz * 0.2,
      Math.max(32, profile.bodyHz * 0.48),
      sprinting ? 0.075 : 0.06,
      (crouched ? 0.018 : 0.034) * profile.bodyVolume * speedScale,
      profile.bodyWave,
      this.movement,
      0.002,
      { attack: 0.0015, punch: 0.34, drive: 0.2, detuneCents, pitchBias: 0.62 },
    );
    // Scuff of the sole leaving. This is the layer that makes grass and soil
    // sound soft and steel deck sound hard, and it moves in time as well as in
    // level so consecutive steps never line up.
    if (profile.scuffVolume > 0) {
      this.noise({
        duration: sprinting ? 0.05 : 0.07,
        volume: (crouched ? 0.007 : sprinting ? 0.016 : 0.011) * profile.scuffVolume * speedScale,
        filter: 'bandpass',
        frequency: profile.scuffHz,
        q: 0.7,
        delay: 0.014 + this.stepVariant * 0.004,
        texture: profile.scuffTexture,
        frequencyEndHz: profile.scuffHz * 0.4,
        attack: 0.006,
        punch: 0.6,
        punchSeconds: 0.02,
      }, this.movement);
    }
    // Gear: a sprinting operator carries loose kit, and the rattle is what
    // makes a running enemy audible before they are visible.
    if (sprinting) {
      this.noise({
        duration: 0.06, volume: 0.012 * speedScale, filter: 'highpass', frequency: 3_400, q: 0.6,
        delay: 0.022 + this.stepVariant * 0.005,
        texture: 'crackle', attack: 0.001, punch: 0.35,
      }, this.movement);
    }
  }

  land(impactSpeed: number): void {
    const strength = Math.min(1, Math.max(0.25, impactSpeed / 14));
    // HF-376: landing is a body arriving, not a click. Brown-textured weight
    // under a saturated sub, plus boots and kit, and the harder the landing the
    // more of each.
    this.noise({
      duration: 0.16, volume: 0.08 * strength, filter: 'lowpass', frequency: 540,
      texture: 'brown', frequencyEndHz: 190, attack: 0.0015, punch: 0.3, punchSeconds: 0.03, drive: 0.4,
      resonanceHz: 96, resonanceQ: 1.8, resonanceGainDb: 8,
    }, this.movement);
    this.sweep(88, 36, 0.17, 0.065 * strength, 'sine', this.movement, 0, {
      attack: 0.003, punch: 0.42, punchSeconds: 0.045, drive: 0.28, pitchBias: 0.62,
    });
    this.noise({
      duration: 0.09, volume: 0.026 * strength, filter: 'highpass', frequency: 2_200, q: 0.7, delay: 0.012,
      texture: 'crackle', frequencyEndHz: 1_100, attack: 0.001, punch: 0.3,
    }, this.movement);
  }

  /** Launch cue: a short air rush plus a low body lift, scaled by velocity. */
  jump(launchSpeed = 1): void {
    const strength = Math.max(0.2, Math.min(1.25, Number.isFinite(launchSpeed) ? Math.abs(launchSpeed) : 0.2));
    this.noise({
      duration: 0.085,
      volume: 0.025 * strength,
      filter: 'bandpass',
      frequency: 1_050 + strength * 1_200,
      q: 0.7,
      frequencyEndHz: 2_600 + strength * 1_400,
      texture: 'pink',
      attack: 0.006,
      punch: 0.62,
      punchSeconds: 0.024,
    }, this.movement);
    this.sweep(72, 118 + strength * 34, 0.12, 0.028 * strength, 'sine', this.movement, 0.004, {
      attack: 0.003,
      punch: 0.36,
      punchSeconds: 0.026,
      pitchBias: 0.42,
    });
  }

  grenadeBounce(strength: number): void {
    const level = Math.min(1, Math.max(0.2, strength / 10));
    // HF-376: a steel body hitting a hard surface and rolling - an inharmonic
    // metallic contact rather than two triangle beeps.
    this.reportVariant = (this.reportVariant + 1) % 8;
    this.metallicClick(310, 0.028, 0.038 * level, {
      detuneCents: roundRobinDetune(this.reportVariant, 140), resonanceQ: 6, drive: 0.45,
    });
    this.tone(185, 0.045, 0.024 * level, 'square', this.feedback, 0.012, {
      attack: 0.0006, punch: 0.28, detuneCents: roundRobinDetune(this.reportVariant + 2, 90),
    });
  }

  grenadeFuseBeep(remainingMs: number, now = performance.now()): boolean {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > GRENADE_FUSE_BEEP_START_MS
      || now - this.lastGrenadeFuseBeepAt < 55) return false;
    this.lastGrenadeFuseBeepAt = now;
    this.grenadeFuseBeeps += 1;
    const urgency = 1 - remainingMs / GRENADE_FUSE_BEEP_START_MS;
    this.tone(920 + urgency * 360, 0.042, 0.052, 'square', this.feedback);
    this.tone(1_840 + urgency * 420, 0.028, 0.022, 'sine', this.feedback, 0.006);
    return true;
  }

  crossbowFuseBeep(position: SpatialPoint, remainingMs: number, now = performance.now()): boolean {
    if (!this.context || !this.weapons || !Number.isFinite(remainingMs) || remainingMs <= 0
      || remainingMs > EXPLOSIVE_BOLT_ARM_DELAY_MS || now - this.lastCrossbowFuseBeepAt < 45) return false;
    const contextNow = this.context.currentTime;
    const urgency = 1 - remainingMs / EXPLOSIVE_BOLT_ARM_DELAY_MS;
    const source = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createPanner();
    source.type = 'square';
    // HF-376 continuation: a front-loaded knee instead of one exponential
    // glide. The single ramp spent half its time in the top half of the
    // interval, which is exactly the "boop" the re-authored voices removed.
    source.frequency.setValueAtTime(860 + urgency * 720, contextNow);
    for (const stage of pitchFallStages(860 + urgency * 720, 760 + urgency * 820, 0.048)) {
      source.frequency.exponentialRampToValueAtTime(Math.max(1, stage.hz), contextNow + stage.atSeconds);
    }
    filter.type = 'bandpass';
    filter.frequency.value = 1_600 + urgency * 1_000;
    filter.Q.value = 1.25;
    // HF-376 continuation: snap in, collapse to a held body, then decay -
    // replacing the 4 ms exponential attack into ONE straight exponential
    // decay, the exact shape that made this cue read as a synth beep.
    this.applyEnvelope(gain.gain, contextNow, transientEnvelope({
      peak: 0.055,
      durationSeconds: 0.052,
      attackSeconds: 0.0012,
      punch: 0.4,
      punchSeconds: 0.008,
      floorValue: 0.0001,
    }));
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.rolloffFactor = 1.25;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    const listenerDistance = Math.hypot(
      position.x - this.listenerPosition.x,
      position.y - this.listenerPosition.y,
      position.z - this.listenerPosition.z,
    );
    if (!this.registerVoice(source, this.weapons, 5, true, listenerDistance)) {
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
      return false;
    }
    this.spatialChains += 1;
    const voiceEnded = source.onended;
    source.onended = (event) => {
      this.spatialChains = Math.max(0, this.spatialChains - 1);
      voiceEnded?.call(source, event);
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    this.lastCrossbowFuseBeepAt = now;
    this.crossbowFuseBeeps += 1;
    this.crossbowFuseLastRemainingMs = remainingMs;
    this.crossbowFuseLastDistanceM = listenerDistance;
    source.start(contextNow);
    source.stop(contextNow + 0.055);
    return true;
  }

  minigunDrive(fraction: number, phase: MinigunSpoolPhase, active: boolean): void {
    const boundedFraction = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
    this.minigunDriveFraction = active ? boundedFraction : 0;
    this.minigunDrivePhase = active ? phase : 'idle';
    if (!active || boundedFraction <= 1e-4 || phase === 'idle') {
      this.stopMinigunDrive();
      return;
    }
    if (!this.context || !this.weapons) return;
    if (!this.minigunDriveLoop) {
      const source = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.Q.value = 0.72;
      gain.gain.value = 0.0001;
      source.connect(filter).connect(gain).connect(this.weapons);
      if (!this.registerVoice(source, this.weapons, 4)) {
        filter.disconnect();
        gain.disconnect();
        return;
      }
      const loop = { source, filter, gain };
      const voiceEnded = source.onended;
      source.onended = (event) => {
        voiceEnded?.call(source, event);
        filter.disconnect();
        gain.disconnect();
        if (this.minigunDriveLoop === loop) this.minigunDriveLoop = null;
      };
      source.start(this.context.currentTime);
      this.minigunDriveLoop = loop;
      this.minigunDriveStarts += 1;
    }
    const now = this.context.currentTime;
    const loop = this.minigunDriveLoop;
    // Direct AudioParam values at a 30 Hz ceiling avoid accumulating hundreds
    // of automation events per second during the authored 30-second window.
    if (now - this.minigunDriveLastUpdateAt < 1 / 30) return;
    this.minigunDriveLastUpdateAt = now;
    loop.source.frequency.value = 44 + boundedFraction * 96;
    loop.filter.frequency.value = 520 + boundedFraction * 1_700;
    loop.gain.gain.value = 0.008 + boundedFraction * 0.036;
  }

  /**
   * Legacy non-spatial explosion cue. Preserves the exact authored broadband
   * blast recipe (sawtooth pressure sweep plus lowpass and highpass noise).
   */
  explosion(now = performance.now()): boolean {
    const admission = admitExplosionAudioMix(this.explosionAudioGate, now);
    this.explosionAudioGate = admission.state;
    if (!admission.admitted) return false;
    if (!this.weapons) return true;
    this.duckGameMusicForCombat(0.8);
    // HF-376 re-authored legacy blast. Four layers with real weight rather
    // than a sawtooth glide under one lowpassed hiss: a saturated pressure
    // body, a sub that outlasts it, the broadband blast itself, and debris
    // that patters rather than swishes.
    //
    // The sub is first because it is the layer a player FEELS. Brown-textured
    // noise under a sine sub is what an explosion has that a filtered white
    // burst does not, and it is exactly what "the sounds are all so bad" is
    // pointing at on a blast.
    this.sweep(96, 24, 0.58, 0.29, 'sawtooth', this.weapons, 0, {
      attack: 0.0015, punch: 0.34, punchSeconds: 0.075, drive: 0.62, pitchBias: 0.74,
    });
    this.sweep(46, 22, 0.72, 0.24, 'sine', this.weapons, 0.004, {
      attack: 0.006, punch: 0.5, punchSeconds: 0.18, drive: 0.2, pitchBias: 0.6,
    });
    this.filteredNoise({
      duration: 0.64, volume: 0.42, filter: 'lowpass', frequency: 2100, q: 0.5,
      texture: 'brown', frequencyEndHz: 520, attack: 0.001, punch: 0.32, punchSeconds: 0.09, drive: 0.5,
      resonanceHz: 120, resonanceQ: 1.6, resonanceGainDb: 8,
    }, this.weapons);
    this.noise({
      duration: 0.34, volume: 0.12, filter: 'highpass', frequency: 3100, q: 0.4, delay: 0.035,
      texture: 'crackle', frequencyEndHz: 1_400, attack: 0.004, punch: 0.45, punchSeconds: 0.06,
    }, this.weapons);
    this.duckAmbienceForExplosion();
    return true;
  }

  /**
   * HF-351 spatial, family-aware explosion mix. Distance gain plus a lowpass,
   * HRTF panner chain (reusing the railgun spatial-chain pattern), per-family
   * layers (semtex sharper crack + debris patter, crossbow metallic ring,
   * support deeper 30-40Hz weight), and a near-blast tinnitus tail reusing the
   * flashbang recovery envelope. Every layer runs through registerVoice(), so
   * the global/bus voice budgets and steal policy still apply.
   */
  explosionAt(
    point: SpatialPoint,
    family: ExplosionSpatialFamily = 'semtex',
    now = performance.now(),
  ): boolean {
    const admission = admitExplosionAudioMix(this.explosionAudioGate, now);
    this.explosionAudioGate = admission.state;
    if (!admission.admitted) return false;
    this.duckGameMusicForCombat(0.8);
    const distance = Math.max(0, Math.hypot(
      point.x - this.listenerPosition.x,
      point.y - this.listenerPosition.y,
      point.z - this.listenerPosition.z,
    ));
    const profile = EXPLOSION_SPATIAL_PROFILES[family];
    // Distance gain: full inside refDistance, smooth inverse falloff beyond.
    const distanceGain = distance <= profile.refDistance
      ? 1
      : Math.max(0.06, profile.refDistance / (profile.refDistance + profile.rolloff * (distance - profile.refDistance)));
    const lowpassHz = Math.round(Math.min(16_000, Math.max(900, 9_500 * distanceGain)));
    let destination: AudioNode | null = this.weapons;
    let spatial = false;
    if (this.context && this.weapons && Number.isFinite(point.x + point.y + point.z)) {
      const panner = this.createExplosionSpatialPanner(point, distance, profile.refDistance, profile.rolloff, lowpassHz, Math.max(profile.bodyDuration + 0.1, family === 'support' ? NEAR_BLAST_TINNITUS_TAIL_MS / 1000 : 0));
      if (panner) {
        destination = panner;
        spatial = true;
      }
    }
    if (!destination) return true;
    const attenuation = distanceGain;
    let layers = 0;

    // HF-376 re-authored. Every layer below kept its role and its budget slot;
    // what changed is that each one now has an attack, a collapse and a hold
    // instead of one instant-on exponential, a texture chosen for its job
    // instead of the one shared white buffer, and non-linearity where a real
    // blast has it. The layer COUNT is unchanged, so the voice budget, the
    // steal policy and the diagnostics contract all still hold.

    // Layer 1 - pressure body sweep. Saturated: a blast is a clipped event,
    // and clipping is where its harmonics and its apparent loudness come from.
    this.sweep(
      profile.bodySweep[0],
      profile.bodySweep[1],
      profile.bodyDuration,
      profile.bodyVolume * 0.55 * attenuation,
      'sawtooth',
      destination,
      0,
      {
        attack: 0.0015,
        punch: 0.32,
        punchSeconds: profile.bodyDuration * 0.14,
        drive: 0.6,
        pitchBias: 0.74,
      },
    );
    layers += 1;
    // Layer 2 - broadband blast noise through the same distance lowpass.
    // Brown-textured: this is the layer that carries the weight, and a flat
    // spectrum here is why the old blast read as a hiss with a beep under it.
    // The band closes over the burst, which is the fireball collapsing.
    this.filteredNoise({
      duration: Math.min(0.8, profile.bodyDuration),
      volume: 0.42 * attenuation,
      filter: 'lowpass',
      frequency: lowpassHz,
      q: 0.5,
      texture: 'brown',
      frequencyEndHz: Math.max(120, lowpassHz * 0.22),
      resonanceHz: profile.subHz * 2.6,
      resonanceQ: 1.5,
      resonanceGainDb: 8,
      attack: 0.001,
      punch: 0.3,
      punchSeconds: Math.min(0.12, profile.bodyDuration * 0.16),
      drive: 0.5,
    }, destination);
    layers += 1;
    // Layer 3 - family crack. The shock front: hardest attack and hardest
    // drive in the mix, gone inside its own punch window.
    this.sweep(
      profile.crackHz,
      Math.max(120, profile.crackHz * profile.crackEndRatio),
      profile.crackDuration,
      profile.crackVolume * attenuation,
      'square',
      destination,
      0,
      { attack: 0.0003, punch: 0.14, punchSeconds: profile.crackDuration * 0.22, drive: 0.75, pitchBias: 0.84 },
    );
    layers += 1;
    // Layer 4 - debris. Crackle texture with a band that falls away: separate
    // pieces landing over a quarter of a second, not one band-passed swish.
    // Support ordnance throws heavier, slower debris than a satchel charge.
    this.noise({
      duration: family === 'support' ? 0.42 : 0.32,
      volume: profile.debrisVolume * attenuation,
      filter: 'bandpass',
      frequency: family === 'support' ? 900 : 1_650,
      q: 0.6,
      delay: profile.debrisDelay,
      texture: 'crackle',
      frequencyEndHz: family === 'support' ? 320 : 620,
      attack: 0.006,
      punch: 0.5,
      punchSeconds: 0.05,
    }, destination);
    layers += 1;
    // Layer 5 - crossbow metallic ring partials (inharmonic pair). Slow
    // attacks: a plate does not start ringing instantly, it is set ringing.
    if (profile.ringPartialHz > 0 && profile.ringVolume > 0) {
      this.tone(profile.ringPartialHz, 0.34, profile.ringVolume * attenuation, 'triangle', destination, 0.01, {
        attack: 0.004, punch: 0.6, punchSeconds: 0.05,
      });
      this.tone(
        profile.ringPartialHz * METALLIC_PARTIAL_RATIOS[1]!,
        0.26,
        profile.ringVolume * 0.7 * attenuation,
        'sine',
        destination,
        0.012,
        { attack: 0.005, punch: 0.62, punchSeconds: 0.04, detuneCents: 18 },
      );
      layers += 2;
    }
    // Layer 6 - sub pressure weight (deepest on support). Slowest attack and
    // longest hold in the mix: the sub arrives fractionally after the crack
    // and outlives everything, which is what a big blast does at any distance.
    this.sweep(profile.subHz, profile.subEndHz, profile.subDuration, profile.subVolume * attenuation, 'sine', destination, 0, {
      attack: 0.008,
      punch: 0.55,
      punchSeconds: profile.subDuration * 0.24,
      drive: 0.22,
      pitchBias: 0.62,
    });
    layers += 1;

    this.lastSpatialExplosion = Object.freeze({
      family,
      distanceM: Number(distance.toFixed(2)),
      spatial,
      layers,
      atSeconds: this.context?.currentTime ?? 0,
    });

    // HF-350: duck the ambience bed for ~4s after any admitted explosion mix.
    this.duckAmbienceForExplosion();
    // HF-351: near-blast tinnitus tail inside NEAR_BLAST_TINNITUS_DISTANCE.
    this.nearBlastTinnitus(distance);
    return true;
  }

  /** HF-350 bounded ambience duck: one setTargetAtTime dip plus timed recovery. */
  private duckAmbienceForExplosion(): void {
    if (!this.context || !this.ambience) return;
    const currentTime = this.context.currentTime;
    if (!this.ambienceDuckArmed || currentTime - this.ambienceDuckStartedAtSeconds >= AMBIENCE_EXPLOSION_DUCK_MS / 1000) {
      const scalar = this.currentAmbienceScalar();
      this.ambience.gain.cancelScheduledValues(currentTime);
      this.ambience.gain.setTargetAtTime(
        Math.max(0, this.busBaseGain('ambience') * scalar * AMBIENCE_EXPLOSION_DUCK_GAIN),
        currentTime,
        AMBIENCE_EXPLOSION_DUCK_TIME_CONSTANT_S,
      );
      this.ambienceDuckArmed = true;
      this.ambienceDuckStartedAtSeconds = currentTime;
      this.ambienceDuckCount += 1;
    }
  }

  /** Restores the ambience bus after AMBIENCE_EXPLOSION_DUCK_MS; call each frame. */
  recoverAmbienceDuck(): void {
    if (!this.context || !this.ambience) return;
    if (!this.ambienceDuckArmed) return;
    const currentTime = this.context.currentTime;
    if (currentTime - this.ambienceDuckStartedAtSeconds < AMBIENCE_EXPLOSION_DUCK_MS / 1000) return;
    const scalar = this.currentAmbienceScalar();
    this.ambience.gain.cancelScheduledValues(currentTime);
    this.ambience.gain.setTargetAtTime(
      this.busBaseGain('ambience') * scalar,
      currentTime,
      AMBIENCE_EXPLOSION_DUCK_TIME_CONSTANT_S,
    );
    this.lastAmbienceDuckRecoverySeconds = currentTime;
    this.ambienceDuckArmed = false;
  }

  private currentAmbienceScalar(): number {
    const settings = this.audioSettings;
    const muted = settings?.mutes.ambience ?? false;
    const gain = settings?.gains.ambience ?? 100;
    return muted ? 0 : Math.max(0, Math.min(1, gain / 100));
  }

  /** HF-351 near-blast tinnitus tail; volume scales with accessibility input. */
  setNearBlastTinnitusScale(scale: number): void {
    const bounded = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 0;
    this.tinnitusAccessibilityScale = bounded;
  }

  private nearBlastTinnitus(distance: number): void {
    if (distance > NEAR_BLAST_TINNITUS_DISTANCE) return;
    if ((this.tinnitusAccessibilityScale ?? 0) <= 0) return;
    const scale = this.tinnitusAccessibilityScale!;
    this.sweep(
      NEAR_BLAST_TINNITUS_PROFILE.firstFromHz,
      NEAR_BLAST_TINNITUS_PROFILE.firstToHz,
      NEAR_BLAST_TINNITUS_PROFILE.firstDurationSeconds,
      NEAR_BLAST_TINNITUS_PROFILE.firstVolume * scale,
      'sine',
      this.feedback,
      FLASHBANG_AUDIO_PROFILE.firstRecoveryDelaySeconds,
    );
    this.sweep(
      NEAR_BLAST_TINNITUS_PROFILE.secondFromHz,
      NEAR_BLAST_TINNITUS_PROFILE.secondToHz,
      NEAR_BLAST_TINNITUS_PROFILE.secondDurationSeconds,
      NEAR_BLAST_TINNITUS_PROFILE.secondVolume * scale,
      'sine',
      this.feedback,
      FLASHBANG_AUDIO_PROFILE.secondRecoveryDelaySeconds,
    );
    this.tinnitusTails += 1;
    this.lastTinnitusDistanceM = Number(distance.toFixed(2));
  }

  /**
   * HF-351 HRTF panner + lowpass chain for one spatial explosion, following
   * the railgun spatial-chain lifecycle (tracked nodes, timer cleanup). The
   * caller mixes all family layers through the returned node; the timer
   * releases it once the longest family tail has decayed.
   */
  private createExplosionSpatialPanner(
    point: SpatialPoint,
    distance: number,
    refDistance: number,
    rolloffFactor: number,
    lowpassHz: number,
    tailSeconds: number,
  ): PannerNode | null {
    if (!this.context || !this.weapons
      || this.spatialChains + 1 > AUDIO_RUNTIME_BUDGET.spatialVoices
      // HF-351: spatialisation is an enhancement, never a requirement. Contexts
      // without a panner (older engines, and the offline mocks the prewarm
      // contract runs against) must still get the blast, just non-spatialised.
      || typeof this.context.createPanner !== 'function') {
      this.voicesDropped += 1;
      return null;
    }
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = Math.max(1, refDistance);
    panner.maxDistance = 220;
    panner.rolloffFactor = Math.max(0.05, rolloffFactor);
    panner.positionX.value = point.x;
    panner.positionY.value = point.y;
    panner.positionZ.value = point.z;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = lowpassHz;
    lowpass.Q.value = 0.4;
    lowpass.connect(panner).connect(this.weapons);
    this.busIdentity.set(panner, 'sfx');
    this.spatialReportDestinations.add(panner);
    this.spatialReportDistances.set(panner, distance);
    this.railgunSpatialNodes.push(panner, lowpass);
    this.spatialChains += 1;
    this.railgunSpatialChainCount += 2;
    const cleanup = () => {
      for (const node of [panner, lowpass]) {
        const index = this.railgunSpatialNodes.indexOf(node);
        if (index >= 0) this.railgunSpatialNodes.splice(index, 1);
        this.busIdentity.delete(node);
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
      this.spatialChains = Math.max(0, this.spatialChains - 1);
      this.railgunSpatialChainCount = Math.max(0, this.railgunSpatialChainCount - 2);
      const timerIndex = this.explosionSpatialTimers.indexOf(timer);
      if (timerIndex >= 0) this.explosionSpatialTimers.splice(timerIndex, 1);
    };
    const timer = setTimeout(cleanup, Math.ceil(Math.max(0.25, tailSeconds) * 1_000));
    this.explosionSpatialTimers.push(timer);
    return panner;
  }

  flashbang(audioGain = 1): void {
    // One sharp, limiter-bounded onset plus a short tinnitus tail. The visual
    // recovery is continuous, so this cue never introduces a repeated strobe.
    const envelope = flashbangAudioEnvelope(audioGain);
    this.flashbangs.lastAudioGain = envelope.audioGain;
    if (envelope.audioGain <= 0) return;
    this.flashbangs.plays += 1;
    this.flashbangs.immediateOnsets += envelope.onsetDelayMs === 0 ? 1 : 0;
    this.flashbangs.scheduledBeeps += envelope.scheduledBeeps;
    this.noise({
      duration: FLASHBANG_AUDIO_PROFILE.impactDurationSeconds,
      volume: envelope.impactVolume,
      filter: 'highpass',
      frequency: 2_900,
      q: 0.55,
    }, this.weapons);
    this.sweep(
      5_600,
      2_100,
      FLASHBANG_AUDIO_PROFILE.firstRecoveryDurationSeconds,
      envelope.firstRecoveryVolume,
      'sine',
      this.feedback,
      FLASHBANG_AUDIO_PROFILE.firstRecoveryDelaySeconds,
    );
    this.sweep(
      7_200,
      3_100,
      FLASHBANG_AUDIO_PROFILE.secondRecoveryDurationSeconds,
      envelope.secondRecoveryVolume,
      'sine',
      this.feedback,
      FLASHBANG_AUDIO_PROFILE.secondRecoveryDelaySeconds,
    );
  }

  supportGun(kind: 'chopper' | 'drone'): void {
    if (kind === 'chopper') {
      this.sweep(104, 38, 0.16, 0.21, 'sawtooth', this.weapons);
      this.noise({ duration: 0.19, volume: 0.28, filter: 'lowpass', frequency: 2_500, q: 0.7 }, this.weapons);
      this.noise({ duration: 0.035, volume: 0.11, filter: 'highpass', frequency: 2_100, q: 0.45 }, this.weapons);
      return;
    }
    // Drone: a narrow propeller whine over a small electric motor body. The
    // sine/triangle pairing keeps it airborne and avoids the square-wave beep
    // that made every support call read like UI.
    this.sweep(420, 185, 0.16, 0.095, 'sawtooth', this.weapons, 0, {
      attack: 0.001, punch: 0.28, punchSeconds: 0.018, drive: 0.28,
    });
    this.tone(1_260, 0.12, 0.045, 'triangle', this.weapons, 0.012, {
      attack: 0.001, punch: 0.3, detuneCents: roundRobinDetune(this.reportVariant, 28),
    });
    this.noise({ duration: 0.14, volume: 0.095, filter: 'bandpass', frequency: 2_800, q: 1.15, texture: 'pink' }, this.weapons);
  }

  /** HF-337: positional support gunfire at the firing chopper/drone world position. Reuses the railgun spatial-chain pattern. */
  supportGunPositional(kind: 'chopper' | 'drone', emitter: SpatialPoint, isEnemy = false): void {
    const position = emitter;
    const distance = Math.hypot(
      emitter.x - this.listenerPosition.x,
      emitter.y - this.listenerPosition.y,
      emitter.z - this.listenerPosition.z,
    );
    const weaponDestination = this.createSupportGunSpatialDestination(position, distance, isEnemy) ?? this.weapons;
    if (kind === 'chopper') {
      this.sweep(104, 38, 0.16, 0.21, 'sawtooth', weaponDestination);
      this.noise({ duration: 0.19, volume: 0.28, filter: 'lowpass', frequency: 2_500, q: 0.7 }, weaponDestination);
      this.noise({ duration: 0.035, volume: 0.11, filter: 'highpass', frequency: 2_100, q: 0.45 }, weaponDestination);
      return;
    }
    this.sweep(420, 185, 0.16, 0.095, 'sawtooth', weaponDestination, 0, {
      attack: 0.001, punch: 0.28, punchSeconds: 0.018, drive: 0.28,
    });
    this.tone(1_260, 0.12, 0.045, 'triangle', weaponDestination, 0.012, {
      attack: 0.001, punch: 0.3, detuneCents: roundRobinDetune(this.reportVariant, 28),
    });
    this.noise({ duration: 0.14, volume: 0.095, filter: 'bandpass', frequency: 2_800, q: 1.15, texture: 'pink' }, weaponDestination);
  }

  /**
   * Owner 2026-08-30: Domination ownership cue - a bright two-note rise for
   * your squad taking a zone, a flat low pair for losses/neutralizations.
   */
  dominationCue(friendly: boolean): void {
    if (friendly) {
      this.sweep(520, 660, 0.11, 0.16, 'triangle', this.ui);
      this.sweep(660, 880, 0.14, 0.16, 'triangle', this.ui);
      return;
    }
    this.sweep(320, 250, 0.12, 0.15, 'triangle', this.ui);
    this.sweep(250, 190, 0.15, 0.14, 'triangle', this.ui);
  }

  /**
   * Owner 2026-08-30 ("make a cool sound"): possessed chopper missile launch -
   * an ignition thump under a rising rocket-motor whoosh. Spatial at the wing
   * socket when the emitter is known; falls back to the flat weapons bus.
   */
  missileLaunch(emitter?: SpatialPoint): void {
    let destination: AudioNode | null = this.weapons;
    if (emitter) {
      const distance = Math.hypot(
        emitter.x - this.listenerPosition.x,
        emitter.y - this.listenerPosition.y,
        emitter.z - this.listenerPosition.z,
      );
      destination = this.createSupportGunSpatialDestination(emitter, distance) ?? this.weapons;
    }
    if (!destination) return;
    this.sweep(150, 42, 0.24, 0.3, 'sine', destination);
    this.noise({ duration: 0.55, volume: 0.32, filter: 'bandpass', frequency: 950, q: 0.55 }, destination);
    this.noise({ duration: 0.38, volume: 0.18, filter: 'highpass', frequency: 2_600, q: 0.5 }, destination);
  }

  private createSupportGunSpatialDestination(
    emitter: SpatialPoint,
    distance: number,
    isEnemy = false,
  ): PannerNode | null {
    // HF-337 Fix 3: cull beyond maxDistance (180) so distant emitters don't burn spatial chains
    if (distance > 180) {
      return null;
    }
    if (!this.context || !this.weapons
      || ![emitter.x, emitter.y, emitter.z, distance].every(Number.isFinite)
      || this.spatialChains + 1 > AUDIO_RUNTIME_BUDGET.spatialVoices) {
      this.voicesDropped += 1;
      return null;
    }
    const panner = this.context!.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 8;
    panner.maxDistance = 180;
    panner.rolloffFactor = 0.18;
    panner.positionX.value = emitter.x;
    panner.positionY.value = emitter.y;
    panner.positionZ.value = emitter.z;
    // HF-337 Fix 4: apply enemy gain reduction (documented but was not implemented)
    const enemyGain = isEnemy ? 0.35 : 1;
    const gain = this.context!.createGain();
    gain.gain.value = enemyGain;
    panner.connect(gain).connect(this.weapons);
    this.busIdentity.set(panner, 'sfx');
    this.spatialReportDestinations.add(panner);
    this.spatialReportDistances.set(panner, distance);
    this.railgunSpatialNodes.push(panner, gain);
    this.spatialChains += 1;
    this.railgunSpatialChainCount += 2;
    // HF-337 Fix 2: shorten hold to ~180ms (below 280ms chopper / 300ms drone cadence)
    // so 4-5 firing entities cannot exhaust the 12-voice spatial budget.
    const cleanup = () => {
      for (const node of [panner, gain]) {
        const index = this.railgunSpatialNodes.indexOf(node);
        if (index >= 0) this.railgunSpatialNodes.splice(index, 1);
        this.busIdentity.delete(node);
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
      this.spatialChains = Math.max(0, this.spatialChains - 1);
      this.railgunSpatialChainCount = Math.max(0, this.railgunSpatialChainCount - 2);
      const timerIndex = this.railgunSpatialTimers.indexOf(timer);
      if (timerIndex >= 0) this.railgunSpatialTimers.splice(timerIndex, 1);
    };
    const timer = setTimeout(cleanup, 180);
    this.railgunSpatialTimers.push(timer);
    return panner;
  }


  syncChopperRotors(sources: readonly Readonly<{
    id: string;
    position: SpatialPoint;
    phase: 'inbound' | 'orbiting' | 'outbound';
  }>[]): void {
    this.liveChopperRotorIds.clear();
    let admittedCount = 0;
    for (const entry of sources) {
      if (entry.id.length === 0 || !Number.isFinite(entry.position.x)
        || !Number.isFinite(entry.position.y) || !Number.isFinite(entry.position.z)) continue;
      this.liveChopperRotorIds.add(entry.id);
      admittedCount += 1;
      if (admittedCount >= 4) break;
    }
    for (const id of this.chopperRotorLoops.keys()) {
      if (!this.liveChopperRotorIds.has(id)) this.stopChopperRotor(id);
    }
    if (!this.context || !this.ambience) return;
    admittedCount = 0;
    for (const entry of sources) {
      if (entry.id.length === 0 || !Number.isFinite(entry.position.x)
        || !Number.isFinite(entry.position.y) || !Number.isFinite(entry.position.z)) continue;
      let loop = this.chopperRotorLoops.get(entry.id);
      const listenerDistance = Math.hypot(
        entry.position.x - this.listenerPosition.x,
        entry.position.y - this.listenerPosition.y,
        entry.position.z - this.listenerPosition.z,
      );
      // HF-337: altitude-aware attenuation — higher altitude = more attenuation
      const altitude = entry.position.y;
      const altitudeAttenuation = Math.max(0.25, 1 - Math.min(1, altitude / 80));
      if (!loop) {
        const source = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        const panner = this.context.createPanner();
        source.type = 'sawtooth';
        source.frequency.value = 38;
        filter.type = 'lowpass';
        filter.frequency.value = 230;
        filter.Q.value = 0.62;
        // HF-337: raised base gain with altitude attenuation
        gain.gain.value = 0.018 * altitudeAttenuation;
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 6;
        panner.maxDistance = 160;
        panner.rolloffFactor = 0.6;
        source.connect(filter).connect(gain).connect(panner).connect(this.ambience);
        if (!this.registerVoice(source, this.ambience, 1, true, listenerDistance)) {
          filter.disconnect();
          gain.disconnect();
          panner.disconnect();
          continue;
        }
        loop = {
          source,
          filter,
          gain,
          panner,
          lastX: entry.position.x,
          lastY: entry.position.y,
          lastZ: entry.position.z,
          lastUpdateSeconds: this.context.currentTime,
        };
        const voiceEnded = source.onended;
        source.onended = (event) => {
          this.spatialChains = Math.max(0, this.spatialChains - 1);
          voiceEnded?.call(source, event);
          filter.disconnect();
          gain.disconnect();
          panner.disconnect();
          if (this.chopperRotorLoops.get(entry.id) === loop) this.chopperRotorLoops.delete(entry.id);
        };
        source.start(this.context.currentTime);
        this.spatialChains += 1;
        this.chopperRotorLoops.set(entry.id, loop);
        this.chopperRotorStarts += 1;
      }
      loop.panner.positionX.value = entry.position.x;
      loop.panner.positionY.value = entry.position.y;
      loop.panner.positionZ.value = entry.position.z;
      const baseRotorHz = entry.phase === 'inbound' ? 36 : entry.phase === 'outbound' ? 34 : 38;
      const elapsed = this.context.currentTime - loop.lastUpdateSeconds;
      const dx = entry.position.x - loop.lastX;
      const dy = entry.position.y - loop.lastY;
      const dz = entry.position.z - loop.lastZ;
      const distanceForDoppler = Math.max(0.001, listenerDistance);
      const radialVelocity = elapsed > 0.001
        ? (dx * (entry.position.x - this.listenerPosition.x)
          + dy * (entry.position.y - this.listenerPosition.y)
          + dz * (entry.position.z - this.listenerPosition.z)) / distanceForDoppler / elapsed
        : 0;
      // Positive radial velocity means the source is moving away. Limit the
      // ratio so an anomalous network step cannot turn a rotor into a click.
      const doppler = Math.max(0.82, Math.min(1.18, 343 / (343 + radialVelocity)));
      loop.source.frequency.value = baseRotorHz * doppler;
      loop.lastX = entry.position.x;
      loop.lastY = entry.position.y;
      loop.lastZ = entry.position.z;
      loop.lastUpdateSeconds = this.context.currentTime;
      // HF-337: altitude-aware gain with blade-slap layer
      loop.gain.gain.value = (entry.phase === 'inbound' ? 0.015 : entry.phase === 'outbound' ? 0.012 : 0.018) * altitudeAttenuation;
      const voice = this.activeVoices.get(loop.source);
      if (voice) voice.distance = listenerDistance;
      // HF-337: low-rate blade-slap noise layer for unmistakable rotor presence
      if (this.context && this.ambience && this.noiseBuffer && presentationRandom() < 0.025) {
        const slapSource = this.context.createBufferSource();
        const slapFilter = this.context.createBiquadFilter();
        const slapGain = this.context.createGain();
        const slapPanner = this.context.createPanner();
        slapSource.buffer = this.noiseBuffer;
        slapFilter.type = 'bandpass';
        slapFilter.frequency.value = 380;
        slapFilter.Q.value = 1.8;
        slapGain.gain.value = 0.008 * altitudeAttenuation;
        slapPanner.panningModel = 'HRTF';
        slapPanner.distanceModel = 'inverse';
        slapPanner.refDistance = 6;
        slapPanner.maxDistance = 160;
        slapPanner.rolloffFactor = 0.6;
        slapPanner.positionX.value = entry.position.x;
        slapPanner.positionY.value = entry.position.y;
        slapPanner.positionZ.value = entry.position.z;
        slapSource.connect(slapFilter).connect(slapGain).connect(slapPanner).connect(this.ambience);
        if (!this.registerVoice(slapSource, this.ambience, 3, true, listenerDistance)) {
          slapFilter.disconnect();
          slapGain.disconnect();
          slapPanner.disconnect();
        } else {
          slapSource.onended = () => {
            slapFilter.disconnect();
            slapGain.disconnect();
            slapPanner.disconnect();
          };
          slapSource.start(this.context.currentTime, 0, 0.08);
        }
      }
      admittedCount += 1;
      if (admittedCount >= 4) break;
    }
  }

  scoutSweep(): void {
    this.supportCuePlays += 1;
    this.sweepSequence(Array.from({ length: 5 }, (_, pulse) => ({
      startFrequency: 420, endFrequency: 1_080, duration: 0.18, volume: 0.045, delay: pulse * 2.4,
    })), 'triangle', this.announcements);
    this.sweepSequence(Array.from({ length: 5 }, (_, pulse) => ({
      startFrequency: 1_320, endFrequency: 1_320, duration: 0.07, volume: 0.028, delay: pulse * 2.4 + 0.12,
    })), 'sine', this.announcements);
  }

  matchCountdown(step: 1 | 2 | 3 | 'engage'): void {
    this.matchCountdownCuePlays += 1;
    this.lastMatchCountdownCue = step;
    for (const voice of matchCountdownAudioCue(step)) {
      const destination = voice.bus === 'announcements' ? this.announcements : this.ui;
      this.sweep(
        voice.startFrequencyHz,
        voice.endFrequencyHz,
        voice.durationSeconds,
        voice.gain,
        voice.waveform,
        destination,
        voice.delaySeconds,
      );
    }
  }

  /** Short authored match bookends; no asset or long-lived voice required. */
  matchStinger(kind: 'start' | 'end-win' | 'end-loss' | 'end-draw'): void {
    if (kind === 'start') {
      this.sweep(220, 440, 0.22, 0.085, 'triangle', this.announcements, 0, {
        attack: 0.003, punch: 0.35, punchSeconds: 0.04,
      });
      this.sweep(330, 660, 0.28, 0.07, 'sine', this.ui, 0.09, {
        attack: 0.004, punch: 0.42, punchSeconds: 0.05,
      });
      return;
    }
    const win = kind === 'end-win';
    const draw = kind === 'end-draw';
    const first = win ? 392 : draw ? 294 : 330;
    const second = win ? 494 : draw ? 294 : 247;
    const third = win ? 659 : draw ? 220 : 196;
    this.tone(first, 0.15, 0.07, 'triangle', this.announcements, 0, { attack: 0.004, punch: 0.36 });
    this.tone(second, 0.17, 0.065, draw ? 'sine' : 'triangle', this.announcements, 0.12, { attack: 0.004, punch: 0.4 });
    this.tone(third, 0.24, 0.07, win ? 'sine' : 'triangle', this.announcements, 0.25, { attack: 0.006, punch: 0.46 });
    this.noise({
      duration: 0.18,
      volume: 0.018,
      filter: 'highpass',
      frequency: win ? 2_400 : 1_200,
      q: 0.6,
      texture: 'pink',
      delay: 0.26,
      attack: 0.006,
      punch: 0.5,
    }, this.ui);
  }

  adrenalineState(active: boolean): void {
    this.supportCuePlays += 1;
    if (active) {
      this.sweep(110, 760, 0.38, 0.07, 'sawtooth', this.announcements);
      this.tone(92, 0.16, 0.055, 'sine', this.feedback, 0.05);
      this.tone(118, 0.2, 0.05, 'sine', this.feedback, 0.23);
      this.noise({ duration: 0.3, volume: 0.035, filter: 'highpass', frequency: 1_600, q: 0.8 }, this.ui);
      return;
    }
    this.sweep(420, 105, 0.25, 0.035, 'triangle', this.ui);
  }

  supportInbound(source: 'yardhawk' | 'tri-pass' | 'hunter-swarm'): void {
    this.supportCuePlays += 1;
    if (source === 'tri-pass') {
      for (let index = 0; index < 3; index += 1) {
        this.sweep(1_450 + index * 90, 180, 0.72, 0.055, 'sawtooth', this.announcements, index * 0.12);
      }
      this.noise({ duration: 0.62, volume: 0.055, filter: 'bandpass', frequency: 2_100, q: 1.1 }, this.ambience);
      return;
    }
    if (source === 'hunter-swarm') {
      this.sweepSequence(Array.from({ length: 5 }, (_, index) => ({
        startFrequency: 980 + index * 65, endFrequency: 260, duration: 0.44, volume: 0.04, delay: index * 0.07,
      })), 'square', this.announcements);
      return;
    }
    this.tone(1_180, 0.09, 0.055, 'square', this.announcements);
    this.sweep(1_600, 240, 0.5, 0.065, 'sawtooth', this.ambience, 0.08);
  }

  hunterLaunch(index: number): void {
    const offset = Math.max(0, Math.min(4, Math.floor(index))) * 0.045;
    this.sweep(1_180 + index * 45, 230, 0.42, 0.052, 'sawtooth', this.feedback, offset);
    this.noise({ duration: 0.24, volume: 0.044, filter: 'bandpass', frequency: 1_600, q: 0.85, delay: offset }, this.ambience);
  }

  overdrivePickup(): void {
    this.sweep(180, 920, 0.42, 0.095, 'sawtooth', this.ui);
    this.tone(440, 0.2, 0.055, 'square', this.ui, 0.08);
    this.tone(660, 0.28, 0.05, 'triangle', this.ui, 0.18);
    this.tone(880, 0.34, 0.042, 'sine', this.ambience, 0.26);
  }

  overdriveAvailable(): void {
    for (const tone of OVERDRIVE_AVAILABLE_CUE_PROFILE.announcementTones) {
      this.tone(tone.frequencyHz, tone.durationSeconds, tone.volume, tone.wave, this.announcements, tone.delaySeconds);
    }
    const ambience = OVERDRIVE_AVAILABLE_CUE_PROFILE.ambienceTone;
    this.tone(ambience.frequencyHz, ambience.durationSeconds, ambience.volume, ambience.wave, this.ambience, ambience.delaySeconds);
    const transient = OVERDRIVE_AVAILABLE_CUE_PROFILE.transient;
    this.sweep(
      transient.startFrequencyHz,
      transient.endFrequencyHz,
      transient.durationSeconds,
      transient.volume,
      transient.wave,
      this.announcements,
      transient.delaySeconds,
    );
  }

  overdriveExpire(): void {
    this.sweep(720, 140, 0.34, 0.055, 'triangle', this.ui);
    this.tone(110, 0.22, 0.035, 'sine', this.ambience, 0.12);
  }

  nukeWarning(): void {
    this.sweepSequence(Array.from({ length: 5 }, (_, pulse) => ({
      startFrequency: 210 + pulse * 18, endFrequency: 96, duration: 0.64, volume: 0.075 + pulse * 0.008, delay: pulse,
    })), 'sawtooth', this.announcements);
    this.sweepSequence(Array.from({ length: 5 }, (_, pulse) => ({
      startFrequency: 680 + pulse * 90, endFrequency: 680 + pulse * 90, duration: 0.12, volume: 0.045, delay: pulse + 0.68,
    })), 'square', this.announcements);
    this.sweep(42, 148, 4.85, 0.055, 'triangle', this.ambience, 0.05);
  }

  nukeDetonation(): void {
    this.sweep(72, 14, 1.15, 0.36, 'sawtooth', this.weapons);
    this.sweep(34, 9, 2.6, 0.27, 'triangle', this.ambience, 0.04);
    this.noise({ duration: 1.05, volume: 0.46, filter: 'lowpass', frequency: 1_250, q: 0.45 }, this.weapons);
    this.noise({ duration: 0.34, volume: 0.2, filter: 'highpass', frequency: 3_600, q: 0.35, delay: 0.028 }, this.feedback);
    this.noise({ duration: 1.05, volume: 0.16, filter: 'bandpass', frequency: 280, q: 0.52, delay: 0.9 }, this.ambience);
    this.noise({ duration: 2.4, volume: 0.22, filter: 'lowpass', frequency: 520, q: 0.7, delay: 0.18 }, this.weapons);
    this.sweep(160, 18, 3.4, 0.18, 'sawtooth', this.ambience, 0.32);
  }

  telemetry(): {
    context: {
      source: 'uninitialized' | 'failed' | BrowserAudioContextResolution['source'];
      state: AudioContextState | 'unavailable' | 'failed' | 'locked';
    };
    listener: { poseMode: AudioListenerPoseMode };
    // HF-366: what the world mix currently sounds like, and whether the
    // runtime's occlusion hook is actually installed and answering.
    immersion: {
      space: AcousticSpace;
      arenaSpace: AcousticSpace;
      overridden: boolean;
      occlusionHook: boolean;
      occludedReports: number;
    };
    explosionMix: ExplosionAudioGate & { coalesceMs: number };
    ambience: { continuousSources: number; busGain: number; arena: ArenaId | null; nextEventInSeconds: number; ambientEventsPlayed: number };
    combatPrewarm: { prepared: boolean; runs: number; sources: number; nodes: number; broadbandLoopSources: 0 };
    glassImpactPrewarm: { prepared: boolean; runs: number; retainedBroadbandLoops: 0 };
    grenadeEffectsPrewarm: {
      prepared: boolean;
      runs: number;
      warmupSources: number;
      warmupNodes: number;
      retainedSources: 0;
      retainedBroadbandLoops: 0;
      liveRecipe: 'layered-blast-brown-body-sub-and-crackle-debris-v2';
    };
    destructionEffectsPrewarm: {
      prepared: boolean;
      runs: number;
      warmupSources: number;
      warmupNodes: number;
      retainedSources: 0;
      retainedBroadbandLoops: 0;
    };
    lowHealth: {
      prepared: boolean;
      sources: number;
      active: boolean;
      audible: boolean;
      breathingGain: number;
      heartbeatGain: number;
      automationWrites: number;
      broadbandSources: 0;
    };
    damageFeedback: { prepared: boolean; sources: number; pulses: number };
    grenadeFuse: { beeps: number; startMs: number };
    crossbowFuse: { beeps: number; lastRemainingMs: number; lastDistanceM: number; startMs: number };
    minigunDrive: { active: boolean; starts: number; stops: number; fraction: number; phase: MinigunSpoolPhase };
    support: { cues: number; chopperRotorActive: boolean; chopperRotorStarts: number; chopperRotorStops: number };
    countdown: { cues: number; lastCue: MatchCountdownAudioCueId | null; maximumVoicesPerCue: number; maximumCueWindowSeconds: number; buses: readonly ['announcements', 'ui'] };
    railgun: {
      local: number;
      replicated: number;
      lastAttenuation: number;
      lastDistanceM: number;
      lastSpatial: boolean;
      lastEmitter: SpatialPoint | null;
      layerCount: number;
      pressureDuration: number;
    };
    flashbang: { plays: number; lastAudioGain: number; immediateOnsets: number; scheduledBeeps: number; maximumTailMs: number };
    outputProbe: AudioOutputProbe;
    runtime: { voices: number; spatialChains: number; spatialPoolSize: number; stolen: number; dropped: number; globalCap: number; spatialCap: number };
    buses: Record<AudioBusId, { configuredGain: number; muted: boolean; effectiveGain: number }>;
  } {
    const buses = Object.fromEntries(AUDIO_BUS_IDS.map((id) => {
      const configuredGain = this.audioSettings?.gains[id] ?? 100;
      const muted = this.audioSettings?.mutes[id] ?? false;
      const fallbackGain = this.busBaseGain(id) * (muted ? 0 : configuredGain / 100);
      return [id, { configuredGain, muted, effectiveGain: this.buses.get(id)?.gain.value ?? fallbackGain }];
    })) as Record<AudioBusId, { configuredGain: number; muted: boolean; effectiveGain: number }>;
    let outputProbe = EMPTY_AUDIO_OUTPUT_PROBE;
    if (this.outputAnalyser && this.outputTimeDomain && this.outputFrequencyDb && this.context) {
      this.outputAnalyser.getFloatTimeDomainData(this.outputTimeDomain);
      this.outputAnalyser.getFloatFrequencyData(this.outputFrequencyDb);
      outputProbe = analyzeAudioOutput(this.outputTimeDomain, this.outputFrequencyDb, this.context.sampleRate);
    }
    return {
      context: {
        source: this.contextSource,
        state: this.context?.state
          ?? (this.contextSource === 'unavailable' ? 'unavailable' : this.contextSource === 'failed' ? 'failed' : 'locked'),
      },
      listener: { poseMode: this.listenerPoseMode },
      immersion: {
        space: this.currentAcousticSpace(),
        arenaSpace: this.acousticSpace,
        overridden: this.acousticSpaceOverride !== null,
        occlusionHook: this.occlusionSampler !== null,
        occludedReports: this.occludedReports,
      },
      explosionMix: { ...this.explosionAudioGate, coalesceMs: EXPLOSION_AUDIO_COALESCE_MS },
      ambience: {
        continuousSources: this.arenaSources.length,
        busGain: this.ambience?.gain.value ?? 0.12,
        arena: this.activeArena,
        // Pass 75: seconds until the next intermittent event. Negative means
        // overdue (the driver is not running); Infinity means unarmed.
        nextEventInSeconds: this.context
          ? Number((this.nextAmbientEventAtSeconds - this.context.currentTime).toFixed(2))
          : Number.POSITIVE_INFINITY,
        ambientEventsPlayed: this.ambientEventsPlayed,
      },
      combatPrewarm: {
        prepared: this.combatFeedbackPrepared,
        runs: this.combatFeedbackPrepareRuns,
        sources: this.combatFeedbackSources.length,
        nodes: this.combatFeedbackNodes.length,
        broadbandLoopSources: 0,
      },
      glassImpactPrewarm: {
        prepared: this.glassImpactPrepared,
        runs: this.glassImpactPrepareRuns,
        retainedBroadbandLoops: 0,
      },
      grenadeEffectsPrewarm: {
        prepared: this.grenadeEffectsPrepared,
        runs: this.grenadeEffectsPrepareRuns,
        warmupSources: this.grenadeEffectWarmupSources,
        warmupNodes: this.grenadeEffectWarmupNodes,
        retainedSources: 0,
        retainedBroadbandLoops: 0,
        liveRecipe: 'layered-blast-brown-body-sub-and-crackle-debris-v2',
      },
      destructionEffectsPrewarm: {
        prepared: this.destructionEffectsPrepared,
        runs: this.destructionEffectsPrepareRuns,
        warmupSources: this.destructionEffectWarmupSources,
        warmupNodes: this.destructionEffectWarmupNodes,
        retainedSources: 0,
        retainedBroadbandLoops: 0,
      },
      lowHealth: {
        prepared: this.combatFeedbackPrepared && this.lowHealthGains.length === 2,
        sources: this.combatFeedbackPrepared ? 2 : 0,
        active: this.lowHealthFeedbackActive,
        audible: this.lowHealthFeedbackAudible,
        breathingGain: this.lowHealthAppliedState?.breathingGain ?? 0,
        heartbeatGain: this.lowHealthAppliedState?.heartbeatGain ?? 0,
        automationWrites: this.lowHealthAutomationWrites,
        broadbandSources: 0,
      },
      damageFeedback: {
        prepared: this.damageFeedbackSource !== null && this.damageFeedbackGain !== null,
        sources: this.damageFeedbackSource ? 1 : 0,
        pulses: this.damageFeedbackPulses,
      },
      grenadeFuse: { beeps: this.grenadeFuseBeeps, startMs: GRENADE_FUSE_BEEP_START_MS },
      crossbowFuse: {
        beeps: this.crossbowFuseBeeps,
        lastRemainingMs: this.crossbowFuseLastRemainingMs,
        lastDistanceM: this.crossbowFuseLastDistanceM,
        startMs: EXPLOSIVE_BOLT_ARM_DELAY_MS,
      },
      minigunDrive: {
        active: this.minigunDriveLoop !== null,
        starts: this.minigunDriveStarts,
        stops: this.minigunDriveStops,
        fraction: this.minigunDriveFraction,
        phase: this.minigunDrivePhase,
      },
      support: {
        cues: this.supportCuePlays,
        chopperRotorActive: this.chopperRotorLoops.size > 0,
        chopperRotorStarts: this.chopperRotorStarts,
        chopperRotorStops: this.chopperRotorStops,
      },
      countdown: {
        cues: this.matchCountdownCuePlays,
        lastCue: this.lastMatchCountdownCue,
        maximumVoicesPerCue: MATCH_COUNTDOWN_AUDIO_LIMITS.maximumVoicesPerCue,
        maximumCueWindowSeconds: MATCH_COUNTDOWN_AUDIO_LIMITS.maximumCueWindowSeconds,
        buses: ['announcements', 'ui'] as const,
      },
      railgun: { ...this.railgunReports, layerCount: RAILGUN_REPORT_PROFILE.layerCount, pressureDuration: RAILGUN_REPORT_PROFILE.pressureDuration },
      flashbang: { ...this.flashbangs, maximumTailMs: FLASHBANG_AUDIO_PROFILE.maximumTailMs },
      outputProbe,
      runtime: {
        voices: this.activeVoices.size,
        spatialChains: this.spatialChains + this.arenaSources.length,
        spatialPoolSize: this.footstepChains.length,
        stolen: this.voicesStolen,
        dropped: this.voicesDropped,
        globalCap: AUDIO_RUNTIME_BUDGET.globalVoices,
        spatialCap: AUDIO_RUNTIME_BUDGET.spatialVoices,
      },
      buses,
    };
  }

  /**
   * Cheap shared room return. The delays are deliberately short and diffuse
   * through allpass sections; this gives hard surfaces a tail without a
   * convolution impulse response or a second voice per event. Partial test
   * contexts may not expose createDelay, in which case the dry graph remains
   * fully functional.
   */
  private createSharedReverb(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || typeof context.createDelay !== 'function') return;
    try {
      const input = context.createGain();
      const earlyDelay = context.createDelay(0.2);
      const earlyAllpass = context.createBiquadFilter();
      const earlyFeedback = context.createGain();
      const lateDelay = context.createDelay(0.3);
      const lateAllpass = context.createBiquadFilter();
      const lateFeedback = context.createGain();
      const returnGain = context.createGain();
      earlyAllpass.type = 'allpass';
      earlyAllpass.frequency.value = 1_180;
      earlyAllpass.Q.value = 0.62;
      lateAllpass.type = 'allpass';
      lateAllpass.frequency.value = 740;
      lateAllpass.Q.value = 0.48;
      earlyFeedback.gain.value = SHARED_REVERB_PROFILE.feedback;
      lateFeedback.gain.value = SHARED_REVERB_PROFILE.feedback * 0.82;
      returnGain.gain.value = SHARED_REVERB_PROFILE.returnGain;
      input.connect(earlyDelay).connect(earlyAllpass).connect(earlyFeedback).connect(earlyDelay);
      earlyAllpass.connect(lateDelay).connect(lateAllpass).connect(lateFeedback).connect(lateDelay);
      lateAllpass.connect(returnGain).connect(master);
      earlyDelay.delayTime.value = SHARED_REVERB_PROFILE.earlyDelaySeconds;
      lateDelay.delayTime.value = SHARED_REVERB_PROFILE.lateDelaySeconds;
      const nodes = [input, earlyDelay, earlyAllpass, earlyFeedback, lateDelay, lateAllpass, lateFeedback, returnGain] as const;
      this.reverbGraph = Object.freeze({ input, returnGain, earlyDelay, lateDelay, earlyFeedback, lateFeedback, nodes });
    } catch {
      this.reverbGraph = null;
    }
  }

  private duckGameMusicForCombat(durationSeconds: number): void {
    const ducker = this.gameMusicDucker;
    const now = this.context?.currentTime;
    if (!ducker || now === undefined || !Number.isFinite(now)) return;
    const duration = Math.max(0.08, Math.min(1.2, durationSeconds));
    ducker.gain.cancelScheduledValues(now);
    ducker.gain.setValueAtTime(Math.min(1, ducker.gain.value), now);
    ducker.gain.setTargetAtTime(GAME_MUSIC_COMBAT_DUCK_GAIN, now, 0.012);
    ducker.gain.setTargetAtTime(1, now + duration, 0.12);
  }

  private createBus(id: Exclude<AudioBusId, 'master'>): GainNode {
    const bus = this.context!.createGain();
    bus.gain.value = audioBusBaseGain(id);
    if (id === 'game-music' && typeof this.context!.createDelay === 'function') {
      // Keep the historical game-music bus coefficient for settings and
      // telemetry, then duck it through a separate gain during combat.
      const ducker = this.context!.createGain();
      ducker.gain.value = 1;
      bus.connect(ducker).connect(this.master!);
      this.gameMusicDucker = ducker;
    } else {
      bus.connect(this.master!);
    }
    const reverbSend = SHARED_REVERB_PROFILE.sends[id as keyof typeof SHARED_REVERB_PROFILE.sends];
    if (this.reverbGraph && reverbSend !== undefined) {
      const send = this.context!.createGain();
      send.gain.value = reverbSend;
      bus.connect(send).connect(this.reverbGraph.input);
      this.reverbSendGains.set(id, send);
    }
    this.buses.set(id, bus);
    this.busIdentity.set(bus, id);
    return bus;
  }

  private createRailgunSpatialDestinations(
    emitter: SpatialPoint,
    distance: number,
  ): Readonly<{ weapons: PannerNode; ambience: PannerNode }> | null {
    if (!this.context || !this.weapons || !this.ambience
      || ![emitter.x, emitter.y, emitter.z, distance].every(Number.isFinite)
      || this.spatialChains + 2 > AUDIO_RUNTIME_BUDGET.spatialVoices) {
      this.voicesDropped += 1;
      return null;
    }
    const create = (bus: 'sfx' | 'ambience', destination: GainNode): PannerNode => {
      const panner = this.context!.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 14;
      panner.maxDistance = 220;
      panner.rolloffFactor = 0.12;
      panner.positionX.value = emitter.x;
      panner.positionY.value = emitter.y;
      panner.positionZ.value = emitter.z;
      panner.connect(destination);
      this.busIdentity.set(panner, bus);
      this.spatialReportDestinations.add(panner);
      this.spatialReportDistances.set(panner, distance);
      this.railgunSpatialNodes.push(panner);
      return panner;
    };
    const weapons = create('sfx', this.weapons);
    const ambience = create('ambience', this.ambience);
    this.spatialChains += 2;
    this.railgunSpatialChainCount += 2;
    const cleanup = () => {
      for (const node of [weapons, ambience]) {
        const index = this.railgunSpatialNodes.indexOf(node);
        if (index >= 0) this.railgunSpatialNodes.splice(index, 1);
        this.busIdentity.delete(node);
        node.disconnect();
      }
      this.spatialChains = Math.max(0, this.spatialChains - 2);
      this.railgunSpatialChainCount = Math.max(0, this.railgunSpatialChainCount - 2);
      const timerIndex = this.railgunSpatialTimers.indexOf(timer);
      if (timerIndex >= 0) this.railgunSpatialTimers.splice(timerIndex, 1);
    };
    const timer = setTimeout(cleanup, Math.ceil((RAILGUN_REPORT_PROFILE.tailDuration + 0.12) * 1_000));
    this.railgunSpatialTimers.push(timer);
    return { weapons, ambience };
  }

  /**
   * 2026-08-29: a per-id fallthrough here silently REVERTED the chiptune
   * restage at runtime (configure() overwrote createBus's value), and until
   * PASS 95 it did the same to menu-music (0.18 here versus 0.045 at
   * creation). The table is now the only place a coefficient lives.
   */
  private busBaseGain(id: AudioBusId): number {
    return audioBusBaseGain(id);
  }

  private applyBusSetting(id: AudioBusId): void {
    const node = this.buses.get(id);
    if (!node) return;
    const muted = this.audioSettings?.mutes[id] ?? false;
    const gain = this.audioSettings?.gains[id] ?? 100;
    const scalar = muted ? 0 : Math.max(0, Math.min(1, gain / 100));
    node.gain.setTargetAtTime(this.busBaseGain(id) * scalar, this.context?.currentTime ?? 0, 0.018);
  }

  private registerVoice(
    source: AudioScheduledSourceNode,
    destination: AudioNode,
    priority: number,
    spatial = false,
    distance = 0,
    protectedContinuous = false,
  ): boolean {
    const bus = this.busIdentity.get(destination) ?? 'sfx';
    const reservedSpatial = this.spatialReportDestinations.has(destination);
    const admittedSpatial = spatial || reservedSpatial;
    const admittedDistance = reservedSpatial ? this.spatialReportDistances.get(destination) ?? distance : distance;
    const busCap = bus === 'master' ? AUDIO_RUNTIME_BUDGET.globalVoices : AUDIO_RUNTIME_BUDGET.perBus[bus];
    const busVoices = [...this.activeVoices.entries()].filter(([, voice]) => voice.bus === bus);
    const overGlobal = this.activeVoices.size >= AUDIO_RUNTIME_BUDGET.globalVoices;
    const overBus = busVoices.length >= busCap;
    const overSpatial = admittedSpatial && (reservedSpatial
      ? this.spatialChains > AUDIO_RUNTIME_BUDGET.spatialVoices
      : this.spatialChains >= AUDIO_RUNTIME_BUDGET.spatialVoices);
    if (overSpatial) {
      this.voicesDropped += 1;
      source.disconnect();
      return false;
    }
    if (overGlobal || overBus) {
      const candidates = (overBus ? busVoices : [...this.activeVoices.entries()])
        .filter(([, voice]) => !voice.protectedContinuous);
      const candidateId = String(this.nextVoiceId);
      const selected = selectVoiceToSteal(
        candidates.map(([, voice]) => ({
          id: String(voice.id), priority: voice.priority, distance: voice.distance, startedAt: voice.startedAt,
        })),
        { id: candidateId, priority, distance: admittedDistance, startedAt: this.context?.currentTime ?? 0 },
        candidates.length,
      );
      const weakest = selected ? candidates.find(([, voice]) => String(voice.id) === selected.id) : undefined;
      if (!weakest) {
        this.voicesDropped += 1;
        source.disconnect();
        return false;
      }
      this.voicesStolen += 1;
      this.stopSource(weakest[0]);
    }
    const voice = {
      id: this.nextVoiceId++,
      bus,
      startedAt: this.context?.currentTime ?? 0,
      priority,
      spatial: admittedSpatial,
      distance: admittedDistance,
      protectedContinuous,
    };
    this.activeVoices.set(source, voice);
    source.onended = () => {
      this.activeVoices.delete(source);
      source.disconnect();
    };
    return true;
  }

  private registerContinuousVoice(
    source: AudioScheduledSourceNode,
    destination: AudioNode,
    priority: number,
    scope: ContinuousVoiceScope,
    nodes: readonly AudioNode[],
    gains: readonly GainNode[] = [],
  ): boolean {
    if (!this.registerVoice(source, destination, priority, false, 0, true)) return false;
    this.continuousVoiceOwners.set(source, Object.freeze({
      scope,
      nodes: Object.freeze([...nodes]),
      gains: Object.freeze([...gains]),
    }));
    const previousEnded = source.onended;
    source.onended = (event) => {
      previousEnded?.call(source, event);
      this.releaseContinuousVoice(source);
    };
    return true;
  }

  private releaseContinuousVoice(source: AudioScheduledSourceNode): void {
    const owner = this.continuousVoiceOwners.get(source);
    if (!owner) return;
    this.continuousVoiceOwners.delete(source);
    const sources = owner.scope === 'arena' ? this.arenaSources : this.combatFeedbackSources;
    const sourceIndex = sources.indexOf(source);
    if (sourceIndex >= 0) sources.splice(sourceIndex, 1);
    const ownedNodes = owner.scope === 'arena' ? this.arenaNodes : this.combatFeedbackNodes;
    for (const node of owner.nodes) {
      const nodeIndex = ownedNodes.indexOf(node);
      if (nodeIndex >= 0) ownedNodes.splice(nodeIndex, 1);
      try { node.disconnect(); } catch { /* partially connected browser node */ }
    }
    if (owner.scope === 'combat-feedback') {
      for (const gain of owner.gains) {
        const gainIndex = this.lowHealthGains.indexOf(gain);
        if (gainIndex >= 0) this.lowHealthGains.splice(gainIndex, 1);
        if (this.damageFeedbackGain === gain) this.damageFeedbackGain = null;
      }
      if (this.damageFeedbackSource === source) this.damageFeedbackSource = null;
    }
  }

  private stopSource(source: AudioScheduledSourceNode): void {
    try { source.stop(); } catch { /* already stopped */ }
    this.releaseContinuousVoice(source);
    this.activeVoices.delete(source);
    try { source.disconnect(); } catch { /* already or partially disconnected */ }
  }

  private stopMinigunDrive(): void {
    const loop = this.minigunDriveLoop;
    if (!loop) return;
    this.minigunDriveLoop = null;
    this.minigunDriveStops += 1;
    this.minigunDriveLastUpdateAt = Number.NEGATIVE_INFINITY;
    this.stopSource(loop.source);
  }

  private stopChopperRotor(id: string): void {
    const loop = this.chopperRotorLoops.get(id);
    if (!loop) return;
    this.chopperRotorLoops.delete(id);
    this.chopperRotorStops += 1;
    this.stopSource(loop.source);
  }

  private stopAllChopperRotors(): void {
    for (const id of [...this.chopperRotorLoops.keys()]) this.stopChopperRotor(id);
  }

  private stopSources(sources: AudioScheduledSourceNode[]): void {
    for (const source of sources.splice(0)) this.stopSource(source);
  }

  private disconnectNodes(nodes: AudioNode[]): void {
    for (const node of nodes.splice(0)) {
      try { node.disconnect(); } catch { /* already or partially disconnected */ }
    }
  }

  private resetCombatFeedbackState(): void {
    this.lowHealthGains = [];
    this.damageFeedbackSource = null;
    this.damageFeedbackGain = null;
    this.combatFeedbackPrepared = false;
    this.glassImpactPrepared = false;
    this.grenadeEffectsPrepared = false;
    this.grenadeEffectWarmupSources = 0;
    this.grenadeEffectWarmupNodes = 0;
    this.lowHealthFeedbackActive = false;
    this.lowHealthFeedbackAudible = false;
    this.lowHealthAppliedState = null;
  }

  private acquireFootstepChain(): SpatialFootstepChain | null {
    const available = this.footstepChains.find((chain) => !chain.busy);
    if (available) {
      available.busy = true;
      return available;
    }
    if (!this.context || !this.movement
      || this.footstepChains.length + this.arenaSources.length >= AUDIO_RUNTIME_BUDGET.spatialVoices) return null;
    const filter = this.context.createBiquadFilter();
    const resonance = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.maxDistance = 32;
    panner.rolloffFactor = 1.4;
    filter.connect(resonance).connect(gain).connect(panner).connect(this.movement);
    const chain = { filter, resonance, gain, panner, busy: true };
    this.footstepChains.push(chain);
    return chain;
  }

  private startArenaBed(arenaId: ArenaId): void {
    if (!this.context || !this.ambience) return;
    const definition = ARENA_AUDIO_DEFINITIONS[arenaId];
    const now = this.context.currentTime;
    // Pass 75: arm the intermittent layer HERE, not in setArena. setArena can
    // run before an AudioContext exists (the bed is (re)started after the
    // audio unlock), which left the scheduler pinned at Infinity and silent.
    // The first event is deliberately delayed - an ambient one-shot the
    // instant an arena loads reads as a load artefact, not as environment.
    this.nextAmbientEventAtSeconds = now
      + nextAmbientGapSeconds(ARENA_AMBIENT_PROFILES[arenaId], Math.random());
    const tone = this.context.createOscillator();
    const toneFilter = this.context.createBiquadFilter();
    // HF-376: a resonance that drifts on its own incommensurate period. A bare
    // low sine is a test tone; a low tone through a slowly moving formant is a
    // space. This is the cheapest possible "sense of room" and it costs no
    // extra voice, which matters because each arena is capped at two
    // continuous voices (spatial-audio.test.ts).
    const toneResonance = this.context.createBiquadFilter();
    const toneGain = this.context.createGain();
    const tonePanner = this.context.createPanner();
    // HF-350: the rustworks bed was a raw sawtooth - its dense harmonic stack
    // read as a continuous electrical buzz behind combat. A low-passed
    // triangle keeps the same fundamental weight without that buzz signature.
    tone.type = arenaId === 'rustworks-1v1' ? 'triangle' : 'sine';
    tone.frequency.value = definition.bedFrequencyHz;
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = definition.airFrequencyHz * 2;
    toneGain.gain.value = 0.012;
    // HF-351 incommensurate bed loop #1 (9.31s): slow amplitude swell so the
    // tone breathes instead of sitting at a constant drone level. Its period
    // shares no integer ratio with the air-voice loops below, so the summed
    // ambience has no audible repetition period.
    {
      const tonePeriodSeconds = AMBIENCE_INCOMMENSURATE_PERIODS_SECONDS[0];
      const baseGain = 0.012;
      toneGain.gain.setValueAtTime(baseGain * 0.85, now);
      toneGain.gain.linearRampToValueAtTime(baseGain * 1.12, now + tonePeriodSeconds / 2);
      toneGain.gain.linearRampToValueAtTime(baseGain * 0.85, now + tonePeriodSeconds);
    }
    tonePanner.panningModel = 'HRTF';
    tonePanner.distanceModel = 'inverse';
    tonePanner.refDistance = 8;
    tonePanner.maxDistance = 90;
    tonePanner.rolloffFactor = 0.45;
    tonePanner.positionX.value = definition.bedPosition.x;
    tonePanner.positionY.value = definition.bedPosition.y;
    tonePanner.positionZ.value = definition.bedPosition.z;
    toneResonance.type = 'peaking';
    toneResonance.Q.value = 2.6;
    const toneResonanceGain = (toneResonance as Partial<BiquadFilterNode>).gain;
    if (toneResonanceGain) toneResonanceGain.value = 7;
    {
      // Drifts on period #3, which shares no integer ratio with the amplitude
      // swell above or the air voice's own drift below, so the summed bed never
      // develops an audible repeat.
      const resonancePeriodSeconds = AMBIENCE_INCOMMENSURATE_PERIODS_SECONDS[2];
      const centreHz = Math.max(60, definition.bedFrequencyHz * 3.1);
      toneResonance.frequency.setValueAtTime(centreHz * 0.86, now);
      for (let step = 1; step <= 4; step += 1) {
        toneResonance.frequency.exponentialRampToValueAtTime(
          centreHz * (step % 2 === 0 ? 0.86 : 1.19),
          now + (resonancePeriodSeconds * step) / 2,
        );
      }
    }
    tone.connect(toneFilter).connect(toneResonance).connect(toneGain).connect(tonePanner).connect(this.ambience);
    if (this.registerContinuousVoice(tone, this.ambience, 1, 'arena', [toneFilter, toneResonance, toneGain, tonePanner])) {
      tone.start(now);
      this.arenaSources.push(tone);
      this.arenaNodes.push(toneFilter, toneResonance, toneGain, tonePanner);
    } else {
      toneFilter.disconnect();
      toneResonance.disconnect();
      toneGain.disconnect();
      tonePanner.disconnect();
    }
    // HF-165: never use an indefinite white-noise buffer for arena ambience.
    // A filtered, gently modulated oscillator retains air movement without the
    // recurring broadband hiss that became obvious after loud combat tails.
    const air = this.context.createOscillator();
    const airFilter = this.context.createBiquadFilter();
    const airLowpass = this.context.createBiquadFilter();
    const airGain = this.context.createGain();
    const airPanner = this.context.createPanner();
    air.type = 'triangle';
    air.frequency.value = definition.airFrequencyHz;
    airFilter.type = 'bandpass';
    airFilter.frequency.value = definition.airFrequencyHz;
    airFilter.Q.value = definition.airQ;
    airLowpass.type = 'lowpass';
    airLowpass.frequency.value = definition.airLowpassHz;
    airLowpass.Q.value = 0.72;
    {
      // HF-376: the air voice's brightness breathes on period #2. A fixed
      // cutoff is why every arena's bed read as the same filter setting - the
      // pitch drifted but the timbre never did, and timbre is what the ear
      // uses to place itself in a room.
      const brightnessPeriodSeconds = AMBIENCE_INCOMMENSURATE_PERIODS_SECONDS[1];
      airLowpass.frequency.setValueAtTime(definition.airLowpassHz * 0.78, now);
      for (let step = 1; step <= 4; step += 1) {
        airLowpass.frequency.exponentialRampToValueAtTime(
          definition.airLowpassHz * (step % 2 === 0 ? 0.78 : 1.28),
          now + (brightnessPeriodSeconds * step) / 2,
        );
      }
    }
    airGain.gain.value = definition.airGain;
    airPanner.panningModel = 'HRTF';
    airPanner.distanceModel = 'inverse';
    airPanner.refDistance = 9;
    airPanner.maxDistance = 100;
    airPanner.rolloffFactor = 0.38;
    airPanner.positionX.value = definition.airPosition.x;
    airPanner.positionY.value = definition.airPosition.y;
    airPanner.positionZ.value = definition.airPosition.z;
    // HF-165: never use an indefinite white-noise buffer for arena ambience.
    // A filtered, gently modulated oscillator retains air movement without the
    // recurring broadband hiss that became obvious after loud combat tails.
    air.frequency.setValueAtTime(definition.airFrequencyHz, now);
    // HF-351: the air voice drifts on an incommensurate LFO period (see
    // AMBIENCE_INCOMMENSURATE_PERIODS_SECONDS) instead of the definition's
    // modulation rate, so the bed never falls into an audible loop against
    // the tone voice. The schedule window is 2x the period; startArenaBed()
    // re-runs on every arena/map change, which refreshes the automation.
    const driftPeriodSeconds = AMBIENCE_INCOMMENSURATE_PERIODS_SECONDS[0];
    const halfCycleSeconds = driftPeriodSeconds * 0.5;
    const scheduledHalfCycles = Math.ceil((driftPeriodSeconds * 2) / halfCycleSeconds);
    for (let step = 1; step <= scheduledHalfCycles; step += 1) {
      const direction = step % 2 === 0 ? -1 : 1;
      air.frequency.exponentialRampToValueAtTime(
        definition.airFrequencyHz * (1 + definition.modulationDepth * direction),
        now + halfCycleSeconds * step,
      );
    }
    air.connect(airFilter).connect(airLowpass).connect(airGain).connect(airPanner).connect(this.ambience);
    if (this.registerContinuousVoice(air, this.ambience, 1, 'arena', [airFilter, airLowpass, airGain, airPanner])) {
      air.start(now);
      this.arenaSources.push(air);
      this.arenaNodes.push(airFilter, airLowpass, airGain, airPanner);
    } else {
      airFilter.disconnect();
      airLowpass.disconnect();
      airGain.disconnect();
      airPanner.disconnect();
    }
  }

  private sweepSequence(
    cues: readonly Readonly<{
      startFrequency: number;
      endFrequency: number;
      duration: number;
      volume: number;
      delay: number;
    }>[],
    wave: OscillatorType,
    destination: AudioNode | null,
  ): void {
    // HF-376 completion: this was the last voice in the game still built on
    // the old shape - one shared oscillator whose every cue was an exponential
    // attack straight into ONE exponential decay across a single frequency
    // glide. Overlapping cues were worse than merely beeps: the hunter
    // swarm's five 0.44 s whooshes spaced 0.07 s apart fought over the same
    // automation timeline, each new setValueAtTime landing mid-ramp of the
    // previous cue. Each cue is now its own properly voiced transient via
    // sweep(): ramped attack into a held body, a front-loaded pitch fall
    // between the same endpoints, and round-robin detune so five identical
    // pulses never read as one looped sample.
    cues.forEach((cue, index) => {
      this.sweep(
        cue.startFrequency,
        cue.endFrequency,
        cue.duration,
        cue.volume,
        wave,
        destination,
        Math.max(0, cue.delay),
        {
          attack: Math.min(0.008, cue.duration * 0.25),
          punch: 0.35,
          punchSeconds: Math.max(0.004, cue.duration * 0.22),
          detuneCents: roundRobinDetune(index, 40),
        },
      );
    });
  }

  private createNoiseBuffer(duration: number, texture: NoiseTexture = 'white'): AudioBuffer {
    const length = Math.floor(this.context!.sampleRate * duration);
    const buffer = this.context!.createBuffer(1, length, this.context!.sampleRate);
    // HF-376: the recipe moved to audio-synthesis.ts so the spectra are unit
    // testable without an AudioContext. 'white' reproduces the historical
    // buffer exactly, so untextured call sites are unchanged.
    fillNoiseTexture(buffer.getChannelData(0), texture, presentationRandom);
    return buffer;
  }

  /**
   * HF-376: a WaveShaper stage, or null where the platform has no such node.
   *
   * Saturation is the difference between a loud gunshot and a quiet gunshot
   * with the fader up: clipping the peaks lets the body sit far higher at the
   * same peak level, and the harmonics it generates ARE the crack. Curves are
   * cached per quantised drive because generating one per shot at automatic
   * fire rates would allocate a kilobyte of Float32 per round.
   *
   * Feature-detected rather than assumed: this file must keep working on a
   * partial AudioContext (see unlock()'s teardown path), and the test doubles
   * implement only the node types the runtime demonstrably needs.
   */
  private createSaturator(drive: number): AudioNode | null {
    const context = this.context;
    if (!context || drive <= 0) return null;
    if (this.saturationSupported === null) {
      this.saturationSupported = typeof (context as Partial<AudioContext>).createWaveShaper === 'function';
    }
    if (!this.saturationSupported) return null;
    const key = Math.round(Math.min(1, drive) * 20);
    const cached = this.saturationCurves.get(key);
    const curve = cached ?? saturationCurve(key / 20);
    if (!cached) this.saturationCurves.set(key, curve);
    try {
      const shaper = context.createWaveShaper();
      shaper.curve = curve;
      shaper.oversample = '2x';
      return shaper;
    } catch {
      // A device policy may expose the constructor and still refuse the node.
      // Losing colour is acceptable; losing the sound is not.
      this.saturationSupported = false;
      return null;
    }
  }

  /**
   * Schedules a transientEnvelope() contour onto a gain param. Kept in one
   * place because getting the exponential-ramp preconditions wrong (a zero
   * value or a non-increasing time) silently drops the whole envelope in some
   * browsers and leaves a voice stuck at full gain in others.
   */
  private applyEnvelope(gain: AudioParam, startSeconds: number, stages: readonly EnvelopeStage[]): void {
    let previous = Number.NEGATIVE_INFINITY;
    for (const [index, stage] of stages.entries()) {
      const at = startSeconds + stage.atSeconds;
      if (index > 0 && at <= previous) continue;
      previous = at;
      if (index === 0) gain.setValueAtTime(stage.value, at);
      else if (stage.ramp === 'linear') gain.linearRampToValueAtTime(stage.value, at);
      else gain.exponentialRampToValueAtTime(stage.value, at);
    }
  }

  private noise(options: NoiseOptions, destination: AudioNode | null): void {
    if (!this.context || !destination) return;
    const texture = options.texture ?? 'white';
    const buffer = this.noiseTextures.get(texture) ?? this.noiseBuffer;
    if (!buffer) return;
    const now = this.context.currentTime + (options.delay ?? 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = options.filter;
    filter.frequency.setValueAtTime(options.frequency, now);
    filter.Q.value = options.q ?? 0.7;
    // HF-376: a band that moves across the burst. Debris falls away, a scuff
    // opens then closes, air absorption pulls a distant report down - all of
    // which a fixed band renders as one static "shhh".
    if (options.frequencyEndHz !== undefined && options.frequencyEndHz > 0) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.frequencyEndHz),
        now + options.duration,
      );
    }
    const gain = this.context.createGain();
    this.applyEnvelope(gain.gain, now, transientEnvelope({
      peak: Math.max(0.0001, options.volume),
      durationSeconds: options.duration,
      attackSeconds: options.attack,
      punch: options.punch,
      punchSeconds: options.punchSeconds,
    }));

    // Chain: source -> band -> [resonance] -> [saturation] -> gain -> out.
    const extras: AudioNode[] = [];
    let head: AudioNode = filter;
    if (options.resonanceHz !== undefined && options.resonanceHz > 0) {
      // A second, resonant stage is what gives a burst a BODY: the barrel, the
      // hull plate, the shell casing, the room. One band-pass alone is a
      // colour, not an object.
      const resonance = this.context.createBiquadFilter();
      resonance.type = 'peaking';
      resonance.frequency.setValueAtTime(options.resonanceHz, now);
      resonance.Q.value = options.resonanceQ ?? 4.5;
      // A peaking filter's `gain` is the one BiquadFilter param a reduced
      // implementation may not expose (the test doubles here do not). Losing
      // the resonance costs colour; touching an absent param costs the shot.
      const resonanceGain = (resonance as Partial<BiquadFilterNode>).gain;
      if (resonanceGain) resonanceGain.value = options.resonanceGainDb ?? 9;
      head = head.connect(resonance);
      extras.push(resonance);
    }
    const saturator = options.drive ? this.createSaturator(options.drive) : null;
    if (saturator) {
      head = head.connect(saturator);
      extras.push(saturator);
    }
    source.connect(filter);
    head.connect(gain).connect(destination);
    if (!this.registerVoice(source, destination, 3)) {
      filter.disconnect();
      gain.disconnect();
      for (const node of extras) node.disconnect();
      return;
    }
    const voiceEnded = source.onended;
    source.onended = (event) => {
      voiceEnded?.call(source, event);
      filter.disconnect();
      gain.disconnect();
      for (const node of extras) node.disconnect();
    };
    source.start(now, presentationRandom() * Math.max(0.001, buffer.duration - options.duration), options.duration);
  }

  /**
   * HF-351: explicit-filter noise alias. The shared noise() already takes a
   * filter frequency, so this simply forwards; it exists to keep the explosion
   * mix call sites self-documenting about the distance lowpass stage.
   */
  private filteredNoise(options: NoiseOptions & { frequency: number }, destination: AudioNode | null): void {
    this.noise(options, destination);
  }

  private sweep(
    start: number,
    end: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    destination: AudioNode | null,
    delay = 0,
    shaping: PitchedShaping = {},
  ): void {
    if (!this.context || !destination) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    // HF-376: per-voice detune. Two bit-identical reports back to back is the
    // loudest "this is a synth" tell there is at automatic fire rates.
    const detune = centsToRatio(shaping.detuneCents ?? 0);
    const startHz = Math.max(1, start * detune);
    const endHz = Math.max(1, end * detune);
    oscillator.frequency.setValueAtTime(startHz, now);
    // HF-376: a front-loaded fall instead of one exponential ramp. A single
    // ramp spends half its time in the top half of the interval, which the ear
    // hears as a glide - a "boop". Real bodies drop most of their interval in
    // the first fifth and then settle, which is heard as a thump that has a
    // pitch rather than as a pitch that moves. Both endpoints are preserved.
    for (const stage of pitchFallStages(startHz, endHz, duration, shaping.pitchBias)) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, stage.hz), now + stage.atSeconds);
    }
    this.applyEnvelope(gain.gain, now, transientEnvelope({
      peak: Math.max(0.0001, volume),
      durationSeconds: duration,
      attackSeconds: shaping.attack,
      punch: shaping.punch,
      punchSeconds: shaping.punchSeconds,
    }));
    const saturator = shaping.drive ? this.createSaturator(shaping.drive) : null;
    if (saturator) oscillator.connect(saturator).connect(gain).connect(destination);
    else oscillator.connect(gain).connect(destination);
    if (!this.registerVoice(oscillator, destination, 3)) {
      gain.disconnect();
      saturator?.disconnect();
      return;
    }
    const voiceEnded = oscillator.onended;
    oscillator.onended = (event) => {
      voiceEnded?.call(oscillator, event);
      gain.disconnect();
      saturator?.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    destination: AudioNode | null = this.feedback,
    delay = 0,
    shaping: PitchedShaping = {},
  ): void {
    this.sweep(frequency, Math.max(1, frequency * 0.91), duration, volume, type, destination, delay, shaping);
  }
}
