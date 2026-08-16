import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { auditSupportVehicleGlb } from './pass65-support-vehicle-glb.mjs';

export const PASS71_HF306_COCKPIT_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-306',
  kind: 'pass71-hf306-chopper-cockpit-framing-closure',
  contract: 'atomic-acres/pass71-hf306-chopper-cockpit-framing-closure@1',
  feedbackId: 'HF-306',
  status: 'passed',
  coverageDisposition: 'exact-native-renderer-viewport-action-attribution-matrix',
  closesFeedback: true,
});

export const PASS71_HF306_COCKPIT_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF306_COCKPIT_EVIDENCE.evidenceId,
  kind: PASS71_HF306_COCKPIT_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF306_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF306_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1920, height: 1080 }),
  Object.freeze({ id: 'ultrawide', width: 2560, height: 1080 }),
  Object.freeze({ id: 'mobile', width: 390, height: 844 }),
]);
export const PASS71_HF306_ACTIONS = Object.freeze(['movement', 'fire', 'missile']);
export const PASS71_HF306_SEMANTIC_NODES = Object.freeze([
  'chopper-cockpit-dashboard-3d',
  'chopper-cockpit-display-cyan',
  'chopper-cockpit-display-green',
  'chopper-inner-windscreen-pillar-left-base',
  'chopper-inner-windscreen-pillar-left-top',
  'chopper-inner-windscreen-pillar-right-base',
  'chopper-inner-windscreen-pillar-right-top',
  'chopper-inner-windscreen-glow-left-base',
  'chopper-inner-windscreen-glow-left-top',
  'chopper-inner-windscreen-glow-right-base',
  'chopper-inner-windscreen-glow-right-top',
]);

export const PASS71_HF306_ASSET_PATHS = Object.freeze([
  'public/assets/original/models/support/pass65-chopper-gunner-lod0.glb',
  'public/assets/original/models/support/pass65-chopper-gunner-lod1.glb',
  'public/assets/original/models/support/pass65-chopper-gunner-lod2.glb',
]);

export const PASS71_HF306_PROJECTION_CASES = Object.freeze([
  'desktop-720p-min-fov', 'desktop-720p-max-fov',
  'desktop-1080p-min-fov', 'desktop-1080p-max-fov',
  'ultrawide-1080p-min-fov', 'ultrawide-1080p-max-fov',
  'iphone-15-landscape-min-fov', 'iphone-15-landscape-max-fov',
  'iphone-15-portrait-min-fov', 'iphone-15-portrait-max-fov',
]);

export const PASS71_HF306_COVERAGE = Object.freeze({
  machine: 'dave-gaming-pc',
  browser: 'installed-authenticode-valid-microsoft-edge',
  adapter: 'native-nonsoftware-hardware',
  renderers: PASS71_HF306_RENDERERS,
  arena: 'atomic-acres',
  possession: 'chopper-gunner',
  viewports: PASS71_HF306_VIEWPORTS,
  actions: PASS71_HF306_ACTIONS,
  exactActionCellsPerRenderer: PASS71_HF306_VIEWPORTS.length * PASS71_HF306_ACTIONS.length,
  exactAttributionPairsPerRenderer: PASS71_HF306_VIEWPORTS.length,
  attribution: 'same-simulation-frame-authored-cockpit-roots-visible-vs-hidden-real-render-submission',
  rasterPolicy: 'embedded-lossless-png-bytes-decoded-and-recomputed-by-contract',
  instruments: 'all-six-live-readouts-plus-platform-missile-status-safe-area-and-non-clipping-layout',
  centreCorridor: 'camera-centred-raster-control-plus-pointer-hit-test-and-disconnected-reticle',
  authoredGeometry: 'all-three-optimized-glb-lods-semantic-endpoints-and-position-extents',
  projectionCases: PASS71_HF306_PROJECTION_CASES,
  closureBoundary: 'possessed Chopper Gunner cockpit framing on the exact Pass 71 candidate across desktop, ultrawide and mobile through trusted movement, fire and missile actions',
});

export const PASS71_HF306_UNKNOWNS = Object.freeze([
  'owner-subjective-aesthetic-inspection-not-claimed',
  'other-browsers-adapters-and-device-pixel-ratios-not-claimed',
  'remote-multiplayer-possession-not-claimed',
]);

export const PASS71_HF306_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf306-cockpit-evidence.mjs',
  contract: 'scripts/qa/pass71-hf306-cockpit-evidence-contract.mjs',
  contractTypes: 'scripts/qa/pass71-hf306-cockpit-evidence-contract.d.mts',
  contractTest: 'scripts/qa/pass71-hf306-cockpit-evidence-contract.test.mjs',
  browserSpec: 'tests/e2e/pass71-hf306-cockpit-framing.spec.ts',
  releaseIntegrationTest: 'src/pass71-hf306-cockpit-release-evidence.test.ts',
  assetAudit: 'scripts/qa/pass65-support-vehicle-glb.mjs',
  assetReader: 'scripts/qa/hunter-drone-glb.mjs',
  assetProjectionTest: 'src/pass71-chopper-cockpit-pillars.test.ts',
  presentationOwner: 'src/killstreak-presentation.ts',
  frameOwner: 'src/legacy-main.ts',
  shellOwner: 'src/ui/pass64-shell.ts',
  hudOwner: 'src/ui/pass65-hud.css',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  playwrightConfig: 'playwright.config.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  releaseChannels: 'release-channels.json',
  edgeIdentity: 'scripts/qa/pass71-edge-executable-identity.mjs',
  chopperLod0: PASS71_HF306_ASSET_PATHS[0],
  chopperLod1: PASS71_HF306_ASSET_PATHS[1],
  chopperLod2: PASS71_HF306_ASSET_PATHS[2],
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(finite);
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitShow(repositoryRoot, sourceSha, path) {
  return execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
  });
}

function gitShowText(repositoryRoot, sourceSha, path) {
  return gitShow(repositoryRoot, sourceSha, path).toString('utf8');
}

export function pass71Hf306CanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-306 evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf306RecordSha256(record) {
  return sha256(pass71Hf306CanonicalBytes(record));
}

export function pass71Hf306ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (typeof repositoryRoot !== 'string' || !SHA40.test(sourceSha ?? '')) {
    throw new Error('HF-306 tooling hashes require a repository root and exact source SHA');
  }
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF306_TOOL_PATHS).map(([name, path]) => (
    [`${name}Sha256`, sha256(gitShow(repositoryRoot, sourceSha, path))]
  ))));
}

export function pass71Hf306SourceTreeAtSource(repositoryRoot, sourceSha) {
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function parseGlb(bytes, label) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF'
    || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`${label}: invalid GLB`);
  }
  let offset = 12;
  let json = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error(`${label}: GLB chunk exceeds bytes`);
    if (type === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8', start, end).replace(/[\0 ]+$/u, ''));
    offset = end;
  }
  if (!json) throw new Error(`${label}: GLB JSON chunk missing`);
  return json;
}

