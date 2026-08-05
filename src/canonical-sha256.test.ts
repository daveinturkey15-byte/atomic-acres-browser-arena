import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalSha256, sha256Hex, stableStringify } from './canonical-state';

describe('browser-safe canonical SHA-256', () => {
  it.each(['', 'abc', 'Atomic Acres', 'RustRig 🚁', 'x'.repeat(1_000)])('matches Node crypto for %j', (value) => {
    expect(sha256Hex(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });

  it('hashes canonical key order and rejects non-finite state', () => {
    const left = { z: 3, a: { two: 2, one: 1 } };
    const right = { a: { one: 1, two: 2 }, z: 3 };
    expect(canonicalSha256(left)).toBe(canonicalSha256(right));
    expect(canonicalSha256(left)).toBe(createHash('sha256').update(stableStringify(left)).digest('hex'));
    expect(() => canonicalSha256({ bad: Number.NaN })).toThrow(/non-finite/);
  });
});
