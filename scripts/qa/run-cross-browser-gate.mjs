#!/usr/bin/env node
// THE STANDING CROSS-BROWSER GATE - one command, whole matrix, fails closed.
//
// The owner's row is "working in chrome edge firefox safari and opera all ok,
// and on mobiles", and the audit finding was that cross-browser coverage should
// be a standing MECHANICAL gate rather than a thing someone remembers to check.
// This is that gate. `npm run qa:cross-browser` runs three stages and returns
// one exit code:
//
//   1. CEILING   - what frame rate each installed browser can present at all on
//                  this machine, with no game involved. Without it a game frame
//                  rate cannot be judged: 60 fps against a 60 Hz vsync cap is
//                  perfect and 60 fps against a 166 Hz ceiling is a third of the
//                  machine thrown away. This desktop has presented at both
//                  within the same hour, so the ceiling is measured every run
//                  and never assumed.
//   2. MATRIX    - every browser x every arena: backend actually taken, boot,
//                  in-match frame rate, console errors, HUD legibility.
//   3. MOBILE    - phone and tablet viewports, and whether the game is actually
//                  playable with touch rather than merely laid out for it.
//
// FAILS CLOSED, and the distinction the audit asked for is enforced here:
// SKIPPED (browser not installed) is NEVER a pass. It is an uncovered browser.
// The gate reports it as a coverage hole and, for any browser named in
// --require, fails on it.
//
// Usage:
//   node scripts/qa/run-cross-browser-gate.mjs
//     [--url http://127.0.0.1:41876] [--arenas a,b] [--sample-ms 8000]
//     [--lanes ...] [--require chrome,edge,firefox] [--skip-ceiling]
//     [--skip-mobile] [--min-median-fps 0]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const list = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

// Owner 2026-08-30: same fix as verify-cross-browser-matrix.mjs. A hardcoded
// arena list here meant test1/test2 were never opened in any browser by the
// gate; deriving it from the source roster makes new arenas covered by default.
function selectableArenaIds() {
  const source = readFileSync(resolve(HERE, '../../src/map-selection.ts'), 'utf8');
  const body = source.slice(source.indexOf('ARENA_SELECTIONS'));
  const found = [...body.matchAll(/id:\s*'([a-z0-9-]+)'\s*as const/g)];
  const ids = [];
  for (let i = 0; i < found.length; i += 1) {
    const start = found[i].index;
    const end = i + 1 < found.length ? found[i + 1].index : body.length;
    if (!/selectable:\s*false/.test(body.slice(start, end))) ids.push(found[i][1]);
  }
  if (ids.length === 0) throw new Error('cross-browser gate: could not derive any selectable arena from src/map-selection.ts');
  return ids;
}


const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENAS = arg('--arenas', selectableArenaIds().join(','));
const SAMPLE_MS = arg('--sample-ms', '8000');
const LANES = arg('--lanes', 'chrome,edge,firefox,opera,webkit,mobile,tablet');
// Default required set = the browsers actually installed here. Opera is
// deliberately NOT in it: it is not installed on this machine, and a gate that
// can never go green is a gate people switch off. It still reports SKIPPED, and
// `--require opera` is how the owner's full row is held to account once it is
// installed.
const REQUIRED = arg('--require', 'chrome,edge,firefox');
const MIN_MEDIAN_FPS = arg('--min-median-fps', '0');
// Receiver ports are passed through so a second gate (or a lane being debugged
// alongside one) does not collide with a run already in flight.
const MATRIX_PORT = arg('--port', '9913');
const CEILING_PORT = arg('--ceiling-port', '9915');
const OUT_DIR = resolve(process.cwd(), arg('--out-dir', 'artifacts/qa/cross-browser-gate'));
const SKIP_CEILING = argv.includes('--skip-ceiling');
const SKIP_MOBILE = argv.includes('--skip-mobile');

mkdirSync(OUT_DIR, { recursive: true });

