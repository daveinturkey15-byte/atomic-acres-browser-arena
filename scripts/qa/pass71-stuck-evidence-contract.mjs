import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

export const PASS71_STUCK_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-310',
  kind: 'pass71-hf310-stuck-two-peer-raster-component',
  contract: 'atomic-acres/pass71-hf310-stuck-two-peer-raster@1',
  gate: 'pass71-exact-sha-installed-chrome-two-peer-stuck-raster-v1',
  sources: Object.freeze(['semtex', 'explosive-crossbow']),
  audiences: Object.freeze(['attacker', 'victim']),
  layouts: Object.freeze([
    Object.freeze({ id: 'desktop', width: 1_280, height: 720, reducedSensory: false }),
    Object.freeze({ id: 'mobile-landscape', width: 844, height: 390, reducedSensory: false }),
    Object.freeze({ id: 'reduced-sensory', width: 1_280, height: 720, reducedSensory: true }),
  ]),
  frameCount: 12,
});

export const PASS71_STUCK_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: 'HF-310',
  kind: PASS71_STUCK_EVIDENCE.kind,
  minimumCount: 1,
  maximumCount: 1,
});

export const PASS71_STUCK_EVIDENCE_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-stuck-evidence.mjs',
  verifier: 'scripts/qa/verify-pass71-stuck-evidence.mjs',
  contract: 'scripts/qa/pass71-stuck-evidence-contract.mjs',
  contractTypes: 'scripts/qa/pass71-stuck-evidence-contract.d.mts',
  contractTest: 'scripts/qa/pass71-stuck-evidence-contract.test.mjs',
  spec: 'tests/e2e/pass66-qoder-multiplayer-authority.spec.ts',
  e2eSupport: 'tests/e2e/pass66-e2e-support.ts',
  playwrightConfig: 'playwright.config.ts',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  verificationWorkflow: '.github/workflows/verify.yml',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
  executableIdentity: 'scripts/qa/pass71-edge-executable-identity.mjs',
  ownedBrowserContract: 'scripts/qa/pass66-owned-browser-verifier-contract.mjs',
  nativeUserAgentContract: 'scripts/qa/pass70-cross-browser-native-user-agent-contract.mjs',
  multiplayerBrowserContract: 'scripts/qa/pass66-multiplayer-stability-contract.mjs',
  hudStyles: 'src/ui/pass65-hud.css',
  menuShell: 'src/ui/pass64-shell.ts',
  accessibilitySettings: 'src/pass65-settings.ts',
  legacyMain: 'src/legacy-main.ts',
  stickyPresentation: 'src/sticky-victim-feedback.ts',
  stickyAuthority: 'src/remote-sticky-attachment-authority.ts',
});

export const PASS71_STUCK_CLAIMS = Object.freeze({
  observed: 'Installed Chrome rendered the canonical 500 ms STUCK warning for both peers from the host-authoritative QA attachment projection in all twelve declared source, audience and layout cells.',
  inference: 'The retained lossless rasters and authority identifiers support the bounded claim that central STUCK feedback is visible to attacker and victim on desktop, supported mobile landscape and real reduced-sensory presentation.',
  assumption: 'The canonical QA attachment projection exercises the same receiver attachment and host result authorities consumed after a physical sticky contact.',
  unknown: 'This bounded QA authority projection does not prove physical projectile flight or contact.',
  falsifiers: 'Any missing cell, source or peer mismatch, non-500 ms onset, off-centre bounds, style/accessibility drift, weak red panel raster, byte/hash mismatch, browser or candidate drift, or unexpected fault fails the record.',
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAXIMUM_FRAME_BYTES = 5 * 1024 * 1024;
const WARNING_DURATION_MS = 500;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function exactKeys(value, expected, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...expected].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeNonNegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isoTimestamp(value) {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function close(left, right, tolerance = 0.001) {
  return finite(left) && finite(right) && Math.abs(left - right) <= tolerance;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function pass71StuckEvidenceCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 STUCK evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71StuckEvidenceRecordSha256(record) {
  return createHash('sha256').update(pass71StuckEvidenceCanonicalBytes(record)).digest('hex');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

export function pass71StuckEvidenceToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_STUCK_EVIDENCE_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256File(resolve(repositoryRoot, path))],
  )));
}

