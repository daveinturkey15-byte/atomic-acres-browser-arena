import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 66 audio long-run evidence runner', () => {
  it('owns a fresh staged topology and binds all four arena receipts to one clean SHA', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const runner = readFileSync('scripts/qa/run-pass66-audio-long-run.mjs', 'utf8');
    const spec = readFileSync('tests/e2e/pass66-audio-long-run.spec.ts', 'utf8');

    expect(packageJson.scripts['qa:pass66:audio-long-run'])
      .toBe('node scripts/qa/run-pass66-audio-long-run.mjs');
    for (const token of [
      'run-playwright-with-topology.mjs',
      "SOURCE_SHA: sourceSha",
      "VITE_MATCH_BUILD_ID: sourceSha",
      "PASS66_AUDIO_SOURCE_SHA: sourceSha",
      "PASS66_AUDIO_ARENA: ''",
      "['status', '--porcelain', '--untracked-files=all']",
      'rmSync(artifactRoot, { recursive: true, force: true })',
      'endingSha !== sourceSha',
      'discardEvidence',
      'receipt.schemaVersion !== 3',
      'expectedSampleOffsets',
      'sample.audio?.outputProbe?.available === true',
      'sample.audio.outputProbe.suspiciousBroadbandHiss === false',
      "sample.audio.ambience?.continuousSources === 0",
      'sample.audio.ambience?.transientSources === 0',
      'sample.audio.ambience?.events === 0',
      'sample.audio.ambience?.lastDurationMs === 0',
      'sample.audio.ambience?.nextInMs === null',
      'sample.audio.runtime?.retainedSources === 12',
      'validNoiseFreeArenaAmbience',
    ]) expect(runner).toContain(token);
    expect(spec).toContain("test.skip(!enabled");
    expect(spec).toContain("'/channels/the-big-one/channel-provenance.json'");
    expect(spec).toContain("execFileSync('git', ['status', '--porcelain', '--untracked-files=all']");
    expect(spec).toContain('snapshot().weaponReady === true');
    expect(spec).toContain('sourceSha: expectedSourceSha');
    expect(spec).toContain('servedCandidate,');
    expect(spec).toContain('2_000, 32_000, 60_000, 61_000, 62_000, 63_000, 64_000, 65_000');
    expect(spec).toContain('suspiciousBroadbandHiss: false');
    expect(spec).toContain('narrowbandTonePresent');
    expect(spec).toContain('sample.audio.ambience.transientSources === 0');
    expect(spec).toContain('sample.audio.ambience.events === 0');
    expect(spec).toContain('sample.audio.ambience.lastDurationMs === 0');
    expect(spec).toContain('sample.audio.ambience.nextInMs === null');
  });
});
