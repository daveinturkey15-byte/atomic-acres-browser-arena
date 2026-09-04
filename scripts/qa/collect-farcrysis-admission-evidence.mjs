#!/usr/bin/env node
// Lane R (Pass 87, HF-423): collects farcrysis admission evidence by running N
// paired farcrysis vs atomic-acres browser boots and writing the admission
// receipt the publish guard reads.
//
// Usage: node scripts/qa/collect-farcrysis-admission-evidence.mjs
//   --dist <dir>  built bundle directory (default: dist)
//   --runs <n>    paired run rounds (default: 3)
//   --out <path>  receipt output path (default: docs/evidence/pass87/lane-r/farcrysis-admission.json)
//   Env vars: none read.
//
// Writes: receipt JSON at --out (creating its directory); per-run probe reports
// under artifacts/qa/farcrysis-load/ via the child probe.
//
// Exit codes: no explicit process.exit call; 0 on success, 1 on unhandled throw
// (GPU memory refusal, probe or child failure).

// Lane R (PASS 87, HF-423) — the ADMISSION RECEIPT the publish guard reads.
//
//   node scripts/qa/collect-farcrysis-admission-evidence.mjs \
//     [--dist dist] [--runs 3] [--out docs/evidence/pass87/lane-r/farcrysis-admission.json]
//
// Un-hiding farcrysis replaces a guard that could be satisfied by a flag
// (`selectable:!1` in the published bytes) with one that can only be satisfied
// by evidence. This script produces that evidence, and it is deliberately shaped
// so that a contended machine cannot flatter the result:
//
//   * Every farcrysis run is PAIRED with an atomic-acres run taken in the same
//     machine window, through the identical probe. The publish guard's ceiling
//     is a RATIO against that same-run control, never an absolute millisecond
//     budget - an absolute budget is a fence, and a fence that moves when the
//     machine is busy is a fence that has been widened.
//   * The pairs alternate (farcrysis, atomic-acres, farcrysis, ...) so a slow
//     stretch of the machine lands on both arenas rather than on one.
//   * The receipt records the git SHA of the tree it measured, the GPU memory
//     in use at each launch and whether the owner's ComfyUI queue was busy, so
//     a reader can tell a quiet number from a contended one instead of
//     guessing.
//
// One browser at a time: the probe launches and closes its own, and this
// script runs them strictly in sequence.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const DIST = arg('--dist', 'dist');
const RUNS = Number(arg('--runs', '3'));
const OUT = resolve(arg('--out', 'docs/evidence/pass87/lane-r/farcrysis-admission.json'));
const ARENAS = ['farcrysis', 'atomic-acres'];

function gpuMemoryUsedMiB() {
  const p = spawnSync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'],
    { encoding: 'utf8' });
  if (p.status !== 0) return null;
  const [used, total] = p.stdout.trim().split(',').map((v) => Number(v.trim()));
  return { usedMiB: used, totalMiB: total, freeMiB: total - used };
}

async function comfyBusy() {
  try {
    const res = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(4000) });
    const body = await res.json();
    return {
      reachable: true,
      running: (body.queue_running ?? []).length,
      pending: (body.queue_pending ?? []).length,
    };
  } catch {
    return { reachable: false, running: 0, pending: 0 };
  }
}

function probe(arena, label) {
  const out = `artifacts/qa/farcrysis-load/${label}.json`;
  execFileSync(process.execPath, [
    'scripts/qa/probe-farcrysis-boot-cdp.mjs',
    '--dist', DIST, '--arena', arena, '--label', label, '--out', out,
  ], { stdio: 'inherit', timeout: 900_000 });
  return JSON.parse(readFileSync(resolve(out), 'utf8'));
}

/**
 * A digest of the BUILT BUNDLE this receipt measured.
 *
 * The obvious identifier is the git SHA, and it is recorded below, but it
 * cannot be what a publish guard checks: committing the receipt changes HEAD,
 * so a receipt pinned to HEAD can never match the tree that contains it. The
 * bundle bytes have no such circularity - they are what actually gets served,
 * they are what the probe actually loaded, and they do not move when a doc
 * file is committed beside them.
 */