export function pass71Hf306AssetAuditAtSource(repositoryRoot, sourceSha) {
  if (typeof repositoryRoot !== 'string' || !SHA40.test(sourceSha ?? '')) {
    throw new Error('HF-306 asset audit requires a repository root and exact source SHA');
  }
  return Object.freeze(PASS71_HF306_ASSET_PATHS.map((path, lod) => {
    const bytes = gitShow(repositoryRoot, sourceSha, path);
    const json = parseGlb(bytes, path);
    const audit = auditSupportVehicleGlb(json, bytes.length, 'chopper', lod);
    return Object.freeze({
      path,
      lod,
      sha256: sha256(bytes),
      bytes: bytes.length,
      failures: Object.freeze([...audit.failures]),
      cockpitFraming: audit.cockpitFraming,
    });
  }));
}

export function pass71Hf306OwnerSourceFailures(sources) {
  const failures = [];
  const audit = sources?.assetAudit ?? '';
  const pillarTest = sources?.assetProjectionTest ?? '';
  const frame = sources?.frameOwner ?? '';
  const presentation = sources?.presentationOwner ?? '';
  const shell = sources?.shellOwner ?? '';
  const hud = sources?.hudOwner ?? '';
  for (const label of ['ultrawide-1080p-min-fov', 'ultrawide-1080p-max-fov']) {
    if (!audit.includes(`label: '${label}'`) || !pillarTest.includes(`'${label}'`)) {
      failures.push(`missing-${label}`);
    }
  }
  if (!audit.includes("const CHOPPER_COCKPIT_FRAMING_REVISION = 'pass71-tall-pillars-centre-clear-v1';")
    || !audit.includes('CHOPPER_COCKPIT_MAXIMUM_TOP_VIEWPORT_RATIO = 0.24')
    || !audit.includes('centreClearance >= 0')
    || !pillarTest.includes("'rejects optimized pillar geometry whose POSITION extent no longer reaches its semantic endpoints'")) {
    failures.push('optimized-glb-owner-audit-drift');
  }
  const freezeStart = frame.indexOf('async function freezeDebugChopperCockpitEvidenceFrame()');
  const exteriorStart = frame.indexOf('async function captureDebugChopperExteriorHiddenControl()', freezeStart);
  const control = freezeStart >= 0 && exteriorStart > freezeStart ? frame.slice(freezeStart, exteriorStart) : '';
  if (!control.includes("node.name === 'chopper-first-person-cockpit'")
    || !control.includes('debugChopperCockpitEvidenceState = state;')
    || !control.includes('debugRenderPaused = true;')
    || !control.includes("await submitForegroundWebGpuFrame(true, 'serialized');")
    || !control.includes('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);')
    || !control.includes('for (const root of state.cockpitRoots) root.visible = false;')
    || !control.includes('finally {')
    || !control.includes('root.visible = state.cockpitRootVisibilities[index]!;')) {
    failures.push('frozen-cockpit-root-control-drift');
  }
  if (/readPixels|toDataURL|toBlob|getImageData|readRenderTargetPixels/u.test(control)) {
    failures.push('cockpit-control-readback-workaround');
  }
  if (!frame.includes('freezeChopperCockpitEvidenceFrame: freezeDebugChopperCockpitEvidenceFrame')
    || !frame.includes('captureChopperCockpitHiddenControl: captureDebugChopperCockpitHiddenControl')
    || !frame.includes('releaseChopperCockpitEvidenceFrame: releaseDebugChopperCockpitEvidenceFrame')) {
    failures.push('debug-cockpit-control-not-registered');
  }
  if (!presentation.includes("presentationSource: String(firstPersonRoot.userData.presentationSource ?? 'unknown')")
    || !presentation.includes("dashboardVisible: subtreeHasVisibleMesh('chopper-cockpit-dashboard-3d')")
    || !presentation.includes('centreSightlineClear: !subtreeHasVisibleMesh')
    || !presentation.includes('visibleOutsideCockpit')) failures.push('live-presentation-owner-telemetry-drift');
  if (!shell.includes('data-centre-clear="true"')
    || !['gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage']
      .every((id) => shell.includes(`id="${id}"`))) failures.push('instrument-shell-contract-drift');
  if (!hud.includes('height: clamp(280px, 58vh, 620px);')
    || !hud.includes('grid-template-columns: repeat(3, minmax(0, 1fr))')
    || !hud.includes('env(safe-area-inset-bottom)')) failures.push('responsive-cockpit-hud-contract-drift');
  return [...new Set(failures)].sort();
}

export function pass71Hf306OwnerSourceAuditAtSource(repositoryRoot, sourceSha) {
  return Object.freeze({
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf306-cockpit-owner-source-audit@1',
    failures: Object.freeze(pass71Hf306OwnerSourceFailures({
      assetAudit: gitShowText(repositoryRoot, sourceSha, PASS71_HF306_TOOL_PATHS.assetAudit),
      assetProjectionTest: gitShowText(repositoryRoot, sourceSha, PASS71_HF306_TOOL_PATHS.assetProjectionTest),
      frameOwner: gitShowText(repositoryRoot, sourceSha, PASS71_HF306_TOOL_PATHS.frameOwner),
      presentationOwner: gitShowText(repositoryRoot, sourceSha, PASS71_HF306_TOOL_PATHS.presentationOwner),
      shellOwner: gitShowText(repositoryRoot, sourceSha, PASS71_HF306_TOOL_PATHS.shellOwner),
      hudOwner: gitShowText(repositoryRoot, sourceSha, PASS71_HF306_TOOL_PATHS.hudOwner),
    })),
  });
}

export function pass71Hf306AttachmentKeys() {
  return Object.freeze(PASS71_HF306_VIEWPORTS.flatMap((viewport) => [
    `${viewport.id}/visible`,
    `${viewport.id}/hidden-control`,
    ...PASS71_HF306_ACTIONS.map((action) => `${viewport.id}/${action}`),
  ]));
}

export function pass71Hf306ActionKeys() {
  return Object.freeze(PASS71_HF306_VIEWPORTS.flatMap((viewport) => (
    PASS71_HF306_ACTIONS.map((action) => `${viewport.id}/${action}`)
  )));
}

function viewportById(id) {
  return PASS71_HF306_VIEWPORTS.find((entry) => entry.id === id) ?? null;
}

