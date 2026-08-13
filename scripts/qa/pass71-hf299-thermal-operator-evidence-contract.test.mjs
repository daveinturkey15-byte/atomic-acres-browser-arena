import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  PASS71_HF299_SCOPES,
  pass71Hf299EvidenceFailures,
  pass71Hf299RecordSha256,
  pass71Hf299ThermalRasterAttribution,
} from './pass71-hf299-thermal-operator-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const tooling = Array.from({ length: 14 }, (_, index) => ({
  path: [
    'scripts/qa/pass71-hf299-thermal-operator-evidence-contract.mjs',
    'scripts/qa/run-pass71-hf299-thermal-operator-evidence.mjs',
    'tests/e2e/pass71-hf299-thermal-operator.spec.ts',
    'src/thermal-ghost-presentation.ts', 'src/legacy-main.ts',
    'scripts/qa/run-playwright-with-topology.mjs', 'scripts/release/stage-release-topology.mjs',
    'scripts/qa/pass71-edge-executable-identity.mjs', 'tests/e2e/pass66-e2e-support.ts',
    'playwright.config.ts', 'vite.config.ts',
    'package.json', 'package-lock.json', 'release-channels.json',
  ][index],
  sha256: ((index % 15) + 1).toString(16).repeat(64),
}));

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
}));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function png(thermal = false) {
  const width = 1280;
  const height = 720;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      const highlighted = thermal && x >= 600 && x < 640 && y >= 320 && y < 360;
      raw[offset] = highlighted ? 245 : 28;
      raw[offset + 1] = highlighted ? 88 : 34;
      raw[offset + 2] = highlighted ? 18 : 42;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return { mimeType: 'image/png', width: 1280, height: 720, byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), dataBase64: bytes.toString('base64') };
}

function reveal(targetId, active = true) {
  return active ? {
    contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2',
    activeTargets: 1, activeTargetIds: [targetId], occludedTargets: 1, occludedTargetIds: [targetId],
    visibleOriginalTargets: 0, visibleOriginalTargetIds: [],
    activeSourceBodyLayers: 9, activeModelLayers: 9, activeThermalLayers: 9, activeHaloLayers: 0,
    geometryIdentity: true, skeletonIdentity: true, bindMatrixIdentity: true,
    meshWorldMatrixIdentity: true, boneWorldMatrixIdentity: true, silhouetteLayerIdentity: true,
    monochromeThermal: true, throughGeometry: true, orangeHalo: false,
    treatmentsPerTarget: 1, completeOperatorModels: true,
    incompleteTargets: 0, proxyMeshes: 0, ownedMaterials: 1, materialBudgetExceeded: false,
  } : { activeTargets: 0, activeTargetIds: [], visibleOriginalTargets: 1, visibleOriginalTargetIds: [targetId] };
}

function fixture() {
  const record = {
    schemaVersion: 1, evidenceId: 'HF-299', kind: 'pass71-hf299-exact-thermal-operator-coverage',
    contract: 'atomic-acres/pass71-hf299-exact-thermal-operator-coverage@1', feedbackId: 'HF-299',
    status: 'passed', closesFeedback: true, startedAt: '2026-08-13T20:00:00.000Z', completedAt: '2026-08-13T20:20:00.000Z',
    source: { expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, servedSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha, cleanBefore: true, cleanAfter: true, servedSchemaVersion: 4,
      servedReleasePass: 'PASS 71', servedChannel: 'the-big-one', servedPath: 'channels/the-big-one',
      servedTreeSha256: 'b'.repeat(64), servedFileCount: 515 },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: { channel: 'msedge', installed: true, version: '151.0.4129.72',
      userAgent: 'Mozilla/5.0 Edg/151.0.4129.72', executableName: 'msedge.exe', executableVersion: '151.0.4129.72',
      signatureStatus: 'Valid', signer: 'Microsoft Corporation', installRoot: 'C:/Program Files (x86)/Microsoft/Edge/Application',
      executableSha256: 'c'.repeat(64), isolation: 'fresh-process-and-profile-per-scope' },
    tooling,
    scopes: PASS71_HF299_SCOPES.map((scope, index) => {
      const targetId = `${scope.targetKind}-${index}`;
      const visibleFrame = { contract: 'thermal-operator-frozen-visible-frame-v1', renderer: scope.renderer,
        completionSemantics: scope.renderer === 'webgpu' ? 'submission-sequence-covered-by-completion-frontier' : 'synchronous-render-return',
        simulationFrame: 500, submissionSequence: scope.renderer === 'webgpu' ? 5 : 0,
        completedSequence: scope.renderer === 'webgpu' ? 5 : 0, targetId,
        activeSourceBodyLayers: 9, activeModelLayers: 9, cameraPosition: [-9, 1.7, -12.5], cameraQuaternion: [0, 0, 0, 1] };
      const hiddenControl = { contract: 'thermal-operator-hidden-control-v1', nonPublishable: true,
        renderer: scope.renderer, completionSemantics: visibleFrame.completionSemantics, simulationFrame: 500,
        officialSubmissionSequence: visibleFrame.submissionSequence, submissionSequence: scope.renderer === 'webgpu' ? 6 : 0,
        completedSequence: scope.renderer === 'webgpu' ? 6 : 0, targetId,
        activeSourceBodyLayers: 9, activeModelLayers: 9, cameraPosition: [-9, 1.7, -12.5],
        cameraQuaternion: [0, 0, 0, 1], thermalMaterialHiddenDuringSubmission: true, thermalMaterialRestored: true };
      const occludedImage = png(true);
      const occludedControlImage = png(false);
      return { ...scope, freshProcess: true, trustedRmb: true,
      runtime: { requestedBackend: scope.renderer, actualBackend: scope.renderer, initialized: true,
        adapterClass: scope.renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
        deviceClass: scope.renderer === 'webgpu' ? 'GPUDevice' : null, adapterLabel: 'NVIDIA GeForce RTX 5080',
        softwareAdapter: false, deviceLost: false, uncapturedErrors: 0,
        presentationStatus: scope.renderer === 'webgpu' ? 'healthy' : 'synchronous' },
      authority: { targetId, living: true, hostile: true, targetKind: scope.targetKind },
      occluded: { targetId, wallBlocked: true, reveal: reveal(targetId), visibleFrame, hiddenControl },
      unobstructed: { targetId, wallBlocked: false, reveal: reveal(targetId, false), ordinarySourceVisible: true, thermalLayers: 0 },
      cleanup: { release: { activeTargets: 0, activeModelLayers: 0, adsHeld: false },
        swap: { activeTargets: 0, activeModelLayers: 0, weapon: 'carbine' },
        death: { activeTargets: 0, activeModelLayers: 0, targetAlive: false }, proxyMeshes: 0, domBodyMarkers: 0 },
      occludedImage, occludedControlImage,
      occludedRaster: pass71Hf299ThermalRasterAttribution(
        Buffer.from(occludedImage.dataBase64, 'base64'), Buffer.from(occludedControlImage.dataBase64, 'base64'),
      ),
      unobstructedImage: png(), cleanupImage: png(),
    };
    }),
    faults: [],
    claims: { physicalTrustedRmb: true, botAndRemoteOperators: true, webgl2AndWebgpu: true,
      occludedAndOpenLos: true, sameFrameRasterAttribution: true,
      releaseSwapDeathCleanup: true, ownerSubjectiveApproval: 'not-claimed' },
  };
  record.receiptSha256 = pass71Hf299RecordSha256(record);
  return record;
}

