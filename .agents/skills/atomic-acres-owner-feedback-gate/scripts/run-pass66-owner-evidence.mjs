#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateHardwareWebGl2BuildManifest,
  validateHardwareWebGl2DetailedReceipt,
} from '../../../../scripts/qa/pass65-hardware-webgl2-receipt-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..');

const GRAPH_PATH = 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json';
const LEDGER_PATH = 'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md';
const MATRIX_PATH = 'docs/PASS65_REQUIREMENTS_MATRIX.md';
const OWNER_ROOT = 'artifacts/pass65-owner-feedback';
const HARDWARE_ROOT = 'artifacts/pass65/hardware-webgl2-admission';
const RUNNER_ROOT = 'artifacts/pass66-owner-evidence-runner';
const HARDWARE_TEST_ID = 'T-COLD-HARDWARE-WEBGL2';
const HARDWARE_VERIFIER_ID = 'pass65-installed-chrome-hardware-webgl2-admission';
const HARDWARE_VERIFIER_VERSION = '1';
export const PASS66_BROWSER_FOREGROUND_TEST_ID = 'T-BROWSER-FOREGROUND-POLICY';
export const PASS66_HIDDEN_TAB_TEST_ID = 'T-HIDDEN-TAB-ADMISSION';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TEST_ID = /^T-[A-Z0-9-]+$/;
const FEEDBACK_ID = /^HF-\d{3}$/;
const REQUIREMENT_ID = /^R\d{3}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DECLARED_EVIDENCE_KINDS = new Set(['unit', 'contract', 'browser', 'visual']);
const MECHANICAL_EVIDENCE_KINDS = new Set(['unit', 'contract', 'browser']);
const VISUAL_MEDIA_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.mp4', '.png', '.webm', '.webp']);
const VISUAL_SCOPE_PATTERN = /\bvisual\b|audiovisual|screenshots?|contact sheets?|review cameras?|\bwebm\b|\bmp4\b|\bposters?\b|video frames?|light-occlusion|hud captures?|hud corpus|camera\/hud|accessibility captures?|cinematic captures?|map captures?|paired captures?|pixel(?:\s|\+|\/)|pbr\/lod|pbr\/sight|presentation\/provenance/i;
const NON_VISUAL_CAPTURE_DOMAIN_PATTERN = /\b(?:audio|footsteps?|sound-event|network-chaos|stress)\b/i;

export class EvidenceRunnerError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'EvidenceRunnerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new EvidenceRunnerError(code, message);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('E_SHAPE', `${label} must be an object.`);
  const actual = Object.keys(value);
  const missing = allowed.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !allowed.includes(key));
  if (missing.length || extra.length) {
    fail('E_KEYS', `${label} has missing=${missing.join(',') || '<none>'}; extra=${extra.join(',') || '<none>'}.`);
  }
}

function sortedUnique(values, label, pattern) {
  if (!Array.isArray(values)) fail('E_SHAPE', `${label} must be an array.`);
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || (pattern && !pattern.test(value))) fail('E_VALUE', `${label} contains invalid value ${String(value)}.`);
    if (seen.has(value)) fail('E_DUPLICATE', `${label} duplicates ${value}.`);
    seen.add(value);
  }
  return [...seen].sort();
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const PASS66_BLOCKING_TEST_CONTRACTS = Object.freeze([
  Object.freeze({
    id: PASS66_BROWSER_FOREGROUND_TEST_ID,
    command: 'npx vitest run src/browser-preparation-scheduler.test.ts src/rendering/render-runtime.test.ts src/presentation-scheduling-lifecycle.test.ts src/presentation-prewarm-contract.test.ts',
    paths: Object.freeze([
      'src/browser-preparation-scheduler.test.ts',
      'src/rendering/render-runtime.test.ts',
      'src/presentation-scheduling-lifecycle.test.ts',
      'src/presentation-prewarm-contract.test.ts',
    ]),
    evidenceKinds: Object.freeze([]),
  }),
  Object.freeze({
    id: PASS66_HIDDEN_TAB_TEST_ID,
    command: 'npm run qa:pass66:hidden-tab',
    paths: Object.freeze([
      'scripts/qa/pass66-hidden-tab-contract.mjs',
      'scripts/qa/pass66-hidden-tab-contract.test.mjs',
      'scripts/qa/verify-pass66-hidden-tab-admission.mjs',
    ]),
    evidenceKinds: Object.freeze(['browser']),
  }),
]);

export function validatePass66BlockingCatalog(graph) {
  const tests = new Map();
  for (const test of graph?.testCatalog ?? []) {
    if (tests.has(test?.id)) fail('E_GRAPH_PASS66_TEST_CONTRACT', `Pass 66 test catalog duplicates ${String(test?.id)}.`);
    tests.set(test?.id, test);
  }
  for (const contract of PASS66_BLOCKING_TEST_CONTRACTS) {
    const test = tests.get(contract.id);
    if (!test
      || test.command !== contract.command
      || !sameArray(test.paths, contract.paths)
      || !sameArray(test.evidenceKinds ?? [], contract.evidenceKinds)
      || test.visualArtifactPaths !== undefined) {
      fail('E_GRAPH_PASS66_TEST_CONTRACT', `${contract.id} differs from its exact blocking Pass 66 command, verifier paths or evidence kind.`);
    }
  }
  const feedback = (graph?.feedbackNodes ?? []).find((node) => node?.id === 'HF-152');
  const testRefs = feedback?.verification?.testRefs ?? [];
  for (const contract of PASS66_BLOCKING_TEST_CONTRACTS) {
    if (!testRefs.includes(contract.id)) fail('E_GRAPH_PASS66_GATE_REQUIRED', `HF-152 must retain ${contract.id}.`);
  }
  return { testIds: PASS66_BLOCKING_TEST_CONTRACTS.map((contract) => contract.id) };
}

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

export function parseLedger(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const row = cells(line);
    if (!row || row.length !== 7 || !FEEDBACK_ID.test(row[0])) continue;
    rows.push({ id: row[0], priority: row[1] });
  }
  const ids = sortedUnique(rows.map((row) => row.id), 'ledger IDs', FEEDBACK_ID);
  if (rows.length === 0) fail('E_LEDGER_EMPTY', 'No feedback rows were parsed.');
  if (ids.length !== rows.length) fail('E_LEDGER_DUPLICATE', 'Feedback ledger IDs are not unique.');
  return rows;
}

export function parseMatrix(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const row = cells(line);
    if (!row || row.length !== 6 || !REQUIREMENT_ID.test(row[0])) continue;
    rows.push({
      id: row[0], requirement: row[1], expected: row[2], falsifier: row[3], requiredEvidence: row[4], state: row[5],
    });
  }
  const ids = sortedUnique(rows.map((row) => row.id), 'matrix IDs', REQUIREMENT_ID);
  if (rows.length === 0) fail('E_MATRIX_EMPTY', 'No planning requirements were parsed.');
  if (ids.length !== rows.length) fail('E_MATRIX_DUPLICATE', 'Planning requirement IDs are not unique.');
  return rows;
}

function canonicalRelative(value, label) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) fail('E_PATH', `${label} must be repository-relative.`);
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('E_PATH', `${label} is not canonical: ${value}.`);
  }
  return normalized;
}

function absoluteBelow(repoRoot, relativePath, label = 'path') {
  const normalized = canonicalRelative(relativePath, label);
  const absolute = path.resolve(repoRoot, normalized);
  const relation = path.relative(repoRoot, absolute);
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) fail('E_PATH', `${label} escapes the repository.`);
  return absolute;
}

