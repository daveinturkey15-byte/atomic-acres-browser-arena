#!/usr/bin/env node
// HF-542 Tier-1 tripwire: static call-site counter over the 15 killstreak/support cue bodies.
// Plain Node, no vitest. Parses src/audio.ts, extracts each cue body by brace matching,
// counts this.sweep( / this.tone( / this.noise( and how many carry shaping keys.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'src', 'audio.ts'), 'utf8');

const CUES = [
  'supportGun',
  'supportGunPositional',
  'dominationCue',
  'missileLaunch',
  'scoutSweep',
  'adrenalineState',
  'supportInbound',
  'killstreakAnnounce',
  'bombRelease',
  'hunterLaunch',
  'overdrivePickup',
  'overdriveAvailable',
  'overdriveExpire',
  'nukeWarning',
  'nukeDetonation',
];

function stripNoise(text) {
  // Remove block comments, line comments, and string literals to avoid
  // miscounting braces/parens inside them. Keep code structure.
  let out = '';
  let i = 0;
  const n = text.length;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'sq'; out += ' '; i++; continue; }
      if (c === '"') { state = 'dq'; out += ' '; i++; continue; }
      if (c === '`') { state = 'tpl'; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; }
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
      i++; continue;
    }
    if (state === 'sq') {
      if (c === '\\') { i += 2; continue; }
      if (c === "'") { state = 'code'; out += ' '; i++; continue; }
      i++; continue;
    }
    if (state === 'dq') {
      if (c === '\\') { i += 2; continue; }
      if (c === '"') { state = 'code'; out += ' '; i++; continue; }
      i++; continue;
    }
    if (state === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { state = 'code'; out += ' '; i++; continue; }
      // ${ ... } interpolation: keep braces so depth stays honest is complex;
      // cue bodies contain no template literals, so treat whole literal as blank.
      i++; continue;
    }
  }
  return out;
}

function extractBody(srcText, name) {
  const marker = '\n  ' + name + '(';
  let idx = srcText.indexOf(marker);
  if (idx < 0) throw new Error('cue not found: ' + name);
  // Ensure exact match: char after name must be '(' (marker guarantees it) and
  // the match must not be a prefix of a longer identifier (marker starts with
  // newline+two spaces so supportGun won't match supportGunPositional's header;
  // but supportGun search could land inside supportGunPositional body? No:
  // body calls are `this.supportGun` free-standing, never `\n  supportGun(`).
  const braceOpen = srcText.indexOf('{', idx);
  if (braceOpen < 0) throw new Error('no body open for ' + name);
  let depth = 0;
  let inStr = null; // ', ", `
  let inLine = false;
  let inBlock = false;
  for (let i = braceOpen; i < srcText.length; i++) {
    const c = srcText[i];
    const next = srcText[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i++; }
      continue;
    }
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return srcText.slice(braceOpen, i + 1);
    }
  }
  throw new Error('unbalanced body for ' + name);
}

function extractCallArg(callStart, body) {
  // callStart: index of `this.<kind>(` in body; returns arg text inside outer parens.
  const open = body.indexOf('(', callStart);
  let depth = 0;
  let inStr = null;
  let inLine = false;
  let inBlock = false;
  for (let i = open; i < body.length; i++) {
    const c = body[i];
    const next = body[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i++; }
      continue;
    }
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '(') depth++;
    if (c === ')') {
      depth--;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced call parens');
}

const SHAPING_KEY = /(attack|punch|punchSeconds|drive|detuneCents|pitchBias)\s*:/;
const TEXTURE_KEY = /texture\s*:/;
const WHITE_TEXTURE = /texture\s*:\s*['"]white['"]/;

const rows = {};
let sweepTotal = 0, sweepUnshaped = 0, toneTotal = 0, toneUnshaped = 0, noiseTotal = 0, noiseWhite = 0;
let seqTotal = 0;

for (const cue of CUES) {
  const body = extractBody(src, cue);
  const clean = stripNoise(body);
  const kinds = [
    ['sweep', 'this.sweep('],
    ['tone', 'this.tone('],
    ['noise', 'this.noise('],
    ['seq', 'this.sweepSequence('],
  ];
  const row = { sweep: 0, sweepUnshaped: 0, tone: 0, toneUnshaped: 0, noise: 0, noiseWhite: 0, seq: 0 };
  for (const [kind, needle] of kinds) {
    let from = 0;
    for (;;) {
      const hit = clean.indexOf(needle, from);
      if (hit < 0) break;
      // Map back to raw body for arg extraction: indices align because
      // stripNoise preserves length? It does NOT (it drops comment chars).
      // So instead search in raw body from a cursor that tracks count.
      from = hit + needle.length;
      row[kind === 'seq' ? 'seq' : kind] += 1;
    }
  }
  // Shaping classification needs raw arg text; redo per-kind on raw body.
  for (const [kind, needle] of [['sweep', 'this.sweep('], ['tone', 'this.tone('], ['noise', 'this.noise(']]) {
    let cursor = 0;
    for (;;) {
      const hit = body.indexOf(needle, cursor);
      if (hit < 0) break;
      const args = extractCallArg(hit, body);
      const stripped = stripNoise(args);
      if (kind === 'noise') {
        row.noise += 0; // already counted above; classify here
        const hasShaping = SHAPING_KEY.test(stripped);
        const hasTexture = TEXTURE_KEY.test(stripped);
        const isWhiteExplicit = WHITE_TEXTURE.test(stripped);
        // "default-white" = no texture key, or explicitly white without other shaping.
        // No killstreak noise call uses explicit white, so this equals "no texture key".
        const isWhite = (!hasTexture || (isWhiteExplicit && !hasShaping && !/texture\s*:\s*(?!['"]white['"])/.test(stripped)));
        if (isWhite) row.noiseWhite += 1;
      } else if (kind === 'sweep') {
        if (!SHAPING_KEY.test(stripped)) row.sweepUnshaped += 1;
      } else {
        if (!SHAPING_KEY.test(stripped)) row.toneUnshaped += 1;
      }
      cursor = hit + needle.length;
    }
  }
  rows[cue] = row;
  sweepTotal += row.sweep; sweepUnshaped += row.sweepUnshaped;
  toneTotal += row.tone; toneUnshaped += row.toneUnshaped;
  noiseTotal += row.noise; noiseWhite += row.noiseWhite;
  seqTotal += row.seq;
}

console.log(JSON.stringify({ toneTotal, toneUnshaped, sweepTotal, sweepUnshaped, noiseTotal, noiseWhite }));
for (const cue of CUES) {
  const r = rows[cue];
  console.log(`${cue} sweep ${r.sweep}/${r.sweepUnshaped} tone ${r.tone}/${r.toneUnshaped} noise ${r.noise}/${r.noiseWhite} seq ${r.seq}`);
}
console.log(`sweepSequence sites: ${seqTotal}`);
