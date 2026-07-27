import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_REQUIREMENTS_MATRIX.md');
const GRAPH_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json');
const AGENTS_PATH = path.join(REPO_ROOT, 'AGENTS.md');
const PACKAGE_PATH = path.join(REPO_ROOT, 'package.json');

const PASS65_SOURCE = Object.freeze({
  externalLocator: 'codex-attachment:2b63e579-2436-4434-b87a-18509ab11e92/pasted-text.txt',
  rawByteLength: 6132,
  rawSha256: '46615c6b4eb5610066661e82eb7f2eab20924d801d42904cedb5b130b672801b',
  normalizedRepositoryPath: 'docs/pass65-sources/attached-pass65-spec-2b63e579.txt',
  normalization: 'UTF-8; CRLF converted to LF; one final LF added; text semantics unchanged',
  normalizedByteLength: 6076,
  normalizedSha256: '7e9b0ed849df64f06350d9044f539cca1b26bd9bd9b15d693d561e55acceded4',
  outcomeCount: 45,
  outcomeProjectionSha256: 'ebd6f312bffc020a1171dfcbce729bd5630e09209e781f7d44b6cab6ad31f23b',
});
const LEDGER_SOURCE = Object.freeze({
  repositoryPath: 'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md',
  outcomeCount: 72,
  latestFeedbackId: 'HF-072',
  stateIndependentOutcomeSha256: 'd35cce42874b185a27b7bd47701248abdbfea62f06c9c3d25068b67b3bbf5bc1',
});
const MATRIX_SOURCE = Object.freeze({
  repositoryPath: 'docs/PASS65_REQUIREMENTS_MATRIX.md',
  requirementCount: 99,
  stateIndependentRequirementSha256: '1cbe6b58d1b16f6457b69705c40ef7a9f21ad5e67086f458adca25d128d64500',
});

