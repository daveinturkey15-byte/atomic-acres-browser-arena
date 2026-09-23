#!/usr/bin/env node
/**
 * HF-536 look-2a — per-station improvement, before vs after, against the boards.
 *
 * node scripts/forge/tonal-gap-improvement.mjs --before docs/forge/tonal-gap.json --after docs/forge/tonal-gap-after.json
 *
 * A row IMPROVED on an axis when |delta to the board| got smaller. The four
 * axes reported are the ones the brief names: sky p50, sky saturation %,
 * sunlit R-B, and the within-box sunlit/shade contrast %.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const before = require(resolve(arg('before', 'docs/forge/tonal-gap.json')));
const after = require(resolve(arg('after', 'docs/forge/tonal-gap-after.json')));

const AXES = [
  ['skyP50', 'skyP50', 0],
  ['skySat%', 'skySatPct', 20],
  ['sunlitR-B', 'sunlitRminusB', 15],
  ['contrast%', 'contrastPct', 20],
];

const abs = (v) => (v === null || v === undefined ? null : Math.abs(v));
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 7) => (v === null || v === undefined ? '-'.padStart(n) : v.toFixed(1).padStart(n));

console.log(pad('station', 26) + AXES.map(([l]) => pad(`${l} before->after`, 26)).join(''));
const counts = Object.fromEntries(AXES.map(([l]) => [l, { improved: 0, worse: 0, judged: 0, inBandAfter: 0, inBandBefore: 0 }]));

for (const id of Object.keys(after.perStation)) {
  const b = before.perStation[id]?.delta ?? {};
  const a = after.perStation[id]?.delta ?? {};
  let line = pad(id.replace('nuketown2-', ''), 26);
  for (const [label, key, band] of AXES) {
    const bv = b[key]; const av = a[key];
    if (bv === null || bv === undefined || av === null || av === undefined) { line += pad('-', 26); continue; }
    const c = counts[label];
    c.judged += 1;
    if (abs(av) < abs(bv)) c.improved += 1; else if (abs(av) > abs(bv)) c.worse += 1;
    if (band > 0) { if (abs(bv) <= band) c.inBandBefore += 1; if (abs(av) <= band) c.inBandAfter += 1; }
    const mark = abs(av) < abs(bv) ? '+' : (abs(av) > abs(bv) ? '-' : '=');
    line += pad(`${num(bv)} ->${num(av)} ${mark}`, 26);
  }
  console.log(line);
}

console.log('');
for (const [label] of AXES) {
  const c = counts[label];
  console.log(`${pad(label, 12)} improved ${c.improved}/${c.judged}   worse ${c.worse}   in-band ${c.inBandBefore} -> ${c.inBandAfter}`);
}
console.log('');
console.log('summary means (ours minus board)');
for (const key of ['globalP5', 'globalP50', 'globalP95', 'globalSatPct', 'skyP50', 'skySatPct', 'skyHue', 'skyZenithP50', 'sunlitRminusB', 'contrastPct']) {
  console.log(`  ${pad(key, 16)} ${num(before.summary.meanDelta[key])} -> ${num(after.summary.meanDelta[key])}`);
}
console.log('gates');
for (const key of Object.keys(after.summary.gates)) {
  console.log(`  ${pad(key, 26)} ${String(before.summary.gates[key]).padStart(4)} -> ${String(after.summary.gates[key]).padStart(4)}`);
}
