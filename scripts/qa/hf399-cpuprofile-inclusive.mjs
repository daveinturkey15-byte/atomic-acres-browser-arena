#!/usr/bin/env node
// Inclusive (caller-attributed) time from a .cpuprofile written by
// hf399-frame-anatomy-cdp.mjs. Self time says WHICH three.js primitive is hot;
// inclusive time says WHOSE call started it, which is what a fix needs.
//
// Usage: node scripts/qa/hf399-cpuprofile-inclusive.mjs <file.cpuprofile> [--frames N] [--top 40]
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const file = argv.find((entry) => !entry.startsWith('--'));
const arg = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback; };
const FRAMES = Number(arg('--frames', '0'));
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

const perFrame = (micros) => (FRAMES > 0 ? ` ${(micros / 1000 / FRAMES).toFixed(2).padStart(6)} ms/frame` : '');
console.log(`total ${(total / 1000).toFixed(0)} ms${FRAMES ? ` over ${FRAMES} frames` : ''}`);
console.log('\nINCLUSIVE (time under this function, counted once per sample):');
for (const [key, micros] of [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP)) {
  if (key.startsWith('(root)')) continue;
  console.log(`${((micros / total) * 100).toFixed(1).padStart(5)}%${perFrame(micros)}  ${key}`);
}
console.log('\nSELF:');
for (const [key, micros] of [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${((micros / total) * 100).toFixed(1).padStart(5)}%${perFrame(micros)}  ${key}`);
}