function uniqueIndex(items, key, label, pattern) {
  if (!Array.isArray(items)) fail('E_SHAPE', `${label} must be an array.`);
  const index = new Map();
  for (const item of items) {
    const id = item?.[key];
    if (typeof id !== 'string' || (pattern && !pattern.test(id))) fail('E_VALUE', `${label} contains an invalid ${key}.`);
    if (index.has(id)) fail('E_DUPLICATE', `${label} duplicates ${id}.`);
    index.set(id, item);
  }
  return index;
}

export function analyzeCoverage(graph, matrixRows, ledgerRows) {
  if (graph?.schemaVersion !== 1 || graph.releasePass !== 'PASS 65' || graph.graphId !== 'pass65-owner-feedback-round1') {
    fail('E_GRAPH_IDENTITY', 'Unexpected owner-feedback graph identity.');
  }
  const tests = uniqueIndex(graph.testCatalog, 'id', 'testCatalog', TEST_ID);
  const feedback = uniqueIndex(graph.feedbackNodes, 'id', 'feedbackNodes', FEEDBACK_ID);
  const matrix = uniqueIndex(matrixRows, 'id', 'matrixRows', REQUIREMENT_ID);
  const ledger = uniqueIndex(ledgerRows, 'id', 'ledgerRows', FEEDBACK_ID);
  if (feedback.size !== ledger.size || [...feedback.keys()].some((id) => !ledger.has(id))) {
    fail('E_FEEDBACK_SET', `Graph feedback IDs (${feedback.size}) differ from ledger IDs (${ledger.size}).`);
  }

  const feedbackByTest = new Map([...tests.keys()].map((id) => [id, []]));
  const feedbackByRequirement = new Map([...matrix.keys()].map((id) => [id, []]));
  for (const node of feedback.values()) {
    const testRefs = sortedUnique(node.verification?.testRefs, `${node.id}.testRefs`, TEST_ID);
    const requirementIds = sortedUnique(node.planningRequirementIds, `${node.id}.planningRequirementIds`, REQUIREMENT_ID);
    if (testRefs.length === 0) fail('E_FEEDBACK_TESTS', `${node.id} has no exact test reference.`);
    if (requirementIds.length === 0) fail('E_FEEDBACK_REQUIREMENTS', `${node.id} has no planning requirement.`);
    for (const testRef of testRefs) {
      if (!tests.has(testRef)) fail('E_TEST_UNKNOWN', `${node.id} references unknown ${testRef}.`);
      feedbackByTest.get(testRef).push(node.id);
    }
    for (const requirementId of requirementIds) {
      if (!matrix.has(requirementId)) fail('E_REQUIREMENT_UNKNOWN', `${node.id} references unknown ${requirementId}.`);
      feedbackByRequirement.get(requirementId).push(node.id);
    }
  }
  for (const ids of feedbackByTest.values()) ids.sort();
  for (const ids of feedbackByRequirement.values()) ids.sort();
  const orphanTests = [...feedbackByTest].filter(([, ids]) => ids.length === 0).map(([id]) => id).sort();
  const orphanRequirements = [...feedbackByRequirement].filter(([, ids]) => ids.length === 0).map(([id]) => id).sort();
  return {
    testCount: tests.size,
    feedbackCount: feedback.size,
    requirementCount: matrix.size,
    tests,
    feedback,
    matrix,
    ledger,
    feedbackByTest,
    feedbackByRequirement,
    orphanTests,
    orphanRequirements,
  };
}

export function requireCompleteCoverage(coverage) {
  if (coverage.orphanTests.length) fail('E_ORPHAN_TEST', `Catalog tests have no owner-feedback basis: ${coverage.orphanTests.join(', ')}.`);
  if (coverage.orphanRequirements.length) {
    fail('E_ORPHAN_REQUIREMENT', `Planning requirements have no owner-feedback/test basis: ${coverage.orphanRequirements.join(', ')}.`);
  }
  return coverage;
}

