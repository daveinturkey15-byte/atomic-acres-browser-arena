import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PASS71_HF297_ARMS_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-297',
  kind: 'pass71-hf297-first-person-arms-component',
  contract: 'atomic-acres/pass71-hf297-first-person-arms-component@1',
  feedbackId: 'HF-297',
  status: 'passed',
  coverageDisposition: 'partial-non-closing-component-evidence',
  closingAuthority: false,
});

export const PASS71_HF297_ARMS_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF297_ARMS_EVIDENCE.evidenceId,
  kind: PASS71_HF297_ARMS_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
  closesFeedback: false,
});

export const PASS71_HF297_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop-1440p', width: 2560, height: 1440, mobile: false }),
  Object.freeze({ id: 'ultrawide-1440p', width: 3440, height: 1440, mobile: false }),
  Object.freeze({ id: 'iphone-15-landscape', width: 844, height: 390, mobile: true }),
  Object.freeze({ id: 'iphone-15-portrait', width: 390, height: 844, mobile: true }),
]);

export const PASS71_HF297_VISUAL_ACTIONS = Object.freeze([
  Object.freeze({ id: 'm4a1-hip', weapon: 'm4a1', action: 'hip' }),
  Object.freeze({ id: 'm4a1-ads', weapon: 'm4a1', action: 'ads' }),
  Object.freeze({ id: 'm4a1-fire', weapon: 'm4a1', action: 'fire' }),
  Object.freeze({ id: 'm4a1-reload', weapon: 'm4a1', action: 'reload' }),
  Object.freeze({ id: 'pistol-hip', weapon: 'pistol', action: 'hip' }),
  Object.freeze({ id: 'pistol-ads', weapon: 'pistol', action: 'ads' }),
  Object.freeze({ id: 'pistol-fire', weapon: 'pistol', action: 'fire' }),
  Object.freeze({ id: 'pistol-reload', weapon: 'pistol', action: 'reload' }),
  Object.freeze({ id: 'field-knife-melee', weapon: 'field-knife', action: 'melee' }),
]);

export const PASS71_HF297_WEAPONS = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'pistol', 'machine-pistol', 'magnum', 'flashlight-pistol', 'explosive-crossbow',
  'railgun', 'flamethrower', 'flare-gun',
]);

export const PASS71_HF297_CATALOG_ACTIONS = Object.freeze(['hip', 'ads', 'fire', 'reload']);
export const PASS71_HF297_FULLSCREEN_OPTICS = Object.freeze(['sniper', 'm14-ebr']);

export const PASS71_HF297_COVERAGE = Object.freeze({
  visualMatrix: Object.freeze({
    arenaId: 'gun-range',
    role: 'solo',
    renderer: 'webgl2',
    renderProfile: 'blender',
    viewports: PASS71_HF297_VIEWPORTS,
    actions: PASS71_HF297_VISUAL_ACTIONS,
    matrixCellCount: 36,
    losslessPngFrameCount: 36,
    reviewSheetCount: 4,
  }),
  mechanicalCatalog: Object.freeze({
    arenaId: 'gun-range',
    stance: 'prone',
    fixture: 'west-wall-floor-maximum-contact',
    role: 'solo',
    renderer: 'webgl2',
    renderProfile: 'blender',
    weapons: PASS71_HF297_WEAPONS,
    actions: PASS71_HF297_CATALOG_ACTIONS,
    fullscreenOpticWeapons: PASS71_HF297_FULLSCREEN_OPTICS,
    matrixCellCount: 80,
    fireCaptureAgeMs: 0,
    reloadCaptureProgress: 0.46,
  }),
  composition: Object.freeze({
    fullCartesianClaim: false,
    closesFeedback: false,
    exactStagedCandidateRequired: true,
    installedHardwareBrowserRequired: true,
    fullResolutionFramesRetainedAndHashed: true,
    ownerVisualInspectionPerformed: false,
    independentPixelOcclusionJudgmentPerformed: false,
  }),
  uncoveredCombinations: Object.freeze([
    'the 20-weapon rig matrix is not crossed with all four review viewports',
    'WebGPU is not captured by this HF-297 component; the separate authored near-plane and release parity gates remain required',
    'hosted multiplayer roles are not crossed with the first-person arms matrix',
    'arenas other than Gun Range and named graphics profiles other than Quality are not crossed here',
    'field-knife melee is not crossed with every weapon catalog entry',
    'all 20 weapons and applicable actions are not crossed with standing, crouched, prone and contact states at every supported viewport',
    'the two canonical desktop review sizes do not claim every possible supported desktop or ultrawide resolution',
    'mobile dimensions are installed-Chrome desktop viewport emulation rather than physical iOS or Android browser evidence',
    'Dave has not inspected or tested these exact-candidate visual sheets',
    'manifest registry wiring and the exact candidate-A execution are separate integration steps',
  ]),
});

