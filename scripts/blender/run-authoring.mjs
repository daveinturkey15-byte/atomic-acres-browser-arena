import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = { ...process.env, PYTHONHASHSEED: '0' };
const blenderCandidates = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
].filter(Boolean);
const blenderCommand = blenderCandidates.find((candidate) => existsSync(candidate)) ?? 'blender';
const gltfTransformCli = path.join(process.cwd(), 'node_modules/@gltf-transform/cli/bin/cli.js');

function run(command, args) {
  if (process.env.AUTHORING_DRY_RUN === '1') {
    console.log(JSON.stringify({ command, args, pythonHashSeed: env.PYTHONHASHSEED }));
    return;
  }
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (target === 'arena') {
  run(npxCommand, [
    'vite-node',
    'scripts/blender/export-atomic-acres-arena-spec.ts',
    'source-assets/blender/atomic-acres-arena-spec.json',
  ]);
  run(blenderCommand, [
    '--background',
    '--factory-startup',
    '--python',
    'scripts/blender/create-atomic-acres-blender-arena.py',
  ]);
} else if (target === 'tower') {
  run(blenderCommand, [
    '--background',
    '--factory-startup',
    '--python',
    'scripts/blender/create-rustworks-central-tower.py',
  ]);
} else if (target === 'drone') {
  mkdirSync('public/assets/original/models/support', { recursive: true });
  run(blenderCommand, [
    '--background',
    '--factory-startup',
    '--python',
    'scripts/blender/create-hunter-drone-family.py',
  ]);
  for (const lod of [0, 1, 2]) {
    run(process.execPath, [
      gltfTransformCli,
      'optimize',
      `artifacts/blender-drone/raw/hunter-drone-lod${lod}.glb`,
      `public/assets/original/models/support/hunter-drone-lod${lod}.glb`,
      '--compress', 'meshopt',
      '--meshopt-level', 'high',
      '--flatten', 'false',
      '--join', 'false',
      '--instance', 'false',
      '--palette', 'false',
      '--prune', 'false',
      '--simplify', 'false',
      '--texture-compress', 'webp',
      '--texture-size', '512',
    ]);
  }
  run(process.execPath, ['scripts/blender/finalize-hunter-drone-assets.mjs']);
} else {
  console.error(`Unknown authoring target: ${target ?? '<missing>'}`);
  process.exit(2);
}
