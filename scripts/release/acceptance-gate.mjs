#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyPaths } from './change-impact.mjs';
import { parsePass71CandidateAArtifactReference } from './pass71-candidate-artifact-reference.mjs';
import {
  PASS71_GRENADE_NATIVE_EVIDENCE,
  PASS71_GRENADE_NATIVE_EVIDENCE_DESCRIPTOR,
  pass71GrenadeNativeEvidenceFailures,
  pass71GrenadeNativeToolingHashesAtSource,
} from '../qa/pass71-grenade-native-receipt-contract.mjs';
import {
  PASS71_HF298_COVERAGE,
  PASS71_HF298_COVERAGE_DESCRIPTOR,
  pass71Hf298CoverageFailures,
} from '../qa/pass71-hf298-coverage-contract.mjs';
import { PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY } from '../qa/pass71-hf296-contact-evidence-contract.mjs';
import {
  PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY,
  pass71Hf297VerifiedRequirementFailures,
} from '../qa/pass71-hf297-arms-evidence-contract.mjs';
import { PASS71_AUDIO_NATIVE_REGISTRY_ENTRY } from '../qa/pass71-audio-native-receipt-contract.mjs';
import { PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY } from '../qa/pass71-quality-visual-parity-contract.mjs';
import { PASS71_HF299_THERMAL_EVIDENCE_REGISTRY_ENTRY } from '../qa/pass71-hf299-thermal-operator-evidence-contract.mjs';
import { PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY } from '../qa/pass71-hf300-drone-thermal-evidence-contract.mjs';
import { PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY } from '../qa/pass71-hf301-renderer-progress-evidence-contract.mjs';
import { PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY } from '../qa/pass71-hf305-nuke-warning-evidence-contract.mjs';
import {
  PASS71_STUCK_EVIDENCE_DESCRIPTOR,
  pass71StuckEvidenceFailures,
  pass71StuckEvidenceToolingHashesAtSource,
} from '../qa/pass71-stuck-evidence-contract.mjs';
import {
  PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR,
  pass71NativeBrowserParityFailures,
  pass71NativeBrowserParityToolingHashesAtSource,
} from '../qa/pass71-native-browser-parity-contract.mjs';

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
const PASS71_HF298_REQUIREMENT_ID = 'R3';
const PASS71_OWNER_FEEDBACK_IDS = Object.freeze(Array.from(
  { length: 18 },
  (_, index) => `HF-${296 + index}`,
));
const PASS71_PUBLIC_REVIEW_REQUIREMENT_ID = 'R19';
const PASS71_PUBLIC_REVIEW_FEEDBACK_ID = 'PUBLIC-REVIEW';

