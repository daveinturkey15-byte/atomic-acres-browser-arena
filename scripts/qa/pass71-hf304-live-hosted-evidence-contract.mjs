import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  PASS71_HF304_ARENAS,
  PASS71_HF304_MACHINE_HOSTNAME_SHA256,
  PASS71_HF304_PANES,
  PASS71_HF304_WEAPONS,
  PASS71_HF304_WEAPON_FIRE_KINDS,
} from './pass71-hf304-glass-evidence-contract.mjs';

export const PASS71_HF304_LIVE_HOSTED_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-304',
  kind: 'pass71-hf304-live-hosted-native',
  contract: 'atomic-acres/pass71-hf304-live-hosted-native@1',
  feedbackId: 'HF-304',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
  ownerSubjectiveApproval: 'not-claimed',
});

export const PASS71_HF304_LIVE_HOSTED_DESCRIPTOR = Object.freeze({
  evidenceId: 'HF-304',
  kind: PASS71_HF304_LIVE_HOSTED_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF304_LIVE_HOSTED_SCOPES = Object.freeze([
  Object.freeze({ id: 'quality/webgl2', renderer: 'webgl2', requestedProfile: 'quality', actualProfile: 'blender' }),
  Object.freeze({ id: 'performance/webgl2', renderer: 'webgl2', requestedProfile: 'performance', actualProfile: 'performance' }),
  Object.freeze({ id: 'quality/webgpu', renderer: 'webgpu', requestedProfile: 'quality', actualProfile: 'blender' }),
  Object.freeze({ id: 'performance/webgpu', renderer: 'webgpu', requestedProfile: 'performance', actualProfile: 'performance' }),
]);

export const PASS71_HF304_LIVE_HOSTED_ARENAS = PASS71_HF304_ARENAS;
export const PASS71_HF304_LIVE_HOSTED_PANES = PASS71_HF304_PANES;
export const PASS71_HF304_LIVE_HOSTED_WEAPONS = PASS71_HF304_WEAPONS;
export const PASS71_HF304_LIVE_HOSTED_FIRE_KINDS = PASS71_HF304_WEAPON_FIRE_KINDS;
export const PASS71_HF304_LIVE_HOSTED_MODES = Object.freeze(['solo', 'hosted']);
export const PASS71_HF304_LIVE_HOSTED_CELL_COUNT_PER_SCOPE = 480;
export const PASS71_HF304_LIVE_HOSTED_TOTAL_CELL_COUNT = 1_920;
export const PASS71_HF304_LIVE_HOSTED_CRACK_CONTROLS_PER_SCOPE = 24;
export const PASS71_HF304_LIVE_HOSTED_TOTAL_CRACK_CONTROLS = 96;
export const PASS71_HF304_LIVE_HOSTED_DEBRIS_TRAILS_PER_SCOPE = 36;
export const PASS71_HF304_LIVE_HOSTED_TOTAL_DEBRIS_TRAILS = 144;
export const PASS71_HF304_LIVE_HOSTED_VISUALS_PER_SCOPE = 4;
export const PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH = 192;
export const PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT = 144;
export const PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES = 104 * 1_024;
export const PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES = 12 * 1_024 * 1_024;
export const PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256 = PASS71_HF304_MACHINE_HOSTNAME_SHA256;

export const PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS = Object.freeze([
  'src/legacy-main.ts',
  'src/protocol.ts',
  'src/network.ts',
  'src/glass-authority.ts',
  'src/weapon-glass-break-policy.ts',
  'src/projectile-glass-break-admission.ts',
  'src/hosted-bot-glass-authority.ts',
  'src/window-glass-debris-presentation.ts',
  'src/physics.ts',
  'src/major-debris-budget.ts',
  'src/map.ts',
  'src/additional-maps.ts',
  'src/combat/weapon-catalog.ts',
  'src/pass71-hf304-live-hosted-release-evidence.test.ts',
  'tests/e2e/pass66-e2e-support.ts',
  'tests/e2e/pass71-hf304-live-hosted.spec.ts',
  'scripts/qa/pass71-hf304-glass-evidence-contract.mjs',
  'scripts/qa/pass71-hf304-live-hosted-evidence-contract.mjs',
  'scripts/qa/pass71-hf304-live-hosted-evidence-contract.d.mts',
  'scripts/qa/pass71-hf304-live-hosted-evidence-contract.test.mjs',
  'scripts/qa/run-pass71-hf304-live-hosted-evidence.mjs',
  'scripts/qa/pass71-edge-executable-identity.mjs',
  'scripts/qa/run-playwright-with-topology.mjs',
  'scripts/release/stage-release-topology.mjs',
  'playwright.config.ts',
  'release-channels.json',
  'package.json',
  'package-lock.json',
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const OWNED_PEER_PATH = /^\/peerjs-[a-f0-9]{24}$/u;
const SOFTWARE = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function iso(value) {
  return typeof value === 'string' && ISO.test(value) && new Date(value).toISOString() === value;
}

function finiteTuple(value, length = 3) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function tupleDistance(left, right) {
  if (!finiteTuple(left) || !finiteTuple(right)) return Number.POSITIVE_INFINITY;
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function unitTuple(value) {
  const magnitude = finiteTuple(value) ? Math.hypot(...value) : Number.NaN;
  return Number.isFinite(magnitude) && magnitude >= 0.96 && magnitude <= 1.04;
}

function expectedPolicy(weaponId) {
  return weaponId === 'explosive-crossbow'
    ? Object.freeze({ weapon: weaponId, profile: 'explosion', timing: 'detonation' })
    : Object.freeze({ weapon: weaponId, profile: 'bullet', timing: 'impact' });
}

function expectedProjection(weaponId) {
  const detached = weaponId === 'explosive-crossbow';
  return Object.freeze({
    phase: detached ? 'detached' : 'breached',
    paneVisible: false,
    crackOverlayVisible: false,
    apertureOpen: true,
    movementSolid: false,
    ballisticSolid: false,
    aiLineOfSightSolid: false,
  });
}

const INTACT_PROJECTION = Object.freeze({
  phase: 'intact', paneVisible: true, crackOverlayVisible: false, apertureOpen: false,
  movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
});

export function pass71Hf304LiveHostedRecordSha256(record) {
  if (!object(record)) throw new TypeError('HF-304 live hosted record must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return sha256(Buffer.from(`${canonicalJson(unsigned)}\n`, 'utf8'));
}

export function pass71Hf304LiveHostedToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new TypeError('HF-304 live hosted tooling requires a full source SHA');
  return Object.freeze(PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS.map((path) => Object.freeze({
    path,
    sha256: sha256(execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    })),
  })));
}

function validateServedCandidate(value, sourceSha, label, failures) {
  exactKeys(value, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], label, failures);
  if (value?.schemaVersion !== 4 || value?.channel !== 'the-big-one'
    || value?.releasePass !== 'PASS 71' || value?.sourceSha !== sourceSha
    || value?.path !== 'channels/the-big-one' || !SHA256.test(value?.treeSha256 ?? '')
    || !Number.isSafeInteger(value?.exactRootFileCount) || value.exactRootFileCount < 2) {
    failures.push(`${label}:exact-candidate-provenance`);
  }
}

function validateRuntime(value, scope, label, failures) {
  exactKeys(value, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ], label, failures);
  const expectedAdapterClass = scope.renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext';
  const expectedDeviceClass = scope.renderer === 'webgpu' ? 'GPUDevice' : null;
  if (value?.requestedBackend !== scope.renderer || value?.actualBackend !== scope.renderer
    || value?.initialized !== true || value?.softwareAdapter !== false
    || value?.adapterClass !== expectedAdapterClass || value?.deviceClass !== expectedDeviceClass
    || typeof value?.adapterLabel !== 'string' || value.adapterLabel.length < 1
    || SOFTWARE.test(value.adapterLabel) || value?.deviceLost !== false || value?.uncapturedErrors !== 0
    || value?.presentationStatus !== (scope.renderer === 'webgpu' ? 'healthy' : 'synchronous')) {
    failures.push(`${label}:native-hardware-runtime`);
  }
}

function validatePaneEvidence(value, projection, label, failures) {
  exactKeys(value, [
    'paneId', 'state', 'projection', 'meshVisible', 'broken',
    'activeWorldColliderPresent', 'persistentDebrisId',
  ], label, failures);
  exactKeys(value?.state, [
    'schemaVersion', 'paneId', 'matchEpoch', 'revision', 'phase', 'damageQ',
    'lastMutationTick', 'breachRevision', 'breachTick', 'rememberedImpactIds',
  ], `${label}:state`, failures);
  exactKeys(value?.projection, [
    'phase', 'paneVisible', 'crackOverlayVisible', 'apertureOpen',
    'movementSolid', 'ballisticSolid', 'aiLineOfSightSolid',
  ], `${label}:projection`, failures);
  const intact = projection.phase === 'intact';
  const expectedDamageQ = intact ? 0 : projection.phase === 'detached' ? 2_000 : 1_000;
  const rememberedImpactIds = value?.state?.rememberedImpactIds;
  const expectedDebrisId = typeof value?.paneId === 'string'
    ? `window-debris:${value.paneId.toLowerCase().replace(/[^a-z0-9:-]/gu, '-').slice(0, 104)}`
    : null;
  if (typeof value?.paneId !== 'string' || !same(value?.projection, projection)
    || value?.meshVisible !== projection.paneVisible || value?.broken !== projection.apertureOpen
    || value?.activeWorldColliderPresent !== projection.movementSolid
    || value?.state?.schemaVersion !== 1 || value?.state?.paneId !== value?.paneId
    || value?.state?.phase !== projection.phase
    || !Number.isSafeInteger(value?.state?.matchEpoch) || value.state.matchEpoch < 1
    || value?.state?.revision !== (intact ? 0 : 1)
    || value?.state?.damageQ !== expectedDamageQ
    || !Number.isSafeInteger(value?.state?.lastMutationTick) || value.state.lastMutationTick < 0
    || (intact && value.state.lastMutationTick !== 0)
    || value?.state?.breachRevision !== (intact ? null : 1)
    || (intact ? value?.state?.breachTick !== null
      : !Number.isSafeInteger(value?.state?.breachTick)
        || value.state.breachTick !== value.state.lastMutationTick)
    || !Array.isArray(rememberedImpactIds) || rememberedImpactIds.length !== (intact ? 0 : 1)
    || rememberedImpactIds.some((impactId) => typeof impactId !== 'string'
      || impactId.length < 1 || impactId.length > 192)
    || (projection.apertureOpen && value?.persistentDebrisId !== expectedDebrisId)
    || (!projection.apertureOpen && value?.persistentDebrisId !== null)) {
    failures.push(`${label}:pane-authority-projection`);
  }
}

function durablePaneState(value) {
  return Object.fromEntries([
    'schemaVersion', 'paneId', 'matchEpoch', 'revision', 'phase', 'damageQ',
    'breachRevision', 'rememberedImpactIds',
  ].map((key) => [key, value?.[key]]));
}

function validateCell(cell, expected, sessions, peerServer, label, failures) {
  exactKeys(cell, [
    'id', 'scopeId', 'mode', 'arenaId', 'paneId', 'paneIndex', 'weaponId', 'fireKind',
    'policy', 'actor', 'spatial', 'authority', 'protocol',
  ], label, failures);
  const weaponIndex = PASS71_HF304_LIVE_HOSTED_WEAPONS.indexOf(expected.weaponId);
  const session = sessions.find((entry) => entry.arenaId === expected.arenaId);
  if (cell?.id !== `${expected.scopeId}/${expected.mode}/${expected.arenaId}/${expected.paneId}/${expected.weaponId}`
    || cell?.scopeId !== expected.scopeId || cell?.mode !== expected.mode
    || cell?.arenaId !== expected.arenaId || cell?.paneId !== expected.paneId
    || cell?.paneIndex !== expected.paneIndex || cell?.weaponId !== expected.weaponId
    || cell?.fireKind !== PASS71_HF304_LIVE_HOSTED_FIRE_KINDS[weaponIndex]
    || !same(cell?.policy, expectedPolicy(expected.weaponId)) || !session) {
    failures.push(`${label}:exact-cartesian-identity`);
  }
  exactKeys(cell?.actor, [
    'role', 'actorId', 'hostId', 'guestId', 'matchEpoch', 'actionNonce', 'windowEventNonce',
  ], `${label}:actor`, failures);
  if (!Number.isSafeInteger(cell?.actor?.matchEpoch) || cell.actor.matchEpoch < 1
    || !Number.isSafeInteger(cell?.actor?.actionNonce) || cell.actor.actionNonce < 0
    || !Number.isSafeInteger(cell?.actor?.windowEventNonce) || cell.actor.windowEventNonce < 0
    || cell.actor.actionNonce === cell.actor.windowEventNonce) failures.push(`${label}:nonce-identity`);
  exactKeys(cell?.spatial, [
    'playerPosition', 'cameraDirection', 'actionOrigin', 'actionDirection', 'guestObservedHostPosition',
  ], `${label}:spatial`, failures);
  if (!finiteTuple(cell?.spatial?.playerPosition) || !unitTuple(cell?.spatial?.cameraDirection)
    || !finiteTuple(cell?.spatial?.actionOrigin) || !unitTuple(cell?.spatial?.actionDirection)
    || tupleDistance(cell?.spatial?.playerPosition, cell?.spatial?.actionOrigin) > 0.01
    || tupleDistance(cell?.spatial?.cameraDirection, cell?.spatial?.actionDirection) > 0.01
    || (expected.mode === 'hosted' && !finiteTuple(cell?.spatial?.guestObservedHostPosition))
    || (expected.mode === 'hosted'
      && tupleDistance(cell?.spatial?.playerPosition, cell?.spatial?.guestObservedHostPosition) > 0.05)
    || (expected.mode === 'solo' && cell?.spatial?.guestObservedHostPosition !== null)) {
    failures.push(`${label}:finite-spatial-authority`);
  }
  exactKeys(cell?.authority, [
    'accepted', 'hostBefore', 'hostAfter', 'hostColliderRetired', 'guestActionIdentity',
    'guestWindowEventIdentity', 'guestAfter', 'localMutationTicks',
  ], `${label}:authority`, failures);
  validatePaneEvidence(cell?.authority?.hostBefore, INTACT_PROJECTION, `${label}:host-before`, failures);
  validatePaneEvidence(cell?.authority?.hostAfter, expectedProjection(expected.weaponId), `${label}:host-after`, failures);
  const expectedImpactId = `${cell?.policy?.profile}:${cell?.actor?.actorId}:${cell?.actor?.windowEventNonce}:0`;
  if (cell?.authority?.accepted !== true || cell?.authority?.hostColliderRetired !== true
    || cell?.authority?.hostBefore?.paneId !== expected.paneId
    || cell?.authority?.hostAfter?.paneId !== expected.paneId
    || cell?.authority?.hostBefore?.state?.matchEpoch !== cell?.actor?.matchEpoch
    || cell?.authority?.hostAfter?.state?.matchEpoch !== cell?.actor?.matchEpoch
    || !same(cell?.authority?.hostAfter?.state?.rememberedImpactIds, [expectedImpactId])) {
    failures.push(`${label}:host-authority-or-collider`);
  }
  if (expected.mode === 'solo') {
    if (cell?.actor?.role !== 'offline' || cell?.actor?.actorId !== session?.solo.actorId
      || cell?.actor?.hostId !== null || cell?.actor?.guestId !== null
      || cell?.protocol !== null
      || cell?.authority?.guestActionIdentity !== null || cell?.authority?.guestWindowEventIdentity !== null
      || cell?.authority?.guestAfter !== null || cell?.authority?.localMutationTicks !== null) {
      failures.push(`${label}:solo-scope`);
    }
    return;
  }
  exactKeys(cell?.authority?.guestActionIdentity, [
    'by', 'weapon', 'nonce', 'matchEpoch', 'paneAdmitted',
  ], `${label}:guest-action-identity`, failures);
  exactKeys(cell?.authority?.guestWindowEventIdentity, [
    'nonce', 'processed',
  ], `${label}:guest-window-event-identity`, failures);
  const projectile = expected.weaponId === 'flare-gun' || expected.weaponId === 'explosive-crossbow';
  const durableStateEqual = same(
    durablePaneState(cell?.authority?.hostAfter?.state),
    durablePaneState(cell?.authority?.guestAfter?.state),
  );
  const projectionEqual = same(
    cell?.authority?.hostAfter?.projection,
    cell?.authority?.guestAfter?.projection,
  );
  if (cell?.actor?.role !== 'host' || cell?.actor?.actorId !== session?.hosted.hostId
    || cell?.actor?.hostId !== session?.hosted.hostId || cell?.actor?.guestId !== session?.hosted.guestId
    || !Number.isSafeInteger(cell?.authority?.localMutationTicks?.host)
    || !Number.isSafeInteger(cell?.authority?.localMutationTicks?.guest)
    || cell.authority.localMutationTicks.host !== cell?.authority?.hostAfter?.state?.lastMutationTick
    || cell.authority.localMutationTicks.guest !== cell?.authority?.guestAfter?.state?.lastMutationTick
    || durableStateEqual !== true || projectionEqual !== true
    || cell?.authority?.guestAfter?.paneId !== expected.paneId
    || cell?.authority?.guestAfter?.state?.matchEpoch !== cell?.actor?.matchEpoch
    || !same(cell?.authority?.guestAfter?.state?.rememberedImpactIds, [expectedImpactId])
    || cell?.authority?.guestActionIdentity?.by !== session?.hosted.hostId
    || cell?.authority?.guestActionIdentity?.weapon !== expected.weaponId
    || cell?.authority?.guestActionIdentity?.nonce !== cell?.actor?.actionNonce
    || cell?.authority?.guestActionIdentity?.matchEpoch !== cell?.actor?.matchEpoch
    || cell?.authority?.guestActionIdentity?.paneAdmitted !== projectile
    || cell?.authority?.guestWindowEventIdentity?.nonce !== cell?.actor?.windowEventNonce
    || cell?.authority?.guestWindowEventIdentity?.processed !== true) {
    failures.push(`${label}:host-guest-convergence`);
  }
  validatePaneEvidence(cell?.authority?.guestAfter, expectedProjection(expected.weaponId), `${label}:guest-after`, failures);
  exactKeys(cell?.protocol, [
    'protocolVersion', 'ownedPeer', 'hostNetworkRole', 'guestNetworkRole', 'action', 'windowEvent',
  ], `${label}:protocol`, failures);
  if (cell?.protocol?.protocolVersion !== 20 || !same(cell?.protocol?.ownedPeer, peerServer)
    || cell?.protocol?.hostNetworkRole !== 'host' || cell?.protocol?.guestNetworkRole !== 'client') {
    failures.push(`${label}:owned-peer-protocol`);
  }
  exactKeys(cell?.protocol?.action, ['by', 'weapon', 'nonce', 'decoded', 'guestLedgerCurrent'], `${label}:action`, failures);
  if (cell?.protocol?.action?.by !== session?.hosted.hostId
    || cell?.protocol?.action?.weapon !== expected.weaponId
    || cell?.protocol?.action?.nonce !== cell?.actor?.actionNonce
    || cell?.protocol?.action?.decoded !== true || cell?.protocol?.action?.guestLedgerCurrent !== true) {
    failures.push(`${label}:exact-action-protocol`);
  }
  exactKeys(cell?.protocol?.windowEvent, [
    'by', 'nonce', 'kind', 'wireWeapon', 'actionNonce', 'hostAuthorityId', 'decoded', 'guestProcessed',
  ], `${label}:window-event`, failures);
  if (cell?.protocol?.windowEvent?.by !== session?.hosted.hostId
    || cell?.protocol?.windowEvent?.nonce !== cell?.actor?.windowEventNonce
    || cell?.protocol?.windowEvent?.kind !== 'shot'
    || cell?.protocol?.windowEvent?.wireWeapon !== (projectile ? expected.weaponId : null)
    || cell?.protocol?.windowEvent?.actionNonce !== (projectile ? cell.actor.actionNonce : null)
    || cell?.protocol?.windowEvent?.hostAuthorityId !== session?.hosted.hostId
    || cell?.protocol?.windowEvent?.decoded !== true || cell?.protocol?.windowEvent?.guestProcessed !== true) {
    failures.push(`${label}:exact-window-event-protocol`);
  }
}

function validateDebrisTrail(trail, expected, label, failures) {
  exactKeys(trail, [
    'id', 'scopeId', 'mode', 'role', 'arenaId', 'paneId', 'authorityActorId',
    'matchEpoch', 'actionNonce', 'windowEventNonce', 'motionOwner', 'samples',
    'minimumVerticalFallM', 'minimumDisplacementM', 'supportContact', 'colliderRetired',
    'unsupportedSuspension', 'duplicateDebris', 'bodyCountBounded',
  ], label, failures);
  if (trail?.id !== `${expected.scopeId}/${expected.mode}/${expected.role}/${expected.arenaId}/${expected.paneId}`
    || trail?.scopeId !== expected.scopeId || trail?.mode !== expected.mode || trail?.role !== expected.role
    || trail?.arenaId !== expected.arenaId || trail?.paneId !== expected.paneId
    || trail?.authorityActorId !== expected.authorityActorId || trail?.matchEpoch !== expected.matchEpoch
    || !Number.isSafeInteger(trail?.actionNonce) || trail.actionNonce < 0
    || !Number.isSafeInteger(trail?.windowEventNonce) || trail.windowEventNonce < 0
    || trail.actionNonce === trail.windowEventNonce
    || !['rapier-major-body', 'bounded-presentation-fall'].includes(trail?.motionOwner)
    || !Number.isFinite(trail?.minimumVerticalFallM) || trail.minimumVerticalFallM < 0.025
    || !Number.isFinite(trail?.minimumDisplacementM) || trail.minimumDisplacementM < 0.04
    || trail?.supportContact !== true || trail?.colliderRetired !== true
    || trail?.unsupportedSuspension !== false || trail?.duplicateDebris !== false
    || trail?.bodyCountBounded !== true || !Array.isArray(trail?.samples) || trail.samples.length !== 4) {
    failures.push(`${label}:bounded-gravity-lifecycle`);
    return;
  }
  const [spawned, moving, settled, retired] = trail.samples;
  for (const [index, sample] of trail.samples.entries()) exactKeys(sample, [
    'phase', 'present', 'visible', 'physical', 'physicsActive',
    'fallbackSettled', 'restY', 'position',
  ], `${label}:sample:${index}`, failures);
  const rapierOwned = trail.motionOwner === 'rapier-major-body';
  if (spawned?.phase !== 'spawned' || moving?.phase !== 'moving'
    || settled?.phase !== 'settled' || retired?.phase !== 'retired'
    || !finiteTuple(spawned?.position) || !finiteTuple(moving?.position) || !finiteTuple(settled?.position)
    || retired?.position !== null || retired?.restY !== null || retired?.present !== false
    || retired?.visible !== false || retired?.physical !== false
    || retired?.physicsActive !== false || retired?.fallbackSettled !== false
    || spawned?.present !== true || moving?.present !== true || settled?.present !== true
    || spawned?.visible !== true || moving?.visible !== true || settled?.visible !== true
    || spawned?.fallbackSettled !== false || moving?.fallbackSettled !== false
    || spawned?.physical !== rapierOwned || spawned?.physicsActive !== rapierOwned
    || moving?.physical !== rapierOwned || moving?.physicsActive !== rapierOwned
    || ![null, 'number'].includes(spawned?.restY === null ? null : typeof spawned?.restY)
    || ![null, 'number'].includes(moving?.restY === null ? null : typeof moving?.restY)
    || (spawned?.restY !== null && !Number.isFinite(spawned.restY))
    || (moving?.restY !== null && !Number.isFinite(moving.restY))
    || moving.position[1] > spawned.position[1] - 0.025
    || Math.hypot(...moving.position.map((value, index) => value - spawned.position[index])) < 0.04
    || settled?.physicsActive !== false || settled?.physical !== false || settled?.fallbackSettled !== true
    || !Number.isFinite(settled?.restY) || Math.abs(settled.position[1] - settled.restY) > 0.04) {
    failures.push(`${label}:fall-move-settle-retire`);
  }
}

function validateCrackControl(control, expected, label, failures) {
  exactKeys(control, [
    'id', 'scopeId', 'mode', 'role', 'arenaId', 'paneId', 'actorId', 'matchEpoch',
    'impactNonce', 'impactId', 'accepted', 'before', 'cracked', 'reset',
  ], label, failures);
  const expectedRole = expected.mode === 'solo' ? 'offline' : 'host';
  if (control?.id !== `${expected.scopeId}/${expected.mode}/${expectedRole}/${expected.arenaId}/${expected.paneId}`
    || control?.scopeId !== expected.scopeId || control?.mode !== expected.mode
    || control?.role !== expectedRole || control?.arenaId !== expected.arenaId
    || control?.paneId !== expected.paneId || control?.actorId !== expected.actorId
    || control?.matchEpoch !== expected.matchEpoch || !Number.isSafeInteger(control?.impactNonce)
    || control.impactNonce < 0
    || control?.impactId !== `hf304-crack:${expected.actorId}:${control.impactNonce}:${expected.paneId}`
    || control?.accepted !== true) {
    failures.push(`${label}:crack-control-identity`);
  }
  const expectedProjections = [
    ['before', INTACT_PROJECTION],
    ['cracked', {
      phase: 'cracked', paneVisible: true, crackOverlayVisible: true, apertureOpen: false,
      movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
    }],
    ['reset', INTACT_PROJECTION],
  ];
  for (const [phase, projection] of expectedProjections) {
    exactKeys(control?.[phase], [
      'schemaVersion', 'paneStateId', 'matchEpoch', 'revision', 'damageQ',
      'lastMutationTick', 'breachRevision', 'breachTick', 'rememberedImpactIds',
      'phase', 'paneVisible', 'crackOverlayVisible', 'apertureOpen', 'movementSolid',
      'ballisticSolid', 'aiLineOfSightSolid', 'colliderPresent',
    ], `${label}:${phase}`, failures);
    const intact = phase !== 'cracked';
    const snapshot = control?.[phase];
    const stateMatches = snapshot?.schemaVersion === 1
      && snapshot?.paneStateId === expected.paneId
      && snapshot?.matchEpoch === expected.matchEpoch
      && snapshot?.revision === (intact ? 0 : 1)
      && snapshot?.damageQ === (intact ? 0 : 350)
      && Number.isSafeInteger(snapshot?.lastMutationTick) && snapshot.lastMutationTick >= 0
      && (!intact || snapshot.lastMutationTick === 0)
      && snapshot?.breachRevision === null && snapshot?.breachTick === null
      && same(snapshot?.rememberedImpactIds, intact ? [] : [control?.impactId]);
    const observedProjection = Object.fromEntries([
      'phase', 'paneVisible', 'crackOverlayVisible', 'apertureOpen',
      'movementSolid', 'ballisticSolid', 'aiLineOfSightSolid', 'colliderPresent',
    ].map((key) => [key, snapshot?.[key]]));
    if (!stateMatches || !same(observedProjection, { ...projection, colliderPresent: true })) {
      failures.push(`${label}:${phase}:crack-collider-projection`);
    }
  }
}

function validatePngVisual(visual, expected, label, failures) {
  exactKeys(visual, [
    'id', 'scopeId', 'mode', 'phase', 'arenaId', 'paneId', 'role', 'path',
    'mimeType', 'width', 'height', 'bytes', 'sha256', 'dataUrl',
  ], label, failures);
  const expectedPaneId = PASS71_HF304_LIVE_HOSTED_ARENAS
    .find((arena) => arena.id === 'atomic-acres')?.paneIds[0];
  const expectedPath = `artifacts/pass71/hf304-live-hosted/components/${expected.scopeId.replace('/', '-')}/${expected.mode}-${expected.phase}.png`;
  if (visual?.id !== `${expected.scopeId}/${expected.mode}/${expected.phase}`
    || visual?.scopeId !== expected.scopeId || visual?.mode !== expected.mode
    || visual?.phase !== expected.phase || visual?.arenaId !== 'atomic-acres'
    || visual?.paneId !== expectedPaneId
    || visual?.role !== (expected.mode === 'solo' ? 'offline' : 'guest')
    || visual?.mimeType !== 'image/png'
    || visual?.width !== PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH
    || visual?.height !== PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT
    || !Number.isSafeInteger(visual?.bytes) || visual.bytes < 128
    || visual.bytes > PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES || !SHA256.test(visual?.sha256 ?? '')
    || visual?.path !== expectedPath
    || typeof visual?.dataUrl !== 'string' || !visual.dataUrl.startsWith('data:image/png;base64,')) {
    failures.push(`${label}:lossless-visual-identity`);
    return;
  }
  let bytes;
  try { bytes = Buffer.from(visual.dataUrl.slice('data:image/png;base64,'.length), 'base64'); } catch { bytes = Buffer.alloc(0); }
  if (bytes.length !== visual.bytes || sha256(bytes) !== visual.sha256
    || visual.dataUrl !== `data:image/png;base64,${bytes.toString('base64')}`
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.length < 24 || bytes.readUInt32BE(16) !== visual.width || bytes.readUInt32BE(20) !== visual.height) {
    failures.push(`${label}:embedded-png-digest`);
  }
}

function validateComponent(component, scope, record, label, failures) {
  exactKeys(component, [
    'schemaVersion', 'contract', 'status', 'scope', 'startedAt', 'completedAt', 'servedCandidate',
    'browser', 'runtime', 'peerServer', 'catalog', 'sessions', 'soloCells', 'hostedCells',
    'matrixDigestSha256', 'crackControls', 'crackDigestSha256', 'debrisTrails',
    'debrisDigestSha256', 'visuals', 'visualDigestSha256', 'faults',
  ], label, failures);
  if (component?.schemaVersion !== 1
    || component?.contract !== 'atomic-acres/pass71-hf304-live-hosted-component@1'
    || component?.status !== 'passed' || !same(component?.scope, scope)
    || !iso(component?.startedAt) || !iso(component?.completedAt)
    || Date.parse(component.startedAt) > Date.parse(component.completedAt)) failures.push(`${label}:component-identity`);
  validateServedCandidate(component?.servedCandidate, record.source?.expectedSourceSha, `${label}:served`, failures);
  exactKeys(component?.browser, ['channel', 'installed', 'version', 'userAgent', 'sessionNonce'], `${label}:browser`, failures);
  if (component?.browser?.channel !== 'msedge' || component?.browser?.installed !== true
    || component?.browser?.version !== record.browser?.productVersion
    || !String(component?.browser?.userAgent ?? '').includes(`Edg/${record.browser?.productVersion}`)
    || typeof component?.browser?.sessionNonce !== 'string' || component.browser.sessionNonce.length < 16) {
    failures.push(`${label}:installed-edge-session`);
  }
  validateRuntime(component?.runtime, scope, `${label}:runtime`, failures);
  exactKeys(component?.peerServer, ['host', 'port', 'path', 'localOnly', 'processId'], `${label}:peer`, failures);
  if (component?.peerServer?.host !== '127.0.0.1' || component?.peerServer?.localOnly !== true
    || !Number.isSafeInteger(component?.peerServer?.port) || component.peerServer.port < 1_024
    || !OWNED_PEER_PATH.test(component?.peerServer?.path ?? '')
    || !Number.isSafeInteger(component?.peerServer?.processId) || component.peerServer.processId < 1) {
    failures.push(`${label}:owned-peer-server`);
  }
  const peerIdentity = {
    host: component?.peerServer?.host,
    port: component?.peerServer?.port,
    path: component?.peerServer?.path,
    localOnly: component?.peerServer?.localOnly,
  };
  const expectedCatalog = {
    arenas: PASS71_HF304_LIVE_HOSTED_ARENAS,
    panes: PASS71_HF304_LIVE_HOSTED_PANES,
    weapons: PASS71_HF304_LIVE_HOSTED_WEAPONS,
    fireKinds: PASS71_HF304_LIVE_HOSTED_FIRE_KINDS,
  };
  if (!same(component?.catalog, expectedCatalog)) failures.push(`${label}:canonical-catalog`);
  if (!Array.isArray(component?.sessions) || component.sessions.length !== 2
    || !same(component.sessions.map((session) => session.arenaId), ['atomic-acres', 'skyline-terminal'])) {
    failures.push(`${label}:arena-sessions`);
  } else {
    for (const session of component.sessions) {
      exactKeys(session, ['arenaId', 'solo', 'hosted'], `${label}:session:${session.arenaId}`, failures);
      exactKeys(session.solo, ['actorId', 'networkRole', 'runtime'], `${label}:session:${session.arenaId}:solo`, failures);
      exactKeys(session.hosted, [
        'hostId', 'guestId', 'hostNetworkRole', 'guestNetworkRole', 'roomCodeSha256',
        'hostRuntime', 'guestRuntime',
      ], `${label}:session:${session.arenaId}:hosted`, failures);
      if (typeof session.solo?.actorId !== 'string' || session.solo.actorId.length < 1
        || session.solo?.networkRole !== 'offline' || typeof session.hosted?.hostId !== 'string'
        || typeof session.hosted?.guestId !== 'string' || session.hosted.hostId === session.hosted.guestId
        || session.hosted?.hostNetworkRole !== 'host' || session.hosted?.guestNetworkRole !== 'client'
        || !SHA256.test(session.hosted?.roomCodeSha256 ?? '')) failures.push(`${label}:session:${session.arenaId}:identity`);
      validateRuntime(session.solo?.runtime, scope, `${label}:session:${session.arenaId}:solo-runtime`, failures);
      validateRuntime(session.hosted?.hostRuntime, scope, `${label}:session:${session.arenaId}:host-runtime`, failures);
      validateRuntime(session.hosted?.guestRuntime, scope, `${label}:session:${session.arenaId}:guest-runtime`, failures);
    }
  }
  const expectedCells = [];
  for (const pane of PASS71_HF304_LIVE_HOSTED_PANES) {
    const paneIndex = PASS71_HF304_LIVE_HOSTED_ARENAS.find(({ id }) => id === pane.arenaId)?.paneIds.indexOf(pane.paneId) ?? -1;
    for (const weaponId of PASS71_HF304_LIVE_HOSTED_WEAPONS) expectedCells.push({ ...pane, paneIndex, weaponId });
  }
  for (const mode of PASS71_HF304_LIVE_HOSTED_MODES) {
    const cells = component?.[`${mode}Cells`];
    if (!Array.isArray(cells) || cells.length !== 240) {
      failures.push(`${label}:${mode}:cell-count`);
      continue;
    }
    for (const [index, expected] of expectedCells.entries()) validateCell(cells[index], {
      ...expected, scopeId: scope.id, mode,
    }, component.sessions, peerIdentity, `${label}:${mode}:${index}`, failures);
  }
  if (component?.matrixDigestSha256 !== sha256(Buffer.from(`${canonicalJson({
    solo: component?.soloCells, hosted: component?.hostedCells,
  })}\n`, 'utf8'))) failures.push(`${label}:matrix-digest`);
  const expectedCrackControls = PASS71_HF304_LIVE_HOSTED_MODES.flatMap((mode) => (
    PASS71_HF304_LIVE_HOSTED_PANES.map((pane) => {
      const session = component.sessions?.find((entry) => entry.arenaId === pane.arenaId);
      const actorId = mode === 'solo' ? session?.solo?.actorId : session?.hosted?.hostId;
      const matchingCell = component?.[`${mode}Cells`]?.find((cell) => cell.arenaId === pane.arenaId);
      return { ...pane, mode, scopeId: scope.id, actorId, matchEpoch: matchingCell?.actor?.matchEpoch };
    })
  ));
  if (!Array.isArray(component?.crackControls)
    || component.crackControls.length !== PASS71_HF304_LIVE_HOSTED_CRACK_CONTROLS_PER_SCOPE) {
    failures.push(`${label}:crack-control-count`);
  } else for (const [index, expected] of expectedCrackControls.entries()) {
    validateCrackControl(component.crackControls[index], expected, `${label}:crack:${index}`, failures);
  }
  if (component?.crackDigestSha256 !== sha256(Buffer.from(`${canonicalJson(component?.crackControls)}\n`, 'utf8'))) {
    failures.push(`${label}:crack-digest`);
  }
  const expectedTrails = [];
  for (const mode of PASS71_HF304_LIVE_HOSTED_MODES) {
    for (const role of mode === 'solo' ? ['offline'] : ['host', 'guest']) {
      for (const pane of PASS71_HF304_LIVE_HOSTED_PANES) {
        const session = component.sessions?.find((entry) => entry.arenaId === pane.arenaId);
        const authorityActorId = mode === 'solo' ? session?.solo?.actorId : session?.hosted?.hostId;
        const matchingCell = component?.[`${mode}Cells`]?.find((cell) => cell.arenaId === pane.arenaId);
        expectedTrails.push({ ...pane, mode, role, authorityActorId, matchEpoch: matchingCell?.actor?.matchEpoch });
      }
    }
  }
  if (!Array.isArray(component?.debrisTrails) || component.debrisTrails.length !== 36) {
    failures.push(`${label}:debris-count`);
  } else for (const [index, expected] of expectedTrails.entries()) validateDebrisTrail(
    component.debrisTrails[index], { ...expected, scopeId: scope.id }, `${label}:debris:${index}`, failures,
  );
  if (Array.isArray(component?.debrisTrails)) {
    for (const mode of PASS71_HF304_LIVE_HOSTED_MODES) {
      const expectedRole = mode === 'solo' ? 'offline' : 'host';
      for (const pane of PASS71_HF304_LIVE_HOSTED_PANES) {
        const trail = component.debrisTrails.find((entry) => entry.mode === mode
          && entry.role === expectedRole && entry.arenaId === pane.arenaId && entry.paneId === pane.paneId);
        const carbine = component?.[`${mode}Cells`]?.find((cell) => cell.arenaId === pane.arenaId
          && cell.paneId === pane.paneId && cell.weaponId === 'carbine');
        if (trail?.matchEpoch !== carbine?.actor?.matchEpoch
          || trail?.authorityActorId !== carbine?.actor?.actorId
          || trail?.actionNonce === carbine?.actor?.actionNonce
          || trail?.windowEventNonce === carbine?.actor?.windowEventNonce) {
          failures.push(`${label}:debris:separate-runtime-action-identity`);
        }
      }
    }
    for (const pane of PASS71_HF304_LIVE_HOSTED_PANES) {
      const host = component.debrisTrails.find((trail) => trail.mode === 'hosted'
        && trail.role === 'host' && trail.arenaId === pane.arenaId && trail.paneId === pane.paneId);
      const guest = component.debrisTrails.find((trail) => trail.mode === 'hosted'
        && trail.role === 'guest' && trail.arenaId === pane.arenaId && trail.paneId === pane.paneId);
      if (!same(
        host && [host.authorityActorId, host.matchEpoch, host.actionNonce, host.windowEventNonce],
        guest && [guest.authorityActorId, guest.matchEpoch, guest.actionNonce, guest.windowEventNonce],
      )) failures.push(`${label}:debris:host-guest-action-identity`);
    }
  }
  if (component?.debrisDigestSha256 !== sha256(Buffer.from(`${canonicalJson(component?.debrisTrails)}\n`, 'utf8'))) {
    failures.push(`${label}:debris-digest`);
  }
  const expectedVisuals = PASS71_HF304_LIVE_HOSTED_MODES.flatMap((mode) => (
    ['intact', 'breached'].map((phase) => ({ scopeId: scope.id, mode, phase }))
  ));
  if (!Array.isArray(component?.visuals) || component.visuals.length !== 4) failures.push(`${label}:visual-count`);
  else {
    for (const [index, expected] of expectedVisuals.entries()) validatePngVisual(
      component.visuals[index], expected, `${label}:visual:${index}`, failures,
    );
    for (const mode of PASS71_HF304_LIVE_HOSTED_MODES) {
      const pair = component.visuals.filter((visual) => visual.mode === mode);
      if (pair.length !== 2 || pair[0].sha256 === pair[1].sha256) failures.push(`${label}:visual:${mode}:control-diff`);
    }
  }
  if (component?.visualDigestSha256 !== sha256(Buffer.from(`${canonicalJson(component?.visuals)}\n`, 'utf8'))) {
    failures.push(`${label}:visual-digest`);
  }
  if (!Array.isArray(component?.faults) || component.faults.length !== 0) failures.push(`${label}:faults`);
}

export function pass71Hf304LiveHostedEvidenceFailures(record, expected = {}) {
  const failures = [];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'closingAuthority', 'ownerSubjectiveApproval', 'startedAt', 'completedAt', 'source', 'environment',
    'browser', 'coverage', 'tooling', 'components', 'faults', 'unknowns', 'receiptSha256',
  ], 'record', failures);
  if (!object(record)) return failures;
  for (const [key, value] of Object.entries(PASS71_HF304_LIVE_HOSTED_EVIDENCE)) {
    if (record[key] !== value) failures.push(`record:${key}`);
  }
  if (!iso(record.startedAt) || !iso(record.completedAt) || Date.parse(record.startedAt) > Date.parse(record.completedAt)) {
    failures.push('record:timestamps');
  }
  exactKeys(record.source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!SHA40.test(record.source?.expectedSourceSha ?? '')
    || record.source.expectedSourceSha !== expected.sourceSha
    || record.source.checkoutSourceSha !== expected.sourceSha
    || record.source.endingCheckoutSourceSha !== expected.sourceSha
    || !SHA40.test(record.source?.sourceTreeSha ?? '') || record.source.sourceTreeSha !== expected.sourceTreeSha
    || record.source.releasePass !== 'PASS 71' || record.source.cleanBefore !== true || record.source.cleanAfter !== true) {
    failures.push('exact-clean-candidate-a-source');
  }
  exactKeys(record.environment, ['machine', 'hostnameSha256', 'platform', 'arch'], 'environment', failures);
  if (!same(record.environment, {
    machine: 'dave-gaming-pc',
    hostnameSha256: PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256,
    platform: 'win32',
    arch: 'x64',
  })) {
    failures.push('exact-machine-environment');
  }
  exactKeys(record.browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'productVersion', 'installRoot',
    'authenticodeStatus', 'authenticodeSigner', 'processIsolation', 'processCount',
  ], 'browser', failures);
  if (record.browser?.channel !== 'msedge' || record.browser?.installed !== true
    || record.browser?.executableName !== 'msedge.exe' || !SHA256.test(record.browser?.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(record.browser?.productVersion ?? '')
    || record.browser?.authenticodeStatus !== 'Valid'
    || !/Microsoft Corporation/iu.test(record.browser?.authenticodeSigner ?? '')
    || record.browser?.processIsolation !== 'fresh-owned-installed-edge-process-and-profile-per-scope'
    || record.browser?.processCount !== 4) failures.push('installed-signed-edge-identity');
  const expectedCoverage = {
    scopes: PASS71_HF304_LIVE_HOSTED_SCOPES,
    arenas: PASS71_HF304_LIVE_HOSTED_ARENAS,
    authoredPaneCount: 12,
    weaponCount: 20,
    modes: PASS71_HF304_LIVE_HOSTED_MODES,
    cellsPerScope: 480,
    totalCells: 1_920,
    crackControlsPerScope: 24,
    totalCrackControls: 96,
    debrisTrailsPerScope: 36,
    totalDebrisTrails: 144,
    visualsPerScope: 4,
    totalVisuals: 16,
    authority: 'real-private-runtime-host-canonicalization-and-replica-admission',
    ownerSubjectiveInspectionPerformed: false,
  };
  if (!same(record.coverage, expectedCoverage)) failures.push('literal-closing-coverage');
  if (!same(record.tooling, expected.tooling)
    || !Array.isArray(record.tooling) || record.tooling.length !== PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS.length
    || record.tooling.some((entry, index) => entry?.path !== PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS[index]
      || !SHA256.test(entry?.sha256 ?? ''))) failures.push('exact-source-tooling');
  if (!Array.isArray(record.components) || record.components.length !== 4) failures.push('scope-component-count');
  else {
    for (const [index, scope] of PASS71_HF304_LIVE_HOSTED_SCOPES.entries()) validateComponent(
      record.components[index], scope, record, `component:${scope.id}`, failures,
    );
    if (new Set(record.components.map((component) => component.browser?.sessionNonce)).size !== 4) {
      failures.push('fresh-edge-profile-per-scope');
    }
    if (new Set(record.components.map((component) => component.peerServer?.port)).size !== 4
      || new Set(record.components.map((component) => component.peerServer?.path)).size !== 4
      || new Set(record.components.map((component) => component.peerServer?.processId)).size !== 4) {
      failures.push('fresh-owned-peer-per-scope');
    }
    const nonces = record.components.flatMap((component) => (
      ['soloCells', 'hostedCells'].flatMap((key) => (
        (component?.[key] ?? []).flatMap((cell) => [cell?.actor?.actionNonce, cell?.actor?.windowEventNonce])
      ))
    ));
    if (nonces.length !== PASS71_HF304_LIVE_HOSTED_TOTAL_CELL_COUNT * 2
      || !nonces.every((nonce) => Number.isSafeInteger(nonce) && nonce >= 0)
      || new Set(nonces).size !== nonces.length) failures.push('global-action-event-nonce-identity');
    const crackNonces = record.components.flatMap((component) => (
      (component?.crackControls ?? []).map((control) => control?.impactNonce)
    ));
    if (crackNonces.length !== PASS71_HF304_LIVE_HOSTED_TOTAL_CRACK_CONTROLS
      || !crackNonces.every((nonce) => Number.isSafeInteger(nonce) && nonce >= 0)
      || new Set([...nonces, ...crackNonces]).size !== nonces.length + crackNonces.length) {
      failures.push('global-crack-impact-nonce-identity');
    }
    const debrisNonces = record.components.flatMap((component) => (
      (component?.debrisTrails ?? []).filter((trail) => trail?.role !== 'guest')
        .flatMap((trail) => [trail?.actionNonce, trail?.windowEventNonce])
    ));
    if (debrisNonces.length !== PASS71_HF304_LIVE_HOSTED_SCOPES.length * 24 * 2
      || !debrisNonces.every((nonce) => Number.isSafeInteger(nonce) && nonce >= 0)
      || new Set([...nonces, ...crackNonces, ...debrisNonces]).size
        !== nonces.length + crackNonces.length + debrisNonces.length) {
      failures.push('global-debris-action-event-nonce-identity');
    }
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('record:faults');
  if (!same(record.unknowns, ['owner-subjective-inspection-not-performed'])) failures.push('record:unknowns');
  if (Buffer.byteLength(JSON.stringify(record, null, 2), 'utf8') > PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES) {
    failures.push('record:encoded-byte-cap');
  }
  if (!SHA256.test(record.receiptSha256 ?? '') || record.receiptSha256 !== pass71Hf304LiveHostedRecordSha256(record)) {
    failures.push('receipt-digest');
  }
  return [...new Set(failures)];
}

export function assertPass71Hf304LiveHostedEvidence(record, expected) {
  const failures = pass71Hf304LiveHostedEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`HF-304 live hosted evidence failed:\n${failures.join('\n')}`);
  return record;
}

