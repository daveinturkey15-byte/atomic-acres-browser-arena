import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_HF307_CHOPPER_MG_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-307',
  kind: 'pass71-hf307-exact-chopper-mg-splash-coverage',
  contract: 'atomic-acres/pass71-hf307-exact-chopper-mg-splash-coverage@1',
  feedbackId: 'HF-307',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
  ownerSubjectiveApproval: 'not-claimed',
});

export const PASS71_HF307_CHOPPER_MG_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF307_CHOPPER_MG_EVIDENCE.evidenceId,
  kind: PASS71_HF307_CHOPPER_MG_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF307_ARENAS = Object.freeze(['atomic-acres']);
export const PASS71_HF307_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF307_SCOPES = Object.freeze(PASS71_HF307_ARENAS.flatMap((arena) => (
  PASS71_HF307_RENDERERS.map((renderer) => Object.freeze({ arena, renderer }))
)));
export const PASS71_HF307_REQUIRED_ASSERTIONS = Object.freeze([
  'freezes the preceding direct radius and admits one LOS-bounded result per hostile inside exact 3x splash',
  'rejects a centred primary and every nearby splash target when hard cover blocks the admitted impact',
  'rejects guest control and preserves one unique result per target at the unchanged 280 ms cadence',
  'is a strict far-range superset of the preceding one-metre direct capsule',
]);
export const PASS71_HF307_MECHANICAL_TEST_FILES = Object.freeze([
  'src/chopper-gunner-fire-ray.test.ts',
  'src/chopper-gunner-missile.test.ts',
  'src/killstreak-damage-result-admission.test.ts',
  'src/killstreak-main-integration.test.ts',
  'src/killstreak-protocol.test.ts',
  'src/support-damage-feedback.test.ts',
  'src/pass71-hf307-chopper-mg-release-evidence.test.ts',
]);
export const PASS71_HF307_TOOLING_PATHS = Object.freeze([
  'src/killstreak-support-catalog.ts',
  'src/killstreak-runtime.ts',
  'src/killstreak-protocol.ts',
  'src/killstreak-damage-result-admission.ts',
  'src/support-damage-feedback.ts',
  'src/network.ts',
  'src/legacy-main.ts',
  'src/chopper-gunner-fire-ray.test.ts',
  'src/chopper-gunner-missile.test.ts',
  'src/killstreak-damage-result-admission.test.ts',
  'src/killstreak-main-integration.test.ts',
  'src/killstreak-protocol.test.ts',
  'src/support-damage-feedback.test.ts',
  'src/pass71-hf307-chopper-mg-release-evidence.test.ts',
  'tests/e2e/pass71-hf307-chopper-mg.spec.ts',
  'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.mjs',
  'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.d.mts',
  'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.test.mjs',
  'scripts/qa/run-pass71-hf307-chopper-mg-evidence.mjs',
  'scripts/qa/run-playwright-with-topology.mjs',
  'scripts/qa/pass71-edge-executable-identity.mjs',
  'scripts/release/stage-release-topology.mjs',
  'playwright.config.ts',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'release-channels.json',
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return object(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finite(value, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function vec3(value) {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => Number.isFinite(entry));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function pass71Hf307RecordSha256(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return sha256(JSON.stringify(canonical(unsigned)));
}

export function pass71Hf307ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-307 tooling requires a 40-character source SHA');
  return Object.freeze(PASS71_HF307_TOOLING_PATHS.map((path) => {
    const bytes = execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
      encoding: 'buffer', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    return Object.freeze({ path, sha256: sha256(bytes) });
  }));
}

function sourceFailures(source, expected) {
  const failures = [];
  if (!exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'sourceTreeSha', 'servedSourceSha',
    'endingCheckoutSourceSha', 'cleanBefore', 'cleanAfter', 'servedSchemaVersion',
    'servedReleasePass', 'servedChannel', 'servedPath', 'servedTreeSha256', 'servedFileCount',
  ])) return ['source-shape'];
  for (const key of ['expectedSourceSha', 'checkoutSourceSha', 'servedSourceSha', 'endingCheckoutSourceSha']) {
    if (source[key] !== expected.sourceSha) failures.push(`source-${key}`);
  }
  if (!SHA40.test(source.sourceTreeSha ?? '') || (expected.sourceTreeSha && source.sourceTreeSha !== expected.sourceTreeSha)) {
    failures.push('source-tree');
  }
  if (source.cleanBefore !== true || source.cleanAfter !== true) failures.push('source-clean');
  if (source.servedSchemaVersion !== 4 || source.servedReleasePass !== 'PASS 71'
    || source.servedChannel !== 'the-big-one' || source.servedPath !== 'channels/the-big-one'
    || !SHA256.test(source.servedTreeSha256 ?? '') || !Number.isSafeInteger(source.servedFileCount)
    || source.servedFileCount < 100) failures.push('served-candidate');
  return failures;
}

function mechanicalFailures(oracle) {
  const failures = [];
  if (!exactKeys(oracle, [
    'contract', 'status', 'command', 'testFiles', 'requiredAssertions', 'testFileCount',
    'testCount', 'passedCount', 'failedCount', 'startedAt', 'completedAt', 'reportSha256',
  ])) return ['mechanical-shape'];
  if (oracle.contract !== 'atomic-acres/pass71-hf307-focused-vitest-oracle@1'
    || oracle.status !== 'passed' || !oracle.command.includes('vitest run')
    || !same(oracle.testFiles, PASS71_HF307_MECHANICAL_TEST_FILES)
    || !same(oracle.requiredAssertions, PASS71_HF307_REQUIRED_ASSERTIONS)
    || oracle.testFileCount < PASS71_HF307_MECHANICAL_TEST_FILES.length
    || oracle.testCount < PASS71_HF307_REQUIRED_ASSERTIONS.length
    || oracle.passedCount !== oracle.testCount || oracle.failedCount !== 0
    || !ISO.test(oracle.startedAt ?? '') || !ISO.test(oracle.completedAt ?? '')
    || Date.parse(oracle.completedAt) < Date.parse(oracle.startedAt)
    || !SHA256.test(oracle.reportSha256 ?? '')) failures.push('mechanical-oracle');
  return failures;
}

function scopeFailures(scope, expectedScope, sourceSha, browserIdentity) {
  const prefix = `${expectedScope.arena}/${expectedScope.renderer}`;
  const failures = [];
  if (!exactKeys(scope, [
    'arena', 'renderer', 'mode', 'profile', 'topology', 'freshProcess', 'servedCandidate',
    'browser', 'runtime', 'privateLobby', 'policy', 'stage', 'guestControl', 'shot',
    'guestTransport', 'replication', 'faults',
  ])) return [`${prefix}:shape`];
  if (scope.arena !== expectedScope.arena || scope.renderer !== expectedScope.renderer
    || scope.mode !== 'hosted' || scope.profile !== 'performance'
    || scope.topology !== 'owned-private-two-peer' || scope.freshProcess !== true) failures.push(`${prefix}:identity`);
  if (!exactKeys(scope.servedCandidate, ['schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount'])
    || scope.servedCandidate.schemaVersion !== 4 || scope.servedCandidate.channel !== 'the-big-one'
    || scope.servedCandidate.releasePass !== 'PASS 71' || scope.servedCandidate.sourceSha !== sourceSha
    || scope.servedCandidate.path !== 'channels/the-big-one' || !SHA256.test(scope.servedCandidate.treeSha256 ?? '')
    || !Number.isSafeInteger(scope.servedCandidate.exactRootFileCount) || scope.servedCandidate.exactRootFileCount < 100) {
    failures.push(`${prefix}:served`);
  }
  if (!exactKeys(scope.browser, ['version', 'userAgent', 'launchedExecutablePath'])
    || scope.browser.version !== browserIdentity.version
    || scope.browser.launchedExecutablePath !== browserIdentity.executablePath
    || !scope.browser.userAgent.includes(`Edg/${browserIdentity.version}`)) failures.push(`${prefix}:browser`);
  if (!exactKeys(scope.runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ]) || scope.runtime.requestedBackend !== expectedScope.renderer || scope.runtime.actualBackend !== expectedScope.renderer
    || scope.runtime.initialized !== true || scope.runtime.softwareAdapter !== false
    || scope.runtime.deviceLost !== false || scope.runtime.uncapturedErrors !== 0
    || scope.runtime.presentationStatus !== (expectedScope.renderer === 'webgpu' ? 'healthy' : 'synchronous')) {
    failures.push(`${prefix}:runtime`);
  }
  const lobby = scope.privateLobby;
  if (!exactKeys(lobby, ['hostId', 'guestId', 'memberIds', 'memberCount', 'connectedCount', 'botCount', 'hostRole', 'guestRole'])
    || typeof lobby.hostId !== 'string' || typeof lobby.guestId !== 'string' || lobby.hostId === lobby.guestId
    || !same(lobby.memberIds, [lobby.hostId, lobby.guestId].sort()) || lobby.memberCount !== 2
    || lobby.connectedCount !== 2 || lobby.botCount !== 2 || lobby.hostRole !== 'host' || lobby.guestRole !== 'client') {
    failures.push(`${prefix}:lobby`);
  }
  if (!exactKeys(scope.policy, [
    'precedingDirectHitRadiusM', 'linearRadiusMultiplier', 'splashRadiusM',
    'radialMinimumDamageMultiplier', 'cadenceMs', 'penetration', 'hostOwned',
    'lineOfSightRequired', 'hostileRelationsOnly', 'oneResultPerTarget',
  ]) || scope.policy.precedingDirectHitRadiusM !== 1 || scope.policy.linearRadiusMultiplier !== 3
    || scope.policy.splashRadiusM !== 3 || scope.policy.radialMinimumDamageMultiplier !== 0.25
    || scope.policy.cadenceMs !== 280 || scope.policy.penetration !== 'solid-occluded'
    || scope.policy.hostOwned !== true || scope.policy.lineOfSightRequired !== true
    || scope.policy.hostileRelationsOnly !== true || scope.policy.oneResultPerTarget !== true) failures.push(`${prefix}:policy`);
  const stage = scope.stage;
  if (!exactKeys(stage, ['entityId', 'activationId', 'ownerId', 'primaryTargetId', 'splashTargetId', 'targetKinds', 'targetTeams', 'ownerTeam', 'separationM', 'lineOfSight'])
    || ![stage.entityId, stage.activationId, stage.ownerId, stage.primaryTargetId, stage.splashTargetId].every((value) => typeof value === 'string' && value.length > 0)
    || stage.primaryTargetId === stage.splashTargetId || !same(stage.targetKinds, ['bot', 'bot'])
    || !Array.isArray(stage.targetTeams) || stage.targetTeams.length !== 2
    || stage.targetTeams.some((team) => team === stage.ownerTeam) || !finite(stage.separationM, 2.8, 2.999999)
    || stage.lineOfSight !== true) failures.push(`${prefix}:stage`);
  const guestControl = scope.guestControl;
  if (!exactKeys(guestControl, [
    'attemptedEntityId', 'attemptedActivationId', 'guestId', 'apiAccepted',
    'hostOwnerAfter', 'hostControllerAfter', 'hostActivationAfter',
  ]) || guestControl.attemptedEntityId !== stage.entityId
    || guestControl.attemptedActivationId !== stage.activationId || guestControl.guestId !== lobby.guestId
    || guestControl.apiAccepted !== false || guestControl.hostOwnerAfter !== stage.ownerId
    || guestControl.hostControllerAfter !== 'owner-player'
    || guestControl.hostActivationAfter !== stage.activationId) failures.push(`${prefix}:guest-control`);
  const shot = scope.shot;
  if (!exactKeys(shot, [
    'capture', 'captureDurationMs', 'shotTimestampCount', 'trustedLmb', 'controlAccepted',
    'controller', 'entityOwnerId', 'activationId',
    'targetIds', 'resultIds', 'resultCount', 'uniqueTargetCount', 'uniqueResultCount',
    'sameHostTimestamp', 'atMs', 'damages', 'aimOrigin', 'aimTarget',
  ]) || shot.capture !== 'complete-host-single-cadence-window'
    || !finite(shot.captureDurationMs, 0, 279.999999) || shot.shotTimestampCount !== 1
    || shot.trustedLmb !== true || shot.controlAccepted !== true || shot.controller !== 'owner-player'
    || shot.entityOwnerId !== stage.ownerId || shot.activationId !== stage.activationId
    || !same(shot.targetIds, [stage.primaryTargetId, stage.splashTargetId])
    || !Array.isArray(shot.resultIds) || shot.resultIds.length !== 2 || new Set(shot.resultIds).size !== 2
    || shot.resultCount !== 2 || shot.uniqueTargetCount !== 2 || shot.uniqueResultCount !== 2
    || shot.sameHostTimestamp !== true || !finite(shot.atMs, 0)
    || !Array.isArray(shot.damages) || shot.damages.length !== 2
    || !(shot.damages[0] > shot.damages[1] && shot.damages[1] > 0)
    || !vec3(shot.aimOrigin) || !vec3(shot.aimTarget)) failures.push(`${prefix}:shot`);
  const guestTransport = scope.guestTransport;
  if (!exactKeys(guestTransport, [
    'hostId', 'matchEpoch', 'messageCount', 'nonces', 'targetIds', 'resultIds',
    'resultCount', 'uniqueTargetCount', 'uniqueResultCount',
  ]) || guestTransport.hostId !== stage.ownerId || !Number.isSafeInteger(guestTransport.matchEpoch)
    || guestTransport.matchEpoch < 0 || guestTransport.messageCount !== 1
    || !Array.isArray(guestTransport.nonces) || guestTransport.nonces.length !== 1
    || !Number.isSafeInteger(guestTransport.nonces[0]) || guestTransport.nonces[0] < 0
    || !same(guestTransport.targetIds, shot.targetIds)
    || !same(guestTransport.resultIds, shot.resultIds)
    || guestTransport.resultCount !== 2 || guestTransport.uniqueTargetCount !== 2
    || guestTransport.uniqueResultCount !== 2) failures.push(`${prefix}:guest-transport`);
  const replication = scope.replication;
  if (!exactKeys(replication, [
    'hostBotHealthBefore', 'hostBotHealthAfter', 'guestBotHealthAfter', 'guestObservedEntity',
    'guestObservedActivation', 'guestObservedOwner', 'guestObservedController', 'replicaDrift',
  ]) || !Array.isArray(replication.hostBotHealthBefore) || !Array.isArray(replication.hostBotHealthAfter)
    || !Array.isArray(replication.guestBotHealthAfter) || replication.hostBotHealthBefore.length !== 2
    || replication.hostBotHealthAfter.length !== 2 || replication.guestBotHealthAfter.length !== 2
    || replication.hostBotHealthAfter.some((health, index) => !(health < replication.hostBotHealthBefore[index]))
    || !same(replication.guestBotHealthAfter, replication.hostBotHealthAfter)
    || replication.guestObservedEntity !== true || replication.guestObservedActivation !== stage.activationId
    || replication.guestObservedOwner !== stage.ownerId || replication.guestObservedController !== 'owner-player'
    || !finite(replication.replicaDrift, 0, 0)) failures.push(`${prefix}:replication`);
  if (!Array.isArray(scope.faults) || scope.faults.length !== 0) failures.push(`${prefix}:faults`);
  return failures;
}

