import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = { ...process.env, PYTHONHASHSEED: '0' };

function run(command, args) {
  if (process.env.AUTHORING_DRY_RUN === '1') {
    console.log(JSON.stringify({ command, args, pythonHashSeed: env.PYTHONHASHSEED }));
    return;
  }
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
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
  run('blender', [
    '--background',
    '--factory-startup',
    '--python',
    'scripts/blender/create-atomic-acres-blender-arena.py',
  ]);
} else if (target === 'tower') {
  run('blender', [
    '--background',
    '--factory-startup',
    '--python',
    'scripts/blender/create-rustworks-central-tower.py',
  ]);
} else {
  console.error(`Unknown authoring target: ${target ?? '<missing>'}`);
  process.exit(2);
}
