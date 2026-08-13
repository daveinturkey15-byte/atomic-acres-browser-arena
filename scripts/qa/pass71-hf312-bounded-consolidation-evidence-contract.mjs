import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_HF312_BASE_SOURCE_SHA = '130fd59bd2cf1e1719b802463219ddf36e2484d5';

export const PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-312',
  kind: 'pass71-hf312-bounded-consolidation-audit',
  contract: 'atomic-acres/pass71-hf312-bounded-consolidation-audit@1',
  feedbackId: 'HF-312',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
});

export const PASS71_HF312_BOUNDED_CONSOLIDATION_DESCRIPTOR = Object.freeze({
  evidenceId: 'HF-312',
  kind: 'pass71-hf312-bounded-consolidation-audit',
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF312_TOOL_PATHS = Object.freeze([
  'scripts/qa/pass71-hf312-bounded-consolidation-evidence-contract.mjs',
  'scripts/qa/pass71-hf312-bounded-consolidation-evidence-contract.d.mts',
  'scripts/qa/run-pass71-hf312-bounded-consolidation-evidence.mjs',
  'scripts/release/acceptance-gate.mjs',
  'scripts/release/pipeline-guard.mjs',
  'scripts/qa/verify-text-source-integrity.mjs',
  'scripts/qa/verify-npm10-lockfile.mjs',
  'package.json',
  'package-lock.json',
]);

export const PASS71_HF312_GATE_COMMANDS = Object.freeze([
  Object.freeze({ id: 'verify:pass25a:core', command: 'npm run verify:pass25a:core' }),
  Object.freeze({ id: 'pipeline:preflight', command: 'npm run pipeline:preflight -- --machine dave-gaming-pc --harness codex' }),
  Object.freeze({ id: 'git-diff-check', command: 'git diff --check' }),
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PRODUCTION_TS_EXCEPTIONS = Object.freeze({
  'src/audio.ts': Object.freeze(['src/audio-combat-prewarm.test.ts', 'src/audio-continuous-ownership.test.ts', 'src/audio-output-probe.test.ts']),
  'src/bootstrap.ts': Object.freeze(['src/project-map.test.ts', 'src/release-topology.test.ts']),
  'src/legacy-main.ts': Object.freeze(['src/presentation-prewarm-contract.test.ts', 'src/pass71-first-action-release-gate.test.ts']),
  'src/release-identity.ts': Object.freeze(['src/release-channel.test.ts', 'src/release-topology.test.ts']),
  'src/style.css': Object.freeze(['src/sticky-victim-feedback.test.ts', 'src/pass71-nuke-warning-integration.test.ts']),
  'src/ui/pass65-hud.css': Object.freeze(['src/ui/pass65-hud-layout.test.ts']),
  'src/ui/release-history-dialog.ts': Object.freeze(['src/ui/project-map-dialog.test.ts']),
  'src/weapon-presentation.ts': Object.freeze(['src/weapon-presentation-anatomy.test.ts', 'src/pass65-weapon-runtime-behavior.test.ts']),
});

function git(repositoryRoot, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding, windowsHide: true, maxBuffer: 128 * 1024 * 1024,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function changedPathsAtSource(repositoryRoot, sourceSha) {
  const output = git(repositoryRoot, ['diff', '--name-only', `${PASS71_HF312_BASE_SOURCE_SHA}..${sourceSha}`]);
  return output.split(/\r?\n/u).filter(Boolean).sort();
}

function blobSha256AtSource(repositoryRoot, sourceSha, path) {
  return sha256(git(repositoryRoot, ['show', `${sourceSha}:${path}`], 'buffer'));
}

function coLocatedTest(path) {
  return path.endsWith('.ts') && !path.endsWith('.test.ts') ? path.replace(/\.ts$/u, '.test.ts') : null;
}

function isProductionPath(path) {
  return (path.startsWith('src/') && !path.endsWith('.test.ts'))
    || path.startsWith('public/') || path.startsWith('source-assets/')
    || path.startsWith('release-shell/') || path === 'assets.manifest.json'
    || path === 'release-channels.json';
}

export function pass71Hf312SourceAuditAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-312 source audit requires exact candidate A SHA');
  const changedPaths = changedPathsAtSource(repositoryRoot, sourceSha);
  if (changedPaths.includes('acceptance/pass-71.json')) {
    throw new Error('HF-312 candidate A must not contain the Pass 71 acceptance manifest');
  }
  const tracked = new Set(git(repositoryRoot, ['ls-tree', '-r', '--name-only', sourceSha]).split(/\r?\n/u).filter(Boolean));
  const changedProductionPaths = changedPaths.filter(isProductionPath);
  const ownership = changedProductionPaths.map((path) => {
    const direct = coLocatedTest(path);
    const ownerTests = direct && tracked.has(direct)
      ? [direct]
      : [...(PRODUCTION_TS_EXCEPTIONS[path] ?? [])].filter((testPath) => tracked.has(testPath));
    const provenanceOwned = !path.startsWith('src/') && ownerTests.length === 0;
    return Object.freeze({ path, ownerTests: Object.freeze(ownerTests), provenanceOwned });
  });
  return Object.freeze({
    baseSourceSha: PASS71_HF312_BASE_SOURCE_SHA,
    sourceSha,
    changedPathCount: changedPaths.length,
    changedPathsSha256: sha256(Buffer.from(`${changedPaths.join('\n')}\n`, 'utf8')),
    changedProductionPathCount: changedProductionPaths.length,
    changedProductionBlobs: Object.freeze(changedProductionPaths.map((path) => Object.freeze({
      path, sha256: blobSha256AtSource(repositoryRoot, sourceSha, path),
    }))),
    ownership: Object.freeze(ownership),
    unownedProductionPaths: Object.freeze(ownership.filter((entry) => (
      entry.ownerTests.length === 0 && !entry.provenanceOwned
    )).map(({ path }) => path)),
    acceptanceManifestAbsent: true,
  });
}

export function pass71Hf312ToolingAtSource(repositoryRoot, sourceSha) {
  return Object.freeze(PASS71_HF312_TOOL_PATHS.map((path) => Object.freeze({
    path, sha256: blobSha256AtSource(repositoryRoot, sourceSha, path),
  })));
}

export function pass71Hf312RecordSha256(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return sha256(Buffer.from(`${JSON.stringify(canonical(unsigned))}\n`, 'utf8'));
}

export function pass71Hf312EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'closingAuthority', 'startedAt', 'completedAt', 'source', 'sourceAudit', 'tooling', 'gates',
    'faults', 'receiptSha256',
  ]) || record?.schemaVersion !== 1 || record?.evidenceId !== 'HF-312'
    || record?.kind !== PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE.kind
    || record?.contract !== PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE.contract
    || record?.feedbackId !== 'HF-312' || record?.status !== 'passed'
    || record?.closesFeedback !== true || record?.closingAuthority !== true) failures.push('record-identity-or-schema');
  if (!exactKeys(record?.source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'baseSourceSha', 'cleanBefore', 'cleanAfter',
  ]) || !SHA40.test(expected.sourceSha ?? '') || record?.source?.expectedSourceSha !== expected.sourceSha
    || record?.source?.checkoutSourceSha !== expected.sourceSha
    || record?.source?.endingCheckoutSourceSha !== expected.sourceSha
    || record?.source?.sourceTreeSha !== expected.sourceTreeSha
    || record?.source?.baseSourceSha !== PASS71_HF312_BASE_SOURCE_SHA
    || record?.source?.cleanBefore !== true || record?.source?.cleanAfter !== true) failures.push('exact-clean-source');
  const sourceAudit = record?.sourceAudit;
  const auditSchemaValid = exactKeys(sourceAudit, [
    'baseSourceSha', 'sourceSha', 'changedPathCount', 'changedPathsSha256',
    'changedProductionPathCount', 'changedProductionBlobs', 'ownership',
    'unownedProductionPaths', 'acceptanceManifestAbsent',
  ]) && sourceAudit.baseSourceSha === PASS71_HF312_BASE_SOURCE_SHA
    && sourceAudit.sourceSha === expected.sourceSha
    && Number.isSafeInteger(sourceAudit.changedPathCount) && sourceAudit.changedPathCount > 0
    && SHA256.test(sourceAudit.changedPathsSha256 ?? '')
    && Number.isSafeInteger(sourceAudit.changedProductionPathCount)
    && sourceAudit.changedProductionPathCount > 0
    && Array.isArray(sourceAudit.changedProductionBlobs)
    && sourceAudit.changedProductionBlobs.length === sourceAudit.changedProductionPathCount
    && sourceAudit.changedProductionBlobs.every((entry) => exactKeys(entry, ['path', 'sha256'])
      && typeof entry.path === 'string' && isProductionPath(entry.path) && SHA256.test(entry.sha256 ?? ''))
    && Array.isArray(sourceAudit.ownership)
    && sourceAudit.ownership.length === sourceAudit.changedProductionPathCount
    && sourceAudit.ownership.every((entry, index) => exactKeys(entry, ['path', 'ownerTests', 'provenanceOwned'])
      && entry.path === sourceAudit.changedProductionBlobs[index]?.path
      && Array.isArray(entry.ownerTests) && entry.ownerTests.every((path) => typeof path === 'string' && path.endsWith('.test.ts'))
      && typeof entry.provenanceOwned === 'boolean'
      && (entry.ownerTests.length > 0 || entry.provenanceOwned === true))
    && Array.isArray(sourceAudit.unownedProductionPaths) && sourceAudit.unownedProductionPaths.length === 0
    && sourceAudit.acceptanceManifestAbsent === true;
  if (!auditSchemaValid || JSON.stringify(sourceAudit) !== JSON.stringify(expected.sourceAudit)) {
    failures.push('source-derived-bounded-ownership-audit');
  }
  if (JSON.stringify(record?.tooling) !== JSON.stringify(expected.tooling)
    || record?.tooling?.some((entry) => !exactKeys(entry, ['path', 'sha256']) || !SHA256.test(entry.sha256 ?? ''))) {
    failures.push('candidate-a-tooling');
  }
  const startedMs = Date.parse(record?.startedAt ?? '');
  const completedMs = Date.parse(record?.completedAt ?? '');
  if (!Array.isArray(record?.gates) || JSON.stringify(record.gates.map(({ id, command }) => ({ id, command })))
      !== JSON.stringify(PASS71_HF312_GATE_COMMANDS)
    || record.gates.some((gate) => !exactKeys(gate, ['id', 'command', 'status', 'completedAt', 'outputSha256'])
      || gate.status !== 'passed' || !SHA256.test(gate.outputSha256 ?? '')
      || !Number.isFinite(Date.parse(gate.completedAt ?? ''))
      || Date.parse(gate.completedAt) < startedMs || Date.parse(gate.completedAt) > completedMs)) {
    failures.push('full-core-and-clean-preflight-gates');
  }
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || startedMs > completedMs) failures.push('run-timestamps');
  if (!Array.isArray(record?.faults) || record.faults.length !== 0) failures.push('faults');
  if (record?.receiptSha256 !== pass71Hf312RecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function createPass71Hf312RegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF312_BOUNDED_CONSOLIDATION_DESCRIPTOR,
    closesFeedback: true,
    validate(record, context) {
      try {
        const root = context?.repositoryRoot;
        const sourceSha = context?.sourceSha;
        return pass71Hf312EvidenceFailures(record, {
          sourceSha,
          sourceTreeSha: context?.options?.pass71Hf312SourceTreeSha
            ?? git(root, ['rev-parse', `${sourceSha}^{tree}`]).trim(),
          sourceAudit: context?.options?.pass71Hf312SourceAudit
            ?? pass71Hf312SourceAuditAtSource(root, sourceSha),
          tooling: context?.options?.pass71Hf312Tooling ?? pass71Hf312ToolingAtSource(root, sourceSha),
        });
      } catch (error) {
        return [`hf312-source-audit-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF312_BOUNDED_CONSOLIDATION_REGISTRY_ENTRY = createPass71Hf312RegistryEntry();

export function createPass71Hf312EvidenceFixture({ sourceSha, sourceTreeSha, sourceAudit, tooling, startedAt, completedAt }) {
  const record = {
    ...PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE,
    startedAt: startedAt ?? '2026-08-13T09:38:00.000Z',
    completedAt: completedAt ?? '2026-08-13T09:48:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      sourceTreeSha, baseSourceSha: PASS71_HF312_BASE_SOURCE_SHA, cleanBefore: true, cleanAfter: true,
    },
    sourceAudit: structuredClone(sourceAudit),
    tooling: structuredClone(tooling),
    gates: PASS71_HF312_GATE_COMMANDS.map(({ id, command }, index) => ({
      id, command, status: 'passed', completedAt: `2026-08-13T09:4${5 + index}:00.000Z`,
      outputSha256: String.fromCharCode(97 + index).repeat(64),
    })),
    faults: [],
  };
  record.receiptSha256 = pass71Hf312RecordSha256(record);
  return record;
}
