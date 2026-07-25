import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const environment = { ...process.env };

function start(label, command, args) {
  const child = spawn(command, args, {
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
  } catch {}
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

const previewPort = 4194;
const peerPort = 9014;
const preview = start('preview', process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort']);
const peer = start('peer', process.execPath, ['node_modules/peer/dist/bin/peerjs.js', '--host', '127.0.0.1', '--port', String(peerPort), '--path', '/peerjs', '--no-allow_discovery']);
try {
  await Promise.all([
    waitFor(`http://127.0.0.1:${previewPort}/`, 'preview'),
    waitFor(`http://127.0.0.1:${peerPort}/peerjs/id`, 'PeerJS'),
  ]);
  if (preview.exitCode !== null) throw new Error(`Preview exited before verification with ${preview.exitCode}`);
  if (peer.exitCode !== null) throw new Error(`PeerJS exited before verification with ${peer.exitCode}`);
  const verify = spawn(process.execPath, ['scripts/qa/verify-multiplayer-lifecycle.mjs'], {
    cwd: root,
    env: {
      ...environment,
      QA_BASE_URL: `http://127.0.0.1:${previewPort}/`,
      QA_PEER_PORT: String(peerPort),
      QA_MULTIPLAYER_CYCLES: '1',
      QA_MULTIPLAYER_GUESTS: '2',
    },
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolve, reject) => {
    verify.once('error', reject);
    verify.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  stop(peer);
  stop(preview);
}
