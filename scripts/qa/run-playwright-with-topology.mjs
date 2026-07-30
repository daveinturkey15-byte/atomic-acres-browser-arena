import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { build, preview } from 'vite';

const host = process.env.QA_PREVIEW_HOST ?? '127.0.0.1';
const port = Number(process.env.QA_PREVIEW_PORT ?? '4173');
const args = process.argv.slice(2);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid QA_PREVIEW_PORT: ${process.env.QA_PREVIEW_PORT ?? ''}`);
}
if (args.length === 0) throw new Error('Expected Playwright test arguments.');

await build();
execFileSync(process.execPath, ['scripts/release/stage-release-topology.mjs'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

const server = await preview({ preview: { host, port, strictPort: true } });
const baseURL = `http://${host}:${port}`;
const playwrightCli = resolve('node_modules/@playwright/test/cli.js');
let child = null;
let closing = false;

async function closeServer() {
  if (closing) return;
  closing = true;
  const httpServer = server.httpServer;
  if (!httpServer.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    httpServer.closeAllConnections?.();
  });
}

async function interrupt(signal) {
  child?.kill(signal);
  try {
    await closeServer();
  } finally {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
}

process.once('SIGINT', () => void interrupt('SIGINT'));
process.once('SIGTERM', () => void interrupt('SIGTERM'));

console.log(`Atomic Acres owned Playwright preview listening at ${baseURL}/`);
let exitCode = 1;
try {
  exitCode = await new Promise((resolveExit, rejectExit) => {
    child = spawn(process.execPath, [playwrightCli, 'test', ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: baseURL,
        CI: '1',
        QA_EXTERNAL_PREVIEW: '1',
      },
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', rejectExit);
    child.once('close', (code, signal) => {
      if (signal) rejectExit(new Error(`Playwright terminated by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
} finally {
  await closeServer();
}

process.exitCode = exitCode;
