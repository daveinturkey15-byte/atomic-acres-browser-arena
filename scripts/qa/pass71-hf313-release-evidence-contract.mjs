import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_HF313_RELEASE_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-313',
  kind: 'pass71-hf313-protected-release-readiness',
  contract: 'atomic-acres/pass71-hf313-protected-release-readiness@1',
  feedbackId: 'HF-313',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
});

export const PASS71_HF313_RELEASE_DESCRIPTOR = Object.freeze({
  evidenceId: 'HF-313',
  kind: PASS71_HF313_RELEASE_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF313_REQUIRED_FEEDBACK_IDS = Object.freeze(Array.from(
  { length: 17 }, (_, index) => `HF-${296 + index}`,
));

export const PASS71_HF313_PUBLIC_CHOICES = Object.freeze(['experimental', 'retained', 'stable']);

export const PASS71_HF313_PINNED_CHANNELS = Object.freeze({
  retained: Object.freeze({
    pass: 'PASS 69',
    sourceSha: '685ed7865018e107df5acf6cb6f7498b4468940c',
    pagesSha: '71ec5616504d8e24241450742d01b25c1d6ff4e4',
    pagesPath: 'channels/the-big-one',
    path: 'channels/pass69-retained',
    runtimeFileCount: 515,
    runtimeTreeSha256: '5ace26fdf83a4cf695d0075a40523f70e0d6fcee02cb6ae5b42666b6679107b9',
  }),
  rollback: Object.freeze({
    pass: 'PASS 63',
    sourceSha: 'ac85e9b8b46cc2370aee903d564ecf3c4682b24c',
    pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c',
    pagesPath: 'channels/pass63-rollback',
    path: 'channels/pass63-rollback',
    runtimeFileCount: 119,
    runtimeTreeSha256: 'b7416e02c190d8ff0403a65cd7a7c894970507bc6a8de7b196cc2d7979d69bce',
  }),
});

export const PASS71_HF313_WORKFLOW_STEPS = Object.freeze([
  'Validate immutable green main candidate',
  'Build exact frozen-evidence candidate bytes',
  'Validate accepted requirement manifest',
  'Verify Pass 71 candidate A preview bytes and browser-run conclusions',
  'Reproduce static release gates',
  'Build production bytes',
  'Verify exact production bytes',
  'Stage live Pass 71, exact retained Pass 69, rebuilt Pass 67.1 and exact Pass 63 rollback',
  'Publish complete exact dist snapshot',
  'Wait for exact Pages build',
  'Verify canonical live release',
  'Write acceptance-bound production receipt and timings',
]);

export const PASS71_HF313_TOOL_PATHS = Object.freeze([
  'release-channels.json',
  '.github/workflows/release-production.yml',
  'scripts/qa/pass71-hf313-release-evidence-contract.mjs',
  'scripts/qa/pass71-hf313-release-evidence-contract.d.mts',
  'scripts/qa/run-pass71-hf313-release-evidence.mjs',
  'scripts/release/acceptance-gate.mjs',
  'scripts/release/verify-pr-preview-provenance.mjs',
  'scripts/release/stage-release-topology.mjs',
  'scripts/qa/verify-release-topology.mjs',
  'scripts/qa/verify-release-topology-browser.mjs',
  'scripts/release/write-production-receipt.mjs',
  'src/production-receipt.test.ts',
  'src/release-pipeline.test.ts',
  'package.json',
  'package-lock.json',
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(repositoryRoot, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding, windowsHide: true, maxBuffer: 128 * 1024 * 1024,
  });
}

function blobAtSource(repositoryRoot, sourceSha, path, encoding = 'buffer') {
  return git(repositoryRoot, ['show', `${sourceSha}:${path}`], encoding);
}

function projectionKey(value) {
  return `${value.feedbackId}\u0000${value.evidenceId}\u0000${value.kind}\u0000${value.receiptSha256}`;
}

export function pass71Hf313DependencyProjection(records) {
  return Object.freeze(records
    .filter((record) => object(record) && record.evidenceId !== 'HF-313')
    .map((record) => Object.freeze({
      feedbackId: record.feedbackId,
      evidenceId: record.evidenceId,
      kind: record.kind,
      receiptSha256: record.receiptSha256,
    }))
    .sort((left, right) => projectionKey(left).localeCompare(projectionKey(right))));
}

export function pass71Hf313ToolingAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-313 tooling requires exact candidate A SHA');
  return Object.freeze(PASS71_HF313_TOOL_PATHS.map((path) => Object.freeze({
    path,
    sha256: sha256(blobAtSource(repositoryRoot, sourceSha, path)),
  })));
}

export function pass71Hf313SourceAuditAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-313 source audit requires exact candidate A SHA');
  const config = JSON.parse(blobAtSource(repositoryRoot, sourceSha, 'release-channels.json', 'utf8'));
  const workflow = blobAtSource(repositoryRoot, sourceSha, '.github/workflows/release-production.yml', 'utf8');
  const acceptance = blobAtSource(repositoryRoot, sourceSha, 'scripts/release/acceptance-gate.mjs', 'utf8');
  const previewVerifier = blobAtSource(repositoryRoot, sourceSha, 'scripts/release/verify-pr-preview-provenance.mjs', 'utf8');
  const liveVerifier = blobAtSource(repositoryRoot, sourceSha, 'scripts/qa/verify-release-topology-browser.mjs', 'utf8');
  const receiptWriter = blobAtSource(repositoryRoot, sourceSha, 'scripts/release/write-production-receipt.mjs', 'utf8');
  let manifestAbsent = false;
  try {
    execFileSync('git', ['-C', repositoryRoot, 'cat-file', '-e', `${sourceSha}:acceptance/pass-71.json`], {
      windowsHide: true, stdio: 'ignore',
    });
  } catch {
    manifestAbsent = true;
  }
  const stepOffsets = PASS71_HF313_WORKFLOW_STEPS.map((step) => workflow.indexOf(`name: ${step}`));
  const workflowOrdered = stepOffsets.every((offset, index) => offset >= 0 && (index === 0 || offset > stepOffsets[index - 1]));
  return Object.freeze({
    schemaVersion: 1,
    sourceSha,
    manifestAbsent,
    releaseConfig: Object.freeze({
      schemaVersion: config.schemaVersion,
      latestLabel: config.latest?.label,
      experimental: Object.freeze({
        label: config.experimental?.label, pass: config.experimental?.pass, path: config.experimental?.path,
      }),
      retained: Object.freeze({ ...config.retained }),
      internalStable: Object.freeze({ ...config.stable }),
      rollback: Object.freeze({ ...config.rollback }),
    }),
    publicChoices: PASS71_HF313_PUBLIC_CHOICES,
    workflow: Object.freeze({
      orderedSteps: PASS71_HF313_WORKFLOW_STEPS,
      stepOffsets: Object.freeze(stepOffsets),
      ordered: workflowOrdered,
      onlyProtectedPublisher: workflow.includes('concurrency:\n  group: atomic-acres-production-pages')
        && workflow.includes('npm run deploy:ci') && !workflow.includes('npm run deploy\n'),
      candidateAPreviewVerifier: workflow.includes('verify-pr-preview-provenance.mjs --manifest acceptance/pass-71.json')
        && previewVerifier.includes('validatePass71CandidateAWorkflowJobs')
        && previewVerifier.includes('validatePass71MissingManifestLog'),
      acceptanceBeforePublish: workflow.indexOf('Validate accepted requirement manifest')
        < workflow.indexOf('Publish complete exact dist snapshot'),
      topologyBeforePublish: workflow.indexOf('npm run verify:release-topology')
        < workflow.indexOf('Publish complete exact dist snapshot')
        && workflow.indexOf('verify-release-topology-browser.mjs')
          < workflow.indexOf('Publish complete exact dist snapshot'),
      pagesAndLiveBeforeReceipt: workflow.indexOf('Wait for exact Pages build')
        < workflow.indexOf('Verify canonical live release')
        && workflow.indexOf('Verify canonical live release')
          < workflow.indexOf('Write acceptance-bound production receipt and timings'),
    }),
    finalizer: Object.freeze({
      exactManifestPathOnly: acceptance.includes("manifestPath === 'acceptance/pass-71.json'")
        && acceptance.includes('normalizedPaths.length === 1 && normalizedPaths[0] === manifestPath'),
      standingConditionalNoHitl: acceptance.includes("['PASS 66', 'PASS 71']")
        && acceptance.includes('did not inspect or test the immutable preview'),
      candidateAOriginalAttemptOnly: previewVerifier.includes('run_attempt === 1'),
    }),
    postcondition: Object.freeze({
      receiptSchemaVersion: receiptWriter.includes('schemaVersion: 4') ? 4 : null,
      rollbackProvenanceLiveChecked: liveVerifier.includes('provenance.rollback'),
      liveVerifiedStatusOwnedByReceipt: receiptWriter.includes('createPass71Hf313LivePostcondition')
        && receiptWriter.includes("hf313.status !== 'live-verified'"),
    }),
  });
}

