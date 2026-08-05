#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAcceptanceManifest } from '../../../../scripts/release/acceptance-gate.mjs';
import {
  validateHardwareWebGl2BuildManifest,
  validateHardwareWebGl2DetailedReceipt,
} from '../../../../scripts/qa/pass65-hardware-webgl2-receipt-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..');

const LEDGER_PATH = 'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md';
const MATRIX_PATH = 'docs/PASS65_REQUIREMENTS_MATRIX.md';
const GRAPH_PATH = 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json';
const ACCEPTANCE_PATH = 'acceptance/pass-66.json';
const OWNER_ARTIFACT_ROOT = 'artifacts/pass65-owner-feedback/';
const HARDWARE_ARTIFACT_ROOT = 'artifacts/pass65/hardware-webgl2-admission/';
const HARDWARE_WEBGL2_TEST_ID = 'T-COLD-HARDWARE-WEBGL2';
const HARDWARE_WEBGL2_VERIFIER_ID = 'pass65-installed-chrome-hardware-webgl2-admission';
const HARDWARE_WEBGL2_VERIFIER_VERSION = '1';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ARTIFACT_ID = /^ART-[A-Z0-9-]+$/;
const ACCEPTANCE_KINDS = new Set(['mechanical', 'visual', 'human', 'mixed']);
const EVIDENCE_KINDS = new Set(['unit', 'contract', 'browser', 'trace', 'visual', 'manual']);
const MECHANICAL_EVIDENCE_KINDS = new Set(['unit', 'contract', 'browser', 'trace']);

