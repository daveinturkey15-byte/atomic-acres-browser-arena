import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARDWARE_WEBGL2_TEST_ID,
  createHardwareWebGl2ReceiptFixture,
  receiptSha256,
  validateHardwareWebGl2BuildManifest,
  validateHardwareWebGl2DetailedReceipt,
} from '../../../../scripts/qa/pass65-hardware-webgl2-receipt-contract.mjs';
import { validateAcceptanceManifest } from '../../../../scripts/release/acceptance-gate.mjs';
import {
  FinalizationError,
  artifactIdForTest,
  validateExactArtifactCatalog,
} from './finalize-pass66-owner-evidence.mjs';
import {
  PASS66_BROWSER_FOREGROUND_TEST_ID,
  PASS66_HIDDEN_TAB_TEST_ID,
  evidenceKindsForTest,
  requirementNeedsVisual,
  validatePass66BlockingCatalog,
} from './run-pass66-owner-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_REQUIREMENTS_MATRIX.md');
const GRAPH_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json');
const AGENTS_PATH = path.join(REPO_ROOT, 'AGENTS.md');
const PACKAGE_PATH = path.join(REPO_ROOT, 'package.json');
const ACCEPTANCE_POLICY_PATH = path.join(REPO_ROOT, 'acceptance', 'policy.json');
const PASS66_ACCEPTANCE_PATH = 'acceptance/pass-66.json';

// S0M may bind frozen S0 evidence, but it may not revise the code, test or
// release-shell contract that produced that evidence. Keep this narrower than
// the generic post-preview acceptance allowance for test-only corrections.
const CANDIDATE_EVIDENCE_PROCESS_FILES = new Set([
  PASS66_ACCEPTANCE_PATH,
  'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md',
  'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json',
]);
const OWNER_EVIDENCE_ROOT = 'artifacts/pass65-owner-feedback/';
const HARDWARE_EVIDENCE_ROOT = 'artifacts/pass65/hardware-webgl2-admission/';
const REQUIRED_PASS66_TESTS_BY_FEEDBACK = new Map([
  ['HF-152', [PASS66_BROWSER_FOREGROUND_TEST_ID, PASS66_HIDDEN_TAB_TEST_ID]],
  ['HF-191', ['T-ADS-SIGHT-CATALOG', 'T-SCOPED-ADS', 'T-RAILGUN']],
  ['HF-192', ['T-FIELD-KIT-MENU']],
  ['HF-193', ['T-SKY-WEBGPU']],
  ['HF-194', ['T-VIEWMODEL-FRAMING']],
  ['HF-195', ['T-SUPPORT-VEHICLE-GATE']],
  ['HF-196', ['T-TIMED-MAP-WEAPONS', 'T-MULTIPLAYER-STABILITY']],
  ['HF-197', ['T-GUN-RANGE-TEST-BAY']],
  ['HF-198', ['T-RUSTRIG-PHYSICS', 'T-PRONE-CONTACT-MATRIX']],
  ['HF-199', ['T-SUPPORT-OPERATE-PROMPT', 'T-SUPPORT-DAMAGE', 'T-MULTIPLAYER-STABILITY']],
  ['HF-200', ['T-BROWSER-ADMISSION', 'T-INSTALLED-FIREFOX', PASS66_BROWSER_FOREGROUND_TEST_ID, PASS66_HIDDEN_TAB_TEST_ID]],
  ['HF-201', ['T-DIAGNOSTICS']],
  ['HF-202', ['T-DIAGNOSTICS']],
  ['HF-203', ['T-AUDIO-LONG-RUN']],
  ['HF-204', ['T-MULTIPLAYER-STABILITY', 'T-PASS63-MULTIPLAYER-COMPARATOR']],
  ['HF-205', ['T-MULTIPLAYER-STABILITY', 'T-BOTS']],
  ['HF-206', ['T-PICKUP-REPICK']],
  ['HF-207', ['T-PREVIEW-GATE', 'T-KILLSTREAK-DEMO-VIDEOS']],
]);

