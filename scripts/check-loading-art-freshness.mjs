#!/usr/bin/env node
// check-loading-art-freshness.mjs — day3-identity-loading.
//
// The gate that makes "every pass, for all maps" true instead of
// aspirational: every arena with a loading screen must carry a provenance
// sidecar (public/assets/original/menu-previews/<arena>.loading-provenance.json,
// written by scripts/generate-loading-poster.mjs) proving its poster was
// derived from a build whose rendered pixels cannot differ from HEAD, and the
// shipped poster bytes must match what the sidecar records.
//
// FRESH means: the poster exists, the sidecar exists and names this arena,
// the poster bytes equal the recorded output sha, AND the tree that could
// change a pixel is identical between the capture commit and HEAD (same
// commit, or a later commit that touched only provenance metadata and the
// derived posters themselves). Anything else — missing sidecar (art predates
// the derivation pipeline), an older capture with real tree drift, drifted
// poster bytes, a missing poster — is STALE and exits non-zero. Missing art
// fails rather than warns: a generator nobody runs is worth nothing.
//
// Usage:
//   node scripts/check-loading-art-freshness.mjs [arena...]
//   node scripts/check-loading-art-freshness.mjs --root <repo> --sha <sha> [arena...]
//
// --root/--sha exist so the red-first demonstration and the unit contract can
// point the gate at fixtures without touching public/.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { VIEWPOINT_CATALOG } from './qa/viewpoint-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

function headSha(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`cannot resolve HEAD under ${repoRoot}`);
  return result.stdout.trim();
}

// Paths that never change rendered pixels, excluded when asking whether the
// map could have changed since the capture. Everything else — any src edits
// (including tests for shipped behaviour), any catalog or asset change —
// makes the art stale. The posters themselves are excluded because they ARE
// the derived output (their bytes are still pinned by the recorded output
// sha); the sidecars are provenance metadata. The last four are this
// pipeline's own instrument, contract and recipe: reachable from no renderer,
// so they cannot move a pixel. scripts/qa/viewpoint-catalog.mjs is
// deliberately NOT excluded — a moved review camera must trip the gate.
const PIXEL_IMMATERIAL = [
  ':(exclude)public/assets/original/menu-previews/*.loading-provenance.json',
  ':(exclude)public/assets/original/menu-previews/*.webp',
  ':(exclude)scripts/generate-loading-poster.mjs',
  ':(exclude)scripts/check-loading-art-freshness.mjs',
  ':(exclude)src/loading-art-freshness.test.ts',
  ':(exclude)docs/threejs-knowledge/recipes/derived-loading-poster.md',
];

export function isTreeEquivalent(repoRoot, fromSha, toSha) {
  const result = spawnSync('git', ['diff', '--quiet', fromSha, toSha, '--', '.', ...PIXEL_IMMATERIAL], { cwd: repoRoot, windowsHide: true });
  if (result.status === undefined || result.status === null) throw new Error('git diff did not run');
  if (result.status !== 0 && result.status !== 1) throw new Error(`git diff exited ${result.status}`);
  return result.status === 0;
}

export function checkArena(repoRoot, expectedSha, arenaId) {
  const poster = path.join(repoRoot, 'public', 'assets', 'original', 'menu-previews', `${arenaId}.webp`);
  const sidecarPath = path.join(repoRoot, 'public', 'assets', 'original', 'menu-previews', `${arenaId}.loading-provenance.json`);
  if (!existsSync(poster)) return { arenaId, ok: false, reason: 'poster missing' };
  if (!existsSync(sidecarPath)) return { arenaId, ok: false, reason: 'no loading-provenance sidecar: art predates the derivation pipeline' };
  let sidecar;
  try {
    sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  } catch (error) {
    return { arenaId, ok: false, reason: `sidecar unreadable: ${error.message}` };
  }
  if (sidecar.arenaId !== arenaId) return { arenaId, ok: false, reason: `sidecar names ${sidecar.arenaId}` };
  const actual = createHash('sha256').update(readFileSync(poster)).digest('hex');
  if (actual !== sidecar.output?.sha256) return { arenaId, ok: false, reason: 'poster bytes drifted from the recorded output sha' };
  if (sidecar.sourceSha === expectedSha) {
    return { arenaId, ok: true, camera: sidecar.camera, sourceSha: expectedSha.slice(0, 12), bytes: sidecar.output?.bytes };
  }
  let equivalent = false;
  try {
    equivalent = isTreeEquivalent(repoRoot, sidecar.sourceSha, expectedSha);
  } catch {
    equivalent = false;
  }
  if (!equivalent) {
    return { arenaId, ok: false, reason: `stale: sidecar sourceSha ${String(sidecar.sourceSha).slice(0, 12)} != HEAD ${expectedSha.slice(0, 12)} and the pixel-relevant tree moved` };
  }
  return { arenaId, ok: true, camera: sidecar.camera, sourceSha: `${String(sidecar.sourceSha).slice(0, 12)}~tree`, bytes: sidecar.output?.bytes };
}

function main() {
  const repoRoot = path.resolve(arg('--root', root));
  const positional = argv.filter((entry) => !entry.startsWith('--') && entry !== arg('--root') && entry !== arg('--sha'));
  const arenas = positional.length > 0 ? positional : Object.keys(VIEWPOINT_CATALOG);
  for (const arena of arenas) {
    if (!VIEWPOINT_CATALOG[arena]) {
      console.error(`[loading-freshness] unknown arena '${arena}'`);
      process.exitCode = 2;
      return;
    }
  }
  const expectedSha = arg('--sha') ?? headSha(repoRoot);
  const rows = arenas.map((arena) => checkArena(repoRoot, expectedSha, arena));
  for (const row of rows) {
    console.log(`[loading-freshness] ${row.arenaId.padEnd(18)} ${row.ok ? `FRESH camera=${row.camera} sha=${row.sourceSha} bytes=${row.bytes}` : `STALE ${row.reason}`}`);
  }
  const stale = rows.filter((row) => !row.ok);
  if (stale.length > 0) {
    console.error(`[loading-freshness] ${stale.length}/${rows.length} stale`);
    process.exitCode = 1;
  } else {
    console.log(`[loading-freshness] ${rows.length}/${rows.length} fresh at ${expectedSha.slice(0, 12)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
