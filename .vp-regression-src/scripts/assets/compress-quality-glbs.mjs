import { copyFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
const allModels = [
  'public/assets/original/models/atomic-acres-blender-arena.glb',
  'public/assets/original/models/rustworks-central-tower.glb',
];
const requestedModels = process.argv.slice(2);
const unknownModels = requestedModels.filter((model) => !allModels.includes(model));
if (unknownModels.length > 0) throw new Error(`Unknown Quality GLB: ${unknownModels.join(', ')}`);
const models = requestedModels.length > 0 ? requestedModels : allModels;

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`gltf-transform ${args[0]} failed with status ${result.status}`);
}

const receipt = [];
for (const relativePath of models) {
  const source = join(root, relativePath);
  const webp = `${source}.pass62-lossless-webp.glb`;
  const compressed = `${source}.pass62-meshopt.glb`;
  const before = statSync(source).size;
  try {
    // Lossless WebP reduces transfer size without introducing normal/roughness
    // artefacts. Meshopt then compresses and reorders vertex/index streams while
    // preserving the semantic node extras used by collision/window QA.
    run(['webp', source, webp, '--lossless']);
    run(['meshopt', webp, compressed]);
    run(['validate', compressed]);
    copyFileSync(compressed, source);
    const after = statSync(source).size;
    receipt.push({
      path: relativePath,
      beforeBytes: before,
      afterBytes: after,
      savedBytes: before - after,
      reductionPercent: Number(((before - after) / before * 100).toFixed(1)),
    });
  } finally {
    rmSync(webp, { force: true });
    rmSync(compressed, { force: true });
  }
}

console.log(JSON.stringify({ schemaVersion: 1, compressor: '@gltf-transform/cli 4.4.1', models: receipt }, null, 2));