function attachmentIdentity(key) {
  const [viewportId, suffix] = String(key).split('/');
  if (!viewportById(viewportId)) return null;
  if (suffix === 'visible') return { key, kind: 'visible', viewportId, action: null };
  if (suffix === 'hidden-control') return { key, kind: 'hidden-control', viewportId, action: null };
  if (PASS71_HF306_ACTIONS.includes(suffix)) return { key, kind: 'action', viewportId, action: suffix };
  return null;
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

const decodedPngCache = new Map();

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePngRgb(bytes) {
  const digest = sha256(bytes);
  const cached = decodedPngCache.get(digest);
  if (cached) return cached;
  if (bytes.length <= 32 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error('PNG chunk bounds');
    const expectedCrc = bytes.readUInt32BE(end);
    const actualCrc = pngCrc32(bytes.subarray(offset + 4, end));
    if (actualCrc !== expectedCrc) throw new Error('PNG chunk CRC');
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(start);
      height = bytes.readUInt32BE(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === 'IDAT') idat.push(bytes.subarray(start, end));
    offset = end + 4;
    if (type === 'IEND') break;
  }
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0
    || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0 || idat.length === 0) {
    throw new Error('PNG IHDR');
  }
  const sourceChannels = colorType === 6 ? 4 : 3;
  const stride = width * sourceChannels;
  const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height });
  if (inflated.length !== (stride + 1) * height) throw new Error('PNG inflated byte length');
  const unfiltered = Buffer.allocUnsafe(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset++];
    if (filter > 4) throw new Error('PNG filter');
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset++];
      const left = x >= sourceChannels ? unfiltered[rowOffset + x - sourceChannels] : 0;
      const up = y > 0 ? unfiltered[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= sourceChannels
        ? unfiltered[rowOffset - stride + x - sourceChannels] : 0;
      const predictor = filter === 1 ? left
        : filter === 2 ? up
          : filter === 3 ? Math.floor((left + up) / 2)
            : filter === 4 ? paeth(left, up, upperLeft) : 0;
      unfiltered[rowOffset + x] = (raw + predictor) & 0xff;
    }
  }
  const rgb = sourceChannels === 3 ? unfiltered : Buffer.allocUnsafe(width * height * 3);
  if (sourceChannels === 4) {
    for (let source = 0, target = 0; source < unfiltered.length; source += 4, target += 3) {
      rgb[target] = unfiltered[source];
      rgb[target + 1] = unfiltered[source + 1];
      rgb[target + 2] = unfiltered[source + 2];
    }
  }
  const decoded = Object.freeze({ width, height, rgb });
  decodedPngCache.set(digest, decoded);
  return decoded;
}

function rasterRegions(viewport) {
  const sideHeight = Math.max(1, Math.floor(viewport.height * 0.82));
  const sideWidth = Math.max(1, Math.floor(viewport.width * 0.4));
  const instrumentTop = Math.floor(viewport.height * 0.64);
  const centreWidth = Math.max(8, Math.floor(viewport.width * 0.08));
  const centreHeight = Math.max(8, Math.floor(viewport.height * 0.08));
  return Object.freeze({
    left: Object.freeze({ left: 0, top: 0, width: sideWidth, height: sideHeight }),
    right: Object.freeze({
      left: viewport.width - sideWidth, top: 0, width: sideWidth, height: sideHeight,
    }),
    instruments: Object.freeze({
      left: 0,
      top: instrumentTop,
      width: Math.max(1, Math.floor(viewport.width * 0.58)),
      height: viewport.height - instrumentTop,
    }),
    centre: Object.freeze({
      left: Math.floor((viewport.width - centreWidth) / 2),
      top: Math.floor((viewport.height - centreHeight) / 2),
      width: centreWidth,
      height: centreHeight,
    }),
  });
}

export function pass71Hf306RasterDifference(visible, hidden, crop) {
  if (visible.width !== hidden.width || visible.height !== hidden.height
    || !Buffer.isBuffer(visible.rgb) || !Buffer.isBuffer(hidden.rgb)
    || visible.rgb.length !== hidden.rgb.length) throw new Error('HF-306 raster pair mismatch');
  const endX = crop.left + crop.width;
  const endY = crop.top + crop.height;
  if (crop.left < 0 || crop.top < 0 || endX > visible.width || endY > visible.height) {
    throw new Error('HF-306 raster crop outside viewport');
  }
  let changedPixelsAboveEight = 0;
  let changedPixelsAboveTwentyFour = 0;
  let maximumPerceptualDifference = 0;
  let minimumChangedY = null;
  let maximumChangedY = null;
  const changedRows = new Set();
  for (let y = crop.top; y < endY; y += 1) {
    for (let x = crop.left; x < endX; x += 1) {
      const offset = (y * visible.width + x) * 3;
      const difference = Math.abs(visible.rgb[offset] - hidden.rgb[offset]) * 0.2126
        + Math.abs(visible.rgb[offset + 1] - hidden.rgb[offset + 1]) * 0.7152
        + Math.abs(visible.rgb[offset + 2] - hidden.rgb[offset + 2]) * 0.0722;
      if (difference > 8) {
        changedPixelsAboveEight += 1;
        changedRows.add(y);
        minimumChangedY = minimumChangedY === null ? y : Math.min(minimumChangedY, y);
        maximumChangedY = maximumChangedY === null ? y : Math.max(maximumChangedY, y);
      }
      if (difference > 24) changedPixelsAboveTwentyFour += 1;
      maximumPerceptualDifference = Math.max(maximumPerceptualDifference, difference);
    }
  }
  const pixelCount = crop.width * crop.height;
  return Object.freeze({
    crop: Object.freeze({ ...crop }),
    pixelCount,
    changedPixelsAboveEight,
    changedPixelsAboveTwentyFour,
    materiallyChangedPixelRatio: changedPixelsAboveEight / pixelCount,
    highContrastChangedPixelRatio: changedPixelsAboveTwentyFour / pixelCount,
    maximumPerceptualDifference,
    minimumChangedY,
    maximumChangedY,
    topViewportRatio: minimumChangedY === null ? null : minimumChangedY / visible.height,
    bottomViewportRatio: maximumChangedY === null ? null : maximumChangedY / visible.height,
    changedRowCount: changedRows.size,
    changedRowCoverageRatio: changedRows.size / crop.height,
  });
}

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(expected?.sourceSha ?? '')
    || source.expectedSourceSha !== expected.sourceSha || source.checkoutSourceSha !== expected.sourceSha
    || source.endingCheckoutSourceSha !== expected.sourceSha || source.sourceTreeSha !== expected.sourceTreeSha
    || !SHA40.test(source.sourceTreeSha ?? '') || source.releasePass !== 'PASS 71'
    || source.cleanBefore !== true || source.cleanAfter !== true) failures.push('exact-clean-candidate-a-source');
}

function validateServedCandidate(candidate, expected, failures, label = 'servedCandidate') {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], label, failures);
  if (!object(candidate) || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.sourceSha !== expected?.sourceSha
    || candidate.path !== 'channels/the-big-one' || !SHA256.test(candidate.treeSha256 ?? '')
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2) {
    failures.push(`${label}:exact-staged-candidate-a`);
  }
}

function validateBrowser(browser, failures) {
  exactKeys(browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'productVersion',
    'authenticodeStatus', 'authenticodeSigner', 'userAgents',
  ], 'browser', failures);
  if (!object(browser) || browser.channel !== 'msedge' || browser.installed !== true
    || browser.executableName !== 'msedge.exe' || !SHA256.test(browser.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(browser.productVersion ?? '')
    || browser.authenticodeStatus !== 'Valid' || !/Microsoft Corporation/iu.test(browser.authenticodeSigner ?? '')
    || !Array.isArray(browser.userAgents) || browser.userAgents.length !== PASS71_HF306_RENDERERS.length
    || browser.userAgents.some((userAgent) => !/Edg\//u.test(userAgent))) failures.push('installed-edge-identity');
}

function validateRuntime(runtime, renderer, failures, label) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ], `${label}:runtime`, failures);
  const expectedAdapterClass = renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext';
  const expectedDeviceClass = renderer === 'webgpu' ? 'GPUDevice' : null;
  if (!object(runtime) || runtime.requestedBackend !== renderer || runtime.actualBackend !== renderer
    || runtime.initialized !== true || runtime.adapterClass !== expectedAdapterClass
    || runtime.deviceClass !== expectedDeviceClass || typeof runtime.adapterLabel !== 'string'
    || runtime.adapterLabel.length === 0 || SOFTWARE_ADAPTER.test(runtime.adapterLabel)
    || runtime.softwareAdapter !== false || runtime.deviceLost !== false || runtime.uncapturedErrors !== 0
    || (renderer === 'webgpu' ? runtime.presentationStatus !== 'healthy'
      : runtime.presentationStatus !== 'synchronous')) failures.push(`${label}:native-hardware-runtime`);
}

