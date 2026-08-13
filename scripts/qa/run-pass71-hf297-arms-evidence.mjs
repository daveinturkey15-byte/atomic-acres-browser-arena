import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import {
  PASS71_HF297_ARMS_EVIDENCE,
  PASS71_HF297_CATALOG_ACTIONS,
  PASS71_HF297_COVERAGE,
  PASS71_HF297_VIEWPORTS,
  PASS71_HF297_VISUAL_ACTIONS,
  PASS71_HF297_WEAPONS,
  assertPass71Hf297Evidence,
  pass71Hf297RecordSha256,
  pass71Hf297ToolingHashes,
} from './pass71-hf297-arms-evidence-contract.mjs';
import { readWindowsExecutableIdentity } from './pass71-edge-executable-identity.mjs';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass71/hf297-arms-evidence');
const componentRoot = resolve(artifactRoot, 'components');
const rawReceiptPath = resolve(componentRoot, 'browser-receipt.json');
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected HF-297 argument ${token}`);
    const equals = token.indexOf('=');
    if (equals > 2) values[token.slice(2, equals)] = token.slice(equals + 1);
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) values[token.slice(2)] = true;
      else {
        values[token.slice(2)] = next;
        index += 1;
      }
    }
  }
  return values;
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pngMetadata(path) {
  const bytes = readFileSync(path);
  if (bytes.length <= 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path} is not a canonical PNG`);
  return {
    sha256: sha256Bytes(bytes), byteLength: bytes.length,
    width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
  };
}

function installedChrome() {
  const candidates = [
    process.env.PASS71_HF297_BROWSER_PATH,
    resolve(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean).map((candidate) => resolve(candidate));
  return candidates.find(existsSync);
}

function installScope(executable) {
  const normalized = executable.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('/appdata/local/google/chrome/application/')) return 'per-user';
  if (normalized.includes('/program files (x86)/')) return 'machine-x86';
  if (normalized.includes('/program files/')) return 'machine-x64';
  throw new Error(`HF-297 Chrome install scope is not canonical: ${executable}`);
}

function runNode(label, args, environment) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw new Error(`${label} failed to launch: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}`);
  if ((result.status ?? 1) !== 0) throw new Error(`${label} failed with exit ${result.status ?? 1}`);
}

function validateRawReceipt(receipt, sourceSha, releasePass) {
  const keys = [
    'schemaVersion', 'status', 'sourceSha', 'servedCandidate', 'browser', 'renderer',
    'adapterLabel', 'coverage', 'frames', 'catalogTelemetry', 'faults',
  ];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || !sameJson(Object.keys(receipt).sort(), keys.sort())
    || receipt.schemaVersion !== 1 || receipt.status !== 'PASS' || receipt.sourceSha !== sourceSha) {
    throw new Error('HF-297 browser receipt identity is invalid');
  }
  if (receipt.servedCandidate?.schemaVersion !== 4 || receipt.servedCandidate?.channel !== 'the-big-one'
    || receipt.servedCandidate.releasePass !== releasePass || receipt.servedCandidate.sourceSha !== sourceSha
    || receipt.servedCandidate.path !== 'channels/the-big-one'
    || !SHA256.test(receipt.servedCandidate.treeSha256 ?? '')
    || !Number.isSafeInteger(receipt.servedCandidate.exactRootFileCount)
    || receipt.servedCandidate.exactRootFileCount < 2) throw new Error('HF-297 staged candidate is invalid');
  if (receipt.browser?.channel !== 'chrome' || typeof receipt.browser.version !== 'string'
    || !/(?:Headless)?Chrome\//u.test(receipt.browser.userAgent ?? '') || /\bEdg\//u.test(receipt.browser.userAgent ?? '')) {
    throw new Error('HF-297 installed Chrome runtime identity is invalid');
  }
  if (receipt.renderer?.requested !== 'webgl2' || receipt.renderer.actual !== 'webgl2'
    || receipt.renderer.softwareAdapter !== false || receipt.adapterLabel?.length < 1
    || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu.test(receipt.adapterLabel)) {
    throw new Error('HF-297 hardware WebGL2 identity is invalid');
  }
  if (!sameJson(receipt.coverage?.viewports, PASS71_HF297_VIEWPORTS)
    || !sameJson(receipt.coverage?.actions, PASS71_HF297_VISUAL_ACTIONS)
    || receipt.coverage?.frameCount !== 36) throw new Error('HF-297 visual coverage matrix is invalid');
  if (!Array.isArray(receipt.frames) || receipt.frames.length !== 36) throw new Error('HF-297 visual frames are incomplete');
  let frameIndex = 0;
  for (const viewport of PASS71_HF297_VIEWPORTS) {
    for (const action of PASS71_HF297_VISUAL_ACTIONS) {
      const frame = receipt.frames[frameIndex++];
      const expectedId = `${viewport.id}/${action.id}`;
      const expectedPath = `artifacts/pass71/hf297-arms-evidence/visual-source/${viewport.id}-${action.id}.png`;
      const absolutePath = resolve(root, expectedPath);
      if (frame?.id !== expectedId || !sameJson(frame.viewport, viewport)
        || frame.weapon !== action.weapon || frame.action !== action.action
        || frame.image?.path !== expectedPath || frame.image.mimeType !== 'image/png'
        || frame.image.encoding !== 'lossless-png' || !existsSync(absolutePath)) {
        throw new Error(`HF-297 visual frame ${expectedId} is missing or misidentified`);
      }
      const metadata = pngMetadata(absolutePath);
      if (metadata.sha256 !== frame.image.sha256 || metadata.byteLength !== frame.image.byteLength
        || metadata.width !== viewport.width || metadata.height !== viewport.height
        || frame.image.width !== viewport.width || frame.image.height !== viewport.height) {
        throw new Error(`HF-297 visual frame ${expectedId} bytes drifted`);
      }
    }
  }
  if (!Array.isArray(receipt.catalogTelemetry) || receipt.catalogTelemetry.length !== PASS71_HF297_WEAPONS.length
    || receipt.catalogTelemetry.some((entry, index) => entry?.weapon !== PASS71_HF297_WEAPONS[index]
      || !Array.isArray(entry.actions) || !sameJson(entry.actions.map((action) => action?.id), PASS71_HF297_CATALOG_ACTIONS))) {
    throw new Error('HF-297 all-weapon mechanical telemetry is incomplete');
  }
  if (!Array.isArray(receipt.faults) || receipt.faults.length !== 0) throw new Error('HF-297 browser faults are present');
}

