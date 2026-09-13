#!/usr/bin/env node
// generate-loading-poster.mjs — day3-identity-loading (owner 2026-09-08:
// "update the start video and loading screen to match the current map, do
// this every pass, for all maps").
//
// A map's loading poster is derived from a capture of that map at the current
// build — never hand-painted. This script takes an arena id, captures its
// representative review camera through the UNMODIFIED
// scripts/qa/capture-arena-viewpoints.mjs instrument, and encodes the frame
// into the exact poster slot the deployment loading screen paints
// (public/assets/original/menu-previews/<arena>.webp, via
// src/ui/menu-preview-video.ts), with a provenance sidecar that
// scripts/check-loading-art-freshness.mjs gates on.
//
// The video half of the loading surface is deliberately OUT of scope: the
// menu/loading media are 240-frame 2560x1440 flyovers with their own capture
// recipe, cache families and review sheets (see scripts/assets/
// finalize-pass85-nuketown2-menu-preview.mjs). Regenerating video every pass
// is a larger problem with its own budget; this script scopes the still first
// and REPORT.md carries the video recommendation.
//
// Camera rule (deterministic, recorded in the sidecar): the curated station
// in REPRESENTATIVE_CAMERA when one exists, else the arena's first catalog
// station. Curated picks are the widest authored view that shows the map's
// defining space — never an interior, a close-up, an into-sun exposure probe,
// or a top-down plan. nuketown2's first station is an overhead for exactly
// that reason, so it is curated to street-centre instead.
//
// Encoding invents nothing: single-frame libwebp at the masters' poster
// quality (88), full 2560x1440, within the masters' 1.5 MB poster budget —
// read from source-assets/menu/pass65-preview-masters/choreography.json, the
// same profile the shipped posters were encoded with.
//
// Usage:
//   node scripts/generate-loading-poster.mjs --arena nuketown2 --url http://127.0.0.1:4375
//   node scripts/generate-loading-poster.mjs --arena map3 --url http://127.0.0.1:4375 --install
//
// Guards: refuses a dirty tree, waits on the shared heavy lock (never lowers
// the 4 GiB floor), aborts when the capture verdict is not PASS (including
// the flat-frame gate), and stages under artifacts/loading-posters/ unless
// --install is passed.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { VIEWPOINT_CATALOG } from './qa/viewpoint-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);

/** Curated representative station per arena. See the header for the rule. */
export const REPRESENTATIVE_CAMERA = Object.freeze({
  'atomic-acres': 'nuke-town-street-axis',
  'skyline-terminal': 'terminal-overview',
  'rustworks-1v1': 'rustrig-overview',
  'gun-range': 'gun-range-overview',
  farcrysis: 'farcrysis-beach-golden',
  'high-seas': 'high-seas-starboard-overview',
  test1: 'test1-tower-overview',
  test2: 'test2-estate-overview',
  map3: 'map3-hub-vista',
  nuketown2: 'nuketown2-street-centre',
  raid2: 'raid2-estate-overview',
});

export function representativeCamera(arenaId) {
  const roster = VIEWPOINT_CATALOG[arenaId];
  if (!roster) throw new Error(`unknown arena '${arenaId}'`);
  const curated = REPRESENTATIVE_CAMERA[arenaId];
  if (curated) {
    if (!roster.includes(curated)) throw new Error(`curated camera '${curated}' left the catalog for '${arenaId}'`);
    return { camera: curated, curated: true };
  }
  return { camera: roster[0], curated: false };
}

