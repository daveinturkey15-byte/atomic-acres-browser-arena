#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyPaths } from './change-impact.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const POLICY_PATH = join(REPOSITORY_ROOT, 'acceptance', 'policy.json');
const PASS66_MANIFEST_PATH = 'acceptance/pass-66.json';
const PASS66_LEDGER_PATH = 'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md';
const PASS66_GRAPH_RELATIVE_PATH = 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json';
const PASS66_GRAPH_PATH = join(REPOSITORY_ROOT, PASS66_GRAPH_RELATIVE_PATH);
const PASS66_OWNER_ARTIFACT_ROOT = 'artifacts/pass65-owner-feedback/';
const PASS66_HARDWARE_ARTIFACT_ROOT = 'artifacts/pass65/hardware-webgl2-admission/';
const PASS66_HARDWARE_TEST_ID = 'T-COLD-HARDWARE-WEBGL2';
const SHA40 = /^[0-9a-f]{40}$/;
const LOCAL_EVIDENCE = new Set(['unit', 'contract', 'browser', 'trace']);
const MECHANICAL_EVIDENCE = new Set(['unit', 'contract', 'browser', 'trace']);
const ACCEPTANCE_TYPES = new Set(['mechanical', 'visual', 'human', 'mixed']);
const REQUIREMENT_STATES = new Set(['verified', 'deferred']);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) values[token.slice(2)] = true;
    else {
      values[token.slice(2)] = next;
      index += 1;
    }
  }
  return values;
}

function git(...args) {
  return execFileSync('git', ['-C', REPOSITORY_ROOT, ...args], { encoding: 'utf8' }).trim();
}

function passNumber(value) {
  const match = /^PASS ([1-9][0-9]*)$/.exec(value ?? '');
  return match ? Number(match[1]) : null;
}

function manifestPathForPass(releasePass, policy) {
  const number = passNumber(releasePass);
  if (number === null) throw new Error('releasePass must look like "PASS 62"');
  return `${policy.manifestDirectory}/pass-${number}.json`;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function evidenceReferenceIsRemote(reference) {
  return /^(?:https:\/\/|artifact:\/\/)/.test(reference);
}

function safeRepositoryPath(reference) {
  if (!nonEmpty(reference) || isAbsolute(reference) || reference.includes('..')) return null;
  const absolute = resolve(REPOSITORY_ROOT, normalize(reference));
  if (relative(REPOSITORY_ROOT, absolute).startsWith('..')) return null;
  return absolute;
}

function changedPaths(base, head) {
  return git('diff', '--name-only', '--diff-filter=ACDMRTUXB', base, head)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'));
}

function changedManifestPaths(base, head, policy) {
  const pattern = new RegExp(`^${policy.manifestDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/pass-([1-9][0-9]*)\\.json$`);
  return changedPaths(base, head).filter((path) => {
    const match = pattern.exec(path);
    return match && Number(match[1]) >= policy.enforceFromPass;
  });
}

function validateEvidence(requirement, errors, policy) {
  if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
    errors.push(`${requirement.id}: evidence must contain at least one entry`);
    return;
  }
  const kinds = new Set();
  for (const [index, evidence] of requirement.evidence.entries()) {
    const prefix = `${requirement.id}.evidence[${index}]`;
    if (!evidence || typeof evidence !== 'object') {
      errors.push(`${prefix}: must be an object`);
      continue;
    }
    if (!policy.allowedEvidenceKinds.includes(evidence.kind)) {
      errors.push(`${prefix}: unknown kind ${JSON.stringify(evidence.kind)}`);
      continue;
    }
    kinds.add(evidence.kind);
    if (!nonEmpty(evidence.ref)) errors.push(`${prefix}: ref is required`);
    if (!nonEmpty(evidence.note)) errors.push(`${prefix}: note is required`);
    if (LOCAL_EVIDENCE.has(evidence.kind)) {
      if (!nonEmpty(evidence.command)) errors.push(`${prefix}: command is required for ${evidence.kind}`);
      const absolute = safeRepositoryPath(evidence.ref);
      if (!absolute || !existsSync(absolute)) errors.push(`${prefix}: local ref must exist inside the repository`);
    } else if (evidence.kind === 'visual' && !evidenceReferenceIsRemote(evidence.ref)) {
      const absolute = safeRepositoryPath(evidence.ref);
      if (!absolute || !existsSync(absolute)) errors.push(`${prefix}: visual ref must be a repository file, HTTPS URL, or artifact:// reference`);
    }
  }
  if ((requirement.acceptance === 'mechanical' || requirement.acceptance === 'mixed')
    && ![...kinds].some((kind) => MECHANICAL_EVIDENCE.has(kind))) {
    errors.push(`${requirement.id}: ${requirement.acceptance} acceptance needs mechanical evidence`);
  }
  if (requirement.acceptance === 'visual' || requirement.acceptance === 'mixed') {
    if (!kinds.has('browser')) errors.push(`${requirement.id}: visual acceptance needs served-browser evidence`);
    if (!kinds.has('visual')) errors.push(`${requirement.id}: visual acceptance needs a visual artifact`);
  }
  if (requirement.acceptance === 'human' && !kinds.has('manual')) {
    errors.push(`${requirement.id}: human acceptance needs manual evidence`);
  }
}

