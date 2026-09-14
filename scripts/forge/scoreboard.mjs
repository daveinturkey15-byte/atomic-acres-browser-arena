#!/usr/bin/env node
// PASS 0 scoreboard writer (HF-536 ART-FORGE-RULESET stage 7).
//
// Usage:
//   node scripts/forge/scoreboard.mjs --score <score.json> --sha <sha> --label <label> \
//     --verdict <KEEP|HOLD|FAIL|BASE> --at <ISO-timestamp> \
//     [--program-set-delta N] [--draws N] [--tris N] [--fps-median N] [--fps-min N] \
//     [--hitches-p50 N --hitches-p95 N --hitches-p99 N] \
//     [--out docs/forge/scoreboard.json]
//
// Appends (or, idempotently, replaces the same sha+label row) and regenerates
// docs/forge/SCOREBOARD.md beside the JSON. --at is REQUIRED: timestamps are
// passed in, never Date.now().
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const num = (name) => {
  const v = arg(name);
  return v === null ? null : Number(v);
};

export function summarizeScore(score) {
  const stations = {};
  for (const [id, st] of Object.entries(score.stations ?? {}).sort()) {
    const boxes = {};
    for (const [name, b] of Object.entries(st.boxes ?? {}).sort()) {
      boxes[name] = { p50: b.luma.p50, std: b.stddev, hueDeg: b.hueDeg, protected: b.protected };
    }
    stations[id] = { newlyBlack: st.newlyBlack, healed: st.healed, boxes };
  }
  return stations;
}

export function appendRow(board, row) {
  const passes = Array.isArray(board.passes) ? [...board.passes] : [];
  const at = passes.findIndex((p) => p.sha === row.sha && p.label === row.label);
  if (at >= 0) passes[at] = row;
  else passes.push(row);
  return { ...board, passes };
}

export function renderMarkdown(board) {
  const lines = [
    '# Forge scoreboard (HF-536 PASS 0)',
    '',
    'Per-pass rows from `scoreboard.json`. verdict BASE = seeded base row; KEEP/HOLD/FAIL from `keep-rule.mjs`.',
    '',
    '| label | sha | verdict | progΔ | draws | tris | fpsMedian | newlyBlackMax | healedMax | at |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const p of board.passes ?? []) {
    const vals = Object.values(p.stations ?? {});
    const nbMax = vals.length ? Math.max(...vals.map((s) => s.newlyBlack ?? 0)) : 0;
    const healedMax = vals.length ? Math.max(...vals.map((s) => s.healed ?? 0)) : 0;
    lines.push(`| ${p.label} | ${p.sha} | ${p.verdict} | ${p.programSetDelta ?? '-'} | ${p.draws ?? '-'} | ${p.tris ?? '-'} | ${p.fps?.median ?? '-'} | ${nbMax.toFixed(4)} | ${healedMax.toFixed(4)} | ${p.at} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const scorePath = arg('--score');
  const sha = arg('--sha');
  const label = arg('--label');
  const verdict = arg('--verdict');
  const at = arg('--at');
  if (!scorePath || !sha || !label || !verdict || !at) {
    process.stderr.write('[scoreboard] ERROR need --score --sha --label --verdict --at\n');
    process.exit(2);
  }
  if (Number.isNaN(Date.parse(at))) {
    process.stderr.write(`[scoreboard] ERROR --at is not a timestamp: ${at}\n`);
    process.exit(2);
  }
  const outPath = resolve(arg('--out', 'docs/forge/scoreboard.json'));
  const score = JSON.parse(readFileSync(resolve(scorePath), 'utf8'));
  let board = { version: 1, passes: [] };
  if (existsSync(outPath)) board = JSON.parse(readFileSync(outPath, 'utf8'));
  const row = {
    label,
    sha,
    base: score.base ?? null,
    verdict,
    programSetDelta: num('--program-set-delta'),
    draws: num('--draws'),
    tris: num('--tris'),
    fps: { median: num('--fps-median'), min: num('--fps-min') },
    hitches: { p50: num('--hitches-p50'), p95: num('--hitches-p95'), p99: num('--hitches-p99') },
    stations: summarizeScore(score),
    at,
  };
  board = appendRow(board, row);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(board, null, 1)}\n`);
  const mdPath = resolve(dirname(outPath), 'SCOREBOARD.md');
  writeFileSync(mdPath, renderMarkdown(board));
  process.stdout.write(`[scoreboard] ${label}@${sha} ${verdict} -> ${outPath} (+ SCOREBOARD.md)\n`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) await main();