function sh(command, args, opts = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return (result.stdout ?? '').trim();
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function requireTool(command, probeArgs) {
  try {
    sh(command, probeArgs);
  } catch {
    throw new Error(`required tool '${command}' is not on PATH`);
  }
}

// The shared heavyweight-GPU lock. Same protocol the capture lanes use:
// mkdir %TEMP%/aa-heavy.lock, hold owner.json, poll every 20 s, never
// take over a live owner, never lower the 4 GiB admission floor.
function freeMiB() {
  if (process.platform === 'win32') {
    const out = sh('wmic', ['OS', 'get', 'FreePhysicalMemory', '/value']);
    const match = out.match(/FreePhysicalMemory=(\d+)/);
    if (match) return Math.floor(Number(match[1]) / 1024);
  }
  try {
    const out = sh('free', ['-m']);
    const line = out.split('\n').find((l) => l.startsWith('Mem:'));
    if (line) return Number(line.split(/\s+/)[3]);
  } catch { /* fall through */ }
  return Number.MAX_SAFE_INTEGER;
}

function livePid(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireHeavyLock(owner) {
  const dir = path.join(tmpdir(), 'aa-heavy.lock');
  const stamp = path.join(dir, 'owner.json');
  for (;;) {
    try {
      mkdirSync(dir);
      writeFileSync(stamp, `${JSON.stringify({ ...owner, since: new Date().toISOString() })}\n`);
      process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* released */ } });
      return () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* released */ } };
    } catch {
      let live = true;
      try {
        // Foreign owners may write owner.json with a UTF-8 BOM (PowerShell
        // habits); JSON.parse chokes on it, and treating an unreadable owner
        // as live would deadlock behind a dead holder forever.
        const prev = JSON.parse(readFileSync(stamp, 'utf8').replace(/^﻿/, ''));
        live = typeof prev.pid === 'number' ? livePid(prev.pid) : true;
      } catch { live = true; }
      if (!live) {
        console.error('[loading-poster] lock owner is dead; releasing the stale lock (a live owner is never taken over)');
        rmSync(dir, { recursive: true, force: true });
        continue;
      }
    }
    const ram = freeMiB();
    console.error(`[loading-poster] heavy lock held; free RAM ${ram} MiB — polling (never lowering the 4096 MiB floor)`);
    if (ram >= 4096) console.error('[loading-poster] lock still held; waiting for the owner, not taking over');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20_000);
  }
}