const TEXT_SOURCE_NORMALIZATION = 'UTF-8; CRLF converted to LF; one final LF added; text semantics unchanged';
const HARDWARE_WEBGL2_FEEDBACK_IDS = Object.freeze([
  'HF-001', 'HF-002', 'HF-003', 'HF-041', 'HF-064',
  'HF-065', 'HF-098', 'HF-118', 'HF-138', 'HF-191', 'HF-200',
]);
const REQUIRED_NATIVE_TESTS_BY_FEEDBACK = new Map([
  ['HF-001', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE']],
  ['HF-002', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE']],
  ['HF-003', ['T-WEBGPU-ENDURANCE']],
  ['HF-004', ['T-COLD-WEBGPU-ADMISSION']],
  ['HF-038', ['T-WEBGPU-ENDURANCE']],
  ['HF-041', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-052', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE']],
  ['HF-054', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE']],
  ['HF-056', ['T-COLD-WEBGPU-ADMISSION']],
  ['HF-064', ['T-WEBGPU-ENDURANCE']],
  ['HF-065', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-071', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE']],
  ['HF-073', ['T-COLD-WEBGPU-ADMISSION']],
  ['HF-085', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-098', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-106', ['T-NATIVE-FRAME-PACING']],
  ['HF-112', ['T-NATIVE-FRAME-PACING']],
  ['HF-115', ['T-NATIVE-FRAME-PACING']],
  ['HF-117', ['T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-118', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-121', ['T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-124', ['T-NATIVE-FRAME-PACING']],
  ['HF-137', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-138', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-191', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-193', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE']],
  ['HF-198', ['T-NATIVE-FRAME-PACING']],
  ['HF-199', ['T-WEBGPU-ENDURANCE']],
  ['HF-200', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-222', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-225', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-229', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
  ['HF-230', ['T-COLD-WEBGPU-ADMISSION', 'T-WEBGPU-ENDURANCE', 'T-NATIVE-FRAME-PACING']],
]);
for (const feedbackId of HARDWARE_WEBGL2_FEEDBACK_IDS) {
  const required = REQUIRED_NATIVE_TESTS_BY_FEEDBACK.get(feedbackId) ?? [];
  REQUIRED_NATIVE_TESTS_BY_FEEDBACK.set(feedbackId, [...required, HARDWARE_WEBGL2_TEST_ID]);
}

function error(errors, code, message) {
  errors.push(`${code}: ${message}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}

function git(...args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function gitIsAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function gitChangedPaths(base, head) {
  return git('diff', '--name-only', '--no-renames', '--diff-filter=ACDMRTUXB', base, head)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry.replaceAll('\\', '/'));
}

function committedCandidateEvidenceBytes(currentSha, relativePath, options) {
  if (options.committedArtifactBytesByPath !== undefined) {
    const bytes = options.committedArtifactBytesByPath?.get(relativePath);
    return bytes === undefined ? null : Buffer.from(bytes);
  }
  try {
    return execFileSync('git', ['show', `${currentSha}:${relativePath}`], { cwd: REPO_ROOT });
  } catch {
    return null;
  }
}

function validateCommittedCandidateEvidence(relativePath, bytes, candidateLineage, errors, options, label) {
  if (!candidateLineage?.currentSha) return;
  const committedBytes = committedCandidateEvidenceBytes(candidateLineage.currentSha, relativePath, options);
  if (!committedBytes) {
    error(errors, 'E_CANDIDATE_ARTIFACT_UNTRACKED', `${label} is not tracked in current S0M HEAD.`);
  } else if (!Buffer.from(bytes).equals(committedBytes)) {
    error(errors, 'E_CANDIDATE_ARTIFACT_COMMITTED_BYTES', `${label} differs from the bytes tracked in current S0M HEAD.`);
  }
}

function receiptPathForTest(testId, sourceSha) {
  if (testId === HARDWARE_WEBGL2_TEST_ID) {
    return `${OWNER_EVIDENCE_ROOT}hardware-webgl2-admission-${sourceSha}.json`;
  }
  const slug = String(testId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${OWNER_EVIDENCE_ROOT}${slug}-${sourceSha}.json`;
}

function exactCandidateOutputPaths(graph, candidateSha) {
  const paths = new Set(CANDIDATE_EVIDENCE_PROCESS_FILES);
  for (const artifact of graph?.artifactCatalog ?? []) {
    if (typeof artifact?.path === 'string') paths.add(artifact.path.replaceAll('\\', '/'));
    if ((artifact?.testRefs ?? []).includes(HARDWARE_WEBGL2_TEST_ID)) {
      if (typeof artifact.detailedReceiptPath === 'string') paths.add(artifact.detailedReceiptPath.replaceAll('\\', '/'));
      if (typeof artifact.buildManifestPath === 'string') paths.add(artifact.buildManifestPath.replaceAll('\\', '/'));
    }
  }
  return paths;
}

function expectedCandidateAcceptanceRequirements(matrixRows, graph, feedbackById, artifactIndex, candidateSha) {
  const testIndex = new Map((graph?.testCatalog ?? []).map((test) => [test.id, test]));
  return matrixRows.map((row, index) => {
    const nodes = (graph?.feedbackNodes ?? []).filter((node) => node.planningRequirementIds?.includes(row.id));
    if (nodes.length === 0) throw new Error(`${row.id} has no graph-linked feedback node.`);
    const testRefs = [...new Set(nodes.flatMap((node) => node.verification?.testRefs ?? []))].sort();
    if (testRefs.length === 0) throw new Error(`${row.id} has no graph-linked test.`);
    const needsVisual = requirementNeedsVisual({
      requirement: row.requirement,
      expected: row.expected,
      falsifier: row.falsifier,
      requiredEvidence: row.evidence,
    });
    const evidence = [];
    for (const testRef of testRefs) {
      const test = testIndex.get(testRef);
      const artifact = artifactIndex.get(artifactIdForTest(testRef));
      if (!test || !artifact) throw new Error(`${row.id}/${testRef} lacks its canonical test or artifact.`);
      const kinds = evidenceKindsForTest(test).kinds;
      const mechanicalKind = ['browser', 'unit', 'contract'].find((kind) => kinds.includes(kind));
      if (!mechanicalKind) throw new Error(`${row.id}/${testRef} lacks a mechanical evidence kind.`);
      const feedbackIds = nodes
        .filter((node) => ['P0', 'P1'].includes(feedbackById.get(node.id)?.priority)
          && node.verification?.testRefs?.includes(testRef))
        .map((node) => node.id)
        .sort();
      evidence.push({
        kind: mechanicalKind,
        ref: String(test.paths?.[0] ?? '').replaceAll('\\', '/'),
        command: test.command,
        note: `Exact-S0 ${testRef} receipt exercises the graph-linked falsifier coverage for ${row.id}.`,
        artifactId: artifact.id,
        artifactSha256: artifact.sha256,
        sourceSha: candidateSha,
        testRef,
        feedbackIds,
      });
    }
    if (needsVisual) {
      const browserRefs = testRefs.filter((testRef) => evidenceKindsForTest(testIndex.get(testRef)).kinds.includes('browser'));
      const visualRefs = testRefs.filter((testRef) => evidenceKindsForTest(testIndex.get(testRef)).kinds.includes('visual'));
      if (browserRefs.length === 0 || visualRefs.length === 0) {
        throw new Error(`${row.id} visual projection lacks graph-linked browser or visual evidence.`);
      }
      for (const testRef of visualRefs) {
        const artifact = artifactIndex.get(artifactIdForTest(testRef));
        const visualDigest = /-visual-([0-9a-f]{64})$/.exec(artifact?.buildId ?? '')?.[1];
        if (!visualDigest) throw new Error(`${row.id}/${testRef} artifact build identity lacks its visual digest.`);
        const feedbackIds = nodes
          .filter((node) => ['P0', 'P1'].includes(feedbackById.get(node.id)?.priority)
            && node.verification?.testRefs?.includes(testRef))
          .map((node) => node.id)
          .sort();
        evidence.push({
          kind: 'visual',
          ref: `artifact://pass66-exact-s0/${candidateSha}/${testRef}/${visualDigest}`,
          note: `Digest-bound ${testRef} visual output was produced or validated by the exact-S0 command for ${row.id}.`,
          artifactId: artifact.id,
          artifactSha256: artifact.sha256,
          sourceSha: candidateSha,
          testRef,
          feedbackIds,
        });
      }
    }
    evidence.sort((left, right) => left.kind.localeCompare(right.kind)
      || left.testRef.localeCompare(right.testRef)
      || left.artifactId.localeCompare(right.artifactId)
      || left.ref.localeCompare(right.ref));
    return {
      id: `R${index + 1}`,
      planningRequirementId: row.id,
      summary: `${row.id} - ${row.requirement}`,
      expected: row.expected,
      falsifier: row.falsifier,
      acceptance: needsVisual ? 'mixed' : 'mechanical',
      state: 'verified',
      evidence,
    };
  });
}

function validateCandidateAcceptanceProjection({
  graph, matrixRows, feedbackById, artifactIndex, candidateLineage, errors, options,
}) {
  if (!candidateLineage?.currentSha) return;
  const bytes = committedCandidateEvidenceBytes(candidateLineage.currentSha, PASS66_ACCEPTANCE_PATH, options);
  if (!bytes) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_MISSING', `${PASS66_ACCEPTANCE_PATH} is not committed in current S0M HEAD.`);
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch (caught) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_JSON', `${PASS66_ACCEPTANCE_PATH} is not valid JSON: ${caught.message}.`);
    return;
  }
  const expectedTopLevelKeys = [
    'feedbackReceivedAt', 'humanAcceptance', 'preview', 'releasePass', 'requirements', 'schemaVersion', 'status',
  ];
  const actualTopLevelKeys = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    ? Object.keys(manifest).sort()
    : [];
  if (!sameArray(actualTopLevelKeys, expectedTopLevelKeys)) {
    error(
      errors,
      'E_CANDIDATE_ACCEPTANCE_PROJECTION',
      `Pass 66 acceptance top-level keys differ; expected=${expectedTopLevelKeys.join(',')}; actual=${actualTopLevelKeys.join(',') || '<none>'}.`,
    );
  }
  let generic;
  try {
    const policy = JSON.parse(fs.readFileSync(ACCEPTANCE_POLICY_PATH, 'utf8'));
    generic = validateAcceptanceManifest(manifest, { policy });
  } catch (caught) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_GENERIC', `Pass 66 generic acceptance validation could not run: ${caught.message}.`);
  }
  if (generic && !generic.ok) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_GENERIC', generic.errors.join('; '));
  }
  const candidateSha = graph.candidateEvidenceSourceSha;
  if (manifest?.releasePass !== 'PASS 66' || manifest?.preview?.sourceSha !== candidateSha) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_PROJECTION', `Pass 66 acceptance must bind release PASS 66 and frozen S0 ${candidateSha}.`);
  }
  if (matrixRows.length !== 99) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_PROJECTION', `Pass 66 canonical planning matrix has ${matrixRows.length} rows; expected exactly 99.`);
    return;
  }
  let expectedRequirements;
  try {
    expectedRequirements = expectedCandidateAcceptanceRequirements(
      matrixRows,
      graph,
      feedbackById,
      artifactIndex,
      candidateSha,
    );
  } catch (caught) {
    error(errors, 'E_CANDIDATE_ACCEPTANCE_PROJECTION', `Canonical 99-row acceptance projection could not be built: ${caught.message}.`);
    return;
  }
  if (!Array.isArray(manifest?.requirements) || manifest.requirements.length !== expectedRequirements.length) {
    error(
      errors,
      'E_CANDIDATE_ACCEPTANCE_PROJECTION',
      `Pass 66 acceptance has ${Array.isArray(manifest?.requirements) ? manifest.requirements.length : 0} requirements; expected exact matrix count ${expectedRequirements.length}.`,
    );
    return;
  }
  for (let index = 0; index < expectedRequirements.length; index += 1) {
    if (JSON.stringify(manifest.requirements[index]) !== JSON.stringify(expectedRequirements[index])) {
      error(
        errors,
        'E_CANDIDATE_ACCEPTANCE_PROJECTION',
        `Pass 66 requirement ${index + 1}/${expectedRequirements[index].planningRequirementId} differs from the exact matrix/graph/artifact projection.`,
      );
      break;
    }
  }
}