export const PASS71_HF297_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf297-arms-evidence.mjs',
  contract: 'scripts/qa/pass71-hf297-arms-evidence-contract.mjs',
  contractTest: 'scripts/qa/pass71-hf297-arms-evidence-contract.test.mjs',
  contractTypes: 'scripts/qa/pass71-hf297-arms-evidence-contract.d.mts',
  visualSpec: 'tests/e2e/pass71-hf297-arms-visual.spec.ts',
  releaseEvidenceTest: 'src/pass71-hf297-arms-release-evidence.test.ts',
  weaponPresentation: 'src/weapon-presentation.ts',
  weaponPresentationState: 'src/weapon-presentation-state.ts',
  runtimeComposition: 'src/legacy-main.ts',
  renderRuntime: 'src/rendering/render-runtime.ts',
  gameplayCatalog: 'src/gameplay.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  browserIdentity: 'scripts/qa/pass71-edge-executable-identity.mjs',
  playwrightConfig: 'playwright.config.ts',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
});

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

export function pass71Hf297CanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-297 evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf297RecordSha256(record) {
  return createHash('sha256').update(pass71Hf297CanonicalBytes(record)).digest('hex');
}

export function pass71Hf297ToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF297_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256File(resolve(repositoryRoot, path))],
  )));
}

export function pass71Hf297ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-297 tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF297_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, createHash('sha256').update(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )).digest('hex')],
  )));
}

export function pass71Hf297SourceTreeAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-297 source tree requires a full SHA');
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function validFraming(framing) {
  return exactFramingShape(framing)
    && framing.finite === true
    && framing.nearPlaneClear === true
    && framing.intersectsViewport === true
    && typeof framing.fullyInsideViewport === 'boolean'
    && framing.ndcMin.every(Number.isFinite)
    && framing.ndcMax.every(Number.isFinite)
    && Number.isFinite(framing.nearestDepth)
    && framing.nearestDepth >= 0.1;
}

function exactFramingShape(framing) {
  return object(framing)
    && sameJson(Object.keys(framing).sort(), [
      'finite', 'nearPlaneClear', 'intersectsViewport', 'fullyInsideViewport',
      'ndcMin', 'ndcMax', 'nearestDepth',
    ].sort())
    && Array.isArray(framing.ndcMin) && framing.ndcMin.length === 2
    && Array.isArray(framing.ndcMax) && framing.ndcMax.length === 2;
}