export function createPass71Hf304LiveHostedEvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF304_LIVE_HOSTED_DESCRIPTOR,
    closesFeedback: true,
    ownerSubjectiveApproval: 'not-claimed',
    validate(record, context = {}) {
      return pass71Hf304LiveHostedEvidenceFailures(record, {
        sourceSha: context.sourceSha,
        sourceTreeSha: context.options?.pass71Hf304LiveHostedSourceTreeSha,
        tooling: context.options?.pass71Hf304LiveHostedTooling,
      });
    },
  });
}

export const PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY =
  createPass71Hf304LiveHostedEvidenceRegistryEntry();

const FIXTURE_PNGS = Object.freeze([
  'iVBORw0KGgoAAAANSUhEUgAAAMAAAACQCAIAAADRMPOnAAABeUlEQVR4nO3SQQkAIADAQDOYxSz2j2IH9xDh4ALssTHXhmvjeQFfMxCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiOQAAafT0O62t+EAAAAASUVORK5CYII=',
  'iVBORw0KGgoAAAANSUhEUgAAAMAAAACQCAIAAADRMPOnAAABeElEQVR4nO3SQQkAIADAQFOYw5AGt4N7iHBwAfbY2GvCtfG8gK8ZiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEImBSAxEYiASA5EYiMRAJAYiMRCJgUgMRGIgEgORGIjEQCQGIjEQiYFIDERiIBIDkRiIxEAkBiIxEcgDv3zz8a1SRKQAAAABJRU5ErkJggg==',
]);

