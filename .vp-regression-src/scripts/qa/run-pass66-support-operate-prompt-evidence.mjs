import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const expectedGate = 'support-operate-prompt';
if (process.env.PASS66_OWNED_GATE !== expectedGate) {
  throw new Error(`Support prompt evidence must run inside the owned ${expectedGate} gate`);
}
for (const name of [
  'PASS66_OWNED_SOURCE_SHA',
  'PASS66_OWNED_TREE_SHA256',
  'PASS66_OWNED_FILE_COUNT',
  'PASS66_OWNED_RECEIPT_PATH',
  'BASE_URL',
]) {
  if (!process.env[name]) throw new Error(`Support prompt evidence is missing ${name}`);
}

const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
  key !== 'QA_REQUIRE_OWNED_FRESH_PREVIEW'
  && key !== 'QA_EXTERNAL_PREVIEW'
)));
const playwrightCli = resolve('node_modules/@playwright/test/cli.js');
const args = [
  playwrightCli,
  'test',
  'tests/e2e/pass66-support-operate-prompt.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
];

const exitCode = await new Promise((resolveExit, rejectExit) => {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...inheritedEnvironment,
      CI: '1',
      QA_EXTERNAL_PREVIEW: '1',
    },
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', rejectExit);
  child.once('close', (code, signal) => {
    if (signal) rejectExit(new Error(`Support prompt Playwright evidence terminated by ${signal}`));
    else resolveExit(code ?? 1);
  });
});

if (exitCode !== 0) throw new Error(`Support prompt Playwright evidence failed with exit ${exitCode}`);
