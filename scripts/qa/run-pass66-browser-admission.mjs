import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ project: 'chromium', browserName: 'chromium', renderer: 'webgl2', installedEdge: true, defaultPort: '4520' }),
  'edge-webgpu': Object.freeze({ project: 'chromium', browserName: 'chromium', renderer: 'webgpu', installedEdge: true, defaultPort: '4521' }),
  webkit: Object.freeze({ project: 'webkit-admission', browserName: 'webkit', renderer: 'webgl2', installedEdge: false, defaultPort: '4522' }),
});

const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 66 browser admission target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const artifactDirectory = resolve('artifacts/pass66/browser-admission');
const receiptPath = resolve(artifactDirectory, `${target.project}-${target.renderer}-receipt.json`);
mkdirSync(artifactDirectory, { recursive: true });
rmSync(receiptPath, { force: true });
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (status) throw new Error('Pass 66 browser admission requires a completely clean worktree');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) throw new Error(`Invalid Pass 66 browser-admission source SHA ${sourceSha}`);

const cli = resolve('node_modules/@playwright/test/cli.js');
const result = spawnSync(process.execPath, [
  cli,
  'test',
  'tests/e2e/pass66-browser-admission-cycles.spec.ts',
  `--project=${target.project}`,
  '--workers=1',
  '--retries=0',
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    QA_PASS66_BROWSER_ADMISSION: '1',
    QA_EXTERNAL_PREVIEW: '0',
    QA_REQUIRE_OWNED_FRESH_PREVIEW: '1',
    QA_PASS66_ADMISSION_RENDERER: target.renderer,
    QA_PASS66_ADMISSION_SOURCE_SHA: sourceSha,
    QA_PASS66_ADMISSION_PROFILES: process.env.QA_PASS66_ADMISSION_PROFILES ?? 'performance,blender,compat',
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.defaultPort,
    ...(target.installedEdge ? { QA_INSTALLED_EDGE: '1' } : {}),
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 66 ${targetName} browser admission terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.schemaVersion !== 3 || receipt.status !== 'PASS'
    || receipt.sourceSha !== sourceSha || receipt.project !== target.project
    || receipt.browserName !== target.browserName || receipt.renderer !== target.renderer
    || receipt.totalAdmissions !== 48) {
    rmSync(receiptPath, { force: true });
    throw new Error(`Pass 66 ${targetName} browser admission emitted an invalid or stale receipt`);
  }
  console.log(JSON.stringify({ pass66BrowserAdmission: 'PASS', target: targetName, sourceSha, receiptPath }));
}