export function pass71Hf307EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'closingAuthority', 'ownerSubjectiveApproval', 'startedAt', 'completedAt', 'source',
    'environment', 'browser', 'tooling', 'mechanicalOracle', 'scopes', 'faults', 'claims',
    'receiptSha256',
  ])) return ['record-shape'];
  for (const [key, value] of Object.entries(PASS71_HF307_CHOPPER_MG_EVIDENCE)) {
    if (record[key] !== value) failures.push(`record-${key}`);
  }
  if (!ISO.test(record.startedAt ?? '') || !ISO.test(record.completedAt ?? '')
    || Date.parse(record.completedAt) < Date.parse(record.startedAt)) failures.push('record-time');
  const sourceSha = expected.sourceSha ?? record.source?.expectedSourceSha;
  if (!SHA40.test(sourceSha ?? '')) failures.push('expected-source');
  else failures.push(...sourceFailures(record.source, { ...expected, sourceSha }));
  if (!exactKeys(record.environment, ['machine', 'platform', 'arch'])
    || record.environment.machine !== 'dave-gaming-pc' || record.environment.platform !== 'win32'
    || record.environment.arch !== 'x64') failures.push('environment');
  const browser = record.browser;
  if (!exactKeys(browser, [
    'channel', 'installed', 'version', 'userAgent', 'executableName', 'executableVersion',
    'executablePath', 'executableSha256', 'installRoot', 'signatureStatus', 'signer', 'isolation',
  ]) || browser.channel !== 'msedge' || browser.installed !== true || typeof browser.version !== 'string'
    || browser.version !== browser.executableVersion || !browser.userAgent?.includes(`Edg/${browser.version}`)
    || browser.executableName !== 'msedge.exe'
    || !/\/Microsoft\/Edge\/Application\/msedge\.exe$/iu.test(browser.executablePath ?? '')
    || !SHA256.test(browser.executableSha256 ?? '')
    || typeof browser.installRoot !== 'string' || browser.installRoot.length < 3
    || browser.signatureStatus !== 'Valid' || !/Microsoft/i.test(browser.signer ?? '')
    || browser.isolation !== 'fresh-process-and-profile-per-scope') failures.push('browser');
  const tooling = expected.tooling ?? record.tooling;
  if (!same(record.tooling, tooling) || !Array.isArray(record.tooling)
    || record.tooling.length !== PASS71_HF307_TOOLING_PATHS.length
    || record.tooling.some((entry, index) => !exactKeys(entry, ['path', 'sha256'])
      || entry.path !== PASS71_HF307_TOOLING_PATHS[index] || !SHA256.test(entry.sha256 ?? ''))) failures.push('tooling');
  failures.push(...mechanicalFailures(record.mechanicalOracle));
  if (!Array.isArray(record.scopes) || record.scopes.length !== PASS71_HF307_SCOPES.length) failures.push('scope-count');
  else for (const [index, scope] of record.scopes.entries()) {
    failures.push(...scopeFailures(scope, PASS71_HF307_SCOPES[index], sourceSha, browser));
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('faults');
  if (!exactKeys(record.claims, [
    'exactThreeTimesRadius', 'hostAuthoritative', 'lineOfSightBounded', 'relationBounded',
    'oneResultPerTarget', 'cadenceRetained', 'hostedAtomicAcres', 'webgl2AndWebgpu',
    'ownedHostedTopology', 'ownerSubjectiveApproval',
  ]) || Object.entries(record.claims).some(([key, value]) => (
    key === 'ownerSubjectiveApproval' ? value !== 'not-claimed' : value !== true
  ))) failures.push('claims');
  if (!SHA256.test(record.receiptSha256 ?? '') || record.receiptSha256 !== pass71Hf307RecordSha256(record)) {
    failures.push('receipt-sha256');
  }
  return Object.freeze(failures);
}