function fixturePane(paneId, weaponId, intact = false, impactId = `impact:${weaponId}`) {
  const projection = intact ? INTACT_PROJECTION : expectedProjection(weaponId);
  return {
    paneId,
    state: {
      schemaVersion: 1, paneId, matchEpoch: 71, revision: intact ? 0 : 1,
      phase: projection.phase, damageQ: intact ? 0 : weaponId === 'explosive-crossbow' ? 2_000 : 1_000,
      lastMutationTick: intact ? 0 : 1, breachRevision: intact ? null : 1,
      breachTick: intact ? null : 1, rememberedImpactIds: intact ? [] : [impactId],
    },
    projection,
    meshVisible: projection.paneVisible,
    broken: projection.apertureOpen,
    activeWorldColliderPresent: projection.movementSolid,
    persistentDebrisId: intact ? null : `window-debris:${paneId}`,
  };
}

function fixtureCell(scope, mode, pane, paneIndex, weaponId, index) {
  const actionNonce = 304_000_000
    + PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope) * 1_000_000
    + index * 2;
  const windowEventNonce = actionNonce + 1;
  const hostId = `host-${pane.arenaId}`;
  const guestId = `guest-${pane.arenaId}`;
  const projectile = weaponId === 'flare-gun' || weaponId === 'explosive-crossbow';
  const actorId = mode === 'solo' ? `solo-${pane.arenaId}` : hostId;
  const impactId = `${expectedPolicy(weaponId).profile}:${actorId}:${windowEventNonce}:0`;
  return {
    id: `${scope.id}/${mode}/${pane.arenaId}/${pane.paneId}/${weaponId}`,
    scopeId: scope.id, mode, arenaId: pane.arenaId, paneId: pane.paneId, paneIndex,
    weaponId, fireKind: PASS71_HF304_LIVE_HOSTED_FIRE_KINDS[PASS71_HF304_LIVE_HOSTED_WEAPONS.indexOf(weaponId)],
    policy: expectedPolicy(weaponId),
    actor: {
      role: mode === 'solo' ? 'offline' : 'host',
      actorId,
      hostId: mode === 'solo' ? null : hostId,
      guestId: mode === 'solo' ? null : guestId,
      matchEpoch: 71, actionNonce, windowEventNonce,
    },
    spatial: {
      playerPosition: [0, 1.7, 4], cameraDirection: [0, 0, -1],
      actionOrigin: [0, 1.7, 4], actionDirection: [0, 0, -1],
      guestObservedHostPosition: mode === 'solo' ? null : [0, 1.7, 4],
    },
    authority: {
      accepted: true,
      hostBefore: fixturePane(pane.paneId, weaponId, true),
      hostAfter: fixturePane(pane.paneId, weaponId, false, impactId),
      hostColliderRetired: true,
      guestActionIdentity: mode === 'solo' ? null : {
        by: hostId, weapon: weaponId, nonce: actionNonce, matchEpoch: 71, paneAdmitted: projectile,
      },
      guestWindowEventIdentity: mode === 'solo' ? null : {
        nonce: windowEventNonce, processed: true,
      },
      guestAfter: mode === 'solo' ? null : fixturePane(pane.paneId, weaponId, false, impactId),
      localMutationTicks: mode === 'solo' ? null : { host: 1, guest: 1 },
    },
    protocol: mode === 'solo' ? null : {
      protocolVersion: 20,
      ownedPeer: { host: '127.0.0.1', port: 4_600 + PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope), path: `/peerjs-${String(PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope) + 1).repeat(24)}`, localOnly: true },
      hostNetworkRole: 'host', guestNetworkRole: 'client',
      action: { by: hostId, weapon: weaponId, nonce: actionNonce, decoded: true, guestLedgerCurrent: true },
      windowEvent: {
        by: hostId, nonce: windowEventNonce, kind: 'shot', wireWeapon: projectile ? weaponId : null,
        actionNonce: projectile ? actionNonce : null, hostAuthorityId: hostId, decoded: true, guestProcessed: true,
      },
    },
  };
}

