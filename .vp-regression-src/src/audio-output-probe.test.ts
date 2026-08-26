import { describe, expect, it } from 'vitest';
import { analyzeAudioOutput } from './audio';

function tone(samples: number, frequency: number, sampleRate: number, gain: number): Float32Array {
  return Float32Array.from({ length: samples }, (_, index) => gain * Math.sin(index / sampleRate * frequency * Math.PI * 2));
}

function spectrum(length: number, baselineDb: number, peaks: Readonly<Record<number, number>> = {}): Float32Array {
  return Float32Array.from({ length }, (_, index) => peaks[index] ?? baselineDb);
}

describe('final audio output probe', () => {
  it('classifies a bounded tonal arena bed as non-broadband', () => {
    const result = analyzeAudioOutput(
      tone(2_048, 120, 48_000, 0.01),
      spectrum(1_024, -100, { 5: -35, 10: -48, 15: -60 }),
      48_000,
    );
    expect(result).toMatchObject({ available: true, sampleRate: 48_000, fftSize: 2_048, suspiciousBroadbandHiss: false });
    expect(result.rms).toBeGreaterThan(0);
    expect(result.spectralFlatness).toBeLessThan(0.2);
    expect(result.highFrequencyEnergyRatio).toBeLessThan(0.1);
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
      suspiciousBroadbandHiss: false,
    });
  });
});