export function createPass71Hf307EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF307_CHOPPER_MG_DESCRIPTOR,
    closesFeedback: true,
    ownerSubjectiveApproval: 'not-claimed',
    validate(record, context) {
      try {
        const sourceSha = context?.sourceSha;
        const tooling = context?.options?.pass71Hf307Tooling
          ?? pass71Hf307ToolingHashesAtSource(context?.repositoryRoot, sourceSha);
        const sourceTreeSha = context?.options?.pass71Hf307SourceTreeSha
          ?? execFileSync('git', ['-C', context?.repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
            encoding: 'utf8', windowsHide: true,
          }).trim();
        return pass71Hf307EvidenceFailures(record, { sourceSha, sourceTreeSha, tooling });
      } catch (error) {
        return Object.freeze([`hf307-validator:${error instanceof Error ? error.message : String(error)}`]);
      }
    },
  });
}

export const PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY = createPass71Hf307EvidenceRegistryEntry();

function fixtureTooling() {
  return PASS71_HF307_TOOLING_PATHS.map((path, index) => ({ path, sha256: `${index.toString(16).padStart(2, '0')}${'a'.repeat(62)}` }));
}

function fixtureScope(scope, sourceSha, edgeVersion, edgeExecutablePath, ordinal) {
  const ownerId = `host-${ordinal}`;
  const guestId = `guest-${ordinal}`;
  const primaryTargetId = `bot-${ordinal}-a`;
  const splashTargetId = `bot-${ordinal}-b`;
  const activationId = `activation-${ordinal}`;
  return {
    ...scope, mode: 'hosted', profile: 'performance', topology: 'owned-private-two-peer', freshProcess: true,
    servedCandidate: { schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
      path: 'channels/the-big-one', treeSha256: 'b'.repeat(64), exactRootFileCount: 500 },
    browser: { version: edgeVersion, userAgent: `Mozilla/5.0 Edg/${edgeVersion}`,
      launchedExecutablePath: edgeExecutablePath },
    runtime: { requestedBackend: scope.renderer, actualBackend: scope.renderer, initialized: true,
      adapterClass: 'hardware', deviceClass: 'discrete-gpu', adapterLabel: 'candidate-adapter',
      softwareAdapter: false, deviceLost: false, uncapturedErrors: 0,
      presentationStatus: scope.renderer === 'webgpu' ? 'healthy' : 'synchronous' },
    privateLobby: { hostId: ownerId, guestId, memberIds: [guestId, ownerId].sort(), memberCount: 2,
      connectedCount: 2, botCount: 2, hostRole: 'host', guestRole: 'client' },
    policy: { precedingDirectHitRadiusM: 1, linearRadiusMultiplier: 3, splashRadiusM: 3,
      radialMinimumDamageMultiplier: 0.25, cadenceMs: 280, penetration: 'solid-occluded',
      hostOwned: true, lineOfSightRequired: true, hostileRelationsOnly: true, oneResultPerTarget: true },
    stage: { entityId: `chopper-${ordinal}`, activationId, ownerId, primaryTargetId, splashTargetId,
      targetKinds: ['bot', 'bot'], targetTeams: [1, 1], ownerTeam: 0, separationM: 2.9, lineOfSight: true },
    guestControl: { attemptedEntityId: `chopper-${ordinal}`, attemptedActivationId: activationId, guestId,
      apiAccepted: false, hostOwnerAfter: ownerId, hostControllerAfter: 'owner-player', hostActivationAfter: activationId },
    shot: { capture: 'complete-host-single-cadence-window', captureDurationMs: 160,
      shotTimestampCount: 1, trustedLmb: true, controlAccepted: true,
      controller: 'owner-player', entityOwnerId: ownerId,
      activationId, targetIds: [primaryTargetId, splashTargetId], resultIds: [`result-${ordinal}-a`, `result-${ordinal}-b`],
      resultCount: 2, uniqueTargetCount: 2, uniqueResultCount: 2, sameHostTimestamp: true,
      atMs: 1_600 + ordinal * 10, damages: [10, 4], aimOrigin: [0, 18, 0], aimTarget: [0, 1.15, -20] },
    guestTransport: { hostId: ownerId, matchEpoch: 7, messageCount: 1, nonces: [100 + ordinal],
      targetIds: [primaryTargetId, splashTargetId], resultIds: [`result-${ordinal}-a`, `result-${ordinal}-b`],
      resultCount: 2, uniqueTargetCount: 2, uniqueResultCount: 2 },
    replication: { hostBotHealthBefore: [100, 100], hostBotHealthAfter: [90, 96],
      guestBotHealthAfter: [90, 96], guestObservedEntity: true, guestObservedActivation: activationId,
      guestObservedOwner: ownerId, guestObservedController: 'owner-player', replicaDrift: 0 },
    faults: [],
  };
}