function error(errors, code, message) {
  errors.push(`${code}: ${message}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function expandIdRange(value, prefix) {
  const pattern = prefix === 'HF'
    ? /^HF-(\d{3})(?:[\u2013-]HF-(\d{3}))?$/
    : /^R(\d{3})(?:[\u2013-]R(\d{3}))?$/;
  const parsed = pattern.exec(value);
  if (!parsed) return [];
  const start = Number(parsed[1]);
  const end = Number(parsed[2] ?? parsed[1]);
  if (end < start || end - start > 999) return [];
  const separator = prefix === 'HF' ? 'HF-' : 'R';
  return Array.from(
    { length: end - start + 1 },
    (_, offset) => `${separator}${String(start + offset).padStart(3, '0')}`,
  );
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function repositoryFile(relativePath, errors, code, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    error(errors, code, `${label} must be a non-empty repository-relative path.`);
    return null;
  }
  const absolutePath = path.resolve(REPO_ROOT, relativePath);
  const relation = path.relative(REPO_ROOT, absolutePath);
  if (relation === '' || relation.startsWith('..') || path.isAbsolute(relation)) {
    error(errors, code, `${label} escapes the repository: ${relativePath}.`);
    return null;
  }
  return absolutePath;
}

function parseLedger(ledger) {
  const feedbackRows = [];
  const mappingRows = [];
  for (const line of ledger.split(/\r?\n/)) {
    const row = cells(line);
    if (!row) continue;
    if (/^HF-\d{3}$/.test(row[0]) && row.length === 7) {
      const [id, priority, outcome, owner, falsifier, scope, state] = row;
      feedbackRows.push({ id, priority, outcome, owner, falsifier, scope, state });
    }
    if (/^HF-\d{3}(?:[\u2013-]HF-\d{3})?$/.test(row[0]) && row.length === 2) {
      mappingRows.push({ range: row[0], requirementList: row[1] });
    }
  }
  const section = ledger.split(/^## 4\. Canonical contract supersessions\s*$/m)[1]
    ?.split(/^## 5\./m)[0] ?? '';
  const supersessions = section.split(/\r?\n/).flatMap((line) => {
    const match = /^(\d+)\.\s+(.+)$/.exec(line.trim());
    return match ? [{ ordinal: Number(match[1]), text: match[2] }] : [];
  });
  return {
    feedbackRows,
    mappingRows,
    supersessions,
    latestIdMarker: /latest-id:\s*(HF-\d{3})/i.exec(ledger)?.[1] ?? null,
  };
}

function parseMatrix(matrix) {
  return matrix.split(/\r?\n/).flatMap((line) => {
    const row = cells(line);
    if (!row || !/^R\d{3}$/.test(row[0]) || row.length !== 6) return [];
    const [id, requirement, expected, falsifier, evidence, state] = row;
    return [{ id, requirement, expected, falsifier, evidence, state }];
  });
}

function validateLedgerAndMatrix(ledger, matrix, agents, errors, candidateMode) {
  const ledgerModel = parseLedger(ledger);
  const matrixRows = parseMatrix(matrix);
  const feedbackById = new Map();
  const allowedPriority = new Set(['P0', 'P1', 'P2']);
  const allowedState = new Set(['OPEN', 'IMPLEMENTED', 'VERIFIED', 'HITL']);

  if (ledgerModel.feedbackRows.length === 0) error(errors, 'E_LEDGER_EMPTY', 'No owner-feedback rows were parsed.');
  for (const row of ledgerModel.feedbackRows) {
    if (feedbackById.has(row.id)) error(errors, 'E_LEDGER_HF_DUPLICATE', `Duplicate feedback ID ${row.id}.`);
    feedbackById.set(row.id, row);
    if (!allowedPriority.has(row.priority)) error(errors, 'E_LEDGER_PRIORITY', `${row.id} has invalid priority ${row.priority || '<empty>'}.`);
    if (row.outcome.length < 16) error(errors, 'E_LEDGER_OUTCOME', `${row.id} has no concrete owner outcome.`);
    if (row.owner.length < 3) error(errors, 'E_LEDGER_OWNER', `${row.id} has no accountable owner lane.`);
    if (row.falsifier.length < 20) error(errors, 'E_LEDGER_FALSIFIER', `${row.id} has no mechanical falsifier/evidence recipe.`);
    if (row.scope.length < 2) error(errors, 'E_LEDGER_SCOPE', `${row.id} has no affected maps/modes scope.`);
    if (!allowedState.has(row.state)) error(errors, 'E_LEDGER_STATE', `${row.id} has invalid lifecycle state ${row.state || '<empty>'}.`);
    if (candidateMode && (row.priority === 'P0' || row.priority === 'P1') && !['VERIFIED', 'HITL'].includes(row.state)) {
      error(errors, 'E_CANDIDATE_STATE', `${row.id} is ${row.state}; candidate construction requires VERIFIED or HITL for ${row.priority}.`);
    }
  }

  const orderedIds = [...feedbackById.keys()].sort();
  const expectedIds = Array.from({ length: LEDGER_SOURCE.outcomeCount }, (_, index) => `HF-${String(index + 1).padStart(3, '0')}`);
  if (!sameArray(orderedIds, expectedIds)) {
    error(errors, 'E_LEDGER_HF_SET', `Feedback ID set differs from ${expectedIds[0]} through ${expectedIds.at(-1)}.`);
  }
  if (ledgerModel.latestIdMarker !== LEDGER_SOURCE.latestFeedbackId || ledgerModel.latestIdMarker !== orderedIds.at(-1)) {
    error(errors, 'E_LEDGER_LATEST_ID', `latest-id is ${ledgerModel.latestIdMarker ?? '<missing>'}; expected ${LEDGER_SOURCE.latestFeedbackId}.`);
  }

  const ledgerDigest = canonicalDigest(ledgerModel.feedbackRows.map(({ id, priority, outcome, owner, falsifier, scope }) => ({
    id, priority, outcome, owner, falsifier, scope,
  })));
  if (ledgerDigest !== LEDGER_SOURCE.stateIndependentOutcomeSha256) {
    error(errors, 'E_LEDGER_SOURCE_DIGEST', `State-independent ledger digest ${ledgerDigest} does not match the fixed Pass 65 source identity.`);
  }

  const matrixById = new Map();
  for (const row of matrixRows) {
    if (matrixById.has(row.id)) error(errors, 'E_MATRIX_REQUIREMENT_DUPLICATE', `Duplicate planning requirement ${row.id}.`);
    matrixById.set(row.id, row);
  }
  if (matrixRows.length !== MATRIX_SOURCE.requirementCount || matrixById.size !== MATRIX_SOURCE.requirementCount) {
    error(errors, 'E_MATRIX_REQUIREMENT_SET', `Planning matrix has ${matrixRows.length} rows and ${matrixById.size} unique IDs; expected 99 of each.`);
  }
  const matrixDigest = canonicalDigest(matrixRows.map(({ id, requirement, expected, falsifier, evidence }) => ({
    id, requirement, expected, falsifier, evidence,
  })));
  if (matrixDigest !== MATRIX_SOURCE.stateIndependentRequirementSha256) {
    error(errors, 'E_MATRIX_SOURCE_DIGEST', `State-independent matrix digest ${matrixDigest} does not match the fixed Pass 65 source identity.`);
  }

  const planningByFeedback = new Map();
  for (const mapping of ledgerModel.mappingRows) {
    const feedbackIds = expandIdRange(mapping.range, 'HF');
    if (feedbackIds.length === 0) error(errors, 'E_LEDGER_MAPPING_RANGE', `Invalid feedback mapping range ${mapping.range}.`);
    const requirements = mapping.requirementList.split(',').flatMap((part) => expandIdRange(part.trim(), 'R'));
    if (requirements.length === 0) error(errors, 'E_LEDGER_MAPPING_EMPTY', `${mapping.range} has no planning requirements.`);
    for (const requirement of requirements) {
      if (!matrixById.has(requirement)) error(errors, 'E_LEDGER_MAPPING_UNKNOWN_REQUIREMENT', `${mapping.range} references ${requirement}.`);
    }
    for (const feedbackId of feedbackIds) {
      if (planningByFeedback.has(feedbackId)) {
        error(errors, 'E_LEDGER_MAPPING_DUPLICATE', `${feedbackId} appears in more than one planning mapping.`);
      } else {
        planningByFeedback.set(feedbackId, requirements);
      }
    }
  }
  for (const feedbackId of feedbackById.keys()) {
    if (!planningByFeedback.has(feedbackId)) error(errors, 'E_LEDGER_MAPPING_MISSING', `${feedbackId} has no planning mapping.`);
  }
  for (const feedbackId of planningByFeedback.keys()) {
    if (!feedbackById.has(feedbackId)) error(errors, 'E_LEDGER_MAPPING_UNKNOWN_FEEDBACK', `Planning map references ${feedbackId}.`);
  }

  if (!agents.includes('qa:pass65:owner-feedback')) {
    error(errors, 'E_AGENTS_OWNER_GATE', 'AGENTS.md does not require the owner-feedback gate.');
  }
  if (!agents.includes('prerecorded, compressed')) {
    error(errors, 'E_AGENTS_PREVIEW_POLICY', 'AGENTS.md does not retain the prerecorded-preview invariant.');
  }
  return { ledgerModel, matrixRows, feedbackById, matrixById, planningByFeedback };
}

function uniqueIndex(items, label, errors, duplicateCode) {
  if (!Array.isArray(items)) {
    error(errors, duplicateCode, `${label} must be an array.`);
    return new Map();
  }
  const index = new Map();
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : '<missing>';
    if (index.has(id)) error(errors, duplicateCode, `${label} duplicates ${id}.`);
    else index.set(id, item);
  }
  return index;
}

function validateSources(graph, attachedOutcomes, ledgerModel, matrixRows, errors) {
  const sources = uniqueIndex(graph.sources, 'Source catalog', errors, 'E_GRAPH_SOURCE_DUPLICATE');
  if (sources.size !== 3) error(errors, 'E_GRAPH_SOURCE_SET', `Source catalog has ${sources.size} entries; expected exactly three fixed sources.`);
  const attached = sources.get('SRC-ATTACHED-SPEC-001');
  const ledgerSource = sources.get('SRC-CORRECTION-LEDGER-001');
  const matrixSource = sources.get('SRC-PLANNING-MATRIX-001');

  if (!attached) {
    error(errors, 'E_GRAPH_SOURCE_MISSING', 'Attached Pass 65 source is missing.');
  } else {
    for (const [key, expected] of Object.entries(PASS65_SOURCE)) {
      if (key === 'outcomeProjectionSha256') continue;
      if (attached[key] !== expected) error(errors, 'E_GRAPH_ATTACHED_SOURCE_STALE', `Attached source ${key} does not match its fixed identity.`);
    }
    if (attached.outcomeProjectionSha256 !== PASS65_SOURCE.outcomeProjectionSha256) {
      error(errors, 'E_GRAPH_ATTACHED_OUTCOME_DIGEST', 'Attached-source outcome digest declaration is stale.');
    }
    const normalizedPath = repositoryFile(attached.normalizedRepositoryPath, errors, 'E_GRAPH_ATTACHED_PATH', 'Attached normalized source');
    if (normalizedPath && !fs.existsSync(normalizedPath)) {
      error(errors, 'E_GRAPH_ATTACHED_MISSING', `${attached.normalizedRepositoryPath} does not exist.`);
    } else if (normalizedPath) {
      const normalizedBytes = fs.readFileSync(normalizedPath);
      const normalizedText = normalizedBytes.toString('utf8');
      if (normalizedBytes.byteLength !== PASS65_SOURCE.normalizedByteLength || sha256(normalizedBytes) !== PASS65_SOURCE.normalizedSha256) {
        error(errors, 'E_GRAPH_ATTACHED_NORMALIZED_DIGEST', 'Normalized attached source bytes do not match the fixed identity.');
      }
      if (normalizedText.includes('\r') || !normalizedText.endsWith('\n')) {
        error(errors, 'E_GRAPH_ATTACHED_NORMALIZATION', 'Normalized attached source must contain LF only and exactly one final LF.');
      } else {
        const reconstructedRaw = Buffer.from(normalizedText.slice(0, -1).replace(/\n/g, '\r\n'), 'utf8');
        if (reconstructedRaw.byteLength !== PASS65_SOURCE.rawByteLength || sha256(reconstructedRaw) !== PASS65_SOURCE.rawSha256) {
          error(errors, 'E_GRAPH_ATTACHED_RAW_IDENTITY', 'The declared CRLF-to-LF normalization does not reconstruct the fixed raw attachment identity.');
        }
      }
      const nonBlankLines = normalizedText.slice(0, -1).split('\n').flatMap((line, index) => line.trim().length > 0 ? [index + 1] : []);
      const declaredLineAtoms = attached.lineAtomCounts ?? {};
      const declaredLines = Object.keys(declaredLineAtoms).map(Number).sort((a, b) => a - b);
      if (!sameArray(declaredLines, nonBlankLines)) {
        error(errors, 'E_GRAPH_SOURCE_LINE_COVERAGE', 'Every non-blank attached-source line must have an explicit atom count, with no extra lines.');
      }
      const atomsByLine = new Map();
      for (const outcome of attachedOutcomes) {
        const locator = /^L(\d+)#(\d+)$/.exec(outcome?.sourceLocator ?? '');
        if (!locator) continue;
        const line = Number(locator[1]);
        const atom = Number(locator[2]);
        if (!atomsByLine.has(line)) atomsByLine.set(line, []);
        atomsByLine.get(line).push(atom);
      }
      for (const line of declaredLines) {
        const expectedAtoms = Array.from({ length: declaredLineAtoms[String(line)] }, (_, index) => index + 1);
        const actualAtoms = [...(atomsByLine.get(line) ?? [])].sort((a, b) => a - b);
        if (!sameArray(actualAtoms, expectedAtoms)) {
          error(errors, 'E_GRAPH_SOURCE_ATOM_COVERAGE', `Attached source line ${line} atoms are ${actualAtoms.join(',') || '<none>'}; expected ${expectedAtoms.join(',')}.`);
        }
      }
    }
  }

  if (!ledgerSource) {
    error(errors, 'E_GRAPH_SOURCE_MISSING', 'Correction-ledger source is missing.');
  } else {
    for (const [key, expected] of Object.entries(LEDGER_SOURCE)) {
      if (ledgerSource[key] !== expected) error(errors, 'E_GRAPH_LEDGER_SOURCE_STALE', `Correction-ledger source ${key} is stale.`);
    }
    if (ledgerSource.ledgerVersion !== 1 || ledgerModel.feedbackRows.length !== LEDGER_SOURCE.outcomeCount) {
      error(errors, 'E_GRAPH_LEDGER_SOURCE_COUNT', 'Correction-ledger source metadata does not resolve to 72 outcomes.');
    }
  }
  if (!matrixSource) {
    error(errors, 'E_GRAPH_SOURCE_MISSING', 'Planning-matrix source is missing.');
  } else {
    for (const [key, expected] of Object.entries(MATRIX_SOURCE)) {
      if (matrixSource[key] !== expected) error(errors, 'E_GRAPH_MATRIX_SOURCE_STALE', `Planning-matrix source ${key} is stale.`);
    }
    if (matrixRows.length !== MATRIX_SOURCE.requirementCount) {
      error(errors, 'E_GRAPH_MATRIX_SOURCE_COUNT', 'Planning-matrix source metadata does not resolve to 99 requirements.');
    }
  }
}

function validateArtifacts(graph, artifactIndex, testIndex, feedbackById, errors, options) {
  const candidateMode = options.candidateMode === true;
  const candidateSha = graph.candidateEvidenceSourceSha;
  if (candidateMode && !/^[0-9a-f]{40}$/.test(candidateSha ?? '')) {
    error(errors, 'E_CANDIDATE_SOURCE_SHA', 'candidateEvidenceSourceSha must be an exact 40-character commit SHA.');
  }
  for (const artifact of artifactIndex.values()) {
    const relativePath = artifact.path;
    if (typeof relativePath !== 'string' || !relativePath.replace(/\\/g, '/').startsWith('artifacts/pass65-owner-feedback/')) {
      error(errors, 'E_GRAPH_ARTIFACT_PATH', `${artifact.id} must live below artifacts/pass65-owner-feedback/.`);
      continue;
    }
    const artifactPath = repositoryFile(relativePath, errors, 'E_GRAPH_ARTIFACT_PATH', artifact.id);
    let bytes = options.artifactBytesByPath?.get(relativePath);
    if (!bytes && artifactPath && fs.existsSync(artifactPath)) bytes = fs.readFileSync(artifactPath);
    if (!bytes) {
      error(errors, 'E_GRAPH_ARTIFACT_MISSING', `${artifact.id} evidence file ${relativePath} does not exist.`);
      continue;
    }
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (!/^[0-9a-f]{64}$/.test(artifact.sha256 ?? '') || sha256(bytes) !== artifact.sha256) {
      error(errors, 'E_CANDIDATE_ARTIFACT_DIGEST', `${artifact.id} digest does not match its evidence bytes.`);
    }
    if (!/^[0-9a-f]{40}$/.test(artifact.sourceSha ?? '') || (candidateMode && artifact.sourceSha !== candidateSha)) {
      error(errors, 'E_CANDIDATE_ARTIFACT_SOURCE_SHA', `${artifact.id} is not bound to the exact candidate SHA.`);
    }
    if (!/^[0-9a-f]{64}$/.test(artifact.environmentHash ?? '')) {
      error(errors, 'E_GRAPH_ARTIFACT_ENVIRONMENT', `${artifact.id} lacks a 64-character environment hash.`);
    }
    if (typeof artifact.buildId !== 'string' || artifact.buildId.length < 3
      || typeof artifact.verifierId !== 'string' || artifact.verifierId.length < 3
      || typeof artifact.verifierVersion !== 'string' || artifact.verifierVersion.length < 1
      || artifact.result !== 'passed') {
      error(errors, 'E_GRAPH_ARTIFACT_METADATA', `${artifact.id} has incomplete verifier/build/result metadata.`);
    }
    const feedbackIds = Array.isArray(artifact.feedbackIds) ? artifact.feedbackIds : [];
    const testRefs = Array.isArray(artifact.testRefs) ? artifact.testRefs : [];
    for (const duplicate of duplicateValues(feedbackIds)) error(errors, 'E_GRAPH_ARTIFACT_FEEDBACK_DUPLICATE', `${artifact.id} duplicates ${duplicate}.`);
    for (const duplicate of duplicateValues(testRefs)) error(errors, 'E_GRAPH_ARTIFACT_TEST_DUPLICATE', `${artifact.id} duplicates ${duplicate}.`);
    for (const feedbackId of feedbackIds) if (!feedbackById.has(feedbackId)) error(errors, 'E_GRAPH_ARTIFACT_UNKNOWN_FEEDBACK', `${artifact.id} references ${feedbackId}.`);
    for (const testRef of testRefs) if (!testIndex.has(testRef)) error(errors, 'E_GRAPH_ARTIFACT_UNKNOWN_TEST', `${artifact.id} references ${testRef}.`);
    try {
      const receipt = JSON.parse(bytes.toString('utf8'));
      const expectedReceipt = {
        schemaVersion: 1,
        kind: 'pass65-owner-feedback-evidence',
        sourceSha: artifact.sourceSha,
        buildId: artifact.buildId,
        verifierId: artifact.verifierId,
        verifierVersion: artifact.verifierVersion,
        environmentHash: artifact.environmentHash,
        result: artifact.result,
        feedbackIds,
        testRefs,
      };
      if (JSON.stringify(receipt) !== JSON.stringify(expectedReceipt)) {
        error(errors, 'E_GRAPH_ARTIFACT_RECEIPT', `${artifact.id} receipt content does not exactly mirror its catalog entry.`);
      }
    } catch {
      error(errors, 'E_GRAPH_ARTIFACT_RECEIPT', `${artifact.id} evidence is not a valid canonical JSON receipt.`);
    }
  }
}

function validateGraph(graph, ledgerContext, packageJson, errors, options) {
  const { ledgerModel, matrixRows, feedbackById, matrixById, planningByFeedback } = ledgerContext;
  if (graph?.schemaVersion !== 1 || graph.releasePass !== 'PASS 65' || graph.graphId !== 'pass65-owner-feedback-round1') {
    error(errors, 'E_GRAPH_IDENTITY', 'Completeness graph identity/schema does not match Pass 65 Round 1.');
  }
  if (!options.candidateMode && graph.candidateEvidenceSourceSha !== null) {
    error(errors, 'E_GRAPH_PREMATURE_CANDIDATE_SHA', 'Development graph must keep candidateEvidenceSourceSha null until immutable candidate evidence exists.');
  }

  const attachedOutcomes = Array.isArray(graph.attachedSpecOutcomes) ? graph.attachedSpecOutcomes : [];
  const attachedIndex = uniqueIndex(attachedOutcomes, 'Attached source outcome', errors, 'E_GRAPH_OUTCOME_DUPLICATE');
  if (attachedOutcomes.length !== PASS65_SOURCE.outcomeCount) {
    error(errors, 'E_GRAPH_OUTCOME_COUNT', `Attached source has ${attachedOutcomes.length} outcomes; expected ${PASS65_SOURCE.outcomeCount}.`);
  }
  const outcomeProjection = attachedOutcomes.map(({ id, sourceLocator, normalizedOutcome, feedbackIds, planningRequirementIds }) => ({
    id, sourceLocator, normalizedOutcome, feedbackIds, planningRequirementIds,
  }));
  if (canonicalDigest(outcomeProjection) !== PASS65_SOURCE.outcomeProjectionSha256) {
    error(errors, 'E_GRAPH_ATTACHED_OUTCOME_DIGEST', 'Attached-source outcome projection differs from the fixed reviewed projection.');
  }
  const expectedOutcomeIds = Array.from({ length: PASS65_SOURCE.outcomeCount }, (_, index) => `SPEC-${String(index + 1).padStart(3, '0')}`);
  if (!sameArray([...attachedIndex.keys()].sort(), expectedOutcomeIds)) {
    error(errors, 'E_GRAPH_OUTCOME_SET', 'Attached outcome IDs are not the fixed SPEC-001 through SPEC-045 set.');
  }
  for (const outcome of attachedOutcomes) {
    if (!/^L\d+#\d+$/.test(outcome?.sourceLocator ?? '') || typeof outcome.normalizedOutcome !== 'string' || outcome.normalizedOutcome.length < 8) {
      error(errors, 'E_GRAPH_OUTCOME_SHAPE', `${outcome?.id ?? '<missing>'} lacks an executable source locator/outcome.`);
    }
    for (const duplicate of duplicateValues(outcome.feedbackIds ?? [])) error(errors, 'E_GRAPH_OUTCOME_FEEDBACK_DUPLICATE', `${outcome.id} duplicates ${duplicate}.`);
    for (const duplicate of duplicateValues(outcome.planningRequirementIds ?? [])) error(errors, 'E_GRAPH_OUTCOME_PLANNING_DUPLICATE', `${outcome.id} duplicates ${duplicate}.`);
    if (!Array.isArray(outcome.feedbackIds) || outcome.feedbackIds.length === 0) error(errors, 'E_GRAPH_OUTCOME_ORPHAN', `${outcome.id} has no feedback path.`);
    if (!Array.isArray(outcome.planningRequirementIds) || outcome.planningRequirementIds.length === 0) error(errors, 'E_GRAPH_OUTCOME_PLANNING_MISSING', `${outcome.id} has no planning path.`);
    for (const feedbackId of outcome.feedbackIds ?? []) if (!feedbackById.has(feedbackId)) error(errors, 'E_GRAPH_OUTCOME_UNKNOWN_FEEDBACK', `${outcome.id} references ${feedbackId}.`);
    for (const requirementId of outcome.planningRequirementIds ?? []) if (!matrixById.has(requirementId)) error(errors, 'E_GRAPH_OUTCOME_UNKNOWN_PLANNING', `${outcome.id} references ${requirementId}.`);
  }
  validateSources(graph, attachedOutcomes, ledgerModel, matrixRows, errors);

  const projection = graph.correctionOutcomeProjection ?? {};
  const expectedProjection = {
    sourceId: 'SRC-CORRECTION-LEDGER-001',
    outcomeIdTemplate: 'CORR-{feedbackId}',
    sourceLocatorTemplate: '{feedbackId}.observation',
    feedbackIdStart: 'HF-001',
    feedbackIdEnd: 'HF-072',
  };
  if (JSON.stringify(projection) !== JSON.stringify(expectedProjection)) {
    error(errors, 'E_GRAPH_CORRECTION_PROJECTION', 'Correction outcome projection is stale or incomplete.');
  }
  const correctionOutcomeIds = new Set([...feedbackById.keys()].map((feedbackId) => `CORR-${feedbackId}`));
  const knownOutcomeIds = new Set([...attachedIndex.keys(), ...correctionOutcomeIds]);

  const graphSupersessions = Array.isArray(graph.supersessions) ? graph.supersessions : [];
  const supersessionIndex = uniqueIndex(graphSupersessions, 'Supersession', errors, 'E_GRAPH_SUPERSESSION_DUPLICATE');
  if (graphSupersessions.length !== ledgerModel.supersessions.length) {
    error(errors, 'E_GRAPH_SUPERSESSION_SET', `Graph has ${graphSupersessions.length} supersessions; ledger has ${ledgerModel.supersessions.length}.`);
  }
  for (const ledgerSupersession of ledgerModel.supersessions) {
    const id = `SUP-${String(ledgerSupersession.ordinal).padStart(3, '0')}`;
    const item = supersessionIndex.get(id);
    if (!item || item.ledgerOrdinal !== ledgerSupersession.ordinal || item.canonicalText !== ledgerSupersession.text) {
      error(errors, 'E_GRAPH_SUPERSESSION_STALE', `${id} does not exactly match the canonical ledger text.`);
      continue;
    }
    if (!Array.isArray(item.sourceOutcomeIds) || item.sourceOutcomeIds.length === 0) error(errors, 'E_GRAPH_SUPERSESSION_SOURCE_MISSING', `${id} has no source outcome.`);
    if (!Array.isArray(item.feedbackIds) || item.feedbackIds.length === 0) error(errors, 'E_GRAPH_SUPERSESSION_FEEDBACK_MISSING', `${id} has no feedback outcome.`);
    for (const duplicate of duplicateValues(item.sourceOutcomeIds ?? [])) error(errors, 'E_GRAPH_SUPERSESSION_SOURCE_DUPLICATE', `${id} duplicates ${duplicate}.`);
    for (const duplicate of duplicateValues(item.feedbackIds ?? [])) error(errors, 'E_GRAPH_SUPERSESSION_FEEDBACK_DUPLICATE', `${id} duplicates ${duplicate}.`);
    for (const sourceOutcomeId of item.sourceOutcomeIds ?? []) if (!knownOutcomeIds.has(sourceOutcomeId)) error(errors, 'E_GRAPH_SUPERSESSION_UNKNOWN_SOURCE', `${id} references ${sourceOutcomeId}.`);
    for (const feedbackId of item.feedbackIds ?? []) if (!feedbackById.has(feedbackId)) error(errors, 'E_GRAPH_SUPERSESSION_UNKNOWN_FEEDBACK', `${id} references ${feedbackId}.`);
  }

  const testIndex = uniqueIndex(graph.testCatalog, 'Test catalog', errors, 'E_GRAPH_TEST_DUPLICATE');
  for (const test of testIndex.values()) {
    if (!/^T-[A-Z0-9-]+$/.test(test.id) || typeof test.command !== 'string' || test.command.length < 5 || /[\r\n]|&&|\|\||;|`|\$\(/.test(test.command)) {
      error(errors, 'E_GRAPH_TEST_COMMAND', `${test.id} has an invalid or compound executable command.`);
    }
    const npmScript = /^npm run ([^\s]+)(?:\s|$)/.exec(test.command)?.[1];
    if (npmScript && typeof packageJson.scripts?.[npmScript] !== 'string') {
      error(errors, 'E_GRAPH_TEST_SCRIPT_MISSING', `${test.id} references missing package script ${npmScript}.`);
    }
    if (!Array.isArray(test.paths) || test.paths.length === 0) error(errors, 'E_GRAPH_TEST_PATH_MISSING', `${test.id} has no implementation/test path.`);
    for (const duplicate of duplicateValues(test.paths ?? [])) error(errors, 'E_GRAPH_TEST_PATH_DUPLICATE', `${test.id} duplicates ${duplicate}.`);
    for (const relativePath of test.paths ?? []) {
      const testPath = repositoryFile(relativePath, errors, 'E_GRAPH_TEST_PATH', `${test.id} path`);
      if (testPath && !fs.existsSync(testPath)) error(errors, 'E_GRAPH_TEST_PATH_MISSING', `${test.id} path ${relativePath} does not exist.`);
    }
  }

  const artifactIndex = uniqueIndex(graph.artifactCatalog, 'Artifact catalog', errors, 'E_GRAPH_ARTIFACT_DUPLICATE');
  validateArtifacts(graph, artifactIndex, testIndex, feedbackById, errors, options);

  const graphNodes = Array.isArray(graph.feedbackNodes) ? graph.feedbackNodes : [];
  const nodeIndex = uniqueIndex(graphNodes, 'Feedback node', errors, 'E_GRAPH_HF_DUPLICATE');
  const expectedFeedbackIds = [...feedbackById.keys()].sort();
  if (!sameArray([...nodeIndex.keys()].sort(), expectedFeedbackIds)) {
    error(errors, 'E_GRAPH_HF_SET', 'Feedback graph nodes do not have set equality with all 72 correction rows.');
  }
  for (const feedbackId of expectedFeedbackIds) {
    const node = nodeIndex.get(feedbackId);
    const ledgerRow = feedbackById.get(feedbackId);
    if (!node) continue;
    if (typeof node.canonicalOwner !== 'string' || node.canonicalOwner.length < 3) {
      error(errors, 'E_GRAPH_OWNER_UNOWNED', `${feedbackId} has no executable owner.`);
    }
    if (node.canonicalOwner !== ledgerRow.owner || node.ownerSource !== 'SRC-CORRECTION-LEDGER-001') {
      error(errors, 'E_GRAPH_OWNER_STALE', `${feedbackId} owner does not exactly match the canonical correction ledger.`);
    }
    const expectedPlanning = planningByFeedback.get(feedbackId) ?? [];
    if (!sameArray(node.planningRequirementIds, expectedPlanning)) {
      error(errors, 'E_GRAPH_PLANNING_STALE', `${feedbackId} planning projection differs from the canonical ledger mapping.`);
    }
    for (const duplicate of duplicateValues(node.sourceOutcomeIds ?? [])) error(errors, 'E_GRAPH_HF_SOURCE_DUPLICATE', `${feedbackId} duplicates ${duplicate}.`);
    if (!Array.isArray(node.sourceOutcomeIds) || !node.sourceOutcomeIds.includes(`CORR-${feedbackId}`)) {
      error(errors, 'E_GRAPH_HF_SOURCE_MISSING', `${feedbackId} lacks its canonical correction outcome.`);
    }
    for (const sourceOutcomeId of node.sourceOutcomeIds ?? []) if (!knownOutcomeIds.has(sourceOutcomeId)) error(errors, 'E_GRAPH_HF_SOURCE_UNKNOWN', `${feedbackId} references ${sourceOutcomeId}.`);

    const verification = node.verification ?? {};
    const testRefs = Array.isArray(verification.testRefs) ? verification.testRefs : [];
    const artifactRefs = Array.isArray(verification.artifactRefs) ? verification.artifactRefs : [];
    if (!['partial', 'complete'].includes(verification.coverage)) error(errors, 'E_GRAPH_COVERAGE_STATE', `${feedbackId} has invalid coverage ${verification.coverage ?? '<missing>'}.`);
    if (testRefs.length === 0) error(errors, 'E_GRAPH_TEST_REQUIRED', `${feedbackId} has no executable test reference.`);
    for (const duplicate of duplicateValues(testRefs)) error(errors, 'E_GRAPH_HF_TEST_DUPLICATE', `${feedbackId} duplicates ${duplicate}.`);
    for (const duplicate of duplicateValues(artifactRefs)) error(errors, 'E_GRAPH_HF_ARTIFACT_DUPLICATE', `${feedbackId} duplicates ${duplicate}.`);
    for (const testRef of testRefs) if (!testIndex.has(testRef)) error(errors, 'E_GRAPH_HF_TEST_UNKNOWN', `${feedbackId} references ${testRef}.`);
    for (const artifactRef of artifactRefs) if (!artifactIndex.has(artifactRef)) error(errors, 'E_GRAPH_HF_ARTIFACT_UNKNOWN', `${feedbackId} references ${artifactRef}.`);

    if (options.candidateMode && ['P0', 'P1'].includes(ledgerRow.priority)) {
      if (verification.coverage !== 'complete') error(errors, 'E_CANDIDATE_COVERAGE', `${feedbackId} ${ledgerRow.priority} coverage is not complete.`);
      if (testRefs.length === 0) error(errors, 'E_CANDIDATE_TEST_REQUIRED', `${feedbackId} ${ledgerRow.priority} has no executable test.`);
      if (artifactRefs.length === 0) error(errors, 'E_CANDIDATE_ARTIFACT_REQUIRED', `${feedbackId} ${ledgerRow.priority} has no exact-SHA evidence artifact.`);
      for (const artifactRef of artifactRefs) {
        const artifact = artifactIndex.get(artifactRef);
        if (!artifact) continue;
        if (!(artifact.feedbackIds ?? []).includes(feedbackId)) {
          error(errors, 'E_CANDIDATE_ARTIFACT_FEEDBACK', `${artifactRef} does not attest ${feedbackId}.`);
        }
        if (!(artifact.testRefs ?? []).some((testRef) => testRefs.includes(testRef))) {
          error(errors, 'E_CANDIDATE_ARTIFACT_TEST', `${artifactRef} does not attest one of ${feedbackId}'s tests.`);
        }
      }
    }
  }

  return {
    attachedOutcomes: attachedOutcomes.length,
    artifacts: artifactIndex.size,
    feedbackRows: ledgerModel.feedbackRows.length,
    graphNodes: graphNodes.length,
    latestId: expectedFeedbackIds.at(-1) ?? null,
    mappingRows: ledgerModel.mappingRows.length,
    planningRequirements: matrixRows.length,
    supersessions: graphSupersessions.length,
    tests: testIndex.size,
  };
}

