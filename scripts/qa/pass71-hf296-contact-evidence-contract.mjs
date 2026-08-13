import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PASS71_HF296_CONTACT_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-296',
  kind: 'pass71-hf296-player-viewmodel-contact-component',
  contract: 'atomic-acres/pass71-hf296-player-viewmodel-contact-component@1',
  feedbackId: 'HF-296',
  status: 'passed',
  coverageDisposition: 'partial-component-evidence',
});

export const PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF296_CONTACT_EVIDENCE.evidenceId,
  kind: PASS71_HF296_CONTACT_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF296_WEAPONS = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'pistol', 'machine-pistol', 'magnum', 'flashlight-pistol', 'explosive-crossbow',
  'railgun', 'flamethrower', 'flare-gun',
]);

export const PASS71_HF296_CONTACT_COVERAGE = Object.freeze({
  bodyAuthority: Object.freeze({
    evidence: 'shipped-rapier-character-controller-signed-contact',
    arenaIds: Object.freeze(['atomic-acres']),
    stances: Object.freeze(['stand', 'crouch', 'prone']),
    fixtureKinds: Object.freeze(['floor', 'wall', 'corner', 'doorjamb']),
    matrixCells: 12,
    presentationActions: Object.freeze([]),
    roles: Object.freeze([]),
    renderers: Object.freeze([]),
  }),
  liveProneContact: Object.freeze({
    evidence: 'installed-edge-owned-staged-browser-contact',
    arenaIds: Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']),
    renderProfiles: Object.freeze(['performance', 'blender', 'compat']),
    renderers: Object.freeze(['webgl2', 'webgpu']),
    stances: Object.freeze(['prone']),
    soloActions: Object.freeze(['hip', 'ads', 'fire', 'reload', 'melee']),
    soloWeapon: 'm4a1',
    soloMeleePresentation: 'field-knife',
    soloCells: 24,
    hostedActions: Object.freeze(['hip']),
    hostedRoles: Object.freeze(['host-local', 'guest-local', 'host-saw-guest', 'guest-saw-host']),
    hostedWeapon: 'm4a1',
    hostedCells: 24,
  }),
  authoredNearPlane: Object.freeze({
    evidence: 'installed-edge-owned-staged-all-weapon-contact-catalog',
    arenaIds: Object.freeze(['gun-range']),
    renderProfiles: Object.freeze(['blender']),
    renderers: Object.freeze(['webgl2', 'webgpu']),
    stances: Object.freeze(['prone']),
    roles: Object.freeze(['solo']),
    weapons: PASS71_HF296_WEAPONS,
    actions: Object.freeze(['hip', 'ads', 'fire-kick', 'reload']),
    fireKickAgesMs: Object.freeze([0, 4, 8, 12, 16, 24, 36, 52, 78, 105, 150, 225, 310]),
    reloadProgressSamples: Object.freeze([0.08, 0.22, 0.38, 0.52, 0.68, 0.84]),
    weaponRendererCells: 40,
    losslessPngAttachments: 40,
  }),
  viewportPresentation: Object.freeze({
    evidence: 'installed-chrome-direct-source-viewmodel-framing',
    arenaIds: Object.freeze(['gun-range']),
    renderProfiles: Object.freeze(['blender']),
    renderers: Object.freeze(['webgl2']),
    stances: Object.freeze(['stand', 'prone']),
    weapons: Object.freeze(['m4a1', 'field-knife']),
    viewports: Object.freeze(['1440p', '4k', 'ultrawide-1440p']),
    actions: Object.freeze(['hip', 'ads', 'reload', 'melee', 'prone-wall-floor']),
    stagedTopology: false,
    losslessPngAttachments: 2,
  }),
  composition: Object.freeze({
    fullCartesianClaim: false,
    cameraMuzzleProjectileHitIdentityFrozen: false,
    ownerVisualInspectionPerformed: false,
    automatedPixelOcclusionJudgmentPerformed: false,
  }),
  knownUnknowns: Object.freeze([
    'standing-and-crouched rendered wall-floor contact is not crossed with every arena, renderer, profile, role, weapon and action',
    'the all-weapon rendered catalog is one Gun Range prone solo fixture rather than every arena, stance, profile and network role',
    'rendered corner and door-return separation is not captured; those fixture kinds are body-authority unit evidence only',
    'the composed browser receipts do not freeze camera, muzzle, projectile and hit identities through the same contact action',
    'the installed Edge and Chrome executable hashes and Authenticode signers are not recorded by the composed source receipts',
    'the viewport-framing component uses a direct exact-source Vite server rather than the staged release topology',
    'the lossless PNG attachments are mechanically hashed but have not been inspected by Dave or classified by an independent pixel-occlusion judge',
    'manifest registry wiring, exact candidate-A execution and acceptance-manifest embedding remain separate integration steps',
  ]),
});