export function createPass71Hf307EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? '1'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? '2'.repeat(40);
  const tooling = options.tooling ?? fixtureTooling();
  const edgeVersion = options.edgeVersion ?? '140.0.3485.81';
  const edgeExecutablePath = options.edgeExecutablePath
    ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const startedAt = options.startedAt ?? '2026-08-13T20:00:00.000Z';
  const completedAt = options.completedAt ?? '2026-08-13T20:20:00.000Z';
  const record = {
    ...PASS71_HF307_CHOPPER_MG_EVIDENCE,
    startedAt, completedAt,
    source: { expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, sourceTreeSha,
      servedSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha, cleanBefore: true, cleanAfter: true,
      servedSchemaVersion: 4, servedReleasePass: 'PASS 71', servedChannel: 'the-big-one',
      servedPath: 'channels/the-big-one', servedTreeSha256: 'b'.repeat(64), servedFileCount: 500 },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: { channel: 'msedge', installed: true, version: edgeVersion,
      userAgent: `Mozilla/5.0 Edg/${edgeVersion}`, executableName: 'msedge.exe', executableVersion: edgeVersion,
      executablePath: edgeExecutablePath, executableSha256: 'c'.repeat(64),
      installRoot: 'C:/Program Files (x86)/Microsoft/Edge/Application',
      signatureStatus: 'Valid', signer: 'Microsoft Corporation', isolation: 'fresh-process-and-profile-per-scope' },
    tooling,
    mechanicalOracle: { contract: 'atomic-acres/pass71-hf307-focused-vitest-oracle@1', status: 'passed',
      command: `vitest run ${PASS71_HF307_MECHANICAL_TEST_FILES.join(' ')}`,
      testFiles: [...PASS71_HF307_MECHANICAL_TEST_FILES], requiredAssertions: [...PASS71_HF307_REQUIRED_ASSERTIONS],
      testFileCount: PASS71_HF307_MECHANICAL_TEST_FILES.length,
      testCount: 80, passedCount: 80, failedCount: 0, startedAt, completedAt,
      reportSha256: 'd'.repeat(64) },
    scopes: PASS71_HF307_SCOPES.map((scope, ordinal) => fixtureScope(
      scope, sourceSha, edgeVersion, edgeExecutablePath, ordinal,
    )),
    faults: [],
    claims: { exactThreeTimesRadius: true, hostAuthoritative: true, lineOfSightBounded: true,
      relationBounded: true, oneResultPerTarget: true, cadenceRetained: true, hostedAtomicAcres: true,
      webgl2AndWebgpu: true, ownedHostedTopology: true, ownerSubjectiveApproval: 'not-claimed' },
  };
  record.receiptSha256 = pass71Hf307RecordSha256(record);
  return record;
}
