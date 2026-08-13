import { describe, expect, it } from 'vitest';
import {
  NUKE_WARNING_AUDIO_PROFILE,
  nukeWarningAudioCueProfile,
} from './audio';

describe('Pass 71 Nuke warning audio', () => {
  it('keeps the five-second warning layered, bounded and broadband-free', () => {
    const standard = nukeWarningAudioCueProfile(false);
    expect(standard.pressurePulses).toHaveLength(5);
    expect(standard.alarmPulses).toHaveLength(5);
    expect(NUKE_WARNING_AUDIO_PROFILE).toMatchObject({
      durationSeconds: 5,
      maximumScheduledVoices: 11,
      broadbandNoiseLayers: 0,
      maximumStandardLayerGain: 0.107,
    });
    expect(Math.max(
      ...standard.pressurePulses.map(({ volume }) => volume),
      ...standard.alarmPulses.map(({ volume }) => volume),
      standard.pressureBed.volume,
    )).toBeCloseTo(NUKE_WARNING_AUDIO_PROFILE.maximumStandardLayerGain, 10);
  });

  it('gives reduced sensory precedence without changing warning timing or pitch', () => {
    const standard = nukeWarningAudioCueProfile(false);
    const reduced = nukeWarningAudioCueProfile(true);
    expect(reduced.gainScale).toBe(NUKE_WARNING_AUDIO_PROFILE.reducedSensoryGainScale);
    expect(reduced.pressurePulses.map(({ delay }) => delay))
      .toEqual(standard.pressurePulses.map(({ delay }) => delay));
    expect(reduced.pressurePulses.map(({ startFrequency }) => startFrequency))
      .toEqual(standard.pressurePulses.map(({ startFrequency }) => startFrequency));
    expect(reduced.pressurePulses.map(({ volume }) => volume))
      .toEqual(standard.pressurePulses.map(({ volume }) => (
        volume * NUKE_WARNING_AUDIO_PROFILE.reducedSensoryGainScale
      )));
    expect(Math.max(
      ...reduced.pressurePulses.map(({ volume }) => volume),
      ...reduced.alarmPulses.map(({ volume }) => volume),
      reduced.pressureBed.volume,
    )).toBeCloseTo(NUKE_WARNING_AUDIO_PROFILE.maximumReducedLayerGain, 10);
  });
});
