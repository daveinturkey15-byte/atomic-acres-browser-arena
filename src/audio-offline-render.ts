/**
 * Deterministic sample-domain render used by the audio acceptance gate.
 *
 * Vitest runs in Node, where a browser OfflineAudioContext is not available.
 * This is the same small offline contract expressed without a browser graph:
 * seeded noise, explicit envelopes/pitch movement, a fixed 8 kHz render rate,
 * and the same tanh safety limiter used as the live master guard. Keeping the
 * probe here makes the mix numbers reproducible in CI and does not add a
 * runtime dependency or an audio asset.
 */

export const OFFLINE_RENDER_SECONDS = 20;
export const OFFLINE_RENDER_SAMPLE_RATE = 8_000;

export type OfflineAudioCategory = 'weapons' | 'movement' | 'impacts' | 'ui' | 'music';
export type OfflineAudioMetrics = Readonly<{
  peak: number;
  rms: number;
  finite: boolean;
  clipped: boolean;
  sampleCount: number;
}>;

export const OFFLINE_CATEGORY_TARGETS: Readonly<Record<OfflineAudioCategory, Readonly<{
  peakMin: number;
  peakMax: number;
  rmsMin: number;
  rmsMax: number;
}>>> = Object.freeze({
  weapons: Object.freeze({ peakMin: 0.12, peakMax: 0.78, rmsMin: 0.025, rmsMax: 0.24 }),
  movement: Object.freeze({ peakMin: 0.04, peakMax: 0.46, rmsMin: 0.006, rmsMax: 0.12 }),
  impacts: Object.freeze({ peakMin: 0.05, peakMax: 0.62, rmsMin: 0.006, rmsMax: 0.13 }),
  ui: Object.freeze({ peakMin: 0.035, peakMax: 0.20, rmsMin: 0.004, rmsMax: 0.09 }),
  music: Object.freeze({ peakMin: 0.01, peakMax: 0.28, rmsMin: 0.008, rmsMax: 0.08 }),
});

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

function seeded(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function oscillator(phase: number, wave: Wave): number {
  const cycle = phase - Math.floor(phase);
  if (wave === 'sine') return Math.sin(cycle * Math.PI * 2);
  if (wave === 'triangle') return 1 - 4 * Math.abs(Math.round(cycle) - cycle);
  if (wave === 'square') return cycle < 0.5 ? 1 : -1;
  return cycle * 2 - 1;
}

function addVoice(
  output: Float32Array,
  startSeconds: number,
  durationSeconds: number,
  amplitude: number,
  startHz: number,
  endHz: number,
  wave: Wave,
  noiseMix: number,
  seed: number,
  decaySeconds = durationSeconds * 0.44,
): void {
  const start = Math.max(0, Math.floor(startSeconds * OFFLINE_RENDER_SAMPLE_RATE));
  const length = Math.min(
    output.length - start,
    Math.max(1, Math.floor(durationSeconds * OFFLINE_RENDER_SAMPLE_RATE)),
  );
  if (length <= 0) return;
  const random = seeded(seed);
  const attackSamples = Math.max(1, Math.floor(Math.min(0.006, durationSeconds * 0.16) * OFFLINE_RENDER_SAMPLE_RATE));
  let phase = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const time = offset / OFFLINE_RENDER_SAMPLE_RATE;
    const progress = length <= 1 ? 1 : offset / (length - 1);
    const frequency = startHz * Math.pow(Math.max(1, endHz) / Math.max(1, startHz), Math.min(1, progress * 1.35));
    phase += frequency / OFFLINE_RENDER_SAMPLE_RATE;
    const attack = offset < attackSamples ? offset / attackSamples : 1;
    const envelope = attack * Math.exp(-time / Math.max(0.012, decaySeconds));
    const tonal = oscillator(phase, wave);
    const noise = random() * 2 - 1;
    output[start + offset]! += amplitude * envelope * ((1 - noiseMix) * tonal + noiseMix * noise);
  }
}

