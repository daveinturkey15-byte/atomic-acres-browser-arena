import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyBenchmarkRecord } from '../scripts/release/verify-benchmark-record.mjs';

const root = resolve(import.meta.dirname, '..');
const record = JSON.parse(readFileSync(resolve(root, 'baselines/pass62/best-netcode-benchmark.json'), 'utf8'));
const channels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));

describe('immutable best-build benchmark', () => {
  it('binds the stable release channel to explicit digest and provenance semantics', () => {
    expect(verifyBenchmarkRecord(record, channels)).toMatchObject({
      ok: true,
      releasePass: 'PASS 62',
      sourceSha: '249a7ee77dce761eb237f3eb0e0d0ea1d0356317',
    });
  });

  it('rejects a rebuilt or ambiguous rollback policy', () => {
    expect(() => verifyBenchmarkRecord({ ...record, rollbackPolicy: 'use current build' }, channels))
      .toThrow(/exact bytes and reject rebuilds/);
  });

  it('rejects a stable-channel identity that drifts from the benchmark', () => {
    const changed = { ...channels, stable: { ...channels.stable, runtimeFileCount: 119 } };
    expect(() => verifyBenchmarkRecord(record, changed)).toThrow(/runtimeFileCount diverges/);
  });
});
