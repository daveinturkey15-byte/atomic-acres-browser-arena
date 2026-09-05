import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaAudio } from './audio';
import {
  REVERB_ZONE_PROFILES,
  WORLD_PANNER_PROFILE,
  WORLD_SOUND_ATTENUATION,
  WORLD_SOUND_FAMILIES,
  reverbZoneProfile,
  worldSoundAttenuation,
} from './audio-world-positional';
import { AUDIO_RUNTIME_BUDGET, spatialPan } from './spatial-audio';
import { FakeAudioContext, type FakeGainNode, type FakePannerNode } from './audio-test-fake-context';

/**
 * PASS 95 audio-polish, HF-509: every world sound is positioned, attenuated
 * by a documented per-family curve, and routed through a pooled pan-only
 * panner into the sfx bus - with nothing allocated on the combat path.
 */
describe('world-sound attenuation (pure)', () => {
  it('is 1 in the near field, strictly non-increasing, and exactly 0 at the family range', () => {
    for (const family of WORLD_SOUND_FAMILIES) {
      const profile = WORLD_SOUND_ATTENUATION[family];
      expect(worldSoundAttenuation(0, family)).toBe(1);
      expect(worldSoundAttenuation(profile.refDistanceM, family)).toBe(1);
      let previous = 1;
      for (let distance = 0; distance <= profile.maxDistanceM + 5; distance += 0.5) {
        const value = worldSoundAttenuation(distance, family);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(previous + 1e-9);
        previous = value;
      }
      expect(worldSoundAttenuation(profile.maxDistanceM, family)).toBe(0);
      expect(worldSoundAttenuation(profile.maxDistanceM * 2, family)).toBe(0);
      expect(worldSoundAttenuation(Number.NaN, family)).toBe(1);
      expect(worldSoundAttenuation(-5, family)).toBe(1);
    }
  });

  it('carries a rifle report across the whole of Nuke Town but not a footstep', () => {
    // Nuke Town's street is 36 m end to end (NUKETOWN2_STREET_LENGTH).
    expect(worldSoundAttenuation(36, 'weapon-report')).toBeGreaterThan(0.1);
    expect(worldSoundAttenuation(36, 'footstep')).toBe(0);
    expect(worldSoundAttenuation(10, 'footstep')).toBeGreaterThan(0);
    expect(worldSoundAttenuation(10, 'footstep')).toBeLessThan(worldSoundAttenuation(10, 'weapon-report'));
  });

  it('pans a source on the listener right positive and left negative, and dead ahead to centre', () => {
    const listener = { x: 0, y: 1.7, z: 0 };
    expect(spatialPan(listener, 0, { x: 5, y: 1.7, z: 0 })).toBeGreaterThan(0.9);
    expect(spatialPan(listener, 0, { x: -5, y: 1.7, z: 0 })).toBeLessThan(-0.9);
    expect(Math.abs(spatialPan(listener, 0, { x: 0, y: 1.7, z: -5 }))).toBeLessThan(1e-6);
  });

  it('makes the panner pan-only so the code curve is the only attenuation', () => {
    expect(WORLD_PANNER_PROFILE.rolloffFactor).toBe(0);
    expect(WORLD_PANNER_PROFILE.panningModel).toBe('HRTF');
    expect(WORLD_PANNER_PROFILE.holdMs).toBeGreaterThan(0);
  });

  it('gives interiors a shorter, denser, louder return than the street, and open ground almost none', () => {
    const room = reverbZoneProfile('interior-room');
    const street = reverbZoneProfile('urban-yard');
    const field = reverbZoneProfile('open-field');
    expect(room.earlyDelaySeconds).toBeLessThan(street.earlyDelaySeconds);
    expect(room.returnGain).toBeGreaterThan(street.returnGain);
    expect(room.feedback).toBeGreaterThan(street.feedback);
    expect(field.returnGain).toBeLessThan(street.returnGain);
    for (const profile of Object.values(REVERB_ZONE_PROFILES)) {
      expect(profile.feedback).toBeLessThan(0.6);
      expect(profile.returnGain).toBeLessThan(0.3);
    }
  });
});

