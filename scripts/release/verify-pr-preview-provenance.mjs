#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { validateAcceptanceManifest } from './acceptance-gate.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const DEFAULT_MANIFEST_PATH = 'acceptance/pass-69.json';
const DEFAULT_OUTPUT_PATH = 'artifacts/pipeline/pass69-preview-provenance.json';
const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARTIFACT_RESULTS = 1000;
const MAX_WORKFLOW_JOBS = 1000;
const MAX_JOB_LOG_BYTES = 16 * 1024 * 1024;
const PREVIEW_REF = /^pr-preview-([1-9][0-9]*)-([0-9a-f]{40})$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const textDecoder = new TextDecoder('utf-8', { fatal: true });
export const PASS71_CANDIDATE_A_REQUIRED_SUCCESS_JOBS = Object.freeze([
  'classify-change',
  'static-and-unit (ubuntu-latest)',
  'static-and-unit (windows-latest)',
  'bounded-browser-linux',
  'bounded-browser-windows',
  'bounded-browser-windows-supplemental-shard (pass71-grenade-first-action)',
  'bounded-browser-windows-supplemental-shard (pass70-chopper-gunner)',
  'bounded-browser-windows-supplemental',
  'bounded-browser-linux-supplemental-shard (pass71-glass-quality-bullet)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-quality-knife)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-quality-grenade)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-quality-flare)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-quality-crossbow)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-performance-bullet)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-performance-knife)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-performance-grenade)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-performance-flare)',
  'bounded-browser-linux-supplemental-shard (pass71-glass-performance-crossbow)',
  'bounded-browser-linux-supplemental-shard (pass71-nuke-warning)',
  'bounded-browser-linux-supplemental',
  'pipeline-metrics',
]);
const PASS71_REQUIREMENTS_JOB = 'requirements-acceptance';
const PASS71_ACCEPTANCE_STEP = 'Verify complete requirement-to-evidence coverage and exact preview approval';
const PASS71_MISSING_MANIFEST_ERROR = 'runtime/release-shell or acceptance-finalizer changes must add or update exactly one enforced pass manifest; found 0';

class ProvenanceError extends Error {
  constructor(message, kind = 'invalid') {
    super(message);
    this.name = 'ProvenanceError';
    this.kind = kind;
  }
}

function invariant(condition, message, kind = 'invalid') {
  if (!condition) throw new ProvenanceError(message, kind);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!['manifest', 'output', 'repository', 'api-base'].includes(name)) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
    values[name] = value;
    index += 1;
  }
  return values;
}