function fixtureTrail(scope, mode, role, pane, index) {
  const sourceIndex = PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope);
  const actionNonce = 304_750_000 + sourceIndex * 1_000_000 + index * 2;
  return {
    id: `${scope.id}/${mode}/${role}/${pane.arenaId}/${pane.paneId}`,
    scopeId: scope.id, mode, role, arenaId: pane.arenaId, paneId: pane.paneId,
    authorityActorId: `${mode === 'solo' ? 'solo' : 'host'}-${pane.arenaId}`,
    matchEpoch: 71, actionNonce, windowEventNonce: actionNonce + 1,
    motionOwner: 'rapier-major-body',
    samples: [
      { phase: 'spawned', present: true, visible: true, physical: true, physicsActive: true, fallbackSettled: false, restY: 0, position: [0, 2, 0] },
      { phase: 'moving', present: true, visible: true, physical: true, physicsActive: true, fallbackSettled: false, restY: 0, position: [0.05, 1.8, 0.05] },
      { phase: 'settled', present: true, visible: true, physical: false, physicsActive: false, fallbackSettled: true, restY: 0, position: [0.3, 0, 0.2] },
      { phase: 'retired', present: false, visible: false, physical: false, physicsActive: false, fallbackSettled: false, restY: null, position: null },
    ],
    minimumVerticalFallM: 0.2, minimumDisplacementM: 0.212,
    supportContact: true, colliderRetired: true, unsupportedSuspension: false,
    duplicateDebris: false, bodyCountBounded: true,
  };
}

