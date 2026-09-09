#!/usr/bin/env node
// Arena viewpoint regression — ONE-COMMAND ROUND RUNNER.
//
// Answers "is the game worse than yesterday?" in one invocation:
//   1. builds the CURRENT tree into its own dist (never the shared preview,
//      never another agent's dist-vr tree),
//   2. serves it on :41931 (short-lived, reaped by the capture script),
//   3. captures every authored review camera on real WebGPU via
//      capture-arena-viewpoints.mjs (installed Chrome headless — no governor
//      browser slot needed),
//   4. diffs against a stored baseline via diff-arena-viewpoints.mjs and
//      propagates its verdict as this script's exit code.
//
// First round on a new machine/branch: seed the baseline, do not judge:
//   node scripts/qa/run-arena-viewpoint-regression.mjs --update-baseline
// Every later round:
//   node scripts/qa/run-arena-viewpoint-regression.mjs
// Exit 0 = CLEAN (no persistent visual change vs baseline). Exit 1 = DIFFS.
// Exit 2 = environment/build problem; the measurement is void, never green.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const ROOT = resolve(import.meta.dirname, '..', '..');
const DIST = resolve(ROOT, arg('--dist', 'dist-vp-regression'));
const LABEL = arg('--label', 'round');
const BASELINE = resolve(ROOT, arg('--baseline', 'artifacts/viewpoint-regression/baseline'));
const CAPTURE_DIR = resolve(ROOT, `artifacts/viewpoint-regression/${LABEL}`);
const UPDATE_BASELINE = flag('--update-baseline');
const NO_BUILD = flag('--no-build');

const extraArgs = [];
if (argv.includes('--arenas')) extraArgs.push('--arenas', arg('--arenas', ''));
if (argv.includes('--samples')) extraArgs.push('--samples', arg('--samples', ''));

console.error(`[vp-regression] root=${ROOT}`);
process.chdir(ROOT);

let sha;
try {
  sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  console.error('[vp-regression] git rev-parse failed; refusing to capture an unattributable build');
  process.exit(2);
}
console.error(`[vp-regression] sha=${sha}`);

if (!NO_BUILD) {
  // A stale or foreign served bundle poisons every measurement; always build
  // this exact tree unless --no-build --dist <dir> is passed deliberately.
  console.error(`[vp-regression] building into ${DIST}`);
  const build = spawnSync('npx', ['vite', 'build', '--outDir', DIST],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) {
    console.error(`[vp-regression] vite build failed (status ${build.status})`);
    process.exit(2);
  }
} else if (!existsSync(DIST)) {
  console.error(`[vp-regression] --no-build given but dist missing at ${DIST}`);
  process.exit(2);
}

// Stale shots from a previous run must never masquerade as this run's output.
rmSync(CAPTURE_DIR, { recursive: true, force: true });

console.error('[vp-regression] capturing viewpoints');
const capture = spawnSync('node',
  ['scripts/qa/capture-arena-viewpoints.mjs',
    '--serve-dist', DIST, '--label', LABEL, '--sha', sha,
    ...extraArgs],
  { stdio: 'inherit' });
if (capture.status !== 0) {
  // 2 = invalidated environment (wrong backend/GPU), 1 = arena failure.
  console.error(`[vp-regression] capture did not pass (status ${capture.status}); no verdict`);
  process.exit(capture.status ?? 2);
}

if (UPDATE_BASELINE) {
  rmSync(BASELINE, { recursive: true, force: true });
  cpSync(CAPTURE_DIR, BASELINE, { recursive: true });
  console.error(`[vp-regression] baseline seeded from ${LABEL} at ${sha} -> ${BASELINE}`);
  process.exit(0);
}

if (!existsSync(resolve(BASELINE, 'capture-manifest.json'))) {
  console.error(`[vp-regression] no baseline at ${BASELINE}; seed one first with --update-baseline`);
  process.exit(2);
}

console.error('[vp-regression] diffing against baseline');
const diff = spawnSync('node',
  ['scripts/qa/diff-arena-viewpoints.mjs', '--base', BASELINE, '--candidate', CAPTURE_DIR],
  { stdio: 'inherit' });
// Propagate the diff verdict verbatim: 0 CLEAN, 1 DIFFS, 2 invalid comparison.
process.exit(diff.status ?? 2);
