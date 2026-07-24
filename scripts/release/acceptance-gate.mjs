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
  const pattern = new RegExp(`^${policy.manifestDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/pass-[1-9][0-9]*\\.json$`);
  return changedPaths(base, head).filter((path) => pattern.test(path));
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

export function classifyPreviewDelta(paths, manifestPath) {
  const relevantPaths = paths.filter((path) => path !== manifestPath);
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
  return classifyPreviewDelta(changedPaths(previewSha, head), manifestPath);
}

function writeReceipt(path, receipt) {
  if (!path) return;
  const absolute = resolve(REPOSITORY_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

export function evaluateAcceptance(values) {
  const policy = readPolicy();
  const phase = values.phase;
  if (!['ci', 'release'].includes(phase)) throw new Error('--phase must be ci or release');
  const head = values.head || git('rev-parse', 'HEAD');
  let manifestPath;
  let releasePass = values.pass;

  if (phase === 'ci') {
    if (!['none', 'smoke', 'full'].includes(values.impact)) throw new Error('--impact must be none, smoke, or full');
    if (values.impact === 'none') {
      return { schemaVersion: 1, ok: true, phase, impact: values.impact, exempt: true, reason: 'process-only' };
    }
    if (!/^[0-9a-f]{40}$/.test(values.base ?? '') || !/^[0-9a-f]{40}$/.test(head)) {
      throw new Error('CI acceptance needs full --base and --head SHAs');
    }
    const manifests = changedManifestPaths(values.base, head, policy);
    if (manifests.length !== 1) {
      throw new Error(`runtime/release-shell changes must add or update exactly one pass manifest; found ${manifests.length}`);
    }
    [manifestPath] = manifests;
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