function fixtureCrackControl(scope, mode, pane, index) {
  const role = mode === 'solo' ? 'offline' : 'host';
  const actorId = `${mode === 'solo' ? 'solo' : 'host'}-${pane.arenaId}`;
  const impactNonce = 304_500_000 + PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope) * 1_000_000 + index;
  const impactId = `hf304-crack:${actorId}:${impactNonce}:${pane.paneId}`;
  const projection = (value, cracked = false) => ({
    schemaVersion: 1, paneStateId: pane.paneId, matchEpoch: 71,
    revision: cracked ? 1 : 0, damageQ: cracked ? 350 : 0,
    lastMutationTick: cracked ? 1 : 0, breachRevision: null, breachTick: null,
    rememberedImpactIds: cracked ? [impactId] : [],
    ...value, colliderPresent: true,
  });
  return {
    id: `${scope.id}/${mode}/${role}/${pane.arenaId}/${pane.paneId}`,
    scopeId: scope.id, mode, role, arenaId: pane.arenaId, paneId: pane.paneId,
    actorId, matchEpoch: 71, impactNonce, impactId,
    accepted: true,
    before: projection(INTACT_PROJECTION),
    cracked: projection({
      phase: 'cracked', paneVisible: true, crackOverlayVisible: true, apertureOpen: false,
      movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
    }, true),
    reset: projection(INTACT_PROJECTION),
  };
}