function validateAssetAudit(record, expected, failures) {
  if (!Array.isArray(record) || record.length !== PASS71_HF306_ASSET_PATHS.length
    || !sameJson(record, expected)) {
    failures.push('exact-candidate-authored-asset-audit');
    return;
  }
  for (const [lod, entry] of record.entries()) {
    exactKeys(entry, ['path', 'lod', 'sha256', 'bytes', 'failures', 'cockpitFraming'], `asset:${lod}`, failures);
    if (entry.path !== PASS71_HF306_ASSET_PATHS[lod] || entry.lod !== lod || !SHA256.test(entry.sha256 ?? '')
      || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !Array.isArray(entry.failures)
      || entry.failures.length !== 0 || !object(entry.cockpitFraming)
      || !Array.isArray(entry.cockpitFraming.failures) || entry.cockpitFraming.failures.length !== 0
      || !Array.isArray(entry.cockpitFraming.cases)
      || !sameJson(entry.cockpitFraming.cases.map((value) => value?.label), PASS71_HF306_PROJECTION_CASES)) {
      failures.push(`asset:${lod}:framing-identity`);
      continue;
    }
    for (const projection of entry.cockpitFraming.cases) {
      if (!Array.isArray(projection.elements) || projection.elements.length !== 4
        || !Array.isArray(projection.headers) || projection.headers.length !== 2
        || projection.elements.some((element) => !finite(element?.topViewportRatio)
          || element.topViewportRatio > 0.24 || !finite(element?.centreClearancePx)
          || element.centreClearancePx < 0)) failures.push(`asset:${lod}:${projection.label}:projection`);
    }
  }
}

function validateFirstPerson(firstPerson, failures, label) {
  exactKeys(firstPerson, [
    'entityId', 'presentationSource', 'visibleMeshNames', 'visibleOutsideSightline',
    'visibleOutsideCockpit', 'dashboardVisible', 'displaysVisible', 'hudVisible',
    'centreSightlineClear', 'weaponVisible', 'overlayLayerExclusive', 'alignment',
  ], `${label}:first-person`, failures);
  if (!object(firstPerson) || typeof firstPerson.entityId !== 'string' || firstPerson.entityId.length === 0
    || firstPerson.presentationSource !== 'project-original-blender-glb'
    || !Array.isArray(firstPerson.visibleMeshNames) || firstPerson.visibleMeshNames.length === 0
    || !Array.isArray(firstPerson.visibleOutsideSightline)
    || !Array.isArray(firstPerson.visibleOutsideCockpit) || firstPerson.visibleOutsideCockpit.length !== 0
    || firstPerson.dashboardVisible !== true || firstPerson.displaysVisible !== true
    || firstPerson.hudVisible !== false || firstPerson.centreSightlineClear !== true
    || firstPerson.weaponVisible !== true || firstPerson.overlayLayerExclusive !== true
    || !object(firstPerson.alignment) || !finite(firstPerson.alignment.pivotErrorM)
    || firstPerson.alignment.pivotErrorM >= 0.001) failures.push(`${label}:authored-first-person-owner`);
}

function validateCamera(camera, failures, label) {
  exactKeys(camera, ['position', 'quaternion', 'fov', 'near', 'far', 'aspect'], `${label}:camera`, failures);
  if (!object(camera) || !finiteVector(camera.position, 3) || !finiteVector(camera.quaternion, 4)
    || !finite(camera.fov) || camera.fov < 35 || camera.fov > 100
    || !finite(camera.near) || camera.near !== 0.08 || !finite(camera.far) || camera.far <= camera.near
    || !finite(camera.aspect) || camera.aspect <= 0) failures.push(`${label}:camera-identity`);
}

function validateViewportReceipt(viewport, expectedViewport, failures, label) {
  exactKeys(viewport, [
    'cssWidth', 'cssHeight', 'devicePixelRatio', 'canvasWidth', 'canvasHeight',
  ], `${label}:viewport`, failures);
  if (!object(viewport) || viewport.cssWidth !== expectedViewport.width
    || viewport.cssHeight !== expectedViewport.height || viewport.devicePixelRatio !== 1
    || viewport.canvasWidth !== expectedViewport.width || viewport.canvasHeight !== expectedViewport.height) {
    failures.push(`${label}:exact-viewport`);
  }
}

function validateVisibleFrame(frame, renderer, expectedViewport, failures, label) {
  exactKeys(frame, [
    'contract', 'renderer', 'completionSemantics', 'entityId', 'simulationFrame',
    'submissionSequence', 'completedSequence', 'camera', 'viewport', 'cockpitRootName',
    'cockpitRootCount', 'activeCockpitRootCount', 'activeLodAsset', 'semanticNodeNames',
    'firstPerson', 'cockpitRootsVisible', 'entityRootVisible', 'cockpitHudVisible',
  ], `${label}:visible-frame`, failures);
  if (!object(frame) || frame.contract !== 'chopper-cockpit-frozen-visible-frame-v1'
    || frame.renderer !== renderer || frame.completionSemantics !== (renderer === 'webgpu'
      ? 'submission-sequence-covered-by-completion-frontier' : 'synchronous-render-return')
    || typeof frame.entityId !== 'string' || frame.entityId.length === 0
    || !Number.isSafeInteger(frame.simulationFrame) || frame.simulationFrame <= 0
    || !Number.isSafeInteger(frame.submissionSequence) || frame.submissionSequence < 0
    || !Number.isSafeInteger(frame.completedSequence) || frame.completedSequence < frame.submissionSequence
    || frame.cockpitRootName !== 'chopper-first-person-cockpit' || frame.cockpitRootCount !== 3
    || frame.activeCockpitRootCount !== 1
    || typeof frame.activeLodAsset !== 'string' || !frame.activeLodAsset.endsWith('pass65-chopper-gunner-lod0.glb')
    || !sameJson(frame.semanticNodeNames, PASS71_HF306_SEMANTIC_NODES)
    || frame.cockpitRootsVisible !== true || frame.entityRootVisible !== true
    || frame.cockpitHudVisible !== true) failures.push(`${label}:visible-frame-owner`);
  validateCamera(frame?.camera, failures, `${label}:visible-frame`);
  validateViewportReceipt(frame?.viewport, expectedViewport, failures, `${label}:visible-frame`);
  validateFirstPerson(frame?.firstPerson, failures, `${label}:visible-frame`);
}

