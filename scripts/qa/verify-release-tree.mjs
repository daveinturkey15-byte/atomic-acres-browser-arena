import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const distRoot = 'dist';
if (!existsSync(distRoot)) throw new Error('dist/ is missing; run npm run build first');

const files = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else files.push(relative(process.cwd(), path).replaceAll('\\', '/'));
  }
};
visit(distRoot);

const forbiddenFragments = [
  '/opengameart/fps-arms/',
  'FPS_ARMS_RIG_1.fbx',
  'source_diffuse.png',
  'atomic_arms_texture_contact_sheet.jpg',
];
const forbidden = files.filter((path) => forbiddenFragments.some((fragment) => path.includes(fragment)));
const oversized = files
  .map((path) => ({ path, bytes: statSync(path).size }))
  .filter((entry) => entry.bytes > 20 * 1024 * 1024);

if (forbidden.length > 0) throw new Error(`Rejected candidate leaked into dist: ${forbidden.join(', ')}`);
if (oversized.length > 0) throw new Error(`Unexpected release file over 20 MiB: ${JSON.stringify(oversized)}`);

console.log(JSON.stringify({ releaseTree: 'ok', files: files.length, rejectedCandidateFiles: 0, oversizedFiles: 0 }));