function validate(ledger, matrix, agents, packageJson, graph, options = {}) {
  const errors = [];
  const ledgerContext = validateLedgerAndMatrix(ledger, matrix, agents, errors, options.candidateMode === true);
  const summary = validateGraph(graph, ledgerContext, packageJson, errors, options);
  return { errors, summary };
}

function candidateReadyLedger(ledger) {
  return ledger.split(/\r?\n/).map((line) => {
    const row = cells(line);
    if (!row || !/^HF-\d{3}$/.test(row[0]) || row.length !== 7 || !['P0', 'P1'].includes(row[1])) return line;
    row[6] = 'VERIFIED';
    return `| ${row.join(' | ')} |`;
  }).join('\n');
}

function buildCandidateFixture(graph, ledger) {
  const fixtureGraph = structuredClone(graph);
  const sourceSha = 'a'.repeat(40);
  const environmentHash = 'b'.repeat(64);
  const feedbackById = new Map(parseLedger(ledger).feedbackRows.map((row) => [row.id, row]));
  const candidateIds = fixtureGraph.feedbackNodes
    .filter((node) => ['P0', 'P1'].includes(feedbackById.get(node.id)?.priority))
    .map((node) => node.id);
  const testRefs = [...new Set(fixtureGraph.feedbackNodes
    .filter((node) => candidateIds.includes(node.id))
    .flatMap((node) => node.verification.testRefs))].sort();
  const receipt = {
    schemaVersion: 1,
    kind: 'pass65-owner-feedback-evidence',
    sourceSha,
    buildId: 'self-test-fixture',
    verifierId: 'owner-feedback-self-test',
    verifierVersion: '1',
    environmentHash,
    result: 'passed',
    feedbackIds: candidateIds,
    testRefs,
  };
  const relativePath = 'artifacts/pass65-owner-feedback/self-test-evidence.json';
  const bytes = Buffer.from(JSON.stringify(receipt), 'utf8');
  const artifact = {
    id: 'ART-SELFTEST-001',
    path: relativePath,
    sha256: sha256(bytes),
    sourceSha,
    buildId: receipt.buildId,
    verifierId: receipt.verifierId,
    verifierVersion: receipt.verifierVersion,
    environmentHash,
    result: 'passed',
    feedbackIds: candidateIds,
    testRefs,
  };
  fixtureGraph.candidateEvidenceSourceSha = sourceSha;
  fixtureGraph.artifactCatalog = [artifact];
  for (const node of fixtureGraph.feedbackNodes) {
    if (!candidateIds.includes(node.id)) continue;
    node.verification.coverage = 'complete';
    node.verification.artifactRefs = [artifact.id];
  }
  return { graph: fixtureGraph, artifactBytesByPath: new Map([[relativePath, bytes]]) };
}