function validRig(rig) {
  if (!exactKeys(rig, [
    'armsSource', 'armMeshCount', 'authoredFingerBoneCount', 'armMaterials',
    'armFraming', 'armBranches', 'sleeveContinuations', 'riggedArms',
  ], 'catalog-rig', [])) return false;
  if (rig.armsSource !== 'authored-two-chain'
    || !Number.isSafeInteger(rig.armMeshCount) || rig.armMeshCount < 1
    || rig.authoredFingerBoneCount !== 30
    || !sameJson(rig.armMaterials, {
      contract: 'opaque-depth-writing', total: rig.armMaterials?.total,
      transparent: 0, nonOpaque: 0, depthWriteDisabled: 0,
    })
    || !Number.isSafeInteger(rig.armMaterials?.total) || rig.armMaterials.total < 1
    || !validFraming(rig.armFraming)
    || !exactKeys(rig.armBranches, ['left', 'right'], 'catalog-rig-branches', [])) return false;
  for (const side of ['left', 'right']) {
    if (!validFraming(rig.armBranches[side]) || rig.armBranches[side].ndcMin[1] > -1.05) return false;
  }
  if (!Array.isArray(rig.sleeveContinuations) || rig.sleeveContinuations.length !== 2) return false;
  for (const side of ['left', 'right']) {
    const sleeve = rig.sleeveContinuations.find((entry) => entry?.side === side);
    if (!exactKeys(sleeve, [
      'side', 'contract', 'parent', 'materialKind', 'authoredSleeveMaterial', 'opaque',
    ], `catalog-rig-sleeve-${side}`, [])
      || sleeve.contract !== 'shoulder-bound-authored-pbr-lower-crop-continuation-v1'
      || typeof sleeve.parent !== 'string' || sleeve.parent.length === 0
      || sleeve.materialKind !== 'MeshStandardMaterial'
      || sleeve.authoredSleeveMaterial !== true || sleeve.opaque !== true) return false;
  }
  if (!Array.isArray(rig.riggedArms) || rig.riggedArms.length !== 2) return false;
  for (const side of ['left', 'right']) {
    const arm = rig.riggedArms.find((entry) => entry?.side === side);
    if (!exactKeys(arm, [
      'side', 'active', 'finite', 'withinStableReach', 'authoredSegmentDirectionsPreserved',
      'poseChainContract', 'shoulderEntryPolicy', 'contactError', 'wristContactError',
      'palmOrientationError', 'socketReachRatio', 'gripSocketCalibration', 'segmentLengthScale',
      'bindOffsetsPreserved', 'shoulderEntryNdc',
    ], `catalog-rig-arm-${side}`, [])
      || arm.active !== true || arm.finite !== true || arm.withinStableReach !== true
      || arm.authoredSegmentDirectionsPreserved !== true
      || arm.poseChainContract !== 'authored-palm-full-transform-to-socket-frame-v2'
      || arm.shoulderEntryPolicy !== 'camera-space-below-frame-continuation-v1'
      || !Number.isFinite(arm.contactError) || arm.contactError > 0.02
      || !Number.isFinite(arm.wristContactError) || arm.wristContactError > 0.02
      || !Number.isFinite(arm.palmOrientationError) || arm.palmOrientationError > 0.2
      || !Number.isFinite(arm.socketReachRatio) || arm.socketReachRatio > 1.04
      || !Number.isFinite(arm.gripSocketCalibration) || arm.gripSocketCalibration > 0.01
      || arm.segmentLengthScale !== 1 || arm.bindOffsetsPreserved !== true
      || !Array.isArray(arm.shoulderEntryNdc) || arm.shoulderEntryNdc.length !== 2
      || !arm.shoulderEntryNdc.every(Number.isFinite)) return false;
  }
  return true;
}

