#!/usr/bin/env node
// Owner reference vs in-engine render — SIDE-BY-SIDE COMPARISON SHEETS.
//
// The owner judges this arena against his own image-gen references. Until now
// that comparison happened in his head, from two folders opened in two windows,
// which is exactly the kind of judgement that drifts between passes. This
// script composes it into one artefact per pairing: his reference on the LEFT,
// the matching in-engine capture on the RIGHT, at the same pixel height, with a
// caption strip that names both files, both pixel sizes, the capture's
// timestamp and how honest the pairing itself is.
//
// HONESTY RULES (the whole point of the instrument — do not relax them):
//   1. The RENDER is never colour-corrected, never cropped and never letterboxed.
//      At the default panel height it is composited at its NATIVE resolution
//      with no resampling at all; if a non-native panel height forces a resize,
//      the caption says so on the sheet.
//   2. The REFERENCE is only ever scaled to the panel height. Different aspect
//      ratios produce different panel WIDTHS — they are never padded to match,
//      because equal-looking frames imply an agreement that is not there.
//   3. A pairing the engine cannot honour is drawn as an explicit diagnostic
//      panel ("NO CAPTURE FOUND" / "NO IN-ENGINE COUNTERPART"), never dropped
//      and never back-filled from a neighbouring station. A missing station is
//      a finding; a silently substituted one is a lie.
//   4. Every caption carries the capture file's mtime, so a sheet built from a
//      stale or mixed-build capture set says so on its face.
//
// PAIRINGS below are a REVIEWED literal (same discipline as
// scripts/qa/viewpoint-catalog.mjs): each entry records WHY a reference maps to
// a station, and `match` grades the mapping so a loose pairing cannot read as a
// tight one.
//
// Usage:
//   node scripts/qa/compare-refs-vs-render.mjs                      # baseline, repo-state
//   node scripts/qa/compare-refs-vs-render.mjs \
//     --captures artifacts/viewpoint-regression/<label>/atomic-acres-rebuild
//
// Options:
//   --refs <dir>             owner reference images
//   --captures <dir>         directory searched for in-engine captures
//   --capture-prefix a,b     enable ALIAS matching restricted to these filename
//                            prefixes, in preference order (e.g. rb12,rb11).
//                            Without it, matching is STRICT: a capture must be
//                            named exactly <viewpoint-id>.png, which is what a
//                            fresh capture-arena-viewpoints.mjs run produces.
//   --out <dir>              where sheets are written
//   --panel-height <px>      panel height (default 720 = native capture height)
//   --slug-prefix <str>      output filename prefix (default "cmp")
//   --list                   print the resolution plan, write nothing
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Reviewed pairing table.
// ---------------------------------------------------------------------------
// `match`:
//   direct     — same subject AND broadly the same framing; a fair side-by-side.
//   indicative — same subject, DIFFERENT vantage. Useful for content, not for
//                composition. The sheet says so in its caption.
//   unbuilt    — the reference has an intended station that the arena does not
//                currently author. Rendered as a diagnostic, not as a pair.
//   unpaired   — no in-engine counterpart exists at all, and forcing one would
//                misrepresent the build. Rendered as a diagnostic.
//
// teal = WEST house, yellow = EAST house — authored fact 2 in the header of
// src/rendering/arenas/atomic-acres-rebuild.ts.
export const PAIRINGS = Object.freeze([
  Object.freeze({
    ref: 'layout-topdown.png',
    viewpoint: 'atomic-acres-rebuild-topdown',
    match: 'direct',
    note: 'Plan read of the whole map. Authored camera is a true orthogonal-ish top-down at [0,100,-13]; the reference is the same plan with roofs on.',
  }),
  Object.freeze({
    ref: 'layout-angle.png',
    viewpoint: 'atomic-acres-rebuild-overview',
    match: 'direct',
    note: 'High three-quarter of the whole plan: both houses, both garages, the loop and the south-entry choke in one frame.',
  }),
  Object.freeze({
    ref: 'road-entrance.png',
    viewpoint: 'atomic-acres-rebuild-street-south',
    match: 'direct',
    note: 'South entry at eye height looking north up the loop through the choke at the bus + semi pair. The closest framing match in the whole set.',
  }),
  Object.freeze({
    ref: 'street-teal.png',
    viewpoint: 'atomic-acres-rebuild-street-north',
    match: 'indicative',
    note: 'Reference stands BESIDE the teal/west house looking across the loop; the authored station stands at the NORTH end of the loop looking south. Same street, different vantage — compare content and material, not composition.',
  }),
  Object.freeze({
    ref: 'street-yellow.png',
    viewpoint: 'atomic-acres-rebuild-street-south',
    match: 'indicative',
    note: 'Reference stands BESIDE the yellow/east house; the nearest authored street station is the south entry. No authored camera looks across the loop from the east kerb.',
  }),
  Object.freeze({
    ref: 'teal-backyard.png',
    viewpoint: 'atomic-acres-rebuild-yard-geometry',
    match: 'direct',
    note: 'West (teal) yard side-on: house flank, garage, driveway car, patio set, hedge and fence lines. This is the authored light-occlusion station.',
  }),
  Object.freeze({
    ref: 'living-room-eye.png',
    viewpoint: 'atomic-acres-rebuild-interior-west',
    match: 'direct',
    note: 'West (teal) ground-floor great room toward the stair and kitchen opening — the same room the reference stands in.',
  }),
  Object.freeze({
    ref: 'hero-vehicles.png',
    viewpoint: 'atomic-acres-rebuild-bus-closeup',
    match: 'direct',
    note: 'The bus + semi pair on the street. Authored as the kitbash proof station (catalog GLB over massing placeholder).',
  }),
  Object.freeze({
    ref: 'bedroom-eye.png',
    viewpoint: 'atomic-acres-rebuild-upper-landing',
    match: 'indicative',
    note: 'Upper landing toward the front-bedroom door. This station was MISSING when this instrument was first written - the catalog listed it but the arena no longer authored it - and was restored on 2026-09-16, so it now captures. Graded indicative rather than direct: the reference frames a furnished bedroom interior, while the restored camera was placed one storey above the known-good interior-west eye and its exact aim against the landing is not yet confirmed against the authored geometry.',
  }),
  // ADDED 2026-09-16. `npm run qa:catalogue` reported 556 reference images
  // against 9 paired stations - 1.6% corpus coverage - and even the 18-plate
  // frozen bar had only 9. These five plates had NO station at all, so five were
  // authored for them in src/rendering/arenas/atomic-acres-rebuild.ts. Graded
  // 'indicative' rather than 'direct' on first pass: the stations are placed
  // from the arena's authored extents (side lawns x +/-21, back lawns z -16,
  // service roads x +/-31) and their framing against these plates has not yet
  // been confirmed by eye.
  Object.freeze({
    ref: 'teal-side-lane.png',
    viewpoint: 'atomic-acres-rebuild-side-lane-west',
    match: 'indicative',
    note: 'Eye-level down the west (teal) side lane: boundary fence one side, house siding and hedges the other, outbuilding and ridge closing the far end.',
  }),
  Object.freeze({
    ref: 'yellow-side-lane.png',
    viewpoint: 'atomic-acres-rebuild-side-lane-east',
    match: 'indicative',
    note: 'The east (yellow) mirror of the same lane.',
  }),
  Object.freeze({
    ref: 'yellow-backyard.png',
    viewpoint: 'atomic-acres-rebuild-backyard-east',
    match: 'indicative',
    note: 'East house rear yard. Also the first station this arena has ever pointed at the east house - every earlier interior and yard camera was on the west.',
  }),
  Object.freeze({
    ref: 'road-far-end.png',
    viewpoint: 'atomic-acres-rebuild-road-far-end',
    match: 'indicative',
    note: 'The loop road from its far end, held low and straight down the carriageway. The road surface is the most-resolved material in the build and nothing was framing it.',
  }),
  Object.freeze({
    ref: 'balcony-backyard.png',
    viewpoint: 'atomic-acres-rebuild-balcony-backyard',
    match: 'indicative',
    note: 'From the west upper storey out over its own back lawn. Second upper-floor station; before today the upper floor had none.',
  }),
  // batch-2-layout/map__center-loop.png is not in _judge/refs, so pass --refs at
  // that directory to compose this pair. Kept here because it is the most
  // complete single statement of the map's intended composition in the corpus.
  Object.freeze({
    ref: 'map__center-loop.png',
    viewpoint: 'atomic-acres-rebuild-center-loop',
    match: 'direct',
    note: 'Elevated centred read down the loop carriageway: both houses flanking, bus and semi nose-to-nose in the turnaround, desert and ridge beyond.',
  }),
  Object.freeze({
    ref: 'teal-ground-cutaway.png',
    viewpoint: null,
    match: 'unpaired',
    note: 'Roof-off three-quarter cutaway of the west house ground floor. The arena authors no cutaway camera, and no debug hook removes roofs for review, so there is no frame to put beside it. The nearest in-engine look inside this floor is atomic-acres-rebuild-interior-west, which is eye-level and is already paired to living-room-eye.png.',
  }),
  Object.freeze({
    ref: 'teal-upper-cutaway.png',
    viewpoint: null,
    match: 'unpaired',
    note: 'Roof-off cutaway of the west house UPPER floor. Two things are missing, not one: there is no cutaway camera, and the only authored upper-floor station (atomic-acres-rebuild-upper-landing) is absent from the arena module.',
  }),
  Object.freeze({
    ref: 'yellow-ground-cutaway.png',
    viewpoint: null,
    match: 'unpaired',
    note: 'Roof-off cutaway of the EAST house ground floor. Beyond the missing cutaway camera, the east house has no authored interior station of any kind — every interior camera in this arena is in the west house.',
  }),
]);

