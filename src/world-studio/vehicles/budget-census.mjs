#!/usr/bin/env node
// Prints the world-studio vehicle census (triangles, draw groups, solids, per-mesh triangle
// counts) by running the lane's contract test with console output enabled. No GPU needed.
//
//   node src/world-studio/vehicles/budget-census.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const test = path.join('src', 'world-studio', 'vehicles', 'studio-vehicles.test.ts');
const result = spawnSync(process.execPath, [vitest, 'run', '--root', root, test, '--silent=false', '--reporter=verbose'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
