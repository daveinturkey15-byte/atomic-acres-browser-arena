import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyBenchmarkRecord } from '../scripts/release/verify-benchmark-record.mjs';

const root = resolve(import.meta.dirname, '..');
const record = JSON.parse(readFileSync(resolve(root, 'baselines/pass69/pass70-start-benchmark.json'), 'utf8'));
const channels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));

describe('Pass 70 immutable starting benchmark', () => {
  it('pins the exact owner-approved Pass 69 live bytes independently of the selectable stable channel', () => {
    expect(verifyBenchmarkRecord(record, channels)).toMatchObject({
      ok: true,
      releasePass: 'PASS 69',
      sourceSha: '685ed7865018e107df5acf6cb6f7498b4468940c',
      benchmarkIsCurrentStable: false,
    });
    expect(record.pagesSha).toBe('71ec5616504d8e24241450742d01b25c1d6ff4e4');
    expect(record.runtimeTreeSha256).toBe('5ace26fdf83a4cf695d0075a40523f70e0d6fcee02cb6ae5b42666b6679107b9');
    expect(record.acceptanceManifestSha256).toBe('eb91ac49145b331abbbd7e92324cd07bc60a3e4b0c80613e3924270c54123dcd');
    expect(record.retainedContracts).toEqual([
      'Pass 69 remains the exact live comparison baseline and is not modified in place',
      'Pass 63 remains the separate byte-exact WebGL stable rollback source',
      'the accepted Mini Uzi, Carpet Bomber, Care Package plane, Flare Gun and Flamethrower improvements are retained',
      'the accepted two-choice Pass 69 versus Pass 63 release shell and protected channel provenance are retained',
      'the frozen Pass 62 best-ever netcode benchmark remains independently enforced',
    ]);
  });

  it('rejects rebuilding or reinterpreting the frozen Pass 69 rollback bytes', () => {
    expect(() => verifyBenchmarkRecord({ ...record, rollbackPolicy: 'rebuild the newest source' }, channels))
      .toThrow(/exact bytes and reject rebuilds/);
  });
});
