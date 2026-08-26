import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const port = process.env.QA_PORT ?? '4180';
const portNumber = Number(port);
if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535) throw new Error(`Invalid QA_PORT: ${port}`);
const baseUrl = `http://127.0.0.1:${port}/`;
const command = process.argv[2];
const args = process.argv.slice(3);
if (!command) throw new Error('Expected a command to run after the preview server starts.');

await new Promise((resolveAvailable, rejectUnavailable) => {
  const probe = createServer();
  probe.once('error', (error) => rejectUnavailable(new Error(`QA port ${port} is unavailable; choose an unused QA_PORT. ${error.message}`)));
  probe.listen({ host: '127.0.0.1', port: portNumber, exclusive: true }, () => probe.close(resolveAvailable));
});

const viteBin = resolve('node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: true,
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
    const stopped = spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (stopped.status !== 0 && server.exitCode === null) server.kill('SIGKILL');
  } else {
    server.kill('SIGTERM');
  }
  const waitForExit = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (server.exitCode === null && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  };
  await waitForExit(5_000);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await waitForExit(2_000);
  }
  if (server.exitCode === null) throw new Error(`Preview server PID ${server.pid} did not terminate`);
}

let exitCode = 1;
try {
  await waitForServer();
  const executable = isWindows && (command === 'npm' || command === 'npx') ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: { ...process.env, QA_BASE_URL: baseUrl },
    stdio: 'inherit',
    windowsHide: true,
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