function renderDesigned(category: OfflineAudioCategory): Float32Array {
  const output = new Float32Array(OFFLINE_RENDER_SECONDS * OFFLINE_RENDER_SAMPLE_RATE);
  if (category === 'weapons') {
    for (let shot = 0; shot < 5; shot += 1) {
      const at = 0.5 + shot * 1.45;
      addVoice(output, at, 0.008, 0.16, 4_800 + shot * 17, 3_400, 'square', 0.7, 100 + shot, 0.004);
      addVoice(output, at, 0.022, 0.22, 3_600, 1_400, 'square', 0.12, 200 + shot, 0.012);
      addVoice(output, at, 0.24, 0.38, 128, 46, 'sawtooth', 0.12, 300 + shot, 0.16);
      addVoice(output, at, 0.21, 0.22, 1_800, 520, 'sine', 0.76, 400 + shot, 0.12);
      addVoice(output, at + 0.035, 0.62, 0.14, 330, 130, 'sine', 0.56, 500 + shot, 0.43);
    }
  } else if (category === 'movement') {
    const surfaceHz = [1_250, 720, 420, 2_300, 920, 560, 1_600, 380, 2_100, 680];
    for (let step = 0; step < 10; step += 1) {
      const at = 0.35 + step * 0.62;
      const speed = step % 3 === 0 ? 1.15 : 0.78;
      addVoice(output, at, 0.055, 0.14 * speed, surfaceHz[step]!, surfaceHz[step]! * 0.52, 'triangle', 0.78, 1_000 + step, 0.035);
      addVoice(output, at, 0.07, 0.11 * speed, 82 + surfaceHz[step]! * 0.08, 42, 'sine', 0.16, 1_100 + step, 0.045);
      addVoice(output, at + 0.018, 0.06, 0.055 * speed, surfaceHz[step]! * 1.8, 420, 'sawtooth', 0.88, 1_200 + step, 0.035);
    }
  } else if (category === 'impacts') {
    addVoice(output, 0.6, 0.095, 0.2, 5_400, 2_600, 'square', 0.68, 2_000, 0.04);
    addVoice(output, 0.6, 0.28, 0.14, 3_600, 1_100, 'sine', 0.62, 2_001, 0.14);
    addVoice(output, 0.64, 0.28, 0.09, 7_600, 2_400, 'sine', 0.7, 2_002, 0.16);
    addVoice(output, 2.1, 0.065, 0.17, 3_200, 1_400, 'square', 0.45, 2_010, 0.035);
    addVoice(output, 2.1, 0.14, 0.11, 960, 420, 'triangle', 0.2, 2_011, 0.07);
    addVoice(output, 3.6, 0.075, 0.16, 1_900, 820, 'triangle', 0.7, 2_020, 0.04);
    addVoice(output, 3.63, 0.22, 0.1, 2_600, 700, 'sawtooth', 0.84, 2_021, 0.12);
  } else if (category === 'ui') {
    // Keep confirmation cues readable while leaving the documented combat
    // hierarchy to weapons, impacts, and footsteps in that order.
    addVoice(output, 0.8, 0.15, 0.14, 660, 880, 'triangle', 0, 3_000, 0.08);
    addVoice(output, 0.89, 0.17, 0.125, 880, 1_320, 'sine', 0, 3_001, 0.09);
    addVoice(output, 0.98, 0.24, 0.16, 1_320, 1_760, 'sine', 0.05, 3_002, 0.13);
    addVoice(output, 1.05, 0.17, 0.04, 2_600, 1_200, 'sawtooth', 0.85, 3_003, 0.08);
  } else {
    // A quiet tonal bed: two slowly moving partials, the same musical role as
    // the live game-music bus, tested over the full twenty-second window.
    for (let second = 0; second < OFFLINE_RENDER_SECONDS; second += 1) {
      addVoice(output, second, 1.02, 0.045, 92 + (second % 4) * 2, 96, 'sine', 0, 4_000 + second, 0.7);
      addVoice(output, second, 1.02, 0.028, 184 + (second % 5) * 3, 188, 'triangle', 0, 4_100 + second, 0.55);
    }
  }
  for (let index = 0; index < output.length; index += 1) {
    // Master safety stage. This is intentionally monotonic and bounded below
    // one so the probe catches any future recipe that would clip.
    output[index] = Math.tanh(output[index]! * 1.35) / 1.35;
  }
  return output;
}

