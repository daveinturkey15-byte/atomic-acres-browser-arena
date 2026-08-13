import { describe, expect, it } from 'vitest';
import { analyzeAudioOutput, boundedAudioEvidenceSamples } from './audio';

function tone(samples: number, frequency: number, sampleRate: number, gain: number): Float32Array {
  return Float32Array.from({ length: samples }, (_, index) => gain * Math.sin(index / sampleRate * frequency * Math.PI * 2));
}

function spectrum(length: number, baselineDb: number, peaks: Readonly<Record<number, number>> = {}): Float32Array {
  return Float32Array.from({ length }, (_, index) => peaks[index] ?? baselineDb);
}

describe('final audio output probe', () => {
  it('separates a narrow tonal carrier from broadband hiss', () => {
    const result = analyzeAudioOutput(
      tone(2_048, 120, 48_000, 0.01),
      spectrum(1_024, -100, { 5: -35, 10: -48, 15: -60 }),
      48_000,
    );
    expect(result).toMatchObject({
      available: true,
      sampleRate: 48_000,
      fftSize: 2_048,
      narrowbandTonePresent: true,
      suspiciousBroadbandHiss: false,
    });
    expect(result.rms).toBeGreaterThan(0);
    expect(result.spectralFlatness).toBeLessThan(0.2);
    expect(result.highFrequencyEnergyRatio).toBeLessThan(0.1);
    expect(result.dominantPowerRatio).toBeGreaterThan(0.5);
    expect(result.logBandsDb).toHaveLength(16);
    expect(result.timeDomainSamples).toHaveLength(16);
  });

  it('rejects a persistent broadband high-frequency signal', () => {
    let state = 0x1234abcd;
    const noise = Float32Array.from({ length: 2_048 }, () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 0xffffffff * 2 - 1) * 0.02;
    });
    const result = analyzeAudioOutput(noise, spectrum(1_024, -42), 48_000);
    expect(result.suspiciousBroadbandHiss).toBe(true);
    expect(result.narrowbandTonePresent).toBe(false);
    expect(result.spectralFlatness).toBeGreaterThan(0.9);
    expect(result.highFrequencyEnergyRatio).toBeGreaterThan(0.5);
  });

  it('fails safely when no analyser samples exist', () => {
    expect(analyzeAudioOutput(new Float32Array(), new Float32Array(), 0)).toEqual({
      available: false,
      sampleRate: 0,
      fftSize: 0,
      rms: 0,
      peak: 0,
      crestFactor: 0,
      spectralFlatness: 0,
      highFrequencyEnergyRatio: 0,
      dominantFrequencyHz: 0,
      dominantPowerRatio: 0,
      narrowbandTonePresent: false,
      suspiciousBroadbandHiss: false,
      logBandsDb: [],
      timeDomainSamples: [],
    });
  });

  it('bounds and deterministically downsamples retained evidence', () => {
    const evidence = boundedAudioEvidenceSamples(
      Float32Array.from({ length: 32 }, (_, index) => index === 0 ? Number.NaN : (index - 16) / 8),
      Float32Array.from({ length: 32 }, (_, index) => index === 0 ? Number.POSITIVE_INFINITY : -140 + index * 6),
    );
    expect(evidence.timeDomainSamples).toHaveLength(16);
    expect(evidence.logBandsDb).toHaveLength(16);
    expect(evidence.timeDomainSamples.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
    expect(evidence.logBandsDb.every((sample) => sample >= -120 && sample <= 0)).toBe(true);
    expect(evidence.timeDomainSamples[0]).toBe(-1);
    expect(evidence.logBandsDb[0]).toBe(-120);
    expect(Object.isFrozen(evidence.logBandsDb)).toBe(true);
    expect(Object.isFrozen(evidence.timeDomainSamples)).toBe(true);
  });
});
