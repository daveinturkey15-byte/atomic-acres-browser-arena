import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error - QA instrument, plain ESM with no type declarations.
import { isSafeRepoPath, verifyAssetProvenance } from '../scripts/qa/verify-asset-provenance.mjs';

/**
 * Provenance repair 2026-09-11: `sourceScriptRevision` binds unchanged historical media to the
 * generator revision that existed alongside it. These tests pin what the binding can and cannot
 * prove. The negative cases are the point: editing digits in assets.manifest.json cannot fabricate
 * the origin relation, because every claim is checked against the actual Git objects of the
 * repository's own history. The positive "deterministic regeneration" case records that a generator
 * edit is NOT required to change an output hash, and that chronology alone never proves recapture.
 */

const GEN = 'scripts/gen.mjs';
const POSTER = 'public/assets/original/fixture/poster.webp';
const V1 = 'export const roster = ["a", "b"];\n';
const V2 = 'export const roster = ["b", "a"];\n';
const BYTES_A = Buffer.from('RIFF-fixture-poster-bytes-A');
const BYTES_B = Buffer.from('RIFF-fixture-poster-bytes-B');
const sha = (input: Buffer | string): string => createHash('sha256').update(input).digest('hex');

interface Fixture {
  dir: string;
  c1: string;
  c2: string;
  c3: string;
  side: string;
}

let fx: Fixture;

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', '-c', 'core.autocrlf=false', ...args], { cwd: dir, encoding: 'utf8' }).trim();
}

function write(dir: string, file: string, content: Buffer | string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
}

function commitAll(dir: string, message: string): string {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'provenance-revision-'));
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, GEN, V1);
  write(dir, POSTER, BYTES_A);
  const c1 = commitAll(dir, 'capture: generator v1 and poster A');
  write(dir, GEN, V2);
  const c2 = commitAll(dir, 'edit generator (roster rename), poster untouched');
  write(dir, 'README.md', 'unrelated\n');
  const c3 = commitAll(dir, 'unrelated docs');
  git(dir, 'checkout', '-q', '-b', 'side', c1);
  write(dir, GEN, 'export const roster = ["side"];\n');
  const side = commitAll(dir, 'side-branch generator edit, never merged');
  git(dir, 'checkout', '-q', 'main');
  fx = { dir, c1, c2, c3, side };
});

afterAll(() => {
  rmSync(fx.dir, { recursive: true, force: true });
});

type Entry = Record<string, unknown>;

function baseEntry(overrides: Entry = {}): Entry {
  return {
    id: 'fixture-family',
    kind: 'fixture',
    creator: 'test',
    license: 'test',
    files: [{ path: POSTER, sha256: sha(BYTES_A) }],
    sourceScript: GEN,
    sourceScriptSha256: sha(V1),
    sourceScriptRevision: { commit: fx.c1, path: GEN },
    ...overrides,
  };
}

async function verify(entry: Entry): Promise<string[]> {
  writeFileSync(path.join(fx.dir, 'assets.manifest.json'), JSON.stringify({ schemaVersion: 3, assets: [entry] }, null, 2));
  const { errors } = await verifyAssetProvenance(fx.dir);
  return errors;
}

describe('sourceScriptRevision binding', () => {
  it('accepts unchanged media bound to the generator revision that existed with it, after later generator edits', async () => {
    expect(git(fx.dir, 'rev-parse', 'HEAD')).toBe(fx.c3);
    expect(await verify(baseEntry())).toEqual([]);
  });

  it('accepts a generator edit whose deterministic regeneration emitted identical bytes (a hash change is not required)', async () => {
    const errors = await verify(baseEntry({ sourceScriptSha256: sha(V2), sourceScriptRevision: { commit: fx.c2, path: GEN } }));
    expect(errors).toEqual([]);
  });

  it('accepts and checks the CRLF-variant digest when one is declared', async () => {
    const crlf = sha(Buffer.from(V1.replaceAll('\n', '\r\n')));
    expect(await verify(baseEntry({ sourceScriptRevision: { commit: fx.c1, path: GEN, crlfSha256: crlf } }))).toEqual([]);
    const wrong = await verify(baseEntry({ sourceScriptRevision: { commit: fx.c1, path: GEN, crlfSha256: sha('nope') } }));
    expect(wrong.join('\n')).toMatch(/crlfSha256 does not match/);
  });

  it('still verifies the live worktree file for every entry without a revision (retained baseline)', async () => {
    const entry = baseEntry();
    delete entry.sourceScriptRevision;
    const errors = await verify(entry);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`^${GEN}: expected ${sha(V1)}, got ${sha(V2)}`));
  });
});