function main() {
  const arena = arg('--arena');
  if (!arena) throw new Error('pass --arena <id>');
  if (!VIEWPOINT_CATALOG[arena]) throw new Error(`unknown arena '${arena}'`);
  const explicitCamera = arg('--camera');
  const { camera, curated } = explicitCamera
    ? { camera: explicitCamera, curated: explicitCamera === REPRESENTATIVE_CAMERA[arena] }
    : representativeCamera(arena);
  if (!VIEWPOINT_CATALOG[arena].includes(camera)) throw new Error(`camera '${camera}' is not in the '${arena}' catalog`);
  const url = arg('--url', 'http://127.0.0.1:4375');
  const sha = arg('--sha', sh('git', ['rev-parse', 'HEAD']));
  const install = flag('--install');
  const outRoot = path.resolve(arg('--out', path.join(root, 'artifacts', 'loading-posters', arena)));

  const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) throw new Error(`refusing capture on a dirty tree:\n${dirty}`);
  requireTool('ffmpeg', ['-version']);
  requireTool('ffprobe', ['-version']);

  const masters = JSON.parse(readFileSync(path.join(root, 'source-assets/menu/pass65-preview-masters/choreography.json'), 'utf8'));
  const posterQuality = masters.media.encodingProfiles.images.posterQuality;
  const posterBudget = masters.media.encodingBudget.maximumPosterBytes;

  // Admission: 4 GiB free before any heavy work. A memory watchdog frees
  // roughly 1 GiB every 20 minutes while the lock is contended, so WAIT —
  // poll every 20 s, never lower the floor.
  let release;
  for (;;) {
    const waiting = freeMiB();
    if (waiting < 4096) {
      console.error(`[loading-poster] ${waiting} MiB free, need 4096 — waiting for the watchdog, floor never moves`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20_000);
      continue;
    }
    release = acquireHeavyLock({ lane: 'day3-identity-loading', port: 4375, pid: process.pid, purpose: `loading-poster ${arena}/${camera}` });
    const admitted = freeMiB();
    if (admitted >= 4096) break;
    console.error(`[loading-poster] floor lost after lock (${admitted} MiB) — releasing and re-waiting`);
    release();
  }
  try {
    const label = `loading-poster-${arena}`;
    const captureOut = path.join(outRoot, 'capture');
    rmSync(captureOut, { recursive: true, force: true });
    console.error(`[loading-poster] capturing ${arena}/${camera} at ${sha.slice(0, 12)} via ${url}`);
    const child = spawnSync('node', [
      'scripts/qa/capture-arena-viewpoints.mjs',
      '--url', url, '--arenas', arena, '--cameras', camera,
      '--samples', '1', '--viewport', '2560x1440',
      '--label', label, '--sha', sha, '--out', captureOut,
    ], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (child.status !== 0) throw new Error(`capture exited ${child.status} — no poster is staged from a failed run`);
    const manifest = JSON.parse(readFileSync(path.join(captureOut, 'capture-manifest.json'), 'utf8'));
    if (manifest.verdict !== 'PASS') throw new Error(`capture verdict is ${manifest.verdict} — refusing to publish (flat-frame gate included)`);
    const frame = path.join(captureOut, arena, `${camera}.png`);
    if (!existsSync(frame)) throw new Error(`capture passed but ${frame} is missing`);
    const frameSha = sha256File(frame);

    mkdirSync(outRoot, { recursive: true });
    const staged = path.join(outRoot, `${arena}.webp`);
    sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', frame, '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(posterQuality), staged]);
    const probe = JSON.parse(sh('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', staged]));
    const stream = probe.streams.find((s) => s.codec_type === 'video');
    const bytes = Number(probe.format.size);
    if (stream?.codec_name !== 'webp') throw new Error(`${arena}.webp is not WebP`);
    if (stream?.width !== 2560 || stream?.height !== 1440) throw new Error(`${arena}.webp is ${stream?.width}x${stream?.height}, expected 2560x1440`);
    if (bytes > posterBudget) throw new Error(`${arena}.webp is ${bytes} bytes, over the ${posterBudget} budget`);
    const outputSha = sha256File(staged);

    const selfPath = 'scripts/generate-loading-poster.mjs';
    const sidecar = {
      schemaVersion: 1,
      generator: 'generate-loading-poster',
      arenaId: arena,
      camera,
      cameraCurated: curated,
      sourceSha: sha,
      capture: { label, viewport: '2560x1440', samples: 1, frameSha256: frameSha },
      output: { path: `public/assets/original/menu-previews/${arena}.webp`, sha256: outputSha, bytes, width: 2560, height: 1440, quality: posterQuality },
      generatorScript: { path: selfPath, sha256: sha256File(path.join(root, selfPath)) },
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(path.join(outRoot, `${arena}.loading-provenance.json`), `${JSON.stringify(sidecar, null, 2)}\n`);

    if (install) {
      const target = path.join(root, 'public', 'assets', 'original', 'menu-previews', `${arena}.webp`);
      const targetSidecar = path.join(root, 'public', 'assets', 'original', 'menu-previews', `${arena}.loading-provenance.json`);
      writeFileSync(target, readFileSync(staged));
      writeFileSync(targetSidecar, readFileSync(path.join(outRoot, `${arena}.loading-provenance.json`)));
      console.log(JSON.stringify({ arena, camera, sourceSha: sha, installed: [target, targetSidecar], bytes }, null, 2));
    } else {
      console.log(JSON.stringify({ arena, camera, sourceSha: sha, staged, sidecar: path.join(outRoot, `${arena}.loading-provenance.json`), bytes, install: `node scripts/generate-loading-poster.mjs --arena ${arena} --camera ${camera} --url ${url} --sha ${sha} --install` }, null, 2));
    }
  } finally {
    release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
