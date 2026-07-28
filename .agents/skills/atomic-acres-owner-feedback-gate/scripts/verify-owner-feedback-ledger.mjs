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

const TEXT_SOURCE_NORMALIZATION = 'UTF-8; CRLF converted to LF; one final LF added; text semantics unchanged';

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
  const expectedIds = Array.from({ length: orderedIds.length }, (_, index) => `HF-${String(index + 1).padStart(3, '0')}`);
  if (!sameArray(orderedIds, expectedIds)) {
    error(errors, 'E_LEDGER_HF_SET', `Feedback ID set differs from ${expectedIds[0]} through ${expectedIds.at(-1)}.`);
  }
  if (ledgerModel.latestIdMarker !== orderedIds.at(-1)) {
    error(errors, 'E_LEDGER_LATEST_ID', `latest-id is ${ledgerModel.latestIdMarker ?? '<missing>'}; expected ${orderedIds.at(-1) ?? '<none>'}.`);
  }

  const ledgerDigest = canonicalDigest(ledgerModel.feedbackRows.map(({ id, priority, outcome, owner, falsifier, scope }) => ({
    id, priority, outcome, owner, falsifier, scope,
  })));

  const matrixById = new Map();
  for (const row of matrixRows) {
    if (matrixById.has(row.id)) error(errors, 'E_MATRIX_REQUIREMENT_DUPLICATE', `Duplicate planning requirement ${row.id}.`);
    matrixById.set(row.id, row);
  }
  if (matrixRows.length === 0 || matrixById.size !== matrixRows.length) {
    error(errors, 'E_MATRIX_REQUIREMENT_SET', `Planning matrix has ${matrixRows.length} rows and ${matrixById.size} unique IDs; expected a non-empty one-to-one set.`);
  }
  const matrixDigest = canonicalDigest(matrixRows.map(({ id, requirement, expected, falsifier, evidence }) => ({
    id, requirement, expected, falsifier, evidence,
  })));

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
  return {
    ledgerModel,
    matrixRows,
    feedbackById,
    matrixById,
    planningByFeedback,
    ledgerDigest,
    matrixDigest,
  };
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

