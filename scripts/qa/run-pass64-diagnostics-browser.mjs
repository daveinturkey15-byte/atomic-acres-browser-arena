import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('node_modules', '@playwright', 'test', 'cli.js');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error(`Invalid diagnostics preview source SHA: ${sourceSha}`);
const result = spawnSync(process.execPath, [
  cli, 'test', 'tests/e2e/pass64-match-diagnostics.spec.ts', '--project=chromium', '--workers=1', '--retries=0',
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? '4191',
    VITE_MATCH_DIAGNOSTICS_URL: 'http://127.0.0.1:8791',
    VITE_MATCH_BUILD_ID: sourceSha,
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 64 diagnostic browser test terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
