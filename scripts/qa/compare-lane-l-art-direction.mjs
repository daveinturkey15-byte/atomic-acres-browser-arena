#!/usr/bin/env node
// Lane L — READS the before/after capture pairs and judges them.
//
// A capture pass that only produces frames has done half the job: somebody
// still has to decide whether the difference is real, and "it looks different
// to me" is the claim the owner already rejected once. So this does three
// things the frames alone cannot:
//
//   1. QUANTIFIES the change per arena — how far the hue moved, how much
//      saturation and midtone separation was added, where the frame's mass
//      went. A pass whose numbers are inside the noise is not a pass.
//   2. CHECKS COMBAT SAFETY against the before frame rather than against a
//      guess: shadow mass may not balloon (nothing new hides a player), the
//      5th-percentile luma may not collapse (shadow detail survives), and the
//      screen periphery keeps its luminance (the vignette stays a hint).
//   3. BUILDS THE SIDE-BY-SIDE composites, because "obvious side by side" is
//      the acceptance test and it needs the two frames in one image.
//
// Usage:
//   node scripts/qa/compare-lane-l-art-direction.mjs
//        [--before artifacts/lane-l/before] [--after artifacts/lane-l/after]
//        [--out artifacts/lane-l/compare]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BEFORE = resolve(process.cwd(), arg('--before', 'artifacts/lane-l/before'));
const AFTER = resolve(process.cwd(), arg('--after', 'artifacts/lane-l/after'));
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/lane-l/compare'));

/**
 * Combat-safety bounds, expressed as CHANGES from the before frame. Absolute
 * thresholds would be judging the arena's authored lighting; the pass is only
 * answerable for what it changed.
 */
const SAFETY = Object.freeze({
  // Percentage points of the frame allowed to newly fall below luma 24.
  maximumShadowMassGrowthPoints: 3,
  // The 5th-percentile luma is the shadow-detail floor: an enemy in shade
  // lives here. It may not fall by more than two 8-bit steps.
  maximumShadowFloorDropSteps: 2,
  // Corner-vs-centre luminance retention, relative to the before frame. The
  // authored vignette cap (DISPLAY_VIGNETTE_MAXIMUM) is worth ~21% at the
  // deepest corner, so anything past 25% is the vignette escaping its bound.
  maximumCornerRetentionLossPoints: 25,
});

/** The floor the pass must clear to be called visible at all. */
const VISIBILITY = Object.freeze({
  // Mean per-channel shift, in 8-bit steps, over the whole frame. Two steps is
  // roughly where a side-by-side stops being arguable.
  minimumMeanChannelShiftSteps: 2,
});

/**
 * gun-range is the deliberate exception. Its authored identity is the ABSENCE
 * of a place-cast — a clean neutral facility standing next to five loud arenas
 * — so a near-zero shift there is the pass working, not the pass failing. It is
 * still held to every combat-safety bound.
 */
const NEUTRAL_BY_DESIGN = new Set(['gun-range']);

