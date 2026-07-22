import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SANCTIFIED_FRAG_CHOIR_ASSET } from './audio';

const AUDIO_PATH = 'public/assets/original/audio/sanctified-frag-hallelujah.wav';
const EXPECTED_SHA256 = 'cf8a0bcd12b56e43ac41fcaa28f3b737296fd88085a062fc15470e6c9fa0d3ee';

describe('Sanctified Frag Hallelujah choir asset', () => {
  it('is a deterministic original stereo PCM wave with bounded runtime size', () => {
    const audio = readFileSync(AUDIO_PATH);
    expect(audio.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(audio.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(audio.readUInt16LE(22)).toBe(2);
    expect(audio.readUInt32LE(24)).toBe(22_050);
    expect(audio.readUInt16LE(34)).toBe(16);
    expect(audio.byteLength).toBe(313_152);
    expect(createHash('sha256').update(audio).digest('hex')).toBe(EXPECTED_SHA256);
    expect(SANCTIFIED_FRAG_CHOIR_ASSET).toBe('./assets/original/audio/sanctified-frag-hallelujah.wav');
  });

  it('records the generated waveform and source script in the asset manifest', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8')) as {
      assets: Array<Record<string, unknown>>;
    };
    const record = manifest.assets.find((asset) => asset.id === 'atomic-acres-sanctified-frag-choir-2026-07-16');
    expect(record).toMatchObject({
      kind: 'original-project-audio',
      files: AUDIO_PATH,
      sha256: EXPECTED_SHA256,
      sourceScript: 'scripts/audio/create-sanctified-frag-choir.py',
      externalSamples: 0,
      attributionRequired: false,
    });
    expect(readFileSync(String(record?.sourceScript), 'utf8')).toContain('deterministic additive/formant synthesis');
  });
});
