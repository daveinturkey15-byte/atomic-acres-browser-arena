import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

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
} else {
  console.error(`Unknown authoring target: ${target ?? '<missing>'}`);
  process.exit(2);
}
