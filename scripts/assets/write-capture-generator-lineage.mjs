#!/usr/bin/env node
// ===========================================================================
// Writes source-assets/menu/capture-generator-lineage.json: every version the
// SHARED menu-preview capture generator has ever had, by digest.
//
// PASS 87 Lane AR, item 11. Menu-preview families each recorded the generator
// they captured with inside their own provenance.json - correct provenance -
// and `verify-pass77-arena-menu-preview-production.mjs` then re-hashed the LIVE
// file and compared it to that record. So every later family that touched the
// shared generator (c25f5e32 Map 3, a4b56ec7 Nuke Town Rebuild) turned an older
// family's honest capture record into a gate failure, and the only "fixes"
// available were to rewrite a historical digest or to leave the gate red. It
// was left red.
//
// A capture record is history and must never be rewritten. What the gate
// actually needs is a single place that says which generator versions have
// existed and which one is live - this file - so a family's record can be
// checked for ACCOUNTABILITY (is this a generator version that really existed?)
// instead of for equality with today's bytes.
//
// Two digests per version, because of the second half of the same defect: the
// pass77 and pass79 families recorded 80194703..., which is the CRLF hash of
// the generator at 5ac48931. It has never matched the LF bytes git stores, so
// that pin was already a line-ending artifact before Map 3 ever touched the
// file - green only on a CRLF checkout. Recording both digests makes the
// history verifiable from any checkout, and the gate grades the live file on
// the LF-normalised digest so it cannot depend on how somebody's git is
// configured.
//
// Usage: node scripts/assets/write-capture-generator-lineage.mjs [--check]
// ===========================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GENERATOR_PATH = 'scripts/assets/generate-pass65-runtime-menu-previews.ts';
export const LINEAGE_PATH = 'source-assets/menu/capture-generator-lineage.json';

/** The digest of the file's bytes with every line ending normalised to LF. */
export function normalisedSha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8')).digest('hex');
}

/** The digest the same content would have on a CRLF checkout. */
export function crlfSha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes.toString('utf8').replace(/\r?\n/gu, '\r\n'), 'utf8')).digest('hex');
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function buildLineage() {
  const commits = git(['log', '--format=%H', '--', GENERATOR_PATH]).trim().split('\n').filter(Boolean);
  const versions = [];
  const seen = new Set();
  for (const commit of commits) {
    const bytes = execFileSync('git', ['show', `${commit}:${GENERATOR_PATH}`], {
      cwd: ROOT, encoding: null, maxBuffer: 64 * 1024 * 1024,
    });
    const sha256 = normalisedSha256(bytes);
    if (seen.has(sha256)) continue;
    seen.add(sha256);
    const [short, date, subject] = git(['log', '-1', '--format=%h%x00%ad%x00%s', '--date=short', commit])
      .trim().split('\0');
    versions.push({ sha256, crlfSha256: crlfSha256(bytes), commit: short, date, subject });
  }
  return {
    schemaVersion: 1,
    path: GENERATOR_PATH,
    note:
      'Every version of the shared menu-preview capture generator, newest first. `sha256` is the '
      + 'LF-normalised digest (checkout-independent); `crlfSha256` is what the same content hashes '
      + 'to on a CRLF checkout, because two family provenance records were written that way. '
      + 'Regenerate with `node scripts/assets/write-capture-generator-lineage.mjs`. Never edit a '
      + 'recorded digest in place: a family provenance record is history.',
    current: versions[0],
    retired: versions.slice(1),
  };
}

export function liveGeneratorDigests() {
  const bytes = readFileSync(resolve(ROOT, GENERATOR_PATH));
  return { sha256: normalisedSha256(bytes), crlfSha256: crlfSha256(bytes) };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const lineage = buildLineage();
  const serialized = `${JSON.stringify(lineage, null, 2)}\n`;
  const target = resolve(ROOT, LINEAGE_PATH);
  if (process.argv.includes('--check')) {
    const existing = readFileSync(target, 'utf8');
    if (existing !== serialized) {
      throw new Error(`${LINEAGE_PATH} is stale; re-run node scripts/assets/write-capture-generator-lineage.mjs`);
    }
    console.log(JSON.stringify({ captureGeneratorLineage: 'current', versions: 1 + lineage.retired.length }));
  } else {
    writeFileSync(target, serialized);
    console.log(JSON.stringify({
      captureGeneratorLineage: 'written',
      versions: 1 + lineage.retired.length,
      current: lineage.current.sha256,
    }));
  }
}