describe('editing digits in the manifest cannot fabricate the origin relation', () => {
  it('rejects re-pinning the generator digest to the live file while keeping the historical commit', async () => {
    const errors = await verify(baseEntry({ sourceScriptSha256: sha(V2) }));
    expect(errors.join('\n')).toMatch(/generator at .* digests to .*, manifest pins/);
  });

  it('rejects a generator digest that matches no object anywhere in history', async () => {
    const errors = await verify(baseEntry({ sourceScriptSha256: sha('invented') }));
    expect(errors.join('\n')).toMatch(/manifest pins/);
  });

  it('rejects a fabricated media digest: the blob at the named commit is authoritative', async () => {
    const errors = await verify(baseEntry({ files: [{ path: POSTER, sha256: sha(BYTES_B) }] }));
    expect(errors.join('\n')).toMatch(new RegExp(`${POSTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} at ${fx.c1} digests to`));
    expect(errors.join('\n')).toMatch(new RegExp(`^${POSTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: expected`, 'm'));
  });

  it('rejects media that moved in the worktree after the bound revision', async () => {
    write(fx.dir, POSTER, BYTES_B);
    try {
      const errors = await verify(baseEntry());
      expect(errors.join('\n')).toMatch(/poster\.webp: expected/);
    } finally {
      write(fx.dir, POSTER, BYTES_A);
    }
  });

  it('rejects a media file that does not exist at the bound commit', async () => {
    write(fx.dir, 'public/assets/original/fixture/later.webp', BYTES_B);
    try {
      const errors = await verify(baseEntry({ files: [{ path: POSTER, sha256: sha(BYTES_A) }, { path: 'public/assets/original/fixture/later.webp', sha256: sha(BYTES_B) }] }));
      expect(errors.join('\n')).toMatch(/later\.webp does not exist at/);
    } finally {
      unlinkSync(path.join(fx.dir, 'public/assets/original/fixture/later.webp'));
    }
  });

  it('rejects an entry that pins no media, so a revision cannot float free of any asset', async () => {
    const errors = await verify(baseEntry({ files: 'public/assets/original/fixture/*' }));
    expect(errors.join('\n')).toMatch(/pins no media files/);
  });
});

describe('the named commit must be a real, reachable point where the relation was established', () => {
  it('rejects a commit that exists but is not an ancestor of HEAD', async () => {
    const errors = await verify(baseEntry({ sourceScriptRevision: { commit: fx.side, path: GEN } }));
    expect(errors.join('\n')).toMatch(/is not an ancestor of HEAD/);
  });

  it('rejects a well-formed SHA that names no object', async () => {
    const errors = await verify(baseEntry({ sourceScriptRevision: { commit: '0123456789abcdef0123456789abcdef01234567', path: GEN } }));
    expect(errors.join('\n')).toMatch(/is not a commit object/);
  });

  it.each(['HEAD', 'main', 'abc1234', 'origin/main', '', null, 42])('rejects a non-SHA ref %j', async (commit) => {
    const errors = await verify(baseEntry({ sourceScriptRevision: { commit, path: GEN } }));
    expect(errors.join('\n')).toMatch(/commit must be a full 40-hex SHA/);
  });

  it('rejects an ancestor commit that touched neither the generator nor any pinned media', async () => {
    const errors = await verify(baseEntry({ sourceScriptRevision: { commit: fx.c3, path: GEN } }));
    expect(errors.join('\n')).toMatch(/touched neither/);
  });

  it('rejects a commit at which the generator path does not exist', async () => {
    const errors = await verify(baseEntry({ sourceScript: 'README.md', sourceScriptSha256: sha('unrelated\n'), sourceScriptRevision: { commit: fx.c1, path: 'README.md' } }));
    expect(errors.join('\n')).toMatch(/README\.md does not exist at/);
  });
});

