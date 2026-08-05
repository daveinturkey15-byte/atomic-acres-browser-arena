import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.QA_PREVIEW_PORT ?? '44072');
const peerPort = Number(process.env.QA_PEER_PORT ?? '44073');
const chromeCandidates = [
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 64 hardware WebGPU QA requires PASS64_CHROME_PATH or installed Google Chrome');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedWorktreeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0;
if (trackedWorktreeDirty) throw new Error('Pass 64 hardware WebGPU QA requires a clean tracked worktree so its receipt identifies exact source');

const cases = process.env.PASS64_ARENAS
  ? process.env.PASS64_ARENAS.split(',').map((value) => value.trim()).filter(Boolean)
  : ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
const publishedArtifactRoot = 'artifacts/pass64/playable-webgpu';
const artifactRunId = `${sourceRevision.slice(0, 12)}-${Date.now()}-${process.pid}`;
const artifactRoot = `artifacts/pass64/.playable-webgpu-run-${artifactRunId}`;
const artifactBackupRoot = `artifacts/pass64/.playable-webgpu-backup-${artifactRunId}`;
await mkdir(artifactRoot, { recursive: true });
let artifactsPromoted = false;

function pngLuminance(png) {
  if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error('ROI capture is not PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('ROI PNG must be 8-bit');
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`Unsupported ROI PNG colour type ${colorType}`);
  const compressed = Buffer.concat(idat);
  const raw = inflateSync(compressed);
  const stride = width * channels;
  const rows = [];
  let cursor = 0;
  let previous = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported ROI PNG filter ${filter}`);
    }
    rows.push(row);
    previous = row;
  }
  const luminance = [];
  const central = [];
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < stride; x += channels) {
      const value = row[x] * 0.2126 + row[x + 1] * 0.7152 + row[x + 2] * 0.0722;
      luminance.push(value);
      const pixelX = x / channels;
      if (pixelX >= width * 0.25 && pixelX < width * 0.75 && y >= height * 0.2 && y < height * 0.78) central.push(value);
    }
  }
  const centralMean = central.reduce((sum, value) => sum + value, 0) / Math.max(1, central.length);
  const centralVariance = central.reduce((sum, value) => sum + (value - centralMean) ** 2, 0) / Math.max(1, central.length);
  const centralOcclusionRatio = central.filter((value) => value < 8 || value > 250).length / Math.max(1, central.length);
  luminance.sort((a, b) => a - b);
  const mean = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
  return {
    width,
    height,
    mean: Number(mean.toFixed(3)),
    p95: Number(luminance[Math.floor(luminance.length * 0.95)].toFixed(3)),
    p99: Number(luminance[Math.floor(luminance.length * 0.99)].toFixed(3)),
    centralMean: Number(centralMean.toFixed(3)),
    centralStdDev: Number(Math.sqrt(centralVariance).toFixed(3)),
    centralOcclusionRatio: Number(centralOcclusionRatio.toFixed(4)),
  };
}

const PRESENTATION_FRESHNESS_TIMEOUT_MS = 15_000;

function concisePresentationState(state) {
  const presentation = state?.render?.runtime?.presentation;
  const playableScene = state?.render?.playableScene;
  return {
    frameCount: state?.frameCount ?? null,
    cameraId: playableScene?.deterministicReview?.cameraId ?? null,
    cameraPosition: playableScene?.cameraComposition?.position ?? null,
    cameraInsideCollider: playableScene?.cameraComposition?.insideHorizontalCollider ?? null,
    status: presentation?.status ?? null,
    submissionSequence: presentation?.submissionSequence ?? null,
    completedSequence: presentation?.completedSequence ?? null,
    pendingForMs: presentation?.pendingForMs ?? null,
    completionFailures: presentation?.completionFailures ?? null,
    lastFailure: presentation?.lastFailure ?? null,
    backpressureActive: presentation?.backpressureActive ?? null,
    skippedSubmissions: presentation?.skippedSubmissions ?? null,
    deviceLost: state?.render?.runtime?.deviceLost ?? null,
    uncapturedErrors: state?.render?.runtime?.uncapturedErrors ?? null,
  };
}

async function freshPresentationDiagnostics(page) {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot() ?? null)
    .then(concisePresentationState)
    .catch((error) => ({ snapshotError: error instanceof Error ? error.message : String(error) }));
}

async function applyAndAwaitFreshPresentation(page, action, label) {
  const started = await page.evaluate((requestedAction) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const before = api.snapshot();
    let applied = true;
    if (requestedAction.kind === 'review-camera') {
      applied = api.setArenaReviewCamera(requestedAction.cameraId);
    } else {
      api.setCaptureCameraPose(...requestedAction.pose);
    }
    const afterMutation = api.snapshot();
    const summarize = (state) => ({
      frameCount: state.frameCount,
      cameraId: state.render.playableScene.deterministicReview.cameraId,
      cameraPosition: state.render.playableScene.cameraComposition.position,
      cameraInsideCollider: state.render.playableScene.cameraComposition.insideHorizontalCollider,
      status: state.render.runtime.presentation.status,
      submissionSequence: state.render.runtime.presentation.submissionSequence,
      completedSequence: state.render.runtime.presentation.completedSequence,
      completionFailures: state.render.runtime.presentation.completionFailures,
      lastFailure: state.render.runtime.presentation.lastFailure,
      deviceLost: state.render.runtime.deviceLost,
      uncapturedErrors: state.render.runtime.uncapturedErrors,
    });
    return { applied, before: summarize(before), afterMutation: summarize(afterMutation) };
  }, action);
  if (!started.applied) throw new Error(`${label} could not apply presentation action ${JSON.stringify(action)}`);

  const expectedCameraId = action.kind === 'review-camera' ? action.cameraId : null;
  try {
    await page.waitForFunction(({ beforeFrame, beforeSubmission, expectedCameraId }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const presentation = state?.render?.runtime?.presentation;
      return state?.render?.playableScene?.deterministicReview?.cameraId === expectedCameraId
        && state?.frameCount > beforeFrame
        && presentation?.submissionSequence > beforeSubmission;
    }, {
      beforeFrame: started.before.frameCount,
      beforeSubmission: started.before.submissionSequence,
      expectedCameraId,
    }, { timeout: PRESENTATION_FRESHNESS_TIMEOUT_MS });
  } catch (error) {
    const stalled = await freshPresentationDiagnostics(page);
    throw new Error(`${label} timed out before a post-mutation WebGPU submission was admitted: ${JSON.stringify({ action, started, stalled })}`, { cause: error });
  }

  const admitted = concisePresentationState(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot()));
  try {
    await page.waitForFunction(({ targetSequence, expectedCameraId }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const presentation = state?.render?.runtime?.presentation;
      return state?.render?.playableScene?.deterministicReview?.cameraId === expectedCameraId
        && state?.render?.playableScene?.cameraComposition?.insideHorizontalCollider === false
        && presentation?.completedSequence >= targetSequence
        && presentation?.status === 'healthy'
        && presentation?.completionFailures === 0
        && state?.render?.runtime?.deviceLost === false
        && state?.render?.runtime?.uncapturedErrors === 0;
    }, {
      targetSequence: admitted.submissionSequence,
      expectedCameraId,
    }, { timeout: PRESENTATION_FRESHNESS_TIMEOUT_MS });
  } catch (error) {
    const stalled = await freshPresentationDiagnostics(page);
    throw new Error(`${label} timed out before admitted WebGPU submission ${admitted.submissionSequence} completed cleanly: ${JSON.stringify({ action, started, admitted, stalled })}`, { cause: error });
  }

  const completed = concisePresentationState(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot()));
  return {
    action,
    before: started.before,
    afterMutation: started.afterMutation,
    admitted,
    completed,
    admittedSubmissionDelta: admitted.submissionSequence - started.before.submissionSequence,
    completedSubmissionDelta: completed.completedSequence - started.before.completedSequence,
  };
}

async function promoteArtifactDirectory() {
  let previousCorpusMoved = false;
  try {
    if (existsSync(publishedArtifactRoot)) {
      await rename(publishedArtifactRoot, artifactBackupRoot);
      previousCorpusMoved = true;
    }
    await rename(artifactRoot, publishedArtifactRoot);
    artifactsPromoted = true;
  } catch (error) {
    let rollbackFailure = null;
    if (previousCorpusMoved && !existsSync(publishedArtifactRoot) && existsSync(artifactBackupRoot)) {
      try {
        await rename(artifactBackupRoot, publishedArtifactRoot);
      } catch (rollbackError) {
        rollbackFailure = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      }
    }
    throw new Error(`WebGPU evidence promotion failed without publishing a mixed corpus: ${JSON.stringify({ artifactRunId, rollbackFailure })}`, { cause: error });
  }
  if (previousCorpusMoved) {
    await rm(artifactBackupRoot, { recursive: true, force: true }).catch((error) => {
      console.warn(`[Pass 64 WebGPU evidence backup retained at ${artifactBackupRoot}]`, error);
    });
  }
}

const server = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
});
let browser;
let peerServer;
try {
  await server.listen();
  peerServer = spawn(process.execPath, [
    'node_modules/peer/dist/bin/peerjs.js', '--host', '127.0.0.1', '--port', String(peerPort), '--path', '/peerjs', '--no-allow_discovery',
  ], { stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${peerPort}/peerjs/id`);
      if (response.status < 500) break;
    } catch {
      if (attempt === 79) throw new Error('Pass 64 local PeerJS verifier did not become ready');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const receipts = [];
  for (const arenaId of cases) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    const scripts = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&externalServices=off&map=${arenaId}&render=blender&grass=on&mist=on&seed=6401`);
    await page.waitForFunction(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api?.snapshot();
      return state?.weaponReady === true
        && state?.bootstrap?.stage === 'ready'
        && state?.render?.runtime?.actualBackend === 'webgpu';
    }, undefined, { timeout: 60_000 });
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
      window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false);
    });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
    await page.waitForTimeout(500);
    const overviewCameraId = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      return api.snapshot().render.playableScene.appliedArenaVisualPolicy.reviewCameraIds
        .find((id) => id.includes('overview')) ?? null;
    });
    if (!overviewCameraId) throw new Error(`${arenaId} deterministic overview camera is missing`);
    const overviewPresentation = await applyAndAwaitFreshPresentation(
      page,
      { kind: 'review-camera', cameraId: overviewCameraId },
      `${arenaId} deterministic overview`,
    );
    const overview = { cameraId: overviewCameraId, selected: true, presentation: overviewPresentation };
    let performanceBudget;
    try {
      performanceBudget = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget());
    } catch (error) {
      const failureState = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const state = api?.snapshot();
        return {
          bootstrap: state?.bootstrap,
          gameStarted: state?.gameStarted,
          matchPhase: state?.matchPhase,
          menuLifecycle: state?.menuLifecycle,
          frameCount: state?.frameCount,
          framePacing: state?.render?.framePacing,
          adaptiveQuality: state?.render?.adaptiveQuality,
          runtime: state?.render?.runtime,
          playableScene: state?.render?.playableScene,
          residency: api?.sampleRendererResidency(),
        };
      }).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
      throw new Error(`${arenaId} hardware performance sampler failed: ${String(error)}; state=${JSON.stringify(failureState)}`);
    }
    const evidence = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api.snapshot();
      return {
        runtime: state.render.runtime,
        shadowScheduling: {
          autoUpdate: state.render.shadowAutoUpdate,
          needsUpdate: state.render.shadowNeedsUpdate,
          boundedDynamicRefreshes: state.render.staticShadowDynamicRefreshes,
        },
        post: state.render.atomicSignal,
        playableScene: state.render.playableScene,
        arenaStreaming: state.arenaSelection.streaming,
        lightOcclusion: state.render.arenaContrastLighting,
        worldLightOcclusion: state.render.worldLocalLightOcclusion,
        terminalGeometry: {
          cabinClearance: state.arenaSelection.skylineCabinClearance,
          openingAudit: state.arenaSelection.skylineOpeningAudit,
        },
        readback: await api.readbackWebGpuFrame(),
      };
    });
    const uniqueErrors = [...new Set(errors)];
    if (uniqueErrors.length > 0) throw new Error(`${arenaId} emitted browser/GPU errors: ${uniqueErrors[0]}`);
    if (evidence.runtime.actualBackend !== 'webgpu' || evidence.runtime.softwareAdapter || evidence.runtime.deviceLost
      || evidence.runtime.canvasAlphaMode !== 'opaque'
      || evidence.runtime.presentation.status !== 'healthy') {
      throw new Error(`${arenaId} did not retain healthy hardware WebGPU`);
    }
    if (evidence.shadowScheduling.autoUpdate || evidence.shadowScheduling.needsUpdate) {
      throw new Error(`${arenaId} did not retain bounded per-light static shadow scheduling: ${JSON.stringify(evidence.shadowScheduling)}`);
    }
    if (evidence.playableScene.route !== 'complete-playable-game'
      || evidence.playableScene.authoritativeArenaRoots !== 1
      || !evidence.playableScene.authoritativeArenaRootIsGameplayRoot
      || evidence.playableScene.duplicateArenaRoots) {
      throw new Error(`${arenaId} is not rendering the single authoritative gameplay arena root`);
    }
    if (!evidence.playableScene.playerCamera || !evidence.playableScene.weaponObject
      || !evidence.playableScene.railgunObject || !evidence.playableScene.multiplayerSystem) {
      throw new Error(`${arenaId} playable WebGPU scene is missing gameplay-owned objects or systems`);
    }
    if (evidence.playableScene.cameraComposition.insideHorizontalCollider
      || !evidence.playableScene.cameraComposition.aboveArenaFloor) {
      throw new Error(`${arenaId} deterministic review camera intersects arena authority: ${JSON.stringify(evidence.playableScene.cameraComposition)}`);
    }
    if (evidence.arenaStreaming.constructionCount !== 1
      || evidence.arenaStreaming.constructionHistory.length !== 1
      || evidence.arenaStreaming.constructionHistory[0] !== arenaId
      || evidence.arenaStreaming.residentArenaRoots !== 1
      || evidence.arenaStreaming.residentArenaIds[0] !== arenaId
      || !evidence.arenaStreaming.selectedOnlyResident) {
      throw new Error(`${arenaId} constructed or retained a non-selected gameplay arena: ${JSON.stringify(evidence.arenaStreaming)}`);
    }
    if (arenaId !== 'atomic-acres' && evidence.arenaStreaming.atomicAuxiliaryRoots !== 0) {
      throw new Error(`${arenaId} eagerly loaded Nuke Town-only presentation roots`);
    }
    const applied = evidence.playableScene.appliedArenaVisualPolicy;
    const actual = evidence.playableScene.actualArenaVisualPolicy;
    if (applied?.definitionId !== arenaId || actual?.definitionId !== arenaId
      || actual.atmosphereDefinitionId !== arenaId || actual.practicals.definitionId !== arenaId
      || actual.sun.color !== applied.sun.color || actual.sun.intensity !== applied.sun.intensity
      || actual.ambient.color !== applied.ambient.color || actual.ambient.intensity !== applied.ambient.intensity
      || actual.fog.color !== applied.fog.color || actual.fog.near !== applied.fog.near || actual.fog.far !== applied.fog.far
      || JSON.stringify(actual.atmosphere) !== JSON.stringify(applied.atmosphere)
      || actual.shadows.enabled !== applied.shadows.enabled || actual.shadows.mapSize !== applied.shadows.mapSize
      || actual.shadows.maximumDistance > applied.shadows.maximumDistance
      || actual.shadows.normalBias !== applied.shadows.normalBias) {
      throw new Error(`${arenaId} ArenaVisualDefinition values were not applied to gameplay: ${JSON.stringify({ applied, actual })}`);
    }
    if (!evidence.playableScene.budgetAudit.pass || evidence.playableScene.budgetAudit.definitionId !== arenaId) {
      throw new Error(`${arenaId} exceeded an ArenaVisualDefinition runtime budget: ${JSON.stringify(evidence.playableScene.budgetAudit)}`);
    }
    if (evidence.worldLightOcclusion.violations.length !== 0
      || evidence.worldLightOcclusion.activeLocalLights !== evidence.worldLightOcclusion.shadowedLocalLights
      || evidence.worldLightOcclusion.activeLocalLights > evidence.playableScene.appliedArenaVisualPolicy.budgets.maximumShadowLights) {
      throw new Error(`${arenaId} retained an unoccluded world-local light: ${JSON.stringify(evidence.worldLightOcclusion)}`);
    }
    const systemVisibility = evidence.playableScene.tslSystemVisibility;
    if ((arenaId === 'rustworks-1v1') !== systemVisibility.waterVisible
      || (arenaId === 'atomic-acres') !== systemVisibility.grassVisible
      || (arenaId === 'rustworks-1v1' && systemVisibility.waterGeometryMaxY >= -19)) {
      throw new Error(`${arenaId} TSL water/grass visibility or water elevation is invalid: ${JSON.stringify(systemVisibility)}`);
    }
    if (performanceBudget.steadyStateFps < 55) {
      throw new Error(`${arenaId} steady-state hardware WebGPU frame rate is below 55 FPS: ${JSON.stringify(performanceBudget)}`);
    }
    if (performanceBudget.presentationFrameP95Ms > evidence.playableScene.budgetAudit.limits.gpuFrameP95Ms * 2
      || performanceBudget.queueSubmissionP95Ms > performanceBudget.frameHitchThresholdMs) {
      throw new Error(`${arenaId} exceeded the player-visible frame or queue-freshness bound: ${JSON.stringify(performanceBudget)}`);
    }
    const requiredPerformanceNumbers = [
      performanceBudget.cpuFrameP50Ms,
      performanceBudget.cpuFrameP95Ms,
      performanceBudget.cpuFrameP99Ms,
      performanceBudget.cpuFrameMaxMs,
      performanceBudget.presentationFrameP50Ms,
      performanceBudget.presentationFrameP95Ms,
      performanceBudget.presentationFrameP99Ms,
      performanceBudget.presentationFrameMaxMs,
      performanceBudget.queueSubmissionP50Ms,
      performanceBudget.queueSubmissionP95Ms,
      performanceBudget.queueSubmissionP99Ms,
      performanceBudget.queueSubmissionMaxMs,
      performanceBudget.frameHitchThresholdMs,
      performanceBudget.frameHitchCount,
    ];
    if (!requiredPerformanceNumbers.every(Number.isFinite)
      || performanceBudget.frameSampleCount !== 90
      || performanceBudget.presentationFrameSampleCount !== 90
      || performanceBudget.queueSubmissionSampleCount !== 7
      || performanceBudget.cpuFrameP50Ms > performanceBudget.cpuFrameP95Ms
      || performanceBudget.cpuFrameP95Ms > performanceBudget.cpuFrameP99Ms
      || performanceBudget.cpuFrameP99Ms > performanceBudget.cpuFrameMaxMs
      || performanceBudget.presentationFrameP50Ms > performanceBudget.presentationFrameP95Ms
      || performanceBudget.presentationFrameP95Ms > performanceBudget.presentationFrameP99Ms
      || performanceBudget.presentationFrameP99Ms > performanceBudget.presentationFrameMaxMs
      || performanceBudget.queueSubmissionP50Ms > performanceBudget.queueSubmissionP95Ms
      || performanceBudget.queueSubmissionP95Ms > performanceBudget.queueSubmissionP99Ms
      || performanceBudget.queueSubmissionP99Ms > performanceBudget.queueSubmissionMaxMs
      || performanceBudget.frameHitchCount < 0
      || performanceBudget.frameHitchCount > performanceBudget.frameSampleCount) {
      throw new Error(`${arenaId} hardware performance distribution or hitch telemetry is incomplete: ${JSON.stringify(performanceBudget)}`);
    }
    if (evidence.playableScene.traversal.legacyShaderMaterials.length !== 0
      || evidence.playableScene.traversal.compiledPipelineIds.length !== 7) {
      throw new Error(`${arenaId} did not complete the seven-owner TSL cutover`);
    }
    if (evidence.runtime.principalHdrSamples !== 4 || evidence.runtime.bloomSamples !== 0
      || evidence.post.bloomGraphId !== 'pass64.full-scene-depth-tested-bloom.v1'
      || evidence.post.bloomOcclusionSource !== 'authoritative-scene-depth'
      || !evidence.post.depthAwareBloom) {
      throw new Error(`${arenaId} HDR/bloom graph telemetry is false or incomplete`);
    }
    if (evidence.readback.bytes <= 0 || !/^[a-f0-9]{8}$/.test(evidence.readback.hash)) {
      throw new Error(`${arenaId} WebGPU HDR target readback failed`);
    }
    const selectedModule = arenaId === 'atomic-acres' ? 'atomic-acres' : arenaId;
    const arenaChunks = scripts.filter((url) => (
      /\/rendering\/arenas\/(atomic-acres|rustworks-1v1|gun-range|skyline-terminal)\.(ts|js)(\?|$)/.test(url)
      || /\/(atomic-acres|rustworks-1v1|gun-range|skyline-terminal)-[^/]+\.js/.test(url)
    ));
    if (arenaChunks.length !== 1 || !arenaChunks[0].includes(selectedModule)) {
      throw new Error(`${arenaId} loaded non-selected arena definition chunks: ${JSON.stringify(arenaChunks)}`);
    }
    const playablePng = await page.screenshot({ path: `${artifactRoot}/${arenaId}-playable.png`, animations: 'disabled' });
    const composition = pngLuminance(playablePng);
    if (composition.centralOcclusionRatio >= 0.5 || composition.centralStdDev <= 12) {
      throw new Error(`${arenaId} deterministic overview failed central visibility/composition gate: ${JSON.stringify(composition)}`);
    }
    const centralLuminanceFloor = arenaId === 'rustworks-1v1' ? 28 : arenaId === 'gun-range' ? 34 : 80;
    if (composition.centralMean < centralLuminanceFloor) {
      throw new Error(`${arenaId} deterministic overview is below its authored luminance floor ${centralLuminanceFloor}: ${JSON.stringify(composition)}`);
    }
    let roi = null;
    if (arenaId === 'skyline-terminal' || arenaId === 'atomic-acres') {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true));
      const clip = { x: 560, y: 270, width: 480, height: 360 };
      const cameraIds = arenaId === 'skyline-terminal'
        ? ['terminal-concourse-wall-closed', 'terminal-boarding-open']
        : ['nuke-town-aqua-wall-closed', 'nuke-town-aqua-door-open'];
      const closedPresentation = await applyAndAwaitFreshPresentation(
        page,
        { kind: 'review-camera', cameraId: cameraIds[0] },
        `${arenaId} solid-wall review`,
      );
      const closedPng = await page.screenshot({ path: `${artifactRoot}/${arenaId}-solid-wall-roi.png`, clip, animations: 'disabled' });
      const openPresentation = await applyAndAwaitFreshPresentation(
        page,
        { kind: 'review-camera', cameraId: cameraIds[1] },
        `${arenaId} open-door review`,
      );
      const openPng = await page.screenshot({ path: `${artifactRoot}/${arenaId}-open-door-roi.png`, clip, animations: 'disabled' });
      roi = {
        solidWall: { ...pngLuminance(closedPng), presentation: closedPresentation },
        openDoor: { ...pngLuminance(openPng), presentation: openPresentation },
      };
    }
    receipts.push({ arenaId, scripts: arenaChunks, errors: uniqueErrors, overview, composition, performanceBudget, ...evidence, roi });
    await page.close();
  }
  // The Pass 64 UAF reproduced reliably at Dave's 2560-class owner-play load,
  // not at the old low-resolution switch smoke. Keep this lifecycle stress at
  // the frozen primary HITL resolution so memory/transient pressure is real.
  const switchPage = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  const switchScripts = [];
  const switchErrors = [];
  switchPage.on('pageerror', (error) => switchErrors.push(error.message));
  switchPage.on('console', (message) => { if (message.type() === 'error') switchErrors.push(message.text()); });
  switchPage.on('request', (request) => {
    if (request.resourceType() === 'script' && /\/rendering\/arenas\//.test(request.url())) switchScripts.push(request.url());
  });
  await switchPage.goto(`http://127.0.0.1:${port}/?renderer=webgpu&externalServices=off&map=atomic-acres&render=blender&seed=6401`);
  await switchPage.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    const catalog = api?.sampleWeaponCatalogReadiness();
    const preparation = state?.bootstrap?.menuDeploymentAssetsProfile;
    return state?.weaponReady === true
      && state?.bootstrap?.stage === 'ready'
      && preparation?.completed === true
      && preparation?.error === null
      && catalog?.prewarming === false
      && catalog?.loaded === catalog?.available
      && catalog?.gpuReady === catalog?.available
      && catalog?.retainedCount === catalog?.available;
  }, undefined, { timeout: 60_000 });
  const deferredMenuState = await switchPage.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api.snapshot();
    const presentation = state.render.runtime.presentation;
    return {
      constructionCount: state.arenaSelection.streaming.constructionCount,
      residentArenaRoots: state.arenaSelection.streaming.residentArenaRoots,
      submissionSequence: presentation.submissionSequence,
      completedSequence: presentation.completedSequence,
      presentationStatus: presentation.status,
      completionFailures: presentation.completionFailures,
      deviceLost: state.render.runtime.deviceLost,
      uncapturedErrors: state.render.runtime.uncapturedErrors,
      gameplayArena: document.documentElement.dataset.gameplayArena,
      previewMode: document.documentElement.dataset.menuPreview,
      menuVisible: document.querySelector('#menu')?.classList.contains('hidden') === false,
      gameStarted: state.gameStarted,
      preparation: state.bootstrap.menuDeploymentAssetsProfile,
      weaponCatalog: api.sampleWeaponCatalogReadiness(),
    };
  });
  if (deferredMenuState.constructionCount !== 0
    || deferredMenuState.residentArenaRoots !== 0
    // A single fenced TSL/HDR submission compiles the isolated retained-asset
    // vocabulary after the prerecorded video is visible. It is not a gameplay
    // frame: no arena root exists, the menu remains visible, and the exact
    // completion frontier must already be drained before this evidence sample.
    || deferredMenuState.submissionSequence !== 1
    || deferredMenuState.completedSequence !== deferredMenuState.submissionSequence
    || deferredMenuState.presentationStatus !== 'healthy'
    || deferredMenuState.completionFailures !== 0
    || deferredMenuState.deviceLost !== false
    || deferredMenuState.uncapturedErrors !== 0
    || deferredMenuState.gameplayArena !== 'deferred-until-deployment'
    || deferredMenuState.previewMode !== 'prerecorded-video'
    || deferredMenuState.menuVisible !== true
    || deferredMenuState.gameStarted !== false
    || deferredMenuState.preparation?.completed !== true
    || deferredMenuState.preparation?.error !== null
    || deferredMenuState.weaponCatalog?.prewarming !== false
    || deferredMenuState.weaponCatalog?.loaded !== deferredMenuState.weaponCatalog?.available
    || deferredMenuState.weaponCatalog?.gpuReady !== deferredMenuState.weaponCatalog?.available
    || deferredMenuState.weaponCatalog?.retainedCount !== deferredMenuState.weaponCatalog?.available) {
    throw new Error(`Prerecorded menu violated deferred-gameplay or bounded retained-asset preparation: ${JSON.stringify(deferredMenuState)}`);
  }
  const switchReceipts = [];
  const maximumResidentTextureBytes = 768 * 1024 * 1024;
  const maximumResidentGeometryBytes = 256 * 1024 * 1024;
  const switchSequence = ['skyline-terminal', 'rustworks-1v1', 'gun-range', 'atomic-acres'];
  for (const [switchIndex, arenaId] of switchSequence.entries()) {
    await switchPage.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
    await switchPage.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget());
    const switchState = await switchPage.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        arenaId: state.arenaSelection.id,
        streaming: state.arenaSelection.streaming,
        playableScene: state.render.playableScene,
        runtime: state.render.runtime,
        residency: window.__ATOMIC_ACRES_DEBUG__.sampleRendererResidency(),
      };
    });
    if (switchState.arenaId !== arenaId || switchState.playableScene.arena.arenaId !== arenaId
      || switchState.playableScene.authoritativeArenaRoots !== 1) {
      throw new Error(`${arenaId} gameplay switch failed: ${JSON.stringify({ switchState, switchErrors })}`);
    }
    const receipt = switchState.playableScene;
    const expectedAppliedDefinitions = switchIndex + 1;
    const retirementInventoryRequired = switchIndex > 0;
    if ((retirementInventoryRequired && receipt.arena.retiredPresentationInventory.geometries <= 0)
      || (retirementInventoryRequired && receipt.arena.retiredPresentationInventory.materials <= 0)
      || receipt.appliedTslArenaDefinitions < expectedAppliedDefinitions) {
      throw new Error(`${arenaId} switch did not detach the prior presentation and apply the selected TSL definition`);
    }
    if (receipt.traversal.legacyShaderMaterials.length !== 0 || receipt.duplicateArenaRoots) {
      throw new Error(`${arenaId} switch introduced a duplicate arena or legacy shader material`);
    }
    const expectedResidentRoots = Math.min(switchIndex + 1, 2);
    if (switchState.streaming.cachePolicy !== 'fenced-two-arena-lru'
      || switchState.streaming.canonicalCacheBound !== 2
      || switchState.streaming.residentArenaRoots !== expectedResidentRoots
      || !switchState.streaming.residentArenaIds.includes(arenaId)
      || switchState.streaming.transition.phase !== 'idle'
      || switchState.streaming.transition.failure !== null
      || switchState.streaming.transition.renderSubmissionPaused
      || switchState.runtime.presentation.status !== 'healthy'
      || receipt.appliedArenaVisualPolicy.definitionId !== arenaId
      || receipt.actualArenaVisualPolicy.definitionId !== arenaId
      || receipt.actualArenaVisualPolicy.atmosphereDefinitionId !== arenaId
      || JSON.stringify(receipt.actualArenaVisualPolicy.atmosphere) !== JSON.stringify(receipt.appliedArenaVisualPolicy.atmosphere)
      || receipt.actualArenaVisualPolicy.practicals.definitionId !== arenaId
      || switchState.residency.totalTextureBytes > maximumResidentTextureBytes
      || switchState.residency.totalGeometryBytes > maximumResidentGeometryBytes
      || switchState.residency.totalTextureBytes !== switchState.residency.activeTextureBytes + switchState.residency.cachedTextureBytes
      || switchState.residency.totalGeometryBytes !== switchState.residency.activeGeometryBytes + switchState.residency.cachedGeometryBytes
      || !receipt.budgetAudit.pass) {
      throw new Error(`${arenaId} switch violated the bounded-cache, presentation-freshness, definition, or budget gates: ${JSON.stringify(switchState)}`);
    }
    switchReceipts.push({ ...receipt, streaming: switchState.streaming, residency: switchState.residency });
  }
  const requestedArenaModules = [...new Set(switchScripts
    .map((url) => /\/arenas\/(atomic-acres|skyline-terminal|rustworks-1v1|gun-range)(?:\.|\?)/.exec(url)?.[1])
    .filter(Boolean))];
  if (requestedArenaModules.length !== 4) {
    throw new Error(`Gameplay arena switch did not lazily request all four definition modules: ${JSON.stringify(requestedArenaModules)}`);
  }
  if (switchErrors.length > 0) throw new Error(`Gameplay arena switches emitted browser/GPU errors: ${[...new Set(switchErrors)][0]}`);
  const menuResidencyEnvelope = {
    totalTextureBytes: Math.max(...switchReceipts.map((receipt) => receipt.residency.totalTextureBytes)),
    totalGeometryBytes: Math.max(...switchReceipts.map((receipt) => receipt.residency.totalGeometryBytes)),
  };
  const gameplayResidencyBaselines = new Map();
  const gameplayResidencyVisits = new Map();
  const presentationSoak = [];
  // Start from the warmed gun-range/atomic-acres pair above, then traverse the
  // same four two-arena LRU pairs twice. Residency must be compared against an
  // identical in-match pair: menu-only residency excludes players, weapons,
  // bots, and support geometry and is therefore not a valid gameplay baseline.
  const gameplayCycle = ['skyline-terminal', 'rustworks-1v1', 'gun-range', 'atomic-acres'];
  for (const [visitIndex, arenaId] of [...gameplayCycle, ...gameplayCycle].entries()) {
    const deploymentStartedAt = Date.now();
    console.log(`[pass64-webgpu] gameplay-soak visit=${visitIndex + 1}/8 arena=${arenaId}`);
    await switchPage.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
    await switchPage.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    });
    try {
      // Poll only cheap, user-visible lifecycle state. Repeated full debug
      // snapshots traverse both resident arena roots and can themselves stall
      // a warmed LRU cycle enough to falsify this deployment deadline.
      await switchPage.waitForFunction((expectedArena) => (
        document.documentElement.dataset.gameplayArena === expectedArena
          && document.querySelector('#menu')?.classList.contains('hidden') === true
      ), arenaId, { timeout: 15_000 });
    } catch (error) {
      const stalled = await switchPage.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return {
          gameStarted: state?.gameStarted ?? null,
          bootstrap: state?.bootstrap ?? null,
          arenaSelection: state?.arenaSelection ?? null,
          menuLifecycle: state?.menuLifecycle ?? null,
          runtime: state?.render?.runtime ?? null,
          qualityAssetStreaming: state?.render?.qualityAssetStreaming ?? null,
          status: document.querySelector('#status')?.textContent ?? null,
        };
      }).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
      throw new Error(`${arenaId} gameplay-soak deployment ${visitIndex + 1}/8 exceeded 15 seconds after ${Date.now() - deploymentStartedAt}ms: ${JSON.stringify(stalled)}`, { cause: error });
    }
    await switchPage.waitForTimeout(arenaId === 'rustworks-1v1' ? 2_500 : 1_250);
    const beforePose = await switchPage.evaluate(() => {
      const [x, y, z] = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position;
      return [x, y, z, 0, 0];
    });
    const beforePresentation = await applyAndAwaitFreshPresentation(
      switchPage,
      { kind: 'capture-pose', pose: beforePose },
      `${arenaId} presentation-soak before pose`,
    );
    const before = await switchPage.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      return {
        state: api.snapshot(),
        menuHidden: document.querySelector('#menu')?.classList.contains('hidden') === true,
        readback: await api.readbackWebGpuFrame(),
      };
    });
    const afterPose = await switchPage.evaluate(() => {
      const [x, y, z] = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position;
      return [x, y, z, 1.2, 0];
    });
    const afterPresentation = await applyAndAwaitFreshPresentation(
      switchPage,
      { kind: 'capture-pose', pose: afterPose },
      `${arenaId} presentation-soak after pose`,
    );
    const after = await switchPage.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      return {
        state: api.snapshot(),
        menuHidden: document.querySelector('#menu')?.classList.contains('hidden') === true,
        readback: await api.readbackWebGpuFrame(),
        residency: api.sampleRendererResidency(),
      };
    });
    await switchPage.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));
    const residentArenaIds = [...after.state.arenaSelection.streaming.residentArenaIds].sort();
    const residencyPairKey = residentArenaIds.join('+');
    const baselineResidency = gameplayResidencyBaselines.get(residencyPairKey) ?? null;
    const textureGrowthAllowance = baselineResidency
      ? Math.max(8 * 1024 * 1024, baselineResidency.totalTextureBytes * 0.04)
      : null;
    const geometryGrowthAllowance = baselineResidency
      ? Math.max(4 * 1024 * 1024, baselineResidency.totalGeometryBytes * 0.04)
      : null;
    const freshnessFailures = [
      ['game-started', after.state.gameStarted === true],
      ['menu-hidden', after.menuHidden === true],
      ['before-presentation-healthy', before.state.render.runtime.presentation.status === 'healthy'],
      ['after-presentation-healthy', after.state.render.runtime.presentation.status === 'healthy'],
      ['completion-advanced', after.state.render.runtime.presentation.completedSequence > before.state.render.runtime.presentation.completedSequence],
      ['frame-advanced', after.state.frameCount > before.state.frameCount],
      ['two-resident-arena-roots', residentArenaIds.length === 2],
      ['texture-hard-bound', after.residency.totalTextureBytes <= maximumResidentTextureBytes],
      ['geometry-hard-bound', after.residency.totalGeometryBytes <= maximumResidentGeometryBytes],
      ['texture-repeated-pair-envelope', !baselineResidency
        || after.residency.totalTextureBytes <= baselineResidency.totalTextureBytes + textureGrowthAllowance],
      ['geometry-repeated-pair-envelope', !baselineResidency
        || after.residency.totalGeometryBytes <= baselineResidency.totalGeometryBytes + geometryGrowthAllowance],
      ['readback-changed', after.readback.hash !== before.readback.hash],
    ].filter(([, passed]) => !passed).map(([name]) => name);
    if (freshnessFailures.length > 0) {
      throw new Error(`${arenaId} gameplay presentation did not remain fresh: ${JSON.stringify({
        freshnessFailures,
        before: {
          frameCount: before.state.frameCount,
          completedSequence: before.state.render.runtime.presentation.completedSequence,
          status: before.state.render.runtime.presentation.status,
          readback: before.readback,
        },
        after: {
          frameCount: after.state.frameCount,
          completedSequence: after.state.render.runtime.presentation.completedSequence,
          status: after.state.render.runtime.presentation.status,
          readback: after.readback,
          residency: after.residency,
        },
        menuResidencyEnvelope,
        residentArenaIds,
        residencyPairKey,
        baselineResidency,
        textureGrowthAllowance,
        geometryGrowthAllowance,
      })}`);
    }
    if (!baselineResidency) gameplayResidencyBaselines.set(residencyPairKey, after.residency);
    gameplayResidencyVisits.set(residencyPairKey, (gameplayResidencyVisits.get(residencyPairKey) ?? 0) + 1);
    presentationSoak.push({
      arenaId,
      residentArenaIds,
      residencyPairKey,
      residencyVisit: gameplayResidencyVisits.get(residencyPairKey),
      frameDelta: after.state.frameCount - before.state.frameCount,
      completionDelta: after.state.render.runtime.presentation.completedSequence
        - before.state.render.runtime.presentation.completedSequence,
      beforeHash: before.readback.hash,
      afterHash: after.readback.hash,
      beforePresentation,
      afterPresentation,
      presentationStatus: after.state.render.runtime.presentation.status,
      residency: after.residency,
    });
    await switchPage.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
    await switchPage.waitForFunction(() => (
      document.querySelector('#menu')?.classList.contains('hidden') === false
    ), undefined, { timeout: 15_000 });
  }
  if (gameplayResidencyBaselines.size !== gameplayCycle.length
    || [...gameplayResidencyVisits.values()].some((visits) => visits !== 2)) {
    throw new Error(`Gameplay residency pair coverage was incomplete: ${JSON.stringify({
      expectedPairs: gameplayCycle.length,
      baselines: Object.fromEntries(gameplayResidencyBaselines),
      visits: Object.fromEntries(gameplayResidencyVisits),
    })}`);
  }
  if (switchErrors.length > 0) {
    throw new Error(`Repeated gameplay presentation soak emitted browser/GPU errors: ${[...new Set(switchErrors)][0]}`);
  }
  await switchPage.close();
  const multiplayerPages = await Promise.all(['host', 'guest'].map(async (role) => {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const url = new URL(`http://127.0.0.1:${port}/`);
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('render', 'performance');
    url.searchParams.set('multiplayerQa', '1');
    url.searchParams.set('peerQaPort', String(peerPort));
    url.searchParams.set('seed', '6401');
    await page.goto(url.toString());
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.bootstrap?.stage === 'ready' && state?.render?.runtime?.actualBackend === 'webgpu';
    }, undefined, { timeout: 60_000 });
    await page.fill('#player-name', role === 'host' ? 'WebGPU Host' : 'WebGPU Guest');
    return page;
  }));
  const [host, guest] = multiplayerPages;
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.selectOption('#team', '1');
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all(multiplayerPages.map((page) => page.waitForFunction(
    () => document.querySelectorAll('#lobby-roster .lobby-player').length === 2,
    undefined,
    { timeout: 45_000 },
  )));
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 45_000 });
  await host.click('#lobby-start');
  try {
    await Promise.all(multiplayerPages.map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true && state?.remotes >= 1;
    }, undefined, { timeout: 45_000 })));
  } catch (error) {
    const stalled = await Promise.all(multiplayerPages.map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state ? {
        gameStarted: state.gameStarted,
        matchPhase: state.matchPhase,
        remotes: state.remotes,
        networkRole: state.networkRole,
        privateMatch: state.privateMatch,
        runtime: state.render?.runtime,
      } : null;
    })));
    throw new Error(`Two-peer WebGPU match start stalled: ${JSON.stringify(stalled)}`, { cause: error });
  }
  await Promise.all(multiplayerPages.map((page) => page.evaluate(
    () => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget(),
  )));
  const twoPeerWebGpu = await Promise.all(multiplayerPages.map((page) => page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      runtime: state.render.runtime,
      playableScene: state.render.playableScene,
      networkRole: state.networkLifecycle?.role ?? null,
      remotes: state.remotes,
    };
  })));
  for (const [index, peer] of twoPeerWebGpu.entries()) {
    const expectedRole = index === 0 ? 'host' : 'client';
    if (peer.runtime.actualBackend !== 'webgpu' || peer.runtime.softwareAdapter || peer.runtime.deviceLost
      || peer.playableScene.authoritativeArenaRoots !== 1 || peer.playableScene.remoteObjects < 1 || peer.remotes < 1
      || !peer.playableScene.budgetAudit.pass || peer.networkRole !== expectedRole) {
      throw new Error(`Two-peer playable WebGPU gate failed: ${JSON.stringify(peer)}`);
    }
  }
  await Promise.all(multiplayerPages.map((page) => page.close()));
  for (const arenaId of cases.filter((id) => id === 'atomic-acres' || id === 'skyline-terminal')) {
    const receipt = receipts.find((entry) => entry.arenaId === arenaId);
    if (!receipt?.roi) throw new Error(`${arenaId} paired solid-wall/open-door ROI evidence was not captured`);
    // The open portal must retain visibly more high-end light than the solid-wall
    // ROI, while the wall stays below clipping. These thresholds are fixed here
    // and intentionally fail closed rather than normalising each capture.
    if (receipt.roi.solidWall.p99 >= 252 || receipt.roi.openDoor.p99 <= receipt.roi.solidWall.p99 + 20) {
      throw new Error(`${arenaId} light-occlusion ROI gate failed: ${JSON.stringify(receipt.roi)}`);
    }
  }
  const output = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: { revision: sourceRevision, trackedWorktreeDirty },
    artifactTransaction: {
      mode: 'run-scoped-directory-atomic-promote',
      runId: artifactRunId,
      publishedRoot: publishedArtifactRoot,
    },
    browserExecutable: executablePath,
    rendererPolicy: 'webgpu-default-fail-closed-webgl-explicit-compatibility',
    arenaRetirementPolicy: 'single-authoritative-gameplay-root',
    deferredMenuState,
    menuResidencyEnvelope,
    gameplayResidencyBaselines: Object.fromEntries(gameplayResidencyBaselines),
    gameplayResidencyVisits: Object.fromEntries(gameplayResidencyVisits),
    switchReceipts,
    presentationSoak,
    requestedArenaModules,
    twoPeerWebGpu,
    receipts,
  };
  await writeFile(`${artifactRoot}/hardware-webgpu-playable-receipt.json`, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await promoteArtifactDirectory();
  console.log(JSON.stringify(output, null, 2));
} finally {
  try {
    await browser?.close();
  } finally {
    peerServer?.kill();
    try {
      await server.close();
    } finally {
      if (!artifactsPromoted) await rm(artifactRoot, { recursive: true, force: true });
    }
  }
}