function validateCatalog(catalog, failures) {
  if (!Array.isArray(catalog) || catalog.length !== PASS71_HF297_WEAPONS.length) {
    failures.push('all-weapon-catalog-matrix');
    return;
  }
  catalog.forEach((entry, index) => {
    const weapon = PASS71_HF297_WEAPONS[index];
    const prefix = `catalog:${weapon}`;
    exactKeys(entry, ['weapon', 'identity', 'rig', 'actions'], prefix, failures);
    if (entry?.weapon !== weapon) failures.push(`${prefix}:identity`);
    exactKeys(entry?.identity, [
      'modelKind', 'firstPersonSource', 'weaponModelId', 'weaponFinishId', 'importedSource',
      'meshes', 'renderPrimitives', 'triangles', 'socketContractReady',
    ], `${prefix}:model`, failures);
    if (entry?.identity?.modelKind !== 'project-original-blender'
      || typeof entry.identity.firstPersonSource !== 'string' || entry.identity.firstPersonSource.length === 0
      || typeof entry.identity.weaponModelId !== 'string' || entry.identity.weaponModelId.length === 0
      || entry.identity.weaponFinishId !== `${weapon}-project-original-pbr-v1`
      || typeof entry.identity.importedSource !== 'string' || entry.identity.importedSource.length === 0
      || !Number.isSafeInteger(entry.identity.meshes) || entry.identity.meshes < 1
      || !Number.isSafeInteger(entry.identity.renderPrimitives) || entry.identity.renderPrimitives < 1
      || !Number.isSafeInteger(entry.identity.triangles) || entry.identity.triangles < 1
      || entry.identity.socketContractReady !== true) failures.push(`${prefix}:authored-model`);
    if (!validRig(entry?.rig)) failures.push(`${prefix}:rig-anatomy`);
    if (!Array.isArray(entry?.actions) || entry.actions.length !== PASS71_HF297_CATALOG_ACTIONS.length) {
      failures.push(`${prefix}:action-matrix`);
      return;
    }
    entry.actions.forEach((action, actionIndex) => {
      const actionId = PASS71_HF297_CATALOG_ACTIONS[actionIndex];
      const fullscreen = PASS71_HF297_FULLSCREEN_OPTICS.includes(weapon) && actionId === 'ads';
      exactKeys(action, [
        'id', 'state', 'sample', 'effectiveViewmodelVisible', 'fullscreenSuppressionActive',
        'weaponFraming', 'armFraming', 'nearestDepth', 'requiredDepth', 'clearanceMargin',
      ], `${prefix}:${actionId}`, failures);
      if (action?.id !== actionId
        || action.state !== (actionId === 'reload' ? 'reload' : actionId === 'ads' ? 'ads' : 'hip')
        || action.sample !== (actionId === 'fire' ? 0 : actionId === 'reload' ? 0.46 : null)
        || action.effectiveViewmodelVisible !== !fullscreen
        || action.fullscreenSuppressionActive !== fullscreen) failures.push(`${prefix}:${actionId}:state`);
      if (fullscreen) {
        if (action.weaponFraming !== null || action.armFraming !== null || action.nearestDepth !== null
          || action.requiredDepth !== null || action.clearanceMargin !== null) failures.push(`${prefix}:${actionId}:suppression`);
      } else if (!validFraming(action.weaponFraming) || !validFraming(action.armFraming)
        || !Number.isFinite(action.nearestDepth) || action.nearestDepth < 0.1
        || action.requiredDepth !== 0.1 || !Number.isFinite(action.clearanceMargin)
        || action.clearanceMargin < 0) failures.push(`${prefix}:${actionId}:clearance`);
    });
  });
}

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(expected?.sourceSha ?? '')
    || source.expectedSourceSha !== expected.sourceSha
    || source.checkoutSourceSha !== expected.sourceSha
    || source.endingCheckoutSourceSha !== expected.sourceSha
    || !SHA40.test(source.sourceTreeSha ?? '') || source.sourceTreeSha !== expected?.sourceTreeSha
    || source.releasePass !== 'PASS 71' || source.cleanBefore !== true || source.cleanAfter !== true) {
    failures.push('exact-candidate-a-source');
  }
}

function validateServedCandidate(candidate, expected, failures) {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path',
    'exactRootFileCount', 'treeSha256',
  ], 'servedCandidate', failures);
  if (!object(candidate) || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.sourceSha !== expected?.sourceSha
    || candidate.path !== 'channels/the-big-one'
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2
    || !SHA256.test(candidate.treeSha256 ?? '')) failures.push('staged-candidate-provenance');
}

