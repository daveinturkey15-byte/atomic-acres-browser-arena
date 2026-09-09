import { describe, expect, it } from 'vitest';
import {
  METALLIC_PARTIAL_RATIOS,
  NOISE_TEXTURES,
  centsToRatio,
  fillNoiseTexture,
  pitchFallStages,
  roundRobinDetune,
  saturationCurve,
  transientEnvelope,
  type NoiseTexture,
} from './audio-synthesis';

/**
 * Deterministic uniform source. The textures must be assertable, and a real RNG
 * would make a spectral-slope assertion flaky at the sample counts a unit test
 * can afford.
 */
function seededRandom(seed = 1): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4_294_967_296;
  };
}

/**
 * Mean absolute first difference. A cheap, robust proxy for spectral centroid:
 * a bright texture changes a lot between adjacent samples, a dark one barely
 * changes. Both textures are peak-normalised, so the comparison is fair.
 */
function roughness(data: Float32Array): number {
  let total = 0;
  for (let index = 1; index < data.length; index += 1) total += Math.abs(data[index]! - data[index - 1]!);
  return total / (data.length - 1);
}

function texture(name: NoiseTexture, length = 8_192): Float32Array {
  const data = new Float32Array(length);
  fillNoiseTexture(data, name, seededRandom(0x5eed));
  return data;
}

