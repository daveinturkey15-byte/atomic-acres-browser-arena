// Renders each texture family's albedo | normal | roughness side by side and builds a
// combined contact sheet for the night-zai lane (HF-536). Node + sharp only.
//
//   node scripts/forge/tile-preview.mjs [--out <dir>] [--size 1024]
//
// Default output: C:/Users/david/Desktop/stuff/aa-day-2026-09-06/lanes/night-zai/previews
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const args = process.argv.slice(2);
const outArgIndex = args.indexOf('--out');
const sizeArgIndex = args.indexOf('--size');
const outDir =
  outArgIndex >= 0
    ? args[outArgIndex + 1]
    : 'C:/Users/david/Desktop/stuff/aa-day-2026-09-06/lanes/night-zai/previews';
const size = sizeArgIndex >= 0 ? Number(args[sizeArgIndex + 1]) : 1024;

// Bundle the TS generators to a temp ESM module so plain Node can import them.
const bundleOut = join(repoRoot, 'node_modules', '.tmp', `forge-textures-${Date.now()}.mjs`);
mkdirSync(dirname(bundleOut), { recursive: true });
await build({
  entryPoints: [join(repoRoot, 'src', 'forge', 'textures', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundleOut,
  logLevel: 'silent',
});
const { generateTextureSet, TEXTURE_FAMILIES } = await import(`file://${bundleOut.replace(/\\/g, '/')}`);

mkdirSync(outDir, { recursive: true });

const LABEL_COLUMN_PX = 150;
const GAP = 6;
const SHEET_TILE_PX = 341;
const written = [];

function roughnessToRgba(single, n) {
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = single[i];
    rgba[i * 4 + 1] = single[i];
    rgba[i * 4 + 2] = single[i];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

function labelSvg(text, width, height, fontSize = 30) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#101418"/>` +
      `<text x="12" y="${height / 2 + fontSize * 0.36}" font-family="Consolas, monospace" ` +
      `font-size="${fontSize}" fill="#e8e2d4">${text}</text></svg>`,
  );
}

const sheetRows = [];
for (const family of TEXTURE_FAMILIES) {
  const set = generateTextureSet(family, { size, seed: 1 });
  const n = set.size * set.size;
  const albedoPng = await sharp(Buffer.from(set.albedo), {
    raw: { width: set.size, height: set.size, channels: 4 },
  })
    .png()
    .toBuffer();
  const normalPng = await sharp(Buffer.from(set.normal), {
    raw: { width: set.size, height: set.size, channels: 4 },
  })
    .png()
    .toBuffer();
  const roughPng = await sharp(Buffer.from(roughnessToRgba(set.roughness, n)), {
    raw: { width: set.size, height: set.size, channels: 4 },
  })
    .png()
    .toBuffer();

  // Per-family strip: albedo | normal | roughness, with a small header label.
  const headerH = 44;
  const stripWidth = set.size * 3 + GAP * 2;
  const strip = await sharp({
    create: { width: stripWidth, height: headerH + set.size, channels: 4, background: '#101418' },
  })
    .composite([
      {
        input: labelSvg(
          `${family}  albedo | normal | roughness  (${set.metresPerTile} m/tile, ${set.size}px)`,
          stripWidth,
          headerH,
          24,
        ),
        top: 0,
        left: 0,
      },
      { input: albedoPng, top: headerH, left: 0 },
      { input: normalPng, top: headerH, left: set.size + GAP },
      { input: roughPng, top: headerH, left: set.size * 2 + GAP * 2 },
    ])
    .png()
    .toBuffer();
  const familyPath = join(outDir, `${family}.png`);
  await sharp(strip).png().toFile(familyPath);
  written.push(familyPath);
  sheetRows.push({ family, albedoPng, normalPng, roughPng });
  console.log(`forge tile-preview: ${family} strip -> ${familyPath} (${set.generateMs.toFixed(0)} ms)`);
}

// Contact sheet: one row per family, scaled tiles, burned-in labels.
const rowH = SHEET_TILE_PX;
const sheetWidth = LABEL_COLUMN_PX + SHEET_TILE_PX * 3 + GAP * 3;
const sheetHeight = rowH * sheetRows.length + GAP * (sheetRows.length - 1);
const composite = [];
for (const [index, row] of sheetRows.entries()) {
  const top = index * (rowH + GAP);
  composite.push({ input: labelSvg(row.family, LABEL_COLUMN_PX, rowH), top, left: 0 });
  const scaled = { width: SHEET_TILE_PX, height: SHEET_TILE_PX, fit: 'fill' };
  composite.push({
    input: await sharp(row.albedoPng).resize(scaled).png().toBuffer(),
    top,
    left: LABEL_COLUMN_PX,
  });
  composite.push({
    input: await sharp(row.normalPng).resize(scaled).png().toBuffer(),
    top,
    left: LABEL_COLUMN_PX + SHEET_TILE_PX + GAP,
  });
  composite.push({
    input: await sharp(row.roughPng).resize(scaled).png().toBuffer(),
    top,
    left: LABEL_COLUMN_PX + SHEET_TILE_PX * 2 + GAP * 2,
  });
}
const sheetPath = join(outDir, 'TEXTURES-SHEET.jpg');
await sharp({
  create: { width: sheetWidth, height: sheetHeight, channels: 4, background: '#101418' },
})
  .composite(composite)
  .jpeg({ quality: 88 })
  .toFile(sheetPath);
written.push(sheetPath);
console.log(`forge tile-preview: sheet -> ${sheetPath}`);
console.log(JSON.stringify({ written }, null, 1));
