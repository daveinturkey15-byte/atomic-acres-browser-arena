import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - QA instrument, plain ESM with no type declarations.
import { VIEWPOINT_CATALOG } from '../scripts/qa/viewpoint-catalog.mjs';
// @ts-expect-error - QA instrument, plain ESM with no type declarations.
import { checkArena, isTreeEquivalent } from '../scripts/check-loading-art-freshness.mjs';
// @ts-expect-error - QA instrument, plain ESM with no type declarations.
import { REPRESENTATIVE_CAMERA, representativeCamera } from '../scripts/generate-loading-poster.mjs';

/**
 * day3-identity-loading: the loading-art derivation pipeline contract.
 * Pins behaviour, not values: every arena resolves a catalog-real camera, and
 * the freshness gate calls stale art stale (old build, drifted bytes, missing
 * sidecar) and fresh art fresh. No assertion names a literal poster byte.
 */
describe('loading art derivation', () => {
  it('resolves a catalog-real camera for every arena', () => {
    for (const arena of Object.keys(VIEWPOINT_CATALOG)) {
      const { camera } = representativeCamera(arena);
      expect(VIEWPOINT_CATALOG[arena], arena).toContain(camera);
    }
  });

  it('covers every arena with a curated pick, and rejects unknown arenas', () => {
    expect(new Set(Object.keys(REPRESENTATIVE_CAMERA))).toEqual(new Set(Object.keys(VIEWPOINT_CATALOG)));
    expect(() => representativeCamera('not-an-arena')).toThrow(/unknown arena/);
  });

  it('curates nuketown2 away from the top-down overhead, toward the street', () => {
    expect(VIEWPOINT_CATALOG.nuketown2[0]).toBe('nuketown2-overhead');
    expect(representativeCamera('nuketown2').camera).toBe('nuketown2-street-centre');
  });

  describe('freshness gate', () => {
    function fixture(kind: 'fresh' | 'stale-sha' | 'drift' | 'missing-sidecar'): string {
      const dir = mkdtempSync(path.join(tmpdir(), 'loading-freshness-'));
      const pub = path.join(dir, 'public', 'assets', 'original', 'menu-previews');
      mkdirSync(pub, { recursive: true });
      const posterBytes = Buffer.from('poster-bytes');
      writeFileSync(path.join(pub, 'nuketown2.webp'), posterBytes);
      const recorded = kind === 'drift' ? createHash('sha256').update('other-bytes').digest('hex') : createHash('sha256').update(posterBytes).digest('hex');
      if (kind !== 'missing-sidecar') {
        writeFileSync(path.join(pub, 'nuketown2.loading-provenance.json'), JSON.stringify({
          schemaVersion: 1, arenaId: 'nuketown2', camera: 'nuketown2-street-centre',
          sourceSha: kind === 'stale-sha' ? '0'.repeat(40) : 'f'.repeat(40),
          output: { sha256: recorded, bytes: posterBytes.length },
        }));
      }
      return dir;
    }

    it.each(['stale-sha', 'drift', 'missing-sidecar'] as const)('fails %s art', (kind) => {
      const dir = fixture(kind);
      try {
        expect(checkArena(dir, 'f'.repeat(40), 'nuketown2').ok).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('passes art generated from the current head with intact bytes', () => {
      const dir = fixture('fresh');
      try {
        const row = checkArena(dir, 'f'.repeat(40), 'nuketown2');
        expect(row.ok).toBe(true);
        expect(row.camera).toBe('nuketown2-street-centre');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('tree equivalence', () => {
    function gitRepo(): { dir: string; commit: (message: string) => string } {
      const dir = mkdtempSync(path.join(tmpdir(), 'loading-tree-'));
      const git = (args: string[]): string =>
        execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', ...args], { cwd: dir, encoding: 'utf8' }).trim();
      git(['init', '-q']);
      git(['commit', '-q', '--allow-empty', '-m', 'root']);
      return { dir, commit: (message: string) => { git(['commit', '-q', '--allow-empty', '-m', message]); return git(['rev-parse', 'HEAD']); } };
    }

    it('holds on the same commit, breaks on pixel-relevant drift, survives provenance-only drift', () => {
      const { dir, commit } = gitRepo();
      try {
        const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim() as string;
        expect(isTreeEquivalent(dir, base, base)).toBe(true);
        mkdirSync(path.join(dir, 'src'), { recursive: true });
        writeFileSync(path.join(dir, 'src', 'map.ts'), 'v2');
        execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', 'add', '.'], { cwd: dir });
        const moved = commit('map change');
        expect(isTreeEquivalent(dir, base, moved)).toBe(false);
        mkdirSync(path.join(dir, 'public', 'assets', 'original', 'menu-previews'), { recursive: true });
        writeFileSync(path.join(dir, 'public', 'assets', 'original', 'menu-previews', 'nuketown2.loading-provenance.json'), '{}');
        writeFileSync(path.join(dir, 'public', 'assets', 'original', 'menu-previews', 'nuketown2.webp'), 'bytes');
        execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', 'add', '.'], { cwd: dir });
        const meta = commit('provenance only');
        expect(isTreeEquivalent(dir, moved, meta)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