function validateCandidateEvidenceLineage(candidateSha, graph, errors, options) {
  let currentSha = options.currentGitSha;
  let currentStatus = options.currentGitStatus;
  try {
    if (currentSha === undefined) currentSha = git('rev-parse', 'HEAD');
    if (currentStatus === undefined) currentStatus = git('status', '--porcelain', '--untracked-files=all');
  } catch (caught) {
    error(errors, 'E_CANDIDATE_CURRENT_SOURCE', `Candidate verification could not resolve the current Git source: ${caught.message}.`);
    return { currentSha: null, currentStatus: null, changedPaths: [] };
  }
  if (!/^[0-9a-f]{40}$/.test(currentSha ?? '')) {
    error(errors, 'E_CANDIDATE_CURRENT_SOURCE', 'Current candidate HEAD must be an exact 40-character commit SHA.');
  }
  if (currentStatus !== '') {
    error(errors, 'E_CANDIDATE_CURRENT_SOURCE', 'Candidate verification requires a clean current worktree, including no untracked evidence files.');
  }

  const ancestor = options.candidateIsAncestor ?? (
    /^[0-9a-f]{40}$/.test(candidateSha ?? '')
      && /^[0-9a-f]{40}$/.test(currentSha ?? '')
      && gitIsAncestor(candidateSha, currentSha)
  );
  if (!ancestor) {
    error(errors, 'E_CANDIDATE_SOURCE_ANCESTRY', `Frozen evidence source ${candidateSha} is not an ancestor of current HEAD ${currentSha}.`);
  }

  let changedPaths = options.currentChangedPaths;
  if (changedPaths === undefined && ancestor) {
    try {
      changedPaths = gitChangedPaths(candidateSha, currentSha);
    } catch (caught) {
      error(errors, 'E_CANDIDATE_FROZEN_DELTA', `Candidate verification could not diff frozen S0 against current HEAD: ${caught.message}.`);
    }
  }
  if (!Array.isArray(changedPaths)) {
    error(errors, 'E_CANDIDATE_FROZEN_DELTA', 'Candidate verification could not resolve the S0-to-current changed-path set.');
    changedPaths = [];
  }
  const normalized = [...new Set(changedPaths.map((entry) => String(entry).trim().replaceAll('\\', '/')).filter(Boolean))].sort();
  const expected = exactCandidateOutputPaths(graph, candidateSha);
  const blocked = normalized.filter((entry) => !expected.has(entry));
  const missing = [...expected].filter((entry) => !normalized.includes(entry)).sort();
  if (blocked.length > 0 || missing.length > 0) {
    error(
      errors,
      'E_CANDIDATE_FROZEN_DELTA',
      `S0-to-current changes must equal the exact finalizer output set; missing=${missing.join(', ') || '<none>'}; forbidden=${blocked.join(', ') || '<none>'}.`,
    );
  }
  return { currentSha, currentStatus, changedPaths: normalized };
}