const PASS71_STUCK_EVIDENCE_REGISTRY_ENTRY = Object.freeze({
  descriptor: PASS71_STUCK_EVIDENCE_DESCRIPTOR,
  validate: (record, context) => {
    try {
      const tooling = context?.options?.pass71StuckEvidenceTooling
        ?? pass71StuckEvidenceToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
      return pass71StuckEvidenceFailures(record, { sourceSha: context?.sourceSha, tooling });
    } catch (error) {
      return [`hf310-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
    }
  },
});

const PASS71_NATIVE_BROWSER_PARITY_REGISTRY_ENTRY = Object.freeze({
  descriptor: PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR,
  validate: (record, context) => {
    try {
      const tooling = context?.options?.pass71NativeBrowserParityTooling
        ?? pass71NativeBrowserParityToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
      return pass71NativeBrowserParityFailures(record, {
        sourceSha: context?.sourceSha, tooling, machine: 'dave-gaming-pc',
      });
    } catch (error) {
      return [`hf311-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
    }
  },
});

const PASS71_HF298_EVIDENCE_REGISTRY_ENTRIES = Object.freeze([
  Object.freeze({
    descriptor: PASS71_GRENADE_NATIVE_EVIDENCE_DESCRIPTOR,
    validate: (record, context) => pass71GrenadeNativeEvidenceFailures(record, {
      sourceSha: context.sourceSha,
      tooling: context.pass71GrenadeTooling,
    }),
  }),
  Object.freeze({
    descriptor: PASS71_HF298_COVERAGE_DESCRIPTOR,
    validate: (record, context) => pass71Hf298CoverageFailures(record, {
      sourceSha: context.sourceSha,
      tooling: context.pass71GrenadeTooling,
      components: context.recordsByKey
        .get(nativeEvidenceKey(PASS71_GRENADE_NATIVE_EVIDENCE_DESCRIPTOR))
        ?.map(({ record: component }) => component) ?? [],
    }),
  }),
]);

function nativeEvidenceKey(value) {
  return `${value?.evidenceId ?? ''}\u0000${value?.kind ?? ''}`;
}

export function createPass71NativeEvidenceRegistry(additionalEntries = []) {
  const entries = [...PASS71_HF298_EVIDENCE_REGISTRY_ENTRIES, ...additionalEntries];
  const keys = new Set();
  for (const entry of entries) {
    const descriptor = entry?.descriptor;
    if (!descriptor || JSON.stringify(Object.keys(descriptor).sort())
      !== JSON.stringify(['evidenceId', 'kind', 'maximumCount', 'minimumCount'].sort())
      || !nonEmpty(descriptor.evidenceId) || !nonEmpty(descriptor.kind)
      || !Number.isSafeInteger(descriptor.minimumCount) || descriptor.minimumCount < 0
      || !Number.isSafeInteger(descriptor.maximumCount)
      || descriptor.maximumCount < descriptor.minimumCount
      || typeof entry.validate !== 'function') {
      throw new Error('Pass 71 native evidence registry entry is invalid');
    }
    const key = nativeEvidenceKey(descriptor);
    if (keys.has(key)) throw new Error(`Pass 71 native evidence validator is duplicated: ${descriptor.evidenceId}/${descriptor.kind}`);
    keys.add(key);
  }
  return Object.freeze(entries.map((entry) => Object.freeze({
    ...entry,
    descriptor: Object.freeze({ ...entry.descriptor }),
  })));
}

export const PASS71_NATIVE_EVIDENCE_REGISTRY = createPass71NativeEvidenceRegistry([
  PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY,
  PASS71_AUDIO_NATIVE_REGISTRY_ENTRY,
  PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF299_THERMAL_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY,
  PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY,
  PASS71_STUCK_EVIDENCE_REGISTRY_ENTRY,
  PASS71_NATIVE_BROWSER_PARITY_REGISTRY_ENTRY,
]);

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

export function acceptanceWorkflowOutputs(receipt) {
  if (!receipt || receipt.ok !== true || receipt.phase !== 'ci') {
    throw new Error('GitHub outputs require a successful CI acceptance receipt');
  }
  if (receipt.exempt === true) {
    if (receipt.manifestPath !== undefined) {
      throw new Error('an exempt CI acceptance receipt must not select a manifest');
    }
    return { manifest_selected: 'false', manifest_path: '' };
  }

  const match = /^acceptance\/pass-([1-9][0-9]*)\.json$/.exec(receipt.manifestPath ?? '');
  if (!match) throw new Error('CI acceptance receipt has an invalid manifestPath');
  if (receipt.releasePass !== `PASS ${match[1]}`) {
    throw new Error('CI acceptance receipt manifestPath does not match releasePass');
  }
  return { manifest_selected: 'true', manifest_path: receipt.manifestPath };
}

function writeAcceptanceWorkflowOutputs(path, receipt) {
  if (!nonEmpty(path) || /[\r\n]/.test(path)) throw new Error('--github-output must be a valid file path');
  const outputs = acceptanceWorkflowOutputs(receipt);
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join('\n');
  writeFileSync(path, `${lines}\n`, { encoding: 'utf8', flag: 'a' });
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

function validateEvidence(requirement, errors, policy, context = {}) {
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
    if (context.releasePass === 'PASS 71' && typeof evidence.ref === 'string'
      && evidence.ref.startsWith('artifact://')) {
      try {
        parsePass71CandidateAArtifactReference(evidence.ref, context.sourceSha);
      } catch (error) {
        errors.push(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
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
      if (requirement.state === 'verified') validateEvidence(requirement, errors, policy, {
        releasePass: manifest.releasePass,
        sourceSha: manifest.preview?.sourceSha,
      });
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
  let pass71NativeRecords = [];
  let pass71RecordsByKey = new Map();
  let pass71Hf298Components = [];
  let pass71Hf298Coverages = [];
  if (manifest.releasePass === 'PASS 71') {
    if (!Array.isArray(manifest.requirements) || manifest.requirements.length !== 19) {
      errors.push('PASS 71 requirements must contain exactly R1..R19');
    } else {
      for (const [index, feedbackId] of PASS71_OWNER_FEEDBACK_IDS.entries()) {
        if (manifest.requirements[index]?.feedbackId !== feedbackId) {
          errors.push(`PASS 71 R${index + 1}.feedbackId must be ${feedbackId}`);
        }
        if (manifest.requirements[index]?.state !== 'verified') {
          errors.push(`PASS 71 R${index + 1}/${feedbackId} must be mechanically verified before publication`);
        }
      }
      const publicReview = manifest.requirements[18];
      if (publicReview?.id !== PASS71_PUBLIC_REVIEW_REQUIREMENT_ID
        || publicReview?.feedbackId !== PASS71_PUBLIC_REVIEW_FEEDBACK_ID
        || publicReview?.acceptance !== 'human'
        || publicReview?.state !== 'deferred') {
        errors.push('PASS 71 R19 must be the deferred PUBLIC-REVIEW human requirement');
      }
    }
    const hf298Requirement = Array.isArray(manifest.requirements)
      ? manifest.requirements.find((requirement) => requirement?.id === PASS71_HF298_REQUIREMENT_ID)
      : null;
    if (hf298Requirement?.feedbackId !== PASS71_HF298_COVERAGE.feedbackId) {
      errors.push(`PASS 71 ${PASS71_HF298_REQUIREMENT_ID}.feedbackId must be HF-298`);
    }
    if (Array.isArray(manifest.requirements) && manifest.requirements.some((requirement) => (
      requirement?.id !== PASS71_HF298_REQUIREMENT_ID
      && requirement?.feedbackId === PASS71_HF298_COVERAGE.feedbackId
    ))) errors.push(`PASS 71 HF-298 feedbackId belongs only to ${PASS71_HF298_REQUIREMENT_ID}`);

    const nativeEvidence = manifest.nativeEvidence;
    if (!Array.isArray(nativeEvidence)) {
      errors.push('PASS 71 nativeEvidence must be an array of registered exact-schema records');
    } else {
      pass71NativeRecords = nativeEvidence;
      const registryByKey = new Map(PASS71_NATIVE_EVIDENCE_REGISTRY.map((entry) => [
        nativeEvidenceKey(entry.descriptor), entry,
      ]));
      const recordsByKey = new Map();
      pass71RecordsByKey = recordsByKey;
      for (const [index, record] of nativeEvidence.entries()) {
        const key = nativeEvidenceKey(record);
        if (!registryByKey.has(key)) {
          errors.push(`PASS 71 nativeEvidence[${index}] has no registered evidence validator`);
          continue;
        }
        const records = recordsByKey.get(key) ?? [];
        records.push({ index, record });
        recordsByKey.set(key, records);
      }
      for (const entry of PASS71_NATIVE_EVIDENCE_REGISTRY) {
        const records = recordsByKey.get(nativeEvidenceKey(entry.descriptor)) ?? [];
        if (records.length < entry.descriptor.minimumCount || records.length > entry.descriptor.maximumCount) {
          errors.push(`PASS 71 ${entry.descriptor.evidenceId}/${entry.descriptor.kind} record count must be ${entry.descriptor.minimumCount}..${entry.descriptor.maximumCount}; received ${records.length}`);
        }
      }
      pass71Hf298Components = recordsByKey.get(nativeEvidenceKey(PASS71_GRENADE_NATIVE_EVIDENCE_DESCRIPTOR)) ?? [];
      pass71Hf298Coverages = recordsByKey.get(nativeEvidenceKey(PASS71_HF298_COVERAGE_DESCRIPTOR)) ?? [];
      const componentScopeKeys = pass71Hf298Components.map(({ record }) => (
        `${record?.scope?.mode ?? ''}/${record?.scope?.renderer ?? ''}`
      ));
      if (new Set(componentScopeKeys).size !== componentScopeKeys.length) {
        errors.push('PASS 71 HF-298 native components must use unique representative scopes');
      }
      if (!componentScopeKeys.includes('solo/webgpu')) {
        errors.push('PASS 71 nativeEvidence must retain the canonical HF-298 solo/WebGPU component');
      }
      let tooling = options.pass71NativeEvidenceTooling;
      try {
        tooling ??= pass71GrenadeNativeToolingHashesAtSource(REPOSITORY_ROOT, preview?.sourceSha);
      } catch (error) {
        errors.push(`PASS 71 nativeEvidence tooling could not be hashed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (tooling) {
        const context = {
          sourceSha: preview?.sourceSha,
          repositoryRoot: REPOSITORY_ROOT,
          options,
          recordsByKey,
          pass71GrenadeTooling: tooling,
        };
        for (const entry of PASS71_NATIVE_EVIDENCE_REGISTRY) {
          for (const { index, record } of recordsByKey.get(nativeEvidenceKey(entry.descriptor)) ?? []) {
            for (const failure of entry.validate(record, context)) {
              errors.push(`PASS 71 nativeEvidence[${index}]: ${failure}`);
            }
          }
        }
      }
      if (hf298Requirement?.state === 'verified'
        && (pass71Hf298Components.length !== PASS71_GRENADE_NATIVE_EVIDENCE.scopes.length
          || pass71Hf298Coverages.length !== 1)) {
        errors.push('PASS 71 verified R3/HF-298 requires all four solo/hosted x WebGL2/WebGPU components and one canonical full-scope coverage record');
      }
    }

    const feedbackEvidenceRequirements = new Map([
      ['HF-296', PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY.descriptor],
      ['HF-297', null],
      ['HF-302', PASS71_AUDIO_NATIVE_REGISTRY_ENTRY.descriptor],
      ['HF-303', PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY.descriptor],
      ['HF-299', PASS71_HF299_THERMAL_EVIDENCE_REGISTRY_ENTRY.descriptor],
      ['HF-300', PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY.descriptor],
      ['HF-301', PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY.descriptor],
      ['HF-305', PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY.descriptor],
      ['HF-310', PASS71_STUCK_EVIDENCE_DESCRIPTOR],
      ['HF-311', PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR],
    ]);
    for (const [feedbackId, descriptor] of feedbackEvidenceRequirements) {
      const matching = Array.isArray(manifest.requirements)
        ? manifest.requirements.filter((requirement) => requirement?.feedbackId === feedbackId) : [];
      if (matching.length !== 1) {
        errors.push(`PASS 71 ${feedbackId} must map to exactly one requirement`);
        continue;
      }
      if (descriptor && matching[0].state === 'verified'
        && (pass71RecordsByKey.get(nativeEvidenceKey(descriptor))?.length ?? 0) !== 1) {
        errors.push(`PASS 71 verified ${matching[0].id}/${feedbackId} requires its canonical registered native evidence record`);
      }
      if (feedbackId === 'HF-297' && matching[0].state === 'verified') {
        for (const failure of pass71Hf297VerifiedRequirementFailures(matching[0], pass71NativeRecords)) {
          errors.push(`PASS 71 verified R2/HF-297 cannot use the representative non-closing component: ${failure}`);
        }
      }
    }
  }
  const approval = manifest.humanAcceptance;
  if (!approval || approval.state !== 'approved' || approval.approvedBy !== policy.ownerHandle
    || !isIsoDate(approval.approvedAt) || !nonEmpty(approval.evidence)) {
    errors.push(`humanAcceptance must be approved by ${policy.ownerHandle} with timestamped evidence`);
  }
  if (['PASS 66', 'PASS 71'].includes(manifest.releasePass) && approval && nonEmpty(approval.evidence)) {
    const evidence = approval.evidence.toLowerCase();
    const bindsStandingConditional = /\bstanding\s+conditional\b/.test(evidence);
    const explicitlyDisclaimsInspection = /\b(?:did\s+not|has\s+not|was\s+not)\b/.test(evidence)
      && /\b(?:inspect(?:ed|ion)?|test(?:ed|ing)?|review(?:ed)?)\b/.test(evidence)
      && /\bpreview\b/.test(evidence);
    if (!bindsStandingConditional || !explicitlyDisclaimsInspection) {
      errors.push(`${manifest.releasePass} humanAcceptance.evidence must bind Dave's standing conditional authorization and explicitly state that he did not inspect or test the immutable preview`);
    }
  }
  if (preview && approval && isIsoDate(preview.createdAt) && isIsoDate(approval.approvedAt)
    && Date.parse(approval.approvedAt) < Date.parse(preview.createdAt)) {
    errors.push('humanAcceptance.approvedAt cannot precede preview.createdAt');
  }
  for (const [index, record] of pass71NativeRecords.entries()) {
    const startField = isIsoDate(record?.startedAt) ? 'startedAt'
      : isIsoDate(record?.finalizedAt) ? 'finalizedAt' : null;
    const endField = isIsoDate(record?.completedAt) ? 'completedAt'
      : isIsoDate(record?.finalizedAt) ? 'finalizedAt' : null;
    if (startField && isIsoDate(preview?.createdAt)
      && Date.parse(record[startField]) < Date.parse(preview.createdAt)) {
      errors.push(`PASS 71 nativeEvidence[${index}].${startField} cannot precede preview.createdAt`);
    }
    if (endField && isIsoDate(approval?.approvedAt)
      && Date.parse(record[endField]) > Date.parse(approval.approvedAt)) {
      errors.push(`PASS 71 nativeEvidence[${index}].${endField} cannot follow humanAcceptance.approvedAt`);
    }
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
      nativeEvidence: pass71NativeRecords.map((record) => ({
        evidenceId: record?.evidenceId ?? null,
        kind: record?.kind ?? null,
        receiptSha256: record?.receiptSha256 ?? null,
        startedAt: record?.startedAt ?? null,
        completedAt: record?.completedAt ?? null,
        finalizedAt: record?.finalizedAt ?? null,
      })),
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
  if (manifestPath === 'acceptance/pass-71.json') {
    return normalizedPaths.length === 1 && normalizedPaths[0] === manifestPath
      ? { ok: true, paths: normalizedPaths, reason: 'only the exact Pass 71 manifest finalizer changed after preview' }
      : {
        ok: false,
        paths: normalizedPaths,
        reason: 'Pass 71 candidate B may change only acceptance/pass-71.json after candidate A preview',
      };
  }
  // Test sources never enter the shipped Vite tree. They must still classify
  // as full CI impact in change-impact.mjs so the edited gate is exercised,
  // but correcting a non-shipping assertion must not invalidate approval of
  // byte-identical runtime output.
  const relevantPaths = normalizedPaths.filter((path) => path !== manifestPath
    && !/^tests\//.test(path)
    && !/^src\/.*\.test\.ts$/.test(path));
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
    if (receipt.ok && values['github-output']) {
      writeAcceptanceWorkflowOutputs(values['github-output'], receipt);
    }
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
