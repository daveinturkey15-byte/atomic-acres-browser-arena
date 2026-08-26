import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyBenchmarkRecord } from '../scripts/release/verify-benchmark-record.mjs';

const root = resolve(import.meta.dirname, '..');
const record = JSON.parse(readFileSync(resolve(root, 'baselines/pass72/pass73-start-benchmark.json'), 'utf8'));
const channels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));

describe('Pass 73 exact starting benchmark', () => {
  it('freezes the exact Pass 72 live runtime without describing it as defect-free', () => {
    expect(verifyBenchmarkRecord(record, channels)).toMatchObject({
      ok: true,
      releasePass: 'PASS 72',
      sourceSha: '5da686551d92387d08b00be40125386c391bb3ed',
      benchmarkIsCurrentStable: false,
    });
    expect(record.pagesSha).toBe('d5b77dc3b9e46608264c52eb0737b50590d70eb5');
    expect(record.runtimeFileCount).toBe(515);
    expect(record.runtimeTreeSha256).toBe('62fafc5e5c39fa744dfc4f7067b3e0953dd190d8ffecc04e203b2b86d6a8974f');
    expect(record.runtimeDigestPolicy).toEqual({
      excludedFiles: ['channel-provenance.json'],
      completeSubtreeFileCount: 516,
      wrapperProvenanceFile: 'pinned-channel-provenance.json',
    });
    expect(record.basis.ownerAssessment).toContain('release-blocking');
    expect(record.basis.ownerAssessment).toContain('not designated as defect-free or best-ever');
  });

  it('rejects any policy that permits a Pass 72 rebuild', () => {
    expect(() => verifyBenchmarkRecord({ ...record, rollbackPolicy: 'rebuild from current source' }, channels))
      .toThrow(/exact bytes and reject rebuilds/);
  });
});