function runSelfTest(ledger, matrix, agents, packageJson, graph) {
  const failures = [];
  const baseline = validate(ledger, matrix, agents, packageJson, graph);
  if (baseline.errors.length > 0) return [`E_SELFTEST_BASELINE: Known-good structural graph failed before mutations: ${baseline.errors[0]}`];

  function expectRejected(name, expectedCode, inputs) {
    const result = validate(
      inputs.ledger ?? ledger,
      matrix,
      agents,
      packageJson,
      inputs.graph ?? graph,
      inputs.options ?? {},
    );
    if (!result.errors.some((entry) => entry.startsWith(`${expectedCode}:`))) {
      failures.push(`E_SELFTEST_MUTATION: ${name} did not produce ${expectedCode}; got ${result.errors[0] ?? 'no error'}.`);
    }
  }

  const duplicateLedgerRow = ledger.split(/\r?\n/).find((line) => /^\| HF-001 \|/.test(line));
  expectRejected('duplicate ledger ID', 'E_LEDGER_HF_DUPLICATE', { ledger: `${ledger}\n${duplicateLedgerRow}` });
  expectRejected('missing planning mapping', 'E_LEDGER_MAPPING_MISSING', { ledger: ledger.replace(/^\| HF-068 \| R[^\n]+\r?$/m, '') });
  expectRejected('unowned ledger row', 'E_LEDGER_OWNER', { ledger: ledger.replace(/^(\| HF-001 \| P\d \| [^|]+\|)[^|]+(\|)/m, '$1 $2') });
  expectRejected('invalid ledger state', 'E_LEDGER_STATE', { ledger: ledger.replace(/^(\| HF-001 \|[^\n]*\| )OPEN( \|)$/m, '$1DONE$2') });

  const omittedOutcome = structuredClone(graph);
  omittedOutcome.attachedSpecOutcomes.pop();
  expectRejected('omitted attached outcome', 'E_GRAPH_OUTCOME_COUNT', { graph: omittedOutcome });
  const duplicateOutcome = structuredClone(graph);
  duplicateOutcome.attachedSpecOutcomes.push(structuredClone(duplicateOutcome.attachedSpecOutcomes[0]));
  expectRejected('duplicated attached outcome', 'E_GRAPH_OUTCOME_DUPLICATE', { graph: duplicateOutcome });
  const omittedFeedback = structuredClone(graph);
  omittedFeedback.feedbackNodes.pop();
  expectRejected('omitted feedback node', 'E_GRAPH_HF_SET', { graph: omittedFeedback });
  const duplicatedFeedback = structuredClone(graph);
  duplicatedFeedback.feedbackNodes.push(structuredClone(duplicatedFeedback.feedbackNodes[0]));
  expectRejected('duplicated feedback node', 'E_GRAPH_HF_DUPLICATE', { graph: duplicatedFeedback });
  const staleOwner = structuredClone(graph);
  staleOwner.feedbackNodes.find((node) => node.id === 'HF-031').canonicalOwner = 'Identity invention lane';
  expectRejected('stale canonical owner', 'E_GRAPH_OWNER_STALE', { graph: staleOwner });
  const staleSupersession = structuredClone(graph);
  staleSupersession.supersessions[0].canonicalText += ' stale';
  expectRejected('stale supersession', 'E_GRAPH_SUPERSESSION_STALE', { graph: staleSupersession });
  const untestedStructural = structuredClone(graph);
  untestedStructural.feedbackNodes.find((node) => node.id === 'HF-001').verification.testRefs = [];
  expectRejected('untested structural outcome', 'E_GRAPH_TEST_REQUIRED', { graph: untestedStructural });

  const readyLedger = candidateReadyLedger(ledger);
  const fixture = buildCandidateFixture(graph, readyLedger);
  const fixtureOptions = { candidateMode: true, artifactBytesByPath: fixture.artifactBytesByPath };
  const candidateResult = validate(readyLedger, matrix, agents, packageJson, fixture.graph, fixtureOptions);
  if (candidateResult.errors.length > 0) {
    failures.push(`E_SELFTEST_CANDIDATE_FIXTURE: Candidate-ready fixture failed: ${candidateResult.errors[0]}.`);
    return failures;
  }
  const missingTest = structuredClone(fixture.graph);
  missingTest.feedbackNodes.find((node) => node.id === 'HF-001').verification.testRefs = [];
  expectRejected('candidate missing test', 'E_CANDIDATE_TEST_REQUIRED', { ledger: readyLedger, graph: missingTest, options: fixtureOptions });
  const missingArtifact = structuredClone(fixture.graph);
  missingArtifact.feedbackNodes.find((node) => node.id === 'HF-001').verification.artifactRefs = [];
  expectRejected('candidate missing artifact', 'E_CANDIDATE_ARTIFACT_REQUIRED', { ledger: readyLedger, graph: missingArtifact, options: fixtureOptions });
  const wrongDigest = structuredClone(fixture.graph);
  wrongDigest.artifactCatalog[0].sha256 = '0'.repeat(64);
  expectRejected('candidate stale artifact digest', 'E_CANDIDATE_ARTIFACT_DIGEST', { ledger: readyLedger, graph: wrongDigest, options: fixtureOptions });
  const openCandidate = readyLedger.replace(/^(\| HF-001 \| P0 \|[^\n]*\| )(?:VERIFIED|HITL)( \|)$/m, '$1OPEN$2');
  expectRejected('candidate OPEN P0', 'E_CANDIDATE_STATE', { ledger: openCandidate, graph: fixture.graph, options: fixtureOptions });
  return failures;
}

const ledger = fs.readFileSync(LEDGER_PATH, 'utf8');
const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
const agents = fs.readFileSync(AGENTS_PATH, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
let graph;
try {
  graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
} catch (caught) {
  console.error(JSON.stringify({ ok: false, errors: [`E_GRAPH_JSON: ${caught.message}`] }, null, 2));
  process.exit(1);
}

const candidateMode = process.argv.includes('--candidate');
const selfTest = process.argv.includes('--self-test');
const result = validate(ledger, matrix, agents, packageJson, graph, { candidateMode });
if (selfTest) result.errors.push(...runSelfTest(ledger, matrix, agents, packageJson, graph));

if (result.errors.length > 0) {
  console.error(JSON.stringify({ ok: false, ...result }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, ...result.summary, selfTest, candidateMode }, null, 2));
}