export function pass71StuckEvidenceToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 STUCK tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_STUCK_EVIDENCE_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    ))],
  )));
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('invalid PNG signature');
  }
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const compressed = [];
  let ended = false;
  let chunkIndex = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('truncated PNG chunk');
    const data = bytes.subarray(dataStart, dataEnd);
    const declaredCrc = bytes.readUInt32BE(dataEnd);
    if (declaredCrc !== crc32(bytes.subarray(offset + 4, dataEnd))) throw new Error('invalid PNG chunk CRC');
    if (chunkIndex === 0 && type !== 'IHDR') throw new Error('PNG IHDR must be first');
    if (type === 'IHDR') {
      if (length !== 13 || width !== null || chunkIndex !== 0) throw new Error('invalid PNG IHDR');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') {
      if (length !== 0 || dataEnd + 4 !== bytes.length) throw new Error('invalid PNG end');
      ended = true;
      break;
    }
    offset = dataEnd + 4;
    chunkIndex += 1;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (!ended || !safeNonNegative(width) || width < 1 || !safeNonNegative(height) || height < 1
    || width > 1_280 || height > 720
    || bitDepth !== 8 || channels === null || interlace !== 0 || compressed.length < 1) {
    throw new Error('unsupported PNG encoding');
  }
  const rowBytes = width * channels;
  const expectedLength = (rowBytes + 1) * height;
  const filtered = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedLength });
  if (filtered.length !== expectedLength) throw new Error('invalid PNG scanline length');
  const pixels = Buffer.allocUnsafe(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    if (filter > 4) throw new Error('invalid PNG filter');
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = filtered[sourceOffset + x];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const up = y > 0 ? pixels[rowOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowOffset + x - rowBytes - channels] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : paeth(left, up, upperLeft);
      pixels[rowOffset + x] = (encoded + predictor) & 0xff;
    }
    sourceOffset += rowBytes;
  }
  return Object.freeze({ width, height, channels, pixels });
}

export function pass71StuckRasterMetrics(pngBytes, bounds) {
  const decoded = decodePng(pngBytes);
  if (!object(bounds) || !finite(bounds.left) || !finite(bounds.top)
    || !finite(bounds.width) || !finite(bounds.height)) throw new Error('invalid STUCK warning bounds');
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const width = Math.max(1, Math.min(decoded.width - left, Math.ceil(bounds.width)));
  const height = Math.max(1, Math.min(decoded.height - top, Math.ceil(bounds.height)));
  if (left >= decoded.width || top >= decoded.height) throw new Error('STUCK warning bounds escape the raster');
  let brightRedPixels = 0;
  let darkPanelPixels = 0;
  for (let y = top; y < top + height; y += 1) for (let x = left; x < left + width; x += 1) {
    const offset = (y * decoded.width + x) * decoded.channels;
    const red = decoded.pixels[offset];
    const green = decoded.pixels[offset + 1];
    const blue = decoded.pixels[offset + 2];
    if (red >= 120 && red >= green + 40 && red >= blue + 30) brightRedPixels += 1;
    if (red >= 18 && red <= 105 && red >= green * 1.35 && red >= blue * 1.2) darkPanelPixels += 1;
  }
  const pixelCount = width * height;
  return Object.freeze({
    imageWidth: decoded.width,
    imageHeight: decoded.height,
    crop: Object.freeze({ left, top, width, height }),
    pixelCount,
    brightRedPixels,
    darkPanelPixels,
    brightRedFraction: brightRedPixels / pixelCount,
    darkPanelFraction: darkPanelPixels / pixelCount,
  });
}

function expectedFrameCells() {
  return PASS71_STUCK_EVIDENCE.layouts.flatMap((layout) => (
    PASS71_STUCK_EVIDENCE.sources.flatMap((source) => (
      PASS71_STUCK_EVIDENCE.audiences.map((audience) => ({ layout, source, audience }))
    ))
  ));
}