export function validateAcceptanceManifest(manifest, options = {}) {
  const policy = options.policy ?? JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { ok: false, errors: ['manifest must be an object'] };
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const number = passNumber(manifest.releasePass);
  if (number === null) errors.push('releasePass must look like "PASS 62"');
  if (!isIsoDate(manifest.feedbackReceivedAt)) errors.push('feedbackReceivedAt must be an ISO UTC timestamp');
  if (manifest.status !== 'accepted') errors.push('status must be accepted');
  if (!Array.isArray(manifest.requirements) || manifest.requirements.length === 0) {
    errors.push('requirements must contain at least one entry');
  } else {
    const ids = new Set();
    for (const [index, requirement] of manifest.requirements.entries()) {
      const expectedId = `R${index + 1}`;
      if (!requirement || typeof requirement !== 'object') {
        errors.push(`${expectedId}: requirement must be an object`);
        continue;
      }
      if (requirement.id !== expectedId) errors.push(`requirements[${index}].id must be ${expectedId}`);
      if (ids.has(requirement.id)) errors.push(`${requirement.id}: duplicate id`);
      ids.add(requirement.id);
      for (const field of ['summary', 'expected', 'falsifier']) {
        if (!nonEmpty(requirement[field])) errors.push(`${requirement.id}.${field} is required`);
      }
      if (!ACCEPTANCE_TYPES.has(requirement.acceptance)) errors.push(`${requirement.id}: invalid acceptance type`);
      if (!REQUIREMENT_STATES.has(requirement.state)) errors.push(`${requirement.id}: state must be verified or deferred`);
      if (requirement.state === 'verified') validateEvidence(requirement, errors, policy);
      if (requirement.state === 'deferred') {
        const decision = requirement.deferApproval;
        if (!decision || decision.approvedBy !== policy.ownerHandle || !isIsoDate(decision.approvedAt) || !nonEmpty(decision.reason)) {
          errors.push(`${requirement.id}: deferred requirements need Dave's timestamped reason`);
        }
      }
    }
  }

  const preview = manifest.preview;
  if (!preview || !['github-actions-artifact', 'immutable-url'].includes(preview.kind)
    || !nonEmpty(preview.ref) || !/^[0-9a-f]{40}$/.test(preview.sourceSha ?? '') || !isIsoDate(preview.createdAt)) {
    errors.push('preview must name its kind, immutable reference, full source SHA, and createdAt timestamp');
  }
  if (preview?.kind === 'github-actions-artifact') {
    const artifactMatch = /^pr-preview-[1-9][0-9]*-([0-9a-f]{40})$/.exec(preview.ref ?? '');
    if (!artifactMatch || artifactMatch[1] !== preview.sourceSha) {
      errors.push('GitHub Actions preview ref must be pr-preview-<pr>-<sourceSha> and match preview.sourceSha');
    }
  }
  const approval = manifest.humanAcceptance;
  if (!approval || approval.state !== 'approved' || approval.approvedBy !== policy.ownerHandle
    || !isIsoDate(approval.approvedAt) || !nonEmpty(approval.evidence)) {
    errors.push(`humanAcceptance must be approved by ${policy.ownerHandle} with timestamped evidence`);
  }
  if (manifest.releasePass === 'PASS 66' && approval && nonEmpty(approval.evidence)) {
    const evidence = approval.evidence.toLowerCase();
    const bindsStandingConditional = /\bstanding\s+conditional\b/.test(evidence);
    const explicitlyDisclaimsInspection = /\b(?:did\s+not|has\s+not|was\s+not)\b/.test(evidence)
      && /\b(?:inspect(?:ed|ion)?|test(?:ed|ing)?|review(?:ed)?)\b/.test(evidence)
      && /\bpreview\b/.test(evidence);
    if (!bindsStandingConditional || !explicitlyDisclaimsInspection) {
      errors.push('PASS 66 humanAcceptance.evidence must bind Dave\'s standing conditional authorization and explicitly state that he did not inspect or test the immutable preview');
    }
  }
  if (preview && approval && isIsoDate(preview.createdAt) && isIsoDate(approval.approvedAt)
    && Date.parse(approval.approvedAt) < Date.parse(preview.createdAt)) {
    errors.push('humanAcceptance.approvedAt cannot precede preview.createdAt');
  }
  if (isIsoDate(manifest.feedbackReceivedAt) && preview && isIsoDate(preview.createdAt)
    && Date.parse(preview.createdAt) < Date.parse(manifest.feedbackReceivedAt)) {
    errors.push('preview.createdAt cannot precede feedbackReceivedAt');
  }

  const verified = Array.isArray(manifest.requirements)
    ? manifest.requirements.filter((requirement) => requirement?.state === 'verified').length : 0;
  const deferred = Array.isArray(manifest.requirements)
    ? manifest.requirements.filter((requirement) => requirement?.state === 'deferred').length : 0;
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      releasePass: manifest.releasePass ?? null,
      total: Array.isArray(manifest.requirements) ? manifest.requirements.length : 0,
      verified,
      deferred,
      acceptanceRatio: Array.isArray(manifest.requirements) && manifest.requirements.length > 0
        ? verified / manifest.requirements.length : 0,
      feedbackReceivedAt: manifest.feedbackReceivedAt ?? null,
      previewCreatedAt: preview?.createdAt ?? null,
      approvedAt: approval?.approvedAt ?? null,
    },
  };
}