async function buildReviewSheets(receipt) {
  const sheetRoot = resolve(artifactRoot, 'sheets');
  mkdirSync(sheetRoot, { recursive: true });
  const sheets = [];
  for (const viewport of PASS71_HF297_VIEWPORTS) {
    const frames = receipt.frames.filter((frame) => frame.viewport?.id === viewport.id);
    if (frames.length !== PASS71_HF297_VISUAL_ACTIONS.length) {
      throw new Error(`HF-297 ${viewport.id} review sheet has ${frames.length} source frames`);
    }
    const tiles = await Promise.all(frames.map(async (frame) => sharp(resolve(root, frame.image.path))
      .resize({ width: 320, height: 180, fit: 'contain', background: '#03090c', kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer()));
    const sheetPath = resolve(sheetRoot, `${viewport.id}.png`);
    await sharp({ create: { width: 960, height: 540, channels: 3, background: '#03090c' } })
      .composite(tiles.map((input, index) => ({
        input, left: (index % 3) * 320, top: Math.floor(index / 3) * 180,
      })))
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toFile(sheetPath);
    const sourceFrameDigestSha256 = sha256Bytes(Buffer.from(frames.map((frame) => (
      `${frame.id}\0${frame.image.path}\0${frame.image.sha256}\0${frame.image.byteLength}\0${frame.image.width}x${frame.image.height}\n`
    )).join(''), 'utf8'));
    sheets.push({
      viewportId: viewport.id,
      path: `artifacts/pass71/hf297-arms-evidence/sheets/${viewport.id}.png`,
      mimeType: 'image/png', encoding: 'lossless-png',
      layout: 'three-by-three-ordered-action-review', sourceFrameCount: frames.length,
      sourceFrameDigestSha256, ...pngMetadata(sheetPath),
    });
  }
  return sheets;
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-297 requires --expected-source-sha=<40 lowercase hex candidate A>');
}
if (args.machine && args.machine !== 'dave-gaming-pc') {
  throw new Error('HF-297 release evidence is scoped to --machine=dave-gaming-pc');
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-297 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-297 requires one completely clean candidate A (${expectedSourceSha})`);
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local'].filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-297 rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
const releasePass = releaseChannels?.experimental?.pass;
if (releasePass !== 'PASS 71' || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-297 requires the canonical Pass 71 staged channel');
}
const chromeExecutable = installedChrome();
if (!chromeExecutable) throw new Error('HF-297 requires installed Google Chrome');
const executableIdentity = readWindowsExecutableIdentity(chromeExecutable);
if (!/^\d+(?:\.\d+){3}$/u.test(executableIdentity.productVersion)
  || executableIdentity.signatureStatus !== 'Valid'
  || !/\bGoogle LLC\b/iu.test(executableIdentity.signerSubject)) {
  throw new Error(`HF-297 installed Chrome identity is invalid: ${executableIdentity.signatureStatus}`);
}

rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(componentRoot, { recursive: true });
const startedAt = new Date().toISOString();
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
runNode('HF-297 lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], inheritedEnvironment);
runNode('HF-297 installed-Chrome staged browser evidence', [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass71-hf297-arms-visual.spec.ts', '--project=chromium', '--workers=1', '--retries=0',
], {
  ...inheritedEnvironment,
  NODE_ENV: 'production', SOURCE_SHA: expectedSourceSha, RELEASE_PASS: releasePass,
  VITE_MATCH_BUILD_ID: expectedSourceSha, QA_PREVIEW_PORT: String(args['preview-port'] ?? '4567'),
  PASS71_HF297_ARMS_VISUAL: '1', PASS71_HF297_SOURCE_SHA: expectedSourceSha,
  PASS71_HF297_RELEASE_PASS: releasePass, PASS71_HF297_BROWSER_CHANNEL: 'chrome',
  PASS71_HF297_BROWSER_EXECUTABLE: chromeExecutable, PASS71_HF297_VISUAL_RECEIPT: rawReceiptPath,
});
if (!existsSync(rawReceiptPath)) throw new Error('HF-297 browser receipt was not emitted');
const rawReceiptBytes = readFileSync(rawReceiptPath);
const rawReceipt = JSON.parse(rawReceiptBytes.toString('utf8'));
validateRawReceipt(rawReceipt, expectedSourceSha, releasePass);
const visualSheets = await buildReviewSheets(rawReceipt);

const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-297 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
const tooling = pass71Hf297ToolingHashes(root);
const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
const rawReceiptIdentity = {
  receiptPath: 'artifacts/pass71/hf297-arms-evidence/components/browser-receipt.json',
  receiptSha256: sha256Bytes(rawReceiptBytes), receiptByteLength: rawReceiptBytes.length,
};
const record = {
  ...PASS71_HF297_ARMS_EVIDENCE,
  startedAt,
  completedAt: new Date().toISOString(),
  source: {
    expectedSourceSha, checkoutSourceSha, endingCheckoutSourceSha, sourceTreeSha,
    releasePass, cleanBefore: true, cleanAfter,
  },
  servedCandidate: rawReceipt.servedCandidate,
  environment: { machine: 'dave-gaming-pc', platform: process.platform, arch: process.arch },
  browser: {
    channel: 'chrome', installed: true, executableName: 'chrome.exe',
    executableSha256: sha256File(chromeExecutable), executableVersion: executableIdentity.productVersion,
    browserVersion: rawReceipt.browser.version, userAgent: rawReceipt.browser.userAgent,
    installScope: installScope(chromeExecutable), authenticodeStatus: executableIdentity.signatureStatus,
    authenticodeSigner: executableIdentity.signerSubject, adapterLabel: rawReceipt.adapterLabel,
    softwareAdapter: rawReceipt.renderer.softwareAdapter,
    isolation: 'one-installed-chrome-process-one-fresh-context',
  },
  tooling,
  coverage: PASS71_HF297_COVERAGE,
  components: [
    { id: 'viewport-action-visual-matrix', kind: 'visual', status: 'passed', matrixCellCount: 36, ...rawReceiptIdentity },
    { id: 'all-weapon-rig-anatomy-matrix', kind: 'telemetry', status: 'passed', matrixCellCount: 80, ...rawReceiptIdentity },
  ],
  visualFrames: rawReceipt.frames.map((frame) => ({
    id: frame.id, viewportId: frame.viewport.id, weapon: frame.weapon, action: frame.action,
    path: frame.image.path, mimeType: frame.image.mimeType, encoding: frame.image.encoding,
    sha256: frame.image.sha256, byteLength: frame.image.byteLength,
    width: frame.image.width, height: frame.image.height,
  })),
  visualSheets,
  catalogTelemetry: rawReceipt.catalogTelemetry,
  faults: [],
};
record.receiptSha256 = pass71Hf297RecordSha256(record);
assertPass71Hf297Evidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
const temporaryPath = `${receiptPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, receiptPath);
console.log(JSON.stringify({
  status: 'PASS', evidenceId: record.evidenceId, coverageDisposition: record.coverageDisposition,
  sourceSha: expectedSourceSha, stagedTreeSha256: record.servedCandidate.treeSha256,
  visualCellCount: 36, catalogCellCount: 80, visualSheetCount: visualSheets.length,
  receiptSha256: record.receiptSha256, receiptPath,
}, null, 2));