export function tokenizeExactCommand(command) {
  if (typeof command !== 'string' || !command.trim() || /[\r\n\0]/.test(command)) fail('E_COMMAND', 'Catalog command is empty or multiline.');
  const tokens = [];
  let token = '';
  let quoted = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    if (character === '\\' && quoted && command[index + 1] === '"') {
      token += '"';
      index += 1;
      continue;
    }
    if (!quoted && /[&|;<>()`>]/.test(character)) fail('E_COMMAND', `Shell operator ${character} is forbidden.`);
    token += character;
  }
  if (quoted) fail('E_COMMAND', 'Catalog command contains an unmatched quote.');
  if (token) tokens.push(token);
  if (tokens.length < 2 || !['npm', 'npx'].includes(tokens[0])) fail('E_COMMAND', 'Only exact npm or npx catalog commands are allowed.');
  return tokens;
}

export function evidenceKindsForTest(test) {
  const inferred = /\bplaywright\b/.test(test.command) ? 'browser'
    : /\bvitest\b/.test(test.command) ? 'unit'
      : 'contract';
  const declared = test.evidenceKinds === undefined
    ? [inferred]
    : sortedUnique(test.evidenceKinds, `${test.id}.evidenceKinds`);
  for (const kind of declared) {
    if (!DECLARED_EVIDENCE_KINDS.has(kind)) fail('E_EVIDENCE_KIND', `${test.id} declares unsupported evidence kind ${kind}.`);
  }
  if (!declared.some((kind) => MECHANICAL_EVIDENCE_KINDS.has(kind))) {
    fail('E_EVIDENCE_KIND', `${test.id} must retain at least one mechanical evidence kind.`);
  }
  if (inferred === 'browser' && !declared.includes('browser')) {
    fail('E_EVIDENCE_KIND', `${test.id} is a direct Playwright command but omits browser evidence.`);
  }
  const visualPaths = test.visualArtifactPaths === undefined
    ? []
    : sortedUnique(test.visualArtifactPaths, `${test.id}.visualArtifactPaths`).map((entry) => canonicalRelative(entry, `${test.id}.visualArtifactPath`));
  if (declared.includes('visual') !== (visualPaths.length > 0)) {
    fail('E_VISUAL_METADATA', `${test.id} must declare visual evidence and visualArtifactPaths together.`);
  }
  for (const relativePath of visualPaths) {
    if (!relativePath.startsWith('artifacts/') && !relativePath.startsWith('docs/assets/')) {
      fail('E_VISUAL_PATH', `${test.id} visual path must be below artifacts/ or docs/assets/: ${relativePath}.`);
    }
  }
  return { kinds: declared, visualPaths };
}

function packageScriptCorpus(repoRoot, command) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const corpus = [];
  const queue = [];
  const direct = /^npm run ([^\s]+)(?:\s|$)/.exec(command)?.[1];
  if (direct) queue.push(direct);
  const seen = new Set();
  while (queue.length > 0) {
    const scriptId = queue.shift();
    if (seen.has(scriptId)) continue;
    seen.add(scriptId);
    const script = packageJson.scripts?.[scriptId];
    if (typeof script !== 'string') continue;
    corpus.push(script);
    for (const match of script.matchAll(/\bnpm run ([A-Za-z0-9:._-]+)/g)) queue.push(match[1]);
  }
  return corpus;
}

export function validateEvidenceClaims(repoRoot, test) {
  const metadata = evidenceKindsForTest(test);
  if (!metadata.kinds.includes('browser')) return metadata;
  const corpus = [test.command, ...packageScriptCorpus(repoRoot, test.command)];
  for (const relativePath of test.paths ?? []) {
    const normalized = canonicalRelative(relativePath, `${test.id}.path`);
    const absolute = absoluteBelow(repoRoot, normalized, `${test.id}.path`);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile() && /\.(?:[cm]?[jt]s|tsx?)$/i.test(normalized)) {
      corpus.push(fs.readFileSync(absolute, 'utf8'));
    }
  }
  if (!corpus.some((value) => /\bplaywright\b|@playwright\/test|chromium\.(?:launch|launchPersistentContext)/.test(value))) {
    fail('E_BROWSER_CLAIM', `${test.id} claims browser evidence without a declared Playwright/Chromium execution path.`);
  }
  return metadata;
}

function fileIdentity(absolutePath) {
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) fail('E_FILE_MISSING', `Required file is missing: ${absolutePath}.`);
  const bytes = fs.readFileSync(absolutePath);
  return { path: absolutePath.replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function collectVisualFiles(absolutePath, relativePath, output) {
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) fail('E_VISUAL_PATH', `Visual evidence may not traverse a symbolic link: ${relativePath}.`);
  if (stat.isFile()) {
    const bytes = fs.readFileSync(absolutePath);
    output.push({
      path: relativePath.replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      mtimeMs: stat.mtimeMs,
    });
    return;
  }
  if (!stat.isDirectory()) fail('E_VISUAL_PATH', `Visual evidence path is neither a file nor directory: ${relativePath}.`);
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    collectVisualFiles(path.join(absolutePath, entry.name), `${relativePath}/${entry.name}`, output);
  }
}

export function createVisualArtifactIdentity(repoRoot, test, { freshSinceMs = null } = {}) {
  const metadata = evidenceKindsForTest(test);
  if (!metadata.kinds.includes('visual')) return null;
  const groups = metadata.visualPaths.map((relativePath) => {
    const absolute = absoluteBelow(repoRoot, relativePath, `${test.id}.visualArtifactPath`);
    if (!fs.existsSync(absolute)) fail('E_VISUAL_MISSING', `${test.id} did not produce or retain ${relativePath}.`);
    const files = [];
    collectVisualFiles(absolute, relativePath, files);
    files.sort((left, right) => left.path.localeCompare(right.path));
    if (files.length === 0) fail('E_VISUAL_EMPTY', `${test.id} visual path ${relativePath} contains no files.`);
    const visualFiles = files.filter((entry) => VISUAL_MEDIA_EXTENSIONS.has(path.extname(entry.path).toLowerCase()));
    if (visualFiles.length === 0) fail('E_VISUAL_MEDIA', `${test.id} visual path ${relativePath} contains no image/video evidence.`);
    if (freshSinceMs !== null && relativePath.startsWith('artifacts/')) {
      const toleranceMs = 2_000;
      const staleVisualFiles = visualFiles.filter((entry) => entry.mtimeMs < freshSinceMs - toleranceMs);
      if (staleVisualFiles.length > 0) {
        const sample = staleVisualFiles.slice(0, 5).map((entry) => entry.path).join(', ');
        fail(
          'E_VISUAL_STALE',
          `${test.id} includes ${staleVisualFiles.length} stale visual media file(s) below ${relativePath}; every included image/video must be written by this exact run. First stale path(s): ${sample}.`,
        );
      }
    }
    return {
      path: relativePath,
      files: files.map(({ path: filePath, bytes, sha256: digest }) => ({ path: filePath, bytes, sha256: digest })),
    };
  });
  const manifest = { schemaVersion: 1, testId: test.id, paths: groups };
  return { manifest, digest: sha256(jsonBytes(manifest)) };
}

function resolveNpmCli(kind) {
  const filename = kind === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const candidates = [];
  if (process.env.npm_execpath) {
    const npmExec = path.resolve(process.env.npm_execpath);
    candidates.push(kind === 'npm' ? npmExec : path.join(path.dirname(npmExec), filename));
  }
  candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', filename));
  candidates.push(path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', filename));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', filename));
  const found = [...new Set(candidates)].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found) fail('E_LAUNCHER', `Could not resolve ${filename} without a shell.`);
  return found;
}

export function resolveInvocation(command) {
  const tokens = tokenizeExactCommand(command);
  const cliPath = resolveNpmCli(tokens[0]);
  return {
    executable: process.execPath,
    args: [cliPath, ...tokens.slice(1)],
    exactCommand: command,
    tokens,
    launcherPath: cliPath,
  };
}

export function createDistManifest(repoRoot, sourceSha) {
  if (!SHA40.test(sourceSha)) fail('E_SOURCE_SHA', `Invalid source SHA ${sourceSha}.`);
  const distRoot = path.join(repoRoot, 'dist');
  if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) fail('E_BUILD_MISSING', 'dist/ must exist before evidence execution.');
  const files = [];
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const child = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(child, relative);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(child);
        files.push({ path: relative.replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: sha256(bytes) });
      }
    }
  }
  visit(distRoot);
  if (files.length === 0) fail('E_BUILD_EMPTY', 'dist/ contains no files.');
  const manifest = { schemaVersion: 1, sourceSha, files };
  return { manifest, digest: sha256(jsonBytes(manifest)) };
}

function git(repoRoot, ...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim();
}

export function exactSourceState(repoRoot, expectedSourceSha) {
  const sourceSha = git(repoRoot, 'rev-parse', 'HEAD');
  if (!SHA40.test(sourceSha)) fail('E_SOURCE_SHA', `HEAD is not an exact SHA: ${sourceSha}.`);
  if (expectedSourceSha && sourceSha !== expectedSourceSha) fail('E_SOURCE_HEAD', `HEAD ${sourceSha} differs from frozen S0 ${expectedSourceSha}.`);
  const status = git(repoRoot, 'status', '--porcelain', '--untracked-files=all');
  if (status) fail('E_SOURCE_DIRTY', `Exact-S0 worktree is dirty: ${status.split(/\r?\n/).slice(0, 8).join('; ')}.`);
  return sourceSha;
}

function verifierIdentity(repoRoot, test, graphDigest) {
  const evidence = validateEvidenceClaims(repoRoot, test);
  const paths = sortedUnique(test.paths, `${test.id}.paths`).map((relativePath) => {
    const normalized = canonicalRelative(relativePath, `${test.id}.path`);
    const identity = fileIdentity(absoluteBelow(repoRoot, normalized, `${test.id}.path`));
    return { path: normalized, bytes: identity.bytes, sha256: identity.sha256 };
  });
  const document = {
    schemaVersion: 1,
    testId: test.id,
    exactCommand: test.command,
    graphSha256: graphDigest,
    evidenceKinds: evidence.kinds,
    visualArtifactPaths: evidence.visualPaths,
    paths,
  };
  return { document, digest: sha256(jsonBytes(document)) };
}

function environmentIdentity(repoRoot, invocation) {
  const envKeys = ['CI', 'NODE_ENV', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'CHROME_PATH'];
  const document = {
    schemaVersion: 1,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    nodeVersion: process.version,
    nodeExecutable: fileIdentity(process.execPath),
    launcher: fileIdentity(invocation.launcherPath),
    packageLock: fileIdentity(path.join(repoRoot, 'package-lock.json')),
    environment: Object.fromEntries(envKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])),
  };
  return { document, digest: sha256(jsonBytes(document)) };
}

function artifactIdForTest(testId) {
  return `ART-P66-${testId.replace(/^T-/, '')}`;
}

function receiptPathForTest(testId, sourceSha) {
  const slug = testId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${OWNER_ROOT}/${slug}-${sourceSha}.json`;
}

function hardwareReceiptPath(sourceSha) {
  return `${OWNER_ROOT}/hardware-webgl2-admission-${sourceSha}.json`;
}

export function createNormalReceipt({
  sourceSha, buildDigest, testId, verifierDigest, environmentHash, feedbackIds, visualDigest = null,
}) {
  const sortedFeedback = sortedUnique(feedbackIds, `${testId}.feedbackIds`, FEEDBACK_ID);
  if (visualDigest !== null && !SHA256.test(visualDigest)) fail('E_VISUAL_DIGEST', `${testId} has an invalid visual digest.`);
  return {
    schemaVersion: 1,
    kind: 'pass65-owner-feedback-evidence',
    sourceSha,
    buildId: `pass66-s0-${sourceSha}-dist-${buildDigest}${visualDigest ? `-visual-${visualDigest}` : ''}`,
    verifierId: testId,
    verifierVersion: verifierDigest,
    environmentHash,
    result: 'passed',
    feedbackIds: sortedFeedback,
    testRefs: [testId],
  };
}

export function validateNormalReceipt(receipt, expected, label = 'receipt') {
  exactKeys(receipt, [
    'schemaVersion', 'kind', 'sourceSha', 'buildId', 'verifierId', 'verifierVersion',
    'environmentHash', 'result', 'feedbackIds', 'testRefs',
  ], label);
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) fail('E_RECEIPT_STALE', `${label} does not match the exact current source/build/environment/verifier identity.`);
  return receipt;
}

export function decideResumeAction({ exists, validateExisting }) {
  if (!exists) return { action: 'execute', reason: 'missing' };
  try {
    return { action: 'resume', reason: 'valid', value: validateExisting() };
  } catch (caught) {
    if (!(caught instanceof EvidenceRunnerError) && !(caught instanceof SyntaxError)) throw caught;
    return {
      action: 'execute',
      reason: 'invalid',
      validationCode: caught instanceof EvidenceRunnerError ? caught.code : 'E_JSON',
    };
  }
}

function readRequiredBytes(repoRoot, relativePath) {
  const absolute = absoluteBelow(repoRoot, relativePath, 'artifact path');
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail('E_ARTIFACT_MISSING', `Missing ${relativePath}.`);
  return fs.readFileSync(absolute);
}

export function validateHardwareArtifact({
  repoRoot,
  sourceSha,
  expectedFeedbackIds,
  currentBuildManifest,
  ownerRelativePath = hardwareReceiptPath(sourceSha),
  readBytes = (relativePath) => readRequiredBytes(repoRoot, relativePath),
  fileExists = (absolutePath) => fs.existsSync(absolutePath),
}) {
  const ownerBytes = readBytes(ownerRelativePath);
  let receipt;
  try { receipt = JSON.parse(ownerBytes.toString('utf8')); }
  catch (caught) { fail('E_HARDWARE_JSON', `${ownerRelativePath} is not JSON: ${caught.message}`); }
  exactKeys(receipt, [
    'schemaVersion', 'kind', 'sourceSha', 'buildId', 'verifierId', 'verifierVersion',
    'environmentHash', 'result', 'feedbackIds', 'testRefs', 'detailedReceiptPath',
    'detailedReceiptSha256', 'buildManifestPath', 'buildManifestSha256',
  ], 'hardware owner receipt');
  if (receipt.schemaVersion !== 2) fail('E_HARDWARE_SCHEMA', 'Hardware WebGL2 evidence must be the original schema-v2 owner artifact, never a wrapper.');
  if (receipt.kind !== 'pass65-owner-feedback-evidence' || receipt.sourceSha !== sourceSha || receipt.result !== 'passed') {
    fail('E_HARDWARE_IDENTITY', 'Hardware owner artifact is not a passed exact-S0 owner receipt.');
  }
  if (receipt.verifierId !== HARDWARE_VERIFIER_ID || receipt.verifierVersion !== HARDWARE_VERIFIER_VERSION) {
    fail(
      'E_HARDWARE_VERIFIER',
      `Hardware owner artifact must use verifier ${HARDWARE_VERIFIER_ID} version ${HARDWARE_VERIFIER_VERSION}.`,
    );
  }
  if (!sameArray(sortedUnique(receipt.feedbackIds, 'hardware.feedbackIds', FEEDBACK_ID), sortedUnique(expectedFeedbackIds, 'expected hardware feedback', FEEDBACK_ID))) {
    fail('E_HARDWARE_FEEDBACK', 'Hardware owner artifact feedback IDs differ from the graph-derived exact set.');
  }
  if (!sameArray(receipt.testRefs, [HARDWARE_TEST_ID])) fail('E_HARDWARE_TEST', `Hardware owner artifact must attest only ${HARDWARE_TEST_ID}.`);
  if (!SHA256.test(receipt.environmentHash ?? '') || !SHA256.test(receipt.detailedReceiptSha256 ?? '') || !SHA256.test(receipt.buildManifestSha256 ?? '')) {
    fail('E_HARDWARE_DIGEST', 'Hardware owner artifact has invalid digest metadata.');
  }
  const detailPath = canonicalRelative(receipt.detailedReceiptPath, 'hardware detailed receipt path');
  const manifestPath = canonicalRelative(receipt.buildManifestPath, 'hardware build manifest path');
  if (!detailPath.startsWith(`${HARDWARE_ROOT}/`) || !manifestPath.startsWith(`${HARDWARE_ROOT}/`)) {
    fail('E_HARDWARE_PATH', `Hardware details must stay below ${HARDWARE_ROOT}.`);
  }
  const detailBytes = readBytes(detailPath);
  const manifestBytes = readBytes(manifestPath);
  if (sha256(detailBytes) !== receipt.detailedReceiptSha256 || sha256(manifestBytes) !== receipt.buildManifestSha256) {
    fail('E_HARDWARE_DIGEST', 'Hardware detail or build-manifest bytes differ from the owner artifact.');
  }
  const detail = JSON.parse(detailBytes.toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const detailIssues = validateHardwareWebGl2DetailedReceipt(detail, {
    sourceSha,
    environmentHash: receipt.environmentHash,
    buildManifestSha256: receipt.buildManifestSha256,
  });
  const manifestIssues = validateHardwareWebGl2BuildManifest(manifest, { sourceSha });
  if (detailIssues.length) fail('E_HARDWARE_DETAIL', detailIssues.join('; '));
  if (manifestIssues.length) fail('E_HARDWARE_BUILD', manifestIssues.join('; '));
  if (JSON.stringify(manifest) !== JSON.stringify(currentBuildManifest)) fail('E_HARDWARE_BUILD', 'Hardware manifest differs from current exact-S0 dist bytes.');
  const chromePath = detail.environment?.chromeExecutable;
  if (typeof chromePath !== 'string' || !fileExists(chromePath)
    || sha256(readBytes(`@absolute:${chromePath}`)) !== detail.environment?.chromeExecutableSha256) {
    fail('E_HARDWARE_CHROME', 'Installed Chrome bytes differ from the hardware receipt.');
  }
  return { receipt, path: ownerRelativePath, sha256: sha256(ownerBytes) };
}

function defaultHardwareReadBytes(repoRoot) {
  return (value) => {
    if (value.startsWith('@absolute:')) {
      const absolute = value.slice('@absolute:'.length);
      if (!path.isAbsolute(absolute) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail('E_HARDWARE_CHROME', 'Chrome executable is missing.');
      return fs.readFileSync(absolute);
    }
    return readRequiredBytes(repoRoot, value);
  };
}

function atomicWrite(absolutePath, bytes) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, absolutePath);
}

function sameSnapshot(left, right) {
  return left.sourceSha === right.sourceSha
    && left.buildDigest === right.buildDigest
    && left.verifierDigest === right.verifierDigest
    && left.environmentHash === right.environmentHash;
}

function testSnapshot(repoRoot, graphDigest, test, expectedSourceSha) {
  const sourceSha = exactSourceState(repoRoot, expectedSourceSha);
  const build = createDistManifest(repoRoot, sourceSha);
  const invocation = resolveInvocation(test.command);
  const verifier = verifierIdentity(repoRoot, test, graphDigest);
  const environment = environmentIdentity(repoRoot, invocation);
  return {
    sourceSha,
    buildManifest: build.manifest,
    buildDigest: build.digest,
    invocation,
    verifier: verifier.document,
    verifierDigest: verifier.digest,
    environment: environment.document,
    environmentHash: environment.digest,
  };
}

function receiptForSnapshot(repoRoot, test, snapshot, feedbackIds, { freshSinceMs = null } = {}) {
  const visual = createVisualArtifactIdentity(repoRoot, test, { freshSinceMs });
  const receipt = createNormalReceipt({
    sourceSha: snapshot.sourceSha,
    buildDigest: snapshot.buildDigest,
    testId: test.id,
    verifierDigest: snapshot.verifierDigest,
    environmentHash: snapshot.environmentHash,
    feedbackIds,
    visualDigest: visual?.digest ?? null,
  });
  return { receipt, visual };
}

async function execute(invocation, cwd, logPath, header) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.createWriteStream(logPath, { flags: 'w', encoding: 'utf8' });
  log.write(`${JSON.stringify(header, null, 2)}\n--- stdout/stderr ---\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', (error) => {
      log.end(`\n--- launch error ---\n${error.stack ?? error.message}\n`, () => reject(error));
    });
    child.on('close', (code, signal) => {
      log.end(`\n--- exit ---\n${JSON.stringify({ code, signal })}\n`, () => resolve({ code, signal }));
    });
  });
}

export async function attestNormalCommandAfterPass({
  testId,
  before,
  executeExact,
  snapshotAfter,
  createAttestation,
  writeReceipt,
  failureHint = '',
}) {
  const result = await executeExact();
  if (result.code !== 0 || result.signal) {
    fail('E_TEST_FAILED', `${testId} exited code=${result.code} signal=${result.signal ?? '<none>'}; no receipt was created.${failureHint}`);
  }
  const after = await snapshotAfter();
  if (!sameSnapshot(before, after)) {
    fail('E_POST_DRIFT', `${testId} changed source, build, verifier, or environment identity; no receipt was created.`);
  }
  const attestation = await createAttestation(after);
  await writeReceipt(attestation.receipt);
  return { result, after, attestation };
}

function parseArgs(argv) {
  const values = {};
  const booleans = new Set(['list', 'dry-run', 'run', 'resume', 'self-test']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('E_ARGUMENT', `Unexpected argument ${token}.`);
    const key = token.slice(2);
    if (Object.hasOwn(values, key)) fail('E_ARGUMENT', `Duplicate argument --${key}.`);
    if (booleans.has(key)) values[key] = true;
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) fail('E_ARGUMENT', `--${key} requires a value.`);
      values[key] = next;
      index += 1;
    }
  }
  const known = new Set([
    ...booleans, 'select', 'source-sha', 'emit-finalizer-input', 'feedback-received-at',
    'preview-ref', 'preview-created-at', 'acceptance-mode', 'approved-at', 'approval-evidence',
  ]);
  const unknown = Object.keys(values).filter((key) => !known.has(key));
  if (unknown.length) fail('E_ARGUMENT', `Unknown arguments: ${unknown.join(', ')}.`);
  return values;
}

function selectedTests(coverage, selection) {
  if (!selection) return [...coverage.tests.keys()];
  const ids = sortedUnique(String(selection).split(',').map((value) => value.trim()), '--select', TEST_ID);
  for (const id of ids) if (!coverage.tests.has(id)) fail('E_SELECT', `Unknown selected test ${id}.`);
  return ids;
}

function canonicalArtifactSpec(testId, relativePath, bytes) {
  return { id: artifactIdForTest(testId), path: relativePath, sha256: sha256(bytes) };
}

function validateAllReceiptFiles(repoRoot, sourceSha, coverage, graphDigest) {
  const artifacts = [];
  const receiptsByTest = new Map();
  const visualByTest = new Map();
  const expectedPaths = new Set();
  const baseSource = exactSourceState(repoRoot, sourceSha);
  const build = createDistManifest(repoRoot, baseSource);
  for (const test of coverage.tests.values()) {
    const feedbackIds = coverage.feedbackByTest.get(test.id);
    if (test.id === HARDWARE_TEST_ID) {
      const relativePath = hardwareReceiptPath(sourceSha);
      const validated = validateHardwareArtifact({
        repoRoot,
        sourceSha,
        expectedFeedbackIds: feedbackIds,
        currentBuildManifest: build.manifest,
        ownerRelativePath: relativePath,
        readBytes: defaultHardwareReadBytes(repoRoot),
      });
      const bytes = readRequiredBytes(repoRoot, relativePath);
      artifacts.push(canonicalArtifactSpec(test.id, relativePath, bytes));
      receiptsByTest.set(test.id, validated.receipt);
      expectedPaths.add(relativePath);
      continue;
    }
    const snapshot = testSnapshot(repoRoot, graphDigest, test, sourceSha);
    const expected = receiptForSnapshot(repoRoot, test, snapshot, feedbackIds);
    const relativePath = receiptPathForTest(test.id, sourceSha);
    const bytes = readRequiredBytes(repoRoot, relativePath);
    const receipt = JSON.parse(bytes.toString('utf8'));
    validateNormalReceipt(receipt, expected.receipt, `${test.id} receipt`);
    artifacts.push(canonicalArtifactSpec(test.id, relativePath, bytes));
    receiptsByTest.set(test.id, receipt);
    if (expected.visual) visualByTest.set(test.id, expected.visual);
    expectedPaths.add(relativePath);
  }
  const ownerAbsolute = path.join(repoRoot, OWNER_ROOT);
  if (fs.existsSync(ownerAbsolute)) {
    for (const entry of fs.readdirSync(ownerAbsolute, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const relativePath = `${OWNER_ROOT}/${entry.name}`;
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(path.join(ownerAbsolute, entry.name), 'utf8')); }
      catch { continue; }
      if (parsed?.kind === 'pass65-owner-feedback-evidence' && parsed.sourceSha === sourceSha && !expectedPaths.has(relativePath)) {
        fail('E_RECEIPT_EXTRA', `Unexpected duplicate/extra exact-S0 owner receipt ${relativePath}.`);
      }
    }
  }
  artifacts.sort((left, right) => left.id.localeCompare(right.id));
  return { artifacts, receiptsByTest, visualByTest };
}

export function requirementNeedsVisual(row) {
  const text = [row.requirement, row.expected, row.falsifier, row.requiredEvidence]
    .filter((value) => typeof value === 'string')
    .join('\n');
  if (VISUAL_SCOPE_PATTERN.test(text)) return true;
  if (/\bcaptures?\b/i.test(row.requiredEvidence ?? '')) {
    return !NON_VISUAL_CAPTURE_DOMAIN_PATTERN.test(`${row.requirement}\n${row.requiredEvidence}`);
  }
  return false;
}

function primaryMechanicalKind(test) {
  const kinds = evidenceKindsForTest(test).kinds;
  return ['browser', 'unit', 'contract'].find((kind) => kinds.includes(kind));
}

export function buildMappings({
  graph, matrixRows, ledgerRows, coverage, artifacts, visualByTest = new Map(), sourceSha,
}) {
  requireCompleteCoverage(coverage);
  if (!SHA40.test(sourceSha ?? '')) fail('E_SOURCE_SHA', 'Mapping generation requires the exact lowercase S0 SHA.');
  const artifactByTest = new Map(artifacts.map((artifact) => {
    const match = [...coverage.tests.keys()].find((testId) => artifact.id === artifactIdForTest(testId));
    if (!match) fail('E_ARTIFACT_EXTRA', `Unknown artifact ${artifact.id}.`);
    return [match, artifact];
  }));
  if (artifactByTest.size !== artifacts.length) fail('E_ARTIFACT_DUPLICATE', 'Exact test artifacts contain a duplicate test binding.');
  if (artifactByTest.size !== coverage.tests.size) {
    const missing = [...coverage.tests.keys()].filter((id) => !artifactByTest.has(id));
    fail('E_ARTIFACT_MISSING', `Missing exact test artifacts: ${missing.join(', ')}.`);
  }
  const priority = new Map(ledgerRows.map((row) => [row.id, row.priority]));
  const feedbackEvidence = graph.feedbackNodes
    .filter((node) => ['P0', 'P1'].includes(priority.get(node.id)))
    .map((node) => ({
      feedbackId: node.id,
      state: 'VERIFIED',
      testEvidence: sortedUnique(node.verification.testRefs, `${node.id}.testRefs`, TEST_ID)
        .map((testRef) => ({ testRef, artifactId: artifactByTest.get(testRef).id })),
    }))
    .sort((left, right) => left.feedbackId.localeCompare(right.feedbackId));

  const requirementEvidence = matrixRows.map((row) => {
    const nodes = graph.feedbackNodes.filter((node) => node.planningRequirementIds.includes(row.id));
    if (!nodes.length) fail('E_ORPHAN_REQUIREMENT', `${row.id} has no feedback-node/test mapping.`);
    const testRefs = [...new Set(nodes.flatMap((node) => node.verification.testRefs))].sort();
    const mechanicalEvidence = testRefs.map((testRef) => {
      const test = coverage.tests.get(testRef);
      const linkedBlockingFeedback = nodes
        .filter((node) => ['P0', 'P1'].includes(priority.get(node.id)) && node.verification.testRefs.includes(testRef))
        .map((node) => node.id)
        .sort();
      return {
        kind: primaryMechanicalKind(test),
        ref: canonicalRelative(test.paths[0], `${testRef}.paths[0]`),
        testRef,
        artifactId: artifactByTest.get(testRef).id,
        feedbackIds: linkedBlockingFeedback,
        note: `Exact-S0 ${testRef} receipt exercises the graph-linked falsifier coverage for ${row.id}.`,
      };
    });
    if (!requirementNeedsVisual(row)) {
      return { planningRequirementId: row.id, acceptance: 'mechanical', evidence: mechanicalEvidence };
    }
    const browserRefs = testRefs.filter((testRef) => evidenceKindsForTest(coverage.tests.get(testRef)).kinds.includes('browser'));
    const visualRefs = testRefs.filter((testRef) => evidenceKindsForTest(coverage.tests.get(testRef)).kinds.includes('visual'));
    if (browserRefs.length === 0) {
      fail('E_VISUAL_BROWSER_GAP', `${row.id} is visual scope but has no graph-linked exact browser test.`);
    }
    if (visualRefs.length === 0) {
      fail('E_VISUAL_ARTIFACT_GAP', `${row.id} is visual scope but has no graph-linked visual-producing/validating test.`);
    }
    const visualEvidence = visualRefs.map((testRef) => {
      const visual = visualByTest.get(testRef);
      if (!visual || !SHA256.test(visual.digest ?? '')) {
        fail('E_VISUAL_ARTIFACT_GAP', `${row.id}/${testRef} lacks a current exact-S0 visual artifact digest.`);
      }
      const linkedBlockingFeedback = nodes
        .filter((node) => ['P0', 'P1'].includes(priority.get(node.id)) && node.verification.testRefs.includes(testRef))
        .map((node) => node.id)
        .sort();
      return {
        kind: 'visual',
        ref: `artifact://pass66-exact-s0/${sourceSha}/${testRef}/${visual.digest}`,
        testRef,
        artifactId: artifactByTest.get(testRef).id,
        feedbackIds: linkedBlockingFeedback,
        note: `Digest-bound ${testRef} visual output was produced or validated by the exact-S0 command for ${row.id}.`,
      };
    });
    return {
      planningRequirementId: row.id,
      acceptance: 'mixed',
      evidence: [...mechanicalEvidence, ...visualEvidence],
    };
  });

  const allFeedbackCoverage = graph.feedbackNodes.map((node) => ({
    feedbackId: node.id,
    priority: priority.get(node.id),
    planningRequirementIds: [...node.planningRequirementIds].sort(),
    testEvidence: sortedUnique(node.verification.testRefs, `${node.id}.testRefs`, TEST_ID)
      .map((testRef) => ({ testRef, artifactId: artifactByTest.get(testRef).id })),
  })).sort((left, right) => left.feedbackId.localeCompare(right.feedbackId));

  const usedArtifacts = new Set([
    ...feedbackEvidence.flatMap((row) => row.testEvidence.map((entry) => entry.artifactId)),
    ...requirementEvidence.flatMap((row) => row.evidence.map((entry) => entry.artifactId)),
  ]);
  const unused = artifacts.filter((artifact) => !usedArtifacts.has(artifact.id)).map((artifact) => artifact.id);
  if (unused.length) fail('E_ARTIFACT_EXTRA', `Receipts are not consumed by row/requirement mappings: ${unused.join(', ')}.`);
  return { feedbackEvidence, requirementEvidence, allFeedbackCoverage };
}