describe('path hygiene', () => {
  it.each(['../gen.mjs', '/scripts/gen.mjs', 'scripts\\gen.mjs', 'C:/scripts/gen.mjs', 'scripts/../scripts/gen.mjs', './scripts/gen.mjs', '', 7])('rejects unsafe or escaping path %j', async (unsafe) => {
    expect(isSafeRepoPath(unsafe)).toBe(false);
    const errors = await verify(baseEntry({ sourceScriptRevision: { commit: fx.c1, path: unsafe } }));
    expect(errors.join('\n')).toMatch(/not a safe repository-relative path/);
  });

  it('rejects a revision path that does not name the entry sourceScript', async () => {
    const errors = await verify(baseEntry({ sourceScriptRevision: { commit: fx.c1, path: 'README.md' } }));
    expect(errors.join('\n')).toMatch(/does not name the entry's sourceScript/);
  });

  it('rejects a revision whose generator has been deleted from the worktree', async () => {
    const live = path.join(fx.dir, GEN);
    unlinkSync(live);
    try {
      const errors = await verify(baseEntry());
      expect(errors.join('\n')).toMatch(/scripts\/gen\.mjs: /);
    } finally {
      write(fx.dir, GEN, V2);
    }
  });

  it('rejects a revision that is not an object', async () => {
    const errors = await verify(baseEntry({ sourceScriptRevision: fx.c1 }));
    expect(errors.join('\n')).toMatch(/must be an object/);
  });
});

describe('a poster overwritten by a different pipeline gets its own origin record', () => {
  // Mirrors HF-561: the flyover family captured video + poster at c1; a later commit overwrote the
  // poster bytes in place with a different generator and a sidecar receipt. The old family may keep
  // the video, but it cannot keep claiming the poster, and the poster entry must bind to its own commit.
  const VIDEO = 'public/assets/original/fixture/poster.webm';
  const GEN2 = 'scripts/loading-poster.mjs';
  const G2 = 'export const poster = "derived";\n';
  const VIDEO_BYTES = Buffer.from('WEBM-fixture-video-bytes');
  const SIDECAR = 'public/assets/original/fixture/poster.loading-provenance.json';
  let capture = '';
  let overwrite = '';

  beforeAll(() => {
    write(fx.dir, VIDEO, VIDEO_BYTES);
    capture = commitAll(fx.dir, 'capture: flyover video joins poster A under generator v2');
    write(fx.dir, GEN2, G2);
    write(fx.dir, POSTER, BYTES_B);
    write(fx.dir, SIDECAR, JSON.stringify({ generatorScript: GEN2, outputSha256: sha(BYTES_B) }));
    overwrite = commitAll(fx.dir, 'HF-561 style: derived poster overwrites capture poster in place');
  });

  afterAll(() => {
    git(fx.dir, 'reset', '-q', '--hard', fx.c3);
  });

  function family(overrides: Entry = {}): Entry {
    return baseEntry({
      files: [{ path: VIDEO, sha256: sha(VIDEO_BYTES) }],
      sourceScriptRevision: { commit: capture, path: GEN },
      sourceScriptSha256: sha(V2),
      ...overrides,
    });
  }

  function posterEntry(overrides: Entry = {}): Entry {
    return {
      id: 'fixture-derived-poster',
      kind: 'fixture',
      creator: 'test',
      license: 'test',
      files: [{ path: POSTER, sha256: sha(BYTES_B) }],
      sourceScript: GEN2,
      sourceScriptSha256: sha(G2),
      sourceScriptRevision: { commit: overwrite, path: GEN2 },
      sourceProvenance: SIDECAR,
      ...overrides,
    };
  }

  async function verifyMany(entries: Entry[]): Promise<string[]> {
    writeFileSync(path.join(fx.dir, 'assets.manifest.json'), JSON.stringify({ schemaVersion: 3, assets: entries }, null, 2));
    const { errors } = await verifyAssetProvenance(fx.dir);
    return errors;
  }

  it('accepts the video in the capture family and the poster in its own entry bound to the overwrite commit', async () => {
    expect(await verifyMany([family(), posterEntry()])).toEqual([]);
  });

  it('rejects the capture family still claiming the poster with its original digest after the overwrite', async () => {
    const stale = family({ files: [{ path: VIDEO, sha256: sha(VIDEO_BYTES) }, { path: POSTER, sha256: sha(BYTES_A) }] });
    const errors = await verifyMany([stale, posterEntry()]);
    expect(errors.join('\n')).toMatch(/poster\.webp: conflicting manifest digests|poster\.webp: expected/);
  });

  it('rejects re-pinning the new poster bytes onto the old capture commit (the blob at that commit is poster A)', async () => {
    const forged = family({ files: [{ path: VIDEO, sha256: sha(VIDEO_BYTES) }, { path: POSTER, sha256: sha(BYTES_B) }] });
    const errors = await verifyMany([forged]);
    expect(errors.join('\n')).toMatch(/poster\.webp at [a-f0-9]{40} digests to/);
  });

  it('rejects binding the derived poster to the capture generator, whose revision never coexisted with these bytes', async () => {
    const errors = await verifyMany([posterEntry({ sourceScript: GEN, sourceScriptSha256: sha(V2), sourceScriptRevision: { commit: capture, path: GEN } })]);
    expect(errors.join('\n')).toMatch(/poster\.webp at [a-f0-9]{40} digests to/);
  });
});
