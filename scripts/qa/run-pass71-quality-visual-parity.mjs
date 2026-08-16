import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import net from 'node:net';
import { release as operatingSystemRelease, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import {
  PASS71_QUALITY_GRAPHICS,
  PASS71_QUALITY_VISUAL_EVIDENCE,
  PASS71_QUALITY_VISUAL_TOOL_PATHS,
  assertPass71QualityVisualEvidence,
  pass71QualityVisualCaptureSignatures,
  pass71QualityVisualPairMetrics,
  pass71QualityVisualPairPasses,
  pass71QualityVisualPngEvidence,
  pass71QualityVisualRecordSha256,
  pass71QualityVisualToolingHashesAtSource,
} from './pass71-quality-visual-parity-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';
import { verifyAtomicQualityBaseline } from './verify-pass71-atomic-quality-baseline.mjs';

const repositoryRoot = resolve(process.cwd());
const values = parseArgs(process.argv.slice(2));
const expectedSourceSha = values['expected-source-sha'];
const candidatePort = boundedPort(values['candidate-port'] ?? process.env.PASS71_HF303_CANDIDATE_PORT ?? '4570', 'candidate');
const baselinePort = boundedPort(values['baseline-port'] ?? process.env.PASS71_HF303_BASELINE_PORT ?? '4571', 'baseline');
const baseline = PASS71_QUALITY_VISUAL_EVIDENCE.baseline;
const PASS70_PAGES_SHA = 'ecd683116163b4940566f82f7edb87ed9c964cb6';
const artifactBase = resolve(repositoryRoot, 'artifacts/pass71/hf303-quality-visual');
const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});
const SOFTWARE_GPU = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const GPU_FAMILIES = Object.freeze(['nvidia', 'amd', 'radeon', 'intel']);
const ROUTE_QUERIES = Object.freeze({
  webgl2: 'externalServices=off&map=atomic-acres&release=latest&renderer=webgl2&seed=6401',
  webgpu: 'externalServices=off&map=atomic-acres&release=latest&renderer=webgpu&requireWebGPU=1&seed=6401',
});

let temporaryRoot = null;
let browser = null;
let candidateServer = null;
let baselineServer = null;

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-303 runner expected --name value; received ${name ?? '(missing)'}`);
    }
    const key = name.slice(2);
    if (!['expected-source-sha', 'candidate-port', 'baseline-port', 'edge-executable'].includes(key)) {
      throw new Error(`HF-303 runner does not accept --${key}`);
    }
    if (Object.hasOwn(parsed, key)) throw new Error(`HF-303 runner received duplicate --${key}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`HF-303 ${label} port must be from 1024 through 65535`);
  }
  return port;
}

function git(args, encoding = 'utf8') {
  const output = execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding,
    windowsHide: true,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return encoding === null ? output : output.trim();
}

function sourceStatus() {
  return git(['status', '--porcelain', '--untracked-files=all']);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function walkFiles(root) {
  const output = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) output.push(path);
    }
  };
  visit(root);
  return output.sort((left, right) => relative(root, left).replaceAll('\\', '/').localeCompare(relative(root, right).replaceAll('\\', '/')));
}

