#!/usr/bin/env node
// Reference-grounded loop - tier 0, the mechanical perceptual pre-check.
// Contract: reference-precheck-v1.
//
// Runs before any model is called, costs no quota, and takes well under a
// second. Its output is handed to the vision critic ALONGSIDE the images, so
// "looks fine" cannot outvote a measured 0.31 edge IoU on the cab region.
//
// READ THE LIMIT IN perceptual.mjs BEFORE QUOTING A NUMBER FROM HERE.
// These are relative, cross-cycle numbers against a reference that does not
// share our camera. They are direction of travel, region localisation and a
// plateau signal. They are not a fidelity percentage.
//
// Usage:
//   node scripts/loop/precheck.mjs --reference <img> --capture <img> \
//     [--out <precheck.json>] [--composite <composite.png>] [--rows 3] [--cols 3]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlane, aspectMismatch, writeComposite, ANALYSIS_W, ANALYSIS_H } from './image.mjs';
import {
  comparePlanes, cropPlane, gridRegions, regionDisagreement, sobelMagnitude, binariseByOtsu,
} from './perceptual.mjs';

export const PRECHECK_CONTRACT = 'reference-precheck-v1';

export const HONEST_LIMIT =
  'Relative, cross-cycle numbers for one reference/capture pair. A reference and a render do not share a camera, '
  + 'so an absolute value here is not a fidelity score. Use for direction of travel, region localisation and plateau detection only.';

/**
 * Compare one reference against one capture.
 * `regions` may be a caller-supplied named region list (from the reference
 * set), otherwise a rows x cols grid is used.
 */
export async function precheck({ referencePath, capturePath, rows = 3, cols = 3, regions = null, compositePath = null }) {
  const reference = await loadPlane(referencePath);
  const capture = await loadPlane(capturePath);
  const width = ANALYSIS_W;
  const height = ANALYSIS_H;

  const global = comparePlanes(reference.luma, capture.luma, width, height, {
    alphaA: reference.alpha, alphaB: capture.alpha,
  });

  const rects = regions ?? gridRegions(width, height, rows, cols);
  const regionResults = [];
  for (const rect of rects) {
    const a = cropPlane(reference.luma, width, height, rect);
    const b = cropPlane(capture.luma, width, height, rect);
    const metrics = comparePlanes(a, b, rect.w, rect.h);
    regionResults.push({ id: rect.id, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, ...metrics, disagreement: regionDisagreement(metrics) });
  }
  regionResults.sort((a, b) => a.id.localeCompare(b.id));
  const worst = regionResults.slice().sort((a, b) => b.disagreement - a.disagreement)[0] ?? null;

  let composite = null;
  if (compositePath) {
    const maskA = binariseByOtsu(sobelMagnitude(reference.luma, width, height)).mask;
    const maskB = binariseByOtsu(sobelMagnitude(capture.luma, width, height)).mask;
    mkdirSync(dirname(compositePath), { recursive: true });
    composite = await writeComposite(referencePath, capturePath, maskA, maskB, compositePath, { width, height });
  }

  return {
    contract: PRECHECK_CONTRACT,
    honestLimit: HONEST_LIMIT,
    analysis: { width, height, fit: 'fill' },
    reference: { path: referencePath, sha256: reference.sha256, native: reference.native },
    capture: { path: capturePath, sha256: capture.sha256, native: capture.native },
    aspectMismatch: aspectMismatch(reference, capture),
    global,
    regions: regionResults,
    worstRegion: worst ? { id: worst.id, disagreement: worst.disagreement, edgeIoU: worst.edgeIoU, ssim: worst.ssim } : null,
    compositePath: composite,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (!args.reference || !args.capture) {
    console.error('usage: node scripts/loop/precheck.mjs --reference <img> --capture <img> [--out <json>] [--composite <png>]');
    process.exitCode = 2;
    return;
  }
  const result = await precheck({
    referencePath: resolve(args.reference),
    capturePath: resolve(args.capture),
    rows: args.rows ? Number(args.rows) : 3,
    cols: args.cols ? Number(args.cols) : 3,
    compositePath: args.composite ? resolve(args.composite) : null,
  });
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    contract: result.contract,
    global: result.global,
    worstRegion: result.worstRegion,
    aspectMismatch: result.aspectMismatch,
    out: args.out ?? null,
  }, null, 2));
}

// process.argv[1] is undefined when this module is imported from `node -e`,
// and pathToFileURL(undefined) throws before anything else can run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1; });
}