function validateHiddenControl(control, visibleFrame, renderer, expectedViewport, failures, label) {
  exactKeys(control, [
    'contract', 'nonPublishable', 'renderer', 'completionSemantics', 'entityId', 'simulationFrame',
    'officialSubmissionSequence', 'officialCompletedSequence', 'submissionSequence', 'completedSequence',
    'camera', 'viewport', 'cockpitRootName', 'cockpitRootCount', 'activeCockpitRootCount',
    'activeLodAsset', 'semanticNodeNames', 'firstPerson', 'cockpitRootsHiddenDuringSubmission',
    'cockpitRootsRestored', 'entityRootVisibleDuringSubmission', 'cockpitHudVisibleDuringSubmission',
  ], `${label}:hidden-control`, failures);
  if (!object(control) || control.contract !== 'chopper-cockpit-hidden-control-v1'
    || control.nonPublishable !== true || control.renderer !== renderer
    || control.completionSemantics !== visibleFrame?.completionSemantics
    || control.entityId !== visibleFrame?.entityId || control.simulationFrame !== visibleFrame?.simulationFrame
    || control.officialSubmissionSequence !== visibleFrame?.submissionSequence
    || control.officialCompletedSequence !== visibleFrame?.completedSequence
    || !Number.isSafeInteger(control.submissionSequence) || control.submissionSequence < 0
    || !Number.isSafeInteger(control.completedSequence) || control.completedSequence < control.submissionSequence
    || (renderer === 'webgpu' && control.submissionSequence <= control.officialSubmissionSequence)
    || !sameJson(control.camera, visibleFrame?.camera) || !sameJson(control.viewport, visibleFrame?.viewport)
    || control.cockpitRootName !== visibleFrame?.cockpitRootName
    || control.cockpitRootCount !== 3 || control.activeCockpitRootCount !== 1
    || control.activeLodAsset !== visibleFrame?.activeLodAsset
    || !sameJson(control.semanticNodeNames, PASS71_HF306_SEMANTIC_NODES)
    || !sameJson(control.firstPerson, visibleFrame?.firstPerson)
    || control.cockpitRootsHiddenDuringSubmission !== true || control.cockpitRootsRestored !== true
    || control.entityRootVisibleDuringSubmission !== true || control.cockpitHudVisibleDuringSubmission !== true) {
    failures.push(`${label}:exact-same-frame-cockpit-hidden-control`);
  }
  validateCamera(control?.camera, failures, `${label}:hidden-control`);
  validateViewportReceipt(control?.viewport, expectedViewport, failures, `${label}:hidden-control`);
  validateFirstPerson(control?.firstPerson, failures, `${label}:hidden-control`);
}

function validateInstrumentLayout(instruments, viewport, failures, label) {
  exactKeys(instruments, [
    'ids', 'texts', 'rects', 'allVisible', 'allInsideSafeViewport', 'allUnclipped',
    'platformVisible', 'missileStatusVisible', 'missileStatusInsideSafeViewport', 'centreDomOccluders',
    'reticleCentreClear',
  ], `${label}:instruments`, failures);
  const expectedIds = [
    'gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage',
  ];
  if (!object(instruments) || !sameJson(instruments.ids, expectedIds)
    || !Array.isArray(instruments.texts) || instruments.texts.length !== expectedIds.length
    || instruments.texts.some((text) => typeof text !== 'string' || text.length === 0 || /NaN|undefined|null/iu.test(text))
    || !Array.isArray(instruments.rects) || instruments.rects.length !== expectedIds.length
    || instruments.rects.some((rect) => !object(rect) || !['left', 'top', 'right', 'bottom', 'width', 'height']
      .every((key) => finite(rect[key])) || rect.width <= 0 || rect.height <= 0
      || rect.left < -1 || rect.top < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1)
    || instruments.allVisible !== true || instruments.allInsideSafeViewport !== true
    || instruments.allUnclipped !== true || instruments.platformVisible !== true
    || instruments.missileStatusVisible !== true || instruments.missileStatusInsideSafeViewport !== true
    || !Array.isArray(instruments.centreDomOccluders) || instruments.centreDomOccluders.length !== 0
    || instruments.reticleCentreClear !== true) failures.push(`${label}:readable-bounded-instruments-or-centre-dom`);
}

function validateAction(actionReceipt, expectedAction, viewport, failures, label) {
  exactKeys(actionReceipt, [
    'key', 'viewportId', 'action', 'trustedInput', 'startingFrame', 'endingFrame',
    'startingPosition', 'endingPosition', 'positionDeltaM', 'outcome', 'presentation',
    'firstPerson', 'instruments',
  ], label, failures);
  if (!object(actionReceipt) || actionReceipt.key !== `${viewport.id}/${expectedAction}`
    || actionReceipt.viewportId !== viewport.id || actionReceipt.action !== expectedAction
    || actionReceipt.trustedInput !== true || !Number.isSafeInteger(actionReceipt.startingFrame)
    || !Number.isSafeInteger(actionReceipt.endingFrame) || actionReceipt.endingFrame <= actionReceipt.startingFrame
    || !finiteVector(actionReceipt.startingPosition, 3) || !finiteVector(actionReceipt.endingPosition, 3)
    || !finite(actionReceipt.positionDeltaM) || !object(actionReceipt.outcome)
    || !object(actionReceipt.presentation) || !Number.isSafeInteger(actionReceipt.presentation.submissionSequence)
    || !Number.isSafeInteger(actionReceipt.presentation.completedSequence)
    || actionReceipt.presentation.completedSequence < actionReceipt.presentation.submissionSequence
    || !['healthy', 'synchronous'].includes(actionReceipt.presentation.status)
    || actionReceipt.presentation.completionFailures !== 0) failures.push(`${label}:action-frame-or-presentation`);
  if (expectedAction === 'movement' && (!(actionReceipt.positionDeltaM > 0.01)
    || actionReceipt.outcome.controlAction !== 'pilot-control')) failures.push(`${label}:movement-outcome`);
  if (expectedAction === 'fire' && (!(actionReceipt.outcome.weaponActionsAfter > actionReceipt.outcome.weaponActionsBefore)
    || actionReceipt.outcome.controlAction !== 'pilot-control' || actionReceipt.outcome.fire !== true)) {
    failures.push(`${label}:fire-outcome`);
  }
  if (expectedAction === 'missile' && (!(actionReceipt.outcome.missileAmmoAfter < actionReceipt.outcome.missileAmmoBefore)
    || actionReceipt.outcome.controlAction !== 'pilot-control' || actionReceipt.outcome.missileFire !== true)) {
    failures.push(`${label}:missile-outcome`);
  }
  validateFirstPerson(actionReceipt?.firstPerson, failures, label);
  validateInstrumentLayout(actionReceipt?.instruments, viewport, failures, label);
}