export const PASS71_HF296_CONTACT_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf296-contact-evidence.mjs',
  contract: 'scripts/qa/pass71-hf296-contact-evidence-contract.mjs',
  contractTest: 'scripts/qa/pass71-hf296-contact-evidence-contract.test.mjs',
  contractTypes: 'scripts/qa/pass71-hf296-contact-evidence-contract.d.mts',
  capsuleTest: 'src/player-capsule-contact.test.ts',
  characterPhysics: 'src/physics.ts',
  arenaMap: 'src/map.ts',
  houseNavigation: 'src/house-navigation.ts',
  interactiveWorld: 'src/interactive-world-runtime.ts',
  proneRunner: 'scripts/qa/run-pass66-prone-contact-matrix.mjs',
  proneSpec: 'tests/e2e/pass66-prone-contact-matrix.spec.ts',
  nearPlaneRunner: 'scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs',
  nearPlaneSpec: 'tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts',
  viewmodelRunner: 'scripts/qa/verify-pass66-viewmodel-framing.mjs',
  viewmodelPresentation: 'src/weapon-presentation.ts',
  viewmodelState: 'src/weapon-presentation-state.ts',
  runtimeComposition: 'src/legacy-main.ts',
  protocol: 'src/protocol.ts',
  e2eSupport: 'tests/e2e/pass66-e2e-support.ts',
  playwrightConfig: 'playwright.config.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  acceptanceGate: 'scripts/release/acceptance-gate.mjs',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
});

export const PASS71_HF296_COMPONENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'rapier-shipped-capsule', kind: 'unit', renderer: null,
    command: 'node node_modules/vitest/vitest.mjs run src/player-capsule-contact.test.ts',
    provenanceMode: 'exact-checkout-shipped-rapier-no-browser', receipt: false,
  }),
  Object.freeze({
    id: 'prone-contact-webgl2', kind: 'browser', renderer: 'webgl2',
    command: 'node scripts/qa/run-pass66-prone-contact-matrix.mjs',
    provenanceMode: 'owned-staged-topology-source-bound-subreceipt-without-served-object', receipt: true,
  }),
  Object.freeze({
    id: 'prone-contact-webgpu', kind: 'browser', renderer: 'webgpu',
    command: 'node scripts/qa/run-pass66-prone-contact-matrix.mjs',
    provenanceMode: 'owned-staged-topology-source-bound-subreceipt-without-served-object', receipt: true,
  }),
  Object.freeze({
    id: 'near-plane-webgl2', kind: 'browser', renderer: 'webgl2',
    command: 'node scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs edge-webgl2',
    provenanceMode: 'owned-staged-topology-source-and-served-candidate-bound', receipt: true,
  }),
  Object.freeze({
    id: 'near-plane-webgpu', kind: 'browser', renderer: 'webgpu',
    command: 'node scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs edge-webgpu',
    provenanceMode: 'owned-staged-topology-source-and-served-candidate-bound', receipt: true,
  }),
  Object.freeze({
    id: 'viewmodel-framing-webgl2', kind: 'browser', renderer: 'webgl2',
    command: 'node scripts/qa/verify-pass66-viewmodel-framing.mjs',
    provenanceMode: 'exact-checkout-direct-vite-not-staged', receipt: true,
  }),
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function sameJson(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...keys].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function pass71Hf296ContactCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-296 evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf296ContactRecordSha256(record) {
  return createHash('sha256').update(pass71Hf296ContactCanonicalBytes(record)).digest('hex');
}

