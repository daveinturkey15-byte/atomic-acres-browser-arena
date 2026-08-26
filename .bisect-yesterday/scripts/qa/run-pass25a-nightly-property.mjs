import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NIGHTLY_PROPERTY_RUNS = 100_000;
const vitestCli = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [vitestCli, 'run', 'src/gameplay-state-property.test.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PASS25_PROPERTY_RUNS: String(NIGHTLY_PROPERTY_RUNS),
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Nightly property gate terminated by ${result.signal}`);
if (result.status !== 0) process.exitCode = result.status ?? 1;
