#!/usr/bin/env node
// Run a command with a Vite DEV server guaranteed to be up.
//
// The preview-server runner next to this file serves `dist`, which is the right
// thing for release checks and the wrong thing for the cross-browser row: the
// QA probe page loads `/src/bootstrap.ts` exactly as index.html does, and only
// the dev server can serve that. Without this the gate is not one command, it is
// one command plus "remember to start the dev server first", which is how a
// standing gate quietly stops being run.
//
// Reuses a dev server that is already listening rather than fighting it for the
// port - this machine usually has one up on 41876 already - and only stops the
// server it started itself.
//
// Usage: node scripts/qa/run-with-dev-server.mjs <command> [args...]
//        QA_DEV_PORT=41876 (default)
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const port = process.env.QA_DEV_PORT ?? '41876';
const portNumber = Number(port);
if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535) throw new Error(`Invalid QA_DEV_PORT: ${port}`);
const baseUrl = `http://127.0.0.1:${port}/`;
const command = process.argv[2];
const args = process.argv.slice(3);
if (!command) throw new Error('Expected a command to run after the dev server starts.');

function ready() {
  return new Promise((resolveReady) => {
    const request = http.get(baseUrl, (response) => {
      response.resume();
      resolveReady(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(1_000, () => { request.destroy(); resolveReady(false); });
  });
}

let server = null;
if (await ready()) {
  console.error(`[dev-server] reusing the server already listening on ${baseUrl}`);
} else {
  const viteBin = resolve('node_modules/vite/bin/vite.js');
  console.error(`[dev-server] starting vite dev on ${baseUrl}`);
  server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`Dev server exited with ${server.exitCode}`);
    if (await ready()) break;
    if (Date.now() > deadline) throw new Error('Dev server did not become ready within 90s');
    await new Promise((wait) => setTimeout(wait, 250));
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (isWindows) {
    const stopped = spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    if (stopped.status !== 0 && server.exitCode === null) server.kill('SIGKILL');
  } else {
    server.kill('SIGTERM');
  }
  const deadline = Date.now() + 5_000;
  while (server.exitCode === null && Date.now() < deadline) await new Promise((wait) => setTimeout(wait, 50));
  if (server.exitCode === null) server.kill('SIGKILL');
}

let exitCode = 1;
try {
  const executable = isWindows && (command === 'npm' || command === 'npx') ? `${command}.cmd` : command;
  const child = spawn(executable, args, { stdio: 'inherit', shell: false, windowsHide: true });
  exitCode = await new Promise((settle) => {
    child.on('exit', (code, signal) => settle(signal ? 1 : (code ?? 1)));
    child.on('error', () => settle(1));
  });
} finally {
  await stopServer();
}
process.exit(exitCode);