function currentBuildManifest(sourceSha, directory = path.join(REPO_ROOT, 'dist')) {
  const files = [];
  function visit(current, relative = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(child);
        files.push({ path: childRelative.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  visit(directory);
  return { schemaVersion: 1, sourceSha, files };
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
  const candidateLineage = candidateMode && /^[0-9a-f]{40}$/.test(candidateSha ?? '')
    ? validateCandidateEvidenceLineage(candidateSha, graph, errors, options)
    : null;
  for (const artifact of artifactIndex.values()) {
    const relativePath = artifact.path;
    const feedbackIds = Array.isArray(artifact.feedbackIds) ? artifact.feedbackIds : [];
    const testRefs = Array.isArray(artifact.testRefs) ? artifact.testRefs : [];
    if (typeof relativePath !== 'string' || !relativePath.replace(/\\/g, '/').startsWith('artifacts/pass65-owner-feedback/')) {
      error(errors, 'E_GRAPH_ARTIFACT_PATH', `${artifact.id} must live below artifacts/pass65-owner-feedback/.`);
      continue;
    }
    if (candidateMode && testRefs.length === 1) {
      const expectedPath = receiptPathForTest(testRefs[0], candidateSha);
      if (relativePath.replaceAll('\\', '/') !== expectedPath) {
        error(errors, 'E_CANDIDATE_ARTIFACT_PATH', `${artifact.id} must use canonical exact-S0 receipt path ${expectedPath}.`);
      }
    }
    const artifactPath = repositoryFile(relativePath, errors, 'E_GRAPH_ARTIFACT_PATH', artifact.id);
    let bytes = options.artifactBytesByPath?.get(relativePath);
    if (!bytes && artifactPath && fs.existsSync(artifactPath)) bytes = fs.readFileSync(artifactPath);
    if (!bytes) {
      error(errors, 'E_GRAPH_ARTIFACT_MISSING', `${artifact.id} evidence file ${relativePath} does not exist.`);
      continue;
    }
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (candidateMode) {
      validateCommittedCandidateEvidence(relativePath, bytes, candidateLineage, errors, options, artifact.id);
    }
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
    for (const duplicate of duplicateValues(feedbackIds)) error(errors, 'E_GRAPH_ARTIFACT_FEEDBACK_DUPLICATE', `${artifact.id} duplicates ${duplicate}.`);
    for (const duplicate of duplicateValues(testRefs)) error(errors, 'E_GRAPH_ARTIFACT_TEST_DUPLICATE', `${artifact.id} duplicates ${duplicate}.`);
    for (const feedbackId of feedbackIds) if (!feedbackById.has(feedbackId)) error(errors, 'E_GRAPH_ARTIFACT_UNKNOWN_FEEDBACK', `${artifact.id} references ${feedbackId}.`);
    for (const testRef of testRefs) if (!testIndex.has(testRef)) error(errors, 'E_GRAPH_ARTIFACT_UNKNOWN_TEST', `${artifact.id} references ${testRef}.`);
    try {
      const receipt = JSON.parse(bytes.toString('utf8'));
      const hardwareWebGl2Artifact = testRefs.includes(HARDWARE_WEBGL2_TEST_ID);
      const expectedReceipt = hardwareWebGl2Artifact ? {
        schemaVersion: 2,
        kind: 'pass65-owner-feedback-evidence',
        sourceSha: artifact.sourceSha,
        buildId: artifact.buildId,
        verifierId: artifact.verifierId,
        verifierVersion: artifact.verifierVersion,
        environmentHash: artifact.environmentHash,
        result: artifact.result,
        feedbackIds,
        testRefs,
        detailedReceiptPath: artifact.detailedReceiptPath,
        detailedReceiptSha256: artifact.detailedReceiptSha256,
        buildManifestPath: artifact.buildManifestPath,
        buildManifestSha256: artifact.buildManifestSha256,
      } : {
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
      if (hardwareWebGl2Artifact) {
        if (candidateMode) {
          const expectedDetailPath = `${HARDWARE_EVIDENCE_ROOT}${candidateSha}-receipt.json`;
          const expectedManifestPath = `${HARDWARE_EVIDENCE_ROOT}${candidateSha}-dist-manifest.json`;
          if (receipt.detailedReceiptPath !== expectedDetailPath || receipt.buildManifestPath !== expectedManifestPath) {
            error(
              errors,
              'E_CANDIDATE_ARTIFACT_PATH',
              `${artifact.id} hardware evidence must use ${expectedDetailPath} and ${expectedManifestPath}.`,
            );
          }
        }
        const detailPath = repositoryFile(receipt.detailedReceiptPath, errors, 'E_HARDWARE_WEBGL2_DETAIL_PATH', `${artifact.id} detail`);
        const manifestPath = repositoryFile(receipt.buildManifestPath, errors, 'E_HARDWARE_WEBGL2_MANIFEST_PATH', `${artifact.id} manifest`);
        if (!String(receipt.detailedReceiptPath ?? '').replace(/\\/g, '/').startsWith('artifacts/pass65/hardware-webgl2-admission/')
          || !String(receipt.buildManifestPath ?? '').replace(/\\/g, '/').startsWith('artifacts/pass65/hardware-webgl2-admission/')) {
          error(errors, 'E_HARDWARE_WEBGL2_DETAIL_PATH', `${artifact.id} detailed evidence must live below its exact Pass 65 artifact root.`);
        }
        let detailBytes = options.artifactBytesByPath?.get(receipt.detailedReceiptPath);
        let manifestBytes = options.artifactBytesByPath?.get(receipt.buildManifestPath);
        if (!detailBytes && detailPath && fs.existsSync(detailPath)) detailBytes = fs.readFileSync(detailPath);
        if (!manifestBytes && manifestPath && fs.existsSync(manifestPath)) manifestBytes = fs.readFileSync(manifestPath);
        if (!detailBytes || receiptSha256(detailBytes) !== receipt.detailedReceiptSha256) {
          error(errors, 'E_HARDWARE_WEBGL2_DETAIL_DIGEST', `${artifact.id} detailed receipt is missing or has a forged digest.`);
        }
        if (!manifestBytes || receiptSha256(manifestBytes) !== receipt.buildManifestSha256) {
          error(errors, 'E_HARDWARE_WEBGL2_BUILD_DIGEST', `${artifact.id} build manifest is missing or has a forged digest.`);
        }
        if (candidateMode && detailBytes) {
          validateCommittedCandidateEvidence(
            receipt.detailedReceiptPath,
            detailBytes,
            candidateLineage,
            errors,
            options,
            `${artifact.id} detailed receipt`,
          );
        }
        if (candidateMode && manifestBytes) {
          validateCommittedCandidateEvidence(
            receipt.buildManifestPath,
            manifestBytes,
            candidateLineage,
            errors,
            options,
            `${artifact.id} build manifest`,
          );
        }
        if (detailBytes && manifestBytes) {
          const detailedReceipt = JSON.parse(Buffer.from(detailBytes).toString('utf8'));
          const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
          for (const failure of validateHardwareWebGl2DetailedReceipt(detailedReceipt, {
            sourceSha: artifact.sourceSha,
            environmentHash: artifact.environmentHash,
            buildManifestSha256: artifact.buildManifestSha256,
          })) error(errors, 'E_HARDWARE_WEBGL2_DETAIL_CONTRACT', `${artifact.id} ${failure}.`);
          for (const failure of validateHardwareWebGl2BuildManifest(manifest, { sourceSha: artifact.sourceSha })) {
            error(errors, 'E_HARDWARE_WEBGL2_BUILD_CONTRACT', `${artifact.id} ${failure}.`);
          }
          let liveBuildManifest = options.currentBuildManifest;
          if (!liveBuildManifest) {
            try { liveBuildManifest = currentBuildManifest(artifact.sourceSha); }
            catch (caught) {
              error(errors, 'E_HARDWARE_WEBGL2_CURRENT_BUILD', `${artifact.id} cannot read current dist/: ${caught.message}.`);
            }
          }
          if (liveBuildManifest && JSON.stringify(liveBuildManifest) !== JSON.stringify(manifest)) {
            error(errors, 'E_HARDWARE_WEBGL2_CURRENT_BUILD', `${artifact.id} bound manifest differs from the current production dist/ bytes.`);
          }
          if (candidateLineage && liveBuildManifest?.sourceSha !== candidateSha) {
            error(errors, 'E_HARDWARE_WEBGL2_CURRENT_BUILD', `${artifact.id} current production dist/ manifest is not labelled with frozen S0 ${candidateSha}.`);
          }
          const chromePath = detailedReceipt.environment?.chromeExecutable;
          const recordedChromeSha = detailedReceipt.environment?.chromeExecutableSha256;
          const injectedChrome = options.chromeExecutableBytesByPath;
          let chromeBytes;
          let chromeAvailable = false;
          if (injectedChrome !== undefined) {
            chromeAvailable = injectedChrome?.has(chromePath) === true;
            if (chromeAvailable) chromeBytes = injectedChrome.get(chromePath);
          } else if (typeof chromePath === 'string' && fs.existsSync(chromePath)) {
            chromeBytes = fs.readFileSync(chromePath);
            chromeAvailable = true;
          }
          if (!/^[0-9a-f]{64}$/.test(recordedChromeSha ?? '')) {
            error(errors, 'E_HARDWARE_WEBGL2_CHROME_DIGEST', `${artifact.id} detailed receipt lacks a valid installed Chrome executable digest.`);
          } else if (chromeAvailable && (!chromeBytes || sha256(chromeBytes) !== recordedChromeSha)) {
            error(errors, 'E_HARDWARE_WEBGL2_CHROME_DIGEST', `${artifact.id} installed Chrome executable identity does not match the detailed receipt.`);
          } else if (!chromeAvailable && !candidateMode) {
            error(errors, 'E_HARDWARE_WEBGL2_CHROME_DIGEST', `${artifact.id} installed Chrome executable is unavailable for strict local verification.`);
          }
        }
      }
    } catch (caught) {
      error(errors, 'E_GRAPH_ARTIFACT_RECEIPT', `${artifact.id} evidence is not a valid canonical JSON receipt: ${caught.message}`);
    }
  }
  return candidateLineage;
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
  const expectedHardwareWebGl2Command = 'npm run qa:pass65:frame-pacing-policy && npm run build && node scripts/qa/verify-pass65-hardware-webgl2-admission.ts';
  if (packageJson.scripts?.['qa:pass65:hardware-webgl2-admission'] !== expectedHardwareWebGl2Command) {
    error(errors, 'E_HARDWARE_WEBGL2_PACKAGE_COMMAND', 'hardware-WebGL2 candidate command must retain policy, production build and exact verifier execution.');
  }
  const expectedHiddenTabContractCommand = 'node --test scripts/qa/pass66-hidden-tab-contract.test.mjs';
  if (packageJson.scripts?.['qa:pass66:hidden-tab:contract'] !== expectedHiddenTabContractCommand) {
    error(errors, 'E_PASS66_HIDDEN_TAB_PACKAGE_COMMAND', 'Pass 66 hidden-tab contract command must execute the exact fail-closed contract test.');
  }
  const expectedHiddenTabCommand = 'npm run qa:pass66:hidden-tab:contract && npm run build && npm run stage:release-topology && node scripts/qa/run-with-preview-server.mjs node scripts/qa/run-pass66-hidden-tab-matrix.mjs';
  if (packageJson.scripts?.['qa:pass66:hidden-tab'] !== expectedHiddenTabCommand) {
    error(errors, 'E_PASS66_HIDDEN_TAB_PACKAGE_COMMAND', 'Pass 66 hidden-tab gate must retain its contract test, production build and complete selected-map real headed-Chrome matrix.');
  }
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
  try {
    validatePass66BlockingCatalog(graph);
  } catch (caught) {
    errors.push(caught instanceof Error ? caught.message : `E_GRAPH_PASS66_TEST_CONTRACT: ${String(caught)}`);
  }

  const artifactIndex = uniqueIndex(graph.artifactCatalog, 'Artifact catalog', errors, 'E_GRAPH_ARTIFACT_DUPLICATE');
  if (options.candidateMode) {
    try {
      validateExactArtifactCatalog(graph, [...artifactIndex.values()]);
    } catch (caught) {
      if (caught instanceof FinalizationError) errors.push(caught.message);
      else error(errors, 'E_CANDIDATE_ARTIFACT_CATALOG', `Exact artifact-catalog validation failed: ${caught.message}.`);
    }
  }
  const candidateLineage = validateArtifacts(graph, artifactIndex, testIndex, feedbackById, errors, options);
  if (options.candidateMode) {
    validateCandidateAcceptanceProjection({
      graph,
      matrixRows,
      feedbackById,
      artifactIndex,
      candidateLineage,
      errors,
      options,
    });
  }

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
    for (const requiredTestRef of REQUIRED_NATIVE_TESTS_BY_FEEDBACK.get(feedbackId) ?? []) {
      if (!testRefs.includes(requiredTestRef)) {
        error(errors, 'E_GRAPH_NATIVE_GATE_REQUIRED', `${feedbackId} must retain ${requiredTestRef}.`);
      }
    }
    for (const requiredTestRef of REQUIRED_PASS66_TESTS_BY_FEEDBACK.get(feedbackId) ?? []) {
      if (!testRefs.includes(requiredTestRef)) {
        error(errors, 'E_GRAPH_PASS66_GATE_REQUIRED', `${feedbackId} must retain ${requiredTestRef}.`);
      }
    }

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
      if (HARDWARE_WEBGL2_FEEDBACK_IDS.includes(feedbackId)
        && !artifactRefs.some((artifactRef) => artifactIndex.get(artifactRef)?.testRefs?.includes(HARDWARE_WEBGL2_TEST_ID))) {
        error(errors, 'E_CANDIDATE_HARDWARE_WEBGL2_ARTIFACT_REQUIRED', `${feedbackId} lacks an exact ${HARDWARE_WEBGL2_TEST_ID} schema-v2 evidence artifact.`);
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

function buildCandidateFixture(graph, ledger, matrix) {
  const fixtureGraph = structuredClone(graph);
  const sourceSha = 'a'.repeat(40);
  const environmentHash = 'b'.repeat(64);
  const feedbackByTest = new Map(fixtureGraph.testCatalog.map((test) => [test.id, []]));
  for (const node of fixtureGraph.feedbackNodes) {
    for (const testRef of node.verification.testRefs) feedbackByTest.get(testRef)?.push(node.id);
  }
  for (const feedbackIds of feedbackByTest.values()) feedbackIds.sort();

  const hardwareFixture = createHardwareWebGl2ReceiptFixture(sourceSha);
  const hardwareDetailPath = `${HARDWARE_EVIDENCE_ROOT}${sourceSha}-receipt.json`;
  const hardwareManifestPath = `${HARDWARE_EVIDENCE_ROOT}${sourceSha}-dist-manifest.json`;
  const artifacts = [];
  const artifactBytesByPath = new Map();
  for (const test of fixtureGraph.testCatalog) {
    const feedbackIds = feedbackByTest.get(test.id) ?? [];
    const relativePath = receiptPathForTest(test.id, sourceSha);
    const visualDigest = test.id !== HARDWARE_WEBGL2_TEST_ID && evidenceKindsForTest(test).kinds.includes('visual')
      ? sha256(Buffer.from(`self-test-visual-${test.id}`, 'utf8'))
      : null;
    const receipt = test.id === HARDWARE_WEBGL2_TEST_ID ? {
      schemaVersion: 2,
      kind: 'pass65-owner-feedback-evidence',
      sourceSha,
      buildId: 'self-test-hardware-webgl2',
      verifierId: 'pass65-installed-chrome-hardware-webgl2-admission',
      verifierVersion: '1',
      environmentHash: hardwareFixture.environmentHash,
      result: 'passed',
      feedbackIds,
      testRefs: [test.id],
      detailedReceiptPath: hardwareDetailPath,
      detailedReceiptSha256: hardwareFixture.detailedReceiptSha256,
      buildManifestPath: hardwareManifestPath,
      buildManifestSha256: hardwareFixture.buildManifestSha256,
    } : {
      schemaVersion: 1,
      kind: 'pass65-owner-feedback-evidence',
      sourceSha,
      buildId: `self-test-${test.id.toLowerCase()}${visualDigest ? `-visual-${visualDigest}` : ''}`,
      verifierId: test.id,
      verifierVersion: '1',
      environmentHash,
      result: 'passed',
      feedbackIds,
      testRefs: [test.id],
    };
    const bytes = Buffer.from(JSON.stringify(receipt), 'utf8');
    const artifact = {
      id: artifactIdForTest(test.id),
      path: relativePath,
      sha256: sha256(bytes),
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
    artifacts.push(artifact);
    artifactBytesByPath.set(relativePath, bytes);
  }
  artifacts.sort((left, right) => left.id.localeCompare(right.id));
  artifactBytesByPath.set(hardwareDetailPath, hardwareFixture.detailedBytes);
  artifactBytesByPath.set(hardwareManifestPath, hardwareFixture.manifestBytes);

  fixtureGraph.candidateEvidenceSourceSha = sourceSha;
  fixtureGraph.artifactCatalog = artifacts;
  for (const node of fixtureGraph.feedbackNodes) {
    node.verification.coverage = 'complete';
    node.verification.artifactRefs = [...new Set(node.verification.testRefs.map(artifactIdForTest))].sort();
  }
  const feedbackById = new Map(parseLedger(ledger).feedbackRows.map((row) => [row.id, row]));
  const matrixRows = parseMatrix(matrix);
  const artifactIndex = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const acceptanceManifest = {
    schemaVersion: 1,
    releasePass: 'PASS 66',
    feedbackReceivedAt: '2026-07-29T00:00:00Z',
    status: 'accepted',
    preview: {
      kind: 'github-actions-artifact',
      ref: `pr-preview-66-${sourceSha}`,
      sourceSha,
      createdAt: '2026-07-30T00:00:00Z',
    },
    humanAcceptance: {
      state: 'approved',
      approvedBy: 'Dave',
      approvedAt: '2026-07-30T00:01:00Z',
      evidence: 'Dave\'s standing conditional publication authorization is bound here; Dave did not inspect this immutable preview.',
    },
    requirements: expectedCandidateAcceptanceRequirements(
      matrixRows,
      fixtureGraph,
      feedbackById,
      artifactIndex,
      sourceSha,
    ),
  };
  const committedArtifactBytesByPath = new Map(artifactBytesByPath);
  committedArtifactBytesByPath.set(PASS66_ACCEPTANCE_PATH, Buffer.from(`${JSON.stringify(acceptanceManifest, null, 2)}\n`, 'utf8'));
  return {
    graph: fixtureGraph,
    acceptanceManifest,
    artifactBytesByPath,
    committedArtifactBytesByPath,
    chromeExecutableBytesByPath: new Map([[
      hardwareFixture.detailedReceipt.environment.chromeExecutable,
      hardwareFixture.chromeExecutableBytes,
    ]]),
    currentGitSha: 'c'.repeat(40),
    currentGitStatus: '',
    candidateIsAncestor: true,
    currentChangedPaths: [
      'acceptance/pass-66.json',
      'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md',
      'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json',
      ...artifactBytesByPath.keys(),
    ],
    currentBuildManifest: hardwareFixture.manifest,
  };
}

function hardwareSidecarFromArtifact(artifact) {
  return {
    schemaVersion: 2,
    kind: 'pass65-owner-feedback-evidence',
    sourceSha: artifact.sourceSha,
    buildId: artifact.buildId,
    verifierId: artifact.verifierId,
    verifierVersion: artifact.verifierVersion,
    environmentHash: artifact.environmentHash,
    result: artifact.result,
    feedbackIds: artifact.feedbackIds,
    testRefs: artifact.testRefs,
    detailedReceiptPath: artifact.detailedReceiptPath,
    detailedReceiptSha256: artifact.detailedReceiptSha256,
    buildManifestPath: artifact.buildManifestPath,
    buildManifestSha256: artifact.buildManifestSha256,
  };
}

function mutateHardwareDetailedFixture(fixture, mutate) {
  const graph = structuredClone(fixture.graph);
  const artifactBytesByPath = new Map(fixture.artifactBytesByPath);
  const artifact = graph.artifactCatalog.find((candidate) => candidate.testRefs?.includes(HARDWARE_WEBGL2_TEST_ID));
  const detail = JSON.parse(Buffer.from(artifactBytesByPath.get(artifact.detailedReceiptPath)).toString('utf8'));
  mutate(detail);
  const detailBytes = Buffer.from(`${JSON.stringify(detail, null, 2)}\n`, 'utf8');
  artifact.detailedReceiptSha256 = sha256(detailBytes);
  artifactBytesByPath.set(artifact.detailedReceiptPath, detailBytes);
  const sidecarBytes = Buffer.from(JSON.stringify(hardwareSidecarFromArtifact(artifact)), 'utf8');
  artifact.sha256 = sha256(sidecarBytes);
  artifactBytesByPath.set(artifact.path, sidecarBytes);
  const committedArtifactBytesByPath = new Map(fixture.committedArtifactBytesByPath);
  committedArtifactBytesByPath.set(artifact.detailedReceiptPath, detailBytes);
  committedArtifactBytesByPath.set(artifact.path, sidecarBytes);
  return {
    graph,
    artifactBytesByPath,
    committedArtifactBytesByPath,
    chromeExecutableBytesByPath: fixture.chromeExecutableBytesByPath,
    currentGitSha: fixture.currentGitSha,
    currentGitStatus: fixture.currentGitStatus,
    candidateIsAncestor: fixture.candidateIsAncestor,
    currentChangedPaths: fixture.currentChangedPaths,
    currentBuildManifest: fixture.currentBuildManifest,
  };
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
      inputs.packageJson ?? packageJson,
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
  const missingNativeGate = structuredClone(graph);
  missingNativeGate.feedbackNodes.find((node) => node.id === 'HF-001').verification.testRefs = [
    'T-MENU-LIFECYCLE-E2E',
    'T-WEBGPU-ENDURANCE',
  ];
  expectRejected('missing required native gate', 'E_GRAPH_NATIVE_GATE_REQUIRED', { graph: missingNativeGate });
  for (const feedbackId of ['HF-222', 'HF-225', 'HF-229', 'HF-230']) {
    const missingPass69NativeGate = structuredClone(graph);
    const feedback = missingPass69NativeGate.feedbackNodes.find((node) => node.id === feedbackId);
    feedback.verification.testRefs = feedback.verification.testRefs
      .filter((testRef) => testRef !== 'T-NATIVE-FRAME-PACING');
    expectRejected(
      `${feedbackId} missing Pass 69.3 native frame-pacing gate`,
      'E_GRAPH_NATIVE_GATE_REQUIRED',
      { graph: missingPass69NativeGate },
    );
  }
  const missingHardwareWebGl2Gate = structuredClone(graph);
  missingHardwareWebGl2Gate.feedbackNodes.find((node) => node.id === 'HF-001').verification.testRefs =
    missingHardwareWebGl2Gate.feedbackNodes.find((node) => node.id === 'HF-001').verification.testRefs
      .filter((testRef) => testRef !== HARDWARE_WEBGL2_TEST_ID);
  expectRejected('missing required hardware WebGL2 gate', 'E_GRAPH_NATIVE_GATE_REQUIRED', { graph: missingHardwareWebGl2Gate });
  const noOpHardwarePackage = structuredClone(packageJson);
  noOpHardwarePackage.scripts['qa:pass65:hardware-webgl2-admission'] = 'node -e "process.exit(0)"';
  expectRejected('no-op hardware WebGL2 package command', 'E_HARDWARE_WEBGL2_PACKAGE_COMMAND', { packageJson: noOpHardwarePackage });
  for (const testId of [PASS66_BROWSER_FOREGROUND_TEST_ID, PASS66_HIDDEN_TAB_TEST_ID]) {
    const missingPass66Gate = structuredClone(graph);
    missingPass66Gate.feedbackNodes.find((node) => node.id === 'HF-152').verification.testRefs =
      missingPass66Gate.feedbackNodes.find((node) => node.id === 'HF-152').verification.testRefs
        .filter((testRef) => testRef !== testId);
    expectRejected(`missing required ${testId}`, 'E_GRAPH_PASS66_GATE_REQUIRED', { graph: missingPass66Gate });
  }
  const substitutedPass66Command = structuredClone(graph);
  substitutedPass66Command.testCatalog.find((test) => test.id === PASS66_HIDDEN_TAB_TEST_ID).command = 'npm run qa:pass66:hidden-tab:contract';
  expectRejected('substituted Pass 66 hidden-tab graph command', 'E_GRAPH_PASS66_TEST_CONTRACT', { graph: substitutedPass66Command });
  const downgradedPass66BrowserEvidence = structuredClone(graph);
  downgradedPass66BrowserEvidence.testCatalog.find((test) => test.id === PASS66_HIDDEN_TAB_TEST_ID).evidenceKinds = ['contract'];
  expectRejected('downgraded Pass 66 hidden-tab browser evidence', 'E_GRAPH_PASS66_TEST_CONTRACT', { graph: downgradedPass66BrowserEvidence });
  for (const packageScriptId of ['qa:pass66:hidden-tab:contract', 'qa:pass66:hidden-tab']) {
    const noOpHiddenTabPackage = structuredClone(packageJson);
    noOpHiddenTabPackage.scripts[packageScriptId] = 'node -e "process.exit(0)"';
    expectRejected(`no-op ${packageScriptId} package command`, 'E_PASS66_HIDDEN_TAB_PACKAGE_COMMAND', { packageJson: noOpHiddenTabPackage });
  }

  const readyLedger = candidateReadyLedger(ledger);
  const fixture = buildCandidateFixture(graph, readyLedger, matrix);
  const fixtureOptions = {
    candidateMode: true,
    artifactBytesByPath: fixture.artifactBytesByPath,
    committedArtifactBytesByPath: fixture.committedArtifactBytesByPath,
    chromeExecutableBytesByPath: fixture.chromeExecutableBytesByPath,
    currentGitSha: fixture.currentGitSha,
    currentGitStatus: fixture.currentGitStatus,
    candidateIsAncestor: fixture.candidateIsAncestor,
    currentChangedPaths: fixture.currentChangedPaths,
    currentBuildManifest: fixture.currentBuildManifest,
  };
  const candidateResult = validate(readyLedger, matrix, agents, packageJson, fixture.graph, fixtureOptions);
  if (candidateResult.errors.length > 0) {
    failures.push(`E_SELFTEST_CANDIDATE_FIXTURE: Candidate-ready fixture failed: ${candidateResult.errors[0]}.`);
    return failures;
  }

  function rejectAcceptanceMutation(name, mutate) {
    const manifest = structuredClone(fixture.acceptanceManifest);
    mutate(manifest);
    const committedArtifactBytesByPath = new Map(fixture.committedArtifactBytesByPath);
    committedArtifactBytesByPath.set(
      PASS66_ACCEPTANCE_PATH,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    );
    expectRejected(name, 'E_CANDIDATE_ACCEPTANCE_PROJECTION', {
      ledger: readyLedger,
      graph: fixture.graph,
      options: { ...fixtureOptions, committedArtifactBytesByPath },
    });
  }

  rejectAcceptanceMutation('candidate one-row fabricated acceptance manifest', (manifest) => {
    manifest.requirements = manifest.requirements.slice(0, 1);
  });
  rejectAcceptanceMutation('candidate extra acceptance requirement', (manifest) => {
    manifest.requirements.push(structuredClone(manifest.requirements.at(-1)));
  });
  rejectAcceptanceMutation('candidate reordered acceptance requirements', (manifest) => {
    [manifest.requirements[0], manifest.requirements[1]] = [manifest.requirements[1], manifest.requirements[0]];
  });
  for (const [name, field, value] of [
    ['planning ID substitution', 'planningRequirementId', 'R999'],
    ['summary substitution', 'summary', 'R001 - Fabricated summary'],
    ['expected-outcome substitution', 'expected', 'Fabricated expected result.'],
    ['falsifier substitution', 'falsifier', 'Fabricated falsifier.'],
    ['acceptance substitution', 'acceptance', 'human'],
  ]) {
    rejectAcceptanceMutation(`candidate ${name}`, (manifest) => { manifest.requirements[0][field] = value; });
  }
  rejectAcceptanceMutation('candidate substituted evidence artifact', (manifest) => {
    const evidence = manifest.requirements[0].evidence[0];
    evidence.artifactId = fixture.graph.artifactCatalog.find((artifact) => artifact.id !== evidence.artifactId).id;
  });
  rejectAcceptanceMutation('candidate forged evidence artifact digest', (manifest) => {
    manifest.requirements[0].evidence[0].artifactSha256 = '0'.repeat(64);
  });
  rejectAcceptanceMutation('candidate forged evidence source SHA', (manifest) => {
    manifest.requirements[0].evidence[0].sourceSha = 'b'.repeat(40);
  });
  rejectAcceptanceMutation('candidate substituted evidence test', (manifest) => {
    const evidence = manifest.requirements[0].evidence[0];
    evidence.testRef = fixture.graph.testCatalog.find((test) => test.id !== evidence.testRef).id;
  });
  rejectAcceptanceMutation('candidate forged evidence feedback set', (manifest) => {
    const evidence = manifest.requirements.flatMap((requirement) => requirement.evidence)
      .find((entry) => entry.feedbackIds.length > 0);
    evidence.feedbackIds = evidence.feedbackIds.slice(1);
  });
  rejectAcceptanceMutation('candidate acceptance top-level extension', (manifest) => {
    manifest.fabricatedApproval = true;
  });
  rejectAcceptanceMutation('candidate wrong release identity', (manifest) => {
    manifest.releasePass = 'PASS 65';
  });
  const missingAcceptanceBytes = new Map(fixture.committedArtifactBytesByPath);
  missingAcceptanceBytes.delete(PASS66_ACCEPTANCE_PATH);
  expectRejected('candidate missing committed Pass 66 acceptance', 'E_CANDIDATE_ACCEPTANCE_MISSING', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, committedArtifactBytesByPath: missingAcceptanceBytes },
  });
  const malformedAcceptanceBytes = new Map(fixture.committedArtifactBytesByPath);
  malformedAcceptanceBytes.set(PASS66_ACCEPTANCE_PATH, Buffer.from('{', 'utf8'));
  expectRejected('candidate malformed committed Pass 66 acceptance', 'E_CANDIDATE_ACCEPTANCE_JSON', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, committedArtifactBytesByPath: malformedAcceptanceBytes },
  });

  const missingTest = structuredClone(fixture.graph);
  missingTest.feedbackNodes.find((node) => node.id === 'HF-001').verification.testRefs = [];
  expectRejected('candidate missing test', 'E_CANDIDATE_TEST_REQUIRED', { ledger: readyLedger, graph: missingTest, options: fixtureOptions });
  const missingArtifact = structuredClone(fixture.graph);
  missingArtifact.feedbackNodes.find((node) => node.id === 'HF-001').verification.artifactRefs = [];
  expectRejected('candidate missing artifact', 'E_CANDIDATE_ARTIFACT_REQUIRED', { ledger: readyLedger, graph: missingArtifact, options: fixtureOptions });
  const missingHardwareArtifact = structuredClone(fixture.graph);
  missingHardwareArtifact.feedbackNodes.find((node) => node.id === 'HF-001').verification.artifactRefs =
    missingHardwareArtifact.feedbackNodes.find((node) => node.id === 'HF-001').verification.artifactRefs
      .filter((artifactRef) => artifactRef !== artifactIdForTest(HARDWARE_WEBGL2_TEST_ID));
  expectRejected('candidate missing exact hardware WebGL2 artifact', 'E_CANDIDATE_HARDWARE_WEBGL2_ARTIFACT_REQUIRED', {
    ledger: readyLedger, graph: missingHardwareArtifact, options: fixtureOptions,
  });
  const prioritiesByFeedback = new Map(parseLedger(readyLedger).feedbackRows.map((row) => [row.id, row.priority]));
  const p2OnlyTest = fixture.graph.testCatalog.find((test) => {
    const feedbackIds = fixture.graph.feedbackNodes
      .filter((node) => node.verification.testRefs.includes(test.id))
      .map((node) => node.id);
    return feedbackIds.length > 0 && feedbackIds.every((feedbackId) => prioritiesByFeedback.get(feedbackId) === 'P2');
  });
  if (!p2OnlyTest) {
    failures.push('E_SELFTEST_FIXTURE: Exact-catalog mutation could not find a P2-only graph test.');
  } else {
    const missingP2Receipt = structuredClone(fixture.graph);
    missingP2Receipt.artifactCatalog = missingP2Receipt.artifactCatalog
      .filter((artifact) => !artifact.testRefs.includes(p2OnlyTest.id));
    for (const node of missingP2Receipt.feedbackNodes) {
      node.verification.artifactRefs = node.verification.artifactRefs
        .filter((artifactRef) => artifactRef !== artifactIdForTest(p2OnlyTest.id));
    }
    expectRejected('candidate missing P2-only test receipt', 'E_ARTIFACT_TEST_SET', {
      ledger: readyLedger,
      graph: missingP2Receipt,
      options: fixtureOptions,
    });
  }
  const wrongDigest = structuredClone(fixture.graph);
  wrongDigest.artifactCatalog[0].sha256 = '0'.repeat(64);
  expectRejected('candidate stale artifact digest', 'E_CANDIDATE_ARTIFACT_DIGEST', { ledger: readyLedger, graph: wrongDigest, options: fixtureOptions });
  const nonCanonicalReceiptPath = structuredClone(fixture.graph);
  const normalArtifact = nonCanonicalReceiptPath.artifactCatalog.find((artifact) => !artifact.testRefs.includes(HARDWARE_WEBGL2_TEST_ID));
  normalArtifact.path = `artifacts/pass65-owner-feedback/renamed-${fixture.graph.candidateEvidenceSourceSha}.json`;
  expectRejected('candidate noncanonical receipt path', 'E_CANDIDATE_ARTIFACT_PATH', {
    ledger: readyLedger,
    graph: nonCanonicalReceiptPath,
    options: fixtureOptions,
  });
  const untrackedArtifactBytes = new Map(fixture.committedArtifactBytesByPath);
  untrackedArtifactBytes.delete(fixture.graph.artifactCatalog[0].path);
  expectRejected('ignored local artifact is not candidate evidence', 'E_CANDIDATE_ARTIFACT_UNTRACKED', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, committedArtifactBytesByPath: untrackedArtifactBytes },
  });
  const committedArtifactDrift = new Map(fixture.committedArtifactBytesByPath);
  committedArtifactDrift.set(fixture.graph.artifactCatalog[0].path, Buffer.from('different committed receipt', 'utf8'));
  expectRejected('working artifact differs from committed evidence', 'E_CANDIDATE_ARTIFACT_COMMITTED_BYTES', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, committedArtifactBytesByPath: committedArtifactDrift },
  });
  const hardwareArtifact = fixture.graph.artifactCatalog.find((artifact) => artifact.testRefs?.includes(HARDWARE_WEBGL2_TEST_ID));
  const untrackedHardwareDetail = new Map(fixture.committedArtifactBytesByPath);
  untrackedHardwareDetail.delete(hardwareArtifact.detailedReceiptPath);
  expectRejected('hardware detail is not committed at S0M', 'E_CANDIDATE_ARTIFACT_UNTRACKED', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, committedArtifactBytesByPath: untrackedHardwareDetail },
  });

  function rejectDetailedMutation(name, mutate) {
    const candidate = mutateHardwareDetailedFixture(fixture, mutate);
    expectRejected(name, 'E_HARDWARE_WEBGL2_DETAIL_CONTRACT', {
      ledger: readyLedger,
      graph: candidate.graph,
      options: { candidateMode: true, ...candidate },
    });
  }
  rejectDetailedMutation('two fresh browser trials', (detail) => { detail.trials.pop(); });
  rejectDetailedMutation('duplicate browser/profile identity', (detail) => {
    detail.trials[1].profile = structuredClone(detail.trials[0].profile);
    detail.trials[1].browserProcessIds = [...detail.trials[0].browserProcessIds];
  });
  rejectDetailedMutation('software adapter forged false', (detail) => {
    const active = detail.trials[0].arenas[0].activeAudit;
    active.runtime.adapterLabel = 'Google SwiftShader';
    active.runtime.softwareAdapter = false;
    active.rawWebGl.renderer = 'Google SwiftShader';
  });
  rejectDetailedMutation('compat route', (detail) => { detail.configuration.routeContract = 'renderer=webgl2&render=compat'; });
  rejectDetailedMutation('renderPaused route', (detail) => { detail.configuration.routeContract += '&renderPaused=1'; });
  rejectDetailedMutation('signal-off route', (detail) => { detail.configuration.routeContract += '&signal=off'; });
  rejectDetailedMutation('untrusted physical start', (detail) => {
    detail.trials[0].arenas[0].admission.physicalSoloStarts[0].isTrusted = false;
  });
  rejectDetailedMutation('trimmed and reordered timing', (detail) => {
    const timing = detail.trials[0].arenas[0].admission.timing;
    timing.transitionReadyAt = timing.firstGameplayPresentedAt + 1;
  });
  rejectDetailedMutation('missing all-map circuit arena', (detail) => { detail.trials[0].arenas.pop(); });
  rejectDetailedMutation('accepted restored context', (detail) => {
    detail.trials[0].arenas[0].activeAudit.runtime.contextLifecycle.restorations = 1;
  });
  rejectDetailedMutation('reset readPixels counter after validation', (detail) => {
    detail.trials[0].arenas[0].admission.readPixels = [];
  });
  rejectDetailedMutation('readPixels between transition-ready and first-live', (detail) => {
    const timing = detail.trials[0].arenas[0].admission.timing;
    detail.trials[0].arenas[0].admission.readPixels[0].at = (timing.transitionReadyAt + timing.firstGameplayPresentedAt) / 2;
  });
  rejectDetailedMutation('full-frame admission readPixels', (detail) => {
    detail.trials[0].arenas[0].admission.readPixels[0].width = 2_560;
  });
  rejectDetailedMutation('empty steady intervals', (detail) => {
    detail.trials[0].arenas[0].steady.frameWindow.intervalsMs = [];
  });
  rejectDetailedMutation('NaN steady interval', (detail) => {
    detail.trials[0].arenas[0].steady.frameWindow.intervalsMs[0] = Number.NaN;
  });
  rejectDetailedMutation('post-ready frame hitch', (detail) => {
    detail.trials[0].arenas[0].admission.postReadyFrameWindow.intervalsMs[0] = 50;
  });
  rejectDetailedMutation('post-ready long task', (detail) => {
    detail.trials[0].arenas[0].admission.postReadyFrameWindow.longTasks.push({ startTime: 3_000, duration: 60, name: 'self' });
  });
  rejectDetailedMutation('post-ready ledger gap', (detail) => {
    detail.trials[0].arenas[0].admission.postReadyFrameWindow.endedAt -= 100;
  });
  rejectDetailedMutation('frozen gameplay counters under smooth browser rAF', (detail) => {
    const progress = detail.trials[0].arenas[0].steady.progress;
    progress.after = structuredClone(progress.before);
    progress.delta = { frameCount: 0, presentedGameplayFrame: 0 };
  });
  rejectDetailedMutation('forged gameplay progress delta', (detail) => {
    detail.trials[0].arenas[0].steady.progress.delta.frameCount += 1;
  });
  rejectDetailedMutation('missing active presentation counters', (detail) => {
    delete detail.trials[0].arenas[0].activeAudit.presentedGameplayFrame;
    delete detail.trials[0].arenas[0].activeAudit.renderCalls;
  });
  rejectDetailedMutation('non-active AtomicSignal dataset', (detail) => {
    detail.trials[0].arenas[0].activeAudit.atomicSignalDataset = 'warming';
  });
  rejectDetailedMutation('unknown device-loss state', (detail) => {
    delete detail.trials[0].arenas[0].activeAudit.runtime.deviceLost;
  });
  rejectDetailedMutation('readPixels after steady handoff', (detail) => {
    const arena = detail.trials[0].arenas[0];
    arena.admission.readPixels.push({
      at: arena.steady.frameWindow.endedAt + 1,
      width: 1,
      height: 1,
      stack: 'AtomicSignalPass.validateOutput',
    });
  });
  rejectDetailedMutation('forged trial environment index', (detail) => { detail.trials[0].trial = 2; });
  rejectDetailedMutation('forged CDP process proof', (detail) => {
    detail.trials[0].systemInfo.processInfo[0].id += 1;
  });
  rejectDetailedMutation('forged aggregate comparison', (detail) => { detail.aggregate.atomic.sampleCount += 1; });
  rejectDetailedMutation('raw Atomic regression hidden by stored comparison', (detail) => {
    detail.trials[0].arenas[0].steady.frameWindow.intervalsMs.fill(49);
  });
  rejectDetailedMutation('blank drawing buffer', (detail) => {
    detail.trials[0].arenas[0].activeAudit.drawingBuffer = [0, 0];
  });
  rejectDetailedMutation('non-idle transition accepted', (detail) => {
    detail.trials[0].arenas[0].activeAudit.transition.phase = 'committing';
  });
  rejectDetailedMutation('weakened admission readPixels area', (detail) => {
    detail.configuration.thresholds.maximumAdmissionReadPixelsArea = 2;
  });
  rejectDetailedMutation('forged environment hash content', (detail) => { detail.environment.totalMemoryGiB += 1; });
  rejectDetailedMutation('dirty detailed source', (detail) => { detail.source.cleanAfter = false; });
  rejectDetailedMutation('head drift in detailed source', (detail) => { detail.source.endingSha = 'f'.repeat(40); });
  rejectDetailedMutation('stale build digest in detail', (detail) => { detail.source.buildManifestSha256 = 'f'.repeat(64); });

  expectRejected('candidate S0 is not an ancestor of S0M', 'E_CANDIDATE_SOURCE_ANCESTRY', {
    ledger: readyLedger, graph: fixture.graph, options: { ...fixtureOptions, candidateIsAncestor: false },
  });
  expectRejected('current candidate HEAD is not exact', 'E_CANDIDATE_CURRENT_SOURCE', {
    ledger: readyLedger, graph: fixture.graph, options: { ...fixtureOptions, currentGitSha: 'not-a-commit' },
  });
  expectRejected('current candidate dirty tree', 'E_CANDIDATE_CURRENT_SOURCE', {
    ledger: readyLedger, graph: fixture.graph, options: { ...fixtureOptions, currentGitStatus: ' M src/legacy-main.ts' },
  });
  expectRejected('runtime drift after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: [...fixture.currentChangedPaths, 'src/legacy-main.ts'] },
  });
  expectRejected('release-shell drift after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: [...fixture.currentChangedPaths, 'release-channels.json'] },
  });
  expectRejected('wrong release-pass acceptance manifest after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: [...fixture.currentChangedPaths, 'acceptance/pass-65.json'] },
  });
  expectRejected('test drift after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: [...fixture.currentChangedPaths, 'tests/e2e/atomic-acres.spec.ts'] },
  });
  expectRejected('owner-gate verifier drift after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: {
      ...fixtureOptions,
      currentChangedPaths: [
        ...fixture.currentChangedPaths,
        '.agents/skills/atomic-acres-owner-feedback-gate/scripts/verify-owner-feedback-ledger.mjs',
      ],
    },
  });
  expectRejected('workflow drift after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: [...fixture.currentChangedPaths, '.github/workflows/verify.yml'] },
  });
  expectRejected('unknown path drift after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: [...fixture.currentChangedPaths, 'mystery/evidence.bin'] },
  });
  expectRejected('non-JSON evidence payload after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: {
      ...fixtureOptions,
      currentChangedPaths: [...fixture.currentChangedPaths, 'artifacts/pass65-owner-feedback/unchecked.bin'],
    },
  });
  expectRejected('arbitrary JSON in owner evidence root after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: {
      ...fixtureOptions,
      currentChangedPaths: [...fixture.currentChangedPaths, `artifacts/pass65-owner-feedback/runtime-${fixture.graph.candidateEvidenceSourceSha}.json`],
    },
  });
  expectRejected('canonical-looking extra receipt after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: {
      ...fixtureOptions,
      currentChangedPaths: [...fixture.currentChangedPaths, `artifacts/pass65-owner-feedback/t-extra-${fixture.graph.candidateEvidenceSourceSha}.json`],
    },
  });
  expectRejected('wrong-SHA receipt after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: {
      ...fixtureOptions,
      currentChangedPaths: [...fixture.currentChangedPaths, `artifacts/pass65-owner-feedback/t-extra-${'b'.repeat(40)}.json`],
    },
  });
  expectRejected('missing required finalizer output after S0', 'E_CANDIDATE_FROZEN_DELTA', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentChangedPaths: fixture.currentChangedPaths.slice(1) },
  });
  expectRejected('current dist manifest drift', 'E_HARDWARE_WEBGL2_CURRENT_BUILD', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, currentBuildManifest: { ...fixture.currentBuildManifest, files: [] } },
  });
  const unavailableChromeResult = validate(readyLedger, matrix, agents, packageJson, fixture.graph, {
    ...fixtureOptions,
    chromeExecutableBytesByPath: new Map(),
  });
  if (unavailableChromeResult.errors.some((entry) => entry.startsWith('E_HARDWARE_WEBGL2_CHROME_DIGEST:'))) {
    failures.push('E_SELFTEST_MUTATION: Candidate mode rejected a digest-bound external Chrome executable that is unavailable on this machine.');
  }
  expectRejected('missing installed Chrome outside candidate mode', 'E_HARDWARE_WEBGL2_CHROME_DIGEST', {
    ledger: readyLedger,
    graph: fixture.graph,
    options: { ...fixtureOptions, candidateMode: false, chromeExecutableBytesByPath: new Map() },
  });
  const forgedChromeBytes = new Map(fixture.chromeExecutableBytesByPath);
  forgedChromeBytes.set([...forgedChromeBytes.keys()][0], Buffer.from('forged chrome', 'utf8'));
  expectRejected('forged installed Chrome bytes', 'E_HARDWARE_WEBGL2_CHROME_DIGEST', {
    ledger: readyLedger, graph: fixture.graph, options: { ...fixtureOptions, chromeExecutableBytesByPath: forgedChromeBytes },
  });
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