/** Reconstructed HF-491 baseline: one shared voice shape per category, kept
 * only for the before/after evidence table and never used by the live graph. */
function renderLegacyBaseline(category: OfflineAudioCategory): Float32Array {
  const output = new Float32Array(OFFLINE_RENDER_SECONDS * OFFLINE_RENDER_SAMPLE_RATE);
  if (category === 'weapons') {
    for (let shot = 0; shot < 5; shot += 1) {
      addVoice(output, 0.5 + shot * 1.45, 0.28, 0.26, 120, 42, 'sawtooth', 0.2, 80_000, 0.18);
    }
  } else if (category === 'movement') {
    for (let step = 0; step < 10; step += 1) addVoice(output, 0.35 + step * 0.62, 0.08, 0.11, 900, 420, 'square', 0.82, 81_000, 0.05);
  } else if (category === 'impacts') {
    for (let impact = 0; impact < 3; impact += 1) {
      addVoice(output, 0.6 + impact * 1.5, 0.12, 0.18, 1_800, 500, 'square', 0.7, 82_000, 0.06);
    }
  } else if (category === 'ui') {
    addVoice(output, 0.8, 0.28, 0.16, 880, 880, 'square', 0, 83_000, 0.18);
  } else {
    for (let second = 0; second < OFFLINE_RENDER_SECONDS; second += 1) {
      addVoice(output, second, 1.02, 0.012, 220, 220, 'square', 0, 84_000, 0.75);
    }
  }
  for (let index = 0; index < output.length; index += 1) output[index] = Math.tanh(output[index]! * 1.35) / 1.35;
  return output;
}

export function renderOfflineAudioCategory(category: OfflineAudioCategory): Float32Array {
  return renderDesigned(category);
}

export function renderLegacyOfflineAudioCategory(category: OfflineAudioCategory): Float32Array {
  return renderLegacyBaseline(category);
}

export function renderOfflineWeaponShot(variant: number): Float32Array {
  const output = new Float32Array(Math.floor(0.9 * OFFLINE_RENDER_SAMPLE_RATE));
  const boundedVariant = Math.max(0, Math.floor(Number.isFinite(variant) ? variant : 0));
  addVoice(output, 0, 0.008, 0.16, 4_800 + boundedVariant * 31, 3_400, 'square', 0.7, 50_000 + boundedVariant, 0.004);
  addVoice(output, 0, 0.022, 0.22, 3_600 + boundedVariant * 7, 1_400, 'square', 0.12, 51_000 + boundedVariant, 0.012);
  addVoice(output, 0, 0.24, 0.38, 128 + boundedVariant, 46, 'sawtooth', 0.12, 52_000 + boundedVariant, 0.16);
  addVoice(output, 0.035, 0.62, 0.14, 330 + boundedVariant * 3, 130, 'sine', 0.56, 53_000 + boundedVariant, 0.43);
  for (let index = 0; index < output.length; index += 1) output[index] = Math.tanh(output[index]! * 1.35) / 1.35;
  return output;
}

export function measureOfflineAudio(samples: Float32Array): OfflineAudioMetrics {
  let peak = 0;
  let sumSquares = 0;
  let finite = true;
  for (const sample of samples) {
    finite &&= Number.isFinite(sample);
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  return Object.freeze({
    peak,
    rms,
    finite,
    clipped: peak > 0.999,
    sampleCount: samples.length,
  });
}
