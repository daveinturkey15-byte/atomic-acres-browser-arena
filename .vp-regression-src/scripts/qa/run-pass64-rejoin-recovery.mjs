import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const environment = { ...process.env };
const previewPort = Number(process.env.QA_PORT ?? 4196);
const peerPort = Number(process.env.QA_PEER_PORT ?? 9016);

function start(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: environment,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGKILL');
  } catch { /* Process may already have exited. */ }
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch { /* Retry during bounded startup. */ }
    await delay(250);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

const preview = start('preview', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort']);
const peer = start('peer', ['node_modules/peer/dist/bin/peerjs.js', '--host', '127.0.0.1', '--port', String(peerPort), '--path', '/peerjs', '--no-allow_discovery']);

try {
  await Promise.all([
    waitFor(`http://127.0.0.1:${previewPort}/`, 'preview'),
    waitFor(`http://127.0.0.1:${peerPort}/peerjs/id`, 'PeerJS'),
  ]);
  const verify = spawn(process.execPath, ['scripts/qa/verify-pass60-network-recovery.mjs'], {
    cwd: root,
    env: {
      ...environment,
      QA_BASE_URL: `http://127.0.0.1:${previewPort}/`,
      QA_PEER_PORT: String(peerPort),
    },
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    verify.once('error', rejectExit);
    verify.once('exit', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  stop(peer);
  stop(preview);
}
