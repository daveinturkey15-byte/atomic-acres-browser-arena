import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MUTATION_PROPERTY_RUNS = 50;
const strykerCli = fileURLToPath(new URL('../../node_modules/@stryker-mutator/core/bin/stryker.js', import.meta.url));
const result = spawnSync(process.execPath, [strykerCli, 'run', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PASS25_PROPERTY_RUNS: String(MUTATION_PROPERTY_RUNS),
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Mutation gate terminated by ${result.signal}`);
if (result.status !== 0) process.exitCode = result.status ?? 1;