function validateSources(graph, ledgerContext, errors) {
  const {
    ledgerModel,
    matrixRows,
    ledgerDigest,
    matrixDigest,
  } = ledgerContext;
  const sources = uniqueIndex(graph.sources, 'Source catalog', errors, 'E_GRAPH_SOURCE_DUPLICATE');
  const textSourceGroups = [];
  const outcomeCollections = new Set();
  const ledgerSources = [];
  const matrixSources = [];

  for (const source of sources.values()) {
    if (source.kind === 'canonical-correction-ledger') {
      ledgerSources.push(source);
      const expectedPath = path.relative(REPO_ROOT, LEDGER_PATH).replace(/\\/g, '/');
      if (source.repositoryPath !== expectedPath
        || source.ledgerVersion !== 1
        || source.latestFeedbackId !== ledgerModel.latestIdMarker
        || source.outcomeCount !== ledgerModel.feedbackRows.length
        || source.stateIndependentOutcomeSha256 !== ledgerDigest) {
        error(errors, 'E_GRAPH_LEDGER_SOURCE_STALE', `${source.id} metadata/digest differs from the canonical correction ledger.`);
      }
      continue;
    }
    if (source.kind === 'canonical-planning-matrix') {
      matrixSources.push(source);
      const expectedPath = path.relative(REPO_ROOT, MATRIX_PATH).replace(/\\/g, '/');
      if (source.repositoryPath !== expectedPath
        || source.requirementCount !== matrixRows.length
        || source.stateIndependentRequirementSha256 !== matrixDigest) {
        error(errors, 'E_GRAPH_MATRIX_SOURCE_STALE', `${source.id} metadata/digest differs from the canonical planning matrix.`);
      }
      continue;
    }

    if (typeof source.outcomeCollection !== 'string' || source.outcomeCollection.length === 0) {
      error(errors, 'E_GRAPH_SOURCE_KIND', `${source.id} is neither a canonical projection nor a text source with an outcomeCollection.`);
      continue;
    }
    if (outcomeCollections.has(source.outcomeCollection)) {
      error(errors, 'E_GRAPH_SOURCE_COLLECTION_DUPLICATE', `${source.outcomeCollection} is assigned to more than one source.`);
      continue;
    }
    outcomeCollections.add(source.outcomeCollection);

    const outcomes = Array.isArray(graph[source.outcomeCollection]) ? graph[source.outcomeCollection] : [];
    const outcomeIndex = uniqueIndex(outcomes, `${source.id} outcome`, errors, 'E_GRAPH_OUTCOME_DUPLICATE');
    const prefix = typeof source.outcomeIdPrefix === 'string' && /^[A-Z][A-Z0-9-]{1,15}$/.test(source.outcomeIdPrefix)
      ? source.outcomeIdPrefix
      : null;
    if (!prefix) error(errors, 'E_GRAPH_SOURCE_OUTCOME_PREFIX', `${source.id} has an invalid outcomeIdPrefix.`);
    const expectedOutcomeIds = prefix
      ? Array.from({ length: outcomes.length }, (_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`)
      : [];
    if (source.outcomeCount !== outcomes.length || !sameArray([...outcomeIndex.keys()].sort(), expectedOutcomeIds)) {
      error(errors, 'E_GRAPH_OUTCOME_SET', `${source.id} outcome count/IDs do not match its declared sequential projection.`);
    }
    const outcomeProjection = outcomes.map(({
      id,
      sourceLocator,
      normalizedOutcome,
      feedbackIds,
      planningRequirementIds,
      disposition = 'mapped',
      exclusionReason = null,
    }) => ({
      id,
      sourceLocator,
      normalizedOutcome,
      feedbackIds,
      planningRequirementIds,
      disposition,
      exclusionReason,
    }));
    if (canonicalDigest(outcomeProjection) !== source.outcomeProjectionSha256) {
      error(errors, 'E_GRAPH_SOURCE_OUTCOME_DIGEST', `${source.id} outcome projection digest is stale.`);
    }

    if (source.normalization !== TEXT_SOURCE_NORMALIZATION
      || !Number.isSafeInteger(source.rawByteLength)
      || !/^[0-9a-f]{64}$/.test(source.rawSha256 ?? '')
      || typeof source.rawEndsWithCrLf !== 'boolean'
      || !Number.isSafeInteger(source.normalizedByteLength)
      || !/^[0-9a-f]{64}$/.test(source.normalizedSha256 ?? '')) {
      error(errors, 'E_GRAPH_TEXT_SOURCE_IDENTITY', `${source.id} has incomplete raw/normalized source identity metadata.`);
    }
    const normalizedPath = repositoryFile(source.normalizedRepositoryPath, errors, 'E_GRAPH_TEXT_SOURCE_PATH', `${source.id} normalized source`);
    if (normalizedPath && !fs.existsSync(normalizedPath)) {
      error(errors, 'E_GRAPH_TEXT_SOURCE_MISSING', `${source.normalizedRepositoryPath} does not exist.`);
    } else if (normalizedPath) {
      const normalizedBytes = fs.readFileSync(normalizedPath);
      const normalizedText = normalizedBytes.toString('utf8');
      if (normalizedBytes.byteLength !== source.normalizedByteLength || sha256(normalizedBytes) !== source.normalizedSha256) {
        error(errors, 'E_GRAPH_TEXT_SOURCE_NORMALIZED_DIGEST', `${source.id} normalized bytes do not match the declared identity.`);
      }
      if (normalizedText.includes('\r') || !normalizedText.endsWith('\n') || normalizedText.endsWith('\n\n')) {
        error(errors, 'E_GRAPH_TEXT_SOURCE_NORMALIZATION', `${source.id} must contain LF only and exactly one final LF.`);
      } else {
        const reconstructedRaw = Buffer.from(
          normalizedText.slice(0, -1).replace(/\n/g, '\r\n') + (source.rawEndsWithCrLf ? '\r\n' : ''),
          'utf8',
        );
        if (reconstructedRaw.byteLength !== source.rawByteLength || sha256(reconstructedRaw) !== source.rawSha256) {
          error(errors, 'E_GRAPH_TEXT_SOURCE_RAW_IDENTITY', `${source.id} normalization does not reconstruct its declared raw bytes.`);
        }
      }

      const nonBlankLines = normalizedText.slice(0, -1).split('\n').flatMap((line, index) => line.trim().length > 0 ? [index + 1] : []);
      const declaredLineAtoms = source.lineAtomCounts ?? {};
      const declaredLines = Object.keys(declaredLineAtoms).map(Number).sort((a, b) => a - b);
      if (!sameArray(declaredLines, nonBlankLines)
        || declaredLines.some((line) => !Number.isSafeInteger(declaredLineAtoms[String(line)]) || declaredLineAtoms[String(line)] < 1)) {
        error(errors, 'E_GRAPH_SOURCE_LINE_COVERAGE', `${source.id} must declare a positive atom count for every and only non-blank source line.`);
      }
      const atomsByLine = new Map();
      for (const outcome of outcomes) {
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
          error(errors, 'E_GRAPH_SOURCE_ATOM_COVERAGE', `${source.id} line ${line} atoms are ${actualAtoms.join(',') || '<none>'}; expected ${expectedAtoms.join(',')}.`);
        }
      }
    }
    textSourceGroups.push({ source, outcomes, outcomeIndex });
  }

  if (ledgerSources.length !== 1) error(errors, 'E_GRAPH_LEDGER_SOURCE_SET', `Expected exactly one canonical correction-ledger source; found ${ledgerSources.length}.`);
  if (matrixSources.length !== 1) error(errors, 'E_GRAPH_MATRIX_SOURCE_SET', `Expected exactly one canonical planning-matrix source; found ${matrixSources.length}.`);
  if (textSourceGroups.length === 0) error(errors, 'E_GRAPH_TEXT_SOURCE_SET', 'At least one immutable normalized text source is required.');
  return { sources, textSourceGroups };
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

  const sourceContext = validateSources(graph, ledgerContext, errors);
  const textOutcomes = sourceContext.textSourceGroups.flatMap(({ outcomes }) => outcomes);
  const textOutcomeIndex = uniqueIndex(textOutcomes, 'Text-source outcome', errors, 'E_GRAPH_OUTCOME_DUPLICATE');
  for (const outcome of textOutcomes) {
    if (!/^L\d+#\d+$/.test(outcome?.sourceLocator ?? '') || typeof outcome.normalizedOutcome !== 'string' || outcome.normalizedOutcome.length < 8) {
      error(errors, 'E_GRAPH_OUTCOME_SHAPE', `${outcome?.id ?? '<missing>'} lacks an executable source locator/outcome.`);
    }
    for (const duplicate of duplicateValues(outcome.feedbackIds ?? [])) error(errors, 'E_GRAPH_OUTCOME_FEEDBACK_DUPLICATE', `${outcome.id} duplicates ${duplicate}.`);
    for (const duplicate of duplicateValues(outcome.planningRequirementIds ?? [])) error(errors, 'E_GRAPH_OUTCOME_PLANNING_DUPLICATE', `${outcome.id} duplicates ${duplicate}.`);
    const disposition = outcome.disposition ?? 'mapped';
    if (disposition === 'mapped') {
      if (!Array.isArray(outcome.feedbackIds) || outcome.feedbackIds.length === 0) error(errors, 'E_GRAPH_OUTCOME_ORPHAN', `${outcome.id} has no feedback path.`);
      if (!Array.isArray(outcome.planningRequirementIds) || outcome.planningRequirementIds.length === 0) error(errors, 'E_GRAPH_OUTCOME_PLANNING_MISSING', `${outcome.id} has no planning path.`);
      if (outcome.exclusionReason !== undefined && outcome.exclusionReason !== null) error(errors, 'E_GRAPH_OUTCOME_DISPOSITION', `${outcome.id} is mapped but declares an exclusion reason.`);
    } else if (disposition === 'excluded-nonproduct') {
      if ((outcome.feedbackIds ?? []).length !== 0 || (outcome.planningRequirementIds ?? []).length !== 0
        || typeof outcome.exclusionReason !== 'string' || outcome.exclusionReason.length < 16) {
        error(errors, 'E_GRAPH_OUTCOME_EXCLUSION', `${outcome.id} exclusion must be explicit, reasoned and have no product mappings.`);
      }
    } else {
      error(errors, 'E_GRAPH_OUTCOME_DISPOSITION', `${outcome.id} has invalid disposition ${disposition}.`);
    }
    for (const feedbackId of outcome.feedbackIds ?? []) if (!feedbackById.has(feedbackId)) error(errors, 'E_GRAPH_OUTCOME_UNKNOWN_FEEDBACK', `${outcome.id} references ${feedbackId}.`);
    for (const requirementId of outcome.planningRequirementIds ?? []) if (!matrixById.has(requirementId)) error(errors, 'E_GRAPH_OUTCOME_UNKNOWN_PLANNING', `${outcome.id} references ${requirementId}.`);
  }

  const projection = graph.correctionOutcomeProjection ?? {};
  const ledgerSource = [...sourceContext.sources.values()].find((source) => source.kind === 'canonical-correction-ledger');
  const expectedProjection = {
    sourceId: ledgerSource?.id,
    outcomeIdTemplate: 'CORR-{feedbackId}',
    sourceLocatorTemplate: '{feedbackId}.observation',
    feedbackIdStart: 'HF-001',
    feedbackIdEnd: ledgerModel.latestIdMarker,
  };
  if (JSON.stringify(projection) !== JSON.stringify(expectedProjection)) {
    error(errors, 'E_GRAPH_CORRECTION_PROJECTION', 'Correction outcome projection is stale or incomplete.');
  }
  const correctionOutcomeIds = new Set([...feedbackById.keys()].map((feedbackId) => `CORR-${feedbackId}`));
  const knownOutcomeIds = new Set([...textOutcomeIndex.keys(), ...correctionOutcomeIds]);

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
    error(errors, 'E_GRAPH_HF_SET', `Feedback graph nodes do not have set equality with all ${expectedFeedbackIds.length} correction rows.`);
  }
  for (const outcome of textOutcomes) {
    if ((outcome.disposition ?? 'mapped') !== 'mapped') continue;
    for (const feedbackId of outcome.feedbackIds ?? []) {
      if (!(nodeIndex.get(feedbackId)?.sourceOutcomeIds ?? []).includes(outcome.id)) {
        error(errors, 'E_GRAPH_OUTCOME_NODE_LINK', `${outcome.id} maps to ${feedbackId}, but that node does not link back to the source outcome.`);
      }
    }
  }
  for (const feedbackId of expectedFeedbackIds) {
    const node = nodeIndex.get(feedbackId);
    const ledgerRow = feedbackById.get(feedbackId);
    if (!node) continue;
    if (typeof node.canonicalOwner !== 'string' || node.canonicalOwner.length < 3) {
      error(errors, 'E_GRAPH_OWNER_UNOWNED', `${feedbackId} has no executable owner.`);
    }
    if (node.canonicalOwner !== ledgerRow.owner || node.ownerSource !== ledgerSource?.id) {
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
    sourceOutcomes: textOutcomes.length,
    textSources: sourceContext.textSourceGroups.length,
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

  const textSources = graph.sources.filter((source) => typeof source.outcomeCollection === 'string');
  const firstOutcomeCollection = textSources[0].outcomeCollection;
  const newestOutcomeCollection = textSources.at(-1).outcomeCollection;
  const omittedOutcome = structuredClone(graph);
  omittedOutcome[firstOutcomeCollection].pop();
  expectRejected('omitted first-source outcome', 'E_GRAPH_OUTCOME_SET', { graph: omittedOutcome });
  const omittedNewestOutcome = structuredClone(graph);
  omittedNewestOutcome[newestOutcomeCollection].pop();
  expectRejected('omitted newest-source outcome', 'E_GRAPH_OUTCOME_SET', { graph: omittedNewestOutcome });
  const duplicateOutcome = structuredClone(graph);
  duplicateOutcome[firstOutcomeCollection].push(structuredClone(duplicateOutcome[firstOutcomeCollection][0]));
  expectRejected('duplicated attached outcome', 'E_GRAPH_OUTCOME_DUPLICATE', { graph: duplicateOutcome });
  const staleSourceDigest = structuredClone(graph);
  staleSourceDigest.sources.find((source) => source.outcomeCollection === newestOutcomeCollection).normalizedSha256 = '0'.repeat(64);
  expectRejected('stale normalized source digest', 'E_GRAPH_TEXT_SOURCE_NORMALIZED_DIGEST', { graph: staleSourceDigest });
  const brokenOutcomeNodeLink = structuredClone(graph);
  const linkedOutcome = brokenOutcomeNodeLink[newestOutcomeCollection].find((outcome) => (outcome.feedbackIds ?? []).length > 0);
  brokenOutcomeNodeLink.feedbackNodes.find((node) => node.id === linkedOutcome.feedbackIds[0]).sourceOutcomeIds = [
    ...brokenOutcomeNodeLink.feedbackNodes.find((node) => node.id === linkedOutcome.feedbackIds[0]).sourceOutcomeIds,
  ].filter((id) => id !== linkedOutcome.id);
  expectRejected('broken source-outcome node link', 'E_GRAPH_OUTCOME_NODE_LINK', { graph: brokenOutcomeNodeLink });
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