function validateBrowser(browser, failures) {
  exactKeys(browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion',
    'browserVersion', 'userAgent', 'installScope', 'authenticodeStatus', 'authenticodeSigner',
    'adapterLabel', 'softwareAdapter', 'isolation',
  ], 'browser', failures);
  const executableMajor = /^(\d+)(?:\.\d+){3}$/u.exec(browser?.executableVersion ?? '')?.[1];
  const runtimeMajor = /^(\d+)(?:\.\d+){3}$/u.exec(browser?.browserVersion ?? '')?.[1];
  const userAgentMajor = /(?:Headless)?Chrome\/(\d+)\./u.exec(browser?.userAgent ?? '')?.[1];
  if (!object(browser) || browser.channel !== 'chrome' || browser.installed !== true
    || browser.executableName !== 'chrome.exe' || !SHA256.test(browser.executableSha256 ?? '')
    || !executableMajor || runtimeMajor !== executableMajor || userAgentMajor !== executableMajor
    || /\bEdg\//u.test(browser.userAgent ?? '')
    || !['per-user', 'machine-x64', 'machine-x86'].includes(browser.installScope)
    || browser.authenticodeStatus !== 'Valid' || !/\bGoogle LLC\b/iu.test(browser.authenticodeSigner ?? '')
    || typeof browser.adapterLabel !== 'string' || browser.adapterLabel.length === 0
    || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu.test(browser.adapterLabel)
    || browser.softwareAdapter !== false
    || browser.isolation !== 'one-installed-chrome-process-one-fresh-context') {
    failures.push('installed-hardware-chrome');
  }
}

function validateComponents(components, failures) {
  const expected = [
    ['viewport-action-visual-matrix', 'visual', 36],
    ['all-weapon-rig-anatomy-matrix', 'telemetry', 80],
  ];
  if (!Array.isArray(components) || components.length !== expected.length) {
    failures.push('component-matrix');
    return;
  }
  components.forEach((component, index) => {
    exactKeys(component, [
      'id', 'kind', 'status', 'matrixCellCount', 'receiptPath', 'receiptSha256', 'receiptByteLength',
    ], `component:${index}`, failures);
    if (component?.id !== expected[index][0] || component.kind !== expected[index][1]
      || component.status !== 'passed' || component.matrixCellCount !== expected[index][2]
      || component.receiptPath !== 'artifacts/pass71/hf297-arms-evidence/components/browser-receipt.json'
      || !SHA256.test(component.receiptSha256 ?? '')
      || !Number.isSafeInteger(component.receiptByteLength) || component.receiptByteLength < 2) {
      failures.push(`component:${index}:identity-or-receipt`);
    }
  });
  if (components[0]?.receiptSha256 !== components[1]?.receiptSha256
    || components[0]?.receiptByteLength !== components[1]?.receiptByteLength) {
    failures.push('component-cross-receipt');
  }
}

function visualFrameSourceDigest(frames) {
  return createHash('sha256').update(Buffer.from(frames.map((frame) => (
    `${frame.id}\0${frame.path}\0${frame.sha256}\0${frame.byteLength}\0${frame.width}x${frame.height}\n`
  )).join(''), 'utf8')).digest('hex');
}

