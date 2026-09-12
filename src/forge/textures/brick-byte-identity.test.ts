/**
 * Byte-identity pin for the brick generator (render-contract-repair, 2026-09-12).
 *
 * The brick shader was restructured for speed (per-brick hash table, row memo,
 * chip bounding square). These FNV-1a digests were measured on the UNCHANGED
 * generator at 089cb13a4 immediately before that change, so a later "tidy" that
 * moves a single byte of albedo, normal, roughness or height fails here rather
 * than shipping a silently different wall.
 */
import { describe, expect, it } from 'vitest';
import { generateBrick } from './brick';

function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const PINNED = {
  '1024/seed1': { albedo: '64211ad6', normal: 'd7d65ce7', roughness: '01ee0c82', height: 'e3e558b3' },
  '512/seed9': { albedo: 'a50540af', normal: '1faa7d4a', roughness: '9c77d805', height: '0fe17719' },
} as const;

describe('brick generator byte identity (pre-optimisation digests)', () => {
  it.each([
    ['1024/seed1', 1024, 1],
    ['512/seed9', 512, 9],
  ] as const)('%s reproduces the pinned buffers', (key, size, seed) => {
    const set = generateBrick({ size, seed });
    expect(fnv1a(set.albedo as unknown as Uint8Array)).toBe(PINNED[key].albedo);
    expect(fnv1a(set.normal as unknown as Uint8Array)).toBe(PINNED[key].normal);
    expect(fnv1a(set.roughness as unknown as Uint8Array)).toBe(PINNED[key].roughness);
    expect(fnv1a(new Uint8Array(set.heightMm.buffer))).toBe(PINNED[key].height);
  });
});