// Filename aliases used ONLY in --capture-prefix mode, for capture sets that
// predate the authored station ids (repo-state/rb*-rebuild-<short>.png). The
// short names are lossy — `rebuild-street` does not say which of the two
// authored street stations produced it — so every sheet names the exact file it
// used and flags an alias resolution in its caption.
const CAPTURE_ALIASES = Object.freeze({
  'atomic-acres-rebuild-overview': ['overview', 'rebuild-overview'],
  'atomic-acres-rebuild-topdown': ['topdown', 'rebuild-topdown'],
  'atomic-acres-rebuild-street-north': ['street-north', 'rebuild-street-north', 'street', 'rebuild-street'],
  'atomic-acres-rebuild-street-south': ['street-south', 'rebuild-street-south', 'street', 'rebuild-street'],
  'atomic-acres-rebuild-yard-geometry': ['yard-geometry', 'rebuild-yard-geometry', 'yard', 'rebuild-yard'],
  'atomic-acres-rebuild-interior-west': ['interior-west', 'rebuild-interior-west', 'interior', 'rebuild-interior'],
  'atomic-acres-rebuild-upper-landing': ['upper-landing', 'rebuild-upper-landing', 'upper', 'rebuild-upper'],
  'atomic-acres-rebuild-bus-closeup': ['bus-closeup', 'rebuild-bus-closeup', 'bus', 'rebuild-bus'],
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const REFS_DIR = resolve(arg('--refs', 'C:/Users/david/Desktop/stuff/atomic-acres-catalog/_judge/refs'));

/**
 * Some pairings name a plate that does NOT live in the frozen-bar directory —
 * `map__center-loop.png` is in `batch-2-layout/`, and it is the single most
 * complete statement of this map's intended composition in the whole corpus, so
 * it earns a pairing even though it sits outside `_judge/refs`.
 *
 * Without this the default run drew a REFERENCE MISSING diagnostic beside a
 * perfectly good render, which is worse than useless: the instrument exists to
 * say honestly what is and is not being compared, and a red panel there reads
 * as "the engine produced nothing" when the truth is "the plate is in another
 * folder". Resolve against the frozen bar first, then these, and report which.
 */
const REF_FALLBACK_DIRS = [
  resolve('C:/Users/david/Desktop/stuff/atomic-acres-catalog/batch-2-layout'),
  resolve('C:/Users/david/Desktop/stuff/atomic-acres-catalog/batch-3'),
  resolve('C:/Users/david/Desktop/stuff/atomic-acres-catalog/batch-4-nuketown-graybox'),
];

/** Absolute path of a pairing's reference, searching the fallbacks in order. */
function resolveRef(name) {
  const primary = join(REFS_DIR, name);
  if (existsSync(primary)) return primary;
  for (const dir of REF_FALLBACK_DIRS) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return primary;
}
// OUTPUT MOVED INSIDE THE REPO, 2026-09-16. These two defaults were an absolute
// path to one directory on one desktop, OUTSIDE the worktree and therefore
// outside version control. 147 files and 305 MB of review evidence accumulated
// there - every composed side-by-side sheet this instrument has ever made -
// and none of it was reachable from any commit, on any other machine, or by
// anyone reviewing a PR. An audit found it by reading a path that returns
// "No such file or directory" from inside the repo. Evidence nobody can reach
// is not evidence.
//
// Sheets now land in docs/review/<arena>/ which IS tracked. Captures still
// default to the artifacts/ sweep directory, which is gitignored on purpose -
// raw stills are large and regenerable from a commit, whereas a composed sheet
// carries the comparison and the provenance caption and is what a reviewer
// actually reads.
const CAPTURES_DIR = resolve(arg('--captures', 'artifacts/viewpoint-regression/latest/atomic-acres-rebuild'));
const OUT_DIR = resolve(arg('--out', 'docs/review/atomic-acres-rebuild'));
const PANEL_H = Number(arg('--panel-height', '720'));
const SLUG_PREFIX = arg('--slug-prefix', 'cmp');
const PREFIXES = (arg('--capture-prefix', '') || '')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const LIST_ONLY = flag('--list');

const FONT = 'Segoe UI';
const BG = '#14161a';
const PANEL_GUTTER = 18;
const MARGIN = 18;

// ---------------------------------------------------------------------------
// Capture resolution
// ---------------------------------------------------------------------------
const walk = (dir, depth = 2) => {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0) found.push(...walk(full, depth - 1));
    } else if (/\.png$/i.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
};

const CAPTURE_FILES = walk(CAPTURES_DIR);

// Sample variants (`<id>.s1.png`) exist because capture-arena-viewpoints.mjs
// takes N persistence samples. Sample 0 is the contract frame; prefer it.
const isSampleVariant = (file) => /\.s\d+\.png$/i.test(file);

const resolveCapture = (viewpoint) => {
  if (!viewpoint) return null;
  const stem = (file) => basename(file).replace(/\.png$/i, '').replace(/\.s\d+$/i, '');

  // STRICT: exactly the authored station id. This is what a fresh
  // capture-arena-viewpoints.mjs run writes, and it cannot mis-resolve.
  const exact = CAPTURE_FILES
    .filter((file) => stem(file) === viewpoint)
    .sort((a, b) => Number(isSampleVariant(a)) - Number(isSampleVariant(b)));
  if (exact.length > 0) {
    return { path: exact[0], how: 'exact station id', alias: null };
  }
  if (PREFIXES.length === 0) return null;

  // ALIAS: only for files carrying one of the declared prefixes, ranked by
  // prefix order first (newest capture wave first), then by alias specificity,
  // then by mtime.
  const aliases = CAPTURE_ALIASES[viewpoint] ?? [];
  const candidates = [];
  for (const file of CAPTURE_FILES) {
    const name = stem(file);
    const prefixRank = PREFIXES.findIndex((prefix) => basename(file).startsWith(prefix));
    if (prefixRank < 0) continue;
    const aliasRank = aliases.findIndex((alias) => name === alias || name.endsWith(`-${alias}`) || name.endsWith(`_${alias}`));
    if (aliasRank < 0) continue;
    candidates.push({ file, prefixRank, aliasRank, alias: aliases[aliasRank], mtime: statSync(file).mtimeMs });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.prefixRank - b.prefixRank || a.aliasRank - b.aliasRank || b.mtime - a.mtime);
  const best = candidates[0];
  return { path: best.file, how: `alias '${best.alias}' under prefix '${PREFIXES[best.prefixRank]}'`, alias: best.alias };
};

// ---------------------------------------------------------------------------
// Text rendering
// ---------------------------------------------------------------------------
const escapeMarkup = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const textPng = async (text, { dpi = 132, color = '#e9edf2', width, weight = 'normal' } = {}) => {
  const span = `<span foreground="${color}" weight="${weight}">${escapeMarkup(text)}</span>`;
  const buffer = await sharp({
    text: { text: span, font: FONT, dpi, rgba: true, ...(width ? { width } : {}) },
  }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
};

/** Stack text lines into composite ops, returning ops + consumed height. */
const stackText = async (lines, { left, top, lineGap = 7, maxWidth }) => {
  const ops = [];
  let y = top;
  for (const line of lines) {
    if (line.text === '') { y += 10; continue; }
    const rendered = await textPng(line.text, { ...line, width: maxWidth });
    ops.push({ input: rendered.buffer, left, top: y });
    y += rendered.height + lineGap;
  }
  return { ops, height: y - top };
};

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------
const MATCH_COLOR = {
  direct: '#7fd18a',
  indicative: '#f0c674',
  unbuilt: '#e8836f',
  unpaired: '#e8836f',
  missing: '#e8836f',
};

/** Reference panel: scaled to panel height only. Never cropped, never padded. */
const referencePanel = async (refPath) => {
  const meta = await sharp(refPath).metadata();
  const buffer = await sharp(refPath)
    .resize({ height: PANEL_H, kernel: 'lanczos3', fit: 'inside', withoutEnlargement: false })
    .png().toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    width: out.width,
    height: out.height,
    native: `${meta.width}x${meta.height}`,
    resampled: meta.height !== PANEL_H,
  };
};

/** Render panel: composited at NATIVE resolution whenever the panel height allows. */
const renderPanel = async (capPath) => {
  const meta = await sharp(capPath).metadata();
  if (meta.height === PANEL_H) {
    return {
      buffer: await sharp(capPath).png().toBuffer(),
      width: meta.width,
      height: meta.height,
      native: `${meta.width}x${meta.height}`,
      resampled: false,
    };
  }
  const buffer = await sharp(capPath)
    .resize({ height: PANEL_H, kernel: 'lanczos3', fit: 'inside' })
    .png().toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    width: out.width,
    height: out.height,
    native: `${meta.width}x${meta.height}`,
    resampled: true,
  };
};

