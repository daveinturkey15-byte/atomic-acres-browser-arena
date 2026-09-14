#!/usr/bin/env node
// Lane AB (PASS 87) — publish review frames from a sweep into tracked evidence.
//
// WHY A SCRIPT AND NOT A COPY
// The first evidence set committed 24 frames for 45 measured states, chosen by
// hand, and the choice did not survive review: every arena but three carried
// only `late`, and no weather state carried a frame at all. A reader could not
// see the states the numbers said had MOVED. So the selection is now a rule
// applied to the sweep's own report rather than a decision taken at commit
// time:
//
//   * every state whose |shadow-mass delta| exceeded MOVED_POINTS, and the
//     identity frame it was paired against — those are the verdicts;
//   * one WEATHER pair per arena that authors weather, so the composition the
//     design doc claims is visible and not only tabulated;
//   * every pinned arena's `late` pair, because the null experiment is only
//     convincing if you can look at it.
//
// Frames are halved to 640x360 and palette-compressed, which is the repo's
// evidence-size rule; the full-resolution originals stay in git-ignored
// `artifacts/`, and `report.json` names them.
//
// Usage:
//   node scripts/qa/publish-lane-ab-frames.mjs \
//     --report artifacts/lane-ab-merged2/report.json \
//     --out docs/evidence/pass87/dynamic-lighting/frames
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import sharp from 'sharp';
import { pinnedDaylightArenaIds } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const REPORT = resolve(process.cwd(), arg('--report', 'artifacts/lane-ab-merged2/report.json'));
const OUT = resolve(process.cwd(), arg('--out', 'docs/evidence/pass87/dynamic-lighting/frames'));
/** A state that moved the frame's shadow SHAPE by at least this is a verdict a
 *  reader should be able to look at. Reported in the same points the safety
 *  threshold uses; it selects frames and gates nothing. */
const MOVED_POINTS = Number(arg('--moved-points', '1'));
/** The arenas `ARENA_DAYLIGHT_PROFILES` pins, so a "pinned late" frame really
 *  is the null case. Derived rather than written out (gate audit F4): promoting
 *  an arena out of PREVIEW must not leave this publish step still treating it as
 *  a fixed reference. */
const PINNED = new Set(pinnedDaylightArenaIds());

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
mkdirSync(OUT, { recursive: true });

const wanted = new Map(); // absolute source path -> reason
const want = (file, reason) => {
  if (!file) return;
  if (!wanted.has(file)) wanted.set(file, reason);
};

for (const record of report.runs ?? []) {
  if (!record.states?.length) continue;
  const weatherPairTaken = { value: false };
  for (const state of record.states) {
    const moved = Math.abs(state.verdict?.shadowMassGrowthPoints ?? 0) >= MOVED_POINTS;
    const pinnedLate = PINNED.has(record.arena) && state.tod === 'late';
    const weatherPair = record.weather !== 'clear' && state.tod === 'late' && !weatherPairTaken.value;
    if (!moved && !pinnedLate && !weatherPair) continue;
    if (weatherPair) weatherPairTaken.value = true;
    const reason = moved ? `moved ${state.verdict.shadowMassGrowthPoints}pt`
      : pinnedLate ? 'pinned null control'
      : 'weather pair';
    want(state.file, reason);
    want(state.before?.file, `${reason} (paired identity)`);
  }
}

let written = 0;
let missing = 0;
for (const [source, reason] of wanted) {
  if (!existsSync(source)) { missing += 1; console.error(`[frames] MISSING ${source}`); continue; }
  const target = resolve(OUT, basename(source));
  const image = sharp(source);
  const { width, height } = await image.metadata();
  await image
    .resize(Math.round(width / 2), Math.round(height / 2))
    .png({ palette: true, quality: 90, effort: 8 })
    .toFile(target);
  written += 1;
  console.error(`[frames] ${basename(target).padEnd(52)} ${reason}`);
}
console.error(`[frames] wrote ${written} frames to ${OUT}; ${missing} missing`);
process.exit(missing ? 1 : 0);