function isIsoUtc(value) {
  return typeof value === 'string' && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeJson(bytes, label) {
  try {
    return JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new ProvenanceError(`${label} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function computePreviewTree(files) {
  invariant(Array.isArray(files) && files.length > 0, 'preview dist must contain at least one file');
  const seen = new Set();
  const entries = files.map((file, index) => {
    invariant(isObject(file), `dist file ${index} must be an object`);
    const path = file.path;
    invariant(typeof path === 'string' && path.length > 0, `dist file ${index} needs a path`);
    invariant(!seen.has(path), `duplicate dist path: ${path}`);
    seen.add(path);
    invariant(file.bytes instanceof Uint8Array, `dist file ${path} needs byte content`);
    return { path, sha256: sha256(file.bytes) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  return {
    fileCount: entries.length,
    treeSha256: sha256(Buffer.from(JSON.stringify(entries), 'utf8')),
    entries,
  };
}

export function parsePreviewManifest(manifest) {
  invariant(isObject(manifest), 'acceptance manifest must be an object');
  invariant(manifest.schemaVersion === 1, 'acceptance manifest schemaVersion must be 1');
  invariant(/^PASS [1-9][0-9]*$/.test(manifest.releasePass ?? ''), 'preview provenance manifest releasePass must look like PASS <number>');
  invariant(manifest.status === 'accepted', 'acceptance manifest status must be accepted');
  invariant(isObject(manifest.preview), 'acceptance manifest preview must be an object');
  invariant(manifest.preview.kind === 'github-actions-artifact', 'preview must be a GitHub Actions artifact');
  const match = PREVIEW_REF.exec(manifest.preview.ref ?? '');
  invariant(match, 'preview.ref must be exactly pr-preview-<positive-pr>-<40-lowercase-sha>');
  const pullRequest = Number(match[1]);
  const sourceSha = match[2];
  invariant(Number.isSafeInteger(pullRequest) && pullRequest > 0, 'preview pull request number is invalid');
  invariant(manifest.preview.sourceSha === sourceSha, 'preview.sourceSha must exactly match preview.ref');
  invariant(isIsoUtc(manifest.preview.createdAt), 'preview.createdAt must be an ISO UTC timestamp');
  return {
    artifactName: manifest.preview.ref,
    sourceSha,
    pullRequest,
    createdAt: manifest.preview.createdAt,
  };
}

function decodeZipName(bytes, utf8) {
  if (!utf8) {
    invariant(bytes.every((value) => value <= 0x7f), 'ZIP entry name is non-ASCII without the UTF-8 flag');
    return Buffer.from(bytes).toString('ascii');
  }
  try {
    return textDecoder.decode(bytes);
  } catch (error) {
    throw new ProvenanceError(`ZIP entry name is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function safeArchivePath(name) {
  invariant(name.length > 0, 'ZIP entry has an empty path');
  invariant(!name.includes('\0'), 'ZIP entry path contains NUL');
  invariant(!name.includes('\\'), `ZIP entry path uses backslashes: ${name}`);
  invariant(!name.startsWith('/') && !/^[A-Za-z]:/.test(name), `ZIP entry path is absolute: ${name}`);
  const directory = name.endsWith('/');
  const segments = name.split('/');
  if (directory) segments.pop();
  invariant(segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    `ZIP entry path is unsafe: ${name}`);
  const canonical = segments.map((segment) => segment.normalize('NFC')).join('/');
  return { name, canonical, directory };
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(zip) {
  const minimum = 22;
  invariant(zip.length >= minimum, 'artifact ZIP is too small');
  const lower = Math.max(0, zip.length - minimum - 0xffff);
  for (let offset = zip.length - minimum; offset >= lower; offset -= 1) {
    if (zip.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = zip.readUInt16LE(offset + 20);
    if (offset + minimum + commentLength === zip.length) return offset;
  }
  throw new ProvenanceError('artifact ZIP has no terminal end-of-central-directory record');
}

function readZipEntries(zipBytes, maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES) {
  const zip = Buffer.from(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const eocd = findEndOfCentralDirectory(zip);
  const disk = zip.readUInt16LE(eocd + 4);
  const centralDisk = zip.readUInt16LE(eocd + 6);
  const entriesOnDisk = zip.readUInt16LE(eocd + 8);
  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  invariant(disk === 0 && centralDisk === 0 && entriesOnDisk === entryCount, 'multi-disk ZIP artifacts are forbidden');
  invariant(entryCount !== 0xffff && centralSize !== 0xffffffff && centralOffset !== 0xffffffff,
    'ZIP64 artifacts are not supported by the preview verifier');
  invariant(entryCount > 0, 'artifact ZIP contains no entries');
  invariant(centralOffset + centralSize === eocd, 'artifact ZIP central-directory bounds are inconsistent');

  const metadata = [];
  const rawNames = new Set();
  const canonicalNames = new Set();
  let cursor = centralOffset;
  let declaredUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    invariant(cursor + 46 <= eocd && zip.readUInt32LE(cursor) === 0x02014b50,
      `artifact ZIP central entry ${index} is malformed`);
    const madeBy = zip.readUInt16LE(cursor + 4);
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const expectedCrc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const startDisk = zip.readUInt16LE(cursor + 34);
    const externalAttributes = zip.readUInt32LE(cursor + 38);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    invariant(end <= eocd, `artifact ZIP central entry ${index} exceeds the central directory`);
    invariant(startDisk === 0, 'multi-disk ZIP entry is forbidden');
    invariant(compressedSize !== 0xffffffff && uncompressedSize !== 0xffffffff && localOffset !== 0xffffffff,
      'ZIP64 entry is not supported');
    invariant((flags & 0x0001) === 0 && (flags & 0x0040) === 0, 'encrypted ZIP entries are forbidden');
    invariant(method === 0 || method === 8, `unsupported ZIP compression method ${method}`);
    const rawName = zip.subarray(cursor + 46, cursor + 46 + nameLength);
    const decodedName = decodeZipName(rawName, (flags & 0x0800) !== 0);
    const path = safeArchivePath(decodedName);
    invariant(!rawNames.has(path.name), `duplicate ZIP entry path: ${path.name}`);
    invariant(!canonicalNames.has(path.canonical), `duplicate canonical ZIP entry path: ${path.name}`);
    rawNames.add(path.name);
    canonicalNames.add(path.canonical);

    const unixMode = (madeBy >>> 8) === 3 ? (externalAttributes >>> 16) & 0xffff : 0;
    const unixType = unixMode & 0o170000;
    invariant(unixType !== 0o120000, `symbolic-link ZIP entry is forbidden: ${path.name}`);
    if (path.directory) {
      invariant(uncompressedSize === 0 && compressedSize === 0, `ZIP directory contains data: ${path.name}`);
    } else {
      invariant(unixType === 0 || unixType === 0o100000, `non-regular ZIP entry is forbidden: ${path.name}`);
    }
    declaredUncompressed += uncompressedSize;
    invariant(Number.isSafeInteger(declaredUncompressed) && declaredUncompressed <= maxUncompressedBytes,
      'artifact ZIP uncompressed size exceeds the verifier limit');
    metadata.push({
      flags, method, expectedCrc, compressedSize, uncompressedSize, localOffset, rawName, path,
    });
    cursor = end;
  }
  invariant(cursor === eocd, 'artifact ZIP central-directory size does not match its entries');

  const spans = [];
  const entries = [];
  for (const entry of metadata) {
    const { localOffset } = entry;
    invariant(localOffset + 30 <= centralOffset && zip.readUInt32LE(localOffset) === 0x04034b50,
      `ZIP local header is malformed: ${entry.path.name}`);
    const localFlags = zip.readUInt16LE(localOffset + 6);
    const localMethod = zip.readUInt16LE(localOffset + 8);
    const localCrc = zip.readUInt32LE(localOffset + 14);
    const localCompressedSize = zip.readUInt32LE(localOffset + 18);
    const localUncompressedSize = zip.readUInt32LE(localOffset + 22);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    invariant(dataEnd <= centralOffset, `ZIP entry data exceeds its local section: ${entry.path.name}`);
    invariant(localFlags === entry.flags && localMethod === entry.method,
      `ZIP local/central flags differ: ${entry.path.name}`);
    invariant(zip.subarray(localNameStart, localNameStart + localNameLength).equals(entry.rawName),
      `ZIP local/central names differ: ${entry.path.name}`);
    if ((entry.flags & 0x0008) === 0) {
      invariant(localCrc === entry.expectedCrc
        && localCompressedSize === entry.compressedSize
        && localUncompressedSize === entry.uncompressedSize,
      `ZIP local/central sizes or CRC differ: ${entry.path.name}`);
    }
    const compressed = zip.subarray(dataStart, dataEnd);
    let bytes;
    try {
      bytes = entry.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize + 1 });
    } catch (error) {
      throw new ProvenanceError(`ZIP entry decompression failed for ${entry.path.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    invariant(bytes.length === entry.uncompressedSize, `ZIP entry size mismatch: ${entry.path.name}`);
    invariant(crc32(bytes) === entry.expectedCrc, `ZIP entry CRC mismatch: ${entry.path.name}`);
    spans.push({ start: localOffset, end: dataEnd, path: entry.path.name });
    entries.push({ ...entry.path, bytes });
  }
  spans.sort((left, right) => left.start - right.start);
  for (let index = 1; index < spans.length; index += 1) {
    invariant(spans[index].start >= spans[index - 1].end,
      `overlapping ZIP local entries: ${spans[index - 1].path} and ${spans[index].path}`);
  }
  return entries;
}

function verifyEmbeddedReceipt(receipt, identity, tree) {
  invariant(isObject(receipt), 'embedded preview receipt must be an object');
  invariant(receipt.schemaVersion === 1, 'embedded preview receipt schemaVersion must be 1');
  invariant(receipt.sourceSha === identity.sourceSha, 'embedded preview receipt sourceSha does not match the manifest');
  invariant(receipt.pullRequest === identity.pullRequest, 'embedded preview receipt pullRequest does not match the manifest');
  invariant(receipt.artifactName === identity.artifactName, 'embedded preview receipt artifactName does not match the manifest');
  invariant(receipt.createdAt === identity.createdAt && isIsoUtc(receipt.createdAt),
    'embedded preview receipt createdAt does not exactly match the manifest');
  invariant(Number.isSafeInteger(receipt.fileCount) && receipt.fileCount > 0,
    'embedded preview receipt fileCount is invalid');
  invariant(SHA256.test(receipt.treeSha256 ?? ''), 'embedded preview receipt treeSha256 is invalid');
  invariant(receipt.fileCount === tree.fileCount,
    `embedded preview receipt fileCount ${receipt.fileCount} does not match recomputed ${tree.fileCount}`);
  invariant(receipt.treeSha256 === tree.treeSha256,
    `embedded preview receipt treeSha256 ${receipt.treeSha256} does not match recomputed ${tree.treeSha256}`);
}

export function inspectPreviewArtifactZip(zipBytes, identity, options = {}) {
  invariant(zipBytes instanceof Uint8Array, 'artifact ZIP must be bytes');
  const entries = readZipEntries(zipBytes, options.maxUncompressedBytes);
  let receiptBytes = null;
  const distFiles = [];
  for (const entry of entries) {
    if (entry.directory) {
      invariant(entry.canonical === 'dist' || entry.canonical.startsWith('dist/')
        || entry.canonical === 'artifacts' || entry.canonical === 'artifacts/pipeline'
        || entry.canonical === 'acceptance',
      `unexpected directory in preview artifact: ${entry.name}`);
      continue;
    }
    if (entry.name === 'artifacts/pipeline/pr-preview.json') {
      invariant(receiptBytes === null, 'preview artifact contains duplicate embedded receipts');
      receiptBytes = entry.bytes;
      continue;
    }
    if (entry.name.startsWith('dist/')) {
      const path = entry.name.slice('dist/'.length);
      invariant(path.length > 0, 'preview artifact contains a file at the dist directory path');
      distFiles.push({ path, bytes: entry.bytes });
      continue;
    }
    if (/^acceptance\/pass-[1-9][0-9]*\.json$/.test(entry.name)) continue;
    throw new ProvenanceError(`unexpected file in preview artifact: ${entry.name}`);
  }
  invariant(receiptBytes !== null, 'preview artifact is missing artifacts/pipeline/pr-preview.json');
  invariant(receiptBytes.length <= 1024 * 1024, 'embedded preview receipt is unexpectedly large');
  const tree = computePreviewTree(distFiles);
  const receipt = safeJson(receiptBytes, 'embedded preview receipt');
  verifyEmbeddedReceipt(receipt, identity, tree);
  return { receipt, ...tree };
}

export function inspectPass71CandidateAAcceptanceArtifactZip(zipBytes) {
  invariant(zipBytes instanceof Uint8Array, 'candidate A acceptance artifact ZIP must be bytes');
  const entries = readZipEntries(zipBytes, 1024 * 1024).filter((entry) => !entry.directory);
  invariant(entries.length === 1 && entries[0].canonical === 'acceptance-coverage.json',
    'candidate A acceptance artifact must contain only acceptance-coverage.json');
  invariant(entries[0].bytes.length <= 1024 * 1024,
    'candidate A acceptance coverage receipt is unexpectedly large');
  const receipt = safeJson(entries[0].bytes, 'candidate A acceptance coverage receipt');
  invariant(isObject(receipt), 'candidate A acceptance coverage receipt must be an object');
  invariant(JSON.stringify(Object.keys(receipt).sort())
    === JSON.stringify(['errors', 'impact', 'ok', 'phase', 'schemaVersion'].sort()),
  'candidate A acceptance coverage receipt has unexpected schema fields');
  invariant(receipt.schemaVersion === 1 && receipt.ok === false
    && receipt.phase === 'ci' && receipt.impact === 'full',
  'candidate A acceptance coverage receipt has the wrong identity or status');
  invariant(Array.isArray(receipt.errors) && receipt.errors.length === 1
    && receipt.errors[0] === PASS71_MISSING_MANIFEST_ERROR,
  'candidate A acceptance coverage receipt errors must contain only the canonical missing-manifest failure');
  return receipt;
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'atomic-acres-pass66-preview-provenance',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function validateRepository(repository) {
  invariant(typeof repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository),
    'GITHUB_REPOSITORY must be owner/repository');
  return repository;
}

function apiRoot(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProvenanceError('GitHub API base must be an absolute URL');
  }
  invariant(url.protocol === 'https:', 'GitHub API base must use HTTPS');
  invariant(!url.username && !url.password && !url.search && !url.hash, 'GitHub API base cannot contain credentials, query, or fragment');
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
  return url;
}

function apiPathPrefix(apiBase) {
  return apiBase.pathname === '/' ? '' : apiBase.pathname;
}

async function responseJson(response, label) {
  invariant(response.ok, `${label} failed with HTTP ${response.status}`, response.status >= 500 || response.status === 429 ? 'inconclusive' : 'invalid');
  let value;
  try {
    value = await response.json();
  } catch (error) {
    throw new ProvenanceError(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return value;
}

async function listExactArtifacts({ fetchImpl, apiBase, repository, token, artifactName }) {
  const artifacts = [];
  const ids = new Set();
  let expectedTotal = null;
  for (let page = 1; page <= Math.ceil(MAX_ARTIFACT_RESULTS / 100); page += 1) {
    const url = new URL(`${apiPathPrefix(apiBase)}/repos/${repository}/actions/artifacts`, apiBase.origin);
    url.searchParams.set('name', artifactName);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    let response;
    try {
      response = await fetchImpl(url, { headers: githubHeaders(token), redirect: 'error' });
    } catch (error) {
      throw new ProvenanceError(`GitHub artifact listing failed: ${error instanceof Error ? error.message : String(error)}`, 'inconclusive');
    }
    const body = await responseJson(response, 'GitHub artifact listing');
    invariant(isObject(body) && Number.isSafeInteger(body.total_count) && body.total_count >= 0 && Array.isArray(body.artifacts),
      'GitHub artifact listing response has an invalid shape');
    if (expectedTotal === null) expectedTotal = body.total_count;
    invariant(body.total_count === expectedTotal, 'GitHub artifact listing changed while it was paginated', 'inconclusive');
    invariant(expectedTotal <= MAX_ARTIFACT_RESULTS, `too many exact-name artifacts (${expectedTotal})`);
    for (const artifact of body.artifacts) {
      invariant(isObject(artifact), 'GitHub artifact metadata entry is invalid');
      invariant(artifact.name === artifactName, `GitHub name filter returned a non-exact artifact: ${artifact.name}`);
      invariant(Number.isSafeInteger(artifact.id) && artifact.id > 0, 'GitHub artifact id is invalid');
      invariant(!ids.has(artifact.id), `GitHub artifact listing repeated id ${artifact.id}`);
      ids.add(artifact.id);
      artifacts.push(artifact);
    }
    if (artifacts.length >= expectedTotal) break;
    invariant(body.artifacts.length > 0, 'GitHub artifact listing ended before total_count was reached', 'inconclusive');
  }
  invariant(artifacts.length === expectedTotal,
    `GitHub artifact listing returned ${artifacts.length} of ${expectedTotal} exact-name artifacts`, 'inconclusive');
  return artifacts;
}

async function readWorkflowRun({ fetchImpl, apiBase, repository, token, runId }) {
  const url = new URL(`${apiPathPrefix(apiBase)}/repos/${repository}/actions/runs/${runId}`, apiBase.origin);
  let response;
  try {
    response = await fetchImpl(url, { headers: githubHeaders(token), redirect: 'error' });
  } catch (error) {
    throw new ProvenanceError(`GitHub workflow run ${runId} lookup failed: ${error instanceof Error ? error.message : String(error)}`, 'inconclusive');
  }
  const run = await responseJson(response, `GitHub workflow run ${runId} lookup`);
  invariant(isObject(run), `GitHub workflow run ${runId} response has an invalid shape`);
  invariant(run.id === runId, `GitHub workflow run ${runId} response has the wrong id`);
  invariant(run.path === '.github/workflows/verify.yml',
    `GitHub workflow run ${runId} did not use .github/workflows/verify.yml`);
  invariant(run.event === 'pull_request', `GitHub workflow run ${runId} was not a pull_request event`);
  return run;
}

async function readWorkflowJobs({ fetchImpl, apiBase, repository, token, runId }) {
  const jobs = [];
  let expectedTotal = null;
  for (let page = 1; page <= Math.ceil(MAX_WORKFLOW_JOBS / 100); page += 1) {
    const url = new URL(`${apiPathPrefix(apiBase)}/repos/${repository}/actions/runs/${runId}/jobs`, apiBase.origin);
    url.searchParams.set('filter', 'all');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    let response;
    try {
      response = await fetchImpl(url, { headers: githubHeaders(token), redirect: 'error' });
    } catch (error) {
      throw new ProvenanceError(`GitHub workflow run ${runId} jobs lookup failed: ${error instanceof Error ? error.message : String(error)}`, 'inconclusive');
    }
    const body = await responseJson(response, `GitHub workflow run ${runId} jobs lookup`);
    invariant(isObject(body) && Number.isSafeInteger(body.total_count) && body.total_count >= 0 && Array.isArray(body.jobs),
      `GitHub workflow run ${runId} jobs response has an invalid shape`);
    if (expectedTotal === null) expectedTotal = body.total_count;
    invariant(body.total_count === expectedTotal, `GitHub workflow run ${runId} jobs changed while paginated`, 'inconclusive');
    invariant(expectedTotal <= MAX_WORKFLOW_JOBS, `candidate A workflow has too many jobs (${expectedTotal})`);
    jobs.push(...body.jobs);
    if (jobs.length >= expectedTotal) break;
    invariant(body.jobs.length > 0, `GitHub workflow run ${runId} jobs ended before total_count`, 'inconclusive');
  }
  invariant(jobs.length === expectedTotal,
    `GitHub workflow run ${runId} returned ${jobs.length} of ${expectedTotal} jobs`, 'inconclusive');
  return jobs;
}

function verifyWorkflowRun(run, artifact, identity, repository) {
  invariant(run.head_sha === identity.sourceSha,
    `GitHub workflow run ${run.id} head_sha does not match the preview source SHA`);
  const repositoryName = run.repository?.full_name;
  const headRepositoryName = run.head_repository?.full_name;
  if (repositoryName !== undefined || headRepositoryName !== undefined) {
    invariant(typeof repositoryName === 'string' && typeof headRepositoryName === 'string'
      && repositoryName.toLowerCase() === repository.toLowerCase()
      && headRepositoryName.toLowerCase() === repository.toLowerCase(),
    `GitHub workflow run ${run.id} repository identity does not match ${repository}`);
  }
  invariant(run.id === artifact.workflow_run.id, `GitHub workflow run identity changed for artifact ${artifact.id}`);
}

export function validatePass71CandidateAWorkflowJobs(jobs) {
  invariant(Array.isArray(jobs) && jobs.length > 0, 'candidate A workflow has no jobs');
  const byName = new Map();
  for (const [index, job] of jobs.entries()) {
    invariant(isObject(job) && Number.isSafeInteger(job.id) && job.id > 0,
      `candidate A workflow job ${index} has invalid identity`);
    invariant(job.run_attempt === 1,
      `candidate A workflow job ${job.name ?? index} is not from required attempt 1`);
    invariant(typeof job.name === 'string' && job.name.length > 0,
      `candidate A workflow job ${index} has no name`);
    invariant(!byName.has(job.name), `candidate A workflow repeated job name: ${job.name}`);
    byName.set(job.name, job);
  }
  for (const name of PASS71_CANDIDATE_A_REQUIRED_SUCCESS_JOBS) {
    const job = byName.get(name);
    invariant(job, `candidate A workflow is missing required job: ${name}`);
    invariant(job.status === 'completed' && job.conclusion === 'success',
      `candidate A required job is not green: ${name}=${job.conclusion ?? job.status ?? 'unknown'}`);
  }
  const requirements = byName.get(PASS71_REQUIREMENTS_JOB);
  invariant(requirements, `candidate A workflow is missing required job: ${PASS71_REQUIREMENTS_JOB}`);
  invariant(requirements.status === 'completed' && requirements.conclusion === 'failure',
    `candidate A ${PASS71_REQUIREMENTS_JOB} must fail solely for the absent finalizer manifest`);
  for (const job of jobs) {
    if (job.name === PASS71_REQUIREMENTS_JOB) continue;
    invariant(job.status === 'completed' && job.conclusion === 'success',
      `candidate A has an additional non-green job: ${job.name}=${job.conclusion ?? job.status ?? 'unknown'}`);
  }
  invariant(Array.isArray(requirements.steps), `candidate A ${PASS71_REQUIREMENTS_JOB} has no step conclusions`);
  const failedSteps = requirements.steps.filter((step) => step?.conclusion === 'failure');
  invariant(failedSteps.length === 1 && failedSteps[0]?.name === PASS71_ACCEPTANCE_STEP,
    `candidate A ${PASS71_REQUIREMENTS_JOB} did not fail solely in the acceptance-manifest step`);
  invariant(requirements.steps.every((step) => !['cancelled', 'timed_out'].includes(step?.conclusion)),
    `candidate A ${PASS71_REQUIREMENTS_JOB} has a cancelled or timed-out step`);
  return requirements;
}

export function validatePass71MissingManifestLog(log) {
  invariant(typeof log === 'string', `candidate A ${PASS71_REQUIREMENTS_JOB} log is not text`);
  const matches = log.split(PASS71_MISSING_MANIFEST_ERROR).length - 1;
  invariant(matches === 1,
    `candidate A ${PASS71_REQUIREMENTS_JOB} log does not contain exactly one canonical missing-manifest failure`);
  return true;
}

function validArtifactMetadata(artifact, identity, nowMs) {
  const errors = [];
  if (artifact.expired !== false) errors.push('artifact is marked expired');
  if (!isIsoUtc(artifact.created_at)) errors.push('artifact created_at is invalid');
  if (!isIsoUtc(artifact.expires_at) || Date.parse(artifact.expires_at) <= nowMs) errors.push('artifact expires_at is not in the future');
  if (!isObject(artifact.workflow_run) || artifact.workflow_run.head_sha !== identity.sourceSha) {
    errors.push('workflow_run.head_sha does not match the preview source SHA');
  }
  if (!Number.isSafeInteger(artifact.workflow_run?.id) || artifact.workflow_run.id <= 0) errors.push('workflow_run.id is invalid');
  if (artifact.workflow_run?.head_repository_id !== undefined || artifact.workflow_run?.repository_id !== undefined) {
    if (!Number.isSafeInteger(artifact.workflow_run?.head_repository_id)
      || !Number.isSafeInteger(artifact.workflow_run?.repository_id)
      || artifact.workflow_run.head_repository_id !== artifact.workflow_run.repository_id) {
      errors.push('workflow_run head repository does not match the workflow repository');
    }
  }
  if (artifact.digest !== undefined && artifact.digest !== null && !/^sha256:[0-9a-f]{64}$/.test(artifact.digest)) {
    errors.push('artifact digest is malformed');
  }
  if (typeof artifact.archive_download_url !== 'string' || artifact.archive_download_url.length === 0) {
    errors.push('archive_download_url is missing');
  }
  return errors;
}

function allowedArtifactDownloadUrl(value, apiBase, repository, artifactId) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProvenanceError(`artifact ${artifactId} archive_download_url is invalid`);
  }
  invariant(url.protocol === 'https:' && url.origin === apiBase.origin,
    `artifact ${artifactId} archive_download_url is outside the GitHub API origin`);
  const expected = `${apiPathPrefix(apiBase)}/repos/${repository}/actions/artifacts/${artifactId}/zip`.replace(/\/+/g, '/');
  invariant(url.pathname === expected && !url.username && !url.password && !url.search && !url.hash,
    `artifact ${artifactId} archive_download_url has an unexpected path`);
  return url;
}

async function readResponseBytes(response, maxBytes, label) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared)) invariant(declared >= 0 && declared <= maxBytes, `${label} exceeds the archive byte limit`);
  invariant(response.body, `${label} has no response body`, 'inconclusive');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ProvenanceError(`${label} exceeds the archive byte limit`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function downloadArtifact({ fetchImpl, apiBase, repository, token, artifact, maxArchiveBytes }) {
  let url = allowedArtifactDownloadUrl(artifact.archive_download_url, apiBase, repository, artifact.id);
  let sendAuthorization = true;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: sendAuthorization ? githubHeaders(token) : { Accept: 'application/zip' },
        redirect: 'manual',
      });
    } catch (error) {
      throw new ProvenanceError(`artifact ${artifact.id} download failed: ${error instanceof Error ? error.message : String(error)}`, 'inconclusive');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      invariant(redirect < 5, `artifact ${artifact.id} download redirected too many times`, 'inconclusive');
      const location = response.headers.get('location');
      invariant(location, `artifact ${artifact.id} redirect omitted Location`, 'inconclusive');
      const next = new URL(location, url);
      invariant(next.protocol === 'https:' && !next.username && !next.password,
        `artifact ${artifact.id} redirect is not a credential-free HTTPS URL`);
      sendAuthorization = next.origin === apiBase.origin
        && next.pathname.startsWith(`${apiPathPrefix(apiBase)}/repos/${repository}/actions/artifacts/`.replace(/\/+/g, '/'));
      url = next;
      continue;
    }
    invariant(response.ok, `artifact ${artifact.id} download failed with HTTP ${response.status}`,
      response.status >= 500 || response.status === 429 ? 'inconclusive' : 'invalid');
    return readResponseBytes(response, maxArchiveBytes, `artifact ${artifact.id} archive`);
  }
  throw new ProvenanceError(`artifact ${artifact.id} download did not terminate`, 'inconclusive');
}

async function downloadJobLog({ fetchImpl, apiBase, repository, token, jobId }) {
  let url = new URL(`${apiPathPrefix(apiBase)}/repos/${repository}/actions/jobs/${jobId}/logs`, apiBase.origin);
  let sendAuthorization = true;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: sendAuthorization ? githubHeaders(token) : { Accept: 'text/plain' },
        redirect: 'manual',
      });
    } catch (error) {
      throw new ProvenanceError(`candidate A requirements log download failed: ${error instanceof Error ? error.message : String(error)}`, 'inconclusive');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      invariant(redirect < 5, 'candidate A requirements log redirected too many times', 'inconclusive');
      const location = response.headers.get('location');
      invariant(location, 'candidate A requirements log redirect omitted Location', 'inconclusive');
      const next = new URL(location, url);
      invariant(next.protocol === 'https:' && !next.username && !next.password,
        'candidate A requirements log redirect is not credential-free HTTPS');
      sendAuthorization = next.origin === apiBase.origin
        && next.pathname === `${apiPathPrefix(apiBase)}/repos/${repository}/actions/jobs/${jobId}/logs`.replace(/\/+/g, '/');
      url = next;
      continue;
    }
    invariant(response.ok, `candidate A requirements log download failed with HTTP ${response.status}`,
      response.status >= 500 || response.status === 429 ? 'inconclusive' : 'invalid');
    const bytes = await readResponseBytes(response, MAX_JOB_LOG_BYTES, 'candidate A requirements log');
    try {
      return textDecoder.decode(bytes);
    } catch (error) {
      throw new ProvenanceError(`candidate A requirements log is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new ProvenanceError('candidate A requirements log download did not terminate', 'inconclusive');
}

async function verifyPass71CandidateAAcceptanceArtifact({
  fetchImpl, apiBase, repository, token, identity, workflowRunId, nowMs,
}) {
  const artifactName = `acceptance-coverage-${identity.sourceSha}`;
  const listed = await listExactArtifacts({ fetchImpl, apiBase, repository, token, artifactName });
  invariant(listed.length === 1,
    `Pass 71 candidate A must have exactly one acceptance artifact named ${artifactName}; found ${listed.length}`);
  const artifact = listed[0];
  const metadataErrors = validArtifactMetadata(artifact, identity, nowMs);
  invariant(metadataErrors.length === 0,
    `candidate A acceptance artifact metadata is invalid: ${metadataErrors.join('; ')}`);
  invariant(artifact.workflow_run.id === workflowRunId,
    `candidate A acceptance artifact belongs to workflow run ${artifact.workflow_run.id}, expected ${workflowRunId}`);
  invariant(typeof artifact.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(artifact.digest),
    'candidate A acceptance artifact is missing its GitHub SHA-256 digest');
  const archive = await downloadArtifact({
    fetchImpl, apiBase, repository, token, artifact, maxArchiveBytes: 8 * 1024 * 1024,
  });
  const archiveSha256 = sha256(archive);
  invariant(artifact.digest === `sha256:${archiveSha256}`,
    'candidate A acceptance artifact GitHub digest does not match the downloaded ZIP');
  const receipt = inspectPass71CandidateAAcceptanceArtifactZip(archive);
  return {
    artifactId: artifact.id,
    artifactName,
    archiveSha256,
    receipt,
  };
}

function artifactSummary(artifact, errors) {
  return {
    id: artifact.id,
    createdAt: artifact.created_at ?? null,
    expiresAt: artifact.expires_at ?? null,
    workflowHeadSha: artifact.workflow_run?.head_sha ?? null,
    errors,
  };
}

export async function verifyPreviewProvenance(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const absoluteManifest = isAbsolute(manifestPath) ? resolve(manifestPath) : resolve(repositoryRoot, manifestPath);
  const manifestRelative = relative(repositoryRoot, absoluteManifest);
  invariant(!isAbsolute(manifestRelative) && manifestRelative !== '..'
    && !manifestRelative.startsWith('../') && !manifestRelative.startsWith('..\\'),
    'manifest path must stay inside the repository');
  let manifest = options.manifest;
  if (manifest === undefined) {
    let bytes;
    try {
      bytes = readFileSync(absoluteManifest);
    } catch (error) {
      throw new ProvenanceError(`cannot read ${relative(repositoryRoot, absoluteManifest)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    manifest = safeJson(bytes, relative(repositoryRoot, absoluteManifest));
  }
  const acceptance = validateAcceptanceManifest(manifest);
  invariant(acceptance.ok,
    `acceptance manifest is invalid: ${acceptance.errors.join('; ')}`);
  const identity = parsePreviewManifest(manifest);
  const requirePass71CandidateAWorkflow = manifest.releasePass === 'PASS 71';
  const repository = validateRepository(options.repository ?? process.env.GITHUB_REPOSITORY);
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  invariant(typeof token === 'string' && token.length > 0 && !/[\r\n]/.test(token),
    'GITHUB_TOKEN or GH_TOKEN is required');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  invariant(typeof fetchImpl === 'function', 'global fetch is unavailable');
  const apiBase = apiRoot(options.apiBase ?? process.env.GITHUB_API_URL ?? DEFAULT_API_BASE);
  const nowMs = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now());
  invariant(Number.isFinite(nowMs), 'verification clock is invalid');
  const maxArchiveBytes = options.maxArchiveBytes ?? DEFAULT_MAX_ARCHIVE_BYTES;
  invariant(Number.isSafeInteger(maxArchiveBytes) && maxArchiveBytes > 0, 'maxArchiveBytes must be a positive integer');

  const listed = await listExactArtifacts({ fetchImpl, apiBase, repository, token, artifactName: identity.artifactName });
  invariant(listed.length > 0, `GitHub has no artifact named ${identity.artifactName}`);
  if (requirePass71CandidateAWorkflow) {
    invariant(listed.length === 1,
      `Pass 71 candidate A must have exactly one preview artifact named ${identity.artifactName}; found ${listed.length}`);
  }
  const metadataRejected = [];
  const candidates = [];
  for (const artifact of listed) {
    const errors = validArtifactMetadata(artifact, identity, nowMs);
    if (errors.length > 0) metadataRejected.push(artifactSummary(artifact, errors));
    else candidates.push(artifact);
  }
  invariant(candidates.length > 0,
    `no nonexpired ${identity.artifactName} artifact has workflow head ${identity.sourceSha}; rejected=${JSON.stringify(metadataRejected)}`);

  const valid = [];
  const invalid = [];
  const inconclusive = [];
  const workflowRuns = new Map();
  for (const artifact of candidates) {
    try {
      let workflowRun = workflowRuns.get(artifact.workflow_run.id);
      if (!workflowRun) {
        workflowRun = await readWorkflowRun({
          fetchImpl, apiBase, repository, token, runId: artifact.workflow_run.id,
        });
        workflowRuns.set(artifact.workflow_run.id, workflowRun);
      }
      verifyWorkflowRun(workflowRun, artifact, identity, repository);
      let candidateAWorkflow = null;
      if (requirePass71CandidateAWorkflow) {
        invariant(workflowRun.status === 'completed' && workflowRun.conclusion === 'failure',
          `candidate A workflow run ${workflowRun.id} must conclude failure solely for the absent finalizer manifest`);
        invariant(workflowRun.run_attempt === 1,
          `candidate A workflow run ${workflowRun.id} must be original attempt 1; received ${workflowRun.run_attempt ?? 'unknown'}`);
        invariant(typeof artifact.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(artifact.digest),
          'candidate A preview artifact is missing its GitHub SHA-256 digest');
        const jobs = await readWorkflowJobs({
          fetchImpl, apiBase, repository, token, runId: workflowRun.id,
        });
        const requirements = validatePass71CandidateAWorkflowJobs(jobs);
        const requirementsLog = await downloadJobLog({
          fetchImpl, apiBase, repository, token, jobId: requirements.id,
        });
        validatePass71MissingManifestLog(requirementsLog);
        const acceptanceArtifact = await verifyPass71CandidateAAcceptanceArtifact({
          fetchImpl, apiBase, repository, token, identity, workflowRunId: workflowRun.id, nowMs,
        });
        candidateAWorkflow = {
          runId: workflowRun.id,
          status: workflowRun.status,
          conclusion: workflowRun.conclusion,
          jobCount: jobs.length,
          requirementsJobId: requirements.id,
          requirementsConclusion: requirements.conclusion,
          missingManifestFailure: PASS71_MISSING_MANIFEST_ERROR,
          acceptanceArtifactId: acceptanceArtifact.artifactId,
          acceptanceArtifactName: acceptanceArtifact.artifactName,
          acceptanceArtifactSha256: acceptanceArtifact.archiveSha256,
        };
      }
      const archive = await downloadArtifact({
        fetchImpl, apiBase, repository, token, artifact, maxArchiveBytes,
      });
      const archiveSha256 = sha256(archive);
      if (artifact.digest !== undefined && artifact.digest !== null) {
        invariant(artifact.digest === `sha256:${archiveSha256}`,
          `artifact ${artifact.id} GitHub digest does not match the downloaded ZIP`);
      }
      const inspected = inspectPreviewArtifactZip(archive, identity, {
        maxUncompressedBytes: options.maxUncompressedBytes,
      });
      valid.push({ artifact, archiveSha256, inspected, candidateAWorkflow });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const summary = artifactSummary(artifact, [message]);
      if (error instanceof ProvenanceError && error.kind === 'inconclusive') inconclusive.push(summary);
      else invalid.push(summary);
    }
  }
  invariant(inconclusive.length === 0,
    `artifact verification was inconclusive: ${JSON.stringify(inconclusive)}`, 'inconclusive');
  invariant(valid.length === 1,
    valid.length === 0
      ? `no exact preview artifact passed embedded-receipt and dist-byte verification; invalid=${JSON.stringify(invalid)}`
      : `ambiguous preview provenance: ${valid.length} artifacts exactly match the manifest`);

  const selected = valid[0];
  return {
    schemaVersion: 1,
    ok: true,
    kind: 'pass66-pr-preview-provenance',
    repository,
    artifactName: identity.artifactName,
    artifactId: selected.artifact.id,
    workflowRunId: selected.artifact.workflow_run.id,
    sourceSha: identity.sourceSha,
    pullRequest: identity.pullRequest,
    previewCreatedAt: identity.createdAt,
    artifactCreatedAt: selected.artifact.created_at,
    artifactExpiresAt: selected.artifact.expires_at,
    archiveSha256: selected.archiveSha256,
    githubArtifactDigest: selected.artifact.digest ?? null,
    fileCount: selected.inspected.fileCount,
    treeSha256: selected.inspected.treeSha256,
    exactNameArtifactCount: listed.length,
    matchingLiveArtifactCount: candidates.length,
    rejectedMetadata: metadataRejected,
    rejectedArchives: invalid,
    candidateAWorkflow: selected.candidateAWorkflow,
    verifiedAt: new Date(nowMs).toISOString(),
  };
}

function writeReceipt(path, receipt) {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(REPOSITORY_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  let values = {};
  let result;
  try {
    values = parseArgs(process.argv.slice(2));
    result = await verifyPreviewProvenance({
      manifestPath: values.manifest,
      repository: values.repository,
      apiBase: values['api-base'],
    });
  } catch (error) {
    result = {
      schemaVersion: 1,
      ok: false,
      kind: 'pass66-pr-preview-provenance',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  writeReceipt(values.output ?? DEFAULT_OUTPUT_PATH, result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
