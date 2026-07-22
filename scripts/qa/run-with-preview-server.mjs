import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const port = process.env.QA_PORT ?? '4180';
const baseUrl = `http://127.0.0.1:${port}/`;
const command = process.argv[2];
const args = process.argv.slice(3);
if (!command) throw new Error('Expected a command to run after the preview server starts.');

const viteBin = resolve('node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

function ready() {
  return new Promise((resolveReady) => {
    const request = http.get(baseUrl, (response) => {
      response.resume();
      resolveReady(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(1_000, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Preview server exited with ${server.exitCode}`);
    if (await ready()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Preview server did not become ready within ${timeoutMs}ms`);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  if (isWindows) {
    spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (!isWindows && server.exitCode === null) server.kill('SIGKILL');
}

let exitCode = 1;
try {
  await waitForServer();
  const executable = isWindows && (command === 'npm' || command === 'npx') ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: { ...process.env, QA_BASE_URL: baseUrl },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${executable} terminated by ${result.signal}`);
  exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await stopServer();
}
process.exitCode = exitCode;