export class FinalizationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'FinalizationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new FinalizationError(code, message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('E_ARGUMENT', `Unexpected argument ${token}.`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) values[key] = true;
    else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('E_INPUT_SHAPE', `${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail('E_INPUT_UNKNOWN_FIELD', `${label} contains unknown fields: ${unknown.sort().join(', ')}.`);
}

function sortedUnique(values, label) {
  if (!Array.isArray(values)) fail('E_INPUT_SHAPE', `${label} must be an array.`);
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || value.length === 0) fail('E_INPUT_SHAPE', `${label} contains an empty or non-string value.`);
    return value;
  });
  const sorted = [...new Set(normalized)].sort();
  if (sorted.length !== normalized.length) fail('E_INPUT_DUPLICATE', `${label} contains duplicate values.`);
  if (JSON.stringify(sorted) !== JSON.stringify(normalized)) fail('E_INPUT_ORDER', `${label} must be sorted lexicographically.`);
  return normalized;
}

function sameSet(left, right) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function parseLedger(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const row = cells(line);
    if (!row || row.length !== 7 || !/^HF-\d{3}$/.test(row[0])) continue;
    const [id, priority, outcome, owner, falsifier, scope, state] = row;
    rows.push({ id, priority, outcome, owner, falsifier, scope, state });
  }
  if (rows.length === 0) fail('E_LEDGER_EMPTY', 'No owner-feedback rows were parsed.');
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) fail('E_LEDGER_DUPLICATE', 'Owner-feedback ledger contains duplicate IDs.');
  return rows;
}

function parseMatrix(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const row = cells(line);
    if (!row || row.length !== 6 || !/^R\d{3}$/.test(row[0])) continue;
    const [id, requirement, expected, falsifier, evidence, state] = row;
    rows.push({ id, requirement, expected, falsifier, evidence, state });
  }
  if (rows.length === 0) fail('E_MATRIX_EMPTY', 'No planning requirements were parsed.');
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) fail('E_MATRIX_DUPLICATE', 'Planning matrix contains duplicate IDs.');
  return rows;
}

function normalizeRepositoryPath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) {
    fail('E_PATH', `${label} must be a non-empty repository-relative path.`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail('E_PATH', `${label} is not a canonical repository-relative path: ${value}.`);
  }
  return normalized;
}

export function isAllowedS0mPath(relativePath) {
  const normalized = String(relativePath).replaceAll('\\', '/');
  if ([LEDGER_PATH, GRAPH_PATH, ACCEPTANCE_PATH].includes(normalized)) return true;
  return [OWNER_ARTIFACT_ROOT, HARDWARE_ARTIFACT_ROOT].some((root) => {
    if (!normalized.startsWith(root) || !normalized.endsWith('.json')) return false;
    const remainder = normalized.slice(root.length);
    return remainder.length > '.json'.length
      && !remainder.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
  });
}

function safeAbsolute(repoRoot, relativePath) {
  const normalized = normalizeRepositoryPath(relativePath, 'Repository path');
  const absolute = path.resolve(repoRoot, normalized);
  const relation = path.relative(repoRoot, absolute);
  if (relation === '' || relation.startsWith('..') || path.isAbsolute(relation)) fail('E_PATH', `${normalized} escapes the repository.`);
  return absolute;
}

function uniqueIndex(items, key, label) {
  if (!Array.isArray(items)) fail('E_INPUT_SHAPE', `${label} must be an array.`);
  const index = new Map();
  for (const item of items) {
    const id = item?.[key];
    if (typeof id !== 'string' || id.length === 0) fail('E_INPUT_SHAPE', `${label} has an item without ${key}.`);
    if (index.has(id)) fail('E_INPUT_DUPLICATE', `${label} duplicates ${id}.`);
    index.set(id, item);
  }
  return index;
}

function validateIso(value, label) {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('E_TIMESTAMP', `${label} must be an ISO UTC timestamp.`);
  }
}

function canonicalReceipt(receipt) {
  if (receipt.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      kind: 'pass65-owner-feedback-evidence',
      sourceSha: receipt.sourceSha,
      buildId: receipt.buildId,
      verifierId: receipt.verifierId,
      verifierVersion: receipt.verifierVersion,
      environmentHash: receipt.environmentHash,
      result: receipt.result,
      feedbackIds: receipt.feedbackIds,
      testRefs: receipt.testRefs,
    };
  }
  if (receipt.schemaVersion === 2) {
    return {
      schemaVersion: 2,
      kind: 'pass65-owner-feedback-evidence',
      sourceSha: receipt.sourceSha,
      buildId: receipt.buildId,
      verifierId: receipt.verifierId,
      verifierVersion: receipt.verifierVersion,
      environmentHash: receipt.environmentHash,
      result: receipt.result,
      feedbackIds: receipt.feedbackIds,
      testRefs: receipt.testRefs,
      detailedReceiptPath: receipt.detailedReceiptPath,
      detailedReceiptSha256: receipt.detailedReceiptSha256,
      buildManifestPath: receipt.buildManifestPath,
      buildManifestSha256: receipt.buildManifestSha256,
    };
  }
  fail('E_ARTIFACT_SCHEMA', `Evidence receipt schemaVersion must be 1 or 2; received ${receipt.schemaVersion}.`);
}

function currentBuildManifest(repoRoot, sourceSha) {
  const root = path.join(repoRoot, 'dist');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('E_HARDWARE_BUILD', 'Current dist/ is missing.');
  const files = [];
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(child);
        files.push({ path: childRelative.replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: sha256(bytes) });
      }
    }
  }
  visit(root);
  return { schemaVersion: 1, sourceSha, files };
}

function validateReceiptMetadata(receipt, artifactSpec, sourceSha, feedbackIds, testIds, readBytes, repoRoot) {
  if (JSON.stringify(receipt) !== JSON.stringify(canonicalReceipt(receipt))) {
    fail('E_ARTIFACT_CANONICAL', `${artifactSpec.id} receipt has unknown, missing, reordered, or noncanonical fields.`);
  }
  if (receipt.kind !== 'pass65-owner-feedback-evidence') fail('E_ARTIFACT_KIND', `${artifactSpec.id} has the wrong receipt kind.`);
  if (receipt.sourceSha !== sourceSha) fail('E_ARTIFACT_SOURCE_SHA', `${artifactSpec.id} is bound to ${receipt.sourceSha}, not S0 ${sourceSha}.`);
  if (receipt.result !== 'passed') fail('E_ARTIFACT_RESULT', `${artifactSpec.id} result is ${receipt.result ?? '<missing>'}, not passed.`);
  if (typeof receipt.buildId !== 'string' || receipt.buildId.length < 3
    || typeof receipt.verifierId !== 'string' || receipt.verifierId.length < 3
    || typeof receipt.verifierVersion !== 'string' || receipt.verifierVersion.length < 1
    || !SHA256.test(receipt.environmentHash ?? '')) {
    fail('E_ARTIFACT_METADATA', `${artifactSpec.id} has incomplete build, verifier, or environment identity.`);
  }
  const receiptFeedback = sortedUnique(receipt.feedbackIds, `${artifactSpec.id}.feedbackIds`);
  const receiptTests = sortedUnique(receipt.testRefs, `${artifactSpec.id}.testRefs`);
  for (const feedbackId of receiptFeedback) if (!feedbackIds.has(feedbackId)) fail('E_ARTIFACT_FEEDBACK', `${artifactSpec.id} references unknown ${feedbackId}.`);
  for (const testRef of receiptTests) if (!testIds.has(testRef)) fail('E_ARTIFACT_TEST', `${artifactSpec.id} references unknown ${testRef}.`);

  if (receipt.schemaVersion === 2) {
    if (!receiptTests.includes(HARDWARE_WEBGL2_TEST_ID)) {
      fail('E_ARTIFACT_SCHEMA', `${artifactSpec.id} schema-v2 receipt does not attest ${HARDWARE_WEBGL2_TEST_ID}.`);
    }
    const detailDocuments = new Map();
    for (const [field, root] of [['detailedReceiptPath', HARDWARE_ARTIFACT_ROOT], ['buildManifestPath', HARDWARE_ARTIFACT_ROOT]]) {
      const relativePath = normalizeRepositoryPath(receipt[field], `${artifactSpec.id}.${field}`);
      if (!relativePath.startsWith(root) || !relativePath.endsWith('.json') || !isAllowedS0mPath(relativePath)) {
        fail('E_ARTIFACT_DETAIL_PATH', `${artifactSpec.id}.${field} is outside the allowed S0M hardware evidence root.`);
      }
      const expectedDigestField = field === 'detailedReceiptPath' ? 'detailedReceiptSha256' : 'buildManifestSha256';
      if (!SHA256.test(receipt[expectedDigestField] ?? '')) fail('E_ARTIFACT_DETAIL_DIGEST', `${artifactSpec.id}.${expectedDigestField} is invalid.`);
      const detailBytes = readBytes(relativePath);
      if (!detailBytes || sha256(detailBytes) !== receipt[expectedDigestField]) {
        fail('E_ARTIFACT_DETAIL_DIGEST', `${artifactSpec.id}.${field} is missing or its digest differs.`);
      }
      const detailJson = JSON.parse(Buffer.from(detailBytes).toString('utf8'));
      detailDocuments.set(field, detailJson);
      const detailSourceSha = field === 'detailedReceiptPath'
        ? (detailJson.source?.sha ?? detailJson.sourceSha)
        : detailJson.sourceSha;
      if (detailSourceSha !== sourceSha) fail('E_ARTIFACT_DETAIL_SOURCE', `${artifactSpec.id}.${field} is not bound to S0 ${sourceSha}.`);
    }
    const detailedReceipt = detailDocuments.get('detailedReceiptPath');
    const buildManifest = detailDocuments.get('buildManifestPath');
    const detailedFailures = validateHardwareWebGl2DetailedReceipt(detailedReceipt, {
      sourceSha,
      environmentHash: receipt.environmentHash,
      buildManifestSha256: receipt.buildManifestSha256,
    });
    if (detailedFailures.length > 0) fail('E_HARDWARE_DETAIL_CONTRACT', `${artifactSpec.id}: ${detailedFailures.join('; ')}.`);
    const buildFailures = validateHardwareWebGl2BuildManifest(buildManifest, { sourceSha });
    if (buildFailures.length > 0) fail('E_HARDWARE_BUILD_CONTRACT', `${artifactSpec.id}: ${buildFailures.join('; ')}.`);
    if (JSON.stringify(currentBuildManifest(repoRoot, sourceSha)) !== JSON.stringify(buildManifest)) {
      fail('E_HARDWARE_BUILD', `${artifactSpec.id} build manifest differs from current exact-S0 dist/ bytes.`);
    }
    const chromePath = detailedReceipt.environment?.chromeExecutable;
    if (typeof chromePath !== 'string' || !fs.existsSync(chromePath)
      || sha256(fs.readFileSync(chromePath)) !== detailedReceipt.environment?.chromeExecutableSha256) {
      fail('E_HARDWARE_CHROME', `${artifactSpec.id} installed Chrome identity differs from the detailed receipt.`);
    }
  } else if (receiptTests.includes(HARDWARE_WEBGL2_TEST_ID)) {
    fail('E_ARTIFACT_SCHEMA', `${artifactSpec.id} must use schemaVersion 2 for ${HARDWARE_WEBGL2_TEST_ID}.`);
  }
  return { receiptFeedback, receiptTests };
}

export function artifactIdForTest(testId) {
  return `ART-P66-${testId.replace(/^T-/, '')}`;
}

function verifierIdForTest(testId) {
  return testId === HARDWARE_WEBGL2_TEST_ID ? HARDWARE_WEBGL2_VERIFIER_ID : testId;
}

export function validateExactArtifactCatalog(graph, catalog) {
  const tests = uniqueIndex(graph?.testCatalog, 'id', 'testCatalog');
  const feedbackNodes = uniqueIndex(graph?.feedbackNodes, 'id', 'feedbackNodes');
  const expectedFeedbackByTest = new Map([...tests.keys()].map((testId) => [testId, []]));
  for (const node of feedbackNodes.values()) {
    const rawTestRefs = node.verification?.testRefs;
    if (!Array.isArray(rawTestRefs)) fail('E_INPUT_SHAPE', `${node.id}.verification.testRefs must be an array.`);
    if (rawTestRefs.some((testRef) => typeof testRef !== 'string' || testRef.length === 0)) {
      fail('E_INPUT_SHAPE', `${node.id}.verification.testRefs contains an empty or non-string value.`);
    }
    const testRefs = [...new Set(rawTestRefs)].sort();
    if (testRefs.length !== rawTestRefs.length) fail('E_INPUT_DUPLICATE', `${node.id}.verification.testRefs contains duplicate values.`);
    for (const testRef of testRefs) {
      if (!tests.has(testRef)) fail('E_ARTIFACT_TEST', `${node.id} references unknown ${testRef}.`);
      expectedFeedbackByTest.get(testRef).push(node.id);
    }
  }
  for (const feedbackIds of expectedFeedbackByTest.values()) feedbackIds.sort();

  if (!Array.isArray(catalog)) fail('E_INPUT_SHAPE', 'artifactCatalog must be an array.');
  const receiptByTest = new Map();
  for (const artifact of catalog) {
    const testRefs = sortedUnique(artifact?.testRefs, `${artifact?.id ?? '<unknown>'}.testRefs`);
    if (testRefs.length !== 1) {
      fail('E_ARTIFACT_TEST_CARDINALITY', `${artifact?.id ?? '<unknown>'} must attest exactly one catalog test.`);
    }
    const [testId] = testRefs;
    if (!tests.has(testId)) fail('E_ARTIFACT_TEST', `${artifact.id} references unknown ${testId}.`);
    if (receiptByTest.has(testId)) {
      fail('E_ARTIFACT_TEST_DUPLICATE', `${testId} has more than one evidence receipt.`);
    }
    const expectedArtifactId = artifactIdForTest(testId);
    if (artifact.id !== expectedArtifactId) {
      fail('E_ARTIFACT_CANONICAL_ID', `${testId} must use artifact ID ${expectedArtifactId}, not ${artifact.id}.`);
    }
    const expectedVerifierId = verifierIdForTest(testId);
    if (artifact.verifierId !== expectedVerifierId) {
      fail('E_ARTIFACT_VERIFIER', `${artifact.id} verifierId must be ${expectedVerifierId}, not ${artifact.verifierId ?? '<missing>'}.`);
    }
    if (testId === HARDWARE_WEBGL2_TEST_ID && artifact.verifierVersion !== HARDWARE_WEBGL2_VERIFIER_VERSION) {
      fail(
        'E_ARTIFACT_VERIFIER_VERSION',
        `${artifact.id} verifierVersion must be ${HARDWARE_WEBGL2_VERIFIER_VERSION}, not ${artifact.verifierVersion ?? '<missing>'}.`,
      );
    }
    const actualFeedback = sortedUnique(artifact.feedbackIds, `${artifact.id}.feedbackIds`);
    const expectedFeedback = expectedFeedbackByTest.get(testId);
    if (JSON.stringify(actualFeedback) !== JSON.stringify(expectedFeedback)) {
      fail(
        'E_ARTIFACT_FEEDBACK_SET',
        `${artifact.id} feedbackIds differ from graph-derived ${testId} coverage; expected=${expectedFeedback.join(',') || '<none>'}; actual=${actualFeedback.join(',') || '<none>'}.`,
      );
    }
    receiptByTest.set(testId, artifact);
  }

  const expectedTests = [...tests.keys()].sort();
  const actualTests = [...receiptByTest.keys()].sort();
  if (JSON.stringify(actualTests) !== JSON.stringify(expectedTests)) {
    const missing = expectedTests.filter((testId) => !receiptByTest.has(testId));
    const extra = actualTests.filter((testId) => !tests.has(testId));
    fail(
      'E_ARTIFACT_TEST_SET',
      `Evidence receipts differ from the exact graph test catalog; missing=${missing.join(',') || '<none>'}; extra=${extra.join(',') || '<none>'}.`,
    );
  }
  return catalog;
}

function buildArtifactCatalog(planArtifacts, sourceSha, graph, readBytes, repoRoot) {
  const feedbackIds = new Set(graph.feedbackNodes?.map((node) => node.id) ?? []);
  const testIds = new Set(graph.testCatalog?.map((test) => test.id) ?? []);
  const artifactSpecs = uniqueIndex(planArtifacts, 'id', 'artifacts');
  const catalog = [];
  const receiptById = new Map();
  const requiredCommitPaths = new Set();
  for (const artifactSpec of artifactSpecs.values()) {
    exactKeys(artifactSpec, ['id', 'path', 'sha256'], `artifacts.${artifactSpec.id}`);
    if (!ARTIFACT_ID.test(artifactSpec.id)) fail('E_ARTIFACT_ID', `${artifactSpec.id} is not a canonical artifact ID.`);
    const relativePath = normalizeRepositoryPath(artifactSpec.path, `${artifactSpec.id}.path`);
    if (!relativePath.startsWith(OWNER_ARTIFACT_ROOT) || !relativePath.endsWith('.json') || !isAllowedS0mPath(relativePath)) {
      fail('E_ARTIFACT_PATH', `${artifactSpec.id} must be a JSON receipt below ${OWNER_ARTIFACT_ROOT}.`);
    }
    if (!SHA256.test(artifactSpec.sha256 ?? '')) fail('E_ARTIFACT_DIGEST', `${artifactSpec.id}.sha256 is invalid.`);
    const bytes = readBytes(relativePath);
    if (!bytes) fail('E_ARTIFACT_MISSING', `${artifactSpec.id} receipt ${relativePath} does not exist.`);
    const digest = sha256(bytes);
    if (digest !== artifactSpec.sha256) fail('E_ARTIFACT_DIGEST', `${artifactSpec.id} expected ${artifactSpec.sha256}, found ${digest}.`);
    let receipt;
    try { receipt = JSON.parse(Buffer.from(bytes).toString('utf8')); }
    catch (caught) { fail('E_ARTIFACT_JSON', `${artifactSpec.id} is not JSON: ${caught.message}`); }
    validateReceiptMetadata(receipt, artifactSpec, sourceSha, feedbackIds, testIds, readBytes, repoRoot);
    const entry = {
      id: artifactSpec.id,
      path: relativePath,
      sha256: digest,
      sourceSha: receipt.sourceSha,
      buildId: receipt.buildId,
      verifierId: receipt.verifierId,
      verifierVersion: receipt.verifierVersion,
      environmentHash: receipt.environmentHash,
      result: receipt.result,
      feedbackIds: receipt.feedbackIds,
      testRefs: receipt.testRefs,
      ...(receipt.schemaVersion === 2 ? {
        detailedReceiptPath: receipt.detailedReceiptPath,
        detailedReceiptSha256: receipt.detailedReceiptSha256,
        buildManifestPath: receipt.buildManifestPath,
        buildManifestSha256: receipt.buildManifestSha256,
      } : {}),
    };
    catalog.push(entry);
    receiptById.set(artifactSpec.id, entry);
    requiredCommitPaths.add(relativePath);
    if (receipt.schemaVersion === 2) {
      requiredCommitPaths.add(receipt.detailedReceiptPath);
      requiredCommitPaths.add(receipt.buildManifestPath);
    }
  }
  catalog.sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
  validateExactArtifactCatalog(graph, catalog);
  return { catalog, receiptById, requiredCommitPaths };
}

function validatePlanIdentity(plan, sourceState) {
  exactKeys(plan, [
    'schemaVersion', 'kind', 'sourceSha', 'feedbackReceivedAt', 'acceptanceMode', 'preview',
    'humanAcceptance', 'artifacts', 'feedbackEvidence', 'requirementEvidence',
  ], 'plan');
  if (plan.schemaVersion !== 1 || plan.kind !== 'pass66-owner-evidence-finalization') {
    fail('E_PLAN_IDENTITY', 'Plan must use schemaVersion 1 and kind pass66-owner-evidence-finalization.');
  }
  if (!SHA40.test(plan.sourceSha ?? '')) fail('E_PLAN_SOURCE_SHA', 'Plan sourceSha must be an exact lowercase commit SHA.');
  if (sourceState.headSha !== plan.sourceSha) fail('E_SOURCE_HEAD', `Current HEAD ${sourceState.headSha} is not frozen S0 ${plan.sourceSha}.`);
  if (sourceState.status !== '') fail('E_SOURCE_DIRTY', 'Finalization requires a clean S0 worktree before any process-only outputs are written.');
  const drift = [...new Set((sourceState.changedPaths ?? []).map((entry) => String(entry).replaceAll('\\', '/')).filter(Boolean))].sort();
  if (drift.length > 0) fail('E_SOURCE_RUNTIME_DRIFT', `S0 already differs from the declared source: ${drift.join(', ')}.`);
  validateIso(plan.feedbackReceivedAt, 'feedbackReceivedAt');
  if (!['pre-approval', 'approved'].includes(plan.acceptanceMode)) fail('E_ACCEPTANCE_MODE', 'acceptanceMode must be pre-approval or approved.');
  exactKeys(plan.preview, ['kind', 'ref', 'sourceSha', 'createdAt'], 'preview');
  if (!['github-actions-artifact', 'immutable-url'].includes(plan.preview.kind)
    || typeof plan.preview.ref !== 'string' || plan.preview.ref.length === 0
    || plan.preview.sourceSha !== plan.sourceSha) {
    fail('E_PREVIEW', 'Preview must be immutable and bound to the exact S0 sourceSha.');
  }
  validateIso(plan.preview.createdAt, 'preview.createdAt');
  if (Date.parse(plan.preview.createdAt) < Date.parse(plan.feedbackReceivedAt)) fail('E_PREVIEW', 'Preview predates the feedback receipt.');
  if (plan.preview.kind === 'github-actions-artifact') {
    const match = /^pr-preview-[1-9][0-9]*-([0-9a-f]{40})$/.exec(plan.preview.ref);
    if (!match || match[1] !== plan.sourceSha) fail('E_PREVIEW', 'GitHub preview ref must be pr-preview-<pr>-<sourceSha>.');
  }
  if (plan.acceptanceMode === 'pre-approval') {
    if (plan.humanAcceptance !== undefined) fail('E_HUMAN_ACCEPTANCE', 'pre-approval plans must omit humanAcceptance.');
  } else {
    exactKeys(plan.humanAcceptance, ['state', 'approvedBy', 'approvedAt', 'evidence'], 'humanAcceptance');
    if (plan.humanAcceptance.state !== 'approved' || plan.humanAcceptance.approvedBy !== 'Dave'
      || typeof plan.humanAcceptance.evidence !== 'string' || plan.humanAcceptance.evidence.trim().length < 16) {
      fail('E_HUMAN_ACCEPTANCE', 'Approved plans require Dave, approved state, and concrete evidence text.');
    }
    validateIso(plan.humanAcceptance.approvedAt, 'humanAcceptance.approvedAt');
    if (Date.parse(plan.humanAcceptance.approvedAt) < Date.parse(plan.preview.createdAt)) {
      fail('E_HUMAN_ACCEPTANCE', 'Human acceptance predates the immutable preview.');
    }
  }
}

function updateLedger(ledgerText, ledgerRows, feedbackMappings) {
  const mappingById = new Map(feedbackMappings.map((mapping) => [mapping.feedbackId, mapping]));
  const eol = ledgerText.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalEol = /\r?\n$/.test(ledgerText);
  const updated = ledgerText.split(/\r?\n/).map((line) => {
    const row = cells(line);
    if (!row || row.length !== 7 || !mappingById.has(row[0])) return line;
    row[6] = 'VERIFIED';
    return `| ${row.join(' | ')} |`;
  });
  if (hadFinalEol && updated.at(-1) === '') updated.pop();
  const output = updated.join(eol) + (hadFinalEol ? eol : '');
  const updatedRows = parseLedger(output);
  for (const row of updatedRows) {
    if (['P0', 'P1'].includes(row.priority) && row.state !== 'VERIFIED') {
      fail('E_INCOMPLETE_P0_P1', `${row.id} remained ${row.state} after explicit finalization.`);
    }
  }
  if (updatedRows.length !== ledgerRows.length) fail('E_LEDGER_REWRITE', 'Ledger row count changed during state-only finalization.');
  return output;
}

function finalizeFeedback(graph, ledgerRows, feedbackEvidence, receiptById) {
  const mappings = uniqueIndex(feedbackEvidence, 'feedbackId', 'feedbackEvidence');
  const blockingRows = ledgerRows.filter((row) => ['P0', 'P1'].includes(row.priority));
  const blockingIds = blockingRows.map((row) => row.id).sort();
  if (!sameSet([...mappings.keys()], blockingIds)) {
    const missing = blockingIds.filter((id) => !mappings.has(id));
    const extra = [...mappings.keys()].filter((id) => !blockingIds.includes(id));
    fail('E_INCOMPLETE_P0_P1', `Explicit row mappings differ from all P0/P1 rows; missing=${missing.join(',') || '<none>'}; extra=${extra.join(',') || '<none>'}.`);
  }
  const nodeIndex = uniqueIndex(graph.feedbackNodes, 'id', 'feedbackNodes');
  for (const row of blockingRows) {
    const mapping = mappings.get(row.id);
    exactKeys(mapping, ['feedbackId', 'state', 'testEvidence'], `feedbackEvidence.${row.id}`);
    if (mapping.state !== 'VERIFIED') fail('E_ROW_STATE', `${row.id} may transition only to VERIFIED from mechanical evidence.`);
    const node = nodeIndex.get(row.id);
    if (!node) fail('E_ROW_NODE', `${row.id} has no completeness-graph node.`);
    const bindings = Array.isArray(mapping.testEvidence) ? mapping.testEvidence : fail('E_INPUT_SHAPE', `${row.id}.testEvidence must be an array.`);
    const bindingIndex = new Map();
    for (const binding of bindings) {
      exactKeys(binding, ['testRef', 'artifactId'], `${row.id}.testEvidence`);
      if (bindingIndex.has(binding.testRef)) fail('E_ROW_TEST_DUPLICATE', `${row.id} duplicates ${binding.testRef}.`);
      bindingIndex.set(binding.testRef, binding);
      const artifact = receiptById.get(binding.artifactId);
      if (!artifact) fail('E_ROW_ARTIFACT', `${row.id}/${binding.testRef} references unknown ${binding.artifactId}.`);
      if (!artifact.feedbackIds.includes(row.id) || !artifact.testRefs.includes(binding.testRef)) {
        fail('E_ROW_ARTIFACT_ATTESTATION', `${binding.artifactId} does not explicitly attest ${row.id}/${binding.testRef}.`);
      }
    }
    const expectedTests = Array.isArray(node.verification?.testRefs) ? node.verification.testRefs : [];
    if (!sameSet([...bindingIndex.keys()], expectedTests)) {
      fail('E_ROW_TEST_SET', `${row.id} must explicitly bind every graph test (${expectedTests.join(', ')}).`);
    }
    node.verification.coverage = 'complete';
    node.verification.artifactRefs = [...new Set(bindings.map((binding) => binding.artifactId))].sort();
  }
  return { mappings: [...mappings.values()], blockingIds };
}

function safeEvidenceReference(repoRoot, reference, kind, test, artifact, fileExists) {
  if (typeof reference !== 'string' || reference.length === 0) fail('E_REQUIREMENT_REF', 'Requirement evidence ref is required.');
  if (/^(?:https:\/\/|artifact:\/\/)/.test(reference)) {
    if (!['visual', 'manual'].includes(kind)) fail('E_REQUIREMENT_REF', `${kind} evidence must use a repository-local ref.`);
    return reference;
  }
  const normalized = normalizeRepositoryPath(reference, 'Requirement evidence ref');
  const allowedLocal = new Set([...(test.paths ?? []).map((entry) => String(entry).replaceAll('\\', '/')), artifact.path]);
  if (!allowedLocal.has(normalized)) {
    fail('E_REQUIREMENT_REF', `${normalized} is neither a declared ${test.id} path nor its exact receipt.`);
  }
  const absolute = safeAbsolute(repoRoot, normalized);
  if (!fileExists(absolute)) fail('E_REQUIREMENT_REF', `${normalized} does not exist.`);
  return normalized;
}

function validateAcceptanceEvidenceKinds(acceptance, evidence, planningId) {
  const kinds = new Set(evidence.map((entry) => entry.kind));
  if (['mechanical', 'mixed'].includes(acceptance)
    && ![...kinds].some((kind) => MECHANICAL_EVIDENCE_KINDS.has(kind))) {
    fail('E_REQUIREMENT_KIND', `${planningId} ${acceptance} acceptance lacks mechanical evidence.`);
  }
  if (['visual', 'mixed'].includes(acceptance) && (!kinds.has('browser') || !kinds.has('visual'))) {
    fail('E_REQUIREMENT_KIND', `${planningId} ${acceptance} acceptance requires browser and visual evidence.`);
  }
  if (acceptance === 'human' && !kinds.has('manual')) {
    fail('E_REQUIREMENT_KIND', `${planningId} human acceptance requires manual evidence.`);
  }
}

function buildAcceptance(plan, matrixRows, graph, ledgerRows, receiptById, repoRoot, fileExists) {
  const mappings = uniqueIndex(plan.requirementEvidence, 'planningRequirementId', 'requirementEvidence');
  const matrixIds = matrixRows.map((row) => row.id);
  if (!sameSet([...mappings.keys()], matrixIds)) {
    const missing = matrixIds.filter((id) => !mappings.has(id));
    const extra = [...mappings.keys()].filter((id) => !matrixIds.includes(id));
    fail('E_REQUIREMENT_SET', `Requirement mappings differ from the matrix; missing=${missing.join(',') || '<none>'}; extra=${extra.join(',') || '<none>'}.`);
  }
  const ledgerPriority = new Map(ledgerRows.map((row) => [row.id, row.priority]));
  const testIndex = uniqueIndex(graph.testCatalog, 'id', 'testCatalog');
  const p01FeedbackByRequirement = new Map(matrixIds.map((id) => [id, []]));
  for (const node of graph.feedbackNodes) {
    if (!['P0', 'P1'].includes(ledgerPriority.get(node.id))) continue;
    for (const planningId of node.planningRequirementIds ?? []) {
      if (p01FeedbackByRequirement.has(planningId)) p01FeedbackByRequirement.get(planningId).push(node.id);
    }
  }
  for (const feedbackIds of p01FeedbackByRequirement.values()) feedbackIds.sort();

  const usedArtifacts = new Set();
  const requirements = matrixRows.map((row, index) => {
    const mapping = mappings.get(row.id);
    exactKeys(mapping, ['planningRequirementId', 'acceptance', 'evidence'], `requirementEvidence.${row.id}`);
    if (!ACCEPTANCE_KINDS.has(mapping.acceptance)) fail('E_REQUIREMENT_ACCEPTANCE', `${row.id} has invalid acceptance type ${mapping.acceptance}.`);
    if (!Array.isArray(mapping.evidence) || mapping.evidence.length === 0) fail('E_REQUIREMENT_EVIDENCE', `${row.id} has no explicit evidence bindings.`);
    const coveredFeedback = new Set();
    const evidence = mapping.evidence.map((binding, bindingIndex) => {
      exactKeys(binding, ['kind', 'ref', 'testRef', 'artifactId', 'feedbackIds', 'note'], `${row.id}.evidence[${bindingIndex}]`);
      if (!EVIDENCE_KINDS.has(binding.kind)) fail('E_REQUIREMENT_KIND', `${row.id} uses invalid evidence kind ${binding.kind}.`);
      if (typeof binding.note !== 'string' || binding.note.trim().length < 16) fail('E_REQUIREMENT_NOTE', `${row.id} evidence note is too short.`);
      const feedbackIds = sortedUnique(binding.feedbackIds, `${row.id}.evidence[${bindingIndex}].feedbackIds`);
      const expectedFeedback = p01FeedbackByRequirement.get(row.id) ?? [];
      for (const feedbackId of feedbackIds) {
        if (!expectedFeedback.includes(feedbackId)) fail('E_REQUIREMENT_FEEDBACK', `${row.id} evidence includes unrelated ${feedbackId}.`);
        coveredFeedback.add(feedbackId);
      }
      const artifact = receiptById.get(binding.artifactId);
      if (!artifact) fail('E_REQUIREMENT_ARTIFACT', `${row.id} references unknown ${binding.artifactId}.`);
      const test = testIndex.get(binding.testRef);
      if (!test) fail('E_REQUIREMENT_TEST', `${row.id} references unknown ${binding.testRef}.`);
      if (!artifact.testRefs.includes(binding.testRef)
        || feedbackIds.some((feedbackId) => !artifact.feedbackIds.includes(feedbackId))) {
        fail('E_REQUIREMENT_ATTESTATION', `${binding.artifactId} does not explicitly attest ${row.id}/${binding.testRef}/${feedbackIds.join(',') || '<no-feedback>'}.`);
      }
      const ref = safeEvidenceReference(repoRoot, binding.ref, binding.kind, test, artifact, fileExists);
      usedArtifacts.add(binding.artifactId);
      return {
        kind: binding.kind,
        ref,
        ...(MECHANICAL_EVIDENCE_KINDS.has(binding.kind) ? { command: test.command } : {}),
        note: binding.note.trim(),
        artifactId: binding.artifactId,
        artifactSha256: artifact.sha256,
        sourceSha: plan.sourceSha,
        testRef: binding.testRef,
        feedbackIds,
      };
    }).sort((left, right) => left.kind.localeCompare(right.kind)
      || left.testRef.localeCompare(right.testRef)
      || left.artifactId.localeCompare(right.artifactId)
      || left.ref.localeCompare(right.ref));
    const expectedFeedback = p01FeedbackByRequirement.get(row.id) ?? [];
    if (!sameSet([...coveredFeedback], expectedFeedback)) {
      const missing = expectedFeedback.filter((id) => !coveredFeedback.has(id));
      fail('E_REQUIREMENT_FEEDBACK', `${row.id} omits explicit P0/P1 feedback bindings: ${missing.join(',') || '<none>'}.`);
    }
    validateAcceptanceEvidenceKinds(mapping.acceptance, evidence, row.id);
    return {
      id: `R${index + 1}`,
      planningRequirementId: row.id,
      summary: `${row.id} - ${row.requirement}`,
      expected: row.expected,
      falsifier: row.falsifier,
      acceptance: mapping.acceptance,
      state: 'verified',
      evidence,
    };
  });
  const manifest = {
    schemaVersion: 1,
    releasePass: 'PASS 66',
    feedbackReceivedAt: plan.feedbackReceivedAt,
    status: 'accepted',
    preview: plan.preview,
    ...(plan.acceptanceMode === 'approved' ? { humanAcceptance: plan.humanAcceptance } : {}),
    requirements,
  };
  return { manifest, usedArtifacts };
}

function validateGeneratedAcceptance(manifest, plan, repoRoot) {
  if (manifest.requirements.length === 0 || manifest.requirements.some((requirement) => requirement.state !== 'verified')) {
    fail('E_ACCEPTANCE_INCOMPLETE', 'Generated acceptance manifest has an unverified requirement.');
  }
  const policy = JSON.parse(fs.readFileSync(path.join(repoRoot, 'acceptance/policy.json'), 'utf8'));
  const result = validateAcceptanceManifest(manifest, { policy });
  if (plan.acceptanceMode === 'approved') {
    if (!result.ok) fail('E_ACCEPTANCE_GATE', `Generated approved manifest fails: ${result.errors.join('; ')}`);
  } else {
    const expected = ['humanAcceptance must be approved by Dave with timestamped evidence'];
    if (JSON.stringify(result.errors) !== JSON.stringify(expected)) {
      fail('E_ACCEPTANCE_GATE', `Pre-approval manifest must fail only humanAcceptance; got ${result.errors.join('; ') || '<none>'}.`);
    }
  }
}

export function buildFinalization({
  plan,
  ledgerText,
  matrixText,
  graph,
  sourceState,
  repoRoot = DEFAULT_REPO_ROOT,
  readBytes = (relativePath) => {
    const absolute = safeAbsolute(repoRoot, relativePath);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute) : null;
  },
  fileExists = (absolutePath) => fs.existsSync(absolutePath),
  validateAcceptance = true,
}) {
  validatePlanIdentity(plan, sourceState);
  if (graph?.schemaVersion !== 1 || graph.releasePass !== 'PASS 65' || graph.graphId !== 'pass65-owner-feedback-round1') {
    fail('E_GRAPH_IDENTITY', 'Owner-feedback graph is not the frozen Pass 65 Round 1 graph.');
  }
  if (graph.candidateEvidenceSourceSha !== null) fail('E_GRAPH_ALREADY_FINALIZED', 'Graph already names a candidate evidence source.');
  if (!Array.isArray(graph.artifactCatalog) || graph.artifactCatalog.length !== 0) {
    fail('E_GRAPH_ALREADY_FINALIZED', 'Development graph artifactCatalog must be empty before finalization.');
  }
  const ledgerRows = parseLedger(ledgerText);
  const matrixRows = parseMatrix(matrixText);
  const graphCopy = structuredClone(graph);
  const artifacts = buildArtifactCatalog(plan.artifacts, plan.sourceSha, graphCopy, readBytes, repoRoot);
  const feedback = finalizeFeedback(graphCopy, ledgerRows, plan.feedbackEvidence, artifacts.receiptById);
  graphCopy.candidateEvidenceSourceSha = plan.sourceSha;
  graphCopy.artifactCatalog = artifacts.catalog;
  const ledgerOutput = updateLedger(ledgerText, ledgerRows, feedback.mappings);
  const acceptance = buildAcceptance(plan, matrixRows, graphCopy, ledgerRows, artifacts.receiptById, repoRoot, fileExists);
  for (const artifactRef of graphCopy.feedbackNodes.flatMap((node) => node.verification?.artifactRefs ?? [])) {
    acceptance.usedArtifacts.add(artifactRef);
  }
  const unusedArtifacts = artifacts.catalog.map((artifact) => artifact.id).filter((id) => !acceptance.usedArtifacts.has(id));
  if (unusedArtifacts.length > 0) fail('E_ARTIFACT_UNUSED', `Artifact catalog contains unused receipts: ${unusedArtifacts.join(', ')}.`);
  if (validateAcceptance) validateGeneratedAcceptance(acceptance.manifest, plan, repoRoot);

  const outputs = new Map([
    [LEDGER_PATH, Buffer.from(ledgerOutput, 'utf8')],
    [GRAPH_PATH, jsonBytes(graphCopy)],
    [ACCEPTANCE_PATH, jsonBytes(acceptance.manifest)],
  ]);
  const requiredCommitPaths = new Set([...outputs.keys(), ...artifacts.requiredCommitPaths]);
  const forbidden = [...requiredCommitPaths].filter((relativePath) => !isAllowedS0mPath(relativePath));
  if (forbidden.length > 0) fail('E_OUTPUT_PATH', `Finalization would require forbidden S0M paths: ${forbidden.join(', ')}.`);
  const outputDigests = [...outputs.entries()].map(([relativePath, bytes]) => ({
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  }));
  return {
    sourceSha: plan.sourceSha,
    acceptanceMode: plan.acceptanceMode,
    blockingFeedbackRows: feedback.blockingIds.length,
    planningRequirements: matrixRows.length,
    artifacts: artifacts.catalog.length,
    requiredCommitPaths: [...requiredCommitPaths].sort(),
    outputDigests,
    outputs,
  };
}

export function writeFinalizationOutputs(result, repoRoot = DEFAULT_REPO_ROOT) {
  const previous = new Map();
  const written = [];
  try {
    for (const [relativePath, bytes] of result.outputs.entries()) {
      if (!isAllowedS0mPath(relativePath)) fail('E_OUTPUT_PATH', `Refusing to write forbidden path ${relativePath}.`);
      const absolute = safeAbsolute(repoRoot, relativePath);
      previous.set(relativePath, fs.existsSync(absolute) ? fs.readFileSync(absolute) : null);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, bytes);
      written.push(relativePath);
    }
  } catch (caught) {
    for (const relativePath of written.reverse()) {
      const absolute = safeAbsolute(repoRoot, relativePath);
      const bytes = previous.get(relativePath);
      if (bytes === null) fs.rmSync(absolute, { force: true });
      else fs.writeFileSync(absolute, bytes);
    }
    throw caught;
  }
}

function gitState(repoRoot, sourceSha) {
  const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  const headSha = git('rev-parse', 'HEAD');
  const status = git('status', '--porcelain', '--untracked-files=all');
  let changedPaths = [];
  if (SHA40.test(sourceSha ?? '') && SHA40.test(headSha)) {
    changedPaths = git('diff', '--name-only', '--no-renames', '--diff-filter=ACDMRTUXB', sourceSha, headSha)
      .split(/\r?\n/).filter(Boolean);
  }
  return { headSha, status, changedPaths };
}

function createReceipt({ sourceSha, buildId, verifierId, environmentHash, feedbackIds, testRefs }) {
  return {
    schemaVersion: 1,
    kind: 'pass65-owner-feedback-evidence',
    sourceSha,
    buildId,
    verifierId,
    verifierVersion: '1',
    environmentHash,
    result: 'passed',
    feedbackIds,
    testRefs,
  };
}

export function createSelfTestFixture() {
  const sourceSha = 'a'.repeat(40);
  const environmentHash = 'b'.repeat(64);
  const ledgerText = [
    '| ID | Pri | Outcome | Owner | Falsifier | Scope | State |',
    '|---|---|---|---|---|---|---|',
    '| HF-001 | P0 | First blocking outcome is exact. | Runtime | Exercise the first negative path mechanically. | All maps | OPEN |',
    '| HF-002 | P1 | Second blocking outcome is exact. | UI | Exercise the second negative path mechanically. | All menus | IMPLEMENTED |',
    '| HF-003 | P2 | Optional polish stays untouched. | Art | Review the optional polish independently. | Menu | OPEN |',
    '',
  ].join('\n');
  const matrixText = [
    '| ID | Requirement | Expected result | Falsifier | Required evidence | Status |',
    '|---|---|---|---|---|---|',
    '| R001 | Runtime truth | Runtime remains correct. | Runtime breaks under the negative fixture. | Exact receipt. | PLANNED |',
    '| R002 | Visual truth | Visual remains correct. | Served visual differs from the reference. | Browser and visual receipts. | PLANNED |',
    '',
  ].join('\n');
  const graph = {
    schemaVersion: 1,
    releasePass: 'PASS 65',
    graphId: 'pass65-owner-feedback-round1',
    candidateEvidenceSourceSha: null,
    testCatalog: [
      { id: 'T-A', command: 'node scripts/release/acceptance-gate.mjs', paths: ['scripts/release/acceptance-gate.mjs'] },
      {
        id: 'T-B',
        command: 'node --test .agents/skills/atomic-acres-owner-feedback-gate/scripts/finalize-pass66-owner-evidence.test.mjs',
        paths: ['.agents/skills/atomic-acres-owner-feedback-gate/scripts/finalize-pass66-owner-evidence.test.mjs'],
      },
    ],
    artifactCatalog: [],
    feedbackNodes: [
      { id: 'HF-001', planningRequirementIds: ['R001'], verification: { coverage: 'partial', testRefs: ['T-A'], artifactRefs: [] } },
      { id: 'HF-002', planningRequirementIds: ['R002'], verification: { coverage: 'partial', testRefs: ['T-B'], artifactRefs: [] } },
      { id: 'HF-003', planningRequirementIds: ['R002'], verification: { coverage: 'partial', testRefs: ['T-B'], artifactRefs: [] } },
    ],
  };
  const receipts = [
    createReceipt({ sourceSha, buildId: 'fixture-a', verifierId: 'T-A', environmentHash, feedbackIds: ['HF-001'], testRefs: ['T-A'] }),
    createReceipt({ sourceSha, buildId: 'fixture-b', verifierId: 'T-B', environmentHash, feedbackIds: ['HF-002', 'HF-003'], testRefs: ['T-B'] }),
  ];
  const receiptPaths = [
    `${OWNER_ARTIFACT_ROOT}fixture-a.json`,
    `${OWNER_ARTIFACT_ROOT}fixture-b.json`,
  ];
  const bytesByPath = new Map(receipts.map((receipt, index) => [receiptPaths[index], Buffer.from(JSON.stringify(receipt), 'utf8')]));
  const plan = {
    schemaVersion: 1,
    kind: 'pass66-owner-evidence-finalization',
    sourceSha,
    feedbackReceivedAt: '2026-07-29T00:00:00Z',
    acceptanceMode: 'pre-approval',
    preview: {
      kind: 'github-actions-artifact',
      ref: `pr-preview-66-${sourceSha}`,
      sourceSha,
      createdAt: '2026-07-30T00:00:00Z',
    },
    artifacts: receiptPaths.map((receiptPath, index) => ({
      id: artifactIdForTest(graph.testCatalog[index].id),
      path: receiptPath,
      sha256: sha256(bytesByPath.get(receiptPath)),
    })),
    feedbackEvidence: [
      { feedbackId: 'HF-001', state: 'VERIFIED', testEvidence: [{ testRef: 'T-A', artifactId: 'ART-P66-A' }] },
      { feedbackId: 'HF-002', state: 'VERIFIED', testEvidence: [{ testRef: 'T-B', artifactId: 'ART-P66-B' }] },
    ],
    requirementEvidence: [
      {
        planningRequirementId: 'R001', acceptance: 'mechanical', evidence: [{
          kind: 'contract', ref: 'scripts/release/acceptance-gate.mjs', testRef: 'T-A', artifactId: 'ART-P66-A',
          feedbackIds: ['HF-001'], note: 'Exact fixture receipt exercises the runtime falsifier.',
        }],
      },
      {
        planningRequirementId: 'R002', acceptance: 'mixed', evidence: [
          {
            kind: 'browser', ref: '.agents/skills/atomic-acres-owner-feedback-gate/scripts/finalize-pass66-owner-evidence.test.mjs', testRef: 'T-B', artifactId: 'ART-P66-B',
            feedbackIds: ['HF-002'], note: 'Served fixture exercises the visual browser falsifier.',
          },
          {
            kind: 'visual', ref: 'artifact://pass66-fixture/contact-sheet', testRef: 'T-B', artifactId: 'ART-P66-B',
            feedbackIds: ['HF-002'], note: 'Digest-bound contact sheet records the inspected visual state.',
          },
        ],
      },
    ],
  };
  return {
    plan,
    ledgerText,
    matrixText,
    graph,
    sourceState: { headSha: sourceSha, status: '', changedPaths: [] },
    bytesByPath,
  };
}

export function runSelfTest() {
  const fixture = createSelfTestFixture();
  const fakeRoot = DEFAULT_REPO_ROOT;
  const readBytes = (relativePath) => fixture.bytesByPath.get(relativePath) ?? null;
  const fileExists = (value) => fs.existsSync(value);
  const baseline = buildFinalization({ ...fixture, repoRoot: fakeRoot, readBytes, fileExists, validateAcceptance: true });
  const repeat = buildFinalization({ ...fixture, repoRoot: fakeRoot, readBytes, fileExists, validateAcceptance: true });
  if (JSON.stringify(baseline.outputDigests) !== JSON.stringify(repeat.outputDigests)) {
    fail('E_SELFTEST_DETERMINISM', 'Identical inputs produced different output digests.');
  }
  const cases = [];
  function rejected(name, code, mutate) {
    const candidate = createSelfTestFixture();
    mutate(candidate);
    try {
      buildFinalization({
        ...candidate,
        repoRoot: fakeRoot,
        readBytes: (relativePath) => candidate.bytesByPath.get(relativePath) ?? null,
        fileExists,
        validateAcceptance: false,
      });
      fail('E_SELFTEST_EXPECTATION', `${name} was accepted.`);
    } catch (caught) {
      if (!(caught instanceof FinalizationError) || caught.code !== code) {
        fail('E_SELFTEST_EXPECTATION', `${name} produced ${caught.code ?? caught.message}, expected ${code}.`);
      }
    }
    cases.push(name);
  }
  rejected('umbrella receipt cannot infer a missing row mapping', 'E_INCOMPLETE_P0_P1', (candidate) => candidate.plan.feedbackEvidence.pop());
  rejected('wrong S0 SHA', 'E_SOURCE_HEAD', (candidate) => { candidate.sourceState.headSha = 'c'.repeat(40); });
  rejected('dirty S0', 'E_SOURCE_DIRTY', (candidate) => { candidate.sourceState.status = ' M src/runtime.ts'; });
  rejected('runtime drift', 'E_SOURCE_RUNTIME_DRIFT', (candidate) => { candidate.sourceState.changedPaths = ['src/runtime.ts']; });
  rejected('incomplete row tests', 'E_ROW_TEST_SET', (candidate) => { candidate.plan.feedbackEvidence[0].testEvidence = []; });
  rejected('row/test not attested by receipt', 'E_ROW_ARTIFACT_ATTESTATION', (candidate) => { candidate.plan.feedbackEvidence[0].testEvidence[0].artifactId = 'ART-P66-B'; });
  rejected('wrong artifact digest', 'E_ARTIFACT_DIGEST', (candidate) => { candidate.plan.artifacts[0].sha256 = '0'.repeat(64); });
  rejected('artifact bound to another source SHA', 'E_ARTIFACT_SOURCE_SHA', (candidate) => {
    const artifact = candidate.plan.artifacts[0];
    const receipt = JSON.parse(candidate.bytesByPath.get(artifact.path).toString('utf8'));
    receipt.sourceSha = 'c'.repeat(40);
    const bytes = Buffer.from(JSON.stringify(receipt), 'utf8');
    candidate.bytesByPath.set(artifact.path, bytes);
    artifact.sha256 = sha256(bytes);
  });
  rejected('missing planning requirement', 'E_REQUIREMENT_SET', (candidate) => { candidate.plan.requirementEvidence.pop(); });
  rejected('missing explicit requirement feedback', 'E_REQUIREMENT_FEEDBACK', (candidate) => { candidate.plan.requirementEvidence[0].evidence[0].feedbackIds = []; });
  rejected('forbidden artifact path', 'E_ARTIFACT_PATH', (candidate) => { candidate.plan.artifacts[0].path = 'src/forged.json'; });
  rejected('premature human acceptance', 'E_HUMAN_ACCEPTANCE', (candidate) => {
    candidate.plan.acceptanceMode = 'approved';
    candidate.plan.humanAcceptance = { state: 'approved', approvedBy: 'Dave', approvedAt: '2026-07-29T23:00:00Z', evidence: 'Approval incorrectly predates the preview.' };
  });
  return { ok: true, deterministicOutputs: baseline.outputDigests.length, mutationCases: cases.length, cases };
}

function runStructuralGate(repoRoot) {
  execFileSync(process.execPath, [
    path.join(repoRoot, '.agents/skills/atomic-acres-owner-feedback-gate/scripts/verify-owner-feedback-ledger.mjs'),
    '--self-test',
  ], { cwd: repoRoot, stdio: 'pipe' });
}

function summary(result, mode, inputSha256) {
  return {
    ok: true,
    mode,
    sourceSha: result.sourceSha,
    acceptanceMode: result.acceptanceMode,
    inputSha256,
    blockingFeedbackRows: result.blockingFeedbackRows,
    planningRequirements: result.planningRequirements,
    artifacts: result.artifacts,
    outputDigests: result.outputDigests,
    requiredCommitPaths: result.requiredCommitPaths,
    nextGate: 'After committing only requiredCommitPaths as S0M, run npm run qa:pass65:owner-feedback:candidate.',
  };
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(SCRIPT_PATH)) {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args['self-test']) {
      if (Object.keys(args).length !== 1) fail('E_ARGUMENT', '--self-test cannot be combined with other arguments.');
      console.log(JSON.stringify(runSelfTest(), null, 2));
    } else {
      if (typeof args.input !== 'string') fail('E_ARGUMENT', '--input <absolute-or-relative-plan.json> is required.');
      const planMode = args.plan === true;
      const writeMode = args.write === true;
      if (planMode === writeMode) fail('E_ARGUMENT', 'Choose exactly one of --plan or --write.');
      const unknown = Object.keys(args).filter((key) => !['input', 'plan', 'write'].includes(key));
      if (unknown.length > 0) fail('E_ARGUMENT', `Unknown arguments: ${unknown.join(', ')}.`);
      const repoRoot = DEFAULT_REPO_ROOT;
      const inputPath = path.resolve(process.cwd(), args.input);
      const inputBytes = fs.readFileSync(inputPath);
      const plan = JSON.parse(inputBytes.toString('utf8'));
      runStructuralGate(repoRoot);
      const result = buildFinalization({
        plan,
        ledgerText: fs.readFileSync(path.join(repoRoot, LEDGER_PATH), 'utf8'),
        matrixText: fs.readFileSync(path.join(repoRoot, MATRIX_PATH), 'utf8'),
        graph: JSON.parse(fs.readFileSync(path.join(repoRoot, GRAPH_PATH), 'utf8')),
        sourceState: gitState(repoRoot, plan.sourceSha),
        repoRoot,
      });
      if (writeMode) {
        const stateBeforeWrite = gitState(repoRoot, plan.sourceSha);
        validatePlanIdentity(plan, stateBeforeWrite);
        writeFinalizationOutputs(result, repoRoot);
      }
      console.log(JSON.stringify(summary(result, writeMode ? 'write' : 'plan', sha256(inputBytes)), null, 2));
    }
  } catch (caught) {
    const code = caught instanceof FinalizationError ? caught.code : 'E_FINALIZER';
    console.error(JSON.stringify({ ok: false, code, error: caught.message }, null, 2));
    process.exitCode = 1;
  }
}
