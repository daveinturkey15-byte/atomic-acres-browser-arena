import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLASHBANG_AUDIO_PROFILE, flashbangAudioEnvelope } from './audio';
import { flashbangPresentation } from './combat/pass65-ordnance-contract';

describe('flashbang audio path', () => {
  it('has one immediate bounded onset, no beep schedule, and a finite recovery tail', () => {
    const full = flashbangAudioEnvelope(1);
    expect(full).toMatchObject({
      audioGain: 1,
      impactVolume: 0.48,
      maximumTailMs: 745,
      scheduledBeeps: 0,
      onsetDelayMs: 0,
    });
    expect(FLASHBANG_AUDIO_PROFILE.maximumTailMs).toBeLessThan(1_000);
    expect(full.firstRecoveryVolume).toBeLessThan(full.impactVolume);
    expect(full.secondRecoveryVolume).toBeLessThan(full.firstRecoveryVolume);
  });

  it('applies the reduced-sensory audioGain to every actual procedural layer', () => {
    const presentation = flashbangPresentation(0.8, true);
    const reduced = flashbangAudioEnvelope(presentation.audioGain);
    const full = flashbangAudioEnvelope(0.8);
    expect(presentation.audioGain).toBeCloseTo(0.16);
    expect(reduced.impactVolume).toBeCloseTo(full.impactVolume * 0.2);
    expect(reduced.firstRecoveryVolume).toBeCloseTo(full.firstRecoveryVolume * 0.2);
    expect(reduced.secondRecoveryVolume).toBeCloseTo(full.secondRecoveryVolume * 0.2);
  });

  it('wires the admitted presentation gain into ArenaAudio instead of playing an unscaled detonation', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(source).toContain('audio.flashbang(presentation.audioGain);');
    expect(source).not.toMatch(/audio\.flashbang\(\s*\)/);
  });
});
