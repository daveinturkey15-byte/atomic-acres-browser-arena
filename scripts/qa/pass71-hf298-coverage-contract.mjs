import { createHash } from 'node:crypto';
import {
  PASS71_GRENADE_NATIVE_EVIDENCE,
  createPass71GrenadeNativeEvidenceFixture,
  pass71GrenadeNativeEvidenceFailures,
  pass71GrenadeNativeRecordSha256,
} from './pass71-grenade-native-receipt-contract.mjs';

export const PASS71_HF298_COVERAGE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-298',
  kind: 'pass71-hf298-full-scope-coverage',
  contract: 'atomic-acres/pass71-hf298-full-scope-coverage@1',
  feedbackId: 'HF-298',
  scopes: PASS71_GRENADE_NATIVE_EVIDENCE.scopes,
});

export const PASS71_HF298_COVERAGE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF298_COVERAGE.evidenceId,
  kind: PASS71_HF298_COVERAGE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, expected, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...expected].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function pass71Hf298CoverageCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-298 coverage evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf298CoverageRecordSha256(record) {
  return createHash('sha256').update(pass71Hf298CoverageCanonicalBytes(record)).digest('hex');
}

function scopeIdentity(value) {
  return { mode: value?.mode, renderer: value?.renderer };
}

export function pass71Hf298CoverageFailures(record, expected) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF298_COVERAGE.schemaVersion
    || record.evidenceId !== PASS71_HF298_COVERAGE.evidenceId
    || record.kind !== PASS71_HF298_COVERAGE.kind
    || record.contract !== PASS71_HF298_COVERAGE.contract
    || record.feedbackId !== PASS71_HF298_COVERAGE.feedbackId
    || record.status !== 'passed') return ['coverage-identity-or-status'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'sourceSha', 'finalizedAt', 'scope', 'tooling', 'components', 'faults', 'receiptSha256',
  ], 'coverage', failures);
  exactKeys(record.scope, [
    'arenaId', 'renderProfile', 'modes', 'renderers', 'grenades', 'phases',
  ], 'coverage:scope', failures);
  if (record.scope?.arenaId !== 'atomic-acres' || record.scope?.renderProfile !== 'performance'
    || !sameJson(record.scope?.modes, ['solo', 'hosted'])
    || !sameJson(record.scope?.renderers, ['webgl2', 'webgpu'])
    || !sameJson(record.scope?.grenades, PASS71_GRENADE_NATIVE_EVIDENCE.grenades)
    || !sameJson(record.scope?.phases, PASS71_GRENADE_NATIVE_EVIDENCE.phases)) {
    failures.push('representative-full-scope');
  }
  if (!SHA40.test(expected?.sourceSha ?? '') || record.sourceSha !== expected.sourceSha) {
    failures.push('exact-source');
  }
  if (!object(record.tooling) || !object(expected?.tooling)
    || Object.entries(expected.tooling).some(([field, value]) => (
      !SHA256.test(value ?? '') || record.tooling[field] !== value
    )) || Object.keys(record.tooling).sort().join(',') !== Object.keys(expected.tooling).sort().join(',')) {
    failures.push('preview-tooling-hashes');
  }
  const components = Array.isArray(expected?.components) ? expected.components : [];
  const componentScopes = components.map((component) => scopeIdentity(component?.scope));
  if (components.length !== PASS71_HF298_COVERAGE.scopes.length
    || !sameJson(componentScopes, PASS71_HF298_COVERAGE.scopes)) {
    failures.push('exact-four-component-set');
  }
  if (!Array.isArray(record.components)
    || record.components.length !== PASS71_HF298_COVERAGE.scopes.length
    || !sameJson(record.components.map(scopeIdentity), PASS71_HF298_COVERAGE.scopes)) {
    failures.push('exact-four-component-bindings');
  } else {
    for (const [index, scope] of PASS71_HF298_COVERAGE.scopes.entries()) {
      const binding = record.components[index];
      const component = components[index];
      const label = `coverage:component:${scope.mode}:${scope.renderer}`;
      exactKeys(binding, [
        'mode', 'renderer', 'arenaId', 'componentKind', 'receiptSha256', 'startedAt', 'completedAt',
      ], label, failures);
      if (!component || binding.mode !== scope.mode || binding.renderer !== scope.renderer
        || binding.arenaId !== 'atomic-acres'
        || binding.componentKind !== PASS71_GRENADE_NATIVE_EVIDENCE.kind
        || binding.receiptSha256 !== component.receiptSha256
        || binding.receiptSha256 !== pass71GrenadeNativeRecordSha256(component)
        || binding.startedAt !== component.startedAt || binding.completedAt !== component.completedAt) {
        failures.push(`${label}:binding`);
        continue;
      }
      for (const failure of pass71GrenadeNativeEvidenceFailures(component, {
        sourceSha: expected.sourceSha,
        tooling: expected.tooling,
      })) failures.push(`${label}:${failure}`);
    }
  }
  if (!isoTimestamp(record.finalizedAt)
    || components.some((component) => !isoTimestamp(component?.completedAt)
      || Date.parse(component.completedAt) > Date.parse(record.finalizedAt))) {
    failures.push('coverage-finalization-time');
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('coverage-faults');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf298CoverageRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf298Coverage(record, expected) {
  const failures = pass71Hf298CoverageFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-298 coverage failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf298CoverageRecord({ sourceSha, tooling, components, finalizedAt }) {
  const record = {
    schemaVersion: PASS71_HF298_COVERAGE.schemaVersion,
    evidenceId: PASS71_HF298_COVERAGE.evidenceId,
    kind: PASS71_HF298_COVERAGE.kind,
    contract: PASS71_HF298_COVERAGE.contract,
    feedbackId: PASS71_HF298_COVERAGE.feedbackId,
    status: 'passed',
    sourceSha,
    finalizedAt,
    scope: {
      arenaId: 'atomic-acres', renderProfile: 'performance',
      modes: ['solo', 'hosted'], renderers: ['webgl2', 'webgpu'],
      grenades: [...PASS71_GRENADE_NATIVE_EVIDENCE.grenades],
      phases: [...PASS71_GRENADE_NATIVE_EVIDENCE.phases],
    },
    tooling,
    components: components.map((component) => ({
      ...scopeIdentity(component.scope),
      arenaId: component.scope.arenaId,
      componentKind: component.kind,
      receiptSha256: component.receiptSha256,
      startedAt: component.startedAt,
      completedAt: component.completedAt,
    })),
    faults: [],
  };
  record.receiptSha256 = pass71Hf298CoverageRecordSha256(record);
  return record;
}

export function createPass71Hf298CoverageFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? {
    runnerSha256: '1'.repeat(64), contractSha256: '2'.repeat(64),
    specSha256: '3'.repeat(64), frameActionBudgetSha256: '4'.repeat(64),
  };
  const components = options.components ?? PASS71_HF298_COVERAGE.scopes.map((scope) => (
    createPass71GrenadeNativeEvidenceFixture({ sourceSha, tooling, ...scope })
  ));
  const record = createPass71Hf298CoverageRecord({
    sourceSha,
    tooling,
    components,
    finalizedAt: options.finalizedAt ?? '2026-07-24T09:06:00.000Z',
  });
  return { record, components };
}