/** Diagnostic panel used where no honest image exists. Deliberately unlike a render. */
const diagnosticPanel = async (headline, body, width) => {
  const panelWidth = Math.max(560, Math.round(width));
  const head = await textPng(headline, { dpi: 190, color: '#e8836f', weight: 'bold', width: panelWidth - 64 });
  const text = await textPng(body, { dpi: 116, color: '#aab3bf', width: panelWidth - 64 });
  const base = sharp({
    create: { width: panelWidth, height: PANEL_H, channels: 4, background: '#22262c' },
  });
  const buffer = await base.composite([
    { input: head.buffer, left: 32, top: Math.max(24, Math.round(PANEL_H / 2) - head.height - 40) },
    { input: text.buffer, left: 32, top: Math.max(24, Math.round(PANEL_H / 2) - head.height - 40) + head.height + 22 },
  ]).png().toBuffer();
  return { buffer, width: panelWidth, height: PANEL_H, native: null, resampled: false, diagnostic: true };
};

// ---------------------------------------------------------------------------
// Sheet composition
// ---------------------------------------------------------------------------
const stamp = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};
const humanTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const composeSheet = async (pair, index, total, context) => {
  const refPath = resolveRef(pair.ref);
  const refExists = existsSync(refPath);
  const left = refExists
    ? await referencePanel(refPath)
    : await diagnosticPanel('REFERENCE MISSING', `${pair.ref} was not found in ${REFS_DIR} or any fallback reference directory`, 960);

  let right;
  let rightTitle;
  let rightLines;
  let provenanceWarning = null;
  let effectiveMatch = pair.match;

  if (pair.match === 'unpaired') {
    right = await diagnosticPanel('NO IN-ENGINE COUNTERPART',
      'This reference has no authored review camera to stand beside it.\nSee the MATCH line below for exactly what is missing.\nNothing has been substituted.', left.width);
    rightTitle = 'IN-ENGINE  —  none';
    rightLines = ['no authored station maps to this reference'];
  } else if (!context.resolved[pair.ref]) {
    const why = pair.match === 'unbuilt'
      ? `Station '${pair.viewpoint}' is not authored by the arena module, so nothing can capture it.`
      : `No capture for '${pair.viewpoint}' in\n${CAPTURES_DIR}${PREFIXES.length ? `\n(prefixes: ${PREFIXES.join(', ')})` : '\n(strict mode: expects <station-id>.png)'}`;
    right = await diagnosticPanel(pair.match === 'unbuilt' ? 'STATION NOT AUTHORED' : 'NO CAPTURE FOUND', why, left.width);
    rightTitle = `IN-ENGINE  —  ${pair.viewpoint}`;
    rightLines = [pair.match === 'unbuilt' ? 'camera absent from src/rendering/arenas/atomic-acres-rebuild.ts' : 'no matching capture file'];
    effectiveMatch = pair.match === 'unbuilt' ? 'unbuilt' : 'missing';
  } else {
    const hit = context.resolved[pair.ref];
    right = await renderPanel(hit.path);
    const mtime = new Date(statSync(hit.path).mtime);
    rightTitle = `IN-ENGINE  —  ${pair.viewpoint}`;
    rightLines = [
      `${basename(hit.path)}   ${right.native}   captured ${humanTime(mtime)}`,
      `resolved by ${hit.how}${right.resampled ? `   [RESAMPLED to ${right.width}x${right.height}]` : '   [native resolution, unresampled]'}`,
    ];
    if (hit.shared) {
      provenanceWarning = `PROVENANCE: ${basename(hit.path)} is the ONLY capture matching ${hit.shared.length} different authored stations (${hit.shared.join(', ')}). Its filename does not say which one produced it, so this panel may be the wrong station. Re-run against a fresh capture set named by station id to remove the doubt.`;
    }
  }

  const contentWidth = left.width + PANEL_GUTTER + right.width;
  const sheetWidth = contentWidth + MARGIN * 2;

  const headerLines = [
    { text: `ATOMIC ACRES  ·  REFERENCE vs IN-ENGINE  ·  ${pair.ref.replace(/\.png$/i, '')}`, dpi: 176, color: '#ffffff', weight: 'bold' },
    { text: `pair ${index + 1} of ${total}   ·   arena atomic-acres-rebuild   ·   sheet composed ${context.composedHuman}   ·   ${context.gitLine}`, dpi: 116, color: '#8c96a3' },
  ];
  const header = await stackText(headerLines, { left: MARGIN, top: MARGIN, maxWidth: sheetWidth - MARGIN * 2 });
  const headerHeight = header.height + 14;

  const labelTop = MARGIN + headerHeight;
  const leftLabel = await textPng('REFERENCE  (owner image-gen)', { dpi: 128, color: '#6fb7e8', weight: 'bold' });
  // A diagnostic panel must never wear the colour that means "here is a render".
  const rightLabel = await textPng(rightTitle, {
    dpi: 128, weight: 'bold',
    color: right.diagnostic ? (MATCH_COLOR[effectiveMatch] ?? '#e8836f') : '#7fd18a',
  });
  const labelHeight = Math.max(leftLabel.height, rightLabel.height) + 8;

  const panelTop = labelTop + labelHeight;
  const capTop = panelTop + PANEL_H + 14;

  const halfWidth = Math.max(left.width, right.width) - 8;
  const leftCaption = await stackText([
    { text: refExists ? `${pair.ref}   ${left.native}${left.resampled ? `   [scaled to ${left.width}x${left.height}]` : '   [native]'}` : `${pair.ref}   NOT FOUND`, dpi: 116, color: '#d6dde5' },
    { text: `from ${REFS_DIR.replace(/\\/g, '/')}`, dpi: 106, color: '#79828f' },
  ], { left: MARGIN, top: capTop, maxWidth: halfWidth });

  const rightCaptionLines = rightLines.map((line, i) => ({ text: line, dpi: i === 0 ? 116 : 106, color: i === 0 ? '#d6dde5' : '#79828f' }));
  const rightCaption = await stackText(rightCaptionLines, {
    left: MARGIN + left.width + PANEL_GUTTER, top: capTop, maxWidth: halfWidth,
  });

  const captionHeight = Math.max(leftCaption.height, rightCaption.height) + 12;
  const matchTop = capTop + captionHeight;
  const matchBlock = await stackText([
    { text: `MATCH: ${effectiveMatch.toUpperCase()}`, dpi: 126, color: MATCH_COLOR[effectiveMatch] ?? '#d6dde5', weight: 'bold' },
    { text: pair.note, dpi: 110, color: '#9aa4b1' },
    ...(provenanceWarning ? [{ text: provenanceWarning, dpi: 110, color: '#f0c674', weight: 'bold' }] : []),
    { text: 'Render is never colour-corrected, cropped or letterboxed. Reference is scaled to panel height only; differing aspect ratios stay differing widths.', dpi: 102, color: '#5f6874' },
  ], { left: MARGIN, top: matchTop, maxWidth: contentWidth });

  const sheetHeight = matchTop + matchBlock.height + MARGIN;

  const composite = [
    ...header.ops,
    { input: leftLabel.buffer, left: MARGIN, top: labelTop },
    { input: rightLabel.buffer, left: MARGIN + left.width + PANEL_GUTTER, top: labelTop },
    { input: left.buffer, left: MARGIN, top: panelTop },
    { input: right.buffer, left: MARGIN + left.width + PANEL_GUTTER, top: panelTop },
    ...leftCaption.ops,
    ...rightCaption.ops,
    ...matchBlock.ops,
  ];

  const slug = pair.ref.replace(/\.png$/i, '');
  const outPath = join(OUT_DIR, `${SLUG_PREFIX}-${slug}-${context.composedStamp}.png`);
  await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: BG } })
    .composite(composite).png().toFile(outPath);

  return { slug, outPath, match: effectiveMatch, width: sheetWidth, height: sheetHeight };
};