describe('HF-376 noise textures', () => {
  it('normalises every texture to just under full scale without producing silence or NaN', () => {
    for (const name of NOISE_TEXTURES) {
      const data = texture(name);
      const peak = data.reduce((best, value) => Math.max(best, Math.abs(value)), 0);
      expect(data.every((value) => Number.isFinite(value)), name).toBe(true);
      expect(peak, name).toBeCloseTo(0.98, 5);
    }
  });

  it('orders the textures by brightness so a caller can pick weight or air by name', () => {
    // This is the property the whole texture palette exists for: one shared
    // white buffer could not make an explosion heavy and a shell casing bright.
    expect(roughness(texture('brown'))).toBeLessThan(roughness(texture('pink')));
    expect(roughness(texture('pink'))).toBeLessThan(roughness(texture('white')));
  });

  it('makes crackle sparse and impulsive rather than continuous', () => {
    const crackle = texture('crackle');
    const white = texture('white');
    const quiet = (data: Float32Array): number => data.reduce(
      (count, value) => count + (Math.abs(value) < 0.02 ? 1 : 0),
      0,
    ) / data.length;
    // Debris and gravel are mostly gaps with grains in them; white noise is
    // almost never near zero.
    expect(quiet(crackle)).toBeGreaterThan(0.5);
    expect(quiet(white)).toBeLessThan(0.1);
  });

  it('leaves a zero-length buffer alone rather than dividing by a zero peak', () => {
    const empty = new Float32Array(0);
    expect(() => fillNoiseTexture(empty, 'brown', seededRandom())).not.toThrow();
    const silent = new Float32Array(16);
    fillNoiseTexture(silent, 'brown', () => 0.5);
    expect(silent.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe('HF-376 saturation curve', () => {
  it('stays monotonic and bounded at every drive, so it can never fold the signal', () => {
    for (const drive of [0, 0.25, 0.5, 0.85, 1, -3, Number.NaN]) {
      const curve = saturationCurve(drive, 257);
      expect(curve.every((value) => Number.isFinite(value) && value >= -1 && value <= 1), String(drive)).toBe(true);
      for (let index = 1; index < curve.length; index += 1) {
        expect(curve[index]! >= curve[index - 1]!, `${drive} at ${index}`).toBe(true);
      }
      expect(curve[0]).toBeCloseTo(-1, 6);
      expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
    }
  });

  it('compresses harder as drive rises, which is what adds harmonics and apparent loudness', () => {
    const midpointGain = (drive: number): number => {
      const curve = saturationCurve(drive, 1_001);
      // Value at x = +0.5 divided by the linear answer.
      return curve[750]! / 0.5;
    };
    expect(midpointGain(0)).toBeCloseTo(1, 3);
    expect(midpointGain(0.5)).toBeGreaterThan(midpointGain(0));
    expect(midpointGain(1)).toBeGreaterThan(midpointGain(0.5));
  });

  it('degrades a nonsense sample count to a usable curve instead of throwing', () => {
    expect(saturationCurve(0.5, 0)).toHaveLength(2);
    expect(saturationCurve(0.5, 1)).toHaveLength(2);
  });
});

describe('HF-376 transient envelope', () => {
  it('produces attack, collapse and decay with strictly increasing positive stages', () => {
    const stages = transientEnvelope({ peak: 0.4, durationSeconds: 0.2, punch: 0.3 });
    expect(stages).toHaveLength(4);
    for (let index = 1; index < stages.length; index += 1) {
      expect(stages[index]!.atSeconds).toBeGreaterThan(stages[index - 1]!.atSeconds);
    }
    expect(stages.every((stage) => stage.value > 0)).toBe(true);
    expect(stages[1]!.value).toBe(0.4);
    expect(stages[2]!.value).toBeCloseTo(0.12, 10);
    expect(stages[stages.length - 1]!.atSeconds).toBe(0.2);
  });

  it('never lets attack plus collapse consume the whole voice', () => {
    const stages = transientEnvelope({
      peak: 0.5, durationSeconds: 0.006, attackSeconds: 0.05, punch: 0.2, punchSeconds: 0.5,
    });
    for (let index = 1; index < stages.length; index += 1) {
      expect(stages[index]!.atSeconds).toBeGreaterThan(stages[index - 1]!.atSeconds);
      expect(stages[index]!.atSeconds).toBeLessThanOrEqual(0.006);
    }
  });

  it('reduces to the historical single exponential decay when punch is 1', () => {
    const stages = transientEnvelope({ peak: 0.3, durationSeconds: 0.1, punch: 1 });
    expect(stages).toHaveLength(3);
    expect(stages.map((stage) => stage.ramp)).toEqual(['linear', 'linear', 'exponential']);
  });

  it('always gives a non-zero attack, because a step onset is heard as a click', () => {
    const stages = transientEnvelope({ peak: 1, durationSeconds: 0.05, attackSeconds: 0 });
    expect(stages[1]!.atSeconds).toBeGreaterThan(0);
  });
});

describe('HF-376 pitch fall', () => {
  it('preserves both endpoints while spending most of the interval early', () => {
    const stages = pitchFallStages(120, 30, 0.2);
    expect(stages).toHaveLength(2);
    const [knee, end] = stages;
    expect(end!.hz).toBe(30);
    expect(end!.atSeconds).toBe(0.2);
    expect(knee!.hz).toBeLessThan(120);
    expect(knee!.hz).toBeGreaterThan(30);
    // The defining property: by a fifth of the duration the fall is already
    // more than half done in log-frequency terms.
    expect(knee!.atSeconds).toBeLessThan(0.2 * 0.25);
    const logFraction = Math.log(120 / knee!.hz) / Math.log(120 / 30);
    expect(logFraction).toBeGreaterThan(0.5);
  });

  it('handles rising sweeps and degenerate intervals without emitting a useless knee', () => {
    const rising = pitchFallStages(400, 1_600, 0.1);
    expect(rising[0]!.hz).toBeGreaterThan(400);
    expect(rising[0]!.hz).toBeLessThan(1_600);
    expect(rising[rising.length - 1]!.hz).toBe(1_600);
    expect(pitchFallStages(200, 200, 0.1)).toHaveLength(1);
    expect(pitchFallStages(Number.NaN, Number.NaN, Number.NaN)).toHaveLength(1);
  });
});

describe('HF-376 variation helpers', () => {
  it('never repeats a detune within a burst and stays inside the requested spread', () => {
    const values = Array.from({ length: 8 }, (_, index) => roundRobinDetune(index, 60));
    expect(new Set(values).size).toBe(8);
    expect(values.every((value) => Math.abs(value) <= 60)).toBe(true);
    expect(roundRobinDetune(-1, 60)).toBe(roundRobinDetune(7, 60));
    expect(centsToRatio(1_200)).toBeCloseTo(2, 10);
    expect(centsToRatio(Number.NaN)).toBe(1);
  });

  it('keeps metallic partials inharmonic so a struck plate is not heard as a note', () => {
    for (const ratio of METALLIC_PARTIAL_RATIOS.slice(1)) {
      expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.1);
    }
  });
});