export function pass71Hf296ContactToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF296_CONTACT_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256File(resolve(repositoryRoot, path))],
  )));
}

export function pass71Hf296ContactToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-296 tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF296_CONTACT_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, createHash('sha256').update(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )).digest('hex')],
  )));
}

export function pass71Hf296ContactSourceTreeAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-296 source tree requires a full SHA');
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function expectedVisualIdentities() {
  const entries = [];
  for (const renderer of ['webgl2', 'webgpu']) {
    for (const [index, weapon] of PASS71_HF296_WEAPONS.entries()) {
      const token = `${String(index + 1).padStart(2, '0')}-${weapon}-maximum-contact-fire-kick.png`;
      entries.push({
        componentId: `near-plane-${renderer}`,
        scope: 'all-weapon-maximum-contact-fire-kick',
        renderer,
        weapon,
        label: `${weapon}-maximum-contact-fire-kick`,
        sourceArtifactPath: `artifacts/pass69-3/authored-near-plane-catalog/${renderer}/${token}`,
        path: `artifacts/pass71/hf296-contact-evidence/visual/near-plane/${renderer}/${token}`,
      });
    }
  }
  for (const label of ['contact-sheet', 'temporal-contact-strip']) {
    entries.push({
      componentId: 'viewmodel-framing-webgl2',
      scope: 'm4a1-field-knife-viewport-framing',
      renderer: 'webgl2',
      weapon: 'm4a1-and-field-knife',
      label,
      sourceArtifactPath: `artifacts/pass66/viewmodel-framing/${label}.png`,
      path: `artifacts/pass71/hf296-contact-evidence/visual/viewmodel-framing/${label}.png`,
    });
  }
  return entries;
}

export const PASS71_HF296_VISUAL_IDENTITIES = Object.freeze(
  expectedVisualIdentities().map((entry) => Object.freeze(entry)),
);

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(source.expectedSourceSha ?? '')
    || source.expectedSourceSha !== expected?.sourceSha
    || source.checkoutSourceSha !== expected?.sourceSha
    || source.endingCheckoutSourceSha !== expected?.sourceSha
    || !SHA40.test(source.sourceTreeSha ?? '') || source.sourceTreeSha !== expected?.sourceTreeSha
    || source.releasePass !== 'PASS 71'
    || source.cleanBefore !== true || source.cleanAfter !== true) failures.push('exact-candidate-a-source');
}

function validateServedCandidate(candidate, expected, failures) {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path',
    'exactRootFileCount', 'treeSha256',
  ], 'servedCandidate', failures);
  if (!object(candidate) || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.path !== 'channels/the-big-one'
    || candidate.sourceSha !== expected?.sourceSha
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2
    || !SHA256.test(candidate.treeSha256 ?? '')) failures.push('staged-candidate-provenance');
}