function fixtureVisual(scope, mode, phase, index) {
  const bytes = Buffer.from(FIXTURE_PNGS[index % FIXTURE_PNGS.length], 'base64');
  const base64 = bytes.toString('base64');
  return {
    id: `${scope.id}/${mode}/${phase}`, scopeId: scope.id, mode, phase,
    arenaId: 'atomic-acres', paneId: PASS71_HF304_LIVE_HOSTED_PANES[0].paneId,
    role: mode === 'solo' ? 'offline' : 'guest',
    path: `artifacts/pass71/hf304-live-hosted/components/${scope.id.replace('/', '-')}/${mode}-${phase}.png`,
    mimeType: 'image/png', width: PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH,
    height: PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT, bytes: bytes.length, sha256: sha256(bytes),
    dataUrl: `data:image/png;base64,${base64}`,
  };
}

function fixtureRuntime(scope) {
  return {
    requestedBackend: scope.renderer, actualBackend: scope.renderer, initialized: true,
    adapterClass: scope.renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
    deviceClass: scope.renderer === 'webgpu' ? 'GPUDevice' : null,
    adapterLabel: 'NVIDIA GeForce RTX 5080', softwareAdapter: false, deviceLost: false,
    uncapturedErrors: 0, presentationStatus: scope.renderer === 'webgpu' ? 'healthy' : 'synchronous',
  };
}

