import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
if (status) throw new Error('Pass 63 multiplayer comparator requires a completely clean worktree');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error(`Invalid candidate source SHA ${sourceSha}`);

const result = spawnSync(process.execPath, [
  resolve('scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass66-pass63-multiplayer-comparator.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...process.env,
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? '4519',
    PASS66_PASS63_COMPARATOR: '1',
    PASS66_PASS63_COMPARATOR_SOURCE_SHA: sourceSha,
    PASS66_PASS63_COMPARATOR_PEER_PORT: process.env.PASS66_PASS63_COMPARATOR_PEER_PORT ?? '9069',
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 63 multiplayer comparator terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
