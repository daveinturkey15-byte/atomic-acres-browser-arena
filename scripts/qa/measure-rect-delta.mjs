#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    base: null,
    candidate: null,
    rect: null,
    out: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) {
      options.base = args[++i];
    } else if (args[i] === '--candidate' && args[i + 1]) {
      options.candidate = args[++i];
    } else if (args[i] === '--rect' && args[i + 1]) {
      options.rect = args[++i];
    } else if (args[i] === '--out' && args[i + 1]) {
      options.out = args[++i];
    }
  }

  if (!options.base || !options.candidate) {
    console.error('Usage: node scripts/qa/measure-rect-delta.mjs --base <base.png> --candidate <cand.png> [--rect "x0,y0,x1,y1"] [--out <out.json>]');
    process.exit(1);
  }

  return options;
}

function computeLuma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function loadRawImage(filePath) {
  const image = sharp(filePath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

async function main() {
  const options = parseArgs();

  const [baseImg, candImg] = await Promise.all([
    loadRawImage(options.base),
    loadRawImage(options.candidate),
  ]);

  if (baseImg.width !== candImg.width || baseImg.height !== candImg.height) {
    throw new Error(`Dimension mismatch: base ${baseImg.width}x${baseImg.height} vs cand ${candImg.width}x${candImg.height}`);
  }

  const { width, height } = baseImg;
  const totalPixels = width * height;

  let parsedRect = null;
  let cX0 = 0, cX1 = 0, cY0 = 0, cY1 = 0;
  let dX0 = 0, dX1 = 0, dY0 = 0, dY1 = 0;
  let hasRect = false;

  if (options.rect) {
    const parts = options.rect.split(',').map((v) => Number(v.trim()));
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
      const [rx0, ry0, rx1, ry1] = parts;
      parsedRect = [rx0, ry0, rx1, ry1];
      cX0 = Math.max(0, Math.min(width, Math.min(rx0, rx1)));
      cX1 = Math.max(0, Math.min(width, Math.max(rx0, rx1)));
      cY0 = Math.max(0, Math.min(height, Math.min(ry0, ry1)));
      cY1 = Math.max(0, Math.min(height, Math.max(ry0, ry1)));

      dX0 = Math.max(0, cX0 - 12);
      dX1 = Math.min(width, cX1 + 12);
      dY0 = Math.max(0, cY0 - 12);
      dY1 = Math.min(height, cY1 + 12);
      hasRect = true;
    }
  }

  const baseDistinctSet = new Set();
  const candDistinctSet = new Set();

  let insideSumDelta = 0;
  let insideOver8 = 0;
  let insideCount = 0;

  let outsideSumDelta = 0;
  let outsideOver8 = 0;
  let outsideCount = 0;

  let wholeSumDelta = 0;
  let wholeOver8 = 0;

  const baseData = baseImg.data;
  const candData = candImg.data;
  const baseCh = baseImg.channels;
  const candCh = candImg.channels;

  for (let y = 0; y < height; y++) {
    const rowOffsetBase = y * width * baseCh;
    const rowOffsetCand = y * width * candCh;
    for (let x = 0; x < width; x++) {
      const iBase = rowOffsetBase + x * baseCh;
      const iCand = rowOffsetCand + x * candCh;

      const rB = baseData[iBase];
      const gB = baseData[iBase + 1];
      const bB = baseData[iBase + 2];

      const rC = candData[iCand];
      const gC = candData[iCand + 1];
      const bC = candData[iCand + 2];

      baseDistinctSet.add((rB << 16) | (gB << 8) | bB);
      candDistinctSet.add((rC << 16) | (gC << 8) | bC);

      const lumaB = computeLuma(rB, gB, bB);
      const lumaC = computeLuma(rC, gC, bC);
      const delta = Math.abs(lumaC - lumaB);
      const isOver8 = delta > 8;

      wholeSumDelta += delta;
      if (isOver8) wholeOver8++;

      if (hasRect) {
        const isInside = x >= cX0 && x < cX1 && y >= cY0 && y < cY1;
        if (isInside) {
          insideSumDelta += delta;
          if (isOver8) insideOver8++;
          insideCount++;
        }

        const isOutside = !(x >= dX0 && x < dX1 && y >= dY0 && y < dY1);
        if (isOutside) {
          outsideSumDelta += delta;
          if (isOver8) outsideOver8++;
          outsideCount++;
        }
      }
    }
  }

  const wholeMeanAbsDelta = wholeSumDelta / totalPixels;
  const wholeChangedFraction8 = wholeOver8 / totalPixels;

  const result = {
    rect: parsedRect,
    rectPx: hasRect ? (cX1 - cX0) * (cY1 - cY0) : 0,
    inside: hasRect
      ? {
          meanAbsDeltaLuma: insideCount > 0 ? insideSumDelta / insideCount : 0,
          changedFraction8: insideCount > 0 ? insideOver8 / insideCount : 0,
        }
      : null,
    outside: hasRect
      ? {
          meanAbsDeltaLuma: outsideCount > 0 ? outsideSumDelta / outsideCount : 0,
          changedFraction8: outsideCount > 0 ? outsideOver8 / outsideCount : 0,
        }
      : null,
    whole: {
      meanAbsDeltaLuma: wholeMeanAbsDelta,
      changedFraction8: wholeChangedFraction8,
      changedPx: wholeOver8,
    },
    baseDistinctRGB: baseDistinctSet.size,
    candidateDistinctRGB: candDistinctSet.size,
  };

  const outputJson = JSON.stringify(result, null, 2);
  if (options.out) {
    const dir = path.dirname(options.out);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(options.out, outputJson, 'utf8');
  }

  console.log(outputJson);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
