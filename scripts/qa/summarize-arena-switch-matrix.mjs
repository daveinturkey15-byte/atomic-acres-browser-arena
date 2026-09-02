#!/usr/bin/env node
// Renders one or two `probe-arena-switch-matrix.mjs` reports as the tables a
// lane report needs: per-arena first-load costs, per-phase medians, where the
// pipelines were compiled, and (with two reports) the before/after delta.
//
//   node scripts/qa/summarize-arena-switch-matrix.mjs before.json [after.json]
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
const pad = (value, width) => String(value ?? '-').padEnd(width);
const padStart = (value, width) => String(value ?? '-').padStart(width);

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

function pipelinesByPhase(report) {
  const buckets = new Map();
  for (const edge of report.edges) {
    for (const [phase, count] of Object.entries(edge.pipelinesByPhase ?? {})) {
      if (!buckets.has(phase)) buckets.set(phase, []);
      buckets.get(phase).push(count);
    }
  }
  return [...buckets].map(([phase, values]) => ({ phase, median: median(values), total: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.median - a.median);
}

function perTarget(report) {
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
    fenced: median(edges.map((edge) => (edge.pipelinesByPhase?.['visual-definition'] ?? 0)
      + (edge.pipelinesByPhase?.['coverage-submit-fence'] ?? 0))),
  })).sort((a, b) => (b.transitionMs ?? 0) - (a.transitionMs ?? 0));
}

function section(title) { console.log(`\n## ${title}\n`); }

console.log(`# arena switch matrix — ${before.label}${after ? ` vs ${after.label}` : ''}`);
for (const report of [before, after].filter(Boolean)) {
  console.log(`\n${report.label}: sha ${report.gitSha?.slice(0, 8)}, `
    + `${report.summary?.edges ?? report.edges.length} edges, ${report.summary?.failed ?? '?'} failed, `
    + `ComfyUI ${report.machine?.comfyUi}, rival browsers ${report.machine?.rivalPlaywrightBrowsersAtLaunch ?? '?'}, `
    + `GPU ${report.machine?.gpuFreeMiB}/${report.machine?.gpuTotalMiB} MiB free`);
  if (report.summary?.failedPairs?.length) console.log(`  FAILED: ${report.summary.failedPairs.join(', ')}`);
}

section('switch INTO each arena (median over every source)');
console.log(`${pad('arena', 18)}${padStart('edges', 6)}${padStart('fail', 5)}${padStart('switch ms', 11)}${padStart('pipelines', 11)}${padStart('modules', 9)}${padStart('in-fence', 10)}`
  + (after ? `${padStart('after ms', 10)}${padStart('delta', 9)}` : ''));
const afterByTarget = after ? new Map(perTarget(after).map((row) => [row.arena, row])) : null;
for (const row of perTarget(before)) {
  const other = afterByTarget?.get(row.arena);
  const delta = other && row.transitionMs ? `${(((other.transitionMs - row.transitionMs) / row.transitionMs) * 100).toFixed(0)}%` : null;
  console.log(`${pad(row.arena, 18)}${padStart(row.edges, 6)}${padStart(row.failed, 5)}${padStart(row.transitionMs, 11)}`
    + `${padStart(row.pipelines, 11)}${padStart(row.modules, 9)}${padStart(row.fenced, 10)}`
    + (after ? `${padStart(other?.transitionMs, 10)}${padStart(delta, 9)}` : ''));
}

section('transition phases, median ms over every edge');
const afterPhases = after ? new Map(phaseMedians(after).map((row) => [row.phase, row])) : null;
console.log(`${pad('phase', 34)}${padStart('median', 9)}${padStart('max', 9)}` + (after ? `${padStart('after', 9)}` : ''));
for (const row of phaseMedians(before)) {
  console.log(`${pad(row.phase, 34)}${padStart(row.median, 9)}${padStart(Number(row.max.toFixed(1)), 9)}`
    + (after ? `${padStart(afterPhases?.get(row.phase)?.median, 9)}` : ''));
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

section('first load per arena (boot -> live match)');
console.log(`${pad('arena', 18)}${padStart('menu ms', 9)}${padStart('trans ms', 10)}${padStart('deploy ms', 11)}${padStart('total ms', 10)}`
  + `${padStart('pipes<adm', 11)}${padStart('mods<adm', 10)}${padStart('materials', 11)}${padStart('triangles', 11)}`);
const firstLoadRows = new Map();
for (const entry of before.firstLoads) if (!firstLoadRows.has(entry.arena)) firstLoadRows.set(entry.arena, entry);
for (const [arena, entry] of firstLoadRows) {
  console.log(`${pad(arena, 18)}${padStart(entry.timeToMenuMs, 9)}${padStart(entry.transitionMs, 10)}${padStart(entry.deployMs, 11)}`
    + `${padStart(entry.ms, 10)}${padStart(entry.pipelinesBeforeAdmission, 11)}${padStart(entry.shaderModulesBeforeAdmission, 10)}`
    + `${padStart(entry.census?.uniqueMaterials, 11)}${padStart(entry.census?.triangles, 11)}`);
}
console.log('');