function validateBrowser(browser, definition, failures) {
  if (definition.kind === 'unit') {
    if (browser !== null) failures.push(`${definition.id}:browser-must-be-null`);
    return;
  }
  exactKeys(browser, [
    'channel', 'installedRequested', 'version', 'userAgent', 'executableAttestation',
  ], `${definition.id}:browser`, failures);
  const expectedChannel = definition.id === 'viewmodel-framing-webgl2' ? 'chrome' : 'msedge';
  if (!object(browser) || browser.channel !== expectedChannel || browser.installedRequested !== true
    || typeof browser.version !== 'string' || browser.version.trim() === ''
    || (definition.id.startsWith('near-plane-') && !/Edg\//u.test(browser.userAgent ?? ''))
    || (!definition.id.startsWith('near-plane-') && browser.userAgent !== null)
    || browser.executableAttestation !== 'not-recorded-by-composed-source-receipt') {
    failures.push(`${definition.id}:browser-provenance`);
  }
}

function validateComponents(components, record, failures) {
  if (!Array.isArray(components) || components.length !== PASS71_HF296_COMPONENT_DEFINITIONS.length) {
    failures.push('component-matrix');
    return;
  }
  for (const [index, definition] of PASS71_HF296_COMPONENT_DEFINITIONS.entries()) {
    const component = components[index];
    exactKeys(component, [
      'id', 'kind', 'status', 'command', 'renderer', 'sourceSha', 'provenanceMode',
      'browser', 'receiptPath', 'receiptSha256', 'receiptByteLength', 'servedTreeSha256',
    ], `component:${definition.id}`, failures);
    if (!object(component) || component.id !== definition.id || component.kind !== definition.kind
      || component.status !== 'passed' || component.command !== definition.command
      || component.renderer !== definition.renderer || component.sourceSha !== record.source?.expectedSourceSha
      || component.provenanceMode !== definition.provenanceMode) {
      failures.push(`${definition.id}:identity-or-status`);
      continue;
    }
    validateBrowser(component.browser, definition, failures);
    if (definition.receipt) {
      if (typeof component.receiptPath !== 'string'
        || component.receiptPath !== `artifacts/pass71/hf296-contact-evidence/components/${String(index + 1).padStart(2, '0')}-${definition.id}.json`
        || !SHA256.test(component.receiptSha256 ?? '')
        || !Number.isSafeInteger(component.receiptByteLength) || component.receiptByteLength < 2) {
        failures.push(`${definition.id}:subreceipt`);
      }
    } else if (component.receiptPath !== null || component.receiptSha256 !== null
      || component.receiptByteLength !== null) failures.push(`${definition.id}:unexpected-subreceipt`);
    if (definition.id.startsWith('near-plane-')) {
      if (component.servedTreeSha256 !== record.servedCandidate?.treeSha256) {
        failures.push(`${definition.id}:served-tree`);
      }
    } else if (component.servedTreeSha256 !== null) failures.push(`${definition.id}:unexpected-served-tree`);
  }
}

function validateVisualAttachments(attachments, failures) {
  if (!Array.isArray(attachments) || attachments.length !== PASS71_HF296_VISUAL_IDENTITIES.length) {
    failures.push('visual-attachment-matrix');
    return;
  }
  for (const [index, identity] of PASS71_HF296_VISUAL_IDENTITIES.entries()) {
    const attachment = attachments[index];
    exactKeys(attachment, [
      'componentId', 'scope', 'renderer', 'weapon', 'label', 'sourceArtifactPath', 'path',
      'mimeType', 'encoding', 'copyMode', 'sha256', 'byteLength', 'width', 'height',
    ], `visual:${index}`, failures);
    if (!object(attachment)
      || !sameJson(Object.fromEntries(Object.keys(identity).map((key) => [key, attachment[key]])), identity)
      || attachment.mimeType !== 'image/png' || attachment.encoding !== 'lossless-png'
      || attachment.copyMode !== 'byte-exact'
      || !SHA256.test(attachment.sha256 ?? '')
      || !Number.isSafeInteger(attachment.byteLength) || attachment.byteLength <= 24
      || !Number.isSafeInteger(attachment.width) || attachment.width <= 0
      || !Number.isSafeInteger(attachment.height) || attachment.height <= 0) {
      failures.push(`visual:${index}:identity-or-bytes`);
    }
  }
}

export function pass71Hf296ContactEvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF296_CONTACT_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF296_CONTACT_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF296_CONTACT_EVIDENCE.kind
    || record.contract !== PASS71_HF296_CONTACT_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF296_CONTACT_EVIDENCE.feedbackId
    || record.status !== PASS71_HF296_CONTACT_EVIDENCE.status
    || record.coverageDisposition !== PASS71_HF296_CONTACT_EVIDENCE.coverageDisposition) {
    return ['hf296-identity-or-status'];
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'startedAt', 'completedAt', 'source', 'servedCandidate',
    'environment', 'tooling', 'coverage', 'components', 'visualAttachments', 'faults',
    'receiptSha256',
  ], 'record', failures);
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  const toolingFields = Object.keys(PASS71_HF296_CONTACT_TOOL_PATHS).map((name) => `${name}Sha256`);
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingFields.sort())
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) {
    failures.push('candidate-a-tooling-hashes');
  }
  if (!sameJson(record.coverage, PASS71_HF296_CONTACT_COVERAGE)) failures.push('truthful-partial-coverage');
  validateComponents(record.components, record, failures);
  validateVisualAttachments(record.visualAttachments, failures);
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf296ContactRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf296ContactEvidence(record, expected) {
  const failures = pass71Hf296ContactEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-296 contact evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf296ContactEvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR,
    validate(record, context) {
      try {
        const tooling = context?.options?.pass71Hf296ContactTooling
          ?? pass71Hf296ContactToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
        return pass71Hf296ContactEvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf296ContactSourceTreeSha
            ?? pass71Hf296ContactSourceTreeAtSource(context?.repositoryRoot, context?.sourceSha),
          tooling,
        });
      } catch (error) {
        return [`hf296-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY = createPass71Hf296ContactEvidenceRegistryEntry();

export function createPass71Hf296ContactEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(Object.keys(PASS71_HF296_CONTACT_TOOL_PATHS).map(
    (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
  ));
  const servedCandidate = {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
    path: 'channels/the-big-one', exactRootFileCount: 500, treeSha256: 'b'.repeat(64),
  };
  const components = PASS71_HF296_COMPONENT_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    kind: definition.kind,
    status: 'passed',
    command: definition.command,
    renderer: definition.renderer,
    sourceSha,
    provenanceMode: definition.provenanceMode,
    browser: definition.kind === 'unit' ? null : {
      channel: definition.id === 'viewmodel-framing-webgl2' ? 'chrome' : 'msedge',
      installedRequested: true,
      version: '151.0.4129.72',
      userAgent: definition.id.startsWith('near-plane-')
        ? 'Mozilla/5.0 Edg/151.0.4129.72'
        : null,
      executableAttestation: 'not-recorded-by-composed-source-receipt',
    },
    receiptPath: definition.receipt
      ? `artifacts/pass71/hf296-contact-evidence/components/${String(index + 1).padStart(2, '0')}-${definition.id}.json`
      : null,
    receiptSha256: definition.receipt ? (index + 1).toString(16).repeat(64) : null,
    receiptByteLength: definition.receipt ? 1_024 + index : null,
    servedTreeSha256: definition.id.startsWith('near-plane-') ? servedCandidate.treeSha256 : null,
  }));
  const visualAttachments = PASS71_HF296_VISUAL_IDENTITIES.map((identity, index) => ({
    ...identity,
    mimeType: 'image/png', encoding: 'lossless-png', copyMode: 'byte-exact',
    sha256: ((index % 15) + 1).toString(16).repeat(64),
    byteLength: 2_048 + index, width: 1_600, height: 900,
  }));
  const record = {
    ...PASS71_HF296_CONTACT_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T19:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T19:30:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha, sourceTreeSha: 'c'.repeat(40),
      releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true,
    },
    servedCandidate,
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    tooling: { ...tooling },
    coverage: JSON.parse(JSON.stringify(PASS71_HF296_CONTACT_COVERAGE)),
    components,
    visualAttachments,
    faults: [],
  };
  record.receiptSha256 = pass71Hf296ContactRecordSha256(record);
  return record;
}