function validateVisualFrames(frames, failures) {
  if (!Array.isArray(frames) || frames.length !== PASS71_HF297_COVERAGE.visualMatrix.matrixCellCount) {
    failures.push('visual-frame-matrix');
    return;
  }
  let index = 0;
  for (const viewport of PASS71_HF297_VIEWPORTS) {
    for (const action of PASS71_HF297_VISUAL_ACTIONS) {
      const frame = frames[index++];
      const id = `${viewport.id}/${action.id}`;
      exactKeys(frame, [
        'id', 'viewportId', 'weapon', 'action', 'path', 'mimeType', 'encoding',
        'sha256', 'byteLength', 'width', 'height',
      ], `visual-frame:${id}`, failures);
      if (frame?.id !== id || frame.viewportId !== viewport.id || frame.weapon !== action.weapon
        || frame.action !== action.action
        || frame.path !== `artifacts/pass71/hf297-arms-evidence/visual-source/${viewport.id}-${action.id}.png`
        || frame.mimeType !== 'image/png' || frame.encoding !== 'lossless-png'
        || !SHA256.test(frame.sha256 ?? '') || !Number.isSafeInteger(frame.byteLength) || frame.byteLength <= 24
        || frame.width !== viewport.width || frame.height !== viewport.height) {
        failures.push(`visual-frame:${id}:identity-or-bytes`);
      }
    }
  }
}

function validateVisualSheets(sheets, frames, failures) {
  if (!Array.isArray(sheets) || sheets.length !== PASS71_HF297_VIEWPORTS.length) {
    failures.push('visual-sheet-matrix');
    return;
  }
  sheets.forEach((sheet, index) => {
    const viewport = PASS71_HF297_VIEWPORTS[index];
    exactKeys(sheet, [
      'viewportId', 'path', 'mimeType', 'encoding', 'layout', 'sourceFrameCount',
      'sourceFrameDigestSha256', 'sha256', 'byteLength', 'width', 'height',
    ], `visual-sheet:${viewport.id}`, failures);
    if (sheet?.viewportId !== viewport.id
      || sheet.path !== `artifacts/pass71/hf297-arms-evidence/sheets/${viewport.id}.png`
      || sheet.mimeType !== 'image/png' || sheet.encoding !== 'lossless-png'
      || sheet.layout !== 'three-by-three-ordered-action-review'
      || sheet.sourceFrameCount !== PASS71_HF297_VISUAL_ACTIONS.length
      || !SHA256.test(sheet.sourceFrameDigestSha256 ?? '') || !SHA256.test(sheet.sha256 ?? '')
      || !Number.isSafeInteger(sheet.byteLength) || sheet.byteLength <= 24
      || sheet.width !== 960 || sheet.height !== 540) failures.push(`visual-sheet:${viewport.id}:identity-or-bytes`);
    const sourceFrames = Array.isArray(frames) ? frames.filter((frame) => frame?.viewportId === viewport.id) : [];
    if (sourceFrames.length !== PASS71_HF297_VISUAL_ACTIONS.length
      || sheet?.sourceFrameDigestSha256 !== visualFrameSourceDigest(sourceFrames)) {
      failures.push(`visual-sheet:${viewport.id}:source-frame-digest`);
    }
  });
}

