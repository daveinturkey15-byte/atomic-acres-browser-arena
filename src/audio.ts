import { combatConfirmEnvelope, type FootstepSurface, type ImpactSurface } from './combat-feedback';
import type { ArenaZone } from './arena-storytelling';
import type { WeaponActionEvent } from './weapon-actions';
import type { WeaponId } from './protocol';
import { presentationRandom } from './runtime-random';

export const SANCTIFIED_FRAG_CHOIR_ASSET = './assets/original/audio/sanctified-frag-hallelujah.wav';
export const EXPLOSION_AUDIO_COALESCE_MS = 90;

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

type SanctifiedFragChoirStatus = 'idle' | 'loading' | 'fetched' | 'decoding' | 'ready' | 'error';

type NoiseOptions = {
  duration: number;
  volume: number;
  filter: BiquadFilterType;
  frequency: number;
  q?: number;
  delay?: number;
};

/** Layered, original procedural arena mix. No sampled or proprietary game audio is used. */
export class ArenaAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private weapons: GainNode | null = null;
  private feedback: GainNode | null = null;
  private movement: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private stepVariant = 0;
  private ambienceStarted = false;
  private lastNearMissAt = -10_000;
  private arenaZone: ArenaZone | null = null;
  private lastZoneCueAt = -10_000;
  private sanctifiedChoirBytes: ArrayBuffer | null = null;
  private sanctifiedChoirBuffer: AudioBuffer | null = null;
  private sanctifiedChoirLoadPromise: Promise<void> | null = null;
  private sanctifiedChoirDecodePromise: Promise<void> | null = null;
  private sanctifiedChoirStatus: SanctifiedFragChoirStatus = 'idle';
  private sanctifiedChoirPrewarming = false;
  private sanctifiedChoirPrewarmed = false;
  private sanctifiedChoirPlays = 0;
  private explosionAudioGate = createExplosionAudioGate();

  preloadSanctifiedFragChoir(): Promise<void> {
    if (this.sanctifiedChoirLoadPromise) return this.sanctifiedChoirLoadPromise;
    this.sanctifiedChoirStatus = 'loading';
    this.sanctifiedChoirLoadPromise = fetch(SANCTIFIED_FRAG_CHOIR_ASSET)
      .then((response) => {
        if (!response.ok) throw new Error(`Sanctified Frag choir HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => {
        this.sanctifiedChoirBytes = bytes;
        this.sanctifiedChoirStatus = 'fetched';
        if (this.context) void this.decodeSanctifiedFragChoir();
      })
      .catch((error: unknown) => {
        this.sanctifiedChoirStatus = 'error';
        console.warn('Sanctified Frag choir unavailable; explosion remains functional.', error);
      });
    return this.sanctifiedChoirLoadPromise;
  }

  private decodeSanctifiedFragChoir(): Promise<void> {
    if (this.sanctifiedChoirBuffer || !this.context || !this.sanctifiedChoirBytes) return Promise.resolve();
    if (this.sanctifiedChoirDecodePromise) return this.sanctifiedChoirDecodePromise;
    this.sanctifiedChoirStatus = 'decoding';
    this.sanctifiedChoirDecodePromise = this.context.decodeAudioData(this.sanctifiedChoirBytes.slice(0))
      .then((buffer) => {
        this.sanctifiedChoirBuffer = buffer;
        this.sanctifiedChoirStatus = 'ready';
        this.prewarmSanctifiedFragChoir();
      })
      .catch((error: unknown) => {
        this.sanctifiedChoirStatus = 'error';
        console.warn('Sanctified Frag choir could not be decoded; explosion remains functional.', error);
      });
    return this.sanctifiedChoirDecodePromise;
  }

  private prewarmSanctifiedFragChoir(): void {
    if (this.sanctifiedChoirPrewarmed || this.sanctifiedChoirPrewarming || !this.context || !this.feedback || !this.sanctifiedChoirBuffer) return;
    this.sanctifiedChoirPrewarming = true;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.sanctifiedChoirBuffer;
    gain.gain.value = 0.0001;
    source.connect(gain).connect(this.feedback);
    source.onended = () => {
      this.sanctifiedChoirPrewarming = false;
      this.sanctifiedChoirPrewarmed = true;
    };
    source.start(this.context.currentTime);
    source.stop(this.context.currentTime + 0.08);
  }

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 8;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.18;
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(compressor).connect(this.context.destination);
      this.weapons = this.createBus(0.78);
      this.feedback = this.createBus(0.5);
      this.movement = this.createBus(0.34);
      this.ambience = this.createBus(0.16);
      this.noiseBuffer = this.createNoiseBuffer(1.2);
      this.startAmbience();
    }
    if (this.context.state === 'suspended') void this.context.resume();
    void this.preloadSanctifiedFragChoir().then(() => this.decodeSanctifiedFragChoir());
  }

  private startAmbience(): void {
    if (this.ambienceStarted || !this.context || !this.ambience || !this.noiseBuffer) return;
    this.ambienceStarted = true;
    const wind = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    wind.loopStart = 0.1;
    wind.loopEnd = 1.1;
    filter.type = 'bandpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.45;
    gain.gain.value = 0.055;
    wind.connect(filter).connect(gain).connect(this.ambience);
    wind.start();
    const electrical = this.context.createOscillator();
    const electricalGain = this.context.createGain();
    electrical.type = 'sine';
    electrical.frequency.value = 58;
    electricalGain.gain.value = 0.012;
    electrical.connect(electricalGain).connect(this.ambience);
    electrical.start();
  }

  setArenaZone(zone: ArenaZone): void {
    if (!this.context || !this.ambience) {
      this.arenaZone = null;
      return;
    }
    if (zone === this.arenaZone) return;
    this.arenaZone = zone;
    const level = zone === 'central-transit' ? 0.2 : zone === 'east-service' ? 0.18 : zone === 'west-garden' ? 0.145 : 0.16;
    this.ambience.gain.cancelScheduledValues(this.context.currentTime);
    this.ambience.gain.linearRampToValueAtTime(level, this.context.currentTime + 0.45);
    const now = performance.now();
    if (now - this.lastZoneCueAt < 1_200) return;
    this.lastZoneCueAt = now;
    const frequency = zone === 'east-service' ? 720 : zone === 'west-garden' ? 330 : zone === 'central-transit' ? 510 : 420;
    this.tone(frequency, 0.12, 0.018, 'sine', this.ambience);
    this.tone(frequency * 1.5, 0.08, 0.012, 'triangle', this.ambience, 0.09);
  }

  shot(weapon: WeaponId, remote = false, distance = 0): void {
    this.unlock();
    if (!this.context || !this.weapons) return;
    const attenuation = remote ? Math.max(0.08, 0.55 * (1 - Math.min(1, distance / 80))) : 1;
    const profile = weapon === 'scattergun'
      ? { body: 78, bodyEnd: 34, duration: 0.22, crack: 1120, noise: 0.34, lowpass: 1900, tail: 410, tailDuration: 0.3 }
      : weapon === 'sniper'
        ? { body: 62, bodyEnd: 24, duration: 0.26, crack: 2920, noise: 0.3, lowpass: 2400, tail: 330, tailDuration: 0.42 }
      : weapon === 'smg'
        ? { body: 156, bodyEnd: 68, duration: 0.085, crack: 2100, noise: 0.16, lowpass: 3600, tail: 760, tailDuration: 0.12 }
        : weapon === 'machine-pistol'
          ? { body: 168, bodyEnd: 72, duration: 0.078, crack: 2280, noise: 0.14, lowpass: 3900, tail: 720, tailDuration: 0.1 }
          : weapon === 'pistol'
            ? { body: 182, bodyEnd: 76, duration: 0.105, crack: 2380, noise: 0.18, lowpass: 4100, tail: 690, tailDuration: 0.14 }
            : { body: 116, bodyEnd: 46, duration: 0.13, crack: 1750, noise: 0.23, lowpass: 2900, tail: 560, tailDuration: 0.19 };

    this.sweep(profile.body, profile.bodyEnd, profile.duration, 0.22 * attenuation, 'sawtooth', this.weapons);
    this.sweep(profile.crack, profile.crack * 0.38, 0.035, 0.075 * attenuation, 'square', this.weapons);
    this.noise({
      duration: profile.duration,
      volume: profile.noise * attenuation,
      filter: 'lowpass',
      frequency: profile.lowpass,
      q: 0.7,
    }, this.weapons);
    this.noise({
      duration: 0.028,
      volume: 0.17 * attenuation,
      filter: 'highpass',
      frequency: weapon === 'scattergun' ? 1400 : weapon === 'sniper' ? 1250 : 2400,
      q: 0.4,
    }, this.weapons);
    this.noise({
      duration: profile.tailDuration,
      volume: (remote ? 0.055 : 0.082) * attenuation,
      filter: 'bandpass',
      frequency: profile.tail,
      q: 0.48,
      delay: 0.025,
    }, this.ambience);
    if (weapon === 'carbine') {
      // Original M86 pressure and yard-reflection layers; short enough to stay readable at full RPM.
      this.sweep(74, 38, 0.16, 0.052 * attenuation, 'triangle', this.weapons, 0.008);
      this.noise({ duration: 0.14, volume: 0.046 * attenuation, filter: 'bandpass', frequency: 830, q: 0.62, delay: 0.058 }, this.ambience);
      if (!remote) this.noise({ duration: 0.022, volume: 0.046, filter: 'highpass', frequency: 4200, q: 0.55, delay: 0.043 }, this.feedback);
    }

    if (!remote) {
      const mechanismDelay = weapon === 'scattergun' ? 0.21 : weapon === 'sniper' ? 0.62 : 0.055;
      this.tone(weapon === 'scattergun' ? 340 : weapon === 'sniper' ? 290 : 520, 0.028, 0.038, 'square', this.feedback, mechanismDelay);
      this.tone(weapon === 'smg' ? 680 : 430, 0.018, 0.022, 'triangle', this.feedback, mechanismDelay + 0.025);
    }
  }

  hit(headshot = false): void {
    const cue = combatConfirmEnvelope(headshot ? 'head' : 'body');
    this.tone(cue.frequencyHz[0], 0.045, headshot ? 0.11 : 0.075, 'sine', this.feedback);
    this.tone(cue.frequencyHz[1], 0.028, headshot ? 0.07 : 0.035, 'triangle', this.feedback, 0.018);
  }

  kill(): void {
    const cue = combatConfirmEnvelope('kill');
    this.tone(cue.frequencyHz[0], 0.06, 0.055, 'triangle', this.feedback);
    this.tone(cue.frequencyHz[1], 0.075, 0.07, 'sine', this.feedback, 0.045);
    this.tone(cue.frequencyHz[2], 0.09, 0.075, 'sine', this.feedback, 0.095);
  }

  damage(): void {
    this.noise({ duration: 0.11, volume: 0.075, filter: 'bandpass', frequency: 520, q: 1.2 }, this.feedback);
    this.sweep(110, 72, 0.14, 0.055, 'sine', this.feedback);
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
    this.noise({ duration: 0.13, volume: 0.08, filter: 'bandpass', frequency: 460, q: 0.7 }, this.feedback);
    this.sweep(135, 62, 0.11, 0.075, 'sawtooth', this.feedback);
  }

  footstep(surface: FootstepSurface, sprinting = false, crouched = false): void {
    this.stepVariant = (this.stepVariant + 1) % 4;
    const variation = [0.94, 1.04, 0.98, 1.08][this.stepVariant];
    const base = (sprinting ? 82 : crouched ? 54 : 68) * variation;
    const profile = surface === 'asphalt'
      ? { frequency: 1_050, tone: 72, volume: 1 }
      : surface === 'concrete'
        ? { frequency: 1_420, tone: 86, volume: 0.94 }
        : surface === 'wood'
          ? { frequency: 720, tone: 118, volume: 0.9 }
          : { frequency: 430, tone: 48, volume: 0.78 };
    this.noise({
      duration: sprinting ? 0.075 : 0.055,
      volume: (crouched ? 0.022 : sprinting ? 0.052 : 0.034) * profile.volume,
      filter: surface === 'soil' ? 'lowpass' : 'bandpass',
      frequency: profile.frequency,
      q: surface === 'concrete' ? 1.15 : 0.72,
    }, this.movement);
    this.sweep(base + profile.tone * 0.2, Math.max(32, profile.tone * 0.48), sprinting ? 0.075 : 0.06, crouched ? 0.018 : 0.034, 'triangle', this.movement);
    if (surface === 'wood') this.tone(profile.tone, 0.035, crouched ? 0.012 : 0.022, 'square', this.movement, 0.018);
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

  sanctifiedFragExplosion(): void {
    this.explosion();
    const play = () => {
      if (!this.context || !this.feedback || !this.sanctifiedChoirBuffer) return;
      const now = this.context.currentTime + 0.045;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = this.sanctifiedChoirBuffer;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.72, now + 0.065);
      gain.gain.setValueAtTime(0.56, now + Math.min(0.55, source.buffer.duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + source.buffer.duration);
      source.connect(gain).connect(this.feedback);
      source.start(now);
      source.stop(now + source.buffer.duration);
      this.sanctifiedChoirPlays += 1;
    };
    if (this.sanctifiedChoirBuffer) play();
    else void this.decodeSanctifiedFragChoir().then(play);
  }

  explosion(now = performance.now()): boolean {
    const admission = admitExplosionAudioMix(this.explosionAudioGate, now);
    this.explosionAudioGate = admission.state;
    if (!admission.admitted) return false;
    this.unlock();
    if (!this.weapons) return true;
    this.sweep(96, 24, 0.58, 0.29, 'sawtooth', this.weapons);
    this.noise({ duration: 0.64, volume: 0.42, filter: 'lowpass', frequency: 2100, q: 0.5 }, this.weapons);
    this.noise({ duration: 0.18, volume: 0.12, filter: 'highpass', frequency: 3100, q: 0.4, delay: 0.035 }, this.weapons);
    return true;
  }

  hunterLaunch(index: number): void {
    this.unlock();
    const offset = Math.max(0, Math.min(4, Math.floor(index))) * 0.045;
    this.sweep(1_180 + index * 45, 230, 0.42, 0.052, 'sawtooth', this.feedback, offset);
    this.noise({ duration: 0.24, volume: 0.044, filter: 'bandpass', frequency: 1_600, q: 0.85, delay: offset }, this.ambience);
  }

  overdrivePickup(): void {
    this.unlock();
    this.sweep(180, 920, 0.42, 0.095, 'sawtooth', this.feedback);
    this.tone(440, 0.2, 0.055, 'square', this.feedback, 0.08);
    this.tone(660, 0.28, 0.05, 'triangle', this.feedback, 0.18);
    this.tone(880, 0.34, 0.042, 'sine', this.ambience, 0.26);
  }

  overdriveAvailable(): void {
    this.unlock();
    this.tone(330, 0.16, 0.04, 'square', this.feedback);
    this.tone(495, 0.2, 0.05, 'triangle', this.feedback, 0.12);
    this.tone(660, 0.3, 0.06, 'sine', this.ambience, 0.25);
    this.noise({ duration: 0.32, volume: 0.035, filter: 'bandpass', frequency: 1_850, q: 0.9, delay: 0.05 }, this.feedback);
  }

  overdriveExpire(): void {
    this.unlock();
    this.sweep(720, 140, 0.34, 0.055, 'triangle', this.feedback);
    this.tone(110, 0.22, 0.035, 'sine', this.ambience, 0.12);
  }

  nukeWarning(): void {
    this.unlock();
    for (let pulse = 0; pulse < 5; pulse += 1) {
      const delay = pulse;
      this.sweep(210 + pulse * 18, 96, 0.64, 0.075 + pulse * 0.008, 'sawtooth', this.feedback, delay);
      this.tone(680 + pulse * 90, 0.12, 0.045, 'square', this.feedback, delay + 0.68);
    }
    this.sweep(42, 148, 4.85, 0.055, 'triangle', this.ambience, 0.05);
  }

  nukeDetonation(): void {
    this.unlock();
    this.sweep(72, 14, 1.15, 0.36, 'sawtooth', this.weapons);
    this.sweep(34, 9, 2.6, 0.27, 'triangle', this.ambience, 0.04);
    this.noise({ duration: 1.05, volume: 0.46, filter: 'lowpass', frequency: 1_250, q: 0.45 }, this.weapons);
    this.noise({ duration: 0.34, volume: 0.2, filter: 'highpass', frequency: 3_600, q: 0.35, delay: 0.028 }, this.feedback);
    this.noise({ duration: 1.05, volume: 0.16, filter: 'bandpass', frequency: 280, q: 0.52, delay: 0.9 }, this.ambience);
  }

  telemetry(): {
    explosionMix: ExplosionAudioGate & { coalesceMs: number };
    sanctifiedFragChoir: {
      asset: string;
      status: SanctifiedFragChoirStatus;
      ready: boolean;
      prewarmed: boolean;
      byteLength: number;
      durationSeconds: number;
      plays: number;
    };
  } {
    return {
      explosionMix: { ...this.explosionAudioGate, coalesceMs: EXPLOSION_AUDIO_COALESCE_MS },
      sanctifiedFragChoir: {
        asset: SANCTIFIED_FRAG_CHOIR_ASSET,
        status: this.sanctifiedChoirStatus,
        ready: this.sanctifiedChoirBuffer !== null,
        prewarmed: this.sanctifiedChoirPrewarmed,
        byteLength: this.sanctifiedChoirBytes?.byteLength ?? 0,
        durationSeconds: this.sanctifiedChoirBuffer?.duration ?? 0,
        plays: this.sanctifiedChoirPlays,
      },
    };
  }

  private createBus(gainValue: number): GainNode {
    const bus = this.context!.createGain();
    bus.gain.value = gainValue;
    bus.connect(this.master!);
    return bus;
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
    this.unlock();
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
    source.start(now, presentationRandom() * Math.max(0.001, this.noiseBuffer.duration - options.duration), options.duration);
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
    this.unlock();
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