function validateRasterSummary(summary, recomputed, viewport, failures, label) {
  exactKeys(summary, ['regions', 'sameFrame', 'sameCamera', 'visibleSha256', 'hiddenControlSha256'], label, failures);
  if (!object(summary) || summary.sameFrame !== true || summary.sameCamera !== true
    || !SHA256.test(summary.visibleSha256 ?? '') || !SHA256.test(summary.hiddenControlSha256 ?? '')
    || summary.visibleSha256 === summary.hiddenControlSha256
    || !sameJson(summary.regions, recomputed)) failures.push(`${label}:recomputed-raster-summary`);
  const sideMinimumRatio = viewport.id === 'mobile' ? 0.002 : 0.001;
  for (const side of ['left', 'right']) {
    const receipt = recomputed[side];
    if (!object(receipt) || receipt.materiallyChangedPixelRatio <= sideMinimumRatio
      || receipt.maximumPerceptualDifference <= 24 || receipt.changedRowCoverageRatio <= 0.18
      || receipt.topViewportRatio === null || receipt.topViewportRatio > 0.24) {
      failures.push(`${label}:${side}-side-structure-attribution`);
    }
  }
  const instruments = recomputed.instruments;
  if (!object(instruments) || instruments.materiallyChangedPixelRatio <= 0.002
    || instruments.maximumPerceptualDifference <= 24) failures.push(`${label}:instrument-attribution`);
  const centre = recomputed.centre;
  if (!object(centre) || centre.materiallyChangedPixelRatio >= 0.005
    || centre.highContrastChangedPixelRatio >= 0.001
    || centre.maximumPerceptualDifference > 24) failures.push(`${label}:centre-corridor-raster-clearance`);
}

function validateAttachments(attachments, failures, label) {
  const expectedKeys = pass71Hf306AttachmentKeys();
  if (!Array.isArray(attachments) || !sameJson(attachments.map((entry) => entry?.key), expectedKeys)) {
    failures.push(`${label}:attachment-key-set`);
    return new Map();
  }
  const decoded = new Map();
  for (const [index, attachment] of attachments.entries()) {
    const identity = attachmentIdentity(attachment?.key);
    exactKeys(attachment, [
      'key', 'kind', 'viewportId', 'action', 'mimeType', 'encoding', 'byteLength',
      'width', 'height', 'sha256', 'pngBase64',
    ], `${label}:attachment:${index}`, failures);
    let bytes = null;
    let png = null;
    try {
      bytes = decodeCanonicalBase64(attachment?.pngBase64);
      if (!bytes) throw new Error('base64');
      png = decodePngRgb(bytes);
    } catch {
      failures.push(`${label}:attachment:${index}:decoded-png`);
    }
    const viewport = viewportById(identity?.viewportId);
    if (!identity || !viewport || !sameJson({
      key: attachment?.key, kind: attachment?.kind, viewportId: attachment?.viewportId,
      action: attachment?.action,
    }, identity) || attachment?.mimeType !== 'image/png'
      || attachment?.encoding !== 'lossless-png-embedded-base64'
      || !bytes || !png || attachment.byteLength !== bytes.length || attachment.sha256 !== sha256(bytes)
      || attachment.width !== viewport.width || attachment.height !== viewport.height
      || png.width !== viewport.width || png.height !== viewport.height) {
      failures.push(`${label}:attachment:${index}:identity-or-bytes`);
    } else decoded.set(attachment.key, { ...png, sha256: attachment.sha256 });
  }
  return decoded;
}

function validateViewportCase(viewportCase, renderer, viewport, decoded, failures, label) {
  exactKeys(viewportCase, [
    'viewport', 'visibleFrame', 'hiddenControl', 'raster', 'actions', 'postControlRestored',
  ], label, failures);
  if (!object(viewportCase) || !sameJson(viewportCase.viewport, viewport)
    || viewportCase.postControlRestored !== true) failures.push(`${label}:viewport-identity-or-restore`);
  validateVisibleFrame(viewportCase?.visibleFrame, renderer, viewport, failures, label);
  validateHiddenControl(viewportCase?.hiddenControl, viewportCase?.visibleFrame, renderer, viewport, failures, label);
  if (!Array.isArray(viewportCase?.actions) || viewportCase.actions.length !== PASS71_HF306_ACTIONS.length
    || !sameJson(viewportCase.actions.map((action) => action?.action), PASS71_HF306_ACTIONS)) {
    failures.push(`${label}:action-set`);
  } else viewportCase.actions.forEach((action, index) => (
    validateAction(action, PASS71_HF306_ACTIONS[index], viewport, failures, `${label}:action:${index}`)
  ));
  const visible = decoded.get(`${viewport.id}/visible`);
  const hidden = decoded.get(`${viewport.id}/hidden-control`);
  if (!visible || !hidden) {
    failures.push(`${label}:attribution-pair-missing`);
    return;
  }
  const regions = rasterRegions(viewport);
  const recomputed = Object.freeze(Object.fromEntries(Object.entries(regions).map(([name, crop]) => (
    [name, pass71Hf306RasterDifference(visible, hidden, crop)]
  ))));
  validateRasterSummary(viewportCase?.raster, recomputed, viewport, failures, `${label}:raster`);
}

