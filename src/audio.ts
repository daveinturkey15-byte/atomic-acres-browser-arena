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
  chiptuneLoopEvents,
  chiptuneLoopSeconds,
  selectChiptuneTrack,
  type ChiptuneEvent,
  type ChiptuneTrackId,
} from './chiptune-music';
import { ARENA_AUDIO_DEFINITIONS, AUDIO_RUNTIME_BUDGET, selectVoiceToSteal, type FootstepMovement, type FootstepSurface as SpatialFootstepSurface, type SpatialPoint } from './spatial-audio';
import { EXPLOSIVE_BOLT_ARM_DELAY_MS } from './combat/ordnance';
import type { MinigunSpoolPhase } from './minigun-spool';
import {
  MATCH_COUNTDOWN_AUDIO_LIMITS,
  matchCountdownAudioCue,
  type MatchCountdownAudioCueId,
} from './match-countdown-audio';
import { WEAPON_REPORT_PROFILES } from './weapon-audio-profiles';

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

type NoiseOptions = {
  duration: number;
  volume: number;
  filter: BiquadFilterType;
  frequency: number;
  q?: number;
  delay?: number;
};

type SpatialFootstepChain = {
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  busy: boolean;
};

type MinigunDriveLoop = {
  source: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
};

type ChopperRotorLoop = MinigunDriveLoop & { panner: PannerNode };

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

  private readonly buses = new Map<AudioBusId, GainNode>();
  // Background chiptune. Exactly TWO long-lived oscillators for the whole track,
  // one per channel, matching AUDIO_RUNTIME_BUDGET.perBus['game-music'] = 2 by
  // construction. They are deliberately NOT put through registerVoice(): that path
  // is built for one-shot sources it may steal, and a stolen oscillator would kill
  // the music permanently rather than drop a single note. The cap is respected
  // because two is all that can ever exist, which chiptune-music.test.ts proves.
  private musicChannels: Readonly<Record<'lead' | 'bass', { osc: OscillatorNode; gain: GainNode }>> | null = null;
  private musicLoopStartedAtSeconds = 0;
  private musicScheduledUntilSeconds = 0;
  private musicRunning = false;
  private musicTrack: ChiptuneTrackId | null = null;
  // Remembered ACROSS matches so rotation is felt over a session rather than
  // re-rolled from nothing each time. Straight random would replay the same track
  // back to back about half the time, which reads as the music never changing.
  private musicLastTrack: ChiptuneTrackId | null = null;
  private readonly busIdentity = new Map<AudioNode, AudioBusId>();
  private audioSettings: AudioSettings | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private stepVariant = 0;
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
  private listenerPosition = { x: 0, y: 0, z: 0 };

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
        compressor.threshold.value = -12;
        compressor.knee.value = 8;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.18;
        this.master = this.context.createGain();
        this.master.gain.value = 0.34;
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
        this.weapons = this.createBus('sfx', 0.78);
        this.feedback = this.weapons;
        this.movement = this.createBus('movement', 0.34);
        this.ui = this.createBus('ui', 0.42);
        this.announcements = this.createBus('announcements', 0.5);
        this.ambience = this.createBus('ambience', 0.12);
        this.createBus('menu-music', 0.18);
        this.createBus('game-music', 0.16);
        this.noiseBuffer = this.createNoiseBuffer(1.2);
        for (const id of AUDIO_BUS_IDS) this.applyBusSetting(id);
        this.prepareCombat();
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
        this.resetCombatFeedbackState();
        for (const node of [...this.buses.values()]) {
          try { node.disconnect(); } catch { /* partial browser node */ }
        }
        this.context = null;
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
        this.buses.clear();
        this.busIdentity.clear();
        this.noiseBuffer = null;
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
    if (context && context.state !== 'closed') void context.close();
  }

  setArena(arenaId: ArenaId): void {
    if (this.activeArena === arenaId) return;
    this.activeArena = arenaId;
    this.stopSources(this.arenaSources);
    this.disconnectNodes(this.arenaNodes);
    this.startArenaBed(arenaId);
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
      const build = (wave: OscillatorType): { osc: OscillatorNode; gain: GainNode } => {
        const gain = this.context!.createGain();
        gain.gain.value = 0;
        gain.connect(bus);
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
      // Square lead over a square bass, the two-channel palette this loop was
      // written for. The bass sits two octaves down so they never mask each other.
      this.musicChannels = Object.freeze({ lead: build('square'), bass: build('square') });
      // Pick a track for this match, excluding whatever played last.
      this.musicTrack = selectChiptuneTrack(this.musicLastTrack, Math.random());
      this.musicLastTrack = this.musicTrack;
      this.musicRunning = true;
      this.musicLoopStartedAtSeconds = this.context.currentTime + 0.12;
      this.musicScheduledUntilSeconds = this.musicLoopStartedAtSeconds;
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
    // musicLastTrack deliberately SURVIVES a stop: it is what stops the next
    // match replaying the track that just finished.
    this.musicTrack = null;
    if (!channels) return;
    for (const channel of [channels.lead, channels.bass]) {
      try { channel.osc.stop(); } catch { /* may not have started */ }
      try { channel.osc.disconnect(); } catch { /* partial browser node */ }
      try { channel.gain.disconnect(); } catch { /* partial browser node */ }
    }
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
   */
  private pumpGameMusic(): void {
    const channels = this.musicChannels;
    const track = this.musicTrack;
    if (!this.musicRunning || !this.context || !channels || !track) return;
    const loopSeconds = chiptuneLoopSeconds(track);
    const horizon = this.context.currentTime + ArenaAudio.MUSIC_LOOKAHEAD_SECONDS;
    // Bound the work per frame. Without this a long tab-suspend would return and
    // try to schedule every note it "missed" in one go.
    let guard = 0;
    while (this.musicScheduledUntilSeconds < horizon && guard < 512) {
      guard += 1;
      const iteration = Math.floor(
        (this.musicScheduledUntilSeconds - this.musicLoopStartedAtSeconds) / loopSeconds);
      const loopStart = this.musicLoopStartedAtSeconds + iteration * loopSeconds;
      for (const event of chiptuneLoopEvents(track)) {
        const at = loopStart + event.offsetSeconds;
        if (at < this.musicScheduledUntilSeconds - 1e-6 || at >= horizon) continue;
        this.scheduleChiptuneNote(channels[event.channel], event, at);
      }
      this.musicScheduledUntilSeconds = loopStart + loopSeconds;
    }
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
      channel.gain.gain.linearRampToValueAtTime(event.gain, peak);
      // Ramp to a small floor rather than 0: exponential ramps reject zero, and a
      // hard cut to silence on a square wave clicks audibly.
      channel.gain.gain.setValueAtTime(event.gain, Math.max(peak, end - release));
      channel.gain.gain.linearRampToValueAtTime(0.0001, end);
    } catch {
      // A browser can reject a param schedule if the time has already passed.
    }
  }

  updateListener(position: SpatialPoint, yawRadians: number): void {
    if (!this.context || ![position.x, position.y, position.z, yawRadians].every(Number.isFinite)) return;
    this.listenerPosition.x = position.x;
    this.listenerPosition.y = position.y;
    this.listenerPosition.z = position.z;
    this.listenerPoseMode = updateBrowserAudioListenerPose(this.context.listener, position, yawRadians);
    this.pumpGameMusic();
  }

  worldFootstep(position: SpatialPoint, surface: SpatialFootstepSurface, movement: FootstepMovement, occluded = false): boolean {
    if (!this.context || !this.noiseBuffer || !this.movement
      || this.spatialChains + this.arenaSources.length >= AUDIO_RUNTIME_BUDGET.spatialVoices) {
      this.voicesDropped += 1;
      return false;
    }
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const chain = this.acquireFootstepChain();
    if (!chain) {
      this.voicesDropped += 1;
      return false;
    }
    const { filter, gain, panner } = chain;
    filter.type = surface === 'soil' || surface === 'grass' ? 'lowpass' : 'bandpass';
    const openFrequency = surface === 'metal' ? 1_900
      : surface === 'concrete' ? 1_300
        : surface === 'asphalt' ? 1_050
          : surface === 'wood' ? 760
            : surface === 'grass' ? 360 : 520;
    filter.frequency.value = openFrequency * (occluded ? 0.45 : 1);
    filter.Q.value = surface === 'metal' ? 1.4 : 0.8;
    gain.gain.cancelScheduledValues(now);
    const movementGain = movement === 'sprint' ? 0.048 : movement === 'crouch' || movement === 'prone' ? 0.016 : 0.032;
    gain.gain.setValueAtTime(movementGain * (occluded ? 0.65 : 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
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
    source.start(now, presentationRandom() * Math.max(0.001, this.noiseBuffer.duration - 0.085), 0.085);
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
      // The two live broadband layers share the retained noise sample but own
      // distinct filter/gain/source nodes. Warm those exact constructors and
      // connections without registering or emitting a live voice.
      for (const [filterType, frequency] of [['lowpass', 2_100], ['highpass', 3_100]] as const) {
        const source = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        sources.push(source);
        nodes.push(filter, gain);
        source.buffer = this.noiseBuffer;
        filter.type = filterType;
        filter.frequency.value = frequency;
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(this.weapons);
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
      breathingGain: presentation.active ? Math.max(0, presentation.breathingGain) : 0,
      heartbeatGain: presentation.active ? Math.max(0, presentation.heartbeatGain) : 0,
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
    const railgunSpatial = weapon === 'railgun' && remote && emitter
      ? this.createRailgunSpatialDestinations(emitter, distance)
      : null;
    const weaponDestination = railgunSpatial?.weapons ?? this.weapons;
    const ambienceDestination = railgunSpatial?.ambience ?? this.ambience;
    const spatialAttenuation = railgunSpatial ? 1 : weapon === 'railgun'
      ? railgunReportAttenuation(remote, distance)
      : remote ? Math.max(0.08, 0.55 * (1 - Math.min(1, distance / 80))) : 1;
    const attenuation = spatialAttenuation * WEAPON_REPORT_GAIN[weapon];
    const profile = WEAPON_REPORT_PROFILES[weapon];

    this.sweep(profile.body, profile.bodyEnd, profile.duration, 0.22 * attenuation, 'sawtooth', weaponDestination);
    this.sweep(profile.crack, profile.crack * profile.crackEndRatio, profile.crackDuration, 0.075 * attenuation, 'square', weaponDestination);
    this.noise({
      duration: profile.duration,
      volume: profile.noise * attenuation,
      filter: 'lowpass',
      frequency: profile.lowpass,
      q: 0.7,
    }, weaponDestination);
    this.noise({
      duration: profile.transientDuration,
      volume: 0.17 * attenuation,
      filter: 'highpass',
      frequency: profile.transientHighpass,
      q: 0.4,
    }, weaponDestination);
    this.noise({
      duration: profile.tailDuration,
      volume: (remote ? 0.055 : 0.082) * attenuation,
      filter: 'bandpass',
      frequency: profile.tail,
      q: 0.48,
      delay: 0.025,
    }, ambienceDestination);
    if (weapon === 'carbine') {
      // Original HK416 pressure and yard-reflection layers; short enough to stay readable at full RPM.
      this.sweep(74, 38, 0.16, 0.052 * attenuation, 'triangle', this.weapons, 0.008);
      this.noise({ duration: 0.14, volume: 0.046 * attenuation, filter: 'bandpass', frequency: 830, q: 0.62, delay: 0.058 }, this.ambience);
      if (!remote) this.noise({ duration: 0.022, volume: 0.046, filter: 'highpass', frequency: 4200, q: 0.55, delay: 0.043 }, this.feedback);
    }

    if (weapon === 'railgun') {
      // An authored pressure report, supersonic snap and long structural tail.
      // It remains on the existing compressed weapon/ambience buses, so local
      // and replicated shots are large without bypassing the bounded mix.
      this.sweep(36, 10, RAILGUN_REPORT_PROFILE.pressureDuration, 0.2 * attenuation, 'sawtooth', weaponDestination, 0.008);
      this.sweep(118, 24, 0.38, 0.12 * attenuation, 'triangle', weaponDestination, 0.026);
      this.noise({ duration: 0.7, volume: 0.2 * attenuation, filter: 'bandpass', frequency: 165, q: 0.5, delay: 0.045 }, ambienceDestination);
      this.noise({ duration: 0.08, volume: 0.16 * attenuation, filter: 'highpass', frequency: 4_800, q: 0.32, delay: 0.006 }, remote ? weaponDestination : this.feedback);
      this.tone(92, 0.42, 0.13 * attenuation, 'triangle', ambienceDestination, 0.075);
    }

    if (!remote) {
      this.tone(profile.mechanismPrimaryHz, 0.028, 0.038, 'square', this.feedback, profile.mechanismDelay);
      this.tone(profile.mechanismSecondaryHz, 0.018, 0.022, 'triangle', this.feedback, profile.mechanismDelay + 0.025);
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
    this.tone(cue.frequencyHz[0], 0.045, headshot ? 0.11 : 0.075, 'sine', this.ui);
    this.tone(cue.frequencyHz[1], 0.028, headshot ? 0.07 : 0.035, 'triangle', this.ui, 0.018);
  }

  kill(): void {
    const cue = combatConfirmEnvelope('kill');
    this.tone(cue.frequencyHz[0], 0.06, 0.055, 'triangle', this.ui);
    this.tone(cue.frequencyHz[1], 0.075, 0.07, 'sine', this.ui, 0.045);
    this.tone(cue.frequencyHz[2], 0.09, 0.075, 'sine', this.ui, 0.095);
  }

  damage(): void {
    if (!this.context || !this.combatFeedbackPrepared || !this.damageFeedbackSource || !this.damageFeedbackGain) return;
    const now = this.context.currentTime;
    this.damageFeedbackSource.frequency.cancelScheduledValues(now);
    this.damageFeedbackSource.frequency.setValueAtTime(180, now);
    this.damageFeedbackSource.frequency.exponentialRampToValueAtTime(72, now + 0.14);
    this.damageFeedbackGain.gain.cancelScheduledValues(now);
    this.damageFeedbackGain.gain.setValueAtTime(0, now);
    this.damageFeedbackGain.gain.linearRampToValueAtTime(0.085, now + 0.008);
    this.damageFeedbackGain.gain.linearRampToValueAtTime(0, now + 0.14);
    this.damageFeedbackPulses += 1;
  }

  impact(surface: ImpactSurface, distance = 0): void {
    const attenuation = Math.max(0.08, 1 - Math.min(1, distance / 34));
    const profile = surface === 'glass'
      ? { frequency: 5200, tone: 1460, duration: 0.095, volume: 0.105 }
      : surface === 'metal'
      ? { frequency: 3150, tone: 960, duration: 0.065, volume: 0.09 }
      : surface === 'wood'
        ? { frequency: 980, tone: 240, duration: 0.075, volume: 0.07 }
        : surface === 'soil'
          ? { frequency: 460, tone: 120, duration: 0.09, volume: 0.062 }
          : { frequency: 1780, tone: 410, duration: 0.07, volume: 0.076 };
    this.noise({ duration: profile.duration, volume: profile.volume * attenuation, filter: 'bandpass', frequency: profile.frequency, q: 1.25 }, this.feedback);
    this.tone(profile.tone, 0.028, 0.03 * attenuation, surface === 'metal' ? 'square' : 'triangle', this.feedback, 0.006);
  }

  coverImpact(distance = 0): void {
    this.impact('concrete', distance);
  }

  shedDoorMotion(distance = 0): void {
    const attenuation = Math.max(0.08, 1 - Math.min(1, distance / 34));
    this.impact('metal', distance);
    this.sweep(118, 72, 0.13, 0.032 * attenuation, 'triangle', this.feedback, 0.012);
  }

  testBayDoorThump(distance = 0): void {
    const profile = TEST_BAY_DOOR_THUMP_PROFILE;
    const attenuation = Math.max(0.08, 1 - Math.min(1, Math.max(0, distance) / profile.maximumDistanceM));
    this.tone(
      profile.layers.latch.frequencyHz,
      profile.layers.latch.durationSeconds,
      profile.layers.latch.volume * attenuation,
      profile.layers.latch.wave,
      this.feedback,
      profile.layers.latch.delaySeconds,
    );
    this.tone(
      profile.layers.pressure.frequencyHz,
      profile.layers.pressure.durationSeconds,
      profile.layers.pressure.volume * attenuation,
      profile.layers.pressure.wave,
      this.feedback,
      profile.layers.pressure.delaySeconds,
    );
    this.sweep(
      profile.layers.mechanism.startFrequencyHz,
      profile.layers.mechanism.endFrequencyHz,
      profile.layers.mechanism.durationSeconds,
      profile.layers.mechanism.volume * attenuation,
      profile.layers.mechanism.wave,
      this.feedback,
      profile.layers.mechanism.delaySeconds,
    );
    this.noise({
      duration: profile.layers.body.durationSeconds,
      volume: profile.layers.body.volume * attenuation,
      filter: profile.layers.body.filter,
      frequency: profile.layers.body.frequencyHz,
      q: profile.layers.body.q,
      delay: profile.layers.body.delaySeconds,
    }, this.feedback);
  }

  nearMiss(strength: number): void {
    const now = performance.now();
    if (strength <= 0 || now - this.lastNearMissAt < 85) return;
    this.lastNearMissAt = now;
    const level = Math.min(1, Math.max(0.1, strength));
    this.sweep(5200, 1350, 0.085, 0.055 * level, 'sawtooth', this.feedback);
    this.noise({ duration: 0.11, volume: 0.045 * level, filter: 'highpass', frequency: 2600, q: 0.85, delay: 0.008 }, this.feedback);
  }

  weaponAction(weapon: WeaponId, event: WeaponActionEvent): void {
    const scattergun = weapon === 'scattergun';
    if (event === 'mag-release') this.tone(620, 0.018, 0.028, 'square', this.feedback);
    else if (event === 'mag-out') this.noise({ duration: 0.055, volume: 0.032, filter: 'bandpass', frequency: 1050, q: 0.9 }, this.feedback);
    else if (event === 'mag-in') this.noise({ duration: 0.06, volume: 0.038, filter: 'bandpass', frequency: 1320, q: 1.1 }, this.feedback);
    else if (event === 'mag-seat') {
      this.tone(weapon === 'smg' ? 470 : 390, 0.035, 0.052, 'square', this.feedback);
      this.noise({ duration: 0.025, volume: 0.028, filter: 'highpass', frequency: 2400, q: 0.8 }, this.feedback);
    } else if (event === 'shell-insert') {
      this.tone(740, 0.02, 0.034, 'triangle', this.feedback);
      this.tone(260, 0.028, 0.03, 'square', this.feedback, 0.015);
    } else if (event === 'bolt-release') {
      this.tone(scattergun ? 310 : 520, 0.034, 0.055, 'square', this.feedback);
      this.noise({ duration: 0.032, volume: 0.036, filter: 'highpass', frequency: scattergun ? 1200 : 1900, q: 0.75 }, this.feedback);
    }
  }

  empty(): void {
    this.tone(170, 0.025, 0.055, 'square', this.feedback);
    this.tone(112, 0.035, 0.04, 'triangle', this.feedback, 0.03);
  }

  reload(): void {
    // Only the initial handling sound lives here; mechanical events are emitted
    // from the same normalized timeline that drives hands and weapon parts.
    this.noise({ duration: 0.07, volume: 0.026, filter: 'bandpass', frequency: 720, q: 0.7 }, this.feedback);
  }

  weaponSwitch(): void {
    this.noise({ duration: 0.07, volume: 0.026, filter: 'bandpass', frequency: 760, q: 0.8 }, this.feedback);
    this.tone(190, 0.035, 0.028, 'triangle', this.feedback, 0.055);
  }

  melee(): void {
    // Blade slash: a fast high whoosh that tears downward, a low body thump and
    // a brief metallic ring so the knife reads as a real cutting edge.
    this.noise({ duration: 0.09, volume: 0.062, filter: 'bandpass', frequency: 2_600, q: 1.2 }, this.feedback);
    this.sweep(1_900, 320, 0.1, 0.05, 'sawtooth', this.feedback);
    this.noise({ duration: 0.12, volume: 0.05, filter: 'bandpass', frequency: 420, q: 0.7 }, this.feedback);
    this.tone(1_240, 0.05, 0.016, 'triangle', this.feedback, 0.028);
  }

  footstep(surface: FootstepSurface | SpatialFootstepSurface, sprinting = false, crouched = false): void {
    this.stepVariant = (this.stepVariant + 1) % 4;
    const variation = [0.94, 1.04, 0.98, 1.08][this.stepVariant];
    const base = (sprinting ? 82 : crouched ? 54 : 68) * variation;
    const profile = surface === 'asphalt'
      ? { frequency: 1_050, tone: 72, volume: 1 }
      : surface === 'concrete'
        ? { frequency: 1_420, tone: 86, volume: 0.94 }
        : surface === 'wood'
          ? { frequency: 720, tone: 118, volume: 0.9 }
          : surface === 'metal'
            ? { frequency: 1_900, tone: 142, volume: 0.98 }
            : surface === 'grass'
              ? { frequency: 330, tone: 42, volume: 0.7 }
              : { frequency: 430, tone: 48, volume: 0.78 };
    this.noise({
      duration: sprinting ? 0.075 : 0.055,
      volume: (crouched ? 0.022 : sprinting ? 0.052 : 0.034) * profile.volume,
      filter: surface === 'soil' || surface === 'grass' ? 'lowpass' : 'bandpass',
      frequency: profile.frequency,
      q: surface === 'metal' ? 1.4 : surface === 'concrete' ? 1.15 : 0.72,
    }, this.movement);
    this.sweep(base + profile.tone * 0.2, Math.max(32, profile.tone * 0.48), sprinting ? 0.075 : 0.06, crouched ? 0.018 : 0.034, 'triangle', this.movement);
    if (surface === 'wood' || surface === 'metal') this.tone(profile.tone, 0.035, crouched ? 0.012 : 0.022, 'square', this.movement, 0.018);
    else if (surface === 'asphalt' || surface === 'concrete') {
      this.noise({ duration: 0.022, volume: crouched ? 0.008 : 0.014, filter: 'highpass', frequency: 2_800, q: 0.6, delay: 0.012 }, this.movement);
    }
  }

  land(impactSpeed: number): void {
    const strength = Math.min(1, Math.max(0.25, impactSpeed / 14));
    this.noise({ duration: 0.12, volume: 0.08 * strength, filter: 'lowpass', frequency: 540 }, this.movement);
    this.sweep(88, 36, 0.13, 0.065 * strength, 'sine', this.movement);
  }

  grenadeBounce(strength: number): void {
    const level = Math.min(1, Math.max(0.2, strength / 10));
    this.tone(310, 0.025, 0.035 * level, 'triangle', this.feedback);
    this.tone(185, 0.035, 0.026 * level, 'square', this.feedback, 0.012);
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
    source.frequency.setValueAtTime(860 + urgency * 720, contextNow);
    source.frequency.exponentialRampToValueAtTime(760 + urgency * 820, contextNow + 0.048);
    filter.type = 'bandpass';
    filter.frequency.value = 1_600 + urgency * 1_000;
    filter.Q.value = 1.25;
    gain.gain.setValueAtTime(0.0001, contextNow);
    gain.gain.exponentialRampToValueAtTime(0.055, contextNow + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, contextNow + 0.052);
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.4;
    panner.maxDistance = 42;
    panner.rolloffFactor = 1.25;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    source.connect(filter).connect(gain).connect(panner).connect(this.weapons);
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
    this.sweep(96, 24, 0.58, 0.29, 'sawtooth', this.weapons);
    this.filteredNoise({ duration: 0.64, volume: 0.42, filter: 'lowpass', frequency: 2100, q: 0.5 }, this.weapons);
    this.noise({ duration: 0.18, volume: 0.12, filter: 'highpass', frequency: 3100, q: 0.4, delay: 0.035 }, this.weapons);
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

    // Layer 1 - pressure body sweep.
    this.sweep(profile.bodySweep[0], profile.bodySweep[1], profile.bodyDuration, profile.bodyVolume * 0.55 * attenuation, 'sawtooth', destination);
    layers += 1;
    // Layer 2 - broadband blast noise through the same distance lowpass.
    this.filteredNoise({
      duration: Math.min(0.8, profile.bodyDuration),
      volume: 0.42 * attenuation,
      filter: 'lowpass',
      frequency: lowpassHz,
      q: 0.5,
    }, destination);
    layers += 1;
    // Layer 3 - family crack.
    this.sweep(profile.crackHz, Math.max(120, profile.crackHz * profile.crackEndRatio), profile.crackDuration, profile.crackVolume * attenuation, 'square', destination);
    layers += 1;
    // Layer 4 - debris patter (delayed band-passed noise).
    this.noise({
      duration: 0.22,
      volume: profile.debrisVolume * attenuation,
      filter: 'bandpass',
      frequency: family === 'support' ? 900 : 1_650,
      q: 0.6,
      delay: profile.debrisDelay,
    }, destination);
    layers += 1;
    // Layer 5 - crossbow metallic ring partials (inharmonic pair).
    if (profile.ringPartialHz > 0 && profile.ringVolume > 0) {
      this.tone(profile.ringPartialHz, 0.34, profile.ringVolume * attenuation, 'triangle', destination, 0.01);
      this.tone(profile.ringPartialHz * 2.41, 0.26, profile.ringVolume * 0.7 * attenuation, 'sine', destination, 0.012);
      layers += 2;
    }
    // Layer 6 - sub pressure weight (deepest on support).
    this.sweep(profile.subHz, profile.subEndHz, profile.subDuration, profile.subVolume * attenuation, 'sine', destination);
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
    this.sweep(178, 72, 0.09, 0.13, 'square', this.weapons);
    this.noise({ duration: 0.1, volume: 0.16, filter: 'bandpass', frequency: 3_100, q: 0.9 }, this.weapons);
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
    this.sweep(178, 72, 0.09, 0.13, 'square', weaponDestination);
    this.noise({ duration: 0.1, volume: 0.16, filter: 'bandpass', frequency: 3_100, q: 0.9 }, weaponDestination);
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
        loop = { source, filter, gain, panner };
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
      loop.source.frequency.value = entry.phase === 'inbound' ? 36 : entry.phase === 'outbound' ? 34 : 38;
      // HF-337: altitude-aware gain with blade-slap layer
      loop.gain.gain.value = (entry.phase === 'inbound' ? 0.015 : entry.phase === 'outbound' ? 0.012 : 0.018) * altitudeAttenuation;
      const voice = this.activeVoices.get(loop.source);
      if (voice) voice.distance = listenerDistance;
      // HF-337: low-rate blade-slap noise layer for unmistakable rotor presence
      if (this.context && this.ambience && this.noiseBuffer && Math.random() < 0.025) {
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
    explosionMix: ExplosionAudioGate & { coalesceMs: number };
    ambience: { continuousSources: number; busGain: number; arena: ArenaId | null };
    combatPrewarm: { prepared: boolean; runs: number; sources: number; nodes: number; broadbandLoopSources: 0 };
    glassImpactPrewarm: { prepared: boolean; runs: number; retainedBroadbandLoops: 0 };
    grenadeEffectsPrewarm: {
      prepared: boolean;
      runs: number;
      warmupSources: number;
      warmupNodes: number;
      retainedSources: 0;
      retainedBroadbandLoops: 0;
      liveRecipe: 'sawtooth-pressure-plus-dual-filtered-noise-v1';
    };
    destructionEffectsPrewarm: {
      prepared: boolean;
      runs: number;
      warmupSources: number;
      warmupNodes: number;
      retainedSources: 0;
      retainedBroadbandLoops: 0;
    };
    lowHealth: { prepared: boolean; sources: number; active: boolean; audible: boolean; automationWrites: number; broadbandSources: 0 };
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
      explosionMix: { ...this.explosionAudioGate, coalesceMs: EXPLOSION_AUDIO_COALESCE_MS },
      ambience: { continuousSources: this.arenaSources.length, busGain: this.ambience?.gain.value ?? 0.12, arena: this.activeArena },
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
        liveRecipe: 'sawtooth-pressure-plus-dual-filtered-noise-v1',
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

  private createBus(id: Exclude<AudioBusId, 'master'>, gainValue: number): GainNode {
    const bus = this.context!.createGain();
    bus.gain.value = gainValue;
    bus.connect(this.master!);
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

  private busBaseGain(id: AudioBusId): number {
    if (id === 'master') return 0.34;
    if (id === 'sfx') return 0.78;
    if (id === 'movement') return 0.34;
    if (id === 'ui') return 0.42;
    if (id === 'announcements') return 0.5;
    if (id === 'ambience') return 0.12;
    if (id === 'menu-music') return 0.18;
    return 0.16;
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
    const gain = this.context.createGain();
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.maxDistance = 32;
    panner.rolloffFactor = 1.4;
    filter.connect(gain).connect(panner).connect(this.movement);
    const chain = { filter, gain, panner, busy: true };
    this.footstepChains.push(chain);
    return chain;
  }

  private startArenaBed(arenaId: ArenaId): void {
    if (!this.context || !this.ambience) return;
    const definition = ARENA_AUDIO_DEFINITIONS[arenaId];
    const now = this.context.currentTime;
    const tone = this.context.createOscillator();
    const toneFilter = this.context.createBiquadFilter();
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
    tone.connect(toneFilter).connect(toneGain).connect(tonePanner).connect(this.ambience);
    if (this.registerContinuousVoice(tone, this.ambience, 1, 'arena', [toneFilter, toneGain, tonePanner])) {
      tone.start(now);
      this.arenaSources.push(tone);
      this.arenaNodes.push(toneFilter, toneGain, tonePanner);
    } else {
      toneFilter.disconnect();
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
    if (!this.context || !destination || cues.length === 0) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    gain.gain.value = 0.0001;
    oscillator.connect(gain).connect(destination);
    let stopAt = now;
    for (const cue of cues) {
      const start = now + Math.max(0, cue.delay);
      const duration = Math.max(0.008, cue.duration);
      const end = start + duration;
      const attackEnd = start + Math.min(0.008, duration * 0.25);
      oscillator.frequency.setValueAtTime(Math.max(1, cue.startFrequency), start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, cue.endFrequency), end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, cue.volume), attackEnd);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      stopAt = Math.max(stopAt, end);
    }
    if (!this.registerVoice(oscillator, destination, 4)) {
      gain.disconnect();
      return;
    }
    const voiceEnded = oscillator.onended;
    oscillator.onended = (event) => {
      voiceEnded?.call(oscillator, event);
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(stopAt + 0.005);
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    const length = Math.floor(this.context!.sampleRate * duration);
    const buffer = this.context!.createBuffer(1, length, this.context!.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = presentationRandom() * 2 - 1;
      previous = previous * 0.16 + white * 0.84;
      data[index] = previous;
    }
    return buffer;
  }

  private noise(options: NoiseOptions, destination: AudioNode | null): void {
    if (!this.context || !this.noiseBuffer || !destination) return;
    const now = this.context.currentTime + (options.delay ?? 0);
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = options.filter;
    filter.frequency.value = options.frequency;
    filter.Q.value = options.q ?? 0.7;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, options.volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    source.connect(filter).connect(gain).connect(destination);
    if (!this.registerVoice(source, destination, 3)) {
      filter.disconnect();
      gain.disconnect();
      return;
    }
    const voiceEnded = source.onended;
    source.onended = (event) => {
      voiceEnded?.call(source, event);
      filter.disconnect();
      gain.disconnect();
    };
    source.start(now, presentationRandom() * Math.max(0.001, this.noiseBuffer.duration - options.duration), options.duration);
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
  ): void {
    if (!this.context || !destination) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(destination);
    if (!this.registerVoice(oscillator, destination, 3)) {
      gain.disconnect();
      return;
    }
    const voiceEnded = oscillator.onended;
    oscillator.onended = (event) => {
      voiceEnded?.call(oscillator, event);
      gain.disconnect();
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
  ): void {
    this.sweep(frequency, Math.max(1, frequency * 0.91), duration, volume, type, destination, delay);
  }
}
