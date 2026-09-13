// Summarise hf399 phase-probe JSONs into one markdown table (A/B per arena per phase).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2] ?? 'docs/evidence/pass94/perf-hitl5/probe';
const rows = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  for (const p of r.phases) {
    if (p.phase === 'menu') continue;
    rows.push(`| ${r.label} | ${r.arena} | ${p.phase} | ${p.fps} | ${p.frameMs.p50} | ${p.frameMs.p95} | ${p.frameMs.p99} | ${p.perFrame.draws} | ${Math.round(p.perFrame.triangles / 1000)}k | ${Math.round(p.perFrame.instances)} | ${p.created.renderPipelinesTotal} | ${p.longTasks.count} |`);
  }
}
console.log('| run | arena | phase | fps | p50 ms | p95 ms | p99 ms | draws | tris | instances | pipelines total | long tasks |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