function validateScope(scope, renderer, expected, failures) {
  const label = `scope:${renderer}`;
  exactKeys(scope, [
    'renderer', 'expectedSourceSha', 'checkoutSourceSha', 'servedCandidate', 'browser',
    'runtime', 'viewportCases', 'attachments', 'runtimeErrorLog', 'faults',
  ], label, failures);
  if (!object(scope) || scope.renderer !== renderer || scope.expectedSourceSha !== expected?.sourceSha
    || scope.checkoutSourceSha !== expected?.sourceSha) failures.push(`${label}:exact-source`);
  validateServedCandidate(scope?.servedCandidate, expected, failures, `${label}:served-candidate`);
  exactKeys(scope?.browser, ['version', 'userAgent'], `${label}:browser`, failures);
  if (typeof scope?.browser?.version !== 'string' || scope.browser.version.length === 0
    || !/Edg\//u.test(scope?.browser?.userAgent ?? '')) failures.push(`${label}:edge-runtime-identity`);
  validateRuntime(scope?.runtime, renderer, failures, label);
  const decoded = validateAttachments(scope?.attachments, failures, label);
  if (!Array.isArray(scope?.viewportCases) || scope.viewportCases.length !== PASS71_HF306_VIEWPORTS.length
    || !sameJson(scope.viewportCases.map((entry) => entry?.viewport?.id), PASS71_HF306_VIEWPORTS.map((entry) => entry.id))) {
    failures.push(`${label}:viewport-set`);
  } else scope.viewportCases.forEach((viewportCase, index) => (
    validateViewportCase(viewportCase, renderer, PASS71_HF306_VIEWPORTS[index], decoded, failures, `${label}:viewport:${index}`)
  ));
  if (scope?.runtimeErrorLog !== '' || !Array.isArray(scope?.faults) || scope.faults.length !== 0) {
    failures.push(`${label}:swallowed-or-browser-errors`);
  }
}

export function pass71Hf306EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF306_COCKPIT_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF306_COCKPIT_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF306_COCKPIT_EVIDENCE.kind
    || record.contract !== PASS71_HF306_COCKPIT_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF306_COCKPIT_EVIDENCE.feedbackId
    || record.status !== 'passed'
    || record.coverageDisposition !== PASS71_HF306_COCKPIT_EVIDENCE.coverageDisposition
    || record.closesFeedback !== true) return ['hf306-identity-status-or-closure'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closesFeedback', 'startedAt', 'completedAt', 'source',
    'servedCandidate', 'environment', 'browser', 'tooling', 'coverage', 'assetAudit',
    'ownerSourceAudit', 'scopes', 'unknowns', 'faults', 'receiptSha256',
  ], 'record', failures);
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  validateBrowser(record.browser, failures);
  const toolingKeys = Object.keys(PASS71_HF306_TOOL_PATHS).map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingKeys)
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) {
    failures.push('candidate-a-tooling-hashes');
  }
  if (!sameJson(record.coverage, PASS71_HF306_COVERAGE)) failures.push('literal-coverage-contract');
  validateAssetAudit(record.assetAudit, expected.assetAudit, failures);
  if (!sameJson(record.ownerSourceAudit, expected.ownerSourceAudit)
    || record.ownerSourceAudit?.contract !== 'atomic-acres/pass71-hf306-cockpit-owner-source-audit@1'
    || !Array.isArray(record.ownerSourceAudit?.failures) || record.ownerSourceAudit.failures.length !== 0) {
    failures.push('real-owner-source-audit');
  }
  if (!Array.isArray(record.scopes) || record.scopes.length !== PASS71_HF306_RENDERERS.length
    || !sameJson(record.scopes.map((scope) => scope?.renderer), PASS71_HF306_RENDERERS)) {
    failures.push('exact-renderer-scope-set');
  } else record.scopes.forEach((scope, index) => (
    validateScope(scope, PASS71_HF306_RENDERERS[index], expected, failures)
  ));
  if (!sameJson(record.unknowns, PASS71_HF306_UNKNOWNS)) failures.push('truthful-native-unknowns');
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf306RecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf306Evidence(record, expected) {
  const failures = pass71Hf306EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-306 cockpit evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf306EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF306_COCKPIT_DESCRIPTOR,
    closesFeedback: true,
    validate(record, context) {
      try {
        const sourceSha = context?.sourceSha;
        const repositoryRoot = context?.repositoryRoot;
        return pass71Hf306EvidenceFailures(record, {
          sourceSha,
          sourceTreeSha: context?.options?.pass71Hf306SourceTreeSha
            ?? pass71Hf306SourceTreeAtSource(repositoryRoot, sourceSha),
          tooling: context?.options?.pass71Hf306Tooling
            ?? pass71Hf306ToolingHashesAtSource(repositoryRoot, sourceSha),
          assetAudit: context?.options?.pass71Hf306AssetAudit
            ?? pass71Hf306AssetAuditAtSource(repositoryRoot, sourceSha),
          ownerSourceAudit: context?.options?.pass71Hf306OwnerSourceAudit
            ?? pass71Hf306OwnerSourceAuditAtSource(repositoryRoot, sourceSha),
        });
      } catch (error) {
        return [`hf306-tooling-or-owner-source-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF306_COCKPIT_REGISTRY_ENTRY = createPass71Hf306EvidenceRegistryEntry();

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function fixturePng(width, height, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixel(x, y);
      const offset = row + 1 + x * 3;
      rows[offset] = red;
      rows[offset + 1] = green;
      rows[offset + 2] = blue;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fixtureAttachment(key, bytes) {
  const identity = attachmentIdentity(key);
  const viewport = viewportById(identity.viewportId);
  return {
    ...identity,
    mimeType: 'image/png',
    encoding: 'lossless-png-embedded-base64',
    byteLength: bytes.length,
    width: viewport.width,
    height: viewport.height,
    sha256: sha256(bytes),
    pngBase64: bytes.toString('base64'),
  };
}

function fixtureFirstPerson(entityId) {
  return {
    entityId,
    presentationSource: 'project-original-blender-glb',
    visibleMeshNames: ['pass65-chopper-cockpit-static-batch-1'],
    visibleOutsideSightline: ['pass65-chopper-cockpit-static-batch-1'],
    visibleOutsideCockpit: [],
    dashboardVisible: true,
    displaysVisible: true,
    hudVisible: false,
    centreSightlineClear: true,
    weaponVisible: true,
    overlayLayerExclusive: true,
    alignment: {
      cameraWorldPosition: [0, 10, 0],
      cameraPivotWorldPosition: [0, 10, 0],
      cockpitWorldPosition: [0, 10, 0],
      parentName: 'Pass65Chopper_LOD0',
      parentWorldScale: [1, 1, 1],
      pivotErrorM: 0,
      dashboardCameraSpacePosition: [0, -0.3, -0.9],
      hudCameraSpacePosition: [0, 0.1, -1],
      weaponCameraSpacePosition: [0.1, -0.2, -1.2],
    },
  };
}

function fixtureInstrumentLayout(viewport) {
  const ids = ['gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage'];
  const rects = ids.map((_, index) => ({
    left: 8 + (index % 3) * 70,
    top: viewport.height - 90 + Math.floor(index / 3) * 35,
    right: 68 + (index % 3) * 70,
    bottom: viewport.height - 60 + Math.floor(index / 3) * 35,
    width: 60,
    height: 30,
  }));
  return {
    ids,
    texts: ['100', '30', '12M', '4', '30.0', '0'],
    rects,
    allVisible: true,
    allInsideSafeViewport: true,
    allUnclipped: true,
    platformVisible: true,
    missileStatusVisible: true,
    missileStatusInsideSafeViewport: true,
    centreDomOccluders: [],
    reticleCentreClear: true,
  };
}

function fixtureAction(viewport, action, index, firstPerson) {
  const outcome = action === 'movement'
    ? { controlAction: 'pilot-control', thrustQ: 1 }
    : action === 'fire'
      ? { controlAction: 'pilot-control', fire: true, weaponActionsBefore: 0, weaponActionsAfter: 1 }
      : { controlAction: 'pilot-control', missileFire: true, missileAmmoBefore: 6, missileAmmoAfter: 5 };
  return {
    key: `${viewport.id}/${action}`,
    viewportId: viewport.id,
    action,
    trustedInput: true,
    startingFrame: 100 + index * 10,
    endingFrame: 104 + index * 10,
    startingPosition: [0, 10, 0],
    endingPosition: action === 'movement' ? [0, 10, -0.1] : [0, 10, 0],
    positionDeltaM: action === 'movement' ? 0.1 : 0,
    outcome,
    presentation: {
      status: 'synchronous', submissionSequence: 0, completedSequence: 0, completionFailures: 0,
    },
    firstPerson,
    instruments: fixtureInstrumentLayout(viewport),
  };
}

function fixtureAssetAudit() {
  return PASS71_HF306_ASSET_PATHS.map((path, lod) => ({
    path,
    lod,
    sha256: String(lod + 1).repeat(64),
    bytes: 500_000 + lod,
    failures: [],
    cockpitFraming: {
      failures: [],
      cases: PASS71_HF306_PROJECTION_CASES.map((label) => ({
        label,
        width: label.includes('ultrawide') ? 2560 : label.includes('1080p') ? 1920 : label.includes('portrait') ? 390 : label.includes('landscape') ? 844 : 1280,
        height: label.includes('1080p') ? 1080 : label.includes('portrait') ? 844 : label.includes('landscape') ? 390 : 720,
        fov: label.includes('min-fov') ? 70 : 100,
        reticleDiameter: 126,
        elements: ['left-pillar', 'right-pillar', 'left-glow', 'right-glow'].map((name) => ({
          kind: name.includes('pillar') ? 'pillar' : 'glow',
          side: name.startsWith('left') ? 'left' : 'right',
          topViewportRatio: 0.2,
          centreClearancePx: 10,
        })),
        headers: [
          { kind: 'header', minimumTopPx: 10, maximumBottomPx: 100 },
          { kind: 'header-glow', minimumTopPx: 12, maximumBottomPx: 98 },
        ],
      })),
    },
  }));
}

export function createPass71Hf306EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'b'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(Object.keys(PASS71_HF306_TOOL_PATHS).map(
    (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
  ));
  const assetAudit = options.assetAudit ?? fixtureAssetAudit();
  const ownerSourceAudit = options.ownerSourceAudit ?? {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf306-cockpit-owner-source-audit@1',
    failures: [],
  };
  const servedCandidate = {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
    path: 'channels/the-big-one', treeSha256: 'c'.repeat(64), exactRootFileCount: 500,
  };
  const scopes = PASS71_HF306_RENDERERS.map((renderer, rendererIndex) => {
    const attachments = [];
    const viewportCases = PASS71_HF306_VIEWPORTS.map((viewport, viewportIndex) => {
      const centre = rasterRegions(viewport).centre;
      const hiddenPng = fixturePng(viewport.width, viewport.height, () => [20, 30, 40]);
      const visiblePng = fixturePng(viewport.width, viewport.height, (x, y) => {
        const inCentre = x >= centre.left && x < centre.left + centre.width
          && y >= centre.top && y < centre.top + centre.height;
        const side = x < viewport.width * 0.4 || x >= viewport.width * 0.6;
        const upperSide = side && y >= Math.floor(viewport.height * 0.1) && y < Math.floor(viewport.height * 0.72);
        const instrument = x < viewport.width * 0.58 && y >= viewport.height * 0.72;
        return !inCentre && (upperSide || instrument) ? [210, 230, 180] : [20, 30, 40];
      });
      attachments.push(fixtureAttachment(`${viewport.id}/visible`, visiblePng));
      attachments.push(fixtureAttachment(`${viewport.id}/hidden-control`, hiddenPng));
      for (const action of PASS71_HF306_ACTIONS) attachments.push(fixtureAttachment(`${viewport.id}/${action}`, visiblePng));
      const firstPerson = fixtureFirstPerson(`fixture-chopper-${renderer}`);
      const camera = { position: [0, 10, 0], quaternion: [0, 0, 0, 1], fov: 70, near: 0.08, far: 180, aspect: viewport.width / viewport.height };
      const viewportReceipt = { cssWidth: viewport.width, cssHeight: viewport.height, devicePixelRatio: 1, canvasWidth: viewport.width, canvasHeight: viewport.height };
      const sequence = renderer === 'webgpu' ? 100 + viewportIndex * 10 : 0;
      const visibleFrame = {
        contract: 'chopper-cockpit-frozen-visible-frame-v1',
        renderer,
        completionSemantics: renderer === 'webgpu' ? 'submission-sequence-covered-by-completion-frontier' : 'synchronous-render-return',
        entityId: firstPerson.entityId,
        simulationFrame: 100 + viewportIndex,
        submissionSequence: sequence,
        completedSequence: sequence,
        camera,
        viewport: viewportReceipt,
        cockpitRootName: 'chopper-first-person-cockpit',
        cockpitRootCount: 3,
        activeCockpitRootCount: 1,
        activeLodAsset: '/assets/original/models/support/pass65-chopper-gunner-lod0.glb',
        semanticNodeNames: [...PASS71_HF306_SEMANTIC_NODES],
        firstPerson,
        cockpitRootsVisible: true,
        entityRootVisible: true,
        cockpitHudVisible: true,
      };
      const hiddenControl = {
        contract: 'chopper-cockpit-hidden-control-v1',
        nonPublishable: true,
        renderer,
        completionSemantics: visibleFrame.completionSemantics,
        entityId: visibleFrame.entityId,
        simulationFrame: visibleFrame.simulationFrame,
        officialSubmissionSequence: sequence,
        officialCompletedSequence: sequence,
        submissionSequence: renderer === 'webgpu' ? sequence + 1 : 0,
        completedSequence: renderer === 'webgpu' ? sequence + 1 : 0,
        camera,
        viewport: viewportReceipt,
        cockpitRootName: visibleFrame.cockpitRootName,
        cockpitRootCount: 3,
        activeCockpitRootCount: 1,
        activeLodAsset: visibleFrame.activeLodAsset,
        semanticNodeNames: [...PASS71_HF306_SEMANTIC_NODES],
        firstPerson,
        cockpitRootsHiddenDuringSubmission: true,
        cockpitRootsRestored: true,
        entityRootVisibleDuringSubmission: true,
        cockpitHudVisibleDuringSubmission: true,
      };
      const visible = decodePngRgb(visiblePng);
      const hidden = decodePngRgb(hiddenPng);
      const regions = Object.fromEntries(Object.entries(rasterRegions(viewport)).map(([name, crop]) => (
        [name, pass71Hf306RasterDifference(visible, hidden, crop)]
      )));
      return {
        viewport,
        visibleFrame,
        hiddenControl,
        raster: {
          regions,
          sameFrame: true,
          sameCamera: true,
          visibleSha256: sha256(visiblePng),
          hiddenControlSha256: sha256(hiddenPng),
        },
        actions: PASS71_HF306_ACTIONS.map((action, index) => {
          const receipt = fixtureAction(viewport, action, index, firstPerson);
          receipt.presentation.status = renderer === 'webgpu' ? 'healthy' : 'synchronous';
          receipt.presentation.submissionSequence = renderer === 'webgpu' ? sequence + 2 + index : 0;
          receipt.presentation.completedSequence = receipt.presentation.submissionSequence;
          return receipt;
        }),
        postControlRestored: true,
      };
    });
    return {
      renderer,
      expectedSourceSha: sourceSha,
      checkoutSourceSha: sourceSha,
      servedCandidate: { ...servedCandidate },
      browser: { version: '151.0.0.0', userAgent: 'Mozilla/5.0 Edg/151.0.0.0' },
      runtime: {
        requestedBackend: renderer,
        actualBackend: renderer,
        initialized: true,
        adapterClass: renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
        deviceClass: renderer === 'webgpu' ? 'GPUDevice' : null,
        adapterLabel: 'NVIDIA GeForce RTX 5080',
        softwareAdapter: false,
        deviceLost: false,
        uncapturedErrors: 0,
        presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
      },
      viewportCases,
      attachments,
      runtimeErrorLog: '',
      faults: [],
    };
  });
  const record = {
    ...PASS71_HF306_COCKPIT_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T20:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T20:03:00.000Z',
    source: {
      expectedSourceSha: sourceSha,
      checkoutSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha,
      sourceTreeSha,
      releasePass: 'PASS 71',
      cleanBefore: true,
      cleanAfter: true,
    },
    servedCandidate,
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'd'.repeat(64),
      productVersion: '151.0.0.0', authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Microsoft Corporation',
      userAgents: scopes.map((scope) => scope.browser.userAgent),
    },
    tooling: { ...tooling },
    coverage: JSON.parse(JSON.stringify(PASS71_HF306_COVERAGE)),
    assetAudit: JSON.parse(JSON.stringify(assetAudit)),
    ownerSourceAudit: JSON.parse(JSON.stringify(ownerSourceAudit)),
    scopes,
    unknowns: [...PASS71_HF306_UNKNOWNS],
    faults: [],
  };
  record.receiptSha256 = pass71Hf306RecordSha256(record);
  return record;
}