function fixtureComponent(scope, sourceSha, productVersion) {
  const sourceIndex = PASS71_HF304_LIVE_HOSTED_SCOPES.indexOf(scope);
  const servedCandidate = {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
    path: 'channels/the-big-one', treeSha256: 'c'.repeat(64), exactRootFileCount: 300,
  };
  const sessions = PASS71_HF304_LIVE_HOSTED_ARENAS.filter((arena) => arena.paneIds.length > 0).map((arena) => ({
    arenaId: arena.id,
    solo: { actorId: `solo-${arena.id}`, networkRole: 'offline', runtime: fixtureRuntime(scope) },
    hosted: {
      hostId: `host-${arena.id}`, guestId: `guest-${arena.id}`,
      hostNetworkRole: 'host', guestNetworkRole: 'client', roomCodeSha256: 'd'.repeat(64),
      hostRuntime: fixtureRuntime(scope), guestRuntime: fixtureRuntime(scope),
    },
  }));
  const cells = [];
  let index = 0;
  for (const pane of PASS71_HF304_LIVE_HOSTED_PANES) {
    const paneIndex = PASS71_HF304_LIVE_HOSTED_ARENAS.find(({ id }) => id === pane.arenaId).paneIds.indexOf(pane.paneId);
    for (const weapon of PASS71_HF304_LIVE_HOSTED_WEAPONS) cells.push({ pane, paneIndex, weapon, index: index++ });
  }
  const soloCells = cells.map((entry) => fixtureCell(scope, 'solo', entry.pane, entry.paneIndex, entry.weapon, entry.index));
  const hostedCells = cells.map((entry) => fixtureCell(scope, 'hosted', entry.pane, entry.paneIndex, entry.weapon, entry.index + 240));
  let crackIndex = 0;
  const crackControls = PASS71_HF304_LIVE_HOSTED_MODES.flatMap((mode) => (
    PASS71_HF304_LIVE_HOSTED_PANES.map((pane) => fixtureCrackControl(scope, mode, pane, crackIndex++))
  ));
  const debrisTrails = PASS71_HF304_LIVE_HOSTED_MODES.flatMap((mode) => (
    (mode === 'solo' ? ['offline'] : ['host', 'guest']).flatMap((role) => (
      PASS71_HF304_LIVE_HOSTED_PANES.map((pane, paneIndex) => fixtureTrail(
        scope, mode, role, pane, (mode === 'solo' ? 0 : 12) + paneIndex,
      ))
    ))
  ));
  const visuals = PASS71_HF304_LIVE_HOSTED_MODES.flatMap((mode) => (
    ['intact', 'breached'].map((phase, visualIndex) => fixtureVisual(scope, mode, phase, visualIndex))
  ));
  return {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf304-live-hosted-component@1',
    status: 'passed', scope, startedAt: '2026-08-13T09:00:00.000Z', completedAt: '2026-08-13T09:10:00.000Z',
    servedCandidate,
    browser: { channel: 'msedge', installed: true, version: productVersion, userAgent: `Mozilla/5.0 Edg/${productVersion}`, sessionNonce: `scope-session-${sourceIndex}-aaaaaaaa` },
    runtime: fixtureRuntime(scope),
    peerServer: { host: '127.0.0.1', port: 4_600 + sourceIndex, path: `/peerjs-${String(sourceIndex + 1).repeat(24)}`, localOnly: true, processId: 10_000 + sourceIndex },
    catalog: {
      arenas: PASS71_HF304_LIVE_HOSTED_ARENAS, panes: PASS71_HF304_LIVE_HOSTED_PANES,
      weapons: PASS71_HF304_LIVE_HOSTED_WEAPONS, fireKinds: PASS71_HF304_LIVE_HOSTED_FIRE_KINDS,
    },
    sessions, soloCells, hostedCells,
    matrixDigestSha256: sha256(Buffer.from(`${canonicalJson({ solo: soloCells, hosted: hostedCells })}\n`, 'utf8')),
    crackControls,
    crackDigestSha256: sha256(Buffer.from(`${canonicalJson(crackControls)}\n`, 'utf8')),
    debrisTrails,
    debrisDigestSha256: sha256(Buffer.from(`${canonicalJson(debrisTrails)}\n`, 'utf8')),
    visuals,
    visualDigestSha256: sha256(Buffer.from(`${canonicalJson(visuals)}\n`, 'utf8')),
    faults: [],
  };
}