function validateIso(value, label) {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || !Number.isFinite(Date.parse(value))) fail('E_TIMESTAMP', `${label} must be ISO UTC.`);
}

function finalizerPlan(args, sourceSha, artifacts, mappings) {
  validateIso(args['feedback-received-at'], '--feedback-received-at');
  validateIso(args['preview-created-at'], '--preview-created-at');
  if (Date.parse(args['preview-created-at']) < Date.parse(args['feedback-received-at'])) fail('E_PREVIEW', 'Preview predates feedback receipt.');
  if (typeof args['preview-ref'] !== 'string' || !args['preview-ref']) fail('E_PREVIEW', '--preview-ref is required.');
  const acceptanceMode = args['acceptance-mode'] ?? 'pre-approval';
  if (!['pre-approval', 'approved'].includes(acceptanceMode)) fail('E_ACCEPTANCE', '--acceptance-mode must be pre-approval or approved.');
  const plan = {
    schemaVersion: 1,
    kind: 'pass66-owner-evidence-finalization',
    sourceSha,
    feedbackReceivedAt: args['feedback-received-at'],
    acceptanceMode,
    preview: {
      kind: args['preview-ref'].startsWith('https://') ? 'immutable-url' : 'github-actions-artifact',
      ref: args['preview-ref'],
      sourceSha,
      createdAt: args['preview-created-at'],
    },
    ...(acceptanceMode === 'approved' ? {
      humanAcceptance: (() => {
        validateIso(args['approved-at'], '--approved-at');
        if (typeof args['approval-evidence'] !== 'string' || args['approval-evidence'].trim().length < 16) {
          fail('E_ACCEPTANCE', '--approval-evidence must name concrete owner authorization.');
        }
        if (Date.parse(args['approved-at']) < Date.parse(args['preview-created-at'])) fail('E_ACCEPTANCE', 'Approval predates preview creation.');
        return { state: 'approved', approvedBy: 'Dave', approvedAt: args['approved-at'], evidence: args['approval-evidence'].trim() };
      })(),
    } : {}),
    artifacts,
    feedbackEvidence: mappings.feedbackEvidence,
    requirementEvidence: mappings.requirementEvidence,
  };
  return plan;
}

