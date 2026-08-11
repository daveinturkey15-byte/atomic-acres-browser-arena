import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  PASS66_MULTIPLAYER_SPECS,
  multiplayerPlaywrightReportFailures,
  multiplayerServedCandidateFailures,
  multiplayerStabilityEnvironmentFailures,
  summarizeMultiplayerPlaywrightReport,
} from './pass66-multiplayer-stability-contract.mjs';

const root = resolve(process.cwd());
const environmentFailures = multiplayerStabilityEnvironmentFailures(process.env);
if (environmentFailures.length > 0) {
  throw new Error(`Multiplayer stability QA must run through the clean-SHA owned verifier wrapper: ${environmentFailures.join('; ')}`);
}

const baseUrl = process.env.QA_BASE_URL;
const releasePass = process.env.QA_OWNED_RELEASE_PASS;
const sourceSha = process.env.QA_OWNED_SOURCE_SHA;
const treeSha256 = process.env.QA_OWNED_TREE_SHA256;
const exactRootFileCount = Number(process.env.QA_OWNED_FILE_COUNT);
const receiptPath = process.env.QA_OWNED_RECEIPT_PATH;
if (existsSync(receiptPath)) {
  throw new Error(`Multiplayer stability verifier refuses a stale receipt: ${receiptPath}`);
}

const expectedCandidate = { releasePass, sourceSha, treeSha256, exactRootFileCount };