function digestEntries(entries) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(entry.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function diskRuntimeIdentity(channelRoot) {
  const files = walkFiles(channelRoot);
  const runtime = files.filter((path) => relative(channelRoot, path).replaceAll('\\', '/') !== 'channel-provenance.json');
  return Object.freeze({
    runtimeFileCount: runtime.length,
    completeFileCount: files.length,
    runtimeTreeSha256: digestEntries(runtime.map((path) => ({
      path: relative(channelRoot, path).replaceAll('\\', '/'),
      bytes: readFileSync(path),
    }))),
  });
}

function batchedGitBlobs(specifications) {
  const blobs = new Map();
  for (let start = 0; start < specifications.length; start += 8) {
    const batch = specifications.slice(start, start + 8);
    const output = execFileSync('git', ['cat-file', '--batch'], {
      cwd: repositoryRoot,
      input: Buffer.from(`${batch.join('\n')}\n`, 'utf8'),
      encoding: null,
      windowsHide: true,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let offset = 0;
    for (const specification of batch) {
      const headerEnd = output.indexOf(0x0a, offset);
      if (headerEnd < 0) throw new Error(`HF-303 truncated git cat-file header for ${specification}`);
      const header = output.toString('utf8', offset, headerEnd);
      const fields = header.split(' ');
      if (fields.length !== 3 || fields[1] !== 'blob') throw new Error(`HF-303 expected Git blob ${specification}; received ${header}`);
      const size = Number(fields[2]);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`HF-303 invalid Git blob size for ${specification}`);
      const bodyStart = headerEnd + 1;
      const bodyEnd = bodyStart + size;
      if (bodyEnd >= output.length || output[bodyEnd] !== 0x0a) throw new Error(`HF-303 truncated Git blob ${specification}`);
      blobs.set(specification, Buffer.from(output.subarray(bodyStart, bodyEnd)));
      offset = bodyEnd + 1;
    }
    if (offset !== output.length) throw new Error('HF-303 unexpected trailing git cat-file output');
  }
  return blobs;
}

function gitExtractPass70Pages(targetRoot) {
  const prefix = `${baseline.pagesPath}/`;
  const sourcePaths = git(['ls-tree', '-r', '-z', '--name-only', baseline.pagesSha, '--', baseline.pagesPath])
    .split('\0').filter(Boolean).sort();
  if (sourcePaths.length !== baseline.completeFileCount || sourcePaths.some((path) => !path.startsWith(prefix))) {
    throw new Error(`HF-303 immutable Pass 70 Pages membership mismatch: ${sourcePaths.length}/${baseline.completeFileCount}`);
  }
  const specifications = sourcePaths.map((path) => `${baseline.pagesSha}:${path}`);
  const blobs = batchedGitBlobs(specifications);
  const entries = [];
  for (let index = 0; index < sourcePaths.length; index += 1) {
    const sourcePath = sourcePaths[index];
    const relativePath = sourcePath.slice(prefix.length);
    if (!relativePath || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`HF-303 unsafe immutable Pages path ${sourcePath}`);
    }
    const target = resolve(targetRoot, baseline.pagesPath, relativePath);
    const channelRoot = resolve(targetRoot, baseline.pagesPath);
    if (!target.startsWith(`${channelRoot}${sep}`)) throw new Error(`HF-303 immutable Pages path escaped target: ${sourcePath}`);
    const bytes = blobs.get(specifications[index]);
    if (!bytes) throw new Error(`HF-303 missing immutable Pages blob ${sourcePath}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    entries.push({ path: relativePath, bytes });
  }
  const runtime = entries.filter(({ path }) => path !== 'channel-provenance.json');
  const provenanceEntry = entries.find(({ path }) => path === 'channel-provenance.json');
  if (!provenanceEntry) throw new Error('HF-303 immutable Pass 70 Pages provenance is missing');
  const provenance = JSON.parse(provenanceEntry.bytes.toString('utf8'));
  const runtimeTreeSha256 = digestEntries(runtime);
  const provenanceSha256 = sha256(provenanceEntry.bytes);
  const pagesSubject = git(['show', '-s', '--format=%s', baseline.pagesSha]);
  if (runtime.length !== baseline.runtimeFileCount || runtimeTreeSha256 !== baseline.runtimeTreeSha256
    || provenance?.releasePass !== baseline.releasePass || provenance.sourceSha !== baseline.sourceSha
    || provenance.path !== baseline.pagesPath || provenance.exactRootFileCount !== baseline.runtimeFileCount
    || provenance.treeSha256 !== baseline.runtimeTreeSha256
    || provenanceSha256 !== baseline.provenanceSha256
    || pagesSubject !== `PASS 70 from ${baseline.sourceSha}`) {
    throw new Error('HF-303 immutable Pass 70 Pages source/count/digest/provenance verification failed');
  }
  return Object.freeze({
    channelRoot: resolve(targetRoot, baseline.pagesPath),
    provenanceSha256,
    identity: Object.freeze({
      ...baseline,
      extractedTreeSha256: runtimeTreeSha256,
      pagesSubject,
    }),
  });
}

function sanitizeBuildEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => {
    const upper = name.toUpperCase();
    return !upper.startsWith('VITE_') && !upper.startsWith('PASS71_HF303_');
  }));
}

function stageCandidate(temporaryDist, topologyReceiptPath) {
  const environment = {
    ...sanitizeBuildEnvironment(),
    NODE_ENV: 'production',
    SOURCE_SHA: expectedSourceSha,
    RELEASE_PASS: 'PASS 71',
    VITE_MATCH_BUILD_ID: expectedSourceSha,
  };
  execFileSync(process.execPath, [resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', temporaryDist, '--emptyOutDir'], {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(process.execPath, [resolve(repositoryRoot, PASS71_QUALITY_VISUAL_TOOL_PATHS.topologyStager)], {
    cwd: repositoryRoot,
    env: {
      ...environment,
      RELEASE_DIST_ROOT: temporaryDist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const topologyBytes = readFileSync(topologyReceiptPath);
  const topology = JSON.parse(topologyBytes.toString('utf8'));
  const staged = topology?.channels?.experimental;
  const channelRoot = resolve(temporaryDist, 'channels/the-big-one');
  const provenancePath = resolve(channelRoot, 'channel-provenance.json');
  if (!existsSync(provenancePath)) throw new Error('HF-303 candidate staging omitted channel-provenance.json');
  const provenanceBytes = readFileSync(provenancePath);
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));
  const identity = diskRuntimeIdentity(channelRoot);
  if (topology?.schemaVersion !== 4 || topology.sourceSha !== expectedSourceSha || topology.releasePass !== 'PASS 71'
    || staged?.sourceSha !== expectedSourceSha || staged.releasePass !== 'PASS 71' || staged.path !== 'channels/the-big-one'
    || provenance?.schemaVersion !== 4 || provenance.channel !== 'the-big-one'
    || provenance.releasePass !== 'PASS 71' || provenance.sourceSha !== expectedSourceSha
    || provenance.path !== 'channels/the-big-one' || provenance.exactRootFileCount !== identity.runtimeFileCount
    || provenance.treeSha256 !== identity.runtimeTreeSha256 || staged.exactRootFileCount !== identity.runtimeFileCount
    || staged.treeSha256 !== identity.runtimeTreeSha256 || identity.completeFileCount !== identity.runtimeFileCount + 1) {
    throw new Error('HF-303 exact candidate staged topology provenance failed');
  }
  return Object.freeze({
    channelRoot,
    provenanceSha256: sha256(provenanceBytes),
    identity: Object.freeze({
      expectedSourceSha,
      checkoutSourceSha: expectedSourceSha,
      endingCheckoutSourceSha: null,
      cleanBefore: true,
      cleanAfter: null,
      releasePass: 'PASS 71',
      provenanceSchemaVersion: provenance.schemaVersion,
      channel: provenance.channel,
      pagesPath: 'channels/the-big-one',
      provenanceSha256: sha256(provenanceBytes),
      topologySchemaVersion: topology.schemaVersion,
      topologySha256: sha256(topologyBytes),
      ...identity,
    }),
  });
}

function requireEdgeExecutable() {
  const candidates = [
    values['edge-executable'],
    process.env.PASS71_HF303_EDGE_EXECUTABLE,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).map((path) => resolve(path));
  const executable = candidates.find((path) => {
    try { return existsSync(path) && statSync(path).isFile(); } catch { return false; }
  });
  if (!executable || basename(executable).toLowerCase() !== 'msedge.exe') {
    throw new Error('HF-303 native visual evidence requires an installed Microsoft Edge executable');
  }
  return executable;
}

function readGraphicsAdapters() {
  const powershell = resolve(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$rows = @(Get-CimInstance -ClassName Win32_VideoController | ForEach-Object { [ordered]@{ name = [string]$_.Name; driverVersion = [string]$_.DriverVersion } })',
    '$rows | ConvertTo-Json -Compress',
  ].join('; ');
  const decoded = JSON.parse(execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  }));
  const rows = (Array.isArray(decoded) ? decoded : [decoded]).map((entry) => ({
    name: String(entry?.name ?? '').trim(),
    driverVersion: String(entry?.driverVersion ?? '').trim(),
  })).filter((entry) => entry.name && /^\d+(?:\.\d+)+$/u.test(entry.driverVersion) && !SOFTWARE_GPU.test(entry.name));
  if (rows.length < 1) throw new Error('HF-303 could not establish a non-software Windows graphics adapter and driver');
  return rows.sort((left, right) => left.name.localeCompare(right.name) || left.driverVersion.localeCompare(right.driverVersion));
}

function nativeAdapterForLabel(adapters, label) {
  const normalized = String(label || '').toLowerCase();
  const family = GPU_FAMILIES.find((candidate) => normalized.includes(candidate));
  let matches = family ? adapters.filter(({ name }) => name.toLowerCase().includes(family)) : [];
  if (matches.length === 0 && adapters.length === 1) matches = adapters;
  if (matches.length !== 1) {
    throw new Error(`HF-303 cannot map renderer ${JSON.stringify(label)} to one installed adapter: ${JSON.stringify(adapters)}`);
  }
  return { ...matches[0] };
}

function portIsListening(port) {
  return new Promise((complete) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      complete(listening);
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function startOwnedStaticServer(root, port, faults) {
  const absoluteRoot = resolve(root);
  const server = createServer((request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname);
      const relativePath = pathname.replace(/^\/+/, '');
      let target = resolve(absoluteRoot, relativePath);
      if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      if (existsSync(target) && statSync(target).isDirectory()) target = resolve(target, 'index.html');
      if (!existsSync(target) || !statSync(target).isFile()) {
        response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      const bytes = readFileSync(target);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.length),
        'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      if (request.method === 'HEAD') response.end();
      else response.end(bytes);
    } catch (error) {
      faults.push(`static-server:${error instanceof Error ? error.message : String(error)}`);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  return new Promise((complete, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      complete(server);
    });
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((complete) => server.close(() => complete()));
}

function normalizeMaterialName(value) {
  return String(value).replace(/:([0-9a-f]{8})(?=,|$)/giu, ':(unnamed)');
}

function materialInventory(audit) {
  if (!Array.isArray(audit) || audit.length < 1) throw new Error('HF-303 visible material audit is empty');
  const entries = audit.map((entry) => ({
    name: String(entry?.name ?? ''),
    material: normalizeMaterialName(entry?.material),
    triangles: Math.round(Number(entry?.triangles ?? -1)),
  })).sort((left, right) => left.name.localeCompare(right.name)
    || left.material.localeCompare(right.material) || left.triangles - right.triangles);
  if (entries.some((entry) => !entry.name || !entry.material || !Number.isSafeInteger(entry.triangles) || entry.triangles < 0)) {
    throw new Error('HF-303 visible material audit contains an invalid entry');
  }
  const materialTypes = {};
  for (const entry of entries) {
    for (const material of entry.material.split(',')) {
      const type = material.split(':')[0] || '(unknown)';
      materialTypes[type] = (materialTypes[type] ?? 0) + 1;
    }
  }
  return Object.freeze({
    entryCount: entries.length,
    triangleCount: entries.reduce((total, entry) => total + entry.triangles, 0),
    inventorySha256: sha256(Buffer.from(canonicalJson(entries), 'utf8')),
    materialTypes: Object.fromEntries(Object.entries(materialTypes).sort(([left], [right]) => left.localeCompare(right))),
    entries,
  });
}

function projectLod(model) {
  if (!model || typeof model !== 'object') throw new Error('HF-303 Quality operator LOD0 telemetry is unavailable');
  return Object.freeze({
    source: model.source,
    assetUrl: model.assetUrl,
    lod: model.lod,
    skinnedMeshes: model.skinnedMeshes,
    pbrMaterials: model.pbrMaterials,
    materialContract: model.materialContract,
    embeddedWeaponsSuppressed: model.embeddedWeaponsSuppressed,
    visibleEmbeddedWeapons: model.visibleEmbeddedWeapons,
    effectivelyVisibleSkinnedMeshes: Array.isArray(model.effectivelyVisibleSkinnedMeshes) ? model.effectivelyVisibleSkinnedMeshes.length : 0,
    armPoseContract: model.armPose?.contract,
    armsPresent: model.armPose?.allPresent === true,
    armsHierarchyValid: model.armPose?.allHierarchyValid === true,
    armsRendered: model.armPose?.allInEffectivelyVisibleSkinnedMesh === true && model.armPose?.allHaveRenderedVertexInfluence === true,
    armsAntiTPose: model.armPose?.allAntiTPoseGeometry === true,
    handsContract: model.handPose?.contract,
    handsPresent: model.handPose?.allPresent === true,
    handsDescendFromWrists: model.handPose?.allDescendantOfWrist === true,
    handsRendered: model.handPose?.allInEffectivelyVisibleSkinnedMesh === true && model.handPose?.allHaveRenderedVertexInfluence === true,
    mergedVertexLod: model.mergedVertexLod === true,
  });
}

async function captureOne({ subject, backend, port, provenanceSha256, graphicsAdapters, executableVersion }) {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-GB',
    reducedMotion: 'no-preference',
    timezoneId: 'Europe/London',
  });
  const faults = [];
  let page = null;
  try {
    await context.addInitScript((graphics) => {
      try {
        localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify({ version: 1, graphics }));
      } catch { /* The originless bootstrap document has no storage. */ }
    }, PASS71_QUALITY_GRAPHICS);
    const expectedOrigin = `http://127.0.0.1:${port}`;
    await context.route('**/*', (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === expectedOrigin) return route.continue();
      if (requestUrl.hostname === 'fonts.googleapis.com') {
        return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' });
      }
      faults.push(`unexpected-external-request:${requestUrl.origin}${requestUrl.pathname}`);
      return route.abort('blockedbyclient');
    });
    page = await context.newPage();
    page.setDefaultTimeout(120_000);
    page.on('pageerror', (error) => faults.push(`pageerror:${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') faults.push(`console:${message.text()}`); });
    page.on('requestfailed', (request) => {
      if (request.url().startsWith(expectedOrigin)) faults.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`);
    });
    const query = ROUTE_QUERIES[backend];
    const path = '/channels/the-big-one/';
    const url = `${expectedOrigin}${path}?${query}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(({ requestedBackend }) => {
      const state = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready'
        && state?.arenaSelection?.id === 'atomic-acres'
        && state?.render?.profile === 'blender'
        && state?.render?.runtime?.actualBackend === requestedBackend
        && state?.settings?.displayedGraphicsPreset === 'high'
        && state?.settings?.requested?.graphics?.preset === 'high'
        && state?.render?.qualityAssetStreaming?.atomicAcres === 'ready'
        && state?.render?.blenderEnvironment?.status === 'ready'
        && state?.render?.skyBackdrop?.status === 'asset-ready';
    }, { requestedBackend: backend });
    await page.evaluate(() => {
      const api = globalThis.__ATOMIC_ACRES_DEBUG__;
      api.startSolo();
      api.setBotsFrozen(true);
      api.setMovement(false);
    });
    await page.waitForFunction(({ requestedBackend }) => {
      const state = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const runtime = state?.render?.runtime;
      const presentationReady = requestedBackend === 'webgpu'
        ? runtime?.presentation?.status === 'healthy'
        : runtime?.presentation?.status === 'synchronous';
      return state?.gameStarted === true && state?.matchPhase === 'active'
        && state?.menuLifecycle?.surface === 'hidden'
        && runtime?.actualBackend === requestedBackend && runtime?.softwareAdapter === false
        && runtime?.deviceLost === false && runtime?.uncapturedErrors === 0 && presentationReady
        && state?.render?.qualityAssetStreaming?.atomicAcres === 'ready'
        && state?.render?.blenderEnvironment?.status === 'ready'
        && state?.bots?.some((bot) => bot?.operatorModel?.lod === 0
          && bot.operatorModel?.armPose?.allPresent === true
          && bot.operatorModel?.handPose?.allPresent === true);
    }, { requestedBackend: backend });
    const lodModel = await page.evaluate(() => {
      const state = globalThis.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.bots.find((bot) => bot?.operatorModel?.lod === 0)?.operatorModel ?? null;
    });
    const lod = projectLod(lodModel);
    const [x, y, z] = PASS71_QUALITY_VISUAL_EVIDENCE.camera.position;
    const [targetX, targetY, targetZ] = PASS71_QUALITY_VISUAL_EVIDENCE.camera.target;
    const yaw = Math.atan2(x - targetX, z - targetZ);
    const pitch = Math.atan2(targetY - y, Math.hypot(targetX - x, targetZ - z));
    const cameraRevision = await page.evaluate(({ xValue, yValue, zValue, yawValue, pitchValue }) => {
      const api = globalThis.__ATOMIC_ACRES_DEBUG__;
      if (api.setArenaReviewCamera('nuke-town-overview') !== true) throw new Error('canonical Nuke Town overview camera is unavailable');
      api.clearBots();
      api.setCaptureViewmodelHidden(true);
      api.setGrassTime(63);
      api.setCaptureCameraFarPlane(190);
      const revision = api.setCaptureCameraPose(xValue, yValue, zValue, yawValue, pitchValue, 70, 63_000, 6_401);
      if (!Number.isSafeInteger(revision)) throw new Error('exact HF-303 capture camera was not admitted');
      return revision;
    }, { xValue: x, yValue: y, zValue: z, yawValue: yaw, pitchValue: pitch });
    await page.waitForFunction(({ revision, requestedBackend }) => {
      const state = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const presented = state?.deterministicReview?.presentedCamera;
      const retirements = state?.interactiveWorld?.gpuRetirement;
      return state?.render?.playableScene?.botObjects === 0
        && (!retirements || (retirements.queuedRoots === 0 && retirements.draining === false))
        && presented?.captureRevision === revision && presented?.renderer === requestedBackend
        && presented?.arenaId === 'atomic-acres' && presented?.position?.[0] === 42
        && presented?.position?.[1] === 28 && presented?.position?.[2] === 48
        && presented?.fov === 70 && presented?.near === 0.08 && presented?.far === 190
        && state?.render?.playableScene?.deterministicReview?.fixedTimeMs === 63_000
        && state?.render?.playableScene?.deterministicReview?.seed === 6_401
        && state?.render?.playableScene?.deterministicReview?.hud === 'hidden';
    }, { revision: cameraRevision, requestedBackend: backend });
    const projected = await page.evaluate(async ({ revision, requestedBackend, expectedYaw, expectedPitch }) => {
      const api = globalThis.__ATOMIC_ACRES_DEBUG__;
      const completion = await api.awaitCommittedCameraCompletion();
      const state = api.snapshot();
      const runtime = state.render.runtime;
      const playable = state.render.playableScene;
      const policy = playable.actualArenaVisualPolicy;
      const official = state.deterministicReview.presentedCamera;
      const complete = requestedBackend === 'webgl2'
        ? official?.completionSemantics === 'synchronous-render-return'
        : completion?.status === 'healthy'
          && Number(completion.completedSequence) >= Number(official?.submissionSequence);
      const exactCamera = official?.captureRevision === revision && official?.renderer === requestedBackend
        && official?.position?.every((value, index) => value === [42, 28, 48][index])
        && Math.abs(Number(official?.yaw) - expectedYaw) < 1e-9
        && Math.abs(Number(official?.pitch) - expectedPitch) < 1e-9
        && official?.fov === 70 && official?.near === 0.08 && official?.far === 190
        && complete;
      const browserIdentity = await (async () => {
        const userAgent = navigator.userAgent;
        const data = navigator.userAgentData;
        if (!data?.getHighEntropyValues) return { userAgent, version: null };
        const values = await data.getHighEntropyValues(['fullVersionList']);
        const edge = values.fullVersionList?.find((entry) => /Microsoft Edge/i.test(entry.brand));
        return { userAgent, version: edge?.version ?? null };
      })();
      const arenaBallistics = state.ballistics.arenas['atomic-acres'];
      const result = {
        browserIdentity,
        runtime: {
          requestedBackend: runtime.requestedBackend,
          actualBackend: runtime.actualBackend,
          initialized: runtime.initialized,
          adapterLabel: runtime.adapterLabel,
          adapterClass: runtime.adapterClass,
          deviceClass: runtime.deviceClass,
          softwareAdapter: runtime.softwareAdapter,
          principalHdrSamples: state.render.atomicSignal.principalHdrSamples,
          deviceLost: runtime.deviceLost,
          uncapturedErrors: runtime.uncapturedErrors,
          presentationStatus: runtime.presentation.status,
          webglVersion: state.render.webglVersion,
        },
        cameraPresentation: {
          contract: official?.contract,
          renderer: official?.renderer,
          completionSemantics: official?.completionSemantics,
          captureRevision: official?.captureRevision,
          submissionSequence: official?.submissionSequence,
          completedSequence: requestedBackend === 'webgpu'
            ? Number(completion?.completedSequence)
            : official?.completedSequence,
          complete: exactCamera,
        },
        quality: {
          name: document.querySelector('#graphics-profile')?.selectedOptions?.[0]?.textContent?.trim() ?? null,
          preset: document.querySelector('#graphics-profile')?.value ?? null,
          storageKey: 'atomic-acres-pass65-settings-v1',
          storageVersion: 1,
          queryRenderProfileOverride: null,
          requestedGraphics: state.settings.requested.graphics,
          effectiveGraphics: state.settings.graphics,
          displayedPreset: state.settings.displayedGraphicsPreset,
          renderProfile: state.render.profile,
          pixelRatio: state.render.pixelRatio,
          drawingBuffer: state.render.drawingBuffer,
        },
        assets: {
          originalArtLoaded: state.originalArtLoaded,
          qualityStreaming: state.render.qualityAssetStreaming.atomicAcres,
          blenderStatus: state.render.blenderEnvironment.status,
          asset: state.render.blenderEnvironment.asset,
          meshCount: state.render.blenderEnvironment.meshCount,
          materialCount: state.render.blenderEnvironment.materialCount,
          texturedMaterials: state.render.blenderEnvironment.texturedMaterials,
          pbrMaterials: state.render.blenderEnvironment.pbrMaterials,
          textureCount: state.render.blenderEnvironment.textureCount,
          triangleCount: state.render.blenderEnvironment.triangleCount,
          semanticWindows: state.render.blenderEnvironment.semanticWindows,
          auditedApertures: state.render.blenderEnvironment.auditedApertures,
          auditedOpenApertures: state.render.blenderEnvironment.auditedOpenApertures,
          auditedWindowApertures: state.render.blenderEnvironment.auditedWindowApertures,
          apertureAuditSamples: state.render.blenderEnvironment.apertureAuditSamples,
          modeledBuses: state.render.blenderEnvironment.modeledBuses,
          largeCoverAssets: state.render.blenderEnvironment.largeCoverAssets,
          housePropSets: state.render.blenderEnvironment.housePropSets,
          collisionAuditVisuals: state.render.blenderEnvironment.collisionAuditVisuals,
          surfaceSeparationPass: state.render.blenderEnvironment.surfaceSeparationPass,
          worldIdentityPass: state.render.blenderEnvironment.worldIdentityPass,
          proceduralWorldHidden: state.render.blenderEnvironment.proceduralWorldHidden,
          qualityArtRootVisible: state.render.blenderEnvironment.qualityArtRootVisible,
          overlappingPrimaryArenaRoots: state.render.blenderEnvironment.overlappingPrimaryArenaRoots,
          skyStatus: state.render.skyBackdrop.status,
          skyAssetUrl: state.render.skyBackdrop.assetUrl,
          definitionId: policy.definitionId,
          authoritativeArenaRoots: playable.authoritativeArenaRoots,
          duplicateArenaRoots: playable.duplicateArenaRoots,
        },
        materialAudit: api.renderAudit(),
        lighting: {
          definitionId: policy.definitionId,
          sun: policy.sun,
          ambient: policy.ambient,
          fog: policy.fog,
          atmosphereDefinitionId: policy.atmosphereDefinitionId,
          profile: {
            exposure: state.render.lighting.exposure,
            sunIntensity: state.render.lighting.sunIntensity,
            ambientIntensity: state.render.lighting.ambientIntensity,
            hemisphereIntensity: state.render.lighting.hemisphereIntensity,
            fogNear: state.render.lighting.fogNear,
            fogFar: state.render.lighting.fogFar,
          },
          sky: { linearHdr: state.render.sky.linearHdr, fogNear: state.render.sky.fogNear, fogFar: state.render.sky.fogFar },
        },
        shadows: {
          enabled: state.render.shadows,
          authored: state.render.authoredShadows,
          mode: state.render.shadowMode,
          sunCastShadow: policy.shadows.sunCastShadow,
          mapSize: policy.shadows.mapSize,
          maximumDistance: policy.shadows.maximumDistance,
          normalBias: policy.shadows.normalBias,
          shadowLights: playable.budgetAudit.measured.shadowLights,
          shadowMapPixels: playable.budgetAudit.measured.shadowMapPixels,
        },
        authority: {
          arena: {
            id: state.arenaSelection.id,
            bounds: state.arenaSelection.bounds,
            spawnCounts: state.arenaSelection.spawnCounts,
            colliders: state.arenaSelection.colliders,
            physicsColliders: state.arenaSelection.physicsColliders,
            physicsBoundaryWalls: state.arenaSelection.physicsBoundaryWalls,
            navigationColliders: state.arenaSelection.navigationColliders,
            navigationCollidersMatchArena: state.arenaSelection.navigationCollidersMatchArena,
            raycastMeshes: state.arenaSelection.raycastMeshes,
            targets: state.arenaSelection.targets,
          },
          ballistics: {
            activeSurfaces: state.ballistics.activeSurfaces,
            raycastMeshes: arenaBallistics.raycastMeshes,
            shotSurfaces: arenaBallistics.shotSurfaces,
            fallbackSurfaces: arenaBallistics.fallbackSurfaces,
          },
          houses: state.houseNavigation,
          physicalCover: state.physicalCover,
          profileAuthorityParity: state.interiorTelemetry.profileAuthorityParity,
        },
      };
      api.setRenderPaused(true);
      return result;
    }, { revision: cameraRevision, requestedBackend: backend, expectedYaw: yaw, expectedPitch: pitch });
    if (projected.browserIdentity.version !== executableVersion) {
      throw new Error(`HF-303 ${subject}/${backend} Edge high-entropy version ${projected.browserIdentity.version ?? '(missing)'} != executable ${executableVersion}`);
    }
    projected.runtime.nativeAdapter = nativeAdapterForLabel(graphicsAdapters, projected.runtime.adapterLabel);
    const canvas = page.locator('#game');
    await canvas.waitFor({ state: 'visible' });
    const bounds = await canvas.boundingBox();
    if (!bounds || bounds.width !== 640 || bounds.height !== 360) {
      throw new Error(`HF-303 ${subject}/${backend} canvas is not exact 640x360: ${JSON.stringify(bounds)}`);
    }
    const pngBytes = await canvas.screenshot({ type: 'png', animations: 'disabled', timeout: 60_000 });
    const uniqueFaults = [...new Set(faults)];
    if (uniqueFaults.length > 0) throw new Error(`HF-303 ${subject}/${backend} browser faults:\n- ${uniqueFaults.join('\n- ')}`);
    const signedState = {
      quality: projected.quality,
      assets: projected.assets,
      lod,
      materials: materialInventory(projected.materialAudit),
      lighting: projected.lighting,
      shadows: projected.shadows,
      authority: projected.authority,
    };
    const record = Object.freeze({
      id: `${subject}-${backend}`,
      subject,
      backend,
      servedOrigin: { subject, port, provenanceSha256 },
      route: { path, query },
      browser: projected.browserIdentity,
      runtime: projected.runtime,
      camera: { ...PASS71_QUALITY_VISUAL_EVIDENCE.camera, presentation: projected.cameraPresentation },
      ...signedState,
      signatures: pass71QualityVisualCaptureSignatures(signedState),
      png: pass71QualityVisualPngEvidence(pngBytes),
      faults: uniqueFaults,
    });
    return Object.freeze({ record, pngBytes });
  } finally {
    if (page) {
      await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__?.setRenderPaused(false)).catch(() => undefined);
    }
    await context.close();
  }
}

function writeHashedJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeFileSync(path, bytes);
  writeFileSync(`${path}.sha256`, `${sha256(bytes)}  ${basename(path)}\n`, 'utf8');
  return sha256(bytes);
}

function safeRemoveTemporaryRoot(path) {
  const absolute = resolve(path);
  const parent = resolve(tmpdir());
  if (dirname(absolute) !== parent || !basename(absolute).startsWith('atomic-acres-pass71-hf303-')) {
    throw new Error(`Refusing unsafe HF-303 temporary cleanup: ${absolute}`);
  }
  rmSync(absolute, { recursive: true, force: true });
}

async function main() {
  if (!/^[0-9a-f]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('HF-303 runner requires --expected-source-sha with candidate A full SHA');
  }
  if (baseline.pagesSha !== PASS70_PAGES_SHA) throw new Error('HF-303 immutable Pass 70 Pages identity drifted');
  if (process.platform !== 'win32') throw new Error('HF-303 native Quality evidence is Windows installed-Edge evidence');
  if (candidatePort === baselinePort) throw new Error('HF-303 candidate and Pass 70 baseline ports must differ');
  const checkoutSourceSha = git(['rev-parse', 'HEAD']);
  const cleanBefore = sourceStatus() === '';
  if (checkoutSourceSha !== expectedSourceSha || !cleanBefore) {
    throw new Error(`HF-303 requires clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha}; clean=${cleanBefore})`);
  }
  if (await portIsListening(candidatePort) || await portIsListening(baselinePort)) {
    throw new Error(`HF-303 requires unbound owned ports ${candidatePort} and ${baselinePort}`);
  }
  const overrides = ['.env', '.env.local', '.env.production.local'].filter((path) => existsSync(resolve(repositoryRoot, path)));
  if (overrides.length > 0) throw new Error(`HF-303 rejects Vite overrides: ${overrides.join(', ')}`);
  const lockfilePreflight = spawnSync(process.execPath, [resolve(repositoryRoot, PASS71_QUALITY_VISUAL_TOOL_PATHS.lockVerifier)], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (lockfilePreflight.error || lockfilePreflight.signal || lockfilePreflight.status !== 0) {
    throw new Error(`HF-303 npm@10.9.8 lockfile preflight failed: ${lockfilePreflight.error?.message ?? lockfilePreflight.signal ?? lockfilePreflight.status}`);
  }
  const edgeExecutable = requireEdgeExecutable();
  const executableIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
  const graphicsAdapters = readGraphicsAdapters();
  const tooling = pass71QualityVisualToolingHashesAtSource(repositoryRoot, expectedSourceSha);
  temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass71-hf303-'));
  const candidateDist = resolve(temporaryRoot, 'candidate-dist');
  const baselineDist = resolve(temporaryRoot, 'pass70-pages');
  const topologyReceiptPath = resolve(temporaryRoot, 'candidate-topology.json');
  mkdirSync(baselineDist, { recursive: true });
  const startedAt = new Date().toISOString();
  const runDirectory = resolve(artifactBase, `${expectedSourceSha}-${startedAt.replaceAll(':', '-').replace('.000Z', 'Z')}`);
  const pass70 = gitExtractPass70Pages(baselineDist);
  const candidate = stageCandidate(candidateDist, topologyReceiptPath);
  const structuralComparator = verifyAtomicQualityBaseline({
    root: repositoryRoot,
    recordPath: resolve(repositoryRoot, PASS71_QUALITY_VISUAL_TOOL_PATHS.baselineRecord),
    candidateDist: candidate.channelRoot,
  });
  if (structuralComparator.status !== 'PASS' || structuralComparator.pixelParity?.status !== 'UNPROVEN') {
    throw new Error(`HF-303 structural comparator did not retain PASS/UNPROVEN: ${JSON.stringify(structuralComparator)}`);
  }
  const serverFaults = [];
  candidateServer = await startOwnedStaticServer(candidateDist, candidatePort, serverFaults);
  baselineServer = await startOwnedStaticServer(baselineDist, baselinePort, serverFaults);
  browser = await chromium.launch({
    executablePath: edgeExecutable,
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-software-rasterizer',
      '--enable-gpu-rasterization',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const captureResults = [];
  for (const backend of PASS71_QUALITY_VISUAL_EVIDENCE.backends) {
    captureResults.push(await captureOne({
      subject: 'pass70', backend, port: baselinePort, provenanceSha256: pass70.provenanceSha256,
      graphicsAdapters, executableVersion: executableIdentity.productVersion,
    }));
    captureResults.push(await captureOne({
      subject: 'candidate', backend, port: candidatePort, provenanceSha256: candidate.provenanceSha256,
      graphicsAdapters, executableVersion: executableIdentity.productVersion,
    }));
  }
  await browser.close();
  browser = null;
  await closeServer(candidateServer);
  candidateServer = null;
  await closeServer(baselineServer);
  baselineServer = null;
  if (serverFaults.length > 0) throw new Error(`HF-303 static-server faults:\n- ${[...new Set(serverFaults)].join('\n- ')}`);
  const captures = captureResults.map(({ record }) => record);
  const pairs = PASS71_QUALITY_VISUAL_EVIDENCE.backends.map((backend) => {
    const baselineCapture = captureResults.find(({ record }) => record.id === `pass70-${backend}`);
    const candidateCapture = captureResults.find(({ record }) => record.id === `candidate-${backend}`);
    const metrics = pass71QualityVisualPairMetrics(baselineCapture.pngBytes, candidateCapture.pngBytes);
    return Object.freeze({
      backend,
      baselineCaptureId: baselineCapture.record.id,
      candidateCaptureId: candidateCapture.record.id,
      metrics,
      thresholds: PASS71_QUALITY_VISUAL_EVIDENCE.thresholds,
      passed: pass71QualityVisualPairPasses(metrics),
    });
  });
  const endingCheckoutSourceSha = git(['rev-parse', 'HEAD']);
  const cleanAfter = sourceStatus() === '';
  const selectedAdapters = captures.map(({ runtime }) => runtime.nativeAdapter);
  const selectedGraphicsAdapter = selectedAdapters[0];
  if (!selectedAdapters.every((adapter) => canonicalJson(adapter) === canonicalJson(selectedGraphicsAdapter))) {
    throw new Error(`HF-303 captures did not use one installed GPU/driver: ${JSON.stringify(selectedAdapters)}`);
  }
  const completedAt = new Date().toISOString();
  const record = {
    schemaVersion: PASS71_QUALITY_VISUAL_EVIDENCE.schemaVersion,
    evidenceId: PASS71_QUALITY_VISUAL_EVIDENCE.evidenceId,
    feedbackId: PASS71_QUALITY_VISUAL_EVIDENCE.feedbackId,
    kind: PASS71_QUALITY_VISUAL_EVIDENCE.kind,
    contract: PASS71_QUALITY_VISUAL_EVIDENCE.contract,
    gate: PASS71_QUALITY_VISUAL_EVIDENCE.gate,
    status: 'passed',
    startedAt,
    completedAt,
    capturedAt: completedAt,
    claim: {
      mechanicalVisualParity: 'proven-by-this-native-receipt',
      subjectiveOwnerApproval: 'not-claimed',
      baselineLimitationBeforeCapture: 'UNPROVEN',
    },
    invocation: {
      runner: PASS71_QUALITY_VISUAL_TOOL_PATHS.runner,
      expectedSourceSha,
      viewport: PASS71_QUALITY_VISUAL_EVIDENCE.viewport,
      cameraId: PASS71_QUALITY_VISUAL_EVIDENCE.camera.id,
      cameraAuthority: PASS71_QUALITY_VISUAL_EVIDENCE.camera.authority,
      qualityName: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.label,
      graphicsPreset: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.preset,
      settingsStorageKey: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageKey,
      settingsStorageVersion: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageVersion,
      queryRenderProfileOverride: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.queryRenderProfileOverride,
      resolvedRenderProfile: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.resolvedRenderProfile,
      fixedTimeMs: PASS71_QUALITY_VISUAL_EVIDENCE.camera.fixedTimeMs,
      seed: PASS71_QUALITY_VISUAL_EVIDENCE.camera.seed,
      backends: PASS71_QUALITY_VISUAL_EVIDENCE.backends,
      browserChannel: 'msedge',
      browserLaunchCount: 1,
      browserContextCount: 4,
      headless: true,
      captureEncoding: 'lossless-png-embedded',
      previewOwnership: 'two-owned-loopback-static-servers-one-installed-edge-launch',
      dependencyPreflight: 'npm@10.9.8-ci-dry-run',
    },
    source: {
      candidate: {
        ...candidate.identity,
        endingCheckoutSourceSha,
        cleanBefore,
        cleanAfter,
      },
      baseline: pass70.identity,
    },
    structuralComparator,
    environment: {
      machine: 'dave-gaming-pc',
      platform: process.platform,
      arch: process.arch,
      osRelease: operatingSystemRelease(),
      graphicsAdapters,
      selectedGraphicsAdapter,
    },
    browser: {
      channel: 'msedge',
      installed: true,
      executableName: basename(edgeExecutable),
      executableSha256: sha256File(edgeExecutable),
      executableVersion: executableIdentity.productVersion,
      version: executableIdentity.productVersion,
      installRoot: executableIdentity.installRoot,
      authenticodeStatus: executableIdentity.signatureStatus,
      authenticodeSigner: executableIdentity.signerSubject,
      headless: true,
      isolation: 'one-installed-edge-launch-shared-across-all-pass70-candidate-pairs',
    },
    tooling,
    captures,
    pairs,
    faults: [],
  };
  record.receiptSha256 = pass71QualityVisualRecordSha256(record);
  assertPass71QualityVisualEvidence(record, { sourceSha: expectedSourceSha, tooling });
  mkdirSync(runDirectory, { recursive: true });
  for (const { record: capture, pngBytes } of captureResults) {
    writeFileSync(resolve(runDirectory, `${capture.id}.png`), pngBytes);
  }
  const receiptPath = resolve(runDirectory, 'native-evidence.json');
  const receiptFileSha256 = writeHashedJson(receiptPath, record);
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    sourceSha: expectedSourceSha,
    receiptPath,
    receiptFileSha256,
    receiptSha256: record.receiptSha256,
    pairs: pairs.map(({ backend, metrics }) => ({ backend, metrics })),
    claimBoundary: record.claim,
    next: 'The optional HF-303 object is integration-eligible only unchanged and only for this exact source SHA; Dave visual approval remains unclaimed.',
  }, null, 2)}\n`);
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await closeServer(candidateServer).catch(() => undefined);
  await closeServer(baselineServer).catch(() => undefined);
  if (temporaryRoot) {
    try { safeRemoveTemporaryRoot(temporaryRoot); } catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else process.stderr.write(`HF-303 cleanup warning: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`);
    }
  }
}
if (failure) {
  process.stderr.write(`HF-303 NON-CLOSING: no native visual-parity receipt was emitted.\n${failure instanceof Error ? failure.stack ?? failure.message : String(failure)}\n`);
  process.exitCode = 1;
}