test('accepts only the complete exact thermal operator matrix', () => {
  assert.deepEqual(pass71Hf299EvidenceFailures(fixture(), { sourceSha, tooling }), []);
});

test('rejects missing renderer/role cells and proxy/halo/visible-target thermal drift', () => {
  const missing = fixture(); missing.scopes.pop(); missing.receiptSha256 = pass71Hf299RecordSha256(missing);
  assert.ok(pass71Hf299EvidenceFailures(missing, { sourceSha, tooling }).includes('complete-scope-matrix'));
  const proxy = fixture(); proxy.scopes[0].occluded.reveal.proxyMeshes = 1; proxy.receiptSha256 = pass71Hf299RecordSha256(proxy);
  assert.ok(pass71Hf299EvidenceFailures(proxy, { sourceSha, tooling }).some((failure) => failure.endsWith(':semantics')));
  const visible = fixture(); visible.scopes[1].unobstructed.thermalLayers = 1; visible.receiptSha256 = pass71Hf299RecordSha256(visible);
  assert.ok(pass71Hf299EvidenceFailures(visible, { sourceSha, tooling }).some((failure) => failure.endsWith(':semantics')));
});

test('rejects tampered embedded pixels, stale source, and digest drift', () => {
  const pixels = fixture(); pixels.scopes[0].occludedImage.dataBase64 = Buffer.alloc(72, 1).toString('base64'); pixels.receiptSha256 = pass71Hf299RecordSha256(pixels);
  assert.ok(pass71Hf299EvidenceFailures(pixels, { sourceSha, tooling }).some((failure) => failure.includes('image:bytes')));
  assert.ok(pass71Hf299EvidenceFailures(fixture(), { sourceSha: 'd'.repeat(40), tooling }).includes('exact-source-and-served-candidate'));
  const digest = fixture(); digest.receiptSha256 = 'e'.repeat(64);
  assert.ok(pass71Hf299EvidenceFailures(digest, { sourceSha, tooling }).includes('receipt-sha256'));
});

test('rejects a forged same-frame control or attributed raster', () => {
  const frame = fixture(); frame.scopes[0].occluded.hiddenControl.simulationFrame += 1;
  frame.receiptSha256 = pass71Hf299RecordSha256(frame);
  assert.ok(pass71Hf299EvidenceFailures(frame, { sourceSha, tooling }).some((failure) => failure.endsWith(':semantics')));
  const raster = fixture(); raster.scopes[0].occludedRaster = {
    ...raster.scopes[0].occludedRaster,
    attributableThermalPixels: raster.scopes[0].occludedRaster.attributableThermalPixels + 1,
  };
  raster.receiptSha256 = pass71Hf299RecordSha256(raster);
  assert.ok(pass71Hf299EvidenceFailures(raster, { sourceSha, tooling }).some((failure) => failure.endsWith(':recompute')));
});