async function readServedCandidate() {
  const response = await fetch(new URL('channel-provenance.json', baseUrl), {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Candidate provenance returned HTTP ${response.status}`);
  const value = await response.json();
  const failures = multiplayerServedCandidateFailures(value, expectedCandidate);
  if (failures.length > 0) throw new Error(`Served candidate provenance mismatch: ${failures.join('; ')}`);
  return value;
}

async function findUnboundLocalPort(excluded) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const port = await new Promise((resolvePort, rejectPort) => {
      const server = net.createServer();
      server.unref();
      server.once('error', rejectPort);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          server.close(() => rejectPort(new Error('Could not allocate a local PeerJS port')));
          return;
        }
        server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
      });
    });
    if (!excluded.has(port)) return port;
  }
  throw new Error(`Could not allocate ${PASS66_MULTIPLAYER_SPECS.length} distinct local PeerJS ports`);
}

async function allocatePeerPorts() {
  const ports = new Set();
  while (ports.size < PASS66_MULTIPLAYER_SPECS.length) {
    ports.add(await findUnboundLocalPort(ports));
  }
  const [
    hostCrashRejoin,
    ownerFeedbackMultiplayerUi,
    timedMapWeaponsMultiplayerRejoin,
    qoderMultiplayerAuthority,
    adrenalineMatchLifecycle,
  ] = ports;
  const topology = (port) => Object.freeze({
    port,
    path: `/peerjs-${randomBytes(12).toString('hex')}`,
  });
  return Object.freeze({
    hostCrashRejoin: topology(hostCrashRejoin),
    ownerFeedbackMultiplayerUi: topology(ownerFeedbackMultiplayerUi),
    timedMapWeaponsMultiplayerRejoin: topology(timedMapWeaponsMultiplayerRejoin),
    qoderMultiplayerAuthority: topology(qoderMultiplayerAuthority),
    adrenalineMatchLifecycle: topology(adrenalineMatchLifecycle),
  });
}

async function runPlaywright(peerPorts) {
  const playwrightCli = resolve(root, 'node_modules/@playwright/test/cli.js');
  const args = [
    playwrightCli,
    'test',
    ...PASS66_MULTIPLAYER_SPECS.map(({ path }) => path),
    '--project=chromium',
    '--workers=1',
    '--retries=0',
    '--reporter=json',
  ];
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    key !== 'QA_REQUIRE_OWNED_FRESH_PREVIEW'
    && key !== 'QA_EXTERNAL_PREVIEW'
  )));
  const childEnvironment = {
    ...inheritedEnvironment,
    CI: '1',
    QA_EXTERNAL_PREVIEW: '1',
    QA_BASE_URL: baseUrl,
    BASE_URL: baseUrl,
    PASS66_HOST_RECOVERY_PEER_PORT: String(peerPorts.hostCrashRejoin.port),
    PASS66_HOST_RECOVERY_PEER_PATH: peerPorts.hostCrashRejoin.path,
    PASS66_OWNER_FEEDBACK_PEER_PORT: String(peerPorts.ownerFeedbackMultiplayerUi.port),
    PASS66_OWNER_FEEDBACK_PEER_PATH: peerPorts.ownerFeedbackMultiplayerUi.path,
    PASS66_TIMED_WEAPONS_PEER_PORT: String(peerPorts.timedMapWeaponsMultiplayerRejoin.port),
    PASS66_TIMED_WEAPONS_PEER_PATH: peerPorts.timedMapWeaponsMultiplayerRejoin.path,
    PASS66_QODER_AUTHORITY_PEER_PORT: String(peerPorts.qoderMultiplayerAuthority.port),
    PASS66_QODER_AUTHORITY_PEER_PATH: peerPorts.qoderMultiplayerAuthority.path,
    PASS66_ADRENALINE_PEER_PORT: String(peerPorts.adrenalineMatchLifecycle.port),
    PASS66_ADRENALINE_PEER_PATH: peerPorts.adrenalineMatchLifecycle.path,
  };

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: childEnvironment,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      rejectRun(error);
    };
    child.once('error', rejectOnce);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > 64 * 1_024 * 1_024) {
        child.kill('SIGTERM');
        rejectOnce(new Error('Playwright JSON report exceeded the 64 MiB evidence budget'));
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      stderr = `${stderr}${chunk}`.slice(-256 * 1_024);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal) {
        rejectRun(new Error(`Multiplayer stability Playwright run terminated by ${signal}${stderr ? `\n${stderr}` : ''}`));
        return;
      }
      let report;
      try {
        report = JSON.parse(stdout.trim());
      } catch (error) {
        rejectRun(new Error(`Multiplayer stability Playwright did not emit a valid JSON report: ${error instanceof Error ? error.message : String(error)}${stderr ? `\n${stderr}` : ''}`));
        return;
      }
      resolveRun({ exitCode: code ?? 1, report, args: args.slice(1) });
    });
  });
}

async function main() {
  const servedCandidate = await readServedCandidate();
  const peerPorts = await allocatePeerPorts();
  const result = await runPlaywright(peerPorts);
  const reportFailures = multiplayerPlaywrightReportFailures(result.report);
  if (result.exitCode !== 0 || reportFailures.length > 0) {
    throw new Error(`Multiplayer stability Playwright failed (exit ${result.exitCode}): ${reportFailures.join('; ') || 'non-zero runner exit'}`);
  }
  const summary = summarizeMultiplayerPlaywrightReport(result.report);
  const servedCandidateAfter = await readServedCandidate();
  if (JSON.stringify(servedCandidateAfter) !== JSON.stringify(servedCandidate)) {
    throw new Error('Served candidate provenance changed during multiplayer stability verification');
  }

  const receipt = {
    schemaVersion: 2,
    status: 'PASS',
    gate: 'multiplayer-stability',
    releasePass,
    sourceSha,
    servedCandidate,
    servedCandidateAfter,
    schema: 'atomic-acres/multiplayer-stability@2',
    runner: {
      browser: 'chromium',
      workers: 1,
      retries: 0,
      externalPreview: true,
      baseUrl,
      args: result.args,
    },
    pageBinding: {
      helper: 'assertPass66OwnedCandidatePage',
      exactCandidateRoute: '/channels/the-big-one/',
      guardedSpecs: PASS66_MULTIPLAYER_SPECS.map(({ path }) => path),
    },
    ownedPeerServers: Object.entries(peerPorts).map(([owner, topology]) => ({
      owner,
      host: '127.0.0.1',
      port: topology.port,
      path: topology.path,
      localOnly: true,
    })),
    playwright: summary,
    errors: [],
  };
  mkdirSync(dirname(receiptPath), { recursive: true });
  const temporaryReceiptPath = `${receiptPath}.tmp-${process.pid}`;
  writeFileSync(temporaryReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  renameSync(temporaryReceiptPath, receiptPath);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
