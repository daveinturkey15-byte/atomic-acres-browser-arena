#!/usr/bin/env node
// Turn below-deck capture frames into luminance numbers.
//
// Same sRGB decode and the same "avoid the HUD" crop discipline as
// scripts/qa/measure-pass29-luminance.py, so a below-deck number is comparable
// to the luminance numbers this repo already records. sharp does the decode
// (the repo's existing image-measurement dependency); no numpy needed.
//
// Two windows per frame:
//   gameplay - the Pass 29 crop (y 0.174..0.889, x 0.219..0.625). Clear of the
//              minimap, score strip, weapon panel and FPS badge.
//   corridor - a tighter band (y 0.20..0.58, x 0.30..0.70) that is pure world
//              geometry down the corridor: no viewmodel, no crosshair. This is
//              the "can I read an enemy silhouette down there" window.
//
// Usage:
//   node scripts/qa/report-below-deck-luminance.mjs <dir>              # one run
//   node scripts/qa/report-below-deck-luminance.mjs <before> <after>   # paired
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WINDOWS = {
  gameplay: [0.174, 0.889, 0.219, 0.625],
  corridor: [0.200, 0.580, 0.300, 0.700],
};

const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const toSrgb255 = (linear) => Math.min(255, Math.max(0, (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055) * 255));

const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];

async function metrics(file) {
  const image = sharp(file).removeAlpha();
  const { width, height } = await image.metadata();
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const out = {};
  for (const [name, [y0, y1, x0, x1]] of Object.entries(WINDOWS)) {
    const top = Math.round(height * y0);
    const bottom = Math.round(height * y1);
    const left = Math.round(width * x0);
    const right = Math.round(width * x1);
    const luminance = [];
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * width + x) * 3;
        luminance.push(
          0.2126 * toLinear(data[index] / 255)
          + 0.7152 * toLinear(data[index + 1] / 255)
          + 0.0722 * toLinear(data[index + 2] / 255),
        );
      }
    }
    luminance.sort((a, b) => a - b);
    const mean = luminance.reduce((total, value) => total + value, 0) / luminance.length;
    // Below 12/255 an SDR panel in a lit room shows nothing at all; below 24/255
    // a player cannot separate a moving silhouette from the wall behind it.
    const crushed = luminance.filter((value) => toSrgb255(value) < 12).length / luminance.length;
    const underReadable = luminance.filter((value) => toSrgb255(value) < 24).length / luminance.length;
    out[name] = {
      meanLinear: Number(mean.toFixed(5)),
      medianLinear: Number(percentile(luminance, 0.5).toFixed(5)),
      p10Linear: Number(percentile(luminance, 0.1).toFixed(5)),
      p90Linear: Number(percentile(luminance, 0.9).toFixed(5)),
      meanSrgb255: Number(toSrgb255(mean).toFixed(1)),
      medianSrgb255: Number(toSrgb255(percentile(luminance, 0.5)).toFixed(1)),
      p10Srgb255: Number(toSrgb255(percentile(luminance, 0.1)).toFixed(1)),
      p90Srgb255: Number(toSrgb255(percentile(luminance, 0.9)).toFixed(1)),
      crushedPct: Number((crushed * 100).toFixed(1)),
      underReadablePct: Number((underReadable * 100).toFixed(1)),
    };
  }
  return out;
}

async function measureDirectory(directory) {
  const entries = {};
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.png')).sort()) {
    entries[name.replace(/\.png$/, '')] = await metrics(resolve(directory, name));
  }
  return entries;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: report-below-deck-luminance.mjs <dir> [afterDir]');
  process.exit(1);
}

if (args.length === 1) {
  console.log(JSON.stringify(await measureDirectory(resolve(args[0])), null, 2));
} else {
  const before = await measureDirectory(resolve(args[0]));
  const after = await measureDirectory(resolve(args[1]));
  const paired = {};
  for (const station of Object.keys(before).filter((key) => key in after).sort()) {
    paired[station] = {};
    for (const window of Object.keys(WINDOWS)) {
      paired[station][window] = {
        before: before[station][window],
        after: after[station][window],
        meanSrgb255Delta: Number((after[station][window].meanSrgb255 - before[station][window].meanSrgb255).toFixed(1)),
        p10Srgb255Delta: Number((after[station][window].p10Srgb255 - before[station][window].p10Srgb255).toFixed(1)),
        crushedPctDelta: Number((after[station][window].crushedPct - before[station][window].crushedPct).toFixed(1)),
      };
    }
  }
  console.log(JSON.stringify(paired, null, 2));
}