function validateFrame(frame, expected, prefix, failures) {
  exactKeys(frame, [
    'id', 'layout', 'source', 'audience', 'timing', 'warning', 'accessibility',
    'pixels', 'image', 'authority',
  ], prefix, failures);
  const expectedId = `${expected.layout.id}-${expected.source}-${expected.audience}`;
  if (!object(frame) || frame.id !== expectedId || frame.source !== expected.source
    || frame.audience !== expected.audience) failures.push(`${prefix}:identity`);

  exactKeys(frame?.layout, ['id', 'width', 'height', 'deviceScaleFactor', 'reducedSensory'], `${prefix}:layout`, failures);
  if (!sameJson(frame?.layout, { ...expected.layout, deviceScaleFactor: 1 })) failures.push(`${prefix}:layout-contract`);

  const authority = frame?.authority;
  exactKeys(authority, ['projection', 'targetId', 'targetLifeId', 'actionNonce', 'canonicalNonce'], `${prefix}:authority`, failures);
  if (!object(authority) || authority.projection !== 'canonical-qa-sticky-authority'
    || !nonEmpty(authority.targetId) || authority.targetId.length > 80
    || !safeNonNegative(authority.targetLifeId) || !safeNonNegative(authority.actionNonce)
    || !safeNonNegative(authority.canonicalNonce)) failures.push(`${prefix}:authority-identity`);

  const timing = frame?.timing;
  exactKeys(timing, [
    'presentedAtMs', 'expiresAtMs', 'captureStartedAtMs', 'captureCompletedAtMs',
    'visibleAtCaptureStart', 'visibleAtCaptureCompletion', 'hiddenAtMs',
    'captureStartedAtEpochMs', 'durationMs', 'captureDelayMs',
    'captureDurationMs', 'remainingAtCaptureMs', 'hideLatenessMs',
  ], `${prefix}:timing`, failures);
  if (!object(timing) || !finite(timing.presentedAtMs) || !finite(timing.expiresAtMs)
    || !finite(timing.captureStartedAtMs) || !finite(timing.captureCompletedAtMs)
    || timing.visibleAtCaptureStart !== true || timing.visibleAtCaptureCompletion !== true
    || !finite(timing.hiddenAtMs)
    || !safeNonNegative(timing.captureStartedAtEpochMs)
    || timing.expiresAtMs - timing.presentedAtMs !== WARNING_DURATION_MS
    || timing.durationMs !== WARNING_DURATION_MS
    || timing.captureStartedAtMs < timing.presentedAtMs
    || timing.captureCompletedAtMs < timing.captureStartedAtMs
    || timing.captureCompletedAtMs >= timing.expiresAtMs
    || timing.hiddenAtMs < timing.expiresAtMs || timing.hiddenAtMs - timing.expiresAtMs > 750
    || !close(timing.captureDelayMs, timing.captureStartedAtMs - timing.presentedAtMs)
    || !close(timing.captureDurationMs, timing.captureCompletedAtMs - timing.captureStartedAtMs)
    || !close(timing.remainingAtCaptureMs, timing.expiresAtMs - timing.captureCompletedAtMs)
    || !close(timing.hideLatenessMs, timing.hiddenAtMs - timing.expiresAtMs)) {
    failures.push(`${prefix}:500ms-onset-timing`);
  }

  const warning = frame?.warning;
  exactKeys(warning, [
    'visible', 'label', 'sublabel', 'dataset', 'style', 'bounds', 'viewportCentre', 'centreErrorPx',
  ], `${prefix}:warning`, failures);
  exactKeys(warning?.dataset, [
    'source', 'audience', 'targetId', 'targetLifeId', 'actionNonce', 'presentedAtMs', 'expiresAtMs',
  ], `${prefix}:dataset`, failures);
  if (!object(warning) || warning.visible !== true
    || warning.label !== 'STUCK' || warning.sublabel !== 'EXPLOSIVE ATTACHED'
    || warning.dataset?.source !== expected.source || warning.dataset?.audience !== expected.audience
    || warning.dataset?.targetId !== authority?.targetId
    || warning.dataset?.targetLifeId !== authority?.targetLifeId
    || warning.dataset?.actionNonce !== authority?.actionNonce
    || warning.dataset?.presentedAtMs !== timing?.presentedAtMs
    || warning.dataset?.expiresAtMs !== timing?.expiresAtMs) failures.push(`${prefix}:warning-authority`);

  const style = warning?.style;
  exactKeys(style, [
    'warningDurationCss', 'position', 'zIndex', 'display', 'textAlign', 'pointerEvents',
    'animationName', 'animationDuration', 'boxShadow', 'backgroundColor',
    'borderTopColor', 'borderTopWidth', 'borderLeftWidth',
  ], `${prefix}:style`, failures);
  const reduced = expected.layout.reducedSensory;
  if (!object(style) || style.warningDurationCss !== '500ms' || style.position !== 'fixed'
    || style.zIndex !== 120 || style.display !== 'grid' || style.textAlign !== 'center'
    || style.pointerEvents !== 'none' || style.borderTopColor !== 'rgb(255, 58, 50)'
    || style.borderTopWidth !== '2px' || style.borderLeftWidth !== '5px'
    || style.backgroundColor !== (reduced ? 'rgba(43, 1, 1, 0.96)' : 'rgba(43, 1, 1, 0.92)')
    || (reduced ? style.animationName !== 'none' || style.boxShadow !== 'none'
      : style.animationName !== 'sticky-warning-flash' || style.animationDuration !== '0.5s'
        || style.boxShadow === 'none')) failures.push(`${prefix}:computed-style`);

  const bounds = warning?.bounds;
  const centre = warning?.viewportCentre;
  exactKeys(bounds, ['left', 'top', 'width', 'height'], `${prefix}:bounds`, failures);
  exactKeys(centre, ['x', 'y'], `${prefix}:viewport-centre`, failures);
  const calculatedCentreError = object(bounds) && object(centre)
    ? Math.hypot(bounds.left + bounds.width * 0.5 - centre.x, bounds.top + bounds.height * 0.5 - centre.y)
    : Number.NaN;
  if (!object(bounds) || !object(centre) || !finite(bounds.left) || !finite(bounds.top)
    || !finite(bounds.width) || bounds.width < 240 || bounds.width > 420
    || !finite(bounds.height) || bounds.height < 60 || bounds.height > 140
    || bounds.left < 0 || bounds.top < 0
    || bounds.left + bounds.width > expected.layout.width + 0.01
    || bounds.top + bounds.height > expected.layout.height + 0.01
    || centre.x !== expected.layout.width / 2 || centre.y !== expected.layout.height / 2
    || !close(warning.centreErrorPx, calculatedCentreError, 0.01)
    || warning.centreErrorPx > 1) failures.push(`${prefix}:true-viewport-centre`);

  const accessibility = frame?.accessibility;
  exactKeys(accessibility, [
    'requestedReducedSensoryEffects', 'effectiveReducedSensory', 'reasons',
    'htmlDataReducedSensory', 'presentation',
  ], `${prefix}:accessibility`, failures);
  if (!object(accessibility)
    || accessibility.requestedReducedSensoryEffects !== reduced
    || accessibility.effectiveReducedSensory !== reduced
    || accessibility.htmlDataReducedSensory !== String(reduced)
    || accessibility.presentation !== (reduced ? 'reduced-static' : 'standard-animated')
    || !Array.isArray(accessibility.reasons)
    || accessibility.reasons.some((reason) => typeof reason !== 'string')
    || (reduced && !accessibility.reasons.includes('Reduced sensory effects'))
    || (!reduced && accessibility.reasons.length !== 0)) failures.push(`${prefix}:real-reduced-sensory`);

  const image = frame?.image;
  exactKeys(image, ['mimeType', 'width', 'height', 'byteLength', 'sha256', 'dataBase64'], `${prefix}:image`, failures);
  let imageBytes = null;
  let metrics = null;
  try {
    if (!object(image) || image.mimeType !== 'image/png' || !nonEmpty(image.dataBase64)
      || image.dataBase64.length > Math.ceil(MAXIMUM_FRAME_BYTES * 4 / 3) + 4
      || Buffer.from(image.dataBase64, 'base64').toString('base64') !== image.dataBase64) {
      throw new Error('non-canonical embedded PNG');
    }
    imageBytes = Buffer.from(image.dataBase64, 'base64');
    if (image.byteLength !== imageBytes.length || imageBytes.length < 64
      || imageBytes.length > MAXIMUM_FRAME_BYTES || image.sha256 !== sha256(imageBytes)
      || image.width !== expected.layout.width || image.height !== expected.layout.height) {
      throw new Error('embedded PNG identity mismatch');
    }
    metrics = pass71StuckRasterMetrics(imageBytes, bounds);
    if (metrics.imageWidth !== image.width || metrics.imageHeight !== image.height) {
      throw new Error('embedded PNG dimensions mismatch');
    }
  } catch {
    failures.push(`${prefix}:embedded-png-bytes`);
  }

  const pixels = frame?.pixels;
  exactKeys(pixels, [
    'crop', 'pixelCount', 'brightRedPixels', 'darkPanelPixels',
    'brightRedFraction', 'darkPanelFraction',
  ], `${prefix}:pixels`, failures);
  exactKeys(pixels?.crop, ['left', 'top', 'width', 'height'], `${prefix}:pixel-crop`, failures);
  if (!metrics || !object(pixels) || !sameJson(pixels.crop, metrics.crop)
    || pixels.pixelCount !== metrics.pixelCount
    || pixels.brightRedPixels !== metrics.brightRedPixels
    || pixels.darkPanelPixels !== metrics.darkPanelPixels
    || !close(pixels.brightRedFraction, metrics.brightRedFraction, 1e-12)
    || !close(pixels.darkPanelFraction, metrics.darkPanelFraction, 1e-12)
    || pixels.brightRedFraction <= 0.01 || pixels.darkPanelFraction <= 0.12) {
    failures.push(`${prefix}:recomputed-pixel-metrics`);
  }
}

