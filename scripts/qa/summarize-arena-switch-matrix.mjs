#!/usr/bin/env node
// Renders one or two `probe-arena-switch-matrix.mjs` reports as the tables a
// lane report needs: per-arena first-load costs, per-phase medians, where the
// pipelines were compiled, the PAIRED per-edge delta, and the before/after
// comparison of every column it prints.
//
//   node scripts/qa/summarize-arena-switch-matrix.mjs before.json [after.json]
//
// TWO RULES, both written after PASS 85 lane H reported numbers this script
// made easy to misread:
//
//  1. EVERY column that exists for `before` prints its `after` value too. The
//     first cut printed the in-fence pipeline column for `before` only and the
//     first-load timings for `before` only, and both omissions happened to hide
//     numbers that ran against the lane's headline.
//  2. Whole-switch time is compared PAIRWISE over the edges that committed in
//     BOTH runs, with a bootstrap interval and a sign test. Comparing two
//     independent percentile ladders lets you pick the percentile that flatters
//     you (p90 improved while the paired median regressed), and 55 edges of
//     n=1 on a shared GPU are noisy enough that a point estimate alone is not
//     an answer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath) { console.error('usage: summarize-arena-switch-matrix.mjs <before.json> [after.json]'); process.exit(2); }
const load = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
const before = load(beforePath);
const after = afterPath ? load(afterPath) : null;

const median = (values) => {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  return sorted.length ? Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)) : null;
};
const mean = (values) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : null);
const pad = (value, width) => String(value ?? '-').padEnd(width);
const padStart = (value, width) => String(value ?? '-').padStart(width);
const pairKey = (edge) => `${edge.source}->${edge.target}`;

function phaseMedians(report) {
  const buckets = new Map();
  for (const edge of report.edges) {
    for (const entry of edge.phases ?? []) {
      if (!buckets.has(entry.phase)) buckets.set(entry.phase, []);
      buckets.get(entry.phase).push(entry.durationMs);
    }
  }
  return [...buckets].map(([phase, values]) => ({ phase, median: median(values), max: Math.max(...values) }))
    .sort((a, b) => b.median - a.median);
}

