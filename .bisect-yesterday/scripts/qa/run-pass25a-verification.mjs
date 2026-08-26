import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const environment = { ...process.env };

function run(label, command, args, env = environment) {
  console.log(`\n=== Pass 25A gate: ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 7_200_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited ${result.status ?? 'without status'}`);
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

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
    else child.kill('SIGTERM');
  } catch {}
}

run('typecheck', 'npm', ['run', 'lint']);
run('checked gameplay contract', 'npm', ['run', 'verify:gameplay-contract']);
run('unit and deterministic tests', 'npm', ['test']);
run('100000-sequence property suite', 'npm', ['run', 'test:property:nightly']);
run('mutation score', 'npm', ['run', 'test:mutation']);
run('production build', 'npm', ['run', 'build']);
run('release tree', 'npm', ['run', 'verify:release-tree']);
run('production dependency audit', 'npm', ['run', 'audit:dependencies']);
run('network-chaos matrix', 'npm', ['run', 'qa:network-chaos']);
run('bounded cross-browser E2E', 'npm', ['run', 'test:e2e:bounded']);

const preview = start('preview', 'npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4180']);
const peer = start('peer', 'npx', ['peer', '--host', '127.0.0.1', '--port', '9000', '--path', '/peerjs', '--no-allow_discovery']);
try {
  await delay(500);
  if (preview.exitCode !== null) throw new Error(`preview exited before readiness with ${preview.exitCode}`);
  if (peer.exitCode !== null) throw new Error(`PeerJS exited before readiness with ${peer.exitCode}`);
  await Promise.all([
    waitFor('http://127.0.0.1:4180/', 'preview'),
    waitFor('http://127.0.0.1:9000/peerjs/id', 'PeerJS'),
  ]);
  const qaEnvironment = {
    ...environment,
    QA_BASE_URL: 'http://127.0.0.1:4180/',
    QA_PEER_PORT: '9000',
    QA_MULTIPLAYER_CYCLES: '20',
  };
  run('reference environment capture', 'npm', ['run', 'qa:environment'], qaEnvironment);
  run('multiplayer behavior', 'npm', ['run', 'qa:multiplayer'], qaEnvironment);
  run('20-cycle multiplayer lifecycle', 'npm', ['run', 'qa:multiplayer:lifecycle'], qaEnvironment);
  run('browser/context/effect soak', 'npm', ['run', 'qa:soak'], qaEnvironment);
  run('adverse-network soak', 'npm', ['run', 'qa:network-chaos:soak'], qaEnvironment);
} finally {
  stop(peer);
  stop(preview);
}

console.log('\n{"pass25aAggregate":"ok"}');