describe('ArenaAudio world positioning (headless graph)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeAudioContext.instances.length = 0;
  });

  function boot(): { audio: ArenaAudio; context: FakeAudioContext; sfxBus: FakeGainNode } {
    const audio = new ArenaAudio();
    audio.setArena('nuketown2');
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const sfxBus = context.gains.find((gain) => Math.abs(gain.gain.value - 0.78) < 1e-9)!;
    expect(sfxBus).toBeDefined();
    return { audio, context, sfxBus };
  }

  it('pre-creates the whole panner pool before combat and creates nothing during a firefight', () => {
    const { audio, context, sfxBus } = boot();
    expect(audio.worldPannerTelemetry()).toMatchObject({ pooled: AUDIO_RUNTIME_BUDGET.spatialVoices, busy: 0 });
    const worldPanners = context.panners.filter((panner) => panner.outputs.includes(sfxBus));
    expect(worldPanners).toHaveLength(AUDIO_RUNTIME_BUDGET.spatialVoices);
    for (const panner of worldPanners) {
      expect(panner.rolloffFactor).toBe(0);
      expect(panner.panningModel).toBe('HRTF');
    }
    const before = context.allocations();
    audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
    for (let shot = 0; shot < 40; shot += 1) {
      const emitter = { x: 6 + shot, y: 1.5, z: -4 };
      audio.shot('m4a1', true, Math.hypot(emitter.x, emitter.z), emitter);
      audio.impact('concrete', 12, { x: 3, y: 0, z: 9 });
      audio.coverImpact(8, { x: -3, y: 0, z: 2 });
      audio.vehicleHit(14, { x: 10, y: 1, z: 0 });
      audio.shedDoorMotion(9, { x: 0, y: 1, z: 12 });
      audio.glassShatter(6, { x: -5, y: 2, z: -3 });
      audio.worldFootstep({ x: 4, y: 0, z: 4 }, 'concrete', 'sprint');
      vi.advanceTimersByTime(90);
    }
    const after = context.allocations();
    expect(after.panners).toBe(before.panners);
    expect(after.buffers).toBe(before.buffers);
    expect(after.decodes).toBe(0);
    expect(audio.worldPannerTelemetry().acquisitions).toBeGreaterThan(0);
    audio.dispose();
  });

  it('routes a remote report through a pooled panner at the emitter, into the sfx bus, and releases it', () => {
    const { audio, context, sfxBus } = boot();
    audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
    const emitter = { x: 9, y: 1.4, z: -12 };
    const buffersBefore = context.bufferSources.length;
    const oscillatorsBefore = context.oscillators.length;
    audio.shot('ak-47', true, 15, emitter);
    const telemetry = audio.worldPannerTelemetry();
    expect(telemetry.busy).toBe(1);
    const busy = context.panners.find((panner) => panner.positionX.value === emitter.x) as FakePannerNode | undefined;
    expect(busy).toBeDefined();
    expect(busy!.positionY.value).toBe(emitter.y);
    expect(busy!.positionZ.value).toBe(emitter.z);
    expect(busy!.reaches(sfxBus)).toBe(true);
    // The direct layers of the report land on the panner, not on the dry bus.
    const newSources = [...context.bufferSources.slice(buffersBefore), ...context.oscillators.slice(oscillatorsBefore)];
    expect(newSources.length).toBeGreaterThan(3);
    const positioned = newSources.filter((source) => source.reaches(busy!));
    expect(positioned.length).toBeGreaterThanOrEqual(4);
    vi.advanceTimersByTime(WORLD_PANNER_PROFILE.holdMs + 5);
    expect(audio.worldPannerTelemetry()).toMatchObject({ busy: 0, spatialChains: 0 });
    audio.dispose();
  });

  it('schedules a quieter report the further away the shooter is, and none beyond the family range', () => {
    const { audio, context } = boot();
    audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
    const peakFor = (distance: number): number => {
      const gainsBefore = context.gains.length;
      const sourcesBefore = context.bufferSources.length + context.oscillators.length;
      audio.shot('m4a1', true, distance, { x: 0, y: 1.5, z: -distance });
      const newSources = context.bufferSources.length + context.oscillators.length - sourcesBefore;
      if (newSources === 0) return 0;
      return Math.max(...context.gains.slice(gainsBefore).map((gain) => gain.gain.peak));
    };
    const near = peakFor(4);
    vi.advanceTimersByTime(600);
    const mid = peakFor(30);
    vi.advanceTimersByTime(600);
    const far = peakFor(90);
    vi.advanceTimersByTime(600);
    const gone = peakFor(WORLD_SOUND_ATTENUATION['weapon-report'].maxDistanceM + 1);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(gone).toBe(0);
    audio.dispose();
  });

  it('never exceeds the spatial budget: the thirteenth simultaneous world sound is dropped, not allocated', () => {
    const { audio, context } = boot();
    audio.updateListener({ x: 0, y: 1.7, z: 0 }, 0);
    const before = context.allocations();
    for (let index = 0; index < AUDIO_RUNTIME_BUDGET.spatialVoices + 3; index += 1) {
      audio.impact('metal', 5, { x: index, y: 0, z: 5 });
    }
    const telemetry = audio.worldPannerTelemetry();
    expect(telemetry.busy).toBe(AUDIO_RUNTIME_BUDGET.spatialVoices);
    expect(telemetry.spatialChains).toBeLessThanOrEqual(AUDIO_RUNTIME_BUDGET.spatialVoices);
    expect(context.allocations().panners).toBe(before.panners);
    audio.dispose();
  });

  it('keeps the local player report dry (no panner) so the first-person weapon is unchanged', () => {
    const { audio } = boot();
    audio.shot('m4a1');
    expect(audio.worldPannerTelemetry().busy).toBe(0);
    audio.dispose();
  });
});