function pipelinesByPhase(report, field = 'pipelinesByPhase') {
  const buckets = new Map();
  for (const edge of report.edges) {
    for (const [phase, count] of Object.entries(edge[field] ?? {})) {
      if (!buckets.has(phase)) buckets.set(phase, []);
      buckets.get(phase).push(count);
    }
  }
  return [...buckets].map(([phase, values]) => ({ phase, median: median(values), total: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.median - a.median);
}

// A report from the probe's first cut has no sync/async split: its
// `pipelinesByPhase` is sync+async in one bucket, so an "in-fence" figure
// derived from it counts off-fence `createRenderPipelineAsync` work as fenced.
// Say so in the column heading rather than printing a number that reads as
// something it is not.
const hasSyncSplit = (report) => report.edges.some((edge) => edge.pipelinesSyncByPhase);
const fencedField = (report) => (hasSyncSplit(report) ? 'pipelinesSyncByPhase' : 'pipelinesByPhase');
const fencedLabel = (report) => (hasSyncSplit(report) ? 'in-fence' : 'fenced?*');
const fencedCount = (edge, field) => (edge[field]?.['visual-definition'] ?? 0) + (edge[field]?.['coverage-submit-fence'] ?? 0);

function perTarget(report) {
  const field = fencedField(report);
  const buckets = new Map();
  for (const edge of report.edges) {
    if (!buckets.has(edge.target)) buckets.set(edge.target, []);
    buckets.get(edge.target).push(edge);
  }
  return [...buckets].map(([arena, edges]) => ({
    arena,
    edges: edges.length,
    failed: edges.filter((edge) => !edge.ok).length,
    transitionMs: median(edges.map((edge) => edge.transitionMs)),
    pipelines: median(edges.map((edge) => edge.pipelinesCreated)),
    modules: median(edges.map((edge) => edge.shaderModulesCreated)),
    fenced: median(edges.map((edge) => fencedCount(edge, field))),
  })).sort((a, b) => (b.transitionMs ?? 0) - (a.transitionMs ?? 0));
}

function section(title) { console.log(`\n## ${title}\n`); }

console.log(`# arena switch matrix — ${before.label}${after ? ` vs ${after.label}` : ''}`);
for (const report of [before, after].filter(Boolean)) {
  const machine = report.machine ?? {};
  console.log(`\n${report.label}: sha ${report.gitSha?.slice(0, 8)}`
    + `${report.gitDirty ? ` +${report.gitDirtyFiles?.length ?? '?'} UNCOMMITTED FILES` : report.gitDirty === false ? ' (clean tree)' : ' (dirt unknown)'}, `
    + `${report.summary?.edges ?? report.edges.length} edges, ${report.summary?.failed ?? '?'} failed, `
    + `ComfyUI ${machine.comfyUi}, GPU ${machine.gpuFreeMiB}/${machine.gpuTotalMiB} MiB free`);
  console.log(`  rival Playwright Chromes: ${machine.rivalPlaywrightBrowsersAtLaunch ?? '?'} at launch, `
    + `${machine.rivalPlaywrightBrowsersMaxDuringRun ?? 'NOT SAMPLED'} max during the run `
    + `(${machine.playwrightChromeProcessSamples ?? 0} samples). A launch-only zero says nothing about the sweep.`);
  if (report.summary?.failedPairs?.length) console.log(`  FAILED: ${report.summary.failedPairs.join(', ')}`);
}
if (!hasSyncSplit(before) || (after && !hasSyncSplit(after))) {
  console.log('\n  *fenced? = visual-definition + coverage-submit-fence pipelines from a report with NO'
    + '\n   sync/async split, so it counts off-fence createRenderPipelineAsync work as fenced.'
    + '\n   It cannot answer "did work move off the fence"; only a re-run with the split probe can.');
}

section('switch INTO each arena (median over every source)');
console.log(`${pad('arena', 18)}${padStart('edges', 6)}${padStart('fail', 5)}${padStart('switch ms', 11)}${padStart('pipelines', 11)}${padStart('modules', 9)}${padStart(fencedLabel(before), 10)}`
  + (after ? `${padStart('after ms', 10)}${padStart('delta', 9)}${padStart('a-pipes', 9)}${padStart(`a-${fencedLabel(after)}`, 12)}` : ''));
const afterByTarget = after ? new Map(perTarget(after).map((row) => [row.arena, row])) : null;
for (const row of perTarget(before)) {
  const other = afterByTarget?.get(row.arena);
  const delta = other && row.transitionMs ? `${(((other.transitionMs - row.transitionMs) / row.transitionMs) * 100).toFixed(0)}%` : null;
  console.log(`${pad(row.arena, 18)}${padStart(row.edges, 6)}${padStart(row.failed, 5)}${padStart(row.transitionMs, 11)}`
    + `${padStart(row.pipelines, 11)}${padStart(row.modules, 9)}${padStart(row.fenced, 10)}`
    + (after ? `${padStart(other?.transitionMs, 10)}${padStart(delta, 9)}${padStart(other?.pipelines, 9)}${padStart(other?.fenced, 12)}` : ''));
}

if (after) {
  section('PAIRED whole-switch delta (edges that committed in BOTH runs)');
  const beforeEdges = new Map(before.edges.map((edge) => [pairKey(edge), edge]));
  const afterEdges = new Map(after.edges.map((edge) => [pairKey(edge), edge]));
  const paired = [...beforeEdges.keys()]
    .filter((key) => afterEdges.has(key) && beforeEdges.get(key).ok && afterEdges.get(key).ok)
    .map((key) => ({ key, b: beforeEdges.get(key).transitionMs, a: afterEdges.get(key).transitionMs }))
    .filter((row) => typeof row.b === 'number' && typeof row.a === 'number')
    .map((row) => ({ ...row, delta: row.a - row.b }));
  const deltas = paired.map((row) => row.delta);
  const slower = deltas.filter((value) => value > 0).length;
  // Bootstrap because the per-edge spread is enormous next to the effect: an
  // interval that spans zero means this run cannot tell you the direction.
  const bootstrap = (fn) => {
    const draws = [];
    for (let i = 0; i < 4000; i += 1) {
      draws.push(fn(deltas.map(() => deltas[Math.floor(Math.random() * deltas.length)])));
    }
    draws.sort((a, b) => a - b);
    return [Math.round(draws[Math.floor(draws.length * 0.025)]), Math.round(draws[Math.floor(draws.length * 0.975)])];
  };
  const rawMedian = (values) => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const rawMean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const lchoose = (n, k) => { let total = 0; for (let i = 0; i < k; i += 1) total += Math.log(n - i) - Math.log(i + 1); return total; };
  let tail = 0;
  for (let i = slower; i <= deltas.length; i += 1) tail += Math.exp(lchoose(deltas.length, i) + deltas.length * Math.log(0.5));
  console.log(`paired edges          ${deltas.length}`);
  console.log(`median delta          ${rawMedian(deltas).toFixed(0)} ms   95% CI [${bootstrap(rawMedian).join(', ')}]`);
  console.log(`mean delta            ${rawMean(deltas).toFixed(0)} ms   95% CI [${bootstrap(rawMean).join(', ')}]`);
  console.log(`slower after          ${slower}/${deltas.length}   sign test two-sided p=${Math.min(1, 2 * tail).toFixed(3)}`);
  console.log(`per-edge sd           ${Math.sqrt(deltas.reduce((sum, d) => sum + (d - rawMean(deltas)) ** 2, 0) / (deltas.length - 1)).toFixed(0)} ms  (n=1 per edge)`);
  const sorted = [...paired].sort((x, y) => y.delta - x.delta);
  console.log('worst regressions:', sorted.slice(0, 3).map((row) => `${row.key} ${row.b.toFixed(0)}->${row.a.toFixed(0)}`).join('; '));
  console.log('best improvements:', sorted.slice(-3).map((row) => `${row.key} ${row.b.toFixed(0)}->${row.a.toFixed(0)}`).join('; '));
}

section('transition phases, median ms over every edge');
const afterPhases = after ? new Map(phaseMedians(after).map((row) => [row.phase, row])) : null;
console.log(`${pad('phase', 34)}${padStart('median', 9)}${padStart('max', 9)}` + (after ? `${padStart('after', 9)}${padStart('a-max', 9)}` : ''));
for (const row of phaseMedians(before)) {
  const other = afterPhases?.get(row.phase);
  console.log(`${pad(row.phase, 34)}${padStart(row.median, 9)}${padStart(Number(row.max.toFixed(1)), 9)}`
    + (after ? `${padStart(other?.median, 9)}${padStart(other ? Number(other.max.toFixed(1)) : null, 9)}` : ''));
}

section('render pipelines created, by transition phase (median per switch)');
const afterPipes = after ? new Map(pipelinesByPhase(after).map((row) => [row.phase, row])) : null;
console.log(`${pad('phase', 34)}${padStart('median', 9)}${padStart('total', 9)}` + (after ? `${padStart('after', 9)}${padStart('total', 9)}` : ''));
for (const row of pipelinesByPhase(before)) {
  console.log(`${pad(row.phase, 34)}${padStart(row.median, 9)}${padStart(row.total, 9)}`
    + (after ? `${padStart(afterPipes?.get(row.phase)?.median, 9)}${padStart(afterPipes?.get(row.phase)?.total, 9)}` : ''));
}

section('effect prewarm families, median ms per switch');
const groupBuckets = new Map();
for (const edge of before.edges) for (const [name, ms] of edge.effectPrewarm?.groups ?? []) {
  if (!groupBuckets.has(name)) groupBuckets.set(name, []);
  groupBuckets.get(name).push(ms);
}
const afterGroups = new Map();
if (after) for (const edge of after.edges) for (const [name, ms] of edge.effectPrewarm?.groups ?? []) {
  if (!afterGroups.has(name)) afterGroups.set(name, []);
  afterGroups.get(name).push(ms);
}
console.log(`${pad('family', 26)}${padStart('median', 9)}` + (after ? `${padStart('after', 9)}` : ''));
for (const [name, values] of [...groupBuckets].sort((a, b) => median(b[1]) - median(a[1]))) {
  console.log(`${pad(name, 26)}${padStart(median(values), 9)}`
    + (after ? `${padStart(afterGroups.has(name) ? median(afterGroups.get(name)) : null, 9)}` : ''));
}

// n=1 per arena per run, and the rows are taken at different points in a
// ~50-minute sweep, so a first-load delta is not a measurement of the change on
// its own. The untouched families in the SAME row are the internal control:
// when they move by the same factor, the row moved, not the code.
section('first load per arena (boot -> live match), n=1 per run');
const CONTROL_FAMILIES = ['tracers-impacts', 'explosions', 'smoke-volumes', 'world-ordnance', 'nuke-overdrive-bolts', 'bot-world-weapons', 'death-drops-glass'];
const firstLoadRows = (report) => {
  const rows = new Map();
  for (const entry of report.firstLoads ?? []) if (!rows.has(entry.arena)) rows.set(entry.arena, entry);
  return rows;
};
const controlMs = (entry) => {
  const groups = new Map(entry.effectPrewarm?.groups ?? []);
  const values = CONTROL_FAMILIES.map((name) => groups.get(name)).filter((value) => typeof value === 'number');
  return values.length ? mean(values) : null;
};
const beforeFirst = firstLoadRows(before);
const afterFirst = after ? firstLoadRows(after) : new Map();
console.log(`${pad('arena', 18)}${padStart('menu ms', 9)}${padStart('trans ms', 10)}${padStart('deploy ms', 11)}${padStart('total ms', 10)}`
  + `${padStart('pipes<adm', 11)}${padStart('mods<adm', 10)}${padStart('materials', 11)}${padStart('triangles', 11)}${padStart('control ms', 11)}`);
for (const [arena, entry] of beforeFirst) {
  console.log(`${pad(arena, 18)}${padStart(entry.timeToMenuMs, 9)}${padStart(entry.transitionMs, 10)}${padStart(entry.deployMs, 11)}`
    + `${padStart(entry.ms, 10)}${padStart(entry.pipelinesBeforeAdmission, 11)}${padStart(entry.shaderModulesBeforeAdmission, 10)}`
    + `${padStart(entry.census?.uniqueMaterials, 11)}${padStart(entry.census?.triangles, 11)}${padStart(controlMs(entry), 11)}`);
}
if (after) {
  console.log(`\n  AFTER (same columns; 'control ms' is the mean of the ${CONTROL_FAMILIES.length} prewarm families`);
  console.log('  this change does not touch — if it moved with the total, the machine moved, not the code)');
  for (const [arena, entry] of afterFirst) {
    const baseline = beforeFirst.get(arena);
    const ratio = baseline && controlMs(baseline) && controlMs(entry)
      ? `  control x${(controlMs(entry) / controlMs(baseline)).toFixed(2)}, total x${(entry.ms / baseline.ms).toFixed(2)}` : '';
    console.log(`${pad(arena, 18)}${padStart(entry.timeToMenuMs, 9)}${padStart(entry.transitionMs, 10)}${padStart(entry.deployMs, 11)}`
      + `${padStart(entry.ms, 10)}${padStart(entry.pipelinesBeforeAdmission, 11)}${padStart(entry.shaderModulesBeforeAdmission, 10)}`
      + `${padStart(entry.census?.uniqueMaterials, 11)}${padStart(entry.census?.triangles, 11)}${padStart(controlMs(entry), 11)}${ratio}`);
  }
  const missing = [...beforeFirst.keys()].filter((arena) => !afterFirst.has(arena));
  if (missing.length) console.log(`\n  no after first-load row (never fell on a chunk boundary): ${missing.join(', ')}`);
}
console.log('');