const stages = [];
const runStage = (name, script, stageArgs, receiptPath) => {
  console.error(`\n================ ${name} ================`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [resolve(HERE, script), ...stageArgs], {
    stdio: 'inherit',
    windowsHide: true,
  });
  const receipt = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, 'utf8'))
    : null;
  const record = {
    stage: name,
    script,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - started,
    receiptPath,
    verdict: receipt?.verdict ?? (result.status === 0 ? 'PASS' : 'FAIL'),
  };
  stages.push({ ...record, receipt });
  return record;
};

// ---------------------------------------------------------------------------
const ceilingReceipt = resolve(OUT_DIR, 'browser-refresh-ceiling.json');
if (!SKIP_CEILING) {
  runStage('1/3 BROWSER PRESENTATION CEILING', 'measure-refresh-ceiling.mjs', [
    '--browsers', 'chrome,edge,firefox,opera',
    '--port', CEILING_PORT,
    '--sample-ms', '4000',
    '--passes', '24',
    '--out', ceilingReceipt,
  ], ceilingReceipt);
}

const matrixReceipt = resolve(OUT_DIR, 'cross-browser-matrix.json');
const matrix = runStage('2/3 BROWSER x ARENA MATRIX', 'verify-cross-browser-matrix.mjs', [
  '--url', BASE,
  '--arenas', ARENAS,
  '--lanes', LANES,
  '--sample-ms', SAMPLE_MS,
  '--require', REQUIRED,
  '--port', MATRIX_PORT,
  '--min-median-fps', MIN_MEDIAN_FPS,
  '--out', matrixReceipt,
], matrixReceipt);

const mobileReceipt = resolve(OUT_DIR, 'mobile-touch-playability.json');
let mobile = null;
if (!SKIP_MOBILE) {
  mobile = runStage('3/3 MOBILE TOUCH PLAYABILITY', 'verify-mobile-touch-playability.mjs', [
    '--url', BASE,
    '--viewports', '390x844,768x1024',
    '--out', mobileReceipt,
  ], mobileReceipt);
}

// ---------------------------------------------------------------------------
// One verdict. The ceiling stage is EVIDENCE, not a gate - a browser that
// cannot be launched to measure its ceiling is already caught by the matrix,
// and failing the gate twice for one fault teaches people to ignore it.
const gating = [matrix, mobile].filter(Boolean);
const failedStages = gating.filter((stage) => stage.exitCode !== 0).map((stage) => stage.stage);
const verdict = failedStages.length === 0 ? 'PASS' : 'FAIL';

const matrixData = stages.find((stage) => stage.script === 'verify-cross-browser-matrix.mjs')?.receipt ?? null;
const summary = {
  verdict,
  measuredAt: new Date().toISOString(),
  failedStages,
  // Repeated at the top because this is the number the audit row turns on: a
  // browser nobody could test is not a browser that works.
  coverage: matrixData ? {
    measured: (matrixData.lanes ?? []).filter((lane) => lane.verdict === 'pass' || lane.verdict === 'fail').map((lane) => lane.lane),
    skippedNotInstalled: matrixData.notInstalled ?? [],
    blockedUnmeasured: matrixData.blockedLanes ?? [],
    requiredMissingOrBlocked: matrixData.requiredMissingOrBlocked ?? [],
  } : null,
  stages: stages.map(({ receipt, ...rest }) => rest),
};
writeFileSync(resolve(OUT_DIR, 'gate-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log('\n================ CROSS-BROWSER GATE ================');
for (const stage of stages) console.log(`${stage.exitCode === 0 ? 'PASS' : 'FAIL'}  ${stage.stage}  (${Math.round(stage.elapsedMs / 1000)}s)  ${stage.receiptPath}`);
if (summary.coverage) {
  console.log(`\nmeasured: ${summary.coverage.measured.join(', ') || '(none)'}`);
  if (summary.coverage.skippedNotInstalled.length) {
    console.log(`SKIPPED (not installed, NOT a pass): ${summary.coverage.skippedNotInstalled.join(', ')}`);
  }
  if (summary.coverage.blockedUnmeasured.length) {
    console.log(`BLOCKED (nothing measured, NOT a pass): ${summary.coverage.blockedUnmeasured.join(', ')}`);
  }
}
console.log(`\nverdict=${verdict}  summary=${resolve(OUT_DIR, 'gate-summary.json')}`);
process.exit(verdict === 'PASS' ? 0 : 1);