export function runSelfTest() {
  const graph = {
    schemaVersion: 1,
    releasePass: 'PASS 65',
    graphId: 'pass65-owner-feedback-round1',
    testCatalog: [
      { id: 'T-A', command: 'npm run test:a', paths: ['a.test.ts'] },
      {
        id: 'T-B',
        command: 'npx playwright test b.test.ts',
        paths: ['b.test.ts'],
        evidenceKinds: ['browser', 'visual'],
        visualArtifactPaths: ['artifacts/self-test/b'],
      },
    ],
    feedbackNodes: [
      { id: 'HF-001', planningRequirementIds: ['R001'], verification: { testRefs: ['T-A'] } },
      { id: 'HF-002', planningRequirementIds: ['R002'], verification: { testRefs: ['T-B'] } },
    ],
  };
  const matrix = [
    { id: 'R001', requirement: 'Runtime truth', expected: 'yes', falsifier: 'no', requiredEvidence: 'Exact receipt.' },
    { id: 'R002', requirement: 'Visual truth', expected: 'yes', falsifier: 'no', requiredEvidence: 'Browser screenshot and visual receipt.' },
  ];
  const ledger = [{ id: 'HF-001', priority: 'P0' }, { id: 'HF-002', priority: 'P2' }];
  const coverage = requireCompleteCoverage(analyzeCoverage(graph, matrix, ledger));
  const digest = 'a'.repeat(64);
  const receipt = createNormalReceipt({
    sourceSha: 'b'.repeat(40), buildDigest: digest, testId: 'T-A', verifierDigest: digest,
    environmentHash: digest, feedbackIds: ['HF-001'],
  });
  validateNormalReceipt(receipt, structuredClone(receipt));
  const artifacts = graph.testCatalog.map((test) => ({
    id: artifactIdForTest(test.id), path: `artifacts/pass65-owner-feedback/${test.id}.json`, sha256: digest,
  }));
  const mappings = buildMappings({
    graph,
    matrixRows: matrix,
    ledgerRows: ledger,
    coverage,
    artifacts,
    visualByTest: new Map([['T-B', { digest }]]),
    sourceSha: 'b'.repeat(40),
  });
  if (mappings.requirementEvidence.find((row) => row.planningRequirementId === 'R002')?.acceptance !== 'mixed') {
    fail('E_SELFTEST', 'Known visual requirement did not produce mixed acceptance.');
  }
  const mutations = [];
  const rejected = (name, code, action) => {
    try { action(); fail('E_SELFTEST', `${name} passed unexpectedly.`); }
    catch (caught) {
      if (!(caught instanceof EvidenceRunnerError) || caught.code !== code) fail('E_SELFTEST', `${name} returned ${caught.code ?? caught.message}, expected ${code}.`);
    }
    mutations.push(name);
  };
  rejected('orphan planning requirement', 'E_ORPHAN_REQUIREMENT', () => {
    const changed = [...matrix, { id: 'R003', requirement: 'orphan' }];
    requireCompleteCoverage(analyzeCoverage(graph, changed, ledger));
  });
  rejected('orphan catalog test', 'E_ORPHAN_TEST', () => {
    const changed = structuredClone(graph);
    changed.testCatalog.push({ id: 'T-C', command: 'npm run test:c', paths: ['c.test.ts'] });
    requireCompleteCoverage(analyzeCoverage(changed, matrix, ledger));
  });
  rejected('duplicate graph test', 'E_DUPLICATE', () => analyzeCoverage({ ...graph, testCatalog: [...graph.testCatalog, graph.testCatalog[0]] }, matrix, ledger));
  rejected('shell operator', 'E_COMMAND', () => tokenizeExactCommand('npm run test && npm run forged'));
  rejected('stale receipt', 'E_RECEIPT_STALE', () => validateNormalReceipt({ ...receipt, buildId: 'wrong' }, receipt));
  rejected('visual downgraded to mechanical-only', 'E_VISUAL_ARTIFACT_GAP', () => {
    const changed = structuredClone(graph);
    delete changed.testCatalog[1].evidenceKinds;
    delete changed.testCatalog[1].visualArtifactPaths;
    const changedCoverage = requireCompleteCoverage(analyzeCoverage(changed, matrix, ledger));
    buildMappings({
      graph: changed,
      matrixRows: matrix,
      ledgerRows: ledger,
      coverage: changedCoverage,
      artifacts,
      visualByTest: new Map(),
      sourceSha: 'b'.repeat(40),
    });
  });
  return { ok: true, tests: coverage.testCount, feedback: coverage.feedbackCount, requirements: coverage.requirementCount, mutationCases: mutations };
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args['self-test']) {
    if (Object.keys(args).length !== 1) fail('E_ARGUMENT', '--self-test cannot be combined with other arguments.');
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }
  const modes = ['list', 'dry-run', 'run', 'resume'].filter((key) => args[key]);
  if (args['emit-finalizer-input']) modes.push('emit-finalizer-input');
  if (modes.length !== 1) fail('E_ARGUMENT', 'Choose exactly one of --list, --dry-run, --run, --resume, or --emit-finalizer-input <path>.');
  const repoRoot = DEFAULT_REPO_ROOT;
  const graphBytes = fs.readFileSync(path.join(repoRoot, GRAPH_PATH));
  const graph = JSON.parse(graphBytes.toString('utf8'));
  validatePass66BlockingCatalog(graph);
  const ledgerRows = parseLedger(fs.readFileSync(path.join(repoRoot, LEDGER_PATH), 'utf8'));
  const matrixRows = parseMatrix(fs.readFileSync(path.join(repoRoot, MATRIX_PATH), 'utf8'));
  const coverage = analyzeCoverage(graph, matrixRows, ledgerRows);
  const testIds = selectedTests(coverage, args.select);
  const overview = {
    schemaVersion: 1,
    mode: modes[0],
    catalog: { tests: coverage.testCount, feedbackRows: coverage.feedbackCount, requirements: coverage.requirementCount },
    orphanTests: coverage.orphanTests,
    orphanRequirements: coverage.orphanRequirements,
    selected: testIds.map((id) => ({ id, command: coverage.tests.get(id).command, feedbackIds: coverage.feedbackByTest.get(id) })),
  };
  if (args.list) {
    console.log(JSON.stringify(overview, null, 2));
    return;
  }
  if (!args.select) requireCompleteCoverage(coverage);
  else {
    const orphanSelected = testIds.filter((id) => coverage.orphanTests.includes(id));
    if (orphanSelected.length) fail('E_ORPHAN_TEST', `Selected tests have no owner-feedback basis: ${orphanSelected.join(', ')}.`);
  }
  const expectedSha = args['source-sha'];
  if (expectedSha && !SHA40.test(expectedSha)) fail('E_SOURCE_SHA', '--source-sha must be a lowercase 40-character SHA.');
  const sourceSha = exactSourceState(repoRoot, expectedSha);
  const graphDigest = sha256(graphBytes);

  if (args['emit-finalizer-input']) {
    if (args.select) fail('E_ARGUMENT', '--emit-finalizer-input requires the complete catalog and cannot use --select.');
    requireCompleteCoverage(coverage);
    const validated = validateAllReceiptFiles(repoRoot, sourceSha, coverage, graphDigest);
    const mappings = buildMappings({
      graph,
      matrixRows,
      ledgerRows,
      coverage,
      artifacts: validated.artifacts,
      visualByTest: validated.visualByTest,
      sourceSha,
    });
    const plan = finalizerPlan(args, sourceSha, validated.artifacts, mappings);
    const output = canonicalRelative(args['emit-finalizer-input'], '--emit-finalizer-input');
    if (!output.startsWith(`${RUNNER_ROOT}/`) || !output.endsWith('.json')) fail('E_PATH', `Finalizer input must be JSON below ${RUNNER_ROOT}.`);
    atomicWrite(absoluteBelow(repoRoot, output, 'finalizer input'), jsonBytes(plan));
    const coveragePath = `${RUNNER_ROOT}/pass66-owner-evidence-coverage-${sourceSha}.json`;
    atomicWrite(absoluteBelow(repoRoot, coveragePath), jsonBytes({
      schemaVersion: 1,
      sourceSha,
      graphSha256: graphDigest,
      feedbackRows: mappings.allFeedbackCoverage,
      requirements: mappings.requirementEvidence,
    }));
    console.log(JSON.stringify({ ...overview, ok: true, sourceSha, output, coveragePath, artifacts: validated.artifacts.length }, null, 2));
    return;
  }

  const actions = [];
  for (const testId of testIds) {
    const test = coverage.tests.get(testId);
    const feedbackIds = coverage.feedbackByTest.get(testId);
    if (testId === HARDWARE_TEST_ID) {
      const relativePath = hardwareReceiptPath(sourceSha);
      const absolutePath = absoluteBelow(repoRoot, relativePath, `${testId} receipt`);
      const before = testSnapshot(repoRoot, graphDigest, test, sourceSha);
      const validateExisting = () => validateHardwareArtifact({
        repoRoot, sourceSha, expectedFeedbackIds: feedbackIds, currentBuildManifest: before.buildManifest,
        ownerRelativePath: relativePath, readBytes: defaultHardwareReadBytes(repoRoot),
      });
      const resumeDecision = args.resume || args['dry-run']
        ? decideResumeAction({ exists: fs.existsSync(absolutePath), validateExisting })
        : { action: 'execute', reason: 'forced' };
      if (args['dry-run']) {
        const resumeState = resumeDecision.action === 'resume'
          ? 'valid-existing-schema-v2'
          : resumeDecision.reason === 'invalid' ? 'stale-existing-schema-v2' : 'missing-schema-v2';
        actions.push({
          testId,
          action: 'run-exact-command',
          resumeState,
          exactCommand: test.command,
          receiptPath: relativePath,
          note: '--run always executes the hardware command; --resume consumes only an exact valid schema-v2 artifact.',
        });
      } else if (args.resume && resumeDecision.action === 'resume') {
        actions.push({ testId, action: 'resumed-valid-schema-v2', receiptPath: relativePath });
      } else {
        const logPath = path.join(repoRoot, RUNNER_ROOT, 'logs', sourceSha, `${testId.toLowerCase()}.log`);
        const result = await execute(before.invocation, repoRoot, logPath, {
          schemaVersion: 1,
          sourceSha,
          testId,
          exactCommand: test.command,
          executable: before.invocation.executable.replaceAll('\\', '/'),
          args: before.invocation.args.map((value) => value.replaceAll('\\', '/')),
          buildSha256: before.buildDigest,
          verifierSha256: before.verifierDigest,
          environmentHash: before.environmentHash,
          receiptPolicy: 'command-produced-schema-v2-owner-artifact-only',
        });
        if (result.code !== 0 || result.signal) fail('E_TEST_FAILED', `${testId} exited code=${result.code} signal=${result.signal ?? '<none>'}; see ${path.relative(repoRoot, logPath)}.`);
        const after = testSnapshot(repoRoot, graphDigest, test, sourceSha);
        if (!sameSnapshot(before, after)) fail('E_POST_DRIFT', `${testId} changed source, build, verifier, or environment identity; generated evidence is rejected.`);
        validateHardwareArtifact({
          repoRoot, sourceSha, expectedFeedbackIds: feedbackIds, currentBuildManifest: after.buildManifest,
          ownerRelativePath: relativePath, readBytes: defaultHardwareReadBytes(repoRoot),
        });
        actions.push({
          testId,
          action: args.resume && resumeDecision.reason === 'invalid'
            ? 'reran-invalid-and-validated-schema-v2'
            : 'executed-and-validated-schema-v2',
          receiptPath: relativePath,
          logPath: path.relative(repoRoot, logPath).replaceAll('\\', '/'),
        });
      }
      continue;
    }
    const before = testSnapshot(repoRoot, graphDigest, test, sourceSha);
    const relativePath = receiptPathForTest(testId, sourceSha);
    const absolutePath = absoluteBelow(repoRoot, relativePath, `${testId} receipt`);
    const validateExisting = () => {
      const expected = receiptForSnapshot(repoRoot, test, before, feedbackIds);
      return validateNormalReceipt(JSON.parse(fs.readFileSync(absolutePath, 'utf8')), expected.receipt, `${testId} receipt`);
    };
    const resumeDecision = args.resume || args['dry-run']
      ? decideResumeAction({ exists: fs.existsSync(absolutePath), validateExisting })
      : { action: 'execute', reason: 'forced' };
    if (args['dry-run']) {
      const action = resumeDecision.action === 'resume'
        ? 'valid-existing'
        : resumeDecision.reason === 'invalid' ? 'stale-existing' : 'run';
      actions.push({ testId, action, exactCommand: test.command, receiptPath: relativePath, verifierSha256: before.verifierDigest, environmentHash: before.environmentHash, buildSha256: before.buildDigest });
      continue;
    }
    if (args.resume && resumeDecision.action === 'resume') {
      actions.push({ testId, action: 'resumed-valid', receiptPath: relativePath });
      continue;
    }
    const logPath = path.join(repoRoot, RUNNER_ROOT, 'logs', sourceSha, `${testId.toLowerCase()}.log`);
    const runStartedAtMs = Date.now();
    await attestNormalCommandAfterPass({
      testId,
      before,
      executeExact: () => execute(before.invocation, repoRoot, logPath, {
        schemaVersion: 1,
        sourceSha,
        testId,
        exactCommand: test.command,
        executable: before.invocation.executable.replaceAll('\\', '/'),
        args: before.invocation.args.map((value) => value.replaceAll('\\', '/')),
        buildSha256: before.buildDigest,
        verifierSha256: before.verifierDigest,
        environmentHash: before.environmentHash,
      }),
      snapshotAfter: () => testSnapshot(repoRoot, graphDigest, test, sourceSha),
      createAttestation: (after) => receiptForSnapshot(repoRoot, test, after, feedbackIds, { freshSinceMs: runStartedAtMs }),
      writeReceipt: (receipt) => atomicWrite(absolutePath, jsonBytes(receipt)),
      failureHint: ` See ${path.relative(repoRoot, logPath)}.`,
    });
    actions.push({
      testId,
      action: args.resume && resumeDecision.reason === 'invalid' ? 'reran-invalid-and-receipted' : 'passed-and-receipted',
      receiptPath: relativePath,
      logPath: path.relative(repoRoot, logPath).replaceAll('\\', '/'),
    });
  }
  console.log(JSON.stringify({ ...overview, ok: true, sourceSha, actions }, null, 2));
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(SCRIPT_PATH)) {
  main(process.argv.slice(2)).catch((caught) => {
    const code = caught instanceof EvidenceRunnerError ? caught.code : 'E_RUNNER';
    console.error(JSON.stringify({ ok: false, code, error: caught.message, stack: caught.stack }, null, 2));
    process.exitCode = 1;
  });
}