export function pass71Hf297EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF297_ARMS_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF297_ARMS_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF297_ARMS_EVIDENCE.kind
    || record.contract !== PASS71_HF297_ARMS_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF297_ARMS_EVIDENCE.feedbackId
    || record.status !== PASS71_HF297_ARMS_EVIDENCE.status
    || record.coverageDisposition !== PASS71_HF297_ARMS_EVIDENCE.coverageDisposition) {
    return ['hf297-identity-or-status'];
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closingAuthority', 'startedAt', 'completedAt', 'source', 'servedCandidate',
    'environment', 'browser', 'tooling', 'coverage', 'components', 'visualFrames', 'visualSheets',
    'catalogTelemetry', 'faults', 'receiptSha256',
  ], 'record', failures);
  if (record.closingAuthority !== false) failures.push('non-closing-authority');
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  validateBrowser(record.browser, failures);
  const toolingFields = Object.keys(PASS71_HF297_TOOL_PATHS).map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingFields)
    || !sameJson(Object.keys(expected.tooling).sort(), toolingFields)
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) {
    failures.push('candidate-a-tooling-hashes');
  }
  if (!sameJson(record.coverage, PASS71_HF297_COVERAGE)) failures.push('truthful-bounded-coverage');
  validateComponents(record.components, failures);
  validateVisualFrames(record.visualFrames, failures);
  validateVisualSheets(record.visualSheets, record.visualFrames, failures);
  validateCatalog(record.catalogTelemetry, failures);
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf297RecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf297Evidence(record, expected) {
  const failures = pass71Hf297EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-297 arms evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf297EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF297_ARMS_EVIDENCE_DESCRIPTOR,
    validate(record, context) {
      try {
        return pass71Hf297EvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf297SourceTreeSha
            ?? pass71Hf297SourceTreeAtSource(context?.repositoryRoot, context?.sourceSha),
          tooling: context?.options?.pass71Hf297Tooling
            ?? pass71Hf297ToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha),
        });
      } catch (error) {
        return [`hf297-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY = createPass71Hf297EvidenceRegistryEntry();

function fixtureFraming() {
  return {
    finite: true, nearPlaneClear: true, intersectsViewport: true, fullyInsideViewport: false,
    ndcMin: [-0.5, -1.3], ndcMax: [0.8, 0.5], nearestDepth: 0.2,
  };
}

function fixtureRig() {
  return {
    armsSource: 'authored-two-chain', armMeshCount: 2, authoredFingerBoneCount: 30,
    armMaterials: { contract: 'opaque-depth-writing', total: 2, transparent: 0, nonOpaque: 0, depthWriteDisabled: 0 },
    armFraming: fixtureFraming(),
    armBranches: {
      left: { ...fixtureFraming(), ndcMin: [-0.8, -1.2] },
      right: { ...fixtureFraming(), ndcMin: [0.1, -1.2] },
    },
    sleeveContinuations: ['left', 'right'].map((side) => ({
      side, contract: 'shoulder-bound-authored-pbr-lower-crop-continuation-v1',
      parent: side === 'left' ? 'UpperArmL' : 'UpperArmR', materialKind: 'MeshStandardMaterial',
      authoredSleeveMaterial: true, opaque: true,
    })),
    riggedArms: ['left', 'right'].map((side) => ({
      side, active: true, finite: true, withinStableReach: true,
      authoredSegmentDirectionsPreserved: true,
      poseChainContract: 'authored-palm-full-transform-to-socket-frame-v2',
      shoulderEntryPolicy: 'camera-space-below-frame-continuation-v1',
      contactError: 0.001, wristContactError: 0.001, palmOrientationError: 0.01,
      socketReachRatio: 0.9, gripSocketCalibration: 0.001, segmentLengthScale: 1,
      bindOffsetsPreserved: true, shoulderEntryNdc: [side === 'left' ? -0.5 : 0.5, -1.12],
    })),
  };
}

export function createPass71Hf297EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(Object.keys(PASS71_HF297_TOOL_PATHS).map(
    (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
  ));
  const componentReceiptSha256 = 'b'.repeat(64);
  const catalogTelemetry = PASS71_HF297_WEAPONS.map((weapon) => ({
    weapon,
    identity: {
      modelKind: 'project-original-blender', firstPersonSource: 'project-original-blender-pass65-firearm',
      weaponModelId: `${weapon}-model`, weaponFinishId: `${weapon}-project-original-pbr-v1`,
      importedSource: `./assets/${weapon}.glb`, meshes: 2, renderPrimitives: 2, triangles: 100,
      socketContractReady: true,
    },
    rig: fixtureRig(),
    actions: PASS71_HF297_CATALOG_ACTIONS.map((id) => {
      const fullscreen = PASS71_HF297_FULLSCREEN_OPTICS.includes(weapon) && id === 'ads';
      return {
        id, state: id === 'reload' ? 'reload' : id === 'ads' ? 'ads' : 'hip',
        sample: id === 'fire' ? 0 : id === 'reload' ? 0.46 : null,
        effectiveViewmodelVisible: !fullscreen, fullscreenSuppressionActive: fullscreen,
        weaponFraming: fullscreen ? null : fixtureFraming(),
        armFraming: fullscreen ? null : fixtureFraming(),
        nearestDepth: fullscreen ? null : 0.2,
        requiredDepth: fullscreen ? null : 0.1,
        clearanceMargin: fullscreen ? null : 0.1,
      };
    }),
  }));
  const record = {
    ...PASS71_HF297_ARMS_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T20:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T20:10:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      sourceTreeSha: options.sourceTreeSha ?? 'c'.repeat(40), releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true,
    },
    servedCandidate: {
      schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
      path: 'channels/the-big-one', exactRootFileCount: 500, treeSha256: 'd'.repeat(64),
    },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'chrome', installed: true, executableName: 'chrome.exe', executableSha256: 'e'.repeat(64),
      executableVersion: '151.0.7922.137', browserVersion: '151.0.7922.137',
      userAgent: 'Mozilla/5.0 Chrome/151.0.7922.137 Safari/537.36', installScope: 'machine-x64',
      authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Google LLC, O=Google LLC, C=US',
      adapterLabel: 'ANGLE (NVIDIA GeForce RTX 5080 Direct3D11)', softwareAdapter: false,
      isolation: 'one-installed-chrome-process-one-fresh-context',
    },
    tooling: { ...tooling },
    coverage: JSON.parse(JSON.stringify(PASS71_HF297_COVERAGE)),
    components: [
      { id: 'viewport-action-visual-matrix', kind: 'visual', status: 'passed', matrixCellCount: 36,
        receiptPath: 'artifacts/pass71/hf297-arms-evidence/components/browser-receipt.json',
        receiptSha256: componentReceiptSha256, receiptByteLength: 10_000 },
      { id: 'all-weapon-rig-anatomy-matrix', kind: 'telemetry', status: 'passed', matrixCellCount: 80,
        receiptPath: 'artifacts/pass71/hf297-arms-evidence/components/browser-receipt.json',
        receiptSha256: componentReceiptSha256, receiptByteLength: 10_000 },
    ],
    visualFrames: PASS71_HF297_VIEWPORTS.flatMap((viewport, viewportIndex) => (
      PASS71_HF297_VISUAL_ACTIONS.map((action, actionIndex) => ({
        id: `${viewport.id}/${action.id}`, viewportId: viewport.id, weapon: action.weapon, action: action.action,
        path: `artifacts/pass71/hf297-arms-evidence/visual-source/${viewport.id}-${action.id}.png`,
        mimeType: 'image/png', encoding: 'lossless-png',
        sha256: (((viewportIndex * 9 + actionIndex) % 15) + 1).toString(16).repeat(64),
        byteLength: 30_000 + viewportIndex * 9 + actionIndex, width: viewport.width, height: viewport.height,
      }))
    )),
    visualSheets: PASS71_HF297_VIEWPORTS.map((viewport, index) => ({
      viewportId: viewport.id, path: `artifacts/pass71/hf297-arms-evidence/sheets/${viewport.id}.png`,
      mimeType: 'image/png', encoding: 'lossless-png', layout: 'three-by-three-ordered-action-review',
      sourceFrameCount: 9, sourceFrameDigestSha256: '',
      sha256: ((index + 5) % 15 + 1).toString(16).repeat(64), byteLength: 20_000 + index,
      width: 960, height: 540,
    })),
    catalogTelemetry,
    faults: [],
  };
  record.visualSheets.forEach((sheet) => {
    sheet.sourceFrameDigestSha256 = visualFrameSourceDigest(
      record.visualFrames.filter((frame) => frame.viewportId === sheet.viewportId),
    );
  });
  record.receiptSha256 = pass71Hf297RecordSha256(record);
  return record;
}