export function createPass71Hf304LiveHostedEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'b'.repeat(40);
  const productVersion = options.productVersion ?? '150.0.4100.1';
  const tooling = options.tooling ?? PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS.map((path, index) => ({
    path, sha256: String((index % 9) + 1).repeat(64),
  }));
  const record = {
    ...PASS71_HF304_LIVE_HOSTED_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T09:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T10:00:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      sourceTreeSha, releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true,
    },
    environment: {
      machine: 'dave-gaming-pc',
      hostnameSha256: PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256,
      platform: 'win32', arch: 'x64',
    },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'e'.repeat(64),
      productVersion, installRoot: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
      authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Microsoft Corporation',
      processIsolation: 'fresh-owned-installed-edge-process-and-profile-per-scope', processCount: 4,
    },
    coverage: {
      scopes: PASS71_HF304_LIVE_HOSTED_SCOPES, arenas: PASS71_HF304_LIVE_HOSTED_ARENAS,
      authoredPaneCount: 12, weaponCount: 20, modes: PASS71_HF304_LIVE_HOSTED_MODES,
      cellsPerScope: 480, totalCells: 1_920, crackControlsPerScope: 24, totalCrackControls: 96,
      debrisTrailsPerScope: 36, totalDebrisTrails: 144,
      visualsPerScope: 4, totalVisuals: 16,
      authority: 'real-private-runtime-host-canonicalization-and-replica-admission',
      ownerSubjectiveInspectionPerformed: false,
    },
    tooling,
    components: PASS71_HF304_LIVE_HOSTED_SCOPES.map((scope) => fixtureComponent(scope, sourceSha, productVersion)),
    faults: [],
    unknowns: ['owner-subjective-inspection-not-performed'],
  };
  record.receiptSha256 = pass71Hf304LiveHostedRecordSha256(record);
  return record;
}
