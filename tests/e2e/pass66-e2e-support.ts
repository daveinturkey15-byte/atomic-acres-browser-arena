import type { Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { resolve } from 'node:path';

const CLIENT_RUNTIME_LOG_KEY = 'atomic-acres:client-runtime-log:v1';
const PEER_START_TIMEOUT_MS = 10_000;
const PEER_EXIT_TIMEOUT_MS = 5_000;

export type BrowserDiagnostics = {
  pageErrors: string[];
  consoleErrors: string[];
};

export type OwnedPeerServer = Readonly<{
  port: number;
  path: string;
  pid: number;
  stop: () => Promise<void>;
}>;

function listenerPresent(port: number): Promise<boolean> {
  return new Promise((resolveListener) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (present: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveListener(present);
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function peerEndpointReady(port: number, path: string): Promise<boolean> {
  return new Promise((resolveReady) => {
    const request = http.get(`http://127.0.0.1:${port}${path}`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body = `${body}${chunk}`.slice(0, 2_048); });
      response.once('end', () => {
        try {
          const payload = JSON.parse(body) as { name?: unknown };
          resolveReady(response.statusCode === 200 && payload.name === 'PeerJS Server');
        } catch {
          resolveReady(false);
        }
      });
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(300, () => { request.destroy(); resolveReady(false); });
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
  });
}

async function stopOwnedPeerChild(child: ChildProcess, port: number): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const gracefulExit = waitForExit(child, PEER_EXIT_TIMEOUT_MS);
    child.kill('SIGTERM');
    if (!await gracefulExit) {
      const forcedExit = waitForExit(child, PEER_EXIT_TIMEOUT_MS);
      child.kill('SIGKILL');
      if (!await forcedExit) throw new Error(`Owned PeerJS child ${child.pid ?? 'unknown'} did not exit`);
    }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!await listenerPresent(port)) return;
    await new Promise((wait) => setTimeout(wait, 50));
  }
  throw new Error(`PeerJS port ${port} still has a listener after owned child exit`);
}

export async function startOwnedPeerServer(port: number, requestedPath?: string): Promise<OwnedPeerServer> {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`Invalid local PeerJS port ${port}`);
  }
  if (await listenerPresent(port)) {
    throw new Error(`Refusing stale or unowned listener already bound to PeerJS port ${port}`);
  }

  const path = requestedPath ?? `/peerjs-${randomBytes(12).toString('hex')}`;
  if (!/^\/[a-z0-9-]{1,96}$/i.test(path)) throw new Error(`Invalid local PeerJS path ${path}`);
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(port), '--path', path, '--no-allow_discovery',
  ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  const recordOutput = (chunk: Buffer | string) => { output = `${output}${String(chunk)}`.slice(-8_192); };
  child.stdout?.on('data', recordOutput);
  child.stderr?.on('data', recordOutput);

  try {
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      const timer = setTimeout(() => rejectSpawn(new Error('Timed out spawning local PeerJS child')), PEER_START_TIMEOUT_MS);
      child.once('spawn', () => { clearTimeout(timer); resolveSpawn(); });
      child.once('error', (error) => { clearTimeout(timer); rejectSpawn(error); });
    });
    if (!child.pid) throw new Error('Spawned PeerJS child has no process id');

    const startedMarker = `Started PeerServer on 127.0.0.1, port: ${port}, path: ${path}`;
    const deadline = Date.now() + PEER_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Owned PeerJS child ${child.pid} exited before readiness (${child.exitCode ?? child.signalCode})\n${output}`);
      }
      if (output.includes(startedMarker) && await peerEndpointReady(port, path)) {
        let stopped = false;
        return Object.freeze({
          port,
          path,
          pid: child.pid,
          stop: async () => {
            if (stopped) return;
            stopped = true;
            await stopOwnedPeerChild(child, port);
          },
        });
      }
      await new Promise((wait) => setTimeout(wait, 50));
    }
    throw new Error(`Owned PeerJS child ${child.pid} did not prove tokenized readiness\n${output}`);
  } catch (error) {
    await stopOwnedPeerChild(child, port);
    throw error;
  }
}

export function attachBrowserDiagnostics(page: Page, label: string, diagnostics: BrowserDiagnostics): void {
  page.on('pageerror', (error) => diagnostics.pageErrors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(`${label}: ${message.text()}`);
  });
}

export async function readPersistedClientRuntimeLog(page: Page): Promise<unknown[]> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) throw new Error('Persisted client runtime log is not an array');
    return value;
  }, CLIENT_RUNTIME_LOG_KEY);
}

type OwnedCandidateIdentity = Readonly<{
  schemaVersion: 4;
  channel: 'the-big-one';
  releasePass: 'PASS 66';
  path: 'channels/the-big-one';
  sourceSha: string;
  treeSha256: string;
  exactRootFileCount: number;
}>;

/**
 * Binds an actual multiplayer page to the immutable candidate served by the
 * clean-SHA owned verifier. Ordinary developer Playwright runs remain usable,
 * while an owned run fails if a spec accidentally navigates to the chooser,
 * Stable, a stale dist, or any channel whose provenance differs from S0.
 */
export async function assertPass66OwnedCandidatePage(page: Page): Promise<void> {
  const gate = process.env.PASS66_OWNED_GATE;
  if (gate === undefined) return;
  if (gate !== 'multiplayer-stability') {
    throw new Error(`Pass 66 multiplayer candidate binding received unexpected owned gate ${gate}`);
  }
  const expected = {
    sourceSha: process.env.PASS66_OWNED_SOURCE_SHA ?? '',
    treeSha256: process.env.PASS66_OWNED_TREE_SHA256 ?? '',
    exactRootFileCount: Number(process.env.PASS66_OWNED_FILE_COUNT ?? Number.NaN),
  };
  if (!/^[a-f0-9]{40}$/u.test(expected.sourceSha)
    || !/^[a-f0-9]{64}$/u.test(expected.treeSha256)
    || !Number.isSafeInteger(expected.exactRootFileCount)
    || expected.exactRootFileCount < 2) {
    throw new Error('Pass 66 multiplayer candidate binding is missing exact owned source identity');
  }

  const actual = await page.evaluate(async (ownedIdentity) => {
    const route = new URL(window.location.href);
    if (route.pathname !== '/channels/the-big-one/'
      && !route.pathname.startsWith('/channels/the-big-one/index.')) {
      throw new Error(`Multiplayer page escaped the candidate channel: ${route.pathname}`);
    }
    const response = await fetch(new URL('channel-provenance.json', route), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Candidate provenance returned HTTP ${response.status}`);
    const provenance = await response.json() as OwnedCandidateIdentity;
    if (provenance?.schemaVersion !== 4 || provenance.channel !== 'the-big-one'
      || provenance.releasePass !== 'PASS 66' || provenance.path !== 'channels/the-big-one'
      || provenance.sourceSha !== ownedIdentity.sourceSha
      || provenance.treeSha256 !== ownedIdentity.treeSha256
      || provenance.exactRootFileCount !== ownedIdentity.exactRootFileCount) {
      throw new Error(`Multiplayer page provenance mismatch: ${JSON.stringify(provenance)}`);
    }
    return provenance;
  }, expected);

  if (actual.sourceSha !== expected.sourceSha || actual.treeSha256 !== expected.treeSha256
    || actual.exactRootFileCount !== expected.exactRootFileCount) {
    throw new Error('Pass 66 multiplayer candidate binding changed across the browser boundary');
  }
}