function readPolicy() {
  const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
  if (policy.schemaVersion !== 1 || !Number.isInteger(policy.enforceFromPass) || policy.enforceFromPass < 1) {
    throw new Error('acceptance/policy.json is invalid');
  }
  return policy;
}

function pass66ReceiptPath(testId, previewSha) {
  if (testId === PASS66_HARDWARE_TEST_ID) {
    return `${PASS66_OWNER_ARTIFACT_ROOT}hardware-webgl2-admission-${previewSha}.json`;
  }
  const slug = String(testId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${PASS66_OWNER_ARTIFACT_ROOT}${slug}-${previewSha}.json`;
}

export function pass66FinalizerOutputPaths(previewSha, graph = null) {
  if (!SHA40.test(previewSha ?? '')) throw new Error('Pass 66 finalizer paths require an exact preview SHA');
  const catalogGraph = graph ?? JSON.parse(readFileSync(PASS66_GRAPH_PATH, 'utf8'));
  if (catalogGraph?.candidateEvidenceSourceSha !== previewSha) {
    throw new Error(`Pass 66 graph candidateEvidenceSourceSha must equal preview ${previewSha}`);
  }
  if (!Array.isArray(catalogGraph.testCatalog) || !Array.isArray(catalogGraph.artifactCatalog)) {
    throw new Error('Pass 66 graph must contain testCatalog and artifactCatalog arrays');
  }
  const testIds = catalogGraph.testCatalog.map((test) => test?.id);
  if (testIds.some((testId) => typeof testId !== 'string' || !/^T-[A-Z0-9-]+$/.test(testId))
    || new Set(testIds).size !== testIds.length) {
    throw new Error('Pass 66 graph testCatalog IDs must be unique and canonical');
  }
  const expected = new Set([PASS66_MANIFEST_PATH, PASS66_LEDGER_PATH, PASS66_GRAPH_RELATIVE_PATH]);
  const artifactTests = new Set();
  for (const artifact of catalogGraph.artifactCatalog) {
    if (artifact?.sourceSha !== previewSha || !Array.isArray(artifact.testRefs) || artifact.testRefs.length !== 1) {
      throw new Error('Every Pass 66 finalizer artifact must attest one test at the exact preview SHA');
    }
    const [testId] = artifact.testRefs;
    if (!testIds.includes(testId) || artifactTests.has(testId)) {
      throw new Error(`Pass 66 finalizer artifact test is unknown or duplicated: ${testId}`);
    }
    artifactTests.add(testId);
    const expectedReceiptPath = pass66ReceiptPath(testId, previewSha);
    if (artifact.path !== expectedReceiptPath) {
      throw new Error(`${testId} receipt path must be ${expectedReceiptPath}`);
    }
    expected.add(expectedReceiptPath);
    if (testId === PASS66_HARDWARE_TEST_ID) {
      const expectedDetailPath = `${PASS66_HARDWARE_ARTIFACT_ROOT}${previewSha}-receipt.json`;
      const expectedManifestPath = `${PASS66_HARDWARE_ARTIFACT_ROOT}${previewSha}-dist-manifest.json`;
      if (artifact.detailedReceiptPath !== expectedDetailPath || artifact.buildManifestPath !== expectedManifestPath) {
        throw new Error(`${testId} must use the exact preview-bound hardware detail and build-manifest paths`);
      }
      expected.add(expectedDetailPath);
      expected.add(expectedManifestPath);
    }
  }
  const missingTests = testIds.filter((testId) => !artifactTests.has(testId));
  if (missingTests.length > 0 || artifactTests.size !== testIds.length) {
    throw new Error(`Pass 66 finalizer artifact catalog is incomplete; missing=${missingTests.join(',') || '<none>'}`);
  }
  return [...expected].sort();
}

export function classifyPreviewDelta(paths, manifestPath, previewSha = null, options = {}) {
  const normalizedPaths = [...new Set(paths.map((path) => String(path).replaceAll('\\', '/')).filter(Boolean))].sort();
  if (manifestPath === PASS66_MANIFEST_PATH) {
    let expectedPaths;
    try {
      expectedPaths = pass66FinalizerOutputPaths(previewSha, options.graph ?? null);
    } catch (error) {
      return {
        ok: false,
        paths: normalizedPaths,
        reason: `Pass 66 finalizer output contract is invalid (${error instanceof Error ? error.message : String(error)})`,
      };
    }
    const expected = new Set(expectedPaths);
    const actual = new Set(normalizedPaths);
    const missing = expectedPaths.filter((path) => !actual.has(path));
    const unexpected = normalizedPaths.filter((path) => !expected.has(path));
    return missing.length === 0 && unexpected.length === 0
      ? { ok: true, paths: normalizedPaths, reason: 'only the exact Pass 66 finalizer output set changed after preview' }
      : {
        ok: false,
        paths: normalizedPaths,
        reason: `Pass 66 post-preview delta differs from the exact finalizer output set (missing=${missing.join(',') || '<none>'}; unexpected=${unexpected.join(',') || '<none>'})`,
      };
  }
  // Test sources never enter the shipped Vite tree. They must still classify
  // as full CI impact in change-impact.mjs so the edited gate is exercised,
  // but correcting a non-shipping assertion must not invalidate approval of
  // byte-identical runtime output.
  const relevantPaths = normalizedPaths.filter((path) => path !== manifestPath && !/^tests\//.test(path));
  const classification = relevantPaths.length === 0 ? { mode: 'none' } : classifyPaths(relevantPaths);
  return classification.mode === 'none'
    ? { ok: true, paths: relevantPaths, reason: 'only process/acceptance paths changed after preview' }
    : { ok: false, paths: relevantPaths, reason: `runtime or release-shell paths changed after preview (${classification.reason})` };
}

function approvalStillMatchesPreview(manifestPath, previewSha, head) {
  try {
    execFileSync('git', ['-C', REPOSITORY_ROOT, 'merge-base', '--is-ancestor', previewSha, head], { stdio: 'ignore' });
  } catch {
    return { ok: false, paths: [], reason: `preview source ${previewSha} is not an ancestor of ${head}` };
  }
  return classifyPreviewDelta(changedPaths(previewSha, head), manifestPath, previewSha);
}

function writeReceipt(path, receipt) {
  if (!path) return;
  const absolute = resolve(REPOSITORY_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

export function selectCiAcceptanceManifest(impact, manifestPaths) {
  if (!['none', 'smoke', 'full'].includes(impact)) throw new Error('--impact must be none, smoke, or full');
  const manifests = [...new Set(manifestPaths.map((path) => String(path).replaceAll('\\', '/')).filter(Boolean))].sort();
  if (impact === 'none' && manifests.length === 0) return null;
  if (manifests.length !== 1) {
    throw new Error(`runtime/release-shell or acceptance-finalizer changes must add or update exactly one enforced pass manifest; found ${manifests.length}`);
  }
  return manifests[0];
}

export function evaluateAcceptance(values) {
  const policy = readPolicy();
  const phase = values.phase;
  if (!['ci', 'release'].includes(phase)) throw new Error('--phase must be ci or release');
  const head = values.head || git('rev-parse', 'HEAD');
  let manifestPath;
  let releasePass = values.pass;

  if (phase === 'ci') {
    if (!/^[0-9a-f]{40}$/.test(values.base ?? '') || !/^[0-9a-f]{40}$/.test(head)) {
      throw new Error('CI acceptance needs full --base and --head SHAs');
    }
    const manifests = changedManifestPaths(values.base, head, policy);
    manifestPath = selectCiAcceptanceManifest(values.impact, manifests);
    if (manifestPath === null) {
      return {
        schemaVersion: 1,
        ok: true,
        phase,
        impact: values.impact,
        exempt: true,
        reason: 'process-only with no enforced pass manifest change',
      };
    }
  } else {
    const number = passNumber(releasePass);
    if (number === null) throw new Error('--pass must look like "PASS 62"');
    if (number < policy.enforceFromPass) {
      return {
        schemaVersion: 1,
        ok: true,
        phase,
        releasePass,
        legacyExempt: true,
        reason: `acceptance manifests are enforced from PASS ${policy.enforceFromPass}`,
      };
    }
    manifestPath = manifestPathForPass(releasePass, policy);
  }

  const absolute = join(REPOSITORY_ROOT, manifestPath);
  if (!existsSync(absolute)) throw new Error(`acceptance manifest does not exist: ${manifestPath}`);
  const bytes = readFileSync(absolute);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (releasePass && manifest.releasePass !== releasePass) {
    throw new Error(`${manifestPath} declares ${manifest.releasePass}, expected ${releasePass}`);
  }
  releasePass = manifest.releasePass;
  const number = passNumber(releasePass);
  if (number === null || manifestPath !== manifestPathForPass(releasePass, policy)) {
    throw new Error(`manifest path must match releasePass (${manifestPathForPass(releasePass, policy)})`);
  }
  const validation = validateAcceptanceManifest(manifest, { policy });
  const approvalParity = /^[0-9a-f]{40}$/.test(manifest.preview?.sourceSha ?? '')
    ? approvalStillMatchesPreview(manifestPath, manifest.preview.sourceSha, head)
    : { ok: false, paths: [], reason: 'preview source SHA is invalid' };
  const errors = [...validation.errors];
  if (!approvalParity.ok) errors.push(`preview approval invalid: ${approvalParity.reason}`);
  return {
    schemaVersion: 1,
    ok: errors.length === 0,
    phase,
    impact: values.impact ?? null,
    manifestPath,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    headSha: head,
    releasePass,
    errors,
    approvalParity,
    ...validation.summary,
  };
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  const values = parseArgs(process.argv.slice(2));
  let receipt;
  try {
    receipt = evaluateAcceptance(values);
  } catch (error) {
    receipt = {
      schemaVersion: 1,
      ok: false,
      phase: values.phase ?? null,
      impact: values.impact ?? null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  writeReceipt(values.output, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exitCode = 1;
}