export function pass71StuckEvidenceFailures(record, expected) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_STUCK_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_STUCK_EVIDENCE.evidenceId
    || record.kind !== PASS71_STUCK_EVIDENCE.kind
    || record.contract !== PASS71_STUCK_EVIDENCE.contract
    || record.gate !== PASS71_STUCK_EVIDENCE.gate
    || record.status !== 'passed') return ['receipt-identity-or-status'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'gate', 'status', 'startedAt',
    'completedAt', 'capturedAt', 'invocation', 'source', 'environment', 'browser',
    'topology', 'tooling', 'frames', 'faults', 'claims', 'receiptSha256',
  ], 'receipt', failures);

  const source = record.source;
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'servedSourceSha', 'endingCheckoutSourceSha',
    'cleanBefore', 'cleanAfter', 'servedProvenanceSchemaVersion', 'servedChannel',
    'servedReleasePass', 'servedPath', 'servedTreeSha256', 'servedFileCount',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(expected?.sourceSha ?? '')
    || source.expectedSourceSha !== expected.sourceSha
    || source.checkoutSourceSha !== expected.sourceSha
    || source.servedSourceSha !== expected.sourceSha
    || source.endingCheckoutSourceSha !== expected.sourceSha
    || source.cleanBefore !== true || source.cleanAfter !== true
    || source.servedProvenanceSchemaVersion !== 4 || source.servedChannel !== 'the-big-one'
    || source.servedReleasePass !== 'PASS 71' || source.servedPath !== 'channels/the-big-one'
    || !SHA256.test(source.servedTreeSha256 ?? '')
    || !Number.isSafeInteger(source.servedFileCount) || source.servedFileCount < 2) {
    failures.push('exact-source-and-served-provenance');
  }

  const invocation = record.invocation;
  exactKeys(invocation, [
    'runner', 'expectedSourceSha', 'previewPort', 'peerPort', 'renderer', 'renderProfile',
    'evidenceMode', 'playwrightProject', 'workers', 'retries', 'browserLaunchCount',
    'browserContextCount', 'peerProcessCount', 'dependencyPreflight', 'previewOwnership',
    'authorityProjection',
  ], 'invocation', failures);
  if (!object(invocation) || invocation.runner !== PASS71_STUCK_EVIDENCE_TOOL_PATHS.runner
    || invocation.expectedSourceSha !== expected?.sourceSha
    || !Number.isSafeInteger(invocation.previewPort) || invocation.previewPort < 1_024 || invocation.previewPort > 65_535
    || !Number.isSafeInteger(invocation.peerPort) || invocation.peerPort < 1_024 || invocation.peerPort > 65_535
    || invocation.peerPort === invocation.previewPort || invocation.renderer !== 'webgl2'
    || invocation.renderProfile !== 'performance'
    || invocation.evidenceMode !== 'manifest-embedded-lossless-png'
    || invocation.playwrightProject !== 'chromium' || invocation.workers !== 1 || invocation.retries !== 0
    || invocation.browserLaunchCount !== 1 || invocation.browserContextCount !== 6
    || invocation.peerProcessCount !== 1 || invocation.dependencyPreflight !== 'npm@10.9.8-ci-dry-run'
    || invocation.previewOwnership !== 'owned-fresh-staged-topology'
    || invocation.authorityProjection !== 'canonical-qa-sticky-authority') failures.push('exact-owned-invocation');

  exactKeys(record.environment, ['platform', 'arch'], 'environment', failures);
  if (record.environment?.platform !== 'win32' || record.environment?.arch !== 'x64') failures.push('windows-environment');

  const browser = record.browser;
  exactKeys(browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion',
    'browserVersion', 'userAgent', 'installScope', 'authenticodeStatus',
    'authenticodeSigner', 'isolation',
  ], 'browser', failures);
  const browserVersion = /^(\d+)(?:\.\d+){3}$/u.exec(browser?.executableVersion ?? '');
  const userAgentVersion = /\bChrome\/(\d+)\./u.exec(browser?.userAgent ?? '');
  if (!object(browser) || browser.channel !== 'chrome' || browser.installed !== true
    || browser.executableName !== 'chrome.exe' || !SHA256.test(browser.executableSha256 ?? '')
    || browserVersion === null
    || browser.browserVersion !== browser.executableVersion
    || userAgentVersion?.[1] !== browserVersion?.[1]
    || /Edg\//u.test(browser.userAgent ?? '')
    || !['per-user', 'machine-x64', 'machine-x86'].includes(browser.installScope)
    || browser.authenticodeStatus !== 'Valid' || !/\bGoogle LLC\b/iu.test(browser.authenticodeSigner ?? '')
    || browser.isolation !== 'one-installed-chrome-launch-six-fresh-peer-contexts') {
    failures.push('installed-chrome-executable');
  }

  const topology = record.topology;
  exactKeys(topology, [
    'peerCount', 'roles', 'peerServer', 'layoutContextCount', 'roomCodePersisted',
  ], 'topology', failures);
  exactKeys(topology?.peerServer, ['host', 'port', 'path', 'processId', 'owned'], 'topology:peer-server', failures);
  if (!object(topology) || topology.peerCount !== 2
    || !sameJson(topology.roles, ['host-attacker', 'guest-victim'])
    || topology.layoutContextCount !== 6 || topology.roomCodePersisted !== false
    || topology.peerServer?.host !== '127.0.0.1'
    || topology.peerServer?.port !== invocation?.peerPort
    || !/^\/peerjs-hf310-[a-f0-9]{16}$/u.test(topology.peerServer?.path ?? '')
    || !Number.isSafeInteger(topology.peerServer?.processId) || topology.peerServer.processId < 1
    || topology.peerServer?.owned !== true) failures.push('owned-two-peer-topology');

  const requiredToolingFields = Object.keys(PASS71_STUCK_EVIDENCE_TOOL_PATHS)
    .map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected?.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), requiredToolingFields)
    || !sameJson(Object.keys(expected.tooling).sort(), requiredToolingFields)
    || Object.entries(expected.tooling).some(([field, value]) => (
      !SHA256.test(value ?? '') || record.tooling[field] !== value
    ))) {
    failures.push('preview-tooling-hashes');
  }

  const cells = expectedFrameCells();
  if (!Array.isArray(record.frames) || record.frames.length !== PASS71_STUCK_EVIDENCE.frameCount
    || !sameJson(record.frames.map((frame) => frame?.id), cells.map(({ layout, source, audience }) => (
      `${layout.id}-${source}-${audience}`
    )))) failures.push('complete-ordered-twelve-frame-matrix');
  else {
    record.frames.forEach((frame, index) => validateFrame(frame, cells[index], `frame:${cells[index].layout.id}:${cells[index].source}:${cells[index].audience}`, failures));
    for (let index = 0; index < record.frames.length; index += 2) {
      const attacker = record.frames[index];
      const victim = record.frames[index + 1];
      if (attacker.source !== victim.source || !sameJson(attacker.authority, victim.authority)) {
        failures.push(`frame-pair:${attacker.layout?.id ?? index}:${attacker.source ?? 'unknown'}:authority-mismatch`);
      }
    }
  }

  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  exactKeys(record.claims, Object.keys(PASS71_STUCK_CLAIMS), 'claims', failures);
  if (!sameJson(record.claims, PASS71_STUCK_CLAIMS)) failures.push('truthful-bounded-claims');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt) || !isoTimestamp(record.capturedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)
    || record.capturedAt !== record.completedAt) failures.push('run-timestamps');
  const runStartedAtMs = Date.parse(record.startedAt ?? '');
  const runCompletedAtMs = Date.parse(record.completedAt ?? '');
  if (Number.isFinite(runStartedAtMs) && Number.isFinite(runCompletedAtMs)
    && Array.isArray(record.frames) && record.frames.some((frame) => (
      !safeNonNegative(frame?.timing?.captureStartedAtEpochMs)
      || frame.timing.captureStartedAtEpochMs < runStartedAtMs
      || frame.timing.captureStartedAtEpochMs > runCompletedAtMs
    ))) failures.push('frame-capture-run-clock');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71StuckEvidenceRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71StuckEvidence(record, expected) {
  const failures = pass71StuckEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 STUCK evidence failed: ${failures.join(', ')}`);
  return record;
}

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
}));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function fixturePng(layout) {
  const channels = 4;
  const rowBytes = layout.width * channels;
  const raw = Buffer.allocUnsafe((rowBytes + 1) * layout.height);
  const warningWidth = layout.id === 'mobile-landscape' ? 280 : 360;
  const warningHeight = layout.id === 'mobile-landscape' ? 84 : 100;
  const left = Math.floor((layout.width - warningWidth) / 2);
  const top = Math.floor((layout.height - warningHeight) / 2);
  let offset = 0;
  for (let y = 0; y < layout.height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < layout.width; x += 1) {
      const inWarning = x >= left && x < left + warningWidth && y >= top && y < top + warningHeight;
      const bright = inWarning && ((x - left) % 10 === 0 || y === top || y === top + warningHeight - 1);
      const color = bright ? [255, 58, 50, 255] : inWarning ? [43, 1, 1, 255] : [8, 14, 16, 255];
      for (const channel of color) raw[offset++] = channel;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(layout.width, 0);
  header.writeUInt32BE(layout.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Object.freeze({
    bytes: Buffer.concat([
      PNG_SIGNATURE,
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(raw, { level: 9 })),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
    bounds: Object.freeze({ left, top, width: warningWidth, height: warningHeight }),
  });
}

const FIXTURE_IMAGES = new Map(PASS71_STUCK_EVIDENCE.layouts.map((layout) => [layout.id, fixturePng(layout)]));

export function createPass71StuckEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(
    Object.keys(PASS71_STUCK_EVIDENCE_TOOL_PATHS).map((name, index) => (
      [`${name}Sha256`, String(index % 10).repeat(64)]
    )),
  );
  let actionNonce = 100;
  const frames = expectedFrameCells().map(({ layout, source, audience }) => {
    if (audience === 'attacker') actionNonce += 1;
    const image = FIXTURE_IMAGES.get(layout.id);
    const metrics = pass71StuckRasterMetrics(image.bytes, image.bounds);
    const targetId = `${layout.id}-guest`;
    const authority = {
      projection: 'canonical-qa-sticky-authority', targetId, targetLifeId: 4,
      actionNonce, canonicalNonce: actionNonce + 1_000,
    };
    const presentedAtMs = 1_000 + actionNonce * 10;
    const captureStartedAtMs = presentedAtMs + 120;
    const captureCompletedAtMs = captureStartedAtMs + 18;
    const expiresAtMs = presentedAtMs + WARNING_DURATION_MS;
    const hiddenAtMs = expiresAtMs + 4;
    const reduced = layout.reducedSensory;
    return {
      id: `${layout.id}-${source}-${audience}`,
      layout: { ...layout, deviceScaleFactor: 1 },
      source,
      audience,
      timing: {
        presentedAtMs, expiresAtMs, captureStartedAtMs, captureCompletedAtMs,
        visibleAtCaptureStart: true, visibleAtCaptureCompletion: true, hiddenAtMs,
        captureStartedAtEpochMs: 1_786_611_720_000 + actionNonce,
        durationMs: WARNING_DURATION_MS, captureDelayMs: 120,
        captureDurationMs: 18, remainingAtCaptureMs: 362, hideLatenessMs: 4,
      },
      warning: {
        visible: true, label: 'STUCK', sublabel: 'EXPLOSIVE ATTACHED',
        dataset: { source, audience, targetId, targetLifeId: 4, actionNonce, presentedAtMs, expiresAtMs },
        style: {
          warningDurationCss: '500ms', position: 'fixed', zIndex: 120, display: 'grid',
          textAlign: 'center', pointerEvents: 'none',
          animationName: reduced ? 'none' : 'sticky-warning-flash',
          animationDuration: reduced ? '0s' : '0.5s',
          boxShadow: reduced ? 'none' : 'rgb(255, 31, 22) 0px 0px 28px 0px',
          backgroundColor: reduced ? 'rgba(43, 1, 1, 0.96)' : 'rgba(43, 1, 1, 0.92)',
          borderTopColor: 'rgb(255, 58, 50)', borderTopWidth: '2px', borderLeftWidth: '5px',
        },
        bounds: image.bounds,
        viewportCentre: { x: layout.width / 2, y: layout.height / 2 },
        centreErrorPx: 0,
      },
      accessibility: {
        requestedReducedSensoryEffects: reduced,
        effectiveReducedSensory: reduced,
        reasons: reduced ? ['Reduced sensory effects'] : [],
        htmlDataReducedSensory: String(reduced),
        presentation: reduced ? 'reduced-static' : 'standard-animated',
      },
      pixels: {
        crop: metrics.crop, pixelCount: metrics.pixelCount,
        brightRedPixels: metrics.brightRedPixels, darkPanelPixels: metrics.darkPanelPixels,
        brightRedFraction: metrics.brightRedFraction, darkPanelFraction: metrics.darkPanelFraction,
      },
      image: {
        mimeType: 'image/png', width: layout.width, height: layout.height,
        byteLength: image.bytes.length, sha256: sha256(image.bytes), dataBase64: image.bytes.toString('base64'),
      },
      authority,
    };
  });
  const record = {
    schemaVersion: PASS71_STUCK_EVIDENCE.schemaVersion,
    evidenceId: PASS71_STUCK_EVIDENCE.evidenceId,
    kind: PASS71_STUCK_EVIDENCE.kind,
    contract: PASS71_STUCK_EVIDENCE.contract,
    gate: PASS71_STUCK_EVIDENCE.gate,
    status: 'passed',
    startedAt: options.startedAt ?? '2026-08-13T09:01:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T09:05:00.000Z',
    capturedAt: options.completedAt ?? '2026-08-13T09:05:00.000Z',
    invocation: {
      runner: PASS71_STUCK_EVIDENCE_TOOL_PATHS.runner,
      expectedSourceSha: sourceSha, previewPort: 4568, peerPort: 9078,
      renderer: 'webgl2', renderProfile: 'performance', evidenceMode: 'manifest-embedded-lossless-png',
      playwrightProject: 'chromium', workers: 1, retries: 0, browserLaunchCount: 1,
      browserContextCount: 6, peerProcessCount: 1, dependencyPreflight: 'npm@10.9.8-ci-dry-run',
      previewOwnership: 'owned-fresh-staged-topology', authorityProjection: 'canonical-qa-sticky-authority',
    },
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, servedSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha, cleanBefore: true, cleanAfter: true,
      servedProvenanceSchemaVersion: 4, servedChannel: 'the-big-one',
      servedReleasePass: 'PASS 71', servedPath: 'channels/the-big-one',
      servedTreeSha256: 'c'.repeat(64), servedFileCount: 500,
    },
    environment: { platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'chrome', installed: true, executableName: 'chrome.exe',
      executableSha256: 'd'.repeat(64), executableVersion: '151.0.7922.137',
      browserVersion: '151.0.7922.137', userAgent: 'Mozilla/5.0 Chrome/151.0.7922.137 Safari/537.36',
      installScope: 'machine-x64',
      authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Google LLC, O=Google LLC, C=US',
      isolation: 'one-installed-chrome-launch-six-fresh-peer-contexts',
    },
    topology: {
      peerCount: 2, roles: ['host-attacker', 'guest-victim'],
      peerServer: { host: '127.0.0.1', port: 9078, path: '/peerjs-hf310-0123456789abcdef', processId: 42, owned: true },
      layoutContextCount: 6, roomCodePersisted: false,
    },
    tooling,
    frames,
    faults: [],
    claims: { ...PASS71_STUCK_CLAIMS },
  };
  record.receiptSha256 = pass71StuckEvidenceRecordSha256(record);
  return record;
}