export function pass71Hf313RecordSha256(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return sha256(Buffer.from(`${JSON.stringify(canonical(unsigned))}\n`, 'utf8'));
}

function dependenciesValid(dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length < PASS71_HF313_REQUIRED_FEEDBACK_IDS.length) return false;
  if (!dependencies.every((entry) => exactKeys(entry, ['feedbackId', 'evidenceId', 'kind', 'receiptSha256'])
    && /^HF-[0-9]{3}$/u.test(entry.feedbackId ?? '') && typeof entry.evidenceId === 'string'
    && typeof entry.kind === 'string' && SHA256.test(entry.receiptSha256 ?? ''))) return false;
  if (!same(dependencies, [...dependencies].sort((left, right) => projectionKey(left).localeCompare(projectionKey(right))))) return false;
  const feedbackIds = new Set(dependencies.map(({ feedbackId }) => feedbackId));
  return PASS71_HF313_REQUIRED_FEEDBACK_IDS.every((feedbackId) => feedbackIds.has(feedbackId));
}

export function pass71Hf313EvidenceFailures(record, expected = {}) {
  const failures = [];
  const retainedConfig = record?.sourceAudit?.releaseConfig?.retained;
  const rollbackConfig = record?.sourceAudit?.releaseConfig?.rollback;
  const retainedPinned = object(retainedConfig) && Object.entries(PASS71_HF313_PINNED_CHANNELS.retained)
    .every(([key, value]) => retainedConfig[key] === value);
  const rollbackPinned = object(rollbackConfig) && Object.entries(PASS71_HF313_PINNED_CHANNELS.rollback)
    .every(([key, value]) => rollbackConfig[key] === value);
  if (!exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'closingAuthority', 'startedAt', 'completedAt', 'source', 'sourceAudit', 'tooling',
    'dependencies', 'publication', 'faults', 'receiptSha256',
  ]) || record?.schemaVersion !== 1 || record?.evidenceId !== 'HF-313'
    || record?.kind !== PASS71_HF313_RELEASE_EVIDENCE.kind
    || record?.contract !== PASS71_HF313_RELEASE_EVIDENCE.contract
    || record?.feedbackId !== 'HF-313' || record?.status !== 'passed'
    || record?.closesFeedback !== true || record?.closingAuthority !== true) failures.push('record-identity-or-schema');
  if (!exactKeys(record?.source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'cleanBefore', 'cleanAfter',
  ]) || !SHA40.test(expected.sourceSha ?? '')
    || record?.source?.expectedSourceSha !== expected.sourceSha
    || record?.source?.checkoutSourceSha !== expected.sourceSha
    || record?.source?.endingCheckoutSourceSha !== expected.sourceSha
    || record?.source?.sourceTreeSha !== expected.sourceTreeSha
    || record?.source?.cleanBefore !== true || record?.source?.cleanAfter !== true) failures.push('exact-clean-candidate-a');
  if (!same(record?.sourceAudit, expected.sourceAudit)
    || record?.sourceAudit?.manifestAbsent !== true
    || record?.sourceAudit?.releaseConfig?.latestLabel !== 'PASS 71'
    || !retainedPinned || retainedConfig?.label !== 'PASS 69 · PREVIOUS LIVE'
    || !rollbackPinned || rollbackConfig?.label !== 'PASS 63 · STABLE WEBGL'
    || rollbackConfig?.rebuiltFromSource !== true
    || record?.sourceAudit?.releaseConfig?.experimental?.pass !== 'PASS 71'
    || record?.sourceAudit?.releaseConfig?.experimental?.path !== 'channels/the-big-one'
    || !same(record?.sourceAudit?.publicChoices, PASS71_HF313_PUBLIC_CHOICES)
    || record?.sourceAudit?.workflow?.ordered !== true
    || record?.sourceAudit?.workflow?.onlyProtectedPublisher !== true
    || record?.sourceAudit?.workflow?.candidateAPreviewVerifier !== true
    || record?.sourceAudit?.workflow?.acceptanceBeforePublish !== true
    || record?.sourceAudit?.workflow?.topologyBeforePublish !== true
    || record?.sourceAudit?.workflow?.pagesAndLiveBeforeReceipt !== true
    || record?.sourceAudit?.finalizer?.exactManifestPathOnly !== true
    || record?.sourceAudit?.finalizer?.standingConditionalNoHitl !== true
    || record?.sourceAudit?.finalizer?.candidateAOriginalAttemptOnly !== true
    || record?.sourceAudit?.postcondition?.receiptSchemaVersion !== 4
    || record?.sourceAudit?.postcondition?.rollbackProvenanceLiveChecked !== true
    || record?.sourceAudit?.postcondition?.liveVerifiedStatusOwnedByReceipt !== true) failures.push('protected-release-source-audit');
  if (!same(record?.tooling, expected.tooling)
    || record?.tooling?.length !== PASS71_HF313_TOOL_PATHS.length
    || record?.tooling?.some((entry, index) => !exactKeys(entry, ['path', 'sha256'])
      || entry.path !== PASS71_HF313_TOOL_PATHS[index] || !SHA256.test(entry.sha256 ?? ''))) failures.push('candidate-a-tooling');
  if (!dependenciesValid(record?.dependencies)
    || !same(record?.dependencies, expected.dependencies)) failures.push('complete-native-evidence-binding');
  if (!exactKeys(record?.publication, [
    'phase', 'alreadyLive', 'postconditionRequired', 'postconditionOwner', 'successStatus',
    'candidateAPreviewRequired', 'candidateBManifestOnly', 'publicChoices',
  ]) || record?.publication?.phase !== 'ready-not-live' || record?.publication?.alreadyLive !== false
    || record?.publication?.postconditionRequired !== true
    || record?.publication?.postconditionOwner !== '.github/workflows/release-production.yml'
    || record?.publication?.successStatus !== 'live-verified'
    || record?.publication?.candidateAPreviewRequired !== true
    || record?.publication?.candidateBManifestOnly !== true
    || !same(record?.publication?.publicChoices, PASS71_HF313_PUBLIC_CHOICES)) failures.push('truthful-prepublication-boundary');
  if (!ISO.test(record?.startedAt ?? '') || !ISO.test(record?.completedAt ?? '')
    || Date.parse(record.completedAt) < Date.parse(record.startedAt)) failures.push('run-timestamps');
  if (!Array.isArray(record?.faults) || record.faults.length !== 0) failures.push('faults');
  if (record?.receiptSha256 !== pass71Hf313RecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function createPass71Hf313RegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF313_RELEASE_DESCRIPTOR,
    closesFeedback: true,
    validate(record, context) {
      try {
        const sourceSha = context?.sourceSha;
        const allRecords = [...(context?.recordsByKey?.values?.() ?? [])]
          .flatMap((records) => records.map(({ record: candidate }) => candidate));
        return pass71Hf313EvidenceFailures(record, {
          sourceSha,
          sourceTreeSha: context?.options?.pass71Hf313SourceTreeSha
            ?? git(context?.repositoryRoot, ['rev-parse', `${sourceSha}^{tree}`]).trim(),
          sourceAudit: context?.options?.pass71Hf313SourceAudit
            ?? pass71Hf313SourceAuditAtSource(context?.repositoryRoot, sourceSha),
          tooling: context?.options?.pass71Hf313Tooling
            ?? pass71Hf313ToolingAtSource(context?.repositoryRoot, sourceSha),
          dependencies: pass71Hf313DependencyProjection(allRecords),
        });
      } catch (error) {
        return [`hf313-source-audit-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF313_RELEASE_EVIDENCE_REGISTRY_ENTRY = createPass71Hf313RegistryEntry();

export function createPass71Hf313EvidenceFixture(options = {}) {
  const record = {
    ...PASS71_HF313_RELEASE_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T09:48:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T09:49:00.000Z',
    source: {
      expectedSourceSha: options.sourceSha,
      checkoutSourceSha: options.sourceSha,
      endingCheckoutSourceSha: options.sourceSha,
      sourceTreeSha: options.sourceTreeSha,
      cleanBefore: true,
      cleanAfter: true,
    },
    sourceAudit: structuredClone(options.sourceAudit),
    tooling: structuredClone(options.tooling),
    dependencies: structuredClone(options.dependencies),
    publication: {
      phase: 'ready-not-live', alreadyLive: false, postconditionRequired: true,
      postconditionOwner: '.github/workflows/release-production.yml', successStatus: 'live-verified',
      candidateAPreviewRequired: true, candidateBManifestOnly: true,
      publicChoices: [...PASS71_HF313_PUBLIC_CHOICES],
    },
    faults: [],
  };
  record.receiptSha256 = pass71Hf313RecordSha256(record);
  return record;
}

function exactPinnedChannel(channel, expected, channelName) {
  return object(channel) && channel.releasePass === expected.pass && channel.sourceSha === expected.sourceSha
    && channel.pagesSha === expected.pagesSha && channel.pagesPath === expected.pagesPath
    && channel.path === expected.path && channel.pinnedRuntime?.releasePass === expected.pass
    && channel.pinnedRuntime?.sourceSha === expected.sourceSha
    && channel.pinnedRuntime?.exactRootFileCount === expected.runtimeFileCount
    && channel.pinnedRuntime?.treeSha256 === expected.runtimeTreeSha256
    && channel.channel === channelName;
}

export function pass71Hf313ProductionPostconditionFailures(input) {
  const failures = [];
  const { sourceSha, releasePass, topology, pages, liveSmoke, acceptance, previewProvenance } = input ?? {};
  const candidateASha = acceptance?.previewSourceSha;
  if (!SHA40.test(sourceSha ?? '') || releasePass !== 'PASS 71') failures.push('candidate-b-identity');
  if (!acceptance?.ok || acceptance.releasePass !== 'PASS 71' || acceptance.headSha !== sourceSha
    || !SHA40.test(candidateASha ?? '') || candidateASha === sourceSha
    || !same(acceptance.approvalParity?.paths, ['acceptance/pass-71.json'])) failures.push('candidate-a-b-finalizer-binding');
  const readiness = acceptance?.nativeEvidence?.filter((entry) => (
    entry?.evidenceId === 'HF-313' && entry?.kind === PASS71_HF313_RELEASE_EVIDENCE.kind
  )) ?? [];
  if (readiness.length !== 1 || !SHA256.test(readiness[0]?.receiptSha256 ?? '')) failures.push('hf313-readiness-receipt');
  if (!previewProvenance?.ok || previewProvenance.sourceSha !== candidateASha
    || previewProvenance.exactNameArtifactCount !== 1 || previewProvenance.matchingLiveArtifactCount !== 1
    || !SHA256.test(previewProvenance.archiveSha256 ?? '') || !SHA256.test(previewProvenance.treeSha256 ?? '')
    || previewProvenance.candidateAWorkflow?.status !== 'completed'
    || previewProvenance.candidateAWorkflow?.conclusion !== 'failure'
    || previewProvenance.candidateAWorkflow?.requirementsConclusion !== 'failure'
    || previewProvenance.candidateAWorkflow?.shardArtifactCount !== 13) failures.push('candidate-a-preview-and-ci');
  if (topology?.schemaVersion !== 4 || topology?.sourceSha !== sourceSha || topology?.releasePass !== 'PASS 71'
    || topology?.root?.kind !== 'chooser-only'
    || topology?.channels?.experimental?.releasePass !== 'PASS 71'
    || topology?.channels?.experimental?.sourceSha !== sourceSha
    || topology?.channels?.experimental?.path !== 'channels/the-big-one'
    || !SHA256.test(topology?.channels?.experimental?.treeSha256 ?? '')
    || !exactPinnedChannel(topology?.channels?.retained, PASS71_HF313_PINNED_CHANNELS.retained, 'pass69-retained')
    || !exactPinnedChannel(topology?.channels?.rollback, PASS71_HF313_PINNED_CHANNELS.rollback, 'rollback')) {
    failures.push('staged-release-topology');
  }
  if (pages?.status !== 'built' || !SHA40.test(pages?.pagesSha ?? '')) failures.push('pages-publication');
  const routes = liveSmoke?.routes;
  if (!liveSmoke?.ok || liveSmoke.sourceSha !== sourceSha || liveSmoke.releasePass !== 'PASS 71'
    || !ISO.test(liveSmoke.verifiedAt ?? '') || !Array.isArray(liveSmoke.chooserLabels)
    || liveSmoke.chooserLabels.length !== 3 || !object(routes)
    || !same(Object.keys(routes).sort(), ['experimental', 'latest', 'normal', 'retained', 'room', 'stable'])
    || !routes.experimental?.url?.includes('/channels/the-big-one/')
    || !routes.experimental?.eyebrow?.replace(/\s+/gu, '').toUpperCase().includes('PASS71')
    || !routes.retained?.url?.includes('/channels/pass69-retained/')
    || !routes.retained?.eyebrow?.replace(/\s+/gu, '').toUpperCase().includes('PASS69')
    || !routes.stable?.url?.includes('/channels/pass63-rollback/')
    || !routes.stable?.eyebrow?.replace(/\s+/gu, '').toUpperCase().includes('PASS63')
    || !Array.isArray(liveSmoke.failures) || liveSmoke.failures.length !== 0) failures.push('canonical-live-routes');
  const retained = liveSmoke?.provenance?.retained;
  const rollback = liveSmoke?.provenance?.rollback;
  if (retained?.embedded?.sourceSha !== PASS71_HF313_PINNED_CHANNELS.retained.sourceSha
    || retained?.wrapper?.pagesSha !== PASS71_HF313_PINNED_CHANNELS.retained.pagesSha
    || retained?.embedded?.treeSha256 !== PASS71_HF313_PINNED_CHANNELS.retained.runtimeTreeSha256
    || rollback?.embedded?.sourceSha !== PASS71_HF313_PINNED_CHANNELS.rollback.sourceSha
    || rollback?.wrapper?.pagesSha !== PASS71_HF313_PINNED_CHANNELS.rollback.pagesSha
    || rollback?.embedded?.treeSha256 !== PASS71_HF313_PINNED_CHANNELS.rollback.runtimeTreeSha256) {
    failures.push('live-retained-provenance');
  }
  return [...new Set(failures)].sort();
}

export function createPass71Hf313LivePostcondition(input) {
  const failures = pass71Hf313ProductionPostconditionFailures(input);
  if (failures.length) throw new Error(`HF-313 live postcondition failed: ${failures.join(', ')}`);
  const readiness = input.acceptance.nativeEvidence.find((entry) => entry.evidenceId === 'HF-313');
  return Object.freeze({
    feedbackId: 'HF-313',
    status: 'live-verified',
    candidateASourceSha: input.acceptance.previewSourceSha,
    candidateBSourceSha: input.sourceSha,
    pagesSha: input.pages.pagesSha,
    readinessReceiptSha256: readiness.receiptSha256,
    publicChoices: PASS71_HF313_PUBLIC_CHOICES,
    retainedPass69: PASS71_HF313_PINNED_CHANNELS.retained,
    rollbackPass63: PASS71_HF313_PINNED_CHANNELS.rollback,
    verifiedAt: input.liveSmoke.verifiedAt,
  });
}