function loadReport(directory) {
  const file = resolve(directory, 'report.json');
  if (!existsSync(file)) throw new Error(`Missing capture report: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function indexShots(report) {
  const shots = new Map();
  for (const arena of report.arenas ?? []) {
    for (const shot of arena.shots ?? []) {
      if (shot.file && shot.stats) shots.set(`${arena.arena}--${shot.camera}`, { arena, shot });
    }
  }
  return shots;
}

/**
 * Side-by-side composite with a caption strip, so a pair is one image the
 * owner can look at rather than two files they have to alt-tab between.
 */
async function composite(beforeFile, afterFile, outFile, caption) {
  const panelWidth = 960;
  const meta = await sharp(beforeFile).metadata();
  const panelHeight = Math.round((meta.height / meta.width) * panelWidth);
  const stripHeight = 46;
  const label = (text, x) => ({
    input: Buffer.from(
      `<svg width="${panelWidth}" height="${stripHeight}">`
      + `<rect width="100%" height="100%" fill="#0b0d10"/>`
      + `<text x="16" y="30" font-family="Segoe UI, sans-serif" font-size="20" fill="#e8eef5">${text}</text>`
      + `</svg>`,
    ),
    top: 0,
    left: x,
  });
  const [beforePanel, afterPanel] = await Promise.all([
    sharp(beforeFile).resize(panelWidth, panelHeight).toBuffer(),
    sharp(afterFile).resize(panelWidth, panelHeight).toBuffer(),
  ]);
  await sharp({
    create: {
      width: panelWidth * 2, height: panelHeight + stripHeight,
      channels: 3, background: { r: 11, g: 13, b: 16 },
    },
  }).composite([
    label(`BEFORE — ${caption}`, 0),
    label(`AFTER — ${caption}`, panelWidth),
    { input: beforePanel, top: stripHeight, left: 0 },
    { input: afterPanel, top: stripHeight, left: panelWidth },
  ]).png().toFile(outFile);
}

const beforeReport = loadReport(BEFORE);
const afterReport = loadReport(AFTER);
const beforeShots = indexShots(beforeReport);
const afterShots = indexShots(afterReport);

mkdirSync(OUT, { recursive: true });

const round = (value) => Number(value.toFixed(2));
const rows = [];
const failures = [];

for (const [key, after] of afterShots) {
  const before = beforeShots.get(key);
  if (!before) { failures.push(`${key}: no BEFORE frame to compare against`); continue; }
  const b = before.shot.stats;
  const a = after.shot.stats;
  const meanChannelShift = (Math.abs(a.meanR - b.meanR) + Math.abs(a.meanG - b.meanG) + Math.abs(a.meanB - b.meanB)) / 3;
  // Where the hue actually went: the change in red-minus-blue is the warm/cool
  // axis, green-minus-average is the foliage/steel axis.
  const warmCoolShift = (a.meanR - a.meanB) - (b.meanR - b.meanB);
  const greenShift = (a.meanG - (a.meanR + a.meanB) / 2) - (b.meanG - (b.meanR + b.meanB) / 2);
  const row = {
    arena: after.arena.arena,
    camera: after.shot.camera,
    meanChannelShiftSteps: round(meanChannelShift),
    warmCoolShiftSteps: round(warmCoolShift),
    greenShiftSteps: round(greenShift),
    saturationDeltaPoints: round(a.meanSaturation - b.meanSaturation),
    shadowMassDeltaPoints: round(a.shadowMassPercent - b.shadowMassPercent),
    highlightMassDeltaPoints: round(a.highlightMassPercent - b.highlightMassPercent),
    shadowFloorDeltaSteps: a.lumaP05 - b.lumaP05,
    midtoneDeltaSteps: a.lumaP50 - b.lumaP50,
    cornerRetentionDeltaPoints: round(a.cornerRetentionPercent - b.cornerRetentionPercent),
    composite: resolve(OUT, `${key}.png`),
  };
  const problems = [];
  if (row.shadowMassDeltaPoints > SAFETY.maximumShadowMassGrowthPoints) {
    problems.push(`shadow mass grew ${row.shadowMassDeltaPoints} points (cap ${SAFETY.maximumShadowMassGrowthPoints})`);
  }
  if (-row.shadowFloorDeltaSteps > SAFETY.maximumShadowFloorDropSteps) {
    problems.push(`shadow floor dropped ${-row.shadowFloorDeltaSteps} steps (cap ${SAFETY.maximumShadowFloorDropSteps})`);
  }
  if (-row.cornerRetentionDeltaPoints > SAFETY.maximumCornerRetentionLossPoints) {
    problems.push(`corner luminance lost ${-row.cornerRetentionDeltaPoints} points (cap ${SAFETY.maximumCornerRetentionLossPoints})`);
  }
  if (!NEUTRAL_BY_DESIGN.has(row.arena)
    && row.meanChannelShiftSteps < VISIBILITY.minimumMeanChannelShiftSteps) {
    problems.push(`INVISIBLE: mean shift only ${row.meanChannelShiftSteps} steps (floor ${VISIBILITY.minimumMeanChannelShiftSteps})`);
  }
  row.problems = problems;
  if (problems.length > 0) failures.push(`${key}: ${problems.join('; ')}`);
  await composite(before.shot.file, after.shot.file, row.composite, `${row.arena} · ${row.camera}`);
  rows.push(row);
}

rows.sort((left, right) => left.arena.localeCompare(right.arena) || left.camera.localeCompare(right.camera));

const summary = {
  before: { directory: BEFORE, preset: beforeReport.preset, renderer: beforeReport.renderer },
  after: { directory: AFTER, preset: afterReport.preset, renderer: afterReport.renderer },
  safety: SAFETY,
  visibility: VISIBILITY,
  verdict: failures.length === 0 ? 'PASS' : 'ATTENTION',
  failures,
  rows,
};
writeFileSync(resolve(OUT, 'comparison.json'), JSON.stringify(summary, null, 2) + String.fromCharCode(10));

const pad = (value, width) => String(value).padStart(width);
console.log(`preset before=${beforeReport.preset} after=${afterReport.preset}  backend=${afterReport.renderer?.actualBackend}`);
console.log('arena/camera                              shift  warm  green   sat  shadow  floor  corner');
for (const row of rows) {
  console.log(
    `${`${row.arena}/${row.camera}`.padEnd(42)}`
    + `${pad(row.meanChannelShiftSteps, 5)} ${pad(row.warmCoolShiftSteps, 5)} ${pad(row.greenShiftSteps, 6)}`
    + ` ${pad(row.saturationDeltaPoints, 5)} ${pad(row.shadowMassDeltaPoints, 7)} ${pad(row.shadowFloorDeltaSteps, 6)}`
    + ` ${pad(row.cornerRetentionDeltaPoints, 7)}`
    + (row.problems.length > 0 ? `  <- ${row.problems.join('; ')}` : ''),
  );
}
console.log(`\nverdict: ${summary.verdict}`);
for (const failure of failures) console.log(`  ${failure}`);
console.log(resolve(OUT, 'comparison.json'));
