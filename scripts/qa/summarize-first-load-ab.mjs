#!/usr/bin/env node
// ===========================================================================
// FIRST-LOAD A/B — one row per (arena, build), read against an internal control.
//
// WHY
// ---
// Lane H's first pass published a 52% first-load regression measured as two
// BLOCKS of runs 40 minutes apart, on a workstation where two other lanes were
// driving headless Chrome. A later run of the same baseline read 15% different.
// A block design assigns whatever the room did to one arm.
//
// The instrument that fixes that is not in this file - it is the run plan:
// baseline and candidate measured BACK TO BACK per arena, each as its own
// process and its own receipt (probe-arena-switch-matrix.mjs --sources <arena>
// --targets <any> --session-edges 1). This file only reads those receipts and
// puts the CONTROL beside every delta.
//
// `control` is the mean of the seven prewarm families no load-cut in this lane
// touches. A row whose control moved as much as its total did not measure code.
//
// USAGE
//   node scripts/qa/summarize-first-load-ab.mjs \
//     --pair label=gun-range,base=<a.json>,cand=<b.json> [--pair ...]
// ===========================================================================
import { readFileSync } from 'node:fs';

const CONTROL_FAMILIES = ['tracers-impacts', 'explosions', 'smoke-volumes', 'world-ordnance',
  'nuke-overdrive-bolts', 'bot-world-weapons', 'death-drops-glass'];
const PHASES = ['visual-definition', 'coverage-submit-fence', 'prewarm-batched-effects', 'weapon-catalog-prewarm'];

const pairs = [];
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] !== '--pair') continue;
  const spec = Object.fromEntries((argv[index + 1] ?? '').split(',').map((entry) => entry.split('=')));
  if (!spec.base || !spec.cand) throw new Error(`--pair needs base= and cand=: ${argv[index + 1]}`);
  pairs.push(spec);
}
if (pairs.length === 0) throw new Error('no --pair given');

const row = (file) => {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const load = report.firstLoads?.[0];
  if (!load) throw new Error(`${file} has no first-load row`);
  const groups = new Map(load.effectPrewarm?.groups ?? []);
  const control = CONTROL_FAMILIES.map((name) => groups.get(name)).filter((value) => typeof value === 'number');
  const phase = (name) => {
    const entry = (load.phases ?? []).find((candidate) => candidate.phase === name);
    return entry ? Math.round(entry.durationMs) : null;
  };
  return {
    total: load.ms, transition: Math.round(load.transitionMs), deploy: load.deployMs,
    control: control.length ? Math.round(control.reduce((a, b) => a + b, 0) / control.length) : null,
    phases: Object.fromEntries(PHASES.map((name) => [name, phase(name)])),
    rivals: report.machine?.rivalPlaywrightBrowsersAtLaunch ?? null,
    vram: report.machine?.gpuFreeMiB ?? null,
    sha: report.gitSha ?? null,
  };
};
const ratio = (after, before) => (typeof after === 'number' && before ? `x${(after / before).toFixed(2)}` : '—');
const pad = (value, width) => String(value ?? '—').padEnd(width);
const padStart = (value, width) => String(value ?? '—').padStart(width);

for (const pair of pairs) {
  const before = row(pair.base);
  const after = row(pair.cand);
  console.log(`\n## ${pair.label ?? pair.base} — base vs candidate (n=1 each, measured back to back)\n`);
  console.log(`  base      rivals ${before.rivals}, ${before.vram} MiB free`);
  console.log(`  candidate rivals ${after.rivals}, ${after.vram} MiB free`);
  console.log(`\n${pad('metric', 26)}${padStart('base', 10)}${padStart('cand', 10)}${padStart('delta', 10)}${padStart('ratio', 8)}`);
  const line = (name, b, a) => console.log(`${pad(name, 26)}${padStart(b, 10)}${padStart(a, 10)}`
    + `${padStart(typeof b === 'number' && typeof a === 'number' ? a - b : null, 10)}${padStart(ratio(a, b), 8)}`);
  line('first load total', before.total, after.total);
  line('  transition', before.transition, after.transition);
  line('  deploy (admission)', before.deploy, after.deploy);
  line('CONTROL (7 untouched)', before.control, after.control);
  for (const name of PHASES) line(`  ${name}`, before.phases[name], after.phases[name]);
  console.log('\n  Read every ratio against CONTROL. A total that moved with the control moved with the machine.');
}
console.log('');
