import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASS64_FAILED_REGRESSION_IDENTITY } from './release-identity';

const PASS64_SOURCE_SHA = '5075a52d80c6db69a97ed53acc2df5368728371a';
const PASS64_PAGES_SHA = '8326c95659a9fb8c5979c13f9b88126c4ffb85f7';
const PASS64_RUNTIME_SHA256 = 'ffd3e130d005e9321976795fe2d5cadfd9965ebb27dc0bbff0c1609816cff20b';
const PASS64_VERIFY_RUN = '30175101338';
const PASS64_PRODUCTION_RUN = '30175191044';
const PASS64_PAGES_RUN = '30175279180';
const PASS64_RECEIPT_ARTIFACT = '8624038234';

describe('retained Pass 64 release-foundation evidence', () => {
  it('keeps the current candidate descended from the exact released Pass 64 source', () => {
    expect(() => execFileSync('git', ['merge-base', '--is-ancestor', PASS64_SOURCE_SHA, 'HEAD'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      windowsHide: true,
    })).not.toThrow();
  });

  it('retains the failed-regression identity without confusing it with Stable', () => {
    expect(PASS64_FAILED_REGRESSION_IDENTITY).toEqual({
      pass: 'PASS 64',
      publishedLabel: 'EXPERIMENTAL NEW NETCODE',
      role: 'published-failed-regression-evidence',
      sourceSha: PASS64_SOURCE_SHA,
      pagesSha: PASS64_PAGES_SHA,
      route: 'channels/experimental-netcode-pass',
      runtimeFileCount: 130,
      runtimeTreeSha256: PASS64_RUNTIME_SHA256,
    });
  });

  it('retains the exact historical workflow and receipt identities that opened the Pass 65 gate', () => {
    const foundation = readFileSync('docs/PASS65_P0_RELEASE_FOUNDATION_2026-07-25.md', 'utf8');
    for (const identity of [
      PASS64_SOURCE_SHA,
      PASS64_PAGES_SHA,
      PASS64_VERIFY_RUN,
      PASS64_PRODUCTION_RUN,
      PASS64_PAGES_RUN,
      PASS64_RECEIPT_ARTIFACT,
    ]) expect(foundation).toContain(identity);
    expect(foundation).toContain('byte-exact Stable/no-rebuild rollback');
  });
});
