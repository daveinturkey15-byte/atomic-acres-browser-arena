import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const directory = path.join(root, 'docs/assets/pass69-3-operators/first-person-arms');
const labels = [
  ['neutral-front', 'NEUTRAL / SILHOUETTE'],
  ['forearm-wrist-quarter', 'FOREARM / CUFF CONTINUITY'],
  ['hand-anatomy-closeup', 'PALM / DIGIT SEPARATION'],
  ['reload-cuff-flex', 'RELOAD / WRIST FLEX'],
  ['firing-digit-separation', 'FIRE / DEFORMATION'],
];
const tile = 800;
const labelHeight = 54;
const width = tile * 3;
const height = (tile + labelHeight) * 2;
await mkdir(directory, { recursive: true });

const composites = [];
for (const [index, [id, title]] of labels.entries()) {
  const left = (index % 3) * tile;
  const top = Math.floor(index / 3) * (tile + labelHeight);
  const framePath = path.join(directory, `pass69-3-first-person-arms-${id}.png`);
  const frame = await sharp(framePath)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  await writeFile(framePath, frame);
  composites.push({
    input: frame,
    left,
    top,
  });
  composites.push({
    input: Buffer.from(`<svg width="${tile}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#071319"/>
      <text x="24" y="35" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#bff9ff">${title}</text>
    </svg>`),
    left,
    top: top + tile,
  });
}

await sharp({
  create: { width, height, channels: 3, background: '#050b0f' },
})
  .composite(composites)
  .png({ compressionLevel: 9, adaptiveFiltering: false })
  .toFile(path.join(directory, 'pass69-3-first-person-arms-review-sheet.png'));

console.log(JSON.stringify({ ok: true, width, height, tiles: labels.length }));