function distDigest(distDir) {
  const assets = join(resolve(distDir), 'assets');
  const files = readdirSync(assets).filter((name) => name.endsWith('.js')).sort();
  const hash = createHash('sha256');
  for (const name of files) {
    hash.update(name);
    hash.update(readFileSync(join(assets, name)));
  }
  return { sha256: hash.digest('hex'), files: files.length };
}

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const bundle = distDigest(DIST);
const runs = [];
for (let i = 1; i <= RUNS; i += 1) {
  for (const arena of ARENAS) {
    const label = `pass87-admission-${arena}-run${i}`;
    // Machine rule: at least 3000 MiB of GPU memory free before a browser
    // launch, and the owner's ComfyUI shares this card. Wait for it rather than
    // taking the measurement anyway - a run that starts with the GPU full is
    // not a slow arena, it is a busy machine, and it would poison the receipt.
    let gpu = gpuMemoryUsedMiB();
    for (let wait = 0; gpu && gpu.freeMiB < 3000 && wait < 10; wait += 1) {
      console.log(`[admission] ${gpu.freeMiB} MiB free, need 3000 - waiting 60 s (${wait + 1}/10)`);
      await new Promise((done) => { setTimeout(done, 60_000); });
      gpu = gpuMemoryUsedMiB();
    }
    if (gpu && gpu.freeMiB < 3000) {
      throw new Error(`refusing to launch: only ${gpu.freeMiB} MiB of GPU memory free (need 3000) after 10 minutes of waiting`);
    }
    const comfy = await comfyBusy();
    const report = probe(arena, label);
    runs.push({
      run: i,
      arena,
      label,
      outcome: report.outcome,
      crashed: report.crashed === true,
      pageErrors: report.pageErrors ?? [],
      consoleErrors: report.consoleErrors ?? [],
      menuPipelines: report.menu?.pipelines ?? null,
      selectToAdmittedMs: report.timings?.selectToAdmittedMs ?? null,
      selectToActiveMs: report.timings?.selectToActiveMs ?? null,
      totalToActiveMs: report.totalToActiveMs ?? null,
      gpuAtLaunch: gpu,
      comfyAtLaunch: comfy,
      measuredAt: report.measuredAt,
    });
    console.log(`[admission] ${arena} run ${i}: ${report.outcome} `
      + `selectToAdmitted=${report.timings?.selectToAdmittedMs} ms `
      + `pipelines=${report.menu?.pipelines}`);
  }
}

const of = (arena, key) => runs.filter((r) => r.arena === arena).map((r) => r[key]);
const max = (xs) => xs.reduce((a, b) => Math.max(a, b), -Infinity);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pairRatios = [];
for (let i = 1; i <= RUNS; i += 1) {
  const f = runs.find((r) => r.arena === 'farcrysis' && r.run === i);
  const a = runs.find((r) => r.arena === 'atomic-acres' && r.run === i);
  if (f?.selectToAdmittedMs && a?.selectToAdmittedMs) {
    pairRatios.push(Number((f.selectToAdmittedMs / a.selectToAdmittedMs).toFixed(4)));
  }
}
const contended = runs.some((r) => r.comfyAtLaunch.running > 0 || r.comfyAtLaunch.pending > 0);

const receipt = {
  contract: 'farcrysis-admission-evidence-v1',
  measuredAt: new Date().toISOString(),
  sha,
  shaNote: 'informational only - committing this receipt changes HEAD, so a guard '
    + 'must key on bundle.sha256, which names the bytes the probe actually loaded',
  bundle,
  dist: resolve(DIST),
  runs: RUNS,
  arenas: ARENAS,
  contended,
  contendedNote: contended
    ? 'the owner ComfyUI queue was busy during at least one launch: the ABSOLUTE '
      + 'milliseconds are void, the same-window PAIR RATIO is the number to read'
    : 'no ComfyUI work queued at any launch',
  summary: {
    allAdmitted: runs.every((r) => r.outcome === 'admitted'),
    anyCrashed: runs.some((r) => r.crashed),
    anyPageErrors: runs.some((r) => r.pageErrors.length > 0),
    maxMenuPipelines: max(runs.map((r) => r.menuPipelines ?? 0)),
    farcrysisSelectToAdmittedMs: {
      mean: Math.round(mean(of('farcrysis', 'selectToAdmittedMs'))),
      max: max(of('farcrysis', 'selectToAdmittedMs')),
    },
    atomicSelectToAdmittedMs: {
      mean: Math.round(mean(of('atomic-acres', 'selectToAdmittedMs'))),
      max: max(of('atomic-acres', 'selectToAdmittedMs')),
    },
    pairRatios,
    worstPairRatio: Number(max(pairRatios).toFixed(4)),
  },
  runsDetail: runs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`\nwrote ${OUT}`);
console.log(`  all admitted: ${receipt.summary.allAdmitted}; max menu pipelines: `
  + `${receipt.summary.maxMenuPipelines}; worst farcrysis/atomic-acres pair ratio: `
  + `${receipt.summary.worstPairRatio}`);
