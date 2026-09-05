/**
 * HF-510 minimap declutter audit.
 *
 * Builds EVERY arena the catalog can name (roster derived from
 * `ALL_ARENA_IDS`, never hand-listed), counts what the minimap used to draw
 * against what it draws now, and rasterises both as PNGs so the change is
 * visible per arena without a browser.
 *
 * BEFORE is a faithful reconstruction of the pre-HF-510 static layer:
 *   - one fill+stroke rectangle per world collider, and
 *   - one landmark rectangle per authored physical-cover piece.
 * That is exactly the geometry `activeMinimapColliderLayer` and
 * `activeMinimapCoverLayer` painted (see the removed code in this commit's
 * diff); the LIVE browser clip remains the ground truth for AFTER.
 *
 *   npx tsx scripts/qa/minimap-structural-audit.mts --out <dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import sharp from 'sharp';
import { ALL_ARENA_IDS, installHeadlessArenaShims, loadArenaFactories } from './collider-visual-parity-core';
import {
  buildMinimapStructuralElements,
  minimapLandmarkFootprint,
  type MinimapBounds,
  type MinimapElement,
} from '../../src/minimap';

const SIZE = 256;
const outIndex = process.argv.indexOf('--out');
const outDir = outIndex >= 0 ? process.argv[outIndex + 1]! : 'docs/evidence/pass95/minimap-simplify';

type Rgba = readonly [number, number, number, number];
const GROUND: Rgba = [7, 15, 18, 219];
const BEFORE_FILL: Rgba = [170, 113, 72, 71];
const BEFORE_STROKE: Rgba = [221, 164, 111, 166];
const COVER_FILL: Rgba = [232, 203, 92, 189];
const AFTER_FILL: Record<string, Rgba> = {
  road: [126, 137, 132, 77],
  building: [226, 240, 244, 41],
  wall: [226, 240, 244, 31],
};
const AFTER_STROKE: Record<string, Rgba> = {
  road: [126, 137, 132, 77],
  building: [238, 248, 252, 242],
  wall: [226, 240, 244, 224],
};

function canvas(): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    pixels[i * 4] = GROUND[0]; pixels[i * 4 + 1] = GROUND[1];
    pixels[i * 4 + 2] = GROUND[2]; pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

function blend(pixels: Uint8Array, x: number, y: number, colour: Rgba): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const index = (y * SIZE + x) * 4;
  const alpha = colour[3] / 255;
  for (let channel = 0; channel < 3; channel += 1) {
    pixels[index + channel] = Math.round(pixels[index + channel]! * (1 - alpha) + colour[channel]! * alpha);
  }
}

function paint(pixels: Uint8Array, box: { x: number; y: number; width: number; height: number }, fill: Rgba, stroke: Rgba, lineWidth: number): void {
  const x0 = Math.round(box.x); const y0 = Math.round(box.y);
  const x1 = Math.round(box.x + box.width); const y1 = Math.round(box.y + box.height);
  for (let y = y0; y < Math.max(y0 + 1, y1); y += 1) for (let x = x0; x < Math.max(x0 + 1, x1); x += 1) blend(pixels, x, y, fill);
  if (lineWidth <= 0) return;
  const w = Math.max(1, Math.round(lineWidth));
  for (let t = 0; t < w; t += 1) {
    for (let x = x0; x <= x1; x += 1) { blend(pixels, x, y0 + t, stroke); blend(pixels, x, y1 - t, stroke); }
    for (let y = y0; y <= y1; y += 1) { blend(pixels, x0 + t, y, stroke); blend(pixels, x1 - t, y, stroke); }
  }
}

async function png(pixels: Uint8Array, file: string): Promise<void> {
  await sharp(Buffer.from(pixels), { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(file);
}

/** Pre-HF-510 admission: every collider, plus every cover piece with a landmark identity. */
function legacyCoverDrawn(id: string, performanceVisualKind?: string): boolean {
  return Boolean(performanceVisualKind)
    || id.endsWith('-bus') || id.includes('jetliner') || id.includes('terminal')
    || id.includes('fuel') || id.includes('cargo-stack');
}

async function main(): Promise<void> {
  installHeadlessArenaShims();
  const factories = await loadArenaFactories();
  mkdirSync(outDir, { recursive: true });
  const rows: Array<Record<string, unknown>> = [];

  for (const arenaId of ALL_ARENA_IDS) {
    const factory = factories[arenaId];
    if (!factory) throw new Error(`arena roster names ${arenaId} but no factory builds it`);
    const arena = factory.build(new THREE.Scene());
    const bounds = arena.bounds as MinimapBounds;

    const beforeColliders = arena.colliders as readonly MinimapBounds[];
    const beforeCover = arena.physicalCover.filter((cover) => legacyCoverDrawn(cover.id, cover.performanceVisualKind));
    const before = beforeColliders.length + beforeCover.length;

    const elements: readonly MinimapElement[] = buildMinimapStructuralElements({
      bounds, width: SIZE, height: SIZE,
      colliders: beforeColliders,
      cover: arena.physicalCover.map((cover) => cover.bounds as MinimapBounds),
      houses: arena.houses,
      surfaces: arena.shotSurfaces,
    });

    const beforePixels = canvas();
    for (const collider of beforeColliders) paint(beforePixels, minimapLandmarkFootprint(collider, bounds, SIZE, SIZE), BEFORE_FILL, BEFORE_STROKE, 1);
    for (const cover of beforeCover) paint(beforePixels, minimapLandmarkFootprint(cover.bounds as MinimapBounds, bounds, SIZE, SIZE), COVER_FILL, COVER_FILL, 2);
    await png(beforePixels, join(outDir, `${arenaId}-minimap-before.png`));

    const afterPixels = canvas();
    for (const element of elements) {
      paint(
        afterPixels,
        minimapLandmarkFootprint(element.bounds, bounds, SIZE, SIZE),
        AFTER_FILL[element.className]!,
        AFTER_STROKE[element.className]!,
        element.className === 'road' ? 0 : element.className === 'building' ? 2.5 : 2,
      );
    }
    await png(afterPixels, join(outDir, `${arenaId}-minimap-after.png`));

    const counts = elements.reduce<Record<string, number>>((total, element) => ({
      ...total, [element.className]: (total[element.className] ?? 0) + 1,
    }), {});
    rows.push({
      arena: arenaId,
      colliders: beforeColliders.length,
      coverLandmarks: beforeCover.length,
      before,
      after: elements.length,
      byClass: counts,
      mergedSourcePieces: elements.reduce((total, element) => total + element.sourceCount, 0),
    });
    console.log(`${arenaId.padEnd(18)} before=${String(before).padStart(4)}  after=${String(elements.length).padStart(3)}  ${JSON.stringify(counts)}`);
  }

  writeFileSync(join(outDir, 'minimap-element-counts.json'), `${JSON.stringify({
    generatedFor: 'HF-510',
    minimapSize: SIZE,
    arenas: rows,
    worstAfter: Math.max(...rows.map((row) => row.after as number)),
  }, null, 2)}\n`);
  console.log(`\nworst after = ${Math.max(...rows.map((row) => row.after as number))}`);
}

await main();
