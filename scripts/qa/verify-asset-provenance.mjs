import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const textExtensions = new Set(['.json', '.md', '.txt', '.gltf', '.ts', '.mjs', '.js', '.py']);
const FULL_SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/i;

/** Digest rule shared by the worktree check and the historical-object check: text files are CRLF-normalised first. */
export function digestFor(path, bytes) {
  if (textExtensions.has(extname(path).toLowerCase())) {
    bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

/** What the same normalised content hashes to on a CRLF checkout (two historical pins were recorded that way). */
export function crlfDigestFor(path, bytes) {
  if (!textExtensions.has(extname(path).toLowerCase())) return null;
  const lf = bytes.toString('utf8').replaceAll('\r\n', '\n');
  return createHash('sha256').update(Buffer.from(lf.replaceAll('\n', '\r\n'), 'utf8')).digest('hex');
}

function git(root, args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], { cwd: root, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  return { ok: result.status === 0, stdout: result.stdout ?? Buffer.alloc(0), stderr: (result.stderr ?? '').toString() };
}

/** A repository-relative path that cannot escape the root: no absolute form, no drive, no backslash, no `..` segment. */
export function isSafeRepoPath(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (isAbsolute(path) || path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * A `sourceScriptRevision` binds an unchanged historical asset to the generator revision that existed
 * alongside it, instead of to whatever the generator is today. It is accepted only when every claim is
 * mechanically true against the actual Git objects of THIS history:
 *   - `commit` is a full 40-hex SHA naming an existing commit that is an ancestor of HEAD;
 *   - `path` equals the entry's `sourceScript` and is a safe repository-relative path;
 *   - the generator blob at `commit:path`, digested by the same normalisation rule as the worktree
 *     check, equals the entry's pinned `sourceScriptSha256` (so the pin is a real historical object);
 *   - every pinned `files[]` blob exists at `commit` with exactly its pinned digest (the media and the
 *     generator revision coexist at that commit, and the worktree bytes still match that pin);
 *   - `commit` itself touched the generator or at least one pinned media file (it is a commit where the
 *     relation was established, not an arbitrary later point in history);
 *   - when `crlfSha256` is present it equals the CRLF-variant digest of the same blob.
 * Git proves coexistence, not causation: a generator edit followed by deterministic regeneration may emit
 * identical bytes, and commit chronology alone never proves recapture. The revision therefore names the
 * exact object a reviewer can inspect, and merely editing digits in the manifest cannot satisfy it.
 */
export function verifyRevision(root, entry, source, errors) {
  const revision = entry.sourceScriptRevision;
  const label = `${source}.sourceScriptRevision`;
  if (!revision || typeof revision !== 'object' || Array.isArray(revision)) {
    errors.push(`${label}: must be an object`);
    return false;
  }
  const { commit, path } = revision;
  const pinned = typeof entry.sourceScriptSha256 === 'string' ? entry.sourceScriptSha256.toLowerCase() : null;
  if (typeof commit !== 'string' || !FULL_SHA.test(commit)) {
    errors.push(`${label}: commit must be a full 40-hex SHA, got ${JSON.stringify(commit ?? null)}`);
    return false;
  }
  if (!isSafeRepoPath(path)) {
    errors.push(`${label}: path is not a safe repository-relative path: ${JSON.stringify(path ?? null)}`);
    return false;
  }
  if (path !== entry.sourceScript) {
    errors.push(`${label}: path ${path} does not name the entry's sourceScript ${entry.sourceScript}`);
    return false;
  }
  if (!pinned || !DIGEST.test(pinned)) {
    errors.push(`${label}: entry has no valid sourceScriptSha256 to bind`);
    return false;
  }
  if (revision.crlfSha256 !== undefined && (typeof revision.crlfSha256 !== 'string' || !DIGEST.test(revision.crlfSha256))) {
    errors.push(`${label}: crlfSha256 is not a sha256 digest`);
    return false;
  }
  if (!git(root, ['cat-file', '-e', `${commit}^{commit}`]).ok) {
    errors.push(`${label}: commit ${commit} is not a commit object in this repository`);
    return false;
  }
  if (!git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']).ok) {
    errors.push(`${label}: commit ${commit} is not an ancestor of HEAD`);
    return false;
  }
  const blob = git(root, ['cat-file', 'blob', `${commit}:${path}`]);
  if (!blob.ok) {
    errors.push(`${label}: ${path} does not exist at ${commit}`);
    return false;
  }
  let ok = true;
  const historical = digestFor(path, blob.stdout);
  if (historical !== pinned) {
    errors.push(`${label}: generator at ${commit}:${path} digests to ${historical}, manifest pins ${pinned}`);
    ok = false;
  }
  if (revision.crlfSha256 !== undefined && crlfDigestFor(path, blob.stdout) !== revision.crlfSha256.toLowerCase()) {
    errors.push(`${label}: crlfSha256 does not match the CRLF form of ${commit}:${path}`);
    ok = false;
  }
  const media = [];
  if (Array.isArray(entry.files)) {
    entry.files.forEach((file, index) => {
      if (!file || typeof file !== 'object' || !isSafeRepoPath(file.path) || typeof file.sha256 !== 'string' || !DIGEST.test(file.sha256)) {
        errors.push(`${label}: files[${index}] must have a valid path and sha256`);
        ok = false;
      } else {
        media.push(file);
      }
    });
  }
  if (media.length === 0) {
    errors.push(`${label}: entry pins no media files, so there is nothing to bind the revision to`);
    ok = false;
  }
  for (const file of media) {
    if (!isSafeRepoPath(file.path)) {
      errors.push(`${label}: media path is not a safe repository-relative path: ${file.path}`);
      ok = false;
      continue;
    }
    const mediaBlob = git(root, ['cat-file', 'blob', `${commit}:${file.path}`]);
    if (!mediaBlob.ok) {
      errors.push(`${label}: ${file.path} does not exist at ${commit}`);
      ok = false;
      continue;
    }
    const mediaDigest = digestFor(file.path, mediaBlob.stdout);
    if (mediaDigest !== file.sha256.toLowerCase()) {
      errors.push(`${label}: ${file.path} at ${commit} digests to ${mediaDigest}, manifest pins ${file.sha256.toLowerCase()}`);
      ok = false;
    }
  }
  const touched = git(root, ['show', '--format=', '--name-only', '-m', '--first-parent', commit]);
  const touchedPaths = new Set(touched.stdout.toString('utf8').split(/\r?\n/).filter(Boolean));
  if (!touched.ok || !(touchedPaths.has(path) || media.some((file) => touchedPaths.has(file.path)))) {
    errors.push(`${label}: commit ${commit} touched neither ${path} nor any pinned media file`);
    ok = false;
  }
  return ok;
}

export async function verifyAssetProvenance(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'assets.manifest.json'), 'utf8'));
  const expected = new Map();
  const errors = [];
  const revisions = [];

  function add(path, sha256, source) {
    if (typeof path !== 'string' || typeof sha256 !== 'string') return;
    if (!DIGEST.test(sha256)) {
      errors.push(`${source}: invalid sha256`);
      return;
    }
    const current = expected.get(path);
    if (current && current.sha256 !== sha256.toLowerCase()) errors.push(`${path}: conflicting manifest digests`);
    expected.set(path, { sha256: sha256.toLowerCase(), source });
  }

  function walk(value, source = 'manifest') {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${source}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const hasRevision = Object.hasOwn(value, 'sourceScriptRevision');
    add(value.path, value.sha256, source);
    for (const [key, path] of Object.entries(value)) {
      if (typeof path !== 'string' || (!key.endsWith('Path') && !key.startsWith('source'))) continue;
      // A declared historical revision replaces the worktree check for the generator with the Git-object check.
      if (hasRevision && key === 'sourceScript') continue;
      add(path, value[`${key}Sha256`], `${source}.${key}`);
    }
    if (hasRevision) revisions.push({ entry: value, source });
    for (const [key, nested] of Object.entries(value)) {
      if (key !== 'path' && key !== 'sourceScriptRevision') walk(nested, `${source}.${key}`);
    }
  }

  walk(manifest);
  for (const [path, record] of expected) {
    const absolute = resolve(root, path);
    const outside = relative(root, absolute).startsWith('..') || isAbsolute(relative(root, absolute));
    if (outside) {
      errors.push(`${path}: resolves outside repository root`);
      continue;
    }
    try {
      if (!(await stat(absolute)).isFile()) throw new Error('not a file');
      const actual = digestFor(path, await readFile(absolute));
      if (actual !== record.sha256) errors.push(`${path}: expected ${record.sha256}, got ${actual}`);
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const { entry, source } of revisions) {
    if (typeof entry.sourceScript !== 'string') {
      errors.push(`${source}.sourceScriptRevision: entry has no sourceScript`);
      continue;
    }
    const absolute = resolve(root, entry.sourceScript);
    try {
      if (!(await stat(absolute)).isFile()) throw new Error('not a file');
    } catch (error) {
      errors.push(`${entry.sourceScript}: ${error instanceof Error ? error.message : String(error)}`);
    }
    verifyRevision(root, entry, source, errors);
  }
  return { errors, verifiedDigests: expected.size, verifiedRevisions: revisions.length };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { errors, verifiedDigests, verifiedRevisions } = await verifyAssetProvenance(resolve(process.cwd()));
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ manifest: 'assets.manifest.json', provenance: 'ok', verifiedDigests, verifiedRevisions }));
  }
}