const composeIndex = async (sheets, context) => {
  const THUMB_W = 248;
  const THUMB_H = 140;
  const COLS = 3;
  const BLOCK_W = THUMB_W * 2 + 8 + 20;
  const BLOCK_H = THUMB_H + 44;

  const composite = [];
  const headerBlock = await stackText([
    { text: 'ATOMIC ACRES  ·  REFERENCE vs IN-ENGINE  ·  CONTACT SHEET', dpi: 190, color: '#ffffff', weight: 'bold' },
    { text: `${sheets.length} pairings   ·   arena atomic-acres-rebuild   ·   composed ${context.composedHuman}   ·   ${context.gitLine}`, dpi: 118, color: '#8c96a3' },
    { text: `references ${REFS_DIR.replace(/\\/g, '/')}   ·   captures ${CAPTURES_DIR.replace(/\\/g, '/')}${PREFIXES.length ? `  (prefix ${PREFIXES.join(',')})` : '  (strict station ids)'}`, dpi: 104, color: '#5f6874' },
  ], { left: MARGIN, top: MARGIN, maxWidth: COLS * BLOCK_W });
  composite.push(...headerBlock.ops);

  const gridTop = MARGIN + headerBlock.height + 18;
  for (let i = 0; i < sheets.length; i += 1) {
    const { pair, resolved, match } = sheets[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN + col * BLOCK_W;
    const y = gridTop + row * BLOCK_H;

    const refPath = resolveRef(pair.ref);
    const refThumb = existsSync(refPath)
      ? await sharp(refPath).resize(THUMB_W, THUMB_H, { fit: 'contain', background: '#000000' }).png().toBuffer()
      : await sharp({ create: { width: THUMB_W, height: THUMB_H, channels: 4, background: '#3a2020' } }).png().toBuffer();
    const capThumb = resolved
      ? await sharp(resolved.path).resize(THUMB_W, THUMB_H, { fit: 'contain', background: '#000000' }).png().toBuffer()
      : await sharp({ create: { width: THUMB_W, height: THUMB_H, channels: 4, background: '#2c2126' } })
          .composite([{ input: (await textPng(match === 'unpaired' ? 'no counterpart' : match === 'unbuilt' ? 'not authored' : 'no capture', { dpi: 112, color: '#e8836f' })).buffer, left: 14, top: THUMB_H / 2 - 12 }])
          .png().toBuffer();

    composite.push({ input: refThumb, left: x, top: y });
    composite.push({ input: capThumb, left: x + THUMB_W + 8, top: y });
    const label = await stackText([
      { text: pair.ref.replace(/\.png$/i, ''), dpi: 106, color: '#d6dde5' },
      { text: `${(pair.viewpoint ?? '—')}  ·  ${match}`, dpi: 98, color: MATCH_COLOR[match] ?? '#79828f' },
    ], { left: x, top: y + THUMB_H + 4, lineGap: 2, maxWidth: BLOCK_W - 24 });
    composite.push(...label.ops);
  }

  const rows = Math.ceil(sheets.length / COLS);
  const width = MARGIN * 2 + COLS * BLOCK_W;
  const height = gridTop + rows * BLOCK_H + MARGIN;
  const outPath = join(OUT_DIR, `${SLUG_PREFIX}-INDEX-${context.composedStamp}.png`);
  await sharp({ create: { width, height, channels: 4, background: BG } })
    .composite(composite).png().toFile(outPath);
  return outPath;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const composedAt = new Date();
const gitLine = (() => {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
    return `${branch} @ ${sha}${dirty ? ' (working tree dirty)' : ''}`;
  } catch {
    return 'git state unavailable';
  }
})();

const context = {
  composedStamp: stamp(composedAt),
  composedHuman: humanTime(composedAt),
  gitLine,
  resolved: {},
};

for (const pair of PAIRINGS) {
  context.resolved[pair.ref] = resolveCapture(pair.viewpoint);
}

// An alias like `rebuild-street` can be the best match for MORE THAN ONE
// authored station, because the historical filename dropped the distinction the
// station ids carry. When that happens the sheet must say it on its face: a
// reader looking at two sheets that show the SAME pixels under two different
// station names would otherwise conclude the arena looks identical from both
// ends of the loop, which is a claim this evidence cannot make.
{
  const stationsByPath = new Map();
  for (const pair of PAIRINGS) {
    const hit = context.resolved[pair.ref];
    if (!hit || !pair.viewpoint) continue;
    const seen = stationsByPath.get(hit.path) ?? new Set();
    seen.add(pair.viewpoint);
    stationsByPath.set(hit.path, seen);
  }
  for (const pair of PAIRINGS) {
    const hit = context.resolved[pair.ref];
    if (!hit) continue;
    const seen = stationsByPath.get(hit.path);
    if (seen && seen.size > 1) hit.shared = [...seen];
  }
}

if (LIST_ONLY) {
  console.log(JSON.stringify({
    contract: 'refs-vs-render-comparison-v1',
    refsDir: REFS_DIR,
    capturesDir: CAPTURES_DIR,
    prefixes: PREFIXES,
    capturesSeen: CAPTURE_FILES.length,
    plan: PAIRINGS.map((pair) => ({
      ref: pair.ref,
      refPresent: existsSync(resolveRef(pair.ref)),
      viewpoint: pair.viewpoint,
      match: pair.match,
      capture: context.resolved[pair.ref]?.path ?? null,
      how: context.resolved[pair.ref]?.how ?? null,
    })),
  }, null, 2));
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

const written = [];
const indexRows = [];
for (let i = 0; i < PAIRINGS.length; i += 1) {
  const pair = PAIRINGS[i];
  const sheet = await composeSheet(pair, i, PAIRINGS.length, context);
  written.push(sheet);
  indexRows.push({ pair, resolved: context.resolved[pair.ref], match: sheet.match });
  console.error(`[compare-refs] ${String(i + 1).padStart(2)} ${pair.ref.padEnd(26)} ${sheet.match.padEnd(11)} -> ${basename(sheet.outPath)}`);
}
const indexPath = await composeIndex(indexRows, context);

const tally = written.reduce((acc, sheet) => {
  acc[sheet.match] = (acc[sheet.match] ?? 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  contract: 'refs-vs-render-comparison-v1',
  composedAt: composedAt.toISOString(),
  git: gitLine,
  refsDir: REFS_DIR,
  capturesDir: CAPTURES_DIR,
  capturePrefixes: PREFIXES.length > 0 ? PREFIXES : null,
  panelHeight: PANEL_H,
  outDir: OUT_DIR,
  tally,
  index: indexPath,
  sheets: written.map((sheet) => ({ slug: sheet.slug, match: sheet.match, path: sheet.outPath })),
}, null, 2));
