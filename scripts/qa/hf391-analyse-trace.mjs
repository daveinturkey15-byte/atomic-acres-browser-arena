#!/usr/bin/env node
// Reads HF-391 arena trace JSON files from a directory and prints per-segment HUD motion statistics and frame-time percentiles for each trace.
// Usage: node scripts/qa/hf391-analyse-trace.mjs [dir]
//   [dir] (process.argv[2]): directory containing <arena>.json trace files (default: artifacts/hf391/traces-baseline)
// Writes: no files or directories; prints the report to stdout.
// Exit codes: 0 on success (no process.exit calls; non-zero only from an uncaught exception).
// HF-391 trace analysis: reads artifacts/hf391/<dir>/<arena>.json files and
// reports per-segment motion statistics for each HUD custom property.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dir = resolve(process.argv[2] ?? 'artifacts/hf391/traces-baseline');
const PROPS = ['swayX', 'swayY', 'breathe', 'gait', 'impactX', 'impactY'];

function segments(rows) {
  const marks = [];
  rows.forEach((r, i) => { if (r.length === 8) marks.push({ name: r[7], index: i, t: r[0] }); });
  const segs = [];
  for (let i = 0; i < marks.length; i += 2) {
    segs.push({ name: marks[i].name.replace(':start', ''), start: marks[i], end: marks[i + 1] });
  }
  return segs;
}

function stats(rows, from, to) {
  const out = {};
  for (let p = 0; p < PROPS.length; p += 1) {
    let sum = 0; let peak = 0; let crossings = 0; let prev = null; let n = 0;
    let prevSign = 0;
    for (let i = from; i <= to; i += 1) {
      const v = rows[i][p + 1];
      sum += Math.abs(v); n += 1;
      peak = Math.max(peak, Math.abs(v));
      const sign = Math.sign(v);
      if (prevSign !== 0 && sign !== 0 && sign !== prevSign) crossings += 1;
      if (sign !== 0) prevSign = sign;
      prev = v;
    }
    out[PROPS[p]] = { mean: +(sum / n).toFixed(4), peak: +peak.toFixed(4), crossings, n };
  }
  return out;
}

for (const file of readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const rows = rec.rows.filter((r) => r.length === 7 || r.length === 8);
  console.log(`\n=== ${rec.arena} === backend=${rec.backend} frames=${rec.frameCount} meanFrameMs=${rec.meanFrameMs?.toFixed?.(2)} maxFrameMs=${rec.maxFrameMs?.toFixed?.(1)} errors=${JSON.stringify(rec.errors)}`);
  // Frame-time distribution
  const dts = [];
  const plain = rows.filter((r) => r.length === 7);
  for (let i = 1; i < plain.length; i += 1) dts.push(plain[i][0] - plain[i - 1][0]);
  dts.sort((a, b) => a - b);
  const q = (p) => dts[Math.floor(p * (dts.length - 1))] ?? NaN;
  console.log(`frame ms p50=${q(0.5).toFixed(1)} p95=${q(0.95).toFixed(1)} p99=${q(0.99).toFixed(1)}`);
  for (const seg of segments(rows)) {
    const s = stats(rows, seg.start.index + 1, seg.end.index - 1);
    console.log(`  [${seg.name}]`);
    for (const p of PROPS) {
      const st = s[p];
      if (st.mean > 0.001 || st.peak > 0.001) {
        console.log(`    ${p.padEnd(8)} mean|v|=${st.mean.toFixed(4)} peak=${st.peak} crossings=${st.crossings}/${st.n}`);
      }
    }
  }
}
