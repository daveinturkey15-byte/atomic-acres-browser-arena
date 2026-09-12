#!/usr/bin/env node
// Turns a probe-ibl-load-parity.mjs report into the tracked evidence for a
// pass: a markdown table (first-load vs second-load luminance per authored
// review camera, against that session's own temporal noise floor), the report
// JSON itself (gzipped when it exceeds 400 KB), and one halved side-by-side
// frame pair per arena so the numbers have a picture next to them. Artifacts
// under artifacts/ are git-ignored on purpose; this is what gets committed.
//
// Usage: node scripts/qa/summarize-ibl-load-parity.mjs
//          [--report artifacts/qa/ibl/load-parity-pass85.json]
//          [--shots artifacts/qa/ibl/pass85]
//          [--out docs/evidence/pass85/lane-i] [--frames atomic-acres]
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const REPORT = resolve(process.cwd(), arg('--report', 'artifacts/qa/ibl/load-parity-pass85.json'));
const SHOTS = resolve(process.cwd(), arg('--shots', 'artifacts/qa/ibl/pass85'));
const OUT = resolve(process.cwd(), arg('--out', 'docs/evidence/pass85/lane-i'));
const FRAME_ARENAS = arg('--frames', 'atomic-acres').split(',').map((entry) => entry.trim()).filter(Boolean);
/** Suffix for the written frames, so a second run can add a counter-example
 *  exhibit beside the good pair instead of overwriting it. */
const FRAME_SUFFIX = arg('--frame-suffix', '');
/** Frames only - for that second run, which must not restate the table. */
const FRAMES_ONLY = argv.includes('--frames-only');
mkdirSync(OUT, { recursive: true });

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const rows = [];
for (const [arena, entry] of Object.entries(report.arenas)) {
  const published = entry.first?.observation?.published ?? null;
  for (const camera of entry.cameras ?? []) {
    rows.push({
      arena,
      camera: camera.cameraId,
      first: camera.meanLuminanceFirst,
      second: camera.meanLuminanceSecond,
      deltaPercent: camera.meanLuminanceDeltaPercent,
      movedPercent: camera.pixelsMovedPercent,
      noisePercent: camera.longNoisePercent ?? entry.noiseFloorPercent ?? null,
      noiseMovedPercent: camera.longNoiseMovedPercent ?? entry.noiseFloorMovedPercent ?? null,
      environment: published?.environmentName ?? null,
      intensity: published?.environmentIntensity ?? null,
      parity: entry.observationParity === true,
    });
  }
  if (!entry.cameras?.length) {
    // An arena with no cameras did not fail to LIGHT - it failed to be
    // measured, and the reason has to travel with the row. A blank cell here
    // once read as "no divergence found".
    const invalid = entry.selectionFailed
      ? `SELECTION FAILED (committed ${entry.committedArena?.first} / ${entry.committedArena?.second})`
      : entry.combatContaminated
        ? 'COMBAT-CONTAMINATED (frame carries the damage overlay)'
        : 'not measured';
    rows.push({
      arena, camera: invalid, first: null, second: null, deltaPercent: null,
      movedPercent: null, noisePercent: entry.noiseFloorPercent ?? null,
      noiseMovedPercent: entry.noiseFloorMovedPercent ?? null,
      environment: published?.environmentName ?? null, intensity: published?.environmentIntensity ?? null,
      parity: entry.observationParity === true,
    });
  }
}

const table = [
  '| arena | review camera | first-load mean Y | second-load mean Y | delta | luminance noise floor | pixels moved | pixels-moved noise floor | environment | intensity | receipt parity |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((row) => `| ${row.arena} | ${row.camera} | ${row.first ?? '-'} | ${row.second ?? '-'} | ${row.deltaPercent === null ? '-' : `${row.deltaPercent}%`} | ${row.noisePercent === null ? '-' : `${row.noisePercent}%`} | ${row.movedPercent === null ? '-' : `${row.movedPercent}%`} | ${row.noiseMovedPercent === null ? '-' : `${row.noiseMovedPercent}%`} | ${row.environment ?? 'null'} | ${row.intensity ?? '-'} | ${row.parity ? 'identical' : 'DIFFERS'} |`),
].join('\n');
if (!FRAMES_ONLY) {
  writeFileSync(resolve(OUT, 'load-parity-table.md'), `${table}\n`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(json) > 400 * 1024) {
    writeFileSync(resolve(OUT, 'load-parity.json.gz'), gzipSync(json));
  } else {
    writeFileSync(resolve(OUT, 'load-parity.json'), json);
  }
}

for (const arena of FRAME_ARENAS) {
  const camera = report.arenas[arena]?.cameras?.find((entry) => entry.ok)?.cameraId;
  if (!camera) continue;
  for (const side of ['first', 'second']) {
    const source = resolve(SHOTS, arena, `${camera}-${side}.png`);
    const target = resolve(OUT, `${arena}-${camera}-${side}${FRAME_SUFFIX}.png`);
    // The 600 KB cap is on the file that gets TRACKED, so the WRITTEN file is
    // what has to be measured. Deciding on the source size instead halved a
    // 758 KB source to 645 KB - still over - and passed a 589 KB source
    // through untouched, which re-encoded to 645 KB and went over the cap
    // having never been halved at all. Re-encode until it is actually under.
    let { width, height } = await sharp(source).metadata();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await sharp(source).resize(Math.round(width), Math.round(height))
        .png({ compressionLevel: 9 }).toFile(target);
      if (statSync(target).size <= 600 * 1024) break;
      width /= 2;
      height /= 2;
    }
  }
}
console.error(`[ibl-parity] wrote ${OUT}`);
