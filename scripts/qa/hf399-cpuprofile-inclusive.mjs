#!/usr/bin/env node
// Inclusive (caller-attributed) time from a .cpuprofile written by
// hf399-frame-anatomy-cdp.mjs. Self time says WHICH three.js primitive is hot;
// inclusive time says WHOSE call started it, which is what a fix needs.
//
// HF-399 READ THIS BEFORE QUOTING A NUMBER FROM THIS TOOL.
// The CDP sampling profiler roughly DOUBLES frame time while it runs. Measured
// 2026-09-02 on atomic-acres lawn-idle: unprofiled p50 26.1 ms, profiled p50
// 42.2 ms / mean 49.18 ms in the very same phase (the `cpu.frameMsP50` field
// the anatomy probe writes beside each .cpuprofile). So the ms/frame column
// below is PROFILED-frame time: never compare it against an unprofiled frame
// budget, nor against another profile captured under a different machine load.
// The comparable quantity is the INCLUSIVE SHARE (%). Pass --frame-ms
// <unprofiled p50> to also print that share rescaled onto a real frame; the
// rescale assumes profiler overhead is spread evenly, which it is not exactly,
// so treat the real-ms column as an estimate.
//
// Usage: node scripts/qa/hf399-cpuprofile-inclusive.mjs <file.cpuprofile> [--frames N] [--frame-ms MS] [--top 40]
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const file = argv.find((entry) => !entry.startsWith('--'));
const arg = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback; };
const FRAMES = Number(arg('--frames', '0'));
/** Real (UNprofiled) frame time for this phase, so shares can be rescaled onto a real frame. */
const FRAME_MS = Number(arg('--frame-ms', '0'));
const TOP = Number(arg('--top', '45'));
if (!file) throw new Error('Pass a .cpuprofile path');

const profile = JSON.parse(readFileSync(file, 'utf8'));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parentOf = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);

const label = (node) => {
  const frame = node.callFrame ?? {};
  const name = frame.functionName || '(anonymous)';
  const url = (frame.url ?? '').split('/').pop().replace(/-[A-Za-z0-9_-]{8}\.js$/, '.js');
  return `${name} ${url}:${frame.lineNumber ?? ''}`;
};

const inclusive = new Map();
const selfTime = new Map();
let total = 0;
const deltas = profile.timeDeltas ?? [];
for (let index = 0; index < profile.samples.length; index += 1) {
  const micros = deltas[index] ?? 0;
  total += micros;
  let id = profile.samples[index];
  const leaf = nodes.get(id);
  const leafLabel = label(leaf);
  selfTime.set(leafLabel, (selfTime.get(leafLabel) ?? 0) + micros);
  const seen = new Set();
  while (id !== undefined) {
    const node = nodes.get(id);
    const key = label(node);
    if (!seen.has(key)) { seen.add(key); inclusive.set(key, (inclusive.get(key) ?? 0) + micros); }
    id = parentOf.get(id);
  }
}

const profiledFrameMs = FRAMES > 0 ? total / 1000 / FRAMES : 0;
const perFrame = (micros) => (FRAMES > 0 ? ` ${(micros / 1000 / FRAMES).toFixed(2).padStart(6)} prof-ms` : '');
const realFrame = (micros) => (FRAME_MS > 0 ? ` ${((micros / total) * FRAME_MS).toFixed(2).padStart(6)} real-ms` : '');
const row = (key, micros) => `${((micros / total) * 100).toFixed(1).padStart(5)}%${perFrame(micros)}${realFrame(micros)}  ${key}`;

console.log(`total ${(total / 1000).toFixed(0)} ms${FRAMES ? ` over ${FRAMES} frames` : ''}`);
if (FRAMES > 0) {
  console.log(`PROFILED frame time ${profiledFrameMs.toFixed(2)} ms - INFLATED by the sampling profiler, not a real frame.`);
  if (FRAME_MS > 0) {
    console.log(`Shares rescaled onto the measured UNprofiled frame of ${FRAME_MS.toFixed(2)} ms (inflation ${(profiledFrameMs / FRAME_MS).toFixed(2)}x).`);
  } else {
    console.log('Pass --frame-ms <unprofiled p50 from the phase probe> to rescale shares onto a real frame.');
    console.log('WARNING: without it only the % column is comparable to anything outside this profile.');
  }
}
console.log('\nINCLUSIVE (time under this function, counted once per sample):');
for (const [key, micros] of [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP)) {
  if (key.startsWith('(root)')) continue;
  console.log(row(key, micros));
}
console.log('\nSELF:');
for (const [key, micros] of [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(row(key, micros));
}
